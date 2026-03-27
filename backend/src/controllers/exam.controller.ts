import { Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { asyncHandler, ApiError, ApiResponse } from '../utils/api';
import {
    ExamType,
    Semester,
    GradeComponentType,
    GradeEntryMode,
    JobApplicationAssessmentStageCode,
    JobApplicationStatus,
    Prisma,
    VerificationStatus,
    SelectionAssessmentSource,
} from '@prisma/client';
import { syncReportGrade } from './grade.controller';
import { syncScoreEntriesFromStudentGrade, upsertScoreEntryFromExamSession } from '../services/scoreEntry.service';

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
    if (!normalized) return false;
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

function normalizeProgramCode(raw: unknown): string | null {
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

function normalizeSubjectIdentity(rawName: unknown, rawCode: unknown): { name: string; code: string } {
    return {
        name: String(rawName || '').trim(),
        code: String(rawCode || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, ''),
    };
}

function isGenericSubjectIdentity(rawName: unknown, rawCode: unknown): boolean {
    const { name, code } = normalizeSubjectIdentity(rawName, rawCode);
    const normalizedName = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!normalizedName && !code) return true;
    if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(code)) return true;
    if (normalizedName.includes('KONSENTRASI_KEAHLIAN')) return true;
    if (normalizedName === 'KONSENTRASI') return true;
    if (normalizedName === 'KEJURUAN') return true;
    return false;
}

function resolveAvailableExamSubject(params: {
    scheduleSubject?: { id?: number | null; name?: string | null; code?: string | null } | null;
    packetSubject?: { id?: number | null; name?: string | null; code?: string | null } | null;
}) {
    const scheduleSubject = params.scheduleSubject || null;
    const packetSubject = params.packetSubject || null;

    if (!scheduleSubject && !packetSubject) return null;
    if (!scheduleSubject) return packetSubject;
    if (!packetSubject) return scheduleSubject;

    const scheduleIsGeneric = isGenericSubjectIdentity(scheduleSubject.name, scheduleSubject.code);
    const packetIsGeneric = isGenericSubjectIdentity(packetSubject.name, packetSubject.code);

    if (scheduleIsGeneric && !packetIsGeneric) {
        return packetSubject;
    }

    return scheduleSubject;
}

function isNonScheduledExamProgramCode(raw: unknown): boolean {
    const normalized = normalizeAliasCode(raw);
    if (!normalized) return false;
    return ['UH', 'ULANGAN_HARIAN', 'FORMATIF', 'FORMATIVE'].includes(normalized);
}

function tryNormalizePacketType(rawType: unknown): ExamType | null {
    return inferExamTypeFromAlias(rawType);
}

function normalizePacketType(rawType: unknown): ExamType {
    const resolved = tryNormalizePacketType(rawType);
    if (resolved) return resolved;
    throw new ApiError(400, 'Tipe ujian tidak valid untuk packet ujian.');
}

async function resolveRestrictionTarget(params: {
    academicYearId: number;
    rawExamType?: unknown;
    rawProgramCode?: unknown;
}): Promise<{ programCode: string | null; baseType: ExamType }> {
    const normalizedProgramCode = normalizeProgramCode(params.rawProgramCode);
    const normalizedExamType = normalizeProgramCode(params.rawExamType);
    if (!normalizedProgramCode && !normalizedExamType) {
        throw new ApiError(400, 'Jenis ujian wajib diisi.');
    }

    if (normalizedProgramCode) {
        const directProgram = await prisma.examProgramConfig.findFirst({
            where: {
                academicYearId: params.academicYearId,
                isActive: true,
                code: normalizedProgramCode,
            },
            orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            select: {
                code: true,
                baseType: true,
            },
        });
        if (directProgram) {
            return { programCode: directProgram.code, baseType: directProgram.baseType };
        }
    }

    if (normalizedExamType) {
        const inferredType = tryNormalizePacketType(normalizedExamType);
        const config = await prisma.examProgramConfig.findFirst({
            where: {
                academicYearId: params.academicYearId,
                isActive: true,
                OR: [
                    { code: normalizedExamType },
                    { baseTypeCode: normalizedExamType },
                    ...(inferredType ? [{ baseType: inferredType }] : []),
                ],
            },
            orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            select: {
                code: true,
                baseType: true,
            },
        });
        if (config) {
            return { programCode: config.code, baseType: config.baseType };
        }

        if (inferredType) {
            return { programCode: null, baseType: inferredType };
        }
    }

    if (normalizedProgramCode) {
        const inferredProgramType = tryNormalizePacketType(normalizedProgramCode);
        if (inferredProgramType) {
            return { programCode: null, baseType: inferredProgramType };
        }
    }

    throw new ApiError(
        400,
        `Jenis ujian ${normalizedProgramCode || normalizedExamType || ''} tidak dikenali.`,
    );
}

function buildProgramRestrictionKey(academicYearId: number, semester: Semester, programCode: string): string {
    return `${academicYearId}:${semester}:${programCode}`;
}

function buildLegacyRestrictionKey(academicYearId: number, semester: Semester, examType: ExamType): string {
    return `${academicYearId}:${semester}:${examType}`;
}

function buildAutomaticRestrictionKey(
    academicYearId: number,
    semester: Semester,
    programCode?: string | null,
    examType?: ExamType | null,
): string {
    const normalizedTarget = normalizeProgramCode(programCode || examType) || 'GENERAL';
    return `${academicYearId}:${semester}:${normalizedTarget}`;
}

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

type AutomaticExamRestrictionBelowKkmSubject = {
    subjectId: number;
    subjectName: string;
    score: number;
    kkm: number;
};

type AutomaticExamRestrictionDetails = {
    belowKkmSubjects: AutomaticExamRestrictionBelowKkmSubject[];
    outstandingAmount: number;
    outstandingInvoices: number;
    overdueInvoices: number;
    financeClearanceMode: ExamFinanceClearanceMode;
    financeMinOutstandingAmount: number;
    financeMinOverdueInvoices: number;
    financeClearanceNotes: string | null;
};

type AutomaticExamRestrictionInfo = {
    autoBlocked: boolean;
    reason: string;
    flags: AutomaticExamRestrictionFlags;
    details: AutomaticExamRestrictionDetails;
};

type ExamFinanceClearanceSummary = {
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

const emptyAutomaticExamRestrictionInfo = (): AutomaticExamRestrictionInfo => ({
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
});

const currencyFormatterId = new Intl.NumberFormat('id-ID');

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

async function resolveExamFinanceClearancePolicy(params: {
    academicYearId: number;
    programCode?: string | null;
    examType?: ExamType | null;
}): Promise<ResolvedExamFinanceClearancePolicy> {
    const normalizedProgramCode = normalizeProgramCode(params.programCode);
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

    const normalizedExamType = normalizeProgramCode(params.examType);
    const inferredExamType = params.examType || (normalizedExamType ? tryNormalizePacketType(normalizedExamType) : null);
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

function formatAutomaticRestrictionReason(parts: string[]): string {
    return parts
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' • ');
}

function buildEffectiveExamRestrictionState(params: {
    manualRestriction: { isBlocked: boolean; reason: string | null } | null;
    automaticRestriction: AutomaticExamRestrictionInfo | null;
}): {
    isBlocked: boolean;
    reason: string;
    manualBlocked: boolean;
    autoBlocked: boolean;
} {
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
    const info = automaticRestriction || emptyAutomaticExamRestrictionInfo();
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

async function buildAutomaticExamRestrictionMap(params: {
    classId: number;
    academicYearId: number;
    semester: Semester;
    studentIds: number[];
    programCode?: string | null;
    examType?: ExamType | null;
}): Promise<Map<number, AutomaticExamRestrictionInfo>> {
    const studentIds = Array.from(
        new Set(
            params.studentIds
                .map((studentId) => Number(studentId))
                .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
        ),
    );

    if (!studentIds.length) {
        return new Map();
    }

    const [financePolicy, teacherAssignments, reportGrades, studentGrades, financeInvoices] = await Promise.all([
        resolveExamFinanceClearancePolicy({
            academicYearId: params.academicYearId,
            programCode: params.programCode,
            examType: params.examType,
        }),
        prisma.teacherAssignment.findMany({
            where: {
                classId: params.classId,
                academicYearId: params.academicYearId,
                kkm: { gt: 0 },
            },
            select: {
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

    const assignmentBySubjectId = new Map<
        number,
        { kkm: number; subjectName: string }
    >();
    teacherAssignments.forEach((assignment) => {
        const subjectId = Number(assignment.subjectId);
        const kkm = Number(assignment.kkm);
        if (!Number.isFinite(subjectId) || subjectId <= 0) return;
        if (!Number.isFinite(kkm) || kkm <= 0) return;
        assignmentBySubjectId.set(subjectId, {
            kkm,
            subjectName: subjectNameById.get(subjectId) || `Mapel ${subjectId}`,
        });
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

    const belowKkmByStudent = new Map<number, AutomaticExamRestrictionBelowKkmSubject[]>();
    studentIds.forEach((studentId) => {
        assignmentBySubjectId.forEach((assignment, subjectId) => {
            const key = `${studentId}:${subjectId}`;
            const resolvedScore = reportGradeMap.has(key)
                ? reportGradeMap.get(key)
                : studentGradeAverageMap.get(key);

            if (!Number.isFinite(Number(resolvedScore))) return;
            const score = Number(resolvedScore);
            if (score >= assignment.kkm) return;

            const current = belowKkmByStudent.get(studentId) || [];
            current.push({
                subjectId,
                subjectName: assignment.subjectName,
                score: Number(score.toFixed(2)),
                kkm: Number(assignment.kkm.toFixed(2)),
            });
            belowKkmByStudent.set(studentId, current);
        });
    });

    const now = new Date();
    const financeByStudent = new Map<
        number,
        { outstandingAmount: number; outstandingInvoices: number; overdueInvoices: number }
    >();
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

    const result = new Map<number, AutomaticExamRestrictionInfo>();
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

        const flags: AutomaticExamRestrictionFlags = {
            belowKkm: belowKkmSubjects.length > 0,
            financeOutstanding: financeEvaluation.hasOutstanding,
            financeOverdue: financeEvaluation.hasOverdue,
            financeBlocked: financeEvaluation.blocked,
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

        result.set(studentId, {
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
        });
    });

    return result;
}

async function createHomeroomAutomaticRestrictionNotification(params: {
    classId: number;
    academicYearId: number;
    semester: Semester;
    programCode: string | null;
    examType: ExamType;
    autoRestrictionMap: Map<number, AutomaticExamRestrictionInfo>;
}) {
    const blockedStudents = Array.from(params.autoRestrictionMap.entries()).filter(([, info]) => info.autoBlocked);
    if (!blockedStudents.length) return;

    const homeroomClass = await prisma.class.findUnique({
        where: { id: params.classId },
        select: {
            id: true,
            name: true,
            teacherId: true,
        },
    });
    if (!homeroomClass?.teacherId) return;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const periodLabel = params.semester === Semester.ODD ? 'Ganjil' : 'Genap';
    const examLabel = params.programCode || params.examType;
    const title = `Peringatan izin ujian ${examLabel} ${periodLabel}`;

    const existingNotification = await prisma.notification.findFirst({
        where: {
            userId: homeroomClass.teacherId,
            type: 'EXAM_PERMISSION_AUTOBLOCK',
            title,
            createdAt: { gte: dayStart },
        },
        select: { id: true },
    });
    if (existingNotification) return;

    await prisma.notification.create({
        data: {
            userId: homeroomClass.teacherId,
            title,
            message: `${blockedStudents.length} siswa di ${homeroomClass.name} otomatis diblok karena nilai < KKM atau memenuhi kebijakan clearance ujian.`,
            type: 'EXAM_PERMISSION_AUTOBLOCK',
            data: {
                module: 'HOMEROOM_EXAM_PERMISSION',
                classId: params.classId,
                academicYearId: params.academicYearId,
                semester: params.semester,
                programCode: params.programCode,
                examType: params.examType,
                blockedStudentIds: blockedStudents.map(([studentId]) => studentId),
                route: '/teacher/wali-kelas/permissions',
            },
        },
    });
}

function resolveExamTypeCandidates(raw: unknown): string[] {
    const normalized = normalizeAliasCode(raw);
    if (!normalized) return [];

    const candidates = new Set<string>([normalized]);

    const isFinalFamily = [
        'FINAL',
        'SAS',
        'SAT',
        'PAS',
        'PAT',
        'SAS_SAT',
        'SUMATIF_AKHIR_SEMESTER',
        'SUMATIF_AKHIR_TAHUN',
    ].includes(normalized);
    if (isFinalFamily) {
        candidates.add('FINAL');
        candidates.add('SAS');
        candidates.add('SAT');
    }

    const isMidtermFamily = ['MIDTERM', 'SBTS', 'SUMATIF_BERSAMA_TENGAH_SEMESTER'].includes(normalized);
    if (isMidtermFamily) {
        candidates.add('MIDTERM');
        candidates.add('SBTS');
    }

    const isFormativeFamily = ['FORMATIF', 'FORMATIVE', 'UH', 'ULANGAN_HARIAN'].includes(normalized);
    if (isFormativeFamily) {
        candidates.add('FORMATIF');
        candidates.add('UH');
        candidates.add('ULANGAN_HARIAN');
    }

    return Array.from(candidates.values());
}

function hasExamTypeIntersection(left: unknown, right: unknown): boolean {
    const leftCandidates = new Set(resolveExamTypeCandidates(left));
    const rightCandidates = resolveExamTypeCandidates(right);
    return rightCandidates.some((candidate) => leftCandidates.has(candidate));
}

function isSameSlotTime(
    leftStart: Date | null | undefined,
    leftEnd: Date | null | undefined,
    rightStart: Date | null | undefined,
    rightEnd: Date | null | undefined,
): boolean {
    if (!leftStart || !leftEnd || !rightStart || !rightEnd) return true;
    const toleranceMs = 60_000; // toleransi 1 menit untuk antisipasi mismatch detik/milis
    return (
        Math.abs(leftStart.getTime() - rightStart.getTime()) <= toleranceMs &&
        Math.abs(leftEnd.getTime() - rightEnd.getTime()) <= toleranceMs
    );
}

const AVAILABLE_EXAMS_CACHE_TTL_MS = 3000;
const AVAILABLE_EXAMS_CACHE_MAX_ENTRIES = 2000;
const EXAM_MAKEUP_WINDOW_HOURS = Math.max(
    1,
    Number.isFinite(Number(process.env.EXAM_MAKEUP_WINDOW_HOURS))
        ? Number(process.env.EXAM_MAKEUP_WINDOW_HOURS)
        : 72,
);
const EXAM_MAKEUP_WINDOW_MS = EXAM_MAKEUP_WINDOW_HOURS * 60 * 60 * 1000;
const availableExamsCache = new Map<number, { expiresAt: number; payload: unknown }>();
const PROGRAM_TARGET_CANDIDATE = 'CALON_SISWA';
const PROGRAM_TARGET_BKK_APPLICANT = 'PELAMAR_BKK';
type ExamAccessRole = 'STUDENT' | 'CALON_SISWA' | 'UMUM';
const START_EXAM_SCHEDULE_CACHE_TTL_MS = 15_000;
const START_EXAM_SCHEDULE_CACHE_MAX_ENTRIES = 500;
const EXAM_BROWSER_LAUNCH_TTL_SECONDS = Math.max(
    30,
    Number.isFinite(Number(process.env.EXAM_BROWSER_LAUNCH_TTL_SECONDS))
        ? Number(process.env.EXAM_BROWSER_LAUNCH_TTL_SECONDS)
        : 90,
);
const EXAM_BROWSER_LAUNCH_ISSUER = String(process.env.EXAM_BROWSER_LAUNCH_ISSUER || 'sis-exam').trim();
const EXAM_BROWSER_LAUNCH_AUDIENCE = String(process.env.EXAM_BROWSER_LAUNCH_AUDIENCE || 'sis-exam-browser').trim();
const EXAM_BROWSER_LAUNCH_SECRET = String(
    process.env.EXAM_BROWSER_LAUNCH_SECRET || process.env.JWT_SECRET || '',
).trim();
const EXAM_BROWSER_SCHEME = String(process.env.EXAM_BROWSER_SCHEME || 'siskgb2-exambrowser').trim();
const EXAM_BROWSER_LAUNCH_PATH = String(process.env.EXAM_BROWSER_LAUNCH_PATH || 'launch').trim();
const EXAM_BROWSER_MANDATORY = String(process.env.EXAM_BROWSER_MANDATORY || 'false').trim().toLowerCase() === 'true';
const EXAM_BROWSER_INSTALL_URL = String(process.env.EXAM_BROWSER_INSTALL_URL || '').trim() || null;
const EXAM_BROWSER_SESSION_TOKEN_TTL_SECONDS = Math.max(
    300,
    Number.isFinite(Number(process.env.EXAM_BROWSER_SESSION_TOKEN_TTL_SECONDS))
        ? Number(process.env.EXAM_BROWSER_SESSION_TOKEN_TTL_SECONDS)
        : 6 * 60 * 60,
);
const JWT_SIGNING_SECRET = String(process.env.JWT_SECRET || 'secret').trim();
const EXAM_BROWSER_CONSUMED_TOKEN_CACHE_TTL_MS = EXAM_BROWSER_LAUNCH_TTL_SECONDS * 1000 + 60_000;
const consumedExamBrowserLaunchTokens = new Map<string, number>();
type StartExamSchedulePayload = {
    id: number;
    jobVacancyId: number | null;
    startTime: Date;
    endTime: Date;
    examType: string | null;
    jobVacancy: {
        id: number;
        title: string;
        companyName: string | null;
        industryPartner: {
            id: number;
            name: string;
            city: string | null;
            sector: string | null;
        } | null;
    } | null;
    packet: {
        id: number;
        title: string;
        description: string | null;
        type: ExamType;
        duration: number;
        publishedQuestionCount: number | null;
        instructions: string | null;
        semester: Semester;
        kkm: number | null;
        subjectId: number;
        academicYearId: number;
        programCode: string | null;
        createdAt: Date;
        updatedAt: Date;
        questions: Record<string, unknown>[];
        subject: {
            id: number;
            name: string;
            code: string;
        };
    };
};
const startExamScheduleCache = new Map<number, { expiresAt: number; payload: StartExamSchedulePayload }>();
const startExamScheduleInFlight = new Map<number, Promise<StartExamSchedulePayload | null>>();
type ExamBrowserLaunchTokenPayload = {
    sub: string;
    studentId: number;
    scheduleId: number;
    role: ExamAccessRole;
    launchNonce: string;
    type: 'exam-browser-launch';
};

function ensureExamBrowserMandatoryAccess(user: unknown) {
    if (!EXAM_BROWSER_MANDATORY) return;
    const auth = user as { tokenType?: string } | null;
    if (auth?.tokenType === 'exam-browser-session') return;
    throw new ApiError(403, 'Ujian wajib dibuka melalui aplikasi Exam Browser.', [
        {
            code: 'EXAM_BROWSER_REQUIRED',
            installUrl: EXAM_BROWSER_INSTALL_URL,
        },
    ]);
}

type ExamBrowserSessionAuthPayload = {
    id: number;
    role: ExamAccessRole;
    tokenType: 'exam-browser-session';
    scheduleId: number;
    source: 'exam-browser';
};

function getCachedAvailableExams(studentId: number): unknown | null {
    const now = Date.now();
    const cached = availableExamsCache.get(studentId);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
        availableExamsCache.delete(studentId);
        return null;
    }
    return cached.payload;
}

function setCachedAvailableExams(studentId: number, payload: unknown) {
    const now = Date.now();
    availableExamsCache.set(studentId, {
        payload,
        expiresAt: now + AVAILABLE_EXAMS_CACHE_TTL_MS,
    });

    if (availableExamsCache.size <= AVAILABLE_EXAMS_CACHE_MAX_ENTRIES) return;

    for (const [cacheStudentId, entry] of availableExamsCache.entries()) {
        if (entry.expiresAt <= now) {
            availableExamsCache.delete(cacheStudentId);
        }
    }

    if (availableExamsCache.size <= AVAILABLE_EXAMS_CACHE_MAX_ENTRIES) return;
    const oldestKey = availableExamsCache.keys().next().value;
    if (oldestKey !== undefined) {
        availableExamsCache.delete(oldestKey);
    }
}

function getCachedStartExamSchedule(scheduleId: number): StartExamSchedulePayload | null {
    const now = Date.now();
    const cached = startExamScheduleCache.get(scheduleId);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
        startExamScheduleCache.delete(scheduleId);
        return null;
    }
    return cached.payload;
}

function setCachedStartExamSchedule(scheduleId: number, payload: StartExamSchedulePayload) {
    const now = Date.now();
    startExamScheduleCache.set(scheduleId, {
        payload,
        expiresAt: now + START_EXAM_SCHEDULE_CACHE_TTL_MS,
    });

    if (startExamScheduleCache.size <= START_EXAM_SCHEDULE_CACHE_MAX_ENTRIES) return;

    for (const [cacheScheduleId, entry] of startExamScheduleCache.entries()) {
        if (entry.expiresAt <= now) {
            startExamScheduleCache.delete(cacheScheduleId);
        }
    }

    if (startExamScheduleCache.size <= START_EXAM_SCHEDULE_CACHE_MAX_ENTRIES) return;
    const oldestKey = startExamScheduleCache.keys().next().value;
    if (oldestKey !== undefined) {
        startExamScheduleCache.delete(oldestKey);
    }
}

function cleanupConsumedExamBrowserLaunchTokens(now = Date.now()) {
    for (const [tokenHash, expiresAt] of consumedExamBrowserLaunchTokens.entries()) {
        if (expiresAt <= now) {
            consumedExamBrowserLaunchTokens.delete(tokenHash);
        }
    }
}

function consumeExamBrowserLaunchToken(rawToken: string): boolean {
    const now = Date.now();
    cleanupConsumedExamBrowserLaunchTokens(now);
    const tokenHash = createHash('sha256').update(String(rawToken)).digest('hex');
    const existing = consumedExamBrowserLaunchTokens.get(tokenHash);
    if (existing && existing > now) return false;
    consumedExamBrowserLaunchTokens.set(tokenHash, now + EXAM_BROWSER_CONSUMED_TOKEN_CACHE_TTL_MS);
    return true;
}

function buildExamBrowserLaunchUrl(token: string): string {
    const baseUrl = `${EXAM_BROWSER_SCHEME}://${EXAM_BROWSER_LAUNCH_PATH}`;
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
}

function createExamBrowserSessionAccessToken(params: {
    scheduleId: number;
    studentId: number;
    role: ExamAccessRole;
}): string {
    const payload: ExamBrowserSessionAuthPayload = {
        id: params.studentId,
        role: params.role,
        tokenType: 'exam-browser-session',
        scheduleId: params.scheduleId,
        source: 'exam-browser',
    };

    return jwt.sign(payload, JWT_SIGNING_SECRET, {
        algorithm: 'HS256',
        expiresIn: EXAM_BROWSER_SESSION_TOKEN_TTL_SECONDS,
    });
}

function invalidateStartExamScheduleCache(scheduleId: number) {
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) return;
    startExamScheduleCache.delete(scheduleId);
    startExamScheduleInFlight.delete(scheduleId);
}

function invalidateStartExamScheduleCacheByPacket(packetId: number) {
    if (!Number.isFinite(packetId) || packetId <= 0) return;
    for (const [cacheScheduleId, entry] of startExamScheduleCache.entries()) {
        if (entry.payload.packet.id === packetId) {
            startExamScheduleCache.delete(cacheScheduleId);
            startExamScheduleInFlight.delete(cacheScheduleId);
        }
    }
}

function resolveMakeupDeadline(endTime: Date): Date {
    return new Date(endTime.getTime() + EXAM_MAKEUP_WINDOW_MS);
}

function isMakeupWindowOpen(now: Date, endTime: Date): boolean {
    if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) return false;
    if (now <= endTime) return false;
    return now <= resolveMakeupDeadline(endTime);
}

async function loadStartExamSchedule(scheduleId: number): Promise<StartExamSchedulePayload | null> {
    const schedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        select: {
            id: true,
            jobVacancyId: true,
            startTime: true,
            endTime: true,
            examType: true,
            jobVacancy: {
                select: {
                    id: true,
                    title: true,
                    companyName: true,
                    industryPartner: {
                        select: {
                            id: true,
                            name: true,
                            city: true,
                            sector: true,
                        },
                    },
                },
            },
            packet: {
                select: {
                    id: true,
                    title: true,
                    description: true,
                    type: true,
                    duration: true,
                    publishedQuestionCount: true,
                    instructions: true,
                    semester: true,
                    kkm: true,
                    subjectId: true,
                    academicYearId: true,
                    programCode: true,
                    createdAt: true,
                    updatedAt: true,
                    questions: true,
                    subject: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            },
        },
    });

    if (!schedule || !schedule.packet) return null;

    return {
        ...schedule,
        packet: {
            ...schedule.packet,
            questions: sanitizePacketQuestionsForStudent(schedule.packet.questions),
        },
    };
}

async function getOrCreateStartExamSchedule(scheduleId: number): Promise<StartExamSchedulePayload | null> {
    const cached = getCachedStartExamSchedule(scheduleId);
    if (cached) return cached;

    const inFlight = startExamScheduleInFlight.get(scheduleId);
    if (inFlight) return inFlight;

    const runner = loadStartExamSchedule(scheduleId)
        .then((payload) => {
            if (payload) {
                setCachedStartExamSchedule(scheduleId, payload);
            }
            return payload;
        })
        .finally(() => {
            startExamScheduleInFlight.delete(scheduleId);
        });

    startExamScheduleInFlight.set(scheduleId, runner);
    return runner;
}

function stableSerializeJson(value: unknown): string {
    const normalize = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map((item) => normalize(item));
        if (input && typeof input === 'object') {
            const source = input as Record<string, unknown>;
            return Object.keys(source)
                .sort()
                .reduce<Record<string, unknown>>((acc, key) => {
                    acc[key] = normalize(source[key]);
                    return acc;
                }, {});
        }
        return input;
    };

    try {
        return JSON.stringify(normalize(value));
    } catch {
        return '';
    }
}

const studentExamSessionSelect = {
    id: true,
    studentId: true,
    scheduleId: true,
    startTime: true,
    endTime: true,
    submitTime: true,
    score: true,
    status: true,
    answers: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.StudentExamSessionSelect;

type StudentExamSessionSummary = Prisma.StudentExamSessionGetPayload<{
    select: typeof studentExamSessionSelect;
}>;

type SessionMonitoringSummary = {
    totalViolations: number;
    tabSwitchCount: number;
    fullscreenExitCount: number;
    appSwitchCount: number;
    lastViolationType: string | null;
    lastViolationAt: string | null;
};

type SessionQuestionSetMeta = {
    ids: string[];
    limit: number | null;
    totalAvailable: number;
    assignedAt: string | null;
};

async function findStudentExamSessionSummary(
    scheduleId: number,
    studentId: number,
): Promise<StudentExamSessionSummary | null> {
    return prisma.studentExamSession.findFirst({
        where: { scheduleId, studentId },
        select: studentExamSessionSelect,
    });
}

async function createStudentExamSessionSafely(params: {
    scheduleId: number;
    studentId: number;
    now: Date;
}): Promise<StudentExamSessionSummary> {
    try {
        return await prisma.studentExamSession.create({
            data: {
                scheduleId: params.scheduleId,
                studentId: params.studentId,
                startTime: params.now,
                status: 'IN_PROGRESS',
            },
            select: studentExamSessionSelect,
        });
    } catch (error) {
        // Race-safe fallback: another concurrent request already created the session.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const existing = await findStudentExamSessionSummary(params.scheduleId, params.studentId);
            if (existing) return existing;
        }
        throw error;
    }
}

function sanitizeMonitoringPayload(rawMonitoring: unknown): Record<string, unknown> | null {
    if (!rawMonitoring || typeof rawMonitoring !== 'object') return null;
    const source = rawMonitoring as Record<string, unknown>;

    const totalViolations = Number(source.totalViolations || 0);
    const tabSwitchCount = Number(source.tabSwitchCount || 0);
    const fullscreenExitCount = Number(source.fullscreenExitCount || 0);
    const appSwitchCount = Number(source.appSwitchCount || 0);
    const currentQuestionIndex = Number(source.currentQuestionIndex ?? 0);
    const currentQuestionNumber = Number(source.currentQuestionNumber ?? currentQuestionIndex + 1);

    return {
        totalViolations: Number.isFinite(totalViolations) ? Math.max(0, totalViolations) : 0,
        tabSwitchCount: Number.isFinite(tabSwitchCount) ? Math.max(0, tabSwitchCount) : 0,
        fullscreenExitCount: Number.isFinite(fullscreenExitCount) ? Math.max(0, fullscreenExitCount) : 0,
        appSwitchCount: Number.isFinite(appSwitchCount) ? Math.max(0, appSwitchCount) : 0,
        lastViolationType: source.lastViolationType ? String(source.lastViolationType) : null,
        lastViolationAt: source.lastViolationAt ? String(source.lastViolationAt) : null,
        currentQuestionIndex: Number.isFinite(currentQuestionIndex) ? Math.max(0, Math.floor(currentQuestionIndex)) : 0,
        currentQuestionNumber: Number.isFinite(currentQuestionNumber) ? Math.max(1, Math.floor(currentQuestionNumber)) : 1,
        currentQuestionId: source.currentQuestionId ? String(source.currentQuestionId) : null,
    };
}

function extractMonitoringSummaryFromAnswers(rawAnswers: unknown): SessionMonitoringSummary {
    const defaultSummary: SessionMonitoringSummary = {
        totalViolations: 0,
        tabSwitchCount: 0,
        fullscreenExitCount: 0,
        appSwitchCount: 0,
        lastViolationType: null,
        lastViolationAt: null,
    };
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return defaultSummary;

    const monitoring = sanitizeMonitoringPayload((rawAnswers as Record<string, unknown>).__monitoring);
    if (!monitoring) return defaultSummary;

    const totalViolations = Number(monitoring.totalViolations || 0);
    const tabSwitchCount = Number(monitoring.tabSwitchCount || 0);
    const fullscreenExitCount = Number(monitoring.fullscreenExitCount || 0);
    const appSwitchCount = Number(monitoring.appSwitchCount || 0);

    return {
        totalViolations: Number.isFinite(totalViolations) ? Math.max(0, totalViolations) : 0,
        tabSwitchCount: Number.isFinite(tabSwitchCount) ? Math.max(0, tabSwitchCount) : 0,
        fullscreenExitCount: Number.isFinite(fullscreenExitCount) ? Math.max(0, fullscreenExitCount) : 0,
        appSwitchCount: Number.isFinite(appSwitchCount) ? Math.max(0, appSwitchCount) : 0,
        lastViolationType: monitoring.lastViolationType ? String(monitoring.lastViolationType) : null,
        lastViolationAt: monitoring.lastViolationAt ? String(monitoring.lastViolationAt) : null,
    };
}

function getSessionPriority(status: unknown): number {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return 5;
    if (normalized === 'TIMEOUT') return 4;
    if (normalized === 'IN_PROGRESS') return 3;
    if (normalized === 'NOT_STARTED') return 2;
    return 1;
}

function pickBestSession<T extends { status?: unknown; updatedAt?: unknown; submitTime?: unknown; startTime?: unknown }>(
    sessions: T[] | null | undefined,
): T | null {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const sorted = [...sessions].sort((a, b) => {
        const rankDiff = getSessionPriority(b.status) - getSessionPriority(a.status);
        if (rankDiff !== 0) return rankDiff;
        const updatedDiff = new Date(String(b.updatedAt || 0)).getTime() - new Date(String(a.updatedAt || 0)).getTime();
        if (updatedDiff !== 0) return updatedDiff;
        const submitDiff = new Date(String(b.submitTime || 0)).getTime() - new Date(String(a.submitTime || 0)).getTime();
        if (submitDiff !== 0) return submitDiff;
        return new Date(String(b.startTime || 0)).getTime() - new Date(String(a.startTime || 0)).getTime();
    });
    return sorted[0] || null;
}

function sanitizeAnswersForStorage(rawAnswers: unknown): Record<string, unknown> {
    if (!rawAnswers || typeof rawAnswers !== 'object') return {};
    const source = rawAnswers as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        if (key === '__monitoring' || key === '__questionSet') continue;
        sanitized[key] = value;
    }

    const monitoring = sanitizeMonitoringPayload(source.__monitoring);
    if (monitoring) {
        sanitized.__monitoring = monitoring;
    }

    const questionSet = sanitizeQuestionSetMeta(source.__questionSet);
    if (questionSet) {
        sanitized.__questionSet = questionSet;
    }

    return sanitized;
}

function sanitizeQuestionSetMeta(rawQuestionSet: unknown): SessionQuestionSetMeta | null {
    if (!rawQuestionSet || typeof rawQuestionSet !== 'object' || Array.isArray(rawQuestionSet)) {
        return null;
    }
    const source = rawQuestionSet as Record<string, unknown>;
    const idsRaw = Array.isArray(source.ids) ? source.ids : [];
    const ids = idsRaw
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id, index, arr) => arr.indexOf(id) === index);
    if (ids.length === 0) return null;
    const limitRaw = Number(source.limit);
    const totalRaw = Number(source.totalAvailable);
    return {
        ids,
        limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : null,
        totalAvailable: Number.isFinite(totalRaw) && totalRaw > 0 ? Math.trunc(totalRaw) : ids.length,
        assignedAt: source.assignedAt ? String(source.assignedAt) : null,
    };
}

function hasAnswerValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
}

function createSeededRng(seedSource: string): () => number {
    let seed = 2166136261;
    for (let index = 0; index < seedSource.length; index += 1) {
        seed ^= seedSource.charCodeAt(index);
        seed = Math.imul(seed, 16777619);
    }
    return () => {
        seed += 0x6d2b79f5;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pickRandomQuestionIds(questionIds: string[], pickCount: number, seedSource: string): string[] {
    const count = Math.max(0, Math.min(questionIds.length, Math.trunc(pickCount || 0)));
    if (count === 0) return [];
    const copy = [...questionIds];
    const rng = createSeededRng(seedSource);
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
}

function shuffleBySeed<T>(items: T[], seedSource: string): T[] {
    const copy = [...items];
    if (copy.length <= 1) return copy;
    const rng = createSeededRng(seedSource);
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(rng() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}

function randomizeQuestionOptionsForSession(
    questions: Record<string, unknown>[],
    seedSource: string,
): Record<string, unknown>[] {
    return questions.map((rawQuestion, index) => {
        if (!rawQuestion || typeof rawQuestion !== 'object') return rawQuestion;
        const question = { ...(rawQuestion as Record<string, unknown>) };
        const questionId = String(question.id || `q-${index}`);
        const rawOptions = Array.isArray(question.options) ? question.options : null;
        if (!rawOptions || rawOptions.length <= 1) return question;
        const clonedOptions = rawOptions.map((option) =>
            option && typeof option === 'object' ? { ...(option as Record<string, unknown>) } : option,
        );
        question.options = shuffleBySeed(clonedOptions, `${seedSource}:${questionId}:options`);
        return question;
    });
}

function resolveQuestionIdsForSession(params: {
    packetQuestions: Record<string, unknown>[];
    sessionAnswers: Record<string, unknown>;
    scheduleId: number;
    studentId: number;
    sessionId: number;
    configuredLimit: number | null;
}): string[] {
    const questionIds = params.packetQuestions
        .map((question) => String((question as Record<string, unknown>).id || '').trim())
        .filter(Boolean);
    if (questionIds.length === 0) return [];

    const validIdSet = new Set(questionIds);
    const existingMeta = sanitizeQuestionSetMeta((params.sessionAnswers as Record<string, unknown>).__questionSet);
    const answeredQuestionIds = Object.entries(params.sessionAnswers)
        .filter(([key, value]) => !key.startsWith('__') && validIdSet.has(key) && hasAnswerValue(value))
        .map(([key]) => key);

    const normalizedLimit =
        Number.isFinite(Number(params.configuredLimit)) && Number(params.configuredLimit) > 0
            ? Math.max(1, Math.trunc(Number(params.configuredLimit)))
            : existingMeta?.limit || questionIds.length;
    const effectiveLimit = Math.max(normalizedLimit, answeredQuestionIds.length);

    if (existingMeta?.ids?.length) {
        const existingOrderedIds = existingMeta.ids.filter((id) => validIdSet.has(id));
        if (existingOrderedIds.length >= Math.min(effectiveLimit, questionIds.length)) {
            return existingOrderedIds.slice(0, effectiveLimit);
        }
    }

    if (effectiveLimit >= questionIds.length) {
        return pickRandomQuestionIds(
            questionIds,
            questionIds.length,
            `${params.scheduleId}:${params.studentId}:${params.sessionId}:all`,
        );
    }

    const selected = new Set<string>();
    answeredQuestionIds.forEach((id) => {
        if (validIdSet.has(id)) selected.add(id);
    });

    if (selected.size < effectiveLimit) {
        const remainingIds = questionIds.filter((id) => !selected.has(id));
        const randomizedFill = pickRandomQuestionIds(
            remainingIds,
            effectiveLimit - selected.size,
            `${params.scheduleId}:${params.studentId}:${params.sessionId}:fill`,
        );
        randomizedFill.forEach((id) => selected.add(id));
    }

    if (selected.size === 0) {
        const randomized = pickRandomQuestionIds(
            questionIds,
            effectiveLimit,
            `${params.scheduleId}:${params.studentId}:${params.sessionId}`,
        );
        randomized.forEach((id) => selected.add(id));
    }

    const selectedList = Array.from(selected);
    return selectedList.slice(0, effectiveLimit);
}

function sanitizeQuestionForStudent(rawQuestion: unknown): Record<string, unknown> | null {
    if (!rawQuestion || typeof rawQuestion !== 'object') return null;
    const source = rawQuestion as Record<string, unknown>;
    const cleaned: Record<string, unknown> = { ...source };

    // Remove heavy authoring-only fields
    delete cleaned.blueprint;
    delete cleaned.questionCard;
    delete cleaned.question_card;
    delete cleaned.kisiKisi;
    delete cleaned.kartuSoal;
    delete cleaned.saveToBank;
    delete cleaned.save_to_bank;

    // Remove answer-key / rationale fields from student payload
    delete cleaned.correct_answer;
    delete cleaned.correctAnswer;
    delete cleaned.answerKey;
    delete cleaned.answer_key;
    delete cleaned.answerRationale;
    delete cleaned.scoringGuideline;
    delete cleaned.distractorNotes;
    delete cleaned.stimulus;
    delete cleaned.explanation;

    if (Array.isArray(source.options)) {
        cleaned.options = source.options.map((option) => {
            if (!option || typeof option !== 'object') return option;
            const safeOption: Record<string, unknown> = { ...(option as Record<string, unknown>) };
            delete safeOption.isCorrect;
            delete safeOption.is_correct;
            delete safeOption.correct;
            delete safeOption.answer;
            delete safeOption.answerKey;
            delete safeOption.answer_key;
            delete safeOption.explanation;
            delete safeOption.rationale;
            return safeOption;
        });
    }

    return cleaned;
}

function sanitizePacketQuestionsForStudent(rawQuestions: unknown): Record<string, unknown>[] {
    const list = Array.isArray(rawQuestions) ? rawQuestions : [];
    return list
        .map((question) => sanitizeQuestionForStudent(question))
        .filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizePacketSemester(rawSemester: unknown): Semester {
    const value = String(rawSemester || '').toUpperCase();
    if (value === 'GANJIL') {
        return Semester.ODD;
    }
    if (value === 'GENAP') {
        return Semester.EVEN;
    }
    if (value === Semester.ODD || value === Semester.EVEN) {
        return value as Semester;
    }
    throw new ApiError(400, 'Semester tidak valid. Gunakan ODD/GANJIL atau EVEN/GENAP.');
}

function normalizeOptionalPacketSemester(rawSemester: unknown, fallback: Semester = Semester.ODD): Semester {
    if (rawSemester === undefined || rawSemester === null || String(rawSemester).trim() === '') {
        return fallback;
    }
    return normalizePacketSemester(rawSemester);
}

function normalizeOptionalSessionLabel(rawSessionLabel: unknown): string | null {
    if (rawSessionLabel === undefined || rawSessionLabel === null) {
        return null;
    }
    const normalized = String(rawSessionLabel)
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return null;
    if (normalized.length > 60) {
        throw new ApiError(400, 'Label sesi maksimal 60 karakter.');
    }
    return normalized;
}

function normalizePublishedQuestionCount(rawValue: unknown): number | null {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        return null;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
        throw new ApiError(400, 'Jumlah soal acak per siswa tidak valid.');
    }
    const rounded = Math.trunc(parsed);
    if (rounded <= 0) return null;
    return Math.min(rounded, 500);
}

function normalizeSessionLabelKey(rawLabel: unknown): string | null {
    const normalized = normalizeOptionalSessionLabel(rawLabel);
    if (!normalized) return null;
    return normalized.toLowerCase();
}

const AUTO_CURRICULUM_PACKET_DESCRIPTION = 'Packet dibuat otomatis karena jadwal dibuat dari menu kurikulum.';

function toUtcDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function buildUtcDayRange(value: Date): { start: Date; end: Date } {
    const start = new Date(value);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
}

function buildSessionPacketSignature(params: {
    academicYearId: number;
    subjectId: number;
    programCode: string;
    dateKey: string;
}): string {
    return `${params.academicYearId}:${params.subjectId}:${params.programCode}:${params.dateKey}`;
}

function resolveScheduleProgramCode(params: {
    scheduleExamType?: string | null;
    packetProgramCode?: string | null;
    packetType?: ExamType | string | null;
}): string | null {
    return normalizeProgramCode(params.scheduleExamType || params.packetProgramCode || params.packetType || null);
}

async function findReusablePacketForSessionGroup(params: {
    authorId: number;
    subjectId: number;
    academicYearId: number;
    semester: Semester;
    programCode: string;
    startTime: Date;
}): Promise<{
    id: number;
    subjectId: number;
    academicYearId: number;
    semester: Semester;
    type: ExamType;
    programCode: string | null;
} | null> {
    const normalizedProgramCode = normalizeProgramCode(params.programCode);
    if (!normalizedProgramCode) return null;

    const inferredPacketType = tryNormalizePacketType(normalizedProgramCode);
    const dayRange = buildUtcDayRange(params.startTime);
    const packetWhere: Prisma.ExamPacketWhereInput = {
        authorId: params.authorId,
        subjectId: params.subjectId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        OR: [
            { programCode: normalizedProgramCode },
            ...(inferredPacketType ? [{ type: inferredPacketType }] : []),
        ],
        schedules: {
            some: {
                academicYearId: params.academicYearId,
                subjectId: params.subjectId,
                startTime: {
                    gte: dayRange.start,
                    lt: dayRange.end,
                },
                OR: [{ sessionId: { not: null } }, { sessionLabel: { not: null } }],
            },
        },
    };

    return prisma.examPacket.findFirst({
        where: packetWhere,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            subjectId: true,
            academicYearId: true,
            semester: true,
            type: true,
            programCode: true,
        },
    });
}

async function consolidateSessionSiblingSchedulesForPacket(packetId: number): Promise<{
    movedScheduleIds: number[];
    mergedPacketIds: number[];
    deletedPacketIds: number[];
}> {
    if (!Number.isFinite(packetId) || packetId <= 0) {
        return { movedScheduleIds: [], mergedPacketIds: [], deletedPacketIds: [] };
    }

    const packet = await prisma.examPacket.findUnique({
        where: { id: packetId },
        select: {
            id: true,
            subjectId: true,
            academicYearId: true,
            programCode: true,
            type: true,
            schedules: {
                select: {
                    id: true,
                    subjectId: true,
                    academicYearId: true,
                    examType: true,
                    startTime: true,
                    sessionId: true,
                    sessionLabel: true,
                },
            },
        },
    });

    if (!packet) {
        return { movedScheduleIds: [], mergedPacketIds: [], deletedPacketIds: [] };
    }

    const sessionSchedules = packet.schedules.filter(
        (schedule) => Boolean(schedule.sessionId) || Boolean(normalizeOptionalSessionLabel(schedule.sessionLabel)),
    );
    if (sessionSchedules.length === 0) {
        return { movedScheduleIds: [], mergedPacketIds: [], deletedPacketIds: [] };
    }

    const signatures = new Set<string>();
    let minDayStart: Date | null = null;
    let maxDayEnd: Date | null = null;

    sessionSchedules.forEach((schedule) => {
        const academicYearId = Number(schedule.academicYearId || packet.academicYearId || 0);
        const subjectId = Number(schedule.subjectId || packet.subjectId || 0);
        const programCode =
            resolveScheduleProgramCode({
                scheduleExamType: schedule.examType,
                packetProgramCode: packet.programCode,
                packetType: packet.type,
            }) || '';
        if (!academicYearId || !subjectId || !programCode) return;

        const dateKey = toUtcDateKey(schedule.startTime);
        signatures.add(
            buildSessionPacketSignature({
                academicYearId,
                subjectId,
                programCode,
                dateKey,
            }),
        );

        const range = buildUtcDayRange(schedule.startTime);
        if (!minDayStart || range.start < minDayStart) minDayStart = range.start;
        if (!maxDayEnd || range.end > maxDayEnd) maxDayEnd = range.end;
    });

    if (signatures.size === 0 || !minDayStart || !maxDayEnd) {
        return { movedScheduleIds: [], mergedPacketIds: [], deletedPacketIds: [] };
    }

    const candidateSchedules = await prisma.examSchedule.findMany({
        where: {
            packetId: { not: packet.id },
            subjectId: packet.subjectId,
            academicYearId: packet.academicYearId,
            startTime: {
                gte: minDayStart,
                lt: maxDayEnd,
            },
            OR: [{ sessionId: { not: null } }, { sessionLabel: { not: null } }],
        },
        select: {
            id: true,
            packetId: true,
            subjectId: true,
            academicYearId: true,
            examType: true,
            startTime: true,
            packet: {
                select: {
                    id: true,
                    programCode: true,
                    type: true,
                },
            },
        },
    });

    const movedScheduleIds: number[] = [];
    const mergedPacketIdSet = new Set<number>();

    candidateSchedules.forEach((schedule) => {
        const candidatePacketId = Number(schedule.packetId || 0);
        if (!candidatePacketId) return;

        const programCode =
            resolveScheduleProgramCode({
                scheduleExamType: schedule.examType,
                packetProgramCode: schedule.packet?.programCode,
                packetType: schedule.packet?.type,
            }) || '';
        if (!programCode) return;

        const signature = buildSessionPacketSignature({
            academicYearId: Number(schedule.academicYearId || packet.academicYearId || 0),
            subjectId: Number(schedule.subjectId || packet.subjectId || 0),
            programCode,
            dateKey: toUtcDateKey(schedule.startTime),
        });

        if (!signatures.has(signature)) return;
        movedScheduleIds.push(schedule.id);
        mergedPacketIdSet.add(candidatePacketId);
    });

    const mergedPacketIds = Array.from(mergedPacketIdSet);
    if (movedScheduleIds.length === 0 || mergedPacketIds.length === 0) {
        return { movedScheduleIds: [], mergedPacketIds: [], deletedPacketIds: [] };
    }

    const deletedPacketIds = await prisma.$transaction(async (tx) => {
        await tx.examSchedule.updateMany({
            where: {
                id: { in: movedScheduleIds },
            },
            data: {
                packetId: packet.id,
            },
        });

        const autoOrphanPackets = await tx.examPacket.findMany({
            where: {
                id: { in: mergedPacketIds },
                description: AUTO_CURRICULUM_PACKET_DESCRIPTION,
                schedules: { none: {} },
            },
            select: { id: true },
        });
        const autoOrphanIds = autoOrphanPackets.map((item) => item.id);
        if (autoOrphanIds.length > 0) {
            await tx.examPacket.deleteMany({
                where: {
                    id: { in: autoOrphanIds },
                },
            });
        }

        return autoOrphanIds;
    });

    return { movedScheduleIds, mergedPacketIds, deletedPacketIds };
}

async function resolveCanonicalProgramCode(params: {
    academicYearId: number;
    rawProgramCode?: unknown;
    rawExamType?: unknown;
}): Promise<string | null> {
    const normalizedProgramCode = normalizeProgramCode(params.rawProgramCode);
    if (normalizedProgramCode) return normalizedProgramCode;

    const normalizedExamType = normalizeProgramCode(params.rawExamType);
    if (!normalizedExamType) return null;

    const inferredType = tryNormalizePacketType(normalizedExamType);
    const config = await prisma.examProgramConfig.findFirst({
        where: {
            academicYearId: params.academicYearId,
            OR: [
                { code: normalizedExamType },
                { baseTypeCode: normalizedExamType },
                ...(inferredType ? [{ baseType: inferredType }] : []),
            ],
        },
        orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }, { id: 'asc' }],
        select: { code: true },
    });
    return config?.code || normalizedExamType;
}

async function resolveProgramSessionReference(params: {
    academicYearId: number;
    rawProgramCode?: unknown;
    rawExamType?: unknown;
    sessionId?: unknown;
    sessionLabel?: unknown;
}): Promise<{ id: number; label: string } | null> {
    const hasSessionIdPayload = params.sessionId !== undefined;
    const hasSessionLabelPayload = params.sessionLabel !== undefined;
    if (!hasSessionIdPayload && !hasSessionLabelPayload) {
        return null;
    }

    const resolvedProgramCode = await resolveCanonicalProgramCode({
        academicYearId: params.academicYearId,
        rawProgramCode: params.rawProgramCode,
        rawExamType: params.rawExamType,
    });

    if (!resolvedProgramCode) {
        throw new ApiError(400, 'Program ujian wajib dipilih sebelum mengatur sesi.');
    }

    if (isNonScheduledExamProgramCode(resolvedProgramCode)) {
        throw new ApiError(400, 'Program UH/Formatif tidak menggunakan sesi terjadwal.');
    }

    const parsedSessionId =
        params.sessionId === null || params.sessionId === ''
            ? null
            : params.sessionId === undefined
              ? undefined
              : Number(params.sessionId);
    if (typeof parsedSessionId === 'number' && (!Number.isFinite(parsedSessionId) || parsedSessionId <= 0)) {
        throw new ApiError(400, 'sessionId tidak valid.');
    }

    if (typeof parsedSessionId === 'number') {
        const selectedSession = await prisma.examProgramSession.findUnique({
            where: { id: parsedSessionId },
            select: { id: true, label: true, academicYearId: true, programCode: true, isActive: true },
        });
        if (!selectedSession || !selectedSession.isActive) {
            throw new ApiError(404, 'Sesi tidak ditemukan atau tidak aktif.');
        }
        if (
            selectedSession.academicYearId !== params.academicYearId ||
            selectedSession.programCode !== resolvedProgramCode
        ) {
            throw new ApiError(400, 'Sesi tidak sesuai dengan tahun ajaran/program ujian yang dipilih.');
        }
        return { id: selectedSession.id, label: selectedSession.label };
    }

    const normalizedSessionLabel = normalizeOptionalSessionLabel(params.sessionLabel);
    const normalizedLabelKey = normalizeSessionLabelKey(params.sessionLabel);
    if (!normalizedSessionLabel || !normalizedLabelKey) {
        return null;
    }

    const maxDisplayOrder = await prisma.examProgramSession.aggregate({
        where: {
            academicYearId: params.academicYearId,
            programCode: resolvedProgramCode,
        },
        _max: { displayOrder: true },
    });

    const session = await prisma.examProgramSession.upsert({
        where: {
            academicYearId_programCode_normalizedLabel: {
                academicYearId: params.academicYearId,
                programCode: resolvedProgramCode,
                normalizedLabel: normalizedLabelKey,
            },
        },
        create: {
            academicYearId: params.academicYearId,
            programCode: resolvedProgramCode,
            label: normalizedSessionLabel,
            normalizedLabel: normalizedLabelKey,
            displayOrder: (maxDisplayOrder._max.displayOrder ?? 0) + 1,
        },
        update: {
            isActive: true,
            label: normalizedSessionLabel,
        },
        select: {
            id: true,
            label: true,
        },
    });

    return session;
}

async function backfillProgramSessionsFromExistingRows(params: {
    academicYearId: number;
    programCode: string;
}): Promise<void> {
    const [scheduleRows, sittingRows, existingRows] = await Promise.all([
        prisma.examSchedule.findMany({
            where: {
                academicYearId: params.academicYearId,
                OR: [
                    { examType: params.programCode },
                    { packet: { is: { programCode: params.programCode } } },
                ],
                sessionLabel: { not: null },
            },
            select: { sessionLabel: true },
        }),
        prisma.examSitting.findMany({
            where: {
                academicYearId: params.academicYearId,
                examType: params.programCode,
                sessionLabel: { not: null },
            },
            select: { sessionLabel: true },
        }),
        prisma.examProgramSession.findMany({
            where: {
                academicYearId: params.academicYearId,
                programCode: params.programCode,
            },
            select: {
                normalizedLabel: true,
            },
        }),
    ]);

    const existingLabelKeys = new Set(
        existingRows.map((row) => String(row.normalizedLabel || '').trim()).filter(Boolean),
    );
    const mergedLabels = [...scheduleRows, ...sittingRows]
        .map((row) => normalizeOptionalSessionLabel(row.sessionLabel))
        .filter((value): value is string => Boolean(value));

    const createPayload: Array<{
        academicYearId: number;
        programCode: string;
        label: string;
        normalizedLabel: string;
        displayOrder: number;
    }> = [];
    let nextDisplayOrder = 1;
    mergedLabels.forEach((label) => {
        const normalizedLabel = normalizeSessionLabelKey(label);
        if (!normalizedLabel) return;
        if (existingLabelKeys.has(normalizedLabel)) return;
        existingLabelKeys.add(normalizedLabel);
        createPayload.push({
            academicYearId: params.academicYearId,
            programCode: params.programCode,
            label,
            normalizedLabel,
            displayOrder: nextDisplayOrder++,
        });
    });

    if (createPayload.length > 0) {
        await prisma.examProgramSession.createMany({
            data: createPayload,
            skipDuplicates: true,
        });
    }

    const allSessions = await prisma.examProgramSession.findMany({
        where: {
            academicYearId: params.academicYearId,
            programCode: params.programCode,
            isActive: true,
        },
        select: {
            id: true,
            label: true,
        },
    });

    for (const session of allSessions) {
        await Promise.all([
            prisma.examSchedule.updateMany({
                where: {
                    academicYearId: params.academicYearId,
                    OR: [{ examType: params.programCode }, { packet: { is: { programCode: params.programCode } } }],
                    sessionId: null,
                    sessionLabel: session.label,
                },
                data: {
                    sessionId: session.id,
                    sessionLabel: session.label,
                },
            }),
            prisma.examSitting.updateMany({
                where: {
                    academicYearId: params.academicYearId,
                    examType: params.programCode,
                    sessionId: null,
                    sessionLabel: session.label,
                },
                data: {
                    sessionId: session.id,
                    sessionLabel: session.label,
                },
            }),
        ]);
    }
}

function normalizeClassLevelForProgramScope(raw: unknown): string {
    const value = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    if (!value) return '';
    if (value === '10' || value === 'X') return 'X';
    if (value === '11' || value === 'XI') return 'XI';
    if (value === '12' || value === 'XII') return 'XII';
    return '';
}

function normalizeProgramTargetAudienceToken(raw: unknown): string {
    const value = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
    if (!value) return '';
    if (value === PROGRAM_TARGET_CANDIDATE || value === 'CALONSISWA' || value === 'CANDIDATE') {
        return PROGRAM_TARGET_CANDIDATE;
    }
    if (
        value === PROGRAM_TARGET_BKK_APPLICANT ||
        value === 'BKK' ||
        value === 'UMUM' ||
        value === 'APPLICANT' ||
        value === 'BKK_APPLICANT'
    ) {
        return PROGRAM_TARGET_BKK_APPLICANT;
    }
    return '';
}

