import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { BillingService } from '../services/billing.service';

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
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          client: true,
          contract: {
            include: {
              plan: true,
            },
          },
          payments: true,
        },
      });

      if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
      return res.json(invoice);
    } catch (err: any) {
      logger.error(`Error obteniendo factura: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener factura' });
    }
  }

  /**
   * Manually triggers billing run for a specific day or today
   */
  static async triggerBilling(req: Request, res: Response) {
    try {
      const { date } = req.body;
      const runDate = date ? new Date(date) : new Date();

      const result = await BillingService.generateMonthlyInvoices(runDate);
      await BillingService.checkOverdueInvoices(runDate);
      
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

      // Fetch graceDays from the contract or default to 0
      const graceDays = invoice.contract?.graceDays || 0;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (graceDays + 2)); // Subtract grace days plus 2 days to ensure it is past grace period

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'OVERDUE',
          dueDate: targetDate,
        },
      });

      return res.json({ message: 'Factura marcada como vencida', invoice: updated });
    } catch (err: any) {
      logger.error(`Error al forzar vencimiento de factura: ${err.message}`);
      return res.status(500).json({ error: 'Fallo al forzar vencimiento' });
    }
  }
}
