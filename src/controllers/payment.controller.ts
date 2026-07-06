import { Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { BillingService } from '../services/billing.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction, VoidReason } from '@prisma/client';

export class PaymentController {
  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const payments = await prisma.payment.findMany({
        where: { deletedAt: null },
        include: {
          client: true,
          invoice: true,
          receivedBy: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
      });
      return res.json(payments);
    } catch (err: any) {
      logger.error(`Error listando pagos: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener pagos' });
    }
  }

  static async listRectifications(req: AuthenticatedRequest, res: Response) {
    try {
      const rectifications = await prisma.payment.findMany({
        where: {
          deletedAt: { not: null },
          voidReason: { not: null }
        },
        include: {
          client: true,
          invoice: true,
          replacedBy: {
            include: {
              invoice: true,
              client: true
            }
          },
          receivedBy: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { deletedAt: 'desc' },
      });
      return res.json(rectifications);
    } catch (err: any) {
      logger.error(`Error listando rectificaciones: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener historial de rectificaciones' });
    }
  }

  static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const { invoiceId, amount, paymentMethod, reference, notes, reconnect } = req.body;
      const receivedById = req.user?.id; // Logged in user id

      if (!invoiceId || !amount || !paymentMethod) {
        return res.status(400).json({ error: 'ID de factura, monto y método de pago son requeridos' });
      }

      const result = await BillingService.processPayment(
        invoiceId,
        Number(amount),
        paymentMethod,
        reference,
        receivedById,
        notes,
        Boolean(reconnect)
      );

      const paymentWithDetails = await prisma.payment.findUnique({
        where: { id: result.payment.id },
        include: { invoice: true, client: true }
      });
      const clientInfo = paymentWithDetails ? `${paymentWithDetails.client.fullName} (${paymentWithDetails.client.clientCode})` : 'Desconocido';
      const invoiceNum = paymentWithDetails?.invoice?.invoiceNumber || invoiceId;

      await AuditService.logAction({
        entity: AuditEntity.PAYMENT,
        entityId: result.payment.id,
        action: AuditAction.CREATE,
        description: `Pago registrado: $${amount} via ${paymentMethod} para la factura ${invoiceNum} del abonado ${clientInfo}`,
        userId: req.user?.id,
        userEmail: req.user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: result.payment
      });

      return res.status(201).json(result);
    } catch (err: any) {
      logger.error(`Error registrando pago: ${err.message}`);
      return res.status(400).json({ error: err.message || 'Error al procesar el pago' });
    }
  }

  static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, reference, notes, paymentDate, clientId, invoiceId, reason, observaciones } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'El motivo de la rectificación (reason) es obligatorio.' });
      }

      const existingPayment = await prisma.payment.findUnique({ 
        where: { id },
        include: { invoice: true, client: true }
      });
      if (!existingPayment) return res.status(404).json({ error: 'Pago no encontrado' });
      if (existingPayment.deletedAt) return res.status(400).json({ error: 'Este pago ya ha sido anulado o rectificado' });

      // Start transaction to soft-delete the old payment and create the replacement payment
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create the new replacement payment
        const newPayment = await tx.payment.create({
          data: {
            clientId: clientId || existingPayment.clientId,
            invoiceId: invoiceId || existingPayment.invoiceId,
            amount: amount !== undefined ? Number(amount) : existingPayment.amount,
            paymentMethod: paymentMethod || existingPayment.paymentMethod,
            paymentDate: paymentDate ? new Date(paymentDate) : existingPayment.paymentDate,
            reference: reference !== undefined ? reference : existingPayment.reference,
            notes: notes !== undefined ? notes : existingPayment.notes,
            receivedById: existingPayment.receivedById
          }
        });

        // 2. Soft-delete the old payment and reference it to the new one
        const voidedPayment = await tx.payment.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            deletedBy: req.user?.email || 'unknown',
            voidReason: reason as VoidReason,
            voidNotes: observaciones || null,
            replacedById: newPayment.id
          }
        });

        return { newPayment, voidedPayment };
      });

      // Recalculate invoice status for both the old invoice and the new invoice
      const oldInvoiceId = existingPayment.invoiceId;
      const newInvoiceId = invoiceId || existingPayment.invoiceId;

      // Old invoice recalculation
      const debtInfoOld = await BillingService.getInvoiceDebt(oldInvoiceId);
      const statusOld = debtInfoOld.balance <= 0 ? 'PAID' : (debtInfoOld.totalPayments > 0 ? 'PARTIAL' : (debtInfoOld.daysLate > 0 ? 'OVERDUE' : 'PENDING'));
      await prisma.invoice.update({
        where: { id: oldInvoiceId },
        data: { status: statusOld, paidAt: statusOld === 'PAID' ? new Date() : null }
      });

      // New invoice recalculation (if different)
      if (newInvoiceId !== oldInvoiceId) {
        const debtInfoNew = await BillingService.getInvoiceDebt(newInvoiceId);
        const statusNew = debtInfoNew.balance <= 0 ? 'PAID' : (debtInfoNew.totalPayments > 0 ? 'PARTIAL' : (debtInfoNew.daysLate > 0 ? 'OVERDUE' : 'PENDING'));
        await prisma.invoice.update({
          where: { id: newInvoiceId },
          data: { status: statusNew, paidAt: statusNew === 'PAID' ? new Date() : null }
        });
      }

      const clientInfo = `${existingPayment.client.fullName} (${existingPayment.client.clientCode})`;
      const invoiceNum = existingPayment.invoice.invoiceNumber;

      await AuditService.logAction({
        entity: AuditEntity.PAYMENT,
        entityId: id,
        action: AuditAction.UPDATE,
        description: `Pago rectificado (Motivo: ${reason}). Cobro original de $${existingPayment.amount} en factura ${invoiceNum} para ${clientInfo} anulado y reemplazado por nuevo cobro de $${amount !== undefined ? amount : existingPayment.amount} (ID Reemplazo: ${result.newPayment.id})`,
        userId: req.user?.id,
        userEmail: req.user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: existingPayment,
        dataAfter: result.newPayment
      });

      return res.json({ 
        message: 'Pago rectificado con éxito. Se ha generado un nuevo registro de reemplazo.',
        voidedPayment: result.voidedPayment,
        newPayment: result.newPayment
      });
    } catch (err: any) {
      logger.error(`Error rectificando pago: ${err.message}`);
      return res.status(500).json({ error: err.message || 'Error al rectificar el pago' });
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason, observaciones } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'El motivo de la anulación (reason) es obligatorio.' });
      }
      
      const existingPayment = await prisma.payment.findUnique({ 
        where: { id },
        include: { invoice: true, client: true }
      });
      if (!existingPayment) return res.status(404).json({ error: 'Pago no encontrado' });
      if (existingPayment.deletedAt) return res.status(400).json({ error: 'Este pago ya ha sido anulado' });

      // Soft delete the payment
      const voided = await prisma.payment.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: req.user?.email || 'unknown',
          voidReason: reason as VoidReason,
          voidNotes: observaciones || null
        }
      });

      // Recalculate invoice status
      const debtInfo = await BillingService.getInvoiceDebt(existingPayment.invoiceId);
      const newStatus = debtInfo.balance <= 0 ? 'PAID' : (debtInfo.totalPayments > 0 ? 'PARTIAL' : (debtInfo.daysLate > 0 ? 'OVERDUE' : 'PENDING'));
      
      await prisma.invoice.update({
        where: { id: existingPayment.invoiceId },
        data: { status: newStatus, paidAt: newStatus === 'PAID' ? new Date() : null }
      });

      const clientInfo = `${existingPayment.client.fullName} (${existingPayment.client.clientCode})`;
      const invoiceNum = existingPayment.invoice.invoiceNumber;

      await AuditService.logAction({
        entity: AuditEntity.PAYMENT,
        entityId: id,
        action: AuditAction.DELETE,
        description: `Pago anulado (Motivo: ${reason}). Cobro de $${existingPayment.amount} en factura ${invoiceNum} para ${clientInfo} fue deshabilitado.`,
        userId: req.user?.id,
        userEmail: req.user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: existingPayment,
        dataAfter: voided
      });

      return res.json({ message: 'Pago anulado correctamente (soft delete)', payment: voided });
    } catch (err: any) {
      logger.error(`Error anulando pago: ${err.message}`);
      return res.status(500).json({ error: 'Error al anular el pago' });
    }
  }
}
