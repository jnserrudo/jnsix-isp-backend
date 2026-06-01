import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', PaymentController.list);
router.post('/', requireRole(['ADMIN', 'OPERATOR']), PaymentController.create);

export default router;
