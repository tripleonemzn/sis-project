import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import {
  listHistoricalStudentsByIds,
  resolveHistoricalStudentScope,
  validateHistoricalStudentClassMembership,
} from '../utils/studentAcademicHistory';

const optionalDateSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}, z.date().optional());

const baseQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
  classId: z.coerce.number().int().optional(),
});

const principalSummaryQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
});

const behaviorListQuerySchema = baseQuerySchema.extend({
  studentId: z.coerce.number().int().optional(),
  type: z.enum(['POSITIVE', 'NEGATIVE']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const permissionListQuerySchema = baseQuerySchema.extend({
  studentId: z.coerce.number().int().optional(),
  type: z.enum(['SICK', 'PERMISSION', 'OTHER']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const counselingListQuerySchema = baseQuerySchema.extend({
  studentId: z.coerce.number().int().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']).optional(),
  summonParent: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const counselingCreateSchema = z.object({
  academicYearId: z.number().int().optional(),
  classId: z.number().int(),
  studentId: z.number().int(),
  behaviorId: z.number().int().optional(),
  sessionDate: z.string().transform((value) => new Date(value)),
  issueSummary: z.string().trim().min(1),
  counselingNote: z.string().trim().optional(),
  followUpPlan: z.string().trim().optional(),
  summonParent: z.boolean().optional().default(false),
  summonDate: optionalDateSchema,
  summonLetterNumber: z.string().trim().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']).optional().default('OPEN'),
});

const counselingUpdateSchema = z.object({
  classId: z.number().int().optional(),
  studentId: z.number().int().optional(),
  behaviorId: z.number().int().nullable().optional(),
  sessionDate: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  issueSummary: z.string().trim().min(1).optional(),
  counselingNote: z.string().trim().optional(),
  followUpPlan: z.string().trim().optional(),
  summonParent: z.boolean().optional(),
  summonDate: optionalDateSchema,
  summonLetterNumber: z.string().trim().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']).optional(),
});

async function resolveAcademicYearId(inputAcademicYearId?: number) {
  if (inputAcademicYearId) {
    const year = await prisma.academicYear.findUnique({
      where: { id: inputAcademicYearId },
      select: { id: true, name: true },
    });
    if (!year) throw new ApiError(404, 'Tahun ajaran tidak ditemukan');
    return year;
  }

  const active = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!active) throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan');
  return active;
}

async function ensureClassAndStudentValid(params: {
  classId: number;
  studentId: number;
  academicYearId: number;
}) {
  const validation = await validateHistoricalStudentClassMembership(params);
  if (!validation?.cls) {
    throw new ApiError(400, 'Kelas tidak valid untuk tahun ajaran yang dipilih.');
  }
  if (!validation.student) {
    throw new ApiError(400, 'Siswa tidak valid pada kelas yang dipilih.');
  }

  return validation;
}

async function ensureBehaviorValid(params: {
  behaviorId: number;
  studentId: number;
  classId: number;
  academicYearId: number;
}) {
  const behavior = await prisma.studentBehavior.findFirst({
    where: {
      id: params.behaviorId,
      studentId: params.studentId,
      classId: params.classId,
      academicYearId: params.academicYearId,
    },
    select: { id: true },
  });

  if (!behavior) {
    throw new ApiError(400, 'Referensi kasus perilaku tidak valid.');
  }
}

export const getBpBkSummary = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId } = baseQuerySchema.parse(req.query);
  const activeYear = await resolveAcademicYearId(academicYearId);
  const permissionStudentScope = await resolveHistoricalStudentScope({
    academicYearId: activeYear.id,
    classId: classId || null,
  });

  const behaviorWhere: any = {
    academicYearId: activeYear.id,
    ...(classId ? { classId } : {}),
  };

  const permissionWhere: any = {
    academicYearId: activeYear.id,
    ...(classId
      ? {
          studentId: {
            in: permissionStudentScope.studentIds.length > 0 ? permissionStudentScope.studentIds : [-1],
          },
        }
      : {}),
  };

  const counselingWhere: any = {
    academicYearId: activeYear.id,
    ...(classId ? { classId } : {}),
  };

  const monthlyStart = new Date();
  monthlyStart.setDate(1);
  monthlyStart.setHours(0, 0, 0, 0);

  const monthlyEnd = new Date(monthlyStart);
  monthlyEnd.setMonth(monthlyEnd.getMonth() + 1);

  const [
    totalCases,
    positiveCases,
    negativeCases,
    negativeCasesThisMonth,
    pendingPermissions,
    approvedPermissions,
    rejectedPermissions,
    openCounselings,
    inProgressCounselings,
    closedCounselings,
    summonPendingCounselings,
    recentBehaviors,
    recentPermissionsRaw,
    recentCounselings,
    riskAggregation,
  ] = await Promise.all([
    prisma.studentBehavior.count({ where: behaviorWhere }),
    prisma.studentBehavior.count({ where: { ...behaviorWhere, type: 'POSITIVE' } }),
    prisma.studentBehavior.count({ where: { ...behaviorWhere, type: 'NEGATIVE' } }),
    prisma.studentBehavior.count({
      where: {
        ...behaviorWhere,
        type: 'NEGATIVE',
        date: { gte: monthlyStart, lt: monthlyEnd },
      },
    }),
    prisma.studentPermission.count({ where: { ...permissionWhere, status: 'PENDING' } }),
    prisma.studentPermission.count({ where: { ...permissionWhere, status: 'APPROVED' } }),
    prisma.studentPermission.count({ where: { ...permissionWhere, status: 'REJECTED' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, status: 'OPEN' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, status: 'IN_PROGRESS' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, status: 'CLOSED' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, summonParent: true, status: { not: 'CLOSED' } } }),
    prisma.studentBehavior.findMany({
      where: behaviorWhere,
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
          },
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 8,
    }),
    prisma.studentPermission.findMany({
      where: permissionWhere,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: { id: true, name: true },
            },
          },
        },
        approvedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
    }),
    prisma.bpBkCounseling.findMany({
      where: counselingWhere,
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
          },
        },
      },
      orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
      take: 8,
    }),
    prisma.studentBehavior.groupBy({
      by: ['studentId'],
      where: {
        ...behaviorWhere,
        type: 'NEGATIVE',
      },
      _count: { id: true },
      _sum: { point: true },
    }),
  ]);

  const highRiskStudents = riskAggregation.filter(
    (item) => (item._sum.point ?? 0) >= 20 || (item._count.id ?? 0) >= 3,
  ).length;

  const recentPermissions = recentPermissionsRaw.map((permission) => {
    const historicalStudent = permissionStudentScope.studentMap.get(permission.studentId);
    return {
      ...permission,
      student: permission.student
        ? {
            ...permission.student,
            studentClass: historicalStudent?.studentClass
              ? {
                  id: historicalStudent.studentClass.id,
                  name: historicalStudent.studentClass.name,
                }
              : permission.student.studentClass || null,
          }
        : null,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeYear,
        summary: {
          totalCases,
          positiveCases,
          negativeCases,
          negativeCasesThisMonth,
          highRiskStudents,
          pendingPermissions,
          approvedPermissions,
          rejectedPermissions,
          openCounselings,
          inProgressCounselings,
          closedCounselings,
          summonPendingCounselings,
        },
        recentBehaviors,
        recentPermissions,
        recentCounselings,
      },
      'Ringkasan BP/BK berhasil diambil',
    ),
  );
});

