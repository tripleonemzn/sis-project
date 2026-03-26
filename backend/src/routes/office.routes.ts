import { Router } from 'express';
import {
  createOfficeLetter,
  getAdministrationSummary,
  getOfficeLetterSummary,
  listOfficeLetters,
} from '../controllers/office.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get(
  '/letters',
  roleMiddleware(['STAFF', 'PRINCIPAL', 'ADMIN']),
  listOfficeLetters,
);
router.post(
  '/letters',
  roleMiddleware(['STAFF', 'ADMIN']),
  createOfficeLetter,
);
router.get(
  '/summary',
  roleMiddleware(['STAFF', 'PRINCIPAL', 'ADMIN']),
  getOfficeLetterSummary,
);
router.get(
  '/administration-summary',
  roleMiddleware(['STAFF', 'PRINCIPAL', 'ADMIN']),
  getAdministrationSummary,
);

export default router;
