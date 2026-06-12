import { Router } from 'express';
import { MigrationController } from '../controllers/migration.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.get(
  '/analyze/:nodeId',
  authenticateJWT,
  requireRole([UserRole.ADMIN]),
  MigrationController.analyze
);

router.post(
  '/execute',
  authenticateJWT,
  requireRole([UserRole.ADMIN]),
  MigrationController.execute
);

router.post(
  '/cleanup-node',
  authenticateJWT,
  requireRole([UserRole.ADMIN]),
  MigrationController.cleanupNode
);

export default router;
