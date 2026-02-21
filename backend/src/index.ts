import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import routes from './routes';
import path from 'path';
import { resolveGalleryDir } from './utils/galleryPath';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json());

// Serve static files for public gallery "foto_kegiatan"
const fotoKegiatanDir = resolveGalleryDir();
app.use('/foto_kegiatan', express.static(fotoKegiatanDir));

// Serve uploads directory
const uploadsDir = path.resolve(process.cwd(), '../uploads');
app.use('/api/uploads', express.static(uploadsDir));

// Routes
app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('SIS Backend is running');
});

import { MulterError } from 'multer';

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Ukuran file terlalu besar (maksimal 5MB)',
        errors: []
      });
    }
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: err.message,
      errors: []
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Kesalahan Server Internal";
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
