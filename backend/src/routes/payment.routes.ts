import { Router } from 'express';
import { listParentPayments } from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

router.use(authMiddleware);

router.get('/parent-overview', roleMiddleware(['PARENT']), listParentPayments);

export default router;
