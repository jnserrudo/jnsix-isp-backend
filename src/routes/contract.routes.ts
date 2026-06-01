import { Router } from 'express';
import { ContractController } from '../controllers/contract.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', ContractController.list);
router.get('/:id', ContractController.getById);
router.post('/', requireRole(['ADMIN', 'OPERATOR']), ContractController.create);
router.put('/:id', requireRole(['ADMIN', 'OPERATOR']), ContractController.update);
router.delete('/:id', requireRole(['ADMIN']), ContractController.delete);

export default router;
