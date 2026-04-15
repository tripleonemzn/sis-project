import {
  ExamType,
  GradeComponentType,
  GradeEntryMode,
  Prisma,
  ReportComponentSlot,
  Semester,
} from '@prisma/client'
import prisma from '../utils/prisma'

type ScoreEntrySourceType = 'MANUAL_GRADE' | 'EXAM_SESSION' | 'ASSIGNMENT_SUBMISSION' | 'IMPORT' | 'MIGRATION'

function normalizeCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isFormativeAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  if (!normalized) return false
  return normalized === 'FORMATIF' || normalized === 'FORMATIVE' || normalized.startsWith('NF')
}

function isMidtermAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  if (!normalized) return false
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(normalized)) return true
  return normalized.includes('MIDTERM')
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  if (!normalized) return false
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true
  return normalized === 'FINAL' || normalized.includes('FINAL_EVEN')
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  if (!normalized) return false
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true
  return normalized.includes('FINAL_ODD')
}

function isFinalAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  if (!normalized) return false
  if (isFinalOddAliasCode(normalized) || isFinalEvenAliasCode(normalized)) return true
  return normalized === 'FINAL' || normalized.includes('FINAL')
}

function isUsTheoryAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  return normalized === 'US_THEORY' || normalized === 'US_TEORI'
}

