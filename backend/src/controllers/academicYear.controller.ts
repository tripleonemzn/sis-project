import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import {
  applyAcademicYearRollover,
  createAcademicYearRolloverTarget,
  getAcademicYearRolloverWorkspace,
} from '../services/academicYearRollover.service';
import {
  commitAcademicPromotion,
  getAcademicPromotionWorkspace,
  rollbackAcademicPromotion,
  saveAcademicPromotionMappings,
} from '../services/academicPromotion.service';
import { writeAuditLog } from '../utils/auditLog';
import {
  getAcademicFeatureFlags,
  isAcademicPromotionV2Enabled,
  isAcademicYearRolloverEnabled,
} from '../config/featureFlags';

const academicYearSchema = z.object({
  name: z.string().min(1),
  semester1Start: z.string().transform(str => new Date(str)),
  semester1End: z.string().transform(str => new Date(str)),
  semester2Start: z.string().transform(str => new Date(str)),
  semester2End: z.string().transform(str => new Date(str)),
  isActive: z.boolean().optional(),
  pklEligibleGrades: z.string().optional().nullable(),
});

const updateAcademicYearSchema = academicYearSchema.partial();
const promotionWorkspaceQuerySchema = z.object({
  targetAcademicYearId: z.coerce.number().int().positive(),
});
const rolloverTargetPayloadSchema = z.object({
  name: z.string().min(1).optional(),
  semester1Start: z.string().transform((value) => new Date(value)).optional(),
  semester1End: z.string().transform((value) => new Date(value)).optional(),
  semester2Start: z.string().transform((value) => new Date(value)).optional(),
  semester2End: z.string().transform((value) => new Date(value)).optional(),
});
const rolloverWorkspaceQuerySchema = z.object({
  targetAcademicYearId: z.coerce.number().int().positive(),
});
const rolloverComponentSelectionSchema = z.object({
  classPreparation: z.boolean().optional(),
  teacherAssignments: z.boolean().optional(),
  scheduleTimeConfig: z.boolean().optional(),
  academicEvents: z.boolean().optional(),
  reportDates: z.boolean().optional(),
  subjectKkms: z.boolean().optional(),
  examGradeComponents: z.boolean().optional(),
  examProgramConfigs: z.boolean().optional(),
  examProgramSessions: z.boolean().optional(),
});
const applyRolloverSchema = z.object({
  targetAcademicYearId: z.number().int().positive(),
  components: rolloverComponentSelectionSchema.optional(),
});
const savePromotionMappingsSchema = z.object({
  targetAcademicYearId: z.number().int().positive(),
  mappings: z.array(
    z.object({
      sourceClassId: z.number().int().positive(),
      targetClassId: z.number().int().positive().nullable(),
    }),
  ),
});
const commitPromotionSchema = z.object({
  targetAcademicYearId: z.number().int().positive(),
  activateTargetYear: z.boolean().optional(),
});
const ACTIVE_ACADEMIC_YEAR_CACHE_TTL_MS = 10000;
let activeAcademicYearCache:
  | {
      expiresAt: number;
      payload: unknown;
    }
  | null = null;

function clearActiveAcademicYearCache() {
  activeAcademicYearCache = null;
}

function getActiveAcademicYearCache(): unknown | null {
  if (!activeAcademicYearCache) return null;
  if (activeAcademicYearCache.expiresAt <= Date.now()) {
    activeAcademicYearCache = null;
    return null;
  }
  return activeAcademicYearCache.payload;
}

function setActiveAcademicYearCache(payload: unknown) {
  activeAcademicYearCache = {
    payload,
    expiresAt: Date.now() + ACTIVE_ACADEMIC_YEAR_CACHE_TTL_MS,
  };
}

function assertAcademicPromotionV2Enabled() {
  if (!isAcademicPromotionV2Enabled()) {
    throw new ApiError(403, 'Fitur kenaikan dan kelulusan belum diaktifkan di server.');
  }
}

