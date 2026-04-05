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
router.get('/', roleMiddleware(['STAFF', 'ADMIN']), getHeadTuExamCardOverview);
router.post('/generate', roleMiddleware(['STAFF', 'ADMIN']), generateExamCards);

export default router;
