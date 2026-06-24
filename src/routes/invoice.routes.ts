import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', InvoiceController.list);
router.get('/billing-progress', InvoiceController.billingProgress);
router.get('/:id', InvoiceController.getById);

router.post('/trigger-billing', requireRole(['ADMIN']), InvoiceController.triggerBilling);
router.post('/trigger-cuts', requireRole(['ADMIN']), InvoiceController.triggerCuts);
router.put('/:id/expire', requireRole(['ADMIN', 'OPERATOR']), InvoiceController.expireInvoice);

router.post('/:id/items', requireRole(['ADMIN', 'OPERATOR']), InvoiceController.addItem);
router.delete('/:id/items/:itemId', requireRole(['ADMIN', 'OPERATOR']), InvoiceController.deleteItem);

export default router;
