import { PrismaClient } from '@prisma/client';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Utilidades para soft delete en todas las entidades
 */

interface SoftDeleteOptions {
  userId?: string;
  userEmail?: string;
  auditEntity: AuditEntity;
  auditDescription: string;
}

/**
 * Realiza un soft delete en cualquier modelo de Prisma
 */
export async function softDelete(
  model: any,
  id: string,
  options: SoftDeleteOptions
): Promise<any> {
  const dataBefore = await model.findUnique({ where: { id } });

  if (!dataBefore) {
    throw new Error('Registro no encontrado');
  }

  if (dataBefore.deletedAt) {
    throw new Error('El registro ya está eliminado');
  }

  const dataAfter = await model.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy: options.userId || 'SYSTEM',
    },
  });

  // Auditar
  await AuditService.logAction({
    entity: options.auditEntity,
    entityId: id,
    action: AuditAction.DELETE,
    description: options.auditDescription,
    userId: options.userId,
    userEmail: options.userEmail,
    dataBefore,
    dataAfter,
    success: true,
  });

  return dataAfter;
}

/**
 * Restaura un registro eliminado (soft delete)
 */
export async function restore(
  model: any,
  id: string,
  options: SoftDeleteOptions
): Promise<any> {
  const dataBefore = await model.findUnique({ where: { id } });

  if (!dataBefore) {
    throw new Error('Registro no encontrado');
  }

  if (!dataBefore.deletedAt) {
    throw new Error('El registro no está eliminado');
  }

  const dataAfter = await model.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedBy: null,
    },
  });

  // Auditar
  await AuditService.logAction({
    entity: options.auditEntity,
    entityId: id,
    action: AuditAction.RESTORE,
    description: options.auditDescription.replace('eliminado', 'restaurado'),
    userId: options.userId,
    userEmail: options.userEmail,
    dataBefore,
    dataAfter,
    success: true,
  });

  return dataAfter;
}

/**
 * Obtiene todos los registros eliminados de un modelo
 */
export async function getDeleted(
  model: any,
  filters?: any
): Promise<any[]> {
  return model.findMany({
    where: {
      ...filters,
      deletedAt: { not: null },
    },
    orderBy: { deletedAt: 'desc' },
  });
}

/**
 * Middleware para excluir registros eliminados por defecto
 */
export function excludeDeleted() {
  return {
    deletedAt: null,
  };
}

/**
 * Helper para agregar filtro de soft delete a queries
 */
export function withSoftDelete(where: any = {}, includeDeleted: boolean = false) {
  if (includeDeleted) {
    return where;
  }
  return {
    ...where,
    deletedAt: null,
  };
}
