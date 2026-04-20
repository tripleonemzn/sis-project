import {
  ExamType,
  GradeComponentType,
  GradeEntryMode,
  Prisma,
  Semester,
} from '@prisma/client'
import prisma from '../utils/prisma'
import { syncReportGrade } from '../controllers/grade.controller'
import { syncScoreEntriesFromStudentGrade, upsertScoreEntryFromExamSession } from '../services/scoreEntry.service'

type SessionQuestionSetMeta = {
  ids: string[]
  limit: number | null
  totalAvailable: number
  assignedAt: string | null
}

type ExamPostSubmitNfField = 'nf1' | 'nf2' | 'nf3' | 'nf4' | 'nf5' | 'nf6'

type ExamSessionScoreEntrySyncState = {
  gradeId: number | null
  componentId: number | null
  componentCode: string | null
  entryMode: string | null
  nfField: ExamPostSubmitNfField | null
  reservedAt: string | null
  syncedAt: string | null
}

const EXAM_POST_SUBMIT_NF_FIELDS: ExamPostSubmitNfField[] = ['nf1', 'nf2', 'nf3', 'nf4', 'nf5', 'nf6']

function normalizeAliasCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeProgramCode(raw: unknown): string | null {
  const normalized = normalizeAliasCode(raw)
  if (!normalized) return null
  if (['PSAJ', 'ASAJ_PRAKTIK', 'ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK'].includes(normalized)) {
    return 'ASAJP'
  }
  return normalized
}

function isFormativeAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw)
  if (!normalized) return false
  return normalized === 'FORMATIF' || normalized === 'FORMATIVE' || normalized.startsWith('NF')
}

function isMidtermAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw)
  if (!normalized) return false
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(normalized)) return true
  return normalized.includes('MIDTERM')
}

function isFinalAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw)
  if (!normalized) return false
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_ODD', 'FINAL_EVEN'].includes(normalized)) {
    return true
  }
  return normalized.includes('FINAL')
}

