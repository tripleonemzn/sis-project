import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createScheduleEntry,
  deleteScheduleEntry,
  listSchedules,
  getTeachingLoadSummary,
} from '../controllers/schedule.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', roleMiddleware(['ADMIN', 'TEACHER', 'EXAMINER', 'STUDENT']), listSchedules);
router.get('/teaching-summary', roleMiddleware(['ADMIN', 'TEACHER']), getTeachingLoadSummary);
router.post('/', roleMiddleware(['ADMIN', 'TEACHER']), createScheduleEntry);
router.delete('/:id', roleMiddleware(['ADMIN', 'TEACHER']), deleteScheduleEntry);

export default router;