function assertAcademicYearRolloverEnabled() {
  if (!isAcademicYearRolloverEnabled()) {
    throw new ApiError(403, 'Fitur salin data tahun ajaran belum diaktifkan di server.');
  }
}

export const getAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, isActive, search } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }
  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }

  const [total, academicYears] = await Promise.all([
    prisma.academicYear.count({ where }),
    prisma.academicYear.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { id: 'desc' },
    }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    academicYears,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  }, 'Data tahun akademik berhasil diambil'));
});

export const getActiveAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const cachedPayload = getActiveAcademicYearCache();
  if (cachedPayload) {
    res.setHeader('Cache-Control', 'private, max-age=10');
    return res.status(200).json(new ApiResponse(200, cachedPayload, 'Tahun akademik aktif berhasil diambil'));
  }

  const academicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    include: {
      _count: {
        select: {
          classes: true,
          teacherAssignments: true,
        },
      },
    },
  });

  if (!academicYear) {
    throw new ApiError(404, 'Tidak ada tahun akademik aktif');
  }

  const now = new Date();
  let currentSemester = 'ODD'; // Default

  if (now >= academicYear.semester2Start && now <= academicYear.semester2End) {
    currentSemester = 'EVEN';
  } else if (now > academicYear.semester1End && now < academicYear.semester2Start) {
    // In between semesters (holiday), usually considered part of next or prev?
    // Let's assume based on proximity or just check if it's NOT semester 1 time.
    // Standard logic: if after sem 1 end, it's likely leading to even semester or is even.
    // But safely:
    currentSemester = 'EVEN';
  } else {
    currentSemester = 'ODD';
  }

  const payload = { ...academicYear, semester: currentSemester };
  setActiveAcademicYearCache(payload);
  res.setHeader('Cache-Control', 'private, max-age=10');

  res.status(200).json(new ApiResponse(200, payload, 'Tahun akademik aktif berhasil diambil'));
});

export const getAcademicYearById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: {
          classes: true,
          teacherAssignments: true,
        },
      },
    },
  });

  if (!academicYear) {
    throw new ApiError(404, 'Tahun akademik tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, academicYear, 'Tahun akademik berhasil diambil'));
});

export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const body = academicYearSchema.parse(req.body);

  const existingYear = await prisma.academicYear.findFirst({
    where: { name: body.name },
  });

  if (existingYear) {
    throw new ApiError(409, 'Tahun akademik dengan nama ini sudah ada');
  }

  // Validate dates
  if (body.semester1Start >= body.semester1End) {
    throw new ApiError(400, 'Tanggal mulai Semester 1 harus sebelum tanggal berakhir');
  }
  if (body.semester2Start >= body.semester2End) {
    throw new ApiError(400, 'Tanggal mulai Semester 2 harus sebelum tanggal berakhir');
  }
  if (body.semester1End >= body.semester2Start) {
    throw new ApiError(400, 'Semester 1 harus berakhir sebelum Semester 2 dimulai');
  }

  // If isActive is true, set all other academic years to inactive
  if (body.isActive) {
    await prisma.academicYear.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  const academicYear = await prisma.academicYear.create({
    // Cast to any to align with current generated types during transition
    data: {
      name: body.name,
      semester1Start: body.semester1Start,
      semester1End: body.semester1End,
      semester2Start: body.semester2Start,
      semester2End: body.semester2End,
      isActive: body.isActive || false,
      pklEligibleGrades: body.pklEligibleGrades,
    } as any,
  });
  clearActiveAcademicYearCache();

  res.status(201).json(new ApiResponse(201, academicYear, 'Tahun akademik berhasil dibuat'));
});

