import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', PlanController.list);
router.get('/:id', PlanController.getById);
router.post('/', requireRole(['ADMIN']), PlanController.create);
router.put('/:id', requireRole(['ADMIN']), PlanController.update);
router.delete('/:id', requireRole(['ADMIN']), PlanController.delete);

export default router;
