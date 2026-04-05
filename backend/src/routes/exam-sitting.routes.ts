import { Router } from 'express';
import { 
    createExamSitting, 
    getExamSittings, 
    getAssignedSittingStudents,
    getMyExamSitting,
    getExamSittingDetail, 
    updateExamSitting,
    updateSittingStudents,
    deleteSitting
} from '../controllers/exam-sitting.controller';
import {
    generateExamSittingLayout,
    getExamSittingLayout,
    updateExamSittingLayout,
} from '../controllers/exam-sitting-layout.controller';
import { verifyJWT as authenticate, verifyRole as authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// List and Create
router.get('/', getExamSittings);
router.get('/assigned-students', getAssignedSittingStudents);
router.get('/my-sitting', getMyExamSitting);
router.post('/', authorize(['ADMIN', 'TEACHER']), createExamSitting);

// Detail and Update
router.get('/:id', getExamSittingDetail);
router.get('/:id/layout', authorize(['ADMIN', 'TEACHER']), getExamSittingLayout);
router.post('/:id/layout/generate', authorize(['ADMIN', 'TEACHER']), generateExamSittingLayout);
router.put('/:id/layout', authorize(['ADMIN', 'TEACHER']), updateExamSittingLayout);
router.put('/:id', authorize(['ADMIN', 'TEACHER']), updateExamSitting);
router.put('/:id/students', authorize(['ADMIN', 'TEACHER']), updateSittingStudents);
router.delete('/:id', authorize(['ADMIN', 'TEACHER']), deleteSitting);

export default router;
