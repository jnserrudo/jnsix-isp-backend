import { Request, Response } from 'express';
import prisma from '../services/db.service';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export class PortalController {
  static async login(req: Request, res: Response) {
    try {
      const { dni, clientCode } = req.body;
      
      if (!dni || !clientCode) {
        return res.status(400).json({ error: 'DNI y Código de Cliente son requeridos' });
      }

      const client = await prisma.client.findFirst({
        where: { dni, clientCode, deletedAt: null }
      });

      if (!client) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const token = jwt.sign(
        { id: client.id, role: 'CLIENT' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ token, client: { id: client.id, fullName: client.fullName, status: client.status } });
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
