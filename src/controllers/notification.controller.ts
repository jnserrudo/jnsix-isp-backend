import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';

export class NotificationController {
  static async list(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      
      const notifications = await prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const unreadCount = await prisma.notification.count({
        where: { isRead: false },
      });

      res.json({ notifications, unreadCount });
    } catch (error: any) {
      logger.error(`Error listando notificaciones: ${error.message}`);
      res.status(500).json({ error: 'Error al obtener notificaciones.' });
    }
  }

  static async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const notification = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });
      res.json({ success: true, notification });
    } catch (error: any) {
      logger.error(`Error marcando notificación como leída: ${error.message}`);
      res.status(500).json({ error: 'Error al marcar notificación.' });
    }
  }

  static async markAllAsRead(req: Request, res: Response) {
    try {
      await prisma.notification.updateMany({
        where: { isRead: false },
        data: { isRead: true },
      });
      res.json({ success: true });
    } catch (error: any) {
      logger.error(`Error marcando todas notificaciones: ${error.message}`);
      res.status(500).json({ error: 'Error al marcar notificaciones.' });
    }
  }
}