export const updateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateAcademicYearSchema.parse(req.body);

  const existingYear = await prisma.academicYear.findUnique({
    where: { id: Number(id) },
  });

  if (!existingYear) {
    throw new ApiError(404, 'Tahun akademik tidak ditemukan');
  }

  if (body.name && body.name !== existingYear.name) {
    const nameExists = await prisma.academicYear.findFirst({
      where: { name: body.name },
    });
    if (nameExists) {
      throw new ApiError(409, 'Tahun akademik dengan nama ini sudah ada');
    }
  }

  // When updating any date fields, all must be provided to validate order
  const hasDateUpdates = body.semester1Start || body.semester1End || body.semester2Start || body.semester2End;
  if (hasDateUpdates) {
    if (!body.semester1Start || !body.semester1End || !body.semester2Start || !body.semester2End) {
      throw new ApiError(400, 'Semua tanggal semester harus diisi saat update');
    }
    const sem1Start = body.semester1Start;
    const sem1End = body.semester1End;
    const sem2Start = body.semester2Start;
    const sem2End = body.semester2End;
    if (sem1Start >= sem1End) {
      throw new ApiError(400, 'Tanggal mulai Semester 1 harus sebelum tanggal berakhir');
    }
    if (sem2Start >= sem2End) {
      throw new ApiError(400, 'Tanggal mulai Semester 2 harus sebelum tanggal berakhir');
    }
    if (sem1End >= sem2Start) {
      throw new ApiError(400, 'Semester 1 harus berakhir sebelum Semester 2 dimulai');
    }
  }

  if (body.isActive && !existingYear.isActive) {
    await prisma.academicYear.updateMany({
      where: { 
        isActive: true,
        id: { not: Number(id) }
      },
      data: { isActive: false },
    });
  }

  const updatedYear = await prisma.academicYear.update({
    where: { id: Number(id) },
    data: body as any,
  });
  clearActiveAcademicYearCache();

  res.status(200).json(new ApiResponse(200, updatedYear, 'Tahun akademik berhasil diperbarui'));
});

export const deleteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: Number(id) },
    include: {
      _count: {
        select: {
          classes: true,
          teacherAssignments: true,
        },
      },
    },
  });

  if (!academicYear) {
    throw new ApiError(404, 'Tahun akademik tidak ditemukan');
  }

  if (academicYear._count.classes > 0 || academicYear._count.teacherAssignments > 0) {
    throw new ApiError(400, 'Tidak dapat menghapus tahun akademik yang memiliki kelas atau penugasan guru');
  }

  await prisma.academicYear.delete({
    where: { id: Number(id) },
  });
  clearActiveAcademicYearCache();

  res.status(200).json(new ApiResponse(200, null, 'Tahun akademik berhasil dihapus'));
});

export const activateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: Number(id) },
  });

  if (!academicYear) {
    throw new ApiError(404, 'Tahun akademik tidak ditemukan');
  }

  await prisma.academicYear.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  const updatedYear = await prisma.academicYear.update({
    where: { id: Number(id) },
    data: { isActive: true },
  });
  clearActiveAcademicYearCache();

  res.status(200).json(new ApiResponse(200, updatedYear, 'Tahun akademik berhasil diaktifkan'));
});

export const updatePklConfig = asyncHandler(async (req: Request, res: Response) => {
  const { pklEligibleGrades } = req.body;
  const userPayload = (req as any).user;

  // Fetch full user data to get additionalDuties
  const user = await prisma.user.findUnique({
    where: { id: userPayload.id },
    select: { id: true, role: true, additionalDuties: true }
  });

  if (!user) {
    throw new ApiError(401, 'User tidak ditemukan');
  }

  // Check permission: Admin OR Wakasek Humas
  const isHumas = user.role === 'TEACHER' && user.additionalDuties?.includes('WAKASEK_HUMAS');
  if (user.role !== 'ADMIN' && !isHumas) {
    throw new ApiError(403, 'Anda tidak memiliki akses untuk mengubah konfigurasi PKL');
  }

  // Validate input: allow XI, XII (comma separated)
  if (pklEligibleGrades) {
    const grades = pklEligibleGrades.split(',').map((g: string) => g.trim());
    const validGrades = ['XI', 'XII'];
    const isValid = grades.every((g: string) => validGrades.includes(g));
    
    if (!isValid) {
      throw new ApiError(400, 'Tingkat kelas tidak valid. Gunakan XI atau XII (pisahkan dengan koma).');
    }
  }

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    throw new ApiError(404, 'Tidak ada tahun ajaran aktif');
  }

  const updatedYear = await prisma.academicYear.update({
    where: { id: activeYear.id },
    data: { pklEligibleGrades } as any,
  });
  clearActiveAcademicYearCache();

  res.status(200).json(new ApiResponse(200, updatedYear, 'Konfigurasi PKL berhasil diperbarui'));
});

