import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getClassReportSummary, getStudentSbtsReport, getClassLedger, getClassExtracurricularReport, upsertReportNote, updateExtracurricularGrade, createAchievement, deleteAchievement, getClassRankings } from '../controllers/report.controller';

const router = Router();

router.use(authMiddleware);

// Admin only routes
router.get('/report-cards', roleMiddleware(['ADMIN']), getClassReportSummary);

// Teacher (Homeroom) & Admin routes
router.get('/rankings', roleMiddleware(['ADMIN', 'TEACHER']), getClassRankings);
router.get('/student/sbts', roleMiddleware(['ADMIN', 'TEACHER']), getStudentSbtsReport);
router.get('/ledger', roleMiddleware(['ADMIN', 'TEACHER']), getClassLedger);
router.get('/extracurricular', roleMiddleware(['ADMIN', 'TEACHER']), getClassExtracurricularReport);
router.post('/extracurricular/grade', roleMiddleware(['ADMIN', 'TEACHER']), updateExtracurricularGrade);
router.post('/notes', roleMiddleware(['ADMIN', 'TEACHER']), upsertReportNote);
router.post('/achievement', roleMiddleware(['ADMIN', 'TEACHER']), createAchievement);
router.delete('/achievement/:id', roleMiddleware(['ADMIN', 'TEACHER']), deleteAchievement);

export default router;
