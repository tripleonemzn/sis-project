import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createTutorInventoryItem,
  getTutorAttendanceOverview,
  getTutorAssignments,
  getExtracurricularMembers,
  getTutorGradeTemplates,
  getTutorInventoryOverview,
  inputTutorGrade,
  saveTutorAttendanceConfig,
  saveTutorAttendanceRecords,
  saveTutorGradeTemplates,
} from '../controllers/tutor.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['EXTRACURRICULAR_TUTOR']));

router.get('/assignments', getTutorAssignments);
router.get('/members', getExtracurricularMembers);
router.post('/grades', inputTutorGrade);
router.get('/grade-templates', getTutorGradeTemplates);
router.put('/grade-templates', saveTutorGradeTemplates);
router.get('/attendance', getTutorAttendanceOverview);
router.put('/attendance/config', saveTutorAttendanceConfig);
router.put('/attendance/records', saveTutorAttendanceRecords);
router.get('/inventory-overview', getTutorInventoryOverview);
router.post('/inventory-items', createTutorInventoryItem);

export default router;
