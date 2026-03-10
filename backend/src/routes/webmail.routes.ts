import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getWebmailConfig, registerWebmailMailbox, startWebmailSso } from '../controllers/webmail.controller';

const router = Router();

router.use(authMiddleware);
router.get('/config', getWebmailConfig);
router.post('/register', registerWebmailMailbox);
router.post('/sso/start', startWebmailSso);

export default router;
