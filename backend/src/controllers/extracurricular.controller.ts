import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const ekskulSchema = z.object({
  name: z.string().min(1, 'Nama ekstrakurikuler wajib diisi'),
  description: z.string().optional().nullable(),
});

export const getExtracurriculars = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });

  const [total, extracurriculars] = await Promise.all([
    prisma.ekstrakurikuler.count({ where }),
    (prisma as any).ekstrakurikuler.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { name: 'asc' },
      include: {
        tutorAssignments: {
          where: {
            academicYearId: activeYear?.id,
            isActive: true,
          },
          include: {
            tutor: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    extracurriculars,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  }, 'Data ekstrakurikuler berhasil diambil'));
});

export const createExtracurricular = asyncHandler(async (req: Request, res: Response) => {
  const body = ekskulSchema.parse(req.body);
  const created = await prisma.ekstrakurikuler.create({
    data: { name: body.name, description: body.description ?? undefined },
  });
  res.status(201).json(new ApiResponse(201, created, 'Ekstrakurikuler berhasil dibuat'));
});

export const updateExtracurricular = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = ekskulSchema.partial().parse(req.body);
  const existing = await prisma.ekstrakurikuler.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Ekstrakurikuler tidak ditemukan');
  const updated = await prisma.ekstrakurikuler.update({
    where: { id: Number(id) },
    data: { name: body.name ?? undefined, description: body.description ?? undefined },
  });
  res.status(200).json(new ApiResponse(200, updated, 'Ekstrakurikuler berhasil diperbarui'));
});

const assignTutorSchema = z.object({
  tutorId: z.coerce.number().int(),
  ekskulId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
});

export const assignTutor = asyncHandler(async (req: Request, res: Response) => {
  const body = assignTutorSchema.parse(req.body);
  
  // Check if already exists
  const existing = await (prisma as any).ekstrakurikulerTutorAssignment.findUnique({
    where: {
      tutorId_ekskulId_academicYearId: {
        tutorId: body.tutorId,
        ekskulId: body.ekskulId,
        academicYearId: body.academicYearId,
      },
    },
  });

  if (existing) {
    if (!existing.isActive) {
      const updated = await (prisma as any).ekstrakurikulerTutorAssignment.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      res.status(200).json(new ApiResponse(200, updated, 'Pembina berhasil diaktifkan kembali'));
      return;
    }
    throw new ApiError(400, 'Pembina sudah ditugaskan di ekstrakurikuler ini pada tahun ajaran tersebut');
  }

  const assignment = await (prisma as any).ekstrakurikulerTutorAssignment.create({
    data: {
      tutorId: body.tutorId,
      ekskulId: body.ekskulId,
      academicYearId: body.academicYearId,
      isActive: true,
    },
  });

  res.status(201).json(new ApiResponse(201, assignment, 'Pembina berhasil ditugaskan'));
});

export const getAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, ekskulId } = req.query;
  
  const where: any = { isActive: true };
  if (academicYearId) where.academicYearId = Number(academicYearId);
  if (ekskulId) where.ekskulId = Number(ekskulId);

  const assignments = await (prisma as any).ekstrakurikulerTutorAssignment.findMany({
    where,
    include: {
      tutor: { select: { id: true, name: true, username: true } },
      ekskul: true,
      academicYear: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(new ApiResponse(200, assignments, 'Data penugasan berhasil diambil'));
});

export const removeAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  await (prisma as any).ekstrakurikulerTutorAssignment.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Penugasan berhasil dihapus'));
});

export const deleteExtracurricular = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.ekstrakurikuler.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Ekstrakurikuler tidak ditemukan');
  await prisma.ekstrakurikuler.delete({ where: { id: Number(id) } });
  res.status(200).json(new ApiResponse(200, null, 'Ekstrakurikuler berhasil dihapus'));
});

const enrollSchema = z.object({
  ekskulId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int().optional(),
});

export const getMyExtracurricularEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  const academicYearId = activeYear?.id;

  if (!academicYearId) {
    res.status(200).json(new ApiResponse(200, null, 'Tahun ajaran aktif tidak ditemukan'));
    return;
  }

  const enrollment = await prisma.ekstrakurikulerEnrollment.findFirst({
    where: { studentId, academicYearId },
    include: { ekskul: true },
  });

  res.status(200).json(new ApiResponse(200, enrollment, 'Data pilihan ekstrakurikuler siswa'));
});

export const enrollExtracurricular = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ekskulId, academicYearId: bodyYearId } = enrollSchema.parse(req.body);
  const studentId = req.user!.id;

  let academicYearId = bodyYearId;
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    academicYearId = activeYear?.id;
  }

  if (!academicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak tersedia');
  }

  const existing = await prisma.ekstrakurikulerEnrollment.findFirst({
    where: { studentId, academicYearId },
  });

  if (existing) {
    throw new ApiError(400, 'Anda sudah memilih ekstrakurikuler untuk tahun ajaran ini');
  }

  const created = await prisma.ekstrakurikulerEnrollment.create({
    data: {
      studentId,
      ekskulId,
      academicYearId,
    },
    include: { ekskul: true },
  });

  res.status(201).json(new ApiResponse(201, created, 'Pendaftaran ekstrakurikuler berhasil'));
});
