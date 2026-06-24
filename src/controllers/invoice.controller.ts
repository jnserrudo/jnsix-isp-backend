import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { BillingService } from '../services/billing.service';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class InvoiceController {
  static async list(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const filter: any = {};
      if (status) {
        filter.status = status;
      }

      const invoices = await prisma.invoice.findMany({
        where: filter,
        include: {
          client: true,
          contract: {
            include: {
              plan: true,
              node: true,
            },
          },
        },
        orderBy: { dueDate: 'desc' },
      });
      return res.json(invoices);
    } catch (err: any) {
      logger.error(`Error listando facturas: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener facturas' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const debtInfo = await BillingService.getInvoiceDebt(id);
      return res.json(debtInfo);
    } catch (err: any) {
      logger.error(`Error obteniendo factura: ${err.message}`);
      return res.status(err.message === 'Factura no encontrada' ? 404 : 500).json({ error: err.message || 'Error al obtener factura' });
    }
  }

  static billingProgress(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const progressListener = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    import('../services/billing.service').then(({ billingProgressEmitter }) => {
      billingProgressEmitter.on('progress', progressListener);
    });

    req.on('close', () => {
      import('../services/billing.service').then(({ billingProgressEmitter }) => {
        billingProgressEmitter.removeListener('progress', progressListener);
      });
    });
  }

  /**
   * Manually triggers billing run for a specific day or today
   */
  static async triggerBilling(req: Request, res: Response) {
    try {
      const { date, nodeId } = req.body;
      const runDate = date ? new Date(date) : new Date();

      const result = await BillingService.generateMonthlyInvoices(runDate, true, nodeId);
      await BillingService.checkOverdueInvoices(runDate);
      
      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.SYSTEM,
        action: AuditAction.SYSTEM_JOB,
        description: `Motor de facturación ejecutado manualmente. Facturas generadas: ${result.count}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({ message: 'Proceso de facturación ejecutado con éxito', ...result });
    } catch (err: any) {
      logger.error(`Error al ejecutar facturación manual: ${err.message}`);
      return res.status(500).json({ error: 'Fallo al ejecutar facturación manual' });
    }
  }

  /**
   * Manually triggers automatic cuts checking
   */
  static async triggerCuts(req: Request, res: Response) {
    try {
      const { date } = req.body;
      const runDate = date ? new Date(date) : new Date();

      const result = await BillingService.processAutomaticCuts(runDate);

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.SYSTEM,
        action: AuditAction.SYSTEM_JOB,
        description: `Motor de cortes ejecutado manualmente. Clientes suspendidos: ${result.cutsExecuted}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({ message: 'Motor de cortes ejecutado con éxito', ...result });
    } catch (err: any) {
      logger.error(`Error al ejecutar motor de cortes manual: ${err.message}`);
      return res.status(500).json({ error: 'Fallo al ejecutar motor de cortes' });
    }
  }

  static async expireInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { contract: true },
      });
      if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
      if (invoice.status === 'PAID') return res.status(400).json({ error: 'No se puede vencer una factura pagada' });

      const graceDays = invoice.contract?.graceDays || 0;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (graceDays + 2));

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'OVERDUE',
          dueDate: targetDate,
        },
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.INVOICE,
        entityId: id,
        action: AuditAction.UPDATE,
        description: `Factura forzada a vencida manualmente`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: invoice,
        dataAfter: updated
      });

      return res.json({ message: 'Factura marcada como vencida', invoice: updated });
    } catch (err: any) {
      logger.error(`Error al forzar vencimiento de factura: ${err.message}`);
      return res.status(500).json({ error: 'Fallo al forzar vencimiento' });
    }
  }

  static async addItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description, amount, type } = req.body;
      
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

      const item = await prisma.invoiceItem.create({
        data: {
          invoiceId: id,
          description,
          amount,
          type
        }
      });

      // Recalculate invoice status (e.g., if it was paid but now has more debt, it becomes PARTIAL)
      const debtInfo = await BillingService.getInvoiceDebt(id);
      if (debtInfo.balance > 0 && invoice.status === 'PAID') {
        await prisma.invoice.update({
          where: { id },
          data: { status: 'PARTIAL', paidAt: null }
        });
      }

      return res.json({ message: 'Item añadido', item });
    } catch (err: any) {
      logger.error(`Error añadiendo item: ${err.message}`);
      return res.status(500).json({ error: 'Fallo al añadir item' });
    }
  }

  static async deleteItem(req: Request, res: Response) {
    try {
      const { id, itemId } = req.params;
      
      const item = await prisma.invoiceItem.findUnique({ where: { id: itemId } });
      if (!item || item.invoiceId !== id) return res.status(404).json({ error: 'Item no encontrado' });

      await prisma.invoiceItem.delete({ where: { id: itemId } });

      // Recalculate status
      const debtInfo = await BillingService.getInvoiceDebt(id);
      if (debtInfo.balance <= 0 && debtInfo.invoice.status !== 'PAID' && debtInfo.totalDebt > 0) {
        await prisma.invoice.update({
          where: { id },
          data: { status: 'PAID', paidAt: new Date() }
        });
      }

      return res.json({ message: 'Item eliminado' });
    } catch (err: any) {
      logger.error(`Error eliminando item: ${err.message}`);
      return res.status(500).json({ error: 'Fallo al eliminar item' });
    }
  }
}
