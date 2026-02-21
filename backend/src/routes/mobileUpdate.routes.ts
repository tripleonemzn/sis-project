import { Router } from 'express';
import {
  broadcastMobileUpdateNotification,
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from '../controllers/mobileUpdate.controller';
import { verifyJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/devices/register', verifyJWT, registerMobilePushDevice);
router.post('/devices/unregister', verifyJWT, unregisterMobilePushDevice);
router.post('/broadcast', broadcastMobileUpdateNotification);

export default router;
