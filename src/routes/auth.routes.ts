import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', AuthController.login);
router.post('/register', authenticateJWT, requireRole(['ADMIN']), AuthController.register);
router.get('/me', authenticateJWT, AuthController.me);

export default router;
