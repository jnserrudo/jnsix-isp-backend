import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class PlanController {
  static async list(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        include: {
          _count: {
            select: { contracts: true }
          }
        },
        orderBy: { name: 'asc' },
      });
      return res.json(plans);
    } catch (err: any) {
      logger.error(`Error listando planes: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener planes' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const plan = await prisma.plan.findUnique({ where: { id } });
      if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
      return res.json(plan);
    } catch (err: any) {
      logger.error(`Error obteniendo plan: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener plan' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { name, downloadSpeed, uploadSpeed, price, mikrotikProfile, description } = req.body;
      if (!name || !downloadSpeed || !uploadSpeed || !price) {
        return res.status(400).json({ error: 'Nombre, descarga, subida y precio son requeridos' });
      }

      const plan = await prisma.plan.create({
        data: {
          name,
          downloadSpeed: Number(downloadSpeed),
          uploadSpeed: Number(uploadSpeed),
          price: Number(price),
          mikrotikProfile,
          description,
        },
      });

      // Registrar auditoría
      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.PLAN,
        entityId: plan.id,
        action: AuditAction.CREATE,
        description: `Plan de Internet creado: ${plan.name} (${plan.downloadSpeed}M/${plan.uploadSpeed}M) a $${plan.price}`,
        userId: user?.id,
        userEmail: user?.email,
        dataAfter: plan,
      });

      return res.status(201).json(plan);
    } catch (err: any) {
      logger.error(`Error creando plan: ${err.message}`);
      return res.status(500).json({ error: 'Error al crear plan' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, downloadSpeed, uploadSpeed, price, mikrotikProfile, description, isActive } = req.body;

      const plan = await prisma.plan.findUnique({ where: { id } });
      if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

      const updated = await prisma.plan.update({
        where: { id },
        data: {
          name,
          downloadSpeed: downloadSpeed !== undefined ? Number(downloadSpeed) : undefined,
          uploadSpeed: uploadSpeed !== undefined ? Number(uploadSpeed) : undefined,
          price: price !== undefined ? Number(price) : undefined,
          mikrotikProfile,
          description,
          isActive,
        },
      });

      // Registrar auditoría
      const user = (req as any).user;
      const oldPrice = Number(plan.price);
      const newPrice = Number(updated.price);
      
      let auditMsg = `Plan de Internet actualizado: ${updated.name}.`;
      if (oldPrice !== newPrice) {
        auditMsg += ` Precio cambiado de $${oldPrice} a $${newPrice}.`;
      }

      await AuditService.logAction({
        entity: AuditEntity.PLAN,
        entityId: updated.id,
        action: AuditAction.UPDATE,
        description: auditMsg,
        userId: user?.id,
        userEmail: user?.email,
        dataBefore: plan,
        dataAfter: updated,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error(`Error actualizando plan: ${err.message}`);
      return res.status(500).json({ error: 'Error al actualizar plan' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Check if plan is in use
      const inUse = await prisma.serviceContract.findFirst({ where: { planId: id } });
      if (inUse) {
        return res.status(400).json({ error: 'No se puede eliminar el plan porque está asociado a contratos de clientes activos' });
      }

      const plan = await prisma.plan.findUnique({ where: { id } });

      await prisma.plan.delete({ where: { id } });

      // Registrar auditoría
      if (plan) {
        const user = (req as any).user;
        await AuditService.logAction({
          entity: AuditEntity.PLAN,
          entityId: id,
          action: AuditAction.DELETE,
          description: `Plan de Internet eliminado: ${plan.name}`,
          userId: user?.id,
          userEmail: user?.email,
          dataBefore: plan,
        });
      }

      return res.json({ message: 'Plan eliminado correctamente' });
    } catch (err: any) {
      logger.error(`Error eliminando plan: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar plan' });
    }
  }
}
