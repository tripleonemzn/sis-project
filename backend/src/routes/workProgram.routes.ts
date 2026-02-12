import { Router } from 'express';
import {
  getWorkPrograms,
  createWorkProgram,
  updateWorkProgram,
  deleteWorkProgram,
  createWorkProgramItem,
  updateWorkProgramItem,
  deleteWorkProgramItem,
  createWorkProgramBudget,
  deleteWorkProgramBudget,
} from '../controllers/workProgram.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', getWorkPrograms);
router.post('/', createWorkProgram);
router.put('/:id', updateWorkProgram);
router.delete('/:id', deleteWorkProgram);

router.post('/:id/items', createWorkProgramItem);
router.put('/items/:id', updateWorkProgramItem);
router.delete('/items/:id', deleteWorkProgramItem);

router.post('/items/:id/budgets', createWorkProgramBudget);
router.delete('/budgets/:id', deleteWorkProgramBudget);

export default router;

