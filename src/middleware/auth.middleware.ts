import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.split(' ')[1]; // Bearer TOKEN
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (token) {
    const secret = process.env.JWT_SECRET || 'jnsix-isp-super-secret-key-change-this-in-production';

    jwt.verify(token, secret, (err: any, decoded: any) => {
      if (err) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
      }

      req.user = decoded as { id: string; email: string; role: UserRole };
      next();
    });
  } else {
    res.status(401).json({ error: 'Encabezado de autorización no provisto' });
  }
};

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tiene permisos para realizar esta acción' });
    }

    next();
  };
};
