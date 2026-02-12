import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

const subjectCategorySchema = z.object({
  code: z.string().min(1, 'Kode kategori wajib diisi'),
  name: z.string().min(1, 'Nama kategori wajib diisi'),
  description: z.string().optional().nullable(),
});

export const getSubjectCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await prisma.subjectCategory.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: {
        select: { subjects: true }
      }
    }
  });

  res.status(200).json(new ApiResponse(200, categories, 'Data kategori mata pelajaran berhasil diambil'));
});

export const createSubjectCategory = asyncHandler(async (req: Request, res: Response) => {
  const body = subjectCategorySchema.parse(req.body);

  const existing = await prisma.subjectCategory.findUnique({
    where: { code: body.code },
  });

  if (existing) {
    throw new ApiError(409, 'Kode kategori sudah digunakan');
  }

  const category = await prisma.subjectCategory.create({
    data: body,
  });

  res.status(201).json(new ApiResponse(201, category, 'Kategori mata pelajaran berhasil dibuat'));
});

export const updateSubjectCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = subjectCategorySchema.partial().parse(req.body);

  const existing = await prisma.subjectCategory.findUnique({
    where: { id: Number(id) },
  });

  if (!existing) {
    throw new ApiError(404, 'Kategori tidak ditemukan');
  }

  if (body.code && body.code !== existing.code) {
    const codeExists = await prisma.subjectCategory.findUnique({
      where: { code: body.code },
    });
    if (codeExists) {
      throw new ApiError(409, 'Kode kategori sudah digunakan');
    }
  }

  const updated = await prisma.subjectCategory.update({
    where: { id: Number(id) },
    data: body,
  });

  res.status(200).json(new ApiResponse(200, updated, 'Kategori berhasil diperbarui'));
});

export const deleteSubjectCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const category = await prisma.subjectCategory.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: { subjects: true }
      }
    }
  });

  if (!category) {
    throw new ApiError(404, 'Kategori tidak ditemukan');
  }

  if (category._count.subjects > 0) {
    throw new ApiError(400, 'Tidak dapat menghapus kategori yang sedang digunakan oleh mata pelajaran');
  }

  await prisma.subjectCategory.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Kategori berhasil dihapus'));
});
