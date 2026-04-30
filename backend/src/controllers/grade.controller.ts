import { Request, Response } from 'express'
import {
  Semester,
  GradeComponentType,
  GradeEntryMode,
  Prisma,
  ReportComponentSlot,
  ExamSessionStatus,
  ExamType,
  ScoreRemedialMethod,
  ScoreRemedialStatus,
} from '@prisma/client'
import prisma from '../utils/prisma'
import { ApiResponseHelper } from '../utils/ApiResponse'
import { ApiError } from '../utils/api'
import { broadcastDomainEvent } from '../realtime/realtimeGateway'
import {
  getHistoricalStudentSnapshotForAcademicYear,
  listHistoricalStudentsByIdsForAcademicYear,
  resolveHistoricalStudentScope,
  type HistoricalStudentSnapshot,
} from '../utils/studentAcademicHistory'
import {
  syncAdditionalNfSeriesEntriesFromStudentGrade,
  syncScoreEntriesFromStudentGrade,
} from '../services/scoreEntry.service'
import {
  computeFixedWeightedAverage,
  computeNormalizedWeightedAverage,
  normalizeRoundedFinalScore,
  resolveDefaultGradeWeightByCode,
} from '../utils/gradeWeights'
import {
  deriveThresholdDescription,
  hasAnyCompetencyThresholdBucketValue,
  isReligionCompetencySubject,
  normalizeReligionKey,
  resolveCompetencyThresholdBucket,
} from '../utils/competencyThresholds'
import {
  defaultExamStudentResultPublishMode,
  resolveStudentExamProgramResultRelease,
  type StudentProgramResultReleaseState,
} from '../utils/examProgramResultRelease'
import {
  listBlockedHomeroomResultPublicationCodes,
  readHomeroomResultPublication,
  writeHomeroomResultPublication,
  type HomeroomResultPublicationMode,
} from '../utils/homeroomResultPublication'
import { summarizeDailyPresenceRows } from '../utils/dailyPresenceSummary'

const DEFAULT_REPORT_SLOT_CODE = 'NONE'

type ExamComponentRule = {
  code: string
  componentType: GradeComponentType
  reportSlot: ReportComponentSlot
  reportSlotCode: string
  includeInFinalScore: boolean
}

type StudentReleaseReportDateRow = {
  semester: Semester
  reportType: ExamType
  place?: string | null
  date?: Date | null
}

function normalizeReportSlotCode(raw: unknown): string {
  const normalized = normalizeComponentCode(raw)
  return normalized || DEFAULT_REPORT_SLOT_CODE
}

function buildStudentReleaseReportDateKey(semester: Semester, reportType: ExamType): string {
  return `${semester}:${reportType}`
}

type SemesterRange = {
  start: Date
  end: Date
}

type StudentOverviewComponentRow = {
  code: string
  label: string
  type: string
  reportSlotCode: string
  entryMode: string
  includeInFinalScore: boolean
  displayOrder: number
  release: StudentProgramResultReleaseState
}

type StudentSemesterReportStatusCode = 'NOT_READY' | 'PARTIAL' | 'READY'
type StudentSemesterReportReleaseCode = 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'HOMEROOM_BLOCKED'

type StudentSemesterReportReleaseState = {
  code: StudentSemesterReportReleaseCode
  label: string
  tone: 'red' | 'amber' | 'green'
  description: string
  canViewDetails: boolean
  source: 'REPORT_DATE' | 'HOMEROOM'
  effectiveDate: Date | null
}

type HomeroomPublicationEffectiveVisibility = {
  canViewDetails: boolean
  label: string
  tone: 'red' | 'amber' | 'green'
  description: string
}

type StudentScoreEntryFindManyDelegate = {
  findMany: (args: unknown) => Promise<unknown[]>
}

type StudentScoreEntryWriteDelegate = {
  upsert: (args: unknown) => Promise<unknown>
  deleteMany: (args: unknown) => Promise<unknown>
}

type AuthUserLike = {
  id?: number | string
  role?: string | null
}

function uniqPositiveNumbers(values: unknown[]): number[] {
  const unique = new Set<number>()
  values.forEach((value) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    unique.add(parsed)
  })
  return Array.from(unique)
}

function uniqSemesterValues(values: unknown[]): Semester[] {
  const unique = new Set<Semester>()
  values.forEach((value) => {
    const normalized = parseStudentReportSemester(value)
    if (!normalized) return
    unique.add(normalized)
  })
  return Array.from(unique)
}

function emitGradeRealtimeRefresh(params: {
  studentIds?: unknown[]
  subjectIds?: unknown[]
  academicYearIds?: unknown[]
  semesters?: unknown[]
  includeReports?: boolean
}) {
  const studentIds = uniqPositiveNumbers(params.studentIds || [])
  const subjectIds = uniqPositiveNumbers(params.subjectIds || [])
  const academicYearIds = uniqPositiveNumbers(params.academicYearIds || [])
  const semesters = uniqSemesterValues(params.semesters || [])

  const scope: Record<string, string | number | boolean | null | Array<string | number | boolean | null>> = {}
  if (studentIds.length > 0) scope.studentIds = studentIds
  if (subjectIds.length > 0) scope.subjectIds = subjectIds
  if (academicYearIds.length > 0) scope.academicYearIds = academicYearIds
  if (semesters.length > 0) scope.semesters = semesters

  broadcastDomainEvent({
    domain: 'GRADES',
    action: 'UPDATED',
    scope: Object.keys(scope).length > 0 ? scope : undefined,
  })

  if (params.includeReports) {
    broadcastDomainEvent({
      domain: 'REPORTS',
      action: 'UPDATED',
      scope: Object.keys(scope).length > 0 ? scope : undefined,
    })
  }
}

function getStudentScoreEntryDelegate(): StudentScoreEntryFindManyDelegate | null {
  const delegate = (prisma as unknown as { studentScoreEntry?: StudentScoreEntryFindManyDelegate }).studentScoreEntry
  if (!delegate || typeof delegate.findMany !== 'function') {
    return null
  }
  return delegate
}

function getStudentScoreEntryWriteDelegate(): StudentScoreEntryWriteDelegate | null {
  const delegate = (prisma as unknown as { studentScoreEntry?: StudentScoreEntryWriteDelegate }).studentScoreEntry
  if (
    !delegate ||
    typeof delegate.upsert !== 'function' ||
    typeof delegate.deleteMany !== 'function'
  ) {
    return null
  }
  return delegate
}

async function deleteStudentGradeScoreEntriesByPrefix(gradeId: number) {
  const delegate = (prisma as unknown as {
    studentScoreEntry?: { deleteMany: (args: unknown) => Promise<unknown> }
  }).studentScoreEntry
  if (!delegate || typeof delegate.deleteMany !== 'function') return

  await delegate.deleteMany({
    where: {
      sourceKey: {
        startsWith: `studentGrade:${gradeId}:`,
      },
    },
  })
}

function toPositiveInt(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function parseStudentReportSemester(raw: unknown): Semester | null {
  const normalized = String(raw || '').trim().toUpperCase()
  if (normalized === Semester.ODD) return Semester.ODD
  if (normalized === Semester.EVEN) return Semester.EVEN
  return null
}

function isTeacherUser(user: AuthUserLike | null | undefined): boolean {
  return String(user?.role || '').toUpperCase() === 'TEACHER'
}

const buildHistoricalStudentAcademicKey = (studentId: number, academicYearId: number) =>
  `${studentId}:${academicYearId}`

async function buildHistoricalStudentSnapshotMap(
  rows: Array<{ studentId: number; academicYearId: number }>,
): Promise<Map<string, HistoricalStudentSnapshot>> {
  const byAcademicYear = new Map<number, number[]>()

  rows.forEach((row) => {
    const studentId = Number(row.studentId)
    const academicYearId = Number(row.academicYearId)
    if (!Number.isFinite(studentId) || studentId <= 0) return
    if (!Number.isFinite(academicYearId) || academicYearId <= 0) return
    const bucket = byAcademicYear.get(academicYearId) || []
    bucket.push(studentId)
    byAcademicYear.set(academicYearId, bucket)
  })

  const snapshotMap = new Map<string, HistoricalStudentSnapshot>()

  await Promise.all(
    Array.from(byAcademicYear.entries()).map(async ([academicYearId, studentIds]) => {
      const snapshots = await listHistoricalStudentsByIdsForAcademicYear(studentIds, academicYearId)
      snapshots.forEach((snapshot) => {
        snapshotMap.set(buildHistoricalStudentAcademicKey(snapshot.id, academicYearId), snapshot)
      })
    }),
  )

  return snapshotMap
}

function resolveHistoricalStudentClassId(params: {
  snapshotMap?: Map<string, HistoricalStudentSnapshot>
  studentId: number
  academicYearId: number
  fallbackClassId?: number | null
  fallbackClassAcademicYearId?: number | null
}) {
  const snapshot = params.snapshotMap?.get(
    buildHistoricalStudentAcademicKey(params.studentId, params.academicYearId),
  )
  const historicalClassId = Number(snapshot?.studentClass?.id || 0)
  if (historicalClassId > 0) return historicalClassId

  const fallbackClassId = Number(params.fallbackClassId || 0)
  if (
    fallbackClassId > 0 &&
    Number(params.fallbackClassAcademicYearId || 0) === Number(params.academicYearId)
  ) {
    return fallbackClassId
  }

  return null
}

async function resolveStudentClassId(
  studentId: number,
  academicYearId?: number | null,
): Promise<number | null> {
  const normalizedAcademicYearId = Number(academicYearId || 0)
  if (normalizedAcademicYearId > 0) {
    const historicalStudent = await getHistoricalStudentSnapshotForAcademicYear(
      studentId,
      normalizedAcademicYearId,
    )
    const historicalClassId = Number(historicalStudent?.studentClass?.id || 0)
    if (historicalClassId > 0) return historicalClassId
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      classId: true,
      studentClass: {
        select: {
          academicYearId: true,
        },
      },
    },
  })

  if (
    normalizedAcademicYearId > 0 &&
    Number(student?.studentClass?.academicYearId || 0) !== normalizedAcademicYearId
  ) {
    return null
  }

  return Number(student?.classId || 0) || null
}

async function resolveReportCompetencyDescription(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  finalScore: number | null
  predicate?: string | null
}) {
  if (params.finalScore === null || params.finalScore === undefined) return null

  const studentClassId = await resolveStudentClassId(params.studentId, params.academicYearId)
  if (!studentClassId) return null

  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      classId: studentClassId,
      subjectId: params.subjectId,
      academicYearId: params.academicYearId,
    },
    select: {
      kkm: true,
      competencyThresholds: true,
      subject: {
        select: {
          name: true,
          code: true,
        },
      },
    },
  })

  if (!assignment) return null

  const thresholds = resolveCompetencyThresholdBucket(assignment.competencyThresholds, params.semester)
  if (!hasAnyCompetencyThresholdBucketValue(thresholds)) return null
  const useReligionThresholds = isReligionCompetencySubject(assignment.subject)

  const predicate =
    String(params.predicate || '').trim() ||
    calculatePredicate(Number(params.finalScore || 0), Number(assignment.kkm || 75))

  let religionKey: string | null = null
  if (useReligionThresholds) {
    const student = await prisma.user.findUnique({
      where: { id: params.studentId },
      select: { religion: true },
    })
    religionKey = normalizeReligionKey(student?.religion)
  }

  return deriveThresholdDescription(thresholds, predicate, {
    religionKey,
    preferReligion: useReligionThresholds,
    allowGeneralFallback: true,
  })
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const normalizedLimit = Math.max(1, Math.floor(limit))
  for (let index = 0; index < items.length; index += normalizedLimit) {
    const batch = items.slice(index, index + normalizedLimit)
    await Promise.all(batch.map((item) => worker(item)))
  }
}

async function ensureTeacherCanAccessGradeContext(params: {
  user: AuthUserLike
  subjectId: number
  academicYearId: number
  classId?: number | null
  studentId?: number | null
}) {
  if (!isTeacherUser(params.user)) return

  const teacherId = Number(params.user?.id || 0)
  if (!Number.isFinite(teacherId) || teacherId <= 0) {
    throw new ApiError(401, 'Sesi login tidak valid.')
  }

  let resolvedClassId = Number(params.classId || 0)
  if (!resolvedClassId && params.studentId) {
    resolvedClassId =
      Number(await resolveStudentClassId(Number(params.studentId), Number(params.academicYearId))) || 0
  }

  if (!Number.isFinite(resolvedClassId) || resolvedClassId <= 0) {
    throw new ApiError(400, 'class_id atau student_id valid wajib diisi.')
  }

  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId,
      academicYearId: Number(params.academicYearId),
      subjectId: Number(params.subjectId),
      classId: resolvedClassId,
    },
    select: {
      id: true,
    },
  })

  if (!assignment) {
    throw new ApiError(
      403,
      'Anda tidak memiliki assignment mapel-kelas ini. Input nilai ditolak.',
    )
  }
}

function normalizeComponentCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeSemesterForComponentScope(raw: unknown): Semester | null {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
  if (!value) return null
  if (value === 'ODD' || value === 'GANJIL') return Semester.ODD
  if (value === 'EVEN' || value === 'GENAP') return Semester.EVEN
  return null
}

function normalizeClassLevelTokenForScope(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!value) return ''
  if (value === '10' || value === 'X') return 'X'
  if (value === '11' || value === 'XI') return 'XI'
  if (value === '12' || value === 'XII') return 'XII'
  return ''
}

function isFormativeAliasCode(raw: unknown): boolean {
  const normalized = normalizeComponentCode(raw)
  if (!normalized) return false
  return (
    normalized === 'FORMATIF' ||
    normalized === 'FORMATIVE' ||
    normalized.startsWith('NF')
  )
}

function isMidtermAliasCode(raw: unknown): boolean {
  const normalized = normalizeComponentCode(raw)
  if (!normalized) return false
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(normalized)) return true
  return normalized.includes('MIDTERM')
}

function isFinalAliasCode(raw: unknown): boolean {
  const normalized = normalizeComponentCode(raw)
  if (!normalized) return false
  if (['SAS', 'SAT', 'FINAL', 'PAS', 'PAT', 'PSAS', 'PSAT'].includes(normalized)) return true
  return normalized.includes('FINAL')
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const normalized = normalizeComponentCode(raw)
  if (!normalized) return false
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true
  return normalized.includes('FINAL_EVEN') || normalized.includes('EVEN')
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const normalized = normalizeComponentCode(raw)
  if (!normalized) return false
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true
  return normalized.includes('FINAL_ODD') || normalized.includes('ODD')
}

function inferGradeComponentTypeBySlotCode(
  slotCode: string,
  fallback: GradeComponentType = GradeComponentType.CUSTOM,
): GradeComponentType {
  if (isFormativeAliasCode(slotCode)) return GradeComponentType.FORMATIVE
  if (isMidtermAliasCode(slotCode)) return GradeComponentType.MIDTERM
  if (isFinalAliasCode(slotCode)) return GradeComponentType.FINAL
  return fallback
}

function formatSlotDisplayLabel(slotCode: string, fallback = 'Komponen'): string {
  const normalized = normalizeComponentCode(slotCode)
  if (!normalized || normalized === DEFAULT_REPORT_SLOT_CODE) return fallback
  if (isFormativeAliasCode(normalized)) return 'Formatif'
  if (isMidtermAliasCode(normalized)) return 'Midterm'
  if (isFinalAliasCode(normalized)) return 'Final'
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

function defaultReportSlotByType(type: GradeComponentType): ReportComponentSlot {
  if (type === GradeComponentType.FORMATIVE) return ReportComponentSlot.FORMATIF
  if (type === GradeComponentType.MIDTERM) return ReportComponentSlot.SBTS
  if (type === GradeComponentType.FINAL) return ReportComponentSlot.SAS
  if (type === GradeComponentType.US_THEORY) return ReportComponentSlot.US_THEORY
  if (type === GradeComponentType.US_PRACTICE) return ReportComponentSlot.US_PRACTICE
  return ReportComponentSlot.NONE
}

function defaultIncludeInFinalBySlot(
  slot: ReportComponentSlot | null | undefined,
  slotCode?: string | null,
): boolean {
  const normalized = normalizeReportSlotCode(slotCode || slot)
  return isFormativeAliasCode(normalized) || isMidtermAliasCode(normalized) || isFinalAliasCode(normalized)
}

function clampScore(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function readUsSlotScore(
  slotScores: Record<string, number | null>,
  candidates: string[],
): number | null {
  for (const candidate of candidates) {
    const slotCode = normalizeReportSlotCode(candidate)
    const raw = slotScores[slotCode]
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      return clampScore(parsed)
    }
  }
  return null
}

function computeUsScoreFromSlotScores(slotScores: Record<string, number | null>): number | null {
  const theoryScore = readUsSlotScore(slotScores, ['US_THEORY', 'US_TEORI'])
  const practiceScore = readUsSlotScore(slotScores, ['US_PRACTICE', 'US_PRAKTEK'])

  if (theoryScore !== null && practiceScore !== null) {
    return Number((((theoryScore * 0.5) + (practiceScore * 0.5)).toFixed(2)))
  }
  if (theoryScore !== null) return theoryScore
  if (practiceScore !== null) return practiceScore
  return null
}

function hasUsSlotInScoreMap(rawSlotScores: unknown): boolean {
  const slotScores = parseSlotScoreMap(rawSlotScores)
  const usTheory = slotScores[normalizeReportSlotCode('US_THEORY')]
  const usTeori = slotScores[normalizeReportSlotCode('US_TEORI')]
  const usPractice = slotScores[normalizeReportSlotCode('US_PRACTICE')]
  const usPraktek = slotScores[normalizeReportSlotCode('US_PRAKTEK')]

  return (
    usTheory !== null && usTheory !== undefined
  ) || (
    usTeori !== null && usTeori !== undefined
  ) || (
    usPractice !== null && usPractice !== undefined
  ) || (
    usPraktek !== null && usPraktek !== undefined
  )
}

function hasPrimaryFinalSlotInScoreMap(rawSlotScores: unknown): boolean {
  const slotScores = parseSlotScoreMap(rawSlotScores)
  return Object.entries(slotScores).some(([slotCode, score]) => {
    if (score === null || score === undefined) return false
    const normalizedSlotCode = normalizeReportSlotCode(slotCode)
    if (!normalizedSlotCode || normalizedSlotCode === DEFAULT_REPORT_SLOT_CODE) return false
    if (normalizedSlotCode.endsWith('_REF')) return false
    return isFinalAliasCode(normalizedSlotCode)
  })
}

function hasPersistedFinalReportEvidence(
  grade: { sasScore?: number | null; satScore?: number | null; slotScores?: unknown } | null | undefined,
): boolean {
  if (!grade) return false
  if (hasPrimaryFinalSlotInScoreMap(grade.slotScores)) return true
  if (grade.sasScore !== null && grade.sasScore !== undefined && Number.isFinite(Number(grade.sasScore))) {
    return true
  }
  if (grade.satScore !== null && grade.satScore !== undefined && Number.isFinite(Number(grade.satScore))) {
    return true
  }
  return false
}

function hasAnyNumericSlotScore(slotScores: Record<string, number | null>): boolean {
  return Object.values(slotScores).some((score) => score !== null && score !== undefined)
}

function readSlotScoreByMatcher(
  slotScores: Record<string, number | null>,
  matcher: (slotCode: string) => boolean,
): number | null {
  for (const [rawSlotCode, rawScore] of Object.entries(slotScores)) {
    const score = normalizeNullableScore(rawScore)
    if (score === null) continue
    const normalizedSlotCode = normalizeReportSlotCode(rawSlotCode)
    if (!normalizedSlotCode || normalizedSlotCode === DEFAULT_REPORT_SLOT_CODE) continue
    if (normalizedSlotCode.endsWith('_REF')) continue
    if (matcher(normalizedSlotCode)) return score
  }
  return null
}

function resolvePreferredFinalComponentScore(
  grade: {
    semester?: Semester | null
    sasScore?: number | null
    satScore?: number | null
    slotScores?: unknown
  } | null | undefined,
): { slotCode: 'SAS' | 'SAT'; score: number | null } {
  const slotScores = parseSlotScoreMap(grade?.slotScores)
  const satScore =
    readSlotScoreByMatcher(slotScores, isFinalEvenAliasCode) ??
    normalizeNullableScore(grade?.satScore)
  const sasScore =
    readSlotScoreByMatcher(slotScores, isFinalOddAliasCode) ??
    normalizeNullableScore(grade?.sasScore)

  if (grade?.semester === Semester.EVEN) {
    return { slotCode: 'SAT', score: satScore ?? sasScore }
  }
  if (grade?.semester === Semester.ODD) {
    return { slotCode: 'SAS', score: sasScore ?? satScore }
  }
  if (satScore !== null) {
    return { slotCode: 'SAT', score: satScore }
  }
  return { slotCode: 'SAS', score: sasScore }
}

function resolveEffectiveReportFinalScore(
  grade: {
    semester?: Semester | null
    formatifScore?: number | null
    sbtsScore?: number | null
    usScore?: number | null
    finalScore?: number | null
    sasScore?: number | null
    satScore?: number | null
    slotScores?: unknown
  } | null | undefined,
): number | null {
  if (!grade) return null
  const slotScores = parseSlotScoreMap(grade.slotScores)
  const hasUsSlot = hasUsSlotInScoreMap(slotScores)
  const finalScore = normalizeNullableScore(grade.finalScore)
  const usScore = normalizeNullableScore(grade.usScore)
  const hasUsScore = usScore !== null
  const hasUsEvidence = hasUsSlot || hasUsScore

  if (hasUsScore && hasUsEvidence) {
    return normalizeRoundedFinalScore(usScore) ?? usScore
  }

  const formativeScore =
    (() => {
      const referenceSlotCode = normalizeReportSlotCode(
        buildFormativeReferenceSlotCode('FORMATIF', 'FINAL'),
      )
      if (
        referenceSlotCode &&
        Object.prototype.hasOwnProperty.call(slotScores, referenceSlotCode)
      ) {
        return slotScores[referenceSlotCode] ?? null
      }
      return null
    })() ??
    readSlotScoreByMatcher(slotScores, isFormativeAliasCode) ??
    normalizeNullableScore(grade.formatifScore)
  const midtermScore =
    readSlotScoreByMatcher(slotScores, isMidtermAliasCode) ??
    normalizeNullableScore(grade.sbtsScore)
  const finalComponent = resolvePreferredFinalComponentScore(grade)
  const hasAnyFinalComputationEvidence =
    formativeScore !== null ||
    midtermScore !== null ||
    finalComponent.score !== null

  if (hasAnyFinalComputationEvidence) {
    const recomputedScore = computeFixedWeightedAverage([
      { code: 'FORMATIF', score: formativeScore },
      { code: 'SBTS', score: midtermScore },
      { code: finalComponent.slotCode, score: finalComponent.score },
    ])
    if (recomputedScore !== null) {
      return normalizeRoundedFinalScore(recomputedScore) ?? recomputedScore
    }
  }
  if (finalScore !== null) {
    return normalizeRoundedFinalScore(finalScore) ?? finalScore
  }
  return null
}

function defaultGradeEntryModeByCode(code: string): GradeEntryMode {
  return isFormativeAliasCode(code) ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE
}

function normalizeGradeEntryModeCode(raw: unknown): GradeEntryMode | null {
  const normalized = normalizeComponentCode(raw)
  if (normalized === 'NF_SERIES') return GradeEntryMode.NF_SERIES
  if (normalized === 'SINGLE_SCORE') return GradeEntryMode.SINGLE_SCORE
  return null
}

async function resolveGradeEntryModeFromMasterConfig(params: {
  academicYearId: number
  componentCode?: string | null
  componentType: GradeComponentType
}): Promise<GradeEntryMode> {
  const normalizedCode = normalizeComponentCode(params.componentCode || defaultComponentCodeByType(params.componentType))
  const fallback = defaultGradeEntryModeByCode(normalizedCode)
  if (!normalizedCode) return fallback

  try {
    const config = await (prisma.examGradeComponent as any).findFirst({
      where: {
        academicYearId: Number(params.academicYearId),
        code: normalizedCode,
      },
      select: {
        entryMode: true,
        entryModeCode: true,
      },
    })
    const resolved =
      normalizeGradeEntryModeCode(config?.entryModeCode) ||
      normalizeGradeEntryModeCode(config?.entryMode)
    return resolved || fallback
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      return fallback
    }
    throw error
  }
}

function defaultComponentCodeByType(type: GradeComponentType): string {
  if (type === GradeComponentType.FORMATIVE) return 'FORMATIVE'
  if (type === GradeComponentType.MIDTERM) return 'MIDTERM'
  if (type === GradeComponentType.FINAL) return 'FINAL'
  if (type === GradeComponentType.SKILL) return 'SKILL'
  if (type === GradeComponentType.US_PRACTICE) return 'US_PRACTICE'
  if (type === GradeComponentType.US_THEORY) return 'US_THEORY'
  return 'CUSTOM'
}

async function resolveAcademicYearIdForGradeComponents(rawAcademicYearId: unknown): Promise<number | null> {
  const explicitId = Number(rawAcademicYearId)
  if (Number.isFinite(explicitId) && explicitId > 0) {
    const exists = await prisma.academicYear.findUnique({
      where: { id: explicitId },
      select: { id: true },
    })
    if (!exists) {
      throw new ApiError(404, 'Tahun ajaran tidak ditemukan.')
    }
    return explicitId
  }

  const active = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { id: 'desc' },
    select: { id: true },
  })

  return active?.id ?? null
}

