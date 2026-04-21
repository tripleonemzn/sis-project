import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { generateToken } from '../middleware/auth';
import { z } from 'zod';
import { getNisnValidationMessage, normalizeNisnInput } from '../utils/nisn';
import { mergeParentRegistrationRequest } from '../utils/publicRegistration';
import { sendWebmailMessage } from '../services/webmailMailbox.service';
import { activateCandidateAsOfficialStudent } from '../services/candidateStudentActivation.service';
import {
  CandidateAdmissionStatus,
  Role,
  VerificationStatus,
  VerificationMethod,
} from '@prisma/client';

const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.nativeEnum(Role),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const SELF_SERVICE_PUBLIC_ROLES = new Set<Role>([Role.PARENT, Role.CALON_SISWA, Role.UMUM]);
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_SUCCESS_MESSAGE =
  'Jika data akun cocok, link reset password sudah dikirim ke email terdaftar. Periksa inbox atau folder spam.';
const passwordResetRequestCooldown = new Map<string, number>();

const optionalEmailSchema = z
  .string()
  .email('Format email tidak valid')
  .or(z.literal(''))
  .optional()
  .transform((value) => {
    const normalized = String(value || '').trim();
    return normalized.length > 0 ? normalized : undefined;
  });

const optionalPhoneSchema = z
  .string()
  .min(8, 'Nomor HP minimal 8 digit')
  .or(z.literal(''))
  .optional()
  .transform((value) => {
    const normalized = String(value || '').trim();
    return normalized.length > 0 ? normalized : undefined;
  });

const nisnSchema = z
  .string()
  .transform((value) => normalizeNisnInput(value))
  .pipe(
    z.string().superRefine((value, ctx) => {
      const message = getNisnValidationMessage(value);
      if (message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
      }
    }),
  );

