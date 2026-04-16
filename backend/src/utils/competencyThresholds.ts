import { Prisma, Semester } from '@prisma/client'

export type CompetencyThresholdSet = {
  A: string
  B: string
  C: string
  D: string
}

export type CompetencyThresholdByReligion = Record<string, CompetencyThresholdSet>

export type CompetencyThresholdBucket = CompetencyThresholdSet & {
  _byReligion?: CompetencyThresholdByReligion
}

const RELIGION_CODE_ALIASES: Record<string, string> = {
  ISLAM: 'ISLAM',
  MOSLEM: 'ISLAM',
  MUSLIM: 'ISLAM',
  KRISTEN: 'KRISTEN',
  KRISTEN_PROTESTAN: 'KRISTEN',
  PROTESTAN: 'KRISTEN',
  CHRISTIAN: 'KRISTEN',
  KATOLIK: 'KATOLIK',
  CATHOLIC: 'KATOLIK',
  HINDU: 'HINDU',
  BUDDHA: 'BUDDHA',
  BUDHA: 'BUDDHA',
  BUDDHIST: 'BUDDHA',
  KONGHUCU: 'KONGHUCU',
  KHONGHUCU: 'KONGHUCU',
  CONFUCIAN: 'KONGHUCU',
}

const RELIGIOUS_SUBJECT_CODE_ALIASES = new Set([
  'PAI',
  'PAK',
  'PAKB',
  'PAH',
  'PAB',
  'PAKH',
  'PABP',
  'PABP_ISLAM',
  'PABP_KRISTEN',
  'PABP_KATOLIK',
  'PABP_HINDU',
  'PABP_BUDDHA',
  'PABP_KONGHUCU',
])

export function normalizeCompetencyIdentityToken(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function normalizeReligionKey(raw: unknown): string | null {
  const normalized = normalizeCompetencyIdentityToken(raw)
  if (!normalized) return null
  return RELIGION_CODE_ALIASES[normalized] || normalized
}

export function isReligionCompetencySubject(
  subject?: { name?: string | null; code?: string | null } | null,
): boolean {
  const normalizedName = normalizeCompetencyIdentityToken(subject?.name)
  const normalizedCode = normalizeCompetencyIdentityToken(subject?.code)

  if (!normalizedName && !normalizedCode) return false
  if (RELIGIOUS_SUBJECT_CODE_ALIASES.has(normalizedCode)) return true
  if (normalizedName.includes('PENDIDIKAN_AGAMA')) return true
  if (normalizedName === 'AGAMA' || normalizedName.startsWith('AGAMA_')) return true

  return false
}

export function emptyCompetencyThresholdSet(): CompetencyThresholdSet {
  return {
    A: '',
    B: '',
    C: '',
    D: '',
  }
}

export function emptyCompetencyThresholdBucket(): CompetencyThresholdBucket {
  return {
    ...emptyCompetencyThresholdSet(),
  }
}

export function coerceCompetencyThresholdSet(raw: unknown): CompetencyThresholdSet {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyCompetencyThresholdSet()
  }

  const source = raw as Record<string, unknown>
  return {
    A: String(source.A || '').trim(),
    B: String(source.B || '').trim(),
    C: String(source.C || '').trim(),
    D: String(source.D || '').trim(),
  }
}

export function hasAnyCompetencyThresholdValue(
  value: CompetencyThresholdSet | null | undefined,
): boolean {
  return Boolean(
    value &&
      (String(value.A || '').trim() ||
        String(value.B || '').trim() ||
        String(value.C || '').trim() ||
        String(value.D || '').trim()),
  )
}

function coerceCompetencyThresholdByReligion(raw: unknown): CompetencyThresholdByReligion {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const source = raw as Record<string, unknown>
  const normalizedEntries = Object.entries(source)
    .map(([rawKey, rawValue]) => {
      const religionKey = normalizeReligionKey(rawKey)
      if (!religionKey) return null
      const thresholdSet = coerceCompetencyThresholdSet(rawValue)
      if (!hasAnyCompetencyThresholdValue(thresholdSet)) return null
      return [religionKey, thresholdSet] as const
    })
    .filter((entry): entry is readonly [string, CompetencyThresholdSet] => entry !== null)

  return Object.fromEntries(normalizedEntries)
}

export function coerceCompetencyThresholdBucket(raw: unknown): CompetencyThresholdBucket {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyCompetencyThresholdBucket()
  }

  const source = raw as Record<string, unknown>
  const byReligion = coerceCompetencyThresholdByReligion(source._byReligion)
  const bucket: CompetencyThresholdBucket = {
    ...coerceCompetencyThresholdSet(source),
  }

  if (Object.keys(byReligion).length > 0) {
    bucket._byReligion = byReligion
  }

  return bucket
}

export function hasAnyCompetencyThresholdBucketValue(
  value: CompetencyThresholdBucket | null | undefined,
): boolean {
  if (!value) return false
  if (hasAnyCompetencyThresholdValue(value)) return true
  return Object.values(value._byReligion || {}).some((entry) => hasAnyCompetencyThresholdValue(entry))
}