function defaultGradeComponentTypeByPacketType(type: ExamType): GradeComponentType {
  const normalized = normalizeAliasCode(type)
  if (isFormativeAliasCode(normalized)) return GradeComponentType.FORMATIVE
  if (isMidtermAliasCode(normalized)) return GradeComponentType.MIDTERM
  if (isFinalAliasCode(normalized)) return GradeComponentType.FINAL
  if (normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK') return GradeComponentType.US_PRACTICE
  if (normalized === 'US_THEORY' || normalized === 'US_TEORI') return GradeComponentType.US_THEORY
  return GradeComponentType.CUSTOM
}

function defaultGradeComponentCodeByPacketType(type: ExamType): string {
  const normalized = normalizeAliasCode(type)
  if (isFormativeAliasCode(normalized)) return 'FORMATIVE'
  if (isMidtermAliasCode(normalized)) return 'MIDTERM'
  if (isFinalAliasCode(normalized)) return 'FINAL'
  if (normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK') return 'US_PRACTICE'
  if (normalized === 'US_THEORY' || normalized === 'US_TEORI') return 'US_THEORY'
  return 'CUSTOM'
}

function defaultGradeEntryModeByCode(code: string): GradeEntryMode {
  return isFormativeAliasCode(code) ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE
}

function mapGradeComponentTypeFromCode(
  code: string,
  fallback: GradeComponentType = GradeComponentType.CUSTOM,
): GradeComponentType {
  const normalized = normalizeAliasCode(code)
  if (isFormativeAliasCode(normalized)) return GradeComponentType.FORMATIVE
  if (isMidtermAliasCode(normalized)) return GradeComponentType.MIDTERM
  if (isFinalAliasCode(normalized)) return GradeComponentType.FINAL
  if (normalized === 'SKILL') return GradeComponentType.SKILL
  if (normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK') return GradeComponentType.US_PRACTICE
  if (normalized === 'US_THEORY' || normalized === 'US_TEORI') return GradeComponentType.US_THEORY
  return fallback
}

async function resolveGradeComponentConfigForPacket(params: {
  academicYearId: number
  type: ExamType
  programCode?: string | null
}): Promise<{
  componentType: GradeComponentType
  componentCode: string
  componentLabel: string
  gradeEntryMode: GradeEntryMode
}> {
  const defaultType = defaultGradeComponentTypeByPacketType(params.type)
  const defaultCode = defaultGradeComponentCodeByPacketType(params.type)
  const defaultMode = defaultGradeEntryModeByCode(defaultCode)
  const defaultLabel = defaultCode.replace(/_/g, ' ')

  const normalizedProgramCode = normalizeProgramCode(params.programCode)
  if (normalizedProgramCode) {
    const config = await prisma.examProgramConfig.findFirst({
      where: {
        academicYearId: params.academicYearId,
        code: normalizedProgramCode,
      },
      select: {
        gradeComponentType: true,
        gradeComponentCode: true,
        gradeComponentLabel: true,
        gradeEntryMode: true,
      },
    })
    if (config) {
      const resolvedCode = normalizeProgramCode(config.gradeComponentCode) || defaultCode
      return {
        componentType: mapGradeComponentTypeFromCode(resolvedCode, config.gradeComponentType || defaultType),
        componentCode: resolvedCode,
        componentLabel: String(config.gradeComponentLabel || '').trim() || defaultLabel,
        gradeEntryMode: config.gradeEntryMode || defaultMode,
      }
    }
  }

  const fallbackByType = await prisma.examProgramConfig.findFirst({
    where: {
      academicYearId: params.academicYearId,
      baseType: params.type,
    },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: {
      gradeComponentType: true,
      gradeComponentCode: true,
      gradeComponentLabel: true,
      gradeEntryMode: true,
    },
  })
  if (fallbackByType) {
    const resolvedCode = normalizeProgramCode(fallbackByType.gradeComponentCode) || defaultCode
    return {
      componentType: mapGradeComponentTypeFromCode(resolvedCode, fallbackByType.gradeComponentType || defaultType),
      componentCode: resolvedCode,
      componentLabel: String(fallbackByType.gradeComponentLabel || '').trim() || defaultLabel,
      gradeEntryMode: fallbackByType.gradeEntryMode || defaultMode,
    }
  }

  return {
    componentType: defaultType,
    componentCode: defaultCode,
    componentLabel: defaultLabel,
    gradeEntryMode: defaultMode,
  }
}

function sanitizeQuestionSetMeta(rawQuestionSet: unknown): SessionQuestionSetMeta | null {
  if (!rawQuestionSet || typeof rawQuestionSet !== 'object' || Array.isArray(rawQuestionSet)) {
    return null
  }
  const source = rawQuestionSet as Record<string, unknown>
  const idsRaw = Array.isArray(source.ids) ? source.ids : []
  const ids = idsRaw
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index)
  if (ids.length === 0) return null
  const limitRaw = Number(source.limit)
  const totalRaw = Number(source.totalAvailable)
  return {
    ids,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : null,
    totalAvailable: Number.isFinite(totalRaw) && totalRaw > 0 ? Math.trunc(totalRaw) : ids.length,
    assignedAt: source.assignedAt ? String(source.assignedAt) : null,
  }
}

function sanitizeAnswersForStorage(rawAnswers: unknown): Record<string, unknown> {
  if (!rawAnswers || typeof rawAnswers !== 'object') return {}
  const source = rawAnswers as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === '__monitoring' || key === '__questionSet') continue
    sanitized[key] = value
  }

  const questionSet = sanitizeQuestionSetMeta(source.__questionSet)
  if (questionSet) {
    sanitized.__questionSet = questionSet
  }

  return sanitized
}

function normalizeSelectedOptionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean)
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
    }
    return [trimmed]
  }

  if (raw === null || raw === undefined) {
    return []
  }

  const normalized = String(raw).trim()
  return normalized ? [normalized] : []
}

function normalizeMatrixAnswerMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = String(key || '').trim()
    const normalizedValue = String(value || '').trim()
    if (!normalizedKey || !normalizedValue) return acc
    acc[normalizedKey] = normalizedValue
    return acc
  }, {})
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

type ExamQuestionMatrixRow = {
  id: string
  prompt: string
  correctOptionId: string
}

function resolveQuestionMatrixRows(question: Record<string, unknown>): ExamQuestionMatrixRow[] {
  const rows = Array.isArray(question.matrixRows) ? question.matrixRows : []
  return rows
    .map((row) => {
      const item = asRecord(row)
      if (!item) return null
      const id = String(item.id || '').trim()
      const prompt = String(item.prompt || item.content || '').trim()
      const correctOptionId = String(item.correctOptionId || '').trim()
      if (!id) return null
      return { id, prompt, correctOptionId }
    })
    .filter((item): item is ExamQuestionMatrixRow => Boolean(item))
}

