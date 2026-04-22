import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  generateExamCards,
  getHeadTuExamCardOverview,
  listMyGeneratedExamCards,
} from '../controllers/exam-card.controller';

const router = Router();

router.use(authMiddleware);

router.get('/my', roleMiddleware(['STUDENT']), listMyGeneratedExamCards);
router.get('/', roleMiddleware(['TEACHER', 'ADMIN']), getHeadTuExamCardOverview);
router.post('/generate', roleMiddleware(['TEACHER', 'ADMIN']), generateExamCards);

export default router;
