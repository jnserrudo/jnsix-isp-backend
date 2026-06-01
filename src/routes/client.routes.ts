import { Router } from 'express';
import { ClientController } from '../controllers/client.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', ClientController.list);
router.get('/:id', ClientController.getById);
router.post('/', requireRole(['ADMIN', 'OPERATOR']), ClientController.create);
router.put('/:id', requireRole(['ADMIN', 'OPERATOR']), ClientController.update);
router.delete('/:id', requireRole(['ADMIN']), ClientController.delete);

// Manual block/unblock actions
router.post('/:id/block', requireRole(['ADMIN', 'OPERATOR']), ClientController.manualBlock);
router.post('/:id/unblock', requireRole(['ADMIN', 'OPERATOR']), ClientController.manualUnblock);
router.get('/:id/diagnostics', requireRole(['ADMIN', 'OPERATOR', 'READONLY']), ClientController.getDiagnostics);

export default router;
