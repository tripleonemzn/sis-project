import { Router } from 'express';
import { getNotifications, markAsRead } from '../controllers/notification.controller';
import { verifyJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyJWT);

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);

export default router;
