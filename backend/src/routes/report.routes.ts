import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  getClassReportSummary,
  getReportDate,
  getStudentReport,
  getClassLedger,
  getClassExtracurricularReport,
  upsertReportNote,
  updateExtracurricularGrade,
  createAchievement,
  deleteAchievement,
  getClassRankings,
  getPrincipalAcademicOverview,
  getPrincipalDashboardSummary,
  getFinalLedgerPreview,
  exportFinalLedgerPreview,
} from '../controllers/report.controller';

const router = Router();

router.use(authMiddleware);

// Admin & Principal routes (read-only access for Principal)
router.get('/report-cards', roleMiddleware(['ADMIN', 'PRINCIPAL']), getClassReportSummary);
router.get(
  '/principal-overview',
  roleMiddleware(['PRINCIPAL']),
  getPrincipalAcademicOverview,
);
router.get(
  '/principal-dashboard-summary',
  roleMiddleware(['PRINCIPAL']),
  getPrincipalDashboardSummary,
);
router.post(
  '/final-ledger/preview',
  roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']),
  getFinalLedgerPreview,
);
router.post(
  '/final-ledger/export',
  roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']),
  exportFinalLedgerPreview,
);
router.post(
  '/consolidation/preview',
  roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']),
  getFinalLedgerPreview,
);
router.post(
  '/consolidation/export',
  roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']),
  exportFinalLedgerPreview,
);

// Teacher (Homeroom) & Admin routes
router.get('/rankings', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), getClassRankings);
router.get('/date', roleMiddleware(['ADMIN', 'TEACHER']), getReportDate);
router.get('/student', roleMiddleware(['ADMIN', 'TEACHER']), getStudentReport);
router.get('/student/sbts', roleMiddleware(['ADMIN', 'TEACHER']), getStudentReport);
router.get('/ledger', roleMiddleware(['ADMIN', 'TEACHER']), getClassLedger);
router.get('/extracurricular', roleMiddleware(['ADMIN', 'TEACHER']), getClassExtracurricularReport);
router.post('/extracurricular/grade', roleMiddleware(['ADMIN', 'TEACHER']), updateExtracurricularGrade);
router.post('/notes', roleMiddleware(['ADMIN', 'TEACHER']), upsertReportNote);
router.post('/achievement', roleMiddleware(['ADMIN', 'TEACHER']), createAchievement);
router.delete('/achievement/:id', roleMiddleware(['ADMIN', 'TEACHER']), deleteAchievement);

export default router;
