import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { generateToken } from '../middleware/auth';
import { z } from 'zod';
import { getNisnValidationMessage, normalizeNisnInput } from '../utils/nisn';
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
      verificationMethod: VerificationMethod.NONE,
      verificationStatus: VerificationStatus.PENDING,
    },
  });
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

// Register Calon Siswa (PPDB) using NISN and password
const calonSiswaRegisterSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi').optional(),
  nisn: nisnSchema,
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerCalonSiswa = asyncHandler(async (req: Request, res: Response) => {
  const body = calonSiswaRegisterSchema.parse(req.body);

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
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
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
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  name: z.string().min(1, 'Nama wajib diisi'),
  phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
  email: optionalEmailSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerParent = asyncHandler(async (req: Request, res: Response) => {
  const body = parentRegisterSchema.parse(req.body);

  const user = await createPublicUserAccount({
    username: body.username,
    password: body.password,
    name: body.name.trim(),
    role: Role.PARENT,
    phone: body.phone,
    email: body.email,
  });

  const { password, ...userWithoutPassword } = user;
  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Akun orang tua berhasil dibuat. Silakan login untuk mulai menghubungkan data anak.'));
});

const bkkRegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
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

  const acceptedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        role: Role.STUDENT,
        studentStatus: undefined,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    });

    await tx.candidateAdmission.upsert({
      where: { userId },
      create: {
        userId,
        registrationNumber: buildCandidateRegistrationNumber(userId, user.createdAt),
        status: CandidateAdmissionStatus.ACCEPTED,
        reviewedAt: acceptedAt,
        acceptedAt,
      },
      update: {
        status: CandidateAdmissionStatus.ACCEPTED,
        reviewedAt: acceptedAt,
        acceptedAt,
      },
    });

    return updatedUser;
  });

  const { password, ...userWithoutPassword } = updated;
  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Calon siswa diterima sebagai Siswa'));
});
