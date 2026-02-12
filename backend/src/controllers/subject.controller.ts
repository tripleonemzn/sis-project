import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

const subjectSchema = z.object({
  name: z.string().min(1, 'Nama mata pelajaran wajib diisi'),
  code: z.string().min(1, 'Kode mata pelajaran wajib diisi'),
  description: z.string().optional().nullable(),
  parentId: z.number().optional().nullable(),
  subjectCategoryId: z.number().int().optional(),
  kkmX: z.number().int().min(0).max(100).optional().nullable(),
  kkmXI: z.number().int().min(0).max(100).optional().nullable(),
  kkmXII: z.number().int().min(0).max(100).optional().nullable(),
});

export const getSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, category, subjectCategoryId } = req.query;

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

  if (subjectCategoryId) {
    where.categoryId = Number(subjectCategoryId);
  }

  if (category && category !== 'ALL') {
    // Legacy support or specific enum filtering if needed
    // Only apply if subjectCategoryId is not set, or allow both?
    // Usually one is enough, but let's keep it safe.
    const categoryUpper = String(category).toUpperCase();
    if (['UMUM', 'KEJURUAN', 'KOMPETENSI_KEAHLIAN', 'PILIHAN', 'MUATAN_LOKAL'].includes(categoryUpper)) {
        // If category string field is removed, this might fail or be useless.
        // Assuming we rely on relation now.
        // where.category = { code: categoryUpper };
    }
  }

  const [total, subjects] = await Promise.all([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { code: 'asc' },
      include: {
        category: true,
        kkms: {
          select: {
            classLevel: true,
            kkm: true,
            academicYearId: true
          },
        },
        _count: {
          select: {
            children: true,
            teacherAssignments: true,
          },
        },
      },
    }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    subjects,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  }, 'Data mata pelajaran berhasil diambil'));
});

