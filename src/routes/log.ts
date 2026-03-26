import { Router } from 'express';
import { getLog, getDailySummary, addLogEntry, deleteLogEntry } from '../controllers/logController';
const router = Router();
router.get('/', getLog);
router.get('/summary', getDailySummary);
router.post('/', addLogEntry);
router.delete('/:id', deleteLogEntry);
export default router;
