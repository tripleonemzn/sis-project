import { Router } from 'express';
import { getPermissions, requestPermission, updatePermissionStatus } from '../controllers/permission.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/', getPermissions);
router.post('/', roleMiddleware(['STUDENT']), requestPermission);
router.patch('/:id/status', roleMiddleware(['TEACHER', 'ADMIN']), updatePermissionStatus);

export default router;
