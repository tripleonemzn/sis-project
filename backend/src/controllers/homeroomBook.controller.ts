import { Request, Response } from 'express';
import { AdditionalDuty, HomeroomBookEntryType, HomeroomBookStatus, Prisma, Semester } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { validateHistoricalStudentClassMembership } from '../utils/studentAcademicHistory';
import {
  ensureAcademicYearArchiveReadAccess,
  ensureAcademicYearArchiveWriteAccess,
} from '../utils/academicYearArchiveAccess';

const HOMEROOM_BOOK_ATTACHMENT_MAX_BYTES = 500 * 1024;

const attachmentSchema = z.object({
  fileUrl: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  originalName: z.string().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
  fileSize: z.number().int().min(1).max(HOMEROOM_BOOK_ATTACHMENT_MAX_BYTES),
});

const createHomeroomBookEntrySchema = z.object({
  studentId: z.number().int().positive(),
  classId: z.number().int().positive(),
  academicYearId: z.number().int().positive(),
  entryType: z.nativeEnum(HomeroomBookEntryType),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(5).max(600),
  notes: z.string().trim().max(4000).optional().nullable(),
  incidentDate: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Tanggal kejadian tidak valid.',
  }),
  relatedSemester: z.nativeEnum(Semester).optional().nullable(),
  relatedProgramCode: z.string().trim().max(50).optional().nullable(),
  visibilityToPrincipal: z.boolean().optional(),
  visibilityToStudentAffairs: z.boolean().optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

const updateHomeroomBookEntrySchema = createHomeroomBookEntrySchema
  .omit({
    studentId: true,
    classId: true,
    academicYearId: true,
    entryType: true,
  })
  .extend({
    attachments: z.array(attachmentSchema).max(5).optional(),
  });

const updateHomeroomBookStatusSchema = z.object({
  status: z.nativeEnum(HomeroomBookStatus),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const homeroomBookListQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  entryType: z.nativeEnum(HomeroomBookEntryType).optional(),
  status: z.nativeEnum(HomeroomBookStatus).optional(),
  programCode: z.string().trim().max(50).optional(),
  semester: z.nativeEnum(Semester).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const normalizeCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

function hasStudentAffairsDuty(duties: AdditionalDuty[]) {
  return duties.includes(AdditionalDuty.WAKASEK_KESISWAAN) || duties.includes(AdditionalDuty.SEKRETARIS_KESISWAAN);
}

async function getActorDuties(userId: number): Promise<AdditionalDuty[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { additionalDuties: true },
  });
  return Array.isArray(user?.additionalDuties) ? user.additionalDuties : [];
}

