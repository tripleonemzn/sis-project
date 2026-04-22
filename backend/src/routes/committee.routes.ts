import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createCommitteeAssignment,
  createCommitteeEvent,
  deleteCommitteeAssignment,
  getCommitteeEventDetail,
  getCommitteeMeta,
  getCommitteeWorkspace,
  getMyCommitteeSidebar,
  issueCommitteeSk,
  listCommitteeEvents,
  reviewCommitteeEventAsPrincipal,
  submitCommitteeEvent,
  updateCommitteeAssignment,
  updateCommitteeEvent,
  updateCommitteeLifecycle,
} from '../controllers/committee.controller';

const router = Router();

router.use(authMiddleware);

router.get('/meta', getCommitteeMeta);
router.get('/my-sidebar', getMyCommitteeSidebar);
router.get('/', listCommitteeEvents);
router.post('/', createCommitteeEvent);
router.get('/:id', getCommitteeEventDetail);
router.put('/:id', updateCommitteeEvent);
router.post('/:id/submit', submitCommitteeEvent);
router.post('/:id/principal-decision', reviewCommitteeEventAsPrincipal);
router.post('/:id/issue-sk', issueCommitteeSk);
router.post('/:id/lifecycle', updateCommitteeLifecycle);
router.get('/:id/workspace', getCommitteeWorkspace);
router.post('/:id/assignments', createCommitteeAssignment);
router.put('/:id/assignments/:assignmentId', updateCommitteeAssignment);
router.delete('/:id/assignments/:assignmentId', deleteCommitteeAssignment);

export default router;
