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
router.use(roleMiddleware(['ADMIN', 'TEACHER']));

router.get('/', getClasses);
router.get('/:id', getClassById);
router.post('/', createClass);
router.put('/:id', updateClass);
router.put('/:id/president', updateClassPresident);
router.delete('/:id', deleteClass);

export default router;
