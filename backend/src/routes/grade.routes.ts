import { Router } from 'express';
import * as gradeController from '../controllers/grade.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { asyncHandler } from '../utils/api';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GRADE COMPONENTS
router.get(
  '/components',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.getGradeComponents)
);

router.get(
  '/homeroom-result-publications',
  roleMiddleware(['TEACHER']),
  asyncHandler(gradeController.getHomeroomResultPublications)
);

router.put(
  '/homeroom-result-publications',
  roleMiddleware(['TEACHER']),
  asyncHandler(gradeController.updateHomeroomResultPublication)
);

// REMEDIAL NILAI
router.get(
  '/remedials/eligible',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.getRemedialEligibleScores)
);

router.get(
  '/remedials',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.getScoreRemedials)
);

router.post(
  '/remedials',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.createScoreRemedial)
);

router.post(
  '/remedials/bulk-activities',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.createBulkScoreRemedialActivities)
);

router.get(
  '/remedials/student-activities',
  roleMiddleware(['STUDENT']),
  asyncHandler(gradeController.getStudentRemedialActivities)
);

router.get(
  '/remedials/student-activities/:id/start',
  roleMiddleware(['STUDENT']),
  asyncHandler(gradeController.startStudentRemedialActivity)
);

router.post(
  '/remedials/student-activities/:id/answers',
  roleMiddleware(['STUDENT']),
  asyncHandler(gradeController.submitStudentRemedialActivityAnswers)
);

// STUDENT GRADES (Input Nilai per Komponen)
router.get(
  '/student-overview',
  roleMiddleware(['STUDENT']),
  asyncHandler(gradeController.getStudentGradeOverview)
);

router.get(
  '/student-grades',
  roleMiddleware(['ADMIN', 'TEACHER', 'STUDENT']),
  asyncHandler(gradeController.getStudentGrades)
);

router.post(
  '/student-grades',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.createOrUpdateStudentGrade)
);

router.post(
  '/student-grades/bulk',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.bulkCreateOrUpdateStudentGrades)
);

// REPORT GRADES (Nilai Raport)
router.post(
  '/report-grades/generate',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.generateReportGrades)
);

router.get(
  '/report-grades',
  roleMiddleware(['ADMIN', 'TEACHER', 'STUDENT']),
  asyncHandler(gradeController.getReportGrades)
);

router.put(
  '/report-grades/:id',
  roleMiddleware(['ADMIN', 'TEACHER']),
  asyncHandler(gradeController.updateReportGrade)
);

// REPORT CARD (Full Report)
router.get(
  '/report-card',
  roleMiddleware(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
  asyncHandler(gradeController.getStudentReportCard)
);

export default router;
