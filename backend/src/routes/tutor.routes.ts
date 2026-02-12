import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getTutorAssignments, getExtracurricularMembers, inputTutorGrade } from '../controllers/tutor.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['EXTRACURRICULAR_TUTOR']));

router.get('/assignments', getTutorAssignments);
router.get('/members', getExtracurricularMembers);
router.post('/grades', inputTutorGrade);

export default router;
