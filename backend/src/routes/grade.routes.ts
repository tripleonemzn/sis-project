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

// STUDENT GRADES (Input Nilai per Komponen)
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