function hasProgramTargetAudience(rawTargets: unknown, audienceToken: string): boolean {
    const targets = Array.isArray(rawTargets) ? rawTargets : [];
    return targets.some((item) => normalizeProgramTargetAudienceToken(item) === audienceToken);
}

function resolveExamAccessRole(rawRole: unknown): ExamAccessRole {
    const normalized = String(rawRole || '')
        .trim()
        .toUpperCase();
    if (normalized === 'UMUM') return 'UMUM';
    if (normalized === 'CALON_SISWA') return 'CALON_SISWA';
    return 'STUDENT';
}

async function resolveProgramScopeConfig(params: {
    academicYearId: number;
    programCode?: string | null;
}): Promise<{
    code: string;
    targetClassLevels: string[];
    allowedSubjectIds: number[];
    allowedAuthorIds: number[];
} | null> {
    const normalizedProgramCode = normalizeProgramCode(params.programCode);
    if (!normalizedProgramCode) return null;
    return prisma.examProgramConfig.findFirst({
        where: {
            academicYearId: params.academicYearId,
            isActive: true,
            code: normalizedProgramCode,
        },
        select: {
            code: true,
            targetClassLevels: true,
            allowedSubjectIds: true,
            allowedAuthorIds: true,
        },
    });
}

async function assertScheduleAudienceAccess(params: {
    userId: number;
    scheduleId: number;
    jobVacancyId?: number | null;
    academicYearId: number;
    accessRole: ExamAccessRole;
    programCode?: string | null;
    fallbackExamType?: string | null;
}) {
    if (params.accessRole === 'STUDENT') return;

    if (params.accessRole === 'CALON_SISWA') {
        const scopeConfig = await resolveProgramScopeConfig({
            academicYearId: params.academicYearId,
            programCode: params.programCode || params.fallbackExamType || null,
        });

        if (!scopeConfig || !hasProgramTargetAudience(scopeConfig.targetClassLevels, PROGRAM_TARGET_CANDIDATE)) {
            throw new ApiError(403, 'Ujian ini tidak tersedia untuk calon siswa.');
        }
        return;
    }

    if (params.accessRole === 'UMUM') {
        const applicant = await prisma.user.findUnique({
            where: { id: params.userId },
            select: {
                verificationStatus: true,
            },
        });

        if (!applicant) {
            throw new ApiError(404, 'Pelamar BKK tidak ditemukan.');
        }

        if (applicant.verificationStatus !== VerificationStatus.VERIFIED) {
            throw new ApiError(403, 'Akun pelamar BKK belum diverifikasi admin. Tunggu verifikasi sebelum mengikuti tes.');
        }

        const scopeConfig = await resolveProgramScopeConfig({
            academicYearId: params.academicYearId,
            programCode: params.programCode || params.fallbackExamType || null,
        });

        if (
            !scopeConfig ||
            !hasProgramTargetAudience(scopeConfig.targetClassLevels, PROGRAM_TARGET_BKK_APPLICANT)
        ) {
            throw new ApiError(403, 'Ujian ini tidak tersedia untuk pelamar BKK.');
        }

        const vacancyId = Number(params.jobVacancyId || 0);
        if (!Number.isFinite(vacancyId) || vacancyId <= 0) {
            throw new ApiError(403, 'Tes BKK ini belum terhubung ke lowongan yang valid.');
        }

        const activeApplication = await prisma.jobApplication.findUnique({
            where: {
                applicantId_vacancyId: {
                    applicantId: params.userId,
                    vacancyId,
                },
            },
            select: {
                id: true,
                status: true,
            },
        });

        if (!activeApplication || ['WITHDRAWN', 'REJECTED'].includes(String(activeApplication.status || ''))) {
            throw new ApiError(403, 'Anda belum memiliki lamaran aktif pada lowongan tes ini.');
        }

        return;
    }

    throw new ApiError(403, 'Role tidak diizinkan mengakses ujian ini.');
}

async function assertPacketCreationScope(params: {
    academicYearId: number;
    programCode?: string | null;
    subjectId: number;
    authorId: number;
}) {
    const scopeConfig = await resolveProgramScopeConfig({
        academicYearId: params.academicYearId,
        programCode: params.programCode,
    });
    if (!scopeConfig) return;

    if (
        Array.isArray(scopeConfig.allowedSubjectIds) &&
        scopeConfig.allowedSubjectIds.length > 0 &&
        !scopeConfig.allowedSubjectIds.includes(params.subjectId)
    ) {
        throw new ApiError(
            400,
            `Mapel ini tidak diizinkan pada program ${scopeConfig.code}. Atur dulu daftar mapel di Program Ujian.`,
        );
    }

    const targetLevels = new Set(
        (scopeConfig.targetClassLevels || [])
            .map((item) => normalizeClassLevelForProgramScope(item))
            .filter((item): item is string => Boolean(item)),
    );
    if (targetLevels.size === 0) return;

    const assignments = await prisma.teacherAssignment.findMany({
        where: {
            academicYearId: params.academicYearId,
            teacherId: params.authorId,
            subjectId: params.subjectId,
        },
        select: {
            id: true,
            class: {
                select: {
                    id: true,
                    name: true,
                    level: true,
                },
            },
        },
    });

    const allowedAssignments = assignments.filter((assignment) =>
        targetLevels.has(normalizeClassLevelForProgramScope(assignment.class?.level)),
    );
    if (allowedAssignments.length > 0) return;

    throw new ApiError(
        400,
        `Program ${scopeConfig.code} hanya untuk tingkat ${Array.from(targetLevels).join('/')}.\n` +
            'Anda belum memiliki assignment mapel ini pada tingkat tersebut.',
    );
}

async function resolvePacketAssignmentScope(params: {
    teacherAssignmentId?: unknown;
    academicYearId: number;
    authorId: number;
    subjectId?: number;
    programCode?: string | null;
}): Promise<{ id: number; subjectId: number; kkm: number } | null> {
    const normalizedAssignmentId = Number(params.teacherAssignmentId);
    if (!Number.isFinite(normalizedAssignmentId) || normalizedAssignmentId <= 0) return null;

    const assignment = await prisma.teacherAssignment.findFirst({
        where: {
            id: normalizedAssignmentId,
            teacherId: params.authorId,
            academicYearId: params.academicYearId,
        },
        select: {
            id: true,
            subjectId: true,
            kkm: true,
            class: {
                select: {
                    id: true,
                    name: true,
                    level: true,
                },
            },
        },
    });
    if (!assignment) {
        throw new ApiError(400, 'Assignment mapel-kelas tidak valid untuk guru aktif.');
    }

    if (
        Number.isFinite(Number(params.subjectId)) &&
        Number(params.subjectId) > 0 &&
        Number(assignment.subjectId) !== Number(params.subjectId)
    ) {
        throw new ApiError(400, 'Mapel assignment tidak sesuai dengan mapel yang dipilih.');
    }

    const scopeConfig = await resolveProgramScopeConfig({
        academicYearId: params.academicYearId,
        programCode: params.programCode,
    });
    if (scopeConfig) {
        if (
            Array.isArray(scopeConfig.allowedSubjectIds) &&
            scopeConfig.allowedSubjectIds.length > 0 &&
            !scopeConfig.allowedSubjectIds.includes(Number(assignment.subjectId))
        ) {
            throw new ApiError(
                400,
                `Mapel assignment ini tidak diizinkan pada program ${scopeConfig.code}.`,
            );
        }

        const targetLevels = new Set(
            (scopeConfig.targetClassLevels || [])
                .map((item) => normalizeClassLevelForProgramScope(item))
                .filter((item): item is string => Boolean(item)),
        );
        if (targetLevels.size > 0) {
            const assignmentLevel = normalizeClassLevelForProgramScope(assignment.class?.level);
            if (!assignmentLevel || !targetLevels.has(assignmentLevel)) {
                throw new ApiError(
                    400,
                    `Assignment ${assignment.class?.name || ''} tidak sesuai target tingkat program ${scopeConfig.code}.`,
                );
            }
        }
    }

    return { id: assignment.id, subjectId: assignment.subjectId, kkm: assignment.kkm };
}

async function assertScheduleClassLevelScope(params: {
    academicYearId: number;
    programCode?: string | null;
    classIds: number[];
}) {
    const scopeConfig = await resolveProgramScopeConfig({
        academicYearId: params.academicYearId,
        programCode: params.programCode,
    });
    if (!scopeConfig) return;

    const targetLevels = new Set(
        (scopeConfig.targetClassLevels || [])
            .map((item) => normalizeClassLevelForProgramScope(item))
            .filter((item): item is string => Boolean(item)),
    );
    if (targetLevels.size === 0) return;

    const classes = await prisma.class.findMany({
        where: { id: { in: params.classIds } },
        select: {
            id: true,
            name: true,
            level: true,
        },
    });

    const invalid = classes.filter((item) => !targetLevels.has(normalizeClassLevelForProgramScope(item.level)));
    if (invalid.length === 0) return;

    throw new ApiError(
        400,
        `Program ${scopeConfig.code} hanya untuk tingkat ${Array.from(targetLevels).join('/')}.\nKelas tidak sesuai: ${invalid
            .map((item) => item.name)
            .join(', ')}.`,
    );
}

function resolveOptionalJobVacancyId(raw: unknown): number | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new ApiError(400, 'jobVacancyId tidak valid.');
    }
    return Math.trunc(parsed);
}

async function assertBkkExamScheduleManagementAccess(req: Request) {
    const authUser = (req as Request & { user?: { id?: number | string; role?: string } }).user;
    const authUserId = Number(authUser?.id || 0);
    const authRole = String(authUser?.role || '').trim().toUpperCase();
    if (authRole === 'ADMIN') return;
    if (authRole !== 'TEACHER' || !Number.isFinite(authUserId) || authUserId <= 0) {
        throw new ApiError(403, 'Hanya admin atau tim Humas yang dapat mengatur tes BKK.');
    }

    const profile = await prisma.user.findUnique({
        where: { id: authUserId },
        select: { additionalDuties: true },
    });
    const duties = (profile?.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());
    const allowed = duties.some((duty) =>
        ['WAKASEK_HUMAS', 'SEKRETARIS_HUMAS', 'KAPROG'].some(
            (needle) => duty === needle || duty.includes(needle),
        ),
    );
    if (!allowed) {
        throw new ApiError(403, 'Hanya tim Humas/BKK yang dapat mengatur tes untuk lowongan.');
    }
}

function resolveScheduleDateTime(input: {
    date?: unknown;
    time?: unknown;
    dateTime?: unknown;
    fieldLabel: string;
}): Date {
    const rawDateTime = String(input.dateTime ?? '').trim();
    if (rawDateTime) {
        const parsed = new Date(rawDateTime);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const rawDate = String(input.date ?? '').trim();
    const rawTime = String(input.time ?? '').trim();
    if (rawDate && rawTime) {
        const parsed = new Date(`${rawDate}T${rawTime}:00`);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    throw new ApiError(400, `${input.fieldLabel} tidak valid.`);
}

function assertProgramFixedSemesterCompatibility(code: string, fixedSemester: Semester | null, semester: Semester) {
    if (!fixedSemester) return;
    if (fixedSemester === semester) return;
    if (fixedSemester === Semester.ODD) {
        throw new ApiError(400, `Program ujian ${code} hanya bisa digunakan di semester Ganjil.`);
    }
    throw new ApiError(400, `Program ujian ${code} hanya bisa digunakan di semester Genap.`);
}

function defaultGradeComponentTypeByPacketType(type: ExamType): GradeComponentType {
    const normalized = normalizeAliasCode(type);
    if (isFormativeAliasCode(normalized)) return GradeComponentType.FORMATIVE;
    if (isMidtermAliasCode(normalized)) return GradeComponentType.MIDTERM;
    if (isFinalAliasCode(normalized)) return GradeComponentType.FINAL;
    if (normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK') return GradeComponentType.US_PRACTICE;
    if (normalized === 'US_THEORY' || normalized === 'US_TEORI') return GradeComponentType.US_THEORY;
    return GradeComponentType.CUSTOM;
}

function defaultGradeComponentCodeByPacketType(type: ExamType): string {
    const normalized = normalizeAliasCode(type);
    if (isFormativeAliasCode(normalized)) return 'FORMATIVE';
    if (isMidtermAliasCode(normalized)) return 'MIDTERM';
    if (isFinalAliasCode(normalized)) return 'FINAL';
    if (normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK') return 'US_PRACTICE';
    if (normalized === 'US_THEORY' || normalized === 'US_TEORI') return 'US_THEORY';
    return 'CUSTOM';
}

function defaultGradeEntryModeByCode(code: string): GradeEntryMode {
    return isFormativeAliasCode(code) ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE;
}

function mapGradeComponentTypeFromCode(
    code: string,
    fallback: GradeComponentType = GradeComponentType.CUSTOM,
): GradeComponentType {
    const normalized = normalizeAliasCode(code);
    if (isFormativeAliasCode(normalized)) return GradeComponentType.FORMATIVE;
    if (isMidtermAliasCode(normalized)) return GradeComponentType.MIDTERM;
    if (isFinalAliasCode(normalized)) return GradeComponentType.FINAL;
    if (normalized === 'SKILL') return GradeComponentType.SKILL;
    if (normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK') return GradeComponentType.US_PRACTICE;
    if (normalized === 'US_THEORY' || normalized === 'US_TEORI') return GradeComponentType.US_THEORY;
    return fallback;
}

async function resolveGradeComponentConfigForPacket(params: {
    academicYearId: number;
    type: ExamType;
    programCode?: string | null;
}): Promise<{
    componentType: GradeComponentType;
    componentCode: string;
    componentLabel: string;
    gradeEntryMode: GradeEntryMode;
}> {
    const defaultType = defaultGradeComponentTypeByPacketType(params.type);
    const defaultCode = defaultGradeComponentCodeByPacketType(params.type);
    const defaultMode = defaultGradeEntryModeByCode(defaultCode);
    const defaultLabel = defaultCode.replace(/_/g, ' ');

    const normalizedProgramCode = normalizeProgramCode(params.programCode);
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
        });
        if (config) {
            const resolvedCode = normalizeProgramCode(config.gradeComponentCode) || defaultCode;
            return {
                componentType: mapGradeComponentTypeFromCode(resolvedCode, config.gradeComponentType || defaultType),
                componentCode: resolvedCode,
                componentLabel: String(config.gradeComponentLabel || '').trim() || defaultLabel,
                gradeEntryMode: config.gradeEntryMode || defaultMode,
            };
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
    });
    if (fallbackByType) {
        const resolvedCode = normalizeProgramCode(fallbackByType.gradeComponentCode) || defaultCode;
        return {
            componentType: mapGradeComponentTypeFromCode(resolvedCode, fallbackByType.gradeComponentType || defaultType),
            componentCode: resolvedCode,
            componentLabel: String(fallbackByType.gradeComponentLabel || '').trim() || defaultLabel,
            gradeEntryMode: fallbackByType.gradeEntryMode || defaultMode,
        };
    }

    return {
        componentType: defaultType,
        componentCode: defaultCode,
        componentLabel: defaultLabel,
        gradeEntryMode: defaultMode,
    };
}

async function resolvePacketProgram(params: {
    academicYearId: number;
    semester: Semester;
    programCode?: unknown;
    legacyType?: unknown;
    currentProgramCode?: string | null;
}): Promise<{ programCode: string; baseType: ExamType }> {
    const normalizedProgramCode = normalizeProgramCode(params.programCode);

    if (normalizedProgramCode) {
        const config = await prisma.examProgramConfig.findFirst({
            where: {
                academicYearId: params.academicYearId,
                code: normalizedProgramCode,
            },
            select: {
                code: true,
                baseType: true,
                fixedSemester: true,
                isActive: true,
            },
        });

        if (!config) {
            throw new ApiError(404, `Program ujian ${normalizedProgramCode} tidak ditemukan pada tahun ajaran aktif.`);
        }

        const normalizedCurrentCode = normalizeProgramCode(params.currentProgramCode);
        if (!config.isActive && config.code !== normalizedCurrentCode) {
            throw new ApiError(400, `Program ujian ${config.code} sedang nonaktif.`);
        }

        // Untuk mode dinamis, pembatas semester mengikuti fixedSemester program.
        // Base type tetap dipakai untuk routing komponen nilai, bukan pembatas semester.
        assertProgramFixedSemesterCompatibility(config.code, config.fixedSemester, params.semester);
        return { programCode: config.code, baseType: config.baseType };
    }

    const normalizedLegacyCode = normalizeProgramCode(params.legacyType);
    if (normalizedLegacyCode) {
        const config = await prisma.examProgramConfig.findFirst({
            where: {
                academicYearId: params.academicYearId,
                code: normalizedLegacyCode,
            },
            select: {
                code: true,
                baseType: true,
                fixedSemester: true,
                isActive: true,
            },
        });
        if (config) {
            const normalizedCurrentCode = normalizeProgramCode(params.currentProgramCode);
            if (!config.isActive && config.code !== normalizedCurrentCode) {
                throw new ApiError(400, `Program ujian ${config.code} sedang nonaktif.`);
            }
            assertProgramFixedSemesterCompatibility(config.code, config.fixedSemester, params.semester);
            return { programCode: config.code, baseType: config.baseType };
        }
    }

    const legacyType = normalizePacketType(params.legacyType);

    const matchingPrograms = await prisma.examProgramConfig.findMany({
        where: {
            academicYearId: params.academicYearId,
            baseType: legacyType,
            isActive: true,
        },
        select: {
            code: true,
            baseType: true,
            fixedSemester: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });

    const candidate =
        matchingPrograms.find((item) => !item.fixedSemester || item.fixedSemester === params.semester) ||
        matchingPrograms[0];

    if (candidate) {
        assertProgramFixedSemesterCompatibility(candidate.code, candidate.fixedSemester, params.semester);
        return { programCode: candidate.code, baseType: candidate.baseType };
    }

    return {
        programCode: normalizedLegacyCode || legacyType,
        baseType: legacyType,
    };
}

type ExamQuestionBlueprint = {
    competency?: string;
    learningObjective?: string;
    indicator?: string;
    materialScope?: string;
    cognitiveLevel?: string;
};

type ExamQuestionCard = {
    stimulus?: string;
    answerRationale?: string;
    scoringGuideline?: string;
    distractorNotes?: string;
};

type ExamQuestionItemAnalysis = {
    difficultyIndex?: number;
    discriminationIndex?: number;
    unansweredRate?: number;
    sampleSize?: number;
    generatedAt?: string;
    optionDistribution?: Record<string, number>;
};

type NormalizedExamQuestion = {
    id: string;
    type: string;
    content: string;
    score: number;
    options?: unknown[];
    answerKey?: string;
    question_image_url?: string;
    question_video_url?: string;
    question_video_type?: string;
    question_media_position?: string;
    blueprint?: ExamQuestionBlueprint;
    questionCard?: ExamQuestionCard;
    itemAnalysis?: ExamQuestionItemAnalysis;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function normalizeOptionalString(value: unknown, maxLength = 2000): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, maxLength);
}

function normalizeOptionalNumber(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
}

function normalizeBlueprint(raw: unknown): ExamQuestionBlueprint | undefined {
    const source = asRecord(raw);
    if (!source) return undefined;

    const normalized: ExamQuestionBlueprint = {
        competency: normalizeOptionalString(source.competency, 500),
        learningObjective: normalizeOptionalString(source.learningObjective, 500),
        indicator: normalizeOptionalString(source.indicator, 500),
        materialScope: normalizeOptionalString(source.materialScope, 500),
        cognitiveLevel: normalizeOptionalString(source.cognitiveLevel, 100),
    };

    return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function normalizeQuestionCard(raw: unknown): ExamQuestionCard | undefined {
    const source = asRecord(raw);
    if (!source) return undefined;

    const normalized: ExamQuestionCard = {
        stimulus: normalizeOptionalString(source.stimulus, 2000),
        answerRationale: normalizeOptionalString(source.answerRationale, 2000),
        scoringGuideline: normalizeOptionalString(source.scoringGuideline, 1000),
        distractorNotes: normalizeOptionalString(source.distractorNotes, 2000),
    };

    return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function normalizeItemAnalysis(raw: unknown): ExamQuestionItemAnalysis | undefined {
    const source = asRecord(raw);
    if (!source) return undefined;

    const distributionRaw = asRecord(source.optionDistribution);
    let optionDistribution: Record<string, number> | undefined;
    if (distributionRaw) {
        optionDistribution = {};
        Object.entries(distributionRaw).forEach(([key, value]) => {
            const parsed = normalizeOptionalNumber(value);
            if (parsed !== undefined && parsed >= 0) {
                optionDistribution![key] = parsed;
            }
        });
        if (Object.keys(optionDistribution).length === 0) {
            optionDistribution = undefined;
        }
    }

    const normalized: ExamQuestionItemAnalysis = {
        difficultyIndex: normalizeOptionalNumber(source.difficultyIndex),
        discriminationIndex: normalizeOptionalNumber(source.discriminationIndex),
        unansweredRate: normalizeOptionalNumber(source.unansweredRate),
        sampleSize: normalizeOptionalNumber(source.sampleSize),
        generatedAt: normalizeOptionalString(source.generatedAt, 64),
        optionDistribution,
    };

    return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function normalizeExamQuestionPayload(question: unknown, index: number): NormalizedExamQuestion {
    const source = asRecord(question);
    if (!source) {
        throw new ApiError(400, `Format soal ke-${index + 1} tidak valid.`);
    }

    const metadata = asRecord(source.metadata);
    const scoreRaw = normalizeOptionalNumber(source.score);
    const normalized: NormalizedExamQuestion = {
        id: String(source.id || `q-${index + 1}`),
        type: String(source.type || source.question_type || 'MULTIPLE_CHOICE'),
        content: String(source.content || source.question_text || ''),
        score: scoreRaw && scoreRaw > 0 ? scoreRaw : 1,
        options: Array.isArray(source.options) ? source.options : undefined,
        answerKey: normalizeOptionalString(source.answerKey, 255),
        question_image_url: normalizeOptionalString(source.question_image_url, 2048),
        question_video_url: normalizeOptionalString(source.question_video_url, 2048),
        question_video_type: normalizeOptionalString(source.question_video_type, 20),
        question_media_position: normalizeOptionalString(source.question_media_position, 20),
        blueprint: normalizeBlueprint(source.blueprint ?? metadata?.blueprint),
        questionCard: normalizeQuestionCard(source.questionCard ?? metadata?.questionCard),
        itemAnalysis: normalizeItemAnalysis(source.itemAnalysis ?? metadata?.itemAnalysis),
    };

    return normalized;
}

function normalizeQuestionsPayload(rawQuestions: unknown): NormalizedExamQuestion[] | undefined {
    if (!Array.isArray(rawQuestions)) return undefined;
    return rawQuestions.map((question, idx) => normalizeExamQuestionPayload(question, idx));
}

function deriveAnswerKeyFromOptions(options: unknown[] | undefined): string | undefined {
    if (!options || options.length === 0) return undefined;
    const correctOptionIds = options
        .filter((option) => {
            const item = asRecord(option);
            return Boolean(item?.isCorrect);
        })
        .map((option) => {
            const item = asRecord(option);
            return item?.id ? String(item.id) : null;
        })
        .filter((id): id is string => Boolean(id));

    if (correctOptionIds.length === 0) return undefined;
    return correctOptionIds.join(',');
}

function buildQuestionBankMetadata(question: NormalizedExamQuestion): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};
    if (question.blueprint) metadata.blueprint = question.blueprint;
    if (question.questionCard) metadata.questionCard = question.questionCard;
    if (question.itemAnalysis) metadata.itemAnalysis = question.itemAnalysis;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
}

async function createQuestionBankEntry(data: Prisma.QuestionCreateInput) {
    try {
        return await prisma.question.create({ data });
    } catch (error) {
        // Backward compatibility for environments where "questions.metadata" column is not migrated yet.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
            const { metadata, ...legacyData } = data as Prisma.QuestionCreateInput & { metadata?: unknown };
            return prisma.question.create({ data: legacyData });
        }
        throw error;
    }
}

function normalizeQuestionBankComparableText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeQuestionBankOptionSignature(options: unknown): Array<{ text: string; isCorrect: boolean }> {
    if (!Array.isArray(options)) return [];
    return options
        .map((option, index) => {
            const source = asRecord(option);
            if (!source) {
                return {
                    text: normalizeQuestionBankComparableText(option),
                    isCorrect: false,
                };
            }

            const rawText =
                source.text ??
                source.content ??
                source.label ??
                source.optionText ??
                source.value ??
                source.option ??
                '';

            return {
                text: normalizeQuestionBankComparableText(rawText),
                isCorrect: Boolean(source.isCorrect),
                index,
            };
        })
        .sort((a, b) => {
            if (a.text !== b.text) return a.text.localeCompare(b.text, 'id');
            if (a.isCorrect !== b.isCorrect) return Number(a.isCorrect) - Number(b.isCorrect);
            return (a as any).index - (b as any).index;
        })
        .map(({ text, isCorrect }) => ({ text, isCorrect }));
}

function buildQuestionBankSignature(params: { type: string; content: string; options?: unknown }): string {
    const payload = JSON.stringify({
        type: String(params.type || '').trim().toUpperCase(),
        content: normalizeQuestionBankComparableText(params.content),
        options: normalizeQuestionBankOptionSignature(params.options),
    });
    return createHash('sha256').update(payload).digest('hex');
}

function deduplicateQuestionsForBank(questions: NormalizedExamQuestion[]) {
    const seen = new Set<string>();
    const unique: Array<{ question: NormalizedExamQuestion; signature: string }> = [];

    questions.forEach((question) => {
        const signature = buildQuestionBankSignature({
            type: question.type,
            content: question.content,
            options: question.options,
        });
        if (seen.has(signature)) return;
        seen.add(signature);
        unique.push({ question, signature });
    });

    return unique;
}

async function saveQuestionsToBankWithDedup(params: {
    bankTitle: string;
    subjectId: number;
    academicYearId: number;
    semester: Semester;
    authorId: number;
    questions: NormalizedExamQuestion[];
}) {
    const dedupedPayload = deduplicateQuestionsForBank(params.questions);
    const skippedInPayload = Math.max(0, params.questions.length - dedupedPayload.length);
    if (dedupedPayload.length === 0) {
        return { bankId: null as number | null, createdCount: 0, skippedInPayload, skippedExisting: 0 };
    }

    const sourceContents = Array.from(
        new Set(
            dedupedPayload
                .map((item) => String(item.question.content || '').trim())
                .filter((content) => content.length > 0),
        ),
    );

    const existingCandidates =
        sourceContents.length > 0
            ? await prisma.question.findMany({
                  where: {
                      content: { in: sourceContents },
                      bank: {
                          subjectId: params.subjectId,
                          academicYearId: params.academicYearId,
                          semester: params.semester,
                          authorId: params.authorId,
                      },
                  },
                  select: {
                      type: true,
                      content: true,
                      options: true,
                  },
              })
            : [];

    const existingSignatures = new Set(
        existingCandidates.map((row) =>
            buildQuestionBankSignature({
                type: row.type,
                content: row.content,
                options: row.options ?? undefined,
            }),
        ),
    );

    const questionsToInsert = dedupedPayload.filter((item) => !existingSignatures.has(item.signature));
    const skippedExisting = dedupedPayload.length - questionsToInsert.length;

    if (questionsToInsert.length === 0) {
        return { bankId: null as number | null, createdCount: 0, skippedInPayload, skippedExisting };
    }

    const bank = await prisma.questionBank.create({
        data: {
            title: params.bankTitle,
            subjectId: params.subjectId,
            academicYearId: params.academicYearId,
            semester: params.semester,
            classLevel: 'ALL',
            authorId: params.authorId,
        },
    });

    await Promise.all(
        questionsToInsert.map(({ question, signature }) => {
            const metadata = buildQuestionBankMetadata(question) || {};
            const metadataWithSignature = { ...metadata, bankSignature: signature };
            return createQuestionBankEntry({
                bank: { connect: { id: bank.id } },
                type: question.type as any,
                content: question.content,
                options: (question.options || []) as Prisma.InputJsonValue,
                answerKey: question.answerKey || deriveAnswerKeyFromOptions(question.options),
                points: question.score || 1,
                mediaUrl: question.question_image_url || question.question_video_url,
                mediaType: question.question_video_type || (question.question_image_url ? 'image' : null),
                metadata: metadataWithSignature as Prisma.InputJsonValue,
            });
        }),
    );

    return {
        bankId: bank.id,
        createdCount: questionsToInsert.length,
        skippedInPayload,
        skippedExisting,
    };
}

type QuestionOptionAnalysisRow = {
    optionId: string;
    label: string;
    isCorrect: boolean;
    selectedCount: number;
    selectedRate: number;
};

type PacketQuestionAnalysisRow = {
    questionId: string;
    orderNumber: number;
    type: string;
    contentPreview: string;
    contentHtml: string | null;
    questionImageUrl: string | null;
    questionVideoUrl: string | null;
    questionVideoType: string | null;
    scoreWeight: number;
    answeredCount: number;
    unansweredCount: number;
    unansweredRate: number;
    correctCount: number | null;
    incorrectCount: number | null;
    difficultyIndex: number | null;
    difficultyCategory: 'Mudah' | 'Sedang' | 'Sulit' | null;
    discriminationIndex: number | null;
    discriminationCategory: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang' | 'Sangat Kurang' | null;
    optionDistribution: QuestionOptionAnalysisRow[];
};

type PacketItemAnalysisSummary = {
    generatedAt: string;
    classFilterId: number | null;
    scheduleCount: number;
    participantCount: number;
    inProgressCount: number;
    totalQuestions: number;
    objectiveQuestions: number;
    essayQuestions: number;
    averageScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
};

type PacketItemAnalysisResult = {
    packet: {
        id: number;
        title: string;
        type: string;
        semester: string;
        subject: { id: number; name: string; code: string };
        academicYear: { id: number; name: string };
        author: { id: number; name: string };
    };
    summary: PacketItemAnalysisSummary;
    items: PacketQuestionAnalysisRow[];
};

type PacketSubmissionSessionRow = {
    sessionId: number;
    scheduleId: number;
    class: { id: number; name: string } | null;
    student: { id: number; name: string; nis: string | null };
    status: string;
    score: number | null;
    startTime: string;
    endTime: string | null;
    submitTime: string | null;
    answeredCount: number;
    unansweredCount: number;
    totalQuestions: number;
    completionRate: number;
    objectiveTotal: number;
    objectiveCorrect: number;
    objectiveIncorrect: number;
    monitoring: SessionMonitoringSummary;
};

type PacketSubmissionSummary = {
    generatedAt: string;
    classFilterId: number | null;
    statusFilter: string | null;
    scheduleCount: number;
    sessionCount: number;
    page: number;
    limit: number;
    totalPages: number;
    pageSessionCount: number;
    participantCount: number;
    submittedCount: number;
    inProgressCount: number;
    averageScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
};

type PacketSubmissionsResult = {
    packet: {
        id: number;
        title: string;
        type: string;
        semester: string;
        subject: { id: number; name: string; code: string };
        academicYear: { id: number; name: string };
        author: { id: number; name: string };
    };
    summary: PacketSubmissionSummary;
    sessions: PacketSubmissionSessionRow[];
};

type SessionQuestionDetailRow = {
    questionId: string;
    orderNumber: number;
    type: string;
    contentPreview: string;
    scoreWeight: number;
    answered: boolean;
    answerText: string | null;
    selectedOptionIds: string[];
    selectedOptionLabels: string[];
    correctOptionIds: string[];
    correctOptionLabels: string[];
    isCorrect: boolean | null;
    explanation: string | null;
};

type SessionDetailResult = {
    packet: {
        id: number;
        title: string;
        type: string;
        semester: string;
        subject: { id: number; name: string; code: string };
        academicYear: { id: number; name: string };
    };
    session: {
        id: number;
        status: string;
        score: number | null;
        startTime: string;
        submitTime: string | null;
        monitoring: SessionMonitoringSummary;
        schedule: {
            id: number;
            startTime: string;
            endTime: string;
            class: { id: number; name: string } | null;
        };
        student: {
            id: number;
            name: string;
            nis: string | null;
            class: { id: number; name: string } | null;
    };
};

    summary: {
        totalQuestions: number;
        answeredCount: number;
        unansweredCount: number;
        completionRate: number;
        objectiveEvaluableCount: number;
        objectiveCorrectCount: number;
        objectiveIncorrectCount: number;
        essayCount: number;
    };
    questions: SessionQuestionDetailRow[];
};

const PACKET_ITEM_ANALYSIS_CACHE_TTL_MS = 30000;
const PACKET_ITEM_ANALYSIS_CACHE_MAX_ENTRIES = 400;
const packetItemAnalysisCache = new Map<string, { expiresAt: number; payload: PacketItemAnalysisResult; etag: string }>();
const packetItemAnalysisInFlight = new Map<string, Promise<PacketItemAnalysisResult>>();
const PACKET_SUBMISSIONS_CACHE_TTL_MS = 10000;
const PACKET_SUBMISSIONS_CACHE_MAX_ENTRIES = 500;
const packetSubmissionsCache = new Map<string, { expiresAt: number; payload: PacketSubmissionsResult; etag: string }>();
const packetSubmissionsInFlight = new Map<string, Promise<PacketSubmissionsResult>>();
const SESSION_DETAIL_CACHE_TTL_MS = 5000;
const SESSION_DETAIL_CACHE_MAX_ENTRIES = 1200;
const sessionDetailCache = new Map<string, { expiresAt: number; payload: SessionDetailResult; etag: string }>();
const sessionDetailInFlight = new Map<string, Promise<SessionDetailResult>>();

function buildWeakEtag(payload: unknown): string {
    const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map((item) => normalize(item));
        if (value && typeof value === 'object') {
            const source = value as Record<string, unknown>;
            return Object.keys(source)
                .sort()
                .reduce<Record<string, unknown>>((acc, key) => {
                    if (key === 'generatedAt') return acc;
                    acc[key] = normalize(source[key]);
                    return acc;
                }, {});
        }
        return value;
    };
    const serialized = stableSerializeJson(normalize(payload));
    const hash = createHash('sha1').update(serialized).digest('hex');
    return `W/"${hash}"`;
}

function normalizeIfNoneMatchHeader(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function isEtagMatch(request: Request, etag: string): boolean {
    const requestTags = normalizeIfNoneMatchHeader(request.headers['if-none-match']);
    if (requestTags.length === 0) return false;
    if (requestTags.includes('*')) return true;
    return requestTags.some((candidate) => candidate === etag);
}

function buildPacketItemAnalysisCacheKey(
    packetId: number,
    classId: number | undefined,
    includeContentHtml: boolean,
): string {
    return `${packetId}:${classId || 0}:${includeContentHtml ? 1 : 0}`;
}

function getCachedPacketItemAnalysis(cacheKey: string): { payload: PacketItemAnalysisResult; etag: string } | null {
    const now = Date.now();
    const cached = packetItemAnalysisCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
        packetItemAnalysisCache.delete(cacheKey);
        return null;
    }
    return { payload: cached.payload, etag: cached.etag };
}

function setCachedPacketItemAnalysis(cacheKey: string, payload: PacketItemAnalysisResult) {
    const now = Date.now();
    packetItemAnalysisCache.set(cacheKey, {
        payload,
        etag: buildWeakEtag(payload),
        expiresAt: now + PACKET_ITEM_ANALYSIS_CACHE_TTL_MS,
    });

    if (packetItemAnalysisCache.size <= PACKET_ITEM_ANALYSIS_CACHE_MAX_ENTRIES) return;

    for (const [key, entry] of packetItemAnalysisCache.entries()) {
        if (entry.expiresAt <= now) {
            packetItemAnalysisCache.delete(key);
        }
    }

    if (packetItemAnalysisCache.size <= PACKET_ITEM_ANALYSIS_CACHE_MAX_ENTRIES) return;
    const oldestKey = packetItemAnalysisCache.keys().next().value;
    if (oldestKey !== undefined) {
        packetItemAnalysisCache.delete(oldestKey);
    }
}

function invalidatePacketItemAnalysisCacheByPacket(packetId: number) {
    const prefix = `${packetId}:`;
    for (const cacheKey of packetItemAnalysisCache.keys()) {
        if (cacheKey.startsWith(prefix)) {
            packetItemAnalysisCache.delete(cacheKey);
        }
    }
    for (const cacheKey of packetItemAnalysisInFlight.keys()) {
        if (cacheKey.startsWith(prefix)) {
            packetItemAnalysisInFlight.delete(cacheKey);
        }
    }
}

function buildPacketSubmissionsCacheKey(
    packetId: number,
    classId: number | undefined,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' | null | undefined,
    page: number,
    limit: number,
): string {
    return `${packetId}:${classId || 0}:${status || 'ALL'}:${page}:${limit}`;
}

function getCachedPacketSubmissions(cacheKey: string): { payload: PacketSubmissionsResult; etag: string } | null {
    const now = Date.now();
    const cached = packetSubmissionsCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
        packetSubmissionsCache.delete(cacheKey);
        return null;
    }
    return { payload: cached.payload, etag: cached.etag };
}

