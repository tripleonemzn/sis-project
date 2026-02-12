import { Request, Response } from 'express';
import { z } from 'zod';
import { AdditionalDuty, Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const listWorkProgramsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  academicYearId: z.coerce.number().int().optional(),
  additionalDuty: z.nativeEnum(AdditionalDuty).optional(),
  majorId: z.coerce.number().int().optional(),
  semester: z.nativeEnum(Semester).optional(),
});

const createWorkProgramSchema = z.object({
  title: z.string().min(1, 'Judul program kerja wajib diisi'),
  description: z.string().optional(),
  academicYearId: z.number().int(),
  additionalDuty: z.nativeEnum(AdditionalDuty),
  majorId: z.number().int().optional(),
  semester: z.nativeEnum(Semester),
  month: z.number().int().min(1).max(12),
  startWeek: z.number().int().min(1).max(5),
  endWeek: z.number().int().min(1).max(5),
});

const updateWorkProgramSchema = createWorkProgramSchema.partial();

const workProgramIdSchema = z.object({
  id: z.coerce.number().int(),
});

const dateSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Format tanggal tidak valid',
      });
      return z.NEVER;
    }
    return date;
  });

const createItemSchema = z.object({
  description: z.string().min(1, 'Deskripsi kegiatan wajib diisi'),
  targetDate: dateSchema,
  note: z.string().optional().nullable(),
});

const updateItemSchema = z.object({
  description: z.string().min(1).optional(),
  targetDate: dateSchema,
  isCompleted: z.boolean().optional(),
  note: z.string().optional().nullable(),
});

const itemIdSchema = z.object({
  id: z.coerce.number().int(),
});

const createBudgetSchema = z.object({
  description: z.string().min(1, 'Deskripsi anggaran wajib diisi'),
  amount: z.number().min(0, 'Jumlah anggaran tidak boleh negatif'),
});

const budgetIdSchema = z.object({
  id: z.coerce.number().int(),
});

const ensureTeacherHasDuty = async (userId: number, duty: AdditionalDuty) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { additionalDuties: true, role: true },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  if (user.role === 'ADMIN') return;

  if (!user.additionalDuties.includes(duty)) {
    throw new ApiError(403, 'Anda tidak memiliki tugas tambahan tersebut');
  }
};

const ensureTeacherManagesMajor = async (userId: number, majorId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { managedMajors: { select: { id: true } }, role: true },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  if (user.role === 'ADMIN') return;

  const managesMajor = user.managedMajors.some((m) => m.id === majorId);
  if (!managesMajor) {
    throw new ApiError(403, 'Anda tidak memiliki hak akses untuk jurusan ini');
  }
};

export const getWorkPrograms = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, academicYearId, additionalDuty, majorId, semester } =
    listWorkProgramsSchema.parse(req.query);

  const authUser = (req as any).user as { id: number; role: string } | undefined;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const skip = (page - 1) * limit;

  const where: any = {};

  if (authUser.role === 'TEACHER') {
    where.ownerId = authUser.id;
  }

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  if (additionalDuty) {
    where.additionalDuty = additionalDuty;
  }

  if (majorId) {
    where.majorId = majorId;
  }

  if (semester) {
    where.semester = semester;
  }

  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [total, programs] = await Promise.all([
    prisma.workProgram.count({ where }),
    prisma.workProgram.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { academicYear: { name: 'desc' } },
        { additionalDuty: 'asc' },
        { title: 'asc' },
      ],
      include: {
        academicYear: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        items: {
          orderBy: {
            id: 'asc',
          },
          include: {
            budgets: {
              orderBy: {
                id: 'asc',
              },
            },
          },
        },
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        programs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      'Data program kerja berhasil diambil',
    ),
  );
});

