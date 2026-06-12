import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { MigrationService } from '../services/migration.service';
import logger from '../utils/logger';

export class MigrationController {
  /**
   * GET /api/migration/analyze/:nodeId
   */
  public static async analyze(req: AuthenticatedRequest, res: Response) {
    const { nodeId } = req.params;
    
    if (!nodeId) {
      return res.status(400).json({
        success: false,
        message: 'Falta parámetro requerido: nodeId.'
      });
    }

    try {
      const analysis = await MigrationService.analyzeMigration(nodeId);
      return res.json(analysis);
    } catch (err: any) {
      logger.error(`Error analizando migración para el nodo ${nodeId}: ${err.message || err}`);
      return res.status(500).json({
        success: false,
        message: 'Error al analizar los datos de migración.',
        errorDetails: err.message || String(err)
      });
    }
  }

  /**
   * POST /api/migration/execute
   */
  public static async execute(req: AuthenticatedRequest, res: Response) {
    const { nodeId, mappings } = req.body;
    const userId = req.user?.id;

    if (!nodeId || !mappings || !Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros requeridos: nodeId (string) y mappings (array).'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado.'
      });
    }

    try {
      const result = await MigrationService.executeMigration(nodeId, mappings, userId);
      return res.json(result);
    } catch (err: any) {
      logger.error(`Error ejecutando migración masiva: ${err.message || err}`);
      return res.status(500).json({
        success: false,
        message: 'Error al ejecutar la migración masiva en la base de datos.',
        errorDetails: err.message || String(err)
      });
    }
  }
}