function getCorrectMatrixAnswerMap(question: Record<string, unknown>): Record<string, string> {
  const rows = resolveQuestionMatrixRows(question)
  return rows.reduce<Record<string, string>>((acc, row) => {
    if (!row.id || !row.correctOptionId) return acc
    acc[row.id] = row.correctOptionId
    return acc
  }, {})
}

function normalizeQuestionTypeForAnalysis(question: Record<string, unknown>): string {
  return String(question.type || question.question_type || 'MULTIPLE_CHOICE').trim().toUpperCase()
}

function getCorrectOptionIds(question: Record<string, unknown>): string[] {
  const options = Array.isArray(question.options) ? question.options : []
  const fromOptions = options
    .filter((option) => {
      const item = asRecord(option)
      return Boolean(item?.isCorrect)
    })
    .map((option) => {
      const item = asRecord(option)
      return item?.id ? String(item.id).trim() : ''
    })
    .filter(Boolean)

  if (fromOptions.length > 0) return fromOptions

  const answerKey = typeof question.answerKey === 'string' ? question.answerKey.trim() : ''
  if (!answerKey) return []

  return answerKey.split(',').map((item) => item.trim()).filter(Boolean)
}

function clampQuestionScoreFraction(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function evaluateQuestionScoreFraction(question: Record<string, unknown>, rawAnswer: unknown): number | null {
  const type = normalizeQuestionTypeForAnalysis(question)
  if (type === 'ESSAY') return null

  if (type === 'MATRIX_SINGLE_CHOICE') {
    const correctAnswerMap = getCorrectMatrixAnswerMap(question)
    const requiredRowIds = Object.keys(correctAnswerMap)
    if (requiredRowIds.length === 0) return null
    const answerMap = normalizeMatrixAnswerMap(rawAnswer)
    const answeredRowIds = requiredRowIds.filter((rowId) => Boolean(answerMap[rowId]))
    if (answeredRowIds.length === 0) return null
    const correctRowCount = requiredRowIds.reduce((count, rowId) => {
      return count + (answerMap[rowId] === correctAnswerMap[rowId] ? 1 : 0)
    }, 0)
    return clampQuestionScoreFraction(correctRowCount / requiredRowIds.length)
  }

  const correctOptionIds = Array.from(new Set(getCorrectOptionIds(question)))
  if (correctOptionIds.length === 0) return null
  const selectedOptionIds = Array.from(new Set(normalizeSelectedOptionIds(rawAnswer)))
  if (selectedOptionIds.length === 0) return null

  if (type === 'COMPLEX_MULTIPLE_CHOICE') {
    const correctOptionIdSet = new Set(correctOptionIds)
    const selectedCorrectCount = selectedOptionIds.filter((optionId) => correctOptionIdSet.has(optionId)).length
    const selectedWrongCount = selectedOptionIds.filter((optionId) => !correctOptionIdSet.has(optionId)).length
    return clampQuestionScoreFraction((selectedCorrectCount - selectedWrongCount) / correctOptionIds.length)
  }

  const left = [...selectedOptionIds].sort()
  const right = [...correctOptionIds].sort()
  return left.length === right.length && left.every((value, index) => value === right[index]) ? 1 : 0
}

function calculateScore(questions: Record<string, unknown>[], answers: Record<string, unknown>): number {
  let totalScore = 0
  let maxScore = 0

  for (const question of questions) {
    const points = Number(question.score) || 1
    maxScore += points
    const questionId = String(question.id || '').trim()
    const rawAnswer = questionId ? answers?.[questionId] : undefined
    const scoreFraction = evaluateQuestionScoreFraction(question, rawAnswer)
    if (scoreFraction !== null && scoreFraction > 0) {
      totalScore += points * scoreFraction
    }
  }

  if (maxScore === 0) return 0
  return (totalScore / maxScore) * 100
}

function resolveScoringQuestionsForSession(params: {
  packetQuestions: Record<string, unknown>[]
  sessionAnswers: Record<string, unknown>
}): Record<string, unknown>[] {
  const sessionQuestionSet = sanitizeQuestionSetMeta((params.sessionAnswers as Record<string, unknown>).__questionSet) || null
  if (!sessionQuestionSet?.ids?.length) {
    return params.packetQuestions
  }

  const packetMap = new Map<string, Record<string, unknown>>()
  params.packetQuestions.forEach((question) => {
    const questionId = String(question?.id || '').trim()
    if (!questionId) return
    packetMap.set(questionId, question)
  })

  const selected = sessionQuestionSet.ids
    .map((questionId) => packetMap.get(questionId))
    .filter((question): question is Record<string, unknown> => Boolean(question))

  return selected.length > 0 ? selected : params.packetQuestions
}

function resolveExamPostSubmitNfField(raw: unknown): ExamPostSubmitNfField | null {
  const normalized = String(raw || '').trim().toLowerCase()
  if ((EXAM_POST_SUBMIT_NF_FIELDS as string[]).includes(normalized)) {
    return normalized as ExamPostSubmitNfField
  }
  return null
}

function parseExamSessionScoreEntrySyncState(rawMetadata: unknown): ExamSessionScoreEntrySyncState | null {
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    return null
  }

  const source = rawMetadata as Record<string, unknown>
  const rawSyncState = source.autoFillStudentGrade
  if (!rawSyncState || typeof rawSyncState !== 'object' || Array.isArray(rawSyncState)) {
    return null
  }

  const syncState = rawSyncState as Record<string, unknown>
  const parsedGradeId = Number(syncState.gradeId)
  const parsedComponentId = Number(syncState.componentId)

  return {
    gradeId: Number.isFinite(parsedGradeId) && parsedGradeId > 0 ? parsedGradeId : null,
    componentId: Number.isFinite(parsedComponentId) && parsedComponentId > 0 ? parsedComponentId : null,
    componentCode: syncState.componentCode ? String(syncState.componentCode) : null,
    entryMode: syncState.entryMode ? String(syncState.entryMode) : null,
    nfField: resolveExamPostSubmitNfField(syncState.nfField),
    reservedAt: syncState.reservedAt ? String(syncState.reservedAt) : null,
    syncedAt: syncState.syncedAt ? String(syncState.syncedAt) : null,
  }
}

