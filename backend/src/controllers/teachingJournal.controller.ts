import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const JOURNAL_STATUS_VALUES = ['DRAFT', 'SUBMITTED', 'REVIEWED'] as const;
const JOURNAL_DELIVERY_STATUS_VALUES = ['COMPLETED', 'PARTIAL', 'NOT_DELIVERED', 'RESCHEDULED'] as const;
const JOURNAL_MODE_VALUES = ['REGULAR', 'SUBSTITUTE', 'ENRICHMENT', 'REMEDIAL', 'ASSESSMENT'] as const;
const DAY_OF_WEEK_BY_UTC_INDEX = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const MAX_SESSION_RANGE_DAYS = 62;
const MAX_MONITORING_ISSUE_ROWS = 80;

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

const getTeachingJournalMonitoringSchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
  teacherId: z.coerce.number().int().optional(),
  teacherAssignmentId: z.coerce.number().int().optional(),
  classId: z.coerce.number().int().optional(),
  subjectId: z.coerce.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  issueLimit: z.coerce.number().int().min(1).max(MAX_MONITORING_ISSUE_ROWS).optional(),
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
const normalizeDuty = (raw: unknown) =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const JOURNAL_REFERENCE_FIELD_KEYS = ['competency', 'learningObjective', 'materialScope', 'indicator'] as const;

const emptyMonitoringReferenceFields = () =>
  JOURNAL_REFERENCE_FIELD_KEYS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

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

const toPercent = (part: number, total: number) => {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
};

const getReferenceFieldKey = (reference: { sourceProgramCode?: string | null; sourceFieldIdentity?: string | null; selectionToken?: string | null; snapshot?: unknown }) => {
  const snapshot = reference.snapshot && typeof reference.snapshot === 'object' ? (reference.snapshot as Record<string, unknown>) : {};
  const snapshotField = String(snapshot.journal_reference_field || '').trim();
  if ((JOURNAL_REFERENCE_FIELD_KEYS as readonly string[]).includes(snapshotField)) return snapshotField;

  const token = String(reference.selectionToken || '').toLowerCase();
  if (token.includes(':competency:')) return 'competency';
  if (token.includes(':learningobjective:')) return 'learningObjective';
  if (token.includes(':materialscope:')) return 'materialScope';
  if (token.includes(':indicator:')) return 'indicator';

  const sourceProgramCode = String(reference.sourceProgramCode || '').trim().toUpperCase();
  const fieldIdentity = String(reference.sourceFieldIdentity || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (sourceProgramCode === 'CP' && ['capaian_pembelajaran', 'kompetensi', 'elemen'].includes(fieldIdentity)) return 'competency';
  if (['ATP', 'PROTA'].includes(sourceProgramCode) && fieldIdentity === 'tujuan_pembelajaran') return 'learningObjective';
  if (['ATP', 'CP'].includes(sourceProgramCode) && ['materi_pokok', 'konten_materi'].includes(fieldIdentity)) return 'materialScope';
  if (sourceProgramCode === 'KKTP' && fieldIdentity.includes('indikator')) return 'indicator';
  return 'other';
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

const assertCanMonitorTeachingJournals = async (actor: { id?: number; role?: string }) => {
  const actorId = Number(actor?.id || 0);
  const role = normalizeRole(actor?.role);
  if (role === 'ADMIN' || role === 'PRINCIPAL') return;
  if (role !== 'TEACHER' || actorId <= 0) {
    throw new ApiError(403, 'Tidak memiliki akses monitoring jurnal mengajar.');
  }

  const profile = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      additionalDuties: true,
    },
  });
  const duties = (profile?.additionalDuties || []).map(normalizeDuty);
  if (!duties.includes('WAKASEK_KURIKULUM') && !duties.includes('SEKRETARIS_KURIKULUM')) {
    throw new ApiError(403, 'Monitoring jurnal mengajar hanya untuk Wakasek/Sekretaris Kurikulum.');
  }
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

const getJsonObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getNestedConfigValue = (map: Record<string, unknown>, dayKey: string, period: number) => {
  const dayValues = getJsonObject(map[dayKey]);
  const defaultValues = getJsonObject(map.DEFAULT);
  const key = String(period);
  return dayValues[key] ?? defaultValues[key] ?? null;
};

