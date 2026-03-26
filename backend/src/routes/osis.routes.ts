import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  getActiveOsisElection,
  createOsisElectionCandidate,
  createOsisElectionPeriod,
  deleteOsisElectionCandidate,
  getActiveStudentOsisElection,
  getLatestOsisElection,
  getLatestStudentOsisElection,
  getEligibleOsisStudents,
  getOsisElectionPeriods,
  getOsisElectionQuickCount,
  finalizeOsisElectionPeriod,
  submitOsisElectionVote,
  updateOsisElectionCandidate,
  updateOsisElectionPeriod,
} from '../controllers/osis.controller';

const router = Router();

router.use(authMiddleware);

router.get(
  '/active',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF', 'EXTRACURRICULAR_TUTOR']),
  getActiveOsisElection,
);
router.get(
  '/latest',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF', 'EXTRACURRICULAR_TUTOR']),
  getLatestOsisElection,
);
router.post(
  '/vote',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF', 'EXTRACURRICULAR_TUTOR']),
  submitOsisElectionVote,
);

router.get(
  '/student/active',
  roleMiddleware(['STUDENT']),
  getActiveStudentOsisElection,
);
router.get(
  '/student/latest',
  roleMiddleware(['STUDENT']),
  getLatestStudentOsisElection,
);
router.post(
  '/student/vote',
  roleMiddleware(['STUDENT']),
  submitOsisElectionVote,
);

router.get('/periods', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']), getOsisElectionPeriods);
router.get(
  '/periods/:id/quick-count',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  getOsisElectionQuickCount,
);

router.post('/periods', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisElectionPeriod);
router.put('/periods/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisElectionPeriod);
router.post('/periods/:id/finalize', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), finalizeOsisElectionPeriod);
router.get('/eligible-students', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), getEligibleOsisStudents);
router.post('/periods/:id/candidates', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisElectionCandidate);
router.put('/candidates/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisElectionCandidate);
router.delete('/candidates/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), deleteOsisElectionCandidate);

export default router;
