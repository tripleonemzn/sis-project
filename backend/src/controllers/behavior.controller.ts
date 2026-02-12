import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

// Schema for creating behavior record
const createBehaviorSchema = z.object({
  studentId: z.number().int(),
  classId: z.number().int(),
  academicYearId: z.number().int(),
  date: z.string().transform((str) => new Date(str)),
  type: z.enum(['POSITIVE', 'NEGATIVE']),
  category: z.string().optional(),
  description: z.string().min(1),
  point: z.number().int().default(0),
});

// Schema for updating behavior record
const updateBehaviorSchema = z.object({
  date: z.string().transform((str) => new Date(str)).optional(),
  type: z.enum(['POSITIVE', 'NEGATIVE']).optional(),
  category: z.string().optional(),
  description: z.string().min(1).optional(),
  point: z.number().int().optional(),
});

// Schema for querying behaviors
const getBehaviorsSchema = z.object({
  classId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
  studentId: z.coerce.number().int().optional(),
  type: z.enum(['POSITIVE', 'NEGATIVE']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(10),
});

export const getBehaviors = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId, studentId, type, search, page, limit } = getBehaviorsSchema.parse(req.query);

  const skip = (page - 1) * limit;

  const where: any = {
    classId,
    academicYearId,
  };

  if (studentId) where.studentId = studentId;
  if (type) where.type = type;
  if (search) {
    where.student = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { nis: { contains: search, mode: 'insensitive' } },
        { nisn: { contains: search, mode: 'insensitive' } },
      ]
    };
  }

  const [behaviors, total] = await Promise.all([
    prisma.studentBehavior.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            photo: true, // Needed for UI avatar
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.studentBehavior.count({ where }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    behaviors,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  }, 'Data perilaku berhasil diambil'));
});

export const createBehavior = asyncHandler(async (req: Request, res: Response) => {
  const data = createBehaviorSchema.parse(req.body);

  const behavior = await prisma.studentBehavior.create({
    data,
  });

  res.status(201).json(new ApiResponse(201, behavior, 'Data perilaku berhasil disimpan'));
});

export const updateBehavior = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = updateBehaviorSchema.parse(req.body);

  const existing = await prisma.studentBehavior.findUnique({
    where: { id: Number(id) },
  });

  if (!existing) {
    throw new ApiError(404, 'Data perilaku tidak ditemukan');
  }

  const behavior = await prisma.studentBehavior.update({
    where: { id: Number(id) },
    data,
  });

  res.status(200).json(new ApiResponse(200, behavior, 'Data perilaku berhasil diperbarui'));
});

export const deleteBehavior = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.studentBehavior.findUnique({
    where: { id: Number(id) },
  });

  if (!existing) {
    throw new ApiError(404, 'Data perilaku tidak ditemukan');
  }

  await prisma.studentBehavior.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Data perilaku berhasil dihapus'));
});
