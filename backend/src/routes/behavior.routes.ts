import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createBehavior,
  deleteBehavior,
  getBehaviors,
  updateBehavior,
  getPrincipalBehaviorSummary,
} from '../controllers/behavior.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', roleMiddleware(['ADMIN', 'TEACHER']), getBehaviors);
router.get('/principal-summary', roleMiddleware(['PRINCIPAL']), getPrincipalBehaviorSummary);
router.post('/', roleMiddleware(['ADMIN', 'TEACHER']), createBehavior);
router.put('/:id', roleMiddleware(['ADMIN', 'TEACHER']), updateBehavior);
router.delete('/:id', roleMiddleware(['ADMIN', 'TEACHER']), deleteBehavior);

export default router;
