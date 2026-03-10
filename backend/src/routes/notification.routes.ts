import { Router } from 'express';
import { getNotifications, getUnreadNotificationCount, markAsRead } from '../controllers/notification.controller';
import { verifyJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyJWT);

router.get('/unread-count', getUnreadNotificationCount);
router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);

export default router;
