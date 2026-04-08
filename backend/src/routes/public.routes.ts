import { Router } from 'express';
import { getGallery, getGalleryImage } from '../controllers/gallery.controller';
import { getExtracurriculars } from '../controllers/extracurricular.controller';
import { verifyPublicProctorReport } from '../controllers/proctor.controller';
import { verifyPublicExamCard } from '../controllers/exam-card.controller';

const router = Router();

router.get('/foto-kegiatan', getGallery);
router.get('/foto-kegiatan/file', getGalleryImage);
router.get('/extracurriculars', getExtracurriculars);
router.get('/proctoring-reports/verify/:token', verifyPublicProctorReport);
router.get('/exam-cards/verify/:token', verifyPublicExamCard);

export default router;
