import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';

export class TicketController {
  static async list(req: Request, res: Response) {
    try {
      const tickets = await prisma.ticket.findMany({
        include: {
          client: {
            select: { id: true, fullName: true, address: true, phone1: true }
          },
          assignee: {
            select: { id: true, fullName: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(tickets);
    } catch (err: any) {
      logger.error(`Error listando tickets: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener tickets' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: {
          client: true,
          assignee: {
            select: { id: true, fullName: true, email: true }
          }
        }
      });

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket no encontrado' });
      }

      return res.json(ticket);
    } catch (err: any) {
      logger.error(`Error obteniendo ticket ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener el ticket' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { clientId, title, description, status, priority, assignedTo } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: 'Título y descripción son requeridos' });
      }

      const ticket = await prisma.ticket.create({
        data: {
          title,
          description,
          clientId: clientId || null,
          status: status || 'OPEN',
          priority: priority || 'MEDIUM',
          assignedTo: assignedTo || null
        }
      });

      return res.status(201).json(ticket);
    } catch (err: any) {
      logger.error(`Error creando ticket: ${err.message}`);
      return res.status(500).json({ error: 'Error al crear el ticket' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { clientId, title, description, status, priority, assignedTo } = req.body;

      const existingTicket = await prisma.ticket.findUnique({ where: { id } });
      if (!existingTicket) {
        return res.status(404).json({ error: 'Ticket no encontrado' });
      }

      let resolvedAt = existingTicket.resolvedAt;
      if ((status === 'RESOLVED' || status === 'CLOSED') && existingTicket.status !== 'RESOLVED' && existingTicket.status !== 'CLOSED') {
        resolvedAt = new Date();
      } else if (status === 'OPEN' || status === 'IN_PROGRESS') {
        resolvedAt = null;
      }

      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          title,
          description,
          clientId: clientId !== undefined ? clientId : existingTicket.clientId,
          status,
          priority,
          assignedTo: assignedTo !== undefined ? assignedTo : existingTicket.assignedTo,
          resolvedAt
        }
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error(`Error actualizando ticket ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: 'Error al actualizar ticket' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.ticket.delete({ where: { id } });
      return res.json({ message: 'Ticket eliminado correctamente' });
    } catch (err: any) {
      logger.error(`Error eliminando ticket ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar ticket' });
    }
  }
}
