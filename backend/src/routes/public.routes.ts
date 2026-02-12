import { Router } from 'express';
import { getGallery } from '../controllers/gallery.controller';
import { getExtracurriculars } from '../controllers/extracurricular.controller';

const router = Router();

router.get('/foto-kegiatan', getGallery);
router.get('/extracurriculars', getExtracurriculars);

export default router;
