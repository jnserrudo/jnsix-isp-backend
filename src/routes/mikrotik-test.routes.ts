import { Router } from 'express';
import { MikrotikTestController } from '../controllers/mikrotik-test.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole(['ADMIN', 'OPERATOR'])); // Solo admins y operadores

router.post('/connection', MikrotikTestController.testConnection);
router.post('/command', MikrotikTestController.executeCommand);
router.post('/pppoe-secret/create', MikrotikTestController.createPPPoESecret);
router.post('/queue/create', MikrotikTestController.createQueue);
router.post('/list', MikrotikTestController.listResources);
router.post('/initialize', MikrotikTestController.initializeRouter);

export default router;