export const createWorkProgram = asyncHandler(async (req: Request, res: Response) => {
  const body = createWorkProgramSchema.parse(req.body);

  const authUser = (req as any).user as { id: number; role: string } | undefined;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  if (authUser.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya guru yang dapat membuat program kerja');
  }

  await ensureTeacherHasDuty(authUser.id, body.additionalDuty);

  if (body.majorId) {
    await ensureTeacherManagesMajor(authUser.id, body.majorId);
  }

  // Determine Approver
  let approverId: number | null = null;
  
  // Logic: KAKOM/Teacher Duties -> Wakasek Kurikulum
  // Wakasek -> Kepala Sekolah
  if (body.additionalDuty.startsWith('WAKASEK_')) {
    const principal = await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
    });
    if (principal) approverId = principal.id;
  } else {
    // Default to Wakasek Kurikulum for other duties (KAPROG, WALI_KELAS, etc.)
    const wakasekKurikulum = await prisma.user.findFirst({
      where: { additionalDuties: { has: 'WAKASEK_KURIKULUM' } },
    });
    if (wakasekKurikulum) approverId = wakasekKurikulum.id;
  }

  const program = await prisma.workProgram.create({
    data: {
      title: body.title,
      description: body.description,
      academicYearId: body.academicYearId,
      additionalDuty: body.additionalDuty,
      majorId: body.majorId,
      semester: body.semester,
      month: body.month,
      startWeek: body.startWeek,
      endWeek: body.endWeek,
      ownerId: authUser.id,
      assignedApproverId: approverId, // Set approver
      approvalStatus: 'PENDING',
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, program, 'Program kerja berhasil dibuat'));
});

export const updateWorkProgram = asyncHandler(async (req: Request, res: Response) => {
  const { id } = workProgramIdSchema.parse(req.params);
  const body = updateWorkProgramSchema.parse(req.body);

  const authUser = (req as any).user as { id: number; role: string } | undefined;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const program = await prisma.workProgram.findUnique({
    where: { id },
  });

  if (!program) {
    throw new ApiError(404, 'Program kerja tidak ditemukan');
  }

  if (authUser.role === 'TEACHER' && program.ownerId !== authUser.id) {
    throw new ApiError(403, 'Anda tidak berhak mengubah program kerja ini');
  }

  if (body.additionalDuty) {
    await ensureTeacherHasDuty(program.ownerId, body.additionalDuty);
  }

  if (body.majorId) {
    await ensureTeacherManagesMajor(program.ownerId, body.majorId);
  }

  const updated = await prisma.workProgram.update({
    where: { id },
    data: {
      title: body.title ?? program.title,
      description: body.description ?? program.description,
      academicYearId: body.academicYearId ?? program.academicYearId,
      additionalDuty: body.additionalDuty ?? program.additionalDuty,
      semester: body.semester ?? program.semester,
      month: body.month ?? program.month,
      startWeek: body.startWeek ?? program.startWeek,
      endWeek: body.endWeek ?? program.endWeek,
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, updated, 'Program kerja berhasil diperbarui'));
});

export const deleteWorkProgram = asyncHandler(async (req: Request, res: Response) => {
  const { id } = workProgramIdSchema.parse(req.params);

  const authUser = (req as any).user as { id: number; role: string } | undefined;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const program = await prisma.workProgram.findUnique({
    where: { id },
  });

  if (!program) {
    throw new ApiError(404, 'Program kerja tidak ditemukan');
  }

  if (authUser.role === 'TEACHER' && program.ownerId !== authUser.id) {
    throw new ApiError(403, 'Anda tidak berhak menghapus program kerja ini');
  }

  await prisma.workProgram.delete({
    where: { id },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Program kerja berhasil dihapus'));
});

export const createWorkProgramItem = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = workProgramIdSchema.parse(req.params);
    const body = createItemSchema.parse(req.body);

    const authUser = (req as any).user as { id: number; role: string } | undefined;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const program = await prisma.workProgram.findUnique({
      where: { id },
    });

    if (!program) {
      throw new ApiError(404, 'Program kerja tidak ditemukan');
    }

    if (authUser.role === 'TEACHER' && program.ownerId !== authUser.id) {
      throw new ApiError(403, 'Anda tidak berhak mengubah program kerja ini');
    }

    const item = await prisma.workProgramItem.create({
      data: {
        workProgramId: program.id,
        description: body.description,
        targetDate: body.targetDate ?? null,
        note: body.note ?? null,
      },
    });

    res
      .status(201)
      .json(new ApiResponse(201, item, 'Kegiatan program kerja berhasil ditambahkan'));
  },
);

export const updateWorkProgramItem = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = itemIdSchema.parse(req.params);
    const body = updateItemSchema.parse(req.body);

    const authUser = (req as any).user as { id: number; role: string } | undefined;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const item = await prisma.workProgramItem.findUnique({
      where: { id },
      include: {
        workProgram: true,
      },
    });

    if (!item) {
      throw new ApiError(404, 'Kegiatan program kerja tidak ditemukan');
    }

    if (
      authUser.role === 'TEACHER' &&
      item.workProgram.ownerId !== authUser.id
    ) {
      throw new ApiError(403, 'Anda tidak berhak mengubah kegiatan ini');
    }

    let completedAt = item.completedAt;

    if (typeof body.isCompleted === 'boolean') {
      if (body.isCompleted && !completedAt) {
        completedAt = new Date();
      } else if (!body.isCompleted) {
        completedAt = null;
      }
    }

    const updated = await prisma.workProgramItem.update({
      where: { id },
      data: {
        description: body.description ?? item.description,
        targetDate:
          typeof body.targetDate === 'undefined'
            ? item.targetDate
            : body.targetDate,
        isCompleted:
          typeof body.isCompleted === 'boolean'
            ? body.isCompleted
            : item.isCompleted,
        completedAt,
        note:
          typeof body.note === 'undefined'
            ? item.note
            : body.note ?? null,
      },
    });

    res
      .status(200)
      .json(new ApiResponse(200, updated, 'Kegiatan program kerja berhasil diperbarui'));
  },
);

