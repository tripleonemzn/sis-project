import { Router } from 'express';
import {
  getScheduleTimeConfig,
  upsertScheduleTimeConfig,
} from '../controllers/scheduleTimeConfig.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { dutyMiddleware } from '../middleware/duty';
import { AdditionalDuty } from '@prisma/client';

const router = Router();

router.use(authMiddleware);

router.get('/', getScheduleTimeConfig);

router.use(roleMiddleware(['ADMIN', 'TEACHER']));

router.post(
  '/',
  dutyMiddleware([
    AdditionalDuty.WAKASEK_KURIKULUM,
    AdditionalDuty.SEKRETARIS_KURIKULUM,
  ]),
  upsertScheduleTimeConfig,
);

export default router;
