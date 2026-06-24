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
          },
          contracts: {
            where: { status: 'ACTIVE' },
            select: { node: { select: { id: true, name: true } } }
          }
        },
        orderBy: { name: 'asc' },
      });

      const plansWithNodes = plans.map(plan => {
        const nodeCounts: Record<string, { id: string, name: string, count: number }> = {};
        for (const contract of plan.contracts) {
          if (!contract.node) continue;
          if (!nodeCounts[contract.node.id]) {
            nodeCounts[contract.node.id] = { id: contract.node.id, name: contract.node.name, count: 0 };
          }
          nodeCounts[contract.node.id].count++;
        }
        
        const { contracts, ...planData } = plan;
        return {
          ...planData,
          nodesBreakdown: Object.values(nodeCounts)
        };
      });

      return res.json(plansWithNodes);
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
      const plan = await prisma.plan.findUnique({ where: { id }, include: { contracts: true } });
      if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

      if (plan.contracts.length > 0) {
        return res.status(400).json({ error: 'No se puede eliminar un plan con contratos activos' });
      }

      await prisma.plan.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: (req as any).user?.email }
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.PLAN,
        entityId: plan.id,
        action: AuditAction.DELETE,
        description: `Plan de Internet eliminado (Soft delete): ${plan.name}`,
        userId: user?.id,
        userEmail: user?.email,
        dataBefore: plan,
      });

      return res.json({ message: 'Plan eliminado correctamente' });
    } catch (err: any) {
      logger.error(`Error eliminando plan: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar plan' });
    }
  }

  static async bulkIncrease(req: Request, res: Response) {
    try {
      const { planIds, type, amount, notify } = req.body; // type: 'PERCENTAGE' or 'FIXED'
      
      if (!planIds || !Array.isArray(planIds) || planIds.length === 0) {
        return res.status(400).json({ error: 'Debe proporcionar al menos un ID de plan' });
      }
      if (!type || !['PERCENTAGE', 'FIXED'].includes(type) || !amount) {
        return res.status(400).json({ error: 'Tipo y monto de aumento requeridos' });
      }

      const plans = await prisma.plan.findMany({ where: { id: { in: planIds } } });
      const results = [];

      for (const plan of plans) {
        let newPrice = Number(plan.price);
        if (type === 'PERCENTAGE') {
          newPrice += newPrice * (Number(amount) / 100);
        } else {
          newPrice += Number(amount);
        }

        const updated = await prisma.plan.update({
          where: { id: plan.id },
          data: { price: newPrice }
        });

        results.push(updated);

        const user = (req as any).user;
        await AuditService.logAction({
          entity: AuditEntity.PLAN,
          entityId: plan.id,
          action: AuditAction.UPDATE,
          description: `Aumento masivo aplicado (${type}: ${amount}). Precio anterior: $${plan.price}, Nuevo: $${newPrice}`,
          userId: user?.id,
          userEmail: user?.email,
          dataBefore: plan,
          dataAfter: updated,
        });
      }

      // TODO: Logic to send notifications to users if notify === true
      if (notify) {
        logger.info(`Se generarán notificaciones para los clientes de ${plans.length} planes aumentados.`);
      }

      return res.json({ message: 'Aumento masivo aplicado correctamente', results });
    } catch (err: any) {
      logger.error(`Error en aumento masivo: ${err.message}`);
      return res.status(500).json({ error: 'Error al aplicar aumento masivo' });
    }
  }
}
