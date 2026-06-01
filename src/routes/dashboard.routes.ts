import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/stats', DashboardController.getStats);
router.get('/map-clients', DashboardController.getMapClients);

export default router;
