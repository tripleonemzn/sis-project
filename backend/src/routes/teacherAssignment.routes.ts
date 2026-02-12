import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createTeacherAssignments,
  deleteTeacherAssignment,
  getTeacherAssignments,
  getTeacherAssignmentById,
  updateCompetencyThresholds,
} from '../controllers/teacherAssignment.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', roleMiddleware(['ADMIN', 'TEACHER', 'EXAMINER']), getTeacherAssignments);
router.get('/:id', roleMiddleware(['ADMIN', 'TEACHER', 'EXAMINER']), getTeacherAssignmentById);
router.put('/:id/competency', roleMiddleware(['ADMIN', 'TEACHER']), updateCompetencyThresholds);
router.post('/', roleMiddleware(['ADMIN']), createTeacherAssignments);
router.delete('/:id', roleMiddleware(['ADMIN']), deleteTeacherAssignment);

export default router;
