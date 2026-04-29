import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createTeachingResourceEntry,
  deleteTeachingResourceProgram,
  deleteTeachingResourceEntry,
  getTeachingResourcePrograms,
  getTeachingResourceSignatureDefaults,
  getTeachingResourceEntries,
  getTeachingResourceReferenceEntries,
  getTeachingResourceEntriesSummary,
  reviewTeachingResourceEntry,
  submitTeachingResourceEntry,
  updateTeachingResourceEntry,
  upsertTeachingResourcePrograms,
} from '../controllers/teachingResourceProgram.controller';

const router = Router();

router.use(authMiddleware);

router.get('/programs', getTeachingResourcePrograms);
router.get('/signatures/defaults', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getTeachingResourceSignatureDefaults);
router.put('/programs', roleMiddleware(['TEACHER', 'ADMIN']), upsertTeachingResourcePrograms);
router.delete('/programs/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteTeachingResourceProgram);

router.get('/entries', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getTeachingResourceEntries);
router.get('/entries/references', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getTeachingResourceReferenceEntries);
router.get('/entries-summary', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getTeachingResourceEntriesSummary);
router.post('/entries', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), createTeachingResourceEntry);
router.patch('/entries/:id', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), updateTeachingResourceEntry);
router.delete('/entries/:id', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), deleteTeachingResourceEntry);
router.post('/entries/:id/submit', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), submitTeachingResourceEntry);
router.post('/entries/:id/review', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), reviewTeachingResourceEntry);

export default router;
