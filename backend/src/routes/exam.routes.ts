import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
    getPackets,
    getPacketById,
    createPacket,
    updatePacket,
    deletePacket,
    getQuestions,
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

const router = Router();

router.use(authMiddleware);

// Exam Access Restrictions (For Homeroom/Admin)
router.get('/restrictions', roleMiddleware(['TEACHER', 'ADMIN']), getExamRestrictions);
router.put('/restrictions', roleMiddleware(['TEACHER', 'ADMIN']), updateExamRestriction);

// Student Routes (Must be before other routes if any overlap, though here they are distinct)
router.get('/available', roleMiddleware(['STUDENT']), getAvailableExams);
router.get('/:id/start', roleMiddleware(['STUDENT']), startExam);
router.post('/:id/answers', roleMiddleware(['STUDENT']), submitAnswers);

// Packets
router.get('/packets', getPackets);
router.get('/packets/:id', getPacketById);
router.post('/packets', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), createPacket);
router.put('/packets/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), updatePacket);
router.delete('/packets/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXAMINER']), deletePacket);

// Questions (Bank)
router.get('/questions', getQuestions);

// Schedules
router.get('/schedules', getSchedules);
router.post('/schedules', roleMiddleware(['TEACHER', 'ADMIN']), createSchedule);
router.patch('/schedules/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateSchedule);
router.delete('/schedules/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteSchedule);

export default router;