async function getManagedHomeroomClassIds(userId: number, academicYearId?: number | null) {
  const rows = await prisma.class.findMany({
    where: {
      teacherId: userId,
      ...(academicYearId ? { academicYearId } : {}),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function resolveHomeroomBookActor(req: Request, academicYearId?: number | null) {
  const user = (req as any).user as { id: number; role: string } | undefined;
  if (!user?.id || !user.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  if (user.role === 'ADMIN' || user.role === 'PRINCIPAL') {
    return {
      id: Number(user.id),
      role: user.role,
      duties: [] as AdditionalDuty[],
      canReadAll: true,
      canMonitorStudentAffairs: user.role === 'PRINCIPAL',
      managedClassIds: [] as number[],
    };
  }

  if (user.role !== 'TEACHER') {
    throw new ApiError(403, 'Role tidak memiliki akses ke Buku Wali Kelas.');
  }

  const [duties, managedClassIds] = await Promise.all([
    getActorDuties(Number(user.id)),
    getManagedHomeroomClassIds(Number(user.id), academicYearId || null),
  ]);
  const canMonitorStudentAffairs = hasStudentAffairsDuty(duties);

  if (!canMonitorStudentAffairs && managedClassIds.length === 0) {
    throw new ApiError(403, 'Akses Buku Wali Kelas hanya untuk wali kelas atau Wakasek Kesiswaan.');
  }

  return {
    id: Number(user.id),
    role: user.role,
    duties,
    canReadAll: false,
    canMonitorStudentAffairs,
    managedClassIds,
  };
}

function buildVisibilityWhere(actor: Awaited<ReturnType<typeof resolveHomeroomBookActor>>): Prisma.HomeroomBookEntryWhereInput {
  if (actor.role === 'PRINCIPAL') {
    return { visibilityToPrincipal: true };
  }

  if (actor.role === 'ADMIN') {
    return {};
  }

  if (actor.canMonitorStudentAffairs) {
    return {
      OR: [
        { visibilityToStudentAffairs: true },
        ...(actor.managedClassIds.length > 0
          ? [
              {
                classId: {
                  in: actor.managedClassIds,
                },
              },
            ]
          : []),
      ],
    };
  }

  return {
    classId: {
      in: actor.managedClassIds.length > 0 ? actor.managedClassIds : [-1],
    },
  };
}

function mapHomeroomBookEntry(entry: Prisma.HomeroomBookEntryGetPayload<{
  include: {
    student: { select: { id: true; name: true; nis: true; nisn: true } };
    class: { select: { id: true; name: true; level: true } };
    academicYear: { select: { id: true; name: true; isActive: true } };
    createdBy: { select: { id: true; name: true } };
    updatedBy: { select: { id: true; name: true } };
    attachments: true;
  };
}>) {
  return {
    id: entry.id,
    entryType: entry.entryType,
    status: entry.status,
    title: entry.title,
    summary: entry.summary,
    notes: entry.notes,
    incidentDate: entry.incidentDate,
    relatedSemester: entry.relatedSemester,
    relatedProgramCode: entry.relatedProgramCode,
    visibilityToPrincipal: entry.visibilityToPrincipal,
    visibilityToStudentAffairs: entry.visibilityToStudentAffairs,
    allowsExamAccess: entry.entryType === HomeroomBookEntryType.EXAM_FINANCE_EXCEPTION && entry.status === HomeroomBookStatus.ACTIVE,
    student: entry.student,
    class: entry.class,
    academicYear: entry.academicYear,
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
    attachments: entry.attachments.map((attachment) => ({
      id: attachment.id,
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
    })),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function assertHomeroomBookWriteAccess(params: {
  actorId: number;
  academicYearId: number;
  classId: number;
  studentId: number;
}) {
  const managedClassIds = await getManagedHomeroomClassIds(params.actorId, params.academicYearId);
  if (!managedClassIds.includes(params.classId)) {
    throw new ApiError(403, 'Anda hanya bisa mengelola Buku Wali Kelas untuk kelas yang Anda ampu sebagai wali kelas.');
  }

  const validation = await validateHistoricalStudentClassMembership({
    academicYearId: params.academicYearId,
    classId: params.classId,
    studentId: params.studentId,
  });

  if (!validation?.student || !validation?.cls) {
    throw new ApiError(400, 'Siswa tidak terdaftar pada kelas dan tahun ajaran yang dipilih.');
  }
}

function assertExamFinanceExceptionPayload(data: {
  entryType: HomeroomBookEntryType;
  relatedSemester?: Semester | null;
  relatedProgramCode?: string | null;
  attachments?: Array<z.infer<typeof attachmentSchema>>;
}) {
  if (data.entryType !== HomeroomBookEntryType.EXAM_FINANCE_EXCEPTION) return;
  if (!data.relatedSemester) {
    throw new ApiError(400, 'Semester ujian wajib dipilih untuk pengecualian ujian finance.');
  }
  if (!normalizeCode(data.relatedProgramCode)) {
    throw new ApiError(400, 'Program ujian wajib dipilih untuk pengecualian ujian finance.');
  }
  if (!Array.isArray(data.attachments) || data.attachments.length === 0) {
    throw new ApiError(400, 'Lampiran perjanjian wajib diunggah untuk pengecualian ujian finance.');
  }
}

const homeroomBookInclude = {
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
      level: true,
    },
  },
  academicYear: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  attachments: {
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} satisfies Prisma.HomeroomBookEntryInclude;

export const listHomeroomBookEntries = asyncHandler(async (req: Request, res: Response) => {
  const query = homeroomBookListQuerySchema.parse(req.query);
  const actor = await resolveHomeroomBookActor(req, query.academicYearId || null);

  if (query.academicYearId) {
    await ensureAcademicYearArchiveReadAccess({
      actorId: actor.id,
      actorRole: actor.role,
      academicYearId: query.academicYearId,
      module: 'BPBK',
      classId: query.classId || null,
      studentId: query.studentId || null,
    });
  }

  const where: Prisma.HomeroomBookEntryWhereInput = {
    ...buildVisibilityWhere(actor),
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.classId ? { classId: query.classId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.entryType ? { entryType: query.entryType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.semester ? { relatedSemester: query.semester } : {}),
    ...(normalizeCode(query.programCode) ? { relatedProgramCode: normalizeCode(query.programCode) } : {}),
  };

  if (query.search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { summary: { contains: query.search, mode: 'insensitive' } },
          { notes: { contains: query.search, mode: 'insensitive' } },
          { relatedProgramCode: { contains: normalizeCode(query.search), mode: 'insensitive' } },
          { student: { name: { contains: query.search, mode: 'insensitive' } } },
          { student: { nis: { contains: query.search, mode: 'insensitive' } } },
          { student: { nisn: { contains: query.search, mode: 'insensitive' } } },
          { class: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.homeroomBookEntry.findMany({
      where,
      include: homeroomBookInclude,
      orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
    prisma.homeroomBookEntry.count({ where }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    entries: rows.map(mapHomeroomBookEntry),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  }, 'Data Buku Wali Kelas berhasil diambil'));
});

export const getHomeroomBookEntryDetail = asyncHandler(async (req: Request, res: Response) => {
  const actor = await resolveHomeroomBookActor(req);
  const entryId = Number(req.params.id);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID Buku Wali Kelas tidak valid.');
  }

  const entry = await prisma.homeroomBookEntry.findUnique({
    where: { id: entryId },
    include: homeroomBookInclude,
  });

  if (!entry) {
    throw new ApiError(404, 'Data Buku Wali Kelas tidak ditemukan.');
  }

  await ensureAcademicYearArchiveReadAccess({
    actorId: actor.id,
    actorRole: actor.role,
    academicYearId: entry.academicYearId,
    module: 'BPBK',
    classId: entry.classId,
    studentId: entry.studentId,
  });

  const visibilityWhere = buildVisibilityWhere(actor);
  const canRead =
    actor.role === 'ADMIN' ||
    (actor.role === 'PRINCIPAL' && entry.visibilityToPrincipal) ||
    (actor.role === 'TEACHER' &&
      ((actor.canMonitorStudentAffairs && entry.visibilityToStudentAffairs) || actor.managedClassIds.includes(entry.classId)));

  if (!canRead) {
    throw new ApiError(403, 'Anda tidak memiliki akses ke entri Buku Wali Kelas ini.');
  }

  void visibilityWhere;
  res.status(200).json(new ApiResponse(200, mapHomeroomBookEntry(entry), 'Detail Buku Wali Kelas berhasil diambil'));
});

export const createHomeroomBookEntry = asyncHandler(async (req: Request, res: Response) => {
  const actor = await resolveHomeroomBookActor(req);
  if (actor.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya guru yang dapat membuat Buku Wali Kelas.');
  }

  const data = createHomeroomBookEntrySchema.parse(req.body);
  assertExamFinanceExceptionPayload(data);

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: data.academicYearId,
    module: 'BPBK',
  });

  await assertHomeroomBookWriteAccess({
    actorId: actor.id,
    academicYearId: data.academicYearId,
    classId: data.classId,
    studentId: data.studentId,
  });

  const entry = await prisma.homeroomBookEntry.create({
    data: {
      studentId: data.studentId,
      classId: data.classId,
      academicYearId: data.academicYearId,
      createdById: actor.id,
      updatedById: actor.id,
      entryType: data.entryType,
      status: HomeroomBookStatus.ACTIVE,
      title: data.title.trim(),
      summary: data.summary.trim(),
      notes: data.notes?.trim() || null,
      incidentDate: new Date(data.incidentDate),
      relatedSemester: data.relatedSemester || null,
      relatedProgramCode: normalizeCode(data.relatedProgramCode) || null,
      visibilityToPrincipal: data.visibilityToPrincipal ?? true,
      visibilityToStudentAffairs: data.visibilityToStudentAffairs ?? true,
      attachments: data.attachments?.length
        ? {
            create: data.attachments.map((attachment) => ({
              fileUrl: attachment.fileUrl,
              fileName: attachment.fileName,
              originalName: attachment.originalName,
              mimeType: attachment.mimeType,
              fileSize: attachment.fileSize,
            })),
          }
        : undefined,
    },
    include: homeroomBookInclude,
  });

  res.status(201).json(new ApiResponse(201, mapHomeroomBookEntry(entry), 'Buku Wali Kelas berhasil dibuat'));
});

export const updateHomeroomBookEntry = asyncHandler(async (req: Request, res: Response) => {
  const actor = await resolveHomeroomBookActor(req);
  if (actor.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya guru yang dapat memperbarui Buku Wali Kelas.');
  }

  const entryId = Number(req.params.id);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID Buku Wali Kelas tidak valid.');
  }

  const existingEntry = await prisma.homeroomBookEntry.findUnique({
    where: { id: entryId },
    include: {
      attachments: true,
    },
  });

  if (!existingEntry) {
    throw new ApiError(404, 'Data Buku Wali Kelas tidak ditemukan.');
  }

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existingEntry.academicYearId,
    module: 'BPBK',
  });

  await assertHomeroomBookWriteAccess({
    actorId: actor.id,
    academicYearId: existingEntry.academicYearId,
    classId: existingEntry.classId,
    studentId: existingEntry.studentId,
  });

  const data = updateHomeroomBookEntrySchema.parse(req.body);
  assertExamFinanceExceptionPayload({
    entryType: existingEntry.entryType,
    relatedSemester: data.relatedSemester === undefined ? existingEntry.relatedSemester : data.relatedSemester,
    relatedProgramCode: data.relatedProgramCode === undefined ? existingEntry.relatedProgramCode : data.relatedProgramCode,
    attachments: data.attachments === undefined ? existingEntry.attachments.map((attachment) => ({
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType as 'application/pdf' | 'image/jpeg' | 'image/jpg' | 'image/png',
      fileSize: attachment.fileSize,
    })) : data.attachments,
  });

  const entry = await prisma.$transaction(async (tx) => {
    if (data.attachments !== undefined) {
      await tx.homeroomBookAttachment.deleteMany({
        where: { entryId: existingEntry.id },
      });
    }

    return tx.homeroomBookEntry.update({
      where: { id: existingEntry.id },
      data: {
        updatedById: actor.id,
        title: data.title?.trim() ?? existingEntry.title,
        summary: data.summary?.trim() ?? existingEntry.summary,
        notes: data.notes === undefined ? existingEntry.notes : data.notes?.trim() || null,
        incidentDate: data.incidentDate ? new Date(data.incidentDate) : existingEntry.incidentDate,
        relatedSemester: data.relatedSemester === undefined ? existingEntry.relatedSemester : data.relatedSemester,
        relatedProgramCode:
          data.relatedProgramCode === undefined
            ? existingEntry.relatedProgramCode
            : normalizeCode(data.relatedProgramCode) || null,
        visibilityToPrincipal:
          data.visibilityToPrincipal === undefined ? existingEntry.visibilityToPrincipal : data.visibilityToPrincipal,
        visibilityToStudentAffairs:
          data.visibilityToStudentAffairs === undefined
            ? existingEntry.visibilityToStudentAffairs
            : data.visibilityToStudentAffairs,
        attachments: data.attachments
          ? {
              create: data.attachments.map((attachment) => ({
                fileUrl: attachment.fileUrl,
                fileName: attachment.fileName,
                originalName: attachment.originalName,
                mimeType: attachment.mimeType,
                fileSize: attachment.fileSize,
              })),
            }
          : undefined,
      },
      include: homeroomBookInclude,
    });
  });

  res.status(200).json(new ApiResponse(200, mapHomeroomBookEntry(entry), 'Buku Wali Kelas berhasil diperbarui'));
});

export const updateHomeroomBookEntryStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = await resolveHomeroomBookActor(req);
  if (actor.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya guru yang dapat memperbarui status Buku Wali Kelas.');
  }

  const entryId = Number(req.params.id);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID Buku Wali Kelas tidak valid.');
  }

  const existingEntry = await prisma.homeroomBookEntry.findUnique({
    where: { id: entryId },
  });

  if (!existingEntry) {
    throw new ApiError(404, 'Data Buku Wali Kelas tidak ditemukan.');
  }

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existingEntry.academicYearId,
    module: 'BPBK',
  });

  await assertHomeroomBookWriteAccess({
    actorId: actor.id,
    academicYearId: existingEntry.academicYearId,
    classId: existingEntry.classId,
    studentId: existingEntry.studentId,
  });

  const data = updateHomeroomBookStatusSchema.parse(req.body);
  const updated = await prisma.homeroomBookEntry.update({
    where: { id: existingEntry.id },
    data: {
      status: data.status,
      notes: data.notes === undefined ? existingEntry.notes : data.notes?.trim() || null,
      updatedById: actor.id,
    },
    include: homeroomBookInclude,
  });

  res.status(200).json(new ApiResponse(200, mapHomeroomBookEntry(updated), 'Status Buku Wali Kelas berhasil diperbarui'));
});
