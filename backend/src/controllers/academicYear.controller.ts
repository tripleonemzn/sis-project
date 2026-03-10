import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

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

export const promoteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newAcademicYearId } = req.body as { newAcademicYearId: number };

  const currentYear = await prisma.academicYear.findUnique({
    where: { id: Number(id) },
    include: { classes: true },
  });
  if (!currentYear) {
    throw new ApiError(404, 'Tahun akademik (saat ini) tidak ditemukan');
  }

  const newYear = await prisma.academicYear.findUnique({
    where: { id: Number(newAcademicYearId) },
    include: { classes: true },
  });
  if (!newYear) {
    throw new ApiError(404, 'Tahun akademik (baru) tidak ditemukan');
  }

  const newYearClassesByKey = new Map<string, { id: number }>();
  for (const c of newYear.classes) {
    // key: majorId-level
    // @ts-ignore majorId exists on Class
    newYearClassesByKey.set(`${c.majorId}-${c.level}`, { id: c.id });
  }

  const promotionSummary: { moved: number; graduated: number; errors: string[] } = {
    moved: 0,
    graduated: 0,
    errors: [],
  };

  // Promote X->XI and XI->XII, Graduate XII
  for (const c of currentYear.classes) {
    // @ts-ignore access fields present on Class
    const keyMajorId = c.majorId;
    const level = c.level;

    if (level === 'X' || level === 'XI') {
      const nextLevel = level === 'X' ? 'XI' : 'XII';
      const target = newYearClassesByKey.get(`${keyMajorId}-${nextLevel}`);
      if (!target) {
        promotionSummary.errors.push(`Kelas target tidak ditemukan untuk majorId=${keyMajorId} level=${nextLevel}`);
        continue;
      }
      const result = await prisma.user.updateMany({
        where: { classId: c.id, role: 'STUDENT' },
        data: { classId: target.id },
      });
      promotionSummary.moved += result.count;
    } else if (level === 'XII') {
      const result = await prisma.user.updateMany({
        where: { classId: c.id, role: 'STUDENT' },
        data: { classId: null, studentStatus: 'GRADUATED' },
      });
      promotionSummary.graduated += result.count;
    }
  }

  res.status(200).json(new ApiResponse(200, promotionSummary, 'Proses kenaikan kelas selesai'));
});
