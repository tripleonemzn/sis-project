import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkAiStatus, analyzeCp } from '../controllers/ai.controller';

const router = Router();

// Public check for UI toggle
router.get('/status', checkAiStatus);

// Protected routes
router.use(authMiddleware);
router.post('/analyze-cp', analyzeCp);

export default router;
