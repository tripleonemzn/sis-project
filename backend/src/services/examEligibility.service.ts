import {
  ExamType,
  GradeComponentType,
  HomeroomBookEntryType,
  HomeroomBookStatus,
  Semester,
} from '@prisma/client';
import { ApiError } from '../utils/api';
import prisma from '../utils/prisma';
import { HistoricalStudentSnapshot } from '../utils/studentAcademicHistory';

type ExamFinanceClearanceMode =
  | 'IGNORE'
  | 'WARN_ONLY'
  | 'BLOCK_ANY_OUTSTANDING'
  | 'BLOCK_OVERDUE_ONLY'
  | 'BLOCK_AMOUNT_THRESHOLD'
  | 'BLOCK_OVERDUE_OR_AMOUNT';

type AutomaticExamRestrictionFlags = {
  belowKkm: boolean;
  financeOutstanding: boolean;
  financeOverdue: boolean;
  financeBlocked: boolean;
};

export type AutomaticExamRestrictionBelowKkmSubject = {
  subjectId: number;
  subjectName: string;
  score: number;
  kkm: number;
};

export type AutomaticExamRestrictionDetails = {
  belowKkmSubjects: AutomaticExamRestrictionBelowKkmSubject[];
  outstandingAmount: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  financeClearanceMode: ExamFinanceClearanceMode;
  financeMinOutstandingAmount: number;
  financeMinOverdueInvoices: number;
  financeClearanceNotes: string | null;
};

export type AutomaticExamRestrictionInfo = {
  autoBlocked: boolean;
  reason: string;
  flags: AutomaticExamRestrictionFlags;
  details: AutomaticExamRestrictionDetails;
};

export type ExamFinanceClearanceSummary = {
  blocksExam: boolean;
  hasOutstanding: boolean;
  hasOverdue: boolean;
  outstandingAmount: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  mode: ExamFinanceClearanceMode;
  thresholdAmount: number;
  minOverdueInvoices: number;
  notes: string | null;
  warningOnly: boolean;
  reason: string | null;
};

export type ExamEligibilityStatus = {
  studentId: number;
  isEligible: boolean;
  reason: string;
  manualBlocked: boolean;
  autoBlocked: boolean;
  financeExceptionApplied: boolean;
  automatic: AutomaticExamRestrictionInfo;
  financeClearance: ExamFinanceClearanceSummary;
};

type ResolvedExamFinanceClearancePolicy = {
  programCode: string | null;
  mode: ExamFinanceClearanceMode;
  minOutstandingAmount: number;
  minOverdueInvoices: number;
  notes: string | null;
};

type EligibilityProgramScoreFamily = 'FORMATIF' | 'MIDTERM' | 'FINAL' | 'US_THEORY' | 'US_PRACTICE';

type EligibilityProgramScope = {
  programCode: string | null;
  gradeComponentType: GradeComponentType | null;
  gradeComponentTypeCode: string | null;
  fixedSemester: Semester | null;
  allowedSubjectIds: Set<number>;
  scoreFamily: EligibilityProgramScoreFamily;
};

type EligibilityAssignmentSubject = {
  kkm: number;
  subjectName: string;
  subjectCategoryCode: string | null;
};

type EligibilityReportGradeRow = {
  studentId: number;
  subjectId: number;
  finalScore: number | null;
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  usScore: number | null;
  slotScores: unknown;
};

type EligibilityStudentGradeRow = {
  studentId: number;
  subjectId: number;
  score: number | null;
  nf1: number | null;
  nf2: number | null;
  nf3: number | null;
  nf4: number | null;
  nf5: number | null;
  nf6: number | null;
  componentType: GradeComponentType | null;
  componentCode: string | null;
};

const VALID_EXAM_FINANCE_CLEARANCE_MODES = new Set<ExamFinanceClearanceMode>([
  'IGNORE',
  'WARN_ONLY',
  'BLOCK_ANY_OUTSTANDING',
  'BLOCK_OVERDUE_ONLY',
  'BLOCK_AMOUNT_THRESHOLD',
  'BLOCK_OVERDUE_OR_AMOUNT',
]);
const DEFAULT_EXAM_FINANCE_CLEARANCE_MODE: ExamFinanceClearanceMode = 'BLOCK_ANY_OUTSTANDING';
const DEFAULT_EXAM_FINANCE_MIN_OUTSTANDING_AMOUNT = 0;
const DEFAULT_EXAM_FINANCE_MIN_OVERDUE_INVOICES = 1;
const currencyFormatterId = new Intl.NumberFormat('id-ID');

function normalizeAliasCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isFormativeAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw);
  return normalized === 'FORMATIF' || normalized === 'FORMATIVE' || normalized.startsWith('NF');
}

function isMidtermAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw);
  if (!normalized) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(normalized)) return true;
  return normalized.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw);
  if (!normalized) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true;
  return normalized.includes('EVEN');
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw);
  if (!normalized) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true;
  return normalized.includes('ODD');
}

function isFinalAliasCode(raw: unknown): boolean {
  const normalized = normalizeAliasCode(raw);
  if (!normalized) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_ODD', 'FINAL_EVEN'].includes(normalized)) {
    return true;
  }
  return normalized.includes('FINAL');
}

function inferExamTypeFromAlias(raw: unknown): ExamType | null {
  const normalized = normalizeAliasCode(raw);
  if (!normalized) return null;
  if ((Object.values(ExamType) as string[]).includes(normalized)) return normalized as ExamType;
  if (isFormativeAliasCode(normalized)) return ExamType.FORMATIF;
  if (isMidtermAliasCode(normalized)) return ExamType.SBTS;
  if (isFinalEvenAliasCode(normalized)) return ExamType.SAT;
  if (isFinalOddAliasCode(normalized)) return ExamType.SAS;
  if (isFinalAliasCode(normalized)) return ExamType.SAS;
  return null;
}

function parseFiniteScore(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateAverage(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseSlotScoreMap(raw: unknown): Record<string, number | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, number | null>>((acc, [key, value]) => {
    const normalizedKey = normalizeAliasCode(key);
    if (!normalizedKey) return acc;
    acc[normalizedKey] = parseFiniteScore(value);
    return acc;
  }, {});
}

function readFirstFiniteScore(...candidates: Array<unknown>): number | null {
  for (const candidate of candidates) {
    const parsed = parseFiniteScore(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function sanitizeLegacyFormativeSeries(rawValues: Array<number | null | undefined>): number[] {
  const values = rawValues
    .map((value) => parseFiniteScore(value))
    .filter((value): value is number => value !== null);
  if (!values.length) return [];
  if (values.every((value) => value === 0)) return [];

  let lastNonZeroIndex = -1;
  values.forEach((value, index) => {
    if (value !== 0) lastNonZeroIndex = index;
  });

  if (lastNonZeroIndex < 0) return [];
  return values.slice(0, lastNonZeroIndex + 1);
}

function resolveStudentGradeComponentFamily(row: EligibilityStudentGradeRow): EligibilityProgramScoreFamily | null {
  if (row.componentType === GradeComponentType.FORMATIVE) return 'FORMATIF';
  if (row.componentType === GradeComponentType.MIDTERM) return 'MIDTERM';
  if (row.componentType === GradeComponentType.FINAL) return 'FINAL';
  if (row.componentType === GradeComponentType.US_THEORY) return 'US_THEORY';
  if (row.componentType === GradeComponentType.US_PRACTICE) return 'US_PRACTICE';

  const normalizedCode = normalizeAliasCode(row.componentCode);
  if (isFormativeAliasCode(normalizedCode)) return 'FORMATIF';
  if (isMidtermAliasCode(normalizedCode)) return 'MIDTERM';
  if (isFinalAliasCode(normalizedCode)) return 'FINAL';
  if (normalizedCode === 'US_THEORY' || normalizedCode === 'US_TEORI') return 'US_THEORY';
  if (normalizedCode === 'US_PRACTICE' || normalizedCode === 'US_PRAKTEK') return 'US_PRACTICE';
  return null;
}

function resolveStudentGradeFamilyAverage(
  rows: EligibilityStudentGradeRow[],
  family: EligibilityProgramScoreFamily,
): number | null {
  const values = rows.flatMap((row) => {
    if (resolveStudentGradeComponentFamily(row) !== family) return [];
    if (family === 'FORMATIF') {
      const seriesValues = sanitizeLegacyFormativeSeries([row.nf1, row.nf2, row.nf3, row.nf4, row.nf5, row.nf6]);
      if (seriesValues.length > 0) return seriesValues;
    }
    const score = parseFiniteScore(row.score);
    return score === null ? [] : [score];
  });
  return calculateAverage(values);
}

function resolveEligibilityProgramScoreFamily(params: {
  gradeComponentType?: GradeComponentType | null;
  gradeComponentTypeCode?: string | null;
  programCode?: string | null;
  examType?: ExamType | null;
}): EligibilityProgramScoreFamily {
  if (params.gradeComponentType === GradeComponentType.US_THEORY) return 'US_THEORY';
  if (params.gradeComponentType === GradeComponentType.US_PRACTICE) return 'US_PRACTICE';
  if (params.gradeComponentType === GradeComponentType.MIDTERM) return 'MIDTERM';
  if (params.gradeComponentType === GradeComponentType.FINAL) return 'FINAL';
  if (params.gradeComponentType === GradeComponentType.FORMATIVE) return 'FORMATIF';

  const normalizedTypeCode = normalizeAliasCode(params.gradeComponentTypeCode);
  if (normalizedTypeCode === 'US_THEORY' || normalizedTypeCode === 'US_TEORI') return 'US_THEORY';
  if (normalizedTypeCode === 'US_PRACTICE' || normalizedTypeCode === 'US_PRAKTEK') return 'US_PRACTICE';
  if (isMidtermAliasCode(normalizedTypeCode)) return 'MIDTERM';
  if (isFinalAliasCode(normalizedTypeCode)) return 'FINAL';
  if (isFormativeAliasCode(normalizedTypeCode)) return 'FORMATIF';

  const normalizedProgramCode = normalizeExamProgramCode(params.programCode);
  if (normalizedProgramCode === 'US_THEORY' || normalizedProgramCode === 'ASAJ') return 'US_THEORY';
  if (normalizedProgramCode === 'US_PRACTICE' || normalizedProgramCode === 'ASAJP') return 'US_PRACTICE';
  if (isMidtermAliasCode(normalizedProgramCode)) return 'MIDTERM';
  if (isFinalAliasCode(normalizedProgramCode)) return 'FINAL';

  if (params.examType === ExamType.US_THEORY) return 'US_THEORY';
  if (params.examType === ExamType.US_PRACTICE) return 'US_PRACTICE';
  if (params.examType === ExamType.SBTS) return 'MIDTERM';
  if (params.examType === ExamType.SAS || params.examType === ExamType.SAT) return 'FINAL';
  return 'FORMATIF';
}

function isSubjectAllowedForProgram(params: {
  scope: EligibilityProgramScope;
  subjectId: number;
  subjectCategoryCode: string | null;
}): boolean {
  if (params.scope.allowedSubjectIds.size > 0 && !params.scope.allowedSubjectIds.has(params.subjectId)) {
    return false;
  }
  if (params.scope.scoreFamily !== 'US_THEORY' && params.subjectCategoryCode === 'TEORI_KEJURUAN') {
    return false;
  }
  return true;
}

function resolveEligibilityScore(params: {
  scope: EligibilityProgramScope;
  reportGrade?: EligibilityReportGradeRow | null;
  studentGrades: EligibilityStudentGradeRow[];
}): number | null {
  const slotScores = parseSlotScoreMap(params.reportGrade?.slotScores);
  const formativeAverage = resolveStudentGradeFamilyAverage(params.studentGrades, 'FORMATIF');
  const midtermAverage = resolveStudentGradeFamilyAverage(params.studentGrades, 'MIDTERM');
  const finalAverage = resolveStudentGradeFamilyAverage(params.studentGrades, 'FINAL');
  const usTheoryAverage = resolveStudentGradeFamilyAverage(params.studentGrades, 'US_THEORY');
  const usPracticeAverage = resolveStudentGradeFamilyAverage(params.studentGrades, 'US_PRACTICE');

  switch (params.scope.scoreFamily) {
    case 'US_THEORY':
      return readFirstFiniteScore(
        usTheoryAverage,
        slotScores.US_THEORY,
        slotScores.US_TEORI,
      );
    case 'US_PRACTICE':
      return readFirstFiniteScore(
        usPracticeAverage,
        slotScores.US_PRACTICE,
        slotScores.US_PRAKTEK,
      );
    case 'MIDTERM':
      return readFirstFiniteScore(
        slotScores.FORMATIF_SBTS_REF,
        slotScores.FORMATIVE_SBTS_REF,
        params.reportGrade?.formatifScore,
        slotScores.FORMATIF,
        slotScores.FORMATIVE,
        formativeAverage,
        midtermAverage,
      );
    case 'FINAL':
      return readFirstFiniteScore(
        slotScores.FORMATIF_FINAL_REF,
        slotScores.FORMATIVE_FINAL_REF,
        params.reportGrade?.formatifScore,
        slotScores.FORMATIF,
        slotScores.FORMATIVE,
        formativeAverage,
        finalAverage,
      );
    case 'FORMATIF':
    default:
      return readFirstFiniteScore(
        params.reportGrade?.formatifScore,
        slotScores.FORMATIF,
        slotScores.FORMATIVE,
        formativeAverage,
      );
  }
}

async function resolveEligibilityProgramScope(params: {
  academicYearId: number;
  programCode?: string | null;
  examType?: ExamType | null;
}): Promise<EligibilityProgramScope> {
  const normalizedProgramCode = normalizeExamProgramCode(params.programCode);
  const programConfig = normalizedProgramCode
    ? await prisma.examProgramConfig.findFirst({
        where: {
          academicYearId: params.academicYearId,
          code: normalizedProgramCode,
        },
        select: {
          code: true,
          gradeComponentType: true,
          gradeComponentTypeCode: true,
          fixedSemester: true,
          allowedSubjectIds: true,
        },
      })
    : null;

  const scoreFamily = resolveEligibilityProgramScoreFamily({
    gradeComponentType: programConfig?.gradeComponentType || null,
    gradeComponentTypeCode: programConfig?.gradeComponentTypeCode || null,
    programCode: programConfig?.code || normalizedProgramCode,
    examType: params.examType || null,
  });

  return {
    programCode: programConfig?.code || normalizedProgramCode || null,
    gradeComponentType: programConfig?.gradeComponentType || null,
    gradeComponentTypeCode: programConfig?.gradeComponentTypeCode || null,
    fixedSemester: programConfig?.fixedSemester || null,
    allowedSubjectIds: new Set(
      Array.isArray(programConfig?.allowedSubjectIds)
        ? programConfig!.allowedSubjectIds
            .map((subjectId) => Number(subjectId))
            .filter((subjectId) => Number.isFinite(subjectId) && subjectId > 0)
        : [],
    ),
    scoreFamily,
  };
}

export function normalizeExamProgramCode(raw: unknown): string | null {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return null;
  if (normalized.length > 50) {
    throw new ApiError(400, 'Kode program ujian maksimal 50 karakter.');
  }
  return normalized;
}

function formatAutomaticRestrictionReason(parts: string[]): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' • ');
}

function normalizeExamFinanceClearanceMode(
  raw: unknown,
  fallback: ExamFinanceClearanceMode = DEFAULT_EXAM_FINANCE_CLEARANCE_MODE,
): ExamFinanceClearanceMode {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') as ExamFinanceClearanceMode;
  if (VALID_EXAM_FINANCE_CLEARANCE_MODES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeFinanceThresholdAmount(raw: unknown, fallback = DEFAULT_EXAM_FINANCE_MIN_OUTSTANDING_AMOUNT) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return Math.max(0, fallback);
  return Math.max(0, Number(parsed.toFixed(2)));
}

function normalizeFinanceOverdueInvoiceCount(raw: unknown, fallback = DEFAULT_EXAM_FINANCE_MIN_OVERDUE_INVOICES) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return Math.max(1, Math.round(fallback));
  return Math.max(1, Math.round(parsed));
}

function getDefaultExamFinanceClearancePolicy(programCode: string | null = null): ResolvedExamFinanceClearancePolicy {
  return {
    programCode,
    mode: DEFAULT_EXAM_FINANCE_CLEARANCE_MODE,
    minOutstandingAmount: DEFAULT_EXAM_FINANCE_MIN_OUTSTANDING_AMOUNT,
    minOverdueInvoices: DEFAULT_EXAM_FINANCE_MIN_OVERDUE_INVOICES,
    notes: null,
  };
}

async function resolveProgramRestrictionTarget(params: {
  academicYearId: number;
  programCode: string;
}): Promise<{ programCode: string; baseType: ExamType }> {
  const normalizedProgramCode = normalizeExamProgramCode(params.programCode);
  if (!normalizedProgramCode) {
    throw new ApiError(400, 'Program ujian wajib dipilih.');
  }

  const directProgram = await prisma.examProgramConfig.findFirst({
    where: {
      academicYearId: params.academicYearId,
      code: normalizedProgramCode,
    },
    orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }, { id: 'asc' }],
    select: {
      code: true,
      baseType: true,
    },
  });
  if (directProgram) {
    return {
      programCode: directProgram.code,
      baseType: directProgram.baseType,
    };
  }

  const inferredType = inferExamTypeFromAlias(normalizedProgramCode);
  if (inferredType) {
    return {
      programCode: normalizedProgramCode,
      baseType: inferredType,
    };
  }

  throw new ApiError(400, `Program ujian ${normalizedProgramCode} tidak dikenali.`);
}

