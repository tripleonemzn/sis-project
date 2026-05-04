import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  getTeachingJournalEntryById,
  getTeachingJournalMonitoring,
  getTeachingJournalSessions,
  upsertTeachingJournalEntry,
} from '../controllers/teachingJournal.controller';

const router = Router();

router.use(authMiddleware);

router.get('/monitoring', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), getTeachingJournalMonitoring);
router.get('/sessions', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), getTeachingJournalSessions);
router.get('/entries/:id(\\d+)', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), getTeachingJournalEntryById);
router.post('/entries', roleMiddleware(['ADMIN', 'TEACHER', 'PRINCIPAL']), upsertTeachingJournalEntry);

export default router;
