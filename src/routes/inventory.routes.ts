import { Router } from 'express';
import { 
  getInventoryItems, 
  getInventoryItem, 
  createInventoryItem, 
  updateInventoryItem, 
  deleteInventoryItem 
} from '../controllers/inventory.controller';

const router = Router();

router.get('/', getInventoryItems);
router.get('/:id', getInventoryItem);
router.post('/', createInventoryItem);
router.put('/:id', updateInventoryItem);
router.delete('/:id', deleteInventoryItem);

export default router;