async function syncSubjectGradeComponentsFromExamMaster(subjectId: number, academicYearId: number) {
  const [masterComponents, existingComponents] = await Promise.all([
    prisma.examGradeComponent.findMany({
      where: {
        academicYearId,
        isActive: true,
      },
      select: {
        code: true,
        label: true,
        type: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.gradeComponent.findMany({
      where: {
        subjectId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        weight: true,
        type: true,
        isActive: true,
      },
      orderBy: { id: 'desc' },
    }),
  ])

  const existingByCode = new Map<string, (typeof existingComponents)[number]>()
  existingComponents.forEach((component) => {
    const code = normalizeComponentCode(component.code || defaultComponentCodeByType(component.type))
    if (!code) return
    if (!existingByCode.has(code)) {
      existingByCode.set(code, component)
    }
  })

  for (const master of masterComponents) {
    const normalizedCode = normalizeComponentCode(master.code)
    if (!normalizedCode) continue

    const existing = existingByCode.get(normalizedCode)
    if (existing) {
      const nextName = String(master.label || '').trim() || normalizedCode.replace(/_/g, ' ')
      const nextWeight =
        resolveDefaultGradeWeightByCode(normalizedCode || master.type) || Number(existing.weight || 0)
      const shouldUpdate =
        String(existing.code || '') !== normalizedCode ||
        String(existing.name || '').trim() !== nextName ||
        Number(existing.weight || 0) !== nextWeight ||
        existing.type !== master.type ||
        existing.isActive !== true

      if (shouldUpdate) {
        await (prisma.gradeComponent as any).update({
          where: { id: existing.id },
          data: {
            code: normalizedCode,
            name: nextName,
            weight: nextWeight,
            type: master.type,
            typeCode: normalizeComponentCode(master.type || normalizedCode) || normalizedCode,
            isActive: true,
          },
        })
      }
      continue
    }

    await (prisma.gradeComponent as any).create({
      data: {
        subjectId,
        code: normalizedCode,
        name: String(master.label || '').trim() || normalizedCode.replace(/_/g, ' '),
        type: master.type,
        typeCode: normalizeComponentCode(master.type || normalizedCode) || normalizedCode,
        weight: resolveDefaultGradeWeightByCode(normalizedCode || master.type) || 1,
        isActive: true,
      },
    })
  }
}

async function resolveValidatedGradeComponentContext(params: {
  gradeComponentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  user?: AuthUserLike | null
  studentId?: number | null
  classId?: number | null
}): Promise<{
  id: number
  code: string
  type: GradeComponentType
  entryMode: GradeEntryMode
}> {
  await syncSubjectGradeComponentsFromExamMaster(
    Number(params.subjectId),
    Number(params.academicYearId),
  )

  const component = await prisma.gradeComponent.findUnique({
    where: { id: Number(params.gradeComponentId) },
    select: {
      id: true,
      subjectId: true,
      code: true,
      type: true,
      typeCode: true,
      isActive: true,
    },
  })

  if (!component || !component.isActive || Number(component.subjectId) !== Number(params.subjectId)) {
    throw new ApiError(400, 'Komponen nilai tidak valid untuk mapel ini.')
  }

  const normalizedCode = normalizeComponentCode(
    component.code || component.typeCode || defaultComponentCodeByType(component.type),
  )
  if (!normalizedCode) {
    throw new ApiError(400, 'Komponen nilai tidak memiliki kode yang valid.')
  }

  const master = await (prisma.examGradeComponent as any).findFirst({
    where: {
      academicYearId: Number(params.academicYearId),
      isActive: true,
      code: normalizedCode,
    },
    select: {
      code: true,
      label: true,
      type: true,
      entryMode: true,
      entryModeCode: true,
    },
  }) as {
    code: string
    label?: string | null
    type: GradeComponentType
    entryMode?: GradeEntryMode | null
    entryModeCode?: string | null
  } | null

  if (!master) {
    throw new ApiError(
      400,
      'Komponen nilai ini sudah tidak berlaku pada konfigurasi aktif. Muat ulang halaman lalu pilih komponen yang tersedia.',
    )
  }

  let resolvedClassId = Number(params.classId || 0)
  if (!resolvedClassId && params.studentId) {
    resolvedClassId =
      Number(await resolveStudentClassId(Number(params.studentId), Number(params.academicYearId))) || 0
  }

  let classLevelToken = ''
  if (resolvedClassId > 0) {
    const classRow = await prisma.class.findUnique({
      where: { id: resolvedClassId },
      select: { level: true },
    })
    classLevelToken = normalizeClassLevelTokenForScope(classRow?.level)
  }

  const teacherId = Number(params.user?.id || 0)
  const scopedPrograms = await prisma.examProgramConfig.findMany({
    where: {
      academicYearId: Number(params.academicYearId),
      isActive: true,
      gradeComponentCode: normalizedCode,
      OR: [{ fixedSemester: params.semester }, { fixedSemester: null }],
    },
    select: {
      allowedSubjectIds: true,
      targetClassLevels: true,
      allowedAuthorIds: true,
    },
  })

  if (scopedPrograms.length > 0) {
    const isAllowed = scopedPrograms.some((row) => {
      const allowedBySubject =
        !Array.isArray(row.allowedSubjectIds) ||
        row.allowedSubjectIds.length === 0 ||
        row.allowedSubjectIds.some((allowedSubjectId) => Number(allowedSubjectId) === Number(params.subjectId))
      if (!allowedBySubject) return false

      const normalizedTargetLevels = (Array.isArray(row.targetClassLevels) ? row.targetClassLevels : [])
        .map((item) => normalizeClassLevelTokenForScope(item))
        .filter((item): item is string => Boolean(item))
      if (normalizedTargetLevels.length > 0) {
        if (!classLevelToken) return false
        if (!normalizedTargetLevels.includes(classLevelToken)) return false
      }

      if (isTeacherUser(params.user)) {
        const normalizedAllowedAuthors = (Array.isArray(row.allowedAuthorIds) ? row.allowedAuthorIds : [])
          .map((authorId) => Number(authorId))
          .filter((authorId) => Number.isFinite(authorId) && authorId > 0)
        if (normalizedAllowedAuthors.length > 0 && !normalizedAllowedAuthors.includes(teacherId)) {
          return false
        }
      }

      return true
    })

    if (!isAllowed) {
      const componentLabel = String(master.label || normalizedCode).trim() || normalizedCode
      throw new ApiError(
        400,
        `Komponen ${componentLabel} tidak berlaku untuk konteks kelas/mapel/semester ini.`,
      )
    }
  }

  return {
    id: Number(component.id),
    code: normalizedCode,
    type: component.type,
    entryMode:
      normalizeGradeEntryModeCode(master.entryModeCode || master.entryMode) ||
      defaultGradeEntryModeByCode(normalizedCode),
  }
}

function calculateAverage(values: number[]): number | null {
  if (!Array.isArray(values) || values.length === 0) return null
  const sum = values.reduce((acc, value) => acc + value, 0)
  return sum / values.length
}

function parseOptionalScoreValue(raw: unknown, fieldName: string): number | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, `${fieldName} harus berupa angka.`)
  }
  if (parsed < 0 || parsed > 100) {
    throw new ApiError(400, `${fieldName} harus di antara 0 sampai 100.`)
  }
  return parsed
}

function normalizeFormativeSeries(raw: unknown): { provided: boolean; values: number[] } {
  if (raw === undefined) return { provided: false, values: [] }
  if (raw === null) return { provided: true, values: [] }
  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'formative_series harus berupa array angka.')
  }
  const values = raw.map((item, index) => {
    const parsed = Number(item)
    if (!Number.isFinite(parsed)) {
      throw new ApiError(400, `formative_series[${index}] harus berupa angka.`)
    }
    if (parsed < 0 || parsed > 100) {
      throw new ApiError(400, `formative_series[${index}] harus di antara 0 sampai 100.`)
    }
    return parsed
  })
  return { provided: true, values }
}

function normalizeLegacySeriesValues(rawValues: unknown[]): number[] {
  return rawValues
    .filter((item) => item !== null && item !== undefined && item !== '')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function areScoresApproximatelyEqual(left: number | null, right: number | null, tolerance = 0.01): boolean {
  if (left === null || right === null) return false
  return Math.abs(left - right) <= tolerance
}

function sanitizeLegacyFormativeSeries(rawValues: unknown[], _storedScore?: unknown): number[] {
  const values = normalizeLegacySeriesValues(rawValues)
  if (values.length === 0) return []
  if (values.every((value) => value === 0)) return []

  const trimmedTrailingPadding = (() => {
    let lastNonZeroIndex = -1
    values.forEach((value, index) => {
      if (value !== 0) lastNonZeroIndex = index
    })
    if (lastNonZeroIndex < 0) return []
    return values.slice(0, lastNonZeroIndex + 1)
  })()

  if (trimmedTrailingPadding.length > 0 && trimmedTrailingPadding.length < values.length) {
    return trimmedTrailingPadding
  }

  return values
}

function buildFormativeReferenceSlotCode(formativeSlotCode: string, stage: 'MIDTERM' | 'FINAL'): string {
  const normalized = normalizeReportSlotCode(formativeSlotCode)
  const suffix = stage === 'MIDTERM' ? 'SBTS_REF' : 'FINAL_REF'
  return normalized ? `${normalized}_${suffix}` : suffix
}

function normalizeFormativeSeriesForPersistence(params: {
  isFormativeComponent: boolean
  normalizedSeries: { provided: boolean; values: number[] }
  parsedScore: number | null | undefined
}): { seriesValues: number[]; provided: boolean } {
  if (!params.isFormativeComponent) {
    return {
      seriesValues: params.normalizedSeries.values,
      provided: params.normalizedSeries.provided,
    }
  }

  if (params.normalizedSeries.provided) {
    return {
      seriesValues: params.normalizedSeries.values,
      provided: true,
    }
  }

  if (params.parsedScore !== null && params.parsedScore !== undefined) {
    return {
      seriesValues: [params.parsedScore],
      provided: true,
    }
  }

  return {
    seriesValues: [],
    provided: false,
  }
}

function buildStudentGradeCompositeKey(row: {
  studentId: unknown
  subjectId: unknown
  academicYearId: unknown
  componentId: unknown
  semester: unknown
}): string {
  const studentId = Number(row.studentId)
  const subjectId = Number(row.subjectId)
  const academicYearId = Number(row.academicYearId)
  const componentId = Number(row.componentId)
  const semester = String(row.semester || '')
  if (
    !Number.isFinite(studentId) ||
    !Number.isFinite(subjectId) ||
    !Number.isFinite(academicYearId) ||
    !Number.isFinite(componentId) ||
    !semester
  ) {
    return ''
  }
  return `${studentId}:${subjectId}:${academicYearId}:${componentId}:${semester}`
}

const FORMATIVE_SLOT_COUNT_SOURCE_PREFIX = 'formativeSlotCount:'

function normalizeFormativeSlotCount(raw: unknown, fallback = 0): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Math.max(0, Math.floor(Number(fallback) || 0))
  }
  return Math.max(0, Math.floor(parsed))
}

function buildFormativeSlotCountSourceKey(row: {
  studentId: unknown
  subjectId: unknown
  academicYearId: unknown
  componentId: unknown
  semester: unknown
}): string {
  const compositeKey = buildStudentGradeCompositeKey(row)
  return compositeKey ? `${FORMATIVE_SLOT_COUNT_SOURCE_PREFIX}${compositeKey}` : ''
}

function parseFormativeSlotCountMetadata(
  metadata: unknown,
): { componentId: number; slotCount: number } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const componentId = Number((metadata as Record<string, unknown>).componentId)
  const slotCount = normalizeFormativeSlotCount((metadata as Record<string, unknown>).slotCount)
  if (!Number.isFinite(componentId) || componentId <= 0) return null
  return {
    componentId,
    slotCount,
  }
}

async function syncFormativeSlotCountMetadata(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  componentId: number
  semester: Semester
  slotCount: number
  componentCode?: string | null
  componentType?: GradeComponentType | null
  componentTypeCode?: string | null
}) {
  const delegate = getStudentScoreEntryWriteDelegate()
  if (!delegate) return

  const sourceKey = buildFormativeSlotCountSourceKey({
    studentId: params.studentId,
    subjectId: params.subjectId,
    academicYearId: params.academicYearId,
    componentId: params.componentId,
    semester: params.semester,
  })
  if (!sourceKey) return

  const normalizedSlotCount = normalizeFormativeSlotCount(params.slotCount)
  if (normalizedSlotCount <= 0) {
    await delegate.deleteMany({
      where: {
        sourceKey,
      },
    })
    return
  }

  const normalizedComponentCode =
    normalizeComponentCode(params.componentCode) ||
    normalizeComponentCode(params.componentTypeCode) ||
    'FORMATIF'

  await delegate.upsert({
    where: { sourceKey },
    update: {
      score: 0,
      rawScore: 0,
      maxScore: 0,
      componentCode: normalizedComponentCode,
      componentType: params.componentType || GradeComponentType.FORMATIVE,
      componentTypeCode: params.componentTypeCode || normalizedComponentCode,
      reportSlot: ReportComponentSlot.NONE,
      reportSlotCode: DEFAULT_REPORT_SLOT_CODE,
      metadata: {
        source: 'student_grade',
        kind: 'FORMATIVE_SLOT_COUNT',
        componentId: params.componentId,
        slotCount: normalizedSlotCount,
      },
    },
    create: {
      studentId: params.studentId,
      subjectId: params.subjectId,
      academicYearId: params.academicYearId,
      semester: params.semester,
      componentCode: normalizedComponentCode,
      componentType: params.componentType || GradeComponentType.FORMATIVE,
      componentTypeCode: params.componentTypeCode || normalizedComponentCode,
      reportSlot: ReportComponentSlot.NONE,
      reportSlotCode: DEFAULT_REPORT_SLOT_CODE,
      score: 0,
      rawScore: 0,
      maxScore: 0,
      sourceType: 'MANUAL_GRADE',
      sourceKey,
      metadata: {
        source: 'student_grade',
        kind: 'FORMATIVE_SLOT_COUNT',
        componentId: params.componentId,
        slotCount: normalizedSlotCount,
      },
    },
  })
}

async function cleanupStudentGradeDuplicates(gradeIds: number[]) {
  const uniqueIds = Array.from(
    new Set(gradeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
  )
  if (uniqueIds.length === 0) return
  for (const gradeId of uniqueIds) {
    await deleteStudentGradeScoreEntriesByPrefix(gradeId)
  }
  await prisma.studentGrade.deleteMany({
    where: {
      id: {
        in: uniqueIds,
      },
    },
  })
}

async function getExamComponentRuleMap(academicYearId: number): Promise<Map<string, ExamComponentRule>> {
  try {
    const rows = (await (prisma.examGradeComponent as any).findMany({
      where: {
        academicYearId,
        isActive: true,
      },
      select: {
        code: true,
        type: true,
        reportSlot: true,
        reportSlotCode: true,
        includeInFinalScore: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    })) as Array<{
      code: string
      type: GradeComponentType
      reportSlot: ReportComponentSlot
      reportSlotCode?: string | null
      includeInFinalScore: boolean
    }>

    return new Map(
      rows.map((row) => {
        const code = normalizeComponentCode(row.code)
        const reportSlotCode = normalizeReportSlotCode(
          row.reportSlotCode || row.reportSlot || defaultReportSlotByType(GradeComponentType.CUSTOM),
        )
        return [
          code,
          {
            code,
            componentType: row.type,
            reportSlot: row.reportSlot,
            reportSlotCode,
            includeInFinalScore: row.includeInFinalScore,
          },
        ] as const
      }),
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      const fallbackRows = await prisma.examGradeComponent.findMany({
        where: {
          academicYearId,
          isActive: true,
        },
        select: {
          code: true,
          type: true,
          reportSlot: true,
          includeInFinalScore: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      })

      return new Map(
        fallbackRows.map((row) => {
          const code = normalizeComponentCode(row.code)
          return [
            code,
            {
              code,
              componentType: row.type,
              reportSlot: row.reportSlot,
              reportSlotCode: normalizeReportSlotCode(row.reportSlot),
              includeInFinalScore: row.includeInFinalScore,
            },
          ] as const
        }),
      )
    }
    throw error
  }
}

function computeDynamicReportFromGrades(
  grades: Array<{ score: number; component: { type: GradeComponentType; code?: string | null; weight?: number | null } }>,
  componentRuleMap: Map<string, ExamComponentRule>,
) {
  const slotBuckets = new Map<string, number[]>()
  const includeSlots = new Set<string>()
  const weightedComponentRows: Array<{ code?: unknown; score: number | null | undefined }> = []

  grades.forEach((grade) => {
    const normalizedCode = normalizeComponentCode(grade.component?.code)
    const configuredRule = normalizedCode ? componentRuleMap.get(normalizedCode) : undefined
    const reportSlot = configuredRule?.reportSlot || defaultReportSlotByType(grade.component.type)
    const reportSlotCode = normalizeReportSlotCode(configuredRule?.reportSlotCode || reportSlot)
    const includeInFinal =
      configuredRule?.includeInFinalScore ??
      defaultIncludeInFinalBySlot(reportSlot, reportSlotCode)

    if (reportSlotCode !== DEFAULT_REPORT_SLOT_CODE) {
      const bucket = slotBuckets.get(reportSlotCode) || []
      bucket.push(grade.score)
      slotBuckets.set(reportSlotCode, bucket)
    }
    if (includeInFinal && reportSlotCode !== DEFAULT_REPORT_SLOT_CODE) {
      includeSlots.add(reportSlotCode)
    }
    weightedComponentRows.push({
      code: normalizedCode || grade.component?.type,
      score: grade.score,
    })
  })

  const slotScoresByCode: Record<string, number | null> = {}
  slotBuckets.forEach((values, slotCode) => {
    slotScoresByCode[slotCode] = calculateAverage(values)
  })
  const legacySlotScores = buildLegacySlotScoreMap(slotScoresByCode)

  let finalScore = 0
  const weightedIncludedScore = computeNormalizedWeightedAverage(
    Array.from(includeSlots).map((slot) => ({
      code: slot,
      score: slotScoresByCode[slot],
    })),
  )
  if (weightedIncludedScore !== null) {
    finalScore = weightedIncludedScore
  } else {
    const weightedComponentScore = computeNormalizedWeightedAverage(weightedComponentRows)
    if (weightedComponentScore !== null) {
      finalScore = weightedComponentScore
    }
  }

  finalScore = normalizeRoundedFinalScore(finalScore) ?? finalScore

  return {
    slotScoresByCode,
    legacySlotScores,
    finalScore,
  }
}

function buildLegacySlotScoreMap(slotScoresByCode: Record<string, number | null>): Record<string, number | null> {
  const firstMatch = (...candidates: string[]) => {
    for (const candidate of candidates) {
      const normalized = normalizeReportSlotCode(candidate)
      if (!normalized || normalized === DEFAULT_REPORT_SLOT_CODE) continue
      if (Object.prototype.hasOwnProperty.call(slotScoresByCode, normalized)) {
        const value = slotScoresByCode[normalized]
        return value === undefined ? null : value
      }
    }
    return null
  }

  const formativeValue =
    firstMatch(
      ...Object.keys(slotScoresByCode).filter((slot) => isFormativeAliasCode(slot)),
      'FORMATIF',
      'FORMATIVE',
    ) ?? null
  const midtermValue =
    firstMatch(
      ...Object.keys(slotScoresByCode).filter((slot) => isMidtermAliasCode(slot)),
      'SBTS',
      'MIDTERM',
      'PTS',
      'UTS',
    ) ?? null
  const sasValue =
    firstMatch(
      ...Object.keys(slotScoresByCode).filter((slot) => isFinalAliasCode(slot) && normalizeReportSlotCode(slot) !== 'SAT'),
      'SAS',
      'FINAL_ODD',
      'PAS',
      'PSAS',
      'FINAL',
    ) ?? null
  const satValue =
    firstMatch(
      ...Object.keys(slotScoresByCode).filter((slot) => normalizeReportSlotCode(slot) === 'SAT' || normalizeReportSlotCode(slot) === 'FINAL_EVEN'),
      'SAT',
      'FINAL_EVEN',
      'PAT',
      'PSAT',
    ) ?? null

  return {
    ...slotScoresByCode,
    FORMATIF: slotScoresByCode.FORMATIF ?? formativeValue,
    SBTS: slotScoresByCode.SBTS ?? midtermValue,
    SAS: slotScoresByCode.SAS ?? sasValue,
    SAT: slotScoresByCode.SAT ?? satValue,
    US_THEORY: slotScoresByCode.US_THEORY ?? firstMatch('US_THEORY', 'US_TEORI'),
    US_PRACTICE: slotScoresByCode.US_PRACTICE ?? firstMatch('US_PRACTICE', 'US_PRAKTEK'),
  }
}

function parseSlotScoreMap(raw: unknown): Record<string, number | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, number | null> = {}
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const slotCode = normalizeReportSlotCode(key)
    if (!slotCode || slotCode === DEFAULT_REPORT_SLOT_CODE) return
    if (value === null || value === undefined || value === '') {
      result[slotCode] = null
      return
    }
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return
    result[slotCode] = numericValue
  })
  return result
}

function resolveSemesterRange(
  academicYear: {
    semester1Start: Date
    semester1End: Date
    semester2Start: Date
    semester2End: Date
  },
  semester: Semester,
): SemesterRange {
  if (semester === Semester.ODD) {
    return {
      start: academicYear.semester1Start,
      end: academicYear.semester1End,
    }
  }

  return {
    start: academicYear.semester2Start,
    end: academicYear.semester2End,
  }
}

function resolveCurrentSemesterFromAcademicYear(academicYear: {
  semester1Start: Date
  semester1End: Date
  semester2Start: Date
  semester2End: Date
}): Semester {
  const now = new Date()
  if (now >= academicYear.semester2Start && now <= academicYear.semester2End) {
    return Semester.EVEN
  }
  if (now > academicYear.semester1End && now < academicYear.semester2Start) {
    return Semester.EVEN
  }
  return Semester.ODD
}

function formatSemesterDisplayLabel(semester: Semester): string {
  return semester === Semester.EVEN ? 'Genap' : 'Ganjil'
}

function buildLocalDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveStudentSemesterReportRelease(params: {
  reportDate?: { date?: Date | null } | null
  now?: Date
}): StudentSemesterReportReleaseState {
  const reportDateValue = params.reportDate?.date ? new Date(params.reportDate.date) : null
  if (!reportDateValue || Number.isNaN(reportDateValue.getTime())) {
    return {
      code: 'NOT_SCHEDULED',
      label: 'Belum dirilis',
      tone: 'red',
      description: 'Tanggal rapor semester belum diatur, jadi detail rapor belum bisa dibuka.',
      canViewDetails: false,
      source: 'REPORT_DATE',
      effectiveDate: null,
    }
  }

  const now = params.now ? new Date(params.now) : new Date()
  const todayKey = buildLocalDateKey(now)
  const reportDateKey = buildLocalDateKey(reportDateValue)

  if (todayKey < reportDateKey) {
    return {
      code: 'SCHEDULED',
      label: 'Menunggu rilis',
      tone: 'amber',
      description: 'Rapor semester sudah dijadwalkan, tetapi belum memasuki tanggal rilis.',
      canViewDetails: false,
      source: 'REPORT_DATE',
      effectiveDate: reportDateValue,
    }
  }

  return {
    code: 'OPEN',
    label: 'Sudah dirilis',
    tone: 'green',
    description: 'Rapor semester sudah dirilis dan detail nilainya bisa dilihat.',
    canViewDetails: true,
    source: 'REPORT_DATE',
    effectiveDate: reportDateValue,
  }
}

function applyHomeroomProgramResultReleaseGate(params: {
  release: StudentProgramResultReleaseState
  blockedByHomeroom: boolean
}): StudentProgramResultReleaseState {
  if (!params.blockedByHomeroom) {
    return params.release
  }

  return {
    ...params.release,
    code: 'HOMEROOM_BLOCKED',
    label: 'Ditahan wali kelas',
    tone: 'red',
    description: 'Wali kelas belum membuka hasil nilai program ini ke akun siswa.',
    canViewDetails: false,
    source: 'HOMEROOM',
  }
}

function applyHomeroomSemesterReportReleaseGate(params: {
  release: StudentSemesterReportReleaseState
  blockedByHomeroom: boolean
}): StudentSemesterReportReleaseState {
  if (!params.blockedByHomeroom) {
    return params.release
  }

  return {
    ...params.release,
    code: 'HOMEROOM_BLOCKED',
    label: 'Ditahan wali kelas',
    tone: 'red',
    description: 'Wali kelas belum membuka hasil rapor semester ini ke akun siswa.',
    canViewDetails: false,
    source: 'HOMEROOM',
  }
}

function resolveHomeroomPublicationModeLabel(mode: HomeroomResultPublicationMode): string {
  return mode === 'BLOCKED' ? 'Ditahan wali kelas' : 'Mengikuti Wakakur'
}

function resolveHomeroomPublicationModeDescription(mode: HomeroomResultPublicationMode): string {
  if (mode === 'BLOCKED') {
    return 'Wali kelas menahan publikasi nilai siswa ini sampai dibuka kembali.'
  }
  return 'Publikasi nilai mengikuti jadwal rilis Wakakur untuk program ini.'
}

function resolveHomeroomPublicationEffectiveVisibility(params: {
  globalRelease: StudentProgramResultReleaseState
  publicationMode: HomeroomResultPublicationMode
}): HomeroomPublicationEffectiveVisibility {
  if (params.publicationMode === 'BLOCKED') {
    return {
      canViewDetails: false,
      label: 'Ditahan wali kelas',
      tone: 'red',
      description: 'Nilai siswa ini belum tampil karena wali kelas menahan publikasinya.',
    }
  }

  if (params.globalRelease.canViewDetails) {
    return {
      canViewDetails: true,
      label: 'Tampil ke siswa',
      tone: 'green',
      description: 'Nilai program ini sudah bisa dilihat siswa.',
    }
  }

  if (params.globalRelease.code === 'SCHEDULED') {
    return {
      canViewDetails: false,
      label: 'Menunggu Wakakur',
      tone: 'amber',
      description: 'Nilai akan tampil mengikuti jadwal rilis Wakakur yang sudah diatur.',
    }
  }

  return {
    canViewDetails: false,
    label: 'Belum bisa tampil',
    tone: 'red',
    description: 'Nilai belum bisa tampil karena jadwal rilis Wakakur untuk program ini belum siap.',
  }
}

async function resolveActiveAcademicYearForHomeroomPublication() {
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
  })

  if (!activeYear) {
    throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan.')
  }

  return activeYear
}

async function resolveHomeroomPublicationAccess(params: {
  user: AuthUserLike | null | undefined
  classId: number
}) {
  const userId = Number(params.user?.id || 0)
  if (String(params.user?.role || '').toUpperCase() !== 'TEACHER' || !Number.isFinite(userId) || userId <= 0) {
    throw new ApiError(403, 'Fitur ini hanya tersedia untuk wali kelas.')
  }

  const activeYear = await resolveActiveAcademicYearForHomeroomPublication()
  const homeroomClass = await prisma.class.findFirst({
    where: {
      id: params.classId,
      academicYearId: activeYear.id,
      teacherId: userId,
    },
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
      teacher: {
        select: {
          id: true,
          name: true,
          preferences: true,
        },
      },
    },
  })

  if (!homeroomClass) {
    throw new ApiError(403, 'Anda tidak terdaftar sebagai wali kelas aktif untuk kelas ini.')
  }

  return {
    activeYear,
    homeroomClass,
    userId,
  }
}

function resolveStudentPublicationCodeForProgram(params: {
  program: {
    code: string
    baseType: ExamType
    baseTypeCode?: string | null
    gradeComponentCode?: string | null
    fixedSemester?: Semester | null
  }
  componentRuleMap: Map<string, ExamComponentRule>
}): string {
  const normalizedProgramCode = normalizeComponentCode(params.program.code)
  const normalizedComponentCode = normalizeComponentCode(params.program.gradeComponentCode)
  const configuredSlotCode = normalizedComponentCode
    ? params.componentRuleMap.get(normalizedComponentCode)?.reportSlotCode
    : undefined
  const fallbackSlotCode = resolveReportSlotCodeByExamContext(
    params.program.baseTypeCode || params.program.baseType,
    params.program.fixedSemester || null,
  )
  const resolvedSlotCode = normalizeReportSlotCode(configuredSlotCode || fallbackSlotCode || normalizedProgramCode)
  return resolvedSlotCode || normalizedProgramCode
}

function buildExamComponentRuleMapFromRows(
  rows: Array<{
    code: string
    type: GradeComponentType
    typeCode?: string | null
    reportSlot: ReportComponentSlot
    reportSlotCode?: string | null
    includeInFinalScore: boolean
  }>,
): Map<string, ExamComponentRule> {
  const map = new Map<string, ExamComponentRule>()
  rows.forEach((row) => {
    const normalizedCode = normalizeComponentCode(row.code)
    if (!normalizedCode) return
    map.set(normalizedCode, {
      code: normalizedCode,
      componentType: row.type,
      reportSlot: row.reportSlot,
      reportSlotCode: normalizeReportSlotCode(row.reportSlotCode || row.reportSlot || row.code),
      includeInFinalScore: Boolean(row.includeInFinalScore),
    })
  })
  return map
}

function buildStudentProgramReleaseLookup(params: {
  programs: Array<{
    code: string
    baseType: ExamType
    baseTypeCode?: string | null
    gradeComponentCode?: string | null
    fixedSemester?: Semester | null
    studentResultPublishMode?: string | null
    studentResultPublishAt?: Date | null
  }>
  componentRuleMap: Map<string, ExamComponentRule>
  reportDateByKey: Map<string, StudentReleaseReportDateRow>
  activeSemester: Semester
  blockedPublicationCodes?: Set<string>
  now?: Date
}): {
  byProgramCode: Map<string, StudentProgramResultReleaseState>
  bySlotCode: Map<string, StudentProgramResultReleaseState>
} {
  const byProgramCode = new Map<string, StudentProgramResultReleaseState>()
  const bySlotCode = new Map<string, StudentProgramResultReleaseState>()

  params.programs.forEach((program) => {
    const normalizedProgramCode = normalizeComponentCode(program.code)
    if (!normalizedProgramCode) return

    const normalizedComponentCode = normalizeComponentCode(program.gradeComponentCode)
    const configuredSlotCode = normalizedComponentCode
      ? params.componentRuleMap.get(normalizedComponentCode)?.reportSlotCode
      : undefined
    const fallbackSlotCode = resolveReportSlotCodeByExamContext(
      program.baseTypeCode || program.baseType,
      program.fixedSemester || null,
    )
    const resolvedSlotCode = normalizeReportSlotCode(configuredSlotCode || fallbackSlotCode)
    if (!resolvedSlotCode || resolvedSlotCode === DEFAULT_REPORT_SLOT_CODE) return
    const resolvedSemester = program.fixedSemester || params.activeSemester
    const resolvedReportType = resolveExamTypeForStudentRelease(
      program.baseTypeCode || program.baseType,
      resolvedSemester,
      program.baseType,
    )
    const reportDate =
      resolvedReportType
        ? params.reportDateByKey.get(buildStudentReleaseReportDateKey(resolvedSemester, resolvedReportType)) || null
        : null

    const release = applyHomeroomProgramResultReleaseGate({
      release: resolveStudentExamProgramResultRelease({
        mode: program.studentResultPublishMode,
        publishAt: program.studentResultPublishAt || null,
        reportDate,
        programCode: normalizedProgramCode,
        baseTypeCode: program.baseTypeCode || program.baseType,
        now: params.now,
      }),
      blockedByHomeroom:
        Boolean(params.blockedPublicationCodes?.has(resolvedSlotCode)) ||
        Boolean(params.blockedPublicationCodes?.has(normalizedProgramCode)),
    })

    byProgramCode.set(normalizedProgramCode, release)
    if (!bySlotCode.has(resolvedSlotCode) || normalizedProgramCode === resolvedSlotCode) {
      bySlotCode.set(resolvedSlotCode, release)
    }
  })

  return { byProgramCode, bySlotCode }
}

