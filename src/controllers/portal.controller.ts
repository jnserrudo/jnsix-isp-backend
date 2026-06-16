import { Request, Response } from 'express';
import prisma from '../services/db.service';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export class PortalController {
  static async getMyTickets(req: Request, res: Response) {
    try {
      // @ts-ignore
      const clientId = req.user?.id;
      if (!clientId) return res.status(401).json({ error: 'No autorizado' });

      const tickets = await prisma.ticket.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
      });

      res.json(tickets);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createTicket(req: Request, res: Response) {
    try {
      // @ts-ignore
      const clientId = req.user?.id;
      if (!clientId) return res.status(401).json({ error: 'No autorizado' });

      const { title, description, priority } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: 'Título y descripción son obligatorios' });
      }

      const ticket = await prisma.ticket.create({
        data: {
          clientId,
          title,
          description,
          priority: priority || 'NORMAL',
          status: 'OPEN',
        }
      });

      res.status(201).json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getMyInfo(req: Request, res: Response) {
    try {
      // @ts-ignore
      const clientId = req.user?.id;
      if (!clientId) return res.status(401).json({ error: 'No autorizado' });

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: {
          contracts: {
            include: { plan: true, node: true }
          },
          invoices: {
            orderBy: { dueDate: 'desc' },
            take: 10
          }
        }
      });

      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
