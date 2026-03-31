import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getWebmailConfig,
  getWebmailInboxMessageDetail,
  listWebmailInboxMessages,
  markWebmailInboxMessageRead,
  registerWebmailMailbox,
  sendWebmailInboxMessage,
  startWebmailSso,
} from '../controllers/webmail.controller';

const router = Router();

router.use(authMiddleware);
router.get('/config', getWebmailConfig);
router.get('/messages', listWebmailInboxMessages);
router.get('/messages/:guid', getWebmailInboxMessageDetail);
router.patch('/messages/:guid/read', markWebmailInboxMessageRead);
router.post('/messages/send', sendWebmailInboxMessage);
router.post('/register', registerWebmailMailbox);
router.post('/sso/start', startWebmailSso);

export default router;
