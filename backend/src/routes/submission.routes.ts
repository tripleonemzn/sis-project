import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { submissionUpload } from '../utils/upload';
import {
  getSubmissions,
  getSubmissionById,
  submitAssignment,
  gradeSubmission
} from '../controllers/submission.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getSubmissions);
router.get('/:id', getSubmissionById);
router.post('/', roleMiddleware(['STUDENT']), submissionUpload.single('file'), submitAssignment);
router.put('/:id/grade', roleMiddleware(['TEACHER', 'ADMIN']), gradeSubmission);

export default router;
