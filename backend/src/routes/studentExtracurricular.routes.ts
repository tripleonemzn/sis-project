import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getMyExtracurricularEnrollment, enrollExtracurricular } from '../controllers/extracurricular.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['STUDENT']));

router.get('/my', getMyExtracurricularEnrollment);
router.post('/enroll', enrollExtracurricular);

export default router;