export const getBpBkPrincipalSummary = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId } = principalSummaryQuerySchema.parse(req.query);
  const activeYear = await resolveAcademicYearId(academicYearId);

  const behaviorWhere: any = { academicYearId: activeYear.id };
  const counselingWhere: any = { academicYearId: activeYear.id };

  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 7);
  overdueDate.setHours(23, 59, 59, 999);

  const [
    totalCases,
    negativeCases,
    openCounselings,
    inProgressCounselings,
    closedCounselings,
    summonPendingCounselings,
    overdueCounselings,
    riskAggregation,
    overdueCounselingRows,
  ] = await Promise.all([
    prisma.studentBehavior.count({ where: behaviorWhere }),
    prisma.studentBehavior.count({ where: { ...behaviorWhere, type: 'NEGATIVE' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, status: 'OPEN' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, status: 'IN_PROGRESS' } }),
    prisma.bpBkCounseling.count({ where: { ...counselingWhere, status: 'CLOSED' } }),
    prisma.bpBkCounseling.count({
      where: { ...counselingWhere, summonParent: true, status: { not: 'CLOSED' } },
    }),
    prisma.bpBkCounseling.count({
      where: {
        ...counselingWhere,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        sessionDate: { lte: overdueDate },
      },
    }),
    prisma.studentBehavior.groupBy({
      by: ['studentId'],
      where: {
        ...behaviorWhere,
        type: 'NEGATIVE',
      },
      _count: { id: true },
      _sum: { point: true },
    }),
    prisma.bpBkCounseling.findMany({
      where: {
        ...counselingWhere,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        sessionDate: { lte: overdueDate },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        counselor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
      orderBy: [{ sessionDate: 'asc' }, { id: 'asc' }],
      take: 12,
    }),
  ]);

  const highRiskAggregation = riskAggregation
    .filter((item) => (item._sum.point ?? 0) >= 20 || (item._count.id ?? 0) >= 3)
    .sort((a, b) => {
      const pointDiff = (b._sum.point ?? 0) - (a._sum.point ?? 0);
      if (pointDiff !== 0) return pointDiff;
      return (b._count.id ?? 0) - (a._count.id ?? 0);
    });

  const highRiskStudentIds = highRiskAggregation.map((item) => item.studentId);
  const highRiskStudentsMap = new Map<number, {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
    studentClass: { id: number; name: string } | null;
  }>();

  if (highRiskStudentIds.length > 0) {
    const students = await listHistoricalStudentsByIds(highRiskStudentIds, activeYear.id);

    students.forEach((student) => {
      highRiskStudentsMap.set(student.id, student);
    });
  }

  const highRiskStudents = highRiskAggregation.map((item) => {
    const student = highRiskStudentsMap.get(item.studentId);
    return {
      studentId: item.studentId,
      studentName: student?.name || '-',
      nis: student?.nis || null,
      nisn: student?.nisn || null,
      className: student?.studentClass?.name || null,
      negativeCaseCount: item._count.id ?? 0,
      totalNegativePoint: item._sum.point ?? 0,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeYear,
        summary: {
          totalCases,
          negativeCases,
          highRiskStudents: highRiskStudents.length,
          openCounselings,
          inProgressCounselings,
          closedCounselings,
          summonPendingCounselings,
          overdueCounselings,
        },
        highRiskStudents: highRiskStudents.slice(0, 12),
        overdueCounselings: overdueCounselingRows.map((row) => ({
          id: row.id,
          sessionDate: row.sessionDate,
          status: row.status,
          issueSummary: row.issueSummary,
          summonParent: row.summonParent,
          summonDate: row.summonDate,
          student: {
            id: row.student.id,
            name: row.student.name,
            nis: row.student.nis,
            nisn: row.student.nisn,
            className: row.class?.name || row.student.studentClass?.name || null,
          },
          counselor: row.counselor,
        })),
      },
      'Ringkasan BP/BK principal berhasil diambil',
    ),
  );
});

