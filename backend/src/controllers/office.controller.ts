import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AuthRequest } from '../middleware/auth';
import {
  OFFICE_LETTER_TYPES,
  generateOfficeLetterNumber,
  resolveOfficeLetterTitle,
} from '../utils/officeLetters';
import { listHistoricalStudentsForAcademicYear } from '../utils/studentAcademicHistory';

const listOfficeLettersQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  type: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const createOfficeLetterBodySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  type: z.enum(OFFICE_LETTER_TYPES),
  recipientId: z.coerce.number().int().positive().nullable().optional(),
  recipientName: z.string().trim().min(1),
  recipientRole: z.string().trim().optional().nullable(),
  recipientClass: z.string().trim().optional().nullable(),
  recipientPrimaryId: z.string().trim().optional().nullable(),
  purpose: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  payload: z.record(z.string(), z.any()).optional().nullable(),
  printedAt: z.string().datetime().optional().nullable(),
});

const administrationSummaryQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
});

type OfficeStaffDivision = 'HEAD_TU' | 'ADMINISTRATION' | 'FINANCE' | 'GENERAL';
type AdministrationCompletenessLabel = 'Lengkap' | 'Perlu Lengkapi' | 'Prioritas';

function normalizeOfficeCode(value?: string | null) {
  return String(value || '').trim().replace(/\s+/g, '_').toUpperCase();
}

function resolveOfficeStaffDivision(profile?: {
  role?: string | null;
  ptkType?: string | null;
  additionalDuties?: string[] | null;
} | null): OfficeStaffDivision {
  const ptkType = normalizeOfficeCode(profile?.ptkType);
  const duties = (profile?.additionalDuties || []).map((item) => normalizeOfficeCode(item));

  if (ptkType === 'KEPALA_TU' || ptkType === 'KEPALA_TATA_USAHA') {
    return 'HEAD_TU';
  }

  if (ptkType === 'STAFF_ADMINISTRASI') {
    return 'ADMINISTRATION';
  }

  if (ptkType === 'STAFF_KEUANGAN' || ptkType === 'BENDAHARA' || duties.includes('BENDAHARA')) {
    return 'FINANCE';
  }

  return 'GENERAL';
}

function isFilled(value: string | number | null | undefined) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return true;
  return String(value).trim().length > 0;
}

function buildAdministrationCompletenessSummary(
  fields: Array<[string, string | number | null | undefined]>,
) {
  const missingFields = fields.filter(([, value]) => !isFilled(value)).map(([label]) => label);
  const total = fields.length;
  const filled = total - missingFields.length;
  const completionRate = total === 0 ? 100 : Math.round((filled / total) * 100);
  let label: AdministrationCompletenessLabel = 'Prioritas';

  if (completionRate >= 100) {
    label = 'Lengkap';
  } else if (completionRate >= 60) {
    label = 'Perlu Lengkapi';
  }

  return {
    filled,
    total,
    completionRate,
    label,
    missingFields,
  };
}

function getVerificationQueueRank(status?: string | null) {
  const normalized = normalizeOfficeCode(status);
  if (normalized === 'PENDING') return 1;
  if (normalized === 'REJECTED') return 2;
  return 3;
}

function getPermissionAgingBucket(ageDays: number) {
  if (ageDays <= 1) return '0-1 Hari';
  if (ageDays <= 3) return '2-3 Hari';
  if (ageDays <= 7) return '4-7 Hari';
  return '> 7 Hari';
}

async function getActiveAcademicYearId() {
  return (await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
}

async function getRequesterProfile(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
      name: true,
      username: true,
    },
  });
}

async function assertHeadTuAccess(userId: number, options: { allowPrincipal?: boolean; allowAdmin?: boolean; write?: boolean } = {}) {
  const profile = await getRequesterProfile(userId);
  if (!profile) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  if (profile.role === 'ADMIN' && options.allowAdmin) {
    return profile;
  }

  if (profile.role === 'PRINCIPAL' && options.allowPrincipal && !options.write) {
    return profile;
  }

  if (profile.role === 'STAFF' && profile.ptkType === 'KEPALA_TU') {
    return profile;
  }

  throw new ApiError(403, 'Akses modul tata usaha tidak diizinkan.');
}