function setCachedPacketSubmissions(cacheKey: string, payload: PacketSubmissionsResult) {
    const now = Date.now();
    packetSubmissionsCache.set(cacheKey, {
        payload,
        etag: buildWeakEtag(payload),
        expiresAt: now + PACKET_SUBMISSIONS_CACHE_TTL_MS,
    });

    if (packetSubmissionsCache.size <= PACKET_SUBMISSIONS_CACHE_MAX_ENTRIES) return;

    for (const [key, entry] of packetSubmissionsCache.entries()) {
        if (entry.expiresAt <= now) {
            packetSubmissionsCache.delete(key);
        }
    }

    if (packetSubmissionsCache.size <= PACKET_SUBMISSIONS_CACHE_MAX_ENTRIES) return;
    const oldestKey = packetSubmissionsCache.keys().next().value;
    if (oldestKey !== undefined) {
        packetSubmissionsCache.delete(oldestKey);
    }
}

function invalidatePacketSubmissionsCacheByPacket(packetId: number) {
    const prefix = `${packetId}:`;
    for (const cacheKey of packetSubmissionsCache.keys()) {
        if (cacheKey.startsWith(prefix)) {
            packetSubmissionsCache.delete(cacheKey);
        }
    }
    for (const cacheKey of packetSubmissionsInFlight.keys()) {
        if (cacheKey.startsWith(prefix)) {
            packetSubmissionsInFlight.delete(cacheKey);
        }
    }
}

function buildSessionDetailCacheKey(sessionId: number, user: { id: number; role: string }): string {
    return `${sessionId}:${user.role}:${user.id}`;
}

function getCachedSessionDetail(cacheKey: string): { payload: SessionDetailResult; etag: string } | null {
    const now = Date.now();
    const cached = sessionDetailCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
        sessionDetailCache.delete(cacheKey);
        return null;
    }
    return { payload: cached.payload, etag: cached.etag };
}

function setCachedSessionDetail(cacheKey: string, payload: SessionDetailResult) {
    const now = Date.now();
    sessionDetailCache.set(cacheKey, {
        payload,
        etag: buildWeakEtag(payload),
        expiresAt: now + SESSION_DETAIL_CACHE_TTL_MS,
    });

    if (sessionDetailCache.size <= SESSION_DETAIL_CACHE_MAX_ENTRIES) return;

    for (const [key, entry] of sessionDetailCache.entries()) {
        if (entry.expiresAt <= now) {
            sessionDetailCache.delete(key);
        }
    }

    if (sessionDetailCache.size <= SESSION_DETAIL_CACHE_MAX_ENTRIES) return;
    const oldestKey = sessionDetailCache.keys().next().value;
    if (oldestKey !== undefined) {
        sessionDetailCache.delete(oldestKey);
    }
}

function invalidateSessionDetailCacheBySession(sessionId: number) {
    const prefix = `${sessionId}:`;
    for (const cacheKey of sessionDetailCache.keys()) {
        if (cacheKey.startsWith(prefix)) {
            sessionDetailCache.delete(cacheKey);
        }
    }
    for (const cacheKey of sessionDetailInFlight.keys()) {
        if (cacheKey.startsWith(prefix)) {
            sessionDetailInFlight.delete(cacheKey);
        }
    }
}

function getOrCreatePacketItemAnalysisInFlight(
    cacheKey: string,
    factory: () => Promise<PacketItemAnalysisResult>,
): Promise<PacketItemAnalysisResult> {
    const existing = packetItemAnalysisInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = factory().finally(() => {
        packetItemAnalysisInFlight.delete(cacheKey);
    });
    packetItemAnalysisInFlight.set(cacheKey, promise);
    return promise;
}

function getOrCreatePacketSubmissionsInFlight(
    cacheKey: string,
    factory: () => Promise<PacketSubmissionsResult>,
): Promise<PacketSubmissionsResult> {
    const existing = packetSubmissionsInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = factory().finally(() => {
        packetSubmissionsInFlight.delete(cacheKey);
    });
    packetSubmissionsInFlight.set(cacheKey, promise);
    return promise;
}

function getOrCreateSessionDetailInFlight(
    cacheKey: string,
    factory: () => Promise<SessionDetailResult>,
): Promise<SessionDetailResult> {
    const existing = sessionDetailInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = factory().finally(() => {
        sessionDetailInFlight.delete(cacheKey);
    });
    sessionDetailInFlight.set(cacheKey, promise);
    return promise;
}

type AnalysisQuestionAccumulator = {
    questionId: string;
    orderNumber: number;
    type: string;
    contentPreview: string;
    contentHtml: string | null;
    questionImageUrl: string | null;
    questionVideoUrl: string | null;
    questionVideoType: string | null;
    scoreWeight: number;
    optionRows: Array<{ optionId: string; label: string; isCorrect: boolean }>;
    optionCounts: Map<string, number>;
    correctOptionIds: string[];
    evaluable: boolean;
    answeredCount: number;
    unansweredCount: number;
    correctCount: number;
    incorrectCount: number;
    correctnessBySessionId: Map<number, boolean | null>;
};

function sanitizeQuestionContentPreview(value: unknown): string {
    const plain = decodeSimpleHtmlEntities(normalizeQuestionContentHtml(value))
        .replace(/<[^>]*>/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain) return '(tanpa teks soal)';
    return plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
}

function normalizeQuestionContentHtml(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Some old payloads store entities in double-encoded form (&amp;nbsp;).
    return raw.replace(/&amp;(?=(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&');
}

function decodeSimpleHtmlEntities(value: string): string {
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
            const code = Number.parseInt(hex, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : _;
        })
        .replace(/&#([0-9]+);/g, (_, dec: string) => {
            const code = Number.parseInt(dec, 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : _;
        })
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'");
}

function normalizePacketQuestionsForAnalysis(raw: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(raw)) {
        return raw.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
            }
        } catch {
            return [];
        }
    }

    return [];
}

function parseSessionAnswers(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return {};
        }
    }
    return {};
}

function normalizeSelectedOptionIds(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.includes(',')) {
            return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
        }
        return [trimmed];
    }

    if (raw === null || raw === undefined) {
        return [];
    }

    const normalized = String(raw).trim();
    return normalized ? [normalized] : [];
}

function normalizeQuestionTypeForAnalysis(question: Record<string, unknown>): string {
    const raw = String(question.type || question.question_type || 'MULTIPLE_CHOICE')
        .trim()
        .toUpperCase();
    return raw;
}

function getCorrectOptionIds(question: Record<string, unknown>): string[] {
    const options = Array.isArray(question.options) ? question.options : [];
    const fromOptions = options
        .filter((option) => {
            const item = asRecord(option);
            return Boolean(item?.isCorrect);
        })
        .map((option) => {
            const item = asRecord(option);
            return item?.id ? String(item.id).trim() : '';
        })
        .filter(Boolean);

    if (fromOptions.length > 0) return fromOptions;

    const answerKey = normalizeOptionalString(question.answerKey, 500);
    if (!answerKey) return [];

    return answerKey
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toRounded(value: number | null): number | null {
    if (value === null || Number.isNaN(value)) return null;
    return Number(value.toFixed(4));
}

function categorizeDifficulty(value: number | null): 'Mudah' | 'Sedang' | 'Sulit' | null {
    if (value === null) return null;
    if (value >= 0.76) return 'Mudah';
    if (value >= 0.31) return 'Sedang';
    return 'Sulit';
}

function categorizeDiscrimination(
    value: number | null,
): 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang' | 'Sangat Kurang' | null {
    if (value === null) return null;
    if (value >= 0.4) return 'Sangat Baik';
    if (value >= 0.3) return 'Baik';
    if (value >= 0.2) return 'Cukup';
    if (value >= 0) return 'Kurang';
    return 'Sangat Kurang';
}

function setEquals(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((value, idx) => value === rightSorted[idx]);
}

function normalizeEssayAnswer(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
}

function isAnsweredForQuestion(question: Record<string, unknown>, rawAnswer: unknown): boolean {
    const type = normalizeQuestionTypeForAnalysis(question);
    if (type === 'ESSAY') {
        return normalizeEssayAnswer(rawAnswer) !== null;
    }
    return normalizeSelectedOptionIds(rawAnswer).length > 0;
}

function evaluateQuestionCorrectness(question: Record<string, unknown>, rawAnswer: unknown): boolean | null {
    const type = normalizeQuestionTypeForAnalysis(question);
    if (type === 'ESSAY') return null;
    const correctOptionIds = getCorrectOptionIds(question);
    if (correctOptionIds.length === 0) return null;
    const selectedOptionIds = normalizeSelectedOptionIds(rawAnswer);
    if (selectedOptionIds.length === 0) return null;
    return setEquals(selectedOptionIds, correctOptionIds);
}

function parseStatusFilter(raw: unknown): 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const value = String(raw).trim().toUpperCase();
    if (value === 'IN_PROGRESS' || value === 'COMPLETED' || value === 'TIMEOUT') {
        return value;
    }
    throw new ApiError(400, 'Status tidak valid. Gunakan IN_PROGRESS, COMPLETED, atau TIMEOUT.');
}

function parsePaginationNumber(raw: unknown, fallback: number, options: { min?: number; max?: number } = {}): number {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(value)) return fallback;
    const min = options.min ?? 1;
    const max = options.max ?? Number.MAX_SAFE_INTEGER;
    return Math.max(min, Math.min(max, value));
}

function parseBooleanQueryParam(raw: unknown, fallback = false): boolean {
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (typeof raw === 'boolean') return raw;
    const value = String(raw).trim().toLowerCase();
    if (!value) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
    return fallback;
}

async function assertPacketItemAnalysisAccess(
    user: { id: number; role: string },
    packet: { authorId: number; subjectId: number },
) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'TEACHER') {
        if (packet.authorId === user.id) return;
        const hasAssignment = await prisma.teacherAssignment.count({
            where: {
                teacherId: user.id,
                subjectId: packet.subjectId,
            },
        });
        if (hasAssignment > 0) return;
        throw new ApiError(403, 'Anda tidak berhak melihat analisis butir untuk packet ini.');
    }

    if (user.role === 'EXAMINER' && packet.authorId === user.id) return;

    throw new ApiError(403, 'Akses analisis butir ditolak untuk role Anda.');
}

async function buildPacketItemAnalysis(
    packetId: number,
    options: { classId?: number; includeContentHtml?: boolean; user: { id: number; role: string } },
): Promise<PacketItemAnalysisResult> {
    const packet = await prisma.examPacket.findUnique({
        where: { id: packetId },
        include: {
            subject: { select: { id: true, name: true, code: true } },
            academicYear: { select: { id: true, name: true } },
            author: { select: { id: true, name: true } },
        },
    });

    if (!packet) {
        throw new ApiError(404, 'Packet ujian tidak ditemukan.');
    }

    await assertPacketItemAnalysisAccess(options.user, packet);

    const questionsRaw = normalizePacketQuestionsForAnalysis(packet.questions);
    const questionAccumulators: AnalysisQuestionAccumulator[] = questionsRaw.map((question, index) => {
        const questionId = String(question.id || `q-${index + 1}`);
        const type = normalizeQuestionTypeForAnalysis(question);
        const scoreWeight = normalizeOptionalNumber(question.score) || 1;
        const rawOptions = Array.isArray(question.options) ? question.options : [];
        const optionRows = rawOptions
            .map((option, optionIndex) => {
                const item = asRecord(option);
                if (!item) return null;
                const optionId = String(item.id || `${questionId}-opt-${optionIndex + 1}`);
                const labelSource = String(item.content || item.option_text || '').trim();
                const label = labelSource || `Opsi ${optionIndex + 1}`;
                return {
                    optionId,
                    label: label.length > 80 ? `${label.slice(0, 77)}...` : label,
                    isCorrect: Boolean(item.isCorrect),
                };
            })
            .filter((row): row is { optionId: string; label: string; isCorrect: boolean } => Boolean(row));
        const correctOptionIds = getCorrectOptionIds(question);
        const evaluable = type !== 'ESSAY' && correctOptionIds.length > 0;
        const contentHtml = normalizeQuestionContentHtml(question.content || question.question_text);
        const questionImageUrl = normalizeOptionalString(question.question_image_url, 2048) || null;
        const questionVideoUrl = normalizeOptionalString(question.question_video_url, 2048) || null;
        const questionVideoType = normalizeOptionalString(question.question_video_type, 20) || null;

        return {
            questionId,
            orderNumber: Number(question.order_number || index + 1),
            type,
            contentPreview: sanitizeQuestionContentPreview(question.content || question.question_text),
            contentHtml: options.includeContentHtml ? contentHtml : null,
            questionImageUrl,
            questionVideoUrl,
            questionVideoType,
            scoreWeight,
            optionRows,
            optionCounts: new Map(optionRows.map((row) => [row.optionId, 0])),
            correctOptionIds,
            evaluable,
            answeredCount: 0,
            unansweredCount: 0,
            correctCount: 0,
            incorrectCount: 0,
            correctnessBySessionId: new Map(),
        };
    });

    const scheduleWhere: Prisma.ExamScheduleWhereInput = {
        packetId: packet.id,
        ...(options.classId ? { classId: options.classId } : {}),
    };
    const [scheduleCount, sessions, inProgressCount] = await Promise.all([
        prisma.examSchedule.count({
            where: scheduleWhere,
        }),
        prisma.studentExamSession.findMany({
            where: {
                schedule: scheduleWhere,
                status: { in: ['COMPLETED', 'TIMEOUT'] },
            },
            select: {
                id: true,
                answers: true,
                score: true,
            },
        }),
        prisma.studentExamSession.count({
            where: {
                schedule: scheduleWhere,
                status: 'IN_PROGRESS',
            },
        }),
    ]);

    const sessionPointRows = sessions.map((session) => {
        const answersMap = parseSessionAnswers(session.answers);
        let totalObjectivePoints = 0;
        let earnedObjectivePoints = 0;

        questionAccumulators.forEach((item) => {
            const rawAnswer = answersMap[item.questionId];
            const selectedIds = normalizeSelectedOptionIds(rawAnswer);
            const answered = selectedIds.length > 0;

            if (answered) {
                item.answeredCount += 1;
            } else {
                item.unansweredCount += 1;
            }

            selectedIds.forEach((selectedId) => {
                if (!item.optionCounts.has(selectedId)) return;
                item.optionCounts.set(selectedId, (item.optionCounts.get(selectedId) || 0) + 1);
            });

            if (!item.evaluable) {
                item.correctnessBySessionId.set(session.id, null);
                return;
            }

            totalObjectivePoints += item.scoreWeight;

            const isCorrect = answered && setEquals(selectedIds, item.correctOptionIds);
            item.correctnessBySessionId.set(session.id, isCorrect);
            if (isCorrect) {
                item.correctCount += 1;
                earnedObjectivePoints += item.scoreWeight;
            } else if (answered) {
                item.incorrectCount += 1;
            }
        });

        const derivedScore =
            totalObjectivePoints > 0
                ? Number(((earnedObjectivePoints / totalObjectivePoints) * 100).toFixed(2))
                : typeof session.score === 'number'
                  ? Number(session.score.toFixed(2))
                  : 0;

        return {
            sessionId: session.id,
            score: derivedScore,
        };
    });

    const participantCount = sessions.length;
    const sortedByScore = [...sessionPointRows].sort((a, b) => b.score - a.score);
    const groupSize = participantCount <= 1 ? 0 : Math.max(1, Math.floor(participantCount * 0.27));
    const upperSessionIds = new Set(sortedByScore.slice(0, groupSize).map((item) => item.sessionId));
    const lowerSessionIds = new Set(
        sortedByScore.slice(Math.max(sortedByScore.length - groupSize, 0)).map((item) => item.sessionId),
    );

    const items: PacketQuestionAnalysisRow[] = questionAccumulators.map((item) => {
        const difficultyIndex = item.evaluable && participantCount > 0 ? toRounded(item.correctCount / participantCount) : null;
        const unansweredRate = participantCount > 0 ? Number((item.unansweredCount / participantCount).toFixed(4)) : 0;

        let discriminationIndex: number | null = null;
        if (item.evaluable && groupSize > 0) {
            let upperCorrect = 0;
            let lowerCorrect = 0;
            upperSessionIds.forEach((sessionId) => {
                if (item.correctnessBySessionId.get(sessionId) === true) {
                    upperCorrect += 1;
                }
            });
            lowerSessionIds.forEach((sessionId) => {
                if (item.correctnessBySessionId.get(sessionId) === true) {
                    lowerCorrect += 1;
                }
            });
            discriminationIndex = toRounded(upperCorrect / groupSize - lowerCorrect / groupSize);
        }

        const optionDistribution: QuestionOptionAnalysisRow[] = item.optionRows.map((row) => {
            const selectedCount = item.optionCounts.get(row.optionId) || 0;
            const selectedRate = item.answeredCount > 0 ? Number((selectedCount / item.answeredCount).toFixed(4)) : 0;
            return {
                optionId: row.optionId,
                label: row.label,
                isCorrect: row.isCorrect,
                selectedCount,
                selectedRate,
            };
        });

        return {
            questionId: item.questionId,
            orderNumber: item.orderNumber,
            type: item.type,
            contentPreview: item.contentPreview,
            contentHtml: item.contentHtml,
            questionImageUrl: item.questionImageUrl,
            questionVideoUrl: item.questionVideoUrl,
            questionVideoType: item.questionVideoType,
            scoreWeight: item.scoreWeight,
            answeredCount: item.answeredCount,
            unansweredCount: item.unansweredCount,
            unansweredRate,
            correctCount: item.evaluable ? item.correctCount : null,
            incorrectCount: item.evaluable ? item.incorrectCount : null,
            difficultyIndex,
            difficultyCategory: categorizeDifficulty(difficultyIndex),
            discriminationIndex,
            discriminationCategory: categorizeDiscrimination(discriminationIndex),
            optionDistribution,
        };
    });

    const scoreValues = sessionPointRows.map((row) => row.score);
    const averageScore =
        scoreValues.length > 0
            ? Number((scoreValues.reduce((acc, value) => acc + value, 0) / scoreValues.length).toFixed(2))
            : null;
    const highestScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;
    const lowestScore = scoreValues.length > 0 ? Math.min(...scoreValues) : null;

    return {
        packet: {
            id: packet.id,
            title: packet.title,
            type: packet.type,
            semester: packet.semester,
            subject: packet.subject,
            academicYear: packet.academicYear,
            author: packet.author,
        },
        summary: {
            generatedAt: new Date().toISOString(),
            classFilterId: options.classId || null,
            scheduleCount,
            participantCount,
            inProgressCount,
            totalQuestions: questionAccumulators.length,
            objectiveQuestions: questionAccumulators.filter((item) => item.type !== 'ESSAY').length,
            essayQuestions: questionAccumulators.filter((item) => item.type === 'ESSAY').length,
            averageScore,
            highestScore: highestScore === null ? null : Number(highestScore.toFixed(2)),
            lowestScore: lowestScore === null ? null : Number(lowestScore.toFixed(2)),
        },
        items,
    };
}

