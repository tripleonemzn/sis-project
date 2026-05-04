import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const JOURNAL_STATUS_VALUES = ['DRAFT', 'SUBMITTED', 'REVIEWED'] as const;
const JOURNAL_DELIVERY_STATUS_VALUES = ['COMPLETED', 'PARTIAL', 'NOT_DELIVERED', 'RESCHEDULED'] as const;
const JOURNAL_MODE_VALUES = ['REGULAR', 'SUBSTITUTE', 'ENRICHMENT', 'REMEDIAL', 'ASSESSMENT'] as const;
const DAY_OF_WEEK_BY_UTC_INDEX = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const MAX_SESSION_RANGE_DAYS = 62;

const journalReferenceSchema = z.object({
  sourceProgramCode: z.string().trim().min(1).max(100),
  sourceEntryId: z.number().int().positive().optional().nullable(),
  sourceFieldIdentity: z.string().trim().max(200).optional().nullable(),
  selectionToken: z.string().trim().max(255).optional().nullable(),
  value: z.string().trim().min(1),
  label: z.string().trim().max(500).optional().nullable(),
  snapshot: z.record(z.unknown()).optional().nullable(),
});

const listTeachingJournalSessionsSchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
  teacherId: z.coerce.number().int().optional(),
  teacherAssignmentId: z.coerce.number().int().optional(),
  classId: z.coerce.number().int().optional(),
  subjectId: z.coerce.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  journalStatus: z.enum([...JOURNAL_STATUS_VALUES, 'MISSING']).optional(),
  deliveryStatus: z.enum(JOURNAL_DELIVERY_STATUS_VALUES).optional(),
});

const teachingJournalEntryIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const upsertTeachingJournalEntrySchema = z.object({
  id: z.number().int().positive().optional(),
  academicYearId: z.number().int().optional(),
  scheduleEntryId: z.number().int().positive(),
  journalDate: z.string(),
  teachingMode: z.enum(JOURNAL_MODE_VALUES).optional(),
  deliveryStatus: z.enum(JOURNAL_DELIVERY_STATUS_VALUES).optional(),
  status: z.enum(JOURNAL_STATUS_VALUES).optional(),
  startedAt: z.string().datetime().optional().nullable(),
  endedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  obstacles: z.string().optional().nullable(),
  followUpPlan: z.string().optional().nullable(),
  reviewNote: z.string().optional().nullable(),
  references: z.array(journalReferenceSchema).optional(),
});

const normalizeRole = (raw: unknown) => String(raw || '').trim().toUpperCase();

const parseDateOnly = (raw: string): Date => {
  const normalized = String(raw || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new ApiError(400, 'Format tanggal harus YYYY-MM-DD.');
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, amount: number) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
};

const normalizeNullableText = (raw: unknown) => {
  const value = String(raw || '').trim();
  return value ? value : null;
};

const sanitizeReferenceSnapshot = (value: Record<string, unknown> | null | undefined) => {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value).reduce<Record<string, string | number | boolean>>((acc, [key, rawItem]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return acc;
    if (typeof rawItem === 'string') {
      const normalizedValue = rawItem.trim();
      if (!normalizedValue) return acc;
      acc[normalizedKey] = normalizedValue;
      return acc;
    }
    if (typeof rawItem === 'number' || typeof rawItem === 'boolean') {
      acc[normalizedKey] = rawItem;
    }
    return acc;
  }, {});
};

const getOperationalAcademicYear = async (requestedAcademicYearId?: number) => {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
  });

  if (!activeAcademicYear) {
    throw new ApiError(500, 'Tahun ajaran aktif belum tersedia.');
  }

  if (
    Number.isFinite(Number(requestedAcademicYearId)) &&
    Number(requestedAcademicYearId) > 0 &&
    Number(requestedAcademicYearId) !== Number(activeAcademicYear.id)
  ) {
    throw new ApiError(400, 'Jurnal mengajar operasional hanya mengikuti tahun ajaran aktif.');
  }

  return activeAcademicYear;
};