function resolveStudentOverviewComponentRelease(params: {
  component: {
    code: string
    reportSlotCode: string
  }
  releaseByProgramCode: Map<string, StudentProgramResultReleaseState>
  releaseBySlotCode: Map<string, StudentProgramResultReleaseState>
  reportDateByKey: Map<string, StudentReleaseReportDateRow>
  activeSemester: Semester
  blockedPublicationCodes?: Set<string>
  now?: Date
}): StudentProgramResultReleaseState {
  const release =
    params.releaseByProgramCode.get(params.component.reportSlotCode) ||
    params.releaseByProgramCode.get(params.component.code) ||
    params.releaseBySlotCode.get(params.component.reportSlotCode)

  if (release) return release

  const publicationCode = normalizeReportSlotCode(params.component.reportSlotCode || params.component.code)

  return applyHomeroomProgramResultReleaseGate({
    release: resolveStudentExamProgramResultRelease({
      mode: defaultExamStudentResultPublishMode({
        programCode: params.component.reportSlotCode || params.component.code,
      }),
      reportDate: resolveReportDateForStudentRelease(
        params.component.reportSlotCode || params.component.code,
        params.activeSemester,
        params.reportDateByKey,
      ),
      programCode: params.component.reportSlotCode || params.component.code,
      now: params.now,
    }),
    blockedByHomeroom:
      Boolean(params.blockedPublicationCodes?.has(publicationCode)) ||
      Boolean(params.blockedPublicationCodes?.has(normalizeComponentCode(params.component.code))),
  })
}

function resolveExamTypeForStudentRelease(
  rawType: unknown,
  semester: Semester,
  fallback?: ExamType | null,
): ExamType | null {
  const normalizedType = normalizeComponentCode(rawType)
  if (!normalizedType) return fallback || null
  if (isFinalEvenAliasCode(normalizedType)) return ExamType.SAT
  if (isFinalOddAliasCode(normalizedType)) return ExamType.SAS
  if (normalizedType === 'FINAL') {
    return semester === Semester.EVEN ? ExamType.SAT : ExamType.SAS
  }
  if (isMidtermAliasCode(normalizedType)) return ExamType.SBTS
  if (isFormativeAliasCode(normalizedType)) return ExamType.FORMATIF
  if (normalizedType === 'US_THEORY' || normalizedType === 'US_TEORI') return ExamType.US_THEORY
  if (normalizedType === 'US_PRACTICE' || normalizedType === 'US_PRAKTEK') return ExamType.US_PRACTICE
  return fallback || null
}

function buildStudentReleaseReportDateLookup(
  rows: StudentReleaseReportDateRow[],
): Map<string, StudentReleaseReportDateRow> {
  const map = new Map<string, StudentReleaseReportDateRow>()
  rows.forEach((row) => {
    map.set(buildStudentReleaseReportDateKey(row.semester, row.reportType), row)
  })
  return map
}

function resolveReportDateForStudentRelease(
  rawType: unknown,
  semester: Semester,
  reportDateByKey: Map<string, StudentReleaseReportDateRow>,
): StudentReleaseReportDateRow | null {
  const reportType = resolveExamTypeForStudentRelease(rawType, semester)
  if (!reportType) return null
  return reportDateByKey.get(buildStudentReleaseReportDateKey(semester, reportType)) || null
}

function normalizeNullableScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function roundDisplayScore(raw: unknown): number | null {
  const parsed = normalizeNullableScore(raw)
  if (parsed === null) return null
  return normalizeRoundedFinalScore(parsed)
}

function hasOwnSlotScore(
  slotScores: Record<string, number | null>,
  slotCode: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(slotScores, normalizeReportSlotCode(slotCode))
}

function hasMeaningfulReportSnapshot(row: {
  formatifScore?: number | null
  sbtsScore?: number | null
  sasScore?: number | null
  usScore?: number | null
  slotScores?: unknown
  predicate?: string | null
  description?: string | null
} | null | undefined): boolean {
  if (!row) return false
  const slotScores = parseSlotScoreMap(row.slotScores)
  if (Object.keys(slotScores).length > 0) return true
  if (row.formatifScore !== null && row.formatifScore !== undefined) return true
  if (row.sbtsScore !== null && row.sbtsScore !== undefined) return true
  if (row.sasScore !== null && row.sasScore !== undefined) return true
  if (row.usScore !== null && row.usScore !== undefined) return true
  if (String(row.predicate || '').trim()) return true
  if (String(row.description || '').trim()) return true
  return false
}

function buildStudentOverviewComponents(params: {
  components: Array<{
    code: string
    label: string
    type: GradeComponentType
    typeCode: string
    reportSlot: ReportComponentSlot
    reportSlotCode: string
    entryMode: GradeEntryMode
    entryModeCode: string
    includeInFinalScore: boolean
    displayOrder: number
  }>
  semester: Semester
  classLevel: string
  hasUsScores: boolean
  releaseByProgramCode: Map<string, StudentProgramResultReleaseState>
  releaseBySlotCode: Map<string, StudentProgramResultReleaseState>
  reportDateByKey: Map<string, StudentReleaseReportDateRow>
  blockedPublicationCodes?: Set<string>
  now?: Date
}): StudentOverviewComponentRow[] {
  const normalizedLevel = normalizeClassLevelTokenForScope(params.classLevel)

  return params.components
    .map((component) => {
      const reportSlotCode = normalizeReportSlotCode(
        component.reportSlotCode || component.reportSlot || component.code || component.typeCode || component.type,
      )

      return {
        code: normalizeComponentCode(component.code || reportSlotCode || component.typeCode || component.type),
        label: String(component.label || '').trim() || formatSlotDisplayLabel(reportSlotCode, 'Komponen'),
        type: normalizeComponentCode(component.typeCode || component.type || reportSlotCode),
        reportSlotCode,
        entryMode: normalizeComponentCode(component.entryModeCode || component.entryMode || GradeEntryMode.SINGLE_SCORE),
        includeInFinalScore: component.includeInFinalScore,
        displayOrder: Number(component.displayOrder || 0),
        release: resolveStudentOverviewComponentRelease({
          component: {
            code: normalizeComponentCode(component.code || reportSlotCode || component.typeCode || component.type),
            reportSlotCode,
          },
          releaseByProgramCode: params.releaseByProgramCode,
          releaseBySlotCode: params.releaseBySlotCode,
          reportDateByKey: params.reportDateByKey,
          activeSemester: params.semester,
          blockedPublicationCodes: params.blockedPublicationCodes,
          now: params.now,
        }),
      }
    })
    .filter((component) => {
      if (!component.code || component.reportSlotCode === DEFAULT_REPORT_SLOT_CODE) return false
      if (component.reportSlotCode === 'FORMATIF') return true
      if (component.reportSlotCode === 'SBTS') return true
      if (component.reportSlotCode === 'SAS') return params.semester === Semester.ODD
      if (component.reportSlotCode === 'SAT') return params.semester === Semester.EVEN
      if (component.reportSlotCode === 'US_THEORY' || component.reportSlotCode === 'US_PRACTICE') {
        return normalizedLevel === 'XII' || params.hasUsScores
      }
      return false
    })
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.label.localeCompare(b.label, 'id-ID')
    })
}

function defaultReportSlotByExamType(type: string | null | undefined): ReportComponentSlot {
  const normalizedType = normalizeComponentCode(type)
  if (isFormativeAliasCode(normalizedType)) return ReportComponentSlot.FORMATIF
  if (isMidtermAliasCode(normalizedType)) return ReportComponentSlot.SBTS
  if (isFinalAliasCode(normalizedType)) return ReportComponentSlot.SAS
  if (normalizedType === 'US_THEORY' || normalizedType === 'US_TEORI') return ReportComponentSlot.US_THEORY
  if (normalizedType === 'US_PRACTICE' || normalizedType === 'US_PRAKTEK') return ReportComponentSlot.US_PRACTICE
  return ReportComponentSlot.NONE
}

function defaultReportSlotCodeByExamType(type: string | null | undefined): string {
  const normalizedType = normalizeComponentCode(type)
  if (isFinalEvenAliasCode(normalizedType)) {
    return 'SAT'
  }
  if (isFinalOddAliasCode(normalizedType)) {
    return 'SAS'
  }
  if (isMidtermAliasCode(normalizedType)) return 'SBTS'
  if (isFormativeAliasCode(normalizedType)) return 'FORMATIF'
  return normalizeReportSlotCode(defaultReportSlotByExamType(type))
}

function resolveReportSlotCodeByExamContext(
  type: string | null | undefined,
  fixedSemester?: Semester | null,
): string {
  const normalizedType = normalizeComponentCode(type)
  if (!normalizedType) return DEFAULT_REPORT_SLOT_CODE
  if (isFinalEvenAliasCode(normalizedType)) return 'SAT'
  if (isFinalOddAliasCode(normalizedType)) return 'SAS'
  if (normalizedType === 'FINAL') {
    if (fixedSemester === Semester.EVEN) return 'SAT'
    if (fixedSemester === Semester.ODD) return 'SAS'
    return 'SAS'
  }
  return defaultReportSlotCodeByExamType(normalizedType)
}

async function getProgramReportSlotMap(
  academicYearId: number,
  componentRuleMap: Map<string, ExamComponentRule>,
): Promise<Map<string, string>> {
  try {
    const rows = (await (prisma.examProgramConfig as any).findMany({
      where: {
        academicYearId,
        isActive: true,
      },
      select: {
        code: true,
        baseType: true,
        baseTypeCode: true,
        gradeComponentCode: true,
        fixedSemester: true,
      },
    })) as Array<{
      code: string
      baseType: string
      baseTypeCode?: string | null
      gradeComponentCode?: string | null
      fixedSemester?: Semester | null
    }>

    const map = new Map<string, string>()
    rows.forEach((row) => {
      const normalizedProgramCode = normalizeComponentCode(row.code)
      const normalizedComponentCode = normalizeComponentCode(row.gradeComponentCode)
      const configuredSlotCode = normalizedComponentCode
        ? componentRuleMap.get(normalizedComponentCode)?.reportSlotCode
        : undefined
      const fallbackSlotCode = normalizeReportSlotCode(
        resolveReportSlotCodeByExamContext(
          row.baseTypeCode || row.baseType,
          row.fixedSemester || null,
        ),
      )
      if (normalizedProgramCode) {
        map.set(normalizedProgramCode, configuredSlotCode || fallbackSlotCode)
      }
    })

    return map
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      const rows = await prisma.examProgramConfig.findMany({
        where: {
          academicYearId,
          isActive: true,
        },
        select: {
          code: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentCode: true,
          fixedSemester: true,
        },
      })

      const map = new Map<string, string>()
      rows.forEach((row) => {
        const normalizedProgramCode = normalizeComponentCode(row.code)
        const normalizedComponentCode = normalizeComponentCode(row.gradeComponentCode)
        const configuredSlotCode = normalizedComponentCode
          ? componentRuleMap.get(normalizedComponentCode)?.reportSlotCode
          : undefined
        const fallbackSlotCode = resolveReportSlotCodeByExamContext(
          (row as any).baseTypeCode || row.baseType,
          row.fixedSemester || null,
        )
        if (normalizedProgramCode) {
          map.set(normalizedProgramCode, configuredSlotCode || fallbackSlotCode)
        }
      })
      return map
    }
    throw error
  }
}

function resolveIncludedReportSlots(componentRuleMap: Map<string, ExamComponentRule>): Set<string> {
  const includeSlots = new Set<string>()

  componentRuleMap.forEach((rule) => {
    const slotCode = normalizeReportSlotCode(rule.reportSlotCode || rule.reportSlot)
    if (rule.includeInFinalScore && slotCode !== DEFAULT_REPORT_SLOT_CODE) {
      includeSlots.add(slotCode)
    }
  })

  if (includeSlots.size === 0) {
    componentRuleMap.forEach((rule) => {
      const slotCode = normalizeReportSlotCode(rule.reportSlotCode || rule.reportSlot)
      if (slotCode !== DEFAULT_REPORT_SLOT_CODE) {
        includeSlots.add(slotCode)
      }
    })
  }

  return includeSlots
}

function resolvePrimarySlotCodesFromRules(componentRuleMap: Map<string, ExamComponentRule>): {
  formative: string
  midterm: string
  final: string
} {
  const availableSlots: string[] = []
  let formativeByType: string | null = null
  let midtermByType: string | null = null
  let finalByType: string | null = null

  componentRuleMap.forEach((rule) => {
    const slotCode = normalizeReportSlotCode(rule.reportSlotCode || rule.reportSlot)
    if (slotCode === DEFAULT_REPORT_SLOT_CODE) return
    if (!availableSlots.includes(slotCode)) {
      availableSlots.push(slotCode)
    }
    if (rule.componentType === GradeComponentType.FORMATIVE && !formativeByType) {
      formativeByType = slotCode
      return
    }
    if (rule.componentType === GradeComponentType.MIDTERM && !midtermByType) {
      midtermByType = slotCode
      return
    }
    if (rule.componentType === GradeComponentType.FINAL && !finalByType) {
      finalByType = slotCode
    }
  })

  const firstSlot = availableSlots[0] || 'FORMATIF'
  const secondSlot = availableSlots[1] || firstSlot
  const lastSlot = availableSlots[availableSlots.length - 1] || secondSlot

  const formativeByAlias = availableSlots.find((slot) => isFormativeAliasCode(slot)) || null
  const midtermByAlias = availableSlots.find((slot) => isMidtermAliasCode(slot)) || null
  const finalByAlias = availableSlots.find((slot) => isFinalAliasCode(slot)) || null

  const formative = formativeByType || formativeByAlias || firstSlot
  const midterm =
    midtermByType ||
    (midtermByAlias && midtermByAlias !== formative ? midtermByAlias : null) ||
    secondSlot
  const final =
    finalByType ||
    (finalByAlias && finalByAlias !== formative ? finalByAlias : null) ||
    lastSlot

  return { formative, midterm, final }
}

function listAvailableFinalSlotCodes(componentRuleMap: Map<string, ExamComponentRule>): string[] {
  const finalSlots: string[] = []

  componentRuleMap.forEach((rule) => {
    const slotCode = normalizeReportSlotCode(rule.reportSlotCode || rule.reportSlot)
    if (slotCode === DEFAULT_REPORT_SLOT_CODE) return
    if (!isFinalAliasCode(slotCode)) return
    if (!finalSlots.includes(slotCode)) {
      finalSlots.push(slotCode)
    }
  })

  return finalSlots
}

function resolveSemesterFinalSlotCode(
  finalSlots: string[],
  semester: Semester | null | undefined,
): string | null {
  const normalizedFinalSlots = finalSlots
    .map((slot) => normalizeReportSlotCode(slot))
    .filter((slot, index, arr) => slot !== DEFAULT_REPORT_SLOT_CODE && arr.indexOf(slot) === index)

  if (normalizedFinalSlots.length === 0) return null

  if (semester === Semester.EVEN) {
    return (
      normalizedFinalSlots.find((slot) => isFinalEvenAliasCode(slot)) ||
      normalizedFinalSlots.find((slot) => !isFinalOddAliasCode(slot)) ||
      normalizedFinalSlots[normalizedFinalSlots.length - 1]
    )
  }

  if (semester === Semester.ODD) {
    return (
      normalizedFinalSlots.find((slot) => isFinalOddAliasCode(slot)) ||
      normalizedFinalSlots.find((slot) => !isFinalEvenAliasCode(slot)) ||
      normalizedFinalSlots[0]
    )
  }

  return normalizedFinalSlots[0]
}

function resolvePrimarySlotCodesForSemester(
  componentRuleMap: Map<string, ExamComponentRule>,
  semester: Semester | null | undefined,
): {
  formative: string
  midterm: string
  final: string
} {
  const primarySlots = resolvePrimarySlotCodesFromRules(componentRuleMap)
  const semesterFinalSlot = resolveSemesterFinalSlotCode(
    listAvailableFinalSlotCodes(componentRuleMap),
    semester,
  )

  if (
    semesterFinalSlot &&
    semesterFinalSlot !== primarySlots.formative &&
    semesterFinalSlot !== primarySlots.midterm
  ) {
    primarySlots.final = semesterFinalSlot
  }

  return primarySlots
}

function recomputeFinalScoreFromSlots(
  slotScores: Record<string, number | null>,
  includeSlots: Set<string>,
  fallbackScore: number,
  primarySlots?: {
    formative: string
    midterm: string
    final: string
  } | null,
): number {
  const prioritizedSlots = primarySlots
    ? [primarySlots.formative, primarySlots.midterm, primarySlots.final]
        .map((slot) => normalizeReportSlotCode(slot))
        .filter((slot, index, arr) => slot !== DEFAULT_REPORT_SLOT_CODE && arr.indexOf(slot) === index)
    : []

  const fixedIncludedScore = computeFixedWeightedAverage(
    (prioritizedSlots.length > 0 ? prioritizedSlots : Array.from(includeSlots)).map((slot) => ({
      code: slot,
      score: slotScores[slot] ?? null,
    })),
  )
  if (fixedIncludedScore !== null) {
    return normalizeRoundedFinalScore(fixedIncludedScore) ?? fixedIncludedScore
  }

  const weightedIncludedScore = computeNormalizedWeightedAverage(
    Array.from(includeSlots).map((slot) => ({
      code: slot,
      score: slotScores[slot],
    })),
  )
  if (weightedIncludedScore !== null) {
    return normalizeRoundedFinalScore(weightedIncludedScore) ?? weightedIncludedScore
  }

  const weightedAllSlotScore = computeNormalizedWeightedAverage(
    Object.entries(slotScores).map(([slot, score]) => ({
      code: slot,
      score,
    })),
  )
  if (weightedAllSlotScore !== null) {
    return normalizeRoundedFinalScore(weightedAllSlotScore) ?? weightedAllSlotScore
  }

  return normalizeRoundedFinalScore(fallbackScore) ?? fallbackScore
}

async function collectDynamicFormativeScores(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  semesterRange: SemesterRange
  programSlotMap: Map<string, string>
  formativeSlotCode: string
}): Promise<number[]> {
  const { studentId, subjectId, academicYearId, semester, semesterRange, programSlotMap, formativeSlotCode } = params

  const [examSessions, assignmentSubmissions] = await Promise.all([
    prisma.studentExamSession.findMany({
      where: {
        studentId,
        status: ExamSessionStatus.COMPLETED,
        score: { not: null },
        schedule: {
          packet: {
            is: {
              subjectId,
              academicYearId,
              semester,
            },
          },
        },
      },
      select: {
        score: true,
        schedule: {
          select: {
            packet: {
              select: {
                type: true,
                programCode: true,
              },
            },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: {
        studentId,
        score: { not: null },
        assignment: {
          academicYearId,
          subjectId,
          dueDate: {
            gte: semesterRange.start,
            lte: semesterRange.end,
          },
        },
      },
      select: {
        score: true,
        assignment: {
          select: {
            maxScore: true,
          },
        },
      },
    }),
  ])

  const examScores = examSessions
    .filter((session) => session.score !== null && session.score !== undefined)
    .filter((session) => {
      const packet = session.schedule?.packet
      const normalizedProgramCode = normalizeComponentCode(packet?.programCode)
      const reportSlotCode =
        (normalizedProgramCode ? programSlotMap.get(normalizedProgramCode) : undefined) ||
        defaultReportSlotCodeByExamType(packet?.type)
      return reportSlotCode === formativeSlotCode
    })
    .map((session) => Number(session.score))
    .filter((score) => Number.isFinite(score))

  const assignmentScores = assignmentSubmissions
    .filter((submission) => submission.score !== null && submission.score !== undefined)
    .map((submission) => {
      const rawScore = Number(submission.score)
      const maxScore = Number(submission.assignment?.maxScore ?? 100)
      if (!Number.isFinite(rawScore)) return null
      if (Number.isFinite(maxScore) && maxScore > 0) {
        return Math.max(0, Math.min(100, (rawScore / maxScore) * 100))
      }
      return Math.max(0, Math.min(100, rawScore))
    })
    .filter((score): score is number => score !== null)

  return [...examScores, ...assignmentScores]
}

type DynamicScoreEntryRow = {
  reportSlotCode?: string | null
  reportSlot?: ReportComponentSlot | null
  score: number | null
  recordedAt?: Date | null
  sourceType?: string | null
  sourceKey?: string | null
  remedials?: Array<{
    attemptNumber?: number | null
    status?: ScoreRemedialStatus | string | null
    effectiveScore?: number | null
    recordedAt?: Date | null
  }>
}

function resolveDynamicScoreEntryScore(row: DynamicScoreEntryRow): number | null {
  const originalScore = Number(row.score)
  if (!Number.isFinite(originalScore)) return null

  const countedRemedials = (row.remedials || [])
    .filter((remedial) => REMEDIAL_COUNTED_STATUSES.has(remedial.status as ScoreRemedialStatus))
    .sort((left, right) => Number(left.attemptNumber || 0) - Number(right.attemptNumber || 0))

  if (countedRemedials.length === 0) return originalScore

  return countedRemedials.reduce((bestScore, remedial) => {
    const effectiveScore = Number(remedial.effectiveScore)
    if (!Number.isFinite(effectiveScore)) return bestScore
    return Math.max(bestScore, effectiveScore)
  }, originalScore)
}

async function collectDynamicScoreEntryRows(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
}): Promise<DynamicScoreEntryRow[]> {
  const { studentId, subjectId, academicYearId, semester } = params

  try {
    const studentScoreEntryDelegate = getStudentScoreEntryDelegate()
    if (!studentScoreEntryDelegate) return []

    const primaryRows = (await studentScoreEntryDelegate.findMany({
      where: {
        studentId,
        subjectId,
        academicYearId,
        semester,
      },
      select: {
        reportSlotCode: true,
        reportSlot: true,
        score: true,
        recordedAt: true,
        sourceType: true,
        sourceKey: true,
        remedials: {
          select: {
            attemptNumber: true,
            status: true,
            effectiveScore: true,
            recordedAt: true,
          },
          orderBy: {
            attemptNumber: 'asc',
          },
        },
      },
    })) as DynamicScoreEntryRow[]

    return primaryRows
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Compatibility guard if migration has not been applied yet.
      if (error.code === 'P2021' || error.code === 'P2022') {
        try {
          const studentScoreEntryDelegate = getStudentScoreEntryDelegate()
          if (!studentScoreEntryDelegate) return []

          const fallbackRows = (await studentScoreEntryDelegate.findMany({
            where: {
              studentId,
              subjectId,
              academicYearId,
              semester,
            },
            select: {
              reportSlot: true,
              score: true,
              recordedAt: true,
              sourceType: true,
              sourceKey: true,
            },
          })) as DynamicScoreEntryRow[]

          return fallbackRows
        } catch {
          return []
        }
      }
    }
    console.error('Failed to read student score entries:', error)
    return []
  }
}

function computeDynamicSlotScoresFromScoreEntries(rows: DynamicScoreEntryRow[]): Record<string, number> {
  if (!Array.isArray(rows) || rows.length === 0) return {}

  const buckets = new Map<string, DynamicScoreEntryRow[]>()
  rows.forEach((row) => {
    const slot = normalizeReportSlotCode(row.reportSlotCode || row.reportSlot)
    if (slot === DEFAULT_REPORT_SLOT_CODE) return
    if (resolveDynamicScoreEntryScore(row) === null) return
    const values = buckets.get(slot) || []
    values.push(row)
    buckets.set(slot, values)
  })

  const result: Record<string, number> = {}
  buckets.forEach((entries, slot) => {
    const manualEntries = entries.filter(
      (entry) => normalizeComponentCode(entry.sourceType) === 'MANUAL_GRADE',
    )
    const prioritizedEntries = manualEntries.length > 0 ? manualEntries : entries

    if (manualEntries.length > 0) {
      const seriesRows = prioritizedEntries.filter((entry) =>
        /^studentGrade:\d+:(nf\d+|nf_extra:\d+)$/i.test(String(entry.sourceKey || '')),
      )

      if (seriesRows.length > 0) {
        const latestBySourceKey = new Map<string, DynamicScoreEntryRow>()
        seriesRows.forEach((entry) => {
          const sourceKey = String(entry.sourceKey || '').trim()
          if (!sourceKey) return
          const previous = latestBySourceKey.get(sourceKey)
          const previousTime = previous?.recordedAt ? new Date(previous.recordedAt).getTime() : 0
          const nextTime = entry.recordedAt ? new Date(entry.recordedAt).getTime() : 0
          if (!previous || nextTime >= previousTime) {
            latestBySourceKey.set(sourceKey, entry)
          }
        })
        const averaged = calculateAverage(
          Array.from(latestBySourceKey.values())
            .map((entry) => resolveDynamicScoreEntryScore(entry))
            .filter((score): score is number => score !== null && Number.isFinite(score)),
        )
        if (averaged !== null) {
          result[slot] = averaged
        }
        return
      }

      const latestManualEntry = prioritizedEntries.reduce<DynamicScoreEntryRow | null>((latest, entry) => {
        if (!latest) return entry
        const latestTime = latest.recordedAt ? new Date(latest.recordedAt).getTime() : 0
        const nextTime = entry.recordedAt ? new Date(entry.recordedAt).getTime() : 0
        return nextTime >= latestTime ? entry : latest
      }, null)
      const latestScore = latestManualEntry ? resolveDynamicScoreEntryScore(latestManualEntry) : null
      if (latestScore !== null && Number.isFinite(latestScore)) {
        result[slot] = latestScore
      }
      return
    }

    const average = calculateAverage(
      prioritizedEntries
        .map((entry) => resolveDynamicScoreEntryScore(entry))
        .filter((score): score is number => score !== null && Number.isFinite(score)),
    )
    if (average !== null) {
      result[slot] = average
    }
  })
  return result
}

function computeFormativeReferenceScoresFromScoreEntries(params: {
  rows: DynamicScoreEntryRow[]
  formativeSlotCode: string
  midtermSlotCode: string
  finalSlotCode: string
}): { midterm: number | null; final: number | null } {
  const formativeSlotCode = normalizeReportSlotCode(params.formativeSlotCode)
  const midtermSlotCode = normalizeReportSlotCode(params.midtermSlotCode)
  const finalSlotCode = normalizeReportSlotCode(params.finalSlotCode)

  const formativeRows = params.rows
    .filter((row) => normalizeReportSlotCode(row.reportSlotCode || row.reportSlot) === formativeSlotCode)
    .map((row) => {
      const score = resolveDynamicScoreEntryScore(row)
      if (score === null || !Number.isFinite(score)) return null
      return {
        score,
        recordedAt: row.recordedAt ? new Date(row.recordedAt) : null,
      }
    })
    .filter((row): row is { score: number; recordedAt: Date | null } => row !== null)

  if (formativeRows.length === 0) {
    return { midterm: null, final: null }
  }

  const firstBoundaryForSlot = (slotCode: string) => {
    const timestamps = params.rows
      .filter((row) => normalizeReportSlotCode(row.reportSlotCode || row.reportSlot) === slotCode)
      .map((row) => (row.recordedAt ? new Date(row.recordedAt).getTime() : null))
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .sort((left, right) => left - right)
    return timestamps[0] ?? null
  }

  const buildReferenceAverage = (boundary: number | null) => {
    const candidateValues = (boundary === null
      ? formativeRows
      : formativeRows.filter((row) => {
          if (!row.recordedAt) return true
          return row.recordedAt.getTime() <= boundary
        })
    ).map((row) => row.score)

    const values = candidateValues.length > 0 ? candidateValues : formativeRows.map((row) => row.score)
    return calculateAverage(values)
  }

  return {
    midterm: buildReferenceAverage(firstBoundaryForSlot(midtermSlotCode)),
    final: buildReferenceAverage(firstBoundaryForSlot(finalSlotCode)),
  }
}

// ============================================
// GRADE COMPONENTS
// ============================================

export const getGradeComponents = async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const normalizeSubjectIdentityToken = (value: unknown) =>
      String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')

    const isTheoryKejuruanSubject = (subject?: { name?: string | null; code?: string | null } | null) => {
      const normalizedName = normalizeSubjectIdentityToken(subject?.name)
      const normalizedCode = normalizeSubjectIdentityToken(subject?.code)
      if (!normalizedName && !normalizedCode) return false
      if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) {
        return true
      }
      return (
        normalizedName.includes('KONSENTRASI_KEAHLIAN') ||
        normalizedName === 'KONSENTRASI' ||
        normalizedName === 'KEJURUAN'
      )
    }

    const { subject_id, academic_year_id, academicYearId } = req.query
    const authUser = (req as unknown as { user?: AuthUserLike }).user
    const querySubjectId = Number(subject_id)
    const parsedSubjectId = Number.isFinite(querySubjectId) && querySubjectId > 0 ? querySubjectId : null
    const semesterScope = normalizeSemesterForComponentScope(req.query.semester)
    const assignmentId = toPositiveInt(
      (req.query as Record<string, unknown>).assignment_id ??
        (req.query as Record<string, unknown>).assignmentId,
    )

    let subjectId = parsedSubjectId
    let scopedAssignment:
      | {
          id: number
          teacherId: number
          academicYearId: number
          subjectId: number
          class: { level: string | null } | null
        }
      | null = null

    const where: any = { isActive: true }
    let resolvedAcademicYearId = await resolveAcademicYearIdForGradeComponents(
      academic_year_id ?? academicYearId,
    )

    if (assignmentId) {
      scopedAssignment = await prisma.teacherAssignment.findUnique({
        where: { id: assignmentId },
        select: {
          id: true,
          teacherId: true,
          academicYearId: true,
          subjectId: true,
          class: {
            select: {
              level: true,
            },
          },
        },
      })

      if (!scopedAssignment) {
        throw new ApiError(404, 'Assignment tidak ditemukan.')
      }

      if (isTeacherUser(authUser) && Number(scopedAssignment.teacherId) !== Number(authUser?.id || 0)) {
        throw new ApiError(403, 'Anda tidak memiliki akses ke assignment ini.')
      }

      if (resolvedAcademicYearId && Number(resolvedAcademicYearId) !== Number(scopedAssignment.academicYearId)) {
        throw new ApiError(400, 'assignment_id tidak sesuai dengan tahun ajaran terpilih.')
      }

      resolvedAcademicYearId = Number(scopedAssignment.academicYearId)
      subjectId = Number(scopedAssignment.subjectId)
    }

    if (subjectId !== null && subjectId > 0) {
      where.subjectId = subjectId
      if (resolvedAcademicYearId) {
        await syncSubjectGradeComponentsFromExamMaster(subjectId, resolvedAcademicYearId)
      }
    }

    const subjectMeta =
      subjectId !== null && subjectId > 0
        ? await prisma.subject.findUnique({
            where: { id: subjectId },
            select: {
              name: true,
              code: true,
            },
          })
        : null

    const [components, masterComponents] = await Promise.all([
      (prisma.gradeComponent as any).findMany({
        where,
        select: {
          id: true,
          code: true,
          subjectId: true,
          name: true,
          weight: true,
          type: true,
          typeCode: true,
          isActive: true,
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }) as Promise<
        Array<{
          id: number
          code?: string | null
          subjectId: number
          name: string
          weight: number
          type: GradeComponentType
          typeCode?: string | null
          isActive: boolean
        }>
      >,
      resolvedAcademicYearId
        ? ((prisma.examGradeComponent as any).findMany({
            where: {
              academicYearId: resolvedAcademicYearId,
              isActive: true,
            },
            select: {
              code: true,
              label: true,
              type: true,
              entryMode: true,
              entryModeCode: true,
              reportSlot: true,
              reportSlotCode: true,
              includeInFinalScore: true,
              displayOrder: true,
            },
            orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
          }) as Promise<
            Array<{
              code: string
              label: string
              type: GradeComponentType
              entryMode: GradeEntryMode
              entryModeCode?: string | null
              reportSlot: ReportComponentSlot
              reportSlotCode?: string | null
              includeInFinalScore: boolean
              displayOrder: number
            }>
          >)
        : Promise.resolve([]),
    ])

    let scopedProgramComponentCodes: Set<string> | null = null
    if (resolvedAcademicYearId && subjectId !== null && subjectId > 0) {
      const scopedSubjectId = subjectId
      const programWhere: Prisma.ExamProgramConfigWhereInput = {
        academicYearId: Number(resolvedAcademicYearId),
        isActive: true,
      }

      if (isTeacherUser(authUser)) {
        programWhere.showOnTeacherMenu = true
      }

      if (semesterScope) {
        programWhere.OR = [{ fixedSemester: semesterScope }, { fixedSemester: null }]
      }

      const programRows = await prisma.examProgramConfig.findMany({
        where: programWhere,
        select: {
          gradeComponentCode: true,
          allowedSubjectIds: true,
          targetClassLevels: true,
          allowedAuthorIds: true,
        },
      })

      const assignmentLevelToken = normalizeClassLevelTokenForScope(scopedAssignment?.class?.level)
      const assignmentTeacherId = Number(scopedAssignment?.teacherId || authUser?.id || 0)

      const scopedRows = programRows.filter((row) => {
        const allowedBySubject =
          !Array.isArray(row.allowedSubjectIds) ||
          row.allowedSubjectIds.length === 0 ||
          row.allowedSubjectIds.some((allowedSubjectId) => Number(allowedSubjectId) === scopedSubjectId)
        if (!allowedBySubject) return false

        if (scopedAssignment) {
          const normalizedTargetLevels = (Array.isArray(row.targetClassLevels) ? row.targetClassLevels : [])
            .map((item) => normalizeClassLevelTokenForScope(item))
            .filter((item): item is string => Boolean(item))

          if (normalizedTargetLevels.length > 0) {
            if (!assignmentLevelToken) return false
            if (!normalizedTargetLevels.includes(assignmentLevelToken)) return false
          }
        }

        if (isTeacherUser(authUser)) {
          const normalizedAllowedAuthors = (Array.isArray(row.allowedAuthorIds) ? row.allowedAuthorIds : [])
            .map((authorId) => Number(authorId))
            .filter((authorId) => Number.isFinite(authorId) && authorId > 0)
          if (normalizedAllowedAuthors.length > 0 && !normalizedAllowedAuthors.includes(assignmentTeacherId)) {
            return false
          }
        }

        return true
      })

      const scopedCodes = scopedRows
        .map((row) => normalizeComponentCode(row.gradeComponentCode))
        .filter((code): code is string => Boolean(code))

      if (scopedCodes.length > 0) {
        scopedProgramComponentCodes = new Set(scopedCodes)
      } else if (assignmentId || semesterScope) {
        scopedProgramComponentCodes = new Set<string>()
      }
    }

    const masterMap = new Map(
      masterComponents.map((item) => [normalizeComponentCode(item.code), item]),
    )
    const hasAcademicYearScope = Number.isFinite(Number(resolvedAcademicYearId)) && Number(resolvedAcademicYearId) > 0
    const allowedMasterCodes = new Set(
      masterComponents
        .map((item) => normalizeComponentCode(item.code))
        .filter((code) => !!code),
    )
    const sourceComponents = hasAcademicYearScope
      ? components.filter((component) => {
          const normalizedCode = normalizeComponentCode(
            component.code || component.typeCode || defaultComponentCodeByType(component.type),
          )
          if (!normalizedCode) return false
          return allowedMasterCodes.has(normalizedCode)
        })
      : components

    const formattedComponents = sourceComponents
      .map((component) => {
        const normalizedCode =
          normalizeComponentCode(component.code || component.typeCode || defaultComponentCodeByType(component.type))
        const master = normalizedCode ? masterMap.get(normalizedCode) : undefined
        const reportSlot = master?.reportSlot || defaultReportSlotByType(component.type)
        const reportSlotCode = normalizeReportSlotCode(master?.reportSlotCode || reportSlot)
        return {
          ...component,
          code: normalizedCode || component.code || null,
          name: String(master?.label || component.name || '').trim() || normalizedCode || component.name,
          entryMode: master?.entryMode || defaultGradeEntryModeByCode(normalizedCode),
          entryModeCode: normalizeComponentCode(master?.entryModeCode || master?.entryMode || defaultGradeEntryModeByCode(normalizedCode)),
          reportSlot,
          reportSlotCode,
          includeInFinalScore:
            master?.includeInFinalScore ??
            defaultIncludeInFinalBySlot(reportSlot, reportSlotCode),
          displayOrder: Number(master?.displayOrder ?? 999),
          academicYearId: resolvedAcademicYearId,
        }
      })
      .sort((a, b) => {
        const orderDiff = Number(a.displayOrder || 0) - Number(b.displayOrder || 0)
        if (orderDiff !== 0) return orderDiff
        return String(a.name || '').localeCompare(String(b.name || ''))
      })

    const scopedComponents = scopedProgramComponentCodes
      ? formattedComponents.filter((component) => {
          const normalizedCode = normalizeComponentCode(
            component.code || component.typeCode || defaultComponentCodeByType(component.type),
          )
          if (!normalizedCode) return false
          return scopedProgramComponentCodes!.has(normalizedCode)
        })
      : formattedComponents

    const finalComponents = isTheoryKejuruanSubject(subjectMeta)
      ? scopedComponents.filter((component) => {
          const normalizedCode = normalizeComponentCode(
            component.code || component.typeCode || defaultComponentCodeByType(component.type),
          )
          const normalizedSlot = normalizeReportSlotCode(component.reportSlotCode || component.reportSlot)
          return normalizedCode === 'US_THEORY' || normalizedSlot === 'US_THEORY'
        })
      : scopedComponents

    const elapsed = Date.now() - t0
    console.log(`getGradeComponents executed in ${elapsed}ms`)

    return ApiResponseHelper.success(
      res,
      finalComponents,
      'Grade components retrieved successfully',
    )
  } catch (error) {
    console.error('Get grade components error:', error)
    throw new ApiError(500, 'Failed to retrieve grade components')
  }
}

