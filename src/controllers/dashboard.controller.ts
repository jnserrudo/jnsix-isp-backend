import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';

export class DashboardController {
  static async getStats(req: Request, res: Response) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Clients counts
      const totalClients = await prisma.client.count();
      const activeClients = await prisma.client.count({ where: { status: 'ACTIVE' } });
      const suspendedClients = await prisma.client.count({ where: { status: 'SUSPENDED' } });
      const delinquentClients = await prisma.client.count({ where: { status: 'DELINQUENT' } });

      // Invoicing statistics this month
      const invoicesThisMonth = await prisma.invoice.findMany({
        where: {
          issuedAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        select: {
          amount: true,
          status: true,
        },
      });

      let totalInvoiced = 0;
      let totalCollected = 0;
      let totalPending = 0;

      for (const inv of invoicesThisMonth) {
        const amount = Number(inv.amount);
        totalInvoiced += amount;
        if (inv.status === 'PAID') {
          totalCollected += amount;
        } else if (inv.status === 'PENDING' || inv.status === 'OVERDUE') {
          totalPending += amount;
        }
      }

      // Overdue stats total (all time)
      const totalOverdueInvoices = await prisma.invoice.aggregate({
        where: { status: 'OVERDUE' },
        _count: true,
        _sum: {
          amount: true,
        },
      });

      // Recent MikroTik Actions
      const recentActions = await prisma.mikrotikAction.findMany({
        take: 15,
        orderBy: { executedAt: 'desc' },
        include: {
          node: { select: { name: true } },
          contract: {
            include: {
              client: { select: { fullName: true } },
            },
          },
        },
      });

      // Active nodes list
      const nodesCount = await prisma.node.count();

      return res.json({
        clients: {
          total: totalClients,
          active: activeClients,
          suspended: suspendedClients,
          delinquent: delinquentClients,
        },
        billingMonth: {
          invoiced: totalInvoiced,
          collected: totalCollected,
          pending: totalPending,
        },
        overdue: {
          count: totalOverdueInvoices._count,
          amount: Number(totalOverdueInvoices._sum.amount || 0),
        },
        recentActions: recentActions.map(act => ({
          id: act.id,
          clientName: act.contract.client.fullName,
          nodeName: act.node.name,
          actionType: act.actionType,
          status: act.status,
          executedAt: act.executedAt,
          errorMessage: act.errorMessage,
        })),
        nodesCount,
      });
    } catch (err: any) {
      logger.error(`Error calculando estadísticas del dashboard: ${err.message}`);
      return res.status(500).json({ error: 'Error interno del servidor al calcular estadísticas' });
    }
  }

  /**
   * Returns GPS coordinates for all customers to show on the Leaflet map
   */
  static async getMapClients(req: Request, res: Response) {
    try {
      const clients = await prisma.client.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true,
          fullName: true,
          status: true,
          address: true,
          latitude: true,
          longitude: true,
          contracts: {
            select: {
              plan: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      const mapped = clients.map(c => ({
        id: c.id,
        fullName: c.fullName,
        status: c.status,
        address: c.address,
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        planName: c.contracts[0]?.plan?.name || 'Sin plan asignado',
      }));

      return res.json(mapped);
    } catch (err: any) {
      logger.error(`Error obteniendo coordenadas de clientes: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener clientes del mapa' });
    }
  }
}
