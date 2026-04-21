import type { Prisma } from '@prisma/client';

export const EXAM_PROCTOR_WARNING_NOTIFICATION_TYPE = 'EXAM_PROCTOR_WARNING';
export const EXAM_PROCTOR_TERMINATION_NOTIFICATION_TYPE = 'EXAM_PROCTOR_TERMINATION';

export type ExamProctorWarningSignal = {
  id: number;
  title: string;
  message: string;
  warnedAt: string;
  scheduleId: number;
  studentId: number | null;
  proctorId: number | null;
  proctorName: string | null;
  room: string | null;
  category: string | null;
};

export type ExamProctorTerminationSignal = {
  id: number;
  title: string;
  message: string;
  terminatedAt: string;
  scheduleId: number;
  studentId: number | null;
  proctorId: number | null;
  proctorName: string | null;
  room: string | null;
  category: string | null;
};

type NotificationLike = {
  id: number;
  title: string;
  message: string;
  createdAt: Date | string;
  data?: Prisma.JsonValue | null;
  userId?: number | null;
};

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isResolvedSignalData(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  return Boolean(toNullableString(data.resolvedAt) || toNullableString(data.resolvedByResetAt));
}

export function buildExamProctorWarningNotificationData(params: {
  scheduleId: number;
  studentId: number;
  proctorId?: number | null;
  proctorName?: string | null;
  room?: string | null;
  category?: string | null;
  sourceScheduleId?: number | null;
}): Prisma.InputJsonValue {
  return {
    module: 'EXAM_PROCTORING',
    kind: 'PROCTOR_WARNING',
    route: '/exams',
    scheduleId: Number(params.scheduleId),
    studentId: Number(params.studentId),
    proctorId: toNullableNumber(params.proctorId),
    proctorName: toNullableString(params.proctorName),
    room: toNullableString(params.room),
    category: toNullableString(params.category),
    sourceScheduleId: toNullableNumber(params.sourceScheduleId),
  } satisfies Record<string, unknown>;
}

export function buildExamProctorTerminationNotificationData(params: {
  scheduleId: number;
  studentId: number;
  proctorId?: number | null;
  proctorName?: string | null;
  room?: string | null;
  category?: string | null;
  sourceScheduleId?: number | null;
}): Prisma.InputJsonValue {
  return {
    module: 'EXAM_PROCTORING',
    kind: 'PROCTOR_TERMINATION',
    route: '/exams',
    scheduleId: Number(params.scheduleId),
    studentId: Number(params.studentId),
    proctorId: toNullableNumber(params.proctorId),
    proctorName: toNullableString(params.proctorName),
    room: toNullableString(params.room),
    category: toNullableString(params.category),
    sourceScheduleId: toNullableNumber(params.sourceScheduleId),
  } satisfies Record<string, unknown>;
}

export function parseExamProctorWarningSignal(notification: NotificationLike): ExamProctorWarningSignal | null {
  const data = toJsonRecord(notification.data);
  const kind = String(data?.kind || '').trim().toUpperCase();
  if (kind !== 'PROCTOR_WARNING') return null;

  const scheduleId = toNullableNumber(data?.scheduleId);
  if (!scheduleId) return null;

  const warnedAtRaw = notification.createdAt instanceof Date
    ? notification.createdAt
    : new Date(String(notification.createdAt || ''));
  const warnedAt = Number.isNaN(warnedAtRaw.getTime()) ? new Date().toISOString() : warnedAtRaw.toISOString();

  return {
    id: Number(notification.id),
    title: String(notification.title || 'Peringatan Pengawas'),
    message: String(notification.message || '').trim(),
    warnedAt,
    scheduleId,
    studentId: toNullableNumber(data?.studentId) ?? toNullableNumber(notification.userId),
    proctorId: toNullableNumber(data?.proctorId),
    proctorName: toNullableString(data?.proctorName),
    room: toNullableString(data?.room),
    category: toNullableString(data?.category),
  };
}

export function parseExamProctorTerminationSignal(
  notification: NotificationLike,
): ExamProctorTerminationSignal | null {
  const data = toJsonRecord(notification.data);
  const kind = String(data?.kind || '').trim().toUpperCase();
  if (kind !== 'PROCTOR_TERMINATION') return null;
  if (isResolvedSignalData(data)) return null;

  const scheduleId = toNullableNumber(data?.scheduleId);
  if (!scheduleId) return null;

  const terminatedAtRaw = notification.createdAt instanceof Date
    ? notification.createdAt
    : new Date(String(notification.createdAt || ''));
  const terminatedAt = Number.isNaN(terminatedAtRaw.getTime())
    ? new Date().toISOString()
    : terminatedAtRaw.toISOString();

  return {
    id: Number(notification.id),
    title: String(notification.title || 'Sesi Ujian Diakhiri Pengawas'),
    message: String(notification.message || '').trim(),
    terminatedAt,
    scheduleId,
    studentId: toNullableNumber(data?.studentId) ?? toNullableNumber(notification.userId),
    proctorId: toNullableNumber(data?.proctorId),
    proctorName: toNullableString(data?.proctorName),
    room: toNullableString(data?.room),
    category: toNullableString(data?.category),
  };
}

export function matchesExamProctorWarningSchedule(
  notification: NotificationLike,
  scheduleIds: number[],
): boolean {
  const parsed = parseExamProctorWarningSignal(notification);
  if (!parsed) return false;
  return scheduleIds.includes(parsed.scheduleId);
}

export function matchesExamProctorTerminationSchedule(
  notification: NotificationLike,
  scheduleIds: number[],
): boolean {
  const parsed = parseExamProctorTerminationSignal(notification);
  if (!parsed) return false;
  return scheduleIds.includes(parsed.scheduleId);
}
