import { Router } from 'express';
import { 
    teacherDocumentUpload, 
    uploadTeacherDocument, 
    teacherPhotoUpload, 
    uploadTeacherPhoto, 
    uploadQuestionImage, 
    uploadQuestionVideo,
    questionImageUpload,
    questionVideoUpload,
    permissionUpload,
    uploadPermissionFile,
    internshipUpload,
    uploadInternshipFile
} from '../controllers/upload.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// Protect all upload routes
router.use(authMiddleware);

// Upload dokumen guru
router.post('/teacher/document', roleMiddleware(['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER']), teacherDocumentUpload.single('file'), uploadTeacherDocument);

// Upload foto profil guru (dan user lain)
router.post('/teacher/photo', roleMiddleware(['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER', 'STUDENT', 'PARENT']), teacherPhotoUpload.single('file'), uploadTeacherPhoto);

// Upload Media Soal (Guru & Admin)
router.post('/question-image', roleMiddleware(['TEACHER', 'ADMIN']), questionImageUpload.single('image'), uploadQuestionImage);
router.post('/question-video', roleMiddleware(['TEACHER', 'ADMIN']), questionVideoUpload.single('video'), uploadQuestionVideo);

// Upload File Izin (Siswa)
router.post('/permission', roleMiddleware(['STUDENT']), permissionUpload.single('file'), uploadPermissionFile);

// Upload File PKL (Siswa)
router.post('/internship', roleMiddleware(['STUDENT']), internshipUpload.single('file'), uploadInternshipFile);

export default router;
