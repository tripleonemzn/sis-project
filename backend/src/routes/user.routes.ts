import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser, verifyUsersBulk } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/', getUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUser);

// Routes requiring ADMIN role
router.use(roleMiddleware(['ADMIN']));

router.post('/', createUser);
router.post('/verify-bulk', verifyUsersBulk);
router.delete('/:id', deleteUser);

export default router;