function isSelfServicePublicRole(role: Role): boolean {
  return SELF_SERVICE_PUBLIC_ROLES.has(role);
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNameComparisonValue(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeEmailComparisonValue(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePhoneComparisonValue(value?: string | null): string {
  return String(value || '').replace(/\D+/g, '');
}

function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function maskContactValue(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  if (normalized.includes('@')) {
    const [localPart, domainPart] = normalized.split('@');
    const safeLocalPart = localPart || '';
    const visibleLocal = safeLocalPart.slice(0, Math.min(2, safeLocalPart.length));
    return `${visibleLocal || '*'}***@${domainPart || '***'}`;
  }

  const digits = normalizePhoneComparisonValue(normalized);
  if (!digits) return null;
  if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFirstHeaderValue(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.length > 0) || '';
}

function resolvePublicAppBaseUrl(req: Request): string {
  const configuredBaseUrl = String(
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_BASE_URL || '',
  ).trim();

  if (configuredBaseUrl) {
    const normalized =
      /^https?:\/\//i.test(configuredBaseUrl) ? configuredBaseUrl : `https://${configuredBaseUrl}`;
    return normalized.replace(/\/+$/, '');
  }

  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']);
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || getFirstHeaderValue(req.headers.host);
  if (host) {
    const protocol = forwardedProto || req.protocol || 'https';
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }

  return 'https://siskgb2.id';
}

function resolvePasswordResetSenderMailbox(): string {
  const configuredSender = String(
    process.env.AUTH_RESET_SENDER_MAILBOX || process.env.WEBMAIL_FORCE_MAILBOX || '',
  )
    .trim()
    .toLowerCase();
  if (configuredSender) return configuredSender;

  const defaultDomain = String(process.env.WEBMAIL_DEFAULT_DOMAIN || 'siskgb2.id')
    .trim()
    .toLowerCase();
  return `info@${defaultDomain || 'siskgb2.id'}`;
}

function resolvePasswordResetSenderName(): string {
  return String(process.env.AUTH_RESET_SENDER_NAME || 'Sistem Integrasi Sekolah').trim();
}

function buildPasswordResetLink(req: Request, token: string): string {
  const url = new URL('/login', resolvePublicAppBaseUrl(req));
  url.searchParams.set('resetToken', token);
  return url.toString();
}

function formatPasswordResetExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(expiresAt);
}

function buildPasswordResetEmailContent(params: {
  name: string;
  resetLink: string;
  expiresAt: Date;
}) {
  const safeName = params.name.trim() || 'Pengguna';
  const formattedExpiry = formatPasswordResetExpiry(params.expiresAt);
  const subject = 'Reset password akun SIS KGB2';
  const plainText = [
    `Halo ${safeName},`,
    '',
    'Kami menerima permintaan reset password untuk akun Sistem Integrasi Sekolah.',
    `Link berikut berlaku sampai ${formattedExpiry} WIB:`,
    params.resetLink,
    '',
    'Jika Anda tidak merasa meminta reset password, abaikan email ini. Password lama Anda tidak akan berubah sampai Anda menyimpan password baru melalui link di atas.',
    '',
    'Salam,',
    'Tim Sistem Integrasi Sekolah',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f8ff;padding:32px 16px;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(148,163,184,0.22);border-radius:24px;overflow:hidden;box-shadow:0 20px 45px rgba(15,23,42,0.08);">
        <div style="padding:28px 28px 20px;background:linear-gradient(135deg,#173a88 0%,#2b5fad 55%,#1e8da4 100%);color:#ffffff;">
          <p style="margin:0;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;opacity:0.8;">Pemulihan Akun</p>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.25;">Reset password SIS KGB2</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;">Halo ${escapeHtml(safeName)},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;">
            Kami menerima permintaan reset password untuk akun Sistem Integrasi Sekolah. Klik tombol di bawah ini untuk membuat password baru.
          </p>
          <div style="margin:24px 0;">
            <a href="${escapeHtml(params.resetLink)}" style="display:inline-block;background:#173a88;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:14px;">
              Buka halaman reset password
            </a>
          </div>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#475569;">
            Link ini berlaku sampai <strong>${escapeHtml(formattedExpiry)} WIB</strong>.
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569;">
            Jika tombol tidak bisa dibuka, salin link berikut ke browser:
          </p>
          <p style="margin:0 0 18px;padding:14px;border-radius:14px;background:#eff6ff;font-size:13px;line-height:1.7;word-break:break-all;color:#1e3a8a;">
            ${escapeHtml(params.resetLink)}
          </p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">
            Jika Anda tidak meminta reset password, abaikan email ini. Password lama Anda tidak akan berubah tanpa tindakan lanjutan.
          </p>
        </div>
      </div>
    </div>
  `.trim();

  return {
    subject,
    plainText,
    html,
  };
}

function pruneExpiredPasswordResetCooldowns(now = Date.now()) {
  passwordResetRequestCooldown.forEach((expiresAt, key) => {
    if (expiresAt <= now) {
      passwordResetRequestCooldown.delete(key);
    }
  });
}

function getPasswordResetCooldownKey(req: Request, username: string, email: string): string {
  const forwardedFor = getFirstHeaderValue(req.headers['x-forwarded-for']);
  const ipAddress = forwardedFor || String(req.ip || '').trim() || 'unknown';
  return [
    String(username || '').trim().toLowerCase(),
    normalizeEmailComparisonValue(email),
    ipAddress,
  ].join('|');
}

function reservePasswordResetRequest(req: Request, username: string, email: string) {
  const now = Date.now();
  pruneExpiredPasswordResetCooldowns(now);

  const key = getPasswordResetCooldownKey(req, username, email);
  const expiresAt = passwordResetRequestCooldown.get(key) || 0;
  if (expiresAt > now) {
    const waitSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
    throw new ApiError(429, `Tunggu ${waitSeconds} detik sebelum meminta link reset lagi.`);
  }

  passwordResetRequestCooldown.set(key, now + PASSWORD_RESET_REQUEST_COOLDOWN_MS);
}

function buildCandidateRegistrationNumber(userId: number, createdAt = new Date()): string {
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  return `PPDB-${year}${month}${day}-${String(userId).padStart(6, '0')}`;
}

async function ensureUsernameAvailable(username: string) {
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    throw new ApiError(400, 'Username sudah digunakan');
  }
}

async function createPublicUserAccount(params: {
  username: string;
  password: string;
  name: string;
  role: 'PARENT' | 'UMUM';
  phone?: string;
  email?: string;
  preferences?: any;
}) {
  await ensureUsernameAvailable(params.username);

  const hashedPassword = await bcrypt.hash(params.password, 10);

  return prisma.user.create({
    data: {
      username: params.username,
      password: hashedPassword,
      name: params.name,
      role: params.role,
      phone: normalizeOptionalText(params.phone),
      email: normalizeOptionalText(params.email),
      preferences: params.preferences,
      verificationMethod: VerificationMethod.NONE,
      verificationStatus: VerificationStatus.PENDING,
    },
  });
}

function normalizeDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

const getConfiguredDemoUsernames = () => {
  const raw = String(process.env.DEMO_USERNAMES || 'demo,demo_staff,siswa_demo,ortu_demo');
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
};

const isDemoAccount = (username?: string | null) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername) return false;
  const configured = getConfiguredDemoUsernames();
  return configured.includes(normalizedUsername);
};

const ME_CACHE_TTL_MS = 5000;
const meResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();

function buildMeCacheKey(userId: number, isDemo: boolean): string {
  return `${userId}:${isDemo ? 'demo' : 'real'}`;
}

function getMeCache(key: string): unknown | null {
  const now = Date.now();
  const cached = meResponseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    meResponseCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setMeCache(key: string, payload: unknown) {
  meResponseCache.set(key, {
    payload,
    expiresAt: Date.now() + ME_CACHE_TTL_MS,
  });
}

export function clearMeCacheForUser(userId: number) {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
    return;
  }
  meResponseCache.delete(buildMeCacheKey(normalizedUserId, false));
  meResponseCache.delete(buildMeCacheKey(normalizedUserId, true));
}

const activeTutorAssignmentsInclude = {
  ekskulTutorAssignments: {
    where: {
      isActive: true,
      academicYear: {
        isActive: true,
      },
    },
    select: {
      id: true,
      tutorId: true,
      ekskulId: true,
      academicYearId: true,
      isActive: true,
      ekskul: {
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
        },
      },
      academicYear: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
  },
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);

  await ensureUsernameAvailable(body.username);

  const hashedPassword = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.create({
    data: {
      username: body.username,
      password: hashedPassword,
      name: body.name,
      role: body.role,
      verificationMethod: VerificationMethod.NONE,
      verificationStatus: VerificationStatus.PENDING,
    },
  });

  const { password, ...userWithoutPassword } = user;

  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Pengguna berhasil didaftarkan'));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      teacherClasses: { select: { id: true, name: true } },
      trainingClassesTeaching: { select: { id: true, name: true } },
      managedMajors: { select: { id: true, name: true, code: true } },
      examinerMajor: { select: { id: true, name: true, code: true } },
      studentClass: {
        select: {
          id: true,
          name: true,
          presidentId: true,
          major: { select: { id: true, name: true, code: true } },
        },
      },
      managedInventoryRooms: {
        select: {
          id: true,
          name: true,
          managerUserId: true,
        },
        orderBy: { name: 'asc' },
      },
      children: { select: { id: true, name: true, username: true, nisn: true } },
      documents: true,
      ...activeTutorAssignmentsInclude,
    },
  });

  if (!user) {
    throw new ApiError(401, 'Username atau password salah');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Username atau password salah');
  }

  if (
    user.verificationStatus !== VerificationStatus.VERIFIED &&
    !isSelfServicePublicRole(user.role)
  ) {
    throw new ApiError(403, 'Akun belum diverifikasi oleh admin');
  }

  const isDemo = isDemoAccount(user.username);
  const token = generateToken({ id: user.id, role: user.role, isDemo });

  const { password: _, ...userWithoutPassword } = user;
  const responseUser = { ...userWithoutPassword, isDemo };

  res.status(200).json(
    new ApiResponse(200, { user: responseUser, token }, 'Login berhasil')
  );
});

export const getMe = asyncHandler(async (req: any, res: Response) => {
  const requestIsDemo = Boolean(req.user?.isDemo);
  const cacheKey = buildMeCacheKey(req.user.id, requestIsDemo);
  const cachedPayload = getMeCache(cacheKey);
  if (cachedPayload) {
    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.status(200).json(new ApiResponse(200, cachedPayload, 'Profil pengguna berhasil diambil'));
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      teacherClasses: {
        select: { id: true, name: true },
      },
      trainingClassesTeaching: {
        select: { id: true, name: true },
      },
      managedMajors: {
        select: { id: true, name: true, code: true },
      },
      examinerMajor: {
        select: { id: true, name: true, code: true },
      },
      studentClass: {
        select: {
          id: true,
          name: true,
          presidentId: true,
          major: { select: { id: true, name: true, code: true } },
        },
      },
      managedInventoryRooms: {
        select: {
          id: true,
          name: true,
          managerUserId: true,
        },
        orderBy: { name: 'asc' },
      },
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nisn: true,
        },
      },
      documents: true,
      ...activeTutorAssignmentsInclude,
    },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const { password, ...userWithoutPassword } = user;
  const isDemo = Boolean(req.user?.isDemo) || isDemoAccount(user.username);
  const responseUser = { ...userWithoutPassword, isDemo };
  const normalizedCacheKey = buildMeCacheKey(req.user.id, isDemo);
  setMeCache(normalizedCacheKey, responseUser);
  res.setHeader('Cache-Control', 'private, max-age=5');

  res.status(200).json(new ApiResponse(200, responseUser, 'Profil pengguna berhasil diambil'));
});

const forgotPasswordRequestSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  email: z.string().trim().email('Format email tidak valid'),
});

const forgotPasswordValidateSchema = z.object({
  token: z.string().trim().min(16, 'Link reset password tidak valid'),
});

const forgotPasswordResetSchema = z
  .object({
    token: z.string().min(16, 'Sesi reset password tidak valid'),
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword'],
  });

export const requestForgotPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotPasswordRequestSchema.parse(req.body);
  reservePasswordResetRequest(req, body.username, body.email);

  const genericPayload = {
    contactHint: maskContactValue(body.email),
    channel: 'EMAIL' as const,
  };

  const user = await prisma.user.findUnique({
    where: { username: body.username },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const normalizedInputEmail = normalizeEmailComparisonValue(body.email);
  const storedEmail = normalizeEmailComparisonValue(user?.email);
  if (!user || !storedEmail || storedEmail !== normalizedInputEmail) {
    return res
      .status(200)
      .json(new ApiResponse(200, genericPayload, PASSWORD_RESET_SUCCESS_MESSAGE));
  }

  const resetToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  const resetLink = buildPasswordResetLink(req, resetToken);
  const mailContent = buildPasswordResetEmailContent({
    name: user.name,
    resetLink,
    expiresAt,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationCode: hashVerificationToken(resetToken),
      verificationExpires: expiresAt,
    },
  });

  try {
    await sendWebmailMessage({
      mailboxIdentity: resolvePasswordResetSenderMailbox(),
      fromName: resolvePasswordResetSenderName(),
      to: [storedEmail],
      subject: mailContent.subject,
      plainText: mailContent.plainText,
      html: mailContent.html,
    });
  } catch (error) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: null,
        verificationExpires: null,
      },
    });
    console.error('[FORGOT_PASSWORD_EMAIL_ERROR]', error);
    throw new ApiError(
      500,
      'Sistem belum bisa mengirim email reset password. Coba lagi beberapa saat lagi.',
    );
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        contactHint: maskContactValue(storedEmail),
        channel: 'EMAIL',
      },
      PASSWORD_RESET_SUCCESS_MESSAGE,
    ),
  );
});

export const validateForgotPasswordToken = asyncHandler(async (req: Request, res: Response) => {
  const parsed = forgotPasswordValidateSchema.parse({
    token: req.query.token ?? req.body?.token,
  });

  const user = await prisma.user.findFirst({
    where: {
      verificationCode: hashVerificationToken(parsed.token),
      verificationExpires: {
        gt: new Date(),
      },
    },
    select: {
      email: true,
      verificationExpires: true,
    },
  });

  if (!user || !user.verificationExpires) {
    throw new ApiError(400, 'Link reset password tidak valid atau sudah kedaluwarsa.');
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        expiresAt: user.verificationExpires.toISOString(),
        contactHint: maskContactValue(user.email),
        channel: 'EMAIL',
      },
      'Link reset password valid.',
    ),
  );
});

export const resetForgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotPasswordResetSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: {
      verificationCode: hashVerificationToken(body.token),
      verificationExpires: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new ApiError(400, 'Sesi reset password tidak valid atau sudah kedaluwarsa.');
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      verificationCode: null,
      verificationExpires: null,
    },
  });

  res.status(200).json(
    new ApiResponse(200, null, 'Password berhasil diperbarui. Silakan login kembali.'),
  );
});

// Register Calon Siswa (PPDB) using NISN and password
const calonSiswaRegisterSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi').optional(),
  nisn: nisnSchema,
  desiredMajorId: z.coerce.number().int().positive('Jurusan tujuan wajib dipilih'),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerCalonSiswa = asyncHandler(async (req: Request, res: Response) => {
  const body = calonSiswaRegisterSchema.parse(req.body);

  const major = await prisma.major.findUnique({
    where: { id: body.desiredMajorId },
    select: { id: true },
  });
  if (!major) {
    throw new ApiError(404, 'Jurusan tujuan tidak ditemukan');
  }

  const existingByNisn = await prisma.user.findFirst({
    where: { OR: [{ username: body.nisn }, { nisn: body.nisn }] },
  });
  if (existingByNisn) {
    throw new ApiError(400, 'NISN sudah terdaftar');
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        username: body.nisn, // login tetap via username sesuai kebijakan
        nisn: body.nisn,
        password: hashedPassword,
        name: normalizeOptionalText(body.name) ?? `Calon Siswa ${body.nisn}`,
        role: Role.CALON_SISWA,
        phone: normalizeOptionalText(body.phone),
        email: normalizeOptionalText(body.email),
        verificationMethod: VerificationMethod.NONE,
        verificationStatus: VerificationStatus.PENDING,
        studentStatus: undefined,
      },
    });

    await tx.candidateAdmission.create({
      data: {
        userId: createdUser.id,
        registrationNumber: buildCandidateRegistrationNumber(createdUser.id, createdUser.createdAt),
        desiredMajorId: body.desiredMajorId,
        status: CandidateAdmissionStatus.DRAFT,
      },
    });

    return createdUser;
  });

  const { password, ...userWithoutPassword } = user;
  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Calon siswa terdaftar. Menunggu verifikasi admin'));
});

// Register Umum (Pelamar kerja) using username and password
const umumRegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
  name: z.string().min(1).optional(),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerUmum = asyncHandler(async (req: Request, res: Response) => {
  const body = umumRegisterSchema.parse(req.body);

  const user = await createPublicUserAccount({
    username: body.username,
    password: body.password,
    name: normalizeOptionalText(body.name) ?? `Pelamar Umum ${body.username}`,
    role: Role.UMUM,
    phone: body.phone,
    email: body.email,
  });

  const { password, ...userWithoutPassword } = user;
  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Pelamar umum terdaftar. Menunggu verifikasi admin'));
});

const parentRegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
  name: z.string().min(1, 'Nama wajib diisi'),
  phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
  email: optionalEmailSchema,
  childNisn: nisnSchema,
  childBirthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal lahir anak wajib memakai format YYYY-MM-DD'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerParent = asyncHandler(async (req: Request, res: Response) => {
  const body = parentRegisterSchema.parse(req.body);

  const child = await prisma.user.findFirst({
    where: {
      role: Role.STUDENT,
      nisn: body.childNisn,
    },
    select: {
      id: true,
      name: true,
      birthDate: true,
      studentClass: {
        select: {
          name: true,
          major: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!child) {
    throw new ApiError(404, 'Data siswa dengan NISN tersebut tidak ditemukan');
  }

  if (!child.birthDate) {
    throw new ApiError(400, 'Tanggal lahir siswa belum tersedia di sistem. Hubungi admin sekolah.');
  }

  if (normalizeDateOnly(child.birthDate) !== body.childBirthDate) {
    throw new ApiError(400, 'NISN dan tanggal lahir anak tidak cocok');
  }

  const user = await createPublicUserAccount({
    username: body.username,
    password: body.password,
    name: body.name.trim(),
    role: Role.PARENT,
    phone: body.phone,
    email: body.email,
    preferences: mergeParentRegistrationRequest(null, {
      childId: child.id,
      childNisn: body.childNisn,
      childName: child.name,
      childBirthDate: body.childBirthDate,
      childClassName: child.studentClass?.name || null,
      childMajorCode: child.studentClass?.major?.code || null,
      childMajorName: child.studentClass?.major?.name || null,
      requestedAt: new Date().toISOString(),
      verifiedByChildBirthDate: true,
      linkState: 'PENDING_APPROVAL',
      linkedAt: null,
    }),
  });

  const { password, ...userWithoutPassword } = user;
  res.status(201).json(
    new ApiResponse(
      201,
      userWithoutPassword,
      'Akun orang tua berhasil dibuat. Setelah admin menyetujui akun, data anak pertama akan langsung terhubung.',
    ),
  );
});

const bkkRegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
  name: z.string().min(1, 'Nama wajib diisi'),
  phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
  email: optionalEmailSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerBkk = asyncHandler(async (req: Request, res: Response) => {
  const body = bkkRegisterSchema.parse(req.body);

  const user = await createPublicUserAccount({
    username: body.username,
    password: body.password,
    name: body.name.trim(),
    role: Role.UMUM,
    phone: body.phone,
    email: body.email,
  });

  const { password, ...userWithoutPassword } = user;
  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Akun pelamar BKK berhasil dibuat. Silakan login untuk melihat lowongan yang tersedia.'));
});

// Admin: verify user account (set verificationStatus)
const adminVerifySchema = z.object({
  userId: z.number().int(),
  status: z.nativeEnum(VerificationStatus),
});

export const adminVerifyUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId, status } = adminVerifySchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'Pengguna tidak ditemukan');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { verificationStatus: status },
  });

  const { password, ...userWithoutPassword } = updated;
  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Status verifikasi diperbarui'));
});

// Admin: accept calon siswa -> promote to STUDENT and set VERIFIED
const adminAcceptCalonSchema = z.object({
  userId: z.number().int(),
});

export const adminAcceptCalonSiswa = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = adminAcceptCalonSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'Pengguna tidak ditemukan');
  if (user.role !== Role.CALON_SISWA) {
    throw new ApiError(400, 'Pengguna bukan CALON_SISWA');
  }

  await prisma.candidateAdmission.upsert({
    where: { userId },
    create: {
      userId,
      registrationNumber: buildCandidateRegistrationNumber(userId, user.createdAt),
      status: CandidateAdmissionStatus.ACCEPTED,
      reviewedAt: new Date(),
      acceptedAt: new Date(),
    },
    update: {
      status: CandidateAdmissionStatus.ACCEPTED,
      reviewedAt: new Date(),
      acceptedAt: new Date(),
    },
  });

  await activateCandidateAsOfficialStudent({ userId });

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const { password, ...userWithoutPassword } = updated;
  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Calon siswa diterima sebagai siswa resmi'));
});
