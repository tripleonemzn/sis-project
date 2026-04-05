import { Router } from 'express';
import { getGallery, getGalleryImage } from '../controllers/gallery.controller';
import { getExtracurriculars } from '../controllers/extracurricular.controller';
import { verifyPublicProctorReport } from '../controllers/proctor.controller';

const router = Router();

router.get('/foto-kegiatan', getGallery);
router.get('/foto-kegiatan/file', getGalleryImage);
router.get('/extracurriculars', getExtracurriculars);
router.get('/proctoring-reports/verify/:token', verifyPublicProctorReport);

export default router;
