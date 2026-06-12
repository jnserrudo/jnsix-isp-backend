import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

/**
 * Middleware para auditar automáticamente las acciones HTTP
 */
export const auditMiddleware = (entity: AuditEntity, action: AuditAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.json;
    const startTime = Date.now();

    // Capturar la respuesta
    res.json = function (data: any) {
      res.json = originalSend;

      // Registrar auditoría después de la respuesta
      setImmediate(async () => {
        try {
          const user = (req as any).user; // Del middleware de auth
          const entityId = req.params.id || data?.id;
          const success = res.statusCode >= 200 && res.statusCode < 300;

          let description = `${action} en ${entity}`;
          if (entityId) description += ` (ID: ${entityId})`;

          await AuditService.logAction({
            entity,
            entityId,
            action,
            description,
            userId: user?.id,
            userEmail: user?.email,
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
            dataBefore: req.body?.dataBefore, // Opcional
            dataAfter: success ? data : null,
            success,
            errorMessage: !success ? data?.message || data?.error : undefined,
          });
        } catch (error) {
          console.error('Error in audit middleware:', error);
        }
      });

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Helper para auditar manualmente una acción
 */
export const auditAction = async (
  req: Request,
  entity: AuditEntity,
  entityId: string,
  action: AuditAction,
  description: string,
  dataBefore?: any,
  dataAfter?: any,
  success: boolean = true,
  errorMessage?: string
) => {
  const user = (req as any).user;

  await AuditService.logAction({
    entity,
    entityId,
    action,
    description,
    userId: user?.id,
    userEmail: user?.email,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    dataBefore,
    dataAfter,
    success,
    errorMessage,
  });
};
