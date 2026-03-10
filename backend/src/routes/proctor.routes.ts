import { Router } from 'express';
import { getProctorSchedules, getProctoringDetail, submitBeritaAcara, getProctoringReports } from '../controllers/proctor.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/schedules', roleMiddleware(['TEACHER', 'ADMIN']), getProctorSchedules);
router.get('/schedules/:scheduleId', roleMiddleware(['TEACHER', 'ADMIN']), getProctoringDetail);
router.post('/schedules/:scheduleId/report', roleMiddleware(['TEACHER', 'ADMIN']), submitBeritaAcara);
router.get('/reports', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getProctoringReports);

export default router;
