import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { MikrotikService } from '../services/mikrotik.service';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class NodeController {
  static async list(req: Request, res: Response) {
    try {
      const nodes = await prisma.node.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { contracts: true }
          }
        }
      });
      return res.json(nodes);
    } catch (err: any) {
      logger.error(`Error listando nodos: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener nodos' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const node = await prisma.node.findUnique({ where: { id } });
      if (!node) return res.status(404).json({ error: 'Nodo no encontrado' });
      return res.json(node);
    } catch (err: any) {
      logger.error(`Error obteniendo nodo: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener nodo' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { name, address, latitude, longitude, mikrotikHost, mikrotikPort, mikrotikUser, mikrotikPassword, oltHost, oltType, notes } = req.body;
      if (!name || !mikrotikHost || !mikrotikUser || !mikrotikPassword) {
        return res.status(400).json({ error: 'Nombre, IP host, usuario y password del MikroTik son requeridos' });
      }

      const node = await prisma.node.create({
        data: {
          name,
          address,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          mikrotikHost,
          mikrotikPort: mikrotikPort ? Number(mikrotikPort) : 8728,
          mikrotikUser,
          mikrotikPassword,
          oltHost,
          oltType,
          notes,
        },
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.NODE,
        entityId: node.id,
        action: AuditAction.CREATE,
        description: `Nodo creado: ${node.name} (${node.mikrotikHost})`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: node
      });

      return res.status(201).json(node);
    } catch (err: any) {
      logger.error(`Error creando nodo: ${err.message}`);
      return res.status(500).json({ error: 'Error al crear nodo' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, address, latitude, longitude, mikrotikHost, mikrotikPort, mikrotikUser, mikrotikPassword, oltHost, oltType, notes, isActive } = req.body;

      const node = await prisma.node.findUnique({ where: { id } });
      if (!node) return res.status(404).json({ error: 'Nodo no encontrado' });

      const updated = await prisma.node.update({
        where: { id },
        data: {
          name,
          address,
          latitude: latitude !== undefined ? (latitude ? Number(latitude) : null) : undefined,
          longitude: longitude !== undefined ? (longitude ? Number(longitude) : null) : undefined,
          mikrotikHost,
          mikrotikPort: mikrotikPort !== undefined ? Number(mikrotikPort) : undefined,
          mikrotikUser,
          mikrotikPassword,
          oltHost,
          oltType,
          notes,
          isActive,
        },
      });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.NODE,
        entityId: node.id,
        action: AuditAction.UPDATE,
        description: `Nodo actualizado: ${updated.name}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: node,
        dataAfter: updated
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error(`Error actualizando nodo: ${err.message}`);
      return res.status(500).json({ error: 'Error al actualizar nodo' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const inUse = await prisma.serviceContract.findFirst({ where: { nodeId: id } });
      if (inUse) {
        return res.status(400).json({ error: 'No se puede eliminar el nodo porque tiene clientes asignados' });
      }

      const node = await prisma.node.findUnique({ where: { id } });
      await prisma.node.delete({ where: { id } });

      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.NODE,
        entityId: id,
        action: AuditAction.DELETE,
        description: `Nodo eliminado: ${node?.name || id}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: node
      });

      return res.json({ message: 'Nodo eliminado correctamente' });
    } catch (err: any) {
      logger.error(`Error eliminando nodo: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar nodo' });
    }
  }

  /**
   * Tests connection to a MikroTik Node
   */
  static async testConnection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const isOnline = await MikrotikService.testConnection(id);
      if (isOnline) {
        return res.json({ success: true, status: 'online', message: 'Conexión con MikroTik establecida correctamente' });
      } else {
        return res.status(502).json({ success: false, status: 'offline', message: 'No se pudo conectar con el MikroTik. Verifique IP, puerto y credenciales.' });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error durante prueba de conexión' });
    }
  }

  static async listActions(req: Request, res: Response) {
    try {
      const actions = await prisma.mikrotikAction.findMany({
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

      const mapped = actions.map(act => ({
        id: act.id,
        clientName: act.contract?.client?.fullName || 'Desconocido',
        nodeName: act.node?.name || 'Desconocido',
        actionType: act.actionType,
        status: act.status,
        executedAt: act.executedAt,
        errorMessage: act.errorMessage,
      }));

      return res.json(mapped);
    } catch (err: any) {
      logger.error(`Error listando acciones de MikroTik: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener historial de acciones' });
    }
  }

  /**
   * Radar de Dispositivos: Obtiene todas las conexiones activas en un nodo
   */
  static async getLiveConnections(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      logger.info(`[API] Solicitando escaneo de dispositivos en nodo ${id}`);
      
      const result = await MikrotikService.getLiveConnections(id);
      return res.json(result);
    } catch (err: any) {
      logger.error(`[API] Error en getLiveConnections: ${err.message}`);
      
      // Manejo de errores específicos
      if (err.message.includes('Nodo no encontrado')) {
        return res.status(404).json({ error: 'Nodo no encontrado' });
      }
      
      if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
        return res.status(503).json({ 
          error: 'Timeout de conexión con MikroTik',
          message: 'El router no responde. Verifique que esté encendido y accesible en la red.'
        });
      }
      
      if (err.message.includes('Invalid user name or password')) {
        return res.status(401).json({ 
          error: 'Credenciales inválidas',
          message: 'Usuario o contraseña incorrectos para el MikroTik.'
        });
      }
      
      if (err.message.includes('ECONNREFUSED')) {
        return res.status(503).json({ 
          error: 'Conexión rechazada',
          message: 'El servicio API del MikroTik no está habilitado o el puerto es incorrecto.'
        });
      }
      
      return res.status(500).json({ 
        error: 'Error al escanear dispositivos',
        message: err.message 
      });
    }
  }
}
