import { Router } from 'express';
import { getDishById, getAllDishes } from '../controllers/dishController';
const router = Router();
router.get('/', getAllDishes);
router.get('/:id', getDishById);
export default router;