// ============================================
// HELPER: Sync Report Grade
// ============================================

export const syncReportGrade = async (
  studentId: number,
  subjectId: number,
  academicYearId: number,
  semester: Semester
) => {
  // 1. Get all grades for this student/subject/semester
  const grades = await prisma.studentGrade.findMany({
    where: {
      studentId,
      subjectId,
      academicYearId,
      semester,
    },
    include: { component: true }
  });

  const [componentRuleMap, academicYear] = await Promise.all([
    getExamComponentRuleMap(academicYearId),
    prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: {
        semester1Start: true,
        semester1End: true,
        semester2Start: true,
        semester2End: true,
      },
    }),
  ])

  if (!academicYear) {
    throw new ApiError(404, 'Academic year not found')
  }

  const includeSlots = resolveIncludedReportSlots(componentRuleMap)
  const primarySlots = resolvePrimarySlotCodesForSemester(componentRuleMap, semester)
  const semesterRange = resolveSemesterRange(academicYear, semester)
  const programSlotMap = await getProgramReportSlotMap(academicYearId, componentRuleMap)

  const activeGrades = grades.filter((grade) => grade.component?.isActive !== false)
  const dynamicResult = computeDynamicReportFromGrades(activeGrades, componentRuleMap)
  const scoreEntryRows = await collectDynamicScoreEntryRows({
    studentId,
    subjectId,
    academicYearId,
    semester,
  })
  const entrySlotScores = computeDynamicSlotScoresFromScoreEntries(scoreEntryRows)
  const formativeReferenceScores = computeFormativeReferenceScoresFromScoreEntries({
    rows: scoreEntryRows,
    formativeSlotCode: primarySlots.formative,
    midtermSlotCode: primarySlots.midterm,
    finalSlotCode: primarySlots.final,
  })

  Object.entries(entrySlotScores).forEach(([slot, value]) => {
    if (value !== undefined) {
      dynamicResult.slotScoresByCode[slot] = value
    }
  })

  const dynamicFormativeScores = await collectDynamicFormativeScores({
    studentId,
    subjectId,
    academicYearId,
    semester,
    semesterRange,
    programSlotMap,
    formativeSlotCode: primarySlots.formative,
  })

  if (entrySlotScores[primarySlots.formative] === undefined && dynamicFormativeScores.length > 0) {
    dynamicResult.slotScoresByCode[primarySlots.formative] = calculateAverage(dynamicFormativeScores)
  }

  const midtermFormativeReference =
    formativeReferenceScores.midterm ??
    dynamicResult.slotScoresByCode[primarySlots.formative] ??
    calculateAverage(dynamicFormativeScores)
  const finalFormativeReference =
    formativeReferenceScores.final ??
    dynamicResult.slotScoresByCode[primarySlots.formative] ??
    calculateAverage(dynamicFormativeScores)

  if (midtermFormativeReference !== null) {
    dynamicResult.slotScoresByCode[
      buildFormativeReferenceSlotCode(primarySlots.formative, 'MIDTERM')
    ] = midtermFormativeReference
  }
  if (finalFormativeReference !== null) {
    dynamicResult.slotScoresByCode[
      buildFormativeReferenceSlotCode(primarySlots.formative, 'FINAL')
    ] = finalFormativeReference
  }

  dynamicResult.legacySlotScores = buildLegacySlotScoreMap(dynamicResult.slotScoresByCode)
  let finalScore = recomputeFinalScoreFromSlots(
    dynamicResult.slotScoresByCode,
    includeSlots,
    dynamicResult.finalScore,
    primarySlots,
  )
  const reportScores = {
    FORMATIVE: dynamicResult.slotScoresByCode[primarySlots.formative] ?? null,
    MIDTERM: dynamicResult.slotScoresByCode[primarySlots.midterm] ?? null,
    FINAL: dynamicResult.slotScoresByCode[primarySlots.final] ?? null,
  }

  // Get KKM
  let kkm = 75;
  const studentClassId = await resolveStudentClassId(studentId, academicYearId)

  if (studentClassId) {
      const assignment = await prisma.teacherAssignment.findFirst({
          where: {
              classId: studentClassId,
              subjectId: subjectId,
              academicYearId: academicYearId
          },
          select: { kkm: true }
      });
      if (assignment) kkm = assignment.kkm;
  }

  const predicate = calculatePredicate(finalScore, kkm);
  const hasAnySemesterComponentEvidence = hasAnyNumericSlotScore(dynamicResult.slotScoresByCode)
  const competencyDescription = hasAnySemesterComponentEvidence
    ? await resolveReportCompetencyDescription({
        studentId,
        subjectId,
        academicYearId,
        semester,
        finalScore,
        predicate,
      })
    : null;

  // 4. US Score Logic (dinamis dari slot score, tanpa hardcode nama mapel)
  const usScore = computeUsScoreFromSlotScores(dynamicResult.slotScoresByCode);

  // 5. Upsert ReportGrade
  const existing = await prisma.reportGrade.findFirst({
      where: { studentId, subjectId, academicYearId, semester }
  });

  if (!hasAnySemesterComponentEvidence) {
      if (existing) {
          await prisma.reportGrade.delete({ where: { id: existing.id } })
      }
      return
  }

  if (existing) {
      await prisma.reportGrade.update({
          where: { id: existing.id },
          data: {
              formatifScore: reportScores.FORMATIVE,
              sbtsScore: reportScores.MIDTERM,
              sasScore: reportScores.FINAL,
              slotScores: dynamicResult.slotScoresByCode,
              finalScore,
              predicate,
              usScore,
              description: competencyDescription,
          } as any
      });
  } else {
      await prisma.reportGrade.create({
          data: {
              studentId, subjectId, academicYearId, semester,
              formatifScore: reportScores.FORMATIVE,
              sbtsScore: reportScores.MIDTERM,
              sasScore: reportScores.FINAL,
              slotScores: dynamicResult.slotScoresByCode,
              finalScore,
              predicate,
              usScore,
              description: competencyDescription,
          } as any
      });
  }
};

type ReportSyncResult = {
  success: boolean;
  error: string | null;
};

const syncReportGradeSafely = async (
  studentId: number,
  subjectId: number,
  academicYearId: number,
  semester: Semester,
): Promise<ReportSyncResult> => {
  try {
    await syncReportGrade(studentId, subjectId, academicYearId, semester);
    return { success: true, error: null };
  } catch (error) {
    console.error('Error syncing report grade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sinkronisasi report grade gagal',
    };
  }
};

type RemedialScoreEntryRow = Prisma.StudentScoreEntryGetPayload<{
  include: {
    student: {
      select: {
        id: true
        name: true
        nis: true
        nisn: true
        classId: true
        studentClass: { select: { academicYearId: true } }
      }
    }
    subject: { select: { id: true; code: true; name: true } }
    academicYear: { select: { id: true; name: true } }
    remedials: { orderBy: { attemptNumber: 'asc' } }
  }
}>

const REMEDIAL_COUNTED_STATUSES = new Set<ScoreRemedialStatus>([
  ScoreRemedialStatus.RECORDED,
  ScoreRemedialStatus.PASSED,
  ScoreRemedialStatus.STILL_BELOW_KKM,
])

function roundRemedialScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Number(Math.max(0, Math.min(100, value)).toFixed(2))
}

function normalizeScoreRemedialMethod(value: unknown): ScoreRemedialMethod {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === ScoreRemedialMethod.ASSIGNMENT) return ScoreRemedialMethod.ASSIGNMENT
  if (normalized === ScoreRemedialMethod.QUESTION_SET || normalized === 'QUIZ' || normalized === 'SOAL') {
    return ScoreRemedialMethod.QUESTION_SET
  }
  return ScoreRemedialMethod.MANUAL_SCORE
}

function normalizeOptionalRemedialText(value: unknown, maxLength: number): string | null {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function normalizeOptionalRemedialDate(value: unknown): Date | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function resolveRemedialEffectiveScore(params: {
  originalScore: number
  previousEffectiveScore?: number | null
  remedialScore: number
  kkm: number
}): number {
  const originalScore = roundRemedialScore(params.originalScore)
  const previousEffectiveScore = roundRemedialScore(
    Number.isFinite(Number(params.previousEffectiveScore))
      ? Number(params.previousEffectiveScore)
      : originalScore,
  )
  const remedialScore = roundRemedialScore(params.remedialScore)
  const kkm = roundRemedialScore(params.kkm)
  return roundRemedialScore(Math.max(originalScore, previousEffectiveScore, Math.min(remedialScore, kkm)))
}

function summarizeRemedialState(
  score: number,
  kkm: number,
  remedials: Array<{
    attemptNumber: number
    status: ScoreRemedialStatus
    effectiveScore: number
    remedialScore: number
    recordedAt: Date
  }>,
) {
  const counted = remedials
    .filter((row) => REMEDIAL_COUNTED_STATUSES.has(row.status))
    .sort((a, b) => Number(a.attemptNumber) - Number(b.attemptNumber))
  const originalScore = roundRemedialScore(Number(score))
  const currentEffectiveScore = roundRemedialScore(
    counted.reduce(
      (best, row) => Math.max(best, Number(row.effectiveScore || 0)),
      originalScore,
    ),
  )
  const latestAttempt = counted[counted.length - 1] || null
  return {
    originalScore,
    currentEffectiveScore,
    latestAttempt,
    attemptCount: counted.length,
    isComplete: currentEffectiveScore >= Number(kkm || 75),
  }
}

async function resolveKkmForRemedialScoreEntry(params: {
  studentId: number
  subjectId: number
  academicYearId: number
}) {
  const classId = await resolveStudentClassId(params.studentId, params.academicYearId)
  let classLevel: string | null = null

  if (classId) {
    const classRow = await prisma.class.findUnique({
      where: { id: classId },
      select: { level: true },
    })
    classLevel = classRow?.level || null

    const assignment = await prisma.teacherAssignment.findFirst({
      where: {
        classId,
        subjectId: params.subjectId,
        academicYearId: params.academicYearId,
      },
      select: { kkm: true },
    })
    if (assignment) {
      return {
        kkm: Number(assignment.kkm || 75),
        classId,
        classLevel,
        source: 'TEACHER_ASSIGNMENT' as const,
      }
    }
  }

  if (classLevel) {
    const subjectKkm = await prisma.subjectKKM.findFirst({
      where: {
        subjectId: params.subjectId,
        academicYearId: params.academicYearId,
        classLevel,
      },
      select: { kkm: true },
    })
    if (subjectKkm) {
      return {
        kkm: Number(subjectKkm.kkm || 75),
        classId,
        classLevel,
        source: 'SUBJECT_KKM' as const,
      }
    }
  }

  return {
    kkm: 75,
    classId,
    classLevel,
    source: 'DEFAULT' as const,
  }
}

function formatRemedialSourceLabel(entry: {
  componentCode?: string | null
  componentTypeCode?: string | null
  componentType?: GradeComponentType | null
  sourceType?: string | null
  sourceKey?: string | null
  metadata?: Prisma.JsonValue | null
}) {
  const metadata = entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
    ? entry.metadata as Record<string, unknown>
    : {}
  const field = String(metadata.field || '').trim()
  const order = Number(metadata.order || 0)
  if (/^nf\d+$/i.test(field)) return `Formatif ${order || field.replace(/\D/g, '')}`
  if (field === 'score') return String(entry.componentCode || entry.componentTypeCode || entry.componentType || 'Nilai')
  return String(entry.componentCode || entry.componentTypeCode || entry.componentType || entry.sourceType || 'Nilai')
}

function getRemedialEntryScopeKey(entry: RemedialScoreEntryRow): string {
  return [
    entry.studentId,
    entry.subjectId,
    entry.academicYearId,
    entry.semester,
    normalizeComponentCode(entry.componentCode || entry.componentTypeCode || entry.componentType),
    normalizeReportSlotCode(entry.reportSlotCode || entry.reportSlot),
  ].join(':')
}

function getRemedialSourcePriority(entry: RemedialScoreEntryRow): number {
  const sourceType = normalizeComponentCode(entry.sourceType)
  if (sourceType === 'MANUAL_GRADE') return 0
  if (sourceType === 'EXAM_SESSION') return 1
  if (sourceType === 'ASSIGNMENT_SUBMISSION') return 2
  return 3
}

function getRemedialRecordedTime(entry: RemedialScoreEntryRow): number {
  const timestamp = entry.recordedAt ? new Date(entry.recordedAt).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function pickPreferredRemedialEntry(
  current: RemedialScoreEntryRow,
  candidate: RemedialScoreEntryRow,
): RemedialScoreEntryRow {
  const currentPriority = getRemedialSourcePriority(current)
  const candidatePriority = getRemedialSourcePriority(candidate)
  if (candidatePriority < currentPriority) return candidate
  if (candidatePriority > currentPriority) return current

  const currentTime = getRemedialRecordedTime(current)
  const candidateTime = getRemedialRecordedTime(candidate)
  if (candidateTime > currentTime) return candidate
  if (candidateTime < currentTime) return current

  return candidate.id > current.id ? candidate : current
}

function dedupeRemedialEligibleEntries(entries: RemedialScoreEntryRow[]): RemedialScoreEntryRow[] {
  const byScope = new Map<string, RemedialScoreEntryRow>()
  entries.forEach((entry) => {
    const scopeKey = getRemedialEntryScopeKey(entry)
    const previous = byScope.get(scopeKey)
    byScope.set(scopeKey, previous ? pickPreferredRemedialEntry(previous, entry) : entry)
  })
  return Array.from(byScope.values()).sort((left, right) => {
    const leftName = String(left.student?.name || '').localeCompare(String(right.student?.name || ''), 'id')
    if (leftName !== 0) return leftName
    const leftComponent = String(left.componentCode || '').localeCompare(String(right.componentCode || ''), 'id')
    if (leftComponent !== 0) return leftComponent
    return getRemedialRecordedTime(left) - getRemedialRecordedTime(right)
  })
}

async function loadRemedialScoreEntry(scoreEntryId: number): Promise<RemedialScoreEntryRow | null> {
  return prisma.studentScoreEntry.findUnique({
    where: { id: scoreEntryId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nis: true,
          nisn: true,
          classId: true,
          studentClass: {
            select: {
              academicYearId: true,
            },
          },
        },
      },
      subject: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      academicYear: {
        select: {
          id: true,
          name: true,
        },
      },
      remedials: {
        orderBy: {
          attemptNumber: 'asc',
        },
      },
    },
  })
}

async function assertCanAccessRemedialScoreEntry(user: AuthUserLike, entry: {
  studentId: number
  subjectId: number
  academicYearId: number
}) {
  if (!isTeacherUser(user)) return
  await ensureTeacherCanAccessGradeContext({
    user,
    studentId: entry.studentId,
    subjectId: entry.subjectId,
    academicYearId: entry.academicYearId,
  })
}

function formatRemedialScoreEntry(entry: RemedialScoreEntryRow, kkm: number) {
  const summary = summarizeRemedialState(Number(entry.score), kkm, entry.remedials)
  return {
    id: entry.id,
    scoreEntryId: entry.id,
    studentId: entry.studentId,
    subjectId: entry.subjectId,
    academicYearId: entry.academicYearId,
    semester: entry.semester,
    componentCode: entry.componentCode,
    componentType: entry.componentType,
    componentTypeCode: entry.componentTypeCode,
    reportSlot: entry.reportSlot,
    reportSlotCode: entry.reportSlotCode,
    sourceType: entry.sourceType,
    sourceKey: entry.sourceKey,
    sourceLabel: formatRemedialSourceLabel(entry),
    originalScore: summary.originalScore,
    currentEffectiveScore: summary.currentEffectiveScore,
    kkm,
    isComplete: summary.isComplete,
    attemptCount: summary.attemptCount,
    latestAttempt: summary.latestAttempt,
    student: entry.student,
    subject: entry.subject,
    academicYear: entry.academicYear,
    remedials: entry.remedials,
  }
}

export const getRemedialEligibleScores = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const subjectId = toPositiveInt(req.query.subject_id || req.query.subjectId)
    const academicYearId = toPositiveInt(req.query.academic_year_id || req.query.academicYearId)
    const classId = toPositiveInt(req.query.class_id || req.query.classId)
    const studentId = toPositiveInt(req.query.student_id || req.query.studentId)
    const semester = parseStudentReportSemester(req.query.semester)
    const componentCode = normalizeComponentCode(req.query.component_code || req.query.componentCode)
    const includeAll = String(req.query.include_all || req.query.includeAll || '').toLowerCase() === 'true'
    const limit = Math.min(Math.max(toPositiveInt(req.query.limit) || 300, 1), 500)

    if (!subjectId || !academicYearId || !semester) {
      throw new ApiError(400, 'subject_id, academic_year_id, dan semester wajib diisi.')
    }

    if (!classId && !studentId) {
      throw new ApiError(400, 'class_id atau student_id wajib diisi.')
    }

    if (isTeacherUser(user)) {
      await ensureTeacherCanAccessGradeContext({
        user,
        subjectId,
        academicYearId,
        classId,
        studentId,
      })
    }

    let studentIds: number[] = []
    if (studentId) {
      studentIds = [studentId]
    } else if (classId) {
      const classScope = await resolveHistoricalStudentScope({
        academicYearId,
        classId,
      })
      studentIds = classScope.studentIds
    }

    if (studentIds.length === 0) {
      return ApiResponseHelper.success(res, [], 'Daftar nilai remedial berhasil diambil.')
    }

    const entries = await prisma.studentScoreEntry.findMany({
      where: {
        studentId: { in: studentIds },
        subjectId,
        academicYearId,
        semester,
        ...(componentCode ? { componentCode } : {}),
        NOT: {
          sourceKey: {
            startsWith: FORMATIVE_SLOT_COUNT_SOURCE_PREFIX,
          },
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            classId: true,
            studentClass: {
              select: {
                academicYearId: true,
              },
            },
          },
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
        remedials: {
          orderBy: {
            attemptNumber: 'asc',
          },
        },
      },
      orderBy: [
        { student: { name: 'asc' } },
        { componentCode: 'asc' },
        { recordedAt: 'asc' },
      ],
      take: limit,
    })

    const formatted = []
    const kkmCache = new Map<string, Awaited<ReturnType<typeof resolveKkmForRemedialScoreEntry>>>()
    const scopedEntries = dedupeRemedialEligibleEntries(entries)
    for (const entry of scopedEntries) {
      const kkmCacheKey = `${entry.studentId}:${entry.subjectId}:${entry.academicYearId}`
      let kkmInfo = kkmCache.get(kkmCacheKey)
      if (!kkmInfo) {
        kkmInfo = await resolveKkmForRemedialScoreEntry({
          studentId: entry.studentId,
          subjectId: entry.subjectId,
          academicYearId: entry.academicYearId,
        })
        kkmCache.set(kkmCacheKey, kkmInfo)
      }
      const row = formatRemedialScoreEntry(entry, kkmInfo.kkm)
      if (includeAll || !row.isComplete) {
        formatted.push({
          ...row,
          kkmSource: kkmInfo.source,
          classId: kkmInfo.classId,
          classLevel: kkmInfo.classLevel,
        })
      }
    }

    return ApiResponseHelper.success(res, formatted, 'Daftar nilai remedial berhasil diambil.')
  } catch (error) {
    console.error('Get remedial eligible scores error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Gagal mengambil daftar nilai remedial.')
  }
}

