import { Router } from 'express';
import {
  getScheduleTimeConfig,
  upsertScheduleTimeConfig,
} from '../controllers/scheduleTimeConfig.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/', getScheduleTimeConfig);

router.use(roleMiddleware(['ADMIN', 'TEACHER'])); // Allow TEACHER if they have WAKASEK duty (checked via role/duty logic usually, but strict Role enum here)
// For now, restrict write to ADMIN. WAKASEK usually has ADMIN role or we need more complex middleware.
// Given Role enum has ADMIN, TEACHER etc, assuming only ADMIN can configure global schedule times for now.

router.post('/', roleMiddleware(['ADMIN']), upsertScheduleTimeConfig);

export default router;