async function resolveExamFinanceClearancePolicy(params: {
  academicYearId: number;
  programCode?: string | null;
  examType?: ExamType | null;
}): Promise<ResolvedExamFinanceClearancePolicy> {
  const normalizedProgramCode = normalizeExamProgramCode(params.programCode);
  if (normalizedProgramCode) {
    const program = await prisma.examProgramConfig.findFirst({
      where: {
        academicYearId: params.academicYearId,
        code: normalizedProgramCode,
      },
      select: {
        code: true,
        financeClearanceMode: true,
        financeMinOutstandingAmount: true,
        financeMinOverdueInvoices: true,
        financeClearanceNotes: true,
      },
    });
    if (program) {
      return {
        programCode: program.code,
        mode: normalizeExamFinanceClearanceMode(program.financeClearanceMode),
        minOutstandingAmount: normalizeFinanceThresholdAmount(program.financeMinOutstandingAmount),
        minOverdueInvoices: normalizeFinanceOverdueInvoiceCount(program.financeMinOverdueInvoices),
        notes: program.financeClearanceNotes || null,
      };
    }
  }

  const normalizedExamType = normalizeExamProgramCode(params.examType);
  const inferredExamType = params.examType || (normalizedExamType ? inferExamTypeFromAlias(normalizedExamType) : null);
  if (inferredExamType) {
    const program = await prisma.examProgramConfig.findFirst({
      where: {
        academicYearId: params.academicYearId,
        isActive: true,
        OR: [
          { baseType: inferredExamType },
          ...(normalizedExamType ? [{ baseTypeCode: normalizedExamType }] : []),
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        code: true,
        financeClearanceMode: true,
        financeMinOutstandingAmount: true,
        financeMinOverdueInvoices: true,
        financeClearanceNotes: true,
      },
    });
    if (program) {
      return {
        programCode: program.code,
        mode: normalizeExamFinanceClearanceMode(program.financeClearanceMode),
        minOutstandingAmount: normalizeFinanceThresholdAmount(program.financeMinOutstandingAmount),
        minOverdueInvoices: normalizeFinanceOverdueInvoiceCount(program.financeMinOverdueInvoices),
        notes: program.financeClearanceNotes || null,
      };
    }
  }

  return getDefaultExamFinanceClearancePolicy(normalizedProgramCode);
}

function buildFinanceRestrictionReason(params: {
  finance: { outstandingAmount: number; overdueInvoices: number };
  policy: ResolvedExamFinanceClearancePolicy;
  amountMatched: boolean;
  overdueMatched: boolean;
}) {
  const amountLabel = currencyFormatterId.format(Math.round(params.finance.outstandingAmount));
  const overdueLabel = `${params.finance.overdueInvoices} lewat jatuh tempo`;

  if (params.policy.mode === 'BLOCK_OVERDUE_ONLY') {
    return `Memiliki ${overdueLabel} dengan outstanding Rp ${amountLabel}`;
  }
  if (params.policy.mode === 'BLOCK_AMOUNT_THRESHOLD') {
    return `Outstanding Rp ${amountLabel} mencapai ambang blokir Rp ${currencyFormatterId.format(
      Math.round(params.policy.minOutstandingAmount),
    )}`;
  }
  if (params.policy.mode === 'BLOCK_OVERDUE_OR_AMOUNT') {
    if (params.overdueMatched && params.amountMatched) {
      return `Memenuhi kebijakan clearance keuangan: ${overdueLabel} dan outstanding Rp ${amountLabel}`;
    }
    if (params.overdueMatched) {
      return `Memiliki ${overdueLabel} dengan outstanding Rp ${amountLabel}`;
    }
    return `Outstanding Rp ${amountLabel} mencapai ambang blokir Rp ${currencyFormatterId.format(
      Math.round(params.policy.minOutstandingAmount),
    )}`;
  }
  return `Masih memiliki tunggakan Rp ${amountLabel}${params.finance.overdueInvoices > 0 ? ` (${overdueLabel})` : ''}`;
}

function evaluateFinanceClearancePolicy(params: {
  finance: { outstandingAmount: number; outstandingInvoices: number; overdueInvoices: number };
  policy: ResolvedExamFinanceClearancePolicy;
}) {
  const hasOutstanding = params.finance.outstandingInvoices > 0 && params.finance.outstandingAmount > 0;
  const hasOverdue = params.finance.overdueInvoices > 0;
  const amountMatched =
    hasOutstanding && params.finance.outstandingAmount >= Math.max(0, params.policy.minOutstandingAmount);
  const overdueMatched =
    hasOverdue && params.finance.overdueInvoices >= Math.max(1, params.policy.minOverdueInvoices);

  let blocked = false;
  switch (params.policy.mode) {
    case 'IGNORE':
    case 'WARN_ONLY':
      blocked = false;
      break;
    case 'BLOCK_OVERDUE_ONLY':
      blocked = overdueMatched;
      break;
    case 'BLOCK_AMOUNT_THRESHOLD':
      blocked = amountMatched;
      break;
    case 'BLOCK_OVERDUE_OR_AMOUNT':
      blocked = overdueMatched || amountMatched;
      break;
    case 'BLOCK_ANY_OUTSTANDING':
    default:
      blocked = hasOutstanding;
      break;
  }

  return {
    hasOutstanding,
    hasOverdue,
    amountMatched,
    overdueMatched,
    blocked,
    reason: blocked
      ? buildFinanceRestrictionReason({
          finance: params.finance,
          policy: params.policy,
          amountMatched,
          overdueMatched,
        })
      : '',
  };
}

function buildEffectiveExamRestrictionState(params: {
  manualRestriction: { isBlocked: boolean; reason: string | null } | null;
  automaticRestriction: AutomaticExamRestrictionInfo | null;
}) {
  const manualBlocked = Boolean(params.manualRestriction?.isBlocked);
  const autoBlocked = Boolean(params.automaticRestriction?.autoBlocked);
  const reason = formatAutomaticRestrictionReason([
    manualBlocked ? String(params.manualRestriction?.reason || '').trim() : '',
    autoBlocked ? String(params.automaticRestriction?.reason || '').trim() : '',
  ]);

  return {
    isBlocked: manualBlocked || autoBlocked,
    reason,
    manualBlocked,
    autoBlocked,
  };
}

function buildExamFinanceClearanceSummary(
  automaticRestriction: AutomaticExamRestrictionInfo | null,
): ExamFinanceClearanceSummary {
  const info =
    automaticRestriction ||
    ({
      autoBlocked: false,
      reason: '',
      flags: {
        belowKkm: false,
        financeOutstanding: false,
        financeOverdue: false,
        financeBlocked: false,
      },
      details: {
        belowKkmSubjects: [],
        outstandingAmount: 0,
        outstandingInvoices: 0,
        overdueInvoices: 0,
        financeClearanceMode: DEFAULT_EXAM_FINANCE_CLEARANCE_MODE,
        financeMinOutstandingAmount: DEFAULT_EXAM_FINANCE_MIN_OUTSTANDING_AMOUNT,
        financeMinOverdueInvoices: DEFAULT_EXAM_FINANCE_MIN_OVERDUE_INVOICES,
        financeClearanceNotes: null,
      },
    } satisfies AutomaticExamRestrictionInfo);
  const hasOutstanding = info.details.outstandingAmount > 0 && info.details.outstandingInvoices > 0;
  const warningOnly =
    info.details.financeClearanceMode === 'WARN_ONLY' &&
    hasOutstanding &&
    !info.flags.financeBlocked;
  const financeReason = info.flags.financeBlocked
    ? `Masih memiliki tunggakan Rp ${currencyFormatterId.format(Math.round(info.details.outstandingAmount))}${info.flags.financeOverdue ? ` (${info.details.overdueInvoices} lewat jatuh tempo)` : ''}`
    : warningOnly
      ? `Masih memiliki tunggakan Rp ${currencyFormatterId.format(Math.round(info.details.outstandingAmount))}, namun program ini hanya memberi peringatan.`
      : null;

  return {
    blocksExam: info.flags.financeBlocked,
    hasOutstanding,
    hasOverdue: info.details.overdueInvoices > 0,
    outstandingAmount: Number(info.details.outstandingAmount || 0),
    outstandingInvoices: Number(info.details.outstandingInvoices || 0),
    overdueInvoices: Number(info.details.overdueInvoices || 0),
    mode: info.details.financeClearanceMode,
    thresholdAmount: Number(info.details.financeMinOutstandingAmount || 0),
    minOverdueInvoices: Number(info.details.financeMinOverdueInvoices || 0),
    notes: info.details.financeClearanceNotes || null,
    warningOnly,
    reason: financeReason,
  };
}

export async function buildExamEligibilitySnapshot(params: {
  academicYearId: number;
  semester: Semester;
  programCode: string;
  students: HistoricalStudentSnapshot[];
}): Promise<Map<number, ExamEligibilityStatus>> {
  const students = params.students.filter(
    (student) =>
      Number.isFinite(Number(student.id)) &&
      Number(student.id) > 0 &&
      Number.isFinite(Number(student.studentClass?.id || 0)) &&
      Number(student.studentClass?.id || 0) > 0,
  );
  if (!students.length) {
    return new Map();
  }

  const studentIds = Array.from(new Set(students.map((student) => Number(student.id))));
  const classIds = Array.from(
    new Set(
      students
        .map((student) => Number(student.studentClass?.id || 0))
        .filter((classId) => Number.isFinite(classId) && classId > 0),
    ),
  );

  const restrictionTarget = await resolveProgramRestrictionTarget({
    academicYearId: params.academicYearId,
    programCode: params.programCode,
  });

  const financePolicy = await resolveExamFinanceClearancePolicy({
    academicYearId: params.academicYearId,
    programCode: restrictionTarget.programCode,
    examType: restrictionTarget.baseType,
  });
  const programScope = await resolveEligibilityProgramScope({
    academicYearId: params.academicYearId,
    programCode: restrictionTarget.programCode,
    examType: restrictionTarget.baseType,
  });

  const [teacherAssignments, reportGrades, studentGrades, financeInvoices, financeExceptions, programRestrictions, legacyRestrictions] =
    await Promise.all([
      prisma.teacherAssignment.findMany({
        where: {
          classId: { in: classIds },
          academicYearId: params.academicYearId,
          kkm: { gt: 0 },
        },
        select: {
          classId: true,
          subjectId: true,
          kkm: true,
          subject: {
            select: {
              name: true,
              category: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      }),
      prisma.reportGrade.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId: params.academicYearId,
          semester: params.semester,
        },
        select: {
          studentId: true,
          subjectId: true,
          finalScore: true,
          formatifScore: true,
          sbtsScore: true,
          sasScore: true,
          usScore: true,
          slotScores: true,
        },
      }),
      prisma.studentGrade.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId: params.academicYearId,
          semester: params.semester,
        },
        select: {
          studentId: true,
          subjectId: true,
          score: true,
          nf1: true,
          nf2: true,
          nf3: true,
          nf4: true,
          nf5: true,
          nf6: true,
          component: {
            select: {
              type: true,
              code: true,
            },
          },
        },
      }),
      prisma.financeInvoice.findMany({
        where: {
          studentId: { in: studentIds },
          status: { in: ['UNPAID', 'PARTIAL'] },
          balanceAmount: { gt: 0 },
        },
        select: {
          studentId: true,
          balanceAmount: true,
          dueDate: true,
        },
      }),
      financePolicy.programCode
        ? prisma.homeroomBookEntry.findMany({
            where: {
              studentId: { in: studentIds },
              academicYearId: params.academicYearId,
              entryType: HomeroomBookEntryType.EXAM_FINANCE_EXCEPTION,
              status: HomeroomBookStatus.ACTIVE,
              relatedSemester: params.semester,
              relatedProgramCode: financePolicy.programCode,
            },
            select: {
              id: true,
              studentId: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          })
        : Promise.resolve([]),
      prisma.studentExamProgramRestriction.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId: params.academicYearId,
          semester: params.semester,
          programCode: restrictionTarget.programCode,
        },
        select: {
          studentId: true,
          isBlocked: true,
          reason: true,
        },
      }),
      prisma.studentExamRestriction.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId: params.academicYearId,
          semester: params.semester,
          examType: restrictionTarget.baseType,
        },
        select: {
          studentId: true,
          isBlocked: true,
          reason: true,
        },
      }),
    ]);

  const assignmentByClassId = new Map<number, Map<number, EligibilityAssignmentSubject>>();

  teacherAssignments.forEach((assignment) => {
    const classId = Number(assignment.classId);
    const subjectId = Number(assignment.subjectId);
    const kkm = Number(assignment.kkm);
    if (!Number.isFinite(classId) || classId <= 0) return;
    if (!Number.isFinite(subjectId) || subjectId <= 0) return;
    if (!Number.isFinite(kkm) || kkm <= 0) return;
    const subjectMap = assignmentByClassId.get(classId) || new Map<number, EligibilityAssignmentSubject>();
    subjectMap.set(subjectId, {
      kkm,
      subjectName: String(assignment.subject?.name || `Mapel ${subjectId}`),
      subjectCategoryCode: normalizeAliasCode(assignment.subject?.category?.code) || null,
    });
    assignmentByClassId.set(classId, subjectMap);
  });

  const reportGradeMap = new Map<string, EligibilityReportGradeRow>();
  reportGrades.forEach((grade) => {
    const subjectId = Number(grade.subjectId);
    if (!Number.isFinite(subjectId) || subjectId <= 0) return;
    reportGradeMap.set(`${grade.studentId}:${subjectId}`, {
      studentId: Number(grade.studentId),
      subjectId,
      finalScore: parseFiniteScore(grade.finalScore),
      formatifScore: parseFiniteScore(grade.formatifScore),
      sbtsScore: parseFiniteScore(grade.sbtsScore),
      sasScore: parseFiniteScore(grade.sasScore),
      usScore: parseFiniteScore(grade.usScore),
      slotScores: grade.slotScores,
    });
  });

  const studentGradesBySubject = new Map<string, EligibilityStudentGradeRow[]>();
  studentGrades.forEach((grade) => {
    const subjectId = Number(grade.subjectId);
    if (!Number.isFinite(subjectId) || subjectId <= 0) return;
    const key = `${grade.studentId}:${subjectId}`;
    const current = studentGradesBySubject.get(key) || [];
    current.push({
      studentId: Number(grade.studentId),
      subjectId,
      score: parseFiniteScore(grade.score),
      nf1: parseFiniteScore(grade.nf1),
      nf2: parseFiniteScore(grade.nf2),
      nf3: parseFiniteScore(grade.nf3),
      nf4: parseFiniteScore(grade.nf4),
      nf5: parseFiniteScore(grade.nf5),
      nf6: parseFiniteScore(grade.nf6),
      componentType: grade.component?.type || null,
      componentCode: grade.component?.code || null,
    });
    studentGradesBySubject.set(key, current);
  });

  const financeExceptionStudentIds = new Set<number>();
  financeExceptions.forEach((entry) => {
    if (financeExceptionStudentIds.has(entry.studentId)) return;
    financeExceptionStudentIds.add(entry.studentId);
  });

  const belowKkmByStudent = new Map<number, AutomaticExamRestrictionBelowKkmSubject[]>();
  students.forEach((student) => {
    const classId = Number(student.studentClass?.id || 0);
    const classAssignments = assignmentByClassId.get(classId);
    if (!classAssignments) return;

    classAssignments.forEach((assignment, subjectId) => {
      if (
        !isSubjectAllowedForProgram({
          scope: programScope,
          subjectId,
          subjectCategoryCode: assignment.subjectCategoryCode,
        })
      ) {
        return;
      }
      const key = `${student.id}:${subjectId}`;
      const resolvedScore = resolveEligibilityScore({
        scope: programScope,
        reportGrade: reportGradeMap.get(key) || null,
        studentGrades: studentGradesBySubject.get(key) || [],
      });
      if (resolvedScore === null) return;
      const score = Number(resolvedScore);
      if (score >= assignment.kkm) return;
      const current = belowKkmByStudent.get(student.id) || [];
      current.push({
        subjectId,
        subjectName: assignment.subjectName,
        score: Number(score.toFixed(2)),
        kkm: Number(assignment.kkm.toFixed(2)),
      });
      belowKkmByStudent.set(student.id, current);
    });
  });

  const now = new Date();
  const financeByStudent = new Map<number, { outstandingAmount: number; outstandingInvoices: number; overdueInvoices: number }>();
  financeInvoices.forEach((invoice) => {
    const current = financeByStudent.get(invoice.studentId) || {
      outstandingAmount: 0,
      outstandingInvoices: 0,
      overdueInvoices: 0,
    };
    const balanceAmount = Number(invoice.balanceAmount || 0);
    current.outstandingAmount += Number.isFinite(balanceAmount) ? balanceAmount : 0;
    current.outstandingInvoices += 1;
    if (invoice.dueDate && invoice.dueDate < now) {
      current.overdueInvoices += 1;
    }
    financeByStudent.set(invoice.studentId, current);
  });

  const programRestrictionMap = new Map(programRestrictions.map((item) => [item.studentId, item]));
  const legacyRestrictionMap = new Map(legacyRestrictions.map((item) => [item.studentId, item]));
  const result = new Map<number, ExamEligibilityStatus>();

  studentIds.forEach((studentId) => {
    const belowKkmSubjects = (belowKkmByStudent.get(studentId) || []).sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName, 'id-ID'),
    );
    const finance = financeByStudent.get(studentId) || {
      outstandingAmount: 0,
      outstandingInvoices: 0,
      overdueInvoices: 0,
    };
    const financeEvaluation = evaluateFinanceClearancePolicy({
      finance,
      policy: financePolicy,
    });
    const financeExceptionApplied = financeEvaluation.blocked && financeExceptionStudentIds.has(studentId);
    const flags: AutomaticExamRestrictionFlags = {
      belowKkm: belowKkmSubjects.length > 0,
      financeOutstanding: financeEvaluation.hasOutstanding,
      financeOverdue: financeEvaluation.hasOverdue,
      financeBlocked: financeEvaluation.blocked && !financeExceptionApplied,
    };

    const reasonParts: string[] = [];
    if (flags.belowKkm) {
      const subjectPreview = belowKkmSubjects
        .slice(0, 3)
        .map((subject) => `${subject.subjectName} (${subject.score}/${subject.kkm})`)
        .join(', ');
      reasonParts.push(
        `Nilai di bawah KKM${subjectPreview ? `: ${subjectPreview}` : ''}${belowKkmSubjects.length > 3 ? ' dan lainnya' : ''}`,
      );
    }
    if (flags.financeBlocked) {
      reasonParts.push(financeEvaluation.reason);
    }

    const automatic: AutomaticExamRestrictionInfo = {
      autoBlocked: flags.belowKkm || flags.financeBlocked,
      reason: formatAutomaticRestrictionReason(reasonParts),
      flags,
      details: {
        belowKkmSubjects,
        outstandingAmount: Number(finance.outstandingAmount.toFixed(2)),
        outstandingInvoices: finance.outstandingInvoices,
        overdueInvoices: finance.overdueInvoices,
        financeClearanceMode: financePolicy.mode,
        financeMinOutstandingAmount: Number(financePolicy.minOutstandingAmount.toFixed(2)),
        financeMinOverdueInvoices: financePolicy.minOverdueInvoices,
        financeClearanceNotes: financePolicy.notes || null,
      },
    };

    const manualRestriction = programRestrictionMap.get(studentId) ?? legacyRestrictionMap.get(studentId) ?? null;
    const effectiveRestriction = buildEffectiveExamRestrictionState({
      manualRestriction,
      automaticRestriction: automatic,
    });

    result.set(studentId, {
      studentId,
      isEligible: !effectiveRestriction.isBlocked,
      reason: effectiveRestriction.reason,
      manualBlocked: effectiveRestriction.manualBlocked,
      autoBlocked: effectiveRestriction.autoBlocked,
      financeExceptionApplied,
      automatic,
      financeClearance: buildExamFinanceClearanceSummary(automatic),
    });
  });

  return result;
}
