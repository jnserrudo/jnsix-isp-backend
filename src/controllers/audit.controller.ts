import { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class AuditController {
  /**
   * GET /api/audit
   * Listar logs de auditoría con filtros
   */
  static async getAuditLogs(req: Request, res: Response) {
    try {
      const {
        entity,
        entityId,
        action,
        userId,
        startDate,
        endDate,
        page,
        pageSize,
      } = req.query;

      const filters: any = {};
      if (entity) filters.entity = entity as AuditEntity;
      if (entityId) filters.entityId = entityId as string;
      if (action) filters.action = action as AuditAction;
      if (userId) filters.userId = userId as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (page) filters.page = parseInt(page as string);
      if (pageSize) filters.pageSize = parseInt(pageSize as string);

      const result = await AuditService.getAuditLogs(filters);

      res.json(result);
    } catch (error: any) {
      console.error('Error getting audit logs:', error);
      res.status(500).json({
        message: 'Error al obtener logs de auditoría',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/audit/:id
   * Obtener un log de auditoría específico
   */
  static async getAuditLogById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const log = await AuditService.getAuditLogs({
        entityId: id,
        pageSize: 1,
      });

      if (!log.logs.length) {
        return res.status(404).json({ message: 'Log de auditoría no encontrado' });
      }

      res.json(log.logs[0]);
    } catch (error: any) {
      console.error('Error getting audit log:', error);
      res.status(500).json({
        message: 'Error al obtener log de auditoría',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/audit/entity/:entity/:id
   * Obtener historial de auditoría de una entidad
   */
  static async getEntityHistory(req: Request, res: Response) {
    try {
      const { entity, id } = req.params;

      const history = await AuditService.getEntityHistory(
        entity as AuditEntity,
        id
      );

      res.json(history);
    } catch (error: any) {
      console.error('Error getting entity history:', error);
      res.status(500).json({
        message: 'Error al obtener historial de entidad',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/audit/user/:userId
   * Obtener auditoría por usuario
   */
  static async getUserAudit(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page, pageSize } = req.query;

      const result = await AuditService.getAuditLogs({
        userId,
        page: page ? parseInt(page as string) : 0,
        pageSize: pageSize ? parseInt(pageSize as string) : 50,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error getting user audit:', error);
      res.status(500).json({
        message: 'Error al obtener auditoría de usuario',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/audit/stats
   * Obtener estadísticas de auditoría
   */
  static async getAuditStats(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const stats = await AuditService.getAuditStats(filters);

      res.json(stats);
    } catch (error: any) {
      console.error('Error getting audit stats:', error);
      res.status(500).json({
        message: 'Error al obtener estadísticas de auditoría',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/audit/export
   * Exportar auditoría a CSV/Excel
   */
  static async exportAudit(req: Request, res: Response) {
    try {
      const {
        entity,
        entityId,
        action,
        userId,
        startDate,
        endDate,
      } = req.query;

      const filters: any = {};
      if (entity) filters.entity = entity as AuditEntity;
      if (entityId) filters.entityId = entityId as string;
      if (action) filters.action = action as AuditAction;
      if (userId) filters.userId = userId as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      filters.pageSize = 10000; // Máximo para exportar

      const result = await AuditService.getAuditLogs(filters);

      // Convertir a CSV
      const csvRows = [
        ['Fecha', 'Entidad', 'Acción', 'Descripción', 'Usuario', 'Éxito', 'Error'].join(','),
      ];

      for (const log of result.logs) {
        csvRows.push([
          log.createdAt.toISOString(),
          log.entity,
          log.action,
          `"${log.description.replace(/"/g, '""')}"`,
          log.userEmail || 'SYSTEM',
          log.success ? 'Sí' : 'No',
          log.errorMessage ? `"${log.errorMessage.replace(/"/g, '""')}"` : '',
        ].join(','));
      }

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit_log.csv');
      res.send(csv);
    } catch (error: any) {
      console.error('Error exporting audit:', error);
      res.status(500).json({
        message: 'Error al exportar auditoría',
        error: error.message,
      });
    }
  }
}
