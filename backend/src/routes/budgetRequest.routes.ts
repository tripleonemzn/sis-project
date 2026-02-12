import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createBudgetRequest, listBudgetRequests, deleteBudgetRequest } from '../controllers/budgetRequest.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', listBudgetRequests);
router.post('/', createBudgetRequest);
router.delete('/:id', deleteBudgetRequest);

export default router;