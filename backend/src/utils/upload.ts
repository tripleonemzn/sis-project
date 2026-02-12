import multer from 'multer';
import path from 'path';
import fs from 'fs';

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const createStorage = (subDir: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine the root of the project or uploads directory
    // Assuming backend is in /var/www/sis-project/backend
    // And uploads should be in /var/www/sis-project/uploads (outside backend)
    // process.cwd() is usually /var/www/sis-project/backend
    const uploadDir = path.join(process.cwd(), `../uploads/${subDir}`);
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Sanitize filename to prevent issues
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  },
});

export const assignmentUpload = multer({
  storage: createStorage('assignments'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const materialUpload = multer({
  storage: createStorage('materials'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export const submissionUpload = multer({
  storage: createStorage('submissions'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export const questionImageUpload = multer({
  storage: createStorage('questions/images'),
  limits: { fileSize: 500 * 1024 }, // 500KB
});

export const questionVideoUpload = multer({
  storage: createStorage('questions/videos'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export const permissionUpload = multer({
  storage: createStorage('permissions'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
