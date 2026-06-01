import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../services/db.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'jnsix-isp-super-secret-key-change-this-in-production';

export class AuthController {
  /**
   * Logs in a user, returns token and user info.
   * Auto-creates a seed admin user if no users exist.
   */
  static async login(req: AuthenticatedRequest, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
      }

      // Check if DB has any users. If empty, create default admin.
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        logger.info('No se encontraron usuarios en la base de datos. Creando usuario semilla admin...');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await prisma.user.create({
          data: {
            email: 'admin@jnsix.com',
            password: hashedPassword,
            fullName: 'Administrador Inicial',
            role: 'ADMIN',
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' } // Long-lasting token for convenience
      );

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      });
    } catch (err: any) {
      logger.error(`Error en login: ${err.message}`);
      return res.status(500).json({ error: 'Error del servidor durante el inicio de sesión' });
    }
  }

  /**
   * Registers a new user (Only ADMIN role can register others)
   */
  static async register(req: AuthenticatedRequest, res: Response) {
    try {
      const { email, password, fullName, role } = req.body;

      if (!email || !password || !fullName) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'El email ya está registrado' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          fullName,
          role: role || 'OPERATOR',
        },
      });

      return res.status(201).json({
        message: 'Usuario registrado con éxito',
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          role: newUser.role,
        },
      });
    } catch (err: any) {
      logger.error(`Error registrando usuario: ${err.message}`);
      return res.status(500).json({ error: 'Error del servidor durante el registro' });
    }
  }

  /**
   * Returns current user profile
   */
  static async me(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'Usuario no encontrado o inactivo' });
      }

      return res.json({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      });
    } catch (err: any) {
      logger.error(`Error obteniendo perfil actual: ${err.message}`);
      return res.status(500).json({ error: 'Error obteniendo perfil' });
    }
  }
}
