import { Request, Response } from 'express';
import { z } from 'zod';
import { AdditionalDuty, Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const listWorkProgramsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  search: z.string().optional(),
  academicYearId: z.coerce.number().int().optional(),
  additionalDuty: z.nativeEnum(AdditionalDuty).optional(),
  majorId: z.coerce.number().int().optional(),
  semester: z.nativeEnum(Semester).optional(),
  readOnly: z.string().optional(),
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
  startMonth: z.number().int().min(1).max(12).optional(),
  endMonth: z.number().int().min(1).max(12).optional(),
  executionStatus: z.enum(['TERLAKSANA', 'BELUM_TERLAKSANA']).optional(),
  nonExecutionReason: z.string().optional().nullable(),
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

const updateApprovalStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().optional().nullable(),
});

const ensureUserHasDuty = async (userId: number, duty: AdditionalDuty) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { additionalDuties: true, role: true },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  if (user.role === 'ADMIN') return;
  if (user.role === 'EXTRACURRICULAR_TUTOR' && duty === 'PEMBINA_EKSKUL') return;

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
  const parsedQuery = listWorkProgramsSchema.parse(req.query);
  const page = parsedQuery.page ?? 1;
  const limit = Math.min(parsedQuery.limit ?? 10, 100);
  const { search, academicYearId, additionalDuty, majorId, semester, readOnly } = parsedQuery;

  const authUser = (req as any).user as { id: number; role: string } | undefined;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const skip = (page - 1) * limit;

  const where: any = {};

  const actor = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      role: true,
      additionalDuties: true,
    },
  });

  const dutySet = new Set(
    (actor?.additionalDuties || []).map((duty) => String(duty).trim().toUpperCase()),
  );
  const isReadOnly = ['1', 'true', 'yes'].includes(String(readOnly || '').trim().toLowerCase());
  const canMonitorPembinaEkskulReadOnly =
    authUser.role === 'TEACHER' &&
    dutySet.has('PEMBINA_OSIS') &&
    additionalDuty === 'PEMBINA_EKSKUL' &&
    isReadOnly;

  if (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') {
    if (!canMonitorPembinaEkskulReadOnly) {
      where.ownerId = authUser.id;
    }
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
        assignedApprover: {
          select: {
            id: true,
            name: true,
            role: true,
            additionalDuties: true,
          },
        },
        items: {
          orderBy: {
            id: 'asc',
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

  if (!['TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(authUser.role)) {
    throw new ApiError(403, 'Anda tidak memiliki akses membuat program kerja');
  }

  if (authUser.role === 'EXTRACURRICULAR_TUTOR' && body.additionalDuty !== 'PEMBINA_EKSKUL') {
    throw new ApiError(403, 'Pembina ekstrakurikuler hanya dapat membuat program kerja ekskul');
  }

  // Prevent Secretary from creating work program
  if (body.additionalDuty.startsWith('SEKRETARIS_')) {
    throw new ApiError(403, 'Sekretaris tidak memiliki kewenangan membuat program kerja');
  }

  await ensureUserHasDuty(authUser.id, body.additionalDuty);

  let resolvedMajorId = body.majorId ?? null;

  if (body.additionalDuty === 'KAPROG') {
    const owner = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        managedMajors: {
          select: {
            id: true,
          },
        },
      },
    });

    if (owner && !resolvedMajorId && owner.managedMajors.length === 1) {
      resolvedMajorId = owner.managedMajors[0].id;
    }
  }

  if (resolvedMajorId) {
    await ensureTeacherManagesMajor(authUser.id, resolvedMajorId);
  }

  const executionStatus = body.executionStatus ?? 'TERLAKSANA';
  const nonExecutionReason = String(body.nonExecutionReason || '').trim();

  if (executionStatus === 'BELUM_TERLAKSANA' && !nonExecutionReason) {
    throw new ApiError(400, 'Alasan wajib diisi saat program kerja belum terlaksana');
  }

  // Determine Approver
  const [principal, wakasekKurikulum, wakasekKesiswaan] = await Promise.all([
    prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { additionalDuties: { has: 'WAKASEK_KURIKULUM' } },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { additionalDuties: { has: 'WAKASEK_KESISWAAN' } },
      select: { id: true },
    }),
  ]);

  let approverId: number | null = null;
  if (body.additionalDuty === 'PEMBINA_EKSKUL') {
    approverId = wakasekKesiswaan?.id ?? principal?.id ?? null;
  } else if (body.additionalDuty.startsWith('WAKASEK_')) {
    approverId = principal?.id ?? null;
  } else {
    approverId = wakasekKurikulum?.id ?? principal?.id ?? null;
  }

  const program = await prisma.workProgram.create({
    data: {
      title: body.title,
      description: body.description,
      academicYearId: body.academicYearId,
      additionalDuty: body.additionalDuty,
      majorId: resolvedMajorId,
      semester: body.semester,
      month: body.month,
      startWeek: body.startWeek,
      endWeek: body.endWeek,
      startMonth: typeof body.startMonth === 'number' ? body.startMonth : body.month,
      endMonth: typeof body.endMonth === 'number' ? body.endMonth : body.month,
      ownerId: authUser.id,
      assignedApproverId: approverId, // Set approver
      approvalStatus: 'PENDING',
      executionStatus,
      nonExecutionReason:
        executionStatus === 'BELUM_TERLAKSANA' ? nonExecutionReason : null,
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

  if (
    (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') &&
    program.ownerId !== authUser.id
  ) {
    throw new ApiError(403, 'Anda tidak berhak mengubah program kerja ini');
  }

  if (body.additionalDuty) {
    await ensureUserHasDuty(program.ownerId, body.additionalDuty);
  }

  if (body.majorId) {
    await ensureTeacherManagesMajor(program.ownerId, body.majorId);
  }

  const nextExecutionStatus = body.executionStatus ?? program.executionStatus;
  const reasonFromBody =
    typeof body.nonExecutionReason === 'string'
      ? body.nonExecutionReason.trim()
      : undefined;
  const reasonFromProgram = String(program.nonExecutionReason || '').trim();
  const nextNonExecutionReason =
    nextExecutionStatus === 'BELUM_TERLAKSANA'
      ? reasonFromBody ?? reasonFromProgram
      : null;

  if (nextExecutionStatus === 'BELUM_TERLAKSANA' && !nextNonExecutionReason) {
    throw new ApiError(400, 'Alasan wajib diisi saat program kerja belum terlaksana');
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
      startMonth:
        typeof body.startMonth === 'number'
          ? body.startMonth
          : program.startMonth ?? program.month,
      endMonth:
        typeof body.endMonth === 'number'
          ? body.endMonth
          : program.endMonth ?? program.month,
      executionStatus: nextExecutionStatus,
      nonExecutionReason: nextNonExecutionReason,
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

  if (
    (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') &&
    program.ownerId !== authUser.id
  ) {
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

    if (
      (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') &&
      program.ownerId !== authUser.id
    ) {
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
      (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') &&
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
      (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') &&
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

export const getPendingWorkProgramsForApprover = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user as { id: number; role: string } | undefined;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const includeReviewed = ['1', 'true', 'yes'].includes(
      String((req.query as any)?.includeReviewed || '').trim().toLowerCase(),
    );
    const where: any = includeReviewed ? {} : { approvalStatus: 'PENDING' };

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        role: true,
        additionalDuties: true,
      },
    });

    if (!user) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    if (user.role === 'PRINCIPAL') {
      where.assignedApproverId = authUser.id;
    } else if (user.role === 'TEACHER') {
      const duties = (user.additionalDuties || []).map((d: any) =>
        String(d).trim().toUpperCase(),
      );
      const isWakasekKurikulum = duties.includes('WAKASEK_KURIKULUM');
      const isWakasekKesiswaan = duties.includes('WAKASEK_KESISWAAN');
      const isPembinaOsis = duties.includes('PEMBINA_OSIS');

      if (isWakasekKurikulum) {
        where.assignedApproverId = authUser.id;
      } else if (isWakasekKesiswaan) {
        where.assignedApproverId = authUser.id;
        where.additionalDuty = 'PEMBINA_EKSKUL';
      } else if (isPembinaOsis) {
        where.additionalDuty = 'PEMBINA_EKSKUL';
      } else {
        throw new ApiError(403, 'Anda tidak memiliki akses persetujuan program kerja');
      }
    } else {
      throw new ApiError(403, 'Anda tidak memiliki akses persetujuan program kerja');
    }

    const programsRaw = await prisma.workProgram.findMany({
      where,
      orderBy: [
        { academicYear: { name: 'desc' } },
        { additionalDuty: 'asc' },
        { title: 'asc' },
      ],
      include: {
        academicYear: true,
        owner: {
          select: {
            id: true,
            name: true,
            managedMajors: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        major: true,
      },
    });

    const ownerMajorUsage = new Map<
      number,
      {
        usedMajorIds: Set<number>;
        managedMajors: { id: number; name: string; code: string | null }[];
      }
    >();

    for (const p of programsRaw as any[]) {
      if (!p.owner) continue;
      const ownerId = p.owner.id as number;
      let entry = ownerMajorUsage.get(ownerId);
      if (!entry) {
        entry = {
          usedMajorIds: new Set<number>(),
          managedMajors: (p.owner.managedMajors || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            code: m.code ?? null,
          })),
        };
        ownerMajorUsage.set(ownerId, entry);
      }
      if (p.major && typeof p.major.id === 'number') {
        entry.usedMajorIds.add(p.major.id as number);
      }
    }

    const programs = programsRaw.map((p: any) => {
      if (!p.major && p.additionalDuty === 'KAPROG' && p.owner) {
        const entry = ownerMajorUsage.get(p.owner.id);
        const managed = entry?.managedMajors || [];

        if (managed.length === 1) {
          const m = managed[0];
          return {
            ...p,
            major: m,
            majorId: m.id,
          };
        }

        if (managed.length === 2 && entry) {
          const usedIds = entry.usedMajorIds;
          if (usedIds.size === 1) {
            const usedId = Array.from(usedIds)[0];
            const other = managed.find((m) => m.id !== usedId);
            if (other) {
              return {
                ...p,
                major: other,
                majorId: other.id,
              };
            }
          }
        }
      }

      return p;
    });

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          programs,
          'Data program kerja menunggu persetujuan berhasil diambil',
        ),
      );
  },
);

export const updateWorkProgramApprovalStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = workProgramIdSchema.parse(req.params);
    const body = updateApprovalStatusSchema.parse(req.body);

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

    if (program.assignedApproverId !== authUser.id) {
      throw new ApiError(403, 'Anda tidak berhak mengubah status program kerja ini');
    }

    const dutyUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        role: true,
        additionalDuties: true,
      },
    });

    if (!dutyUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const duties = (dutyUser.additionalDuties || []).map((d: any) =>
      String(d).trim().toUpperCase(),
    );

    const isWakasekKurikulum =
      dutyUser.role === 'TEACHER' && duties.includes('WAKASEK_KURIKULUM');
    const isWakasekKesiswaan =
      dutyUser.role === 'TEACHER' && duties.includes('WAKASEK_KESISWAAN');
    const isPrincipal = dutyUser.role === 'PRINCIPAL';

    const updateData: any = {
      feedback: body.feedback ?? null,
    };

    if (isWakasekKesiswaan && program.additionalDuty === 'PEMBINA_EKSKUL') {
      updateData.approvalStatus = body.status;
      updateData.approvedById = authUser.id;
      updateData.approvedAt = new Date();
      updateData.isApproved = body.status === 'APPROVED';
      updateData.assignedApproverId = null;
    } else if (isWakasekKesiswaan && program.additionalDuty !== 'PEMBINA_EKSKUL') {
      throw new ApiError(
        403,
        'Wakasek Kesiswaan hanya dapat memproses program kerja Pembina Ekstrakurikuler',
      );
    } else if (isWakasekKurikulum && body.status === 'APPROVED' && !program.isApproved) {
      const principal = await prisma.user.findFirst({
        where: { role: 'PRINCIPAL' },
      });

      updateData.assignedApproverId = principal?.id ?? null;
      updateData.approvalStatus = 'PENDING';
      updateData.approvedById = authUser.id;
      updateData.approvedAt = new Date();
    } else if (isPrincipal || body.status === 'REJECTED') {
      updateData.approvalStatus = body.status;
      updateData.approvedById = authUser.id;
      updateData.approvedAt = new Date();
      updateData.isApproved = body.status === 'APPROVED';
      updateData.assignedApproverId = null;
    } else {
      throw new ApiError(403, 'Anda tidak memiliki akses untuk mengubah status program kerja ini');
    }

    const updated = await prisma.workProgram.update({
      where: { id },
      data: updateData,
    });

    res
      .status(200)
      .json(new ApiResponse(200, updated, 'Status program kerja berhasil diperbarui'));
  },
);
