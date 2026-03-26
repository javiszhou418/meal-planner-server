import { Router } from 'express';
import { generateMeals } from '../controllers/mealController';
const router = Router();
router.post('/generate', generateMeals);
export default router;
