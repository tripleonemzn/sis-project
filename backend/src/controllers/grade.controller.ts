import { Request, Response } from 'express'
import { Semester, GradeComponentType, GradeEntryMode, Prisma, ReportComponentSlot, ExamSessionStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { ApiResponseHelper } from '../utils/ApiResponse'
import { ApiError } from '../utils/api'
import {
  syncAdditionalNfSeriesEntriesFromStudentGrade,
  syncScoreEntriesFromStudentGrade,
} from '../services/scoreEntry.service'

const DEFAULT_REPORT_SLOT_CODE = 'NONE'

type ExamComponentRule = {
  code: string
  componentType: GradeComponentType
  reportSlot: ReportComponentSlot
  reportSlotCode: string
  includeInFinalScore: boolean
}

function normalizeReportSlotCode(raw: unknown): string {
  const normalized = normalizeComponentCode(raw)
  return normalized || DEFAULT_REPORT_SLOT_CODE
}

type SemesterRange = {
  start: Date
  end: Date
}

type StudentScoreEntryFindManyDelegate = {
  findMany: (args: unknown) => Promise<unknown[]>
}

type AuthUserLike = {
  id?: number | string
  role?: string | null
}

function getStudentScoreEntryDelegate(): StudentScoreEntryFindManyDelegate | null {
  const delegate = (prisma as unknown as { studentScoreEntry?: StudentScoreEntryFindManyDelegate }).studentScoreEntry
  if (!delegate || typeof delegate.findMany !== 'function') {
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

function isTeacherUser(user: AuthUserLike | null | undefined): boolean {
  return String(user?.role || '').toUpperCase() === 'TEACHER'
}

async function resolveStudentClassId(studentId: number): Promise<number | null> {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { classId: true },
  })
  return Number(student?.classId || 0) || null
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
    resolvedClassId = Number(await resolveStudentClassId(Number(params.studentId))) || 0
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
      const shouldUpdate =
        String(existing.code || '') !== normalizedCode ||
        String(existing.name || '').trim() !== nextName ||
        existing.type !== master.type ||
        existing.isActive !== true

      if (shouldUpdate) {
        await (prisma.gradeComponent as any).update({
          where: { id: existing.id },
          data: {
            code: normalizedCode,
            name: nextName,
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
        weight: 1,
        isActive: true,
      },
    })
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
  let weightedScoreSum = 0
  let totalWeight = 0

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

    const weight = Number(grade.component?.weight ?? 0)
    if (Number.isFinite(weight) && weight > 0) {
      weightedScoreSum += grade.score * (weight / 100)
      totalWeight += weight
    }
  })

  const slotScoresByCode: Record<string, number | null> = {}
  slotBuckets.forEach((values, slotCode) => {
    slotScoresByCode[slotCode] = calculateAverage(values)
  })
  const legacySlotScores = buildLegacySlotScoreMap(slotScoresByCode)

  const selectedSlotScores = Array.from(includeSlots)
    .map((slot) => slotScoresByCode[slot])
    .filter((value): value is number => value !== null && value !== undefined)

  let finalScore = 0
  if (selectedSlotScores.length > 0) {
    finalScore = selectedSlotScores.reduce((sum, value) => sum + value, 0) / selectedSlotScores.length
  } else if (totalWeight > 0 && totalWeight !== 100) {
    finalScore = (weightedScoreSum / totalWeight) * 100
  } else if (totalWeight > 0) {
    finalScore = weightedScoreSum
  }

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

function recomputeFinalScoreFromSlots(
  slotScores: Record<string, number | null>,
  includeSlots: Set<string>,
  fallbackScore: number,
): number {
  const selectedSlotScores = Array.from(includeSlots)
    .map((slot) => slotScores[slot])
    .filter((value): value is number => value !== null && value !== undefined)

  if (selectedSlotScores.length > 0) {
    return selectedSlotScores.reduce((sum, value) => sum + value, 0) / selectedSlotScores.length
  }

  const allSlotScores = Object.values(slotScores).filter(
    (value): value is number => value !== null && value !== undefined,
  )
  if (allSlotScores.length > 0) {
    return allSlotScores.reduce((sum, value) => sum + value, 0) / allSlotScores.length
  }

  return fallbackScore
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

async function collectDynamicSlotScoresFromScoreEntries(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
}): Promise<Record<string, number>> {
  const { studentId, subjectId, academicYearId, semester } = params

  try {
    const studentScoreEntryDelegate = getStudentScoreEntryDelegate()
    if (!studentScoreEntryDelegate) return {}

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
      },
    })) as Array<{
      reportSlotCode?: string | null
      reportSlot?: ReportComponentSlot | null
      score: number | null
    }>

    if (primaryRows.length === 0) return {}

    const buckets = new Map<string, number[]>()
    primaryRows.forEach((row) => {
      const slot = normalizeReportSlotCode(row.reportSlotCode || row.reportSlot)
      if (slot === DEFAULT_REPORT_SLOT_CODE) return
      const score = Number(row.score)
      if (!Number.isFinite(score)) return
      const values = buckets.get(slot) || []
      values.push(score)
      buckets.set(slot, values)
    })

    const result: Record<string, number> = {}
    buckets.forEach((values, slot) => {
      const average = calculateAverage(values)
      if (average !== null) {
        result[slot] = average
      }
    })
    return result
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Compatibility guard if migration has not been applied yet.
      if (error.code === 'P2021' || error.code === 'P2022') {
        try {
          const studentScoreEntryDelegate = getStudentScoreEntryDelegate()
          if (!studentScoreEntryDelegate) return {}

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
            },
          })) as Array<{ reportSlot: ReportComponentSlot | null; score: number | null }>

          const buckets = new Map<string, number[]>()
          fallbackRows.forEach((row) => {
            const slot = normalizeReportSlotCode(row.reportSlot)
            if (slot === DEFAULT_REPORT_SLOT_CODE) return
            const score = Number(row.score)
            if (!Number.isFinite(score)) return
            const values = buckets.get(slot) || []
            values.push(score)
            buckets.set(slot, values)
          })

          const result: Record<string, number> = {}
          buckets.forEach((values, slot) => {
            const average = calculateAverage(values)
            if (average !== null) {
              result[slot] = average
            }
          })
          return result
        } catch {
          return {}
        }
      }
    }
    console.error('Failed to read student score entries:', error)
    return {}
  }
}

