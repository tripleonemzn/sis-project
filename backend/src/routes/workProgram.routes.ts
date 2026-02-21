import { Router } from 'express';
import {
  getWorkPrograms,
  createWorkProgram,
  updateWorkProgram,
  deleteWorkProgram,
  createWorkProgramItem,
  updateWorkProgramItem,
  deleteWorkProgramItem,
  getPendingWorkProgramsForApprover,
  updateWorkProgramApprovalStatus,
} from '../controllers/workProgram.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', getWorkPrograms);
router.get('/pending', getPendingWorkProgramsForApprover);
router.post('/', createWorkProgram);
router.put('/:id', updateWorkProgram);
router.delete('/:id', deleteWorkProgram);
router.post('/:id/approval', updateWorkProgramApprovalStatus);

router.post('/:id/items', createWorkProgramItem);
router.put('/items/:id', updateWorkProgramItem);
router.delete('/items/:id', deleteWorkProgramItem);

export default router;
