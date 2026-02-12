import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { getExtracurriculars, createExtracurricular, updateExtracurricular, deleteExtracurricular, getAssignments, assignTutor, removeAssignment } from '../controllers/extracurricular.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/assignments', getAssignments);
router.post('/assignments', assignTutor);
router.delete('/assignments/:id', removeAssignment);

router.get('/', getExtracurriculars);
router.post('/', createExtracurricular);
router.put('/:id', updateExtracurricular);
router.delete('/:id', deleteExtracurricular);

export default router;
