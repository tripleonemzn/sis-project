import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createBudgetRequest,
  listBudgetRequests,
  deleteBudgetRequest,
  updateBudgetRequestStatus,
  confirmBudgetRealization,
  uploadBudgetLpj,
} from '../controllers/budgetRequest.controller';
import { budgetLpjUpload } from '../utils/upload';

const router = Router();

router.use(authMiddleware);

router.get('/', listBudgetRequests);
router.post('/', createBudgetRequest);
router.delete('/:id', deleteBudgetRequest);
router.patch('/:id/status', updateBudgetRequestStatus);
router.patch('/:id/realization', confirmBudgetRealization);
router.post('/:id/lpj', budgetLpjUpload.single('file'), uploadBudgetLpj);

export default router;
