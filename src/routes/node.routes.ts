import { Router } from 'express';
import { NodeController } from '../controllers/node.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', NodeController.list);
router.get('/actions/log', requireRole(['ADMIN', 'OPERATOR']), NodeController.listActions);
router.get('/:id', NodeController.getById);
router.post('/', requireRole(['ADMIN']), NodeController.create);
router.put('/:id', requireRole(['ADMIN']), NodeController.update);
router.delete('/:id', requireRole(['ADMIN']), NodeController.delete);

// Test MikroTik routerOS API connection
router.post('/:id/test-connection', requireRole(['ADMIN', 'OPERATOR']), NodeController.testConnection);

export default router;
