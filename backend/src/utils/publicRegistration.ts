import type { Prisma } from '@prisma/client';

export const PARENT_REGISTRATION_REQUEST_KEY = 'parentRegistrationRequest';
export const CANDIDATE_REGISTRATION_REQUEST_KEY = 'candidateRegistrationRequest';

export type ParentRegistrationRequest = {
  childId: number;
  childNisn: string;
  childName: string;
  childBirthDate: string;
  childClassName?: string | null;
  childMajorCode?: string | null;
  childMajorName?: string | null;
  requestedAt: string;
  verifiedByChildBirthDate: boolean;
  linkState?: 'PENDING_APPROVAL' | 'LINKED' | 'NEEDS_REVIEW';
  linkedAt?: string | null;
};

export type CandidateRegistrationRequest = {
  mainMajorId: number;
  mainMajorCode: string;
  mainMajorName: string;
  optionalMajorId?: number | null;
  optionalMajorCode?: string | null;
  optionalMajorName?: string | null;
  requestedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function readParentRegistrationRequest(
  preferences: Prisma.JsonValue | null | undefined,
): ParentRegistrationRequest | null {
  if (!isRecord(preferences)) {
    return null;
  }

  const raw = preferences[PARENT_REGISTRATION_REQUEST_KEY];
  if (!isRecord(raw)) {
    return null;
  }

  const childId = Number(raw.childId);
  const childNisn = String(raw.childNisn || '').trim();
  const childName = String(raw.childName || '').trim();
  const childBirthDate = String(raw.childBirthDate || '').trim();
  const requestedAt = String(raw.requestedAt || '').trim();

  if (!Number.isInteger(childId) || childId <= 0 || !childNisn || !childName || !childBirthDate || !requestedAt) {
    return null;
  }

  const linkStateRaw = String(raw.linkState || '').trim().toUpperCase();

  return {
    childId,
    childNisn,
    childName,
    childBirthDate,
    childClassName: normalizeOptionalText(raw.childClassName),
    childMajorCode: normalizeOptionalText(raw.childMajorCode),
    childMajorName: normalizeOptionalText(raw.childMajorName),
    requestedAt,
    verifiedByChildBirthDate: Boolean(raw.verifiedByChildBirthDate),
    linkState:
      linkStateRaw === 'PENDING_APPROVAL' || linkStateRaw === 'LINKED' || linkStateRaw === 'NEEDS_REVIEW'
        ? (linkStateRaw as ParentRegistrationRequest['linkState'])
        : undefined,
    linkedAt: normalizeOptionalText(raw.linkedAt),
  };
}

export function mergeParentRegistrationRequest(
  preferences: Prisma.JsonValue | null | undefined,
  request: ParentRegistrationRequest,
): Prisma.InputJsonValue {
  const base = isRecord(preferences) ? { ...preferences } : {};

  base[PARENT_REGISTRATION_REQUEST_KEY] = {
    childId: request.childId,
    childNisn: request.childNisn,
    childName: request.childName,
    childBirthDate: request.childBirthDate,
    childClassName: request.childClassName ?? null,
    childMajorCode: request.childMajorCode ?? null,
    childMajorName: request.childMajorName ?? null,
    requestedAt: request.requestedAt,
    verifiedByChildBirthDate: request.verifiedByChildBirthDate,
    linkState: request.linkState ?? null,
    linkedAt: request.linkedAt ?? null,
  };

  return base as Prisma.InputJsonValue;
}

export function readCandidateRegistrationRequest(
  preferences: Prisma.JsonValue | null | undefined,
): CandidateRegistrationRequest | null {
  if (!isRecord(preferences)) {
    return null;
  }

  const raw = preferences[CANDIDATE_REGISTRATION_REQUEST_KEY];
  if (!isRecord(raw)) {
    return null;
  }

  const mainMajorId = Number(raw.mainMajorId);
  const mainMajorCode = String(raw.mainMajorCode || '').trim();
  const mainMajorName = String(raw.mainMajorName || '').trim();
  const requestedAt = String(raw.requestedAt || '').trim();

  if (!Number.isInteger(mainMajorId) || mainMajorId <= 0 || !mainMajorCode || !mainMajorName || !requestedAt) {
    return null;
  }

  const optionalMajorId = Number(raw.optionalMajorId);

  return {
    mainMajorId,
    mainMajorCode,
    mainMajorName,
    optionalMajorId: Number.isInteger(optionalMajorId) && optionalMajorId > 0 ? optionalMajorId : null,
    optionalMajorCode: normalizeOptionalText(raw.optionalMajorCode),
    optionalMajorName: normalizeOptionalText(raw.optionalMajorName),
    requestedAt,
  };
}

export function mergeCandidateRegistrationRequest(
  preferences: Prisma.JsonValue | null | undefined,
  request: CandidateRegistrationRequest,
): Prisma.InputJsonValue {
  const base = isRecord(preferences) ? { ...preferences } : {};

  base[CANDIDATE_REGISTRATION_REQUEST_KEY] = {
    mainMajorId: request.mainMajorId,
    mainMajorCode: request.mainMajorCode,
    mainMajorName: request.mainMajorName,
    optionalMajorId: request.optionalMajorId ?? null,
    optionalMajorCode: request.optionalMajorCode ?? null,
    optionalMajorName: request.optionalMajorName ?? null,
    requestedAt: request.requestedAt,
  };

  return base as Prisma.InputJsonValue;
}
