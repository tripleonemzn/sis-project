import { Request, Response } from 'express';
import { ApiResponse, asyncHandler, ApiError } from '../utils/api';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { optimizeQuestionImageAtPath } from '../utils/questionImageOptimizer';
import { optimizeQuestionVideoAtPath } from '../utils/questionVideoOptimizer';

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const QUESTION_VIDEO_MAX_MB = (() => {
  const raw = Number(process.env.QUESTION_VIDEO_MAX_MB || 12);
  if (!Number.isFinite(raw) || raw <= 0) return 12;
  return Math.floor(raw);
})();

const teacherDocumentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Gunakan path relative terhadap lokasi file kompilasi (dist/src/controllers)
    // backend/dist/src/controllers -> ../../../../uploads
    const uploadDir = path.resolve(__dirname, '../../../../uploads/teachers/documents');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const teacherPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/teachers/photos');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const profileEducationDocumentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/profile-education/documents');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const teacherDocumentUpload = multer({
  storage: teacherDocumentStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar dan PDF yang diperbolehkan!'));
    }
  },
});

export const teacherPhotoUpload = multer({
  storage: teacherPhotoStorage,
  limits: { fileSize: 500 * 1024 }, // 500KB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Foto profil harus berupa file gambar!'));
    }
  },
});

export const profileEducationDocumentUpload = multer({
  storage: profileEducationDocumentStorage,
  limits: { fileSize: 500 * 1024 },
  fileFilter: (req, file, cb) => {
    const normalizedMime = String(file.mimetype || '').toLowerCase();
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimeTypes.includes(normalizedMime)) {
      cb(null, true);
      return;
    }
    cb(new Error('Dokumen pendidikan hanya boleh berformat PDF, JPG, JPEG, atau PNG.'));
  },
});

const questionImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/questions/images');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const questionVideoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/questions/videos');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const permissionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/permissions');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const internshipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/internships');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const financeProofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../../../uploads/finance/proofs');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const questionImageUpload = multer({
  storage: questionImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan!'));
    }
  },
});

export const questionVideoUpload = multer({
  storage: questionVideoStorage,
  limits: { fileSize: QUESTION_VIDEO_MAX_MB * 1024 * 1024 }, // default 12MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file video yang diperbolehkan!'));
    }
  },
});

export const permissionUpload = multer({
  storage: permissionStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar dan PDF yang diperbolehkan!'));
    }
  },
});

export const internshipUpload = multer({
  storage: internshipStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar dan PDF yang diperbolehkan!'));
    }
  },
});

export const financeProofUpload = multer({
  storage: financeProofStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Bukti pembayaran harus berupa gambar atau PDF.'));
    }
  },
});

export const uploadTeacherDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file yang diunggah');
  }

  const fileUrl = `/api/uploads/teachers/documents/${req.file.filename}`;

  res.status(200).json(new ApiResponse(200, {
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype
  }, 'File dokumen guru berhasil diunggah'));
});

export const uploadTeacherPhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file yang diunggah');
  }

  const fileUrl = `/api/uploads/teachers/photos/${req.file.filename}`;

  res.status(200).json(new ApiResponse(200, {
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
  }, 'Foto profil guru berhasil diunggah'));
});

export const uploadProfileEducationDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file riwayat pendidikan yang diunggah');
  }

  const fileUrl = `/api/uploads/profile-education/documents/${req.file.filename}`;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        url: fileUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      'Dokumen riwayat pendidikan berhasil diunggah',
    ),
  );
});

export const uploadQuestionImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file gambar yang diunggah');
  }

  try {
    await optimizeQuestionImageAtPath(req.file.path);
  } catch (error) {
    console.warn('[UPLOAD_QUESTION_IMAGE_OPTIMIZE_FAILED]', req.file.path, error);
  }

  const fileUrl = `/api/uploads/questions/images/${req.file.filename}`;

  res.status(200).json(new ApiResponse(200, {
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype
  }));
});

export const uploadQuestionVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file video yang diunggah');
  }

  try {
    await optimizeQuestionVideoAtPath(req.file.path);
  } catch (error) {
    console.warn('[UPLOAD_QUESTION_VIDEO_OPTIMIZE_FAILED]', req.file.path, error);
  }

  const fileUrl = `/api/uploads/questions/videos/${req.file.filename}`;

  res.status(200).json(new ApiResponse(200, {
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype
  }));
});

export const uploadPermissionFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file yang diunggah');
  }

  const fileUrl = `/api/uploads/permissions/${req.file.filename}`;

  res.status(200).json(new ApiResponse(200, {
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype
  }, 'File izin berhasil diunggah'));
});

export const uploadInternshipFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada file yang diunggah');
  }

  const fileUrl = `/api/uploads/internships/${req.file.filename}`;

  res.status(200).json(new ApiResponse(200, {
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype
  }, 'File PKL berhasil diunggah'));
});

export const uploadFinanceProofFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Tidak ada bukti pembayaran yang diunggah');
  }

  const fileUrl = `/api/uploads/finance/proofs/${req.file.filename}`;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        url: fileUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      'Bukti pembayaran berhasil diunggah',
    ),
  );
});
