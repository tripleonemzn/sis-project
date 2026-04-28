import { DailyPresenceCaptureSource, DailyPresenceEventType, Prisma, Role } from '@prisma/client';
import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { broadcastDomainEvent } from '../realtime/realtimeGateway';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';
import {
  DAILY_PRESENCE_SELF_SCAN_QR_TOKEN_TTL_SECONDS,
  buildDailyPresenceSelfScanMonitorPayload,
  buildDailyPresenceSelfScanQrToken,
  buildDailyPresenceSelfScanSessionManagerPayload,
  buildDailyPresenceSelfScanSessionPublicPayload,
  closeActiveDailyPresenceSelfScanSession,
  consumeDailyPresenceSelfScanQrToken,
  createActiveDailyPresenceSelfScanSession,
  getActiveDailyPresenceSelfScanSession,
  verifyDailyPresenceChallengeCode,
  verifyDailyPresenceSelfScanMonitorQrToken,
  verifyDailyPresenceSelfScanQrToken,
} from '../utils/dailyPresenceSelfScan';
import { resolveStandardSchoolDisplayName } from '../utils/standardSchoolDocumentHeader';

function normalizeCode(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

async function getPresenceManagerProfile(userId: number) {
  const profile = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      role: true,
      name: true,
      username: true,
      ptkType: true,
    },
  });

  if (!profile) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  if (profile.role === 'ADMIN') {
    return profile;
  }

  if (profile.role === 'STAFF') {
    const ptkType = normalizeCode(profile.ptkType);
    if (
      ptkType === 'STAFF_ADMINISTRASI' ||
      ptkType === 'KEPALA_TU' ||
      ptkType === 'KEPALA_TATA_USAHA'
    ) {
      return profile;
    }
  }

  throw new ApiError(403, 'Akses presensi harian hanya untuk administrasi sekolah.');
}

async function getActiveAcademicYearOrThrow() {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (!activeAcademicYear) {
    throw new ApiError(400, 'Tahun ajaran aktif belum tersedia.');
  }

  return activeAcademicYear;
}

function getJakartaDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

const jakartaWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
});

const jakartaMinuteFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function toDateOnly(dateKey: string) {
  return new Date(dateKey);
}

function formatTime(value?: Date | null) {
  if (!value) return null;
  return value.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

const getDailyPresenceOverviewSchema = z.object({
  date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const getStudentDailyPresenceSchema = z.object({
  studentId: z.coerce.number().int(),
  date: z.string().optional(),
});

const getDailyPresenceStudentsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const getDailyPresenceParticipantsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const getDailyPresenceParticipantSchema = z.object({
  userId: z.coerce.number().int(),
  date: z.string().optional(),
});

const getOwnDailyPresenceHistorySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

const dayOfWeekValues = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
type DailyPresencePolicyDayKey = (typeof dayOfWeekValues)[number];
type DailyPresenceCheckpoint = 'CHECK_IN' | 'CHECK_OUT';

const USER_DAILY_PRESENCE_ROLES = new Set<Role>([
  Role.TEACHER,
  Role.STAFF,
  Role.PRINCIPAL,
  Role.EXTRACURRICULAR_TUTOR,
]);

const DEFAULT_SCHEDULE_PERIOD_TIMES: Record<DailyPresencePolicyDayKey, Record<number, string>> = {
  MONDAY: {
    1: '06.40 - 07.30',
    2: '07.30 - 08.00',
    3: '08.00 - 08.30',
    4: '08.30 - 09.00',
    5: '09.00 - 09.30',
    6: '09.30 - 10.00',
    7: '10.00 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 13.00',
    12: '13.00 - 13.30',
    13: '13.30 - 14.00',
  },
  TUESDAY: {
    1: '06.30 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.15',
    8: '10.15 - 10.45',
    9: '10.45 - 11.15',
    10: '11.15 - 11.45',
    11: '11.45 - 12.30',
    12: '12.30 - 13.00',
    13: '13.00 - 13.30',
  },
  WEDNESDAY: {
    1: '06.30 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 12.30',
    12: '12.30 - 13.00',
  },
  THURSDAY: {
    1: '06.50 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 12.30',
    12: '12.30 - 13.00',
  },
  FRIDAY: {
    1: '06.45 - 07.00',
    2: '07.00 - 07.30',
    3: '07.30 - 08.00',
    4: '08.00 - 08.30',
    5: '08.30 - 09.00',
    6: '09.00 - 09.30',
    7: '09.30 - 10.00',
    8: '10.00 - 10.30',
    9: '10.30 - 11.00',
    10: '11.00 - 11.30',
  },
  SATURDAY: {},
};

const timeStringSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm.');

const dailyPresencePolicyWindowSchema = z.object({
  openAt: timeStringSchema,
  closeAt: timeStringSchema,
});

const dailyPresencePolicyDaySchema = z
  .object({
    enabled: z.boolean(),
    checkIn: dailyPresencePolicyWindowSchema.extend({
      onTimeUntil: timeStringSchema,
    }),
    checkOut: dailyPresencePolicyWindowSchema.extend({
      validFrom: timeStringSchema,
    }),
    teacherDutySaturdayMode: z.enum(['DISABLED', 'MANUAL', 'QR']).optional(),
    notes: z.string().trim().max(300).optional().nullable(),
  })
  .superRefine((day, ctx) => {
    const checkInOpen = toMinuteOfDay(day.checkIn.openAt);
    const checkInOnTime = toMinuteOfDay(day.checkIn.onTimeUntil);
    const checkInClose = toMinuteOfDay(day.checkIn.closeAt);
    const checkOutOpen = toMinuteOfDay(day.checkOut.openAt);
    const checkOutValid = toMinuteOfDay(day.checkOut.validFrom);
    const checkOutClose = toMinuteOfDay(day.checkOut.closeAt);

    if (checkInOpen > checkInOnTime || checkInOnTime > checkInClose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkIn'],
        message: 'Urutan jam masuk harus mulai <= tepat waktu <= tutup.',
      });
    }

    if (checkOutOpen > checkOutValid || checkOutValid > checkOutClose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkOut'],
        message: 'Urutan jam pulang harus mulai <= valid pulang <= tutup.',
      });
    }
  });

const dailyPresencePolicySchema = z.object({
  version: z.literal(1).optional(),
  timezone: z.literal('Asia/Jakarta').optional(),
  qrRefreshSeconds: z.coerce.number().int().min(10).max(120).optional(),
  days: z.record(z.enum(dayOfWeekValues), dailyPresencePolicyDaySchema),
});

const saveDailyPresencePolicySchema = z.object({
  policy: dailyPresencePolicySchema,
});

const saveAssistedDailyPresenceSchema = z.object({
  studentId: z.number().int(),
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  reason: z.string().trim().min(3).max(500),
  gateLabel: z.string().trim().max(100).optional().nullable(),
});

const saveAssistedUserDailyPresenceSchema = z.object({
  userId: z.number().int(),
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  reason: z.string().trim().min(3).max(500),
  gateLabel: z.string().trim().max(100).optional().nullable(),
});

const selfScanSessionSchema = z.object({
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  gateLabel: z.string().trim().max(100).optional().nullable(),
});

const selfScanPassSchema = z.object({
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  challengeCode: z.string().trim().min(4).max(16),
});

const selfScanPreviewSchema = z.object({
  qrToken: z.string().trim().min(16),
});

const selfScanMonitorConfirmSchema = z.object({
  qrToken: z.string().trim().min(16),
});

function buildPresencePayload(
  attendance: {
    id: number;
    date: Date;
    status: string;
    note: string | null;
    checkInTime: Date | null;
    checkOutTime: Date | null;
    checkInSource: DailyPresenceCaptureSource | null;
    checkOutSource: DailyPresenceCaptureSource | null;
    checkInReason: string | null;
    checkOutReason: string | null;
  } | null,
) {
  if (!attendance) {
    return {
      id: null,
      date: null,
      status: null,
      note: null,
      checkInTime: null,
      checkOutTime: null,
      checkInSource: null,
      checkOutSource: null,
      checkInReason: null,
      checkOutReason: null,
    };
  }

  return {
    id: attendance.id,
    date: formatDate(attendance.date),
    status: attendance.status,
    note: attendance.note,
    checkInTime: formatTime(attendance.checkInTime),
    checkOutTime: formatTime(attendance.checkOutTime),
    checkInSource: attendance.checkInSource,
    checkOutSource: attendance.checkOutSource,
    checkInReason: attendance.checkInReason,
    checkOutReason: attendance.checkOutReason,
  };
}

function buildUserPresencePayload(
  presence: {
    id: number;
    date: Date;
    status: string;
    note: string | null;
    checkInTime: Date | null;
    checkOutTime: Date | null;
    checkInSource: DailyPresenceCaptureSource | null;
    checkOutSource: DailyPresenceCaptureSource | null;
    checkInReason: string | null;
    checkOutReason: string | null;
    checkInLateMinutes: number | null;
    checkOutEarlyMinutes: number | null;
    scheduleBasis?: Prisma.JsonValue | null;
  } | null,
) {
  if (!presence) {
    return {
      id: null,
      date: null,
      status: null,
      note: null,
      checkInTime: null,
      checkOutTime: null,
      checkInSource: null,
      checkOutSource: null,
      checkInReason: null,
      checkOutReason: null,
      checkInLateMinutes: 0,
      checkOutEarlyMinutes: 0,
      scheduleBasis: null,
    };
  }

  return {
    id: presence.id,
    date: formatDate(presence.date),
    status: presence.status,
    note: presence.note,
    checkInTime: formatTime(presence.checkInTime),
    checkOutTime: formatTime(presence.checkOutTime),
    checkInSource: presence.checkInSource,
    checkOutSource: presence.checkOutSource,
    checkInReason: presence.checkInReason,
    checkOutReason: presence.checkOutReason,
    checkInLateMinutes: presence.checkInLateMinutes || 0,
    checkOutEarlyMinutes: presence.checkOutEarlyMinutes || 0,
    scheduleBasis: presence.scheduleBasis || null,
  };
}