function resolveNextExamPostSubmitNfField(
  grade:
    | {
        nf1?: number | null
        nf2?: number | null
        nf3?: number | null
        nf4?: number | null
        nf5?: number | null
        nf6?: number | null
      }
    | null,
): ExamPostSubmitNfField | null {
  if (!grade) {
    return 'nf1'
  }

  for (const field of EXAM_POST_SUBMIT_NF_FIELDS) {
    const value = grade[field]
    if (value === null || value === undefined) {
      return field
    }
  }

  return null
}

function buildExamSessionScoreEntrySyncMetadata(params: {
  componentId: number
  componentCode: string | null
  entryMode: GradeEntryMode
  gradeId: number | null
  nfField: ExamPostSubmitNfField | null
  reservedAt: string
  syncedAt?: string | null
}) {
  return {
    autoFillStudentGrade: {
      componentId: params.componentId,
      componentCode: params.componentCode,
      entryMode: String(params.entryMode || ''),
      gradeId: params.gradeId,
      nfField: params.nfField,
      reservedAt: params.reservedAt,
      syncedAt: params.syncedAt || null,
    },
  }
}

async function forceSyncCompletedStudentExamArtifacts(params: {
  sessionId: number
  studentId: number
  score: number
  packet: {
    subjectId: number
    academicYearId: number
    semester: Semester
    type: ExamType
    programCode: string | null
  }
}) {
  const { subjectId, academicYearId, semester, type, programCode } = params.packet
  const gradeComponentConfig = await resolveGradeComponentConfigForPacket({
    academicYearId,
    type,
    programCode,
  })
  const { componentType, componentCode, componentLabel, gradeEntryMode } = gradeComponentConfig

  let component = componentCode
    ? await prisma.gradeComponent.findFirst({
        where: { subjectId, code: componentCode, isActive: true },
      })
    : null

  if (!component) {
    component = await prisma.gradeComponent.findFirst({
      where: { subjectId, type: componentType, isActive: true },
    })
  }

  if (!component) {
    component = await prisma.gradeComponent.create({
      data: {
        code: componentCode,
        subjectId,
        type: componentType,
        name: componentLabel || componentCode || type,
        weight: 1,
        isActive: true,
      },
    })
  }

  const scoreEntrySourceKey = `examSession:${params.sessionId}`
  const existingScoreEntry = await prisma.studentScoreEntry.findUnique({
    where: { sourceKey: scoreEntrySourceKey },
    select: { metadata: true },
  })
  const existingSyncState = parseExamSessionScoreEntrySyncState(existingScoreEntry?.metadata)

  let grade =
    existingSyncState?.gradeId
      ? await prisma.studentGrade.findFirst({
          where: {
            id: existingSyncState.gradeId,
            studentId: params.studentId,
            subjectId,
            academicYearId,
            componentId: component.id,
            semester,
          },
        })
      : null

  if (!grade) {
    grade = await prisma.studentGrade.findFirst({
      where: {
        studentId: params.studentId,
        subjectId,
        academicYearId,
        componentId: component.id,
        semester,
      },
    })
  }

  const reservedAt = existingSyncState?.reservedAt || new Date().toISOString()
  const reservedNfField =
    gradeEntryMode === GradeEntryMode.NF_SERIES
      ? existingSyncState?.nfField || resolveNextExamPostSubmitNfField(grade)
      : null

  let syncedStudentGradeId: number | null = grade?.id ?? existingSyncState?.gradeId ?? null
  if (grade) {
    const updateData: Record<string, unknown> = {}
    if (gradeEntryMode === GradeEntryMode.NF_SERIES) {
      if (reservedNfField) {
        updateData[reservedNfField] = params.score
      }

      const nfs = EXAM_POST_SUBMIT_NF_FIELDS.map((field) => {
        if (field === reservedNfField) {
          return params.score
        }
        return grade?.[field] ?? null
      }).filter((value): value is number => value !== null && value !== undefined)

      if (nfs.length > 0) {
        updateData.score = nfs.reduce((left, right) => left + right, 0) / nfs.length
      } else {
        updateData.score = params.score
      }
    } else {
      updateData.score = params.score
    }

    if (Object.keys(updateData).length > 0) {
      const updatedGrade = await prisma.studentGrade.update({
        where: { id: grade.id },
        data: updateData,
      })
      syncedStudentGradeId = updatedGrade.id
      grade = updatedGrade
    }
  } else {
    const createData: Prisma.StudentGradeUncheckedCreateInput = {
      studentId: params.studentId,
      subjectId,
      academicYearId,
      componentId: component.id,
      semester,
      score: params.score,
    }

    if (gradeEntryMode === GradeEntryMode.NF_SERIES) {
      createData[reservedNfField || 'nf1'] = params.score
    }

    const createdGrade = await prisma.studentGrade.create({
      data: createData,
    })
    syncedStudentGradeId = createdGrade.id
    grade = createdGrade
  }

  if (syncedStudentGradeId) {
    await syncScoreEntriesFromStudentGrade(syncedStudentGradeId)
  }

  await upsertScoreEntryFromExamSession({
    sessionId: params.sessionId,
    studentId: params.studentId,
    subjectId,
    academicYearId,
    semester,
    examType: type,
    programCode: programCode || null,
    score: params.score,
    metadata: buildExamSessionScoreEntrySyncMetadata({
      componentId: component.id,
      componentCode: component.code || componentCode || null,
      entryMode: gradeEntryMode,
      gradeId: syncedStudentGradeId,
      nfField: reservedNfField,
      reservedAt,
      syncedAt: new Date().toISOString(),
    }),
  })

  await syncReportGrade(params.studentId, subjectId, academicYearId, semester)
}