// ============================================
// GRADE COMPONENTS
// ============================================

export const getGradeComponents = async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const { subject_id, academic_year_id, academicYearId } = req.query
    const subjectId = Number(subject_id)
    const where: any = { isActive: true }
    const resolvedAcademicYearId = await resolveAcademicYearIdForGradeComponents(
      academic_year_id ?? academicYearId,
    )

    if (Number.isFinite(subjectId) && subjectId > 0) {
      where.subjectId = subjectId
      if (resolvedAcademicYearId) {
        await syncSubjectGradeComponentsFromExamMaster(subjectId, resolvedAcademicYearId)
      }
    }

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

    const elapsed = Date.now() - t0
    console.log(`getGradeComponents executed in ${elapsed}ms`)

    return ApiResponseHelper.success(
      res,
      formattedComponents,
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
  try {
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
    const primarySlots = resolvePrimarySlotCodesFromRules(componentRuleMap)
    const semesterRange = resolveSemesterRange(academicYear, semester)
    const programSlotMap = await getProgramReportSlotMap(academicYearId, componentRuleMap)

    const activeGrades = grades.filter((grade) => grade.component?.isActive !== false)
    const dynamicResult = computeDynamicReportFromGrades(activeGrades, componentRuleMap)
    const entrySlotScores = await collectDynamicSlotScoresFromScoreEntries({
      studentId,
      subjectId,
      academicYearId,
      semester,
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

    dynamicResult.legacySlotScores = buildLegacySlotScoreMap(dynamicResult.slotScoresByCode)
    let finalScore = recomputeFinalScoreFromSlots(
      dynamicResult.slotScoresByCode,
      includeSlots,
      dynamicResult.finalScore,
    )
    const reportScores = {
      FORMATIVE: dynamicResult.slotScoresByCode[primarySlots.formative] ?? null,
      MIDTERM: dynamicResult.slotScoresByCode[primarySlots.midterm] ?? null,
      FINAL: dynamicResult.slotScoresByCode[primarySlots.final] ?? null,
    }

    // Get KKM
    let kkm = 75;
    const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { classId: true }
    });
    
    if (student?.classId) {
        const assignment = await prisma.teacherAssignment.findFirst({
            where: {
                classId: student.classId,
                subjectId: subjectId,
                academicYearId: academicYearId
            },
            select: { kkm: true }
        });
        if (assignment) kkm = assignment.kkm;
    }

    const predicate = calculatePredicate(finalScore, kkm);

    // 4. US Score Logic (Copied from generateReportGrades)
    let usScore: number | null = null;
    const subject = await prisma.subject.findUnique({ 
        where: { id: subjectId },
        include: { category: true }
    });
    
    if (subject) {
        const sName = subject.name.toLowerCase();
        const isTeoriKejuruan = sName.includes('teori kejuruan') || sName.includes('kompetensi keahlian') || subject.category?.code === 'KEJURUAN' || subject.category?.code === 'KOMPETENSI_KEAHLIAN';
        
        const isUSSubject = 
            sName.includes('bahasa indonesia') ||
            sName.includes('bahasa inggris') ||
            sName.includes('agama') ||
            sName.includes('pancasila') ||
            sName.includes('matematika') ||
            sName.includes('bahasa sunda') ||
            isTeoriKejuruan;

        if (isUSSubject) {
            const theoryScore = Number(dynamicResult.slotScoresByCode.US_THEORY || 0);
            const practiceScore = Number(dynamicResult.slotScoresByCode.US_PRACTICE || 0);
            
            if (
                sName.includes('bahasa indonesia') ||
                sName.includes('bahasa inggris') ||
                sName.includes('agama') ||
                isTeoriKejuruan
            ) {
                usScore = (theoryScore * 0.5) + (practiceScore * 0.5);
            } else if (
                sName.includes('pancasila') ||
                sName.includes('matematika') ||
                sName.includes('bahasa sunda')
            ) {
                usScore = theoryScore;
            }
        }
    }

    // 5. Upsert ReportGrade
    const existing = await prisma.reportGrade.findFirst({
        where: { studentId, subjectId, academicYearId, semester }
    });

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
                usScore
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
                usScore
            } as any
        });
    }
  } catch (error) {
    console.error('Error syncing report grade:', error);
    // Don't throw, just log. We don't want to block the main save operation.
  }
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
        const students = await prisma.user.findMany({
          where: { classId: parsedClassId },
          select: { id: true }
        })
        where.studentId = { in: students.map(s => s.id) }
      }
    }

    if (parsedSubjectId) where.subjectId = parsedSubjectId
    if (parsedAcademicYearId) where.academicYearId = parsedAcademicYearId
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
            classId: true
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

    // Fetch KKM data
    let gradesWithKkm = [...grades] as any[];
    
    // We need to attach KKM. 
    // If we have a single student, we can look up their class level.
    // If multiple students, we might need to look up each.
    // For optimization, if user.role === STUDENT, we know the student.
    
    if (grades.length > 0) {
      // Get all unique class IDs involved
      const classIds = [...new Set(grades.map(g => g.student?.classId).filter(id => id))];
      
      if (classIds.length > 0) {
        const classes = await prisma.class.findMany({
          where: { id: { in: classIds as number[] } },
          select: { id: true, level: true }
        });
        
        const classLevelMap = new Map(classes.map(c => [c.id, c.level]));
        const levels = [...new Set(classes.map(c => c.level))];
        const academicYearId = grades[0].academicYearId; // Assuming filtered by one academic year usually

        // Fetch KKMs for these levels and subjects
        const subjectIds = [...new Set(grades.map(g => g.subjectId))];
        
        const kkms = await prisma.subjectKKM.findMany({
          where: {
            subjectId: { in: subjectIds },
            academicYearId: academicYearId,
            classLevel: { in: levels }
          }
        });

        // Map KKMs for easy lookup: subjectId-level -> kkm
        const kkmMap = new Map<string, number>();
        kkms.forEach(k => {
          kkmMap.set(`${k.subjectId}-${k.classLevel}`, k.kkm);
        });

        gradesWithKkm = grades.map(grade => {
          const classLevel = grade.student?.classId ? classLevelMap.get(grade.student.classId) : null;
          let kkm = 75; // Default
          
          if (classLevel) {
            const foundKkm = kkmMap.get(`${grade.subjectId}-${classLevel}`);
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
        const studentScoreEntryDelegate = getStudentScoreEntryDelegate()
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
            row.formativeSeries = nfRows.map((item) => item.value)
            continue
          }
          const fallbackScore = scoreFallbackMap.get(Number(row.id))
          if (fallbackScore !== undefined) {
            row.formativeSeries = [fallbackScore]
            continue
          }
          const legacySeries = normalizeLegacySeriesValues([row.nf1, row.nf2, row.nf3, row.nf4, row.nf5, row.nf6])
          if (legacySeries.length > 0) {
            row.formativeSeries = legacySeries
          }
        }
      }
    }

    return ApiResponseHelper.success(res, formattedGradesWithSeries, 'Student grades retrieved successfully')
  } catch (error) {
    console.error('Get student grades error:', error)
    throw new ApiError(500, 'Failed to retrieve student grades')
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

    const component = await prisma.gradeComponent.findUnique({
      where: { id: Number(grade_component_id) },
      select: { type: true, code: true },
    })
    if (!component) {
      throw new ApiError(404, 'Komponen nilai tidak ditemukan.')
    }

    const componentEntryMode = await resolveGradeEntryModeFromMasterConfig({
      academicYearId: Number(academic_year_id),
      componentCode: component.code,
      componentType: component.type,
    })
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

    if (isFormativeComponent && normalizedSeries.provided) {
      const seriesValues = normalizedSeries.values
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
      (!isFormativeComponent || normalizedSeries.values.length === 0)

    if (shouldDeleteGrade) {
      if (existingGrades.length > 0) {
        await cleanupStudentGradeDuplicates(existingGrades.map((row) => row.id))
      }
      try {
        await syncReportGrade(
          Number(student_id),
          Number(subject_id),
          Number(academic_year_id),
          semester as Semester
        )
      } catch (error) {
        console.error('Failed to sync report grade after deleting student grade:', error)
      }
      return ApiResponseHelper.success(
        res,
        {
          deleted: !!existingGrade,
          student_id: Number(student_id),
          subject_id: Number(subject_id),
          component_id: Number(grade_component_id),
          semester,
        },
        existingGrade ? 'Student grade deleted successfully' : 'No student grade found to delete',
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
      }
      if (duplicateGrades.length > 0) {
        await cleanupStudentGradeDuplicates(duplicateGrades.map((row) => row.id))
      }
    } catch (scoreEntryError) {
      console.error('Failed to sync score entries from student grade:', scoreEntryError)
    }

    // Sync Report Grade
    try {
      await syncReportGrade(
        Number(student_id),
        Number(subject_id),
        Number(academic_year_id),
        semester as Semester
      )
    } catch (error) {
      console.error('Failed to sync report grade:', error)
    }

    return ApiResponseHelper.success(res, grade, 'Student grade saved successfully')
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
        select: { id: true, classId: true },
      })
      const studentClassMap = new Map<number, number>()
      studentRows.forEach((row) => {
        const classId = Number(row.classId || 0)
        if (Number.isFinite(classId) && classId > 0) {
          studentClassMap.set(Number(row.id), classId)
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
        const classId = Number(studentClassMap.get(studentId) || 0)
        if (!classId) {
          throw new ApiError(400, `Siswa ${studentId} tidak memiliki kelas aktif.`)
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
      errors: [] as any[]
    }

    const uniqueKeys = new Set<string>();
    const componentConfigCache = new Map<
      number,
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
          description // Add description to destructured variables
        } = gradeData

        // Track for sync
        uniqueKeys.add(`${student_id}-${subject_id}-${academic_year_id}-${semester}`);

        const componentId = Number(grade_component_id)
        let componentConfig = componentConfigCache.get(componentId)
        if (!componentConfig) {
          const component = await prisma.gradeComponent.findUnique({
            where: { id: componentId },
            select: { type: true, code: true },
          })
          if (!component) {
            throw new ApiError(404, `Komponen nilai tidak ditemukan (id=${componentId}).`)
          }
          const entryMode = await resolveGradeEntryModeFromMasterConfig({
            academicYearId: Number(academic_year_id),
            componentCode: component.code,
            componentType: component.type,
          })
          componentConfig = {
            type: component.type,
            code: component.code,
            entryMode,
          }
          componentConfigCache.set(componentId, componentConfig)
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

        if (isFormativeComponent && normalizedSeries.provided) {
          const seriesValues = normalizedSeries.values
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

        // Handle ReportGrade description update if provided
        if (description !== undefined) {
          // Find or create ReportGrade to update description
          const reportGrade = await prisma.reportGrade.findFirst({
            where: {
              studentId: Number(student_id),
              subjectId: Number(subject_id),
              academicYearId: Number(academic_year_id),
              semester: semester as Semester
            }
          })

          if (reportGrade) {
            await prisma.reportGrade.update({
              where: { id: reportGrade.id },
              data: { description: description }
            })
          } else {
            // If ReportGrade doesn't exist, we might need to create it or wait for generation
            // Ideally it should exist or be created via generateReportGrades.
            // But let's create a placeholder if it doesn't exist, preserving the description.
            // However, creating it without scores might be premature.
            // Let's assume we only update if it exists or create with minimal data.
            await prisma.reportGrade.create({
              data: {
                studentId: Number(student_id),
                subjectId: Number(subject_id),
                academicYearId: Number(academic_year_id),
                semester: semester as Semester,
                finalScore: 0, // Default
                description: description
              }
            })
          }
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
          (!isFormativeComponent || normalizedSeries.values.length === 0)

        if (shouldDeleteGrade) {
          if (existingGrades.length > 0) {
            await cleanupStudentGradeDuplicates(existingGrades.map((row) => row.id))
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
      try {
        await syncReportGrade(
          Number(studentId),
          Number(subjectId),
          Number(academicYearId),
          semester as Semester
        )
      } catch (err) {
        console.error(`Failed to sync report grade for ${key}:`, err)
      }
    })

    await Promise.all(syncPromises)

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

    // Get student class to determine KKM
    const student = await prisma.user.findUnique({
      where: { id: Number(student_id) },
      select: { classId: true }
    })

    if (!student) {
      throw new ApiError(404, 'Student not found')
    }

    // Pre-fetch KKM for all subjects in this class
    const assignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: student.classId || 0,
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
    const primarySlots = resolvePrimarySlotCodesFromRules(componentRuleMap)
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
      const entrySlotScores = await collectDynamicSlotScoresFromScoreEntries({
        studentId: Number(student_id),
        subjectId: Number(subjectId),
        academicYearId: Number(academic_year_id),
        semester: semester as Semester,
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
      )

      const kkm = kkmMap.get(Number(subjectId)) || 75
      const predicate = calculatePredicate(finalScore, kkm)

      // ==========================================
      // UJIAN SEKOLAH (US) CALCULATION LOGIC
      // ==========================================
      let usScore: number | null = null
      const sName = subject.name.toLowerCase()
      const isTeoriKejuruan = sName.includes('teori kejuruan') || sName.includes('kompetensi keahlian') || subject.category?.code === 'KEJURUAN' || subject.category?.code === 'KOMPETENSI_KEAHLIAN'

      // Check if subject is one of the "Ujian Sekolah" subjects
      const isUSSubject = 
        sName.includes('bahasa indonesia') ||
        sName.includes('bahasa inggris') ||
        sName.includes('agama') || // Pendidikan Agama...
        sName.includes('pancasila') ||
        sName.includes('matematika') ||
        sName.includes('bahasa sunda') ||
        isTeoriKejuruan

      if (isUSSubject) {
        const theoryScore = Number(dynamicResult.slotScoresByCode.US_THEORY || 0)
        const practiceScore = Number(dynamicResult.slotScoresByCode.US_PRACTICE || 0)
        
        // Rule 3 & 4: 50% Theory + 50% Practice
        // Subjects: B. Indo, B. Ing, PABP, Teori Kejuruan
        if (
          sName.includes('bahasa indonesia') ||
          sName.includes('bahasa inggris') ||
          sName.includes('agama') ||
          isTeoriKejuruan
        ) {
          // If both exist, 50:50. If only one, maybe 100? 
          // User implies both are needed. Let's assume 0 if missing, or strict 50/50.
          // "penggabungan bobot 50%+50%"
          usScore = (theoryScore * 0.5) + (practiceScore * 0.5)
        }
        // Rule 7: 100% Theory
        // Subjects: Pancasila, Matematika, B. Sunda
        else if (
          sName.includes('pancasila') ||
          sName.includes('matematika') ||
          sName.includes('bahasa sunda')
        ) {
          usScore = theoryScore
        }
      }

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
        const students = await prisma.user.findMany({
          where: { classId: parsedClassId },
          select: { id: true }
        })
        where.studentId = { in: students.map(s => s.id) }
  
        // LAZY SYNC: If we are in a specific context (Class + Subject + Year + Sem),
        // ensure ReportGrades exist for all students.
        if (students.length > 0 && parsedSubjectId && parsedAcademicYearId && semester) {
          const syncWhere: Prisma.ReportGradeWhereInput = {
            studentId: { in: students.map((s) => s.id) },
            subjectId: parsedSubjectId,
            academicYearId: parsedAcademicYearId,
            semester: semester as Semester,
          };
          const existingCount = await prisma.reportGrade.count({ where: syncWhere });
          
          // If count mismatch (or force check), run sync
          if (existingCount < students.length) {
              console.log(`[LazySync] Syncing ReportGrades for Class ${parsedClassId} Subject ${parsedSubjectId}`);
              // Use Promise.all with chunking or just all at once (assuming class size < 50)
              await Promise.all(students.map(s => 
                  syncReportGrade(
                      s.id, 
                      parsedSubjectId, 
                      parsedAcademicYearId, 
                      semester as Semester
                  ).catch(err => console.error(`Failed to sync student ${s.id}:`, err))
              ));
          }
        }
      }
    }

    if (parsedAcademicYearId) where.academicYearId = parsedAcademicYearId
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
            major: {
              select: {
                name: true
              }
            }
          }
        }
      }
    })
    
    const studentMap = students.reduce((acc, student) => {
      acc[student.id] = student
      return acc
    }, {} as any)

    const result = reportGrades.map(grade => ({
      ...grade,
      student: studentMap[grade.studentId]
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

    const resolvedAcademicYearId = Number(academic_year_id)
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

    if (Number.isFinite(resolvedAcademicYearId) && resolvedAcademicYearId > 0) {
      const [componentRuleMap, masterComponents] = await Promise.all([
        getExamComponentRuleMap(resolvedAcademicYearId).catch(() => new Map<string, ExamComponentRule>()),
        prisma.examGradeComponent
          .findMany({
            where: {
              academicYearId: resolvedAcademicYearId,
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

      const resolvedPrimary = resolvePrimarySlotCodesFromRules(componentRuleMap)
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
    const primarySlots = resolvePrimarySlotCodesFromRules(componentRuleMap)
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
      )

      let kkm = 75
      const student = await prisma.user.findUnique({
        where: { id: existingGrade.studentId },
        select: { classId: true },
      })

      if (student?.classId) {
        const assignment = await prisma.teacherAssignment.findFirst({
          where: {
            classId: student.classId,
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

    if (!student_id || !academic_year_id || !semester) {
      throw new ApiError(400, 'student_id, academic_year_id, and semester are required')
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

    // Get report grades
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: targetStudentId,
        academicYearId: Number(academic_year_id),
        semester: semester as Semester
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
        semester: semester as Semester
      }
    })

    // Get attendance summary
    const attendances = await prisma.attendance.findMany({
      where: {
        classId: student.classId || undefined,
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

    // Calculate average
    const average = reportGrades.length > 0
      ? reportGrades.reduce((sum: any, grade: any) => sum + grade.finalScore, 0) / reportGrades.length
      : 0

    return ApiResponseHelper.success(res, {
      student,
      reportGrades,
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