export const getScoreRemedials = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const scoreEntryId = toPositiveInt(req.query.score_entry_id || req.query.scoreEntryId)

    if (!scoreEntryId) {
      throw new ApiError(400, 'score_entry_id wajib diisi.')
    }

    const entry = await loadRemedialScoreEntry(scoreEntryId)
    if (!entry) {
      throw new ApiError(404, 'Sumber nilai tidak ditemukan.')
    }

    await assertCanAccessRemedialScoreEntry(user, entry)

    const kkmInfo = await resolveKkmForRemedialScoreEntry({
      studentId: entry.studentId,
      subjectId: entry.subjectId,
      academicYearId: entry.academicYearId,
    })

    return ApiResponseHelper.success(
      res,
      {
        ...formatRemedialScoreEntry(entry, kkmInfo.kkm),
        kkmSource: kkmInfo.source,
        classId: kkmInfo.classId,
        classLevel: kkmInfo.classLevel,
      },
      'Riwayat remedial berhasil diambil.',
    )
  } catch (error) {
    console.error('Get score remedials error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Gagal mengambil riwayat remedial.')
  }
}

export const createScoreRemedial = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const scoreEntryId = toPositiveInt(req.body?.score_entry_id || req.body?.scoreEntryId)
    const remedialScore = parseOptionalScoreValue(
      req.body?.remedial_score ?? req.body?.remedialScore,
      'Nilai remedial',
    )
    const method = normalizeScoreRemedialMethod(req.body?.method || req.body?.remedialMethod)
    const activityTitle = normalizeOptionalRemedialText(
      req.body?.activity_title ?? req.body?.activityTitle,
      160,
    )
    const activityInstructions = normalizeOptionalRemedialText(
      req.body?.activity_instructions ?? req.body?.activityInstructions,
      2000,
    )
    const activityDueAt = normalizeOptionalRemedialDate(
      req.body?.activity_due_at ?? req.body?.activityDueAt,
    )
    const activityReferenceUrl = normalizeOptionalRemedialText(
      req.body?.activity_reference_url ?? req.body?.activityReferenceUrl,
      500,
    )
    const note = String(req.body?.note || '').trim() || null

    if (!scoreEntryId) {
      throw new ApiError(400, 'score_entry_id wajib diisi.')
    }
    if (remedialScore === undefined || remedialScore === null) {
      throw new ApiError(400, 'Nilai remedial wajib diisi.')
    }
    if (method !== ScoreRemedialMethod.MANUAL_SCORE && !activityTitle && !activityInstructions && !activityReferenceUrl) {
      throw new ApiError(400, 'Isi judul, instruksi, atau tautan remedial untuk metode tugas/soal.')
    }

    const entry = await loadRemedialScoreEntry(scoreEntryId)
    if (!entry) {
      throw new ApiError(404, 'Sumber nilai tidak ditemukan.')
    }

    await assertCanAccessRemedialScoreEntry(user, entry)

    const kkmInfo = await resolveKkmForRemedialScoreEntry({
      studentId: entry.studentId,
      subjectId: entry.subjectId,
      academicYearId: entry.academicYearId,
    })
    const summary = summarizeRemedialState(Number(entry.score), kkmInfo.kkm, entry.remedials)

    if (summary.currentEffectiveScore >= kkmInfo.kkm) {
      throw new ApiError(400, 'Nilai siswa sudah tuntas. Remedial baru tidak diperlukan.')
    }

    const maxAttempt = entry.remedials.reduce(
      (latest, row) => Math.max(latest, Number(row.attemptNumber || 0)),
      0,
    )
    const effectiveScore = resolveRemedialEffectiveScore({
      originalScore: summary.originalScore,
      previousEffectiveScore: summary.currentEffectiveScore,
      remedialScore,
      kkm: kkmInfo.kkm,
    })
    const status =
      effectiveScore >= kkmInfo.kkm
        ? ScoreRemedialStatus.PASSED
        : ScoreRemedialStatus.STILL_BELOW_KKM

    const remedial = await prisma.studentScoreRemedial.create({
      data: {
        scoreEntryId: entry.id,
        attemptNumber: maxAttempt + 1,
        originalScore: summary.originalScore,
        previousEffectiveScore: summary.currentEffectiveScore,
        remedialScore: roundRemedialScore(remedialScore),
        effectiveScore,
        kkm: kkmInfo.kkm,
        status,
        method,
        activityTitle,
        activityInstructions,
        activityDueAt,
        activityReferenceUrl,
        note,
        recordedById: toPositiveInt(user?.id) || null,
      },
    })

    const reportSync = await syncReportGradeSafely(
      entry.studentId,
      entry.subjectId,
      entry.academicYearId,
      entry.semester,
    )

    emitGradeRealtimeRefresh({
      studentIds: [entry.studentId],
      subjectIds: [entry.subjectId],
      academicYearIds: [entry.academicYearId],
      semesters: [entry.semester],
      includeReports: reportSync.success,
    })

    return ApiResponseHelper.success(
      res,
      {
        remedial,
        effectiveScore,
        kkm: kkmInfo.kkm,
        status,
        reportSync,
      },
      reportSync.success
        ? 'Nilai remedial berhasil disimpan.'
        : 'Nilai remedial tersimpan, tetapi sinkronisasi rapor gagal. Silakan cek ulang.',
    )
  } catch (error) {
    console.error('Create score remedial error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Gagal menyimpan nilai remedial.')
  }
}

function formatRemedialMethodLabel(method: ScoreRemedialMethod) {
  if (method === ScoreRemedialMethod.ASSIGNMENT) return 'Tugas remedial'
  if (method === ScoreRemedialMethod.QUESTION_SET) return 'Soal/quiz remedial'
  return 'Input nilai manual'
}

function formatRemedialStatusLabel(status: ScoreRemedialStatus) {
  if (status === ScoreRemedialStatus.PASSED) return 'Tuntas'
  if (status === ScoreRemedialStatus.STILL_BELOW_KKM) return 'Masih remedial'
  if (status === ScoreRemedialStatus.DRAFT) return 'Draft'
  if (status === ScoreRemedialStatus.CANCELLED) return 'Dibatalkan'
  return 'Tercatat'
}

export const getStudentRemedialActivities = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const studentId = Number(user?.id || 0)

    if (String(user?.role || '').toUpperCase() !== 'STUDENT' || !Number.isFinite(studentId) || studentId <= 0) {
      throw new ApiError(403, 'Fitur ini hanya tersedia untuk siswa.')
    }

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    })

    if (!activeYear) {
      throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan.')
    }

    const semester = parseStudentReportSemester(req.query.semester)
    const limit = Math.min(Math.max(toPositiveInt(req.query.limit) || 100, 1), 150)
    const student = await getHistoricalStudentSnapshotForAcademicYear(studentId, activeYear.id)

    const rows = await prisma.studentScoreRemedial.findMany({
      where: {
        method: {
          in: [ScoreRemedialMethod.ASSIGNMENT, ScoreRemedialMethod.QUESTION_SET],
        },
        status: {
          not: ScoreRemedialStatus.CANCELLED,
        },
        OR: [
          { activityTitle: { not: null } },
          { activityInstructions: { not: null } },
          { activityReferenceUrl: { not: null } },
        ],
        scoreEntry: {
          studentId,
          academicYearId: activeYear.id,
          ...(semester ? { semester } : {}),
        },
      },
      include: {
        scoreEntry: {
          select: {
            id: true,
            studentId: true,
            subjectId: true,
            academicYearId: true,
            semester: true,
            componentCode: true,
            componentType: true,
            componentTypeCode: true,
            reportSlot: true,
            reportSlotCode: true,
            sourceType: true,
            sourceKey: true,
            metadata: true,
            score: true,
            subject: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ activityDueAt: 'asc' }, { recordedAt: 'desc' }],
      take: limit,
    })

    const subjectIds = uniqPositiveNumbers(rows.map((row) => row.scoreEntry.subjectId))
    const recordedByIds = uniqPositiveNumbers(rows.map((row) => row.recordedById))
    const classId = Number(student?.studentClass?.id || 0)

    const [assignments, recordedByUsers] = await Promise.all([
      subjectIds.length > 0 && classId > 0
        ? prisma.teacherAssignment.findMany({
            where: {
              academicYearId: activeYear.id,
              classId,
              subjectId: { in: subjectIds },
            },
            select: {
              subjectId: true,
              teacher: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      recordedByIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: recordedByIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ])

    const teacherBySubject = new Map<number, { id: number; name: string }>()
    assignments.forEach((row) => {
      if (!teacherBySubject.has(row.subjectId)) teacherBySubject.set(row.subjectId, row.teacher)
    })
    const recordedByName = new Map(recordedByUsers.map((row) => [row.id, row.name]))

    const formatted = rows.map((row) => {
      const scoreEntry = row.scoreEntry
      const assignmentTeacher = teacherBySubject.get(scoreEntry.subjectId) || null
      const recordedById = Number(row.recordedById || 0)
      const recordedBy = recordedById > 0 && recordedByName.has(recordedById)
        ? { id: recordedById, name: recordedByName.get(recordedById) || '-' }
        : assignmentTeacher

      return {
        id: row.id,
        scoreEntryId: row.scoreEntryId,
        attemptNumber: row.attemptNumber,
        method: row.method,
        methodLabel: formatRemedialMethodLabel(row.method),
        activityTitle: row.activityTitle,
        activityInstructions: row.activityInstructions,
        activityDueAt: row.activityDueAt,
        activityReferenceUrl: row.activityReferenceUrl,
        sourceLabel: formatRemedialSourceLabel(scoreEntry),
        originalScore: roundRemedialScore(Number(row.originalScore)),
        remedialScore: roundRemedialScore(Number(row.remedialScore)),
        effectiveScore: roundRemedialScore(Number(row.effectiveScore)),
        kkm: row.kkm,
        status: row.status,
        statusLabel: formatRemedialStatusLabel(row.status),
        recordedAt: row.recordedAt,
        semester: scoreEntry.semester,
        subject: scoreEntry.subject,
        teacher: recordedBy,
        academicYear: activeYear,
      }
    })

    return ApiResponseHelper.success(res, formatted, 'Aktivitas remedial siswa berhasil diambil.')
  } catch (error) {
    console.error('Get student remedial activities error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Gagal mengambil aktivitas remedial siswa.')
  }
}

export const resyncStudentReligionReportDescriptions = async (studentId: number) => {
  const normalizedStudentId = Number(studentId || 0);
  if (!Number.isFinite(normalizedStudentId) || normalizedStudentId <= 0) {
    return { scanned: 0, updated: 0 };
  }

  const rows = await prisma.reportGrade.findMany({
    where: {
      studentId: normalizedStudentId,
    },
    include: {
      subject: {
        select: {
          name: true,
          code: true,
        },
      },
    },
  });

  const targetRows = rows.filter((row) => isReligionCompetencySubject(row.subject));
  let updated = 0;

  await runWithConcurrencyLimit(targetRows, 5, async (row) => {
    const nextDescription = await resolveReportCompetencyDescription({
      studentId: row.studentId,
      subjectId: row.subjectId,
      academicYearId: row.academicYearId,
      semester: row.semester,
      finalScore: row.finalScore,
      predicate: row.predicate,
    });

    if (String(nextDescription || '') === String(row.description || '')) {
      return;
    }

    await prisma.reportGrade.update({
      where: { id: row.id },
      data: {
        description: nextDescription,
      },
    });
    updated += 1;
  });

  return { scanned: targetRows.length, updated };
};

// ============================================
// STUDENT GRADES (Input Nilai per Komponen)
// ============================================

export const getStudentGrades = async (req: Request, res: Response) => {
  try {
    const { 
      student_id, 
      subject_id, 
      academic_year_id, 
      semester,
      class_id 
    } = req.query

    const where: any = {}
    const user = (req as any).user as AuthUserLike
    const parsedStudentId = toPositiveInt(student_id)
    const parsedSubjectId = toPositiveInt(subject_id)
    const parsedAcademicYearId = toPositiveInt(academic_year_id)
    const parsedClassId = toPositiveInt(class_id)
    let resolvedAcademicYearId = parsedAcademicYearId
    // Security: Student can only view their own grades
    if (String(user?.role || '').toUpperCase() === 'STUDENT') {
      where.studentId = user.id
    } else {
      if (isTeacherUser(user)) {
        if (!parsedSubjectId || !parsedAcademicYearId) {
          throw new ApiError(400, 'subject_id dan academic_year_id wajib diisi untuk akses nilai guru.')
        }
        if (!parsedClassId && !parsedStudentId) {
          throw new ApiError(400, 'Guru wajib memilih class_id atau student_id untuk melihat nilai.')
        }
        await ensureTeacherCanAccessGradeContext({
          user,
          subjectId: parsedSubjectId,
          academicYearId: parsedAcademicYearId,
          classId: parsedClassId,
          studentId: parsedStudentId,
        })
      }

      if (parsedStudentId) where.studentId = parsedStudentId

      // If class_id is provided (and not student), filter by students in that class
      if (parsedClassId) {
        const classScope = await resolveHistoricalStudentScope({
          academicYearId: parsedAcademicYearId,
          classId: parsedClassId,
        })
        resolvedAcademicYearId = resolvedAcademicYearId || classScope.academicYearId
        where.studentId = { in: classScope.studentIds.length > 0 ? classScope.studentIds : [-1] }
      }
    }

    if (parsedSubjectId) where.subjectId = parsedSubjectId
    if (resolvedAcademicYearId) where.academicYearId = resolvedAcademicYearId
    if (semester) where.semester = semester as Semester

    const grades = await prisma.studentGrade.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nisn: true,
            nis: true,
            classId: true,
            studentClass: {
              select: {
                academicYearId: true,
              },
            },
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        component: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            typeCode: true,
            weight: true
          }
        },
        academicYear: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { student: { name: 'asc' } },
        { component: { type: 'asc' } }
      ]
    })

    const historicalStudentSnapshotMap = await buildHistoricalStudentSnapshotMap(
      grades.map((grade) => ({
        studentId: Number(grade.studentId),
        academicYearId: Number(grade.academicYearId),
      })),
    )

    const gradesWithHistoricalStudents = grades.map((grade) => {
      const historicalClassId = resolveHistoricalStudentClassId({
        snapshotMap: historicalStudentSnapshotMap,
        studentId: Number(grade.studentId),
        academicYearId: Number(grade.academicYearId),
        fallbackClassId: grade.student?.classId,
        fallbackClassAcademicYearId: grade.student?.studentClass?.academicYearId,
      })

      return {
        ...grade,
        student: grade.student
          ? {
              id: grade.student.id,
              name: grade.student.name,
              nisn: grade.student.nisn,
              nis: grade.student.nis,
              classId: historicalClassId,
            }
          : grade.student,
      }
    })

    // Fetch KKM data
    let gradesWithKkm = [...gradesWithHistoricalStudents] as any[];
    
    // We need to attach KKM. 
    // If we have a single student, we can look up their class level.
    // If multiple students, we might need to look up each.
    // For optimization, if user.role === STUDENT, we know the student.
    
    if (gradesWithHistoricalStudents.length > 0) {
      // Get all unique class IDs involved
      const classIds = [
        ...new Set(
          gradesWithHistoricalStudents
            .map((grade) => Number(grade.student?.classId || 0))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ];
      
      if (classIds.length > 0) {
        const classes = await prisma.class.findMany({
          where: { id: { in: classIds as number[] } },
          select: { id: true, level: true }
        });
        
        const classLevelMap = new Map(classes.map(c => [c.id, c.level]));
        const levels = [...new Set(classes.map(c => c.level))];
        const academicYearIds = [
          ...new Set(
            gradesWithHistoricalStudents
              .map((grade) => Number(grade.academicYearId))
              .filter((id) => Number.isFinite(id) && id > 0),
          ),
        ]

        // Fetch KKMs for these levels and subjects
        const subjectIds = [...new Set(gradesWithHistoricalStudents.map(g => g.subjectId))];
        
        const kkms = await prisma.subjectKKM.findMany({
          where: {
            subjectId: { in: subjectIds },
            academicYearId: { in: academicYearIds },
            classLevel: { in: levels }
          }
        });

        // Map KKMs for easy lookup: academicYearId-subjectId-level -> kkm
        const kkmMap = new Map<string, number>();
        kkms.forEach(k => {
          kkmMap.set(`${k.academicYearId}-${k.subjectId}-${k.classLevel}`, k.kkm);
        });

        gradesWithKkm = gradesWithHistoricalStudents.map(grade => {
          const classLevel = grade.student?.classId ? classLevelMap.get(grade.student.classId) : null;
          let kkm = 75; // Default
          
          if (classLevel) {
            const foundKkm = kkmMap.get(`${grade.academicYearId}-${grade.subjectId}-${classLevel}`);
            if (foundKkm !== undefined) kkm = foundKkm;
          }
          
          return {
            ...grade,
            kkm
          };
        });
      }
    }

    const latestGradesByComposite = new Map<string, any>()
    for (const row of gradesWithKkm) {
      const key = buildStudentGradeCompositeKey({
        studentId: row.studentId,
        subjectId: row.subjectId,
        academicYearId: row.academicYearId,
        componentId: row.componentId,
        semester: row.semester,
      })
      if (!key) continue
      const previous = latestGradesByComposite.get(key)
      if (!previous || Number(row.id) >= Number(previous.id)) {
        latestGradesByComposite.set(key, row)
      }
    }

    const formattedGradesWithSeries = Array.from(latestGradesByComposite.values()).sort((a, b) => {
      const studentCompare = String(a.student?.name || '').localeCompare(String(b.student?.name || ''))
      if (studentCompare !== 0) return studentCompare
      const componentTypeCompare = String(a.component?.type || '').localeCompare(String(b.component?.type || ''))
      if (componentTypeCompare !== 0) return componentTypeCompare
      return Number(a.id) - Number(b.id)
    }) as any[]

    const formativeSlotCountByComposite = new Map<
      string,
      {
        studentId: number
        subjectId: number
        academicYearId: number
        componentId: number
        semester: Semester
        slotCount: number
      }
    >()
    const studentScoreEntryDelegate = getStudentScoreEntryDelegate()
    const formativeSlotCountEntries =
      studentScoreEntryDelegate && parsedSubjectId && resolvedAcademicYearId && semester
        ? ((await studentScoreEntryDelegate.findMany({
            where: {
              sourceType: 'MANUAL_GRADE',
              sourceKey: {
                startsWith: FORMATIVE_SLOT_COUNT_SOURCE_PREFIX,
              },
              subjectId: parsedSubjectId,
              academicYearId: resolvedAcademicYearId,
              semester: semester as Semester,
              ...(where.studentId ? { studentId: where.studentId } : {}),
            },
            select: {
              studentId: true,
              subjectId: true,
              academicYearId: true,
              semester: true,
              metadata: true,
            },
          })) as Array<{
            studentId: number
            subjectId: number
            academicYearId: number
            semester: Semester
            metadata?: unknown
          }>)
        : []

    for (const entry of formativeSlotCountEntries) {
      const parsedMetadata = parseFormativeSlotCountMetadata(entry.metadata)
      if (!parsedMetadata || parsedMetadata.slotCount <= 0) continue
      const compositeKey = buildStudentGradeCompositeKey({
        studentId: entry.studentId,
        subjectId: entry.subjectId,
        academicYearId: entry.academicYearId,
        componentId: parsedMetadata.componentId,
        semester: entry.semester,
      })
      if (!compositeKey) continue
      formativeSlotCountByComposite.set(compositeKey, {
        studentId: Number(entry.studentId),
        subjectId: Number(entry.subjectId),
        academicYearId: Number(entry.academicYearId),
        componentId: Number(parsedMetadata.componentId),
        semester: entry.semester,
        slotCount: parsedMetadata.slotCount,
      })
    }

    const existingCompositeKeys = new Set<string>(
      formattedGradesWithSeries
        .map((row) =>
          buildStudentGradeCompositeKey({
            studentId: row.studentId,
            subjectId: row.subjectId,
            academicYearId: row.academicYearId,
            componentId: row.componentId,
            semester: row.semester,
          }),
        )
        .filter(Boolean),
    )

    const missingFormativeSlotRows = Array.from(formativeSlotCountByComposite.values()).filter(
      (row) => row.slotCount > 0 && !existingCompositeKeys.has(buildStudentGradeCompositeKey(row)),
    )

    if (missingFormativeSlotRows.length > 0) {
      const missingStudentIds = uniqPositiveNumbers(missingFormativeSlotRows.map((row) => row.studentId))
      const missingComponentIds = uniqPositiveNumbers(missingFormativeSlotRows.map((row) => row.componentId))
      const fallbackStudentRows = await prisma.user.findMany({
        where: {
          id: {
            in: missingStudentIds,
          },
        },
        select: {
          id: true,
          name: true,
          nisn: true,
          nis: true,
          classId: true,
          studentClass: {
            select: {
              academicYearId: true,
            },
          },
        },
      })
      const fallbackComponentRows = await prisma.gradeComponent.findMany({
        where: {
          id: {
            in: missingComponentIds,
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          typeCode: true,
          weight: true,
        },
      })
      const fallbackStudentSnapshotMap = await buildHistoricalStudentSnapshotMap(
        missingFormativeSlotRows.map((row) => ({
          studentId: row.studentId,
          academicYearId: row.academicYearId,
        })),
      )
      const fallbackStudentMap = new Map(
        fallbackStudentRows.map((row) => {
          const historicalClassId = resolveHistoricalStudentClassId({
            snapshotMap: fallbackStudentSnapshotMap,
            studentId: Number(row.id),
            academicYearId: resolvedAcademicYearId || Number(parsedAcademicYearId || 0),
            fallbackClassId: row.classId,
            fallbackClassAcademicYearId: row.studentClass?.academicYearId,
          })
          return [
            Number(row.id),
            {
              id: row.id,
              name: row.name,
              nisn: row.nisn,
              nis: row.nis,
              classId: historicalClassId,
            },
          ]
        }),
      )
      const fallbackComponentMap = new Map(fallbackComponentRows.map((row) => [Number(row.id), row]))
      const fallbackSubject = gradesWithKkm[0]?.subject || (
        parsedSubjectId
          ? await prisma.subject.findUnique({
              where: { id: parsedSubjectId },
              select: {
                id: true,
                code: true,
                name: true,
              },
            })
          : null
      )
      const fallbackAcademicYear = gradesWithKkm[0]?.academicYear || (
        resolvedAcademicYearId
          ? await prisma.academicYear.findUnique({
              where: { id: resolvedAcademicYearId },
              select: {
                id: true,
                name: true,
              },
            })
          : null
      )

      missingFormativeSlotRows.forEach((row, index) => {
        const student = fallbackStudentMap.get(Number(row.studentId))
        const component = fallbackComponentMap.get(Number(row.componentId))
        if (!student || !component) return
        formattedGradesWithSeries.push({
          id: -1 * (index + 1),
          studentId: Number(row.studentId),
          subjectId: Number(row.subjectId),
          academicYearId: Number(row.academicYearId),
          componentId: Number(row.componentId),
          semester: row.semester,
          score: null,
          nf1: null,
          nf2: null,
          nf3: null,
          nf4: null,
          nf5: null,
          nf6: null,
          formativeSeries: [],
          formativeSlotCount: row.slotCount,
          kkm: 75,
          student,
          subject: fallbackSubject,
          component,
          academicYear: fallbackAcademicYear,
        })
      })

      formattedGradesWithSeries.sort((a, b) => {
        const studentCompare = String(a.student?.name || '').localeCompare(String(b.student?.name || ''))
        if (studentCompare !== 0) return studentCompare
        const componentTypeCompare = String(a.component?.type || '').localeCompare(String(b.component?.type || ''))
        if (componentTypeCompare !== 0) return componentTypeCompare
        return Number(a.id) - Number(b.id)
      })
    }

    if (formattedGradesWithSeries.length > 0) {
      const gradeIdSet = new Set<number>(formattedGradesWithSeries.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)))
      const studentIds = Array.from(
        new Set(formattedGradesWithSeries.map((row) => Number(row.studentId)).filter((id) => Number.isFinite(id))),
      )
      const subjectIds = Array.from(
        new Set(formattedGradesWithSeries.map((row) => Number(row.subjectId)).filter((id) => Number.isFinite(id))),
      )
      const academicYearIds = Array.from(
        new Set(formattedGradesWithSeries.map((row) => Number(row.academicYearId)).filter((id) => Number.isFinite(id))),
      )
      const semesters = Array.from(
        new Set(
          formattedGradesWithSeries
            .map((row) => row.semester)
            .filter((value): value is Semester => value === Semester.ODD || value === Semester.EVEN),
        ),
      )
      const componentCodes = Array.from(
        new Set(
          formattedGradesWithSeries
            .map((row) => normalizeComponentCode(row.component?.code))
            .filter(Boolean),
        ),
      )

      const entryModeByCode = new Map<string, string>()
      if (academicYearIds.length > 0 && componentCodes.length > 0) {
        try {
          const componentRules = (await (prisma.examGradeComponent as any).findMany({
            where: {
              academicYearId: { in: academicYearIds },
              code: { in: componentCodes },
            },
            select: {
              code: true,
              entryMode: true,
              entryModeCode: true,
            },
          })) as Array<{
            code: string
            entryMode?: GradeEntryMode | null
            entryModeCode?: string | null
          }>
          componentRules.forEach((row) => {
            entryModeByCode.set(
              normalizeComponentCode(row.code),
              normalizeComponentCode(row.entryModeCode || row.entryMode || ''),
            )
          })
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            (error.code !== 'P2021' && error.code !== 'P2022')
          ) {
            console.error('Failed to load dynamic entry modes for student grades:', error)
          }
        }
      }

      if (studentIds.length > 0 && subjectIds.length > 0 && academicYearIds.length > 0 && semesters.length > 0) {
        const scoreEntries = studentScoreEntryDelegate
          ? ((await studentScoreEntryDelegate.findMany({
              where: {
                sourceType: 'MANUAL_GRADE',
                sourceKey: {
                  startsWith: 'studentGrade:',
                },
                studentId: {
                  in: studentIds,
                },
                subjectId: {
                  in: subjectIds,
                },
                academicYearId: {
                  in: academicYearIds,
                },
                semester: {
                  in: semesters,
                },
              },
              select: {
                sourceKey: true,
                score: true,
              },
            })) as Array<{ sourceKey: string | null; score: number | null }>)
          : []

        const seriesMap = new Map<number, Array<{ order: number; value: number }>>()
        const scoreFallbackMap = new Map<number, number>()

        for (const entry of scoreEntries) {
          const match = /^studentGrade:(\d+):(nf(\d+)|nf_extra:(\d+)|score)$/i.exec(String(entry.sourceKey || ''))
          if (!match) continue
          const gradeId = Number(match[1])
          if (!Number.isFinite(gradeId) || !gradeIdSet.has(gradeId)) continue
          const scoreValue = Number(entry.score)
          if (!Number.isFinite(scoreValue)) continue

          const directNfOrder = Number(match[3])
          const extraNfOrder = Number(match[4])
          if (Number.isFinite(directNfOrder) && directNfOrder > 0) {
            const rows = seriesMap.get(gradeId) || []
            rows.push({ order: directNfOrder, value: scoreValue })
            seriesMap.set(gradeId, rows)
            continue
          }
          if (Number.isFinite(extraNfOrder) && extraNfOrder > 0) {
            const rows = seriesMap.get(gradeId) || []
            rows.push({ order: extraNfOrder, value: scoreValue })
            seriesMap.set(gradeId, rows)
            continue
          }
          if (String(match[2] || '').toLowerCase() === 'score') {
            scoreFallbackMap.set(gradeId, scoreValue)
          }
        }

        for (const row of formattedGradesWithSeries) {
          const componentCode = normalizeComponentCode(
            row.component?.code || row.component?.typeCode || row.component?.type,
          )
          const configuredEntryMode = componentCode ? entryModeByCode.get(componentCode) : null
          const inferredEntryMode = normalizeComponentCode(
            configuredEntryMode || defaultGradeEntryModeByCode(componentCode),
          )
          const isNfSeries = inferredEntryMode === 'NF_SERIES'
          if (!isNfSeries) continue
          const nfRows = (seriesMap.get(Number(row.id)) || []).sort((a, b) => a.order - b.order)
          if (nfRows.length > 0) {
            row.formativeSeries = sanitizeLegacyFormativeSeries(nfRows.map((item) => item.value))
          } else {
            const fallbackScore = scoreFallbackMap.get(Number(row.id))
            if (fallbackScore !== undefined) {
              row.formativeSeries = [fallbackScore]
            } else {
              const legacySeries = sanitizeLegacyFormativeSeries(
                [row.nf1, row.nf2, row.nf3, row.nf4, row.nf5, row.nf6],
                row.score,
              )
              if (legacySeries.length > 0) {
                row.formativeSeries = legacySeries
              }
            }
          }
          const compositeKey = buildStudentGradeCompositeKey({
            studentId: row.studentId,
            subjectId: row.subjectId,
            academicYearId: row.academicYearId,
            componentId: row.componentId,
            semester: row.semester,
          })
          const savedSlotCount = formativeSlotCountByComposite.get(compositeKey)?.slotCount || 0
          row.formativeSlotCount = Math.max(
            savedSlotCount,
            Array.isArray(row.formativeSeries) ? row.formativeSeries.length : 0,
          )
        }
      }
    }

    formattedGradesWithSeries.forEach((row) => {
      const compositeKey = buildStudentGradeCompositeKey({
        studentId: row.studentId,
        subjectId: row.subjectId,
        academicYearId: row.academicYearId,
        componentId: row.componentId,
        semester: row.semester,
      })
      const savedSlotCount = formativeSlotCountByComposite.get(compositeKey)?.slotCount || 0
      if (savedSlotCount > 0) {
        row.formativeSlotCount = Math.max(
          Number(row.formativeSlotCount || 0),
          savedSlotCount,
          Array.isArray(row.formativeSeries) ? row.formativeSeries.length : 0,
        )
      }
    })

    return ApiResponseHelper.success(res, formattedGradesWithSeries, 'Student grades retrieved successfully')
  } catch (error) {
    console.error('Get student grades error:', error)
    throw new ApiError(500, 'Failed to retrieve student grades')
  }
}

