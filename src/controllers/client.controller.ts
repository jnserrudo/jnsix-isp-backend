import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { MikrotikService } from '../services/mikrotik.service';
import { AuditService } from '../services/audit.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ClientController {
  static async list(req: Request, res: Response) {
    try {
      const clients = await prisma.client.findMany({
        include: {
          contracts: {
            include: {
              plan: true,
              node: true,
            },
          },
        },
        orderBy: { fullName: 'asc' },
      });
      return res.json(clients);
    } catch (err: any) {
      logger.error(`Error listando clientes: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener clientes' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await prisma.client.findUnique({
        where: { id },
        include: {
          contracts: {
            include: {
              plan: true,
              node: true,
            },
          },
          invoices: {
            orderBy: { dueDate: 'desc' },
          },
          payments: {
            orderBy: { paymentDate: 'desc' },
          },
        },
      });

      if (!client) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      return res.json(client);
    } catch (err: any) {
      logger.error(`Error obteniendo cliente ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: 'Error al obtener el cliente' });
    }
  }

  /**
   * Generates a unique, short client code (e.g. "CLI-4A2X").
   */
  static async generateCode(req: Request, res: Response) {
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars (0/O, 1/I)
    let code: string;
    let attempts = 0;
    do {
      const random = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
      code = `CLI-${random}`;
      attempts++;
      if (attempts > 50) break; // safety valve
    } while (await prisma.client.findFirst({ where: { clientCode: code } }));

    return res.json({ code });
  }

  static async create(req: Request, res: Response) {
    try {
      const {
        fullName,
        dni,
        phone1,
        phone2,
        email,
        address,
        latitude,
        longitude,
        installationDate,
        notes,
      } = req.body;

      // Sanitize clientCode: empty string or whitespace-only → null
      const rawCode = req.body.clientCode;
      const clientCode: string | null = rawCode && rawCode.trim() ? rawCode.trim() : null;

      if (!fullName || !dni || !address || !clientCode) {
        return res.status(400).json({ error: 'Nombre, DNI, Dirección y Código de Cliente son requeridos' });
      }

      if (latitude !== undefined && latitude !== null && latitude !== '') {
        const latNum = Number(latitude);
        if (isNaN(latNum) || latNum < -90 || latNum > 90) {
          return res.status(400).json({ error: 'La latitud debe estar entre -90 y 90' });
        }
      }

      if (longitude !== undefined && longitude !== null && longitude !== '') {
        const lngNum = Number(longitude);
        if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
          return res.status(400).json({ error: 'La longitud debe estar entre -180 y 180' });
        }
      }

      const existingClient = await prisma.client.findUnique({ where: { dni } });
      if (existingClient) {
        return res.status(400).json({ error: 'Ya existe un cliente con ese DNI' });
      }

      // Proactive uniqueness check for clientCode
      const codeConflict = await prisma.client.findFirst({ where: { clientCode } });
      if (codeConflict) {
        return res.status(400).json({ error: `El código de cliente "${clientCode}" ya está en uso por otro cliente` });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(dni, salt);

      const client = await prisma.client.create({
        data: {
          fullName,
          dni,
          clientCode,
          phone1,
          phone2,
          email,
          password: hashedPassword,
          address,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          installationDate: installationDate ? new Date(installationDate) : new Date(),
          notes,
          status: 'ACTIVE',
        },
      });

      const user = (req as AuthenticatedRequest).user;
      await AuditService.logAction({
        entity: 'CLIENT',
        entityId: client.id,
        action: 'CREATE',
        description: `Cliente creado: ${client.fullName}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: client
      });

      return res.status(201).json(client);
    } catch (err: any) {
      logger.error(`Error creando cliente: ${err.message}`);
      return res.status(500).json({ error: 'Error al crear el cliente' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        fullName,
        dni,
        phone1,
        phone2,
        email,
        address,
        latitude,
        longitude,
        installationDate,
        status,
        notes,
      } = req.body;

      // Sanitize clientCode: empty string or whitespace-only → null
      const rawCode = req.body.clientCode;
      const clientCode: string | null = rawCode && rawCode.trim() ? rawCode.trim() : null;

      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      if (!fullName || !dni || !clientCode) {
        return res.status(400).json({ error: 'Nombre, DNI y Código de Cliente son requeridos' });
      }

      if (latitude !== undefined && latitude !== null && latitude !== '') {
        const latNum = Number(latitude);
        if (isNaN(latNum) || latNum < -90 || latNum > 90) {
          return res.status(400).json({ error: 'La latitud debe estar entre -90 y 90' });
        }
      }

      if (longitude !== undefined && longitude !== null && longitude !== '') {
        const lngNum = Number(longitude);
        if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
          return res.status(400).json({ error: 'La longitud debe estar entre -180 y 180' });
        }
      }

      let hashedPassword = undefined;

      if (dni && dni !== client.dni) {
        const existingDni = await prisma.client.findUnique({ where: { dni } });
        if (existingDni) {
          return res.status(400).json({ error: 'El DNI ya se encuentra registrado' });
        }
        
        // Si el DNI cambió, actualizamos la contraseña por defecto
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(dni, salt);
      }

      // Proactive uniqueness check for clientCode (exclude current client)
      if (clientCode && clientCode !== client.clientCode) {
        const codeConflict = await prisma.client.findFirst({ where: { clientCode, NOT: { id } } });
        if (codeConflict) {
          return res.status(400).json({ error: `El código de cliente "${clientCode}" ya está en uso por otro cliente` });
        }
      }

      const updated = await prisma.client.update({
        where: { id },
        data: {
          fullName,
          dni,
          clientCode,
          phone1,
          phone2,
          email,
          address,
          latitude: latitude !== undefined ? (latitude ? Number(latitude) : null) : undefined,
          longitude: longitude !== undefined ? (longitude ? Number(longitude) : null) : undefined,
          installationDate: installationDate ? new Date(installationDate) : undefined,
          status,
          notes,
          ...(hashedPassword && { password: hashedPassword }),
        },
      });

      const user = (req as AuthenticatedRequest).user;
      await AuditService.logAction({
        entity: 'CLIENT',
        entityId: client.id,
        action: 'UPDATE',
        description: `Cliente modificado: ${updated.fullName}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: client,
        dataAfter: updated
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error(`Error actualizando cliente ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: 'Error al actualizar cliente' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await prisma.client.findUnique({ where: { id } });
      await prisma.client.delete({ where: { id } });

      const user = (req as AuthenticatedRequest).user;
      await AuditService.logAction({
        entity: 'CLIENT',
        entityId: id,
        action: 'DELETE',
        description: `Cliente eliminado: ${client?.fullName || id}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataBefore: client
      });

      return res.json({ message: 'Cliente eliminado correctamente' });
    } catch (err: any) {
      logger.error(`Error eliminando cliente ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: 'Error al eliminar cliente' });
    }
  }

  /**
   * Manually blocks all contracts of a customer
   */
  static async manualBlock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contracts = await prisma.serviceContract.findMany({
        where: { clientId: id, status: 'ACTIVE' },
      });

      if (contracts.length === 0) {
        return res.status(400).json({ error: 'No se encontraron contratos activos para suspender' });
      }

      const results = [];
      for (const contract of contracts) {
        const result = await MikrotikService.blockContract(contract.id, 'MANUAL');
        results.push({ contractId: contract.id, ...result });
      }

      const user = (req as AuthenticatedRequest).user;
      await AuditService.logAction({
        entity: 'CLIENT',
        entityId: id,
        action: 'BLOCK',
        description: `Corte de servicio manual ejecutado. Contratos afectados: ${contracts.length}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({ message: 'Bloqueo manual completado', results });
    } catch (err: any) {
      logger.error(`Error bloqueando cliente manualmente: ${err.message}`);
      return res.status(500).json({ error: err.message || 'Error bloqueando cliente' });
    }
  }

  /**
   * Manually unblocks all contracts of a customer
   */
  static async manualUnblock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contracts = await prisma.serviceContract.findMany({
        where: { clientId: id, status: 'SUSPENDED' },
      });

      if (contracts.length === 0) {
        return res.status(400).json({ error: 'No se encontraron contratos suspendidos para reactivar' });
      }

      const results = [];
      for (const contract of contracts) {
        const result = await MikrotikService.unblockContract(contract.id, 'MANUAL');
        results.push({ contractId: contract.id, ...result });
      }

      const user = (req as AuthenticatedRequest).user;
      await AuditService.logAction({
        entity: 'CLIENT',
        entityId: id,
        action: 'UNBLOCK',
        description: `Reactivación manual ejecutada. Contratos afectados: ${contracts.length}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({ message: 'Reactivación manual completada', results });
    } catch (err: any) {
      logger.error(`Error reactivando cliente manualmente: ${err.message}`);
      return res.status(500).json({ error: err.message || 'Error reactivando cliente' });
    }
  }

  static async getDiagnostics(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await prisma.client.findUnique({
        where: { id },
        include: { contracts: true }
      });
      if (!client) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const contract = client.contracts.find(c => c.status === 'ACTIVE' || c.status === 'SUSPENDED');
      if (!contract) {
        return res.json({
          onuSignal: 0,
          onuStatus: 'NOT_PROVISIONED',
          trafficRx: 0,
          trafficTx: 0,
          pppoeStatus: 'NONE',
          uptime: 'N/A',
          onuSerial: 'N/A',
          onuModel: 'N/A',
          planName: 'Ninguno'
        });
      }

      const diag = await MikrotikService.getDiagnostics(contract.id);
      return res.json({
        ...diag,
        onuSerial: contract.onuSerial || 'N/A',
        onuModel: contract.onuModel || 'N/A',
      });
    } catch (err: any) {
      logger.error(`Error obteniendo diagnóstico del cliente ${req.params.id}: ${err.message}`);
      return res.status(500).json({ error: err.message || 'Error al obtener diagnóstico de red' });
    }
  }
}
