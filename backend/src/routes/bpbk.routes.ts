import { Router } from 'express';
import { AdditionalDuty } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { dutyMiddleware } from '../middleware/duty';
import {
  createBpBkCounseling,
  getBpBkBehaviors,
  getBpBkCounselings,
  getBpBkPermissions,
  getBpBkPrincipalSummary,
  getBpBkSummary,
  updateBpBkCounseling,
} from '../controllers/bpbk.controller';

const router = Router();

router.use(authMiddleware);
router.get('/principal-summary', roleMiddleware(['PRINCIPAL', 'ADMIN']), getBpBkPrincipalSummary);
router.use(roleMiddleware(['TEACHER', 'ADMIN']));
router.use(dutyMiddleware([AdditionalDuty.BP_BK]));

router.get('/summary', getBpBkSummary);
router.get('/behaviors', getBpBkBehaviors);
router.get('/permissions', getBpBkPermissions);
router.get('/counselings', getBpBkCounselings);
router.post('/counselings', createBpBkCounseling);
router.patch('/counselings/:id', updateBpBkCounseling);

export default router;