export const getStudentGradeOverview = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const studentId = Number(user?.id || 0)

    if (String(user?.role || '').toUpperCase() !== 'STUDENT' || !Number.isFinite(studentId) || studentId <= 0) {
      throw new ApiError(403, 'Fitur ini hanya tersedia untuk siswa.')
    }

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        semester1Start: true,
        semester1End: true,
        semester2Start: true,
        semester2End: true,
      },
    })

    if (!activeYear) {
      throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan.')
    }

    const semester = resolveCurrentSemesterFromAcademicYear(activeYear)
    const programSemester =
      parseStudentReportSemester(req.query.program_semester) ||
      parseStudentReportSemester(req.query.programSemester) ||
      semester
    const reportSemester =
      parseStudentReportSemester(req.query.report_semester) ||
      parseStudentReportSemester(req.query.reportSemester) ||
      semester
    const student = await getHistoricalStudentSnapshotForAcademicYear(studentId, activeYear.id)

    if (!student || !student.studentClass) {
      throw new ApiError(404, 'Data siswa atau kelas aktif tidak ditemukan.')
    }

    const reportSemesterRange = resolveSemesterRange(activeYear, reportSemester)
    const reportCardType = reportSemester === Semester.ODD ? ExamType.SAS : ExamType.SAT
    const reportGradesPromise = prisma.reportGrade.findMany({
      where: {
        studentId,
        academicYearId: activeYear.id,
        semester: reportSemester,
      },
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ id: 'desc' }],
    })
    const programSemesterReportGradesPromise =
      reportSemester === programSemester
        ? reportGradesPromise
        : prisma.reportGrade.findMany({
            where: {
              studentId,
              academicYearId: activeYear.id,
              semester: programSemester,
            },
            include: {
              subject: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
            orderBy: [{ id: 'desc' }],
          })

    const [
      teacherAssignments,
      reportGrades,
      programSemesterReportGrades,
      studentGrades,
      examGradeComponents,
      examPrograms,
      reportDateRows,
      homeroomPublicationClass,
      attendanceStats,
      dailyPresenceRows,
      homeroomNote,
    ] = await Promise.all([
      prisma.teacherAssignment.findMany({
        where: {
          academicYearId: activeYear.id,
          classId: student.studentClass.id,
        },
        include: {
          scheduleEntries: {
            select: {
              id: true,
            },
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          subject: {
            name: 'asc',
          },
        },
      }),
      reportGradesPromise,
      programSemesterReportGradesPromise,
      prisma.studentGrade.findMany({
        where: {
          studentId,
          academicYearId: activeYear.id,
          semester: programSemester,
        },
        include: {
          component: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              typeCode: true,
              weight: true,
            },
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: [{ id: 'desc' }],
      }),
      prisma.examGradeComponent.findMany({
        where: {
          academicYearId: activeYear.id,
          isActive: true,
        },
        select: {
          code: true,
          label: true,
          type: true,
          typeCode: true,
          reportSlot: true,
          reportSlotCode: true,
          entryMode: true,
          entryModeCode: true,
          includeInFinalScore: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.examProgramConfig.findMany({
        where: {
          academicYearId: activeYear.id,
          isActive: true,
          showOnStudentMenu: true,
        },
        select: {
          code: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentCode: true,
          fixedSemester: true,
          studentResultPublishMode: true,
          studentResultPublishAt: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.reportDate.findMany({
        where: {
          academicYearId: activeYear.id,
        },
        select: {
          semester: true,
          place: true,
          date: true,
          reportType: true,
        },
        orderBy: [{ semester: 'asc' }, { reportType: 'asc' }],
      }),
      prisma.class.findUnique({
        where: {
          id: student.studentClass.id,
        },
        select: {
          id: true,
          teacher: {
            select: {
              id: true,
              name: true,
              preferences: true,
            },
          },
        },
      }),
      prisma.dailyAttendance.groupBy({
        by: ['status'],
        where: {
          studentId,
          academicYearId: activeYear.id,
          date: {
            gte: reportSemesterRange.start,
            lte: reportSemesterRange.end,
          },
        },
        _count: {
          status: true,
        },
      }),
      prisma.dailyAttendance.findMany({
        where: {
          studentId,
          academicYearId: activeYear.id,
          date: {
            gte: reportSemesterRange.start,
            lte: reportSemesterRange.end,
          },
        },
        select: {
          checkInTime: true,
          checkOutTime: true,
        },
      }),
      prisma.reportNote.findFirst({
        where: {
          studentId,
          academicYearId: activeYear.id,
          semester: reportSemester,
          type: 'CATATAN_WALI_KELAS',
        },
        select: {
          note: true,
        },
      }),
    ])

    const reportBySubjectId = new Map<number, (typeof reportGrades)[number]>()
    reportGrades.forEach((row) => {
      if (!reportBySubjectId.has(row.subjectId)) {
        reportBySubjectId.set(row.subjectId, row)
      }
    })

    const programReportBySubjectId = new Map<number, (typeof programSemesterReportGrades)[number]>()
    programSemesterReportGrades.forEach((row) => {
      if (!programReportBySubjectId.has(row.subjectId)) {
        programReportBySubjectId.set(row.subjectId, row)
      }
    })

    const latestStudentGradeByComposite = new Map<string, (typeof studentGrades)[number]>()
    const formativeSeriesBySubjectId = new Map<number, number[]>()
    studentGrades.forEach((row) => {
      const componentCode = normalizeComponentCode(
        row.component?.code || row.component?.typeCode || row.component?.type,
      )
      const key = `${row.subjectId}:${componentCode}`
      if (!latestStudentGradeByComposite.has(key)) {
        latestStudentGradeByComposite.set(key, row)
      }
      if (isFormativeAliasCode(componentCode) && !formativeSeriesBySubjectId.has(row.subjectId)) {
        const series = sanitizeLegacyFormativeSeries(
          [row.nf1, row.nf2, row.nf3, row.nf4, row.nf5, row.nf6],
          row.score,
        )
        if (series.length > 0) {
          formativeSeriesBySubjectId.set(row.subjectId, series)
        } else if (row.score !== null && row.score !== undefined && Number.isFinite(Number(row.score))) {
          formativeSeriesBySubjectId.set(row.subjectId, [Number(row.score)])
        }
      }
    })

    const hasUsScores = programSemesterReportGrades.some(
      (row) =>
        hasUsSlotInScoreMap(row.slotScores) ||
        (row.usScore !== null && row.usScore !== undefined),
    )

    const reportDateByKey = buildStudentReleaseReportDateLookup(reportDateRows)
    const reportDate =
      reportDateByKey.get(buildStudentReleaseReportDateKey(reportSemester, reportCardType)) || null
    const overviewComponentRuleMap = buildExamComponentRuleMapFromRows(examGradeComponents)
    const blockedPublicationCodes = listBlockedHomeroomResultPublicationCodes({
      preferences: homeroomPublicationClass?.teacher?.preferences,
      academicYearId: activeYear.id,
      classId: student.studentClass.id,
      studentId: studentId,
    })
    const studentProgramReleaseLookup = buildStudentProgramReleaseLookup({
      programs: examPrograms,
      componentRuleMap: overviewComponentRuleMap,
      reportDateByKey,
      activeSemester: programSemester,
      blockedPublicationCodes,
    })

    const componentCatalog = buildStudentOverviewComponents({
      components: examGradeComponents.map((row) => ({
        code: row.code,
        label: row.label,
        type: row.type,
        typeCode: row.typeCode,
        reportSlot: row.reportSlot,
        reportSlotCode: row.reportSlotCode,
        entryMode: row.entryMode,
        entryModeCode: row.entryModeCode,
        includeInFinalScore: row.includeInFinalScore,
        displayOrder: row.displayOrder,
      })),
      semester: programSemester,
      classLevel: student.studentClass.level,
      hasUsScores,
      releaseByProgramCode: studentProgramReleaseLookup.byProgramCode,
      releaseBySlotCode: studentProgramReleaseLookup.bySlotCode,
      reportDateByKey,
      blockedPublicationCodes,
    })

    const assignmentBySubjectId = new Map<number, (typeof teacherAssignments)[number]>()
    teacherAssignments.forEach((row) => {
      if (!assignmentBySubjectId.has(row.subjectId)) {
        assignmentBySubjectId.set(row.subjectId, row)
      }
    })

    const subjectIds = Array.from(
      new Set([
        ...teacherAssignments.map((row) => Number(row.subjectId)),
        ...reportGrades.map((row) => Number(row.subjectId)),
        ...studentGrades.map((row) => Number(row.subjectId)),
      ].filter((value) => Number.isFinite(value) && value > 0)),
    )

    const missingSubjectIds = subjectIds.filter((subjectId) => !assignmentBySubjectId.has(subjectId))
    const extraSubjects = missingSubjectIds.length
      ? await prisma.subject.findMany({
          where: {
            id: {
              in: missingSubjectIds,
            },
          },
          select: {
            id: true,
            code: true,
            name: true,
          },
        })
      : []
    const extraSubjectById = new Map(extraSubjects.map((row) => [row.id, row]))

    const subjectRowCandidates = subjectIds
      .map((subjectId) => {
        const assignment = assignmentBySubjectId.get(subjectId) || null
        const fallbackSubject = extraSubjectById.get(subjectId) || null
        const subject = assignment?.subject || fallbackSubject
        if (!subject) return null

        const report = programReportBySubjectId.get(subjectId) || null
        const slotScores = parseSlotScoreMap(report?.slotScores)
        const hasReportSnapshot = hasMeaningfulReportSnapshot(report)

        const components = componentCatalog.map((component) => {
          const componentCode = normalizeComponentCode(component.code || component.reportSlotCode || component.type)
          const gradeRow = latestStudentGradeByComposite.get(`${subjectId}:${componentCode}`) || null
          const formativeSeries =
            component.reportSlotCode === 'FORMATIF'
              ? formativeSeriesBySubjectId.get(subjectId) || []
              : []

          let score: number | null = null
          let source: 'REPORT_GRADE' | 'STUDENT_GRADE' | 'NONE' = 'NONE'
          let available = false

          if (component.reportSlotCode === 'FORMATIF') {
            const slotScore = hasOwnSlotScore(slotScores, 'FORMATIF')
              ? slotScores[normalizeReportSlotCode('FORMATIF')]
              : null
            const reportScore =
              report?.formatifScore !== null && report?.formatifScore !== undefined
                ? Number(report.formatifScore)
                : null
            const seriesAverage = formativeSeries.length > 0 ? calculateAverage(formativeSeries) : null

            if (slotScore !== null && slotScore !== undefined) {
              score = roundDisplayScore(slotScore)
              source = 'REPORT_GRADE'
              available = true
            } else if (reportScore !== null) {
              score = roundDisplayScore(reportScore)
              source = 'REPORT_GRADE'
              available = true
            } else if (seriesAverage !== null) {
              score = roundDisplayScore(seriesAverage)
              source = 'STUDENT_GRADE'
              available = true
            }
          } else if (component.reportSlotCode === 'SBTS') {
            const slotScore = hasOwnSlotScore(slotScores, 'SBTS')
              ? slotScores[normalizeReportSlotCode('SBTS')]
              : null
            const reportScore =
              report?.sbtsScore !== null && report?.sbtsScore !== undefined
                ? Number(report.sbtsScore)
                : null
            if (slotScore !== null && slotScore !== undefined) {
              score = roundDisplayScore(slotScore)
              source = 'REPORT_GRADE'
              available = true
            } else if (reportScore !== null) {
              score = roundDisplayScore(reportScore)
              source = 'REPORT_GRADE'
              available = true
            }
          } else if (component.reportSlotCode === 'SAS') {
            const slotScore = hasOwnSlotScore(slotScores, 'SAS')
              ? slotScores[normalizeReportSlotCode('SAS')]
              : null
            const reportScore =
              report?.sasScore !== null && report?.sasScore !== undefined
                ? Number(report.sasScore)
                : null
            if (slotScore !== null && slotScore !== undefined) {
              score = roundDisplayScore(slotScore)
              source = 'REPORT_GRADE'
              available = true
            } else if (reportScore !== null) {
              score = roundDisplayScore(reportScore)
              source = 'REPORT_GRADE'
              available = true
            }
          } else if (component.reportSlotCode === 'SAT') {
            const satSlot = slotScores[normalizeReportSlotCode('SAT')]
            const finalEvenSlot = slotScores[normalizeReportSlotCode('FINAL_EVEN')]
            if (satSlot !== null && satSlot !== undefined) {
              score = roundDisplayScore(satSlot)
              source = 'REPORT_GRADE'
              available = true
            } else if (finalEvenSlot !== null && finalEvenSlot !== undefined) {
              score = roundDisplayScore(finalEvenSlot)
              source = 'REPORT_GRADE'
              available = true
            }
          } else if (component.reportSlotCode === 'US_THEORY') {
            const theorySlot = slotScores[normalizeReportSlotCode('US_THEORY')]
            const theoryAltSlot = slotScores[normalizeReportSlotCode('US_TEORI')]
            if (theorySlot !== null && theorySlot !== undefined) {
              score = roundDisplayScore(theorySlot)
              source = 'REPORT_GRADE'
              available = true
            } else if (theoryAltSlot !== null && theoryAltSlot !== undefined) {
              score = roundDisplayScore(theoryAltSlot)
              source = 'REPORT_GRADE'
              available = true
            }
          } else if (component.reportSlotCode === 'US_PRACTICE') {
            const practiceSlot = slotScores[normalizeReportSlotCode('US_PRACTICE')]
            const practiceAltSlot = slotScores[normalizeReportSlotCode('US_PRAKTEK')]
            if (practiceSlot !== null && practiceSlot !== undefined) {
              score = roundDisplayScore(practiceSlot)
              source = 'REPORT_GRADE'
              available = true
            } else if (practiceAltSlot !== null && practiceAltSlot !== undefined) {
              score = roundDisplayScore(practiceAltSlot)
              source = 'REPORT_GRADE'
              available = true
            }
          }

          if (!available && gradeRow && score === null && component.reportSlotCode !== 'FORMATIF') {
            const rawScore = normalizeNullableScore(gradeRow.score)
            if (rawScore !== null) {
              score = roundDisplayScore(rawScore)
              source = 'STUDENT_GRADE'
              available = true
            }
          }

          if (!component.release.canViewDetails) {
            score = null
            source = 'NONE'
            available = false
          }

          return {
            code: component.code,
            label: component.label,
            type: component.type,
            reportSlotCode: component.reportSlotCode,
            entryMode: component.entryMode,
            includeInFinalScore: component.includeInFinalScore,
            displayOrder: component.displayOrder,
            release: component.release,
            score,
            series: component.release.canViewDetails ? formativeSeries : [],
            status: available ? 'AVAILABLE' : 'PENDING',
            source,
          }
        })

        const availableCount = components.filter((component) => component.status === 'AVAILABLE').length
        const finalScore = hasReportSnapshot
          ? roundDisplayScore(resolveEffectiveReportFinalScore(report))
          : null
        const predicate = hasReportSnapshot ? String(report?.predicate || '').trim() || null : null
        const description = hasReportSnapshot ? String(report?.description || '').trim() || null : null

        const hasOperationalAssignment = Number(assignment?.scheduleEntries?.length || 0) > 0
        const hasGradeEvidence =
          availableCount > 0 ||
          hasReportSnapshot ||
          finalScore !== null ||
          predicate !== null ||
          description !== null
        const shouldShowToStudent = hasOperationalAssignment || hasGradeEvidence

        return {
          subject: {
            id: subject.id,
            code: subject.code,
            name: subject.name,
          },
          teacher: assignment?.teacher
            ? {
                id: assignment.teacher.id,
                name: assignment.teacher.name,
              }
            : null,
          kkm: Number(assignment?.kkm || 75),
          finalScore,
          predicate,
          description,
          status: availableCount > 0 ? 'AVAILABLE' : 'PENDING',
          componentSummary: {
            totalCount: components.length,
            availableCount,
            pendingCount: components.length - availableCount,
          },
          components,
          visibility: {
          hasOperationalAssignment,
          hasReportSnapshot,
          hasGradeEvidence,
          shouldShowToStudent,
        },
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    const visibleSubjectRows = subjectRowCandidates
      .filter((row) => row.visibility.shouldShowToStudent)
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'id-ID'))

    const reportRelease = applyHomeroomSemesterReportReleaseGate({
      release: resolveStudentSemesterReportRelease({ reportDate }),
      blockedByHomeroom: blockedPublicationCodes.has(normalizeComponentCode(reportCardType)),
    })
    const subjectRows = visibleSubjectRows.map(({ visibility, ...row }) =>
      reportRelease.canViewDetails
        ? row
        : {
            ...row,
            finalScore: null,
            predicate: null,
            description: null,
          },
    )

    const totalAvailableComponents = subjectRows.reduce(
      (sum, row) => sum + row.componentSummary.availableCount,
      0,
    )
    const totalPendingComponents = subjectRows.reduce(
      (sum, row) => sum + row.componentSummary.pendingCount,
      0,
    )
    const finalScores = subjectRows
      .map((row) => row.finalScore)
      .filter((value): value is number => value !== null && value !== undefined)

    const reportCardSubjects = visibleSubjectRows
      .map((row) => {
        const report = reportBySubjectId.get(row.subject.id) || null
        const hasReportData = hasMeaningfulReportSnapshot(report)
        const finalScore = hasReportData ? roundDisplayScore(resolveEffectiveReportFinalScore(report)) : null
        const hasResolvedFinalReport = finalScore !== null
        const predicate = hasReportData ? String(report?.predicate || '').trim() || null : null
        const description = hasReportData ? String(report?.description || '').trim() || null : null

        return {
          subject: row.subject,
          teacher: row.teacher,
          kkm: row.kkm,
          finalScore: reportRelease.canViewDetails && hasResolvedFinalReport ? finalScore : null,
          predicate: reportRelease.canViewDetails && hasResolvedFinalReport ? predicate : null,
          description: reportRelease.canViewDetails && hasResolvedFinalReport ? description : null,
          status: reportRelease.canViewDetails ? (hasResolvedFinalReport ? 'AVAILABLE' : 'PENDING') : 'LOCKED',
        }
      })
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'id-ID'))

    const expectedReportSubjects = reportCardSubjects.length
    const availableReportSubjects = reportCardSubjects.filter((row) => row.status === 'AVAILABLE').length
    const reportFinalScores = reportCardSubjects
      .map((row) => row.finalScore)
      .filter((value): value is number => value !== null && value !== undefined)

    let reportStatusCode: StudentSemesterReportStatusCode = 'NOT_READY'
    if (expectedReportSubjects > 0 && availableReportSubjects > 0 && availableReportSubjects < expectedReportSubjects) {
      reportStatusCode = 'PARTIAL'
    } else if (expectedReportSubjects > 0 && availableReportSubjects >= expectedReportSubjects) {
      reportStatusCode = 'READY'
    }

    const reportStatusMeta: Record<
      StudentSemesterReportStatusCode,
      { label: string; tone: 'red' | 'amber' | 'green'; description: string }
    > = {
      NOT_READY: {
        label: 'Belum siap',
        tone: 'red',
        description: 'Rapor semester belum siap ditampilkan karena data nilainya belum lengkap.',
      },
      PARTIAL: {
        label: 'Sebagian tersedia',
        tone: 'amber',
        description: 'Sebagian nilai rapor sudah tersedia, tetapi masih menunggu sinkronisasi mapel lain.',
      },
      READY: {
        label: 'Siap ditampilkan',
        tone: 'green',
        description: 'Rapor semester sudah siap ditampilkan untuk seluruh mata pelajaran aktif.',
      },
    }

    const attendanceSummary = {
      hadir: attendanceStats.find((row) => row.status === 'PRESENT')?._count.status || 0,
      sakit: attendanceStats.find((row) => row.status === 'SICK')?._count.status || 0,
      izin: attendanceStats.find((row) => row.status === 'PERMISSION')?._count.status || 0,
      alpha: attendanceStats.find((row) => row.status === 'ABSENT')?._count.status || 0,
    }
    const presenceSummary = summarizeDailyPresenceRows(dailyPresenceRows)

    return ApiResponseHelper.success(
      res,
      {
        meta: {
          academicYearId: activeYear.id,
          academicYearName: activeYear.name,
          semester,
          semesterLabel: formatSemesterDisplayLabel(semester),
          student: {
            id: student.id,
            name: student.name,
            nis: student.nis,
            nisn: student.nisn,
          },
          class: student.studentClass
            ? {
                id: student.studentClass.id,
                name: student.studentClass.name,
                level: student.studentClass.level,
                major: student.studentClass.major
                  ? {
                      id: student.studentClass.major.id,
                      name: student.studentClass.major.name,
                      code: student.studentClass.major.code,
                    }
                  : null,
              }
            : null,
        },
        summary: {
          totalSubjects: subjectRows.length,
          subjectsWithAnyScore: subjectRows.filter((row) => row.status === 'AVAILABLE').length,
          availableComponents: totalAvailableComponents,
          pendingComponents: totalPendingComponents,
          averageFinalScore:
            finalScores.length > 0 ? roundDisplayScore(calculateAverage(finalScores)) : null,
        },
        components: componentCatalog,
        subjects: subjectRows,
        reportCard: {
          semester: reportSemester,
          semesterLabel: formatSemesterDisplayLabel(reportSemester),
          semesterType: reportCardType,
          reportDate: reportDate
            ? {
                place: reportDate.place,
                date: reportDate.date,
                reportType: reportDate.reportType,
              }
            : null,
          release: reportRelease,
          status: {
            code: reportStatusCode,
            label: reportStatusMeta[reportStatusCode].label,
            tone: reportStatusMeta[reportStatusCode].tone,
            description: reportStatusMeta[reportStatusCode].description,
          },
          summary: {
            expectedSubjects: expectedReportSubjects,
            availableSubjects: availableReportSubjects,
            missingSubjects: Math.max(expectedReportSubjects - availableReportSubjects, 0),
            averageFinalScore:
              reportRelease.canViewDetails && reportFinalScores.length > 0
                ? roundDisplayScore(calculateAverage(reportFinalScores))
                : null,
          },
          attendance: attendanceSummary,
          presenceSummary,
          homeroomNote: reportRelease.canViewDetails ? String(homeroomNote?.note || '').trim() || null : null,
          subjects: reportCardSubjects,
        },
      },
      'Student grade overview retrieved successfully',
    )
  } catch (error) {
    console.error('Get student grade overview error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to retrieve student grade overview')
  }
}

export const getHomeroomResultPublications = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const classId = Number(req.query.class_id || req.query.classId || 0)
    const requestedSemester = String(req.query.semester || req.query.reportSemester || '')
      .trim()
      .toUpperCase()
    const requestedPublicationCode = normalizeComponentCode(
      req.query.publicationCode || req.query.programCode || req.query.examType || '',
    )
    const page = Math.max(Number(req.query.page || 1) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 20) || 20, 1), 100)
    const search = String(req.query.search || '')
      .trim()

    if (!Number.isFinite(classId) || classId <= 0) {
      throw new ApiError(400, 'classId wajib diisi.')
    }

    const { activeYear, homeroomClass } = await resolveHomeroomPublicationAccess({ user, classId })
    const activeSemester = resolveCurrentSemesterFromAcademicYear(activeYear)
    const selectedSemester =
      requestedSemester === Semester.ODD || requestedSemester === Semester.EVEN
        ? (requestedSemester as Semester)
        : activeSemester

    const [examGradeComponents, examPrograms, reportDateRows] = await Promise.all([
      prisma.examGradeComponent.findMany({
        where: {
          academicYearId: activeYear.id,
          isActive: true,
        },
        select: {
          code: true,
          type: true,
          typeCode: true,
          reportSlot: true,
          reportSlotCode: true,
          includeInFinalScore: true,
        },
      }),
      prisma.examProgramConfig.findMany({
        where: {
          academicYearId: activeYear.id,
          isActive: true,
          showOnStudentMenu: true,
        },
        select: {
          code: true,
          displayLabel: true,
          shortLabel: true,
          displayOrder: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentCode: true,
          fixedSemester: true,
          studentResultPublishMode: true,
          studentResultPublishAt: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.reportDate.findMany({
        where: {
          academicYearId: activeYear.id,
        },
        select: {
          semester: true,
          place: true,
          date: true,
          reportType: true,
        },
        orderBy: [{ semester: 'asc' }, { reportType: 'asc' }],
      }),
    ])

    const componentRuleMap = buildExamComponentRuleMapFromRows(examGradeComponents)
    const reportDateByKey = buildStudentReleaseReportDateLookup(reportDateRows)
    const publicationRows = new Map<
      string,
      {
        publicationCode: string
        label: string
        shortLabel: string
        baseTypeCode: string
        fixedSemester: Semester | null
        globalRelease: StudentProgramResultReleaseState
      }
    >()

    examPrograms.forEach((program) => {
      const fixedSemester = program.fixedSemester || null
      if (fixedSemester && fixedSemester !== selectedSemester) return

      const publicationCode = resolveStudentPublicationCodeForProgram({
        program: {
          code: program.code,
          baseType: program.baseType,
          baseTypeCode: program.baseTypeCode,
          gradeComponentCode: program.gradeComponentCode,
          fixedSemester: program.fixedSemester,
        },
        componentRuleMap,
      })
      if (!publicationCode || publicationCode === DEFAULT_REPORT_SLOT_CODE) return

      const resolvedSemester = fixedSemester || selectedSemester
      const resolvedReportType = resolveExamTypeForStudentRelease(
        program.baseTypeCode || program.baseType,
        resolvedSemester,
        program.baseType,
      )
      const reportDate =
        resolvedReportType
          ? reportDateByKey.get(buildStudentReleaseReportDateKey(resolvedSemester, resolvedReportType)) || null
          : null
      const globalRelease = resolveStudentExamProgramResultRelease({
        mode: program.studentResultPublishMode,
        publishAt: program.studentResultPublishAt || null,
        reportDate,
        programCode: publicationCode,
        baseTypeCode: program.baseTypeCode || program.baseType,
      })
      if (globalRelease.mode === 'DIRECT') return

      const row = {
        publicationCode,
        label:
          String(program.displayLabel || program.shortLabel || publicationCode).trim() || publicationCode,
        shortLabel:
          String(program.shortLabel || program.displayLabel || publicationCode).trim() || publicationCode,
        baseTypeCode: normalizeComponentCode(program.baseTypeCode || program.baseType),
        fixedSemester,
        globalRelease,
      }

      const existing = publicationRows.get(publicationCode)
      if (!existing || normalizeComponentCode(program.code) === publicationCode) {
        publicationRows.set(publicationCode, row)
      }
    })

    const programs = Array.from(publicationRows.values()).sort((a, b) =>
      a.shortLabel.localeCompare(b.shortLabel, 'id-ID'),
    )
    const selectedProgram =
      (requestedPublicationCode ? programs.find((item) => item.publicationCode === requestedPublicationCode) : null) ||
      programs[0] ||
      null

    const matchedStudents = selectedProgram
      ? await prisma.user.findMany({
          where: {
            role: 'STUDENT',
            studentStatus: 'ACTIVE',
            classId: homeroomClass.id,
            ...(search
              ? {
                  OR: [
                    {
                      name: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                    {
                      nis: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                    {
                      nisn: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            photo: true,
          },
          orderBy: [{ name: 'asc' }],
        })
      : []

    const allRows = selectedProgram
      ? matchedStudents.map((student) => {
          const homeroomPublication = readHomeroomResultPublication({
            preferences: homeroomClass.teacher?.preferences,
            academicYearId: activeYear.id,
            classId: homeroomClass.id,
            studentId: student.id,
            publicationCode: selectedProgram.publicationCode,
          })
          const effectiveVisibility = resolveHomeroomPublicationEffectiveVisibility({
            globalRelease: selectedProgram.globalRelease,
            publicationMode: homeroomPublication.mode,
          })

          return {
            student: {
              id: student.id,
              name: student.name,
              nis: student.nis,
              nisn: student.nisn,
              photo: student.photo,
            },
            homeroomPublication: {
              mode: homeroomPublication.mode,
              label: resolveHomeroomPublicationModeLabel(homeroomPublication.mode),
              description: resolveHomeroomPublicationModeDescription(homeroomPublication.mode),
              updatedAt: homeroomPublication.updatedAt,
            },
            effectiveVisibility,
          }
        })
      : []

    const total = allRows.length
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0
    const paginatedRows = allRows.slice((page - 1) * limit, page * limit)
    const summary = allRows.reduce(
      (accumulator, row) => {
        accumulator.totalStudents += 1
        if (row.homeroomPublication.mode === 'BLOCKED') accumulator.blockedStudents += 1
        if (row.effectiveVisibility.canViewDetails) accumulator.visibleStudents += 1
        if (row.homeroomPublication.mode === 'FOLLOW_GLOBAL' && !selectedProgram?.globalRelease.canViewDetails) {
          accumulator.waitingWakakurStudents += 1
        }
        return accumulator
      },
      {
        totalStudents: 0,
        blockedStudents: 0,
        visibleStudents: 0,
        waitingWakakurStudents: 0,
      },
    )

    return ApiResponseHelper.success(
      res,
      {
        academicYear: {
          id: activeYear.id,
          name: activeYear.name,
        },
        class: {
          id: homeroomClass.id,
          name: homeroomClass.name,
          level: homeroomClass.level,
          major: homeroomClass.major,
        },
        programs,
        selectedProgram,
        summary,
        rows: paginatedRows,
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      },
      'Kontrol publikasi nilai wali kelas berhasil dimuat',
    )
  } catch (error) {
    console.error('Get homeroom result publications error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Gagal memuat kontrol publikasi nilai wali kelas')
  }
}

export const updateHomeroomResultPublication = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUserLike
    const classId = Number(req.body?.classId || req.body?.class_id || 0)
    const studentId = Number(req.body?.studentId || req.body?.student_id || 0)
    const publicationCode = normalizeComponentCode(req.body?.publicationCode || req.body?.programCode || '')
    const normalizedMode = String(req.body?.mode || '')
      .trim()
      .toUpperCase()

    if (!Number.isFinite(classId) || classId <= 0) {
      throw new ApiError(400, 'classId wajib diisi.')
    }
    if (!Number.isFinite(studentId) || studentId <= 0) {
      throw new ApiError(400, 'studentId wajib diisi.')
    }
    if (!publicationCode) {
      throw new ApiError(400, 'publicationCode wajib diisi.')
    }
    if (normalizedMode !== 'FOLLOW_GLOBAL' && normalizedMode !== 'BLOCKED') {
      throw new ApiError(400, 'mode tidak valid.')
    }

    const { activeYear, homeroomClass, userId } = await resolveHomeroomPublicationAccess({ user, classId })
    if (!homeroomClass.teacher?.id) {
      throw new ApiError(404, 'Data wali kelas tidak ditemukan.')
    }

    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        classId: homeroomClass.id,
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (!student) {
      throw new ApiError(404, 'Siswa kelas aktif tidak ditemukan.')
    }

    const nextPreferences = writeHomeroomResultPublication({
      preferences: homeroomClass.teacher.preferences,
      academicYearId: activeYear.id,
      classId: homeroomClass.id,
      studentId: student.id,
      publicationCode,
      mode: normalizedMode as HomeroomResultPublicationMode,
      actorUserId: userId,
    })

    const updatedTeacher = await prisma.user.update({
      where: {
        id: homeroomClass.teacher.id,
      },
      data: {
        preferences: nextPreferences as Prisma.InputJsonValue,
      },
      select: {
        preferences: true,
      },
    })

    const updatedPublication = readHomeroomResultPublication({
      preferences: updatedTeacher.preferences,
      academicYearId: activeYear.id,
      classId: homeroomClass.id,
      studentId: student.id,
      publicationCode,
    })

    emitGradeRealtimeRefresh({
      studentIds: [student.id],
      academicYearIds: [activeYear.id],
      includeReports: true,
    })

    return ApiResponseHelper.success(
      res,
      {
        classId: homeroomClass.id,
        studentId: student.id,
        publicationCode,
        homeroomPublication: {
          mode: updatedPublication.mode,
          label: resolveHomeroomPublicationModeLabel(updatedPublication.mode),
          description: resolveHomeroomPublicationModeDescription(updatedPublication.mode),
          updatedAt: updatedPublication.updatedAt,
        },
      },
      'Kontrol publikasi nilai berhasil diperbarui',
    )
  } catch (error) {
    console.error('Update homeroom result publication error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Gagal memperbarui kontrol publikasi nilai')
  }
}

export const createOrUpdateStudentGrade = async (req: Request, res: Response) => {
  try {
    const {
      student_id,
      subject_id,
      academic_year_id,
      grade_component_id,
      semester,
      score,
      nf1, nf2, nf3, nf4, nf5, nf6,
      formative_series,
      formative_slot_count,
    } = req.body
    const user = (req as any).user as AuthUserLike

    const normalizedSeries = normalizeFormativeSeries(formative_series)

    // Validate required fields
    if (
      !student_id ||
      !subject_id ||
      !academic_year_id ||
      !grade_component_id ||
      !semester ||
      (score === undefined && !normalizedSeries.provided)
    ) {
      throw new ApiError(400, 'All fields are required')
    }

    await ensureTeacherCanAccessGradeContext({
      user,
      subjectId: Number(subject_id),
      academicYearId: Number(academic_year_id),
      studentId: Number(student_id),
    })

    const component = await resolveValidatedGradeComponentContext({
      gradeComponentId: Number(grade_component_id),
      subjectId: Number(subject_id),
      academicYearId: Number(academic_year_id),
      semester: semester as Semester,
      user,
      studentId: Number(student_id),
    })
    const componentEntryMode = component.entryMode
    const isFormativeComponent = componentEntryMode === GradeEntryMode.NF_SERIES
    const parsedNf1 = parseOptionalScoreValue(nf1, 'NF1')
    const parsedNf2 = parseOptionalScoreValue(nf2, 'NF2')
    const parsedNf3 = parseOptionalScoreValue(nf3, 'NF3')
    const parsedNf4 = parseOptionalScoreValue(nf4, 'NF4')
    const parsedNf5 = parseOptionalScoreValue(nf5, 'NF5')
    const parsedNf6 = parseOptionalScoreValue(nf6, 'NF6')

    let parsedScore = parseOptionalScoreValue(score, 'Nilai')
    let nfValues: Array<number | null | undefined> = [
      parsedNf1,
      parsedNf2,
      parsedNf3,
      parsedNf4,
      parsedNf5,
      parsedNf6,
    ]
    let additionalSeriesScores: number[] = []

    const effectiveFormativeSeries = normalizeFormativeSeriesForPersistence({
      isFormativeComponent,
      normalizedSeries,
      parsedScore,
    })
    const effectiveFormativeSlotCount = isFormativeComponent
      ? Math.max(
          normalizeFormativeSlotCount(formative_slot_count, normalizedSeries.values.length),
          effectiveFormativeSeries.seriesValues.length,
        )
      : 0

    if (isFormativeComponent && effectiveFormativeSeries.provided) {
      const seriesValues = effectiveFormativeSeries.seriesValues
      if (seriesValues.length > 0) {
        parsedScore = calculateAverage(seriesValues)
      } else {
        parsedScore = null
      }
      const normalizedNfValues: Array<number | null> = [null, null, null, null, null, null]
      for (let index = 0; index < Math.min(6, seriesValues.length); index += 1) {
        normalizedNfValues[index] = seriesValues[index]
      }
      nfValues = normalizedNfValues
      additionalSeriesScores = seriesValues.slice(6)
    }

    // Check if grade already exists
    // Note: Using findFirst because unique constraint might be missing in schema
    const whereClause: Prisma.StudentGradeWhereInput = {
      studentId: Number(student_id),
      subjectId: Number(subject_id),
      academicYearId: Number(academic_year_id),
      componentId: Number(grade_component_id),
      semester: semester as Semester
    }

    const existingGrades = await prisma.studentGrade.findMany({
      where: whereClause,
      orderBy: { id: 'desc' },
    })
    const [existingGrade, ...duplicateGrades] = existingGrades

    const shouldDeleteGrade =
      parsedScore === null &&
      (!isFormativeComponent || effectiveFormativeSeries.seriesValues.length === 0)

    if (shouldDeleteGrade) {
      if (existingGrades.length > 0) {
        await cleanupStudentGradeDuplicates(existingGrades.map((row) => row.id))
      }
      if (isFormativeComponent) {
        await syncFormativeSlotCountMetadata({
          studentId: Number(student_id),
          subjectId: Number(subject_id),
          academicYearId: Number(academic_year_id),
          componentId: Number(grade_component_id),
          semester: semester as Semester,
          slotCount: effectiveFormativeSlotCount,
          componentCode: component.code,
          componentType: component.type,
          componentTypeCode: component.code,
        })
      }
      const reportSync = await syncReportGradeSafely(
        Number(student_id),
        Number(subject_id),
        Number(academic_year_id),
        semester as Semester
      )
      emitGradeRealtimeRefresh({
        studentIds: [student_id],
        subjectIds: [subject_id],
        academicYearIds: [academic_year_id],
        semesters: [semester],
        includeReports: reportSync.success,
      })
      return ApiResponseHelper.success(
        res,
        {
          deleted: !!existingGrade,
          student_id: Number(student_id),
          subject_id: Number(subject_id),
          component_id: Number(grade_component_id),
          semester,
          reportSync,
        },
        reportSync.success
          ? existingGrade
            ? 'Student grade deleted successfully'
            : 'No student grade found to delete'
          : 'Nilai tersimpan, tetapi sinkronisasi rapor gagal. Silakan cek ulang.',
      )
    }

    if (parsedScore === undefined || parsedScore === null) {
      throw new ApiError(400, 'Score must be between 0 and 100')
    }

    let grade
    if (existingGrade) {
      // Update existing grade
      const updateData: Prisma.StudentGradeUpdateInput = {
        score: parsedScore,
        nf1: nfValues[0] === undefined ? undefined : nfValues[0],
        nf2: nfValues[1] === undefined ? undefined : nfValues[1],
        nf3: nfValues[2] === undefined ? undefined : nfValues[2],
        nf4: nfValues[3] === undefined ? undefined : nfValues[3],
        nf5: nfValues[4] === undefined ? undefined : nfValues[4],
        nf6: nfValues[5] === undefined ? undefined : nfValues[5],
      }
      
      grade = await prisma.studentGrade.update({
        where: { id: existingGrade.id },
        data: updateData,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nisn: true
            }
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true
            }
          },
          component: true
        }
      })
    } else {
      // Create new grade
      const createData: Prisma.StudentGradeCreateInput = {
        student: { connect: { id: Number(student_id) } },
        subject: { connect: { id: Number(subject_id) } },
        academicYear: { connect: { id: Number(academic_year_id) } },
        component: { connect: { id: Number(grade_component_id) } },
        semester: semester as Semester,
        score: parsedScore,
        nf1: nfValues[0] === undefined ? undefined : nfValues[0],
        nf2: nfValues[1] === undefined ? undefined : nfValues[1],
        nf3: nfValues[2] === undefined ? undefined : nfValues[2],
        nf4: nfValues[3] === undefined ? undefined : nfValues[3],
        nf5: nfValues[4] === undefined ? undefined : nfValues[4],
        nf6: nfValues[5] === undefined ? undefined : nfValues[5],
      }

      grade = await prisma.studentGrade.create({
        data: createData,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nisn: true
            }
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true
            }
          },
          component: true
        }
      })
    }

    try {
      await syncScoreEntriesFromStudentGrade(grade.id)
      if (isFormativeComponent) {
        await syncAdditionalNfSeriesEntriesFromStudentGrade(grade.id, additionalSeriesScores)
        await syncFormativeSlotCountMetadata({
          studentId: Number(student_id),
          subjectId: Number(subject_id),
          academicYearId: Number(academic_year_id),
          componentId: Number(grade_component_id),
          semester: semester as Semester,
          slotCount: effectiveFormativeSlotCount,
          componentCode: component.code,
          componentType: component.type,
          componentTypeCode: component.code,
        })
      }
      if (duplicateGrades.length > 0) {
        await cleanupStudentGradeDuplicates(duplicateGrades.map((row) => row.id))
      }
    } catch (scoreEntryError) {
      console.error('Failed to sync score entries from student grade:', scoreEntryError)
    }

    const reportSync = await syncReportGradeSafely(
      Number(student_id),
      Number(subject_id),
      Number(academic_year_id),
      semester as Semester
    )
    emitGradeRealtimeRefresh({
      studentIds: [student_id],
      subjectIds: [subject_id],
      academicYearIds: [academic_year_id],
      semesters: [semester],
      includeReports: reportSync.success,
    })

    return ApiResponseHelper.success(
      res,
      {
        ...grade,
        reportSync,
      },
      reportSync.success
        ? 'Student grade saved successfully'
        : 'Nilai tersimpan, tetapi sinkronisasi rapor gagal. Silakan cek ulang.',
    )
  } catch (error) {
    console.error('Create/Update student grade error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to save student grade')
  }
}