const getPeriodTimeValue = (configObject: Record<string, unknown>, dayKey: string, period: number) => {
  const periodTimes = getJsonObject(configObject.periodTimes);
  const rawValue = getNestedConfigValue(periodTimes, dayKey, period);
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  return value || null;
};

const isNonTeachingSchedulePeriod = (configObject: Record<string, unknown>, dayKey: string, period: number) => {
  const periodTypes = getJsonObject(configObject.periodTypes);
  const rawType = getNestedConfigValue(periodTypes, dayKey, period);
  const normalizedType = typeof rawType === 'string' ? rawType.trim().toUpperCase() : '';
  if (normalizedType === 'TEACHING') return false;
  if (['UPACARA', 'ISTIRAHAT', 'TADARUS', 'OTHER'].includes(normalizedType)) return true;

  const periodNotes = getJsonObject(configObject.periodNotes);
  const rawNote = getNestedConfigValue(periodNotes, dayKey, period);
  const normalizedNote = typeof rawNote === 'string' ? rawNote.trim().toUpperCase() : '';
  return (
    normalizedNote.includes('UPACARA') ||
    normalizedNote.includes('ISTIRAHAT') ||
    normalizedNote.includes('TADARUS')
  );
};

const getEffectiveTeachingHour = (configObject: Record<string, unknown>, dayKey: string, currentPeriod: number) => {
  const period = Number(currentPeriod || 0);
  if (!Number.isFinite(period) || period < 1) return null;
  if (isNonTeachingSchedulePeriod(configObject, dayKey, period)) return null;

  let teachingCounter = 0;
  for (let cursor = 1; cursor <= period; cursor += 1) {
    if (!isNonTeachingSchedulePeriod(configObject, dayKey, cursor)) {
      teachingCounter += 1;
    }
  }

  return teachingCounter > 0 ? teachingCounter : null;
};

const extractPeriodTimeBoundary = (rawValue: string | null, side: 'start' | 'end') => {
  if (!rawValue) return null;
  const parts = rawValue
    .split('-')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parts.length) return rawValue.trim() || null;
  return side === 'start' ? parts[0] : parts[parts.length - 1];
};

type TeachingJournalScheduleEntryBlockItem = {
  id: number;
  dayOfWeek: string;
  period: number;
  room: string | null;
  classId: number;
  teacherAssignmentId: number;
  teacherAssignment: {
    subjectId: number;
  };
};

const sameTeachingBlock = (
  left: TeachingJournalScheduleEntryBlockItem,
  right: TeachingJournalScheduleEntryBlockItem,
  leftEffectivePeriod: number,
  rightEffectivePeriod: number,
) =>
  left.dayOfWeek === right.dayOfWeek &&
  leftEffectivePeriod + 1 === rightEffectivePeriod &&
  left.classId === right.classId &&
  left.teacherAssignmentId === right.teacherAssignmentId &&
  left.teacherAssignment.subjectId === right.teacherAssignment.subjectId &&
  String(left.room || '').trim() === String(right.room || '').trim();

const groupScheduleEntriesIntoBlocks = <T extends TeachingJournalScheduleEntryBlockItem>(
  entries: T[],
  scheduleTimeConfig: Record<string, unknown>,
) => {
  const blocks: Array<Array<{ entry: T; effectivePeriod: number }>> = [];
  const sortedEntries = entries
    .map((entry) => ({
      entry,
      effectivePeriod: getEffectiveTeachingHour(scheduleTimeConfig, entry.dayOfWeek, entry.period),
    }))
    .filter((item): item is { entry: T; effectivePeriod: number } => item.effectivePeriod !== null)
    .sort((left, right) => {
      if (left.entry.dayOfWeek !== right.entry.dayOfWeek) return left.entry.dayOfWeek.localeCompare(right.entry.dayOfWeek);
      if (left.effectivePeriod !== right.effectivePeriod) return left.effectivePeriod - right.effectivePeriod;
      return left.entry.period - right.entry.period;
    });

  sortedEntries.forEach((item) => {
    const activeBlock = blocks[blocks.length - 1];
    const previous = activeBlock?.[activeBlock.length - 1] || null;
    if (
      activeBlock &&
      previous &&
      sameTeachingBlock(previous.entry, item.entry, previous.effectivePeriod, item.effectivePeriod)
    ) {
      activeBlock.push(item);
      return;
    }
    blocks.push([item]);
  });

  return blocks.map((block) => block.map((item) => item.entry));
};

