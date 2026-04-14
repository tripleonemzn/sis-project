import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  changeOwnWebmailPassword,
  deleteWebmailInboxMessage,
  getWebmailConfig,
  getWebmailInboxMessageDetail,
  loginWebmailMailboxSession,
  listWebmailInboxMessages,
  logoutWebmailMailboxSession,
  markWebmailInboxMessageRead,
  markWebmailInboxMessageUnread,
  moveWebmailInboxMessage,
  registerWebmailMailbox,
  resetOwnWebmailPassword,
  sendWebmailInboxMessage,
  startWebmailSso,
} from '../controllers/webmail.controller';

const router = Router();

router.use(authMiddleware);
router.get('/config', getWebmailConfig);
router.post('/session/login', loginWebmailMailboxSession);
router.post('/session/logout', logoutWebmailMailboxSession);
router.get('/messages', listWebmailInboxMessages);
router.get('/messages/:guid', getWebmailInboxMessageDetail);
router.patch('/messages/:guid/read', markWebmailInboxMessageRead);
router.patch('/messages/:guid/unread', markWebmailInboxMessageUnread);
router.delete('/messages/:guid', deleteWebmailInboxMessage);
router.post('/messages/:guid/move', moveWebmailInboxMessage);
router.post('/messages/send', sendWebmailInboxMessage);
router.post('/register', registerWebmailMailbox);
router.post('/reset-password', resetOwnWebmailPassword);
router.post('/change-password', changeOwnWebmailPassword);
router.post('/sso/start', startWebmailSso);

export default router;
