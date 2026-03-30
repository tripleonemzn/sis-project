import { Router } from 'express';
import {
  broadcastMobileUpdateNotification,
  getMyMobilePushDevices,
  registerMobilePushDevice,
  testMyMobilePushDevice,
  unregisterMobilePushDevice,
} from '../controllers/mobileUpdate.controller';
import { verifyJWT } from '../middlewares/auth.middleware';

const router = Router();

router.get('/devices/me', verifyJWT, getMyMobilePushDevices);
router.post('/devices/register', verifyJWT, registerMobilePushDevice);
router.post('/devices/unregister', verifyJWT, unregisterMobilePushDevice);
router.post('/devices/test-self', verifyJWT, testMyMobilePushDevice);
router.post('/broadcast', broadcastMobileUpdateNotification);

export default router;
