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

router.get('/', roleMiddleware(['ADMIN', 'TEACHER', 'EXAMINER', 'PRINCIPAL']), getTeacherAssignments);
router.get('/:id(\\d+)', roleMiddleware(['ADMIN', 'TEACHER', 'EXAMINER', 'PRINCIPAL']), getTeacherAssignmentById);
router.put('/:id(\\d+)/competency', roleMiddleware(['ADMIN', 'TEACHER']), updateCompetencyThresholds);
router.post('/', roleMiddleware(['ADMIN', 'TEACHER']), createTeacherAssignments);
router.delete('/:id(\\d+)', roleMiddleware(['ADMIN', 'TEACHER']), deleteTeacherAssignment);

export default router;