export const getSubjectById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const subject = await prisma.subject.findUnique({
    where: { id: Number(id) },
    include: {
      parent: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      children: true,
      kkms: true,
      category: true,
    },
  });

  if (!subject) {
    throw new ApiError(404, 'Mata pelajaran tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, subject, 'Detail mata pelajaran berhasil diambil'));
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const body = subjectSchema.parse(req.body);

  const existingCode = await prisma.subject.findUnique({
    where: { code: body.code },
  });

  if (existingCode) {
    throw new ApiError(409, 'Kode mata pelajaran sudah digunakan');
  }

  if (body.parentId) {
    const parent = await prisma.subject.findUnique({
      where: { id: body.parentId },
    });
    if (!parent) {
      throw new ApiError(404, 'Mata pelajaran induk tidak ditemukan');
    }
  }

  if (body.subjectCategoryId) {
    const category = await prisma.subjectCategory.findUnique({
      where: { id: body.subjectCategoryId },
    });
    if (!category) {
      throw new ApiError(404, 'Kategori mata pelajaran tidak ditemukan');
    }
  }

  const { kkmX, kkmXI, kkmXII, subjectCategoryId, ...subjectData } = body as any;
  const subject = await prisma.subject.create({
    data: {
      ...subjectData,
      categoryId: subjectCategoryId
    },
    include: {
      category: true
    }
  });

  const kkms: { classLevel: string; kkm?: number }[] = [
    { classLevel: 'X', kkm: kkmX },
    { classLevel: 'XI', kkm: kkmXI },
    { classLevel: 'XII', kkm: kkmXII },
  ];
  for (const k of kkms) {
    if (typeof k.kkm === 'number') {
      await prisma.subjectKKM.create({
        data: {
          subjectId: subject.id,
          classLevel: k.classLevel,
          kkm: k.kkm,
        },
      });
    }
  }

  res.status(201).json(new ApiResponse(201, subject, 'Mata pelajaran berhasil dibuat'));
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = subjectSchema.partial().parse(req.body);

  const existingSubject = await prisma.subject.findUnique({
    where: { id: Number(id) },
  });

  if (!existingSubject) {
    throw new ApiError(404, 'Mata pelajaran tidak ditemukan');
  }

  if (body.code && body.code !== existingSubject.code) {
    const existingCode = await prisma.subject.findUnique({
      where: { code: body.code },
    });
    if (existingCode) {
      throw new ApiError(409, 'Kode mata pelajaran sudah digunakan');
    }
  }

  if (body.parentId) {
    if (body.parentId === Number(id)) {
      throw new ApiError(400, 'Mata pelajaran tidak dapat menjadi induk dirinya sendiri');
    }
    const parent = await prisma.subject.findUnique({
      where: { id: body.parentId },
    });
    if (!parent) {
      throw new ApiError(404, 'Mata pelajaran induk tidak ditemukan');
    }
  }

  if (body.subjectCategoryId) {
    const category = await prisma.subjectCategory.findUnique({
      where: { id: body.subjectCategoryId },
    });
    if (!category) {
      throw new ApiError(404, 'Kategori mata pelajaran tidak ditemukan');
    }
  }

  const { kkmX, kkmXI, kkmXII, subjectCategoryId, ...subjectData } = body as any;
  const updatedSubject = await prisma.subject.update({
    where: { id: Number(id) },
    data: {
      ...subjectData,
      categoryId: subjectCategoryId
    },
    include: {
      category: true
    }
  });

  const upsertKKM = async (classLevel: 'X' | 'XI' | 'XII', kkm?: number | null) => {
    if (kkm === undefined) return; // Skip if field not present in update payload

    const existing = await prisma.subjectKKM.findFirst({
      where: { subjectId: Number(id), classLevel },
    });

    if (kkm === null) {
      // Logic to delete KKM if it exists
      if (existing) {
        await prisma.subjectKKM.delete({
          where: { id: existing.id },
        });
      }
      return;
    }

    // Logic for Create or Update if kkm is a number
    if (existing) {
      await prisma.subjectKKM.update({
        where: { id: existing.id },
        data: { kkm },
      });
    } else {
      await prisma.subjectKKM.create({
        data: { subjectId: Number(id), classLevel, kkm },
      });
    }

    // Sync to TeacherAssignment
    // Find classes with this level
    const classes = await prisma.class.findMany({
      where: { level: classLevel },
      select: { id: true }
    });
    const classIds = classes.map(c => c.id);

    if (classIds.length > 0) {
      await prisma.teacherAssignment.updateMany({
        where: {
          subjectId: Number(id),
          classId: { in: classIds }
        },
        data: { kkm }
      });
    }
  };
  await upsertKKM('X', kkmX);
  await upsertKKM('XI', kkmXI);
  await upsertKKM('XII', kkmXII);

  res.status(200).json(new ApiResponse(200, updatedSubject, 'Mata pelajaran berhasil diperbarui'));
});

export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const subject = await prisma.subject.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: {
          children: true,
          teacherAssignments: true,
          materials: true,
          exams: true,
          kkms: true,
        },
      },
    },
  });

  if (!subject) {
    throw new ApiError(404, 'Mata pelajaran tidak ditemukan');
  }

  if (subject._count.children > 0) {
    throw new ApiError(400, 'Tidak dapat menghapus mata pelajaran yang memiliki sub-mata pelajaran');
  }

  if (subject._count.teacherAssignments > 0) {
    throw new ApiError(400, 'Tidak dapat menghapus mata pelajaran yang sudah ditugaskan ke guru');
  }

  if (subject._count.materials > 0 || subject._count.exams > 0) {
     throw new ApiError(400, 'Tidak dapat menghapus mata pelajaran yang sudah memiliki materi atau ujian');
  }

  await prisma.subjectKKM.deleteMany({
    where: { subjectId: Number(id) },
  });

  await prisma.subject.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Mata pelajaran berhasil dihapus'));
});
