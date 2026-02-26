import { Request, Response } from 'express'
import { Semester, GradeComponentType, GradeEntryMode, Prisma, ReportComponentSlot, ExamSessionStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { ApiResponseHelper } from '../utils/ApiResponse'
import { ApiError } from '../utils/api'
import {
  syncAdditionalNfSeriesEntriesFromStudentGrade,
  syncScoreEntriesFromStudentGrade,
} from '../services/scoreEntry.service'

type ReportSlotKey = 'FORMATIF' | 'SBTS' | 'SAS' | 'US_THEORY' | 'US_PRACTICE'

const DEFAULT_REPORT_SLOT_CODE = 'NONE'

type ExamComponentRule = {
  code: string
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

function normalizeComponentCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function defaultReportSlotByType(type: GradeComponentType): ReportComponentSlot {
  if (type === GradeComponentType.FORMATIVE) return ReportComponentSlot.FORMATIF
  if (type === GradeComponentType.MIDTERM) return ReportComponentSlot.SBTS
  if (type === GradeComponentType.FINAL) return ReportComponentSlot.SAS
  if (type === GradeComponentType.US_THEORY) return ReportComponentSlot.US_THEORY
  if (type === GradeComponentType.US_PRACTICE) return ReportComponentSlot.US_PRACTICE
  return ReportComponentSlot.NONE
}

function defaultIncludeInFinalBySlot(slot: ReportComponentSlot): boolean {
  return slot === ReportComponentSlot.FORMATIF || slot === ReportComponentSlot.SBTS || slot === ReportComponentSlot.SAS
}

function defaultGradeEntryModeByCode(code: string): GradeEntryMode {
  return normalizeComponentCode(code) === 'FORMATIVE' ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE
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
        reportSlot: true,
        reportSlotCode: true,
        includeInFinalScore: true,
      },
    })) as Array<{
      code: string
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
          reportSlot: true,
          includeInFinalScore: true,
        },
      })

      return new Map(
        fallbackRows.map((row) => {
          const code = normalizeComponentCode(row.code)
          return [
            code,
            {
              code,
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
    const includeInFinal = configuredRule?.includeInFinalScore ?? defaultIncludeInFinalBySlot(reportSlot)

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

function buildLegacySlotScoreMap(slotScoresByCode: Record<string, number | null>): Record<ReportSlotKey, number | null> {
  const getValue = (slotCode: ReportSlotKey) => {
    const value = slotScoresByCode[slotCode]
    return value === undefined ? null : value
  }
  return {
    FORMATIF: getValue('FORMATIF'),
    SBTS: getValue('SBTS'),
    SAS: getValue('SAS'),
    US_THEORY: getValue('US_THEORY'),
    US_PRACTICE: getValue('US_PRACTICE'),
  }
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
  if (normalizedType === 'FORMATIF') return ReportComponentSlot.FORMATIF
  if (normalizedType === 'SBTS') return ReportComponentSlot.SBTS
  if (normalizedType === 'SAS' || normalizedType === 'SAT') return ReportComponentSlot.SAS
  if (normalizedType === 'US_THEORY') return ReportComponentSlot.US_THEORY
  if (normalizedType === 'US_PRACTICE') return ReportComponentSlot.US_PRACTICE
  return ReportComponentSlot.NONE
}

function defaultReportSlotCodeByExamType(type: string | null | undefined): string {
  return normalizeReportSlotCode(defaultReportSlotByExamType(type))
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
      },
    })) as Array<{
      code: string
      baseType: string
      baseTypeCode?: string | null
      gradeComponentCode?: string | null
    }>

    const map = new Map<string, string>()
    rows.forEach((row) => {
      const normalizedProgramCode = normalizeComponentCode(row.code)
      const normalizedComponentCode = normalizeComponentCode(row.gradeComponentCode)
      const configuredSlotCode = normalizedComponentCode
        ? componentRuleMap.get(normalizedComponentCode)?.reportSlotCode
        : undefined
      const fallbackSlotCode = normalizeReportSlotCode(
        row.baseTypeCode || defaultReportSlotCodeByExamType(row.baseType),
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
          gradeComponentCode: true,
        },
      })

      const map = new Map<string, string>()
      rows.forEach((row) => {
        const normalizedProgramCode = normalizeComponentCode(row.code)
        const normalizedComponentCode = normalizeComponentCode(row.gradeComponentCode)
        const configuredSlotCode = normalizedComponentCode
          ? componentRuleMap.get(normalizedComponentCode)?.reportSlotCode
          : undefined
        const fallbackSlotCode = defaultReportSlotCodeByExamType(row.baseType)
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
    includeSlots.add('FORMATIF')
    includeSlots.add('SBTS')
    includeSlots.add('SAS')
  }

  return includeSlots
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

  return fallbackScore
}

async function collectDynamicFormativeScores(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  semesterRange: SemesterRange
  programSlotMap: Map<string, string>
}): Promise<number[]> {
  const { studentId, subjectId, academicYearId, semester, semesterRange, programSlotMap } = params

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
      return reportSlotCode === 'FORMATIF'
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
              reportSlot: {
                in: [
                  ReportComponentSlot.FORMATIF,
                  ReportComponentSlot.SBTS,
                  ReportComponentSlot.SAS,
                  ReportComponentSlot.US_THEORY,
                  ReportComponentSlot.US_PRACTICE,
                ],
              },
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

    const formattedComponents = components
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
            master?.includeInFinalScore ?? defaultIncludeInFinalBySlot(reportSlot),
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
    })

    if (entrySlotScores.FORMATIF === undefined && dynamicFormativeScores.length > 0) {
      dynamicResult.slotScoresByCode.FORMATIF = calculateAverage(dynamicFormativeScores)
    }

    dynamicResult.legacySlotScores = buildLegacySlotScoreMap(dynamicResult.slotScoresByCode)
    let finalScore = recomputeFinalScoreFromSlots(
      dynamicResult.slotScoresByCode,
      includeSlots,
      dynamicResult.finalScore,
    )
    const reportScores = {
      FORMATIVE: dynamicResult.legacySlotScores.FORMATIF,
      MIDTERM: dynamicResult.legacySlotScores.SBTS,
      FINAL: dynamicResult.legacySlotScores.SAS,
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
    const user = (req as any).user
    let targetStudentId = student_id ? Number(student_id) : undefined;

    // Security: Student can only view their own grades
    if (user.role === 'STUDENT') {
      where.studentId = user.id
      targetStudentId = user.id;
    } else {
      if (student_id) where.studentId = Number(student_id)

      // If class_id is provided (and not student), filter by students in that class
      if (class_id) {
        const students = await prisma.user.findMany({
          where: { classId: Number(class_id) },
          select: { id: true }
        })
        where.studentId = { in: students.map(s => s.id) }
      }
    }

    if (subject_id) where.subjectId = Number(subject_id)
    if (academic_year_id) where.academicYearId = Number(academic_year_id)
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
          const componentCode = normalizeComponentCode(row.component?.code)
          const configuredEntryMode = componentCode ? entryModeByCode.get(componentCode) : null
          const isNfSeries =
            configuredEntryMode === 'NF_SERIES' || row.component?.type === GradeComponentType.FORMATIVE
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

    const component = await prisma.gradeComponent.findUnique({
      where: { id: Number(grade_component_id) },
      select: { type: true },
    })
    if (!component) {
      throw new ApiError(404, 'Komponen nilai tidak ditemukan.')
    }

    const isFormativeComponent = component.type === GradeComponentType.FORMATIVE
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

    if (!Array.isArray(grades) || grades.length === 0) {
      throw new ApiError(400, 'Grades array is required')
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    }

    const uniqueKeys = new Set<string>();
    const componentTypeCache = new Map<number, GradeComponentType>()

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
        let componentType = componentTypeCache.get(componentId)
        if (!componentType) {
          const component = await prisma.gradeComponent.findUnique({
            where: { id: componentId },
            select: { type: true },
          })
          if (!component) {
            throw new ApiError(404, `Komponen nilai tidak ditemukan (id=${componentId}).`)
          }
          componentType = component.type
          componentTypeCache.set(componentId, componentType)
        }

        const isFormativeComponent = componentType === GradeComponentType.FORMATIVE
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
      })
      if (entrySlotScores.FORMATIF === undefined && dynamicFormativeScores.length > 0) {
        dynamicResult.slotScoresByCode.FORMATIF = calculateAverage(dynamicFormativeScores)
      }
      dynamicResult.legacySlotScores = buildLegacySlotScoreMap(dynamicResult.slotScoresByCode)
      const reportScores = {
        FORMATIVE: dynamicResult.legacySlotScores.FORMATIF,
        MIDTERM: dynamicResult.legacySlotScores.SBTS,
        FINAL: dynamicResult.legacySlotScores.SAS,
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
      subject_id
    } = req.query

    const user = (req as any).user;
    const where: any = {}
    
    // Security: Students can only view their own grades
    if (user.role === 'STUDENT') {
      where.studentId = user.id;
    } else {
      if (student_id) where.studentId = Number(student_id)
      
      // If class_id is provided, filter by students in that class
      if (class_id) {
        const students = await prisma.user.findMany({
          where: { classId: Number(class_id) },
          select: { id: true }
        })
        where.studentId = { in: students.map(s => s.id) }
  
        // LAZY SYNC: If we are in a specific context (Class + Subject + Year + Sem),
        // ensure ReportGrades exist for all students.
        if (students.length > 0 && subject_id && academic_year_id && semester) {
          const syncWhere: Prisma.ReportGradeWhereInput = {
            studentId: { in: students.map((s) => s.id) },
            subjectId: Number(subject_id),
            academicYearId: Number(academic_year_id),
            semester: semester as Semester,
          };
          const existingCount = await prisma.reportGrade.count({ where: syncWhere });
          
          // If count mismatch (or force check), run sync
          if (existingCount < students.length) {
              console.log(`[LazySync] Syncing ReportGrades for Class ${class_id} Subject ${subject_id}`);
              // Use Promise.all with chunking or just all at once (assuming class size < 50)
              await Promise.all(students.map(s => 
                  syncReportGrade(
                      s.id, 
                      Number(subject_id), 
                      Number(academic_year_id), 
                      semester as Semester
                  ).catch(err => console.error(`Failed to sync student ${s.id}:`, err))
              ));
          }
        }
      }
    }

    if (academic_year_id) where.academicYearId = Number(academic_year_id)
    if (semester) where.semester = semester as Semester
    if (subject_id) where.subjectId = Number(subject_id)

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

    return ApiResponseHelper.success(res, result, 'Report grades retrieved successfully')
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
      competency_desc
    } = req.body

    // Get existing report grade
    const existingGrade = await prisma.reportGrade.findUnique({
      where: { id: Number(id) }
    })

    if (!existingGrade) {
      throw new ApiError(404, 'Report grade not found')
    }

    // Calculate new final score if component scores are provided
    let finalScore = existingGrade.finalScore
    let predicate = existingGrade.predicate

    if (formatif_score !== undefined || sbts_score !== undefined || sas_score !== undefined) {
      const components = await prisma.gradeComponent.findMany({
        where: {
          isActive: true,
          subjectId: existingGrade.subjectId,
          type: {
            in: [GradeComponentType.FORMATIVE, GradeComponentType.MIDTERM, GradeComponentType.FINAL],
          },
        }
      })

      const scores = {
        FORMATIVE: formatif_score !== undefined ? formatif_score : existingGrade.formatifScore,
        MIDTERM: sbts_score !== undefined ? sbts_score : existingGrade.sbtsScore,
        FINAL: sas_score !== undefined ? sas_score : existingGrade.sasScore
      }

      finalScore = 0
      let totalWeight = 0

      for (const component of components) {
        const componentType = component.type as 'FORMATIVE' | 'MIDTERM' | 'FINAL'
        const score = scores[componentType]
        if (score !== null && score !== undefined) {
          finalScore += score * (component.weight / 100)
          totalWeight += component.weight
        }
      }

      if (totalWeight > 0 && totalWeight !== 100) {
        finalScore = (finalScore / totalWeight) * 100
      } else if (totalWeight === 0) {
        const availableScores = [scores.FORMATIVE, scores.MIDTERM, scores.FINAL].filter(
          (value): value is number => value !== null && value !== undefined
        )
        finalScore = availableScores.length
          ? availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length
          : 0
      }

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

    const reportGrade = await prisma.reportGrade.update({
      where: { id: Number(id) },
      data: {
        formatifScore: formatif_score !== undefined ? formatif_score : undefined,
        sbtsScore: sbts_score !== undefined ? sbts_score : undefined,
        sasScore: sas_score !== undefined ? sas_score : undefined,
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
