import { PrismaClient, AuditEntity, AuditAction, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface LogActionParams {
  entity: AuditEntity;
  entityId?: string;
  action: AuditAction;
  description: string;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  dataBefore?: any;
  dataAfter?: any;
  success?: boolean;
  errorMessage?: string;
}

export class AuditService {
  /**
   * Registra una acción en el log de auditoría
   */
  static async logAction(params: LogActionParams): Promise<void> {
    const startTime = Date.now();

    try {
      // Calcular cambios si hay datos antes y después
      const changes = params.dataBefore && params.dataAfter
        ? this.calculateChanges(params.dataBefore, params.dataAfter)
        : null;

      await prisma.auditLog.create({
        data: {
          entity: params.entity,
          entityId: params.entityId,
          action: params.action,
          description: params.description,
          userId: params.userId,
          userEmail: params.userEmail || 'SYSTEM',
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          dataBefore: params.dataBefore ? JSON.parse(JSON.stringify(params.dataBefore)) : null,
          dataAfter: params.dataAfter ? JSON.parse(JSON.stringify(params.dataAfter)) : null,
          changes: changes,
          success: params.success !== undefined ? params.success : true,
          errorMessage: params.errorMessage,
          executionTimeMs: Date.now() - startTime,
        },
      });
    } catch (error) {
      console.error('Error logging audit action:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Calcula los cambios entre dos objetos
   */
  private static calculateChanges(before: any, after: any): any {
    const changes: any = {};

    // Obtener todas las claves únicas
    const allKeys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);

    for (const key of allKeys) {
      const beforeValue = before?.[key];
      const afterValue = after?.[key];

      // Ignorar campos de metadata
      if (['createdAt', 'updatedAt', 'password'].includes(key)) {
        continue;
      }

      // Si los valores son diferentes
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[key] = {
          from: beforeValue,
          to: afterValue,
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Obtiene logs de auditoría con filtros
   */
  static async getAuditLogs(filters: {
    entity?: AuditEntity;
    entityId?: string;
    action?: AuditAction;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page || 0;
    const pageSize = filters.pageSize || 50;

    const where: Prisma.AuditLogWhereInput = {};

    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Obtiene el historial de auditoría de una entidad específica
   */
  static async getEntityHistory(entity: AuditEntity, entityId: string) {
    return prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtiene estadísticas de auditoría
   */
  static async getAuditStats(filters?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [
      totalActions,
      successActions,
      failedActions,
      actionsByEntity,
      actionsByType,
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, success: true } }),
      prisma.auditLog.count({ where: { ...where, success: false } }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: true,
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
    ]);

    return {
      totalActions,
      successActions,
      failedActions,
      actionsByEntity,
      actionsByType,
    };
  }
}