async function buildPacketSubmissions(
    packetId: number,
    options: {
        classId?: number;
        status?: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' | null;
        page: number;
        limit: number;
        user: { id: number; role: string };
    },
): Promise<PacketSubmissionsResult> {
    const packet = await prisma.examPacket.findUnique({
        where: { id: packetId },
        include: {
            subject: { select: { id: true, name: true, code: true } },
            academicYear: { select: { id: true, name: true } },
            author: { select: { id: true, name: true } },
        },
    });

    if (!packet) {
        throw new ApiError(404, 'Packet ujian tidak ditemukan.');
    }

    await assertPacketItemAnalysisAccess(options.user, packet);

    const scheduleWhere: Prisma.ExamScheduleWhereInput = {
        packetId: packet.id,
        ...(options.classId ? { classId: options.classId } : {}),
    };

    // Normalisasi data historis: sesi yang sudah punya submitTime tidak boleh tetap IN_PROGRESS.
    // Ini mencegah tampilan ambigu seperti "Berlangsung" namun sudah ada nilai/kumpul.
    await prisma.studentExamSession.updateMany({
        where: {
            schedule: scheduleWhere,
            status: 'IN_PROGRESS',
            submitTime: { not: null },
        },
        data: {
            status: 'COMPLETED',
        },
    });

    const sessionWhere: Prisma.StudentExamSessionWhereInput = {
        schedule: scheduleWhere,
        ...(options.status ? { status: options.status } : {}),
    };
    const scoredSessionWhere: Prisma.StudentExamSessionWhereInput = {
        schedule: scheduleWhere,
        status: { in: ['COMPLETED', 'TIMEOUT'] },
    };

    const [scheduleCount, sessionCount, participantGroups, statusGroups, scoreAggregate, sessions] = await Promise.all([
        prisma.examSchedule.count({
            where: scheduleWhere,
        }),
        prisma.studentExamSession.count({
            where: sessionWhere,
        }),
        prisma.studentExamSession.groupBy({
            by: ['studentId'],
            where: sessionWhere,
        }),
        prisma.studentExamSession.groupBy({
            by: ['status'],
            where: sessionWhere,
            _count: { _all: true },
        }),
        prisma.studentExamSession.aggregate({
            where: scoredSessionWhere,
            _avg: { score: true },
            _max: { score: true },
            _min: { score: true },
        }),
        prisma.studentExamSession.findMany({
            where: sessionWhere,
            include: {
                schedule: {
                    select: {
                        id: true,
                        class: { select: { id: true, name: true } },
                    },
                },
                student: {
                    select: {
                        id: true,
                        name: true,
                        nis: true,
                    },
                },
            },
            orderBy: [{ submitTime: 'desc' }, { startTime: 'desc' }],
            skip: (options.page - 1) * options.limit,
            take: options.limit,
        }),
    ]);

    const packetQuestions = normalizePacketQuestionsForAnalysis(packet.questions);
    const totalQuestions = packetQuestions.length;
    const objectiveQuestionCount = packetQuestions.filter((question) => {
        const type = normalizeQuestionTypeForAnalysis(question);
        return type !== 'ESSAY' && getCorrectOptionIds(question).length > 0;
    }).length;

    const sessionRows: PacketSubmissionSessionRow[] = sessions.map((session) => {
        const answersMap = parseSessionAnswers(session.answers);
        let answeredCount = 0;
        let objectiveCorrect = 0;
        let objectiveIncorrect = 0;

        packetQuestions.forEach((question, index) => {
            const questionId = String(question.id || `q-${index + 1}`);
            const rawAnswer = answersMap[questionId];

            if (isAnsweredForQuestion(question, rawAnswer)) {
                answeredCount += 1;
            }

            const correctness = evaluateQuestionCorrectness(question, rawAnswer);
            if (correctness === true) {
                objectiveCorrect += 1;
            } else if (correctness === false) {
                objectiveIncorrect += 1;
            }
        });

        const unansweredCount = Math.max(totalQuestions - answeredCount, 0);
        const completionRate = totalQuestions > 0 ? Number((answeredCount / totalQuestions).toFixed(4)) : 0;

        const monitoring = extractMonitoringSummaryFromAnswers(session.answers);
        const status =
            String(session.status || '').toUpperCase() === 'IN_PROGRESS' && session.submitTime
                ? 'COMPLETED'
                : session.status;

        const canShowScore = status === 'COMPLETED' || status === 'TIMEOUT';
        let score: number | null =
            canShowScore && typeof session.score === 'number' ? Number(session.score.toFixed(2)) : null;
        if (score === null && objectiveQuestionCount > 0 && canShowScore) {
            score = Number(((objectiveCorrect / objectiveQuestionCount) * 100).toFixed(2));
        }

        return {
            sessionId: session.id,
            scheduleId: session.scheduleId,
            class: session.schedule.class
                ? {
                      id: session.schedule.class.id,
                      name: session.schedule.class.name,
                  }
                : null,
            student: {
                id: session.student.id,
                name: session.student.name,
                nis: session.student.nis || null,
            },
            status,
            score,
            startTime: session.startTime.toISOString(),
            endTime: session.endTime ? session.endTime.toISOString() : null,
            submitTime: session.submitTime ? session.submitTime.toISOString() : null,
            answeredCount,
            unansweredCount,
            totalQuestions,
            completionRate,
            objectiveTotal: objectiveQuestionCount,
            objectiveCorrect,
            objectiveIncorrect,
            monitoring,
        };
    });

    const participantCount = participantGroups.length;
    const statusCountMap = new Map(statusGroups.map((group) => [String(group.status), group._count._all]));
    const submittedCount = (statusCountMap.get('COMPLETED') || 0) + (statusCountMap.get('TIMEOUT') || 0);
    const inProgressCount = statusCountMap.get('IN_PROGRESS') || 0;
    const averageScore =
        typeof scoreAggregate._avg.score === 'number' ? Number(scoreAggregate._avg.score.toFixed(2)) : null;
    const highestScore =
        typeof scoreAggregate._max.score === 'number' ? Number(scoreAggregate._max.score.toFixed(2)) : null;
    const lowestScore =
        typeof scoreAggregate._min.score === 'number' ? Number(scoreAggregate._min.score.toFixed(2)) : null;
    const totalPages = Math.max(1, Math.ceil(sessionCount / options.limit));

    return {
        packet: {
            id: packet.id,
            title: packet.title,
            type: packet.type,
            semester: packet.semester,
            subject: packet.subject,
            academicYear: packet.academicYear,
            author: packet.author,
        },
        summary: {
            generatedAt: new Date().toISOString(),
            classFilterId: options.classId || null,
            statusFilter: options.status || null,
            scheduleCount,
            sessionCount,
            page: options.page,
            limit: options.limit,
            totalPages,
            pageSessionCount: sessionRows.length,
            participantCount,
            submittedCount,
            inProgressCount,
            averageScore,
            highestScore,
            lowestScore,
        },
        sessions: sessionRows,
    };
}

async function buildSessionDetail(
    sessionId: number,
    options: { user: { id: number; role: string } },
): Promise<SessionDetailResult> {
    const session = await prisma.studentExamSession.findUnique({
        where: { id: sessionId },
        include: {
            student: {
                select: {
                    id: true,
                    name: true,
                    nis: true,
                    studentClass: { select: { id: true, name: true } },
                },
            },
            schedule: {
                include: {
                    class: { select: { id: true, name: true } },
                    packet: {
                        include: {
                            subject: { select: { id: true, name: true, code: true } },
                            academicYear: { select: { id: true, name: true } },
                        },
                    },
                },
            },
        },
    });

    if (!session?.schedule?.packet) {
        throw new ApiError(404, 'Detail sesi ujian tidak ditemukan.');
    }

    await assertPacketItemAnalysisAccess(options.user, {
        authorId: session.schedule.packet.authorId,
        subjectId: session.schedule.packet.subjectId,
    });

    const packet = session.schedule.packet;
    const questions = normalizePacketQuestionsForAnalysis(packet.questions);
    const answersMap = parseSessionAnswers(session.answers);

    let answeredCount = 0;
    let objectiveEvaluableCount = 0;
    let objectiveCorrectCount = 0;
    let objectiveIncorrectCount = 0;
    let essayCount = 0;

    const questionRows: SessionQuestionDetailRow[] = questions.map((question, index) => {
        const questionId = String(question.id || `q-${index + 1}`);
        const type = normalizeQuestionTypeForAnalysis(question);
        const rawAnswer = answersMap[questionId];
        const answerText = type === 'ESSAY' ? normalizeEssayAnswer(rawAnswer) : null;
        const selectedOptionIds = type === 'ESSAY' ? [] : normalizeSelectedOptionIds(rawAnswer);
        const answered = type === 'ESSAY' ? answerText !== null : selectedOptionIds.length > 0;
        if (answered) answeredCount += 1;

        const optionRows = (Array.isArray(question.options) ? question.options : [])
            .map((option, optionIndex) => {
                const optionRecord = asRecord(option);
                if (!optionRecord) return null;
                const optionId = String(optionRecord.id || `opt-${optionIndex + 1}`);
                const optionLabelSource = String(optionRecord.content || optionRecord.option_text || '').trim();
                const optionLabel = optionLabelSource || `Opsi ${optionIndex + 1}`;
                return {
                    optionId,
                    label: optionLabel.length > 120 ? `${optionLabel.slice(0, 117)}...` : optionLabel,
                };
            })
            .filter((item): item is { optionId: string; label: string } => Boolean(item));

        const optionLabelById = new Map(optionRows.map((item) => [item.optionId, item.label]));
        const correctOptionIds = type === 'ESSAY' ? [] : getCorrectOptionIds(question);
        const isCorrect = evaluateQuestionCorrectness(question, rawAnswer);
        const explanationSource = asRecord(question.questionCard)
            || asRecord(asRecord(question.metadata)?.questionCard);
        const explanation = normalizeOptionalString(explanationSource?.answerRationale, 2000) || null;

        if (type === 'ESSAY') {
            essayCount += 1;
        } else if (correctOptionIds.length > 0) {
            objectiveEvaluableCount += 1;
            if (isCorrect === true) objectiveCorrectCount += 1;
            if (isCorrect === false) objectiveIncorrectCount += 1;
        }

        return {
            questionId,
            orderNumber: Number(question.order_number || index + 1),
            type,
            contentPreview: sanitizeQuestionContentPreview(question.content || question.question_text),
            scoreWeight: normalizeOptionalNumber(question.score) || 1,
            answered,
            answerText,
            selectedOptionIds,
            selectedOptionLabels: selectedOptionIds.map((optionId) => optionLabelById.get(optionId) || optionId),
            correctOptionIds,
            correctOptionLabels: correctOptionIds.map((optionId) => optionLabelById.get(optionId) || optionId),
            isCorrect,
            explanation,
        };
    });

    const totalQuestions = questionRows.length;
    const unansweredCount = Math.max(totalQuestions - answeredCount, 0);
    const completionRate = totalQuestions > 0 ? Number((answeredCount / totalQuestions).toFixed(4)) : 0;

    return {
        packet: {
            id: packet.id,
            title: packet.title,
            type: packet.type,
            semester: packet.semester,
            subject: packet.subject,
            academicYear: packet.academicYear,
        },
        session: {
            id: session.id,
            status: session.status,
            score: typeof session.score === 'number' ? Number(session.score.toFixed(2)) : null,
            startTime: session.startTime.toISOString(),
            submitTime: session.submitTime ? session.submitTime.toISOString() : null,
            monitoring: extractMonitoringSummaryFromAnswers(session.answers),
            schedule: {
                id: session.schedule.id,
                startTime: session.schedule.startTime.toISOString(),
                endTime: session.schedule.endTime.toISOString(),
                class: session.schedule.class
                    ? {
                          id: session.schedule.class.id,
                          name: session.schedule.class.name,
                      }
                    : null,
            },
            student: {
                id: session.student.id,
                name: session.student.name,
                nis: session.student.nis || null,
                class: session.student.studentClass
                    ? {
                          id: session.student.studentClass.id,
                          name: session.student.studentClass.name,
                      }
                    : null,
            },
        },
        summary: {
            totalQuestions,
            answeredCount,
            unansweredCount,
            completionRate,
            objectiveEvaluableCount,
            objectiveCorrectCount,
            objectiveIncorrectCount,
            essayCount,
        },
        questions: questionRows,
    };
}

// ==========================================
// Exam Packet Management
// ==========================================

export const getPackets = asyncHandler(async (req: Request, res: Response) => {
    const { type, subjectId, academicYearId, semester, programCode } = req.query;
    const authUser = (req as any).user as { id?: number; role?: string } | undefined;
    const authUserId = Number(authUser?.id || 0);
    const authRole = String(authUser?.role || '')
        .trim()
        .toUpperCase();

    const andFilters: Prisma.ExamPacketWhereInput[] = [];

    if (type) {
        const normalizedTypeCode = normalizeProgramCode(type);
        const normalizedPacketType = tryNormalizePacketType(type);

        if (normalizedPacketType && normalizedTypeCode) {
            andFilters.push({
                OR: [{ type: normalizedPacketType }, { programCode: normalizedTypeCode }],
            });
        } else if (normalizedPacketType) {
            andFilters.push({ type: normalizedPacketType });
        } else if (normalizedTypeCode) {
            andFilters.push({ programCode: normalizedTypeCode });
        } else {
            throw new ApiError(400, 'Filter tipe/program ujian tidak valid.');
        }
    }

    if (subjectId) andFilters.push({ subjectId: parseInt(subjectId as string) });
    if (academicYearId) andFilters.push({ academicYearId: parseInt(academicYearId as string) });
    if (semester) andFilters.push({ semester: normalizePacketSemester(semester) });
    if (programCode) {
        const normalizedProgramCode = normalizeProgramCode(programCode);
        if (!normalizedProgramCode) {
            throw new ApiError(400, 'Filter program ujian tidak valid.');
        }
        andFilters.push({ programCode: normalizedProgramCode });
    }

    if (authRole === 'TEACHER' && authUserId > 0) {
        const teacherProfile = await prisma.user.findUnique({
            where: { id: authUserId },
            select: { additionalDuties: true },
        });
        const duties = (teacherProfile?.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());
        const canSeeAllPackets =
            duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');

        if (!canSeeAllPackets) {
            const assignmentWhere: Prisma.TeacherAssignmentWhereInput = {
                teacherId: authUserId,
            };
            if (academicYearId) {
                assignmentWhere.academicYearId = parseInt(academicYearId as string);
            }

            const assignments = await prisma.teacherAssignment.findMany({
                where: assignmentWhere,
                select: { subjectId: true },
            });
            const assignedSubjectIds = Array.from(
                new Set(
                    assignments
                        .map((item) => Number(item.subjectId))
                        .filter((item) => Number.isFinite(item) && item > 0),
                ),
            );

            andFilters.push({
                OR: [
                    { authorId: authUserId },
                    ...(assignedSubjectIds.length > 0 ? [{ subjectId: { in: assignedSubjectIds } }] : []),
                ],
            });
        }
    } else if (authRole === 'EXAMINER' && authUserId > 0) {
        andFilters.push({ authorId: authUserId });
    }

    // NOTE:
    // Hindari filter NOT + AND pada kolom nullable (description) karena nilai NULL
    // bisa ikut tersaring akibat SQL three-valued logic.
    // Yang ingin disembunyikan hanya paket auto-kurikulum TANPA jadwal.
    const orphanAutoPacketFilter: Prisma.ExamPacketWhereInput = {
        OR: [
            { description: null },
            { description: { not: AUTO_CURRICULUM_PACKET_DESCRIPTION } },
            { schedules: { some: {} } },
        ],
    };

    const where: Prisma.ExamPacketWhereInput =
        andFilters.length > 0 ? { AND: [...andFilters, orphanAutoPacketFilter] } : orphanAutoPacketFilter;

    const packets = await prisma.examPacket.findMany({
        where,
        include: {
            subject: true,
            author: { select: { name: true } },
            academicYear: true
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(new ApiResponse(200, packets));
});

export const getPacketById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const packet = await prisma.examPacket.findUnique({
        where: { id: parseInt(id) },
        include: {
            subject: true,
            author: { select: { name: true } },
            academicYear: true,
            schedules: true
        }
    });
    if (!packet) throw new ApiError(404, 'Exam packet not found');
    res.json(new ApiResponse(200, packet));
});

export const createPacket = asyncHandler(async (req: Request, res: Response) => {
    const {
        title,
        teacherAssignmentId,
        subjectId,
        academicYearId,
        type,
        programCode,
        semester,
        duration,
        description,
        questions,
        instructions,
        saveToBank,
        kkm,
        publishedQuestionCount,
    } = req.body;
    const user = (req as any).user;
    const normalizedAcademicYearId = parseInt(academicYearId);
    const normalizedSemester = normalizePacketSemester(semester);
    const resolvedProgram = await resolvePacketProgram({
        academicYearId: normalizedAcademicYearId,
        semester: normalizedSemester,
        programCode,
        legacyType: type,
    });
    const normalizedQuestions = normalizeQuestionsPayload(questions);
    const scopedAssignment = await resolvePacketAssignmentScope({
        teacherAssignmentId,
        academicYearId: normalizedAcademicYearId,
        authorId: Number(user.id),
        subjectId: Number(subjectId),
        programCode: resolvedProgram.programCode,
    });
    const normalizedSubjectId = scopedAssignment?.subjectId ?? Number(subjectId);
    if (!Number.isFinite(normalizedSubjectId) || normalizedSubjectId <= 0) {
        throw new ApiError(400, 'subjectId wajib diisi.');
    }
    const requestedKkm = Number(kkm);
    const assignmentKkm = Number(scopedAssignment?.kkm);
    const normalizedKkm =
        Number.isFinite(requestedKkm) && requestedKkm > 0
            ? requestedKkm
            : Number.isFinite(assignmentKkm) && assignmentKkm > 0
              ? assignmentKkm
              : 75;
    const normalizedPublishedQuestionCount = normalizePublishedQuestionCount(publishedQuestionCount);

    await assertPacketCreationScope({
        academicYearId: normalizedAcademicYearId,
        programCode: resolvedProgram.programCode,
        subjectId: normalizedSubjectId,
        authorId: Number(user.id),
    });

    const packet = await prisma.examPacket.create({
        data: {
            title,
            subjectId: normalizedSubjectId,
            academicYearId: normalizedAcademicYearId,
            type: resolvedProgram.baseType,
            programCode: resolvedProgram.programCode,
            semester: normalizedSemester,
            duration: parseInt(duration),
            description,
            instructions,
            kkm: normalizedKkm,
            publishedQuestionCount: normalizedPublishedQuestionCount,
            questions: normalizedQuestions || questions,
            authorId: user.id
        }
    });

    // Handle Save to Question Bank
    if (saveToBank && normalizedQuestions && normalizedQuestions.length > 0) {
        try {
            const saveResult = await saveQuestionsToBankWithDedup({
                bankTitle: `Bank Soal: ${title}`,
                subjectId: normalizedSubjectId,
                academicYearId: normalizedAcademicYearId,
                semester: normalizedSemester,
                authorId: Number(user.id),
                questions: normalizedQuestions,
            });
            if (saveResult.skippedInPayload > 0 || saveResult.skippedExisting > 0) {
                console.info(
                    `[QuestionBank] createPacket dedup => created=${saveResult.createdCount}, skippedInPayload=${saveResult.skippedInPayload}, skippedExisting=${saveResult.skippedExisting}`,
                );
            }
        } catch (error) {
            console.error('Failed to save questions to bank:', error);
            // Don't fail the request, just log error
        }
    }

    res.json(new ApiResponse(201, packet, 'Exam packet created successfully'));
});

export const updatePacket = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        title,
        teacherAssignmentId,
        subjectId,
        academicYearId,
        type,
        programCode,
        semester,
        duration,
        description,
        questions,
        instructions,
        saveToBank,
        kkm,
        publishedQuestionCount,
    } = req.body;

    const packetId = parseInt(id);
    const existingPacket = await prisma.examPacket.findUnique({
        where: { id: packetId },
        select: {
            id: true,
            subjectId: true,
            academicYearId: true,
            semester: true,
            type: true,
            programCode: true,
        },
    });

    if (!existingPacket) {
        throw new ApiError(404, 'Exam packet not found');
    }

    const normalizedAcademicYearId = Number.isFinite(Number(academicYearId))
        ? parseInt(academicYearId)
        : existingPacket.academicYearId;
    const normalizedSubjectId = Number.isFinite(Number(subjectId))
        ? parseInt(subjectId)
        : existingPacket.subjectId;
    if (!Number.isFinite(normalizedSubjectId) || normalizedSubjectId <= 0) {
        throw new ApiError(400, 'subjectId wajib diisi.');
    }
    const normalizedSemester = normalizePacketSemester(semester || existingPacket.semester);
    const resolvedProgram = await resolvePacketProgram({
        academicYearId: normalizedAcademicYearId,
        semester: normalizedSemester,
        programCode: programCode ?? existingPacket.programCode,
        legacyType: type ?? existingPacket.type,
        currentProgramCode: existingPacket.programCode,
    });
    const scopedAssignment = await resolvePacketAssignmentScope({
        teacherAssignmentId,
        academicYearId: normalizedAcademicYearId,
        authorId: Number((req as any).user.id),
        subjectId: normalizedSubjectId,
        programCode: resolvedProgram.programCode,
    });
    const effectiveSubjectId = scopedAssignment?.subjectId ?? normalizedSubjectId;
    if (!Number.isFinite(effectiveSubjectId) || effectiveSubjectId <= 0) {
        throw new ApiError(400, 'subjectId wajib diisi.');
    }
    const normalizedQuestions = normalizeQuestionsPayload(questions);
    const normalizedPublishedQuestionCount =
        publishedQuestionCount === undefined
            ? undefined
            : normalizePublishedQuestionCount(publishedQuestionCount);

    await assertPacketCreationScope({
        academicYearId: normalizedAcademicYearId,
        programCode: resolvedProgram.programCode,
        subjectId: effectiveSubjectId,
        authorId: Number((req as any).user.id),
    });

    const packet = await prisma.examPacket.update({
        where: { id: packetId },
        data: {
            title,
            subjectId: effectiveSubjectId,
            academicYearId: normalizedAcademicYearId,
            type: resolvedProgram.baseType,
            programCode: resolvedProgram.programCode,
            semester: normalizedSemester,
            duration: parseInt(duration),
            description,
            instructions,
            kkm: kkm ? parseFloat(kkm) : undefined,
            publishedQuestionCount: normalizedPublishedQuestionCount,
            questions: normalizedQuestions || questions
        }
    });

    const consolidation = await consolidateSessionSiblingSchedulesForPacket(packetId);
    if (consolidation.mergedPacketIds.length > 0) {
        consolidation.mergedPacketIds.forEach((mergedPacketId) => {
            invalidateStartExamScheduleCacheByPacket(mergedPacketId);
            invalidatePacketItemAnalysisCacheByPacket(mergedPacketId);
            invalidatePacketSubmissionsCacheByPacket(mergedPacketId);
        });
        consolidation.movedScheduleIds.forEach((scheduleId) => {
            invalidateStartExamScheduleCache(scheduleId);
        });
    }

    // Handle Save to Question Bank
    if (saveToBank && normalizedQuestions && normalizedQuestions.length > 0) {
        try {
            const saveResult = await saveQuestionsToBankWithDedup({
                bankTitle: `Bank Soal: ${title} (Copy)`,
                subjectId: effectiveSubjectId,
                academicYearId: normalizedAcademicYearId,
                semester: normalizedSemester,
                authorId: Number((req as any).user.id),
                questions: normalizedQuestions,
            });
            if (saveResult.skippedInPayload > 0 || saveResult.skippedExisting > 0) {
                console.info(
                    `[QuestionBank] updatePacket dedup => created=${saveResult.createdCount}, skippedInPayload=${saveResult.skippedInPayload}, skippedExisting=${saveResult.skippedExisting}`,
                );
            }
        } catch (error) {
            console.error('Failed to save questions to bank during update:', error);
        }
    }

    invalidateStartExamScheduleCacheByPacket(packetId);
    invalidatePacketItemAnalysisCacheByPacket(packetId);
    invalidatePacketSubmissionsCacheByPacket(packetId);
    res.json(new ApiResponse(200, packet, 'Exam packet updated successfully'));
});

export const deletePacket = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const packetId = parseInt(id, 10);
    await prisma.examPacket.delete({ where: { id: packetId } });
    invalidateStartExamScheduleCacheByPacket(packetId);
    res.json(new ApiResponse(200, null, 'Exam packet deleted successfully'));
});

export const getPacketItemAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const packetId = Number(req.params.id);
    if (!Number.isFinite(packetId) || packetId <= 0) {
        throw new ApiError(400, 'ID packet tidak valid.');
    }

    const classIdRaw = req.query.classId;
    const classId = classIdRaw ? Number(classIdRaw) : undefined;
    if (classIdRaw && (!Number.isFinite(classId) || classId! <= 0)) {
        throw new ApiError(400, 'classId tidak valid.');
    }

    const user = (req as any).user as { id: number; role: string };
    const includeContentHtml = parseBooleanQueryParam(req.query.includeContentHtml, false);
    const cacheKey = buildPacketItemAnalysisCacheKey(packetId, classId, includeContentHtml);
    const cachedAnalysis = getCachedPacketItemAnalysis(cacheKey);
    if (cachedAnalysis) {
        await assertPacketItemAnalysisAccess(user, {
            authorId: cachedAnalysis.payload.packet.author.id,
            subjectId: cachedAnalysis.payload.packet.subject.id,
        });
        res.setHeader('ETag', cachedAnalysis.etag);
        if (isEtagMatch(req, cachedAnalysis.etag)) {
            return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'private, max-age=30');
        return res.json(new ApiResponse(200, cachedAnalysis.payload, 'Analisis butir soal berhasil diambil.'));
    }

    const analysis = await getOrCreatePacketItemAnalysisInFlight(cacheKey, () =>
        buildPacketItemAnalysis(packetId, { classId, includeContentHtml, user }),
    );
    setCachedPacketItemAnalysis(cacheKey, analysis);
    const freshCached = getCachedPacketItemAnalysis(cacheKey);
    if (freshCached) {
        res.setHeader('ETag', freshCached.etag);
        if (isEtagMatch(req, freshCached.etag)) {
            return res.status(304).end();
        }
    }
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(new ApiResponse(200, analysis, 'Analisis butir soal berhasil diambil.'));
});

export const getPacketSubmissions = asyncHandler(async (req: Request, res: Response) => {
    const packetId = Number(req.params.id);
    if (!Number.isFinite(packetId) || packetId <= 0) {
        throw new ApiError(400, 'ID packet tidak valid.');
    }

    const classIdRaw = req.query.classId;
    const classId = classIdRaw ? Number(classIdRaw) : undefined;
    if (classIdRaw && (!Number.isFinite(classId) || classId! <= 0)) {
        throw new ApiError(400, 'classId tidak valid.');
    }

    const status = parseStatusFilter(req.query.status);
    const page = parsePaginationNumber(req.query.page, 1, { min: 1, max: 10_000 });
    const limit = parsePaginationNumber(req.query.limit, 50, { min: 1, max: 200 });
    const user = (req as any).user as { id: number; role: string };
    const cacheKey = buildPacketSubmissionsCacheKey(packetId, classId, status, page, limit);
    const cachedSubmissions = getCachedPacketSubmissions(cacheKey);
    if (cachedSubmissions) {
        await assertPacketItemAnalysisAccess(user, {
            authorId: cachedSubmissions.payload.packet.author.id,
            subjectId: cachedSubmissions.payload.packet.subject.id,
        });
        res.setHeader('ETag', cachedSubmissions.etag);
        if (isEtagMatch(req, cachedSubmissions.etag)) {
            return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'private, max-age=10');
        return res.json(new ApiResponse(200, cachedSubmissions.payload, 'Daftar submission ujian berhasil diambil.'));
    }

    const submissions = await getOrCreatePacketSubmissionsInFlight(cacheKey, () =>
        buildPacketSubmissions(packetId, { classId, status, page, limit, user }),
    );
    setCachedPacketSubmissions(cacheKey, submissions);
    const freshCached = getCachedPacketSubmissions(cacheKey);
    if (freshCached) {
        res.setHeader('ETag', freshCached.etag);
        if (isEtagMatch(req, freshCached.etag)) {
            return res.status(304).end();
        }
    }
    res.setHeader('Cache-Control', 'private, max-age=10');
    res.json(new ApiResponse(200, submissions, 'Daftar submission ujian berhasil diambil.'));
});