function hasAnySemesterCompetencyThresholdBucketValue(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false

  const source = raw as Record<string, unknown>
  const bucketSource =
    source._bySemester && typeof source._bySemester === 'object' && !Array.isArray(source._bySemester)
      ? (source._bySemester as Record<string, unknown>)
      : {}

  return Object.values(bucketSource).some((entry) =>
    hasAnyCompetencyThresholdBucketValue(coerceCompetencyThresholdBucket(entry)),
  )
}

export function resolveCompetencyThresholdBucket(
  raw: unknown,
  preferredSemester?: Semester | null,
): CompetencyThresholdBucket {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyCompetencyThresholdBucket()
  }

  const source = raw as Record<string, unknown>
  const root = coerceCompetencyThresholdBucket(source)
  const bucketSource =
    source._bySemester && typeof source._bySemester === 'object' && !Array.isArray(source._bySemester)
      ? (source._bySemester as Record<string, unknown>)
      : {}

  const preferred =
    preferredSemester && bucketSource[preferredSemester]
      ? coerceCompetencyThresholdBucket(bucketSource[preferredSemester])
      : emptyCompetencyThresholdBucket()

  if (hasAnyCompetencyThresholdBucketValue(preferred)) {
    return preferred
  }

  if (preferredSemester && hasAnySemesterCompetencyThresholdBucketValue(source)) {
    return emptyCompetencyThresholdBucket()
  }

  if (hasAnyCompetencyThresholdBucketValue(root)) {
    return root
  }

  const odd = coerceCompetencyThresholdBucket(bucketSource[Semester.ODD])
  if (hasAnyCompetencyThresholdBucketValue(odd)) return odd

  const even = coerceCompetencyThresholdBucket(bucketSource[Semester.EVEN])
  if (hasAnyCompetencyThresholdBucketValue(even)) return even

  return emptyCompetencyThresholdBucket()
}

function serializeCompetencyThresholdBucket(bucket: CompetencyThresholdBucket): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    A: bucket.A,
    B: bucket.B,
    C: bucket.C,
    D: bucket.D,
  }

  const byReligion = coerceCompetencyThresholdByReligion(bucket._byReligion)
  if (Object.keys(byReligion).length > 0) {
    serialized._byReligion = byReligion
  }

  return serialized
}

export function mergeCompetencyThresholdBucket(
  raw: unknown,
  semester: Semester,
  nextValue: CompetencyThresholdBucket,
): Prisma.InputJsonValue {
  const normalizedNextValue = coerceCompetencyThresholdBucket(nextValue)
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  const bucketSource =
    base._bySemester && typeof base._bySemester === 'object' && !Array.isArray(base._bySemester)
      ? { ...(base._bySemester as Record<string, unknown>) }
      : {}

  bucketSource[semester] = serializeCompetencyThresholdBucket(normalizedNextValue)

  const rootBucket = coerceCompetencyThresholdBucket(base)
  const merged: Record<string, unknown> = {
    ...base,
    _bySemester: bucketSource,
  }

  if (!hasAnyCompetencyThresholdBucketValue(rootBucket)) {
    merged.A = normalizedNextValue.A
    merged.B = normalizedNextValue.B
    merged.C = normalizedNextValue.C
    merged.D = normalizedNextValue.D
    if (normalizedNextValue._byReligion && Object.keys(normalizedNextValue._byReligion).length > 0) {
      merged._byReligion = normalizedNextValue._byReligion
    }
  } else if (
    (!rootBucket._byReligion || Object.keys(rootBucket._byReligion).length === 0) &&
    normalizedNextValue._byReligion &&
    Object.keys(normalizedNextValue._byReligion).length > 0
  ) {
    merged._byReligion = normalizedNextValue._byReligion
  }

  return merged as Prisma.InputJsonValue
}

export function deriveThresholdDescription(
  thresholds: CompetencyThresholdBucket,
  predicate: string | null | undefined,
  options?: {
    religionKey?: string | null
    preferReligion?: boolean
    allowGeneralFallback?: boolean
  },
): string | null {
  const normalizedPredicate = String(predicate || '').trim().toUpperCase()
  if (!normalizedPredicate || !['A', 'B', 'C', 'D'].includes(normalizedPredicate)) {
    return null
  }

  const preferReligion = Boolean(options?.preferReligion)
  const allowGeneralFallback = options?.allowGeneralFallback ?? true
  const normalizedReligionKey = normalizeReligionKey(options?.religionKey)

  if (preferReligion && normalizedReligionKey) {
    const religionThreshold = coerceCompetencyThresholdSet(
      thresholds._byReligion?.[normalizedReligionKey],
    )
    const religionDescription = String(
      religionThreshold[normalizedPredicate as keyof CompetencyThresholdSet] || '',
    ).trim()
    if (religionDescription) {
      return religionDescription
    }
  }

  if (preferReligion && !allowGeneralFallback) {
    return null
  }

  const description = String(
    thresholds[normalizedPredicate as keyof CompetencyThresholdSet] || '',
  ).trim()

  return description || null
}