const resolveSessionDateRange = (startDate?: string, endDate?: string) => {
  const today = parseDateOnly(new Date().toISOString().slice(0, 10));
  const resolvedStart = startDate ? parseDateOnly(startDate) : today;
  const resolvedEnd = endDate ? parseDateOnly(endDate) : addDays(resolvedStart, 13);

  if (resolvedEnd.getTime() < resolvedStart.getTime()) {
    throw new ApiError(400, 'Tanggal akhir tidak boleh lebih kecil dari tanggal awal.');
  }

  const diffDays = Math.floor((resolvedEnd.getTime() - resolvedStart.getTime()) / 86400000);
  if (diffDays > MAX_SESSION_RANGE_DAYS) {
    throw new ApiError(400, `Rentang sesi maksimal ${MAX_SESSION_RANGE_DAYS + 1} hari.`);
  }

  return { startDate: resolvedStart, endDate: resolvedEnd };
};

const ensureDateWithinAcademicYear = (date: Date, academicYear: Awaited<ReturnType<typeof getOperationalAcademicYear>>) => {
  const yearStart = academicYear.semester1Start.getTime();
  const yearEnd = academicYear.semester2End.getTime();
  const time = date.getTime();
  if (time < yearStart || time > yearEnd) {
    throw new ApiError(400, 'Tanggal jurnal berada di luar rentang tahun ajaran aktif.');
  }
};

