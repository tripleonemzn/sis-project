import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import routes from './routes';
import path from 'path';
import { ZodError } from 'zod';
import { resolveGalleryDir } from './utils/galleryPath';
import { dispatchLibraryOverdueReminders } from './controllers/inventory.controller';
import { dispatchFinanceDueReminders } from './controllers/payment.controller';
import { startMailboxNotificationWorker } from './services/mailboxNotification.service';
import { broadcastMutationEvent, initializeRealtimeGateway } from './realtime/realtimeGateway';
import { verifyToken } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = String(process.env.HOST || '').trim();

const SKIP_REALTIME_MUTATION_PATTERNS: RegExp[] = [
  /^\/api\/exams\/\d+\/answers$/,
];

function shouldSkipRealtimeMutation(pathname: string) {
  return SKIP_REALTIME_MUTATION_PATTERNS.some((pattern) => pattern.test(pathname));
}

app.use(cors());
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
app.use(
  compression({
    threshold: 1024,
    level: 6,
    filter: (req, res) => {
      const path = String(req.path || '');
      if (path.startsWith('/api/uploads/')) return false;
      return compression.filter(req, res);
    },
  }),
);
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
    if (shouldSkipRealtimeMutation(normalizedPath)) return;

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
const shouldServeUploadsFromExpress =
  process.env.NODE_ENV !== 'production' || process.env.SERVE_UPLOADS_FROM_EXPRESS === 'true';

if (shouldServeUploadsFromExpress) {
  app.use(
    '/api/uploads',
    express.static(uploadsDir, {
      maxAge: '30d',
      immutable: true,
      etag: true,
      lastModified: true,
    }),
  );
}

app.use('/api', (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  const isWriteMethod = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (!isWriteMethod) {
    next();
    return;
  }

  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.isDemo) {
      res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Akun demo hanya memiliki akses baca.',
        errors: [],
      });
      return;
    }
  } catch (error) {}

  next();
});

// Routes
app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('SIS Backend is running');
});

import { MulterError } from 'multer';

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maybeQuestionVideoLimitMb = Number(process.env.QUESTION_VIDEO_MAX_MB || 12);
      const normalizedQuestionVideoLimitMb =
        Number.isFinite(maybeQuestionVideoLimitMb) && maybeQuestionVideoLimitMb > 0
          ? Math.floor(maybeQuestionVideoLimitMb)
          : 12;
      const isQuestionVideoUploadPath = String(req.originalUrl || req.url || '').includes('/api/upload/question-video');
      const isSlideshowUploadPath = String(req.originalUrl || req.url || '').includes('/api/gallery/slides/upload');
      const limitHint = isQuestionVideoUploadPath
        ? `Ukuran video soal terlalu besar (maksimal ${normalizedQuestionVideoLimitMb}MB). Untuk video lebih besar gunakan link YouTube.`
        : isSlideshowUploadPath
          ? 'Ukuran file slideshow terlalu besar (maksimal 1MB)'
          : 'Ukuran file terlalu besar (maksimal 5MB)';
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: limitHint,
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

  const isZodValidationError =
    err instanceof ZodError ||
    (err?.name === 'ZodError' && Array.isArray(err?.errors));

  if (isZodValidationError) {
    const zodErrors = Array.isArray(err?.errors) ? err.errors : [];
    const firstMessage = zodErrors[0]?.message || 'Validasi input gagal';
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: firstMessage,
      errors: zodErrors,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Kesalahan Server Internal";
  if (statusCode >= 500) {
    console.error('[ERROR]', err);
  }
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
  });
});

const server = createServer(app);
initializeRealtimeGateway(server);

server.listen(Number(PORT), HOST || undefined, () => {
  console.log(`Server is running on ${HOST || '0.0.0.0'}:${PORT}`);

  const reminderIntervalMinutes = Number(process.env.LIBRARY_OVERDUE_REMINDER_INTERVAL_MINUTES || '15');
  const appInstance = String(process.env.NODE_APP_INSTANCE || '').trim();
  const shouldRunReminderWorker = appInstance === '' || appInstance === '0';

  if (Number.isFinite(reminderIntervalMinutes) && reminderIntervalMinutes > 0 && shouldRunReminderWorker) {
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
  } else if (!shouldRunReminderWorker) {
    console.log(`[LIBRARY_OVERDUE_REMINDER] Worker nonaktif pada instance ${appInstance}`);
  }

  const financeReminderIntervalMinutes = Number(
    process.env.FINANCE_DUE_REMINDER_INTERVAL_MINUTES || '60',
  );

  if (
    Number.isFinite(financeReminderIntervalMinutes) &&
    financeReminderIntervalMinutes > 0 &&
    shouldRunReminderWorker
  ) {
    const intervalMs = Math.floor(financeReminderIntervalMinutes * 60 * 1000);

    const runFinanceReminderWorker = async () => {
      try {
        await dispatchFinanceDueReminders({
          mode: 'ALL',
          preview: false,
        });
      } catch (error) {
        console.error('[FINANCE_DUE_REMINDER_ERROR]', error);
      }
    };

    // Run once on boot and continue periodically.
    void runFinanceReminderWorker();
    setInterval(() => {
      void runFinanceReminderWorker();
    }, intervalMs);

    console.log(
      `[FINANCE_DUE_REMINDER] Worker aktif setiap ${financeReminderIntervalMinutes} menit (policy reminder finance dinamis)`,
    );
  } else if (!shouldRunReminderWorker) {
    console.log(`[FINANCE_DUE_REMINDER] Worker nonaktif pada instance ${appInstance}`);
  }

  if (shouldRunReminderWorker) {
    startMailboxNotificationWorker();
  } else {
    console.log(`[MAILBOX_NOTIFICATION] Worker nonaktif pada instance ${appInstance}`);
  }
});
