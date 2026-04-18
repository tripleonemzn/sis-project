export type ExamStudentResultPublishMode = 'DIRECT' | 'SCHEDULED' | 'REPORT_DATE'

export type StudentProgramResultReleaseCode = 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN'

export type StudentProgramResultReleaseState = {
  mode: ExamStudentResultPublishMode
  modeLabel: string
  code: StudentProgramResultReleaseCode
  label: string
  tone: 'red' | 'amber' | 'green'
  description: string
  canViewDetails: boolean
  effectiveDate: Date | null
  source: 'DIRECT' | 'PROGRAM_DATE' | 'REPORT_DATE'
}

const VALID_EXAM_STUDENT_RESULT_PUBLISH_MODES = new Set<ExamStudentResultPublishMode>([
  'DIRECT',
  'SCHEDULED',
  'REPORT_DATE',
])

function normalizeProgramCodeSeed(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildLocalDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function defaultExamStudentResultPublishMode(params?: {
  programCode?: unknown
  baseTypeCode?: unknown
}): ExamStudentResultPublishMode {
  const normalizedProgramCode = normalizeProgramCodeSeed(params?.programCode)
  const normalizedBaseTypeCode = normalizeProgramCodeSeed(params?.baseTypeCode)
  if (
    ['SBTS', 'SAS', 'SAT'].includes(normalizedProgramCode) ||
    ['SBTS', 'SAS', 'SAT'].includes(normalizedBaseTypeCode)
  ) {
    return 'REPORT_DATE'
  }
  return 'DIRECT'
}

export function normalizeExamStudentResultPublishMode(
  raw: unknown,
  fallback: ExamStudentResultPublishMode = 'DIRECT',
): ExamStudentResultPublishMode {
  const normalized = normalizeProgramCodeSeed(raw) as ExamStudentResultPublishMode
  if (VALID_EXAM_STUDENT_RESULT_PUBLISH_MODES.has(normalized)) {
    return normalized
  }
  return fallback
}

export function normalizeExamStudentResultPublishAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw
  }

  const value = String(raw).trim()
  if (!value) return null

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const normalized = new Date(`${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}T12:00:00.000Z`)
    return Number.isNaN(normalized.getTime()) ? null : normalized
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getExamStudentResultPublishModeLabel(mode: ExamStudentResultPublishMode): string {
  if (mode === 'DIRECT') return 'Langsung'
  if (mode === 'SCHEDULED') return 'Tanggal tertentu'
  return 'Ikuti tanggal rapor semester'
}

export function resolveStudentExamProgramResultRelease(params: {
  mode?: unknown
  publishAt?: Date | null
  reportDate?: { date?: Date | null } | null
  programCode?: unknown
  baseTypeCode?: unknown
  now?: Date
}): StudentProgramResultReleaseState {
  const fallbackMode = defaultExamStudentResultPublishMode({
    programCode: params.programCode,
    baseTypeCode: params.baseTypeCode,
  })
  const mode = normalizeExamStudentResultPublishMode(params.mode, fallbackMode)
  const modeLabel = getExamStudentResultPublishModeLabel(mode)

  if (mode === 'DIRECT') {
    return {
      mode,
      modeLabel,
      code: 'OPEN',
      label: 'Langsung dibuka',
      tone: 'green',
      description: 'Nilai program ini akan langsung tampil ke siswa setelah sinkronisasi selesai.',
      canViewDetails: true,
      effectiveDate: null,
      source: 'DIRECT',
    }
  }

  const effectiveDate =
    mode === 'REPORT_DATE'
      ? params.reportDate?.date
        ? new Date(params.reportDate.date)
        : null
      : params.publishAt
        ? new Date(params.publishAt)
        : null

  if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
    return {
      mode,
      modeLabel,
      code: 'NOT_SCHEDULED',
      label: 'Belum dijadwalkan',
      tone: 'red',
      description:
        mode === 'REPORT_DATE'
          ? 'Tanggal rapor semester belum diatur, jadi nilai program ini belum bisa dibuka ke siswa.'
          : 'Tanggal publikasi hasil ke siswa belum diatur, jadi nilai program ini belum bisa dibuka ke siswa.',
      canViewDetails: false,
      effectiveDate: null,
      source: mode === 'REPORT_DATE' ? 'REPORT_DATE' : 'PROGRAM_DATE',
    }
  }

  const now = params.now ? new Date(params.now) : new Date()
  const todayKey = buildLocalDateKey(now)
  const effectiveDateKey = buildLocalDateKey(effectiveDate)
  if (todayKey < effectiveDateKey) {
    return {
      mode,
      modeLabel,
      code: 'SCHEDULED',
      label: 'Menunggu rilis',
      tone: 'amber',
      description:
        mode === 'REPORT_DATE'
          ? 'Nilai program ini akan dibuka ke siswa saat tanggal rapor semester tiba.'
          : 'Nilai program ini sudah dijadwalkan, tetapi belum memasuki tanggal publikasi ke siswa.',
      canViewDetails: false,
      effectiveDate,
      source: mode === 'REPORT_DATE' ? 'REPORT_DATE' : 'PROGRAM_DATE',
    }
  }

  return {
    mode,
    modeLabel,
    code: 'OPEN',
    label: 'Sudah dibuka',
    tone: 'green',
    description:
      mode === 'REPORT_DATE'
        ? 'Nilai program ini sudah dibuka ke siswa karena tanggal rapor semester sudah tiba.'
        : 'Nilai program ini sudah dibuka ke siswa sesuai tanggal publikasi yang dijadwalkan.',
    canViewDetails: true,
    effectiveDate,
    source: mode === 'REPORT_DATE' ? 'REPORT_DATE' : 'PROGRAM_DATE',
  }
}