export const getSessionDetail = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
        throw new ApiError(400, 'ID session tidak valid.');
    }

    const user = (req as any).user as { id: number; role: string };
    const cacheKey = buildSessionDetailCacheKey(sessionId, user);
    const cachedDetail = getCachedSessionDetail(cacheKey);
    if (cachedDetail) {
        res.setHeader('ETag', cachedDetail.etag);
        if (isEtagMatch(req, cachedDetail.etag)) {
            return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'private, max-age=5');
        return res.json(new ApiResponse(200, cachedDetail.payload, 'Detail jawaban sesi berhasil diambil.'));
    }

    const detail = await getOrCreateSessionDetailInFlight(cacheKey, () =>
        buildSessionDetail(sessionId, { user }),
    );
    setCachedSessionDetail(cacheKey, detail);
    const freshCached = getCachedSessionDetail(cacheKey);
    if (freshCached) {
        res.setHeader('ETag', freshCached.etag);
        if (isEtagMatch(req, freshCached.etag)) {
            return res.status(304).end();
        }
    }
    res.setHeader('Cache-Control', 'private, max-age=5');
    res.json(new ApiResponse(200, detail, 'Detail jawaban sesi berhasil diambil.'));
});

export const updateSessionScore = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
        throw new ApiError(400, 'ID session tidak valid.');
    }

    const rawScore = req.body?.score;
    const parsedScore = typeof rawScore === 'number' ? rawScore : Number.parseFloat(String(rawScore ?? '').trim());
    if (!Number.isFinite(parsedScore)) {
        throw new ApiError(400, 'Nilai wajib berupa angka.');
    }

    const normalizedScore = Math.round(parsedScore * 100) / 100;
    if (normalizedScore < 0 || normalizedScore > 100) {
        throw new ApiError(400, 'Nilai harus di antara 0 sampai 100.');
    }

    const user = (req as any).user as { id: number; role: string };
    const session = await prisma.studentExamSession.findUnique({
        where: { id: sessionId },
        include: {
            student: { select: { id: true } },
            schedule: {
                include: {
                    packet: {
                        select: {
                            id: true,
                            authorId: true,
                            subjectId: true,
                            academicYearId: true,
                            semester: true,
                            type: true,
                            programCode: true,
                        },
                    },
                },
            },
        },
    });

    if (!session?.schedule?.packet) {
        throw new ApiError(404, 'Sesi ujian tidak ditemukan.');
    }

    await assertPacketItemAnalysisAccess(user, {
        authorId: session.schedule.packet.authorId,
        subjectId: session.schedule.packet.subjectId,
    });

    const normalizedStatus = String(session.status || '').toUpperCase();
    if (!['COMPLETED', 'TIMEOUT'].includes(normalizedStatus)) {
        throw new ApiError(400, 'Nilai manual hanya bisa diubah pada sesi yang sudah selesai/timeout.');
    }

    const updatedSession = await prisma.studentExamSession.update({
        where: { id: session.id },
        data: { score: normalizedScore },
        select: {
            id: true,
            score: true,
            status: true,
            updatedAt: true,
        },
    });

    invalidateSessionDetailCacheBySession(session.id);
    invalidatePacketSubmissionsCacheByPacket(session.schedule.packet.id);
    invalidatePacketItemAnalysisCacheByPacket(session.schedule.packet.id);

    try {
        await upsertScoreEntryFromExamSession({
            sessionId: session.id,
            studentId: session.student.id,
            subjectId: session.schedule.packet.subjectId,
            academicYearId: session.schedule.packet.academicYearId,
            semester: session.schedule.packet.semester,
            examType: session.schedule.packet.type,
            programCode: session.schedule.packet.programCode || null,
            score: normalizedScore,
        });
    } catch (scoreEntryError) {
        console.error('Failed to upsert score entry from manual exam score update:', scoreEntryError);
    }

    try {
        await syncReportGrade(
            session.student.id,
            session.schedule.packet.subjectId,
            session.schedule.packet.academicYearId,
            session.schedule.packet.semester,
        );
    } catch (syncError) {
        console.error('Failed to sync report grade from manual exam score update:', syncError);
    }

    res.json(
        new ApiResponse(
            200,
            {
                sessionId: updatedSession.id,
                score: typeof updatedSession.score === 'number' ? Number(updatedSession.score.toFixed(2)) : null,
                status: updatedSession.status,
                updatedAt: updatedSession.updatedAt.toISOString(),
            },
            'Nilai sesi ujian berhasil diperbarui.',
        ),
    );
});

export const syncPacketItemAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const packetId = Number(req.params.id);
    if (!Number.isFinite(packetId) || packetId <= 0) {
        throw new ApiError(400, 'ID packet tidak valid.');
    }

    const classIdRaw = req.query.classId;
    const classId = classIdRaw ? Number(classIdRaw) : undefined;
    if (classIdRaw && (!Number.isFinite(classId) || classId! <= 0)) {
        throw new ApiError(400, 'classId tidak valid.');
    }

    const user = (req as any).user as { id: number; role: string };
    const analysis = await buildPacketItemAnalysis(packetId, { classId, includeContentHtml: false, user });

    const packet = await prisma.examPacket.findUnique({
        where: { id: packetId },
        select: { id: true, questions: true },
    });
    if (!packet) {
        throw new ApiError(404, 'Packet ujian tidak ditemukan.');
    }

    const questions = normalizePacketQuestionsForAnalysis(packet.questions);
    const itemAnalysisByQuestionId = new Map(
        analysis.items.map((item) => [
            item.questionId,
            {
                difficultyIndex: item.difficultyIndex,
                discriminationIndex: item.discriminationIndex,
                unansweredRate: item.unansweredRate,
                sampleSize: analysis.summary.participantCount,
                generatedAt: analysis.summary.generatedAt,
                optionDistribution: item.optionDistribution.reduce<Record<string, number>>((acc, row) => {
                    acc[row.optionId] = row.selectedCount;
                    return acc;
                }, {}),
            },
        ]),
    );

    const updatedQuestions = questions.map((question, index) => {
        const questionId = String(question.id || `q-${index + 1}`);
        const itemAnalysis = itemAnalysisByQuestionId.get(questionId);
        if (!itemAnalysis) return question;

        const metadataSource = asRecord(question.metadata) || {};
        return {
            ...question,
            itemAnalysis,
            metadata: {
                ...metadataSource,
                itemAnalysis,
            },
        };
    });

    await prisma.examPacket.update({
        where: { id: packet.id },
        data: {
            questions: updatedQuestions as Prisma.InputJsonValue,
        },
    });

    invalidatePacketItemAnalysisCacheByPacket(packetId);
    res.json(new ApiResponse(200, analysis, 'Analisis butir berhasil disimpan ke packet ujian.'));
});

// ==========================================
// Question Management
// ==========================================

export const getQuestions = asyncHandler(async (req: Request, res: Response) => {
    const { 
        page = 1, 
        limit = 20, 
        search, 
        type, 
        subjectId, 
        academicYearId, 
        semester 
    } = req.query;

    const user = (req as any).user;
    
    // Base Where Clause
    const where: any = {};

    // Filter by Type
    if (type) {
        where.type = type;
    }

    // Filter by Content (Search)
    if (search) {
        where.content = { contains: search as string, mode: 'insensitive' };
    }

    // Bank Filters
    const bankWhere: any = {};

    if (academicYearId) {
        bankWhere.academicYearId = parseInt(academicYearId as string);
    }

    if (semester) {
        bankWhere.semester = semester;
    }

    // Role-Based Filtering
    if (user.role === 'TEACHER') {
        // Get teacher assignments to filter subjects
        // We fetch assignments from ALL academic years to ensure teachers can see their questions from previous years
        const assignments = await prisma.teacherAssignment.findMany({
            where: { teacherId: user.id },
            select: { subjectId: true }
        });

        const assignedSubjectIds = assignments.map(a => a.subjectId);

        // If teacher has NO assignments, they see NOTHING
        if (assignedSubjectIds.length === 0) {
            return res.json(new ApiResponse(200, {
                questions: [],
                meta: {
                    page: Number(page),
                    limit: Number(limit),
                    total: 0,
                    totalPages: 0
                }
            }));
        }

        if (subjectId) {
            const requestedSubjectId = parseInt(subjectId as string);
            // Strict check: Teacher MUST be assigned to the requested subject
            if (!assignedSubjectIds.includes(requestedSubjectId)) {
                return res.json(new ApiResponse(200, {
                    questions: [],
                    meta: {
                        page: Number(page),
                        limit: Number(limit),
                        total: 0,
                        totalPages: 0
                    }
                }));
            }
            bankWhere.subjectId = requestedSubjectId;
        } else {
            // If no subject specified, limit to ALL assigned subjects
            bankWhere.subjectId = { in: assignedSubjectIds };
        }
    } else {
        // For ADMIN or others, just use the requested subjectId if present
        if (subjectId) {
            bankWhere.subjectId = parseInt(subjectId as string);
        }
    }

    // Attach bank filters to main where clause
    // Ensure we always filter by bank if bankWhere has keys OR if we are forcing subject filtering
    if (Object.keys(bankWhere).length > 0) {
        where.bank = bankWhere;
    }

    // Pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute Query
    const [questions, total] = await Promise.all([
        prisma.question.findMany({
            where,
            include: { 
                bank: {
                    include: {
                        subject: true,
                        academicYear: true,
                        author: { select: { name: true, username: true } } // Include author info
                    }
                } 
            },
            orderBy: { id: 'desc' },
            skip,
            take: limitNum
        }),
        prisma.question.count({ where })
    ]);

    res.json(new ApiResponse(200, {
        questions,
        meta: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    }));
});

// ==========================================
// Schedule Management
// ==========================================

export const getProgramSessions = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, programCode, examType, includeInactive } = req.query;
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        throw new ApiError(400, 'academicYearId tidak valid.');
    }

    const resolvedProgramCode = await resolveCanonicalProgramCode({
        academicYearId: parsedAcademicYearId,
        rawProgramCode: programCode,
        rawExamType: examType,
    });
    if (!resolvedProgramCode) {
        throw new ApiError(400, 'programCode wajib diisi.');
    }
    if (isNonScheduledExamProgramCode(resolvedProgramCode)) {
        throw new ApiError(400, 'Program UH/Formatif tidak menggunakan sesi terjadwal.');
    }

    await backfillProgramSessionsFromExistingRows({
        academicYearId: parsedAcademicYearId,
        programCode: resolvedProgramCode,
    });

    const includeInactiveFlag =
        typeof includeInactive === 'string'
            ? ['true', '1', 'yes', 'on'].includes(includeInactive.toLowerCase())
            : Boolean(includeInactive);

    const sessions = await prisma.examProgramSession.findMany({
        where: {
            academicYearId: parsedAcademicYearId,
            programCode: resolvedProgramCode,
            ...(includeInactiveFlag ? {} : { isActive: true }),
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: {
            id: true,
            label: true,
            displayOrder: true,
            isActive: true,
            programCode: true,
            academicYearId: true,
        },
    });

    res.json(
        new ApiResponse(200, {
            academicYearId: parsedAcademicYearId,
            programCode: resolvedProgramCode,
            sessions,
        }),
    );
});

export const createProgramSession = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, programCode, examType, label, displayOrder } = req.body;
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        throw new ApiError(400, 'academicYearId tidak valid.');
    }

    const resolvedProgramCode = await resolveCanonicalProgramCode({
        academicYearId: parsedAcademicYearId,
        rawProgramCode: programCode,
        rawExamType: examType,
    });
    if (!resolvedProgramCode) {
        throw new ApiError(400, 'programCode wajib diisi.');
    }
    if (isNonScheduledExamProgramCode(resolvedProgramCode)) {
        throw new ApiError(400, 'Program UH/Formatif tidak menggunakan sesi terjadwal.');
    }

    const normalizedLabel = normalizeOptionalSessionLabel(label);
    const normalizedLabelKey = normalizeSessionLabelKey(label);
    if (!normalizedLabel || !normalizedLabelKey) {
        throw new ApiError(400, 'Label sesi wajib diisi.');
    }

    const requestedDisplayOrder =
        displayOrder === undefined || displayOrder === null || String(displayOrder).trim() === ''
            ? null
            : Number(displayOrder);
    if (
        requestedDisplayOrder !== null &&
        (!Number.isFinite(requestedDisplayOrder) || requestedDisplayOrder < 0)
    ) {
        throw new ApiError(400, 'displayOrder tidak valid.');
    }

    const maxDisplayOrder = await prisma.examProgramSession.aggregate({
        where: {
            academicYearId: parsedAcademicYearId,
            programCode: resolvedProgramCode,
        },
        _max: { displayOrder: true },
    });

    const created = await prisma.examProgramSession.upsert({
        where: {
            academicYearId_programCode_normalizedLabel: {
                academicYearId: parsedAcademicYearId,
                programCode: resolvedProgramCode,
                normalizedLabel: normalizedLabelKey,
            },
        },
        create: {
            academicYearId: parsedAcademicYearId,
            programCode: resolvedProgramCode,
            label: normalizedLabel,
            normalizedLabel: normalizedLabelKey,
            displayOrder: requestedDisplayOrder ?? (maxDisplayOrder._max.displayOrder ?? 0) + 1,
            isActive: true,
        },
        update: {
            label: normalizedLabel,
            normalizedLabel: normalizedLabelKey,
            displayOrder: requestedDisplayOrder ?? undefined,
            isActive: true,
        },
        select: {
            id: true,
            academicYearId: true,
            programCode: true,
            label: true,
            displayOrder: true,
            isActive: true,
        },
    });

    res.json(new ApiResponse(201, created, 'Sesi ujian berhasil disimpan.'));
});

export const getSchedules = asyncHandler(async (req: Request, res: Response) => {
    const { classId, academicYearId, examType, programCode, packetId, sessionLabel, sessionId, vacancyId } = req.query;
    const where: Prisma.ExamScheduleWhereInput = {};

    if (classId) {
        where.classId = Number(classId);
    }
    if (academicYearId) {
        where.academicYearId = Number(academicYearId);
    }
    if (vacancyId !== undefined && vacancyId !== null && String(vacancyId).trim() !== '') {
        const parsedVacancyId = Number(vacancyId);
        if (!Number.isFinite(parsedVacancyId) || parsedVacancyId <= 0) {
            throw new ApiError(400, 'vacancyId tidak valid.');
        }
        where.jobVacancyId = parsedVacancyId;
    }
    const hasPacketId = packetId !== undefined && packetId !== null && String(packetId).trim() !== '';
    if (hasPacketId) {
        const parsedPacketId = Number(packetId);
        if (!Number.isFinite(parsedPacketId) || parsedPacketId <= 0) {
            throw new ApiError(400, 'packetId tidak valid.');
        }
        where.packetId = parsedPacketId;
    }

    const normalizedProgramCode = normalizeProgramCode(programCode || examType);
    if (normalizedProgramCode && !hasPacketId) {
        const orFilters: Prisma.ExamScheduleWhereInput[] = [
            { examType: normalizedProgramCode },
            { packet: { is: { programCode: normalizedProgramCode } } },
        ];

        const normalizedPacketType = tryNormalizePacketType(normalizedProgramCode);
        if (normalizedPacketType) {
            orFilters.push({ packet: { is: { type: normalizedPacketType } } });
        }

        where.OR = orFilters;
    }

    const parsedSessionId =
        sessionId === undefined || sessionId === null || String(sessionId).trim() === ''
            ? null
            : Number(sessionId);
    if (parsedSessionId !== null) {
        if (!Number.isFinite(parsedSessionId) || parsedSessionId <= 0) {
            throw new ApiError(400, 'sessionId tidak valid.');
        }
        where.sessionId = parsedSessionId;
    } else {
        const normalizedSessionLabel = normalizeOptionalSessionLabel(sessionLabel);
        if (normalizedSessionLabel) {
            where.sessionLabel = normalizedSessionLabel;
        }
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        include: {
            class: true,
            packet: {
                select: {
                    id: true,
                    title: true,
                    type: true,
                    programCode: true,
                    duration: true,
                    semester: true,
                    subjectId: true,
                    academicYearId: true,
                    subject: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            },
            academicYear: {
                select: {
                    id: true,
                    name: true,
                    isActive: true,
                },
            },
            subject: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            proctor: { select: { id: true, name: true } },
            programSession: { select: { id: true, label: true, displayOrder: true } },
            jobVacancy: {
                select: {
                    id: true,
                    title: true,
                    companyName: true,
                    industryPartner: {
                        select: {
                            id: true,
                            name: true,
                            city: true,
                            sector: true,
                        },
                    },
                },
            },
        },
        orderBy: { startTime: 'desc' }
    });
    res.json(new ApiResponse(200, schedules));
});

export const createSchedule = asyncHandler(async (req: Request, res: Response) => {
    const {
        classId,
        classIds,
        packetId,
        startTime,
        endTime,
        date,
        proctorId,
        room,
        subjectId,
        academicYearId,
        semester,
        examType,
        programCode,
        sessionId,
        sessionLabel,
        jobVacancyId,
    } = req.body;
    const targetClassIds = classIds || (classId ? [classId] : []);
    const parsedJobVacancyId = resolveOptionalJobVacancyId(jobVacancyId);

    const normalizedStartTime = resolveScheduleDateTime({
        date,
        time: startTime,
        dateTime: startTime,
        fieldLabel: 'Waktu mulai',
    });
    const normalizedEndTime = resolveScheduleDateTime({
        date,
        time: endTime,
        dateTime: endTime,
        fieldLabel: 'Waktu selesai',
    });

    if (normalizedEndTime <= normalizedStartTime) {
        throw new ApiError(400, 'Waktu selesai harus setelah waktu mulai.');
    }

    const parsedProctorId =
        proctorId === undefined || proctorId === null || String(proctorId).trim() === ''
            ? null
            : Number(proctorId);

    let packet: {
        id: number;
        subjectId: number;
        academicYearId: number;
        semester: Semester;
        type: ExamType;
        programCode: string | null;
    } | null = null;
    if (packetId !== undefined && packetId !== null && String(packetId).trim() !== '') {
        const parsedPacketId = Number(packetId);
        if (!Number.isFinite(parsedPacketId) || parsedPacketId <= 0) {
            throw new ApiError(400, 'packetId tidak valid.');
        }
        packet = await prisma.examPacket.findUnique({
            where: { id: parsedPacketId },
            select: {
                id: true,
                subjectId: true,
                academicYearId: true,
                semester: true,
                type: true,
                programCode: true,
            },
        });
        if (!packet) {
            throw new ApiError(404, 'Exam packet not found');
        }
    }

    const fallbackAcademicYearId = packet?.academicYearId ?? Number(academicYearId);
    if (!Number.isFinite(fallbackAcademicYearId) || fallbackAcademicYearId <= 0) {
        throw new ApiError(400, 'academicYearId wajib diisi.');
    }
    const fallbackSubjectId = packet?.subjectId ?? Number(subjectId);
    if (!Number.isFinite(fallbackSubjectId) || fallbackSubjectId <= 0) {
        throw new ApiError(400, 'subjectId wajib diisi.');
    }
    const normalizedSemester = packet?.semester ?? normalizeOptionalPacketSemester(semester);
    const normalizedExamType =
        packet?.programCode ||
        normalizeProgramCode(programCode || examType) ||
        packet?.type ||
        null;

    if (normalizedExamType && isNonScheduledExamProgramCode(normalizedExamType)) {
        throw new ApiError(
            400,
            'Program Ulangan Harian (UH/Formatif) tidak dijadwalkan dari menu Wakasek Kurikulum.',
        );
    }

    const scheduleScopeConfig = await resolveProgramScopeConfig({
        academicYearId: fallbackAcademicYearId,
        programCode: normalizedExamType,
    });
    const allowsCandidateScheduling = hasProgramTargetAudience(
        scheduleScopeConfig?.targetClassLevels,
        PROGRAM_TARGET_CANDIDATE,
    );
    const allowsBkkScheduling = hasProgramTargetAudience(
        scheduleScopeConfig?.targetClassLevels,
        PROGRAM_TARGET_BKK_APPLICANT,
    );

    if (targetClassIds.length === 0 && !allowsCandidateScheduling && !allowsBkkScheduling) {
        throw new ApiError(400, 'Class ID is required');
    }

    if (targetClassIds.length === 0 && !packet?.id) {
        throw new ApiError(
            400,
            'Jadwal tes non-kelas wajib memakai packet ujian yang sudah disiapkan.',
        );
    }

    if (parsedJobVacancyId && targetClassIds.length > 0) {
        throw new ApiError(400, 'Tes lowongan BKK tidak boleh dikaitkan ke kelas reguler.');
    }
    if (parsedJobVacancyId && !allowsBkkScheduling) {
        throw new ApiError(400, 'Program ujian ini belum ditandai untuk pelamar BKK.');
    }
    if (!parsedJobVacancyId && allowsBkkScheduling && targetClassIds.length === 0) {
        throw new ApiError(400, 'Tes BKK wajib dikaitkan ke lowongan.');
    }
    if (parsedJobVacancyId) {
        await assertBkkExamScheduleManagementAccess(req);
        const vacancy = await prisma.jobVacancy.findUnique({
            where: { id: parsedJobVacancyId },
            select: { id: true },
        });
        if (!vacancy) {
            throw new ApiError(404, 'Lowongan BKK tidak ditemukan.');
        }
    }

    const normalizedClassIds: number[] = Array.from(
        new Set<number>(
            (Array.isArray(targetClassIds) ? targetClassIds : [])
                .map((id: unknown) => Number(id))
                .filter((id): id is number => Number.isFinite(id) && id > 0),
        ),
    );

    if (normalizedClassIds.length === 0 && !allowsCandidateScheduling) {
        throw new ApiError(400, 'Class ID tidak valid.');
    }

    const assignmentRows =
        normalizedClassIds.length > 0
            ? await prisma.teacherAssignment.findMany({
                  where: {
                      academicYearId: fallbackAcademicYearId,
                      subjectId: fallbackSubjectId,
                      classId: { in: normalizedClassIds },
                  },
                  select: {
                      classId: true,
                      teacherId: true,
                      kkm: true,
                  },
              })
            : [];

    if (normalizedClassIds.length > 0) {
        // Ensure subject-class combination is valid based on active teacher assignment.
        // This avoids ambiguous schedules when the same subject is taught by different teachers.
        const assignmentClassIdSet = new Set(assignmentRows.map((row) => Number(row.classId)));
        const missingClassIds = normalizedClassIds.filter((classIdItem) => !assignmentClassIdSet.has(classIdItem));
        if (missingClassIds.length > 0) {
            const missingClasses = await prisma.class.findMany({
                where: { id: { in: missingClassIds } },
                select: { name: true },
            });
            const missingClassNames = missingClasses.map((item) => item.name).join(', ') || missingClassIds.join(', ');
            throw new ApiError(
                400,
                `Mapel ini belum punya assignment guru pada kelas: ${missingClassNames}. Atur assignment guru terlebih dahulu.`,
            );
        }

        await assertScheduleClassLevelScope({
            academicYearId: fallbackAcademicYearId,
            programCode: normalizedExamType,
            classIds: normalizedClassIds,
        });
    }

    const resolvedProgramSession = await resolveProgramSessionReference({
        academicYearId: fallbackAcademicYearId,
        rawProgramCode: normalizedExamType,
        rawExamType: normalizedExamType,
        sessionId,
        sessionLabel,
    });

    if (!packet) {
        const assignmentTeacherIds = Array.from(
            new Set(
                assignmentRows
                    .map((row) => Number(row.teacherId))
                    .filter((teacherIdItem) => Number.isFinite(teacherIdItem) && teacherIdItem > 0),
            ),
        );

        if (assignmentTeacherIds.length === 1) {
            const assignmentKkmValues = assignmentRows
                .map((row) => Number(row.kkm))
                .filter((value): value is number => Number.isFinite(value) && value > 0);
            let inferredPacketKkm = 75;
            if (assignmentKkmValues.length > 0) {
                const frequencies = new Map<number, number>();
                assignmentKkmValues.forEach((value) => {
                    frequencies.set(value, (frequencies.get(value) || 0) + 1);
                });
                const ranked = Array.from(frequencies.entries()).sort((left, right) => {
                    if (right[1] !== left[1]) return right[1] - left[1];
                    return right[0] - left[0];
                });
                inferredPacketKkm = ranked[0]?.[0] ?? 75;
            }

            const [subjectRow, resolvedProgram] = await Promise.all([
                prisma.subject.findUnique({
                    where: { id: fallbackSubjectId },
                    select: { name: true },
                }),
                resolvePacketProgram({
                    academicYearId: fallbackAcademicYearId,
                    semester: normalizedSemester,
                    programCode: normalizedExamType,
                    legacyType: normalizedExamType,
                }),
            ]);

            const reusablePacket = await findReusablePacketForSessionGroup({
                authorId: assignmentTeacherIds[0],
                subjectId: fallbackSubjectId,
                academicYearId: fallbackAcademicYearId,
                semester: normalizedSemester,
                programCode: resolvedProgram.programCode,
                startTime: normalizedStartTime,
            });

            if (reusablePacket) {
                packet = reusablePacket;
            } else {
                const durationMinutes = Math.max(
                    1,
                    Math.round((normalizedEndTime.getTime() - normalizedStartTime.getTime()) / 60000),
                );
                const programLabel = resolvedProgram.programCode || resolvedProgram.baseType;
                const subjectLabel = String(subjectRow?.name || 'Mata Pelajaran');
                const dateLabel = normalizedStartTime.toISOString().slice(0, 10);
                const autoTitle = `${programLabel} • ${subjectLabel} • ${dateLabel}`;

                const createdPacket = await prisma.examPacket.create({
                    data: {
                        title: autoTitle,
                        subjectId: fallbackSubjectId,
                        academicYearId: fallbackAcademicYearId,
                        semester: normalizedSemester,
                        type: resolvedProgram.baseType,
                        programCode: resolvedProgram.programCode,
                        duration: durationMinutes,
                        instructions: 'Draft otomatis dari jadwal kurikulum. Lengkapi butir soal sebelum ujian dimulai.',
                        description: AUTO_CURRICULUM_PACKET_DESCRIPTION,
                        questions: [],
                        kkm: inferredPacketKkm,
                        authorId: assignmentTeacherIds[0],
                    },
                    select: {
                        id: true,
                        subjectId: true,
                        academicYearId: true,
                        semester: true,
                        type: true,
                        programCode: true,
                    },
                });

                packet = createdPacket;
            }
        }
    }

    const createdSchedules = [];
    const scheduleTargets = normalizedClassIds.length > 0 ? normalizedClassIds : [null];

    for (const cId of scheduleTargets) {
        const schedule = await prisma.examSchedule.create({
            data: {
                classId: cId ?? undefined,
                packetId: packet?.id ?? null,
                subjectId: fallbackSubjectId,
                startTime: normalizedStartTime,
                endTime: normalizedEndTime,
                proctorId: parsedProctorId,
                academicYearId: fallbackAcademicYearId,
                semester: normalizedSemester,
                examType: normalizedExamType,
                room,
                jobVacancyId: parsedJobVacancyId,
                sessionId: resolvedProgramSession?.id ?? null,
                sessionLabel: resolvedProgramSession?.label ?? null,
            }
        });
        createdSchedules.push(schedule);
        invalidateStartExamScheduleCache(schedule.id);
    }

    if (packet?.id) {
        const consolidation = await consolidateSessionSiblingSchedulesForPacket(packet.id);
        if (consolidation.mergedPacketIds.length > 0) {
            consolidation.mergedPacketIds.forEach((mergedPacketId) => {
                invalidateStartExamScheduleCacheByPacket(mergedPacketId);
                invalidatePacketItemAnalysisCacheByPacket(mergedPacketId);
                invalidatePacketSubmissionsCacheByPacket(mergedPacketId);
            });
            consolidation.movedScheduleIds.forEach((scheduleId) => {
                invalidateStartExamScheduleCache(scheduleId);
            });
        }

        invalidatePacketItemAnalysisCacheByPacket(packet.id);
        invalidatePacketSubmissionsCacheByPacket(packet.id);
    }

    res.json(new ApiResponse(201, createdSchedules, 'Exam schedules created successfully'));
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { startTime, endTime, proctorId, room, isActive, sessionId, sessionLabel } = req.body;
    const scheduleId = parseInt(id, 10);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'id jadwal tidak valid.');
    }

    const existingSchedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        select: {
            id: true,
            jobVacancyId: true,
            academicYearId: true,
            examType: true,
            packet: {
                select: {
                    academicYearId: true,
                    programCode: true,
                    type: true,
                },
            },
        },
    });
    if (!existingSchedule) {
        throw new ApiError(404, 'Jadwal tidak ditemukan.');
    }
    if (existingSchedule.jobVacancyId) {
        await assertBkkExamScheduleManagementAccess(req);
    }

    const parsedProctorId =
        proctorId === undefined
            ? undefined
            : proctorId === null || String(proctorId).trim() === ''
              ? null
              : Number(proctorId);
    if (typeof parsedProctorId === 'number' && (!Number.isFinite(parsedProctorId) || parsedProctorId <= 0)) {
        throw new ApiError(400, 'proctorId tidak valid.');
    }

    const hasSessionPayload = sessionId !== undefined || sessionLabel !== undefined;
    const resolvedAcademicYearId =
        existingSchedule.packet?.academicYearId || existingSchedule.academicYearId || null;
    const resolvedProgramCode =
        existingSchedule.packet?.programCode || existingSchedule.examType || existingSchedule.packet?.type || null;

    const resolvedProgramSession =
        hasSessionPayload && resolvedAcademicYearId
            ? await resolveProgramSessionReference({
                  academicYearId: resolvedAcademicYearId,
                  rawProgramCode: resolvedProgramCode,
                  rawExamType: resolvedProgramCode,
                  sessionId,
                  sessionLabel,
              })
            : null;

    if (hasSessionPayload && !resolvedAcademicYearId) {
        throw new ApiError(400, 'Tahun ajaran jadwal tidak valid untuk sinkronisasi sesi.');
    }

    const schedule = await prisma.examSchedule.update({
        where: { id: scheduleId },
        data: {
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
            proctorId: parsedProctorId,
            room,
            isActive,
            sessionId: hasSessionPayload ? resolvedProgramSession?.id ?? null : undefined,
            sessionLabel: hasSessionPayload ? resolvedProgramSession?.label ?? null : undefined,
        }
    });
    invalidateStartExamScheduleCache(scheduleId);
    res.json(new ApiResponse(200, schedule, 'Exam schedule updated successfully'));
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const scheduleId = parseInt(id);

    // Check schedule and packet existence
    const schedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        include: { packet: true }
    });

    if (!schedule) {
        throw new ApiError(404, 'Jadwal tidak ditemukan');
    }
    if (schedule.jobVacancyId) {
        await assertBkkExamScheduleManagementAccess(req);
    }

    // Only block if packet exists AND has content AND has completed sessions
    // If packet is missing or has no questions, we allow cleanup of broken schedules
    if (schedule.packet) {
        const questions = schedule.packet.questions as any;
        const hasQuestions = questions && Array.isArray(questions) && questions.length > 0;

        if (hasQuestions) {
            const completedSessions = await prisma.studentExamSession.count({
                where: {
                    scheduleId,
                    status: 'COMPLETED'
                }
            });

            if (completedSessions > 0) {
                throw new ApiError(400, 'Tidak dapat menghapus jadwal yang sudah memiliki hasil ujian siswa.');
            }
        }
    }

    // Delete dependencies in transaction
    await prisma.$transaction(async (tx) => {
        // Delete sessions (in-progress or others)
        await tx.studentExamSession.deleteMany({
            where: { scheduleId }
        });

        // Delete proctoring reports
        await tx.examProctoringReport.deleteMany({
            where: { scheduleId }
        });

        // Delete schedule
        await tx.examSchedule.delete({
            where: { id: scheduleId }
        });
    });
    invalidateStartExamScheduleCache(scheduleId);

    if (schedule.packetId) {
        invalidatePacketItemAnalysisCacheByPacket(schedule.packetId);
        invalidatePacketSubmissionsCacheByPacket(schedule.packetId);
    }

    res.json(new ApiResponse(200, null, 'Exam schedule deleted successfully'));
});

