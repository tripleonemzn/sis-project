import { Router } from 'express';
import {
  getSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../controllers/subject.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// Semua endpoint membutuhkan autentikasi
router.use(authMiddleware);

// Public read access for authenticated users (teachers need to see subjects too)
router.get('/', getSubjects);
router.get('/:id', getSubjectById);

router.use(roleMiddleware(['ADMIN', 'TEACHER']));
router.post('/', createSubject);
router.patch('/:id', updateSubject);
router.delete('/:id', deleteSubject);

export default router;
