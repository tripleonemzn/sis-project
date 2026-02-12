import { Router } from 'express';
import {
  getAcademicYears,
  getActiveAcademicYear,
  getAcademicYearById,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  activateAcademicYear,
  promoteAcademicYear,
  updatePklConfig,
} from '../controllers/academicYear.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Public routes (authenticated users)
router.get('/active', getActiveAcademicYear);
router.get('/', getAcademicYears); // Allow all authenticated users to list academic years

// Wakasek Humas or Admin routes
router.patch('/pkl-config', updatePklConfig);

// Admin only routes
router.use(roleMiddleware(['ADMIN']));

router.get('/:id', getAcademicYearById);
router.post('/', createAcademicYear);
router.put('/:id', updateAcademicYear);
router.delete('/:id', deleteAcademicYear);
router.post('/:id/activate', activateAcademicYear);
router.post('/:id/promote', promoteAcademicYear);

export default router;
