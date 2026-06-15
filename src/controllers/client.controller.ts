import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { MikrotikService } from '../services/mikrotik.service';

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
        clientCode,
        installationDate,
        notes,
      } = req.body;

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

      const client = await prisma.client.create({
        data: {
          fullName,
          dni,
          clientCode,
          phone1,
          phone2,
          email,
          address,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          installationDate: installationDate ? new Date(installationDate) : new Date(),
          notes,
          status: 'ACTIVE',
        },
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
        clientCode,
        installationDate,
        status,
        notes,
      } = req.body;

      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
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

      if (dni && dni !== client.dni) {
        const existingDni = await prisma.client.findUnique({ where: { dni } });
        if (existingDni) {
          return res.status(400).json({ error: 'El DNI ya se encuentra registrado' });
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
        },
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
      await prisma.client.delete({ where: { id } });
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