// ==========================================
// Student Exam Access
// ==========================================

export const getAvailableExams = asyncHandler(async (req: Request, res: Response) => {
    const authUser = (req as Request & { user?: { id: number; role: string } }).user;
    const studentId = Number(authUser?.id || 0);
    const accessRole = resolveExamAccessRole(authUser?.role);
    if (!Number.isFinite(studentId) || studentId <= 0) {
        throw new ApiError(401, 'Sesi login tidak valid.');
    }

    const cachedPayload = getCachedAvailableExams(studentId);
    if (cachedPayload) {
        res.setHeader('Cache-Control', 'private, max-age=3');
        return res.json(new ApiResponse(200, cachedPayload));
    }

    const now = new Date();
    const scheduleSelect = {
        id: true,
        classId: true,
        jobVacancyId: true,
        subjectId: true,
        subject: {
            select: {
                id: true,
                name: true,
                code: true,
            },
        },
        packetId: true,
        startTime: true,
        endTime: true,
        sessionId: true,
        sessionLabel: true,
        isActive: true,
        room: true,
        examType: true,
        academicYearId: true,
        semester: true,
        jobVacancy: {
            select: {
                id: true,
                title: true,
                companyName: true,
                industryPartner: {
                    select: {
                        id: true,
                        name: true,
                        city: true,
                        sector: true,
                    },
                },
            },
        },
        packet: {
            select: {
                id: true,
                title: true,
                description: true,
                type: true,
                programCode: true,
                semester: true,
                duration: true,
                publishedQuestionCount: true,
                instructions: true,
                subjectId: true,
                academicYearId: true,
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        },
        sessions: {
            where: { studentId },
            select: {
                id: true,
                studentId: true,
                scheduleId: true,
                startTime: true,
                endTime: true,
                submitTime: true,
                status: true,
                score: true,
                updatedAt: true,
            },
        },
    } satisfies Prisma.ExamScheduleSelect;

    let studentClassId: number | null = null;
    let audienceProgramKeys: Set<string> | null = null;
    let schedules: Prisma.ExamScheduleGetPayload<{ select: typeof scheduleSelect }>[] = [];

    if (accessRole === 'STUDENT') {
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            select: { classId: true },
        });

        if (!student?.classId) {
            throw new ApiError(400, 'Student is not assigned to a class');
        }

        studentClassId = Number(student.classId);
        schedules = await prisma.examSchedule.findMany({
            where: {
                classId: student.classId,
                isActive: true,
            },
            select: scheduleSelect,
            orderBy: { startTime: 'asc' },
        });
    } else if (accessRole === 'CALON_SISWA') {
        const activeAcademicYear = await prisma.academicYear.findFirst({
            where: { isActive: true },
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        const audiencePrograms = await prisma.examProgramConfig.findMany({
            where: {
                isActive: true,
                targetClassLevels: { has: PROGRAM_TARGET_CANDIDATE },
                ...(activeAcademicYear?.id ? { academicYearId: activeAcademicYear.id } : {}),
            },
            select: {
                academicYearId: true,
                code: true,
            },
        });

        audienceProgramKeys = new Set(
            audiencePrograms.map(
                (item) => `${Number(item.academicYearId)}:${String(item.code || '').trim().toUpperCase()}`,
            ),
        );

        if (audiencePrograms.length > 0) {
            schedules = await prisma.examSchedule.findMany({
                where: {
                    isActive: true,
                    OR: audiencePrograms.map((item) => ({
                        academicYearId: Number(item.academicYearId),
                        OR: [{ examType: item.code }, { packet: { is: { programCode: item.code } } }],
                    })),
                },
                select: scheduleSelect,
                orderBy: { startTime: 'asc' },
            });
        }
    } else {
        const applicant = await prisma.user.findUnique({
            where: { id: studentId },
            select: {
                verificationStatus: true,
            },
        });

        if (!applicant) {
            throw new ApiError(404, 'Pelamar BKK tidak ditemukan.');
        }

        if (applicant.verificationStatus !== VerificationStatus.VERIFIED) {
            throw new ApiError(403, 'Akun pelamar BKK belum diverifikasi admin. Tunggu verifikasi sebelum mengikuti tes.');
        }

        const activeApplications = await prisma.jobApplication.findMany({
            where: {
                applicantId: studentId,
                status: {
                    notIn: [JobApplicationStatus.WITHDRAWN, JobApplicationStatus.REJECTED],
                },
            },
            select: {
                vacancyId: true,
            },
        });
        const vacancyIds = Array.from(
            new Set(
                activeApplications
                    .map((item) => Number(item.vacancyId))
                    .filter((item) => Number.isFinite(item) && item > 0),
            ),
        );

        if (vacancyIds.length > 0) {
            const academicYearIds = Array.from(
                new Set(
                    (
                        await prisma.jobVacancy.findMany({
                            where: {
                                id: { in: vacancyIds },
                                examSchedules: {
                                    some: {
                                        academicYearId: { not: null },
                                    },
                                },
                            },
                            select: {
                                examSchedules: {
                                    select: {
                                        academicYearId: true,
                                    },
                                },
                            },
                        })
                    )
                        .flatMap((item) => item.examSchedules)
                        .map((row) => Number(row.academicYearId))
                        .filter((item) => Number.isFinite(item) && item > 0),
                ),
            );

            const audiencePrograms = academicYearIds.length
                ? await prisma.examProgramConfig.findMany({
                      where: {
                          isActive: true,
                          academicYearId: { in: academicYearIds },
                          targetClassLevels: { has: PROGRAM_TARGET_BKK_APPLICANT },
                      },
                      select: {
                          academicYearId: true,
                          code: true,
                      },
                  })
                : [];

            audienceProgramKeys = new Set(
                audiencePrograms.map(
                    (item) => `${Number(item.academicYearId)}:${String(item.code || '').trim().toUpperCase()}`,
                ),
            );

            if (audiencePrograms.length > 0) {
                schedules = await prisma.examSchedule.findMany({
                    where: {
                        isActive: true,
                        jobVacancyId: { in: vacancyIds },
                        OR: audiencePrograms.map((item) => ({
                            academicYearId: Number(item.academicYearId),
                            OR: [{ examType: item.code }, { packet: { is: { programCode: item.code } } }],
                        })),
                    },
                    select: scheduleSelect,
                    orderBy: { startTime: 'asc' },
                });
            }
        }
    }

    const scheduleAcademicYearIds = Array.from(
        new Set(
            schedules
                .map((schedule) => Number(schedule.academicYearId))
                .filter((academicYearId) => Number.isFinite(academicYearId) && academicYearId > 0),
        ),
    );

    const studentSittingAssignments =
        accessRole === 'STUDENT' && scheduleAcademicYearIds.length > 0
            ? await prisma.examSittingStudent.findMany({
                  where: {
                      studentId,
                      sitting: {
                          academicYearId: { in: scheduleAcademicYearIds },
                      },
                  },
                  select: {
                      sitting: {
                          select: {
                              id: true,
                              academicYearId: true,
                              examType: true,
                              roomName: true,
                              sessionId: true,
                              sessionLabel: true,
                              startTime: true,
                              endTime: true,
                          },
                      },
                  },
              })
            : [];

    const studentSittings = studentSittingAssignments
        .map((row) => row.sitting)
        .filter(
            (
                sitting,
            ): sitting is NonNullable<(typeof studentSittingAssignments)[number]['sitting']> => Boolean(sitting),
        );

    const getSlotSittingsForSchedule = (schedule: (typeof schedules)[number]) => {
        const scheduleProgramCode = normalizeProgramCode(
            schedule.packet?.programCode || schedule.examType || schedule.packet?.type,
        );
        const scheduleExamType = scheduleProgramCode || schedule.examType || schedule.packet?.type;

        return studentSittings.filter((sitting) => {
            if (Number(sitting.academicYearId) !== Number(schedule.academicYearId)) return false;
            if (!hasExamTypeIntersection(scheduleExamType, sitting.examType)) return false;
            return isSameSlotTime(
                schedule.startTime,
                schedule.endTime,
                sitting.startTime,
                sitting.endTime,
            );
        });
    };

    const getSessionMatchedSittings = (
        schedule: (typeof schedules)[number],
        slotSittings: ReturnType<typeof getSlotSittingsForSchedule>,
    ) => {
        const scheduleSessionId = Number.isFinite(Number(schedule.sessionId))
            ? Number(schedule.sessionId)
            : null;
        const scheduleSessionLabelKey = normalizeSessionLabelKey(schedule.sessionLabel);

        return slotSittings.filter((sitting) => {
            const sittingSessionId = Number.isFinite(Number(sitting.sessionId))
                ? Number(sitting.sessionId)
                : null;

            if (scheduleSessionId && sittingSessionId) {
                return scheduleSessionId === sittingSessionId;
            }

            if (scheduleSessionId || sittingSessionId) {
                return false;
            }

            const sittingSessionLabelKey = normalizeSessionLabelKey(sitting.sessionLabel);
            if (scheduleSessionLabelKey || sittingSessionLabelKey) {
                return scheduleSessionLabelKey === sittingSessionLabelKey;
            }

            return true;
        });
    };

    const filteredSchedules =
        accessRole === 'STUDENT' && studentSittings.length > 0
            ? schedules.filter((schedule) => {
                  const slotSittings = getSlotSittingsForSchedule(schedule);

                  // Tidak ada mapping ruang/sesi untuk slot ini -> fallback tampilkan jadwal.
                  if (slotSittings.length === 0) return true;

                  return getSessionMatchedSittings(schedule, slotSittings).length > 0;
              })
            : schedules;

    const programTaggedTargets = Array.from(
        new Map(
            filteredSchedules
                .map((schedule) => {
                    const taggedProgramCode = normalizeProgramCode(schedule.packet?.programCode);
                    if (!taggedProgramCode) return null;
                    return {
                        academicYearId: Number(schedule.academicYearId),
                        programCode: taggedProgramCode,
                    };
                })
                .filter((target): target is { academicYearId: number; programCode: string } => !!target)
                .map((target) => [`${target.academicYearId}:${target.programCode}`, target]),
        ).values(),
    );

    const activeProgramKeys =
        accessRole === 'STUDENT'
            ? programTaggedTargets.length > 0
                ? new Set(
                      (
                          await prisma.examProgramConfig.findMany({
                              where: {
                                  isActive: true,
                                  OR: programTaggedTargets.map((target) => ({
                                      academicYearId: target.academicYearId,
                                      code: target.programCode,
                                  })),
                              },
                              select: {
                                  academicYearId: true,
                                  code: true,
                              },
                          })
                      ).map((program) => `${Number(program.academicYearId)}:${String(program.code).trim().toUpperCase()}`),
                  )
                : null
            : audienceProgramKeys;

    const schedulesForExamUser = filteredSchedules.filter((schedule) => {
        const taggedProgramCode = normalizeProgramCode(schedule.packet?.programCode);
        if (!taggedProgramCode || !activeProgramKeys) return true;
        return activeProgramKeys.has(`${Number(schedule.academicYearId)}:${taggedProgramCode}`);
    });

    const packetIds = Array.from(
        new Set(
            schedulesForExamUser
                .map((schedule) => Number(schedule.packet?.id))
                .filter((packetId) => Number.isFinite(packetId) && packetId > 0),
        ),
    );
    const packetQuestionCounts = packetIds.length > 0
        ? await prisma.$queryRaw<Array<{ id: number; question_count: number }>>(
              Prisma.sql`
                SELECT
                    id,
                    CASE
                        WHEN jsonb_typeof(questions) = 'array' THEN jsonb_array_length(questions)
                        ELSE 0
                    END AS question_count
                FROM exam_packets
                WHERE id IN (${Prisma.join(packetIds)})
              `,
          )
        : [];
    const questionCountByPacketId = new Map<number, number>(
        packetQuestionCounts.map((row) => [Number(row.id), Number(row.question_count) || 0]),
    );

    const scheduleTargets =
        accessRole === 'STUDENT'
            ? schedulesForExamUser
                  .filter((schedule) => !!schedule.packet)
                  .map((schedule) => {
                      const packet = schedule.packet!;
                      const normalizedProgramCode = normalizeProgramCode(packet.programCode || schedule.examType || packet.type);
                      return {
                          academicYearId: packet.academicYearId,
                          semester: packet.semester,
                          examType: packet.type,
                          programCode: normalizedProgramCode,
                      };
                  })
            : [];

    const uniqueProgramTargets = Array.from(
        new Map(
            scheduleTargets
                .filter((target) => !!target.programCode)
                .map((target) => [
                    buildProgramRestrictionKey(target.academicYearId, target.semester, target.programCode!),
                    target,
                ]),
        ).values(),
    );

    const uniqueLegacyTargets = Array.from(
        new Map(
            scheduleTargets.map((target) => [
                buildLegacyRestrictionKey(target.academicYearId, target.semester, target.examType),
                target,
            ]),
        ).values(),
    );

    const automaticRestrictionTargets = Array.from(
        new Map(
            scheduleTargets.map((target) => [
                buildAutomaticRestrictionKey(
                    target.academicYearId,
                    target.semester,
                    target.programCode,
                    target.examType,
                ),
                {
                    academicYearId: target.academicYearId,
                    semester: target.semester,
                    programCode: target.programCode,
                    examType: target.examType,
                },
            ]),
        ).values(),
    );

    let programRestrictions: Awaited<ReturnType<typeof prisma.studentExamProgramRestriction.findMany>> = [];
    let legacyRestrictions: Awaited<ReturnType<typeof prisma.studentExamRestriction.findMany>> = [];
    let automaticRestrictionMaps: Array<[string, Map<number, AutomaticExamRestrictionInfo>]> = [];

    if (accessRole === 'STUDENT') {
        [programRestrictions, legacyRestrictions, automaticRestrictionMaps] = await Promise.all([
            uniqueProgramTargets.length
                ? prisma.studentExamProgramRestriction.findMany({
                      where: {
                          studentId,
                          OR: uniqueProgramTargets.map((target) => ({
                              academicYearId: target.academicYearId,
                              semester: target.semester,
                              programCode: target.programCode!,
                          })),
                      },
                  })
                : Promise.resolve([]),
            uniqueLegacyTargets.length
                ? prisma.studentExamRestriction.findMany({
                      where: {
                          studentId,
                          OR: uniqueLegacyTargets.map((target) => ({
                              academicYearId: target.academicYearId,
                              semester: target.semester,
                              examType: target.examType,
                          })),
                      },
                  })
                : Promise.resolve([]),
            automaticRestrictionTargets.length && studentClassId
                ? Promise.all(
                      automaticRestrictionTargets.map(async (target) => {
                          const restrictionMap = await buildAutomaticExamRestrictionMap({
                              classId: studentClassId,
                              academicYearId: target.academicYearId,
                              semester: target.semester,
                              studentIds: [studentId],
                              programCode: target.programCode,
                              examType: target.examType,
                          });

                          return [
                              buildAutomaticRestrictionKey(
                                  target.academicYearId,
                                  target.semester,
                                  target.programCode,
                                  target.examType,
                              ),
                              restrictionMap,
                          ] as [string, Map<number, AutomaticExamRestrictionInfo>];
                      }),
                  )
                : Promise.resolve([] as Array<[string, Map<number, AutomaticExamRestrictionInfo>]>),
        ]);
    }

    const programRestrictionMap = new Map(
        programRestrictions.map((item) => [
            buildProgramRestrictionKey(item.academicYearId, item.semester, item.programCode),
            item,
        ]),
    );
    const legacyRestrictionMap = new Map(
        legacyRestrictions.map((item) => [
            buildLegacyRestrictionKey(item.academicYearId, item.semester, item.examType),
            item,
        ]),
    );
    const automaticRestrictionByTargetMap = new Map<string, Map<number, AutomaticExamRestrictionInfo>>(
        automaticRestrictionMaps as Array<[string, Map<number, AutomaticExamRestrictionInfo>]>,
    );

    // Check restrictions
    const examsWithStatus = schedulesForExamUser.map((schedule) => {
        const slotSittings =
            accessRole === 'STUDENT' && studentSittings.length > 0 ? getSlotSittingsForSchedule(schedule) : [];
        const matchingSittings = slotSittings.length > 0 ? getSessionMatchedSittings(schedule, slotSittings) : [];
        const assignedSitting = matchingSittings[0] || slotSittings[0] || null;
        let isBlocked = false;
        let blockReason = '';
        let financeClearance: ExamFinanceClearanceSummary | null = null;

        if (accessRole === 'STUDENT' && schedule.packet) {
            const packet = schedule.packet;
            const normalizedProgramCode = normalizeProgramCode(packet.programCode || schedule.examType || packet.type);

            const programRestriction =
                normalizedProgramCode
                    ? programRestrictionMap.get(
                          buildProgramRestrictionKey(packet.academicYearId, packet.semester, normalizedProgramCode),
                      )
                    : null;

            const legacyRestriction = legacyRestrictionMap.get(
                buildLegacyRestrictionKey(packet.academicYearId, packet.semester, packet.type),
            );
            const automaticRestriction =
                automaticRestrictionByTargetMap
                    .get(
                        buildAutomaticRestrictionKey(
                            packet.academicYearId,
                            packet.semester,
                            normalizedProgramCode,
                            packet.type,
                        ),
                    )
                    ?.get(studentId) || null;
            const effectiveRestriction = buildEffectiveExamRestrictionState({
                manualRestriction: programRestriction ?? legacyRestriction ?? null,
                automaticRestriction,
            });
            isBlocked = effectiveRestriction.isBlocked;
            blockReason = effectiveRestriction.reason || '';
            financeClearance = buildExamFinanceClearanceSummary(automaticRestriction);
        }

        const session = pickBestSession(schedule.sessions);
        const normalizedSessionStatus = String(session?.status || '').toUpperCase();
        const hasSessionAttempt = Array.isArray(schedule.sessions)
            ? schedule.sessions.some((row) => {
                  const rowStatus = String(row?.status || '').toUpperCase();
                  return (
                      Boolean(row?.startTime) ||
                      rowStatus === 'IN_PROGRESS' ||
                      rowStatus === 'COMPLETED' ||
                      rowStatus === 'TIMEOUT'
                  );
              })
            : false;
        const makeupAvailable = !hasSessionAttempt && isMakeupWindowOpen(now, schedule.endTime);
        const makeupDeadline = makeupAvailable ? resolveMakeupDeadline(schedule.endTime) : null;
        const status = session
            ? ['COMPLETED', 'TIMEOUT', 'IN_PROGRESS', 'NOT_STARTED'].includes(normalizedSessionStatus)
                ? normalizedSessionStatus
                : now > schedule.endTime
                    ? 'MISSED'
                    : now < schedule.startTime
                        ? 'UPCOMING'
                        : 'OPEN'
            : makeupAvailable
                ? 'MAKEUP_AVAILABLE'
                : now > schedule.endTime
                    ? 'MISSED'
                    : now < schedule.startTime
                        ? 'UPCOMING'
                        : 'OPEN';

        const adjustedStatus = !session && makeupAvailable ? 'MAKEUP_AVAILABLE' : status;

        const packet = schedule.packet
            ? (() => {
                  const resolvedSubject = resolveAvailableExamSubject({
                      scheduleSubject: schedule.subject,
                      packetSubject: schedule.packet.subject,
                  });

                  return {
                      ...schedule.packet,
                      subject: resolvedSubject
                          ? {
                                id: Number(resolvedSubject.id || 0),
                                name: String(resolvedSubject.name || '-'),
                                code: String(resolvedSubject.code || '-'),
                            }
                          : schedule.packet.subject,
                      questionPoolCount: questionCountByPacketId.get(schedule.packet.id) || 0,
                      questionCount:
                          Number(schedule.packet.publishedQuestionCount) > 0
                              ? Math.min(
                                    Number(schedule.packet.publishedQuestionCount),
                                    questionCountByPacketId.get(schedule.packet.id) || 0,
                                )
                              : questionCountByPacketId.get(schedule.packet.id) || 0,
                  };
              })()
            : null;

        return {
            ...schedule,
            room: assignedSitting?.roomName || schedule.room,
            sessionId: assignedSitting?.sessionId ?? schedule.sessionId,
            sessionLabel: assignedSitting?.sessionLabel || schedule.sessionLabel,
            jobVacancy: schedule.jobVacancy
                ? {
                      id: Number(schedule.jobVacancy.id),
                      title: String(schedule.jobVacancy.title || ''),
                      companyName: schedule.jobVacancy.companyName || null,
                      industryPartner: schedule.jobVacancy.industryPartner
                          ? {
                                id: Number(schedule.jobVacancy.industryPartner.id),
                                name: String(schedule.jobVacancy.industryPartner.name || ''),
                                city: schedule.jobVacancy.industryPartner.city || null,
                                sector: schedule.jobVacancy.industryPartner.sector || null,
                            }
                          : null,
                  }
                : null,
            packet,
            status: adjustedStatus,
            has_submitted: normalizedSessionStatus === 'COMPLETED' || normalizedSessionStatus === 'TIMEOUT',
            isBlocked,
            blockReason,
            financeClearance,
            makeupAvailable,
            makeupDeadline: makeupDeadline ? makeupDeadline.toISOString() : null,
        };
    });

    const payload = {
        exams: examsWithStatus,
        serverNow: now.toISOString(),
    };

    setCachedAvailableExams(studentId, payload);
    res.setHeader('Cache-Control', 'private, max-age=3');
    res.json(new ApiResponse(200, payload));
});

async function buildStartExamPayload(params: {
    scheduleId: number;
    studentId: number;
    accessRole: ExamAccessRole;
}): Promise<{
    session: StudentExamSessionSummary;
    packet: StartExamSchedulePayload['packet'] & {
        totalQuestionPoolCount: number;
        publishedQuestionCount: number | null;
        questions: Record<string, unknown>[];
        isMakeup: boolean;
        makeupDeadline: Date | null;
    };
}> {
    const { scheduleId, studentId, accessRole } = params;
    const schedule = await getOrCreateStartExamSchedule(scheduleId);

    if (!schedule || !schedule.packet) throw new ApiError(404, 'Exam not found');
    await assertScheduleAudienceAccess({
        userId: studentId,
        scheduleId,
        jobVacancyId: schedule.jobVacancyId,
        academicYearId: schedule.packet.academicYearId,
        accessRole,
        programCode: schedule.packet.programCode,
        fallbackExamType: schedule.examType || schedule.packet.type,
    });

    const student =
        accessRole === 'STUDENT'
            ? await prisma.user.findUnique({
                  where: { id: studentId },
                  select: { classId: true },
              })
            : null;
    if (accessRole === 'STUDENT' && !student?.classId) {
        throw new ApiError(400, 'Siswa belum terhubung ke kelas aktif.');
    }

    // Check restriction (program-specific first, then legacy base-type)
    const normalizedProgramCode = normalizeProgramCode(schedule.packet.programCode || schedule.examType || schedule.packet.type);
    if (accessRole === 'STUDENT' && student?.classId) {
        const programRestriction = normalizedProgramCode
            ? await prisma.studentExamProgramRestriction.findUnique({
                  where: {
                      studentId_academicYearId_semester_programCode: {
                          studentId,
                          academicYearId: schedule.packet.academicYearId,
                          semester: schedule.packet.semester,
                          programCode: normalizedProgramCode,
                      },
                  },
              })
            : null;

        const legacyRestriction =
            programRestriction === null
                ? await prisma.studentExamRestriction.findUnique({
                      where: {
                          studentId_academicYearId_semester_examType: {
                              studentId,
                              academicYearId: schedule.packet.academicYearId,
                              semester: schedule.packet.semester,
                              examType: schedule.packet.type,
                          },
                      },
                  })
                : null;

        const automaticRestriction =
            (
                await buildAutomaticExamRestrictionMap({
                    classId: student.classId,
                    academicYearId: schedule.packet.academicYearId,
                    semester: schedule.packet.semester,
                    studentIds: [studentId],
                    programCode: normalizedProgramCode,
                    examType: schedule.packet.type,
                })
            ).get(studentId) || null;
        const effectiveRestriction = buildEffectiveExamRestrictionState({
            manualRestriction: programRestriction ?? legacyRestriction ?? null,
            automaticRestriction,
        });
        if (effectiveRestriction.isBlocked) {
            throw new ApiError(403, effectiveRestriction.reason || 'Access denied by homeroom teacher');
        }
    }

    const now = new Date();
    if (now < schedule.startTime) throw new ApiError(400, 'Exam has not started yet');

    // Create or get session (race-safe for concurrent start requests).
    let session = await findStudentExamSessionSummary(schedule.id, studentId);

    if (session && (session.status === 'COMPLETED' || session.status === 'TIMEOUT')) {
        throw new ApiError(400, 'Anda sudah mengerjakan ujian ini.');
    }

    const resumeInProgressSession =
        Boolean(session) &&
        String(session?.status || '').toUpperCase() === 'IN_PROGRESS' &&
        !session?.submitTime;
    const makeupAllowed = isMakeupWindowOpen(now, schedule.endTime);
    if (now > schedule.endTime && !resumeInProgressSession && !makeupAllowed) {
        throw new ApiError(400, 'Exam has ended');
    }

    if (!session) {
        session = await createStudentExamSessionSafely({
            scheduleId: schedule.id,
            studentId,
            now,
        });
        if (session.status === 'COMPLETED' || session.status === 'TIMEOUT') {
            throw new ApiError(400, 'Anda sudah mengerjakan ujian ini.');
        }
    }

    const packetQuestions = Array.isArray(schedule.packet.questions)
        ? (schedule.packet.questions as Record<string, unknown>[])
        : [];
    const configuredLimit =
        Number.isFinite(Number(schedule.packet.publishedQuestionCount)) &&
        Number(schedule.packet.publishedQuestionCount) > 0
            ? Math.trunc(Number(schedule.packet.publishedQuestionCount))
            : null;
    const sanitizedSessionAnswers = sanitizeAnswersForStorage(session.answers);
    const selectedQuestionIds = resolveQuestionIdsForSession({
        packetQuestions,
        sessionAnswers: sanitizedSessionAnswers,
        scheduleId,
        studentId,
        sessionId: session.id,
        configuredLimit,
    });

    const questionMap = new Map<string, Record<string, unknown>>();
    packetQuestions.forEach((question) => {
        const questionId = String((question as Record<string, unknown>).id || '').trim();
        if (!questionId) return;
        questionMap.set(questionId, question);
    });
    const selectedQuestions = selectedQuestionIds
        .map((questionId) => questionMap.get(questionId))
        .filter((question): question is Record<string, unknown> => Boolean(question));
    const filteredQuestions = selectedQuestions.length > 0 ? selectedQuestions : packetQuestions;
    const randomizedQuestions = randomizeQuestionOptionsForSession(
        filteredQuestions,
        `${scheduleId}:${studentId}:${session.id}`,
    );

    const nextQuestionSetMeta = {
        ids: selectedQuestionIds.length > 0
            ? selectedQuestionIds
            : packetQuestions
                  .map((question) => String((question as Record<string, unknown>).id || '').trim())
                  .filter(Boolean),
        limit:
            Number.isFinite(Number(configuredLimit)) && Number(configuredLimit) > 0
                ? Number(configuredLimit)
                : null,
        totalAvailable: packetQuestions.length,
        assignedAt: new Date().toISOString(),
    };

    const nextAnswersPayload = sanitizeAnswersForStorage({
        ...sanitizedSessionAnswers,
        __questionSet: nextQuestionSetMeta,
    });
    if (stableSerializeJson(nextAnswersPayload) !== stableSerializeJson(sanitizedSessionAnswers)) {
        session = await prisma.studentExamSession.update({
            where: { id: session.id },
            data: {
                answers: nextAnswersPayload as Prisma.InputJsonValue,
            },
            select: studentExamSessionSelect,
        });
    }

    availableExamsCache.delete(studentId);

    return {
        session,
        packet: {
            ...schedule.packet,
            totalQuestionPoolCount: packetQuestions.length,
            publishedQuestionCount:
                Number.isFinite(Number(configuredLimit)) && Number(configuredLimit) > 0
                    ? Number(configuredLimit)
                    : null,
            questions: randomizedQuestions,
            isMakeup: now > schedule.endTime,
            makeupDeadline: now > schedule.endTime ? resolveMakeupDeadline(schedule.endTime) : null,
        },
    };
}

export const createExamBrowserLaunchToken = asyncHandler(async (req: Request, res: Response) => {
    if (!EXAM_BROWSER_LAUNCH_SECRET) {
        throw new ApiError(500, 'Konfigurasi EXAM_BROWSER_LAUNCH_SECRET belum diatur.');
    }

    const { id } = req.params;
    const authUser = (req as Request & { user?: { id: number; role: string } }).user;
    const studentId = Number(authUser?.id || 0);
    const accessRole = resolveExamAccessRole(authUser?.role);
    const scheduleId = parseInt(String(id || ''), 10);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'Schedule ID tidak valid.');
    }
    if (!Number.isFinite(studentId) || studentId <= 0) {
        throw new ApiError(401, 'Sesi login tidak valid.');
    }

    const schedule = await getOrCreateStartExamSchedule(scheduleId);
    if (!schedule || !schedule.packet) {
        throw new ApiError(404, 'Ujian tidak ditemukan.');
    }
    await assertScheduleAudienceAccess({
        userId: studentId,
        scheduleId,
        jobVacancyId: schedule.jobVacancyId,
        academicYearId: schedule.packet.academicYearId,
        accessRole,
        programCode: schedule.packet.programCode,
        fallbackExamType: schedule.examType || schedule.packet.type,
    });

    const token = jwt.sign(
        {
            sub: String(studentId),
            studentId,
            scheduleId,
            role: accessRole,
            launchNonce: randomUUID(),
            type: 'exam-browser-launch',
        } as ExamBrowserLaunchTokenPayload,
        EXAM_BROWSER_LAUNCH_SECRET,
        {
            algorithm: 'HS256',
            expiresIn: EXAM_BROWSER_LAUNCH_TTL_SECONDS,
            issuer: EXAM_BROWSER_LAUNCH_ISSUER,
            audience: EXAM_BROWSER_LAUNCH_AUDIENCE,
        },
    );

    res.json(
        new ApiResponse(200, {
            token,
            launchUrl: buildExamBrowserLaunchUrl(token),
            expiresInSeconds: EXAM_BROWSER_LAUNCH_TTL_SECONDS,
            scheduleId,
            examBrowser: {
                mandatory: EXAM_BROWSER_MANDATORY,
                installUrl: EXAM_BROWSER_INSTALL_URL,
            },
        }),
    );
});