function toMinuteOfDay(value: string) {
  const [hour, minute] = String(value || '00:00')
    .split(':')
    .map((part) => Number(part));
  return hour * 60 + minute;
}

function getJakartaMinuteOfDay(date = new Date()) {
  const parts = jakartaMinuteFormatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function getJakartaPolicyDayKey(date = new Date()): DailyPresencePolicyDayKey | null {
  const weekday = jakartaWeekdayFormatter.format(date);
  const map: Record<string, DailyPresencePolicyDayKey> = {
    Monday: 'MONDAY',
    Tuesday: 'TUESDAY',
    Wednesday: 'WEDNESDAY',
    Thursday: 'THURSDAY',
    Friday: 'FRIDAY',
    Saturday: 'SATURDAY',
  };
  return map[weekday] || null;
}

function getDefaultDailyPresencePolicyDay(day: DailyPresencePolicyDayKey) {
  const isSaturday = day === 'SATURDAY';
  const isFriday = day === 'FRIDAY';
  return {
    enabled: !isSaturday,
    checkIn: {
      openAt: '06:00',
      onTimeUntil: '06:40',
      closeAt: '11:00',
    },
    checkOut: {
      openAt: isFriday ? '11:00' : '12:00',
      validFrom: isFriday ? '11:30' : '15:00',
      closeAt: isFriday ? '17:00' : '18:00',
    },
    teacherDutySaturdayMode: isSaturday ? 'MANUAL' : 'QR',
    notes: isSaturday ? 'Sabtu default nonaktif untuk siswa/staff; guru dengan duty dapat diproses manual.' : null,
  };
}

function buildDefaultDailyPresencePolicy() {
  return {
    version: 1,
    timezone: 'Asia/Jakarta',
    qrRefreshSeconds: 30,
    days: dayOfWeekValues.reduce(
      (acc, day) => {
        acc[day] = getDefaultDailyPresencePolicyDay(day);
        return acc;
      },
      {} as Record<DailyPresencePolicyDayKey, ReturnType<typeof getDefaultDailyPresencePolicyDay>>,
    ),
  };
}

function normalizeDailyPresencePolicy(rawPolicy: unknown) {
  const defaultPolicy = buildDefaultDailyPresencePolicy();
  const candidate = rawPolicy && typeof rawPolicy === 'object' ? (rawPolicy as any) : {};
  const candidateDays = candidate.days && typeof candidate.days === 'object' ? candidate.days : {};
  const merged = {
    version: 1,
    timezone: 'Asia/Jakarta',
    qrRefreshSeconds: Number(candidate.qrRefreshSeconds || defaultPolicy.qrRefreshSeconds),
    days: dayOfWeekValues.reduce(
      (acc, day) => {
        const defaultDay = defaultPolicy.days[day];
        const candidateDay = candidateDays[day] && typeof candidateDays[day] === 'object' ? candidateDays[day] : {};
        acc[day] = {
          ...defaultDay,
          ...candidateDay,
          checkIn: {
            ...defaultDay.checkIn,
            ...(candidateDay.checkIn && typeof candidateDay.checkIn === 'object' ? candidateDay.checkIn : {}),
          },
          checkOut: {
            ...defaultDay.checkOut,
            ...(candidateDay.checkOut && typeof candidateDay.checkOut === 'object' ? candidateDay.checkOut : {}),
          },
        };
        return acc;
      },
      {} as Record<DailyPresencePolicyDayKey, ReturnType<typeof getDefaultDailyPresencePolicyDay>>,
    ),
  };

  return dailyPresencePolicySchema.parse(merged);
}

function getJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function getMonthDateRange(params: { month?: number; year?: number }) {
  const now = new Date();
  const month = params.month || now.getMonth() + 1;
  const year = params.year || now.getFullYear();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { month, year, start, end };
}

function mapStudentPresenceEventItem(
  event: {
    id: number;
    eventType: DailyPresenceEventType;
    source: DailyPresenceCaptureSource;
    reason: string | null;
    gateLabel: string | null;
    recordedAt: Date;
    student?: {
      id: number;
      name: string;
      photo: string | null;
      nis: string | null;
      nisn: string | null;
    } | null;
    class?: {
      id: number;
      name: string;
    } | null;
    actor?: {
      id: number;
      name: string;
    } | null;
  },
) {
  return {
    id: event.id,
    eventType: event.eventType,
    source: event.source,
    reason: event.reason,
    gateLabel: event.gateLabel,
    recordedAt: event.recordedAt.toISOString(),
    recordedTime: formatTime(event.recordedAt),
    student: event.student || undefined,
    class: event.class || undefined,
    actor: event.actor || null,
  };
}

function mapUserPresenceEventItem(
  event: {
    id: number;
    eventType: DailyPresenceEventType;
    source: DailyPresenceCaptureSource;
    reason: string | null;
    gateLabel: string | null;
    recordedAt: Date;
    lateMinutes?: number | null;
    user?: {
      id: number;
      name: string;
      username: string | null;
      photo: string | null;
      nip: string | null;
      role: Role;
      ptkType: string | null;
      additionalDuties: string[];
    } | null;
    actor?: {
      id: number;
      name: string;
    } | null;
  },
) {
  return {
    id: event.id,
    eventType: event.eventType,
    source: event.source,
    reason: event.reason,
    gateLabel: event.gateLabel,
    recordedAt: event.recordedAt.toISOString(),
    recordedTime: formatTime(event.recordedAt),
    lateMinutes: event.lateMinutes || 0,
    participant: event.user
      ? {
          id: event.user.id,
          name: event.user.name,
          username: event.user.username || null,
          photo: event.user.photo || null,
          nip: event.user.nip || null,
          role: event.user.role,
          ptkType: event.user.ptkType || null,
          additionalDuties: event.user.additionalDuties || [],
        }
      : undefined,
    actor: event.actor || null,
  };
}

function minuteToClock(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseClockMinute(rawValue: unknown) {
  const match = String(rawValue || '').match(/(\d{1,2})[.:](\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function parsePeriodTimeRange(rawValue: unknown) {
  const parts = String(rawValue || '')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);
  const startMinute = parseClockMinute(parts[0] || rawValue);
  const endMinute = parseClockMinute(parts.length > 1 ? parts[parts.length - 1] : null);
  if (startMinute === null && endMinute === null) return null;
  return {
    startMinute,
    endMinute,
    startLabel: startMinute === null ? null : minuteToClock(startMinute),
    endLabel: endMinute === null ? null : minuteToClock(endMinute),
  };
}

function getNestedPeriodValue(map: Record<string, unknown>, dayKey: string, period: number) {
  const dayValues = getJsonObject(map[dayKey]);
  const defaultValues = getJsonObject(map.DEFAULT);
  const key = String(period);
  return dayValues[key] ?? defaultValues[key] ?? null;
}

function getSchedulePeriodTimeValue(configObject: Record<string, unknown>, dayKey: DailyPresencePolicyDayKey, period: number) {
  const periodTimes = getJsonObject(configObject.periodTimes);
  return (
    getNestedPeriodValue(periodTimes, dayKey, period) ||
    DEFAULT_SCHEDULE_PERIOD_TIMES[dayKey]?.[period] ||
    null
  );
}

function isNonTeachingSchedulePeriod(
  configObject: Record<string, unknown>,
  dayKey: DailyPresencePolicyDayKey,
  period: number,
) {
  const periodTypes = getJsonObject(configObject.periodTypes);
  const typeRaw = getNestedPeriodValue(periodTypes, dayKey, period);
  if (typeRaw) {
    const normalized = String(typeRaw).toUpperCase();
    if (normalized === 'TEACHING') return false;
    if (normalized === 'UPACARA' || normalized === 'ISTIRAHAT' || normalized === 'TADARUS' || normalized === 'OTHER') {
      return true;
    }
  }

  const periodNotes = getJsonObject(configObject.periodNotes);
  const noteRaw = getNestedPeriodValue(periodNotes, dayKey, period);
  if (!noteRaw) return false;
  const normalizedNote = String(noteRaw).toUpperCase();
  return normalizedNote.includes('UPACARA') || normalizedNote.includes('ISTIRAHAT') || normalizedNote.includes('TADARUS');
}

async function getStoredDailyPresencePolicy(activeAcademicYearId: number) {
  const timeConfig = await prisma.scheduleTimeConfig.findUnique({
    where: { academicYearId: activeAcademicYearId },
    select: {
      id: true,
      config: true,
      updatedAt: true,
    },
  });
  const configObject = getJsonObject(timeConfig?.config);

  return {
    policy: normalizeDailyPresencePolicy(configObject.dailyPresencePolicy),
    source: timeConfig ? 'SAVED' : 'DEFAULT',
    updatedAt: timeConfig?.updatedAt?.toISOString() || null,
  } as const;
}

function resolveMonitorScanTimingDecision(params: {
  checkpoint: 'CHECK_IN' | 'CHECK_OUT';
  policy: ReturnType<typeof normalizeDailyPresencePolicy>;
  now?: Date;
}) {
  const now = params.now instanceof Date ? params.now : new Date();
  const dayKey = getJakartaPolicyDayKey(now);
  if (!dayKey) {
    throw new ApiError(400, 'Presensi harian belum aktif untuk hari ini.');
  }

  const dayPolicy = params.policy.days[dayKey];
  if (!dayPolicy?.enabled) {
    throw new ApiError(400, 'Presensi harian hari ini sedang nonaktif.');
  }

  const currentMinute = getJakartaMinuteOfDay(now);
  if (params.checkpoint === 'CHECK_IN') {
    const openAt = toMinuteOfDay(dayPolicy.checkIn.openAt);
    const onTimeUntil = toMinuteOfDay(dayPolicy.checkIn.onTimeUntil);
    const closeAt = toMinuteOfDay(dayPolicy.checkIn.closeAt);
    if (currentMinute < openAt) {
      throw new ApiError(400, `QR masuk baru dapat dipakai mulai pukul ${dayPolicy.checkIn.openAt} WIB.`);
    }
    if (currentMinute > closeAt) {
      throw new ApiError(400, `QR masuk sudah ditutup pukul ${dayPolicy.checkIn.closeAt} WIB.`);
    }

    const lateMinutes = Math.max(0, currentMinute - onTimeUntil);
    return {
      status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
      lateMinutes,
      note:
        lateMinutes > 0
          ? `Terlambat ${lateMinutes} menit dari batas tepat waktu ${dayPolicy.checkIn.onTimeUntil} WIB.`
          : null,
    } as const;
  }

  const validFrom = toMinuteOfDay(dayPolicy.checkOut.validFrom);
  const closeAt = toMinuteOfDay(dayPolicy.checkOut.closeAt);
  if (currentMinute < validFrom) {
    throw new ApiError(400, `Absen pulang baru valid mulai pukul ${dayPolicy.checkOut.validFrom} WIB.`);
  }
  if (currentMinute > closeAt) {
    throw new ApiError(400, `QR pulang sudah ditutup pukul ${dayPolicy.checkOut.closeAt} WIB.`);
  }

  return {
    status: 'PRESENT',
    lateMinutes: 0,
    note: null,
  } as const;
}

function hasAnyAdditionalDuty(value: unknown) {
  return Array.isArray(value) && value.some((item) => String(item || '').trim().length > 0);
}

function resolvePolicyWindowTimingDecision(params: {
  checkpoint: DailyPresenceCheckpoint;
  dayPolicy: NonNullable<ReturnType<typeof normalizeDailyPresencePolicy>['days'][DailyPresencePolicyDayKey]>;
  now?: Date;
  checkInDeadlineMinute?: number | null;
  checkInDeadlineLabel?: string | null;
  checkOutValidMinute?: number | null;
  checkOutValidLabel?: string | null;
}) {
  const now = params.now instanceof Date ? params.now : new Date();
  const currentMinute = getJakartaMinuteOfDay(now);

  if (params.checkpoint === 'CHECK_IN') {
    const openAt = toMinuteOfDay(params.dayPolicy.checkIn.openAt);
    const closeAt = toMinuteOfDay(params.dayPolicy.checkIn.closeAt);
    const onTimeUntil =
      typeof params.checkInDeadlineMinute === 'number'
        ? params.checkInDeadlineMinute
        : toMinuteOfDay(params.dayPolicy.checkIn.onTimeUntil);
    const deadlineLabel = params.checkInDeadlineLabel || params.dayPolicy.checkIn.onTimeUntil;

    if (currentMinute < openAt) {
      throw new ApiError(400, `QR masuk baru dapat dipakai mulai pukul ${params.dayPolicy.checkIn.openAt} WIB.`);
    }
    if (currentMinute > closeAt) {
      throw new ApiError(400, `QR masuk sudah ditutup pukul ${params.dayPolicy.checkIn.closeAt} WIB.`);
    }

    const lateMinutes = Math.max(0, currentMinute - onTimeUntil);
    return {
      status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
      lateMinutes,
      earlyMinutes: 0,
      note:
        lateMinutes > 0
          ? `Terlambat ${lateMinutes} menit dari batas tepat waktu ${deadlineLabel} WIB.`
          : null,
    } as const;
  }

  const closeAt = toMinuteOfDay(params.dayPolicy.checkOut.closeAt);
  const validFrom =
    typeof params.checkOutValidMinute === 'number'
      ? params.checkOutValidMinute
      : toMinuteOfDay(params.dayPolicy.checkOut.validFrom);
  const validLabel = params.checkOutValidLabel || `pukul ${params.dayPolicy.checkOut.validFrom} WIB`;

  if (currentMinute < validFrom) {
    throw new ApiError(400, `Absen pulang baru valid mulai ${validLabel}.`);
  }
  if (currentMinute > closeAt) {
    throw new ApiError(400, `QR pulang sudah ditutup pukul ${params.dayPolicy.checkOut.closeAt} WIB.`);
  }

  return {
    status: 'PRESENT',
    lateMinutes: 0,
    earlyMinutes: 0,
    note: null,
  } as const;
}

async function resolveTeacherTeachingBasis(params: {
  teacherId: number;
  activeAcademicYearId: number;
  dayKey: DailyPresencePolicyDayKey;
}) {
  const [timeConfig, scheduleEntries] = await Promise.all([
    prisma.scheduleTimeConfig.findUnique({
      where: { academicYearId: params.activeAcademicYearId },
      select: { config: true },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        academicYearId: params.activeAcademicYearId,
        dayOfWeek: params.dayKey,
        teacherAssignment: {
          teacherId: params.teacherId,
          academicYearId: params.activeAcademicYearId,
        },
      },
      orderBy: [{ period: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        period: true,
        room: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        teacherAssignment: {
          select: {
            subject: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const configObject = getJsonObject(timeConfig?.config);
  const teachingEntries = scheduleEntries.filter(
    (entry) => !isNonTeachingSchedulePeriod(configObject, params.dayKey, entry.period),
  );
  const firstEntry = teachingEntries[0] || null;
  const lastEntry = teachingEntries[teachingEntries.length - 1] || null;
  const firstRange = firstEntry
    ? parsePeriodTimeRange(getSchedulePeriodTimeValue(configObject, params.dayKey, firstEntry.period))
    : null;
  const lastRange = lastEntry
    ? parsePeriodTimeRange(getSchedulePeriodTimeValue(configObject, params.dayKey, lastEntry.period))
    : null;

  const entries = teachingEntries.map((entry) => ({
    id: entry.id,
    period: entry.period,
    room: entry.room || null,
    class: entry.class
      ? {
          id: entry.class.id,
          name: entry.class.name,
        }
      : null,
    subject: entry.teacherAssignment.subject
      ? {
          id: entry.teacherAssignment.subject.id,
          name: entry.teacherAssignment.subject.name,
        }
      : null,
  }));

  return {
    hasSchedule: teachingEntries.length > 0,
    firstStartMinute: firstRange?.startMinute ?? null,
    firstStartLabel: firstRange?.startLabel ?? null,
    lastEndMinute: lastRange?.endMinute ?? null,
    lastEndLabel: lastRange?.endLabel ?? null,
    scheduleBasis: {
      mode: 'TEACHER_SCHEDULE',
      dayKey: params.dayKey,
      entryCount: teachingEntries.length,
      firstPeriod: firstEntry?.period ?? null,
      lastPeriod: lastEntry?.period ?? null,
      firstStart: firstRange?.startLabel ?? null,
      lastEnd: lastRange?.endLabel ?? null,
      entries,
    },
  };
}

async function resolveTutorAssignmentBasis(params: {
  tutorId: number;
  activeAcademicYearId: number;
}) {
  const assignments = await prisma.ekstrakurikulerTutorAssignment.findMany({
    where: {
      tutorId: params.tutorId,
      academicYearId: params.activeAcademicYearId,
      isActive: true,
    },
    orderBy: [{ id: 'asc' }],
    take: 5,
    select: {
      id: true,
      ekskulId: true,
      ekskul: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (assignments.length === 0) {
    throw new ApiError(400, 'Pembina eksternal belum memiliki penugasan ekskul aktif pada tahun ajaran berjalan.');
  }

  return {
    mode: 'EXTRACURRICULAR_TUTOR',
    note: 'Pembina eksternal mengikuti jadwal ekskul dan tidak memakai batas jam belajar reguler.',
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      ekskulId: assignment.ekskulId,
      ekskulName: assignment.ekskul?.name || null,
    })),
  } as Prisma.InputJsonValue;
}

async function resolveUserMonitorScanTimingDecision(params: {
  participant: Awaited<ReturnType<typeof getDailyPresenceUserOrThrow>>;
  checkpoint: DailyPresenceCheckpoint;
  policy: ReturnType<typeof normalizeDailyPresencePolicy>;
  activeAcademicYearId: number;
  captureMode?: 'QR' | 'MANUAL';
  now?: Date;
}) {
  const now = params.now instanceof Date ? params.now : new Date();
  const dayKey = getJakartaPolicyDayKey(now);
  const currentMinute = getJakartaMinuteOfDay(now);
  const role = params.participant.role;

  if (role === Role.EXTRACURRICULAR_TUTOR) {
    const scheduleBasis = await resolveTutorAssignmentBasis({
      tutorId: params.participant.id,
      activeAcademicYearId: params.activeAcademicYearId,
    });
    return {
      status: 'PRESENT',
      lateMinutes: 0,
      earlyMinutes: 0,
      note: null,
      scheduleBasis,
    } as const;
  }

  if (!dayKey) {
    throw new ApiError(400, 'Presensi harian belum aktif untuk hari ini.');
  }

  const dayPolicy = params.policy.days[dayKey];
  if (!dayPolicy) {
    throw new ApiError(400, 'Konfigurasi presensi harian belum tersedia untuk hari ini.');
  }

  if (role === Role.TEACHER) {
    const teachingBasis = await resolveTeacherTeachingBasis({
      teacherId: params.participant.id,
      activeAcademicYearId: params.activeAcademicYearId,
      dayKey,
    });
    const hasDuty = hasAnyAdditionalDuty(params.participant.additionalDuties);
    const saturdayMode = dayPolicy.teacherDutySaturdayMode || 'MANUAL';

    if (!dayPolicy.enabled) {
      if (dayKey === 'SATURDAY' && (teachingBasis.hasSchedule || hasDuty)) {
        if (saturdayMode === 'MANUAL') {
          if ((params.captureMode || 'QR') === 'QR') {
            throw new ApiError(400, 'Presensi Sabtu untuk guru duty menggunakan mekanisme manual dari petugas.');
          }
        }
        if (saturdayMode === 'DISABLED') {
          throw new ApiError(400, 'Presensi Sabtu untuk guru duty sedang dinonaktifkan.');
        }
      } else {
        throw new ApiError(400, 'Presensi harian hari ini sedang nonaktif.');
      }
    }

    if (teachingBasis.hasSchedule) {
      const checkInDeadlineMinute =
        typeof teachingBasis.firstStartMinute === 'number'
          ? teachingBasis.firstStartMinute
          : toMinuteOfDay(dayPolicy.checkIn.onTimeUntil);
      const checkOutValidMinute =
        typeof teachingBasis.lastEndMinute === 'number'
          ? teachingBasis.lastEndMinute
          : toMinuteOfDay(dayPolicy.checkOut.validFrom);
      const timing = resolvePolicyWindowTimingDecision({
        checkpoint: params.checkpoint,
        dayPolicy,
        now,
        checkInDeadlineMinute,
        checkInDeadlineLabel: teachingBasis.firstStartLabel
          ? `jadwal mengajar ${teachingBasis.firstStartLabel}`
          : dayPolicy.checkIn.onTimeUntil,
        checkOutValidMinute,
        checkOutValidLabel: teachingBasis.lastEndLabel
          ? `setelah jadwal mengajar ${teachingBasis.lastEndLabel} WIB`
          : `pukul ${dayPolicy.checkOut.validFrom} WIB`,
      });
      return {
        ...timing,
        scheduleBasis: {
          ...teachingBasis.scheduleBasis,
          checkpoint: params.checkpoint,
          currentTime: minuteToClock(currentMinute),
          source: 'SCHEDULE_ENTRY',
        } as Prisma.InputJsonValue,
      };
    }

    if (!hasDuty) {
      throw new ApiError(400, 'Hari ini tidak ada jadwal mengajar atau duty aktif untuk presensi guru.');
    }

    const timing = resolvePolicyWindowTimingDecision({
      checkpoint: params.checkpoint,
      dayPolicy,
      now,
    });
    return {
      ...timing,
      scheduleBasis: {
        mode: 'TEACHER_DUTY',
        dayKey,
        checkpoint: params.checkpoint,
        currentTime: minuteToClock(currentMinute),
        additionalDuties: params.participant.additionalDuties || [],
        source: 'DAILY_PRESENCE_POLICY',
      } as Prisma.InputJsonValue,
    };
  }

  if (!dayPolicy.enabled) {
    throw new ApiError(400, 'Presensi harian hari ini sedang nonaktif.');
  }

  const timing = resolvePolicyWindowTimingDecision({
    checkpoint: params.checkpoint,
    dayPolicy,
    now,
  });
  return {
    ...timing,
    scheduleBasis: {
      mode: role === Role.PRINCIPAL ? 'PRINCIPAL_POLICY' : 'STAFF_POLICY',
      dayKey,
      checkpoint: params.checkpoint,
      currentTime: minuteToClock(currentMinute),
      source: 'DAILY_PRESENCE_POLICY',
    } as Prisma.InputJsonValue,
  };
}

async function buildManagerSelfScanSessionPayload(params: {
  session: Awaited<ReturnType<typeof getActiveDailyPresenceSelfScanSession>>;
  activeAcademicYearId: number;
  now?: Date;
}) {
  if (!params.session) return null;
  const now = params.now instanceof Date ? params.now : new Date();
  const { policy } = await getStoredDailyPresencePolicy(params.activeAcademicYearId);
  const monitor = await buildDailyPresenceSelfScanMonitorPayload({
    session: params.session,
    refreshSeconds: policy.qrRefreshSeconds,
    now,
  });

  const sessionPayload = buildDailyPresenceSelfScanSessionManagerPayload(params.session, {
    now,
    monitor,
  });
  return {
    ...sessionPayload,
    schoolName: resolveStandardSchoolDisplayName(),
  };
}

async function getOperationalStudentOrThrow(studentId: number, activeAcademicYearId: number) {
  const student = await prisma.user.findUnique({
    where: { id: Number(studentId) },
    select: {
      id: true,
      name: true,
      photo: true,
      nis: true,
      nisn: true,
      role: true,
      studentStatus: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          academicYearId: true,
        },
      },
    },
  });

  if (!student || student.role !== 'STUDENT') {
    throw new ApiError(404, 'Siswa tidak ditemukan.');
  }

  if (!student.studentClass || student.studentClass.academicYearId !== activeAcademicYearId) {
    throw new ApiError(400, 'Siswa belum terhubung ke kelas aktif pada tahun ajaran berjalan.');
  }

  return student;
}

async function buildStudentDailyPresenceStatePayload(params: {
  studentId: number;
  activeAcademicYear: {
    id: number;
    name: string;
  };
  dateKey: string;
}) {
  const targetDate = toDateOnly(params.dateKey);
  const student = await getOperationalStudentOrThrow(params.studentId, params.activeAcademicYear.id);

  const [attendance, recentEvents] = await Promise.all([
    prisma.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: params.activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        date: true,
        status: true,
        note: true,
        checkInTime: true,
        checkOutTime: true,
        checkInSource: true,
        checkOutSource: true,
        checkInReason: true,
        checkOutReason: true,
      },
    }),
    prisma.dailyPresenceEvent.findMany({
      where: {
        studentId: student.id,
        academicYearId: params.activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { recordedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        eventType: true,
        source: true,
        reason: true,
        gateLabel: true,
        recordedAt: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  return {
    date: params.dateKey,
    academicYear: params.activeAcademicYear,
    student: {
      id: student.id,
      name: student.name,
      photo: student.photo || null,
      nis: student.nis,
      nisn: student.nisn,
      class: student.studentClass
        ? {
            id: student.studentClass.id,
            name: student.studentClass.name,
          }
        : null,
    },
    presence: buildPresencePayload(attendance),
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      source: event.source,
      reason: event.reason,
      gateLabel: event.gateLabel,
      recordedAt: event.recordedAt.toISOString(),
      recordedTime: formatTime(event.recordedAt),
      actor: event.actor,
    })),
  };
}

async function getDailyPresenceUserOrThrow(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      name: true,
      username: true,
      photo: true,
      nip: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
    },
  });

  if (!user) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  if (!USER_DAILY_PRESENCE_ROLES.has(user.role)) {
    throw new ApiError(403, 'Scan QR monitor presensi hanya tersedia untuk siswa, guru, staff, kepsek, dan pembina eksternal.');
  }

  return user;
}

function buildOperationalParticipantWhereClause(params: {
  activeAcademicYearId: number;
  normalizedQuery?: string;
}) {
  const normalizedRoleQuery = params.normalizedQuery ? normalizeCode(params.normalizedQuery) : '';
  const matchedRoles = Array.from(USER_DAILY_PRESENCE_ROLES).filter((role) => normalizeCode(role) === normalizedRoleQuery);
  const baseRoleScope: Prisma.UserWhereInput = {
    OR: [
      { role: Role.TEACHER },
      { role: Role.STAFF },
      { role: Role.PRINCIPAL },
      {
        role: Role.EXTRACURRICULAR_TUTOR,
        ekskulTutorAssignments: {
          some: {
            academicYearId: params.activeAcademicYearId,
            isActive: true,
          },
        },
      },
    ],
  };

  if (!params.normalizedQuery) {
    return baseRoleScope;
  }

  return {
    AND: [
      baseRoleScope,
      {
        OR: [
          { name: { contains: params.normalizedQuery, mode: 'insensitive' } },
          { username: { contains: params.normalizedQuery, mode: 'insensitive' } },
          { nip: { contains: params.normalizedQuery, mode: 'insensitive' } },
          { ptkType: { contains: params.normalizedQuery, mode: 'insensitive' } },
          ...(matchedRoles.length ? [{ role: { in: matchedRoles } }] : []),
        ],
      },
    ],
  } satisfies Prisma.UserWhereInput;
}

async function buildUserDailyPresenceStatePayload(params: {
  userId: number;
  activeAcademicYear: {
    id: number;
    name: string;
  };
  dateKey: string;
}) {
  const targetDate = toDateOnly(params.dateKey);
  const participant = await getDailyPresenceUserOrThrow(params.userId);

  const [presence, recentEvents] = await Promise.all([
    prisma.dailyUserPresence.findUnique({
      where: {
        userId_academicYearId_date: {
          userId: participant.id,
          academicYearId: params.activeAcademicYear.id,
          date: targetDate,
        },
      },
      select: {
        id: true,
        date: true,
        status: true,
        note: true,
        checkInTime: true,
        checkOutTime: true,
        checkInSource: true,
        checkOutSource: true,
        checkInReason: true,
        checkOutReason: true,
        checkInLateMinutes: true,
        checkOutEarlyMinutes: true,
        scheduleBasis: true,
      },
    }),
    prisma.dailyUserPresenceEvent.findMany({
      where: {
        userId: participant.id,
        academicYearId: params.activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { recordedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        eventType: true,
        source: true,
        reason: true,
        gateLabel: true,
        recordedAt: true,
        lateMinutes: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  return {
    date: params.dateKey,
    academicYear: params.activeAcademicYear,
    participant: {
      id: participant.id,
      name: participant.name,
      username: participant.username,
      photo: participant.photo || null,
      nip: participant.nip || null,
      role: participant.role,
      ptkType: participant.ptkType || null,
      additionalDuties: participant.additionalDuties || [],
    },
    presence: buildUserPresencePayload(presence),
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      source: event.source,
      reason: event.reason,
      gateLabel: event.gateLabel,
      recordedAt: event.recordedAt.toISOString(),
      recordedTime: formatTime(event.recordedAt),
      lateMinutes: event.lateMinutes || 0,
      actor: event.actor,
    })),
  };
}

async function safeNotifyParentDailyPresence(params: {
  studentId: number;
  studentName: string;
  classId: number;
  checkpoint: 'CHECK_IN' | 'CHECK_OUT';
  recordedAt: Date | null;
  dateKey: string;
}) {
  if (!params.recordedAt) return;

  const studentLink = await prisma.user.findUnique({
    where: { id: params.studentId },
    select: {
      parents: {
        select: {
          id: true,
        },
      },
    },
  });

  const parentIds = Array.from(
    new Set(
      (studentLink?.parents || [])
        .map((parent) => Number(parent.id))
        .filter((parentId) => Number.isInteger(parentId) && parentId > 0),
    ),
  );

  if (parentIds.length === 0) return;

  const timeLabel = formatTime(params.recordedAt) || '-';
  const route = `/parent/attendance?childId=${params.studentId}`;
  const message =
    params.checkpoint === 'CHECK_IN'
      ? `${params.studentName} tercatat masuk pukul ${timeLabel}.`
      : `${params.studentName} tercatat pulang pukul ${timeLabel}.`;

  const rows: Prisma.NotificationCreateManyInput[] = parentIds.map((parentId) => ({
    userId: parentId,
    title: 'Absensi Harian Anak',
    message,
    type: 'ATTENDANCE_DAILY_PRESENCE',
    data: {
      route,
      module: 'ATTENDANCE',
      attendanceMode: 'DAILY_PRESENCE',
      studentId: params.studentId,
      classId: params.classId,
      date: params.dateKey,
      checkpoint: params.checkpoint,
      recordedTime: timeLabel,
    },
  }));

  try {
    await createManyInAppNotifications({ data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[daily-presence] gagal mengirim notifikasi orang tua: ${message}`);
  }
}

export const getDailyPresenceOverview = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { date, limit } = getDailyPresenceOverviewSchema.parse(req.query);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = date || getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const take = limit ?? 12;

  const [
    studentCheckInCount,
    studentCheckOutCount,
    studentOpenDayCount,
    assistedStudentEventCount,
    userCheckInCount,
    userCheckOutCount,
    userOpenDayCount,
    assistedUserEventCount,
    studentEvents,
    userEvents,
  ] = await Promise.all([
    prisma.dailyAttendance.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkInTime: { not: null },
      },
    }),
    prisma.dailyAttendance.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkOutTime: { not: null },
      },
    }),
    prisma.dailyAttendance.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkInTime: { not: null },
        checkOutTime: null,
      },
    }),
    prisma.dailyPresenceEvent.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        source: DailyPresenceCaptureSource.ASSISTED_SCAN,
      },
    }),
    prisma.dailyUserPresence.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkInTime: { not: null },
      },
    }),
    prisma.dailyUserPresence.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkOutTime: { not: null },
      },
    }),
    prisma.dailyUserPresence.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkInTime: { not: null },
        checkOutTime: null,
      },
    }),
    prisma.dailyUserPresenceEvent.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        source: DailyPresenceCaptureSource.ASSISTED_SCAN,
      },
    }),
    prisma.dailyPresenceEvent.findMany({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { recordedAt: 'desc' },
      take,
      select: {
        id: true,
        eventType: true,
        source: true,
        reason: true,
        gateLabel: true,
        recordedAt: true,
        student: {
          select: {
            id: true,
            name: true,
            photo: true,
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
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.dailyUserPresenceEvent.findMany({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { recordedAt: 'desc' },
      take,
      select: {
        id: true,
        eventType: true,
        source: true,
        reason: true,
        gateLabel: true,
        recordedAt: true,
        lateMinutes: true,
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            photo: true,
            nip: true,
            role: true,
            ptkType: true,
            additionalDuties: true,
          },
        },
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const recentEvents = [...studentEvents.map(mapStudentPresenceEventItem), ...userEvents.map(mapUserPresenceEventItem)]
    .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())
    .slice(0, take);
  const checkInCount = studentCheckInCount + userCheckInCount;
  const checkOutCount = studentCheckOutCount + userCheckOutCount;
  const openDayCount = studentOpenDayCount + userOpenDayCount;
  const assistedEventCount = assistedStudentEventCount + assistedUserEventCount;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        summary: {
          checkInCount,
          checkOutCount,
          openDayCount,
          assistedEventCount,
          studentCheckInCount,
          studentCheckOutCount,
          studentOpenDayCount,
          assistedStudentEventCount,
          userCheckInCount,
          userCheckOutCount,
          userOpenDayCount,
          assistedUserEventCount,
        },
        recentEvents,
      },
      'Ringkasan presensi harian berhasil diambil',
    ),
  );
});

export const getStudentDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { studentId, date } = getStudentDailyPresenceSchema.parse(req.query);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = date || getJakartaDateKey();
  const payload = await buildStudentDailyPresenceStatePayload({
    studentId,
    activeAcademicYear,
    dateKey,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      payload,
      'Status presensi siswa berhasil diambil',
    ),
  );
});

export const getOwnDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const date = z.object({ date: z.string().optional() }).parse(req.query).date;
  const dateKey = date || getJakartaDateKey();
  const normalizedRole = String(user?.role || '').trim().toUpperCase();
  const payload =
    normalizedRole === 'STUDENT'
      ? await buildStudentDailyPresenceStatePayload({
          studentId: Number(user?.id || 0),
          activeAcademicYear,
          dateKey,
        })
      : await buildUserDailyPresenceStatePayload({
          userId: Number(user?.id || 0),
          activeAcademicYear,
          dateKey,
        });

  res.status(200).json(new ApiResponse(200, payload, 'Status presensi pribadi berhasil diambil'));
});

export const getOwnDailyPresenceHistory = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const normalizedRole = String(user?.role || '').trim().toUpperCase();
  const { month, year } = getOwnDailyPresenceHistorySchema.parse(req.query);
  const { start, end } = getMonthDateRange({ month, year });

  const data =
    normalizedRole === 'STUDENT'
      ? await prisma.dailyAttendance.findMany({
          where: {
            studentId: Number(user?.id || 0),
            academicYearId: activeAcademicYear.id,
            date: {
              gte: start,
              lt: end,
            },
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
          },
        })
      : await prisma.dailyUserPresence.findMany({
          where: {
            userId: Number(user?.id || 0),
            academicYearId: activeAcademicYear.id,
            date: {
              gte: start,
              lt: end,
            },
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
          },
        });

  res.status(200).json(
    new ApiResponse(
      200,
      data.map((item) => ({
        id: item.id,
        date: formatDate(item.date),
        status: item.status,
        note: item.note || null,
        notes: item.note || null,
        checkInTime: formatTime(item.checkInTime),
        checkOutTime: formatTime(item.checkOutTime),
      })),
      'Riwayat presensi pribadi berhasil diambil',
    ),
  );
});

export const getDailyPresenceStudents = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { q, limit } = getDailyPresenceStudentsSchema.parse(req.query);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const normalizedQuery = String(q || '').trim();

  const students = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      studentClass: {
        academicYearId: activeAcademicYear.id,
      },
      ...(normalizedQuery
        ? {
            OR: [
              { name: { contains: normalizedQuery, mode: 'insensitive' } },
              { username: { contains: normalizedQuery, mode: 'insensitive' } },
              { nis: { contains: normalizedQuery, mode: 'insensitive' } },
              { nisn: { contains: normalizedQuery, mode: 'insensitive' } },
              {
                studentClass: {
                  academicYearId: activeAcademicYear.id,
                  name: { contains: normalizedQuery, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: limit ?? 100,
    select: {
      id: true,
      username: true,
      name: true,
      nis: true,
      nisn: true,
      photo: true,
      studentStatus: true,
      verificationStatus: true,
      studentClass: {
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
  });

  res.status(200).json(
    new ApiResponse(
      200,
      students,
      normalizedQuery
        ? 'Daftar siswa operasional berhasil difilter'
        : 'Daftar siswa operasional berhasil diambil',
    ),
  );
});

export const getDailyPresenceParticipants = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { q, limit } = getDailyPresenceParticipantsSchema.parse(req.query);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const normalizedQuery = String(q || '').trim();

  const participants = await prisma.user.findMany({
    where: buildOperationalParticipantWhereClause({
      activeAcademicYearId: activeAcademicYear.id,
      normalizedQuery: normalizedQuery || undefined,
    }),
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: limit ?? 100,
    select: {
      id: true,
      username: true,
      name: true,
      photo: true,
      nip: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      participants,
      normalizedQuery
        ? 'Daftar peserta non-siswa berhasil difilter'
        : 'Daftar peserta non-siswa berhasil diambil',
    ),
  );
});

export const getDailyPresenceParticipant = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { userId, date } = getDailyPresenceParticipantSchema.parse(req.query);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = date || getJakartaDateKey();
  const payload = await buildUserDailyPresenceStatePayload({
    userId,
    activeAcademicYear,
    dateKey,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      payload,
      'Status presensi peserta non-siswa berhasil diambil',
    ),
  );
});

export const getDailyPresencePolicy = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const { policy, source, updatedAt } = await getStoredDailyPresencePolicy(activeAcademicYear.id);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        policy,
        source,
        updatedAt,
      },
      'Konfigurasi jam presensi harian berhasil diambil',
    ),
  );
});

export const saveDailyPresencePolicy = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { policy } = saveDailyPresencePolicySchema.parse(req.body);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const existing = await prisma.scheduleTimeConfig.findUnique({
    where: { academicYearId: activeAcademicYear.id },
    select: { config: true },
  });
  const configObject = getJsonObject(existing?.config);
  const normalizedPolicy = normalizeDailyPresencePolicy(policy);

  const saved = await prisma.scheduleTimeConfig.upsert({
    where: { academicYearId: activeAcademicYear.id },
    update: {
      config: {
        ...configObject,
        dailyPresencePolicy: normalizedPolicy,
      } as Prisma.InputJsonValue,
    },
    create: {
      academicYearId: activeAcademicYear.id,
      config: {
        ...configObject,
        dailyPresencePolicy: normalizedPolicy,
      } as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      academicYearId: true,
      updatedAt: true,
    },
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      policy: 'DAILY_PRESENCE',
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        id: saved.id,
        academicYear: activeAcademicYear,
        policy: normalizedPolicy,
        updatedAt: saved.updatedAt.toISOString(),
      },
      'Konfigurasi jam presensi harian berhasil disimpan',
    ),
  );
});

export const getActiveSelfScanSession = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { checkpoint } = selfScanSessionSchema.parse(req.query);
  const normalizedRole = String(user?.role || '').trim().toUpperCase();
  const isStudent = normalizedRole === 'STUDENT';
  if (normalizedRole === 'STUDENT') {
    if (!user?.id) {
      throw new ApiError(401, 'Sesi siswa tidak valid.');
    }
  } else {
    await getPresenceManagerProfile(Number(user?.id || 0));
  }

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const session = await getActiveDailyPresenceSelfScanSession(checkpoint);
  const now = new Date();

  const data =
    session && session.academicYearId === activeAcademicYear.id && session.dateKey === dateKey
      ? isStudent
        ? buildDailyPresenceSelfScanSessionPublicPayload(session, now)
        : await buildManagerSelfScanSessionPayload({
            session,
            activeAcademicYearId: activeAcademicYear.id,
            now,
          })
      : null;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        session: data,
      },
      data ? 'Sesi scan mandiri aktif berhasil diambil' : 'Belum ada sesi scan mandiri yang aktif',
    ),
  );
});

export const startSelfScanSession = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { checkpoint, gateLabel } = selfScanSessionSchema.parse(req.body);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();

  const session = await createActiveDailyPresenceSelfScanSession({
    checkpoint,
    gateLabel,
    actorId: actor.id,
    actorName: actor.name,
    academicYearId: activeAcademicYear.id,
    dateKey,
  });
  const now = new Date();
  const managerPayload = await buildManagerSelfScanSessionPayload({
    session,
    activeAcademicYearId: activeAcademicYear.id,
    now,
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      dates: [dateKey],
      checkpoint,
      sessionState: 'OPEN',
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        session: managerPayload,
      },
      checkpoint === 'CHECK_IN'
        ? 'Sesi scan mandiri masuk berhasil dibuka.'
        : 'Sesi scan mandiri pulang berhasil dibuka.',
    ),
  );
});

export const closeSelfScanSession = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { checkpoint } = selfScanSessionSchema.parse(req.body);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  await closeActiveDailyPresenceSelfScanSession(checkpoint);

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      dates: [dateKey],
      checkpoint,
      sessionState: 'CLOSED',
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        checkpoint,
      },
      checkpoint === 'CHECK_IN'
        ? 'Sesi scan mandiri masuk berhasil ditutup.'
        : 'Sesi scan mandiri pulang berhasil ditutup.',
    ),
  );
});

export const createSelfScanPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (String(user?.role || '').trim().toUpperCase() !== 'STUDENT') {
    throw new ApiError(403, 'QR scan mandiri hanya dapat dibuat oleh siswa.');
  }

  const { checkpoint, challengeCode } = selfScanPassSchema.parse(req.body);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const session = await getActiveDailyPresenceSelfScanSession(checkpoint);

  if (!session || session.academicYearId !== activeAcademicYear.id || session.dateKey !== dateKey) {
    throw new ApiError(400, 'Petugas belum membuka sesi scan untuk checkpoint ini.');
  }

  if (!verifyDailyPresenceChallengeCode(session, challengeCode, new Date())) {
    throw new ApiError(400, 'Kode challenge tidak cocok atau sudah kadaluarsa.');
  }

  const { policy } = await getStoredDailyPresencePolicy(activeAcademicYear.id);
  resolveMonitorScanTimingDecision({
    checkpoint,
    policy,
    now: new Date(),
  });

  const student = await getOperationalStudentOrThrow(Number(user?.id || 0), activeAcademicYear.id);
  const existingAttendance = await prisma.dailyAttendance.findFirst({
    where: {
      studentId: student.id,
      classId: student.studentClass!.id,
      academicYearId: activeAcademicYear.id,
      date: toDateOnly(dateKey),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  if (checkpoint === 'CHECK_IN' && existingAttendance?.checkInTime) {
    throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
  }
  if (checkpoint === 'CHECK_OUT' && existingAttendance?.checkOutTime) {
    throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
  }

  const qrToken = buildDailyPresenceSelfScanQrToken({
    session,
    studentId: student.id,
    classId: student.studentClass!.id,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(qrToken, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        student: {
          id: student.id,
          name: student.name,
          photo: student.photo || null,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        session: buildDailyPresenceSelfScanSessionPublicPayload(session),
        checkpoint,
        qrToken,
        qrCodeDataUrl,
        qrExpiresAt: new Date(Date.now() + DAILY_PRESENCE_SELF_SCAN_QR_TOKEN_TTL_SECONDS * 1000).toISOString(),
      },
      checkpoint === 'CHECK_IN'
        ? 'QR absen masuk berhasil dibuat.'
        : 'QR absen pulang berhasil dibuat.',
    ),
  );
});

export const previewSelfScanPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { qrToken } = selfScanPreviewSchema.parse(req.body);
  const decoded = verifyDailyPresenceSelfScanQrToken(qrToken);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const session = await getActiveDailyPresenceSelfScanSession(decoded.checkpoint);
  const dateKey = getJakartaDateKey();

  if (
    !session ||
    session.sessionId !== decoded.sessionId ||
    session.academicYearId !== activeAcademicYear.id ||
    session.dateKey !== dateKey
  ) {
    throw new ApiError(400, 'Sesi scan mandiri sudah tidak aktif.');
  }

  const student = await getOperationalStudentOrThrow(decoded.studentId, activeAcademicYear.id);
  if (student.studentClass!.id !== decoded.classId) {
    throw new ApiError(400, 'Data kelas siswa pada QR tidak cocok.');
  }

  const existingAttendance = await prisma.dailyAttendance.findFirst({
    where: {
      studentId: student.id,
      classId: student.studentClass!.id,
      academicYearId: activeAcademicYear.id,
      date: toDateOnly(dateKey),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  const alreadyRecorded =
    decoded.checkpoint === 'CHECK_IN'
      ? Boolean(existingAttendance?.checkInTime)
      : Boolean(existingAttendance?.checkOutTime);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        checkpoint: decoded.checkpoint,
        gateLabel: session.gateLabel,
        student: {
          id: student.id,
          name: student.name,
          photo: student.photo || null,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        alreadyRecorded,
      },
      'QR presensi berhasil dipindai. Silakan verifikasi identitas siswa.',
    ),
  );
});

export const confirmSelfScanPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { qrToken } = selfScanPreviewSchema.parse(req.body);
  const decoded = verifyDailyPresenceSelfScanQrToken(qrToken);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const session = await getActiveDailyPresenceSelfScanSession(decoded.checkpoint);
  const dateKey = getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);

  if (
    !session ||
    session.sessionId !== decoded.sessionId ||
    session.academicYearId !== activeAcademicYear.id ||
    session.dateKey !== dateKey
  ) {
    throw new ApiError(400, 'Sesi scan mandiri sudah tidak aktif.');
  }

  if (!(await consumeDailyPresenceSelfScanQrToken(qrToken))) {
    throw new ApiError(400, 'QR ini sudah pernah dipakai. Minta siswa buat QR baru.');
  }

  const student = await getOperationalStudentOrThrow(decoded.studentId, activeAcademicYear.id);
  if (student.studentClass!.id !== decoded.classId) {
    throw new ApiError(400, 'Data kelas siswa pada QR tidak cocok.');
  }

  const now = new Date();
  const { policy } = await getStoredDailyPresencePolicy(activeAcademicYear.id);
  const timingDecision = resolveMonitorScanTimingDecision({
    checkpoint: decoded.checkpoint,
    policy,
    now,
  });

  const attendanceResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { id: 'desc' },
    });

    if (decoded.checkpoint === 'CHECK_IN' && existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
    }
    if (decoded.checkpoint === 'CHECK_OUT' && !existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk belum tercatat. Minta bantuan petugas jika perlu koreksi.');
    }
    if (decoded.checkpoint === 'CHECK_OUT' && existing?.checkOutTime) {
      throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
    }

    const nextStatus =
      decoded.checkpoint === 'CHECK_IN'
        ? timingDecision.status
        : existing?.status === 'PRESENT' || existing?.status === 'LATE'
          ? existing.status
          : 'PRESENT';
    const nextNote =
      decoded.checkpoint === 'CHECK_IN'
        ? timingDecision.note || existing?.note || null
        : existing?.note || null;
    const shouldNotifyParent =
      decoded.checkpoint === 'CHECK_IN' ? !existing?.checkInTime : !existing?.checkOutTime;
    const upserted = existing
      ? await tx.dailyAttendance.update({
          where: { id: existing.id },
          data:
            decoded.checkpoint === 'CHECK_IN'
              ? {
                  status: nextStatus,
                  note: nextNote,
                  checkInTime: now,
                  checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkInReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
                  checkInActorId: actor.id,
                }
              : {
                  status: nextStatus,
                  note: nextNote,
                  checkOutTime: now,
                  checkOutSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkOutReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
                  checkOutActorId: actor.id,
                },
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        })
      : await tx.dailyAttendance.create({
          data: {
            date: targetDate,
            studentId: student.id,
            classId: student.studentClass!.id,
            academicYearId: activeAcademicYear.id,
            status: nextStatus,
            note: nextNote,
            checkInTime: now,
            checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
            checkInReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
            checkInActorId: actor.id,
          },
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        });

    await tx.dailyPresenceEvent.create({
      data: {
        dailyAttendanceId: upserted.id,
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        eventType:
          decoded.checkpoint === 'CHECK_IN'
            ? DailyPresenceEventType.CHECK_IN
            : DailyPresenceEventType.CHECK_OUT,
        source: DailyPresenceCaptureSource.SELF_SCAN,
        reason: timingDecision.note
          ? `Self scan terverifikasi petugas${session.gateLabel ? ` di ${session.gateLabel}` : ''}. ${timingDecision.note}`
          : `Self scan terverifikasi petugas${session.gateLabel ? ` di ${session.gateLabel}` : ''}`,
        gateLabel: session.gateLabel || null,
        actorId: actor.id,
        recordedAt: now,
      },
    });

    return {
      attendance: upserted,
      shouldNotifyParent,
    };
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      classIds: [student.studentClass!.id],
      studentIds: [student.id],
      dates: [dateKey],
    },
  });

  if (attendanceResult.shouldNotifyParent) {
    const recordedAt =
      decoded.checkpoint === 'CHECK_IN'
        ? attendanceResult.attendance.checkInTime
        : attendanceResult.attendance.checkOutTime;
    await safeNotifyParentDailyPresence({
      studentId: student.id,
      studentName: student.name,
      classId: student.studentClass!.id,
      checkpoint: decoded.checkpoint,
      recordedAt,
      dateKey,
    });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        student: {
          id: student.id,
          name: student.name,
          photo: student.photo || null,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        presence: buildPresencePayload(attendanceResult.attendance),
      },
      decoded.checkpoint === 'CHECK_IN'
        ? 'Absen masuk scan mandiri berhasil diverifikasi.'
        : 'Absen pulang scan mandiri berhasil diverifikasi.',
    ),
  );
});

export const confirmSelfScanMonitorPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const normalizedRole = String(user?.role || '').trim().toUpperCase();
  const { qrToken } = selfScanMonitorConfirmSchema.parse(req.body);
  const decoded = verifyDailyPresenceSelfScanMonitorQrToken(qrToken);
  const checkpoint = decoded.checkpoint as DailyPresenceCheckpoint;
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const session = await getActiveDailyPresenceSelfScanSession(checkpoint);
  const dateKey = getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const now = new Date();

  if (
    !session ||
    session.sessionId !== decoded.sessionId ||
    session.academicYearId !== activeAcademicYear.id ||
    session.academicYearId !== decoded.academicYearId ||
    session.dateKey !== dateKey ||
    decoded.dateKey !== dateKey
  ) {
    throw new ApiError(400, 'Sesi monitor QR sudah tidak aktif.');
  }

  if (!verifyDailyPresenceChallengeCode(session, decoded.challengeCode, now)) {
    throw new ApiError(400, 'QR monitor presensi sudah berganti. Silakan scan QR terbaru di layar TU.');
  }

  if (normalizedRole !== 'STUDENT') {
    const participant = await getDailyPresenceUserOrThrow(Number(user?.id || 0));
    const { policy } = await getStoredDailyPresencePolicy(activeAcademicYear.id);
    const timingDecision = await resolveUserMonitorScanTimingDecision({
      participant,
      checkpoint,
      policy,
      activeAcademicYearId: activeAcademicYear.id,
      now,
    });
    const isCheckIn = checkpoint === 'CHECK_IN';
    const reason = `Scan QR monitor${session.gateLabel ? ` di ${session.gateLabel}` : ''}`;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyUserPresence.findUnique({
        where: {
          userId_academicYearId_date: {
            userId: participant.id,
            academicYearId: activeAcademicYear.id,
            date: targetDate,
          },
        },
      });

      if (isCheckIn && existing?.checkInTime) {
        throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
      }
      if (!isCheckIn && !existing?.checkInTime) {
        throw new ApiError(400, 'Absen masuk belum tercatat. Minta bantuan petugas jika perlu koreksi.');
      }
      if (!isCheckIn && existing?.checkOutTime) {
        throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
      }

      const nextStatus = isCheckIn
        ? timingDecision.status
        : existing?.status === 'PRESENT' || existing?.status === 'LATE'
          ? existing.status
          : 'PRESENT';
      const nextNote = isCheckIn ? timingDecision.note || existing?.note || null : existing?.note || null;
      const scheduleBasis = timingDecision.scheduleBasis;

      const upserted = existing
        ? await tx.dailyUserPresence.update({
            where: { id: existing.id },
            data: isCheckIn
              ? {
                  status: nextStatus,
                  note: nextNote,
                  role: participant.role,
                  ptkType: participant.ptkType || null,
                  checkInTime: now,
                  checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkInReason: reason,
                  checkInActorId: session.actorId,
                  checkInLateMinutes: timingDecision.lateMinutes,
                  scheduleBasis,
                }
              : {
                  status: nextStatus,
                  note: nextNote,
                  role: participant.role,
                  ptkType: participant.ptkType || null,
                  checkOutTime: now,
                  checkOutSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkOutReason: reason,
                  checkOutActorId: session.actorId,
                  checkOutEarlyMinutes: timingDecision.earlyMinutes,
                  scheduleBasis,
                },
          })
        : await tx.dailyUserPresence.create({
            data: {
              date: targetDate,
              userId: participant.id,
              academicYearId: activeAcademicYear.id,
              role: participant.role,
              ptkType: participant.ptkType || null,
              status: timingDecision.status,
              note: timingDecision.note,
              checkInTime: now,
              checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
              checkInReason: reason,
              checkInActorId: session.actorId,
              checkInLateMinutes: timingDecision.lateMinutes,
              scheduleBasis,
            },
          });

      await tx.dailyUserPresenceEvent.create({
        data: {
          dailyUserPresenceId: upserted.id,
          userId: participant.id,
          academicYearId: activeAcademicYear.id,
          role: participant.role,
          date: targetDate,
          eventType: isCheckIn ? DailyPresenceEventType.CHECK_IN : DailyPresenceEventType.CHECK_OUT,
          source: DailyPresenceCaptureSource.SELF_SCAN,
          reason: timingDecision.note ? `${reason}. ${timingDecision.note}` : reason,
          gateLabel: session.gateLabel || null,
          actorId: session.actorId,
          recordedAt: now,
          lateMinutes: isCheckIn ? timingDecision.lateMinutes : 0,
          scheduleBasis,
        },
      });
    });

    broadcastDomainEvent({
      domain: 'ATTENDANCE',
      action: 'UPDATED',
      scope: {
        attendanceMode: 'DAILY_USER_PRESENCE',
        academicYearIds: [activeAcademicYear.id],
        userIds: [participant.id],
        roles: [participant.role],
        dates: [dateKey],
        checkpoint,
      },
    });

    const state = await buildUserDailyPresenceStatePayload({
      userId: participant.id,
      activeAcademicYear,
      dateKey,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        {
          ...state,
          checkpoint,
          gateLabel: session.gateLabel || null,
          recordedAt: now.toISOString(),
          recordedTime: formatTime(now),
          lateMinutes: isCheckIn ? timingDecision.lateMinutes : 0,
        },
        checkpoint === 'CHECK_IN'
          ? 'Absen masuk berhasil dari scan QR monitor.'
          : 'Absen pulang berhasil dari scan QR monitor.',
      ),
    );
    return;
  }

  const student = await getOperationalStudentOrThrow(Number(user?.id || 0), activeAcademicYear.id);
  const { policy } = await getStoredDailyPresencePolicy(activeAcademicYear.id);
  const timingDecision = resolveMonitorScanTimingDecision({
    checkpoint,
    policy,
    now,
  });

  const attendanceResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { id: 'desc' },
    });

    if (checkpoint === 'CHECK_IN' && existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
    }
    if (checkpoint === 'CHECK_OUT' && !existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk belum tercatat. Minta bantuan petugas jika perlu koreksi.');
    }
    if (checkpoint === 'CHECK_OUT' && existing?.checkOutTime) {
      throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
    }

    const isCheckIn = checkpoint === 'CHECK_IN';
    const nextStatus = isCheckIn
      ? timingDecision.status
      : existing?.status === 'PRESENT' || existing?.status === 'LATE'
        ? existing.status
        : 'PRESENT';
    const nextNote = isCheckIn ? timingDecision.note || existing?.note || null : existing?.note || null;
    const reason = `Scan QR monitor${session.gateLabel ? ` di ${session.gateLabel}` : ''}`;
    const shouldNotifyParent = isCheckIn ? !existing?.checkInTime : !existing?.checkOutTime;

    const upserted = existing
      ? await tx.dailyAttendance.update({
          where: { id: existing.id },
          data: isCheckIn
            ? {
                status: nextStatus,
                note: nextNote,
                checkInTime: now,
                checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
                checkInReason: reason,
                checkInActorId: session.actorId,
              }
            : {
                status: nextStatus,
                note: nextNote,
                checkOutTime: now,
                checkOutSource: DailyPresenceCaptureSource.SELF_SCAN,
                checkOutReason: reason,
                checkOutActorId: session.actorId,
              },
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        })
      : await tx.dailyAttendance.create({
          data: {
            date: targetDate,
            studentId: student.id,
            classId: student.studentClass!.id,
            academicYearId: activeAcademicYear.id,
            status: timingDecision.status,
            note: timingDecision.note,
            checkInTime: now,
            checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
            checkInReason: reason,
            checkInActorId: session.actorId,
          },
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        });

    await tx.dailyPresenceEvent.create({
      data: {
        dailyAttendanceId: upserted.id,
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        eventType:
          checkpoint === 'CHECK_IN'
            ? DailyPresenceEventType.CHECK_IN
            : DailyPresenceEventType.CHECK_OUT,
        source: DailyPresenceCaptureSource.SELF_SCAN,
        reason: timingDecision.note ? `${reason}. ${timingDecision.note}` : reason,
        gateLabel: session.gateLabel || null,
        actorId: session.actorId,
        recordedAt: now,
      },
    });

    return {
      attendance: upserted,
      shouldNotifyParent,
    };
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      classIds: [student.studentClass!.id],
      studentIds: [student.id],
      dates: [dateKey],
      checkpoint,
    },
  });

  if (attendanceResult.shouldNotifyParent) {
    const recordedAt =
      checkpoint === 'CHECK_IN'
        ? attendanceResult.attendance.checkInTime
        : attendanceResult.attendance.checkOutTime;
    await safeNotifyParentDailyPresence({
      studentId: student.id,
      studentName: student.name,
      classId: student.studentClass!.id,
      checkpoint,
      recordedAt,
      dateKey,
    });
  }

  const state = await buildStudentDailyPresenceStatePayload({
    studentId: student.id,
    activeAcademicYear,
    dateKey,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...state,
        checkpoint,
        gateLabel: session.gateLabel || null,
        recordedAt: now.toISOString(),
        recordedTime: formatTime(now),
        lateMinutes: checkpoint === 'CHECK_IN' ? timingDecision.lateMinutes : 0,
      },
      checkpoint === 'CHECK_IN'
        ? 'Absen masuk berhasil dari scan QR monitor.'
        : 'Absen pulang berhasil dari scan QR monitor.',
    ),
  );
});

export const saveAssistedDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { studentId, checkpoint, reason, gateLabel } = saveAssistedDailyPresenceSchema.parse(req.body);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const student = await getOperationalStudentOrThrow(studentId, activeAcademicYear.id);
  const now = new Date();

  const attendanceResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { id: 'desc' },
    });

    const nextStatus =
      existing?.status === 'PRESENT' || existing?.status === 'LATE' ? existing.status : 'PRESENT';
    const shouldNotifyParent =
      checkpoint === 'CHECK_IN' ? !existing?.checkInTime : !existing?.checkOutTime;

    const data =
      checkpoint === 'CHECK_IN'
        ? {
            status: nextStatus,
            checkInTime: now,
            checkInSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
            checkInReason: reason,
            checkInActorId: actor.id,
          }
        : {
            status: nextStatus,
            checkOutTime: now,
            checkOutSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
            checkOutReason: reason,
            checkOutActorId: actor.id,
          };

    const upserted = existing
      ? await tx.dailyAttendance.update({
          where: { id: existing.id },
          data,
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        })
      : await tx.dailyAttendance.create({
          data: {
            date: targetDate,
            studentId: student.id,
            classId: student.studentClass!.id,
            academicYearId: activeAcademicYear.id,
            status: nextStatus,
            note: null,
            ...(checkpoint === 'CHECK_IN'
              ? {
                  checkInTime: now,
                  checkInSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
                  checkInReason: reason,
                  checkInActorId: actor.id,
                }
              : {
                  checkOutTime: now,
                  checkOutSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
                  checkOutReason: reason,
                  checkOutActorId: actor.id,
                }),
          },
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        });

    await tx.dailyPresenceEvent.create({
      data: {
        dailyAttendanceId: upserted.id,
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        eventType:
          checkpoint === 'CHECK_IN'
            ? DailyPresenceEventType.CHECK_IN
            : DailyPresenceEventType.CHECK_OUT,
        source: DailyPresenceCaptureSource.ASSISTED_SCAN,
        reason,
        gateLabel: gateLabel || null,
        actorId: actor.id,
        recordedAt: now,
      },
    });

    return {
      attendance: upserted,
      shouldNotifyParent,
    };
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      classIds: [student.studentClass!.id],
      studentIds: [student.id],
      dates: [dateKey],
    },
  });

  if (attendanceResult.shouldNotifyParent) {
    const recordedAt =
      checkpoint === 'CHECK_IN'
        ? attendanceResult.attendance.checkInTime
        : attendanceResult.attendance.checkOutTime;
    await safeNotifyParentDailyPresence({
      studentId: student.id,
      studentName: student.name,
      classId: student.studentClass!.id,
      checkpoint,
      recordedAt,
      dateKey,
    });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        student: {
          id: student.id,
          name: student.name,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        presence: buildPresencePayload(attendanceResult.attendance),
      },
      checkpoint === 'CHECK_IN'
        ? 'Absen masuk berhasil dibantu oleh petugas.'
        : 'Absen pulang berhasil dibantu oleh petugas.',
    ),
  );
});

export const saveAssistedUserDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { userId, checkpoint, reason, gateLabel } = saveAssistedUserDailyPresenceSchema.parse(req.body);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const participant = await getDailyPresenceUserOrThrow(userId);
  const now = new Date();
  const { policy } = await getStoredDailyPresencePolicy(activeAcademicYear.id);
  const timingDecision = await resolveUserMonitorScanTimingDecision({
    participant,
    checkpoint,
    policy,
    activeAcademicYearId: activeAcademicYear.id,
    captureMode: 'MANUAL',
    now,
  });
  const isCheckIn = checkpoint === 'CHECK_IN';

  await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyUserPresence.findUnique({
      where: {
        userId_academicYearId_date: {
          userId: participant.id,
          academicYearId: activeAcademicYear.id,
          date: targetDate,
        },
      },
    });

    if (isCheckIn && existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
    }
    if (!isCheckIn && !existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk belum tercatat. Simpan masuk manual lebih dulu jika memang perlu koreksi.');
    }
    if (!isCheckIn && existing?.checkOutTime) {
      throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
    }

    const nextStatus = isCheckIn
      ? timingDecision.status
      : existing?.status === 'PRESENT' || existing?.status === 'LATE'
        ? existing.status
        : 'PRESENT';
    const nextNote = isCheckIn ? timingDecision.note || existing?.note || null : existing?.note || null;
    const scheduleBasis = timingDecision.scheduleBasis;

    const upserted = existing
      ? await tx.dailyUserPresence.update({
          where: { id: existing.id },
          data: isCheckIn
            ? {
                status: nextStatus,
                note: nextNote,
                role: participant.role,
                ptkType: participant.ptkType || null,
                checkInTime: now,
                checkInSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
                checkInReason: reason,
                checkInActorId: actor.id,
                checkInLateMinutes: timingDecision.lateMinutes,
                scheduleBasis,
              }
            : {
                status: nextStatus,
                note: nextNote,
                role: participant.role,
                ptkType: participant.ptkType || null,
                checkOutTime: now,
                checkOutSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
                checkOutReason: reason,
                checkOutActorId: actor.id,
                checkOutEarlyMinutes: timingDecision.earlyMinutes,
                scheduleBasis,
              },
        })
      : await tx.dailyUserPresence.create({
          data: {
            date: targetDate,
            userId: participant.id,
            academicYearId: activeAcademicYear.id,
            role: participant.role,
            ptkType: participant.ptkType || null,
            status: timingDecision.status,
            note: timingDecision.note,
            checkInTime: now,
            checkInSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
            checkInReason: reason,
            checkInActorId: actor.id,
            checkInLateMinutes: timingDecision.lateMinutes,
            scheduleBasis,
          },
        });

    await tx.dailyUserPresenceEvent.create({
      data: {
        dailyUserPresenceId: upserted.id,
        userId: participant.id,
        academicYearId: activeAcademicYear.id,
        role: participant.role,
        date: targetDate,
        eventType: isCheckIn ? DailyPresenceEventType.CHECK_IN : DailyPresenceEventType.CHECK_OUT,
        source: DailyPresenceCaptureSource.ASSISTED_SCAN,
        reason,
        gateLabel: gateLabel || null,
        actorId: actor.id,
        recordedAt: now,
        lateMinutes: isCheckIn ? timingDecision.lateMinutes : 0,
        scheduleBasis,
      },
    });
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_USER_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      userIds: [participant.id],
      roles: [participant.role],
      dates: [dateKey],
      checkpoint,
    },
  });

  const state = await buildUserDailyPresenceStatePayload({
    userId: participant.id,
    activeAcademicYear,
    dateKey,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...state,
        checkpoint,
        gateLabel: gateLabel || null,
        recordedAt: now.toISOString(),
        recordedTime: formatTime(now),
        lateMinutes: isCheckIn ? timingDecision.lateMinutes : 0,
      },
      checkpoint === 'CHECK_IN'
        ? 'Absen masuk peserta non-siswa berhasil dibantu oleh petugas.'
        : 'Absen pulang peserta non-siswa berhasil dibantu oleh petugas.',
    ),
  );
});
