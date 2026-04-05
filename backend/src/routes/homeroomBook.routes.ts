import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  createHomeroomBookEntry,
  getHomeroomBookEntryDetail,
  listHomeroomBookEntries,
  updateHomeroomBookEntry,
  updateHomeroomBookEntryStatus,
} from '../controllers/homeroomBook.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['TEACHER', 'PRINCIPAL', 'ADMIN']));

router.get('/', listHomeroomBookEntries);
router.get('/:id', getHomeroomBookEntryDetail);
router.post('/', createHomeroomBookEntry);
router.put('/:id', updateHomeroomBookEntry);
router.patch('/:id/status', updateHomeroomBookEntryStatus);

export default router;
