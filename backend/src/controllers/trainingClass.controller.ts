import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { Role } from '@prisma/client';

const trainingClassSchema = z.object({
  name: z.string().min(1, 'Nama kelas training wajib diisi'),
  description: z.string().optional().nullable(),
  academicYearId: z.number().int('Tahun akademik tidak valid'),
  instructorId: z.number().int().positive().optional().nullable(),
  startDate: z
    .string()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null)),
  endDate: z
    .string()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null)),
  maxCapacity: z
    .number()
    .int()
    .positive('Kapasitas maksimal harus lebih dari 0')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export const getTrainingClasses = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;
  const where: any = {};
  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }

  const [total, trainingClasses] = await Promise.all([
    prisma.trainingClass.count({ where }),
    prisma.trainingClass.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { id: 'desc' },
      include: {
        academicYear: true,
        instructor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        _count: {
          select: {
            materials: true,
            assignments: true,
            exams: true,
            enrollments: true,
          },
        },
      } as any,
    }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    trainingClasses,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  }, 'Data kelas training berhasil diambil'));
});

export const createTrainingClass = asyncHandler(async (req: Request, res: Response) => {
  const body = trainingClassSchema.parse(req.body);
  const year = await prisma.academicYear.findUnique({ where: { id: body.academicYearId } });
  if (!year) throw new ApiError(404, 'Tahun akademik tidak ditemukan');

  if (body.instructorId) {
    const instructor = await prisma.user.findUnique({ where: { id: body.instructorId } });
    if (!instructor || instructor.role !== Role.TEACHER) {
      throw new ApiError(400, 'Instruktur tidak valid');
    }
  }

  const created = await prisma.trainingClass.create({
    data: {
      name: body.name,
      description: body.description ?? undefined,
      academicYearId: body.academicYearId,
      instructorId: body.instructorId ?? undefined,
      startDate: (body as any).startDate ?? undefined,
      endDate: (body as any).endDate ?? undefined,
      maxCapacity: body.maxCapacity ?? undefined,
      isActive: body.isActive ?? true,
    } as any,
  });
  res.status(201).json(new ApiResponse(201, created, 'Kelas training berhasil dibuat'));
});

export const updateTrainingClass = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = trainingClassSchema.partial().parse(req.body);

  const existing = await prisma.trainingClass.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Kelas training tidak ditemukan');

  if (body.instructorId) {
    const instructor = await prisma.user.findUnique({ where: { id: body.instructorId } });
    if (!instructor || instructor.role !== Role.TEACHER) {
      throw new ApiError(400, 'Instruktur tidak valid');
    }
  }

  const updated = await prisma.trainingClass.update({
    where: { id: Number(id) },
    data: {
      name: body.name ?? undefined,
      description: body.description ?? undefined,
      academicYearId: body.academicYearId ?? undefined,
      instructorId: body.instructorId ?? undefined,
      startDate: (body as any).startDate ?? undefined,
      endDate: (body as any).endDate ?? undefined,
      maxCapacity: body.maxCapacity ?? undefined,
      isActive: body.isActive ?? undefined,
    } as any,
  });
  res.status(200).json(new ApiResponse(200, updated, 'Kelas training berhasil diperbarui'));
});

export const getTrainingClassById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const trainingClass = await prisma.trainingClass.findUnique({
    where: { id: Number(id) },
    include: {
      academicYear: true,
      instructor: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      enrollments: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              username: true,
              studentClass: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      },
      _count: {
        select: {
          materials: true,
          assignments: true,
          exams: true,
          enrollments: true,
        },
      },
    } as any,
  });

  if (!trainingClass) {
    throw new ApiError(404, 'Kelas training tidak ditemukan');
  }

  res
    .status(200)
    .json(new ApiResponse(200, trainingClass, 'Detail kelas training berhasil diambil'));
});

const enrollmentSchema = z.object({
  studentId: z.number().int().positive(),
});

export const addTrainingParticipant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { studentId } = enrollmentSchema.parse(req.body);

  const training = await prisma.trainingClass.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: { enrollments: true },
      },
    },
  });
  if (!training) throw new ApiError(404, 'Kelas training tidak ditemukan');

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== Role.STUDENT) {
    throw new ApiError(400, 'Siswa tidak valid');
  }

  const maxCapacity = (training as any).maxCapacity as number | null | undefined;
  if (maxCapacity && training._count.enrollments >= maxCapacity) {
    throw new ApiError(400, 'Kapasitas kelas training sudah penuh');
  }

  const existing = await prisma.trainingEnrollment.findFirst({
    where: { trainingId: training.id, studentId },
  });
  if (existing) {
    throw new ApiError(400, 'Siswa sudah terdaftar di kelas training ini');
  }

  const enrollment = await prisma.trainingEnrollment.create({
    data: {
      trainingId: training.id,
      studentId,
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, enrollment, 'Peserta berhasil ditambahkan ke kelas training'));
});

export const removeTrainingParticipant = asyncHandler(async (req: Request, res: Response) => {
  const { id, enrollmentId } = req.params;

  const training = await prisma.trainingClass.findUnique({
    where: { id: Number(id) },
  });
  if (!training) throw new ApiError(404, 'Kelas training tidak ditemukan');

  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: Number(enrollmentId) },
  });
  if (!enrollment || enrollment.trainingId !== training.id) {
    throw new ApiError(404, 'Peserta kelas training tidak ditemukan');
  }

  await prisma.trainingEnrollment.delete({
    where: { id: enrollment.id },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Peserta berhasil dihapus dari kelas training'));
});

export const deleteTrainingClass = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.trainingClass.findUnique({
    where: { id: Number(id) },
    include: {
      enrollments: true,
      materials: true,
      assignments: {
        include: {
          submissions: true,
        },
      },
      exams: {
        include: {
          examAnswers: true,
          examScores: true,
        },
      },
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Kelas training tidak ditemukan');
  }

  await prisma.$transaction(async (tx) => {
    await tx.trainingEnrollment.deleteMany({
      where: { trainingId: existing.id },
    });

    if (existing.assignments.length > 0) {
      const assignmentIds = existing.assignments.map((a) => a.id);

      await tx.trainingAssignmentSubmission.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      });

      await tx.trainingAssignment.deleteMany({
        where: { id: { in: assignmentIds } },
      });
    }

    if (existing.exams.length > 0) {
      const examIds = existing.exams.map((e) => e.id);

      await tx.trainingExamAnswer.deleteMany({
        where: { examId: { in: examIds } },
      });

      await tx.trainingExamScore.deleteMany({
        where: { examId: { in: examIds } },
      });

      await tx.trainingExam.deleteMany({
        where: { id: { in: examIds } },
      });
    }

    await tx.trainingMaterial.deleteMany({
      where: { trainingId: existing.id },
    });

    await tx.trainingClass.delete({
      where: { id: existing.id },
    });
  });

  res.status(200).json(new ApiResponse(200, null, 'Kelas training beserta datanya berhasil dihapus'));
});
