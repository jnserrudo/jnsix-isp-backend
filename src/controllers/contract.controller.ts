import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class ContractController {
  static async list(req: Request, res: Response) {
    try {
      const contracts = await prisma.serviceContract.findMany({
        include: {
          client: true,
          plan: true,
          node: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(contracts);
    } catch (err: any) {
      logger.error(`Error listando contratos: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener contratos' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await prisma.serviceContract.findUnique({
        where: { id },
        include: {
          client: true,
          plan: true,
          node: true,
        },
      });
      if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
      return res.json(contract);
    } catch (err: any) {
      logger.error(`Error obteniendo contrato: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener contrato' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const {
        clientId,
        planId,
        nodeId,
        billingDay,
        graceDays,
        pppoeUsername,
        pppoePassword,
        staticIp,
        macAddress,
        onuSerial,
        onuModel,
        contractStart,
      } = req.body;

      if (!clientId || !planId || !nodeId) {
        return res.status(400).json({ error: 'Cliente, Plan y Nodo son requeridos' });
      }

      // Check if client and plan exist
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

      const node = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!node) return res.status(404).json({ error: 'Nodo no encontrado' });

      const contract = await prisma.serviceContract.create({
        data: {
          clientId,
          planId,
          nodeId,
          billingDay: billingDay ? Number(billingDay) : 5,
          graceDays: graceDays ? Number(graceDays) : 5,
          pppoeUsername,
          pppoePassword,
          staticIp,
          macAddress,
          onuSerial,
          onuModel,
          contractStart: contractStart ? new Date(contractStart) : new Date(),
          status: 'ACTIVE',
        },
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.CONTRACT,
        entityId: contract.id,
        action: AuditAction.CREATE,
        description: `Contrato creado para el cliente ID ${clientId} (Plan: ${plan.name})`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: contract
      });

      return res.status(201).json(contract);
    } catch (err: any) {
      logger.error(`Error creando contrato: ${err.message}`);
      return res.status(500).json({ error: 'Error al crear contrato' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        planId,
        nodeId,
        billingDay,
        graceDays,
        pppoeUsername,
        pppoePassword,
        staticIp,
        macAddress,
        onuSerial,
        onuModel,
        status,
        contractEnd,
      } = req.body;

      const contract = await prisma.serviceContract.findUnique({ where: { id } });
      if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

      const updated = await prisma.serviceContract.update({
        where: { id },
        data: {
          planId,
          nodeId,
          billingDay: billingDay !== undefined ? Number(billingDay) : undefined,
          graceDays: graceDays !== undefined ? Number(graceDays) : undefined,
          pppoeUsername,
          pppoePassword,
          staticIp,
          macAddress,
          onuSerial,
          onuModel,
          status,
          contractEnd: contractEnd ? new Date(contractEnd) : undefined,
        },
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.CONTRACT,
        entityId: contract.id,
        action: AuditAction.UPDATE,
        description: `Contrato actualizado (Estado: ${status || contract.status})`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: contract,
        dataAfter: updated
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error(`Error actualizando contrato: ${err.message}`);
      return res.status(500).json({ error: 'Error al actualizar contrato' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await prisma.serviceContract.findUnique({ where: { id } });
      await prisma.serviceContract.delete({ where: { id } });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.CONTRACT,
        entityId: id,
        action: AuditAction.DELETE,
        description: `Contrato eliminado (Cliente ID: ${contract?.clientId || 'Desconocido'})`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: contract
      });

      return res.json({ message: 'Contrato eliminado correctamente' });
    } catch (err: any) {
      logger.error(`Error eliminando contrato: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar contrato' });
    }
  }
}
