import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  getTrainingClasses,
  getTrainingClassById,
  createTrainingClass,
  updateTrainingClass,
  deleteTrainingClass,
  addTrainingParticipant,
  removeTrainingParticipant,
} from '../controllers/trainingClass.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/', getTrainingClasses);
router.get('/:id', getTrainingClassById);
router.post('/', createTrainingClass);
router.put('/:id', updateTrainingClass);
router.delete('/:id', deleteTrainingClass);
router.post('/:id/participants', addTrainingParticipant);
router.delete('/:id/participants/:enrollmentId', removeTrainingParticipant);

export default router;
