import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class SettingsController {
  static async get(req: Request, res: Response) {
    try {
      let settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.systemSettings.create({
          data: { id: 'default', dailyLateFee: 3000, reconnectionFee: 4000 }
        });
      }
      return res.json(settings);
    } catch (err: any) {
      logger.error(`Error obteniendo configuraciones: `);
      return res.status(500).json({ error: 'Error al obtener configuraciones' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { dailyLateFee, reconnectionFee } = req.body;
      
      const oldSettings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });

      const updated = await prisma.systemSettings.upsert({
        where: { id: 'default' },
        update: {
          dailyLateFee: dailyLateFee !== undefined ? Number(dailyLateFee) : undefined,
          reconnectionFee: reconnectionFee !== undefined ? Number(reconnectionFee) : undefined,
        },
        create: {
          id: 'default',
          dailyLateFee: dailyLateFee !== undefined ? Number(dailyLateFee) : 3000,
          reconnectionFee: reconnectionFee !== undefined ? Number(reconnectionFee) : 4000,
        }
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.SYSTEM,
        action: AuditAction.UPDATE,
        description: `Configuraciones del sistema actualizadas (Mora: ${updated.dailyLateFee}, Reconexión: ${updated.reconnectionFee})`,
        userId: user?.id,
        userEmail: user?.email,
        dataBefore: oldSettings,
        dataAfter: updated,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error(`Error actualizando configuraciones: `);
      return res.status(500).json({ error: 'Error al actualizar configuraciones' });
    }
  }
}
