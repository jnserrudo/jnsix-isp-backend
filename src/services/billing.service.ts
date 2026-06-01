import prisma from './db.service';
import logger from '../utils/logger';
import { MikrotikService } from './mikrotik.service';

export class BillingService {
  /**
   * Generates invoices for all contracts whose billing day is today
   */
  static async generateMonthlyInvoices(date: Date = new Date()): Promise<{ count: number }> {
    const currentDay = date.getDate();
    const currentMonth = date.getMonth() + 1; // 1-indexed
    const currentYear = date.getFullYear();
    
    logger.info(`Corriendo generación de facturas para el día ${currentDay}/${currentMonth}/${currentYear}...`);

    // Get all active contracts due today
    const contracts = await prisma.serviceContract.findMany({
      where: {
        status: 'ACTIVE',
        billingDay: currentDay,
      },
      include: {
        plan: true,
      },
    });

    let invoiceCount = 0;

    for (const contract of contracts) {
      // Define the period
      const periodStart = new Date(currentYear, date.getMonth(), 1);
      const periodEnd = new Date(currentYear, date.getMonth() + 1, 0); // last day of current month
      const dueDate = new Date(currentYear, date.getMonth(), currentDay + 10); // 10 days to pay

      // Check if invoice already exists for this contract and period
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          contractId: contract.id,
          periodStart: { lte: periodStart },
          periodEnd: { gte: periodEnd },
        },
      });

      if (existingInvoice) {
        logger.debug(`La factura para el contrato ${contract.id} ya existe para este período. Saltando.`);
        continue;
      }

      // Generate invoice number e.g., FAC-202605-1234
      const timestamp = Date.now().toString().slice(-4);
      const shortContractId = contract.id.slice(0, 4).toUpperCase();
      const invoiceNumber = `FAC-${currentYear}${currentMonth.toString().padStart(2, '0')}-${shortContractId}${timestamp}`;

      try {
        await prisma.invoice.create({
          data: {
            contractId: contract.id,
            clientId: contract.clientId,
            invoiceNumber,
            periodStart,
            periodEnd,
            amount: contract.plan.price,
            dueDate,
            status: 'PENDING',
          },
        });
        invoiceCount++;
      } catch (err: any) {
        logger.error(`Error creando factura para contrato ${contract.id}: ${err.message}`);
      }
    }

    logger.info(`Generación de facturas completada. ${invoiceCount} facturas creadas.`);
    return { count: invoiceCount };
  }

  /**
   * Process client payment
   * Updates invoice, creates payment log, and checks if unblocking is required
   */
  static async processPayment(
    invoiceId: string, 
    amount: number, 
    method: 'CASH' | 'TRANSFER' | 'MERCADO_PAGO' | 'OTHER', 
    reference?: string,
    receivedById?: string,
    notes?: string
  ): Promise<any> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true, contract: true },
    });

    if (!invoice) throw new Error('Factura no encontrada');
    if (invoice.status === 'PAID') throw new Error('Esta factura ya ha sido pagada');

    // Create the payment and update invoice in a transaction
    const [payment, updatedInvoice] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          invoiceId,
          clientId: invoice.clientId,
          amount,
          paymentMethod: method,
          reference,
          receivedById,
          notes,
        },
      }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      }),
    ]);

    logger.info(`Pago de $${amount} registrado para la factura ${invoice.invoiceNumber}. Cliente: ${invoice.client.fullName}`);

    // Check if the client still has pending or overdue invoices
    const pendingInvoices = await prisma.invoice.findFirst({
      where: {
        clientId: invoice.clientId,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
    });

    // If client is suspended and has NO pending debts, reactivate their services
    if (!pendingInvoices && invoice.contract.status === 'SUSPENDED') {
      logger.info(`El cliente ${invoice.client.fullName} saldó sus deudas. Iniciando reactivación automática...`);
      try {
        await MikrotikService.unblockContract(invoice.contractId, 'PAYMENT');
      } catch (mikrotikErr: any) {
        logger.error(`Error reactivando cliente por MikroTik después del pago: ${mikrotikErr.message}`);
        // We do not roll back payment, just log the Mikrotik error so the admin can retry manually
      }
    }

    return { payment, invoice: updatedInvoice };
  }

  /**
   * Runs daily check for invoices that are overdue (past due date)
   */
  static async checkOverdueInvoices(date: Date = new Date()): Promise<{ updatedCount: number }> {
    logger.info(`Revisando facturas vencidas...`);
    
    // Find all pending invoices past their due date
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: date },
      },
    });

    for (const inv of overdueInvoices) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: 'OVERDUE' },
      });
    }

    logger.info(`Se marcaron ${overdueInvoices.length} facturas como VENCIDAS (OVERDUE).`);
    return { updatedCount: overdueInvoices.length };
  }

  /**
   * Motor de Cortes: Suspends users who have unpaid invoices past the grace days
   */
  static async processAutomaticCuts(date: Date = new Date()): Promise<{ cutsExecuted: number; errors: number }> {
    logger.info(`Iniciando motor de cortes automáticos...`);

    // Find all service contracts that are ACTIVE but have invoices that are OVERDUE and past grace days
    // grace_days is defined on the contract level.
    const activeContracts = await prisma.serviceContract.findMany({
      where: { status: 'ACTIVE' },
      include: {
        client: true,
        invoices: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
        },
      },
    });

    let cutsExecuted = 0;
    let errors = 0;

    for (const contract of activeContracts) {
      const unpaidInvoices = contract.invoices;
      if (unpaidInvoices.length === 0) continue;

      // Check if any invoice is past the grace period
      let shouldCut = false;
      
      for (const invoice of unpaidInvoices) {
        const graceLimitDate = new Date(invoice.dueDate);
        graceLimitDate.setDate(graceLimitDate.getDate() + contract.graceDays);
        
        if (date > graceLimitDate) {
          shouldCut = true;
          break;
        }
      }

      if (shouldCut) {
        logger.info(`Contrato ${contract.id} (Cliente: ${contract.client.fullName}) califica para corte. Ejecutando bloqueo...`);
        try {
          await MikrotikService.blockContract(contract.id, 'CRON_JOB');
          cutsExecuted++;
        } catch (err: any) {
          logger.error(`Error ejecutando corte automático para contrato ${contract.id}: ${err.message}`);
          errors++;
        }
      }
    }

    logger.info(`Motor de cortes finalizado. Cortes realizados: ${cutsExecuted}, Fallidos: ${errors}`);
    return { cutsExecuted, errors };
  }
}
