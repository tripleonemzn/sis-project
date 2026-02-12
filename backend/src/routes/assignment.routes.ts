import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { assignmentUpload } from '../utils/upload';
import {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  copyAssignment
} from '../controllers/assignment.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getAssignments);
router.get('/:id', getAssignmentById);
router.post('/', roleMiddleware(['TEACHER', 'ADMIN']), assignmentUpload.single('file'), createAssignment);
router.post('/:id/copy', roleMiddleware(['TEACHER', 'ADMIN']), copyAssignment);
router.put('/:id', roleMiddleware(['TEACHER', 'ADMIN']), assignmentUpload.single('file'), updateAssignment);
router.delete('/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteAssignment);

export default router;
