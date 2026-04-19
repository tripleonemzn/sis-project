import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
    getPackets,
    getPacketById,
    updatePacketReviewFeedback,
    replyPacketReviewFeedback,
    createPacket,
    updatePacket,
    deletePacket,
    getPacketItemAnalysis,
    getPacketSubmissions,
    getSessionDetail,
    updateSessionScore,
    syncPacketItemAnalysis,
    getQuestions,
    deleteQuestion,
    getProgramSessions,
    createProgramSession,
    getSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getAvailableExams,
    createExamBrowserLaunchToken,
    exchangeExamBrowserLaunchToken,
    startExam,
    submitAnswers,
    getExamRestrictions,
    updateExamRestriction,
    getScheduleMakeupAccess,
    upsertScheduleMakeupAccess,
    revokeScheduleMakeupAccess,
} from '../controllers/exam.controller';
import {
    getExamGradeComponents,
    getExamReportDates,
    getExamPrograms,
    upsertExamGradeComponents,
    upsertExamReportDates,
    upsertExamPrograms,
} from '../controllers/examProgram.controller';

const router = Router();

// Public route for external exam-browser app (token exchange).
router.post('/launch/exchange', exchangeExamBrowserLaunchToken);

router.use(authMiddleware);

router.get('/programs', getExamPrograms);
router.put('/programs', roleMiddleware(['TEACHER', 'ADMIN']), upsertExamPrograms);
router.get('/report-dates', roleMiddleware(['TEACHER', 'ADMIN']), getExamReportDates);
router.put('/report-dates', roleMiddleware(['TEACHER', 'ADMIN']), upsertExamReportDates);
router.get('/components', getExamGradeComponents);
router.put('/components', roleMiddleware(['TEACHER', 'ADMIN']), upsertExamGradeComponents);

// Exam Access Restrictions (For Homeroom/Admin)
router.get('/restrictions', roleMiddleware(['TEACHER', 'ADMIN']), getExamRestrictions);
router.put('/restrictions', roleMiddleware(['TEACHER', 'ADMIN']), updateExamRestriction);

// Student Routes (Must be before other routes if any overlap, though here they are distinct)
router.get('/available', roleMiddleware(['STUDENT', 'CALON_SISWA', 'UMUM']), getAvailableExams);
router.post('/:id/launch-token', roleMiddleware(['STUDENT', 'CALON_SISWA', 'UMUM']), createExamBrowserLaunchToken);
router.get('/:id/start', roleMiddleware(['STUDENT', 'CALON_SISWA', 'UMUM']), startExam);
router.post('/:id/answers', roleMiddleware(['STUDENT', 'CALON_SISWA', 'UMUM']), submitAnswers);

// Packets
router.get('/packets', getPackets);
router.get('/packets/:id/submissions', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), getPacketSubmissions);
router.get('/packets/:id/item-analysis', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), getPacketItemAnalysis);
router.post('/packets/:id/item-analysis/sync', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), syncPacketItemAnalysis);
router.get('/packets/:id', getPacketById);
router.patch('/packets/:id/review-feedback', roleMiddleware(['TEACHER', 'ADMIN']), updatePacketReviewFeedback);
router.patch('/packets/:id/review-feedback/reply', roleMiddleware(['TEACHER', 'ADMIN']), replyPacketReviewFeedback);
router.get('/sessions/:id/detail', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), getSessionDetail);
router.patch('/sessions/:id/score', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), updateSessionScore);
router.post('/packets', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), createPacket);
router.put('/packets/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), updatePacket);
router.delete('/packets/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), deletePacket);

// Questions (Bank)
router.get('/questions', getQuestions);
router.delete('/questions/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), deleteQuestion);

// Program Sessions (dynamic master session labels per program)
router.get('/program-sessions', roleMiddleware(['TEACHER', 'ADMIN']), getProgramSessions);
router.post('/program-sessions', roleMiddleware(['TEACHER', 'ADMIN']), createProgramSession);

// Schedules
router.get('/schedules', getSchedules);
router.post('/schedules', roleMiddleware(['TEACHER', 'ADMIN']), createSchedule);
router.get('/schedules/:id/makeup-access', roleMiddleware(['TEACHER', 'ADMIN']), getScheduleMakeupAccess);
router.put('/schedules/:id/makeup-access', roleMiddleware(['TEACHER', 'ADMIN']), upsertScheduleMakeupAccess);
router.delete('/schedules/:id/makeup-access/:studentId', roleMiddleware(['TEACHER', 'ADMIN']), revokeScheduleMakeupAccess);
router.patch('/schedules/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateSchedule);
router.delete('/schedules/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteSchedule);

export default router;
