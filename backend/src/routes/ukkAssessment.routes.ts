import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { 
  upsertUKKAssessment, 
  getUKKAssessment, 
  getAssessmentsByExaminer 
} from '../controllers/ukkAssessment.controller';

const router = Router();

router.use(authMiddleware);

router.post('/', upsertUKKAssessment);
router.get('/detail', getUKKAssessment);
router.get('/examiner', getAssessmentsByExaminer);

export default router;
