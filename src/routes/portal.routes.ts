import { Router } from 'express';
import { PortalController } from '../controllers/portal.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', PortalController.login);
router.get('/my-info', authenticateJWT, PortalController.getMyInfo);

export default router;