export const getAcademicFeatureFlagsController = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(
    new ApiResponse(200, getAcademicFeatureFlags(), 'Feature flag akademik berhasil diambil'),
  );
});

export const createAcademicYearRolloverTargetController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicYearRolloverEnabled();
  const { id } = req.params;
  const actor = (req as any).user;
  const payload = rolloverTargetPayloadSchema.parse(req.body || {});

  const result = await createAcademicYearRolloverTarget({
    sourceAcademicYearId: Number(id),
    payload,
  });

  try {
    if (actor?.id) {
      const actorUser = await prisma.user.findUnique({
        where: { id: Number(actor.id) },
        select: {
          id: true,
          role: true,
          additionalDuties: true,
        },
      });

      if (actorUser) {
        await writeAuditLog(
          actorUser.id,
          String(actorUser.role || 'ADMIN'),
          Array.isArray(actorUser.additionalDuties) ? actorUser.additionalDuties : null,
          result.created ? 'CREATE_TARGET' : 'REUSE_TARGET',
          'ACADEMIC_YEAR_ROLLOVER',
          result.targetAcademicYear.id,
          null,
          {
            sourceAcademicYearId: Number(id),
            targetAcademicYearId: result.targetAcademicYear.id,
            created: result.created,
            notes: result.notes,
          },
          'Membuat atau memakai draft tahun ajaran target untuk rollover',
        );
      }
    }
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat create target academic rollover', auditError);
  }

  res.status(result.created ? 201 : 200).json(
    new ApiResponse(
      result.created ? 201 : 200,
      result,
      result.created ? 'Tahun ajaran baru berhasil dibuat' : 'Tahun ajaran baru sudah tersedia',
    ),
  );
});

export const getAcademicYearRolloverWorkspaceController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicYearRolloverEnabled();
  const { id } = req.params;
  const query = rolloverWorkspaceQuerySchema.parse(req.query);

  const workspace = await getAcademicYearRolloverWorkspace(Number(id), query.targetAcademicYearId);

  res.status(200).json(
    new ApiResponse(200, workspace, 'Data salin tahun sebelumnya berhasil diambil'),
  );
});

export const applyAcademicYearRolloverController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicYearRolloverEnabled();
  const { id } = req.params;
  const actor = (req as any).user;
  const body = applyRolloverSchema.parse(req.body);

  const result = await applyAcademicYearRollover({
    sourceAcademicYearId: Number(id),
    targetAcademicYearId: body.targetAcademicYearId,
    components: body.components,
    actor,
  });

  try {
    if (actor?.id) {
      const actorUser = await prisma.user.findUnique({
        where: { id: Number(actor.id) },
        select: {
          id: true,
          role: true,
          additionalDuties: true,
        },
      });

      if (actorUser) {
        await writeAuditLog(
          actorUser.id,
          String(actorUser.role || 'ADMIN'),
          Array.isArray(actorUser.additionalDuties) ? actorUser.additionalDuties : null,
          'APPLY',
          'ACADEMIC_YEAR_ROLLOVER',
          result.targetAcademicYear.id,
          null,
          {
            sourceAcademicYearId: Number(id),
            targetAcademicYearId: result.targetAcademicYear.id,
            applied: result.applied,
          },
          'Menerapkan clone setup tahun ajaran sebelum promotion',
        );
      }
    }
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat apply academic rollover', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, result, 'Data tahun ajaran baru berhasil disalin'),
  );
});

