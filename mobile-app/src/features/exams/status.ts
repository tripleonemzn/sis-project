import type { StudentExamItem } from './types';

export type StudentExamRuntimeStatus = 'OPEN' | 'MAKEUP' | 'UPCOMING' | 'MISSED' | 'COMPLETED';

function parseExamTime(value?: string | null): number {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

export function resolveStudentExamRuntimeStatus(
  item: Pick<StudentExamItem, 'status' | 'has_submitted' | 'makeupAvailable' | 'startTime' | 'endTime'>,
): StudentExamRuntimeStatus {
  if (Boolean(item.has_submitted)) return 'COMPLETED';

  const normalizedStatus = String(item.status || '').trim().toUpperCase();
  if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'TIMEOUT' || normalizedStatus === 'GRADED') {
    return 'COMPLETED';
  }

  const nowMs = Date.now();
  const startTimeMs = parseExamTime(item.startTime);
  const endTimeMs = parseExamTime(item.endTime);

  if (normalizedStatus === 'MAKEUP_AVAILABLE' || Boolean(item.makeupAvailable)) {
    return 'MAKEUP';
  }
  if (Number.isFinite(startTimeMs) && nowMs < startTimeMs) {
    return 'UPCOMING';
  }
  if (Number.isFinite(endTimeMs) && nowMs > endTimeMs) {
    return 'MISSED';
  }
  if (normalizedStatus === 'MISSED' || normalizedStatus === 'EXPIRED') {
    return 'MISSED';
  }
  if (normalizedStatus === 'UPCOMING') {
    return 'UPCOMING';
  }
  if (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'OPEN' || normalizedStatus === 'ONGOING') {
    return 'OPEN';
  }

  return 'OPEN';
}
