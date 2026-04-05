import {
  ExamType,
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

  const subjectIds = Array.from(
    new Set(
      teacherAssignments
        .map((assignment) => Number(assignment.subjectId))
        .filter((subjectId) => Number.isFinite(subjectId) && subjectId > 0),
    ),
  );
  const subjects = subjectIds.length
    ? await prisma.subject.findMany({
        where: {
          id: { in: subjectIds },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const subjectNameById = new Map(subjects.map((subject) => [Number(subject.id), String(subject.name)]));
  const assignmentByClassId = new Map<number, Map<number, { kkm: number; subjectName: string }>>();

  teacherAssignments.forEach((assignment) => {
    const classId = Number(assignment.classId);
    const subjectId = Number(assignment.subjectId);
    const kkm = Number(assignment.kkm);
    if (!Number.isFinite(classId) || classId <= 0) return;
    if (!Number.isFinite(subjectId) || subjectId <= 0) return;
    if (!Number.isFinite(kkm) || kkm <= 0) return;
    const subjectMap = assignmentByClassId.get(classId) || new Map<number, { kkm: number; subjectName: string }>();
    subjectMap.set(subjectId, {
      kkm,
      subjectName: subjectNameById.get(subjectId) || `Mapel ${subjectId}`,
    });
    assignmentByClassId.set(classId, subjectMap);
  });

  const reportGradeMap = new Map<string, number>();
  reportGrades.forEach((grade) => {
    const subjectId = Number(grade.subjectId);
    const finalScore = Number(grade.finalScore);
    if (!Number.isFinite(subjectId) || subjectId <= 0) return;
    if (!Number.isFinite(finalScore)) return;
    reportGradeMap.set(`${grade.studentId}:${subjectId}`, finalScore);
  });

  const studentGradeAggregate = new Map<string, { total: number; count: number }>();
  studentGrades.forEach((grade) => {
    const subjectId = Number(grade.subjectId);
    const score = Number(grade.score);
    if (!Number.isFinite(subjectId) || subjectId <= 0) return;
    if (!Number.isFinite(score)) return;
    const key = `${grade.studentId}:${subjectId}`;
    const current = studentGradeAggregate.get(key) || { total: 0, count: 0 };
    current.total += score;
    current.count += 1;
    studentGradeAggregate.set(key, current);
  });

  const studentGradeAverageMap = new Map<string, number>();
  studentGradeAggregate.forEach((value, key) => {
    if (value.count <= 0) return;
    studentGradeAverageMap.set(key, value.total / value.count);
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
      const key = `${student.id}:${subjectId}`;
      const resolvedScore = reportGradeMap.has(key) ? reportGradeMap.get(key) : studentGradeAverageMap.get(key);
      if (!Number.isFinite(Number(resolvedScore))) return;
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