const buildTeachingBlockMeta = (
  entries: TeachingJournalScheduleEntryBlockItem[],
  scheduleTimeConfig: Record<string, unknown>,
) => {
  const first = entries[0];
  const last = entries[entries.length - 1] || first;
  const rawPeriodStart = Number(first?.period || 0);
  const rawPeriodEnd = Number(last?.period || rawPeriodStart);
  const periodStart = getEffectiveTeachingHour(scheduleTimeConfig, first?.dayOfWeek || '', rawPeriodStart) || rawPeriodStart;
  const periodEnd = getEffectiveTeachingHour(scheduleTimeConfig, last?.dayOfWeek || '', rawPeriodEnd) || periodStart;
  const start = extractPeriodTimeBoundary(getPeriodTimeValue(scheduleTimeConfig, first?.dayOfWeek || '', rawPeriodStart), 'start');
  const end = extractPeriodTimeBoundary(getPeriodTimeValue(scheduleTimeConfig, last?.dayOfWeek || '', rawPeriodEnd), 'end');

  return {
    periodStart,
    periodEnd,
    periodLabel: periodStart === periodEnd ? `Jam ke ${periodStart}` : `Jam ke ${periodStart}-${periodEnd}`,
    jpCount: Math.max(1, entries.length),
    timeRange: start && end ? `${start} - ${end}` : start || end || null,
    scheduleEntryIds: entries.map((entry) => entry.id),
  };
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

  const [journals, attendances, scheduleTimeConfig] = await Promise.all([
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
    prisma.scheduleTimeConfig.findUnique({
      where: { academicYearId: academicYear.id },
      select: { config: true },
    }),
  ]);
  const scheduleTimeConfigObject = getJsonObject(scheduleTimeConfig?.config);

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

  const resolveJournalForBlock = (entries: typeof scheduleEntries, dateKey: string) =>
    entries
      .map((entry) => journalMap.get(`${entry.id}|${dateKey}`) || null)
      .find(Boolean) || null;

  const resolveAttendanceForBlock = (entries: typeof scheduleEntries, dateKey: string) =>
    entries
      .map((entry) =>
        attendanceByScheduleDate.get(`${entry.id}|${dateKey}`) ||
        attendanceByAssignmentDate.get(`${entry.teacherAssignmentId}|${dateKey}`) ||
        attendanceByClassSubjectDate.get(`${entry.classId}|${entry.teacherAssignment.subjectId}|${dateKey}`) ||
        null,
      )
      .find(Boolean) || null;

  const sessions: Array<Record<string, unknown>> = [];
  let cursor = startDate;
  while (cursor.getTime() <= endDate.getTime()) {
    const dateKey = toDateKey(cursor);
    if (!holidayDateKeys.has(dateKey)) {
      const dayOfWeek = DAY_OF_WEEK_BY_UTC_INDEX[cursor.getUTCDay()];
      const dayEntries = scheduleEntries.filter((entry) => entry.dayOfWeek === dayOfWeek);
      groupScheduleEntriesIntoBlocks(dayEntries, scheduleTimeConfigObject).forEach((blockEntries) => {
        const firstEntry = blockEntries[0];
        if (!firstEntry) return;
        const blockMeta = buildTeachingBlockMeta(blockEntries, scheduleTimeConfigObject);
        const journal = resolveJournalForBlock(blockEntries, dateKey);
        const attendance = resolveAttendanceForBlock(blockEntries, dateKey);
        const journalStatus = journal ? journal.status : 'MISSING';
        if (query.journalStatus && query.journalStatus !== journalStatus) return;

        sessions.push({
          sessionKey: `block:${dateKey}:${blockMeta.scheduleEntryIds.join('-')}`,
          date: dateKey,
          dayOfWeek: firstEntry.dayOfWeek,
          period: blockMeta.periodStart,
          periodStart: blockMeta.periodStart,
          periodEnd: blockMeta.periodEnd,
          periodLabel: blockMeta.periodLabel,
          jpCount: blockMeta.jpCount,
          timeRange: blockMeta.timeRange,
          room: firstEntry.room,
          teacher: firstEntry.teacherAssignment.teacher,
          class: firstEntry.class,
          subject: firstEntry.teacherAssignment.subject,
          teacherAssignmentId: firstEntry.teacherAssignmentId,
          scheduleEntryId: journal?.scheduleEntryId || firstEntry.id,
          scheduleEntryIds: blockMeta.scheduleEntryIds,
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
      });
    }
    cursor = addDays(cursor, 1);
  }

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

export const getTeachingJournalMonitoring = asyncHandler(async (req: Request, res: Response) => {
  const query = getTeachingJournalMonitoringSchema.parse(req.query);
  const actor = (req as any).user;
  await assertCanMonitorTeachingJournals({ id: actor?.id, role: actor?.role });

  const academicYear = await getOperationalAcademicYear(query.academicYearId);
  const { startDate, endDate } = resolveSessionDateRange(query.startDate, query.endDate);
  const keyword = String(query.search || '').trim().toLowerCase();
  const issueLimit = Math.min(MAX_MONITORING_ISSUE_ROWS, Math.max(1, Number(query.issueLimit || 50)));

  const scheduleEntries = await prisma.scheduleEntry.findMany({
    where: {
      academicYearId: academicYear.id,
      ...(query.teacherAssignmentId ? { teacherAssignmentId: query.teacherAssignmentId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      teacherAssignment: {
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
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
          meta: {
            academicYear: { id: academicYear.id, name: academicYear.name },
            dateRange: { start: toDateKey(startDate), end: toDateKey(endDate) },
            filters: {
              teacherId: query.teacherId || null,
              teacherAssignmentId: query.teacherAssignmentId || null,
              classId: query.classId || null,
              subjectId: query.subjectId || null,
              search: query.search || null,
            },
          },
          summary: {
            expectedSessions: 0,
            journalFilled: 0,
            submittedSessions: 0,
            reviewedSessions: 0,
            draftSessions: 0,
            missingSessions: 0,
            attendanceRecorded: 0,
            attendanceMismatch: 0,
            referenceLinkedSessions: 0,
            referenceFields: emptyMonitoringReferenceFields(),
            latestJournalAt: null,
            submittedAndReviewed: 0,
            complianceRate: 0,
            fillRate: 0,
            attendanceRate: 0,
            coverageRate: 0,
          },
          teacherRows: [],
          classRows: [],
          issueRows: [],
        },
        'Monitoring jurnal mengajar berhasil dimuat',
      ),
    );
    return;
  }

  const holidayDateKeys = await buildHolidayDateKeySet(academicYear.id, startDate, endDate);
  const scheduleEntryIds = scheduleEntries.map((entry) => entry.id);
  const teacherAssignmentIds = Array.from(new Set(scheduleEntries.map((entry) => entry.teacherAssignmentId)));

  const [journals, attendances, scheduleTimeConfig] = await Promise.all([
    prisma.teachingJournal.findMany({
      where: {
        academicYearId: academicYear.id,
        scheduleEntryId: { in: scheduleEntryIds },
        journalDate: {
          gte: startDate,
          lte: endDate,
        },
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
    prisma.scheduleTimeConfig.findUnique({
      where: { academicYearId: academicYear.id },
      select: { config: true },
    }),
  ]);
  const scheduleTimeConfigObject = getJsonObject(scheduleTimeConfig?.config);

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

  const createAggregate = () => ({
    expectedSessions: 0,
    journalFilled: 0,
    submittedSessions: 0,
    reviewedSessions: 0,
    draftSessions: 0,
    missingSessions: 0,
    attendanceRecorded: 0,
    attendanceMismatch: 0,
    referenceLinkedSessions: 0,
    referenceFields: emptyMonitoringReferenceFields(),
    latestJournalAt: null as string | null,
  });

  const summary = createAggregate();
  const teacherRows = new Map<number, ReturnType<typeof createAggregate> & { teacher: { id: number; name: string; username?: string | null } }>();
  const classRows = new Map<number, ReturnType<typeof createAggregate> & { class: { id: number; name: string; level?: string | null; major?: { id: number; name: string; code?: string | null } | null } }>();
  const issueRows: Array<Record<string, unknown>> = [];

  const addMetrics = (target: ReturnType<typeof createAggregate>, metrics: {
    journalStatus: string;
    attendanceRecorded: boolean;
    attendanceMismatch: boolean;
    referenceCount: number;
    referenceFieldCounts: Record<string, number>;
    journalUpdatedAt?: string | null;
  }) => {
    target.expectedSessions += 1;
    if (metrics.journalStatus !== 'MISSING') target.journalFilled += 1;
    if (metrics.journalStatus === 'SUBMITTED') target.submittedSessions += 1;
    if (metrics.journalStatus === 'REVIEWED') target.reviewedSessions += 1;
    if (metrics.journalStatus === 'DRAFT') target.draftSessions += 1;
    if (metrics.journalStatus === 'MISSING') target.missingSessions += 1;
    if (metrics.attendanceRecorded) target.attendanceRecorded += 1;
    if (metrics.attendanceMismatch) target.attendanceMismatch += 1;
    if (metrics.referenceCount > 0) target.referenceLinkedSessions += 1;
    Object.entries(metrics.referenceFieldCounts).forEach(([field, total]) => {
      target.referenceFields[field] = Number(target.referenceFields[field] || 0) + Number(total || 0);
    });
    if (metrics.journalUpdatedAt && (!target.latestJournalAt || metrics.journalUpdatedAt > target.latestJournalAt)) {
      target.latestJournalAt = metrics.journalUpdatedAt;
    }
  };

  const resolveJournalForBlock = (entries: typeof scheduleEntries, dateKey: string) =>
    entries
      .map((entry) => journalMap.get(`${entry.id}|${dateKey}`) || null)
      .find(Boolean) || null;

  const resolveAttendanceForBlock = (entries: typeof scheduleEntries, dateKey: string) =>
    entries
      .map((entry) =>
        attendanceByScheduleDate.get(`${entry.id}|${dateKey}`) ||
        attendanceByAssignmentDate.get(`${entry.teacherAssignmentId}|${dateKey}`) ||
        attendanceByClassSubjectDate.get(`${entry.classId}|${entry.teacherAssignment.subjectId}|${dateKey}`) ||
        null,
      )
      .find(Boolean) || null;

  let cursor = startDate;
  while (cursor.getTime() <= endDate.getTime()) {
    const dateKey = toDateKey(cursor);
    if (!holidayDateKeys.has(dateKey)) {
      const dayOfWeek = DAY_OF_WEEK_BY_UTC_INDEX[cursor.getUTCDay()];
      const dayEntries = scheduleEntries.filter((entry) => entry.dayOfWeek === dayOfWeek);
      groupScheduleEntriesIntoBlocks(dayEntries, scheduleTimeConfigObject).forEach((blockEntries) => {
        const entry = blockEntries[0];
        if (!entry) return;
        const blockMeta = buildTeachingBlockMeta(blockEntries, scheduleTimeConfigObject);
        const journal = resolveJournalForBlock(blockEntries, dateKey);
        const attendance = resolveAttendanceForBlock(blockEntries, dateKey);
        const journalStatus = journal ? journal.status : 'MISSING';
        const referenceFieldCounts = emptyMonitoringReferenceFields();
        let referenceCount = 0;
        (journal?.references || []).forEach((reference) => {
          referenceCount += 1;
          const field = getReferenceFieldKey(reference);
          if (field !== 'other') {
            referenceFieldCounts[field] = Number(referenceFieldCounts[field] || 0) + 1;
          }
        });
        const attendanceRecorded = Boolean(attendance);
        const attendanceMismatch = (journalStatus === 'MISSING' && attendanceRecorded) || (journalStatus !== 'MISSING' && !attendanceRecorded);
        const submittedOrReviewed = journalStatus === 'SUBMITTED' || journalStatus === 'REVIEWED';
        const issueLabels = [
          journalStatus === 'MISSING' ? 'Jurnal belum diisi' : '',
          journalStatus !== 'MISSING' && !attendanceRecorded ? 'Presensi mapel belum ada' : '',
          journalStatus === 'MISSING' && attendanceRecorded ? 'Presensi ada, jurnal belum ada' : '',
          submittedOrReviewed && referenceCount === 0 ? 'Referensi perangkat ajar kosong' : '',
        ].filter(Boolean);
        const haystack = [
          entry.teacherAssignment.teacher?.name || '',
          entry.teacherAssignment.teacher?.username || '',
          entry.class?.name || '',
          entry.class?.major?.name || '',
          entry.teacherAssignment.subject?.name || '',
          entry.teacherAssignment.subject?.code || '',
        ]
          .join(' ')
          .toLowerCase();

        if (!keyword || haystack.includes(keyword)) {
          const metrics = {
            journalStatus,
            attendanceRecorded,
            attendanceMismatch,
            referenceCount,
            referenceFieldCounts,
            journalUpdatedAt: journal?.updatedAt?.toISOString() || null,
          };
          addMetrics(summary, metrics);

          const teacherId = entry.teacherAssignment.teacher.id;
          if (!teacherRows.has(teacherId)) {
            teacherRows.set(teacherId, {
              ...createAggregate(),
              teacher: entry.teacherAssignment.teacher,
            });
          }
          addMetrics(teacherRows.get(teacherId)!, metrics);

          const classId = entry.class.id;
          if (!classRows.has(classId)) {
            classRows.set(classId, {
              ...createAggregate(),
              class: entry.class,
            });
          }
          addMetrics(classRows.get(classId)!, metrics);

          if (issueLabels.length > 0 && issueRows.length < issueLimit) {
            issueRows.push({
              sessionKey: `block:${dateKey}:${blockMeta.scheduleEntryIds.join('-')}`,
              date: dateKey,
              dayOfWeek: entry.dayOfWeek,
              period: blockMeta.periodStart,
              periodStart: blockMeta.periodStart,
              periodEnd: blockMeta.periodEnd,
              periodLabel: blockMeta.periodLabel,
              jpCount: blockMeta.jpCount,
              timeRange: blockMeta.timeRange,
              room: entry.room,
              teacher: entry.teacherAssignment.teacher,
              class: entry.class,
              subject: entry.teacherAssignment.subject,
              journalStatus,
              deliveryStatus: journal?.deliveryStatus || null,
              attendanceStatus: attendanceRecorded ? 'RECORDED' : 'MISSING',
              referenceCount,
              issueLabels,
              submittedAt: journal?.submittedAt?.toISOString() || null,
              updatedAt: journal?.updatedAt?.toISOString() || null,
            });
          }
        }
      });
    }
    cursor = addDays(cursor, 1);
  }

  const formatAggregate = <T extends Record<string, unknown>>(row: ReturnType<typeof createAggregate> & T) => {
    const submittedAndReviewed = row.submittedSessions + row.reviewedSessions;
    return {
      ...row,
      submittedAndReviewed,
      complianceRate: toPercent(submittedAndReviewed, row.expectedSessions),
      fillRate: toPercent(row.journalFilled, row.expectedSessions),
      attendanceRate: toPercent(row.attendanceRecorded, row.expectedSessions),
      coverageRate: toPercent(row.referenceLinkedSessions, row.journalFilled),
    };
  };

  const formattedTeacherRows = Array.from(teacherRows.values())
    .map(formatAggregate)
    .sort((a, b) => {
      if (a.complianceRate !== b.complianceRate) return a.complianceRate - b.complianceRate;
      if (a.missingSessions !== b.missingSessions) return b.missingSessions - a.missingSessions;
      return String(a.teacher?.name || '').localeCompare(String(b.teacher?.name || ''));
    });

  const formattedClassRows = Array.from(classRows.values())
    .map(formatAggregate)
    .sort((a, b) => {
      if (a.complianceRate !== b.complianceRate) return a.complianceRate - b.complianceRate;
      if (a.missingSessions !== b.missingSessions) return b.missingSessions - a.missingSessions;
      return String(a.class?.name || '').localeCompare(String(b.class?.name || ''), 'id', { numeric: true });
    });

  issueRows.sort((left, right) => {
    const dateCompare = String(right.date || '').localeCompare(String(left.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return Number(left.period || 0) - Number(right.period || 0);
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        meta: {
          academicYear: { id: academicYear.id, name: academicYear.name },
          dateRange: { start: toDateKey(startDate), end: toDateKey(endDate) },
          filters: {
            teacherId: query.teacherId || null,
            teacherAssignmentId: query.teacherAssignmentId || null,
            classId: query.classId || null,
            subjectId: query.subjectId || null,
            search: keyword || null,
          },
        },
        summary: formatAggregate(summary),
        teacherRows: formattedTeacherRows,
        classRows: formattedClassRows,
        issueRows,
      },
      'Monitoring jurnal mengajar berhasil dimuat',
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
