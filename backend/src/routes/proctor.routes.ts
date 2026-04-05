import { Router } from 'express';
import {
  getProctorSchedules,
  getProctoringDetail,
  submitBeritaAcara,
  getProctoringReports,
  getProctoringReportDocument,
  getProctoringAttendanceDocument,
} from '../controllers/proctor.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/schedules', roleMiddleware(['TEACHER', 'ADMIN']), getProctorSchedules);
router.get('/schedules/:scheduleId', roleMiddleware(['TEACHER', 'ADMIN']), getProctoringDetail);
router.post('/schedules/:scheduleId/report', roleMiddleware(['TEACHER', 'ADMIN']), submitBeritaAcara);
router.get('/reports/:reportId/document', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getProctoringReportDocument);
router.get('/reports/:reportId/attendance-document', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getProctoringAttendanceDocument);
router.get('/reports', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getProctoringReports);

export default router;
