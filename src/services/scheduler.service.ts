import cron from 'node-cron';
import logger from '../utils/logger';
import { BillingService } from './billing.service';

export class SchedulerService {
  static init() {
    logger.info('Inicializando programador de tareas en segundo plano...');

    // 1. Daily at 00:05 AM: Generate new invoices & update overdue status
    cron.schedule('5 0 * * *', async () => {
      logger.info('Iniciando tarea programada: Facturación Mensual...');
      try {
        await BillingService.generateMonthlyInvoices();
        await BillingService.checkOverdueInvoices();
      } catch (err: any) {
        logger.error(`Error en tarea de facturación diaria: ${err.message}`);
      }
    });

    // 2. Daily at 09:00 AM: Process automatic cuts for unpaid expired invoices
    cron.schedule('0 9 * * *', async () => {
      logger.info('Iniciando tarea programada: Motor de Cortes Automáticos...');
      try {
        await BillingService.processAutomaticCuts();
      } catch (err: any) {
        logger.error(`Error en tarea de corte automático: ${err.message}`);
      }
    });

    logger.info('Tareas programadas registradas: Facturación (00:05) y Cortes (09:00).');
  }
}
