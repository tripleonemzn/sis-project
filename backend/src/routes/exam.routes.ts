import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
    getPackets,
    getPacketById,
    createPacket,
    updatePacket,
    deletePacket,
    getPacketItemAnalysis,
    getPacketSubmissions,
    getSessionDetail,
    syncPacketItemAnalysis,
    getQuestions,
    getProgramSessions,
    createProgramSession,
    getSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getAvailableExams,
    startExam,
    submitAnswers,
    getExamRestrictions,
    updateExamRestriction
} from '../controllers/exam.controller';
import {
    getExamGradeComponents,
    getExamPrograms,
    upsertExamGradeComponents,
    upsertExamPrograms,
} from '../controllers/examProgram.controller';

const router = Router();

router.use(authMiddleware);

router.get('/programs', getExamPrograms);
router.put('/programs', roleMiddleware(['TEACHER', 'ADMIN']), upsertExamPrograms);
router.get('/components', getExamGradeComponents);
router.put('/components', roleMiddleware(['TEACHER', 'ADMIN']), upsertExamGradeComponents);

// Exam Access Restrictions (For Homeroom/Admin)
router.get('/restrictions', roleMiddleware(['TEACHER', 'ADMIN']), getExamRestrictions);
router.put('/restrictions', roleMiddleware(['TEACHER', 'ADMIN']), updateExamRestriction);

// Student Routes (Must be before other routes if any overlap, though here they are distinct)
router.get('/available', roleMiddleware(['STUDENT']), getAvailableExams);
router.get('/:id/start', roleMiddleware(['STUDENT']), startExam);
router.post('/:id/answers', roleMiddleware(['STUDENT']), submitAnswers);

// Packets
router.get('/packets', getPackets);
router.get('/packets/:id/submissions', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), getPacketSubmissions);
router.get('/packets/:id/item-analysis', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), getPacketItemAnalysis);
router.post('/packets/:id/item-analysis/sync', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), syncPacketItemAnalysis);
router.get('/packets/:id', getPacketById);
router.get('/sessions/:id/detail', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), getSessionDetail);
router.post('/packets', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), createPacket);
router.put('/packets/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), updatePacket);
router.delete('/packets/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), deletePacket);

// Questions (Bank)
router.get('/questions', getQuestions);

// Program Sessions (dynamic master session labels per program)
router.get('/program-sessions', roleMiddleware(['TEACHER', 'ADMIN']), getProgramSessions);
router.post('/program-sessions', roleMiddleware(['TEACHER', 'ADMIN']), createProgramSession);

// Schedules
router.get('/schedules', getSchedules);
router.post('/schedules', roleMiddleware(['TEACHER', 'ADMIN']), createSchedule);
router.patch('/schedules/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateSchedule);
router.delete('/schedules/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteSchedule);

export default router;