export const getBpBkBehaviors = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId, studentId, type, search, page, limit } = behaviorListQuerySchema.parse(req.query);
  const activeYear = await resolveAcademicYearId(academicYearId);
  const skip = (page - 1) * limit;

  const where: any = {
    academicYearId: activeYear.id,
    ...(classId ? { classId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(type ? { type } : {}),
  };

  if (search) {
    where.OR = [
      { category: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { student: { name: { contains: search, mode: 'insensitive' } } },
      { student: { nis: { contains: search, mode: 'insensitive' } } },
      { student: { nisn: { contains: search, mode: 'insensitive' } } },
    ];
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
            photo: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            major: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.studentBehavior.count({ where }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeYear,
        behaviors,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Daftar kasus perilaku BP/BK berhasil diambil',
    ),
  );
});

export const getBpBkPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId, studentId, type, status, search, page, limit } = permissionListQuerySchema.parse(req.query);
  const activeYear = await resolveAcademicYearId(academicYearId);
  const skip = (page - 1) * limit;
  const searchText = String(search || '').trim();
  const permissionStudentScope = await resolveHistoricalStudentScope({
    academicYearId: activeYear.id,
    classId: classId || null,
    studentId: studentId || null,
    search: searchText || null,
  });

  const where: any = {
    academicYearId: activeYear.id,
    ...(studentId ? { studentId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };

  if (classId) {
    where.studentId = {
      in: permissionStudentScope.studentIds.length > 0 ? permissionStudentScope.studentIds : [-1],
    };
  }

  if (searchText) {
    where.OR = [
      { reason: { contains: searchText, mode: 'insensitive' } },
      ...(permissionStudentScope.studentIds.length > 0
        ? [
            {
              studentId: {
                in: permissionStudentScope.studentIds,
              },
            },
          ]
        : []),
    ];

    if (!where.OR.length) {
      where.studentId = {
        in: [-1],
      };
    }
  }

  const [permissionsRaw, total] = await Promise.all([
    prisma.studentPermission.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: { id: true, name: true },
            },
          },
        },
        approvedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.studentPermission.count({ where }),
  ]);

  const permissions = permissionsRaw.map((permission) => {
    const historicalStudent = permissionStudentScope.studentMap.get(permission.studentId);
    return {
      ...permission,
      student: permission.student
        ? {
            ...permission.student,
            studentClass: historicalStudent?.studentClass
              ? {
                  id: historicalStudent.studentClass.id,
                  name: historicalStudent.studentClass.name,
                }
              : permission.student.studentClass || null,
          }
        : null,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeYear,
        permissions,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Daftar perizinan BP/BK berhasil diambil',
    ),
  );
});

