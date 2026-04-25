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
import {
  closeSelfScanSession,
  confirmSelfScanMonitorPass,
  confirmSelfScanPass,
  createSelfScanPass,
  getActiveSelfScanSession,
  getDailyPresenceOverview,
  getDailyPresencePolicy,
  getDailyPresenceStudents,
  getOwnDailyPresence,
  getStudentDailyPresence,
  saveDailyPresencePolicy,
  saveAssistedDailyPresence,
  previewSelfScanPass,
  startSelfScanSession,
} from '../controllers/dailyPresence.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

// Routes for Daily Attendance Input (Accessible by Student President)
router.get('/daily', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL', 'STUDENT']), getDailyAttendance);
router.post('/daily', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL', 'STUDENT']), saveDailyAttendance);

// Student History (Accessible by Student)
router.get('/student-history', roleMiddleware(['STUDENT', 'PARENT']), getStudentAttendanceHistory);

// Daily presence operations (Assisted by Administration)
router.get('/daily-presence/overview', roleMiddleware(['ADMIN', 'STAFF']), getDailyPresenceOverview);
router.get('/daily-presence/policy', roleMiddleware(['ADMIN', 'STAFF']), getDailyPresencePolicy);
router.put('/daily-presence/policy', roleMiddleware(['ADMIN', 'STAFF']), saveDailyPresencePolicy);
router.get('/daily-presence/students', roleMiddleware(['ADMIN', 'STAFF']), getDailyPresenceStudents);
router.get('/daily-presence/student', roleMiddleware(['ADMIN', 'STAFF']), getStudentDailyPresence);
router.post('/daily-presence/assisted', roleMiddleware(['ADMIN', 'STAFF']), saveAssistedDailyPresence);
router.get(
  '/daily-presence/me',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  getOwnDailyPresence,
);
router.get('/daily-presence/self-scan/session', roleMiddleware(['ADMIN', 'STAFF', 'STUDENT']), getActiveSelfScanSession);
router.post('/daily-presence/self-scan/session', roleMiddleware(['ADMIN', 'STAFF']), startSelfScanSession);
router.post('/daily-presence/self-scan/session/close', roleMiddleware(['ADMIN', 'STAFF']), closeSelfScanSession);
router.post('/daily-presence/self-scan/pass', roleMiddleware(['STUDENT']), createSelfScanPass);
router.post(
  '/daily-presence/self-scan/monitor/confirm',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  confirmSelfScanMonitorPass,
);
router.post('/daily-presence/self-scan/preview', roleMiddleware(['ADMIN', 'STAFF']), previewSelfScanPass);
router.post('/daily-presence/self-scan/confirm', roleMiddleware(['ADMIN', 'STAFF']), confirmSelfScanPass);

// Routes restricted to Staff/Teachers
router.use(roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']));

router.get('/daily/recap', getDailyAttendanceRecap);
router.get('/daily/late-summary', getLateSummaryByClass);

router.get('/subject', getSubjectAttendanceByDate);
router.post('/subject', saveSubjectAttendance);

export default router;