async function assertAdministrationAccess(
  userId: number,
  options: { allowPrincipal?: boolean; allowAdmin?: boolean } = {},
) {
  const profile = await getRequesterProfile(userId);
  if (!profile) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  if (profile.role === 'ADMIN' && options.allowAdmin) {
    return profile;
  }

  if (profile.role === 'PRINCIPAL' && options.allowPrincipal) {
    return profile;
  }

  if (profile.role === 'STAFF') {
    const division = resolveOfficeStaffDivision(profile);
    if (division === 'ADMINISTRATION' || division === 'HEAD_TU') {
      return profile;
    }
  }

  throw new ApiError(403, 'Akses dashboard administrasi tidak diizinkan.');
}

export const listOfficeLetters = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertHeadTuAccess(req.user.id, { allowPrincipal: true, allowAdmin: true });

  const query = listOfficeLettersQuerySchema.parse(req.query);
  const where: Prisma.OfficeLetterWhereInput = {
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.type ? { type: query.type } : {}),
  };

  if (query.search) {
    where.OR = [
      { letterNumber: { contains: query.search, mode: 'insensitive' } },
      { title: { contains: query.search, mode: 'insensitive' } },
      { recipientName: { contains: query.search, mode: 'insensitive' } },
      { recipientPrimaryId: { contains: query.search, mode: 'insensitive' } },
      { recipientClass: { contains: query.search, mode: 'insensitive' } },
      { purpose: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.officeLetter.count({ where }),
    prisma.officeLetter.findMany({
      where,
      include: {
        academicYear: {
          select: { id: true, name: true, isActive: true },
        },
        createdBy: {
          select: { id: true, name: true, username: true, ptkType: true },
        },
        recipient: {
          select: { id: true, name: true, username: true, nis: true, nisn: true, nip: true, nuptk: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        letters: rows,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        },
      },
      'Arsip surat berhasil dimuat.',
    ),
  );
});

export const createOfficeLetter = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertHeadTuAccess(req.user.id, { allowAdmin: true, write: true });

  const body = createOfficeLetterBodySchema.parse(req.body);
  const academicYearId =
    body.academicYearId ||
    (await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;

  if (!academicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan.');
  }

  const letter = await prisma.$transaction(async (tx) => {
    const letterNumber = await generateOfficeLetterNumber(tx, academicYearId, body.type);
    return tx.officeLetter.create({
      data: {
        academicYearId,
        createdById: req.user!.id,
        recipientId: body.recipientId || null,
        type: body.type,
        letterNumber,
        title: resolveOfficeLetterTitle(body.type),
        recipientName: body.recipientName,
        recipientRole: body.recipientRole || null,
        recipientClass: body.recipientClass || null,
        recipientPrimaryId: body.recipientPrimaryId || null,
        purpose: body.purpose || null,
        notes: body.notes || null,
        payload: body.payload || Prisma.JsonNull,
        printedAt: body.printedAt ? new Date(body.printedAt) : new Date(),
      },
      include: {
        academicYear: {
          select: { id: true, name: true, isActive: true },
        },
        createdBy: {
          select: { id: true, name: true, username: true, ptkType: true },
        },
        recipient: {
          select: { id: true, name: true, username: true, nis: true, nisn: true, nip: true, nuptk: true },
        },
      },
    });
  });

  return res.status(201).json(new ApiResponse(201, { letter }, 'Surat berhasil disimpan.'));
});

export const getOfficeLetterSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertHeadTuAccess(req.user.id, { allowPrincipal: true, allowAdmin: true });

  const query = listOfficeLettersQuerySchema.pick({ academicYearId: true }).parse(req.query);
  const academicYearId =
    query.academicYearId ||
    (await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;

  if (!academicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan.');
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalLetters, monthlyLetters, byType, latest] = await Promise.all([
    prisma.officeLetter.count({ where: { academicYearId } }),
    prisma.officeLetter.count({ where: { academicYearId, createdAt: { gte: startOfMonth } } }),
    prisma.officeLetter.groupBy({
      by: ['type'],
      where: { academicYearId },
      _count: { _all: true },
    }),
    prisma.officeLetter.findMany({
      where: { academicYearId },
      include: {
        createdBy: { select: { id: true, name: true, username: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalLetters,
        monthlyLetters,
        byType,
        latest,
      },
      'Ringkasan surat tata usaha berhasil dimuat.',
    ),
  );
});

export const getAdministrationSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertAdministrationAccess(req.user.id, { allowPrincipal: true, allowAdmin: true });

  const query = administrationSummaryQuerySchema.parse(req.query);
  const academicYearId = query.academicYearId || (await getActiveAcademicYearId());

  if (!academicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan.');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [historicalStudents, teachers, permissionCounts, pendingPermissions] = await Promise.all([
    listHistoricalStudentsForAcademicYear({
      academicYearId,
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: {
        id: true,
        name: true,
        username: true,
        nip: true,
        nuptk: true,
        ptkType: true,
        employeeStatus: true,
        institution: true,
        phone: true,
        verificationStatus: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    prisma.studentPermission.groupBy({
      by: ['status'],
      where: { academicYearId },
      _count: { _all: true },
    }),
    prisma.studentPermission.findMany({
      where: {
        academicYearId,
        status: 'PENDING',
      },
      select: {
        id: true,
        studentId: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        reason: true,
        approvalNote: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    }),
  ]);

  const historicalStudentIds = historicalStudents.map((student) => student.id);
  const studentDetailRows = historicalStudentIds.length
    ? await prisma.user.findMany({
        where: {
          role: 'STUDENT',
          id: { in: historicalStudentIds },
        },
        select: {
          id: true,
          username: true,
          address: true,
          phone: true,
          verificationStatus: true,
        },
      })
    : [];

  const historicalStudentMap = new Map(historicalStudents.map((student) => [student.id, student]));
  const studentDetailMap = new Map(studentDetailRows.map((student) => [student.id, student]));

  const studentRows = historicalStudents.map((student) => {
    const detail = studentDetailMap.get(student.id);
    return {
      id: student.id,
      name: student.name,
      username: detail?.username || '',
      classId: student.studentClass?.id ?? null,
      className: student.studentClass?.name || 'Tanpa Kelas',
      verificationStatus: detail?.verificationStatus,
      studentStatus: student.studentStatus,
      completeness: buildAdministrationCompletenessSummary([
        ['NIS', student.nis],
        ['NISN', student.nisn],
        ['Kelas', student.studentClass?.name],
        ['Alamat', detail?.address],
        ['No. HP', detail?.phone],
        ['Nama Ibu', student.motherName],
      ]),
    };
  });

  const teacherRows = teachers.map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    username: teacher.username,
    ptkType: teacher.ptkType || '-',
    verificationStatus: teacher.verificationStatus,
    employeeStatus: teacher.employeeStatus,
    completeness: buildAdministrationCompletenessSummary([
      ['NIP', teacher.nip],
      ['NUPTK', teacher.nuptk],
      ['PTK', teacher.ptkType],
      ['Status Pegawai', teacher.employeeStatus],
      ['Institusi', teacher.institution],
      ['No. HP', teacher.phone],
    ]),
  }));

  const studentPriorityQueue = studentRows
    .filter((row) => row.completeness.label !== 'Lengkap')
    .sort((a, b) => {
      if (a.completeness.filled !== b.completeness.filled) {
        return a.completeness.filled - b.completeness.filled;
      }
      return a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' });
    })
    .slice(0, 25)
    .map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      classId: row.classId,
      className: row.className,
      verificationStatus: row.verificationStatus,
      studentStatus: row.studentStatus,
      completionRate: row.completeness.completionRate,
      filled: row.completeness.filled,
      total: row.completeness.total,
      label: row.completeness.label,
      missingFields: row.completeness.missingFields,
    }));

  const teacherPriorityQueue = teacherRows
    .filter((row) => row.completeness.label !== 'Lengkap')
    .sort((a, b) => {
      if (a.completeness.filled !== b.completeness.filled) {
        return a.completeness.filled - b.completeness.filled;
      }
      return a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' });
    })
    .slice(0, 25)
    .map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      ptkType: row.ptkType,
      verificationStatus: row.verificationStatus,
      employeeStatus: row.employeeStatus,
      completionRate: row.completeness.completionRate,
      filled: row.completeness.filled,
      total: row.completeness.total,
      label: row.completeness.label,
      missingFields: row.completeness.missingFields,
    }));

  const studentVerificationQueue = studentRows
    .filter((row) => normalizeOfficeCode(row.verificationStatus) !== 'VERIFIED')
    .sort((a, b) => {
      const rankDiff =
        getVerificationQueueRank(a.verificationStatus) - getVerificationQueueRank(b.verificationStatus);
      if (rankDiff !== 0) return rankDiff;
      if (a.completeness.completionRate !== b.completeness.completionRate) {
        return a.completeness.completionRate - b.completeness.completionRate;
      }
      return a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' });
    })
    .slice(0, 25)
    .map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      classId: row.classId,
      className: row.className,
      verificationStatus: row.verificationStatus,
      completionRate: row.completeness.completionRate,
      missingFields: row.completeness.missingFields,
    }));

  const teacherVerificationQueue = teacherRows
    .filter((row) => normalizeOfficeCode(row.verificationStatus) !== 'VERIFIED')
    .sort((a, b) => {
      const rankDiff =
        getVerificationQueueRank(a.verificationStatus) - getVerificationQueueRank(b.verificationStatus);
      if (rankDiff !== 0) return rankDiff;
      if (a.completeness.completionRate !== b.completeness.completionRate) {
        return a.completeness.completionRate - b.completeness.completionRate;
      }
      return a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' });
    })
    .slice(0, 25)
    .map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      ptkType: row.ptkType,
      verificationStatus: row.verificationStatus,
      completionRate: row.completeness.completionRate,
      missingFields: row.completeness.missingFields,
    }));

  const studentClassMap = new Map<
    string,
    {
      classId: number | null;
      className: string;
      totalStudents: number;
      completeCount: number;
      needAttentionCount: number;
      priorityCount: number;
      completionTotal: number;
      pendingVerificationCount: number;
    }
  >();

  for (const row of studentRows) {
    const key = String(row.classId ?? 0);
    const entry = studentClassMap.get(key) || {
      classId: row.classId,
      className: row.className,
      totalStudents: 0,
      completeCount: 0,
      needAttentionCount: 0,
      priorityCount: 0,
      completionTotal: 0,
      pendingVerificationCount: 0,
    };
    entry.totalStudents += 1;
    entry.completionTotal += row.completeness.completionRate;
    if (row.completeness.label === 'Lengkap') entry.completeCount += 1;
    if (row.completeness.label === 'Perlu Lengkapi') entry.needAttentionCount += 1;
    if (row.completeness.label === 'Prioritas') entry.priorityCount += 1;
    if (normalizeOfficeCode(row.verificationStatus) === 'PENDING') entry.pendingVerificationCount += 1;
    studentClassMap.set(key, entry);
  }

  const teacherPtkMap = new Map<
    string,
    {
      ptkType: string;
      totalTeachers: number;
      completeCount: number;
      needAttentionCount: number;
      priorityCount: number;
      completionTotal: number;
      pendingVerificationCount: number;
    }
  >();

  for (const row of teacherRows) {
    const key = row.ptkType || '-';
    const entry = teacherPtkMap.get(key) || {
      ptkType: key,
      totalTeachers: 0,
      completeCount: 0,
      needAttentionCount: 0,
      priorityCount: 0,
      completionTotal: 0,
      pendingVerificationCount: 0,
    };
    entry.totalTeachers += 1;
    entry.completionTotal += row.completeness.completionRate;
    if (row.completeness.label === 'Lengkap') entry.completeCount += 1;
    if (row.completeness.label === 'Perlu Lengkapi') entry.needAttentionCount += 1;
    if (row.completeness.label === 'Prioritas') entry.priorityCount += 1;
    if (normalizeOfficeCode(row.verificationStatus) === 'PENDING') entry.pendingVerificationCount += 1;
    teacherPtkMap.set(key, entry);
  }

  const permissionCountMap = new Map<string, number>();
  for (const row of permissionCounts) {
    permissionCountMap.set(row.status, row._count._all);
  }

  const permissionAgingMap = new Map<string, { label: string; count: number }>();
  const permissionQueue = pendingPermissions.map((permission) => {
    const createdAt = new Date(permission.createdAt);
    createdAt.setHours(0, 0, 0, 0);
    const ageDays = Math.max(0, Math.floor((today.getTime() - createdAt.getTime()) / 86_400_000));
    const agingLabel = getPermissionAgingBucket(ageDays);
    const agingRow = permissionAgingMap.get(agingLabel) || { label: agingLabel, count: 0 };
    agingRow.count += 1;
    permissionAgingMap.set(agingLabel, agingRow);

    return {
      id: permission.id,
      studentId: permission.studentId,
      studentName: permission.student?.name || '-',
      nis: permission.student?.nis || '',
      nisn: permission.student?.nisn || '',
      className:
        historicalStudentMap.get(permission.studentId)?.studentClass?.name ||
        permission.student?.studentClass?.name ||
        'Tanpa Kelas',
      type: permission.type,
      status: permission.status,
      startDate: permission.startDate.toISOString(),
      endDate: permission.endDate.toISOString(),
      createdAt: permission.createdAt.toISOString(),
      ageDays,
      agingLabel,
      reason: permission.reason,
      approvalNote: permission.approvalNote,
    };
  });

  const studentCompletenessRate = studentRows.length
    ? Math.round(
        studentRows.reduce((sum, row) => sum + row.completeness.completionRate, 0) / studentRows.length,
      )
    : 0;
  const teacherCompletenessRate = teacherRows.length
    ? Math.round(
        teacherRows.reduce((sum, row) => sum + row.completeness.completionRate, 0) / teacherRows.length,
      )
    : 0;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        filters: {
          academicYearId,
          generatedAt: new Date().toISOString(),
        },
        overview: {
          totalStudents: studentRows.length,
          totalTeachers: teacherRows.length,
          studentCompletenessRate,
          teacherCompletenessRate,
          studentsCompleteCount: studentRows.filter((row) => row.completeness.label === 'Lengkap').length,
          studentsNeedAttentionCount: studentRows.filter((row) => row.completeness.label === 'Perlu Lengkapi').length,
          studentsPriorityCount: studentRows.filter((row) => row.completeness.label === 'Prioritas').length,
          teachersCompleteCount: teacherRows.filter((row) => row.completeness.label === 'Lengkap').length,
          teachersNeedAttentionCount: teacherRows.filter((row) => row.completeness.label === 'Perlu Lengkapi').length,
          teachersPriorityCount: teacherRows.filter((row) => row.completeness.label === 'Prioritas').length,
          pendingStudentVerification: studentRows.filter(
            (row) => normalizeOfficeCode(row.verificationStatus) === 'PENDING',
          ).length,
          rejectedStudentVerification: studentRows.filter(
            (row) => normalizeOfficeCode(row.verificationStatus) === 'REJECTED',
          ).length,
          pendingTeacherVerification: teacherRows.filter(
            (row) => normalizeOfficeCode(row.verificationStatus) === 'PENDING',
          ).length,
          rejectedTeacherVerification: teacherRows.filter(
            (row) => normalizeOfficeCode(row.verificationStatus) === 'REJECTED',
          ).length,
          pendingPermissions: permissionCountMap.get('PENDING') || 0,
          approvedPermissions: permissionCountMap.get('APPROVED') || 0,
          rejectedPermissions: permissionCountMap.get('REJECTED') || 0,
        },
        studentClassRecap: Array.from(studentClassMap.values())
          .map((entry) => ({
            classId: entry.classId,
            className: entry.className,
            totalStudents: entry.totalStudents,
            completeCount: entry.completeCount,
            needAttentionCount: entry.needAttentionCount,
            priorityCount: entry.priorityCount,
            completenessRate: entry.totalStudents
              ? Math.round(entry.completionTotal / entry.totalStudents)
              : 0,
            pendingVerificationCount: entry.pendingVerificationCount,
          }))
          .sort((a, b) => b.priorityCount - a.priorityCount || a.className.localeCompare(b.className)),
        teacherPtkRecap: Array.from(teacherPtkMap.values())
          .map((entry) => ({
            ptkType: entry.ptkType,
            totalTeachers: entry.totalTeachers,
            completeCount: entry.completeCount,
            needAttentionCount: entry.needAttentionCount,
            priorityCount: entry.priorityCount,
            completenessRate: entry.totalTeachers
              ? Math.round(entry.completionTotal / entry.totalTeachers)
              : 0,
            pendingVerificationCount: entry.pendingVerificationCount,
          }))
          .sort((a, b) => b.priorityCount - a.priorityCount || a.ptkType.localeCompare(b.ptkType)),
        studentPriorityQueue,
        teacherPriorityQueue,
        studentVerificationQueue,
        teacherVerificationQueue,
        permissionAging: Array.from(permissionAgingMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
        permissionQueue,
      },
      'Dashboard administrasi berhasil dimuat.',
    ),
  );
});
