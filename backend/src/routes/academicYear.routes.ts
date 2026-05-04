import { Router } from 'express';
import {
  getAcademicYears,
  getActiveAcademicYear,
  getAcademicYearById,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  activateAcademicYear,
  getAcademicFeatureFlagsController,
  createAcademicYearRolloverTargetController,
  getAcademicYearRolloverWorkspaceController,
  applyAcademicYearRolloverController,
  getAcademicPromotionWorkspaceController,
  saveAcademicPromotionMappingsController,
  commitAcademicPromotionController,
  rollbackAcademicPromotionController,
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

router.get('/features', getAcademicFeatureFlagsController);
router.get('/:id', getAcademicYearById);
router.post('/', createAcademicYear);
router.put('/:id', updateAcademicYear);
router.delete('/:id', deleteAcademicYear);
router.post('/:id/activate', activateAcademicYear);
router.post('/:id/rollover-v1/target', createAcademicYearRolloverTargetController);
router.get('/:id/rollover-v1', getAcademicYearRolloverWorkspaceController);
router.post('/:id/rollover-v1/apply', applyAcademicYearRolloverController);
router.get('/:id/promotion-v2', getAcademicPromotionWorkspaceController);
router.put('/:id/promotion-v2/mappings', saveAcademicPromotionMappingsController);
router.post('/:id/promotion-v2/commit', commitAcademicPromotionController);
router.post('/:id/promotion-v2/runs/:runId/rollback', rollbackAcademicPromotionController);
// Legacy unsafe promotion endpoint is kept only to return 410 Gone.
router.post('/:id/promote', promoteAcademicYear);

export default router;
