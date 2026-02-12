import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import { materialUpload } from '../utils/upload';
import {
  getMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  copyMaterial
} from '../controllers/material.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getMaterials);
router.get('/:id', getMaterialById);
router.post('/', roleMiddleware(['TEACHER', 'ADMIN']), materialUpload.single('file'), createMaterial);
router.post('/:id/copy', roleMiddleware(['TEACHER', 'ADMIN']), copyMaterial);
router.put('/:id', roleMiddleware(['TEACHER', 'ADMIN']), materialUpload.single('file'), updateMaterial);
router.delete('/:id', roleMiddleware(['TEACHER', 'ADMIN']), deleteMaterial);

export default router;
