import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { validateHistoricalStudentClassMembership } from '../utils/studentAcademicHistory';
import {
  ensureAcademicYearArchiveReadAccess,
  ensureAcademicYearArchiveWriteAccess,
} from '../utils/academicYearArchiveAccess';

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

const getBehaviorsSchema = z.object({
  classId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
  studentId: z.coerce.number().int().optional(),
  type: z.enum(['POSITIVE', 'NEGATIVE']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(10),
});

const principalBehaviorSummaryQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
});

export const getBehaviors = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId, studentId, type, search, page, limit } = getBehaviorsSchema.parse(req.query);
  const user = (req as any).user;

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId,
    module: 'BPBK',
    classId,
    studentId: studentId || null,
  });

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

export const getPrincipalBehaviorSummary = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId } = principalBehaviorSummaryQuerySchema.parse(req.query);
  const user = (req as any).user;

  let academicYear = null as any;

  if (academicYearId) {
    academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
  } else {
    academicYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });
  }

  if (!academicYear) {
    throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan');
  }

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: academicYear.id,
    module: 'BPBK',
  });

  const grouped = await prisma.studentBehavior.groupBy({
    by: ['classId', 'type'],
    where: {
      academicYearId: academicYear.id,
    },
    _count: {
      id: true,
    },
  });

  const classIds = Array.from(new Set(grouped.map((g) => g.classId)));

  const classes = await prisma.class.findMany({
    where: {
      id: {
        in: classIds,
      },
    },
    include: {
      major: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  const classMap = new Map<number, any>();
  classes.forEach((cls) => {
    classMap.set(cls.id, cls);
  });

  const summaryByClassMap = new Map<number, any>();
  const summaryByMajorMap = new Map<number, any>();

  grouped.forEach((g) => {
    const cls = classMap.get(g.classId);
    if (!cls) return;

    const existingClass = summaryByClassMap.get(g.classId) || {
      classId: cls.id,
      className: cls.name,
      major: cls.major
        ? {
            id: cls.major.id,
            name: cls.major.name,
            code: cls.major.code,
          }
        : null,
      positiveCount: 0,
      negativeCount: 0,
    };

    if (g.type === 'POSITIVE') {
      existingClass.positiveCount += g._count.id;
    } else if (g.type === 'NEGATIVE') {
      existingClass.negativeCount += g._count.id;
    }

    summaryByClassMap.set(g.classId, existingClass);

    if (existingClass.major) {
      const majorId = existingClass.major.id;
      const existingMajor = summaryByMajorMap.get(majorId) || {
        majorId,
        name: existingClass.major.name,
        code: existingClass.major.code,
        positiveCount: 0,
        negativeCount: 0,
      };

      if (g.type === 'POSITIVE') {
        existingMajor.positiveCount += g._count.id;
      } else if (g.type === 'NEGATIVE') {
        existingMajor.negativeCount += g._count.id;
      }

      summaryByMajorMap.set(majorId, existingMajor);
    }
  });

  const latestBehaviorsRaw = await prisma.studentBehavior.findMany({
    where: {
      academicYearId: academicYear.id,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nis: true,
          nisn: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
    orderBy: {
      date: 'desc',
    },
    take: 15,
  });

  const latestBehaviors = latestBehaviorsRaw.map((b) => ({
    id: b.id,
    date: b.date,
    type: b.type,
    category: b.category,
    description: b.description,
    point: b.point,
    student: b.student,
    class: {
      id: b.class.id,
      name: b.class.name,
    },
    major: b.class.major
      ? {
          id: b.class.major.id,
          name: b.class.major.name,
          code: b.class.major.code,
        }
      : null,
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: {
          id: academicYear.id,
          name: academicYear.name,
        },
        summaryByClass: Array.from(summaryByClassMap.values()),
        summaryByMajor: Array.from(summaryByMajorMap.values()),
        latestBehaviors,
      },
      'Ringkasan perilaku berhasil diambil',
    ),
  );
});

export const createBehavior = asyncHandler(async (req: Request, res: Response) => {
  const data = createBehaviorSchema.parse(req.body);
  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: data.academicYearId,
    module: 'BPBK',
  });
  const validation = await validateHistoricalStudentClassMembership({
    academicYearId: data.academicYearId,
    classId: data.classId,
    studentId: data.studentId,
  });

  if (!validation?.cls) {
    throw new ApiError(400, 'Kelas tidak valid untuk tahun ajaran yang dipilih');
  }

  if (!validation.student) {
    throw new ApiError(400, 'Siswa tidak valid pada kelas yang dipilih');
  }

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

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existing.academicYearId,
    module: 'BPBK',
  });

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

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existing.academicYearId,
    module: 'BPBK',
  });

  await prisma.studentBehavior.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Data perilaku berhasil dihapus'));
});