export const exchangeExamBrowserLaunchToken = asyncHandler(async (req: Request, res: Response) => {
    if (!EXAM_BROWSER_LAUNCH_SECRET) {
        throw new ApiError(500, 'Konfigurasi EXAM_BROWSER_LAUNCH_SECRET belum diatur.');
    }

    const token = String(req.body?.token || '').trim();
    if (!token) {
        throw new ApiError(400, 'Token launch wajib diisi.');
    }

    let decoded: ExamBrowserLaunchTokenPayload;
    try {
        decoded = jwt.verify(token, EXAM_BROWSER_LAUNCH_SECRET, {
            issuer: EXAM_BROWSER_LAUNCH_ISSUER,
            audience: EXAM_BROWSER_LAUNCH_AUDIENCE,
            algorithms: ['HS256'],
        }) as ExamBrowserLaunchTokenPayload;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Token launch tidak valid.';
        throw new ApiError(401, message || 'Token launch tidak valid.');
    }

    if (decoded?.type !== 'exam-browser-launch') {
        throw new ApiError(401, 'Token launch tidak valid untuk exam browser.');
    }

    if (!consumeExamBrowserLaunchToken(token)) {
        throw new ApiError(409, 'Token launch sudah digunakan. Silakan mulai ulang dari aplikasi utama.');
    }

    const scheduleId = Number(decoded.scheduleId);
    const studentId = Number(decoded.studentId || decoded.sub);
    const accessRole = resolveExamAccessRole(decoded.role);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0 || !Number.isFinite(studentId) || studentId <= 0) {
        throw new ApiError(400, 'Payload token launch tidak valid.');
    }

    const payload = await buildStartExamPayload({ scheduleId, studentId, accessRole });
    const examAccessToken = createExamBrowserSessionAccessToken({
        scheduleId,
        studentId,
        role: accessRole,
    });
    res.json(
        new ApiResponse(200, {
            ...payload,
            examAccessToken,
            examAccessTokenExpiresInSeconds: EXAM_BROWSER_SESSION_TOKEN_TTL_SECONDS,
        }),
    );
});

export const startExam = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params; // scheduleId
    const user = (req as any).user;
    const studentId = user!.id;
    const accessRole = resolveExamAccessRole(user?.role);
    ensureExamBrowserMandatoryAccess(user);
    const scheduleId = parseInt(id, 10);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'Schedule ID tidak valid.');
    }
    if (user?.tokenType === 'exam-browser-session') {
        const scopedScheduleId = Number(user?.scheduleId || 0);
        if (!Number.isFinite(scopedScheduleId) || scopedScheduleId !== scheduleId) {
            throw new ApiError(403, 'Token exam browser tidak valid untuk ujian ini.');
        }
    }

    const payload = await buildStartExamPayload({ scheduleId, studentId, accessRole });
    res.json(new ApiResponse(200, payload));
});

// Helper to calculate score
const calculateScore = (questions: any[], answers: any): number => {
    let totalScore = 0;
    let maxScore = 0;

    if (!questions || !Array.isArray(questions)) return 0;

    questions.forEach(q => {
        const points = q.score || 1; // Default to 1 point
        maxScore += points;

        const studentAnswerId = answers[q.id];
        
        // Find correct option
        if (q.options && Array.isArray(q.options)) {
            const correctOption = q.options.find((opt: any) => opt.isCorrect);
            if (correctOption && correctOption.id === studentAnswerId) {
                totalScore += points;
            }
        }
    });

    if (maxScore === 0) return 0;
    return (totalScore / maxScore) * 100;
};

async function syncBkkOnlineTestAssessmentFromExamSession(params: {
    applicantId: number;
    vacancyId: number;
    score: number;
    assessedAt: Date;
}) {
    const application = await prisma.jobApplication.findUnique({
        where: {
            applicantId_vacancyId: {
                applicantId: params.applicantId,
                vacancyId: params.vacancyId,
            },
        },
        select: {
            id: true,
            status: true,
        },
    });

    if (
        !application ||
        application.status === JobApplicationStatus.WITHDRAWN ||
        application.status === JobApplicationStatus.REJECTED
    ) {
        return;
    }

    await prisma.jobApplicationAssessment.upsert({
        where: {
            applicationId_stageCode: {
                applicationId: application.id,
                stageCode: JobApplicationAssessmentStageCode.ONLINE_TEST,
            },
        },
        create: {
            applicationId: application.id,
            stageCode: JobApplicationAssessmentStageCode.ONLINE_TEST,
            title: 'Tes Online / CBT',
            sourceType: SelectionAssessmentSource.EXAM,
            score: params.score,
            maxScore: 100,
            weight: 35,
            passingScore: 70,
            assessedAt: params.assessedAt,
            notes: 'Nilai otomatis dari sesi CBT pelamar BKK.',
        },
        update: {
            title: 'Tes Online / CBT',
            sourceType: SelectionAssessmentSource.EXAM,
            score: params.score,
            maxScore: 100,
            assessedAt: params.assessedAt,
        },
    });
}

export const submitAnswers = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params; // scheduleId
    const { answers, finish, is_final_submit, force_submit } = req.body;
    const user = (req as any).user;
    const studentId = user.id;
    const accessRole = resolveExamAccessRole(user?.role);
    ensureExamBrowserMandatoryAccess(user);
    const scheduleId = parseInt(id);
    if (user?.tokenType === 'exam-browser-session') {
        const scopedScheduleId = Number(user?.scheduleId || 0);
        if (!Number.isFinite(scopedScheduleId) || scopedScheduleId !== scheduleId) {
            throw new ApiError(403, 'Token exam browser tidak valid untuk ujian ini.');
        }
    }
    const forceSubmit = Boolean(force_submit);

    // Support both flags
    const isFinished = finish || is_final_submit;

    const session = await prisma.studentExamSession.findFirst({
        where: { scheduleId, studentId },
        select: {
            id: true,
            studentId: true,
            scheduleId: true,
            status: true,
            answers: true,
            submitTime: true,
        },
    });

    if (!session) throw new ApiError(404, 'Session not found');

    if (!isFinished && (session.status === 'COMPLETED' || session.status === 'TIMEOUT' || Boolean(session.submitTime))) {
        return res.json(new ApiResponse(200, session, 'Session already finished'));
    }

    const previousAnswers = sanitizeAnswersForStorage(session.answers);
    const previousQuestionSet = sanitizeQuestionSetMeta(
        (previousAnswers as Record<string, unknown>).__questionSet,
    );
    const normalizedIncomingAnswers = sanitizeAnswersForStorage({
        ...(answers && typeof answers === 'object' ? (answers as Record<string, unknown>) : {}),
        ...(previousQuestionSet ? { __questionSet: previousQuestionSet } : {}),
    });

    if (!isFinished) {
        const unchangedPayload =
            stableSerializeJson(normalizedIncomingAnswers) === stableSerializeJson(previousAnswers);
        if (session.status === 'IN_PROGRESS' && unchangedPayload) {
            return res.json(new ApiResponse(200, session, 'Answers already up-to-date'));
        }
    }

    // Calculate score if finishing
    let finalScore: number | undefined = undefined;
    let finishedSchedule:
        | {
              jobVacancyId: number | null;
              packet: {
                  id: number;
                  subjectId: number;
                  academicYearId: number;
                  semester: Semester;
                  type: ExamType;
                  programCode: string | null;
                  questions: unknown;
              } | null;
          }
        | null = null;
    
    if (isFinished) {
        // Get Exam Packet Questions
        finishedSchedule = await prisma.examSchedule.findUnique({
            where: { id: scheduleId },
            select: {
                jobVacancyId: true,
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
        });
        
        if (finishedSchedule?.packet?.questions) {
             const packetQuestions = Array.isArray(finishedSchedule.packet.questions)
                 ? (finishedSchedule.packet.questions as any[])
                 : [];
             const sessionQuestionSet =
                 sanitizeQuestionSetMeta(
                     (normalizedIncomingAnswers as Record<string, unknown>).__questionSet,
                 ) || previousQuestionSet;
             let scoringQuestions = packetQuestions;
             if (sessionQuestionSet?.ids?.length) {
                 const packetMap = new Map<string, any>();
                 packetQuestions.forEach((question: any) => {
                     const questionId = String(question?.id || '').trim();
                     if (!questionId) return;
                     packetMap.set(questionId, question);
                 });
                 const selected = sessionQuestionSet.ids
                     .map((questionId) => packetMap.get(questionId))
                     .filter((question: any) => Boolean(question));
                 if (selected.length > 0) {
                     scoringQuestions = selected;
                 }
             }

             if (!forceSubmit) {
                 const requiredQuestionIds = scoringQuestions
                     .map((question: any) => String(question?.id || '').trim())
                     .filter(Boolean);
                 const unansweredCount = requiredQuestionIds.filter(
                     (questionId: string) => !hasAnswerValue(normalizedIncomingAnswers[questionId]),
                 ).length;
                 if (unansweredCount > 0) {
                     throw new ApiError(
                         400,
                         `Masih ada ${unansweredCount} soal belum dijawab. Jawab semua soal sebelum mengumpulkan ujian.`,
                     );
                 }
             }

             finalScore = calculateScore(scoringQuestions, normalizedIncomingAnswers);
        }
    }

    const updatedSession = await prisma.studentExamSession.update({
        where: { id: session.id },
        data: {
            answers: normalizedIncomingAnswers as Prisma.InputJsonValue,
            status: isFinished ? 'COMPLETED' : 'IN_PROGRESS',
            submitTime: isFinished ? new Date() : undefined,
            endTime: isFinished ? new Date() : undefined,
            score: finalScore
        }
    });

    if (isFinished && finishedSchedule?.packet?.id) {
        invalidatePacketItemAnalysisCacheByPacket(finishedSchedule.packet.id);
        invalidatePacketSubmissionsCacheByPacket(finishedSchedule.packet.id);
    }
    invalidateSessionDetailCacheBySession(session.id);

    // Auto-fill StudentGrade if finished and score calculated
    if (isFinished && finalScore !== undefined && accessRole === 'STUDENT') {
        try {
            if (finishedSchedule?.packet) {
                const { subjectId, academicYearId, semester, type, programCode } = finishedSchedule.packet;
                const gradeComponentConfig = await resolveGradeComponentConfigForPacket({
                    academicYearId,
                    type,
                    programCode,
                });
                const {
                    componentType,
                    componentCode,
                    componentLabel,
                    gradeEntryMode,
                } = gradeComponentConfig;

                // Find or Create Grade Component
                let component = componentCode
                    ? await prisma.gradeComponent.findFirst({
                        where: { subjectId, code: componentCode, isActive: true }
                    })
                    : null;

                if (!component) {
                    component = await prisma.gradeComponent.findFirst({
                        where: { subjectId, type: componentType, isActive: true }
                    });
                }

                // Auto-create component if missing (essential for auto-grading)
                if (!component) {
                    const componentName = componentLabel || componentCode || type;

                    try {
                        component = await prisma.gradeComponent.create({
                            data: {
                                code: componentCode,
                                subjectId,
                                type: componentType,
                                name: componentName,
                                weight: 1,
                                isActive: true
                            }
                        });
                    } catch (e) {
                        console.error('Failed to auto-create grade component:', e);
                    }
                }

                if (component) {
                    let syncedStudentGradeId: number | null = null;
                    // Find existing grade
                    const grade = await prisma.studentGrade.findFirst({
                        where: {
                            studentId,
                            subjectId,
                            academicYearId,
                            componentId: component.id,
                            semester
                        }
                    });

                    if (grade) {
                        // Update existing
                        const updateData: any = {};
                        if (gradeEntryMode === GradeEntryMode.NF_SERIES) {
                            // Fill first empty NF
                            if (grade.nf1 === null) updateData.nf1 = finalScore;
                            else if (grade.nf2 === null) updateData.nf2 = finalScore;
                            else if (grade.nf3 === null) updateData.nf3 = finalScore;
                            else if (grade.nf4 === null) updateData.nf4 = finalScore;
                            else if (grade.nf5 === null) updateData.nf5 = finalScore;
                            else if (grade.nf6 === null) updateData.nf6 = finalScore;

                            // Recalculate Average Score
                            const nfs = [
                                updateData.nf1 ?? grade.nf1,
                                updateData.nf2 ?? grade.nf2,
                                updateData.nf3 ?? grade.nf3,
                                updateData.nf4 ?? grade.nf4,
                                updateData.nf5 ?? grade.nf5,
                                updateData.nf6 ?? grade.nf6
                            ].filter((n: number | null) => n !== null) as number[];

                            if (nfs.length > 0) {
                                updateData.score = nfs.reduce((a: number, b: number) => a + b, 0) / nfs.length;
                            }
                        } else {
                            // For MIDTERM / FINAL / US/Skill, just update score
                            updateData.score = finalScore;
                        }

                        if (Object.keys(updateData).length > 0) {
                            const updatedGrade = await prisma.studentGrade.update({
                                where: { id: grade.id },
                                data: updateData
                            });
                            syncedStudentGradeId = updatedGrade.id;
                        }
                    } else {
                        // Create new
                        const createData: any = {
                            studentId,
                            subjectId,
                            academicYearId,
                            componentId: component.id,
                            semester,
                            score: finalScore
                        };

                        if (gradeEntryMode === GradeEntryMode.NF_SERIES) {
                            createData.nf1 = finalScore;
                        }

                        const createdGrade = await prisma.studentGrade.create({
                            data: createData
                        });
                        syncedStudentGradeId = createdGrade.id;
                    }

                    if (syncedStudentGradeId) {
                        try {
                            await syncScoreEntriesFromStudentGrade(syncedStudentGradeId);
                        } catch (scoreEntryError) {
                            console.error('Failed to sync score entry from student grade auto-fill:', scoreEntryError);
                        }
                    }

                    try {
                        await upsertScoreEntryFromExamSession({
                            sessionId: updatedSession.id,
                            studentId,
                            subjectId,
                            academicYearId,
                            semester,
                            examType: type,
                            programCode: programCode || null,
                            score: finalScore,
                        });
                    } catch (scoreEntryError) {
                        console.error('Failed to upsert score entry from exam session:', scoreEntryError);
                    }

                    // Sync Report Grade
                    await syncReportGrade(studentId, subjectId, academicYearId, semester);
                }
            }
        } catch (error) {
            console.error('Auto-fill grade error:', error);
            // Don't fail the response, just log
        }
    }

    if (
        isFinished &&
        finalScore !== undefined &&
        accessRole === 'UMUM' &&
        Number.isFinite(Number(finishedSchedule?.jobVacancyId || 0))
    ) {
        try {
            await syncBkkOnlineTestAssessmentFromExamSession({
                applicantId: studentId,
                vacancyId: Number(finishedSchedule?.jobVacancyId),
                score: finalScore,
                assessedAt: new Date(),
            });
        } catch (error) {
            console.error('Auto-sync BKK online test assessment error:', error);
        }
    }

    availableExamsCache.delete(studentId);

    res.json(new ApiResponse(200, updatedSession, 'Answers saved'));
});

// ==========================================
// Exam Restriction (Homeroom)
// ==========================================

export const getExamRestrictions = asyncHandler(async (req: Request, res: Response) => {
    const { classId, academicYearId, semester, examType, programCode, page = 1, limit = 10, search } = req.query;
    
    if (!classId || !academicYearId || !semester || (!examType && !programCode)) {
        throw new ApiError(400, 'Missing required query parameters');
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    const parsedClassId = Number(classId);
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedClassId) || parsedClassId <= 0) {
        throw new ApiError(400, 'classId tidak valid.');
    }
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        throw new ApiError(400, 'academicYearId tidak valid.');
    }
    const parsedSemester = normalizePacketSemester(semester);
    const restrictionTarget = await resolveRestrictionTarget({
        academicYearId: parsedAcademicYearId,
        rawExamType: examType,
        rawProgramCode: programCode,
    });

    const where: any = { 
        classId: parsedClassId, 
        role: 'STUDENT', 
        studentStatus: 'ACTIVE' 
    };

    if (search) {
        where.OR = [
            { name: { contains: search as string, mode: 'insensitive' } },
            { nis: { contains: search as string, mode: 'insensitive' } },
            { nisn: { contains: search as string, mode: 'insensitive' } }
        ];
    }

    // Get paginated students in class
    const [students, total, allClassStudents] = await Promise.all([
        prisma.user.findMany({
            where,
            select: { id: true, nisn: true, name: true },
            orderBy: { name: 'asc' },
            skip,
            take: limitNum
        }),
        prisma.user.count({
            where
        }),
        prisma.user.findMany({
            where: {
                classId: parsedClassId,
                role: 'STUDENT',
                studentStatus: 'ACTIVE',
            },
            select: { id: true },
        }),
    ]);

    const studentIds = students.map((s) => s.id);
    const allClassStudentIds = allClassStudents.map((student) => student.id);
    const [programRestrictions, legacyRestrictions, automaticRestrictionMap] = await Promise.all([
        restrictionTarget.programCode
            ? prisma.studentExamProgramRestriction.findMany({
                  where: {
                      academicYearId: parsedAcademicYearId,
                      semester: parsedSemester,
                      programCode: restrictionTarget.programCode,
                      studentId: { in: studentIds },
                  },
              })
            : Promise.resolve([]),
        prisma.studentExamRestriction.findMany({
            where: {
                academicYearId: parsedAcademicYearId,
                semester: parsedSemester,
                examType: restrictionTarget.baseType,
                studentId: { in: studentIds },
            },
        }),
        buildAutomaticExamRestrictionMap({
            classId: parsedClassId,
            academicYearId: parsedAcademicYearId,
            semester: parsedSemester,
            studentIds: allClassStudentIds,
            programCode: restrictionTarget.programCode,
            examType: restrictionTarget.baseType,
        }),
    ]);

    const programRestrictionMap = new Map(programRestrictions.map((item) => [item.studentId, item]));
    const legacyRestrictionMap = new Map(legacyRestrictions.map((item) => [item.studentId, item]));
    await createHomeroomAutomaticRestrictionNotification({
        classId: parsedClassId,
        academicYearId: parsedAcademicYearId,
        semester: parsedSemester,
        programCode: restrictionTarget.programCode,
        examType: restrictionTarget.baseType,
        autoRestrictionMap: automaticRestrictionMap,
    });

    // Merge
    const result = students.map(student => {
        const manualRestriction = programRestrictionMap.get(student.id) ?? legacyRestrictionMap.get(student.id) ?? null;
        const automaticRestriction = automaticRestrictionMap.get(student.id) || emptyAutomaticExamRestrictionInfo();
        const effectiveRestriction = buildEffectiveExamRestrictionState({
            manualRestriction,
            automaticRestriction,
        });
        return {
            student,
            isBlocked: effectiveRestriction.isBlocked,
            reason: effectiveRestriction.reason,
            manualBlocked: effectiveRestriction.manualBlocked,
            autoBlocked: effectiveRestriction.autoBlocked,
            flags: automaticRestriction.flags,
            details: automaticRestriction.details,
        };
    });

    res.json(new ApiResponse(200, {
        restrictions: result,
        meta: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    }));
});

export const updateExamRestriction = asyncHandler(async (req: Request, res: Response) => {
    const { studentId, academicYearId, semester, examType, programCode, isBlocked, reason } = req.body;
    const parsedStudentId = Number(studentId);
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedStudentId) || parsedStudentId <= 0) {
        throw new ApiError(400, 'studentId tidak valid.');
    }
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        throw new ApiError(400, 'academicYearId tidak valid.');
    }
    const parsedSemester = normalizePacketSemester(semester);
    const restrictionTarget = await resolveRestrictionTarget({
        academicYearId: parsedAcademicYearId,
        rawExamType: examType,
        rawProgramCode: programCode,
    });
    const normalizedReason = String(reason || '').trim();
    const normalizedBlockState =
        typeof isBlocked === 'string'
            ? ['true', '1', 'yes', 'on'].includes(isBlocked.toLowerCase())
            : Boolean(isBlocked);

    const restriction = restrictionTarget.programCode
        ? await prisma.studentExamProgramRestriction.upsert({
              where: {
                  studentId_academicYearId_semester_programCode: {
                      studentId: parsedStudentId,
                      academicYearId: parsedAcademicYearId,
                      semester: parsedSemester,
                      programCode: restrictionTarget.programCode,
                  },
              },
              update: {
                  isBlocked: normalizedBlockState,
                  reason: normalizedBlockState ? normalizedReason : '',
              },
              create: {
                  studentId: parsedStudentId,
                  academicYearId: parsedAcademicYearId,
                  semester: parsedSemester,
                  programCode: restrictionTarget.programCode,
                  isBlocked: normalizedBlockState,
                  reason: normalizedBlockState ? normalizedReason : '',
              },
          })
        : await prisma.studentExamRestriction.upsert({
              where: {
                  studentId_academicYearId_semester_examType: {
                      studentId: parsedStudentId,
                      academicYearId: parsedAcademicYearId,
                      semester: parsedSemester,
                      examType: restrictionTarget.baseType,
                  },
              },
              update: {
                  isBlocked: normalizedBlockState,
                  reason: normalizedBlockState ? normalizedReason : '',
              },
              create: {
                  studentId: parsedStudentId,
                  academicYearId: parsedAcademicYearId,
                  semester: parsedSemester,
                  examType: restrictionTarget.baseType,
                  isBlocked: normalizedBlockState,
                  reason: normalizedBlockState ? normalizedReason : '',
              },
          });

    availableExamsCache.delete(parsedStudentId);

    res.json(new ApiResponse(200, restriction, 'Status akses ujian berhasil diperbarui'));
});
