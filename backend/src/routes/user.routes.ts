import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  verifyUsersBulk,
  listMyChildren,
  lookupMyChild,
  linkMyChild,
  unlinkMyChild,
  getMyProfilePrintSummary,
} from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/', getUsers);
router.get('/me/print-summary', getMyProfilePrintSummary);
router.get('/me/children', roleMiddleware(['PARENT']), listMyChildren);
router.get('/me/children/lookup', roleMiddleware(['PARENT']), lookupMyChild);
router.post('/me/children/link', roleMiddleware(['PARENT']), linkMyChild);
router.delete('/me/children/:childId', roleMiddleware(['PARENT']), unlinkMyChild);
router.get('/:id', getUserById);
router.put('/:id', updateUser);

// Routes requiring ADMIN role
router.use(roleMiddleware(['ADMIN']));

router.post('/', createUser);
router.post('/verify-bulk', verifyUsersBulk);
router.delete('/:id', deleteUser);

export default router;