function hasPartialCreditQuestion(questions: unknown): boolean {
  const rows = Array.isArray(questions) ? questions : []
  return rows.some((question) => {
    const type = String((question as Record<string, unknown>)?.type || (question as Record<string, unknown>)?.question_type || '')
      .trim()
      .toUpperCase()
    return type === 'COMPLEX_MULTIPLE_CHOICE' || type === 'MATRIX_SINGLE_CHOICE'
  })
}

function parseFlag(flag: string): string | null {
  const index = process.argv.findIndex((value) => value === flag)
  if (index < 0) return null
  const next = process.argv[index + 1]
  if (!next || next.startsWith('--')) return null
  return next
}

async function main() {
  const apply = process.argv.includes('--apply')
  const packetIdFilter = Number(parseFlag('--packetId') || 0) || null
  const academicYearIdFilter = Number(parseFlag('--academicYearId') || 0) || null
  const batchSize = Math.max(25, Math.min(250, Number(parseFlag('--batchSize') || 100) || 100))

  const packets = await prisma.examPacket.findMany({
    where: {
      ...(packetIdFilter ? { id: packetIdFilter } : {}),
      ...(academicYearIdFilter ? { academicYearId: academicYearIdFilter } : {}),
    },
    select: {
      id: true,
      academicYearId: true,
      questions: true,
    },
  })

  const relevantPacketIds = packets
    .filter((packet) => hasPartialCreditQuestion(packet.questions))
    .map((packet) => packet.id)

  if (relevantPacketIds.length === 0) {
    console.log('Tidak ada packet relevan yang memakai PGK/Grid untuk disinkronkan ulang.')
    return
  }

  const targetCount = await prisma.studentExamSession.count({
    where: {
      status: { in: ['COMPLETED', 'TIMEOUT'] },
      schedule: {
        packetId: { in: relevantPacketIds },
        jobVacancyId: null,
      },
    },
  })

  console.log(
    `[partial-credit-resync] mode=${apply ? 'APPLY' : 'DRY_RUN'} packets=${relevantPacketIds.length} targetSessions=${targetCount}`,
  )

  let cursorId = 0
  let processed = 0
  let changed = 0
  let unchanged = 0
  let skipped = 0
  let protectedFromDecrease = 0

  while (true) {
    const sessions = await prisma.studentExamSession.findMany({
      where: {
        id: { gt: cursorId },
        status: { in: ['COMPLETED', 'TIMEOUT'] },
        schedule: {
          packetId: { in: relevantPacketIds },
          jobVacancyId: null,
        },
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        studentId: true,
        score: true,
        answers: true,
        schedule: {
          select: {
            packet: {
              select: {
                id: true,
                subjectId: true,
                academicYearId: true,
                semester: true,
                type: true,
                programCode: true,
                questions: true,
              },
            },
          },
        },
      },
    })

    if (sessions.length === 0) break

    for (const session of sessions) {
      cursorId = session.id
      processed += 1
      const packet = session.schedule?.packet
      if (!packet) {
        skipped += 1
        continue
      }

      const packetQuestions = Array.isArray(packet.questions)
        ? (packet.questions as Record<string, unknown>[])
        : []
      if (packetQuestions.length === 0) {
        skipped += 1
        continue
      }

      const normalizedAnswers = sanitizeAnswersForStorage(session.answers)
      const scoringQuestions = resolveScoringQuestionsForSession({
        packetQuestions,
        sessionAnswers: normalizedAnswers,
      })
      const recalculatedScore = Number(calculateScore(scoringQuestions, normalizedAnswers).toFixed(4))
      const previousScore =
        typeof session.score === 'number' ? Number(Number(session.score).toFixed(4)) : null
      const nextScore =
        previousScore !== null && recalculatedScore < previousScore ? previousScore : recalculatedScore

      if (previousScore !== null && recalculatedScore < previousScore) {
        protectedFromDecrease += 1
      }

      if (previousScore !== null && Math.abs(previousScore - nextScore) < 0.0001) {
        unchanged += 1
      } else {
        changed += 1
        console.log(
          `[partial-credit-resync] session=${session.id} packet=${packet.id} student=${session.studentId} score ${previousScore ?? 'null'} -> ${nextScore} (raw=${recalculatedScore})`,
        )

        if (apply) {
          await prisma.studentExamSession.update({
            where: { id: session.id },
            data: { score: nextScore },
          })

          await forceSyncCompletedStudentExamArtifacts({
            sessionId: session.id,
            studentId: session.studentId,
            score: nextScore,
            packet: {
              subjectId: packet.subjectId,
              academicYearId: packet.academicYearId,
              semester: packet.semester,
              type: packet.type,
              programCode: packet.programCode || null,
            },
          })
        }
      }

      if (processed % 50 === 0) {
        console.log(
          `[partial-credit-resync] progress processed=${processed}/${targetCount} changed=${changed} unchanged=${unchanged} skipped=${skipped}`,
        )
      }
    }
  }

  console.log(
    `[partial-credit-resync] done processed=${processed} changed=${changed} unchanged=${unchanged} skipped=${skipped} protectedFromDecrease=${protectedFromDecrease}`,
  )
}

main()
  .catch((error) => {
    console.error('[partial-credit-resync] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
