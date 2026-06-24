import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', requireRole(['ADMIN', 'OPERATOR']), SettingsController.get);
router.put('/', requireRole(['ADMIN']), SettingsController.update);

export default router;
