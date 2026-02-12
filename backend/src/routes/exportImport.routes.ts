import { Router } from 'express';
import multer from 'multer';
import {
  exportTeachers,
  importTeachers,
  exportStudents,
  importStudents,
  exportParents,
  importParents,
} from '../controllers/exportImport.controller';
import { authMiddleware } from '../middleware/auth';
import { roleMiddleware } from '../middleware/role';
import fs from 'fs';

const router = Router();

// Ensure temp directory exists
const tempDir = 'uploads/temp/';
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ dest: tempDir });

// All routes require authentication and ADMIN role
router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

// Teachers
router.get('/teachers/export', exportTeachers);
router.post('/teachers/import', upload.single('file'), importTeachers);

// Students
router.get('/students/export', exportStudents);
router.post('/students/import', upload.single('file'), importStudents);

// Parents
router.get('/parents/export', exportParents);
router.post('/parents/import', upload.single('file'), importParents);

export default router;
