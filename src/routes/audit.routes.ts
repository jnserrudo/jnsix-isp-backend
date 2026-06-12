import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole(['ADMIN'])); // Solo admins pueden ver auditoría

router.get('/', AuditController.getAuditLogs);
router.get('/stats', AuditController.getAuditStats);
router.get('/export', AuditController.exportAudit);
router.get('/entity/:entity/:id', AuditController.getEntityHistory);
router.get('/user/:userId', AuditController.getUserAudit);
router.get('/:id', AuditController.getAuditLogById);

export default router;
