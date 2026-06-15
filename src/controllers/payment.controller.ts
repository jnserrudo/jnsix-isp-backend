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
      const { invoiceId, amount, paymentMethod, reference, notes } = req.body;
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
        notes
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
}
