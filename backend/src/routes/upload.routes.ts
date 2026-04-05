import { Router } from 'express';
import { 
    teacherDocumentUpload, 
    uploadTeacherDocument, 
    teacherPhotoUpload, 
    uploadTeacherPhoto, 
    profileEducationDocumentUpload,
    uploadProfileEducationDocument,
    uploadQuestionImage, 
    uploadQuestionVideo,
    questionImageUpload,
    questionVideoUpload,
    permissionUpload,
    uploadPermissionFile,
    financeProofUpload,
    uploadFinanceProofFile,
    internshipUpload,
    uploadInternshipFile,
    homeroomBookUpload,
    uploadHomeroomBookFile
} from '../controllers/upload.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';

const router = Router();

// Protect all upload routes
router.use(authMiddleware);

// Upload dokumen profil user
router.post('/teacher/document', roleMiddleware(['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER', 'CALON_SISWA']), teacherDocumentUpload.single('file'), uploadTeacherDocument);

// Upload foto profil guru (dan user lain)
router.post('/teacher/photo', roleMiddleware(['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER', 'STUDENT', 'PARENT', 'CALON_SISWA']), teacherPhotoUpload.single('file'), uploadTeacherPhoto);

// Upload dokumen riwayat pendidikan
router.post(
  '/profile-education/document',
  roleMiddleware(['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR', 'STUDENT', 'PARENT', 'CALON_SISWA', 'UMUM']),
  profileEducationDocumentUpload.single('file'),
  uploadProfileEducationDocument,
);

// Upload Media Soal (Guru & Admin)
router.post('/question-image', roleMiddleware(['TEACHER', 'ADMIN']), questionImageUpload.single('image'), uploadQuestionImage);
router.post('/question-video', roleMiddleware(['TEACHER', 'ADMIN']), questionVideoUpload.single('video'), uploadQuestionVideo);

// Upload File Izin (Siswa)
router.post('/permission', roleMiddleware(['STUDENT']), permissionUpload.single('file'), uploadPermissionFile);

// Upload Bukti Pembayaran (Siswa & Orang Tua)
router.post('/finance-proof', roleMiddleware(['STUDENT', 'PARENT']), financeProofUpload.single('file'), uploadFinanceProofFile);

// Upload File PKL (Siswa)
router.post('/internship', roleMiddleware(['STUDENT']), internshipUpload.single('file'), uploadInternshipFile);

// Upload Lampiran Buku Wali Kelas (Wali Kelas)
router.post('/homeroom-book', roleMiddleware(['TEACHER']), homeroomBookUpload.single('file'), uploadHomeroomBookFile);

export default router;