export const deleteWorkProgramItem = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = itemIdSchema.parse(req.params);

    const authUser = (req as any).user as { id: number; role: string } | undefined;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const item = await prisma.workProgramItem.findUnique({
      where: { id },
      include: {
        workProgram: true,
      },
    });

    if (!item) {
      throw new ApiError(404, 'Kegiatan program kerja tidak ditemukan');
    }

    if (
      authUser.role === 'TEACHER' &&
      item.workProgram.ownerId !== authUser.id
    ) {
      throw new ApiError(403, 'Anda tidak berhak menghapus kegiatan ini');
    }

    await prisma.workProgramItem.delete({
      where: { id },
    });

    res
      .status(200)
      .json(new ApiResponse(200, null, 'Kegiatan program kerja berhasil dihapus'));
  },
);

export const createWorkProgramBudget = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = itemIdSchema.parse(req.params);
    const body = createBudgetSchema.parse(req.body);

    const authUser = (req as any).user as { id: number; role: string } | undefined;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const item = await prisma.workProgramItem.findUnique({
      where: { id },
      include: {
        workProgram: true,
      },
    });

    if (!item) {
      throw new ApiError(404, 'Kegiatan program kerja tidak ditemukan');
    }

    if (
      authUser.role === 'TEACHER' &&
      item.workProgram.ownerId !== authUser.id
    ) {
      throw new ApiError(403, 'Anda tidak berhak mengajukan anggaran untuk kegiatan ini');
    }

    if (item.workProgram.additionalDuty.startsWith('SEKRETARIS_')) {
      throw new ApiError(
        403,
        'Jabatan sekretaris tidak dapat mengajukan anggaran',
      );
    }

    await ensureTeacherHasDuty(item.workProgram.ownerId, item.workProgram.additionalDuty as AdditionalDuty);

    const budget = await prisma.workProgramBudget.create({
      data: {
        itemId: item.id,
        description: body.description,
        amount: body.amount,
      },
    });

    res
      .status(201)
      .json(new ApiResponse(201, budget, 'Anggaran program kerja berhasil diajukan'));
  },
);

export const deleteWorkProgramBudget = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = budgetIdSchema.parse(req.params);

    const authUser = (req as any).user as { id: number; role: string } | undefined;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const budget = await prisma.workProgramBudget.findUnique({
      where: { id },
      include: {
        item: {
          include: {
            workProgram: true,
          },
        },
      },
    });

    if (!budget) {
      throw new ApiError(404, 'Anggaran program kerja tidak ditemukan');
    }

    if (
      authUser.role === 'TEACHER' &&
      budget.item.workProgram.ownerId !== authUser.id
    ) {
      throw new ApiError(403, 'Anda tidak berhak menghapus anggaran ini');
    }

    await prisma.workProgramBudget.delete({
      where: { id },
    });

    res
      .status(200)
      .json(new ApiResponse(200, null, 'Anggaran program kerja berhasil dihapus'));
  },
);

