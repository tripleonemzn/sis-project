import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import routes from './routes';
import path from 'path';
import { resolveGalleryDir } from './utils/galleryPath';
import { dispatchLibraryOverdueReminders } from './controllers/inventory.controller';
import { broadcastMutationEvent, initializeRealtimeGateway } from './realtime/realtimeGateway';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json());

app.use((req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  const shouldEmit = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  if (!shouldEmit) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const normalizedPath = String(req.originalUrl || req.url || '').split('?')[0] || '';
    if (!normalizedPath.startsWith('/api')) return;
    if (normalizedPath.startsWith('/api/realtime')) return;

    broadcastMutationEvent({
      method,
      path: normalizedPath,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

// Serve static files for public gallery "foto_kegiatan"
const fotoKegiatanDir = resolveGalleryDir();
app.use('/foto_kegiatan', express.static(fotoKegiatanDir));
app.use('/api/foto_kegiatan', express.static(fotoKegiatanDir));

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

const server = createServer(app);
initializeRealtimeGateway(server);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  const reminderIntervalMinutes = Number(process.env.LIBRARY_OVERDUE_REMINDER_INTERVAL_MINUTES || '15');
  if (Number.isFinite(reminderIntervalMinutes) && reminderIntervalMinutes > 0) {
    const intervalMs = Math.floor(reminderIntervalMinutes * 60 * 1000);

    const runReminderWorker = async () => {
      try {
        await dispatchLibraryOverdueReminders();
      } catch (error) {
        console.error('[LIBRARY_OVERDUE_REMINDER_ERROR]', error);
      }
    };

    // Run once on boot and continue periodically.
    void runReminderWorker();
    setInterval(() => {
      void runReminderWorker();
    }, intervalMs);

    console.log(`[LIBRARY_OVERDUE_REMINDER] Worker aktif setiap ${reminderIntervalMinutes} menit`);
  }
});