const buildHolidayDateKeySet = async (academicYearId: number, startDate: Date, endDate: Date) => {
  const holidays = await prisma.academicEvent.findMany({
    where: {
      academicYearId,
      isHoliday: true,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: {
      startDate: true,
      endDate: true,
    },
  });

  const holidayDateKeys = new Set<string>();
  holidays.forEach((holiday) => {
    let cursor = holiday.startDate.getTime() < startDate.getTime() ? startDate : holiday.startDate;
    const effectiveEnd = holiday.endDate.getTime() > endDate.getTime() ? endDate : holiday.endDate;
    while (cursor.getTime() <= effectiveEnd.getTime()) {
      holidayDateKeys.add(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
  });

  return holidayDateKeys;
};

const formatJournalEntry = (entry: {
  id: number;
  academicYearId: number;
  teacherId: number;
  reviewerId: number | null;
  teacherAssignmentId: number;
  scheduleEntryId: number;
  classId: number;
  subjectId: number;
  journalDate: Date;
  period: number;
  room: string | null;
  teachingMode: string;
  deliveryStatus: string;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  notes: string | null;
  obstacles: string | null;
  followUpPlan: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  references?: Array<{
    id: number;
    sourceProgramCode: string;
    sourceEntryId: number | null;
    sourceFieldIdentity: string | null;
    selectionToken: string | null;
    value: string;
    label: string | null;
    snapshot: unknown;
  }>;
  teacher?: { id: number; name: string; username?: string | null } | null;
  reviewer?: { id: number; name: string } | null;
  scheduleEntry?: {
    id: number;
    dayOfWeek: string;
    period: number;
    room: string | null;
    class?: { id: number; name: string; level: string | null } | null;
    teacherAssignment?: {
      id: number;
      subject?: { id: number; name: string; code: string | null } | null;
      teacher?: { id: number; name: string } | null;
    } | null;
  } | null;
}) => ({
  id: entry.id,
  academicYearId: entry.academicYearId,
  teacherId: entry.teacherId,
  reviewerId: entry.reviewerId,
  teacherAssignmentId: entry.teacherAssignmentId,
  scheduleEntryId: entry.scheduleEntryId,
  classId: entry.classId,
  subjectId: entry.subjectId,
  journalDate: toDateKey(entry.journalDate),
  period: entry.period,
  room: entry.room,
  teachingMode: entry.teachingMode,
  deliveryStatus: entry.deliveryStatus,
  status: entry.status,
  startedAt: entry.startedAt?.toISOString() || null,
  endedAt: entry.endedAt?.toISOString() || null,
  notes: entry.notes,
  obstacles: entry.obstacles,
  followUpPlan: entry.followUpPlan,
  submittedAt: entry.submittedAt?.toISOString() || null,
  reviewedAt: entry.reviewedAt?.toISOString() || null,
  reviewNote: entry.reviewNote,
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString(),
  teacher: entry.teacher || null,
  reviewer: entry.reviewer || null,
  scheduleEntry: entry.scheduleEntry
    ? {
        id: entry.scheduleEntry.id,
        dayOfWeek: entry.scheduleEntry.dayOfWeek,
        period: entry.scheduleEntry.period,
        room: entry.scheduleEntry.room,
        class: entry.scheduleEntry.class || null,
        teacherAssignment: entry.scheduleEntry.teacherAssignment
          ? {
              id: entry.scheduleEntry.teacherAssignment.id,
              subject: entry.scheduleEntry.teacherAssignment.subject || null,
              teacher: entry.scheduleEntry.teacherAssignment.teacher || null,
            }
          : null,
      }
    : null,
  references: Array.isArray(entry.references)
    ? entry.references.map((reference) => ({
        id: reference.id,
        sourceProgramCode: reference.sourceProgramCode,
        sourceEntryId: reference.sourceEntryId,
        sourceFieldIdentity: reference.sourceFieldIdentity,
        selectionToken: reference.selectionToken,
        value: reference.value,
        label: reference.label,
        snapshot: reference.snapshot && typeof reference.snapshot === 'object' ? reference.snapshot : {},
      }))
    : [],
});

const loadScheduleEntryForJournal = async (params: {
  scheduleEntryId: number;
  actorId: number;
  actorRole: string;
}) => {
  const { scheduleEntryId, actorId, actorRole } = params;
  const normalizedRole = normalizeRole(actorRole);
  const scheduleEntry = await prisma.scheduleEntry.findFirst({
    where: {
      id: scheduleEntryId,
      ...(normalizedRole === 'TEACHER' ? { teacherAssignment: { teacherId: actorId } } : {}),
    },
    include: {
      academicYear: {
        select: {
          id: true,
          name: true,
          isActive: true,
          semester1Start: true,
          semester1End: true,
          semester2Start: true,
          semester2End: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          level: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      teacherAssignment: {
        select: {
          id: true,
          teacherId: true,
          subjectId: true,
          classId: true,
          academicYearId: true,
          teacher: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
  });

  if (!scheduleEntry) {
    throw new ApiError(404, 'Sesi jadwal mengajar tidak ditemukan.');
  }

  return scheduleEntry;
};

export const getTeachingJournalSessions = asyncHandler(async (req: Request, res: Response) => {
  const query = listTeachingJournalSessionsSchema.parse(req.query);
  const actor = (req as any).user;
  const actorRole = normalizeRole(actor?.role);
  const actorId = Number(actor?.id || 0);
  const academicYear = await getOperationalAcademicYear(query.academicYearId);
  const { startDate, endDate } = resolveSessionDateRange(query.startDate, query.endDate);
  const effectiveTeacherId = actorRole === 'TEACHER' ? actorId : Number(query.teacherId || 0) || undefined;

  const scheduleEntries = await prisma.scheduleEntry.findMany({
    where: {
      academicYearId: academicYear.id,
      ...(query.teacherAssignmentId ? { teacherAssignmentId: query.teacherAssignmentId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      teacherAssignment: {
        ...(effectiveTeacherId ? { teacherId: effectiveTeacherId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          level: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      teacherAssignment: {
        select: {
          id: true,
          teacherId: true,
          subjectId: true,
          teacher: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  });

  if (scheduleEntries.length === 0) {
    res.status(200).json(
      new ApiResponse(
        200,
        {
          sessions: [],
          meta: {
            academicYear: { id: academicYear.id, name: academicYear.name },
            dateRange: { start: toDateKey(startDate), end: toDateKey(endDate) },
          },
        },
        'Daftar sesi jurnal mengajar berhasil diambil',
      ),
    );
    return;
  }

  const holidayDateKeys = await buildHolidayDateKeySet(academicYear.id, startDate, endDate);
  const scheduleEntryIds = scheduleEntries.map((entry) => entry.id);
  const teacherAssignmentIds = Array.from(new Set(scheduleEntries.map((entry) => entry.teacherAssignmentId)));

  const [journals, attendances] = await Promise.all([
    prisma.teachingJournal.findMany({
      where: {
        academicYearId: academicYear.id,
        scheduleEntryId: { in: scheduleEntryIds },
        journalDate: {
          gte: startDate,
          lte: endDate,
        },
        ...(query.deliveryStatus ? { deliveryStatus: query.deliveryStatus } : {}),
      },
      include: {
        references: true,
      },
    }),
    prisma.attendance.findMany({
      where: {
        academicYearId: academicYear.id,
        date: {
          gte: startDate,
          lte: endDate,
        },
        OR: [
          { scheduleEntryId: { in: scheduleEntryIds } },
          { teacherAssignmentId: { in: teacherAssignmentIds } },
        ],
      },
      select: {
        id: true,
        date: true,
        scheduleEntryId: true,
        teacherAssignmentId: true,
        classId: true,
        subjectId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const journalMap = new Map(journals.map((journal) => [`${journal.scheduleEntryId}|${toDateKey(journal.journalDate)}`, journal]));
  const attendanceByScheduleDate = new Map<string, (typeof attendances)[number]>();
  const attendanceByAssignmentDate = new Map<string, (typeof attendances)[number]>();
  const attendanceByClassSubjectDate = new Map<string, (typeof attendances)[number]>();

  attendances.forEach((attendance) => {
    const dateKey = toDateKey(attendance.date);
    if (attendance.scheduleEntryId) {
      attendanceByScheduleDate.set(`${attendance.scheduleEntryId}|${dateKey}`, attendance);
    }
    if (attendance.teacherAssignmentId) {
      attendanceByAssignmentDate.set(`${attendance.teacherAssignmentId}|${dateKey}`, attendance);
    }
    attendanceByClassSubjectDate.set(`${attendance.classId}|${attendance.subjectId}|${dateKey}`, attendance);
  });

  const sessions = scheduleEntries.flatMap((entry) => {
    const rows: Array<Record<string, unknown>> = [];
    let cursor = startDate;
    while (cursor.getTime() <= endDate.getTime()) {
      const dateKey = toDateKey(cursor);
      if (
        DAY_OF_WEEK_BY_UTC_INDEX[cursor.getUTCDay()] === entry.dayOfWeek &&
        !holidayDateKeys.has(dateKey)
      ) {
        const journal = journalMap.get(`${entry.id}|${dateKey}`) || null;
        const attendance =
          attendanceByScheduleDate.get(`${entry.id}|${dateKey}`) ||
          attendanceByAssignmentDate.get(`${entry.teacherAssignmentId}|${dateKey}`) ||
          attendanceByClassSubjectDate.get(`${entry.classId}|${entry.teacherAssignment.subjectId}|${dateKey}`) ||
          null;
        const journalStatus = journal ? journal.status : 'MISSING';
        if (query.journalStatus && query.journalStatus !== journalStatus) {
          cursor = addDays(cursor, 1);
          continue;
        }

        rows.push({
          sessionKey: `${entry.id}|${dateKey}`,
          date: dateKey,
          dayOfWeek: entry.dayOfWeek,
          period: entry.period,
          room: entry.room,
          teacher: entry.teacherAssignment.teacher,
          class: entry.class,
          subject: entry.teacherAssignment.subject,
          teacherAssignmentId: entry.teacherAssignmentId,
          scheduleEntryId: entry.id,
          journalStatus,
          journal: journal ? formatJournalEntry(journal) : null,
          attendance: attendance
            ? {
                id: attendance.id,
                status: 'RECORDED',
                recordedAt: attendance.createdAt.toISOString(),
                editedAt: attendance.updatedAt.toISOString(),
              }
            : {
                id: null,
                status: 'MISSING',
                recordedAt: null,
                editedAt: null,
              },
        });
      }
      cursor = addDays(cursor, 1);
    }
    return rows;
  });

  sessions.sort((left, right) => {
    const dateCompare = String(left.date || '').localeCompare(String(right.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return Number(left.period || 0) - Number(right.period || 0);
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        sessions,
        meta: {
          academicYear: { id: academicYear.id, name: academicYear.name },
          dateRange: { start: toDateKey(startDate), end: toDateKey(endDate) },
          teacherId: effectiveTeacherId || null,
          classId: query.classId || null,
          subjectId: query.subjectId || null,
          teacherAssignmentId: query.teacherAssignmentId || null,
        },
      },
      'Daftar sesi jurnal mengajar berhasil diambil',
    ),
  );
});

export const getTeachingJournalEntryById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = teachingJournalEntryIdSchema.parse(req.params);
  const actor = (req as any).user;
  const actorRole = normalizeRole(actor?.role);
  const actorId = Number(actor?.id || 0);

  const journal = await prisma.teachingJournal.findFirst({
    where: {
      id,
      ...(actorRole === 'TEACHER' ? { teacherId: actorId } : {}),
    },
    include: {
      references: true,
      teacher: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
        },
      },
      scheduleEntry: {
        select: {
          id: true,
          dayOfWeek: true,
          period: true,
          room: true,
          class: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
          teacherAssignment: {
            select: {
              id: true,
              subject: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
              teacher: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!journal) {
    throw new ApiError(404, 'Jurnal mengajar tidak ditemukan.');
  }

  res.status(200).json(new ApiResponse(200, formatJournalEntry(journal), 'Detail jurnal mengajar berhasil diambil'));
});

export const upsertTeachingJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const payload = upsertTeachingJournalEntrySchema.parse(req.body);
  const actor = (req as any).user;
  const actorRole = normalizeRole(actor?.role);
  const actorId = Number(actor?.id || 0);
  const scheduleEntry = await loadScheduleEntryForJournal({
    scheduleEntryId: payload.scheduleEntryId,
    actorId,
    actorRole,
  });
  const academicYear = await getOperationalAcademicYear(payload.academicYearId || scheduleEntry.academicYearId);
  const journalDate = parseDateOnly(payload.journalDate);

  ensureDateWithinAcademicYear(journalDate, academicYear);
  if (DAY_OF_WEEK_BY_UTC_INDEX[journalDate.getUTCDay()] !== scheduleEntry.dayOfWeek) {
    throw new ApiError(400, 'Tanggal jurnal tidak sesuai dengan hari pada jadwal mengajar.');
  }

  const holidayDateKeys = await buildHolidayDateKeySet(academicYear.id, journalDate, journalDate);
  if (holidayDateKeys.has(toDateKey(journalDate))) {
    throw new ApiError(400, 'Tanggal jurnal bertepatan dengan hari libur akademik.');
  }

  if (actorRole === 'TEACHER' && payload.status === 'REVIEWED') {
    throw new ApiError(403, 'Guru tidak dapat menandai jurnal sebagai reviewed.');
  }

  const existingJournal = payload.id
    ? await prisma.teachingJournal.findFirst({
        where: {
          id: payload.id,
          ...(actorRole === 'TEACHER' ? { teacherId: actorId } : {}),
        },
        include: {
          references: true,
        },
      })
    : await prisma.teachingJournal.findUnique({
        where: {
          academicYearId_scheduleEntryId_journalDate: {
            academicYearId: academicYear.id,
            scheduleEntryId: scheduleEntry.id,
            journalDate,
          },
        },
        include: {
          references: true,
        },
      });

  if (payload.id && !existingJournal) {
    throw new ApiError(404, 'Jurnal mengajar yang akan diperbarui tidak ditemukan.');
  }

  if (existingJournal && existingJournal.scheduleEntryId !== scheduleEntry.id) {
    throw new ApiError(400, 'Jurnal yang dipilih tidak cocok dengan sesi jadwal yang dikirim.');
  }

  if (existingJournal && toDateKey(existingJournal.journalDate) !== toDateKey(journalDate)) {
    throw new ApiError(400, 'Tanggal jurnal yang sudah ada tidak boleh dipindah ke sesi lain.');
  }

  const nextStatus = payload.status || existingJournal?.status || 'DRAFT';
  const nextSubmittedAt =
    nextStatus === 'SUBMITTED'
      ? existingJournal?.submittedAt || new Date()
      : nextStatus === 'DRAFT'
        ? null
        : existingJournal?.submittedAt || null;
  const nextReviewedAt =
    nextStatus === 'REVIEWED'
      ? existingJournal?.reviewedAt || new Date()
      : null;
  const nextReviewerId =
    nextStatus === 'REVIEWED'
      ? existingJournal?.reviewerId || actorId || null
      : null;

  const savedJournal = await prisma.$transaction(async (tx) => {
    const journal = existingJournal
      ? await tx.teachingJournal.update({
          where: { id: existingJournal.id },
          data: {
            teacherId: scheduleEntry.teacherAssignment.teacherId,
            teacherAssignmentId: scheduleEntry.teacherAssignmentId,
            classId: scheduleEntry.classId,
            subjectId: scheduleEntry.teacherAssignment.subjectId,
            period: scheduleEntry.period,
            room: scheduleEntry.room,
            teachingMode: payload.teachingMode || existingJournal.teachingMode,
            deliveryStatus: payload.deliveryStatus || existingJournal.deliveryStatus,
            status: nextStatus,
            startedAt: payload.startedAt ? new Date(payload.startedAt) : null,
            endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
            notes: normalizeNullableText(payload.notes),
            obstacles: normalizeNullableText(payload.obstacles),
            followUpPlan: normalizeNullableText(payload.followUpPlan),
            submittedAt: nextSubmittedAt,
            reviewedAt: nextReviewedAt,
            reviewerId: nextReviewerId,
            reviewNote: nextStatus === 'REVIEWED' ? normalizeNullableText(payload.reviewNote) : null,
          },
          include: {
            references: true,
          },
        })
      : await tx.teachingJournal.create({
          data: {
            academicYearId: academicYear.id,
            teacherId: scheduleEntry.teacherAssignment.teacherId,
            teacherAssignmentId: scheduleEntry.teacherAssignmentId,
            scheduleEntryId: scheduleEntry.id,
            classId: scheduleEntry.classId,
            subjectId: scheduleEntry.teacherAssignment.subjectId,
            journalDate,
            period: scheduleEntry.period,
            room: scheduleEntry.room,
            teachingMode: payload.teachingMode || 'REGULAR',
            deliveryStatus: payload.deliveryStatus || 'COMPLETED',
            status: nextStatus,
            startedAt: payload.startedAt ? new Date(payload.startedAt) : null,
            endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
            notes: normalizeNullableText(payload.notes),
            obstacles: normalizeNullableText(payload.obstacles),
            followUpPlan: normalizeNullableText(payload.followUpPlan),
            submittedAt: nextSubmittedAt,
            reviewedAt: nextReviewedAt,
            reviewerId: nextReviewerId,
            reviewNote: nextStatus === 'REVIEWED' ? normalizeNullableText(payload.reviewNote) : null,
          },
          include: {
            references: true,
          },
        });

    if (Array.isArray(payload.references)) {
      await tx.teachingJournalReference.deleteMany({
        where: { journalId: journal.id },
      });
      if (payload.references.length > 0) {
        await tx.teachingJournalReference.createMany({
          data: payload.references.map((reference) => ({
            journalId: journal.id,
            sourceProgramCode: reference.sourceProgramCode.trim(),
            sourceEntryId: reference.sourceEntryId || null,
            sourceFieldIdentity: normalizeNullableText(reference.sourceFieldIdentity),
            selectionToken: normalizeNullableText(reference.selectionToken),
            value: reference.value.trim(),
            label: normalizeNullableText(reference.label),
            snapshot: sanitizeReferenceSnapshot(reference.snapshot || undefined),
          })),
        });
      }
    }

    return tx.teachingJournal.findUniqueOrThrow({
      where: { id: journal.id },
      include: {
        references: true,
        teacher: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
          },
        },
        scheduleEntry: {
          select: {
            id: true,
            dayOfWeek: true,
            period: true,
            room: true,
            class: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
            teacherAssignment: {
              select: {
                id: true,
                subject: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
                teacher: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  res.status(existingJournal ? 200 : 201).json(
    new ApiResponse(
      existingJournal ? 200 : 201,
      formatJournalEntry(savedJournal),
      existingJournal ? 'Jurnal mengajar berhasil diperbarui' : 'Jurnal mengajar berhasil dibuat',
    ),
  );
});
