import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { ApiError } from '../utils/api';
import { resolveGalleryDir } from '../utils/galleryPath';
import {
  deleteGallerySlideAdmin,
  listGallerySlidesAdmin,
  reorderGallerySlidesAdmin,
  updateGallerySlideAdmin,
  uploadGallerySlideAdmin,
  updateGallerySettingsAdmin,
} from '../controllers/galleryAdmin.controller';

const router = Router();

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const baseDir = resolveGalleryDir();
      fs.mkdirSync(baseDir, { recursive: true });
      cb(null, baseDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      cb(null, `slide-${suffix}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImageMime = (file.mimetype || '').toLowerCase().startsWith('image/');
    const isAllowedExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (isImageMime && isAllowedExt) {
      cb(null, true);
      return;
    }
    cb(new ApiError(400, 'File slideshow harus berupa gambar JPG, JPEG, PNG, atau WEBP') as any);
  },
});

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/slides', listGallerySlidesAdmin);
router.post('/slides/upload', imageUpload.single('file'), uploadGallerySlideAdmin);
router.patch('/slides/reorder', reorderGallerySlidesAdmin);
router.patch('/slides/:id', updateGallerySlideAdmin);
router.delete('/slides/:id', deleteGallerySlideAdmin);
router.patch('/settings', updateGallerySettingsAdmin);

export default router;
