import { Router } from 'express';
import { getGallery, getGalleryImage } from '../controllers/gallery.controller';
import { getExtracurriculars } from '../controllers/extracurricular.controller';
import { verifyPublicProctorReport } from '../controllers/proctor.controller';
import { getPublicPklLetterQr, verifyPublicPklLetter } from '../controllers/internship.controller';
import { verifyPublicExamCard } from '../controllers/exam-card.controller';
import { verifyPublicProfilePrintSummary } from '../controllers/user.controller';
import { verifyPublicStudentSbtsReport } from '../controllers/report.controller';

const router = Router();

router.get('/foto-kegiatan', getGallery);
router.get('/foto-kegiatan/file', getGalleryImage);
router.get('/extracurriculars', getExtracurriculars);
router.get('/proctoring-reports/verify/:token', verifyPublicProctorReport);
router.get('/pkl-letters/verify/:token', verifyPublicPklLetter);
router.get('/pkl-letters/qr/:id', getPublicPklLetterQr);
router.get('/exam-cards/verify/:token', verifyPublicExamCard);
router.get('/report-cards/verify/:token', verifyPublicStudentSbtsReport);
router.get('/profile-summaries/verify/:token', verifyPublicProfilePrintSummary);

export default router;
