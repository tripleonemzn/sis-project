import { Router } from 'express';
import {
  getSubjectCategories,
  createSubjectCategory,
  updateSubjectCategory,
  deleteSubjectCategory
} from '../controllers/subjectCategory.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/', getSubjectCategories);

// Only ADMIN can manage categories
router.use(roleMiddleware(['ADMIN']));
router.post('/', createSubjectCategory);
router.patch('/:id', updateSubjectCategory);
router.delete('/:id', deleteSubjectCategory);

export default router;
