import { Router } from 'express';
import {
  getMajors,
  getMajorById,
  createMajor,
  updateMajor,
  deleteMajor,
} from '../controllers/major.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// Public read access (no auth required for majors list to avoid 403/401 on some clients)
router.get('/', getMajors);
router.get('/:id', getMajorById);

router.use(authMiddleware);

// Admin only for management
router.post('/', roleMiddleware(['ADMIN']), createMajor);
router.put('/:id', roleMiddleware(['ADMIN']), updateMajor);
router.delete('/:id', roleMiddleware(['ADMIN']), deleteMajor);

export default router;
