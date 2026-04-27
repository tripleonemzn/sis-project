export type HomeroomResultPublicationMode = 'FOLLOW_GLOBAL' | 'BLOCKED'

export type HomeroomResultPublicationState = {
  mode: HomeroomResultPublicationMode
  updatedAt: Date | null
  updatedBy: number | null
}

const HOMEROOM_RESULT_PUBLICATION_PREFERENCE_KEY = 'homeroomResultPublication'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeHomeroomResultPublicationCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseOptionalDate(raw: unknown): Date | null {
  if (!raw) return null
  const parsed = raw instanceof Date ? raw : new Date(String(raw))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getPublicationClassBucket(params: {
  preferences: unknown
  academicYearId: number
  classId: number
}): Record<string, unknown> | null {
  if (!isRecord(params.preferences)) return null
  const root = params.preferences[HOMEROOM_RESULT_PUBLICATION_PREFERENCE_KEY]
  if (!isRecord(root)) return null
  const yearBucket = root[String(params.academicYearId)]
  if (!isRecord(yearBucket)) return null
  const classBucket = yearBucket[String(params.classId)]
  if (!isRecord(classBucket)) return null
  return classBucket
}

export function readHomeroomResultPublication(params: {
  preferences: unknown
  academicYearId: number
  classId: number
  publicationCode: unknown
}): HomeroomResultPublicationState {
  const normalizedPublicationCode = normalizeHomeroomResultPublicationCode(params.publicationCode)
  if (!normalizedPublicationCode) {
    return {
      mode: 'FOLLOW_GLOBAL',
      updatedAt: null,
      updatedBy: null,
    }
  }

  const classBucket = getPublicationClassBucket(params)
  const rawEntry = classBucket?.[normalizedPublicationCode]
  if (!isRecord(rawEntry) || rawEntry.blocked !== true) {
    return {
      mode: 'FOLLOW_GLOBAL',
      updatedAt: null,
      updatedBy: null,
    }
  }

  const updatedBy = Number(rawEntry.updatedBy || 0)
  return {
    mode: 'BLOCKED',
    updatedAt: parseOptionalDate(rawEntry.updatedAt),
    updatedBy: Number.isFinite(updatedBy) && updatedBy > 0 ? updatedBy : null,
  }
}

export function listBlockedHomeroomResultPublicationCodes(params: {
  preferences: unknown
  academicYearId: number
  classId: number
}): Set<string> {
  const blockedCodes = new Set<string>()
  const classBucket = getPublicationClassBucket(params)
  if (!classBucket) return blockedCodes

  Object.entries(classBucket).forEach(([publicationCode, rawEntry]) => {
    if (!isRecord(rawEntry) || rawEntry.blocked !== true) return
    const normalizedPublicationCode = normalizeHomeroomResultPublicationCode(publicationCode)
    if (normalizedPublicationCode) {
      blockedCodes.add(normalizedPublicationCode)
    }
  })

  return blockedCodes
}

export function writeHomeroomResultPublication(params: {
  preferences: unknown
  academicYearId: number
  classId: number
  publicationCode: unknown
  mode: HomeroomResultPublicationMode
  actorUserId?: number | null
  now?: Date
}): Record<string, unknown> {
  const normalizedPublicationCode = normalizeHomeroomResultPublicationCode(params.publicationCode)
  const nextPreferences = isRecord(params.preferences) ? { ...params.preferences } : {}

  if (!normalizedPublicationCode) {
    return nextPreferences
  }

  const root = isRecord(nextPreferences[HOMEROOM_RESULT_PUBLICATION_PREFERENCE_KEY])
    ? { ...(nextPreferences[HOMEROOM_RESULT_PUBLICATION_PREFERENCE_KEY] as Record<string, unknown>) }
    : {}

  const yearKey = String(params.academicYearId)
  const classKey = String(params.classId)
  const yearBucket = isRecord(root[yearKey]) ? { ...(root[yearKey] as Record<string, unknown>) } : {}
  const classBucket = isRecord(yearBucket[classKey])
    ? { ...(yearBucket[classKey] as Record<string, unknown>) }
    : {}

  if (params.mode === 'BLOCKED') {
    classBucket[normalizedPublicationCode] = {
      blocked: true,
      updatedAt: (params.now || new Date()).toISOString(),
      updatedBy:
        params.actorUserId && Number.isFinite(Number(params.actorUserId)) && Number(params.actorUserId) > 0
          ? Number(params.actorUserId)
          : null,
    }
  } else {
    delete classBucket[normalizedPublicationCode]
  }

  if (Object.keys(classBucket).length > 0) {
    yearBucket[classKey] = classBucket
  } else {
    delete yearBucket[classKey]
  }

  if (Object.keys(yearBucket).length > 0) {
    root[yearKey] = yearBucket
  } else {
    delete root[yearKey]
  }

  if (Object.keys(root).length > 0) {
    nextPreferences[HOMEROOM_RESULT_PUBLICATION_PREFERENCE_KEY] = root
  } else {
    delete nextPreferences[HOMEROOM_RESULT_PUBLICATION_PREFERENCE_KEY]
  }

  return nextPreferences
}
