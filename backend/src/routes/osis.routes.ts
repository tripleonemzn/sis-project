import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createOsisDivision,
  getActiveOsisElection,
  createOsisElectionCandidate,
  createOsisElectionPeriod,
  createOsisManagementPeriod,
  createStudentOsisJoinRequest,
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
  getOsisJoinRequests,
  getOsisManagementPeriods,
  getOsisMemberships,
  getOsisPositions,
  getStudentOsisJoinStatus,
  finalizeOsisElectionPeriod,
  rejectOsisJoinRequest,
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
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF']),
  getActiveOsisElection,
);
router.get(
  '/latest',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF']),
  getLatestOsisElection,
);
router.post(
  '/vote',
  roleMiddleware(['STUDENT', 'TEACHER', 'STAFF']),
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
router.get(
  '/student/status',
  roleMiddleware(['STUDENT']),
  getStudentOsisJoinStatus,
);
router.post(
  '/student/requests',
  roleMiddleware(['STUDENT']),
  createStudentOsisJoinRequest,
);
router.post(
  '/student/vote',
  roleMiddleware(['STUDENT']),
  submitOsisElectionVote,
);

router.get('/periods', roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']), getOsisElectionPeriods);
router.get(
  '/periods/:id/quick-count',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']),
  getOsisElectionQuickCount,
);

router.get(
  '/management-periods',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']),
  getOsisManagementPeriods,
);
router.post(
  '/management-periods',
  roleMiddleware(['TEACHER', 'ADMIN']),
  createOsisManagementPeriod,
);
router.put(
  '/management-periods/:id',
  roleMiddleware(['TEACHER', 'ADMIN']),
  updateOsisManagementPeriod,
);
router.get(
  '/divisions',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']),
  getOsisDivisions,
);
router.post('/divisions', roleMiddleware(['TEACHER', 'ADMIN']), createOsisDivision);
router.put('/divisions/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateOsisDivision);
router.delete('/divisions/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteOsisDivision);
router.get(
  '/positions',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']),
  getOsisPositions,
);
router.post('/positions', roleMiddleware(['TEACHER', 'ADMIN']), createOsisPosition);
router.put('/positions/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateOsisPosition);
router.delete('/positions/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteOsisPosition);
router.get(
  '/memberships',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']),
  getOsisMemberships,
);
router.get(
  '/join-requests',
  roleMiddleware(['TEACHER', 'ADMIN', 'PRINCIPAL']),
  getOsisJoinRequests,
);
router.post('/memberships', roleMiddleware(['TEACHER', 'ADMIN']), createOsisMembership);
router.put('/memberships/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateOsisMembership);
router.delete('/memberships/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteOsisMembership);
router.put('/join-requests/:id/reject', roleMiddleware(['TEACHER', 'ADMIN']), rejectOsisJoinRequest);
router.get(
  '/grade-templates',
  roleMiddleware(['TEACHER', 'ADMIN']),
  getOsisGradeTemplates,
);
router.put(
  '/grade-templates',
  roleMiddleware(['TEACHER', 'ADMIN']),
  saveOsisGradeTemplates,
);
router.post(
  '/assessments',
  roleMiddleware(['TEACHER', 'ADMIN']),
  upsertOsisAssessment,
);

router.post('/periods', roleMiddleware(['TEACHER', 'ADMIN']), createOsisElectionPeriod);
router.put('/periods/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateOsisElectionPeriod);
router.post('/periods/:id/finalize', roleMiddleware(['TEACHER', 'ADMIN']), finalizeOsisElectionPeriod);
router.get('/eligible-students', roleMiddleware(['TEACHER', 'ADMIN']), getEligibleOsisStudents);
router.post('/periods/:id/candidates', roleMiddleware(['TEACHER', 'ADMIN']), createOsisElectionCandidate);
router.put('/candidates/:id', roleMiddleware(['TEACHER', 'ADMIN']), updateOsisElectionCandidate);
router.delete('/candidates/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteOsisElectionCandidate);

export default router;
