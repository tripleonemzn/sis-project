import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createOsisDivision,
  getActiveOsisElection,
  createOsisElectionCandidate,
  createOsisElectionPeriod,
  createOsisManagementPeriod,
  createOsisMembership,
  createOsisPosition,
  deleteOsisElectionCandidate,
  deleteOsisDivision,
  deleteOsisMembership,
  deleteOsisPosition,
  getActiveStudentOsisElection,
  getOsisDivisions,
  getLatestOsisElection,
  getLatestStudentOsisElection,
  getEligibleOsisStudents,
  getOsisElectionPeriods,
  getOsisElectionQuickCount,
  getOsisGradeTemplates,
  getOsisManagementPeriods,
  getOsisMemberships,
  getOsisPositions,
  finalizeOsisElectionPeriod,
  saveOsisGradeTemplates,
  submitOsisElectionVote,
  updateOsisDivision,
  updateOsisElectionCandidate,
  updateOsisElectionPeriod,
  updateOsisManagementPeriod,
  updateOsisMembership,
  updateOsisPosition,
  upsertOsisAssessment,
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

router.get(
  '/management-periods',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  getOsisManagementPeriods,
);
router.post(
  '/management-periods',
  roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']),
  createOsisManagementPeriod,
);
router.put(
  '/management-periods/:id',
  roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']),
  updateOsisManagementPeriod,
);
router.get(
  '/divisions',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  getOsisDivisions,
);
router.post('/divisions', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisDivision);
router.put('/divisions/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisDivision);
router.delete('/divisions/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), deleteOsisDivision);
router.get(
  '/positions',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  getOsisPositions,
);
router.post('/positions', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisPosition);
router.put('/positions/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisPosition);
router.delete('/positions/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), deleteOsisPosition);
router.get(
  '/memberships',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR']),
  getOsisMemberships,
);
router.post('/memberships', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisMembership);
router.put('/memberships/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisMembership);
router.delete('/memberships/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), deleteOsisMembership);
router.get(
  '/grade-templates',
  roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']),
  getOsisGradeTemplates,
);
router.put(
  '/grade-templates',
  roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']),
  saveOsisGradeTemplates,
);
router.post(
  '/assessments',
  roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']),
  upsertOsisAssessment,
);

router.post('/periods', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisElectionPeriod);
router.put('/periods/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisElectionPeriod);
router.post('/periods/:id/finalize', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), finalizeOsisElectionPeriod);
router.get('/eligible-students', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), getEligibleOsisStudents);
router.post('/periods/:id/candidates', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), createOsisElectionCandidate);
router.put('/candidates/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), updateOsisElectionCandidate);
router.delete('/candidates/:id', roleMiddleware(['TEACHER', 'ADMIN', 'EXTRACURRICULAR_TUTOR']), deleteOsisElectionCandidate);

export default router;
