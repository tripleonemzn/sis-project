import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import {
  getWebmailResetHistory,
  getMonitoringMetrics,
  getOnlineUsers,
  getServerInfo,
  getStorageOverview,
  resetWebmailMailboxPassword,
} from '../controllers/server.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/info', getServerInfo);
router.get('/storage', getStorageOverview);
router.get('/monitoring', getMonitoringMetrics);
router.get('/online-users', getOnlineUsers);
router.get('/webmail/reset-history', getWebmailResetHistory);
router.post('/webmail/reset-mailbox-password', resetWebmailMailboxPassword);

export default router;