export const bulkCreateOrUpdateStudentGrades = async (req: Request, res: Response) => {
  try {
    const { grades } = req.body
    const user = (req as any).user as AuthUserLike
    const studentClassMap = new Map<string, number>()

    if (!Array.isArray(grades) || grades.length === 0) {
      throw new ApiError(400, 'Grades array is required')
    }

    if (isTeacherUser(user)) {
      const studentIds = Array.from(
        new Set(
          grades
            .map((item: any) => toPositiveInt(item?.student_id))
            .filter((item): item is number => Boolean(item)),
        ),
      )
      const subjectIds = Array.from(
        new Set(
          grades
            .map((item: any) => toPositiveInt(item?.subject_id))
            .filter((item): item is number => Boolean(item)),
        ),
      )
      const academicYearIds = Array.from(
        new Set(
          grades
            .map((item: any) => toPositiveInt(item?.academic_year_id))
            .filter((item): item is number => Boolean(item)),
        ),
      )

      if (studentIds.length === 0 || subjectIds.length === 0 || academicYearIds.length === 0) {
        throw new ApiError(400, 'Data bulk nilai tidak valid. student_id, subject_id, academic_year_id wajib diisi.')
      }

      const studentRows = await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          classId: true,
          studentClass: {
            select: {
              academicYearId: true,
            },
          },
        },
      })
      const studentRowMap = new Map(studentRows.map((row) => [Number(row.id), row]))
      const historicalStudentSnapshotMap = await buildHistoricalStudentSnapshotMap(
        academicYearIds.flatMap((academicYearId) =>
          studentIds.map((studentId) => ({
            studentId,
            academicYearId,
          })),
        ),
      )
      grades.forEach((gradeData: any) => {
        const studentId = toPositiveInt(gradeData?.student_id)
        const academicYearId = toPositiveInt(gradeData?.academic_year_id)
        if (!studentId || !academicYearId) return
        const studentRow = studentRowMap.get(studentId)
        const classId = resolveHistoricalStudentClassId({
          snapshotMap: historicalStudentSnapshotMap,
          studentId,
          academicYearId,
          fallbackClassId: studentRow?.classId,
          fallbackClassAcademicYearId: studentRow?.studentClass?.academicYearId,
        })
        if (classId) {
          studentClassMap.set(`${studentId}:${academicYearId}`, classId)
        }
      })
      const classIds = Array.from(new Set(Array.from(studentClassMap.values())))

      const teacherId = Number(user?.id || 0)
      if (!Number.isFinite(teacherId) || teacherId <= 0) {
        throw new ApiError(401, 'Sesi login tidak valid.')
      }

      const assignmentRows = await prisma.teacherAssignment.findMany({
        where: {
          teacherId,
          subjectId: { in: subjectIds },
          academicYearId: { in: academicYearIds },
          classId: { in: classIds.length > 0 ? classIds : [0] },
        },
        select: {
          subjectId: true,
          academicYearId: true,
          classId: true,
        },
      })
      const assignmentKeySet = new Set(
        assignmentRows.map((row) => `${row.subjectId}:${row.academicYearId}:${row.classId}`),
      )

      for (const gradeData of grades) {
        const studentId = toPositiveInt(gradeData?.student_id)
        const subjectId = toPositiveInt(gradeData?.subject_id)
        const academicYearId = toPositiveInt(gradeData?.academic_year_id)
        if (!studentId || !subjectId || !academicYearId) {
          throw new ApiError(400, 'Data bulk nilai tidak valid pada salah satu baris.')
        }
        const classId = Number(studentClassMap.get(`${studentId}:${academicYearId}`) || 0)
        if (!classId) {
          throw new ApiError(
            400,
            `Siswa ${studentId} tidak terdaftar pada tahun ajaran ${academicYearId}.`,
          )
        }
        const key = `${subjectId}:${academicYearId}:${classId}`
        if (!assignmentKeySet.has(key)) {
          throw new ApiError(
            403,
            `Anda tidak memiliki assignment mapel-kelas untuk siswa ${studentId}. Simpan bulk nilai ditolak.`,
          )
        }
      }
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
      reportSync: {
        success: 0,
        failed: 0,
        errors: [] as Array<{ student_id: number; subject_id: number; academic_year_id: number; semester: Semester; error: string }>,
      },
    }

    const uniqueKeys = new Set<string>();
    const componentConfigCache = new Map<
      string,
      { type: GradeComponentType; code?: string | null; entryMode: GradeEntryMode }
    >()

    for (const gradeData of grades) {
      try {
        const {
          student_id,
          subject_id,
          academic_year_id,
          grade_component_id,
          semester,
          score,
          nf1, nf2, nf3, nf4, nf5, nf6,
          formative_series,
          formative_slot_count,
        } = gradeData

        // Track for sync
        uniqueKeys.add(`${student_id}-${subject_id}-${academic_year_id}-${semester}`);

        const componentId = Number(grade_component_id)
        const subjectIdKey = Number(subject_id)
        const academicYearIdKey = Number(academic_year_id)
        const studentIdKey = Number(student_id)
        const semesterKey = semester as Semester
        const classIdKey = Number(studentClassMap.get(`${studentIdKey}:${academicYearIdKey}`) || 0)
        const cacheScopeKey = classIdKey > 0 ? `class:${classIdKey}` : `student:${studentIdKey}`
        const cacheKey = `${componentId}:${subjectIdKey}:${academicYearIdKey}:${semesterKey}:${cacheScopeKey}`
        let componentConfig = componentConfigCache.get(cacheKey)
        if (!componentConfig) {
          const component = await resolveValidatedGradeComponentContext({
            gradeComponentId: componentId,
            subjectId: subjectIdKey,
            academicYearId: academicYearIdKey,
            semester: semesterKey,
            user,
            studentId: studentIdKey,
            classId: classIdKey || null,
          })
          componentConfig = {
            type: component.type,
            code: component.code,
            entryMode: component.entryMode,
          }
          componentConfigCache.set(cacheKey, componentConfig)
        }

        const isFormativeComponent = componentConfig.entryMode === GradeEntryMode.NF_SERIES
        const normalizedSeries = normalizeFormativeSeries(formative_series)
        const parsedNf1 = parseOptionalScoreValue(nf1, 'NF1')
        const parsedNf2 = parseOptionalScoreValue(nf2, 'NF2')
        const parsedNf3 = parseOptionalScoreValue(nf3, 'NF3')
        const parsedNf4 = parseOptionalScoreValue(nf4, 'NF4')
        const parsedNf5 = parseOptionalScoreValue(nf5, 'NF5')
        const parsedNf6 = parseOptionalScoreValue(nf6, 'NF6')

        let parsedScore = parseOptionalScoreValue(score, 'Nilai')
        let nfValues: Array<number | null | undefined> = [
          parsedNf1,
          parsedNf2,
          parsedNf3,
          parsedNf4,
          parsedNf5,
          parsedNf6,
        ]
        let additionalSeriesScores: number[] = []

        const effectiveFormativeSeries = normalizeFormativeSeriesForPersistence({
          isFormativeComponent,
          normalizedSeries,
          parsedScore,
        })
        const effectiveFormativeSlotCount = isFormativeComponent
          ? Math.max(
              normalizeFormativeSlotCount(formative_slot_count, normalizedSeries.values.length),
              effectiveFormativeSeries.seriesValues.length,
            )
          : 0

        if (isFormativeComponent && effectiveFormativeSeries.provided) {
          const seriesValues = effectiveFormativeSeries.seriesValues
          if (seriesValues.length > 0) {
            parsedScore = calculateAverage(seriesValues)
          } else {
            parsedScore = null
          }
          const normalizedNfValues: Array<number | null> = [null, null, null, null, null, null]
          for (let index = 0; index < Math.min(6, seriesValues.length); index += 1) {
            normalizedNfValues[index] = seriesValues[index]
          }
          nfValues = normalizedNfValues
          additionalSeriesScores = seriesValues.slice(6)
        }

        // Check if grade already exists
        const existingGrades = await prisma.studentGrade.findMany({
          where: {
            studentId: Number(student_id),
            subjectId: Number(subject_id),
            academicYearId: Number(academic_year_id),
            componentId: Number(grade_component_id),
            semester: semester as Semester
          },
          orderBy: { id: 'desc' },
        })
        const [existingGrade, ...duplicateGrades] = existingGrades

        const shouldDeleteGrade =
          parsedScore === null &&
          (!isFormativeComponent || effectiveFormativeSeries.seriesValues.length === 0)

        if (shouldDeleteGrade) {
          if (existingGrades.length > 0) {
            await cleanupStudentGradeDuplicates(existingGrades.map((row) => row.id))
          }
          if (isFormativeComponent) {
            await syncFormativeSlotCountMetadata({
              studentId: Number(student_id),
              subjectId: Number(subject_id),
              academicYearId: Number(academic_year_id),
              componentId: Number(grade_component_id),
              semester: semester as Semester,
              slotCount: effectiveFormativeSlotCount,
              componentCode: componentConfig.code,
              componentType: componentConfig.type,
              componentTypeCode: componentConfig.code,
            })
          }
          const reportSync = await syncReportGradeSafely(
            Number(student_id),
            Number(subject_id),
            Number(academic_year_id),
            semester as Semester,
          )
          if (reportSync.success) {
            results.reportSync.success += 1
          } else {
            results.reportSync.failed += 1
            results.reportSync.errors.push({
              student_id: Number(student_id),
              subject_id: Number(subject_id),
              academic_year_id: Number(academic_year_id),
              semester: semester as Semester,
              error: reportSync.error || 'Sinkronisasi rapor gagal setelah hapus nilai kosong.',
            })
          }
          results.success++
          continue
        }

        if (parsedScore === undefined || parsedScore === null) {
          throw new ApiError(400, 'Score must be between 0 and 100')
        }

        let savedGradeId: number
        if (existingGrade) {
          const updatedGrade = await prisma.studentGrade.update({
            where: { id: existingGrade.id },
            data: { 
              score: parsedScore,
              nf1: nfValues[0] === undefined ? undefined : nfValues[0],
              nf2: nfValues[1] === undefined ? undefined : nfValues[1],
              nf3: nfValues[2] === undefined ? undefined : nfValues[2],
              nf4: nfValues[3] === undefined ? undefined : nfValues[3],
              nf5: nfValues[4] === undefined ? undefined : nfValues[4],
              nf6: nfValues[5] === undefined ? undefined : nfValues[5],
            }
          })
          savedGradeId = updatedGrade.id
        } else {
          const createdGrade = await prisma.studentGrade.create({
            data: {
              studentId: Number(student_id),
              subjectId: Number(subject_id),
              academicYearId: Number(academic_year_id),
              componentId: Number(grade_component_id),
              semester: semester as Semester,
              score: parsedScore,
              nf1: nfValues[0] === undefined ? undefined : nfValues[0],
              nf2: nfValues[1] === undefined ? undefined : nfValues[1],
              nf3: nfValues[2] === undefined ? undefined : nfValues[2],
              nf4: nfValues[3] === undefined ? undefined : nfValues[3],
              nf5: nfValues[4] === undefined ? undefined : nfValues[4],
              nf6: nfValues[5] === undefined ? undefined : nfValues[5],
            }
          })
          savedGradeId = createdGrade.id
        }

        try {
          await syncScoreEntriesFromStudentGrade(savedGradeId)
          if (isFormativeComponent) {
            await syncAdditionalNfSeriesEntriesFromStudentGrade(savedGradeId, additionalSeriesScores)
            await syncFormativeSlotCountMetadata({
              studentId: Number(student_id),
              subjectId: Number(subject_id),
              academicYearId: Number(academic_year_id),
              componentId: Number(grade_component_id),
              semester: semester as Semester,
              slotCount: effectiveFormativeSlotCount,
              componentCode: componentConfig.code,
              componentType: componentConfig.type,
              componentTypeCode: componentConfig.code,
            })
          }
          if (duplicateGrades.length > 0) {
            await cleanupStudentGradeDuplicates(duplicateGrades.map((row) => row.id))
          }
        } catch (scoreEntryError) {
          console.error(`Failed to sync score entries for grade id=${savedGradeId}:`, scoreEntryError)
        }

        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          student_id: gradeData.student_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Sync Report Grades for all affected students
    // Process in background to avoid blocking response too long
    // But for consistency, we might want to await. Given it's a few students, await is safer.
    const syncPromises = Array.from(uniqueKeys).map(async (key) => {
      const [studentId, subjectId, academicYearId, semester] = key.split('-')
      const syncResult = await syncReportGradeSafely(
        Number(studentId),
        Number(subjectId),
        Number(academicYearId),
        semester as Semester
      )
      if (syncResult.success) {
        results.reportSync.success += 1
      } else {
        results.reportSync.failed += 1
        results.reportSync.errors.push({
          student_id: Number(studentId),
          subject_id: Number(subjectId),
          academic_year_id: Number(academicYearId),
          semester: semester as Semester,
          error: syncResult.error || 'Sinkronisasi report grade gagal',
        })
      }
    })

    await Promise.all(syncPromises)

    if (results.success > 0) {
      emitGradeRealtimeRefresh({
        studentIds: grades.map((item: any) => item?.student_id),
        subjectIds: grades.map((item: any) => item?.subject_id),
        academicYearIds: grades.map((item: any) => item?.academic_year_id),
        semesters: grades.map((item: any) => item?.semester),
        includeReports: results.reportSync.success > 0,
      })
    }

    return ApiResponseHelper.success(res, results, 'Bulk grade operation completed')
  } catch (error) {
    console.error('Bulk create/update student grades error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to save student grades')
  }
}

// ============================================
// REPORT GRADES (Nilai Raport)
// ============================================

// Calculate predicate based on score
const calculatePredicate = (score: number, kkm: number = 75): string => {
  const roundedScore = Math.round(score)
  if (roundedScore >= 86) return 'A'
  if (roundedScore >= kkm) return 'B'
  if (roundedScore >= 60) return 'C'
  return 'D'
}

