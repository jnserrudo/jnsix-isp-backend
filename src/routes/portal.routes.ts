import { Router } from 'express';
import { PortalController } from '../controllers/portal.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/my-info', authenticateJWT, PortalController.getMyInfo);
router.get('/tickets', authenticateJWT, PortalController.getMyTickets);
router.post('/tickets', authenticateJWT, PortalController.createTicket);

export default router;