function isUsPracticeAliasCode(raw: unknown): boolean {
  const normalized = normalizeCode(raw)
  return normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK'
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function normalizeScore(rawScore: number, maxScore?: number | null): number {
  if (!Number.isFinite(rawScore)) return 0
  if (Number.isFinite(Number(maxScore)) && Number(maxScore) > 0) {
    return clampScore((rawScore / Number(maxScore)) * 100)
  }
  return clampScore(rawScore)
}

function defaultReportSlotByComponentType(type?: GradeComponentType | null): ReportComponentSlot {
  if (type === GradeComponentType.FORMATIVE) return ReportComponentSlot.FORMATIF
  if (type === GradeComponentType.MIDTERM) return ReportComponentSlot.SBTS
  if (type === GradeComponentType.FINAL) return ReportComponentSlot.SAS
  if (type === GradeComponentType.US_THEORY) return ReportComponentSlot.US_THEORY
  if (type === GradeComponentType.US_PRACTICE) return ReportComponentSlot.US_PRACTICE
  return ReportComponentSlot.NONE
}

function defaultReportSlotCodeByComponentType(type?: GradeComponentType | null): string {
  return String(defaultReportSlotByComponentType(type) || 'NONE')
}

function inferReportSlotCodeFromAlias(
  rawCode: unknown,
  fallback = 'NONE',
  fixedSemester?: Semester | null,
): string {
  const code = normalizeCode(rawCode)
  if (!code) return fallback
  if (isFormativeAliasCode(code)) return 'FORMATIF'
  if (isMidtermAliasCode(code)) return 'SBTS'
  if (isFinalEvenAliasCode(code)) return 'SAT'
  if (isFinalOddAliasCode(code)) return 'SAS'
  if (isFinalAliasCode(code)) return fixedSemester === Semester.EVEN ? 'SAT' : 'SAS'
  if (isUsTheoryAliasCode(code)) return 'US_THEORY'
  if (isUsPracticeAliasCode(code)) return 'US_PRACTICE'
  if (code === 'NONE') return 'NONE'
  return fallback
}

function mapReportSlotEnumFromCode(
  code: string,
  fallback: ReportComponentSlot = ReportComponentSlot.NONE,
): ReportComponentSlot {
  if (isFormativeAliasCode(code)) return ReportComponentSlot.FORMATIF
  if (isMidtermAliasCode(code)) return ReportComponentSlot.SBTS
  if (isFinalAliasCode(code)) return ReportComponentSlot.SAS
  if (isUsTheoryAliasCode(code)) return ReportComponentSlot.US_THEORY
  if (isUsPracticeAliasCode(code)) return ReportComponentSlot.US_PRACTICE
  if (code === 'NONE') return ReportComponentSlot.NONE
  return fallback
}

function defaultComponentCodeByType(type?: GradeComponentType | null): string {
  if (type === GradeComponentType.FORMATIVE) return 'FORMATIVE'
  if (type === GradeComponentType.MIDTERM) return 'MIDTERM'
  if (type === GradeComponentType.FINAL) return 'FINAL'
  if (type === GradeComponentType.US_PRACTICE) return 'US_PRACTICE'
  if (type === GradeComponentType.US_THEORY) return 'US_THEORY'
  if (type === GradeComponentType.SKILL) return 'SKILL'
  return 'CUSTOM'
}

function defaultComponentCodeByExamType(type?: ExamType | null): string {
  if (type === ExamType.FORMATIF) return 'FORMATIVE'
  if (type === ExamType.SBTS) return 'MIDTERM'
  if (type === ExamType.SAS || type === ExamType.SAT) return 'FINAL'
  if (type === ExamType.US_PRACTICE) return 'US_PRACTICE'
  if (type === ExamType.US_THEORY) return 'US_THEORY'
  return 'CUSTOM'
}

function defaultComponentCodeByBaseTypeCode(code?: string | null): string {
  const normalized = normalizeCode(code)
  if (!normalized) return 'CUSTOM'
  if (isFormativeAliasCode(normalized)) return 'FORMATIVE'
  if (isMidtermAliasCode(normalized)) return 'MIDTERM'
  if (isFinalAliasCode(normalized)) return 'FINAL'
  if (isUsPracticeAliasCode(normalized)) return 'US_PRACTICE'
  if (isUsTheoryAliasCode(normalized)) return 'US_THEORY'
  return normalized
}

function mapComponentTypeFromCode(
  code: string,
  fallback: GradeComponentType = GradeComponentType.CUSTOM,
): GradeComponentType {
  const normalized = normalizeCode(code)
  if (isFormativeAliasCode(normalized)) return GradeComponentType.FORMATIVE
  if (isMidtermAliasCode(normalized)) return GradeComponentType.MIDTERM
  if (isFinalAliasCode(normalized)) return GradeComponentType.FINAL
  if (isUsTheoryAliasCode(normalized)) return GradeComponentType.US_THEORY
  if (isUsPracticeAliasCode(normalized)) return GradeComponentType.US_PRACTICE
  if (normalized === 'SKILL') return GradeComponentType.SKILL
  return fallback
}

function defaultEntryModeByCode(code: string): GradeEntryMode {
  return isFormativeAliasCode(code) ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE
}

function defaultReportSlotByExamType(type?: ExamType | null): ReportComponentSlot {
  if (type === ExamType.FORMATIF) return ReportComponentSlot.FORMATIF
  if (type === ExamType.SBTS) return ReportComponentSlot.SBTS
  if (type === ExamType.SAS || type === ExamType.SAT) return ReportComponentSlot.SAS
  if (type === ExamType.US_THEORY) return ReportComponentSlot.US_THEORY
  if (type === ExamType.US_PRACTICE) return ReportComponentSlot.US_PRACTICE
  return ReportComponentSlot.NONE
}

function defaultReportSlotCodeByExamType(type?: ExamType | null): string {
  return inferReportSlotCodeFromAlias(type, String(defaultReportSlotByExamType(type) || 'NONE'))
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function sanitizeLegacyFormativeSeriesValues(rawValues: Array<number | null>): number[] {
  const values = rawValues.filter((value): value is number => value !== null && Number.isFinite(value))
  if (values.length === 0) return []
  if (values.every((value) => value === 0)) return []

  let lastNonZeroIndex = -1
  values.forEach((value, index) => {
    if (value !== 0) lastNonZeroIndex = index
  })

  if (lastNonZeroIndex < 0) return []
  return values.slice(0, lastNonZeroIndex + 1)
}

function normalizeMetadata(metadata?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined
  return metadata as Prisma.InputJsonValue
}

async function resolveComponentConfig(
  academicYearId: number,
  componentCodeRaw: string,
  fallbackType?: GradeComponentType | null,
) {
  const componentCode = normalizeCode(componentCodeRaw)
  const componentMaster = componentCode
    ? await prisma.examGradeComponent.findFirst({
        where: {
          academicYearId,
          code: componentCode,
        },
        select: {
          type: true,
          typeCode: true,
          entryMode: true,
          entryModeCode: true,
          reportSlot: true,
          reportSlotCode: true,
        },
      })
    : null

  const resolvedType = componentMaster?.type || mapComponentTypeFromCode(componentCode, fallbackType || GradeComponentType.CUSTOM)
  const resolvedTypeCode = normalizeCode(componentMaster?.typeCode || resolvedType || componentCode || 'CUSTOM')
  const resolvedEntryMode =
    componentMaster?.entryMode ||
    defaultEntryModeByCode(componentCode || defaultComponentCodeByType(resolvedType))
  const resolvedEntryModeCode = normalizeCode(componentMaster?.entryModeCode || resolvedEntryMode || 'SINGLE_SCORE')
  const resolvedReportSlot = componentMaster?.reportSlot || defaultReportSlotByComponentType(resolvedType)
  const resolvedReportSlotCode = inferReportSlotCodeFromAlias(
    componentMaster?.reportSlotCode || resolvedReportSlot || componentCode || resolvedTypeCode,
    defaultReportSlotCodeByComponentType(resolvedType),
  )
  return {
    componentCode: componentCode || defaultComponentCodeByType(resolvedType),
    componentType: resolvedType,
    componentTypeCode: resolvedTypeCode || 'CUSTOM',
    reportSlot: mapReportSlotEnumFromCode(resolvedReportSlotCode, resolvedReportSlot),
    reportSlotCode: resolvedReportSlotCode || defaultReportSlotCodeByComponentType(resolvedType),
    entryMode: resolvedEntryMode,
    entryModeCode: resolvedEntryModeCode || String(resolvedEntryMode || 'SINGLE_SCORE'),
  }
}

async function resolveDefaultFormativeComponentCode(academicYearId: number): Promise<string> {
  try {
    const formativeComponent = await prisma.examGradeComponent.findFirst({
      where: {
        academicYearId,
        isActive: true,
        OR: [
          { entryMode: GradeEntryMode.NF_SERIES },
          { entryModeCode: 'NF_SERIES' },
          { type: GradeComponentType.FORMATIVE },
          { typeCode: 'FORMATIVE' },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: { code: true },
    })
    const resolvedCode = normalizeCode(formativeComponent?.code)
    if (resolvedCode) return resolvedCode
  } catch {
    // fallback below
  }
  return 'FORMATIVE'
}

async function resolveProgramConfig(params: {
  academicYearId: number
  examType?: ExamType | null
  programCode?: string | null
}) {
  const normalizedProgramCode = normalizeCode(params.programCode)
  const programConfig = normalizedProgramCode
    ? await prisma.examProgramConfig.findFirst({
        where: {
          academicYearId: params.academicYearId,
          code: normalizedProgramCode,
        },
        select: {
          baseType: true,
          baseTypeCode: true,
          fixedSemester: true,
          gradeComponentCode: true,
          gradeComponentType: true,
          gradeComponentTypeCode: true,
          gradeEntryMode: true,
          gradeEntryModeCode: true,
        },
      })
    : null

  const fallbackCode =
    defaultComponentCodeByBaseTypeCode(
      normalizeCode(programConfig?.baseTypeCode || programConfig?.baseType),
    ) || defaultComponentCodeByExamType(params.examType)
  const componentCode = normalizeCode(programConfig?.gradeComponentCode || fallbackCode)
  const componentConfig = await resolveComponentConfig(
    params.academicYearId,
    componentCode,
    programConfig?.gradeComponentType || mapComponentTypeFromCode(componentCode),
  )

  const fallbackProgramSlotCode = inferReportSlotCodeFromAlias(
    programConfig?.baseTypeCode || programConfig?.baseType || params.examType,
    defaultReportSlotCodeByExamType(params.examType),
    programConfig?.fixedSemester || null,
  )
  const resolvedProgramSlotCode = inferReportSlotCodeFromAlias(
    componentConfig.reportSlotCode || fallbackProgramSlotCode,
    fallbackProgramSlotCode,
    programConfig?.fixedSemester || null,
  )
  return {
    componentCode: componentConfig.componentCode,
    componentType: componentConfig.componentType,
    componentTypeCode:
      normalizeCode(programConfig?.gradeComponentTypeCode || componentConfig.componentTypeCode) ||
      componentConfig.componentTypeCode,
    reportSlot: mapReportSlotEnumFromCode(
      resolvedProgramSlotCode,
      componentConfig.reportSlot || defaultReportSlotByExamType(params.examType),
    ),
    reportSlotCode: resolvedProgramSlotCode,
    entryMode: programConfig?.gradeEntryMode || componentConfig.entryMode,
    entryModeCode:
      normalizeCode(programConfig?.gradeEntryModeCode || componentConfig.entryModeCode) ||
      componentConfig.entryModeCode,
  }
}

async function upsertScoreEntry(params: {
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  componentCode: string
  componentType?: GradeComponentType | null
  componentTypeCode?: string | null
  reportSlot?: ReportComponentSlot | null
  reportSlotCode?: string | null
  rawScore: number
  maxScore?: number | null
  sourceType: ScoreEntrySourceType
  sourceKey: string
  metadata?: Record<string, unknown> | null
}) {
  const sourceKey = String(params.sourceKey || '').trim()
  if (!sourceKey) return

  const componentCode = normalizeCode(params.componentCode) || defaultComponentCodeByType(params.componentType)
  const rawScore = toFiniteNumber(params.rawScore)
  if (rawScore === null) return
  const maxScore = toFiniteNumber(params.maxScore)
  const normalizedScore = normalizeScore(rawScore, maxScore)
  const componentType = params.componentType || mapComponentTypeFromCode(componentCode)
  const componentTypeCode =
    normalizeCode(params.componentTypeCode || componentType || componentCode) || componentCode || 'CUSTOM'
  const reportSlotCode =
    normalizeCode(params.reportSlotCode || params.reportSlot || defaultReportSlotCodeByComponentType(componentType)) ||
    'NONE'
  const reportSlot = mapReportSlotEnumFromCode(
    reportSlotCode,
    params.reportSlot || defaultReportSlotByComponentType(componentType),
  )

  await prisma.studentScoreEntry.upsert({
    where: { sourceKey },
    update: {
      studentId: params.studentId,
      subjectId: params.subjectId,
      academicYearId: params.academicYearId,
      semester: params.semester,
      componentCode,
      componentType,
      componentTypeCode,
      reportSlot,
      reportSlotCode,
      score: normalizedScore,
      rawScore,
      maxScore,
      sourceType: params.sourceType,
      metadata: normalizeMetadata(params.metadata),
      recordedAt: new Date(),
    },
    create: {
      studentId: params.studentId,
      subjectId: params.subjectId,
      academicYearId: params.academicYearId,
      semester: params.semester,
      componentCode,
      componentType,
      componentTypeCode,
      reportSlot,
      reportSlotCode,
      score: normalizedScore,
      rawScore,
      maxScore,
      sourceType: params.sourceType,
      sourceKey,
      metadata: normalizeMetadata(params.metadata),
    },
  })
}

async function deleteScoreEntryByKeys(sourceKeys: string[]) {
  const keys = sourceKeys.map((item) => String(item || '').trim()).filter(Boolean)
  if (keys.length === 0) return
  await prisma.studentScoreEntry.deleteMany({
    where: {
      sourceKey: {
        in: keys,
      },
    },
  })
}

export async function syncScoreEntriesFromStudentGrade(gradeId: number) {
  const grade = await prisma.studentGrade.findUnique({
    where: { id: Number(gradeId) },
    include: {
      component: {
        select: {
          code: true,
          type: true,
        },
      },
    },
  })

  if (!grade) return

  const inferredCode = normalizeCode(grade.component?.code) || defaultComponentCodeByType(grade.component?.type)
  const componentConfig = await resolveComponentConfig(grade.academicYearId, inferredCode, grade.component?.type)
  const scoreKey = `studentGrade:${grade.id}:score`
  const nfKeys = ['nf1', 'nf2', 'nf3', 'nf4', 'nf5', 'nf6'].map((field) => `studentGrade:${grade.id}:${field}`)

  if (componentConfig.entryMode === GradeEntryMode.NF_SERIES) {
    const sanitizedSeries = sanitizeLegacyFormativeSeriesValues([
      toFiniteNumber(grade.nf1),
      toFiniteNumber(grade.nf2),
      toFiniteNumber(grade.nf3),
      toFiniteNumber(grade.nf4),
      toFiniteNumber(grade.nf5),
      toFiniteNumber(grade.nf6),
    ])
    const nfRows: Array<{ key: string; field: string; value: number | null; order: number }> = Array.from(
      { length: 6 },
      (_, index) => ({
        key: nfKeys[index],
        field: `nf${index + 1}`,
        value: sanitizedSeries[index] ?? null,
        order: index + 1,
      }),
    )

    for (const row of nfRows) {
      if (row.value === null) {
        await deleteScoreEntryByKeys([row.key])
        continue
      }

      await upsertScoreEntry({
        studentId: grade.studentId,
        subjectId: grade.subjectId,
        academicYearId: grade.academicYearId,
        semester: grade.semester,
        componentCode: componentConfig.componentCode,
        componentType: componentConfig.componentType,
        componentTypeCode: componentConfig.componentTypeCode,
        reportSlot: componentConfig.reportSlot,
        reportSlotCode: componentConfig.reportSlotCode,
        rawScore: row.value,
        maxScore: 100,
        sourceType: 'MANUAL_GRADE',
        sourceKey: row.key,
        metadata: {
          source: 'student_grade',
          field: row.field,
          order: row.order,
          gradeId: grade.id,
        },
      })
    }

    const hasAnyNf = nfRows.some((row) => row.value !== null)
    if (!hasAnyNf) {
      await upsertScoreEntry({
        studentId: grade.studentId,
        subjectId: grade.subjectId,
        academicYearId: grade.academicYearId,
        semester: grade.semester,
        componentCode: componentConfig.componentCode,
        componentType: componentConfig.componentType,
        componentTypeCode: componentConfig.componentTypeCode,
        reportSlot: componentConfig.reportSlot,
        reportSlotCode: componentConfig.reportSlotCode,
        rawScore: Number(grade.score || 0),
        maxScore: 100,
        sourceType: 'MANUAL_GRADE',
        sourceKey: scoreKey,
        metadata: {
          source: 'student_grade',
          field: 'score',
          gradeId: grade.id,
        },
      })
    } else {
      await deleteScoreEntryByKeys([scoreKey])
    }
    return
  }

  await upsertScoreEntry({
    studentId: grade.studentId,
    subjectId: grade.subjectId,
    academicYearId: grade.academicYearId,
    semester: grade.semester,
    componentCode: componentConfig.componentCode,
    componentType: componentConfig.componentType,
    componentTypeCode: componentConfig.componentTypeCode,
    reportSlot: componentConfig.reportSlot,
    reportSlotCode: componentConfig.reportSlotCode,
    rawScore: Number(grade.score || 0),
    maxScore: 100,
    sourceType: 'MANUAL_GRADE',
    sourceKey: scoreKey,
    metadata: {
      source: 'student_grade',
      field: 'score',
      gradeId: grade.id,
    },
  })

  await deleteScoreEntryByKeys(nfKeys)
}

export async function syncAdditionalNfSeriesEntriesFromStudentGrade(gradeId: number, scores: number[]) {
  const normalizedScores = Array.isArray(scores)
    ? scores
        .map((item) => toFiniteNumber(item))
        .filter((item): item is number => item !== null)
        .map((item) => clampScore(item))
    : []

  const grade = await prisma.studentGrade.findUnique({
    where: { id: Number(gradeId) },
    include: {
      component: {
        select: {
          code: true,
          type: true,
        },
      },
    },
  })

  if (!grade) return

  const inferredCode = normalizeCode(grade.component?.code) || defaultComponentCodeByType(grade.component?.type)
  const componentConfig = await resolveComponentConfig(grade.academicYearId, inferredCode, grade.component?.type)
  const extraPrefix = `studentGrade:${grade.id}:nf_extra:`

  await prisma.studentScoreEntry.deleteMany({
    where: {
      sourceKey: {
        startsWith: extraPrefix,
      },
    },
  })

  if (componentConfig.entryMode !== GradeEntryMode.NF_SERIES || normalizedScores.length === 0) return

  for (let index = 0; index < normalizedScores.length; index += 1) {
    const score = normalizedScores[index]
    const order = index + 7
    await upsertScoreEntry({
      studentId: grade.studentId,
      subjectId: grade.subjectId,
      academicYearId: grade.academicYearId,
      semester: grade.semester,
      componentCode: componentConfig.componentCode,
      componentType: componentConfig.componentType,
      componentTypeCode: componentConfig.componentTypeCode,
      reportSlot: componentConfig.reportSlot,
      reportSlotCode: componentConfig.reportSlotCode,
      rawScore: score,
      maxScore: 100,
      sourceType: 'MANUAL_GRADE',
      sourceKey: `${extraPrefix}${order}`,
      metadata: {
        source: 'student_grade',
        field: `nf${order}`,
        order,
        gradeId: grade.id,
        series: 'extra',
      },
    })
  }
}

export async function upsertScoreEntryFromExamSession(params: {
  sessionId: number
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  examType: ExamType
  programCode?: string | null
  score: number
  metadata?: Record<string, unknown> | null
}) {
  const programConfig = await resolveProgramConfig({
    academicYearId: params.academicYearId,
    examType: params.examType,
    programCode: params.programCode,
  })

  await upsertScoreEntry({
    studentId: params.studentId,
    subjectId: params.subjectId,
    academicYearId: params.academicYearId,
    semester: params.semester,
    componentCode: programConfig.componentCode,
    componentType: programConfig.componentType,
    componentTypeCode: programConfig.componentTypeCode,
    reportSlot: programConfig.reportSlot,
    reportSlotCode: programConfig.reportSlotCode,
    rawScore: Number(params.score),
    maxScore: 100,
    sourceType: 'EXAM_SESSION',
    sourceKey: `examSession:${params.sessionId}`,
    metadata: {
      source: 'exam_session',
      sessionId: params.sessionId,
      examType: params.examType,
      programCode: normalizeCode(params.programCode),
      ...(params.metadata || {}),
    },
  })
}

export async function upsertScoreEntryFromAssignmentSubmission(params: {
  submissionId: number
  studentId: number
  subjectId: number
  academicYearId: number
  semester: Semester
  score: number
  maxScore?: number | null
}) {
  const formativeCode = await resolveDefaultFormativeComponentCode(params.academicYearId)
  const componentConfig = await resolveComponentConfig(
    params.academicYearId,
    formativeCode,
    GradeComponentType.FORMATIVE,
  )

  await upsertScoreEntry({
    studentId: params.studentId,
    subjectId: params.subjectId,
    academicYearId: params.academicYearId,
    semester: params.semester,
    componentCode: componentConfig.componentCode,
    componentType: componentConfig.componentType,
    componentTypeCode: componentConfig.componentTypeCode,
    reportSlot: componentConfig.reportSlot,
    reportSlotCode: componentConfig.reportSlotCode,
    rawScore: Number(params.score),
    maxScore: params.maxScore ?? 100,
    sourceType: 'ASSIGNMENT_SUBMISSION',
    sourceKey: `submission:${params.submissionId}`,
    metadata: {
      source: 'assignment_submission',
      submissionId: params.submissionId,
    },
  })
}