export const generateReportGrades = async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const {
      student_id,
      academic_year_id,
      semester
    } = req.body

    if (!student_id || !academic_year_id || !semester) {
      throw new ApiError(400, 'student_id, academic_year_id, and semester are required')
    }

    const studentClassId = await resolveStudentClassId(Number(student_id), Number(academic_year_id))
    if (!studentClassId) {
      throw new ApiError(404, 'Student historical class for selected academic year not found')
    }

    // Pre-fetch KKM for all subjects in this class
    const assignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: studentClassId,
        academicYearId: Number(academic_year_id)
      },
      select: {
        subjectId: true,
        kkm: true
      }
    })

    const kkmMap = new Map<number, number>()
    assignments.forEach(a => kkmMap.set(a.subjectId, a.kkm))

    // Get all student grades for the semester
    const studentGrades = await prisma.studentGrade.findMany({
      where: {
        studentId: Number(student_id),
        academicYearId: Number(academic_year_id),
        semester: semester as Semester
      },
      include: {
        component: true,
        subject: {
          include: {
            category: true
          }
        }
      }
    })

    if (studentGrades.length === 0) {
      throw new ApiError(404, 'No grades found for this student')
    }

    // Group grades by subject
    const gradesBySubject = studentGrades.reduce((acc: any, grade: any) => {
      if (!acc[grade.subjectId]) {
        acc[grade.subjectId] = {
          subject: grade.subject,
          entries: [],
        }
      }
      acc[grade.subjectId].entries.push(grade)
      return acc
    }, {} as any)

    // Calculate final scores and create/update report grades
    const reportGrades = []
    const componentRuleMap = await getExamComponentRuleMap(Number(academic_year_id))
    const includeSlots = resolveIncludedReportSlots(componentRuleMap)
    const primarySlots = resolvePrimarySlotCodesForSemester(componentRuleMap, semester as Semester)
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: Number(academic_year_id) },
      select: {
        semester1Start: true,
        semester1End: true,
        semester2Start: true,
        semester2End: true,
      },
    })
    if (!academicYear) {
      throw new ApiError(404, 'Academic year not found')
    }
    const semesterRange = resolveSemesterRange(academicYear, semester as Semester)
    const programSlotMap = await getProgramReportSlotMap(Number(academic_year_id), componentRuleMap)

    for (const [subjectId, data] of Object.entries(gradesBySubject) as any) {
      const { subject, entries } = data
      const activeEntries = entries.filter((entry: any) => entry.component?.isActive !== false)
      const dynamicResult = computeDynamicReportFromGrades(activeEntries, componentRuleMap)
      const scoreEntryRows = await collectDynamicScoreEntryRows({
        studentId: Number(student_id),
        subjectId: Number(subjectId),
        academicYearId: Number(academic_year_id),
        semester: semester as Semester,
      })
      const entrySlotScores = computeDynamicSlotScoresFromScoreEntries(scoreEntryRows)
      const formativeReferenceScores = computeFormativeReferenceScoresFromScoreEntries({
        rows: scoreEntryRows,
        formativeSlotCode: primarySlots.formative,
        midtermSlotCode: primarySlots.midterm,
        finalSlotCode: primarySlots.final,
      })
      Object.entries(entrySlotScores).forEach(([slot, value]) => {
        if (value !== undefined) {
          dynamicResult.slotScoresByCode[slot] = value
        }
      })
      const dynamicFormativeScores = await collectDynamicFormativeScores({
        studentId: Number(student_id),
        subjectId: Number(subjectId),
        academicYearId: Number(academic_year_id),
        semester: semester as Semester,
        semesterRange,
        programSlotMap,
        formativeSlotCode: primarySlots.formative,
      })
      if (entrySlotScores[primarySlots.formative] === undefined && dynamicFormativeScores.length > 0) {
        dynamicResult.slotScoresByCode[primarySlots.formative] = calculateAverage(dynamicFormativeScores)
      }
      const midtermFormativeReference =
        formativeReferenceScores.midterm ??
        dynamicResult.slotScoresByCode[primarySlots.formative] ??
        calculateAverage(dynamicFormativeScores)
      const finalFormativeReference =
        formativeReferenceScores.final ??
        dynamicResult.slotScoresByCode[primarySlots.formative] ??
        calculateAverage(dynamicFormativeScores)
      if (midtermFormativeReference !== null) {
        dynamicResult.slotScoresByCode[
          buildFormativeReferenceSlotCode(primarySlots.formative, 'MIDTERM')
        ] = midtermFormativeReference
      }
      if (finalFormativeReference !== null) {
        dynamicResult.slotScoresByCode[
          buildFormativeReferenceSlotCode(primarySlots.formative, 'FINAL')
        ] = finalFormativeReference
      }
      dynamicResult.legacySlotScores = buildLegacySlotScoreMap(dynamicResult.slotScoresByCode)
      const reportScores = {
        FORMATIVE: dynamicResult.slotScoresByCode[primarySlots.formative] ?? null,
        MIDTERM: dynamicResult.slotScoresByCode[primarySlots.midterm] ?? null,
        FINAL: dynamicResult.slotScoresByCode[primarySlots.final] ?? null,
      }
      const finalScore = recomputeFinalScoreFromSlots(
        dynamicResult.slotScoresByCode,
        includeSlots,
        dynamicResult.finalScore,
        primarySlots,
      )

      const kkm = kkmMap.get(Number(subjectId)) || 75
      const predicate = calculatePredicate(finalScore, kkm)

      // ==========================================
      // UJIAN SEKOLAH (US) CALCULATION LOGIC
      // ==========================================
      const usScore = computeUsScoreFromSlotScores(dynamicResult.slotScoresByCode)

      // Check if report grade already exists
      const existingReportGrade = await prisma.reportGrade.findFirst({
        where: {
          studentId: Number(student_id),
          subjectId: Number(subjectId),
          academicYearId: Number(academic_year_id),
          semester: semester as Semester
        }
      })

      let reportGrade
      if (existingReportGrade) {
        reportGrade = await prisma.reportGrade.update({
          where: { id: existingReportGrade.id },
          data: {
            formatifScore: reportScores.FORMATIVE,
            sbtsScore: reportScores.MIDTERM,
            sasScore: reportScores.FINAL,
            slotScores: dynamicResult.slotScoresByCode,
            finalScore: finalScore,
            predicate,
            usScore // Add US Score
          } as any,
          include: {
            subject: true
          }
        })
      } else {
        reportGrade = await prisma.reportGrade.create({
          data: {
            studentId: Number(student_id),
            subjectId: Number(subjectId),
            academicYearId: Number(academic_year_id),
            semester: semester as Semester,
            formatifScore: reportScores.FORMATIVE,
            sbtsScore: reportScores.MIDTERM,
            sasScore: reportScores.FINAL,
            slotScores: dynamicResult.slotScoresByCode,
            finalScore: finalScore,
            predicate,
            usScore // Add US Score
          } as any,
          include: {
            subject: true
          }
        })
      }

      reportGrades.push(reportGrade)
    }

    const elapsed = Date.now() - t0
    console.log(`generateReportGrades executed in ${elapsed}ms for student_id=${req.body.student_id}`)

    return ApiResponseHelper.success(res, reportGrades, 'Report grades generated successfully')
  } catch (error) {
    console.error('Generate report grades error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to generate report grades')
  }
}

export const getReportGrades = async (req: Request, res: Response) => {
  try {
    const {
      student_id,
      academic_year_id,
      semester,
      class_id,
      subject_id,
      include_meta,
    } = req.query

    const user = (req as any).user as AuthUserLike;
    const parsedStudentId = toPositiveInt(student_id)
    const parsedAcademicYearId = toPositiveInt(academic_year_id)
    const parsedClassId = toPositiveInt(class_id)
    const parsedSubjectId = toPositiveInt(subject_id)
    let resolvedAcademicYearId = parsedAcademicYearId
    const where: any = {}
    
    // Security: Students can only view their own grades
    if (String(user?.role || '').toUpperCase() === 'STUDENT') {
      where.studentId = user.id;
    } else {
      if (isTeacherUser(user)) {
        if (!parsedSubjectId || !parsedAcademicYearId) {
          throw new ApiError(400, 'subject_id dan academic_year_id wajib diisi untuk akses nilai rapor guru.')
        }
        if (!parsedClassId && !parsedStudentId) {
          throw new ApiError(400, 'Guru wajib memilih class_id atau student_id untuk melihat nilai rapor.')
        }
        await ensureTeacherCanAccessGradeContext({
          user,
          subjectId: parsedSubjectId,
          academicYearId: parsedAcademicYearId,
          classId: parsedClassId,
          studentId: parsedStudentId,
        })
      }

      if (parsedStudentId) where.studentId = parsedStudentId
      
      // If class_id is provided, filter by students in that class
      if (parsedClassId) {
        const classScope = await resolveHistoricalStudentScope({
          academicYearId: parsedAcademicYearId,
          classId: parsedClassId,
        })
        resolvedAcademicYearId = resolvedAcademicYearId || classScope.academicYearId
        const students = classScope.students.map((student) => ({ id: student.id }))
        where.studentId = { in: students.length > 0 ? students.map((s) => s.id) : [-1] }
  
        // LAZY SYNC: If we are in a specific context (Class + Subject + Year + Sem),
        // ensure ReportGrades exist for all students.
        if (students.length > 0 && parsedSubjectId && resolvedAcademicYearId && semester) {
          const syncWhere: Prisma.ReportGradeWhereInput = {
            studentId: { in: students.map((s) => s.id) },
            subjectId: parsedSubjectId,
            academicYearId: resolvedAcademicYearId,
            semester: semester as Semester,
          };
          const existingCount = await prisma.reportGrade.count({ where: syncWhere });
          
          // If count mismatch (or force check), run sync
          if (existingCount < students.length) {
              console.log(`[LazySync] Syncing ReportGrades for Class ${parsedClassId} Subject ${parsedSubjectId}`);
              await runWithConcurrencyLimit(students, 4, async (studentRow) => {
                await syncReportGrade(
                  studentRow.id,
                  parsedSubjectId,
                  Number(resolvedAcademicYearId),
                  semester as Semester,
                ).catch((err) => console.error(`Failed to sync student ${studentRow.id}:`, err))
              })
          }
        }
      }
    }

    if (resolvedAcademicYearId) where.academicYearId = resolvedAcademicYearId
    if (semester) where.semester = semester as Semester
    if (parsedSubjectId) where.subjectId = parsedSubjectId

    const reportGrades = await prisma.reportGrade.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: [
        { subject: { name: 'asc' } }
      ]
    })

    // Manual population of student data since ReportGrade has no relation to User
    const studentIds = [...new Set(reportGrades.map(g => g.studentId))]
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        name: true,
        nisn: true,
        nis: true,
        studentClass: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            major: {
              select: {
                name: true
              }
            }
          }
        }
      }
    })

    const historicalStudentSnapshotMap = await buildHistoricalStudentSnapshotMap(
      reportGrades.map((grade) => ({
        studentId: Number(grade.studentId),
        academicYearId: Number(grade.academicYearId),
      })),
    )
    
    const studentMap = students.reduce((acc, student) => {
      acc[student.id] = student
      return acc
    }, {} as any)

    const result = reportGrades.map(grade => ({
      ...grade,
      finalScore: resolveEffectiveReportFinalScore(grade),
      student: (() => {
        const student = studentMap[grade.studentId]
        const snapshot = historicalStudentSnapshotMap.get(
          buildHistoricalStudentAcademicKey(Number(grade.studentId), Number(grade.academicYearId)),
        )
        if (!student) return null

        if (snapshot?.studentClass) {
          return {
            ...student,
            studentClass: {
              id: snapshot.studentClass.id,
              name: snapshot.studentClass.name,
              major: {
                name: snapshot.studentClass.major?.name || student.studentClass?.major?.name || '',
              },
            },
          }
        }

        if (Number(student.studentClass?.academicYearId || 0) === Number(grade.academicYearId)) {
          return student
        }

        return {
          ...student,
          studentClass: null,
        }
      })(),
    }))

    // Sort by student name alphabetically
    result.sort((a, b) => {
      const nameA = a.student?.name || '';
      const nameB = b.student?.name || '';
      return nameA.localeCompare(nameB);
    });

    const includeMeta = ['1', 'true', 'yes'].includes(String(include_meta || '').trim().toLowerCase())
    if (!includeMeta) {
      return ApiResponseHelper.success(res, result, 'Report grades retrieved successfully')
    }

    const metaAcademicYearId = Number(resolvedAcademicYearId || academic_year_id)
    const discoveredSlotSet = new Set<string>()
    result.forEach((row: any) => {
      const parsed = parseSlotScoreMap(row?.slotScores)
      Object.keys(parsed).forEach((slotCode) => {
        const normalized = normalizeReportSlotCode(slotCode)
        if (normalized && normalized !== DEFAULT_REPORT_SLOT_CODE) {
          discoveredSlotSet.add(normalized)
        }
      })
      if (row?.formatifScore !== null && row?.formatifScore !== undefined) {
        discoveredSlotSet.add('FORMATIF')
      }
      if (row?.sbtsScore !== null && row?.sbtsScore !== undefined) {
        discoveredSlotSet.add('SBTS')
      }
      if (row?.sasScore !== null && row?.sasScore !== undefined) {
        discoveredSlotSet.add('SAS')
      }
      if (row?.satScore !== null && row?.satScore !== undefined) {
        discoveredSlotSet.add('SAT')
      }
    })
    const discoveredSlots = Array.from(discoveredSlotSet)
    const fallbackIncludeSlots =
      discoveredSlots.length > 0 ? discoveredSlots : ['FORMATIF']
    const fallbackFormativeSlot =
      fallbackIncludeSlots.find((slot) => isFormativeAliasCode(slot)) ||
      fallbackIncludeSlots[0] ||
      'FORMATIF'
    const fallbackMidtermSlot =
      fallbackIncludeSlots.find(
        (slot) => isMidtermAliasCode(slot) && slot !== fallbackFormativeSlot,
      ) ||
      fallbackIncludeSlots.find((slot) => slot !== fallbackFormativeSlot) ||
      fallbackIncludeSlots[0] ||
      fallbackFormativeSlot
    const fallbackFinalSlot =
      fallbackIncludeSlots.find(
        (slot) =>
          isFinalAliasCode(slot) &&
          slot !== fallbackFormativeSlot &&
          slot !== fallbackMidtermSlot,
      ) ||
      fallbackIncludeSlots[fallbackIncludeSlots.length - 1] ||
      fallbackMidtermSlot ||
      fallbackFormativeSlot
    const fallbackPrimary = {
      formative: fallbackFormativeSlot,
      midterm: fallbackMidtermSlot,
      final: fallbackFinalSlot,
    }
    const fallbackSlotLabels: Record<string, { label: string; componentType: GradeComponentType }> = {}
    fallbackIncludeSlots.forEach((slotCode, index) => {
      const normalized = normalizeReportSlotCode(slotCode)
      if (!normalized || normalized === DEFAULT_REPORT_SLOT_CODE) return
      const label = formatSlotDisplayLabel(normalized, `Komponen ${index + 1}`)
      fallbackSlotLabels[normalized] = {
        label,
        componentType: inferGradeComponentTypeBySlotCode(
          normalized,
          normalized === fallbackPrimary.formative
            ? GradeComponentType.FORMATIVE
            : normalized === fallbackPrimary.midterm
              ? GradeComponentType.MIDTERM
              : normalized === fallbackPrimary.final
                ? GradeComponentType.FINAL
                : GradeComponentType.CUSTOM,
        ),
      }
    })
    const meta = {
      primarySlots: fallbackPrimary,
      includeSlots: fallbackIncludeSlots,
      slotLabels: fallbackSlotLabels,
    }

    if (Number.isFinite(metaAcademicYearId) && metaAcademicYearId > 0) {
      const [componentRuleMap, masterComponents] = await Promise.all([
        getExamComponentRuleMap(metaAcademicYearId).catch(() => new Map<string, ExamComponentRule>()),
        prisma.examGradeComponent
          .findMany({
            where: {
              academicYearId: metaAcademicYearId,
              isActive: true,
            },
            select: {
              code: true,
              label: true,
              type: true,
              reportSlot: true,
              reportSlotCode: true,
              displayOrder: true,
            },
            orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
          })
          .catch(() => []),
      ])

      const resolvedPrimary = resolvePrimarySlotCodesForSemester(
        componentRuleMap,
        semester ? (semester as Semester) : null,
      )
      const resolvedIncludeSlots = Array.from(resolveIncludedReportSlots(componentRuleMap))
      const slotLabels: Record<string, { label: string; componentType: GradeComponentType }> = {}

      masterComponents.forEach((component) => {
        const slotCode = normalizeReportSlotCode(component.reportSlotCode || component.reportSlot)
        if (!slotCode || slotCode === DEFAULT_REPORT_SLOT_CODE) return
        if (slotLabels[slotCode]) return
        const label = String(component.label || component.code || slotCode).trim() || slotCode
        slotLabels[slotCode] = {
          label,
          componentType: component.type,
        }
      })

      const ensureSlotLabel = (
        slotCode: string,
        fallbackLabel: string,
        fallbackType: GradeComponentType,
      ) => {
        if (!slotLabels[slotCode]) {
          slotLabels[slotCode] = {
            label: formatSlotDisplayLabel(slotCode, fallbackLabel),
            componentType: inferGradeComponentTypeBySlotCode(slotCode, fallbackType),
          }
        }
      }

      ensureSlotLabel(resolvedPrimary.formative, 'Formatif', GradeComponentType.FORMATIVE)
      ensureSlotLabel(resolvedPrimary.midterm, 'Midterm', GradeComponentType.MIDTERM)
      ensureSlotLabel(resolvedPrimary.final, 'Final', GradeComponentType.FINAL)

      meta.primarySlots = resolvedPrimary
      meta.includeSlots = resolvedIncludeSlots.length > 0 ? resolvedIncludeSlots : meta.includeSlots
      meta.slotLabels = slotLabels
    }

    return ApiResponseHelper.success(
      res,
      {
        rows: result,
        meta,
      },
      'Report grades retrieved successfully',
    )
  } catch (error) {
    console.error('Get report grades error:', error)
    throw new ApiError(500, 'Failed to retrieve report grades')
  }
}

export const updateReportGrade = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const {
      formatif_score,
      sbts_score,
      sas_score,
      competency_desc,
      slot_scores,
    } = req.body

    // Get existing report grade
    const existingGrade = await prisma.reportGrade.findUnique({
      where: { id: Number(id) }
    })

    if (!existingGrade) {
      throw new ApiError(404, 'Report grade not found')
    }

    const user = (req as any).user as AuthUserLike
    await ensureTeacherCanAccessGradeContext({
      user,
      subjectId: existingGrade.subjectId,
      academicYearId: existingGrade.academicYearId,
      studentId: existingGrade.studentId,
    })

    const componentRuleMap = await getExamComponentRuleMap(existingGrade.academicYearId)
    const includeSlots = resolveIncludedReportSlots(componentRuleMap)
    const primarySlots = resolvePrimarySlotCodesForSemester(componentRuleMap, existingGrade.semester)
    const nextSlotScores = parseSlotScoreMap(existingGrade.slotScores)

    if (nextSlotScores[primarySlots.formative] === undefined && existingGrade.formatifScore !== null) {
      nextSlotScores[primarySlots.formative] = existingGrade.formatifScore
    }
    if (nextSlotScores[primarySlots.midterm] === undefined && existingGrade.sbtsScore !== null) {
      nextSlotScores[primarySlots.midterm] = existingGrade.sbtsScore
    }
    if (nextSlotScores[primarySlots.final] === undefined && existingGrade.sasScore !== null) {
      nextSlotScores[primarySlots.final] = existingGrade.sasScore
    }

    let scoreUpdated = false
    const legacyUpdates: Array<{ slotCode: string; value: number | null | undefined }> = [
      {
        slotCode: primarySlots.formative,
        value: parseOptionalScoreValue(formatif_score, 'formatif_score'),
      },
      {
        slotCode: primarySlots.midterm,
        value: parseOptionalScoreValue(sbts_score, 'sbts_score'),
      },
      {
        slotCode: primarySlots.final,
        value: parseOptionalScoreValue(sas_score, 'sas_score'),
      },
    ]
    legacyUpdates.forEach((entry) => {
      if (entry.value === undefined) return
      nextSlotScores[entry.slotCode] = entry.value
      scoreUpdated = true
    })

    if (slot_scores !== undefined) {
      if (slot_scores === null) {
        Object.keys(nextSlotScores).forEach((slotCode) => {
          delete nextSlotScores[slotCode]
        })
        scoreUpdated = true
      } else {
        if (typeof slot_scores !== 'object' || Array.isArray(slot_scores)) {
          throw new ApiError(400, 'slot_scores harus berupa object.')
        }
        Object.entries(slot_scores as Record<string, unknown>).forEach(([rawSlot, rawValue]) => {
          const slotCode = normalizeReportSlotCode(rawSlot)
          if (slotCode === DEFAULT_REPORT_SLOT_CODE) return
          const parsed = parseOptionalScoreValue(rawValue, `slot_scores.${slotCode}`)
          if (parsed !== undefined) {
            nextSlotScores[slotCode] = parsed
            scoreUpdated = true
          }
        })
      }
    }

    let finalScore = existingGrade.finalScore
    let predicate = existingGrade.predicate
    if (scoreUpdated) {
      finalScore = recomputeFinalScoreFromSlots(
        nextSlotScores,
        includeSlots,
        existingGrade.finalScore,
        primarySlots,
      )

      let kkm = 75
      const studentClassId = await resolveStudentClassId(
        existingGrade.studentId,
        existingGrade.academicYearId,
      )

      if (studentClassId) {
        const assignment = await prisma.teacherAssignment.findFirst({
          where: {
            classId: studentClassId,
            subjectId: existingGrade.subjectId,
            academicYearId: existingGrade.academicYearId,
          },
          select: { kkm: true },
        })
        if (assignment) kkm = assignment.kkm
      }
      predicate = calculatePredicate(finalScore, kkm)
    }

    const slotScorePayload = Object.fromEntries(
      Object.entries(nextSlotScores).filter(([slotCode]) => slotCode !== DEFAULT_REPORT_SLOT_CODE),
    )

    const reportGrade = await prisma.reportGrade.update({
      where: { id: Number(id) },
      data: {
        formatifScore:
          nextSlotScores[primarySlots.formative] !== undefined
            ? nextSlotScores[primarySlots.formative]
            : null,
        sbtsScore:
          nextSlotScores[primarySlots.midterm] !== undefined
            ? nextSlotScores[primarySlots.midterm]
            : null,
        sasScore:
          nextSlotScores[primarySlots.final] !== undefined
            ? nextSlotScores[primarySlots.final]
            : null,
        slotScores:
          Object.keys(slotScorePayload).length > 0 ? slotScorePayload : Prisma.JsonNull,
        finalScore: finalScore,
        usScore: computeUsScoreFromSlotScores(nextSlotScores),
        predicate,
        description: competency_desc !== undefined ? competency_desc : undefined
      },
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    })

    return ApiResponseHelper.success(res, reportGrade, 'Report grade updated successfully')
  } catch (error) {
    console.error('Update report grade error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to update report grade')
  }
}

// ============================================
// REPORT CARD (Full Report)
// ============================================

export const getStudentReportCard = async (req: Request, res: Response) => {
  try {
    const { student_id, academic_year_id, semester } = req.query
    const user = (req as any).user;
    const targetStudentId = Number(student_id);
    const normalizedSemester = semester as Semester

    if (!student_id || !academic_year_id || !semester) {
      throw new ApiError(400, 'student_id, academic_year_id, and semester are required')
    }

    if (normalizedSemester !== Semester.ODD && normalizedSemester !== Semester.EVEN) {
      throw new ApiError(400, 'semester tidak valid')
    }

    // Security: Students can only view their own report card
    if (user.role === 'STUDENT' && targetStudentId !== user.id) {
      throw new ApiError(403, 'Forbidden: You can only view your own report card')
    }

    // Security: Parents can only view their linked children
    if (user.role === 'PARENT') {
      const parent = await prisma.user.findUnique({
        where: { id: Number(user.id) },
        select: {
          children: {
            select: {
              id: true,
            },
          },
        },
      });

      const childIds = new Set((parent?.children || []).map((child) => child.id));
      if (!childIds.has(targetStudentId)) {
        throw new ApiError(403, 'Forbidden: You can only view report card of your linked child')
      }
    }

    if (user.role === 'STUDENT') {
      const reportType = normalizedSemester === Semester.ODD ? ExamType.SAS : ExamType.SAT
      const reportDate = await prisma.reportDate.findFirst({
        where: {
          academicYearId: Number(academic_year_id),
          semester: normalizedSemester,
          reportType,
        },
        select: {
          date: true,
        },
      })
      const release = resolveStudentSemesterReportRelease({ reportDate })
      if (!release.canViewDetails) {
        throw new ApiError(403, release.description)
      }
    }

    // Get student info
    const student = await prisma.user.findUnique({
      where: { id: targetStudentId },
      include: {
        studentClass: {
          include: {
            major: true,
            academicYear: true
          }
        }
      }
    })

    if (!student) {
      throw new ApiError(404, 'Student not found')
    }

    const historicalStudentSnapshot = await getHistoricalStudentSnapshotForAcademicYear(
      targetStudentId,
      Number(academic_year_id),
    )
    const historicalStudentClassId = Number(historicalStudentSnapshot?.studentClass?.id || 0)
    const currentStudentClassAcademicYearId = Number(student.studentClass?.academicYearId || 0)
    const resolvedStudentClassId =
      historicalStudentClassId > 0
        ? historicalStudentClassId
        : currentStudentClassAcademicYearId === Number(academic_year_id)
          ? Number(student.classId || 0) || null
          : null

    const historicalStudentClass =
      historicalStudentClassId > 0
        ? await prisma.class.findUnique({
            where: { id: historicalStudentClassId },
            include: {
              major: true,
              academicYear: true,
              teacher: true,
            },
          })
        : null

    const resolvedStudent = {
      ...student,
      classId: resolvedStudentClassId,
      studentClass:
        historicalStudentClass ||
        (currentStudentClassAcademicYearId === Number(academic_year_id) ? student.studentClass : null),
    }

    if (user.role === 'STUDENT') {
      const publicationClassId = Number(resolvedStudent.studentClass?.id || resolvedStudent.classId || 0)
      if (publicationClassId > 0) {
        const publicationClass = await prisma.class.findUnique({
          where: {
            id: publicationClassId,
          },
          select: {
            teacher: {
              select: {
                preferences: true,
              },
            },
          },
        })
        const blockedCodes = listBlockedHomeroomResultPublicationCodes({
          preferences: publicationClass?.teacher?.preferences,
          academicYearId: Number(academic_year_id),
          classId: publicationClassId,
          studentId: targetStudentId,
        })

        if (blockedCodes.has(normalizeComponentCode(normalizedSemester === Semester.ODD ? ExamType.SAS : ExamType.SAT))) {
          throw new ApiError(403, 'Wali kelas belum membuka hasil rapor semester ini ke akun siswa.')
        }
      }
    }

    // Get report grades
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: targetStudentId,
        academicYearId: Number(academic_year_id),
        semester: normalizedSemester
      },
      include: {
        subject: true
      },
      orderBy: {
        subject: { name: 'asc' }
      }
    })

    // Get report notes
    // Note: Assuming schema does not have a unique constraint, using findFirst
    const reportNotes = await prisma.reportNote.findFirst({
      where: {
        studentId: targetStudentId,
        academicYearId: Number(academic_year_id),
        semester: normalizedSemester
      }
    })

    // Get attendance summary
    const attendances = await prisma.attendance.findMany({
      where: {
        classId: resolvedStudent.classId || undefined,
        academicYearId: Number(academic_year_id)
      },
      include: {
        records: {
          where: {
            studentId: targetStudentId
          }
        }
      }
    })

    // Aggregate attendance from records
    // Since Attendance is by subject/class/date, we need to count records for this student
    let hadir = 0
    let sakit = 0
    let izin = 0
    let alpha = 0

    attendances.forEach(att => {
      att.records.forEach(rec => {
        if (rec.status === 'PRESENT') hadir++
        else if (rec.status === 'SICK') sakit++
        else if (rec.status === 'PERMISSION') izin++
        else if (rec.status === 'ABSENT') alpha++
      })
    })

    const attendanceSummary = {
      hadir,
      sakit,
      izin,
      alpha
    }

    const normalizedReportGrades = reportGrades.map((grade) => ({
      ...grade,
      finalScore: resolveEffectiveReportFinalScore(grade),
    }))

    // Calculate average
    const average = normalizedReportGrades.length > 0
      ? normalizedReportGrades.reduce((sum: any, grade: any) => sum + Number(grade.finalScore || 0), 0) / normalizedReportGrades.length
      : 0

    return ApiResponseHelper.success(res, {
      student: resolvedStudent,
      reportGrades: normalizedReportGrades,
      reportNotes,
      attendanceSummary,
      average
    }, 'Student report card retrieved successfully')
  } catch (error) {
    console.error('Get student report card error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to retrieve student report card')
  }
}
