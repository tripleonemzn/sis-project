import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getMonitoringMetrics, getServerInfo, getStorageOverview } from '../controllers/server.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/info', getServerInfo);
router.get('/storage', getStorageOverview);
router.get('/monitoring', getMonitoringMetrics);

export default router;

