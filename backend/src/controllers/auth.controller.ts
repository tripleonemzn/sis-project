import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { generateToken } from '../middleware/auth';
import { z } from 'zod';
import { Role, VerificationStatus, VerificationMethod } from '@prisma/client';

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

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);

  const existingUser = await prisma.user.findUnique({
    where: { username: body.username },
  });

  if (existingUser) {
    throw new ApiError(400, 'Username sudah digunakan');
  }

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

  if (user.verificationStatus !== VerificationStatus.VERIFIED) {
    throw new ApiError(403, 'Akun belum diverifikasi oleh admin');
  }

  const token = generateToken({ id: user.id, role: user.role });

  const { password: _, ...userWithoutPassword } = user;

  res.status(200).json(
    new ApiResponse(200, { user: userWithoutPassword, token }, 'Login berhasil')
  );
});

export const getMe = asyncHandler(async (req: any, res: Response) => {
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
      documents: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const { password, ...userWithoutPassword } = user;

  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Profil pengguna berhasil diambil'));
});

// Register Calon Siswa (PPDB) using NISN and password
const calonSiswaRegisterSchema = z.object({
  nisn: z.string().min(10).max(10),
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

  const user = await prisma.user.create({
    data: {
      username: body.nisn, // login tetap via username sesuai kebijakan
      nisn: body.nisn,
      password: hashedPassword,
      name: `Calon Siswa ${body.nisn}`,
      role: Role.CALON_SISWA,
      verificationMethod: VerificationMethod.NONE,
      verificationStatus: VerificationStatus.PENDING,
      studentStatus: undefined,
    },
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
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export const registerUmum = asyncHandler(async (req: Request, res: Response) => {
  const body = umumRegisterSchema.parse(req.body);

  const existingUser = await prisma.user.findUnique({
    where: { username: body.username },
  });
  if (existingUser) {
    throw new ApiError(400, 'Username sudah digunakan');
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      username: body.username,
      password: hashedPassword,
      name: body.name ?? `Pelamar Umum ${body.username}`,
      role: Role.UMUM,
      verificationMethod: VerificationMethod.NONE,
      verificationStatus: VerificationStatus.PENDING,
    },
  });

  const { password, ...userWithoutPassword } = user;
  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Pelamar umum terdaftar. Menunggu verifikasi admin'));
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

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      role: Role.STUDENT,
      studentStatus: undefined,
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  const { password, ...userWithoutPassword } = updated;
  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Calon siswa diterima sebagai Siswa'));
});
