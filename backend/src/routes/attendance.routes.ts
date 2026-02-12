import { Router } from 'express';
import {
  getDailyAttendanceRecap,
  getLateSummaryByClass,
  getSubjectAttendanceByDate,
  saveSubjectAttendance,
  saveDailyAttendance,
  getDailyAttendance,
  getStudentAttendanceHistory,
} from '../controllers/attendance.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

// Routes for Daily Attendance Input (Accessible by Student President)
router.get('/daily', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL', 'STUDENT']), getDailyAttendance);
router.post('/daily', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL', 'STUDENT']), saveDailyAttendance);

// Student History (Accessible by Student)
router.get('/student-history', roleMiddleware(['STUDENT']), getStudentAttendanceHistory);

// Routes restricted to Staff/Teachers
router.use(roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']));

router.get('/daily/recap', getDailyAttendanceRecap);
router.get('/daily/late-summary', getLateSummaryByClass);

router.get('/subject', getSubjectAttendanceByDate);
router.post('/subject', saveSubjectAttendance);

export default router;
