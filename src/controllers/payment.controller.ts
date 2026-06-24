import { Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { BillingService } from '../services/billing.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class PaymentController {
  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const payments = await prisma.payment.findMany({
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

      await AuditService.logAction({
        entity: AuditEntity.PAYMENT,
        entityId: result.payment.id,
        action: AuditAction.CREATE,
        description: `Pago registrado: $${amount} via ${paymentMethod} para la factura ${invoiceId}`,
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
      const { amount, paymentMethod, reference, notes } = req.body;

      const existingPayment = await prisma.payment.findUnique({ where: { id } });
      if (!existingPayment) return res.status(404).json({ error: 'Pago no encontrado' });

      const updatedPayment = await prisma.payment.update({
        where: { id },
        data: {
          amount: amount ? Number(amount) : undefined,
          paymentMethod,
          reference,
          notes,
        }
      });

      // Recalculate invoice status
      const debtInfo = await BillingService.getInvoiceDebt(existingPayment.invoiceId);
      const newStatus = debtInfo.balance <= 0 ? 'PAID' : 'PARTIAL';
      await prisma.invoice.update({
        where: { id: existingPayment.invoiceId },
        data: { status: newStatus, paidAt: newStatus === 'PAID' ? new Date() : null }
      });

            await AuditService.logAction({
        entity: AuditEntity.PAYMENT,
        entityId: id,
        action: AuditAction.UPDATE,
        description: `Pago actualizado: $${amount} via ${paymentMethod}`,
        userId: req.user?.id,
        dataBefore: existingPayment,
        dataAfter: updatedPayment
      });
      return res.json({ message: 'Pago actualizado', payment: updatedPayment });
    } catch (err: any) {
      logger.error(`Error actualizando pago: ${err.message}`);
      return res.status(500).json({ error: 'Error al actualizar el pago' });
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const existingPayment = await prisma.payment.findUnique({ where: { id } });
      if (!existingPayment) return res.status(404).json({ error: 'Pago no encontrado' });

      await prisma.payment.delete({ where: { id } });

      // Recalculate invoice status
      const debtInfo = await BillingService.getInvoiceDebt(existingPayment.invoiceId);
      const newStatus = debtInfo.balance <= 0 ? 'PAID' : debtInfo.totalPayments > 0 ? 'PARTIAL' : (debtInfo.daysLate > 0 ? 'OVERDUE' : 'PENDING');
      
      await prisma.invoice.update({
        where: { id: existingPayment.invoiceId },
        data: { status: newStatus, paidAt: newStatus === 'PAID' ? new Date() : null }
      });

            await AuditService.logAction({
        entity: AuditEntity.PAYMENT,
        entityId: id,
        action: AuditAction.DELETE,
        description: 'Pago eliminado',
        userId: req.user?.id,
        dataBefore: existingPayment
      });
      return res.json({ message: 'Pago eliminado' });
    } catch (err: any) {
      logger.error(`Error eliminando pago: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar el pago' });
    }
  }
}
