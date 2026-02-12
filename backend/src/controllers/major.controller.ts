import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

const majorSchema = z.object({
  name: z.string().min(1, 'Nama jurusan wajib diisi'),
  code: z.string().min(1, 'Kode jurusan wajib diisi'),
  description: z.string().optional(),
});

export const getMajors = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { code: { contains: String(search), mode: 'insensitive' } },
    ];
  }

  const [total, majors] = await Promise.all([
    prisma.major.count({ where }),
    prisma.major.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: {
            classes: true,
          },
        },
      },
    }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    majors,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  }, 'Data jurusan berhasil diambil'));
});

export const getMajorById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const major = await prisma.major.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: {
          classes: true,
        },
      },
    },
  });

  if (!major) {
    throw new ApiError(404, 'Jurusan tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, major, 'Detail jurusan berhasil diambil'));
});

export const createMajor = asyncHandler(async (req: Request, res: Response) => {
  const body = majorSchema.parse(req.body);

  const existingCode = await prisma.major.findUnique({
    where: { code: body.code },
  });

  if (existingCode) {
    throw new ApiError(409, 'Kode jurusan sudah digunakan');
  }

  const major = await prisma.major.create({
    data: body,
  });

  res.status(201).json(new ApiResponse(201, major, 'Jurusan berhasil dibuat'));
});

export const updateMajor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = majorSchema.partial().parse(req.body);

  const existingMajor = await prisma.major.findUnique({
    where: { id: Number(id) },
  });

  if (!existingMajor) {
    throw new ApiError(404, 'Jurusan tidak ditemukan');
  }

  if (body.code && body.code !== existingMajor.code) {
    const existingCode = await prisma.major.findUnique({
      where: { code: body.code },
    });
    if (existingCode) {
      throw new ApiError(409, 'Kode jurusan sudah digunakan');
    }
  }

  const updatedMajor = await prisma.major.update({
    where: { id: Number(id) },
    data: body,
  });

  res.status(200).json(new ApiResponse(200, updatedMajor, 'Jurusan berhasil diperbarui'));
});

export const deleteMajor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const major = await prisma.major.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: {
          classes: true,
        },
      },
    },
  });

  if (!major) {
    throw new ApiError(404, 'Jurusan tidak ditemukan');
  }

  if (major._count.classes > 0) {
    throw new ApiError(400, 'Tidak dapat menghapus jurusan yang masih memiliki kelas');
  }

  await prisma.major.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Jurusan berhasil dihapus'));
});
