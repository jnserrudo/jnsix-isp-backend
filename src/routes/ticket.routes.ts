import { Router } from 'express';
import { TicketController } from '../controllers/ticket.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', TicketController.list);
router.get('/:id', TicketController.getById);
router.post('/', requireRole(['ADMIN', 'OPERATOR']), TicketController.create);
router.put('/:id', requireRole(['ADMIN', 'OPERATOR']), TicketController.update);
router.delete('/:id', requireRole(['ADMIN']), TicketController.delete);

export default router;