export const getAcademicPromotionWorkspaceController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicPromotionV2Enabled();
  const { id } = req.params;
  const query = promotionWorkspaceQuerySchema.parse(req.query);

  const workspace = await getAcademicPromotionWorkspace(Number(id), query.targetAcademicYearId);

  res.status(200).json(
    new ApiResponse(200, workspace, 'Data kenaikan dan kelulusan berhasil diambil'),
  );
});

export const saveAcademicPromotionMappingsController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicPromotionV2Enabled();
  const { id } = req.params;
  const body = savePromotionMappingsSchema.parse(req.body);

  const workspace = await saveAcademicPromotionMappings({
    sourceAcademicYearId: Number(id),
    targetAcademicYearId: body.targetAcademicYearId,
    mappings: body.mappings,
  });

  res.status(200).json(
    new ApiResponse(200, workspace, 'Tujuan kelas berhasil disimpan'),
  );
});

export const commitAcademicPromotionController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicPromotionV2Enabled();
  const { id } = req.params;
  const body = commitPromotionSchema.parse(req.body);
  const actor = (req as any).user;

  const result = await commitAcademicPromotion({
    sourceAcademicYearId: Number(id),
    targetAcademicYearId: body.targetAcademicYearId,
    activateTargetYear: body.activateTargetYear,
    actor,
  });

  clearActiveAcademicYearCache();

  try {
    if (actor?.id) {
      await writeAuditLog(
        Number(actor.id),
        String(actor.role || 'ADMIN'),
        Array.isArray(actor.additionalDuties) ? actor.additionalDuties : null,
        'COMMIT',
        'ACADEMIC_PROMOTION',
        result.run.id,
        null,
        {
          sourceAcademicYearId: Number(id),
          targetAcademicYearId: body.targetAcademicYearId,
          activateTargetYear: Boolean(body.activateTargetYear),
          summary: result.summary,
        },
        'Commit promotion kenaikan kelas dan alumni',
      );
    }
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat commit academic promotion', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, result, 'Kenaikan dan kelulusan berhasil diproses'),
  );
});

export const rollbackAcademicPromotionController = asyncHandler(async (req: Request, res: Response) => {
  assertAcademicPromotionV2Enabled();
  const { id, runId } = req.params;
  const actor = (req as any).user;

  const actorUser = actor?.id
    ? await prisma.user.findUnique({
        where: { id: Number(actor.id) },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          additionalDuties: true,
        },
      })
    : null;

  const result = await rollbackAcademicPromotion({
    runId: Number(runId),
    sourceAcademicYearId: Number(id),
    actor: actorUser
      ? {
          id: actorUser.id,
          name: actorUser.name,
          username: actorUser.username,
        }
      : actor,
  });

  clearActiveAcademicYearCache();

  try {
    if (actorUser?.id) {
      await writeAuditLog(
        actorUser.id,
        String(actorUser.role || 'ADMIN'),
        Array.isArray(actorUser.additionalDuties) ? actorUser.additionalDuties : null,
        'ROLLBACK',
        'ACADEMIC_PROMOTION',
        Number(runId),
        null,
        {
          sourceAcademicYearId: Number(id),
          targetAcademicYearId: result.run.targetAcademicYearId,
          rollback: result.rollback,
        },
        'Rollback promotion kenaikan kelas dan alumni',
      );
    }
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat rollback academic promotion', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, result, 'Proses kenaikan dan kelulusan berhasil dibatalkan'),
  );
});

export const promoteAcademicYear = asyncHandler(async (_req: Request, _res: Response) => {
  throw new ApiError(
    410,
    'Endpoint kenaikan kelas lama sudah dinonaktifkan demi keamanan data. Gunakan alur Tahun Ajaran Baru: Salin Data Tahun Sebelumnya, simpan Tujuan Kelas, lalu Proses Kenaikan & Kelulusan.',
  );
});
