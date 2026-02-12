import { Router } from 'express';
import { verifyJWT, verifyRole } from '../middlewares/auth.middleware';
import { 
  getInternshipDetail,
  getMyInternship, 
  applyInternship, 
  uploadReport,
  uploadAcceptanceLetter,
  getAllInternships,
  assignExaminer,
  scheduleDefense,
  gradeDefense,
  getExaminerInternships,
  getAssignedInternships,
  getJournals,
  createJournal,
  approveJournal,
  getAttendances,
  createAttendance,
  updateStatus,
  updateInternship,
  deleteInternship,
  printGroupLetter,
  getPrintLetterHtml,
  updateIndustryGrade,
  generateAccessCode,
  verifyAccessCode,
  submitIndustryGradeViaLink,
  updateMyInternship
} from '../controllers/internship.controller';
import {
  getComponents,
  createComponent,
  updateComponent,
  deleteComponent
} from '../controllers/internshipComponent.controller';

const router = Router();

// Public Routes (Magic Link)
router.get('/public/verify/:accessCode', verifyAccessCode);
router.post('/public/grade', submitIndustryGradeViaLink);

router.use(verifyJWT);

// Assessment Components Routes
router.get('/components', verifyRole(['ADMIN', 'TEACHER', 'EXAMINER']), getComponents);
router.post('/components', verifyRole(['ADMIN', 'TEACHER']), createComponent);
router.put('/components/:id', verifyRole(['ADMIN', 'TEACHER']), updateComponent);
router.delete('/components/:id', verifyRole(['ADMIN', 'TEACHER']), deleteComponent);

// Student Routes
router.get('/my-internship', verifyRole(['STUDENT']), getMyInternship);
router.post('/apply', verifyRole(['STUDENT']), applyInternship);
router.post('/:id/report', verifyRole(['STUDENT']), uploadReport);
router.put('/my-internship', verifyRole(['STUDENT']), updateMyInternship);
router.post('/:id/acceptance-letter', verifyRole(['STUDENT']), uploadAcceptanceLetter);
router.get('/:id/journals', verifyRole(['STUDENT', 'TEACHER', 'EXAMINER', 'ADMIN']), getJournals);
router.post('/:id/journals', verifyRole(['STUDENT']), createJournal);
router.get('/:id/attendances', verifyRole(['STUDENT', 'TEACHER', 'EXAMINER', 'ADMIN']), getAttendances);
router.post('/:id/attendances', verifyRole(['STUDENT']), createAttendance);

// Management Routes (Wakasek Humas / Admin)
router.get('/all', verifyRole(['ADMIN', 'TEACHER']), getAllInternships);
router.post('/print-group-letter', verifyRole(['ADMIN', 'TEACHER']), printGroupLetter);
router.patch('/:id/status', verifyRole(['ADMIN', 'TEACHER']), updateStatus);
router.put('/:id', verifyRole(['ADMIN', 'TEACHER']), updateInternship);
router.delete('/:id', verifyRole(['ADMIN', 'TEACHER']), deleteInternship);
router.post('/:id/print-letter', verifyRole(['ADMIN', 'TEACHER']), getPrintLetterHtml);
router.post('/:id/assign-examiner', verifyRole(['ADMIN', 'TEACHER']), assignExaminer);
router.post('/:id/schedule-defense', verifyRole(['ADMIN', 'TEACHER']), scheduleDefense);
router.patch('/:id/industry-grade', verifyRole(['ADMIN', 'TEACHER']), updateIndustryGrade);
router.post('/:id/access-code', verifyRole(['ADMIN', 'TEACHER']), generateAccessCode);

// Examiner Routes
router.get('/examiner', verifyRole(['EXAMINER', 'TEACHER', 'ADMIN']), getExaminerInternships);
router.get('/:id/detail', verifyRole(['ADMIN', 'TEACHER', 'EXAMINER']), getInternshipDetail);
router.post('/:id/grade-defense', verifyRole(['EXAMINER', 'TEACHER', 'ADMIN']), gradeDefense);

// Teacher Guidance Routes
router.get('/assigned', verifyRole(['TEACHER']), getAssignedInternships);
router.post('/journal/:journalId/approve', verifyRole(['TEACHER']), approveJournal);

export default router;
