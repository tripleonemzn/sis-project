import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  updateClassPresident,
} from '../controllers/class.controller';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Read-only access for Admin, Teacher, and Principal
router.get('/', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), getClasses);
router.get('/:id', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), getClassById);

// Modification routes restricted to Admin and Teacher
router.post('/', roleMiddleware(['ADMIN', 'TEACHER']), createClass);
router.put('/:id', roleMiddleware(['ADMIN', 'TEACHER']), updateClass);
router.put('/:id/president', roleMiddleware(['ADMIN', 'TEACHER']), updateClassPresident);
router.delete('/:id', roleMiddleware(['ADMIN', 'TEACHER']), deleteClass);

export default router;
