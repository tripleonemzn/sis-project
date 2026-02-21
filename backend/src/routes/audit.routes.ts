import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getAuditLogs } from '../controllers/audit.controller';

const router = Router();

router.use(authMiddleware);
router.get('/logs', roleMiddleware(['ADMIN', 'TEACHER']), getAuditLogs);

export default router;
