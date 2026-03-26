import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  acceptCandidateAdmissionAsStudent,
  getCandidateAdmissionById,
  getCandidateAdmissions,
  getCandidateDecisionLetterById,
  getMyCandidateAdmission,
  getMyCandidateDecisionLetter,
  reviewCandidateAdmission,
  submitMyCandidateAdmission,
  upsertCandidateAdmissionAssessments,
  upsertCandidateDecisionLetter,
  upsertMyCandidateAdmission,
} from '../controllers/candidateAdmission.controller';

const router = Router();

router.use(authMiddleware);

router.get('/me', roleMiddleware(['CALON_SISWA']), getMyCandidateAdmission);
router.put('/me', roleMiddleware(['CALON_SISWA']), upsertMyCandidateAdmission);
router.post('/me/submit', roleMiddleware(['CALON_SISWA']), submitMyCandidateAdmission);
router.get('/me/decision-letter', roleMiddleware(['CALON_SISWA']), getMyCandidateDecisionLetter);

router.get('/', roleMiddleware(['ADMIN', 'STAFF', 'PRINCIPAL']), getCandidateAdmissions);
router.get('/:id/decision-letter', roleMiddleware(['ADMIN', 'STAFF', 'PRINCIPAL', 'CALON_SISWA']), getCandidateDecisionLetterById);
router.put('/:id/decision-letter', roleMiddleware(['ADMIN', 'STAFF']), upsertCandidateDecisionLetter);
router.get('/:id', roleMiddleware(['ADMIN', 'STAFF', 'PRINCIPAL']), getCandidateAdmissionById);
router.patch('/:id/assessment-board', roleMiddleware(['ADMIN']), upsertCandidateAdmissionAssessments);
router.patch('/:id/review', roleMiddleware(['ADMIN']), reviewCandidateAdmission);
router.post('/:id/accept-student', roleMiddleware(['ADMIN']), acceptCandidateAdmissionAsStudent);

export default router;
