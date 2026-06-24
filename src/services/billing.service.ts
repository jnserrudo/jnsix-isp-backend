import { EventEmitter } from 'events';
import prisma from './db.service';

export const billingProgressEmitter = new EventEmitter();
import logger from '../utils/logger';
import { MikrotikService } from './mikrotik.service';

export class BillingService {
  static async getSystemSettings() {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: { id: 'default', dailyLateFee: 3000, reconnectionFee: 4000 }
      });
    }
    return settings;
  }

  static async getInvoiceDebt(invoiceId: string, date: Date = new Date()) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, payments: true, contract: true }
    });
    if (!invoice) throw new Error('Factura no encontrada');

    const baseTotal = invoice.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const activeTotal = baseTotal > 0 ? baseTotal : Number(invoice.amount);

    const settings = await this.getSystemSettings();
    const dailyMora = Number(settings.dailyLateFee);

    let moraAmount = 0;
    let daysLate = 0;
    
    const hasManualMora = invoice.items.some(i => i.type === 'LATE_FEE');
    
    if (!hasManualMora && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED') {
      const msLate = date.getTime() - new Date(invoice.dueDate).getTime();
      daysLate = Math.floor(msLate / (1000 * 60 * 60 * 24));
      if (daysLate > 0) {
        moraAmount = daysLate * dailyMora;
      }
    }

    const totalPayments = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalDebt = activeTotal + moraAmount;
    const balance = totalDebt - totalPayments;

    return {
      activeTotal,
      moraAmount,
      daysLate,
      totalPayments,
      totalDebt,
      balance: balance > 0 ? balance : 0,
      invoice,
      hasManualMora
    };
  }

  static async generateMonthlyInvoices(date: Date = new Date(), ignoreBillingDay: boolean = false, nodeId?: string): Promise<{ count: number }> {
    const currentDay = date.getDate();
    const currentMonth = date.getMonth() + 1;
    const currentYear = date.getFullYear();
    
    logger.info(`Corriendo generación de facturas para el día ${currentDay}/${currentMonth}/${currentYear} (ignoreBillingDay: ${ignoreBillingDay}, nodeId: ${nodeId || 'ALL'})...`);

    const whereClause: any = { status: 'ACTIVE' };
    if (!ignoreBillingDay) {
      whereClause.billingDay = currentDay;
    }
    if (nodeId) {
      whereClause.nodeId = nodeId;
    }

    const contracts = await prisma.serviceContract.findMany({
      where: whereClause,
      include: { plan: true },
    });

    let invoiceCount = 0;
    const totalContracts = contracts.length;

    for (let i = 0; i < totalContracts; i++) {
      const contract = contracts[i];
      const percentage = Math.round(((i + 1) / totalContracts) * 100);
      billingProgressEmitter.emit('progress', {
        current: i + 1,
        total: totalContracts,
        percentage,
        nodeId: nodeId || 'ALL'
      });

      const periodStart = new Date(currentYear, date.getMonth(), 1);
      const periodEnd = new Date(currentYear, date.getMonth() + 1, 0);
      const dueDate = new Date(currentYear, date.getMonth(), currentDay + 10);

      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          contractId: contract.id,
          periodStart: { lte: periodStart },
          periodEnd: { gte: periodEnd },
        },
      });

      if (existingInvoice) continue;

      const timestamp = Date.now().toString().slice(-4);
      const shortContractId = contract.id.slice(0, 4).toUpperCase();
      const invoiceNumber = `FAC-${shortContractId}-${timestamp}`;

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
            items: {
              create: [
                {
                  description: `Abono Mensual Plan ${contract.plan.name}`,
                  amount: contract.plan.price,
                  type: 'PLAN_FEE'
                }
              ]
            }
          },
        });
        invoiceCount++;
      } catch (err: any) {
        logger.error(`Error creando factura para contrato ${contract.id}:`);
        logger.error(`Error creando factura para contrato ${contract.id}: ${err.message}`);
      }
    }
    return { count: invoiceCount };
  }

  static async processPayment(
    invoiceId: string,
    amount: number,
    method: 'CASH' | 'TRANSFER' | 'MERCADO_PAGO' | 'OTHER',
    reference?: string,
    receivedById?: string,
    notes?: string,
    reconnect?: boolean
  ): Promise<any> {
    const debtInfo = await this.getInvoiceDebt(invoiceId);
    if (debtInfo.invoice.status === 'PAID') throw new Error('Esta factura ya ha sido pagada');

    if (debtInfo.moraAmount > 0 && !debtInfo.hasManualMora) {
      await prisma.invoiceItem.create({
        data: {
          invoiceId,
          description: `Mora por atraso (${debtInfo.daysLate} días)`,
          amount: debtInfo.moraAmount,
          type: 'LATE_FEE'
        }
      });
      debtInfo.activeTotal += debtInfo.moraAmount;
      debtInfo.totalDebt = debtInfo.activeTotal;
    }

    const newTotalPayments = debtInfo.totalPayments + amount;
    const newBalance = debtInfo.totalDebt - newTotalPayments;
    
    // Status is PARTIAL if balance > 0, else PAID
    const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';

    const [payment, updatedInvoice] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          invoiceId,
          clientId: debtInfo.invoice.clientId,
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
          status: newStatus,
          paidAt: newStatus === 'PAID' ? new Date() : debtInfo.invoice.paidAt,
        },
      }),
    ]);

    logger.info(`Pago de ${amount} registrado para factura ${invoiceId}. Nuevo Estado: ${newStatus}`);

    if (newStatus === 'PAID') {
      const pendingInvoices = await prisma.invoice.findFirst({
        where: {
          clientId: debtInfo.invoice.clientId,
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
      });

      if (!pendingInvoices && debtInfo.invoice.contract.status === 'SUSPENDED') {
        // [MODIFICACIÓN MANUAL] La reconexión ya no es automática, depende del flag `reconnect`.
        if (reconnect) {
          logger.info(`El cliente saldó sus deudas. Reconectando manualmente por instrucción del operador...`);
          try {
            await MikrotikService.unblockContract(debtInfo.invoice.contractId, 'PAYMENT');
            
            const settings = await this.getSystemSettings();
            const reconFee = Number(settings.reconnectionFee);
            if (reconFee > 0) {
              const openInvoice = await prisma.invoice.findFirst({
                where: { contractId: debtInfo.invoice.contractId, status: { in: ['PENDING', 'PARTIAL'] } }
              });
              
              if (openInvoice) {
                await prisma.invoiceItem.create({
                  data: {
                    invoiceId: openInvoice.id,
                    description: 'Cargo de Reconexión de Servicio',
                    amount: reconFee,
                    type: 'RECONNECTION_FEE'
                  }
                });
              } else {
                const timestamp = Date.now().toString().slice(-4);
                const invoiceNumber = `REC-${debtInfo.invoice.clientId}-${timestamp}`;
                await prisma.invoice.create({
                  data: {
                    contractId: debtInfo.invoice.contractId,
                    clientId: debtInfo.invoice.clientId,
                    invoiceNumber,
                    periodStart: new Date(),
                    periodEnd: new Date(),
                    amount: reconFee,
                    dueDate: new Date(),
                    status: 'PENDING',
                    items: {
                      create: [{
                        description: 'Cargo de Reconexión de Servicio',
                        amount: reconFee,
                        type: 'RECONNECTION_FEE'
                      }]
                    }
                  }
                });
              }
            }
          } catch (mikrotikErr: any) {
            logger.error(`Error reactivando cliente por MikroTik después del pago: ${mikrotikErr.message}`);
          }
        } else {
          logger.info(`El cliente saldó sus deudas, pero la reconexión automática está pausada (esperando acción manual).`);
        }
      }
    }

    return { payment, invoice: updatedInvoice };
  }

  static async checkOverdueInvoices(date: Date = new Date()): Promise<{ updatedCount: number }> {
    logger.info(`Revisando facturas vencidas...`);
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL'] },
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

  static async processAutomaticCuts(date: Date = new Date()): Promise<{ cutsExecuted: number; errors: number }> {
    logger.info(`Iniciando motor de cortes automáticos...`);

    const activeContracts = await prisma.serviceContract.findMany({
      where: { status: 'ACTIVE' },
      include: {
        client: true,
        invoices: {
          where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        },
      },
    });

    let cutsExecuted = 0;
    let errors = 0;

    for (const contract of activeContracts) {
      const unpaidInvoices = contract.invoices;
      if (unpaidInvoices.length === 0) continue;

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
        logger.info(`Contrato ${contract.id} (Cliente: ${contract.clientId}) califica para corte.`);
        /* 
        try {
          await MikrotikService.blockContract(contract.id, 'CRON_JOB');
          cutsExecuted++;
        } catch (err: any) {
          logger.error(`Error ejecutando corte automático para contrato ${contract.id}:`);
          errors++;
        }
        */
        cutsExecuted++;
      }
    }

    logger.info(`Motor de cortes finalizado. Cortes realizados: ${cutsExecuted}, Fallidos: ${errors}`);
    return { cutsExecuted, errors };
  }
}