export const getBpBkCounselings = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId, studentId, status, summonParent, search, page, limit } = counselingListQuerySchema.parse(req.query);
  const activeYear = await resolveAcademicYearId(academicYearId);
  const skip = (page - 1) * limit;

  const where: any = {
    academicYearId: activeYear.id,
    ...(classId ? { classId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(status ? { status } : {}),
    ...(summonParent === undefined ? {} : { summonParent }),
  };

  if (search) {
    where.OR = [
      { issueSummary: { contains: search, mode: 'insensitive' } },
      { counselingNote: { contains: search, mode: 'insensitive' } },
      { followUpPlan: { contains: search, mode: 'insensitive' } },
      { summonLetterNumber: { contains: search, mode: 'insensitive' } },
      { student: { name: { contains: search, mode: 'insensitive' } } },
      { student: { nis: { contains: search, mode: 'insensitive' } } },
      { student: { nisn: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [counselings, total] = await Promise.all([
    prisma.bpBkCounseling.findMany({
      where,
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
          select: { id: true, name: true },
        },
        counselor: {
          select: { id: true, name: true, username: true },
        },
        behavior: {
          select: { id: true, category: true, description: true, type: true },
        },
      },
      orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.bpBkCounseling.count({ where }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeYear,
        counselings,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Daftar konseling BP/BK berhasil diambil',
    ),
  );
});

export const createBpBkCounseling = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const payload = counselingCreateSchema.parse(req.body);

  const activeYear = await resolveAcademicYearId(payload.academicYearId);
  await ensureClassAndStudentValid({
    classId: payload.classId,
    studentId: payload.studentId,
    academicYearId: activeYear.id,
  });

  if (payload.behaviorId) {
    await ensureBehaviorValid({
      behaviorId: payload.behaviorId,
      studentId: payload.studentId,
      classId: payload.classId,
      academicYearId: activeYear.id,
    });
  }

  const counseling = await prisma.bpBkCounseling.create({
    data: {
      classId: payload.classId,
      studentId: payload.studentId,
      academicYearId: activeYear.id,
      counselorId: user.id,
      behaviorId: payload.behaviorId,
      sessionDate: payload.sessionDate,
      issueSummary: payload.issueSummary,
      counselingNote: payload.counselingNote,
      followUpPlan: payload.followUpPlan,
      summonParent: payload.summonParent,
      summonDate: payload.summonParent ? payload.summonDate : undefined,
      summonLetterNumber: payload.summonParent ? payload.summonLetterNumber : undefined,
      status: payload.status,
    },
    include: {
      student: { select: { id: true, name: true, nis: true, nisn: true } },
      class: { select: { id: true, name: true } },
      counselor: { select: { id: true, name: true } },
    },
  });

  res.status(201).json(new ApiResponse(201, counseling, 'Data konseling BP/BK berhasil dibuat'));
});

export const updateBpBkCounseling = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new ApiError(400, 'ID konseling tidak valid');
  }

  const payload = counselingUpdateSchema.parse(req.body);
  const existing = await prisma.bpBkCounseling.findUnique({ where: { id } });

  if (!existing) {
    throw new ApiError(404, 'Data konseling tidak ditemukan');
  }

  const nextClassId = payload.classId ?? existing.classId;
  const nextStudentId = payload.studentId ?? existing.studentId;

  await ensureClassAndStudentValid({
    classId: nextClassId,
    studentId: nextStudentId,
    academicYearId: existing.academicYearId,
  });

  const nextBehaviorId = payload.behaviorId === null ? undefined : payload.behaviorId;
  if (nextBehaviorId !== undefined) {
    await ensureBehaviorValid({
      behaviorId: nextBehaviorId,
      studentId: nextStudentId,
      classId: nextClassId,
      academicYearId: existing.academicYearId,
    });
  }

  const shouldSummonParent = payload.summonParent ?? existing.summonParent;

  const updated = await prisma.bpBkCounseling.update({
    where: { id },
    data: {
      classId: payload.classId,
      studentId: payload.studentId,
      behaviorId: payload.behaviorId === null ? null : payload.behaviorId,
      sessionDate: payload.sessionDate,
      issueSummary: payload.issueSummary,
      counselingNote: payload.counselingNote,
      followUpPlan: payload.followUpPlan,
      summonParent: payload.summonParent,
      summonDate: shouldSummonParent ? payload.summonDate : null,
      summonLetterNumber: shouldSummonParent ? payload.summonLetterNumber : null,
      status: payload.status,
    },
    include: {
      student: { select: { id: true, name: true, nis: true, nisn: true } },
      class: { select: { id: true, name: true } },
      counselor: { select: { id: true, name: true } },
      behavior: { select: { id: true, type: true, category: true, description: true } },
    },
  });

  res.status(200).json(new ApiResponse(200, updated, 'Data konseling BP/BK berhasil diperbarui'));
});
