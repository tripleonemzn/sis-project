import { Router } from 'express';
import {
  getAcademicEvents,
  createAcademicEvent,
  updateAcademicEvent,
  deleteAcademicEvent,
} from '../controllers/academicEvent.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/', getAcademicEvents);
router.post('/', createAcademicEvent);
router.put('/:id', updateAcademicEvent);
router.delete('/:id', deleteAcademicEvent);

export default router;

