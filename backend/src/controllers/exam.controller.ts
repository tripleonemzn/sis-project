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
    HomeroomBookEntryType,
    HomeroomBookStatus,
    JobApplicationAssessmentStageCode,
    JobApplicationStatus,
    Prisma,
    VerificationStatus,
    SelectionAssessmentSource,
} from '@prisma/client';
import { syncReportGrade } from './grade.controller';
import { syncScoreEntriesFromStudentGrade, upsertScoreEntryFromExamSession } from '../services/scoreEntry.service';
import {
    getHistoricalStudentSnapshotForAcademicYear,
    listHistoricalStudentsForAcademicYear,
} from '../utils/studentAcademicHistory';
import { createInAppNotification } from '../services/mobilePushNotification.service';
import { assertCurriculumExamManagerAccess } from '../utils/examManagementAccess';

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

function resolveCanonicalProgramBaseType(params: {
    programCode?: unknown;
    baseType?: ExamType | string | null;
    baseTypeCode?: string | null;
}): ExamType {
    const normalizedProgramCode = normalizeProgramCode(params.programCode);
    if (normalizedProgramCode === 'ASAJ') return ExamType.US_THEORY;
    if (normalizedProgramCode === 'ASAJP') return ExamType.US_PRACTICE;

    const inferredFromProgramCode = inferExamTypeFromAlias(normalizedProgramCode);
    if (inferredFromProgramCode) return inferredFromProgramCode;

    const inferredFromBaseTypeCode = inferExamTypeFromAlias(params.baseTypeCode);
    if (inferredFromBaseTypeCode) return inferredFromBaseTypeCode;

    const inferredFromBaseType = inferExamTypeFromAlias(params.baseType);
    if (inferredFromBaseType) return inferredFromBaseType;

    return ExamType.FORMATIF;
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
    if (['PSAJ', 'ASAJ_PRAKTIK', 'ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK'].includes(normalized)) {
        return 'ASAJP';
    }
    return normalized;
}

function resolveCurrentAcademicYearSemester(academicYear: {
    semester1End?: Date | null;
    semester2Start?: Date | null;
    semester2End?: Date | null;
}, referenceDate: Date): Semester {
    if (
        academicYear.semester2Start &&
        academicYear.semester2End &&
        referenceDate >= academicYear.semester2Start &&
        referenceDate <= academicYear.semester2End
    ) {
        return Semester.EVEN;
    }

    if (
        academicYear.semester1End &&
        academicYear.semester2Start &&
        referenceDate > academicYear.semester1End &&
        referenceDate < academicYear.semester2Start
    ) {
        return Semester.EVEN;
    }

    return Semester.ODD;
}

const CURRICULUM_EXAM_MANAGER_LABEL = 'Wakasek Kurikulum atau Sekretaris Kurikulum';

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

function isUsTheoryProgramCode(raw: unknown): boolean {
    const normalized = normalizeAliasCode(raw);
    return normalized === 'US_THEORY' || normalized === 'US_TEORI';
}

type PacketDisplaySubject = {
    id: number;
    name: string;
    code: string;
};

function toPacketDisplaySubject(
    subject?: { id?: number | null; name?: string | null; code?: string | null } | null,
): PacketDisplaySubject | null {
    const parsedId = Number(subject?.id || 0);
    const name = String(subject?.name || '').trim();
    const code = String(subject?.code || '').trim();
    if (!Number.isFinite(parsedId) || parsedId <= 0 || !name) return null;
    return {
        id: parsedId,
        name,
        code,
    };
}

function dedupePacketDisplaySubjects(
    subjects: Array<{ id?: number | null; name?: string | null; code?: string | null } | null | undefined>,
): PacketDisplaySubject[] {
    const unique = new Map<string, PacketDisplaySubject>();
    subjects.forEach((item) => {
        const normalized = toPacketDisplaySubject(item);
        if (!normalized) return;
        const key = normalized.id > 0 ? `id:${normalized.id}` : `${normalized.code}:${normalized.name}`;
        if (!unique.has(key)) {
            unique.set(key, normalized);
        }
    });
    return Array.from(unique.values());
}

function resolvePacketDisplaySubject(params: {
    packetSubject?: { id?: number | null; name?: string | null; code?: string | null } | null;
    scheduleSubjects?: Array<{ id?: number | null; name?: string | null; code?: string | null } | null | undefined>;
}): PacketDisplaySubject | null {
    const packetSubject = toPacketDisplaySubject(params.packetSubject);
    const scheduleSubjects = dedupePacketDisplaySubjects(params.scheduleSubjects || []);

    if (scheduleSubjects.length === 0) {
        return packetSubject;
    }

    const nonGenericScheduleSubjects = scheduleSubjects.filter(
        (item) => !isGenericSubjectIdentity(item.name, item.code),
    );
    if (nonGenericScheduleSubjects.length === 1) {
        return (
            toPacketDisplaySubject(
                resolveAvailableExamSubject({
                    scheduleSubject: nonGenericScheduleSubjects[0],
                    packetSubject,
                }),
            ) || nonGenericScheduleSubjects[0]
        );
    }

    if (nonGenericScheduleSubjects.length > 1) {
        if (packetSubject && !isGenericSubjectIdentity(packetSubject.name, packetSubject.code)) {
            const matchingPacketSubject = nonGenericScheduleSubjects.find((item) => item.id === packetSubject.id);
            if (matchingPacketSubject) {
                return matchingPacketSubject;
            }
        }
        return nonGenericScheduleSubjects[0];
    }

    return (
        toPacketDisplaySubject(
            resolveAvailableExamSubject({
                scheduleSubject: scheduleSubjects[0],
                packetSubject,
            }),
        ) || scheduleSubjects[0]
    );
}

async function resolveEffectivePacketSubjectsForPackets(
    packets: Array<{
        id: number;
        subject?: { id?: number | null; name?: string | null; code?: string | null } | null;
    }>,
): Promise<Map<number, PacketDisplaySubject>> {
    const targetPacketIds = Array.from(
        new Set(
            packets
                .filter(
                    (packet) =>
                        Number.isFinite(Number(packet.id)) &&
                        Number(packet.id) > 0 &&
                        isGenericSubjectIdentity(packet.subject?.name, packet.subject?.code),
                )
                .map((packet) => Number(packet.id)),
        ),
    );

    if (targetPacketIds.length === 0) {
        return new Map();
    }

    const scheduleSubjects = await prisma.examSchedule.findMany({
        where: {
            packetId: { in: targetPacketIds },
            subjectId: { not: null },
        },
        select: {
            packetId: true,
            subject: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
        orderBy: [{ packetId: 'asc' }, { id: 'asc' }],
    });

    const groupedScheduleSubjects = new Map<number, PacketDisplaySubject[]>();
    scheduleSubjects.forEach((item) => {
        const packetId = Number(item.packetId || 0);
        if (!Number.isFinite(packetId) || packetId <= 0 || !item.subject) return;
        const existing = groupedScheduleSubjects.get(packetId) || [];
        existing.push(item.subject);
        groupedScheduleSubjects.set(packetId, existing);
    });

    const resolved = new Map<number, PacketDisplaySubject>();
    packets.forEach((packet) => {
        const packetId = Number(packet.id || 0);
        if (!Number.isFinite(packetId) || packetId <= 0) return;
        const effectiveSubject = resolvePacketDisplaySubject({
            packetSubject: packet.subject,
            scheduleSubjects: groupedScheduleSubjects.get(packetId) || [],
        });
        if (effectiveSubject) {
            resolved.set(packetId, effectiveSubject);
        }
    });

    return resolved;
}

async function assertPacketSubjectProgramConsistency(params: {
    subjectId: number;
    programCode?: string | null;
}) {
    const subject = await prisma.subject.findUnique({
        where: { id: params.subjectId },
        select: {
            id: true,
            name: true,
            code: true,
        },
    });

    if (!subject) {
        throw new ApiError(404, 'Mapel tidak ditemukan.');
    }

    if (isGenericSubjectIdentity(subject.name, subject.code) && !isUsTheoryProgramCode(params.programCode)) {
        throw new ApiError(
            400,
            'Mapel Konsentrasi Keahlian / Teori Kejuruan hanya boleh dipakai pada program US Teori.',
        );
    }
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

    const normalizedProgramCode = normalizeProgramCode(params.programCode);
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
            return readFirstFiniteScore(usTheoryAverage, slotScores.US_THEORY, slotScores.US_TEORI);
        case 'US_PRACTICE':
            return readFirstFiniteScore(usPracticeAverage, slotScores.US_PRACTICE, slotScores.US_PRAKTEK);
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
    const normalizedProgramCode = normalizeProgramCode(params.programCode);
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

    return {
        programCode: programConfig?.code || normalizedProgramCode || null,
        gradeComponentType: programConfig?.gradeComponentType || null,
        gradeComponentTypeCode: programConfig?.gradeComponentTypeCode || null,
        fixedSemester: programConfig?.fixedSemester || null,
        allowedSubjectIds: new Set(
            Array.isArray(programConfig?.allowedSubjectIds)
                ? programConfig.allowedSubjectIds
                      .map((subjectId) => Number(subjectId))
                      .filter((subjectId) => Number.isFinite(subjectId) && subjectId > 0)
                : [],
        ),
        scoreFamily: resolveEligibilityProgramScoreFamily({
            gradeComponentType: programConfig?.gradeComponentType || null,
            gradeComponentTypeCode: programConfig?.gradeComponentTypeCode || null,
            programCode: programConfig?.code || normalizedProgramCode,
            examType: params.examType || null,
        }),
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

function hasSbtsLoadTestBypassSecret(rawSecret: unknown): boolean {
    if (!SBTS_LOAD_TEST_BYPASS_ENABLED) return false;
    if (!SBTS_LOAD_TEST_BYPASS_SECRET) return false;
    return String(rawSecret || '').trim() === SBTS_LOAD_TEST_BYPASS_SECRET;
}

function canUseSbtsLoadTestBypass(params: {
    providedSecret?: unknown;
    accessRole: ExamAccessRole;
    academicYearId: number;
    semester: Semester;
    programCode?: string | null;
    examType?: ExamType | null;
}): boolean {
    if (!hasSbtsLoadTestBypassSecret(params.providedSecret)) return false;
    if (params.accessRole !== 'STUDENT') return false;

    const normalizedProgramCode = normalizeProgramCode(params.programCode || params.examType);
    if (normalizedProgramCode !== SBTS_LOAD_TEST_BYPASS_PROGRAM_CODE) return false;

    if (
        Number.isFinite(Number(SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID)) &&
        Number(params.academicYearId) !== Number(SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID)
    ) {
        return false;
    }

    if (SBTS_LOAD_TEST_BYPASS_SEMESTER && params.semester !== SBTS_LOAD_TEST_BYPASS_SEMESTER) {
        return false;
    }

    return true;
}

function maybeApplySbtsLoadTestRestrictionBypass(params: {
    providedSecret?: unknown;
    accessRole: ExamAccessRole;
    academicYearId: number;
    semester: Semester;
    programCode?: string | null;
    examType?: ExamType | null;
    automaticRestriction: AutomaticExamRestrictionInfo | null;
    effectiveRestriction: ReturnType<typeof buildEffectiveExamRestrictionState>;
}): ReturnType<typeof buildEffectiveExamRestrictionState> {
    if (
        !canUseSbtsLoadTestBypass({
            providedSecret: params.providedSecret,
            accessRole: params.accessRole,
            academicYearId: params.academicYearId,
            semester: params.semester,
            programCode: params.programCode,
            examType: params.examType,
        })
    ) {
        return params.effectiveRestriction;
    }

    if (!params.automaticRestriction?.flags.belowKkm) {
        return params.effectiveRestriction;
    }

    if (params.effectiveRestriction.manualBlocked || params.automaticRestriction.flags.financeBlocked) {
        return params.effectiveRestriction;
    }

    return {
        ...params.effectiveRestriction,
        isBlocked: false,
        autoBlocked: false,
        reason: '',
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

    const [financePolicy, programScope, teacherAssignments, reportGrades, studentGrades, financeInvoices] = await Promise.all([
        resolveExamFinanceClearancePolicy({
            academicYearId: params.academicYearId,
            programCode: params.programCode,
            examType: params.examType,
        }),
        resolveEligibilityProgramScope({
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
    ]);

    const financeExceptionProgramCode =
        financePolicy.programCode || normalizeProgramCode(params.programCode || params.examType);
    const financeExceptions = financeExceptionProgramCode
        ? await prisma.homeroomBookEntry.findMany({
              where: {
                  studentId: { in: studentIds },
                  academicYearId: params.academicYearId,
                  entryType: HomeroomBookEntryType.EXAM_FINANCE_EXCEPTION,
                  status: HomeroomBookStatus.ACTIVE,
                  relatedSemester: params.semester,
                  relatedProgramCode: financeExceptionProgramCode,
              },
              select: {
                  id: true,
                  studentId: true,
              },
              orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          })
        : [];
    const financeExceptionStudentIds = new Set<number>();
    financeExceptions.forEach((entry) => {
        if (financeExceptionStudentIds.has(entry.studentId)) return;
        financeExceptionStudentIds.add(entry.studentId);
    });

    const assignmentBySubjectId = new Map<number, EligibilityAssignmentSubject>();
    teacherAssignments.forEach((assignment) => {
        const subjectId = Number(assignment.subjectId);
        const kkm = Number(assignment.kkm);
        if (!Number.isFinite(subjectId) || subjectId <= 0) return;
        if (!Number.isFinite(kkm) || kkm <= 0) return;
        assignmentBySubjectId.set(subjectId, {
            kkm,
            subjectName: String(assignment.subject?.name || `Mapel ${subjectId}`),
            subjectCategoryCode: normalizeAliasCode(assignment.subject?.category?.code) || null,
        });
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

    const belowKkmByStudent = new Map<number, AutomaticExamRestrictionBelowKkmSubject[]>();
    studentIds.forEach((studentId) => {
        assignmentBySubjectId.forEach((assignment, subjectId) => {
            if (
                !isSubjectAllowedForProgram({
                    scope: programScope,
                    subjectId,
                    subjectCategoryCode: assignment.subjectCategoryCode,
                })
            ) {
                return;
            }
            const key = `${studentId}:${subjectId}`;
            const resolvedScore = resolveEligibilityScore({
                scope: programScope,
                reportGrade: reportGradeMap.get(key) || null,
                studentGrades: studentGradesBySubject.get(key) || [],
            });

            if (resolvedScore === null) return;
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
        const financeExceptionGranted = financeEvaluation.blocked && financeExceptionStudentIds.has(studentId);

        const flags: AutomaticExamRestrictionFlags = {
            belowKkm: belowKkmSubjects.length > 0,
            financeOutstanding: financeEvaluation.hasOutstanding,
            financeOverdue: financeEvaluation.hasOverdue,
            financeBlocked: financeEvaluation.blocked && !financeExceptionGranted,
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

    await createInAppNotification({
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
const SBTS_LOAD_TEST_BYPASS_ENABLED = String(process.env.SBTS_LOAD_TEST_BYPASS_ENABLED || 'false')
    .trim()
    .toLowerCase() === 'true';
const SBTS_LOAD_TEST_BYPASS_SECRET = String(process.env.SBTS_LOAD_TEST_BYPASS_SECRET || '').trim();
const SBTS_LOAD_TEST_BYPASS_HEADER_NAME = 'x-sbts-load-test-secret';
const SBTS_LOAD_TEST_BYPASS_PROGRAM_CODE = 'SBTS';
const SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID = Number.isFinite(
    Number.parseInt(String(process.env.SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID || '').trim(), 10),
)
    ? Number.parseInt(String(process.env.SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID || '').trim(), 10)
    : null;
const SBTS_LOAD_TEST_BYPASS_SEMESTER = (() => {
    const raw = String(process.env.SBTS_LOAD_TEST_BYPASS_SEMESTER || '')
        .trim()
        .toUpperCase();
    if (raw === 'ODD' || raw === 'GANJIL') return Semester.ODD;
    if (raw === 'EVEN' || raw === 'GENAP') return Semester.EVEN;
    return null;
})();
const JWT_SIGNING_SECRET = String(process.env.JWT_SECRET || 'secret').trim();
const EXAM_BROWSER_CONSUMED_TOKEN_CACHE_TTL_MS = EXAM_BROWSER_LAUNCH_TTL_SECONDS * 1000 + 60_000;
const consumedExamBrowserLaunchTokens = new Map<string, number>();
type StartExamSchedulePayload = {
    id: number;
    classId: number | null;
    jobVacancyId: number | null;
    startTime: Date;
    endTime: Date;
    examType: string | null;
    isActive: boolean;
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

type ManualExamMakeupAccessSummary = {
    id: number;
    startTime: Date;
    endTime: Date;
    reason: string | null;
    isActive: boolean;
};

type ResolvedExamMakeupContext = {
    mode: 'AUTO' | 'FORMAL' | null;
    accessId: number | null;
    availableNow: boolean;
    scheduled: boolean;
    expired: boolean;
    startTime: Date | null;
    endTime: Date | null;
    reason: string | null;
};

function resolveExamMakeupContext(params: {
    now: Date;
    hasSessionAttempt: boolean;
    manualAccess?: ManualExamMakeupAccessSummary | null;
}): ResolvedExamMakeupContext {
    if (params.hasSessionAttempt) {
        return {
            mode: null,
            accessId: null,
            availableNow: false,
            scheduled: false,
            expired: false,
            startTime: null,
            endTime: null,
            reason: null,
        };
    }

    const manualAccess = params.manualAccess;
    if (manualAccess && manualAccess.isActive) {
        const startsAt = manualAccess.startTime;
        const endsAt = manualAccess.endTime;
        return {
            mode: 'FORMAL',
            accessId: manualAccess.id,
            availableNow: params.now >= startsAt && params.now <= endsAt,
            scheduled: params.now < startsAt,
            expired: params.now > endsAt,
            startTime: startsAt,
            endTime: endsAt,
            reason: manualAccess.reason || null,
        };
    }

    return {
        mode: null,
        accessId: null,
        availableNow: false,
        scheduled: false,
        expired: false,
        startTime: null,
        endTime: null,
        reason: null,
    };
}

async function loadStartExamSchedule(scheduleId: number): Promise<StartExamSchedulePayload | null> {
    const schedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        select: {
            id: true,
            classId: true,
            jobVacancyId: true,
            startTime: true,
            endTime: true,
            examType: true,
            isActive: true,
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

function resolveEffectiveSessionStatus(
    status: unknown,
    answers?: unknown,
    submitTime?: unknown,
): 'COMPLETED' | 'TIMEOUT' | 'IN_PROGRESS' | 'NOT_STARTED' | string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED' || normalized === 'TIMEOUT') return normalized;

    const monitoring = extractMonitoringSummaryFromAnswers(answers);
    if (monitoring.totalViolations >= 4) return 'TIMEOUT';
    if (normalized === 'IN_PROGRESS' && submitTime) return 'COMPLETED';
    if (normalized === 'IN_PROGRESS' || normalized === 'NOT_STARTED') return normalized;
    return normalized || 'NOT_STARTED';
}

function getSessionPriority(sessionLike: { status?: unknown; answers?: unknown; submitTime?: unknown } | unknown): number {
    const normalized =
        sessionLike && typeof sessionLike === 'object'
            ? resolveEffectiveSessionStatus(
                  (sessionLike as { status?: unknown }).status,
                  (sessionLike as { answers?: unknown }).answers,
                  (sessionLike as { submitTime?: unknown }).submitTime,
              )
            : String(sessionLike || '').toUpperCase();
    if (normalized === 'COMPLETED') return 5;
    if (normalized === 'TIMEOUT') return 4;
    if (normalized === 'IN_PROGRESS') return 3;
    if (normalized === 'NOT_STARTED') return 2;
    return 1;
}

function pickBestSession<
    T extends { status?: unknown; answers?: unknown; updatedAt?: unknown; submitTime?: unknown; startTime?: unknown },
>(
    sessions: T[] | null | undefined,
): T | null {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const sorted = [...sessions].sort((a, b) => {
        const rankDiff = getSessionPriority(b) - getSessionPriority(a);
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
    if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some((item) => hasAnswerValue(item));
    }
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
    delete cleaned.reviewFeedback;
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

    if (Array.isArray(source.matrixColumns)) {
        cleaned.matrixColumns = source.matrixColumns.map((column) =>
            column && typeof column === 'object' ? { ...(column as Record<string, unknown>) } : column,
        );
    }

    if (Array.isArray(source.matrixPromptColumns)) {
        cleaned.matrixPromptColumns = source.matrixPromptColumns.map((column) =>
            column && typeof column === 'object' ? { ...(column as Record<string, unknown>) } : column,
        );
    }

    if (Array.isArray(source.matrixRows)) {
        cleaned.matrixRows = source.matrixRows.map((row) => {
            if (!row || typeof row !== 'object') return row;
            const safeRow: Record<string, unknown> = { ...(row as Record<string, unknown>) };
            delete safeRow.correctOptionId;
            delete safeRow.correctColumnId;
            delete safeRow.answerKey;
            if (Array.isArray(safeRow.cells)) {
                safeRow.cells = safeRow.cells.map((cell) =>
                    cell && typeof cell === 'object' ? { ...(cell as Record<string, unknown>) } : cell,
                );
            }
            return safeRow;
        });
    }

    const cleanedMetadata = asRecord(cleaned.metadata);
    if (cleanedMetadata?.reviewFeedback) {
        delete cleanedMetadata.reviewFeedback;
    }
    if (cleanedMetadata && Array.isArray(cleanedMetadata.matrixRows)) {
        cleanedMetadata.matrixRows = cleanedMetadata.matrixRows.map((row) => {
            if (!row || typeof row !== 'object') return row;
            const safeRow: Record<string, unknown> = { ...(row as Record<string, unknown>) };
            delete safeRow.correctOptionId;
            delete safeRow.correctColumnId;
            delete safeRow.answerKey;
            if (Array.isArray(safeRow.cells)) {
                safeRow.cells = safeRow.cells.map((cell) =>
                    cell && typeof cell === 'object' ? { ...(cell as Record<string, unknown>) } : cell,
                );
            }
            return safeRow;
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

function isCurriculumManagedPacketDescription(rawDescription: unknown): boolean {
    return String(rawDescription || '').trim() === AUTO_CURRICULUM_PACKET_DESCRIPTION;
}

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
    authorId: number;
    subjectId: number;
    programCode: string;
    dateKey: string;
}): string {
    return `${params.academicYearId}:${params.authorId}:${params.subjectId}:${params.programCode}:${params.dateKey}`;
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
    sessionId?: number | null;
    sessionLabel?: string | null;
}): Promise<{
    id: number;
    authorId: number;
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
    const normalizedSessionId =
        Number.isFinite(Number(params.sessionId)) && Number(params.sessionId) > 0 ? Number(params.sessionId) : null;
    const normalizedSessionLabel = normalizeSessionLabelKey(params.sessionLabel);
    const scheduleSessionWhere: Prisma.ExamScheduleWhereInput = normalizedSessionId
        ? { sessionId: normalizedSessionId }
        : normalizedSessionLabel
          ? {
                OR: [
                    { sessionId: null, sessionLabel: { equals: normalizedSessionLabel, mode: 'insensitive' } },
                    { sessionLabel: { equals: normalizedSessionLabel, mode: 'insensitive' } },
                ],
            }
          : {
                sessionId: null,
                sessionLabel: null,
            };
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
                ...scheduleSessionWhere,
            },
        },
    };

    return prisma.examPacket.findFirst({
        where: packetWhere,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            authorId: true,
            subjectId: true,
            academicYearId: true,
            semester: true,
            type: true,
            programCode: true,
        },
    });
}

function inferCurriculumManagedPacketKkm(
    assignmentRows: Array<{
        teacherId?: number | null;
        classId?: number | null;
        kkm?: number | null;
    }>,
    teacherId?: number | null,
): number {
    const normalizedTeacherId =
        Number.isFinite(Number(teacherId)) && Number(teacherId) > 0 ? Number(teacherId) : null;
    const candidateRows =
        normalizedTeacherId === null
            ? assignmentRows
            : assignmentRows.filter((row) => Number(row.teacherId || 0) === normalizedTeacherId);
    const values = candidateRows
        .map((row) => Number(row.kkm))
        .filter((value): value is number => Number.isFinite(value) && value > 0);
    if (values.length === 0) return 75;

    const frequencies = new Map<number, number>();
    values.forEach((value) => {
        frequencies.set(value, (frequencies.get(value) || 0) + 1);
    });
    const ranked = Array.from(frequencies.entries()).sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return right[0] - left[0];
    });
    return ranked[0]?.[0] ?? 75;
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
            authorId: true,
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
                authorId: Number(packet.authorId || 0),
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
                    authorId: true,
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
            authorId: Number(schedule.packet?.authorId || 0),
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
    scheduleClassId?: number | null;
    jobVacancyId?: number | null;
    academicYearId: number;
    accessRole: ExamAccessRole;
    programCode?: string | null;
    fallbackExamType?: string | null;
}): Promise<{ classId: number; studentStatus: string | null } | null> {
    if (params.accessRole === 'STUDENT') {
        const student = await prisma.user.findUnique({
            where: { id: params.userId },
            select: {
                classId: true,
                studentStatus: true,
            },
        });

        if (!student) {
            throw new ApiError(404, 'Siswa tidak ditemukan.');
        }

        if (student.studentStatus && student.studentStatus !== 'ACTIVE') {
            throw new ApiError(403, 'Akun siswa tidak aktif untuk mengikuti ujian.');
        }

        const studentClassId = Number(student.classId || 0);
        const scheduleClassId = Number(params.scheduleClassId || 0);
        if (!Number.isFinite(studentClassId) || studentClassId <= 0) {
            throw new ApiError(400, 'Siswa belum terhubung ke kelas aktif.');
        }
        if (!Number.isFinite(scheduleClassId) || scheduleClassId <= 0 || scheduleClassId !== studentClassId) {
            throw new ApiError(403, 'Ujian ini tidak tersedia untuk kelas Anda.');
        }

        return {
            classId: studentClassId,
            studentStatus: student.studentStatus || null,
        };
    }

    if (params.accessRole === 'CALON_SISWA') {
        const scopeConfig = await resolveProgramScopeConfig({
            academicYearId: params.academicYearId,
            programCode: params.programCode || params.fallbackExamType || null,
        });

        if (!scopeConfig || !hasProgramTargetAudience(scopeConfig.targetClassLevels, PROGRAM_TARGET_CANDIDATE)) {
            throw new ApiError(403, 'Ujian ini tidak tersedia untuk calon siswa.');
        }
        return null;
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

        return null;
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

async function resolveAcademicScheduleActor(req: Request) {
    const authUser = (req as Request & { user?: { id?: number | string; role?: string } }).user;
    const authUserId = Number(authUser?.id || 0);
    const authRole = String(authUser?.role || '').trim().toUpperCase();

    if (authRole === 'ADMIN') {
        return {
            userId: authUserId,
            role: authRole,
            isTeacher: false,
            isCurriculumManager: true,
        };
    }

    if (authRole !== 'TEACHER' || !Number.isFinite(authUserId) || authUserId <= 0) {
        return {
            userId: authUserId,
            role: authRole,
            isTeacher: false,
            isCurriculumManager: false,
        };
    }

    const profile = await prisma.user.findUnique({
        where: { id: authUserId },
        select: { additionalDuties: true },
    });
    const duties = (profile?.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());

    return {
        userId: authUserId,
        role: authRole,
        isTeacher: true,
        isCurriculumManager:
            duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM'),
    };
}

async function assertAcademicExamScheduleManagementAccess(
    req: Request,
    options: {
        programCode?: unknown;
        packetAuthorId?: unknown;
        allowPacketAuthorForNonScheduled?: boolean;
    },
) {
    const actor = await resolveAcademicScheduleActor(req);
    if (actor.role === 'ADMIN' || actor.isCurriculumManager) return;

    const isNonScheduledProgram = isNonScheduledExamProgramCode(options.programCode);
    const packetAuthorId = Number(options.packetAuthorId || 0);
    if (
        actor.isTeacher &&
        isNonScheduledProgram &&
        options.allowPacketAuthorForNonScheduled &&
        Number.isFinite(packetAuthorId) &&
        packetAuthorId > 0 &&
        packetAuthorId === actor.userId
    ) {
        return;
    }

    if (isNonScheduledProgram) {
        throw new ApiError(
            403,
            'Jadwal Ulangan Harian (UH/Formatif) hanya bisa diatur oleh guru pemilik packet atau tim kurikulum.',
        );
    }

    throw new ApiError(403, 'Jadwal ujian akademik hanya bisa diatur oleh Wakasek/sekretaris kurikulum.');
}

type FormalMakeupManagedSchedule = {
    id: number;
    classId: number | null;
    academicYearId: number | null;
    startTime: Date;
    endTime: Date;
    examType: string | null;
    class: { id: number; name: string } | null;
    packet: {
        id: number;
        title: string;
        type: ExamType;
        programCode: string | null;
        academicYearId: number;
        semester: Semester;
        subject: {
            id: number;
            name: string;
            code: string;
        };
        authorId: number;
    } | null;
};

async function loadFormalMakeupManagedSchedule(scheduleId: number): Promise<FormalMakeupManagedSchedule | null> {
    return prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        select: {
            id: true,
            classId: true,
            academicYearId: true,
            startTime: true,
            endTime: true,
            examType: true,
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
            packet: {
                select: {
                    id: true,
                    title: true,
                    type: true,
                    programCode: true,
                    academicYearId: true,
                    semester: true,
                    authorId: true,
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
}

function assertFormalMakeupSupportedSchedule(
    schedule: FormalMakeupManagedSchedule | null,
): asserts schedule is FormalMakeupManagedSchedule & {
    classId: number;
    class: { id: number; name: string };
    packet: NonNullable<FormalMakeupManagedSchedule['packet']>;
} {
    if (!schedule) {
        throw new ApiError(404, 'Jadwal ujian tidak ditemukan.');
    }
    if (!schedule.classId || !schedule.class) {
        throw new ApiError(400, 'Ujian susulan formal hanya tersedia untuk jadwal siswa berbasis kelas.');
    }
    if (!schedule.packet) {
        throw new ApiError(400, 'Jadwal ini belum memiliki packet ujian yang valid.');
    }
    if (!Number.isFinite(Number(schedule.packet.academicYearId || schedule.academicYearId || 0))) {
        throw new ApiError(400, 'Tahun ajaran jadwal tidak valid untuk pengelolaan susulan.');
    }
}

function resolveFormalMakeupAccessState(
    now: Date,
    access: {
        isActive: boolean;
        startTime: Date;
        endTime: Date;
        revokedAt?: Date | null;
    } | null,
): 'NONE' | 'UPCOMING' | 'OPEN' | 'EXPIRED' | 'REVOKED' {
    if (!access) return 'NONE';
    if (!access.isActive || access.revokedAt) return 'REVOKED';
    if (now < access.startTime) return 'UPCOMING';
    if (now > access.endTime) return 'EXPIRED';
    return 'OPEN';
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

function resolveOptionalSchedulePeriodNumber(raw: unknown): number | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return null;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ApiError(400, 'Jam ke tidak valid.');
    }

    return parsed;
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
                baseTypeCode: true,
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
        return {
            programCode: config.code,
            baseType: resolveCanonicalProgramBaseType({
                programCode: config.code,
                baseType: config.baseType,
                baseTypeCode: config.baseTypeCode || null,
            }),
        };
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
                baseTypeCode: true,
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
            return {
                programCode: config.code,
                baseType: resolveCanonicalProgramBaseType({
                    programCode: config.code,
                    baseType: config.baseType,
                    baseTypeCode: config.baseTypeCode || null,
                }),
            };
        }
    }

    const legacyType = normalizePacketType(params.legacyType);

    const matchingPrograms = await prisma.examProgramConfig.findMany({
        where: {
            academicYearId: params.academicYearId,
            OR: [
                { baseType: legacyType },
                { baseTypeCode: normalizeAliasCode(legacyType) || legacyType },
                { code: normalizeProgramCode(params.legacyType) || String(legacyType) },
            ],
            isActive: true,
        },
        select: {
            code: true,
            baseType: true,
            baseTypeCode: true,
            fixedSemester: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });

    const candidate =
        matchingPrograms.find((item) => !item.fixedSemester || item.fixedSemester === params.semester) ||
        matchingPrograms[0];

    if (candidate) {
        assertProgramFixedSemesterCompatibility(candidate.code, candidate.fixedSemester, params.semester);
        return {
            programCode: candidate.code,
            baseType: resolveCanonicalProgramBaseType({
                programCode: candidate.code,
                baseType: candidate.baseType,
                baseTypeCode: candidate.baseTypeCode || null,
            }),
        };
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

type ExamQuestionReviewFeedback = {
    questionComment?: string;
    blueprintComment?: string;
    questionCardComment?: string;
    teacherResponse?: string;
    reviewedAt?: string;
    teacherRespondedAt?: string;
    reviewer?: {
        id?: number;
        name?: string;
    };
    teacherResponder?: {
        id?: number;
        name?: string;
    };
};

type ExamQuestionMatrixColumn = {
    id: string;
    content: string;
};

type ExamQuestionMatrixPromptColumn = {
    id: string;
    label: string;
};

type ExamQuestionMatrixRowCell = {
    columnId: string;
    content: string;
};

type ExamQuestionMatrixRow = {
    id: string;
    content: string;
    cells?: ExamQuestionMatrixRowCell[];
    correctOptionId?: string;
};

type NormalizedExamQuestion = {
    id: string;
    type: string;
    content: string;
    score: number;
    options?: unknown[];
    matrixPromptColumns?: ExamQuestionMatrixPromptColumn[];
    matrixColumns?: ExamQuestionMatrixColumn[];
    matrixRows?: ExamQuestionMatrixRow[];
    answerKey?: string;
    question_image_url?: string;
    question_video_url?: string;
    question_video_type?: string;
    question_media_position?: string;
    blueprint?: ExamQuestionBlueprint;
    questionCard?: ExamQuestionCard;
    itemAnalysis?: ExamQuestionItemAnalysis;
    reviewFeedback?: ExamQuestionReviewFeedback;
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

const EXAM_SUPPORT_PLACEHOLDER_WORDS = new Set([
    '-',
    '--',
    '---',
    '_',
    '__',
    '___',
    '...',
    '..',
    '/',
    'n/a',
    'na',
    'nihil',
    'kosong',
    'belum ada',
    'belum diisi',
    'belum dibuat',
    'tidak ada',
    'none',
    'null',
]);

const EXAM_SUPPORT_PLACEHOLDER_SYMBOL_PATTERN = /^[-–—_=+~./\\|,:;()[\]{}'"`*•]+$/;

function stripExamSupportText(value: unknown): string {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p>/gi, '\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/(p|div|ul|ol|table|tr|section|article|blockquote)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function hasMeaningfulExamSupportText(value: unknown): boolean {
    const normalized = stripExamSupportText(value)
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    if (!normalized) return false;
    if (EXAM_SUPPORT_PLACEHOLDER_WORDS.has(normalized)) return false;
    if (EXAM_SUPPORT_PLACEHOLDER_SYMBOL_PATTERN.test(normalized)) return false;
    return true;
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

function isMatrixSingleChoiceType(rawType: unknown): boolean {
    return String(rawType || '').trim().toUpperCase() === 'MATRIX_SINGLE_CHOICE';
}

function normalizeQuestionMatrixColumns(raw: unknown): ExamQuestionMatrixColumn[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const columns: ExamQuestionMatrixColumn[] = [];
    raw.forEach((item, index) => {
        const source = asRecord(item);
        if (!source) return;
        const content = normalizeOptionalString(
            source.content ?? source.text ?? source.label ?? source.optionText,
            500,
        );
        if (!content) return;
        columns.push({
            id: normalizeOptionalString(source.id, 100) || `matrix-col-${index + 1}`,
            content,
        });
    });

    return columns.length > 0 ? columns : undefined;
}

function normalizeQuestionMatrixPromptColumns(raw: unknown): ExamQuestionMatrixPromptColumn[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const columns: ExamQuestionMatrixPromptColumn[] = [];
    raw.forEach((item, index) => {
        const source = asRecord(item);
        if (!source) return;
        const label = normalizeOptionalString(source.label ?? source.content ?? source.text ?? source.title, 500);
        if (!label) return;
        columns.push({
            id: normalizeOptionalString(source.id, 100) || `matrix-prompt-col-${index + 1}`,
            label,
        });
    });

    return columns.length > 0 ? columns : undefined;
}

function normalizeQuestionMatrixRowCells(
    raw: unknown,
    validPromptColumnIds?: Set<string>,
): ExamQuestionMatrixRowCell[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const cells: ExamQuestionMatrixRowCell[] = [];
    raw.forEach((item) => {
        const source = asRecord(item);
        if (!source) return;
        const columnId = normalizeOptionalString(source.columnId ?? source.promptColumnId, 100);
        const content = normalizeOptionalString(source.content ?? source.text ?? source.value, 1000);
        if (!columnId || !content) return;
        if (validPromptColumnIds && !validPromptColumnIds.has(columnId)) return;
        cells.push({ columnId, content });
    });

    return cells.length > 0 ? cells : undefined;
}

function normalizeQuestionMatrixRows(
    raw: unknown,
    validPromptColumnIds?: Set<string>,
    validColumnIds?: Set<string>,
): ExamQuestionMatrixRow[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const rows: ExamQuestionMatrixRow[] = [];
    raw.forEach((item, index) => {
        const source = asRecord(item);
        if (!source) return;
        const content = normalizeOptionalString(
            source.content ?? source.text ?? source.label ?? source.statement,
            1000,
        );
        const cells = normalizeQuestionMatrixRowCells(source.cells, validPromptColumnIds) || [];
        if (!content && cells.length === 0) return;
        const correctOptionId = normalizeOptionalString(
            source.correctOptionId ?? source.correctColumnId ?? source.answerKey,
            100,
        );
        rows.push({
            id: normalizeOptionalString(source.id, 100) || `matrix-row-${index + 1}`,
            content: content || '',
            cells,
            correctOptionId:
                correctOptionId && (!validColumnIds || validColumnIds.has(correctOptionId))
                    ? correctOptionId
                    : undefined,
        });
    });

    return rows.length > 0 ? rows : undefined;
}

function resolveQuestionMatrixColumns(question: Record<string, unknown>): ExamQuestionMatrixColumn[] {
    const metadata = asRecord(question.metadata);
    return (
        normalizeQuestionMatrixColumns(
            question.matrixColumns ??
                question.matrix_columns ??
                metadata?.matrixColumns ??
                metadata?.matrix_columns,
        ) || []
    );
}

function resolveQuestionMatrixPromptColumns(question: Record<string, unknown>): ExamQuestionMatrixPromptColumn[] {
    const metadata = asRecord(question.metadata);
    return (
        normalizeQuestionMatrixPromptColumns(
            question.matrixPromptColumns ??
                question.matrix_prompt_columns ??
                metadata?.matrixPromptColumns ??
                metadata?.matrix_prompt_columns,
        ) || []
    );
}

function resolveQuestionMatrixRows(question: Record<string, unknown>): ExamQuestionMatrixRow[] {
    const metadata = asRecord(question.metadata);
    const promptColumns = resolveQuestionMatrixPromptColumns(question);
    const columns = resolveQuestionMatrixColumns(question);
    const validPromptColumnIds = new Set(promptColumns.map((column) => column.id));
    const validColumnIds = new Set(columns.map((column) => column.id));
    return (
        normalizeQuestionMatrixRows(
            question.matrixRows ??
                question.matrix_rows ??
                metadata?.matrixRows ??
                metadata?.matrix_rows,
            validPromptColumnIds,
            validColumnIds,
        ) || []
    );
}

function buildMatrixRowDisplayText(
    row: ExamQuestionMatrixRow,
    promptColumns: ExamQuestionMatrixPromptColumn[],
): string {
    const normalizedCells = Array.isArray(row.cells) ? row.cells : [];
    const rowContent = String(row.content || '').trim();
    if (normalizedCells.length > 0) {
        const parts = promptColumns
            .map((column, index) => {
                const cell = normalizedCells.find((item) => String(item.columnId || '').trim() === column.id);
                const content = String(cell?.content || '').trim();
                if (!content) return index === 0 && rowContent ? `${column.label}: ${rowContent}` : null;
                return `${column.label}: ${content}`;
            })
            .filter((item): item is string => Boolean(item));
        if (parts.length > 0) return parts.join(' | ');
    }
    return rowContent || 'Baris tanpa isi';
}

function decodeQuestionHtmlToText(value: unknown): string {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p>/gi, '\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/(p|div|ul|ol|table|tr|section|article|blockquote)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function getQuestionOptionLabel(index: number): string {
    const normalizedIndex = Math.max(0, Number(index) || 0);
    return String.fromCharCode(65 + (normalizedIndex % 26));
}

function normalizeQuestionCardOption(option: unknown, index: number): {
    id?: string;
    text: string;
    isCorrect: boolean;
    imageUrl?: string;
    label: string;
} {
    const source = asRecord(option);
    const text = decodeQuestionHtmlToText(
        source?.content ?? source?.text ?? source?.label ?? source?.optionText ?? source?.value ?? '',
    );
    return {
        id: source?.id ? String(source.id) : undefined,
        text,
        isCorrect: Boolean(source?.isCorrect),
        imageUrl: normalizeOptionalString(source?.image_url ?? source?.option_image_url, 2048),
        label: getQuestionOptionLabel(index),
    };
}

function buildDerivedQuestionStimulus(question: NormalizedExamQuestion): string | undefined {
    const lines: string[] = [];
    const questionText = decodeQuestionHtmlToText(question.content);
    if (questionText) lines.push(questionText);

    if (question.question_image_url) {
        lines.push(`Media soal: ${question.question_image_url}`);
    }
    if (question.question_video_url) {
        lines.push(`Video soal: ${question.question_video_url}`);
    }

    if (isMatrixSingleChoiceType(question.type)) {
        const questionRecord = question as unknown as Record<string, unknown>;
        const matrixPromptColumns = resolveQuestionMatrixPromptColumns(questionRecord);
        const matrixColumns = resolveQuestionMatrixColumns(questionRecord);
        const matrixRows = resolveQuestionMatrixRows(questionRecord);

        if (matrixColumns.length > 0) {
            lines.push(
                [
                    'Pilihan jawaban:',
                    ...matrixColumns.map((column, index) => `${index + 1}. ${column.content}`),
                ].join('\n'),
            );
        }

        if (matrixPromptColumns.length > 0) {
            lines.push(
                [
                    'Kolom data:',
                    ...matrixPromptColumns.map((column, index) => `${index + 1}. ${column.label}`),
                ].join('\n'),
            );
        }

        if (matrixRows.length > 0) {
            lines.push(
                [
                    'Baris grid:',
                    ...matrixRows.map((row, index) => `${index + 1}. ${buildMatrixRowDisplayText(row, matrixPromptColumns)}`),
                ].join('\n'),
            );
        }
    } else {
        const optionLines = (Array.isArray(question.options) ? question.options : [])
            .map((option, index) => normalizeQuestionCardOption(option, index))
            .map((option) => {
                const parts = [`${option.label}. ${option.text || 'Opsi tanpa teks'}`];
                if (option.imageUrl) {
                    parts.push(`Media opsi ${option.label}: ${option.imageUrl}`);
                }
                return parts.join('\n');
            })
            .filter(Boolean);

        if (optionLines.length > 0) {
            lines.push(optionLines.join('\n'));
        }
    }

    const normalized = lines.filter(Boolean).join('\n\n').trim();
    return normalized || undefined;
}

function buildDerivedQuestionAnswerKey(question: NormalizedExamQuestion): string | undefined {
    if (String(question.type || '').toUpperCase() === 'ESSAY') {
        return 'Jawaban esai diperiksa manual oleh guru.';
    }

    if (isMatrixSingleChoiceType(question.type)) {
        const questionRecord = question as unknown as Record<string, unknown>;
        const matrixPromptColumns = resolveQuestionMatrixPromptColumns(questionRecord);
        const matrixColumns = resolveQuestionMatrixColumns(questionRecord);
        const matrixRows = resolveQuestionMatrixRows(questionRecord);
        const columnContentById = new Map(matrixColumns.map((column) => [column.id, column.content]));
        const lines = matrixRows
            .filter((row) => row.correctOptionId)
            .map((row, index) => {
                const columnContent = columnContentById.get(String(row.correctOptionId || '').trim()) || '-';
                return `${index + 1}. ${buildMatrixRowDisplayText(row, matrixPromptColumns)} -> ${columnContent}`;
            });
        return lines.length > 0 ? lines.join('\n\n').trim() : undefined;
    }

    const options = (Array.isArray(question.options) ? question.options : []).map((option, index) =>
        normalizeQuestionCardOption(option, index),
    );
    if (options.length === 0) {
        return normalizeOptionalString(question.answerKey, 1000);
    }

    const explicitAnswerKeyIds = String(question.answerKey || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const correctOptions = options.filter((option) =>
        explicitAnswerKeyIds.length > 0
            ? Boolean(option.id && explicitAnswerKeyIds.includes(option.id))
            : option.isCorrect,
    );

    if (correctOptions.length === 0) {
        return normalizeOptionalString(question.answerKey, 1000);
    }

    const lines = correctOptions.map((option) => {
        const parts = [`${option.label}. ${option.text || 'Opsi benar tanpa teks'}`];
        if (option.imageUrl) {
            parts.push(`Media opsi ${option.label}: ${option.imageUrl}`);
        }
        return parts.join('\n');
    });

    return lines.join('\n\n').trim() || undefined;
}

function buildDerivedQuestionCard(question: NormalizedExamQuestion): ExamQuestionCard | undefined {
    const blueprint = question.blueprint || {};
    const normalized: ExamQuestionCard = {
        stimulus: buildDerivedQuestionStimulus(question),
        answerRationale: normalizeOptionalString(blueprint.indicator, 2000),
        scoringGuideline: buildDerivedQuestionAnswerKey(question),
        distractorNotes: normalizeOptionalString(blueprint.cognitiveLevel, 2000),
    };

    return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function isBlueprintSupportComplete(raw: ExamQuestionBlueprint | undefined): boolean {
    const blueprint = normalizeBlueprint(raw);
    return Boolean(
        hasMeaningfulExamSupportText(blueprint?.competency) &&
            hasMeaningfulExamSupportText(blueprint?.learningObjective) &&
            hasMeaningfulExamSupportText(blueprint?.indicator) &&
            hasMeaningfulExamSupportText(blueprint?.materialScope) &&
            hasMeaningfulExamSupportText(blueprint?.cognitiveLevel),
    );
}

function isQuestionCardSupportComplete(raw: ExamQuestionCard | undefined): boolean {
    const questionCard = normalizeQuestionCard(raw);
    return Boolean(
        hasMeaningfulExamSupportText(questionCard?.stimulus) &&
            hasMeaningfulExamSupportText(questionCard?.answerRationale) &&
            hasMeaningfulExamSupportText(questionCard?.scoringGuideline) &&
            hasMeaningfulExamSupportText(questionCard?.distractorNotes),
    );
}

function normalizeReviewFeedback(raw: unknown): ExamQuestionReviewFeedback | undefined {
    const source = asRecord(raw);
    if (!source) return undefined;

    const reviewerSource = asRecord(source.reviewer);
    const normalized: ExamQuestionReviewFeedback = {
        questionComment: normalizeOptionalString(source.questionComment, 2000),
        blueprintComment: normalizeOptionalString(source.blueprintComment, 2000),
        questionCardComment: normalizeOptionalString(source.questionCardComment, 2000),
        teacherResponse: normalizeOptionalString(source.teacherResponse, 2000),
        reviewedAt: normalizeOptionalString(source.reviewedAt, 100),
        teacherRespondedAt: normalizeOptionalString(source.teacherRespondedAt, 100),
        reviewer:
            reviewerSource || source.reviewerId || source.reviewerName
                ? {
                      id: normalizeOptionalNumber(reviewerSource?.id ?? source.reviewerId),
                      name: normalizeOptionalString(reviewerSource?.name ?? source.reviewerName, 200),
                  }
                : undefined,
        teacherResponder:
            asRecord(source.teacherResponder) || source.teacherResponderId || source.teacherResponderName
                ? {
                      id: normalizeOptionalNumber(asRecord(source.teacherResponder)?.id ?? source.teacherResponderId),
                      name: normalizeOptionalString(
                          asRecord(source.teacherResponder)?.name ?? source.teacherResponderName,
                          200,
                      ),
                  }
                : undefined,
    };

    if (
        !normalized.questionComment &&
        !normalized.blueprintComment &&
        !normalized.questionCardComment &&
        !normalized.teacherResponse
    ) {
        return undefined;
    }

    return normalized;
}

function summarizePacketSupport(questionPayload: unknown): {
    questionPoolCount: number;
    blueprintCount: number;
    questionCardCount: number;
} {
    const questions = Array.isArray(questionPayload) ? questionPayload : [];
    let blueprintCount = 0;
    let questionCardCount = 0;

    questions.forEach((question, index) => {
        try {
            const normalizedQuestion = normalizeExamQuestionPayload(question, index);
            if (isBlueprintSupportComplete(normalizedQuestion.blueprint)) {
                blueprintCount += 1;
            }
            if (isQuestionCardSupportComplete(normalizedQuestion.questionCard)) {
                questionCardCount += 1;
            }
        } catch {
            // Abaikan butir yang tidak valid agar summary kesiapan tidak memutus list jadwal.
        }
    });

    return {
        questionPoolCount: questions.length,
        blueprintCount,
        questionCardCount,
    };
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
    const blueprint = normalizeBlueprint(source.blueprint ?? metadata?.blueprint);
    const normalizedType = String(source.type || source.question_type || 'MULTIPLE_CHOICE')
        .trim()
        .toUpperCase();
    const matrixPromptColumns = normalizeQuestionMatrixPromptColumns(
        source.matrixPromptColumns ??
            source.matrix_prompt_columns ??
            metadata?.matrixPromptColumns ??
            metadata?.matrix_prompt_columns,
    );
    const matrixColumns = normalizeQuestionMatrixColumns(
        source.matrixColumns ?? source.matrix_columns ?? metadata?.matrixColumns ?? metadata?.matrix_columns,
    );
    const matrixRows = normalizeQuestionMatrixRows(
        source.matrixRows ?? source.matrix_rows ?? metadata?.matrixRows ?? metadata?.matrix_rows,
        new Set((matrixPromptColumns || []).map((column) => column.id)),
        new Set((matrixColumns || []).map((column) => column.id)),
    );
    const normalized: NormalizedExamQuestion = {
        id: String(source.id || `q-${index + 1}`),
        type: normalizedType,
        content: String(source.content || source.question_text || ''),
        score: scoreRaw && scoreRaw > 0 ? scoreRaw : 1,
        options:
            normalizedType === 'MATRIX_SINGLE_CHOICE'
                ? undefined
                : Array.isArray(source.options)
                  ? source.options
                  : undefined,
        matrixPromptColumns,
        matrixColumns,
        matrixRows,
        answerKey: normalizeOptionalString(source.answerKey, 255),
        question_image_url: normalizeOptionalString(source.question_image_url, 2048),
        question_video_url: normalizeOptionalString(source.question_video_url, 2048),
        question_video_type: normalizeOptionalString(source.question_video_type, 20),
        question_media_position: normalizeOptionalString(source.question_media_position, 20),
        blueprint,
        questionCard: undefined,
        itemAnalysis: normalizeItemAnalysis(source.itemAnalysis ?? metadata?.itemAnalysis),
        reviewFeedback: normalizeReviewFeedback(source.reviewFeedback ?? metadata?.reviewFeedback),
    };

    normalized.questionCard = buildDerivedQuestionCard(normalized);

    return normalized;
}

function normalizeQuestionsPayload(rawQuestions: unknown): NormalizedExamQuestion[] | undefined {
    if (!Array.isArray(rawQuestions)) return undefined;
    return rawQuestions.map((question, idx) => normalizeExamQuestionPayload(question, idx));
}

function stripQuestionSupportMetadata(
    questions: NormalizedExamQuestion[] | undefined,
): NormalizedExamQuestion[] | undefined {
    if (!questions) return undefined;
    return questions.map((question) => ({
        ...question,
        blueprint: undefined,
        questionCard: undefined,
    }));
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
    if (question.matrixPromptColumns?.length) metadata.matrixPromptColumns = question.matrixPromptColumns;
    if (question.matrixColumns?.length) metadata.matrixColumns = question.matrixColumns;
    if (question.matrixRows?.length) metadata.matrixRows = question.matrixRows;
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

function buildQuestionBankMatrixSignature(params: {
    matrixPromptColumns?: unknown;
    matrixColumns?: unknown;
    matrixRows?: unknown;
    metadata?: unknown;
}) {
    const metadata = asRecord(params.metadata);
    const promptColumns =
        normalizeQuestionMatrixPromptColumns(
            params.matrixPromptColumns ?? metadata?.matrixPromptColumns ?? metadata?.matrix_prompt_columns,
        ) || [];
    const columns =
        normalizeQuestionMatrixColumns(
            params.matrixColumns ?? metadata?.matrixColumns ?? metadata?.matrix_columns,
        ) || [];
    const rows =
        normalizeQuestionMatrixRows(
            params.matrixRows ?? metadata?.matrixRows ?? metadata?.matrix_rows,
            new Set(promptColumns.map((column) => column.id)),
            new Set(columns.map((column) => column.id)),
        ) || [];
    const columnContentById = new Map(
        columns.map((column) => [column.id, normalizeQuestionBankComparableText(column.content)]),
    );

    return {
        promptColumns: promptColumns.map((column) => normalizeQuestionBankComparableText(column.label)),
        columns: columns.map((column) => normalizeQuestionBankComparableText(column.content)),
        rows: rows.map((row, index) => ({
            text: normalizeQuestionBankComparableText(buildMatrixRowDisplayText(row, promptColumns)),
            correctColumn: row.correctOptionId
                ? columnContentById.get(String(row.correctOptionId || '').trim()) || ''
                : '',
            index,
        })),
    };
}

function buildQuestionBankSignature(params: {
    type: string;
    content: string;
    options?: unknown;
    matrixPromptColumns?: unknown;
    matrixColumns?: unknown;
    matrixRows?: unknown;
    metadata?: unknown;
}): string {
    const payload = JSON.stringify({
        type: String(params.type || '').trim().toUpperCase(),
        content: normalizeQuestionBankComparableText(params.content),
        options: normalizeQuestionBankOptionSignature(params.options),
        matrix: buildQuestionBankMatrixSignature(params),
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
            matrixPromptColumns: question.matrixPromptColumns,
            matrixColumns: question.matrixColumns,
            matrixRows: question.matrixRows,
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
                      metadata: true,
                  },
              })
            : [];

    const existingSignatures = new Set(
        existingCandidates.map((row) =>
            buildQuestionBankSignature({
                type: row.type,
                content: row.content,
                options: row.options ?? undefined,
                metadata: row.metadata ?? undefined,
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
    question: Record<string, unknown>;
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

function normalizeMatrixAnswerMap(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.entries(raw as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
        const normalizedKey = String(key || '').trim();
        const normalizedValue = String(value || '').trim();
        if (!normalizedKey || !normalizedValue) return acc;
        acc[normalizedKey] = normalizedValue;
        return acc;
    }, {});
}

function getCorrectMatrixAnswerMap(question: Record<string, unknown>): Record<string, string> {
    const rows = resolveQuestionMatrixRows(question);
    return rows.reduce<Record<string, string>>((acc, row) => {
        const normalizedRowId = String(row.id || '').trim();
        const normalizedColumnId = String(row.correctOptionId || '').trim();
        if (!normalizedRowId || !normalizedColumnId) return acc;
        acc[normalizedRowId] = normalizedColumnId;
        return acc;
    }, {});
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
    if (type === 'MATRIX_SINGLE_CHOICE') {
        const rows = resolveQuestionMatrixRows(question);
        if (rows.length === 0) return false;
        const answerMap = normalizeMatrixAnswerMap(rawAnswer);
        return rows.every((row) => Boolean(answerMap[String(row.id || '').trim()]));
    }
    return normalizeSelectedOptionIds(rawAnswer).length > 0;
}

function evaluateQuestionCorrectness(question: Record<string, unknown>, rawAnswer: unknown): boolean | null {
    const type = normalizeQuestionTypeForAnalysis(question);
    if (type === 'ESSAY') return null;
    if (type === 'MATRIX_SINGLE_CHOICE') {
        const correctAnswerMap = getCorrectMatrixAnswerMap(question);
        const requiredRowIds = Object.keys(correctAnswerMap);
        if (requiredRowIds.length === 0) return null;
        const answerMap = normalizeMatrixAnswerMap(rawAnswer);
        if (!requiredRowIds.every((rowId) => Boolean(answerMap[rowId]))) {
            return null;
        }
        return requiredRowIds.every((rowId) => answerMap[rowId] === correctAnswerMap[rowId]);
    }
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
    const effectiveSubjectMap = await resolveEffectivePacketSubjectsForPackets([packet]);
    const effectivePacketSubject = effectiveSubjectMap.get(packet.id) || toPacketDisplaySubject(packet.subject) || packet.subject;

    const questionsRaw = normalizePacketQuestionsForAnalysis(packet.questions);
    const questionAccumulators: AnalysisQuestionAccumulator[] = questionsRaw.map((question, index) => {
        const questionId = String(question.id || `q-${index + 1}`);
        const type = normalizeQuestionTypeForAnalysis(question);
        const scoreWeight = normalizeOptionalNumber(question.score) || 1;
        const rawOptions = type === 'MATRIX_SINGLE_CHOICE' ? [] : Array.isArray(question.options) ? question.options : [];
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
        const matrixCorrectAnswerMap = getCorrectMatrixAnswerMap(question);
        const evaluable =
            type !== 'ESSAY' &&
            (type === 'MATRIX_SINGLE_CHOICE'
                ? Object.keys(matrixCorrectAnswerMap).length > 0
                : correctOptionIds.length > 0);
        const contentHtml = normalizeQuestionContentHtml(question.content || question.question_text);
        const questionImageUrl = normalizeOptionalString(question.question_image_url, 2048) || null;
        const questionVideoUrl = normalizeOptionalString(question.question_video_url, 2048) || null;
        const questionVideoType = normalizeOptionalString(question.question_video_type, 20) || null;

        return {
            question,
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
            const selectedIds =
                item.type === 'MATRIX_SINGLE_CHOICE' ? [] : normalizeSelectedOptionIds(rawAnswer);
            const answered = isAnsweredForQuestion(item.question, rawAnswer);

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

            const isCorrect = evaluateQuestionCorrectness(item.question, rawAnswer) === true;
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
            subject: effectivePacketSubject,
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
    const effectiveSubjectMap = await resolveEffectivePacketSubjectsForPackets([packet]);
    const effectivePacketSubject = effectiveSubjectMap.get(packet.id) || toPacketDisplaySubject(packet.subject) || packet.subject;

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
        if (type === 'ESSAY') return false;
        if (type === 'MATRIX_SINGLE_CHOICE') {
            return Object.keys(getCorrectMatrixAnswerMap(question)).length > 0;
        }
        return getCorrectOptionIds(question).length > 0;
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
            subject: effectivePacketSubject,
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
                    subject: { select: { id: true, name: true, code: true } },
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
    const effectivePacketSubject =
        toPacketDisplaySubject(
            resolveAvailableExamSubject({
                scheduleSubject: session.schedule.subject,
                packetSubject: packet.subject,
            }),
        ) ||
        toPacketDisplaySubject(packet.subject) ||
        packet.subject;
    const historicalStudent =
        packet.academicYear?.id
            ? await getHistoricalStudentSnapshotForAcademicYear(session.student.id, packet.academicYear.id)
            : null;
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
        const matrixPromptColumns = resolveQuestionMatrixPromptColumns(question);
        const matrixColumns = resolveQuestionMatrixColumns(question);
        const matrixRows = resolveQuestionMatrixRows(question);
        const matrixAnswerMap = type === 'MATRIX_SINGLE_CHOICE' ? normalizeMatrixAnswerMap(rawAnswer) : {};
        const selectedOptionIds =
            type === 'ESSAY'
                ? []
                : type === 'MATRIX_SINGLE_CHOICE'
                  ? matrixRows
                        .map((row) => matrixAnswerMap[String(row.id || '').trim()])
                        .filter((value): value is string => Boolean(value))
                  : normalizeSelectedOptionIds(rawAnswer);
        const answered = isAnsweredForQuestion(question, rawAnswer);
        if (answered) answeredCount += 1;

        const optionRows = (type === 'MATRIX_SINGLE_CHOICE' ? [] : Array.isArray(question.options) ? question.options : [])
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
        const matrixColumnLabelById = new Map(
            matrixColumns.map((column) => [String(column.id || '').trim(), column.content]),
        );
        const correctOptionIds =
            type === 'ESSAY'
                ? []
                : type === 'MATRIX_SINGLE_CHOICE'
                  ? matrixRows
                        .map((row) => String(row.correctOptionId || '').trim())
                        .filter(Boolean)
                  : getCorrectOptionIds(question);
        const isCorrect = evaluateQuestionCorrectness(question, rawAnswer);
        const explanationSource = asRecord(question.questionCard)
            || asRecord(asRecord(question.metadata)?.questionCard);
        const explanation = normalizeOptionalString(explanationSource?.answerRationale, 2000) || null;

        if (type === 'ESSAY') {
            essayCount += 1;
        } else if (
            (type === 'MATRIX_SINGLE_CHOICE' && Object.keys(getCorrectMatrixAnswerMap(question)).length > 0) ||
            correctOptionIds.length > 0
        ) {
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
            selectedOptionLabels:
                type === 'MATRIX_SINGLE_CHOICE'
                    ? matrixRows
                          .map((row) => {
                              const rowId = String(row.id || '').trim();
                              const selectedColumnId = matrixAnswerMap[rowId];
                              if (!selectedColumnId) return null;
                              return `${buildMatrixRowDisplayText(row, matrixPromptColumns)}: ${matrixColumnLabelById.get(selectedColumnId) || selectedColumnId}`;
                          })
                          .filter((value): value is string => Boolean(value))
                    : selectedOptionIds.map((optionId) => optionLabelById.get(optionId) || optionId),
            correctOptionIds,
            correctOptionLabels:
                type === 'MATRIX_SINGLE_CHOICE'
                    ? matrixRows
                          .map((row) => {
                              const correctColumnId = String(row.correctOptionId || '').trim();
                              if (!correctColumnId) return null;
                              return `${buildMatrixRowDisplayText(row, matrixPromptColumns)}: ${matrixColumnLabelById.get(correctColumnId) || correctColumnId}`;
                          })
                          .filter((value): value is string => Boolean(value))
                    : correctOptionIds.map((optionId) => optionLabelById.get(optionId) || optionId),
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
            subject: effectivePacketSubject,
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
                class: historicalStudent?.studentClass || session.student.studentClass
                    ? {
                          id: Number(
                              historicalStudent?.studentClass?.id || session.student.studentClass?.id || 0,
                          ),
                          name: String(
                              historicalStudent?.studentClass?.name || session.student.studentClass?.name || '',
                          ),
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
    const { type, subjectId, academicYearId, semester, programCode, scope } = req.query;
    const authUser = (req as any).user as { id?: number; role?: string } | undefined;
    const authUserId = Number(authUser?.id || 0);
    const authRole = String(authUser?.role || '')
        .trim()
        .toUpperCase();
    let normalizedTypeCode: string | null = null;
    let normalizedPacketType: ExamType | null = null;
    let normalizedRequestedProgramCode: string | null = null;

    const andFilters: Prisma.ExamPacketWhereInput[] = [];

    if (type) {
        normalizedTypeCode = normalizeProgramCode(type);
        normalizedPacketType = tryNormalizePacketType(type);

        if (!normalizedPacketType && !normalizedTypeCode) {
            throw new ApiError(400, 'Filter tipe/program ujian tidak valid.');
        }

        // Jika tab program konkret sudah dipilih (mis. SBTS/SAS/SAT), jadikan programCode
        // sebagai source of truth agar packet valid tidak hilang hanya karena field `type`
        // lama masih memakai nilai historis/base type yang berbeda.
        if (!programCode) {
            if (normalizedPacketType && normalizedTypeCode) {
                andFilters.push({
                    OR: [{ type: normalizedPacketType }, { programCode: normalizedTypeCode }],
                });
            } else if (normalizedPacketType) {
                andFilters.push({ type: normalizedPacketType });
            } else if (normalizedTypeCode) {
                andFilters.push({ programCode: normalizedTypeCode });
            }
        }
    }

    if (subjectId) andFilters.push({ subjectId: parseInt(subjectId as string) });
    if (academicYearId) andFilters.push({ academicYearId: parseInt(academicYearId as string) });
    if (semester) {
        const normalizedSemester = normalizePacketSemester(semester);
        andFilters.push({ semester: normalizedSemester });
    }
    if (programCode) {
        normalizedRequestedProgramCode = normalizeProgramCode(programCode);
        if (!normalizedRequestedProgramCode) {
            throw new ApiError(400, 'Filter program ujian tidak valid.');
        }
        const fallbackAutoPacketFilter =
            normalizedPacketType && normalizedTypeCode
                ? [
                      {
                          programCode: null,
                          description: AUTO_CURRICULUM_PACKET_DESCRIPTION,
                          type: normalizedPacketType,
                      },
                  ]
                : [];
        andFilters.push({
            OR: [{ programCode: normalizedRequestedProgramCode }, ...fallbackAutoPacketFilter],
        });
    }

    if (authRole === 'TEACHER' && authUserId > 0) {
        const teacherProfile = await prisma.user.findUnique({
            where: { id: authUserId },
            select: { additionalDuties: true },
        });
        const duties = (teacherProfile?.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());
        const canSeeAllPacketsForCurriculumScope =
            duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
        const requestedScope = String(scope || '').trim().toLowerCase();

        if (!(requestedScope === 'curriculum' && canSeeAllPacketsForCurriculumScope)) {
            const assignmentWhere: Prisma.TeacherAssignmentWhereInput = {
                teacherId: authUserId,
            };
            if (academicYearId) {
                assignmentWhere.academicYearId = parseInt(academicYearId as string);
            }

            const assignments = await prisma.teacherAssignment.findMany({
                where: assignmentWhere,
                select: { subjectId: true, classId: true },
            });
            const assignmentClassIdsBySubject = assignments.reduce<Map<number, Set<number>>>((acc, item) => {
                const subjectId = Number(item.subjectId || 0);
                const classId = Number(item.classId || 0);
                if (!Number.isFinite(subjectId) || subjectId <= 0 || !Number.isFinite(classId) || classId <= 0) {
                    return acc;
                }
                if (!acc.has(subjectId)) {
                    acc.set(subjectId, new Set<number>());
                }
                acc.get(subjectId)!.add(classId);
                return acc;
            }, new Map<number, Set<number>>());
            const assignmentScopeFilters = Array.from(assignmentClassIdsBySubject.entries()).map(
                ([assignedSubjectId, classIds]) => ({
                    subjectId: assignedSubjectId,
                    schedules: {
                        some: {
                            classId: {
                                in: Array.from(classIds.values()),
                            },
                        },
                    },
                }),
            );

            andFilters.push({
                OR: [
                    { authorId: authUserId },
                    ...assignmentScopeFilters,
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
    const effectiveSubjectMap = await resolveEffectivePacketSubjectsForPackets(packets);
    const normalizedPackets = packets.map((packet) => {
        const effectiveSubject = effectiveSubjectMap.get(packet.id) || toPacketDisplaySubject(packet.subject) || packet.subject;
        return {
            ...packet,
            isCurriculumManaged: isCurriculumManagedPacketDescription(packet.description),
            subjectId: effectiveSubject?.id ?? packet.subjectId,
            subject: effectiveSubject,
        };
    });
    res.json(new ApiResponse(200, normalizedPackets));
});

export const getPacketById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const authUser = (req as any).user as { id?: number; role?: string } | undefined;
    const authUserId = Number(authUser?.id || 0);
    const authRole = String(authUser?.role || '')
        .trim()
        .toUpperCase();
    const packet = await prisma.examPacket.findUnique({
        where: { id: parseInt(id) },
        include: {
            subject: true,
            author: { select: { name: true } },
            academicYear: true,
            schedules: {
                select: {
                    id: true,
                    classId: true,
                    startTime: true,
                    endTime: true,
                    isActive: true,
                    room: true,
                    sessionLabel: true,
                    class: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        }
    });
    if (!packet) throw new ApiError(404, 'Exam packet not found');
    let normalizedSchedules = packet.schedules;
    if (authRole === 'TEACHER' && authUserId > 0) {
        const teacherProfile = await prisma.user.findUnique({
            where: { id: authUserId },
            select: { additionalDuties: true },
        });
        const duties = (teacherProfile?.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());
        const canSeeAllPacketSchedules =
            duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');

        if (!canSeeAllPacketSchedules) {
            const assignmentRows = await prisma.teacherAssignment.findMany({
                where: {
                    teacherId: authUserId,
                    academicYearId: packet.academicYearId,
                    subjectId: packet.subjectId,
                },
                select: {
                    classId: true,
                },
            });
            const allowedClassIds = new Set(
                assignmentRows
                    .map((item) => Number(item.classId || 0))
                    .filter((classId) => Number.isFinite(classId) && classId > 0),
            );
            const isAuthor = Number(packet.authorId || 0) === authUserId;
            const hasVisibleSchedule = normalizedSchedules.some((schedule) =>
                allowedClassIds.has(Number(schedule.classId || 0)),
            );
            if (!isAuthor && !hasVisibleSchedule) {
                throw new ApiError(403, 'Anda tidak berhak melihat paket ujian ini.');
            }
            if (allowedClassIds.size > 0) {
                normalizedSchedules = normalizedSchedules.filter((schedule) => {
                    const classId = Number(schedule.classId || 0);
                    return !classId || allowedClassIds.has(classId);
                });
            }
        }
    }
    const effectiveSubjectMap = await resolveEffectivePacketSubjectsForPackets([packet]);
    const effectiveSubject = effectiveSubjectMap.get(packet.id) || toPacketDisplaySubject(packet.subject) || packet.subject;
    res.json(
        new ApiResponse(200, {
            ...packet,
            schedules: normalizedSchedules,
            isCurriculumManaged: isCurriculumManagedPacketDescription(packet.description),
            subjectId: effectiveSubject?.id ?? packet.subjectId,
            subject: effectiveSubject,
        }),
    );
});

export const updatePacketReviewFeedback = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user as { id?: number } | undefined;
    if (!user?.id) {
        throw new ApiError(401, 'Tidak memiliki otorisasi.');
    }

    const reviewer = await assertCurriculumExamManagerAccess(Number(user.id), { allowAdmin: true });
    const packetId = Number(req.params.id);
    if (!Number.isFinite(packetId) || packetId <= 0) {
        throw new ApiError(400, 'ID paket ujian tidak valid.');
    }

    const questionId = String(req.body?.questionId || '').trim();
    if (!questionId) {
        throw new ApiError(400, 'questionId wajib diisi.');
    }

    const nextFeedback = normalizeReviewFeedback({
        questionComment: req.body?.questionComment,
        blueprintComment: req.body?.blueprintComment,
        questionCardComment: req.body?.questionCardComment,
        reviewedAt: new Date().toISOString(),
        reviewer: {
            id: Number(reviewer.id),
            name: reviewer.name,
        },
    });

    const packet = await prisma.examPacket.findUnique({
        where: { id: packetId },
        select: {
            id: true,
            title: true,
            authorId: true,
            programCode: true,
            subject: {
                select: {
                    name: true,
                },
            },
            questions: true,
        },
    });

    if (!packet) {
        throw new ApiError(404, 'Paket ujian tidak ditemukan.');
    }

    const normalizedQuestions = normalizeQuestionsPayload(packet.questions) || [];
    const questionIndex = normalizedQuestions.findIndex((question) => String(question.id || '').trim() === questionId);
    if (questionIndex < 0) {
        throw new ApiError(404, 'Butir soal tidak ditemukan pada paket ini.');
    }

    const updatedQuestions = normalizedQuestions.map((question, index) => {
        if (index !== questionIndex) return question;
        const nextQuestion = { ...question } as NormalizedExamQuestion & { reviewFeedback?: ExamQuestionReviewFeedback };
        if (nextFeedback) {
            nextQuestion.reviewFeedback = nextFeedback;
        } else {
            delete nextQuestion.reviewFeedback;
        }
        return nextQuestion;
    });

    await prisma.examPacket.update({
        where: { id: packetId },
        data: {
            questions: updatedQuestions as Prisma.InputJsonValue,
        },
    });

    if (nextFeedback && Number(packet.authorId) > 0) {
        const questionNumber = questionIndex + 1;
        await createInAppNotification({
            data: {
                userId: Number(packet.authorId),
                title: 'Review Soal dari Kurikulum',
                message: `Kurikulum memberi catatan untuk soal ${questionNumber} pada paket ${packet.title}. Silakan perbarui untuk menyesuaikan penjadwalan.`,
                type: 'EXAM_REVIEW',
                data: {
                    packetId,
                    questionId,
                    questionNumber,
                    reviewerId: Number(reviewer.id),
                    reviewerName: reviewer.name,
                    programCode: packet.programCode || null,
                    subjectName: packet.subject?.name || null,
                    route: `/teacher/exams/${packetId}/edit?questionId=${encodeURIComponent(
                        questionId,
                    )}&section=questions`,
                },
            },
        });
    }

    res.status(200).json(
        new ApiResponse(
            200,
            {
                packetId,
                questionId,
                questionNumber: questionIndex + 1,
                reviewFeedback: nextFeedback || null,
            },
            'Catatan review soal berhasil disimpan.',
        ),
    );
});

export const replyPacketReviewFeedback = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user as { id?: number; name?: string; role?: string } | undefined;
    if (!user?.id) {
        throw new ApiError(401, 'Tidak memiliki otorisasi.');
    }

    const packetId = Number(req.params.id);
    if (!Number.isFinite(packetId) || packetId <= 0) {
        throw new ApiError(400, 'ID paket ujian tidak valid.');
    }

    const questionId = String(req.body?.questionId || '').trim();
    if (!questionId) {
        throw new ApiError(400, 'questionId wajib diisi.');
    }

    const teacherResponse = normalizeOptionalString(req.body?.teacherResponse, 2000);
    if (!teacherResponse) {
        throw new ApiError(400, 'Balasan guru wajib diisi.');
    }

    const packet = await prisma.examPacket.findUnique({
        where: { id: packetId },
        select: {
            id: true,
            title: true,
            authorId: true,
            programCode: true,
            subject: {
                select: {
                    name: true,
                },
            },
            questions: true,
        },
    });

    if (!packet) {
        throw new ApiError(404, 'Paket ujian tidak ditemukan.');
    }

    const isAuthor = Number(packet.authorId) > 0 && Number(packet.authorId) === Number(user.id);
    const isAdmin = String(user.role || '').trim().toUpperCase() === 'ADMIN';
    if (!isAuthor && !isAdmin) {
        throw new ApiError(403, 'Anda tidak berhak membalas review pada paket ini.');
    }

    const normalizedQuestions = normalizeQuestionsPayload(packet.questions) || [];
    const questionIndex = normalizedQuestions.findIndex((question) => String(question.id || '').trim() === questionId);
    if (questionIndex < 0) {
        throw new ApiError(404, 'Butir soal tidak ditemukan pada paket ini.');
    }

    const currentQuestion = normalizedQuestions[questionIndex] as NormalizedExamQuestion & {
        reviewFeedback?: ExamQuestionReviewFeedback;
    };
    const currentFeedback = normalizeReviewFeedback(currentQuestion.reviewFeedback);
    if (!currentFeedback) {
        throw new ApiError(400, 'Butir soal ini belum memiliki catatan review dari kurikulum.');
    }

    const nextFeedback = normalizeReviewFeedback({
        ...currentFeedback,
        teacherResponse,
        teacherRespondedAt: new Date().toISOString(),
        teacherResponder: {
            id: Number(user.id),
            name: String(user.name || '').trim() || 'Guru Penyusun',
        },
    });

    const updatedQuestions = normalizedQuestions.map((question, index) => {
        if (index !== questionIndex) return question;
        return {
            ...question,
            reviewFeedback: nextFeedback,
        };
    });

    await prisma.examPacket.update({
        where: { id: packetId },
        data: {
            questions: updatedQuestions as Prisma.InputJsonValue,
        },
    });

    let reviewerId = Number(currentFeedback.reviewer?.id || 0);
    const reviewerName = String(currentFeedback.reviewer?.name || '').trim();
    if (reviewerId <= 0) {
        const recentReviewNotifications = await prisma.notification.findMany({
            where: {
                type: 'EXAM_REVIEW',
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                userId: true,
                data: true,
            },
        });
        const matchedReviewNotification = recentReviewNotifications.find((notification) => {
            const notificationData =
                notification?.data && typeof notification.data === 'object'
                    ? (notification.data as Record<string, unknown>)
                    : null;
            const notificationPacketId = Number(notificationData?.packetId || 0);
            const notificationQuestionId = String(notificationData?.questionId || '').trim();
            return notificationPacketId === packetId && notificationQuestionId === questionId;
        });
        const matchedNotificationData =
            matchedReviewNotification?.data && typeof matchedReviewNotification.data === 'object'
                ? (matchedReviewNotification.data as Record<string, unknown>)
                : null;
        if (matchedNotificationData?.reviewerId) {
            reviewerId = Number(matchedNotificationData.reviewerId || 0);
        }
    }

    if (reviewerId <= 0 && reviewerName) {
        const matchedReviewer = await prisma.user.findFirst({
            where: {
                name: reviewerName,
                OR: [
                    { role: 'ADMIN' },
                    {
                        role: 'TEACHER',
                        additionalDuties: {
                            hasSome: ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM'],
                        },
                    },
                ],
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
        });
        if (matchedReviewer?.id) {
            reviewerId = Number(matchedReviewer.id);
        }
    }

    if (reviewerId > 0) {
        const reviewProgramCode = String(packet.programCode || '').trim().toUpperCase();
        const reviewRouteParams = new URLSearchParams({
            section: 'jadwal',
            reviewPacketId: String(packetId),
            questionId,
        });
        if (reviewProgramCode) {
            reviewRouteParams.set('jadwalProgram', reviewProgramCode);
        }

        await createInAppNotification({
            data: {
                userId: reviewerId,
                title: 'Balasan Review Soal dari Guru',
                message: `${String(user.name || 'Guru').trim() || 'Guru penyusun'} membalas catatan review untuk soal ${
                    questionIndex + 1
                } pada paket ${packet.title}.`,
                type: 'EXAM_REVIEW_REPLY',
                data: {
                    packetId,
                    questionId,
                    questionNumber: questionIndex + 1,
                    programCode: packet.programCode || null,
                    subjectName: packet.subject?.name || null,
                    route: `/teacher/wakasek/exams?${reviewRouteParams.toString()}`,
                },
            },
        });
    }

    res.status(200).json(
        new ApiResponse(
            200,
            {
                packetId,
                questionId,
                questionNumber: questionIndex + 1,
                reviewFeedback: nextFeedback || null,
            },
            'Balasan review guru berhasil dikirim.',
        ),
    );
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
    const normalizedQuestions = stripQuestionSupportMetadata(normalizeQuestionsPayload(questions));
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
    await assertPacketSubjectProgramConsistency({
        subjectId: normalizedSubjectId,
        programCode: resolvedProgram.programCode,
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
            description: true,
            duration: true,
            kkm: true,
            publishedQuestionCount: true,
        },
    });

    if (!existingPacket) {
        throw new ApiError(404, 'Exam packet not found');
    }

    const isCurriculumManagedPacket = isCurriculumManagedPacketDescription(existingPacket.description);
    const normalizedAcademicYearId = isCurriculumManagedPacket
        ? existingPacket.academicYearId
        : Number.isFinite(Number(academicYearId))
          ? parseInt(academicYearId)
          : existingPacket.academicYearId;
    const normalizedSubjectId = isCurriculumManagedPacket
        ? existingPacket.subjectId
        : Number.isFinite(Number(subjectId))
          ? parseInt(subjectId)
          : existingPacket.subjectId;
    if (!Number.isFinite(normalizedSubjectId) || normalizedSubjectId <= 0) {
        throw new ApiError(400, 'subjectId wajib diisi.');
    }
    const normalizedSemester = isCurriculumManagedPacket
        ? existingPacket.semester
        : normalizePacketSemester(semester || existingPacket.semester);
    const resolvedProgram = isCurriculumManagedPacket
        ? {
              programCode:
                  normalizeProgramCode(existingPacket.programCode || existingPacket.type) ||
                  String(existingPacket.programCode || existingPacket.type),
              baseType: existingPacket.type,
          }
        : await resolvePacketProgram({
              academicYearId: normalizedAcademicYearId,
              semester: normalizedSemester,
              programCode: programCode ?? existingPacket.programCode,
              legacyType: type ?? existingPacket.type,
              currentProgramCode: existingPacket.programCode,
          });
    const scopedAssignment = isCurriculumManagedPacket
        ? null
        : await resolvePacketAssignmentScope({
              teacherAssignmentId,
              academicYearId: normalizedAcademicYearId,
              authorId: Number((req as any).user.id),
              subjectId: normalizedSubjectId,
              programCode: resolvedProgram.programCode,
          });
    const effectiveSubjectId = isCurriculumManagedPacket ? existingPacket.subjectId : scopedAssignment?.subjectId ?? normalizedSubjectId;
    if (!Number.isFinite(effectiveSubjectId) || effectiveSubjectId <= 0) {
        throw new ApiError(400, 'subjectId wajib diisi.');
    }
    const normalizedQuestions = isCurriculumManagedPacket
        ? normalizeQuestionsPayload(questions)
        : stripQuestionSupportMetadata(normalizeQuestionsPayload(questions));
    const normalizedPublishedQuestionCount =
        publishedQuestionCount === undefined
            ? undefined
            : normalizePublishedQuestionCount(publishedQuestionCount);

    if (!isCurriculumManagedPacket) {
        await assertPacketCreationScope({
            academicYearId: normalizedAcademicYearId,
            programCode: resolvedProgram.programCode,
            subjectId: effectiveSubjectId,
            authorId: Number((req as any).user.id),
        });
        await assertPacketSubjectProgramConsistency({
            subjectId: effectiveSubjectId,
            programCode: resolvedProgram.programCode,
        });
    }

    const packet = await prisma.examPacket.update({
        where: { id: packetId },
        data: {
            title,
            subjectId: effectiveSubjectId,
            academicYearId: normalizedAcademicYearId,
            type: resolvedProgram.baseType,
            programCode: resolvedProgram.programCode,
            semester: normalizedSemester,
            duration: isCurriculumManagedPacket ? existingPacket.duration : parseInt(duration),
            description: isCurriculumManagedPacket ? existingPacket.description : description,
            instructions,
            kkm: isCurriculumManagedPacket ? existingPacket.kkm : kkm ? parseFloat(kkm) : undefined,
            publishedQuestionCount: isCurriculumManagedPacket
                ? existingPacket.publishedQuestionCount
                : normalizedPublishedQuestionCount,
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
    const authUser = (req as any).user as { id?: number; role?: string } | undefined;
    const authRole = String(authUser?.role || '')
        .trim()
        .toUpperCase();

    if (authRole !== 'ADMIN') {
        throw new ApiError(
            403,
            'Paket ujian tidak dapat dihapus dari menu guru. Silakan edit informasi ujian atau isi soal yang tersedia.',
        );
    }

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
        const assignmentWhere: Prisma.TeacherAssignmentWhereInput = {
            teacherId: Number(user.id),
        };
        if (academicYearId) {
            const normalizedAcademicYearId = parseInt(academicYearId as string);
            if (Number.isFinite(normalizedAcademicYearId) && normalizedAcademicYearId > 0) {
                assignmentWhere.academicYearId = normalizedAcademicYearId;
            }
        }

        const assignments = await prisma.teacherAssignment.findMany({
            where: assignmentWhere,
            select: { subjectId: true },
        });

        const assignedSubjectIds = Array.from(
            new Set(
                assignments
                    .map((assignment) => Number(assignment.subjectId))
                    .filter((subject) => Number.isFinite(subject) && subject > 0),
            ),
        );

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

        bankWhere.authorId = Number(user.id);

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

export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
    const questionId = Number(req.params.id);
    if (!Number.isFinite(questionId) || questionId <= 0) {
        throw new ApiError(400, 'ID soal tidak valid.');
    }

    const user = (req as any).user as { id: number; role: string };
    const normalizedRole = String(user?.role || '')
        .trim()
        .toUpperCase();

    const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
            bank: {
                select: {
                    id: true,
                    authorId: true,
                },
            },
        },
    });

    if (!question?.bank) {
        throw new ApiError(404, 'Soal bank tidak ditemukan.');
    }

    if (normalizedRole !== 'ADMIN') {
        const authorId = Number(question.bank.authorId || 0);
        if (!authorId || authorId !== Number(user?.id || 0)) {
            throw new ApiError(403, 'Hanya pembuat soal atau admin yang dapat menghapus soal ini.');
        }
    }

    const result = await prisma.$transaction(async (tx) => {
        await tx.question.delete({
            where: { id: question.id },
        });

        const remainingQuestionCount = await tx.question.count({
            where: { bankId: question.bank.id },
        });

        let bankDeleted = false;
        if (remainingQuestionCount === 0) {
            await tx.questionBank.delete({
                where: { id: question.bank.id },
            });
            bankDeleted = true;
        }

        return {
            id: question.id,
            bankId: question.bank.id,
            bankDeleted,
        };
    });

    res.json(new ApiResponse(200, result, 'Soal bank berhasil dihapus.'));
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
    const { classId, academicYearId, examType, programCode, packetId, sessionLabel, sessionId, vacancyId, semester } = req.query;
    const where: Prisma.ExamScheduleWhereInput = {};

    if (classId) {
        where.classId = Number(classId);
    }
    if (academicYearId) {
        where.academicYearId = Number(academicYearId);
    }
    if (semester !== undefined && semester !== null && String(semester).trim() !== '') {
        where.semester = normalizeOptionalPacketSemester(semester);
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
                    author: {
                        select: {
                            id: true,
                            name: true,
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
        orderBy: [{ startTime: 'desc' }, { periodNumber: 'asc' }, { endTime: 'desc' }, { id: 'desc' }]
    });

    const packetIds = Array.from(
        new Set(
            schedules
                .map((schedule) => Number(schedule.packet?.id))
                .filter((packetId) => Number.isFinite(packetId) && packetId > 0),
        ),
    );
    const packetSupportRows =
        packetIds.length > 0
            ? await prisma.examPacket.findMany({
                  where: { id: { in: packetIds } },
                  select: {
                      id: true,
                      questions: true,
                  },
              })
            : [];
    const packetSupportById = new Map(
        packetSupportRows.map((row) => [Number(row.id), summarizePacketSupport(row.questions)]),
    );

    const normalizedSchedules = schedules.map((schedule) => {
        if (!schedule.packet) return schedule;
        return {
            ...schedule,
            packet: {
                ...schedule.packet,
                ...(packetSupportById.get(Number(schedule.packet.id)) || {
                    questionPoolCount: 0,
                    blueprintCount: 0,
                    questionCardCount: 0,
                }),
            },
        };
    });

    res.json(new ApiResponse(200, normalizedSchedules));
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
        periodNumber,
        sessionId,
        sessionLabel,
        jobVacancyId,
    } = req.body;
    const targetClassIds = classIds || (classId ? [classId] : []);
    const parsedJobVacancyId = resolveOptionalJobVacancyId(jobVacancyId);
    const parsedPeriodNumber = resolveOptionalSchedulePeriodNumber(periodNumber);

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
        authorId: number;
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
                authorId: true,
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
    await assertPacketSubjectProgramConsistency({
        subjectId: fallbackSubjectId,
        programCode: normalizedExamType,
    });

    // Formatif/UH tetap tidak memakai sesi terjadwal seperti program besar kurikulum,
    // tetapi guru masih boleh membuat jadwal kelas langsung dari packet ujian.
    if (normalizedExamType && isNonScheduledExamProgramCode(normalizedExamType) && !packet?.id) {
        throw new ApiError(
            400,
            'Program Ulangan Harian (UH/Formatif) hanya bisa dijadwalkan dari packet ujian guru yang sudah dibuat.',
        );
    }
    if (parsedJobVacancyId) {
        await assertBkkExamScheduleManagementAccess(req);
    } else {
        await assertAcademicExamScheduleManagementAccess(req, {
            programCode: normalizedExamType,
            packetAuthorId: packet?.authorId,
            allowPacketAuthorForNonScheduled: true,
        });
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

    const assignmentTeacherIdsByClass = assignmentRows.reduce<Map<number, Set<number>>>((acc, row) => {
        const classId = Number(row.classId || 0);
        const teacherId = Number(row.teacherId || 0);
        if (!Number.isFinite(classId) || classId <= 0 || !Number.isFinite(teacherId) || teacherId <= 0) {
            return acc;
        }
        if (!acc.has(classId)) {
            acc.set(classId, new Set<number>());
        }
        acc.get(classId)!.add(teacherId);
        return acc;
    }, new Map<number, Set<number>>());

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

        const ambiguousClassIds = normalizedClassIds.filter((classIdItem) => {
            const teacherIds = assignmentTeacherIdsByClass.get(classIdItem);
            return Boolean(teacherIds && teacherIds.size > 1);
        });
        if (ambiguousClassIds.length > 0) {
            const ambiguousClasses = await prisma.class.findMany({
                where: { id: { in: ambiguousClassIds } },
                select: { name: true },
            });
            const ambiguousClassNames =
                ambiguousClasses.map((item) => item.name).join(', ') || ambiguousClassIds.join(', ');
            throw new ApiError(
                400,
                `Mapel ini masih memiliki lebih dari satu guru pada kelas: ${ambiguousClassNames}. Rapikan assignment guru terlebih dahulu agar packet ujian tidak ambigu.`,
            );
        }

        await assertScheduleClassLevelScope({
            academicYearId: fallbackAcademicYearId,
            programCode: normalizedExamType,
            classIds: normalizedClassIds,
        });
    }

    const classIdsByTeacher = normalizedClassIds.reduce<Map<number, number[]>>((acc, classIdItem) => {
        const teacherIds = Array.from(assignmentTeacherIdsByClass.get(classIdItem)?.values() || []);
        const teacherId = Number(teacherIds[0] || 0);
        if (!Number.isFinite(teacherId) || teacherId <= 0) {
            return acc;
        }
        if (!acc.has(teacherId)) {
            acc.set(teacherId, []);
        }
        acc.get(teacherId)!.push(classIdItem);
        return acc;
    }, new Map<number, number[]>());

    const resolvedProgramSession = await resolveProgramSessionReference({
        academicYearId: fallbackAcademicYearId,
        rawProgramCode: normalizedExamType,
        rawExamType: normalizedExamType,
        sessionId,
        sessionLabel,
    });

    const createdSchedules = [];
    const packetIdsToConsolidate = new Set<number>();

    if (!packet && normalizedClassIds.length > 0) {
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

        const durationMinutes = Math.max(
            1,
            Math.round((normalizedEndTime.getTime() - normalizedStartTime.getTime()) / 60000),
        );
        const programLabel = resolvedProgram.programCode || resolvedProgram.baseType;
        const subjectLabel = String(subjectRow?.name || 'Mata Pelajaran');
        const dateLabel = normalizedStartTime.toISOString().slice(0, 10);
        const autoTitle = `${programLabel} • ${subjectLabel} • ${dateLabel}`;

        const teacherGroups = Array.from(classIdsByTeacher.entries()).sort((left, right) => left[0] - right[0]);
        for (const [teacherId, teacherClassIds] of teacherGroups) {
            const reusablePacket = await findReusablePacketForSessionGroup({
                authorId: teacherId,
                subjectId: fallbackSubjectId,
                academicYearId: fallbackAcademicYearId,
                semester: normalizedSemester,
                programCode: resolvedProgram.programCode,
                startTime: normalizedStartTime,
                sessionId: resolvedProgramSession?.id ?? null,
                sessionLabel: resolvedProgramSession?.label ?? null,
            });

            const scopedPacket =
                reusablePacket ||
                (await prisma.examPacket.create({
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
                        kkm: inferCurriculumManagedPacketKkm(assignmentRows, teacherId),
                        authorId: teacherId,
                    },
                    select: {
                        id: true,
                        authorId: true,
                        subjectId: true,
                        academicYearId: true,
                        semester: true,
                        type: true,
                        programCode: true,
                    },
                }));

            packetIdsToConsolidate.add(scopedPacket.id);
            for (const classIdItem of teacherClassIds) {
                const schedule = await prisma.examSchedule.create({
                    data: {
                        classId: classIdItem,
                        packetId: scopedPacket.id,
                        subjectId: fallbackSubjectId,
                        startTime: normalizedStartTime,
                        endTime: normalizedEndTime,
                        periodNumber: parsedPeriodNumber,
                        proctorId: parsedProctorId,
                        academicYearId: fallbackAcademicYearId,
                        semester: normalizedSemester,
                        examType: normalizedExamType,
                        room,
                        jobVacancyId: parsedJobVacancyId,
                        sessionId: resolvedProgramSession?.id ?? null,
                        sessionLabel: resolvedProgramSession?.label ?? null,
                    },
                });
                createdSchedules.push(schedule);
                invalidateStartExamScheduleCache(schedule.id);
            }
        }
    } else {
        const scheduleTargets = normalizedClassIds.length > 0 ? normalizedClassIds : [null];
        for (const cId of scheduleTargets) {
            const schedule = await prisma.examSchedule.create({
                data: {
                    classId: cId ?? undefined,
                    packetId: packet?.id ?? null,
                    subjectId: fallbackSubjectId,
                    startTime: normalizedStartTime,
                    endTime: normalizedEndTime,
                    periodNumber: parsedPeriodNumber,
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
            packetIdsToConsolidate.add(packet.id);
        }
    }

    for (const packetIdItem of packetIdsToConsolidate) {
        if (!Number.isFinite(packetIdItem) || packetIdItem <= 0) {
            continue;
        }
        const consolidation = await consolidateSessionSiblingSchedulesForPacket(packetIdItem);
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

        invalidatePacketItemAnalysisCacheByPacket(packetIdItem);
        invalidatePacketSubmissionsCacheByPacket(packetIdItem);
    }

    res.json(new ApiResponse(201, createdSchedules, 'Exam schedules created successfully'));
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        startTime,
        endTime,
        proctorId,
        room,
        isActive,
        periodNumber,
        sessionId,
        sessionLabel,
        subjectId,
        classId,
        semester,
        packetId,
    } = req.body;
    const scheduleId = parseInt(id, 10);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'id jadwal tidak valid.');
    }
    const parsedPeriodNumber =
        periodNumber === undefined ? undefined : resolveOptionalSchedulePeriodNumber(periodNumber);

    const existingSchedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        select: {
            id: true,
            classId: true,
            subjectId: true,
            semester: true,
            packetId: true,
            jobVacancyId: true,
            academicYearId: true,
            examType: true,
            packet: {
                select: {
                    id: true,
                    authorId: true,
                    academicYearId: true,
                    programCode: true,
                    type: true,
                    subjectId: true,
                    semester: true,
                },
            },
        },
    });
    if (!existingSchedule) {
        throw new ApiError(404, 'Jadwal tidak ditemukan.');
    }
    if (existingSchedule.jobVacancyId) {
        await assertBkkExamScheduleManagementAccess(req);
    } else {
        await assertAcademicExamScheduleManagementAccess(req, {
            programCode:
                existingSchedule.packet?.programCode ||
                existingSchedule.examType ||
                existingSchedule.packet?.type ||
                null,
            packetAuthorId: existingSchedule.packet?.authorId,
            allowPacketAuthorForNonScheduled: true,
        });
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
    const hasFundamentalPatch =
        subjectId !== undefined || classId !== undefined || semester !== undefined || packetId !== undefined;
    const resolvedAcademicYearId =
        existingSchedule.packet?.academicYearId || existingSchedule.academicYearId || null;
    const resolvedProgramCode =
        existingSchedule.packet?.programCode || existingSchedule.examType || existingSchedule.packet?.type || null;

    if (hasFundamentalPatch) {
        const sessionCount = await prisma.studentExamSession.count({
            where: { scheduleId },
        });
        if (sessionCount > 0) {
            throw new ApiError(
                400,
                'Jadwal yang sudah memiliki sesi ujian siswa tidak boleh mengubah mapel, kelas, semester, atau packet.',
            );
        }
    }

    const resolvedSubjectId =
        subjectId === undefined
            ? Number(existingSchedule.subjectId || existingSchedule.packet?.subjectId || 0)
            : Number(subjectId);
    if (!Number.isFinite(resolvedSubjectId) || resolvedSubjectId <= 0) {
        throw new ApiError(400, 'subjectId tidak valid.');
    }

    const resolvedClassId =
        classId === undefined
            ? existingSchedule.classId ?? null
            : classId === null || String(classId).trim() === ''
              ? null
              : Number(classId);
    if (resolvedClassId !== null && (!Number.isFinite(resolvedClassId) || resolvedClassId <= 0)) {
        throw new ApiError(400, 'classId tidak valid.');
    }
    if (existingSchedule.jobVacancyId && resolvedClassId !== null) {
        throw new ApiError(400, 'Jadwal tes BKK tidak boleh dikaitkan ke kelas reguler.');
    }

    const resolvedSemester =
        semester === undefined
            ? existingSchedule.semester || existingSchedule.packet?.semester || Semester.ODD
            : normalizeOptionalPacketSemester(semester);
    const normalizedProgramCode = normalizeProgramCode(resolvedProgramCode) || null;

    if (resolvedClassId !== null && resolvedAcademicYearId) {
        const assignmentRows = await prisma.teacherAssignment.findMany({
            where: {
                academicYearId: resolvedAcademicYearId,
                subjectId: resolvedSubjectId,
                classId: resolvedClassId,
            },
            select: {
                classId: true,
            },
        });

        if (assignmentRows.length === 0) {
            const targetClass = await prisma.class.findUnique({
                where: { id: resolvedClassId },
                select: { name: true },
            });
            throw new ApiError(
                400,
                `Mapel ini belum punya assignment guru pada kelas: ${targetClass?.name || resolvedClassId}.`,
            );
        }

        await assertScheduleClassLevelScope({
            academicYearId: resolvedAcademicYearId,
            programCode: normalizedProgramCode,
            classIds: [resolvedClassId],
        });
    }

    let resolvedPacketId: number | null | undefined = existingSchedule.packetId ?? null;
    let normalizedExamType = normalizedProgramCode;

    if (packetId !== undefined) {
        if (packetId === null || String(packetId).trim() === '') {
            resolvedPacketId = null;
        } else {
            const parsedPacketId = Number(packetId);
            if (!Number.isFinite(parsedPacketId) || parsedPacketId <= 0) {
                throw new ApiError(400, 'packetId tidak valid.');
            }

            const targetPacket = await prisma.examPacket.findUnique({
                where: { id: parsedPacketId },
                select: {
                    id: true,
                    academicYearId: true,
                    subjectId: true,
                    semester: true,
                    programCode: true,
                    type: true,
                },
            });
            if (!targetPacket) {
                throw new ApiError(404, 'Exam packet tidak ditemukan.');
            }
            if (resolvedAcademicYearId && targetPacket.academicYearId !== resolvedAcademicYearId) {
                throw new ApiError(400, 'Packet ujian tidak berada pada tahun ajaran yang sama.');
            }
            if (targetPacket.subjectId !== resolvedSubjectId) {
                throw new ApiError(400, 'Packet ujian harus sesuai dengan mapel yang dipilih.');
            }
            if (targetPacket.semester !== resolvedSemester) {
                throw new ApiError(400, 'Packet ujian harus sesuai dengan semester jadwal.');
            }
            const packetProgramCode = normalizeProgramCode(targetPacket.programCode || targetPacket.type);
            if (normalizedProgramCode && packetProgramCode && packetProgramCode !== normalizedProgramCode) {
                throw new ApiError(400, 'Packet ujian harus sesuai dengan program ujian yang sedang aktif.');
            }

            resolvedPacketId = targetPacket.id;
            normalizedExamType = packetProgramCode || normalizedProgramCode;
        }
    } else {
        const existingPacketMatches =
            existingSchedule.packet &&
            Number(existingSchedule.packet.subjectId || 0) === resolvedSubjectId &&
            existingSchedule.packet.semester === resolvedSemester &&
            normalizeProgramCode(existingSchedule.packet.programCode || existingSchedule.packet.type) ===
                normalizedProgramCode;
        resolvedPacketId = existingPacketMatches && existingSchedule.packet ? existingSchedule.packet.id : null;
    }

    if (resolvedClassId === null && !existingSchedule.jobVacancyId && !resolvedPacketId) {
        throw new ApiError(400, 'Jadwal tanpa kelas wajib memakai packet ujian.');
    }

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
            periodNumber: parsedPeriodNumber,
            classId: resolvedClassId,
            subjectId: resolvedSubjectId,
            semester: resolvedSemester,
            packetId: resolvedPacketId,
            examType: normalizedExamType,
            proctorId: parsedProctorId,
            room,
            isActive,
            sessionId: hasSessionPayload ? resolvedProgramSession?.id ?? null : undefined,
            sessionLabel: hasSessionPayload ? resolvedProgramSession?.label ?? null : undefined,
        }
    });
    invalidateStartExamScheduleCache(scheduleId);
    if (existingSchedule.packetId && existingSchedule.packetId !== resolvedPacketId) {
        invalidatePacketItemAnalysisCacheByPacket(existingSchedule.packetId);
        invalidatePacketSubmissionsCacheByPacket(existingSchedule.packetId);
    }
    if (resolvedPacketId) {
        invalidatePacketItemAnalysisCacheByPacket(resolvedPacketId);
        invalidatePacketSubmissionsCacheByPacket(resolvedPacketId);
    }
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
    } else {
        await assertAcademicExamScheduleManagementAccess(req, {
            programCode: schedule.packet?.programCode || schedule.examType || schedule.packet?.type || null,
            packetAuthorId: schedule.packet?.authorId,
            allowPacketAuthorForNonScheduled: true,
        });
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

export const getScheduleMakeupAccess = asyncHandler(async (req: Request, res: Response) => {
    const scheduleId = Number(req.params.id);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'id jadwal tidak valid.');
    }

    const schedule = await loadFormalMakeupManagedSchedule(scheduleId);
    assertFormalMakeupSupportedSchedule(schedule);
    const actor = (req as Request & { user?: { id?: number | string } }).user;
    await assertCurriculumExamManagerAccess(Number(actor?.id || 0), { allowAdmin: true });

    const academicYearId = Number(schedule.packet?.academicYearId || schedule.academicYearId || 0);
    const classId = Number(schedule.classId || 0);
    const studentSnapshots = await listHistoricalStudentsForAcademicYear({
        academicYearId,
        classId,
    });
    const studentIds = studentSnapshots.map((item) => item.id);

    const [sessions, accesses] = await Promise.all([
        studentIds.length > 0
            ? prisma.studentExamSession.findMany({
                  where: {
                      scheduleId,
                      studentId: { in: studentIds },
                  },
                  select: {
                      id: true,
                      studentId: true,
                      startTime: true,
                      endTime: true,
                      submitTime: true,
                      status: true,
                      score: true,
                      updatedAt: true,
                  },
              })
            : Promise.resolve([]),
        studentIds.length > 0
            ? prisma.examScheduleMakeupAccess.findMany({
                  where: {
                      scheduleId,
                      studentId: { in: studentIds },
                  },
                  select: {
                      id: true,
                      studentId: true,
                      startTime: true,
                      endTime: true,
                      reason: true,
                      isActive: true,
                      grantedAt: true,
                      revokedAt: true,
                      grantedBy: {
                          select: {
                              id: true,
                              name: true,
                          },
                      },
                      revokedBy: {
                          select: {
                              id: true,
                              name: true,
                          },
                      },
                  },
                  orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
              })
            : Promise.resolve([]),
    ]);

    const now = new Date();
    const sessionMap = new Map<number, (typeof sessions)[number]>();
    sessions.forEach((session) => {
        const current = sessionMap.get(session.studentId);
        const picked = pickBestSession(current ? [current, session] : [session]);
        if (picked) {
            sessionMap.set(session.studentId, picked);
        }
    });
    const accessMap = new Map<number, (typeof accesses)[number]>();
    accesses.forEach((access) => {
        if (!accessMap.has(access.studentId)) {
            accessMap.set(access.studentId, access);
        }
    });

    const students = studentSnapshots
        .map((student) => {
            const session = sessionMap.get(student.id) || null;
            const access = accessMap.get(student.id) || null;
            const sessionStatus = String(session?.status || '').toUpperCase();
            const hasAttempt = Boolean(session);
            const makeupState = resolveFormalMakeupAccessState(now, access);
            return {
                student: {
                    id: student.id,
                    name: student.name,
                    nis: student.nis || null,
                    nisn: student.nisn || null,
                },
                session: session
                    ? {
                          id: session.id,
                          status: sessionStatus || 'IN_PROGRESS',
                          startTime: session.startTime.toISOString(),
                          endTime: session.endTime ? session.endTime.toISOString() : null,
                          submitTime: session.submitTime ? session.submitTime.toISOString() : null,
                          score: session.score ?? null,
                      }
                    : null,
                hasAttempt,
                canManageMakeup: !hasAttempt,
                makeupAccess: access
                    ? {
                          id: access.id,
                          startTime: access.startTime.toISOString(),
                          endTime: access.endTime.toISOString(),
                          reason: access.reason || null,
                          isActive: access.isActive,
                          grantedAt: access.grantedAt.toISOString(),
                          revokedAt: access.revokedAt ? access.revokedAt.toISOString() : null,
                          state: makeupState,
                          grantedBy: access.grantedBy
                              ? {
                                    id: access.grantedBy.id,
                                    name: access.grantedBy.name,
                                }
                              : null,
                          revokedBy: access.revokedBy
                              ? {
                                    id: access.revokedBy.id,
                                    name: access.revokedBy.name,
                                }
                              : null,
                      }
                    : null,
            };
        })
        .sort((left, right) => String(left.student.name || '').localeCompare(String(right.student.name || ''), 'id'));

    res.json(
        new ApiResponse(200, {
            schedule: {
                id: schedule.id,
                classId: classId,
                className: schedule.class?.name || '',
                startTime: schedule.startTime.toISOString(),
                endTime: schedule.endTime.toISOString(),
                examType: normalizeProgramCode(schedule.packet?.programCode || schedule.examType || schedule.packet?.type),
                subject: {
                    id: Number(schedule.packet?.subject.id || 0),
                    name: String(schedule.packet?.subject.name || ''),
                    code: String(schedule.packet?.subject.code || ''),
                },
                packet: {
                    id: Number(schedule.packet?.id || 0),
                    title: String(schedule.packet?.title || ''),
                },
            },
            students,
        }),
    );
});

export const upsertScheduleMakeupAccess = asyncHandler(async (req: Request, res: Response) => {
    const scheduleId = Number(req.params.id);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'id jadwal tidak valid.');
    }

    const schedule = await loadFormalMakeupManagedSchedule(scheduleId);
    assertFormalMakeupSupportedSchedule(schedule);
    const actor = (req as Request & { user?: { id?: number | string } }).user;
    const curriculumManager = await assertCurriculumExamManagerAccess(Number(actor?.id || 0), { allowAdmin: true });
    const grantedById = curriculumManager.id;

    const academicYearId = Number(schedule.packet?.academicYearId || schedule.academicYearId || 0);
    const classId = Number(schedule.classId || 0);
    const parsedStudentId = Number(req.body?.studentId);
    if (!Number.isFinite(parsedStudentId) || parsedStudentId <= 0) {
        throw new ApiError(400, 'studentId tidak valid.');
    }

    const [studentSnapshot, existingSession] = await Promise.all([
        getHistoricalStudentSnapshotForAcademicYear(parsedStudentId, academicYearId),
        prisma.studentExamSession.findFirst({
            where: {
                scheduleId,
                studentId: parsedStudentId,
            },
            select: {
                id: true,
                startTime: true,
                status: true,
            },
        }),
    ]);

    if (!studentSnapshot || Number(studentSnapshot.studentClass?.id || 0) !== classId) {
        throw new ApiError(400, 'Siswa tidak valid untuk kelas pada jadwal ini.');
    }

    if (existingSession) {
        throw new ApiError(
            400,
            'Siswa sudah memiliki sesi ujian. Susulan formal hanya untuk siswa yang belum mulai ujian reguler.',
        );
    }

    const startTime = resolveScheduleDateTime({
        date: req.body?.date,
        time: req.body?.startTime,
        dateTime: req.body?.startDateTime,
        fieldLabel: 'Waktu mulai susulan',
    });
    const endTime = resolveScheduleDateTime({
        date: req.body?.date,
        time: req.body?.endTime,
        dateTime: req.body?.endDateTime,
        fieldLabel: 'Waktu selesai susulan',
    });
    if (endTime <= startTime) {
        throw new ApiError(400, 'Waktu selesai susulan harus sesudah waktu mulai.');
    }
    if (startTime <= schedule.endTime) {
        throw new ApiError(400, 'Jadwal susulan harus dimulai setelah jadwal reguler berakhir.');
    }
    if (endTime <= new Date()) {
        throw new ApiError(400, 'Jadwal susulan sudah lewat. Pilih waktu yang masih akan datang.');
    }

    const normalizedReason = String(req.body?.reason || '').trim() || null;

    const access = await prisma.examScheduleMakeupAccess.upsert({
        where: {
            scheduleId_studentId: {
                scheduleId,
                studentId: parsedStudentId,
            },
        },
        update: {
            startTime,
            endTime,
            reason: normalizedReason,
            isActive: true,
            grantedById,
            grantedAt: new Date(),
            revokedById: null,
            revokedAt: null,
        },
        create: {
            scheduleId,
            studentId: parsedStudentId,
            startTime,
            endTime,
            reason: normalizedReason,
            isActive: true,
            grantedById,
        },
        select: {
            id: true,
            startTime: true,
            endTime: true,
            reason: true,
            isActive: true,
            grantedAt: true,
            grantedBy: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    availableExamsCache.delete(parsedStudentId);

    const examLabel = String(schedule.packet?.title || schedule.packet?.subject.name || 'ujian');
    const dateLabel = startTime.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    await createInAppNotification({
        data: {
            userId: parsedStudentId,
            title: 'Jadwal Susulan Ujian',
            message: `Anda mendapat jadwal susulan untuk ${examLabel} pada ${dateLabel}.`,
            type: 'EXAM',
            data: {
                scheduleId,
                makeupAccessId: access.id,
                route: '/student/exams',
            },
        },
    });

    res.json(
        new ApiResponse(200, {
            id: access.id,
            startTime: access.startTime.toISOString(),
            endTime: access.endTime.toISOString(),
            reason: access.reason || null,
            isActive: access.isActive,
            grantedAt: access.grantedAt.toISOString(),
            grantedBy: access.grantedBy
                ? {
                      id: access.grantedBy.id,
                      name: access.grantedBy.name,
                  }
                : null,
        }, 'Jadwal susulan berhasil disimpan'),
    );
});

export const revokeScheduleMakeupAccess = asyncHandler(async (req: Request, res: Response) => {
    const scheduleId = Number(req.params.id);
    const parsedStudentId = Number(req.params.studentId);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        throw new ApiError(400, 'id jadwal tidak valid.');
    }
    if (!Number.isFinite(parsedStudentId) || parsedStudentId <= 0) {
        throw new ApiError(400, 'studentId tidak valid.');
    }

    const schedule = await loadFormalMakeupManagedSchedule(scheduleId);
    assertFormalMakeupSupportedSchedule(schedule);
    const actor = (req as Request & { user?: { id?: number | string } }).user;
    const curriculumManager = await assertCurriculumExamManagerAccess(Number(actor?.id || 0), { allowAdmin: true });
    const revokedById = curriculumManager.id;

    const existingAccess = await prisma.examScheduleMakeupAccess.findUnique({
        where: {
            scheduleId_studentId: {
                scheduleId,
                studentId: parsedStudentId,
            },
        },
        select: {
            id: true,
            isActive: true,
        },
    });

    if (!existingAccess) {
        throw new ApiError(404, 'Jadwal susulan siswa tidak ditemukan.');
    }

    await prisma.examScheduleMakeupAccess.update({
        where: {
            scheduleId_studentId: {
                scheduleId,
                studentId: parsedStudentId,
            },
        },
        data: {
            isActive: false,
            revokedById,
            revokedAt: new Date(),
        },
    });

    availableExamsCache.delete(parsedStudentId);

    await createInAppNotification({
        data: {
            userId: parsedStudentId,
            title: 'Jadwal Susulan Dibatalkan',
            message: `Jadwal susulan ujian Anda telah dicabut. Hubungi ${CURRICULUM_EXAM_MANAGER_LABEL} bila membutuhkan klarifikasi.`,
            type: 'EXAM',
            data: {
                scheduleId,
                route: '/student/exams',
            },
        },
    });

    res.json(new ApiResponse(200, null, 'Jadwal susulan berhasil dicabut.'));
});

// ==========================================
// Student Exam Access
// ==========================================

export const getAvailableExams = asyncHandler(async (req: Request, res: Response) => {
    const authUser = (req as Request & { user?: { id: number; role: string } }).user;
    const studentId = Number(authUser?.id || 0);
    const accessRole = resolveExamAccessRole(authUser?.role);
    const loadTestBypassSecret = req.header(SBTS_LOAD_TEST_BYPASS_HEADER_NAME);
    const skipAvailableExamsCache = hasSbtsLoadTestBypassSecret(loadTestBypassSecret);
    if (!Number.isFinite(studentId) || studentId <= 0) {
        throw new ApiError(401, 'Sesi login tidak valid.');
    }

    if (!skipAvailableExamsCache) {
        const cachedPayload = getCachedAvailableExams(studentId);
        if (cachedPayload) {
            res.setHeader('Cache-Control', 'private, max-age=3');
            return res.json(new ApiResponse(200, cachedPayload));
        }
    }

    const now = new Date();
    const activeAcademicYearWindow =
        accessRole === 'STUDENT'
            ? await prisma.academicYear.findFirst({
                  where: { isActive: true },
                  select: {
                      id: true,
                      semester1End: true,
                      semester2Start: true,
                      semester2End: true,
                  },
              })
            : null;
    const activeSemesterForStudent = activeAcademicYearWindow
        ? resolveCurrentAcademicYearSemester(activeAcademicYearWindow, now)
        : null;
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
                answers: true,
                score: true,
                updatedAt: true,
            },
        },
        makeupAccesses: {
            where: {
                studentId,
                isActive: true,
            },
            select: {
                id: true,
                startTime: true,
                endTime: true,
                reason: true,
                isActive: true,
            },
        },
    } satisfies Prisma.ExamScheduleSelect;

    let studentClassId: number | null = null;
    let audienceProgramKeys: Set<string> | null = null;
    let schedules: Prisma.ExamScheduleGetPayload<{ select: typeof scheduleSelect }>[] = [];

    if (accessRole === 'STUDENT') {
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            select: { classId: true, studentStatus: true },
        });

        if (student?.studentStatus && student.studentStatus !== 'ACTIVE') {
            const payload = {
                exams: [],
                serverNow: now.toISOString(),
            };
            if (!skipAvailableExamsCache) {
                setCachedAvailableExams(studentId, payload);
                res.setHeader('Cache-Control', 'private, max-age=3');
            } else {
                res.setHeader('Cache-Control', 'no-store');
            }
            res.json(new ApiResponse(200, payload));
            return;
        }

        if (!student?.classId) {
            throw new ApiError(400, 'Student is not assigned to a class');
        }

        studentClassId = Number(student.classId);
        schedules = await prisma.examSchedule.findMany({
            where: {
                classId: student.classId,
                isActive: true,
                ...(activeAcademicYearWindow?.id ? { academicYearId: activeAcademicYearWindow.id } : {}),
                ...(activeSemesterForStudent ? { semester: activeSemesterForStudent } : {}),
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

    const schedulesWithPacketForExamUser = schedulesForExamUser.filter((schedule) => Boolean(schedule.packet));

    const packetIds = Array.from(
        new Set(
            schedulesWithPacketForExamUser
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
            ? schedulesWithPacketForExamUser
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
    const examsWithStatus = schedulesWithPacketForExamUser.map((schedule) => {
        const slotSittings =
            accessRole === 'STUDENT' && studentSittings.length > 0 ? getSlotSittingsForSchedule(schedule) : [];
        const matchingSittings = slotSittings.length > 0 ? getSessionMatchedSittings(schedule, slotSittings) : [];
        const assignedSitting = matchingSittings[0] || slotSittings[0] || null;
        let isBlocked = false;
        let blockReason = '';
        let financeClearance: ExamFinanceClearanceSummary | null = null;
        const packetQuestionCount = schedule.packet ? questionCountByPacketId.get(schedule.packet.id) || 0 : 0;
        const isReady = packetQuestionCount > 0;
        const notReadyReason = isReady ? null : 'Soal untuk jadwal ini belum disiapkan guru.';

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
            const resolvedRestriction = maybeApplySbtsLoadTestRestrictionBypass({
                providedSecret: loadTestBypassSecret,
                accessRole,
                academicYearId: packet.academicYearId,
                semester: packet.semester,
                programCode: normalizedProgramCode,
                examType: packet.type,
                automaticRestriction,
                effectiveRestriction,
            });
            isBlocked = resolvedRestriction.isBlocked;
            blockReason = resolvedRestriction.reason || '';
            financeClearance = buildExamFinanceClearanceSummary(automaticRestriction);
        }

        const session = pickBestSession(schedule.sessions);
        const normalizedSessionStatus = resolveEffectiveSessionStatus(
            session?.status,
            session?.answers,
            session?.submitTime,
        );
        const hasSessionAttempt = Array.isArray(schedule.sessions)
            ? schedule.sessions.some((row) => {
                  const rowStatus = resolveEffectiveSessionStatus(row?.status, row?.answers, row?.submitTime);
                  return (
                      Boolean(row?.startTime) ||
                      rowStatus === 'IN_PROGRESS' ||
                      rowStatus === 'COMPLETED' ||
                      rowStatus === 'TIMEOUT'
                  );
              })
            : false;
        const manualMakeupAccess = (Array.isArray(schedule.makeupAccesses) ? schedule.makeupAccesses : [])[0] || null;
        const makeupContext = resolveExamMakeupContext({
            now,
            hasSessionAttempt,
            manualAccess: manualMakeupAccess,
        });
        const status = session
            ? ['COMPLETED', 'TIMEOUT', 'IN_PROGRESS', 'NOT_STARTED'].includes(normalizedSessionStatus)
                ? normalizedSessionStatus
                : now > schedule.endTime
                    ? 'MISSED'
                    : now < schedule.startTime
                        ? 'UPCOMING'
                        : 'OPEN'
            : makeupContext.availableNow
                ? 'MAKEUP_AVAILABLE'
                : makeupContext.scheduled
                    ? 'UPCOMING'
                : now > schedule.endTime
                    ? 'MISSED'
                    : now < schedule.startTime
                        ? 'UPCOMING'
                        : 'OPEN';

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
                      questionPoolCount: packetQuestionCount,
                      questionCount:
                          Number(schedule.packet.publishedQuestionCount) > 0
                              ? Math.min(
                                    Number(schedule.packet.publishedQuestionCount),
                                    packetQuestionCount,
                                )
                              : packetQuestionCount,
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
            status,
            has_submitted: normalizedSessionStatus === 'COMPLETED' || normalizedSessionStatus === 'TIMEOUT',
            isBlocked,
            blockReason,
            isReady,
            notReadyReason,
            financeClearance,
            makeupAvailable: makeupContext.availableNow,
            makeupMode: makeupContext.mode,
            makeupScheduled: makeupContext.scheduled,
            makeupStartTime: makeupContext.startTime ? makeupContext.startTime.toISOString() : null,
            makeupDeadline: makeupContext.endTime ? makeupContext.endTime.toISOString() : null,
            makeupReason: makeupContext.reason,
        };
    });

    const payload = {
        exams: examsWithStatus,
        serverNow: now.toISOString(),
    };

    if (!skipAvailableExamsCache) {
        setCachedAvailableExams(studentId, payload);
        res.setHeader('Cache-Control', 'private, max-age=3');
    } else {
        res.setHeader('Cache-Control', 'no-store');
    }
    res.json(new ApiResponse(200, payload));
});

async function buildStartExamPayload(params: {
    scheduleId: number;
    studentId: number;
    accessRole: ExamAccessRole;
    loadTestBypassSecret?: string | null;
}): Promise<{
    session: StudentExamSessionSummary;
    packet: StartExamSchedulePayload['packet'] & {
        totalQuestionPoolCount: number;
        publishedQuestionCount: number | null;
        questions: Record<string, unknown>[];
        isMakeup: boolean;
        makeupStartTime: Date | null;
        makeupDeadline: Date | null;
        makeupMode: 'AUTO' | 'FORMAL' | null;
        makeupReason: string | null;
    };
}> {
    const { scheduleId, studentId, accessRole, loadTestBypassSecret } = params;
    const schedule = await getOrCreateStartExamSchedule(scheduleId);

    if (!schedule || !schedule.packet) throw new ApiError(404, 'Exam not found');
    if (!schedule.isActive) {
        throw new ApiError(404, 'Exam not found');
    }
    const studentAccessContext = await assertScheduleAudienceAccess({
        userId: studentId,
        scheduleId,
        scheduleClassId: schedule.classId,
        jobVacancyId: schedule.jobVacancyId,
        academicYearId: schedule.packet.academicYearId,
        accessRole,
        programCode: schedule.packet.programCode,
        fallbackExamType: schedule.examType || schedule.packet.type,
    });

    const student =
        accessRole === 'STUDENT'
            ? {
                  classId: studentAccessContext?.classId || null,
                  studentStatus: studentAccessContext?.studentStatus || null,
              }
            : null;

    const packetQuestions = Array.isArray(schedule.packet.questions)
        ? (schedule.packet.questions as Record<string, unknown>[])
        : [];
    if (packetQuestions.length === 0) {
        throw new ApiError(400, 'Soal untuk ujian ini belum siap dibuka.');
    }
    if (accessRole === 'STUDENT') {
        const activeAcademicYearWindow = await prisma.academicYear.findFirst({
            where: { isActive: true },
            select: {
                id: true,
                semester1End: true,
                semester2Start: true,
                semester2End: true,
            },
        });
        const activeSemesterForStudent = activeAcademicYearWindow
            ? resolveCurrentAcademicYearSemester(activeAcademicYearWindow, new Date())
            : null;
        if (
            activeAcademicYearWindow?.id &&
            Number(schedule.packet.academicYearId) === Number(activeAcademicYearWindow.id) &&
            activeSemesterForStudent &&
            schedule.packet.semester !== activeSemesterForStudent
        ) {
            throw new ApiError(400, 'Ujian ini tidak sesuai dengan semester aktif.');
        }
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
        const resolvedRestriction = maybeApplySbtsLoadTestRestrictionBypass({
            providedSecret: loadTestBypassSecret,
            accessRole,
            academicYearId: schedule.packet.academicYearId,
            semester: schedule.packet.semester,
            programCode: normalizedProgramCode,
            examType: schedule.packet.type,
            automaticRestriction,
            effectiveRestriction,
        });
        if (resolvedRestriction.isBlocked) {
            throw new ApiError(403, resolvedRestriction.reason || 'Access denied by homeroom teacher');
        }
    }

    const now = new Date();
    const allowSbtsLoadTestTimeBypass = canUseSbtsLoadTestBypass({
        providedSecret: loadTestBypassSecret,
        accessRole,
        academicYearId: schedule.packet.academicYearId,
        semester: schedule.packet.semester,
        programCode: normalizedProgramCode,
        examType: schedule.packet.type,
    });
    if (now < schedule.startTime && !allowSbtsLoadTestTimeBypass) {
        throw new ApiError(400, 'Exam has not started yet');
    }

    // Create or get session (race-safe for concurrent start requests).
    let session = await findStudentExamSessionSummary(schedule.id, studentId);

    if (session) {
        const effectiveSessionStatus = resolveEffectiveSessionStatus(session.status, session.answers, session.submitTime);
        if (effectiveSessionStatus === 'TIMEOUT' && String(session.status || '').toUpperCase() !== 'TIMEOUT') {
            session = await prisma.studentExamSession.update({
                where: { id: session.id },
                data: {
                    status: 'TIMEOUT',
                    submitTime: session.submitTime || new Date(),
                    endTime: session.endTime || new Date(),
                },
                select: studentExamSessionSelect,
            });
        }
        if (effectiveSessionStatus === 'COMPLETED' || effectiveSessionStatus === 'TIMEOUT') {
            throw new ApiError(400, 'Anda sudah mengerjakan ujian ini.');
        }
    }

    const resumeInProgressSession =
        Boolean(session) &&
        String(session?.status || '').toUpperCase() === 'IN_PROGRESS' &&
        !session?.submitTime;
    const manualMakeupAccess =
        accessRole === 'STUDENT'
            ? await prisma.examScheduleMakeupAccess.findUnique({
                  where: {
                      scheduleId_studentId: {
                          scheduleId: schedule.id,
                          studentId,
                      },
                  },
                  select: {
                      id: true,
                      startTime: true,
                      endTime: true,
                      reason: true,
                      isActive: true,
                  },
              })
            : null;
    const makeupContext = resolveExamMakeupContext({
        now,
        hasSessionAttempt: Boolean(session),
        manualAccess: manualMakeupAccess,
    });
    if (
        now > schedule.endTime &&
        !resumeInProgressSession &&
        !makeupContext.availableNow &&
        !allowSbtsLoadTestTimeBypass
    ) {
        if (makeupContext.mode === 'FORMAL' && makeupContext.scheduled) {
            throw new ApiError(400, 'Jadwal susulan belum dimulai.');
        }
        if (makeupContext.mode === 'FORMAL' && makeupContext.expired) {
            throw new ApiError(400, 'Jadwal susulan sudah berakhir.');
        }
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
            isMakeup: makeupContext.availableNow,
            makeupStartTime: makeupContext.startTime,
            makeupDeadline: makeupContext.endTime,
            makeupMode: makeupContext.mode,
            makeupReason: makeupContext.reason,
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
    if (!schedule.isActive) {
        throw new ApiError(404, 'Ujian tidak ditemukan.');
    }
    await assertScheduleAudienceAccess({
        userId: studentId,
        scheduleId,
        scheduleClassId: schedule.classId,
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

    const loadTestBypassSecret = req.header(SBTS_LOAD_TEST_BYPASS_HEADER_NAME);
    const payload = await buildStartExamPayload({
        scheduleId,
        studentId,
        accessRole,
        loadTestBypassSecret,
    });
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

    const loadTestBypassSecret = req.header(SBTS_LOAD_TEST_BYPASS_HEADER_NAME);
    const payload = await buildStartExamPayload({
        scheduleId,
        studentId,
        accessRole,
        loadTestBypassSecret,
    });
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

        const questionId = String(q?.id || '').trim();
        const rawAnswer = questionId ? answers?.[questionId] : undefined;
        if (evaluateQuestionCorrectness(q as Record<string, unknown>, rawAnswer) === true) {
            totalScore += points;
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

const EXAM_POST_SUBMIT_QUEUE_CONCURRENCY = Math.max(
    1,
    Math.min(
        4,
        Number.isFinite(Number(process.env.EXAM_POST_SUBMIT_QUEUE_CONCURRENCY))
            ? Number(process.env.EXAM_POST_SUBMIT_QUEUE_CONCURRENCY)
            : 1,
    ),
);
const EXAM_POST_SUBMIT_RETRY_LIMIT = Math.max(
    0,
    Math.min(
        5,
        Number.isFinite(Number(process.env.EXAM_POST_SUBMIT_RETRY_LIMIT))
            ? Number(process.env.EXAM_POST_SUBMIT_RETRY_LIMIT)
            : 2,
    ),
);
const EXAM_POST_SUBMIT_RETRY_BASE_MS = Math.max(
    250,
    Number.isFinite(Number(process.env.EXAM_POST_SUBMIT_RETRY_BASE_MS))
        ? Number(process.env.EXAM_POST_SUBMIT_RETRY_BASE_MS)
        : 1000,
);
const EXAM_POST_SUBMIT_QUEUE_HIGH_WATERMARK = Math.max(
    20,
    Number.isFinite(Number(process.env.EXAM_POST_SUBMIT_QUEUE_HIGH_WATERMARK))
        ? Number(process.env.EXAM_POST_SUBMIT_QUEUE_HIGH_WATERMARK)
        : 120,
);
const EXAM_POST_SUBMIT_QUEUE_BACKPRESSURE_MS = Math.max(
    0,
    Number.isFinite(Number(process.env.EXAM_POST_SUBMIT_QUEUE_BACKPRESSURE_MS))
        ? Number(process.env.EXAM_POST_SUBMIT_QUEUE_BACKPRESSURE_MS)
        : 25,
);

type ExamPostSubmitTask = {
    sessionId: number;
    studentId: number;
    accessRole: ExamAccessRole;
    attempt: number;
    enqueuedAt: number;
};

type ExamPostSubmitPacketSummary = {
    id: number;
    subjectId: number;
    academicYearId: number;
    semester: Semester;
    type: ExamType;
    programCode: string | null;
    questions: unknown;
};

type ExamPostSubmitNfField = 'nf1' | 'nf2' | 'nf3' | 'nf4' | 'nf5' | 'nf6';

type ExamSessionScoreEntrySyncState = {
    gradeId: number | null;
    componentId: number | null;
    componentCode: string | null;
    entryMode: string | null;
    nfField: ExamPostSubmitNfField | null;
    reservedAt: string | null;
    syncedAt: string | null;
};

const EXAM_POST_SUBMIT_NF_FIELDS: ExamPostSubmitNfField[] = ['nf1', 'nf2', 'nf3', 'nf4', 'nf5', 'nf6'];

const examPostSubmitQueue: ExamPostSubmitTask[] = [];
const examPostSubmitQueuedSessionIds = new Set<number>();
const examPostSubmitInFlightSessionIds = new Set<number>();
let examPostSubmitActiveWorkers = 0;
let examPostSubmitDrainScheduled = false;
let examPostSubmitBackpressureWarningOpen = false;

function resolveScoringQuestionsForSession(params: {
    packetQuestions: Record<string, unknown>[];
    sessionAnswers: Record<string, unknown>;
    fallbackQuestionSet?: ReturnType<typeof sanitizeQuestionSetMeta> | null;
}): Record<string, unknown>[] {
    const sessionQuestionSet =
        sanitizeQuestionSetMeta((params.sessionAnswers as Record<string, unknown>).__questionSet)
        || params.fallbackQuestionSet
        || null;

    if (!sessionQuestionSet?.ids?.length) {
        return params.packetQuestions;
    }

    const packetMap = new Map<string, Record<string, unknown>>();
    params.packetQuestions.forEach((question) => {
        const questionId = String(question?.id || '').trim();
        if (!questionId) return;
        packetMap.set(questionId, question);
    });

    const selected = sessionQuestionSet.ids
        .map((questionId) => packetMap.get(questionId))
        .filter((question): question is Record<string, unknown> => Boolean(question));

    return selected.length > 0 ? selected : params.packetQuestions;
}

function resolveExamSessionScoreEntrySourceKey(sessionId: number): string {
    return `examSession:${sessionId}`;
}

function resolveExamPostSubmitNfField(raw: unknown): ExamPostSubmitNfField | null {
    const normalized = String(raw || '').trim().toLowerCase();
    if ((EXAM_POST_SUBMIT_NF_FIELDS as string[]).includes(normalized)) {
        return normalized as ExamPostSubmitNfField;
    }
    return null;
}

function parseExamSessionScoreEntrySyncState(rawMetadata: unknown): ExamSessionScoreEntrySyncState | null {
    if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
        return null;
    }

    const source = rawMetadata as Record<string, unknown>;
    const rawSyncState = source.autoFillStudentGrade;
    if (!rawSyncState || typeof rawSyncState !== 'object' || Array.isArray(rawSyncState)) {
        return null;
    }

    const syncState = rawSyncState as Record<string, unknown>;
    const parsedGradeId = Number(syncState.gradeId);
    const parsedComponentId = Number(syncState.componentId);

    return {
        gradeId: Number.isFinite(parsedGradeId) && parsedGradeId > 0 ? parsedGradeId : null,
        componentId: Number.isFinite(parsedComponentId) && parsedComponentId > 0 ? parsedComponentId : null,
        componentCode: syncState.componentCode ? String(syncState.componentCode) : null,
        entryMode: syncState.entryMode ? String(syncState.entryMode) : null,
        nfField: resolveExamPostSubmitNfField(syncState.nfField),
        reservedAt: syncState.reservedAt ? String(syncState.reservedAt) : null,
        syncedAt: syncState.syncedAt ? String(syncState.syncedAt) : null,
    };
}

function resolveNextExamPostSubmitNfField(
    grade:
        | {
              nf1?: number | null;
              nf2?: number | null;
              nf3?: number | null;
              nf4?: number | null;
              nf5?: number | null;
              nf6?: number | null;
          }
        | null,
): ExamPostSubmitNfField | null {
    if (!grade) {
        return 'nf1';
    }

    for (const field of EXAM_POST_SUBMIT_NF_FIELDS) {
        const value = grade[field];
        if (value === null || value === undefined) {
            return field;
        }
    }

    return null;
}

function buildExamSessionScoreEntrySyncMetadata(params: {
    componentId: number;
    componentCode: string | null;
    entryMode: GradeEntryMode;
    gradeId: number | null;
    nfField: ExamPostSubmitNfField | null;
    reservedAt: string;
    syncedAt?: string | null;
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
    };
}

function resolveExamPostSubmitDrainDelayMs(): number {
    const pendingDepth = examPostSubmitQueue.length + examPostSubmitActiveWorkers;
    if (pendingDepth >= EXAM_POST_SUBMIT_QUEUE_HIGH_WATERMARK) {
        return EXAM_POST_SUBMIT_QUEUE_BACKPRESSURE_MS;
    }
    return 0;
}

async function syncCompletedStudentExamArtifacts(params: {
    sessionId: number;
    studentId: number;
    score: number;
    packet: ExamPostSubmitPacketSummary;
}) {
    const { subjectId, academicYearId, semester, type, programCode } = params.packet;
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

    let component = componentCode
        ? await prisma.gradeComponent.findFirst({
              where: { subjectId, code: componentCode, isActive: true },
          })
        : null;

    if (!component) {
        component = await prisma.gradeComponent.findFirst({
            where: { subjectId, type: componentType, isActive: true },
        });
    }

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
                    isActive: true,
                },
            });
        } catch (error) {
            console.error('Failed to auto-create grade component:', error);
        }
    }

    if (!component) return;

    const scoreEntrySourceKey = resolveExamSessionScoreEntrySourceKey(params.sessionId);
    const existingScoreEntry = await prisma.studentScoreEntry.findUnique({
        where: { sourceKey: scoreEntrySourceKey },
        select: { metadata: true },
    });
    const existingSyncState = parseExamSessionScoreEntrySyncState(existingScoreEntry?.metadata);

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
            : null;

    if (!grade) {
        grade = await prisma.studentGrade.findFirst({
            where: {
                studentId: params.studentId,
                subjectId,
                academicYearId,
                componentId: component.id,
                semester,
            },
        });
    }

    const reservedAt = existingSyncState?.reservedAt || new Date().toISOString();
    const reservedNfField =
        gradeEntryMode === GradeEntryMode.NF_SERIES
            ? existingSyncState?.nfField || resolveNextExamPostSubmitNfField(grade)
            : null;

    if (!existingSyncState?.syncedAt) {
        try {
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
                    gradeId: grade?.id ?? existingSyncState?.gradeId ?? null,
                    nfField: reservedNfField,
                    reservedAt,
                    syncedAt: existingSyncState?.syncedAt || null,
                }),
            });
        } catch (scoreEntryError) {
            console.error('Failed to reserve exam session score entry sync state:', scoreEntryError);
            throw scoreEntryError;
        }
    }

    if (existingSyncState?.syncedAt) {
        return;
    }

    let syncedStudentGradeId: number | null = grade?.id ?? existingSyncState?.gradeId ?? null;
    if (grade) {
        const updateData: Record<string, unknown> = {};
        if (gradeEntryMode === GradeEntryMode.NF_SERIES) {
            if (reservedNfField) {
                updateData[reservedNfField] = params.score;
            }

            const nfs = EXAM_POST_SUBMIT_NF_FIELDS.map((field) => {
                if (field === reservedNfField) {
                    return params.score;
                }
                return grade?.[field] ?? null;
            }).filter((value): value is number => value !== null && value !== undefined);

            if (nfs.length > 0) {
                updateData.score = nfs.reduce((left, right) => left + right, 0) / nfs.length;
            }
        } else {
            updateData.score = params.score;
        }

        if (Object.keys(updateData).length > 0) {
            const updatedGrade = await prisma.studentGrade.update({
                where: { id: grade.id },
                data: updateData,
            });
            syncedStudentGradeId = updatedGrade.id;
            grade = updatedGrade;
        }
    } else {
        const createData: Prisma.StudentGradeUncheckedCreateInput = {
            studentId: params.studentId,
            subjectId,
            academicYearId,
            componentId: component.id,
            semester,
            score: params.score,
        };

        if (gradeEntryMode === GradeEntryMode.NF_SERIES) {
            createData[reservedNfField || 'nf1'] = params.score;
        }

        const createdGrade = await prisma.studentGrade.create({
            data: createData,
        });
        syncedStudentGradeId = createdGrade.id;
        grade = createdGrade;
    }

    if (syncedStudentGradeId) {
        try {
            await syncScoreEntriesFromStudentGrade(syncedStudentGradeId);
        } catch (scoreEntryError) {
            console.error('Failed to sync score entry from student grade auto-fill:', scoreEntryError);
            throw scoreEntryError;
        }
    }

    try {
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
        });
    } catch (scoreEntryError) {
        console.error('Failed to upsert score entry from exam session:', scoreEntryError);
        throw scoreEntryError;
    }

    await syncReportGrade(params.studentId, subjectId, academicYearId, semester);
}

async function processExamPostSubmitTask(task: ExamPostSubmitTask) {
    const session = await prisma.studentExamSession.findUnique({
        where: { id: task.sessionId },
        select: {
            id: true,
            studentId: true,
            status: true,
            submitTime: true,
            score: true,
            answers: true,
            schedule: {
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
            },
        },
    });

    if (!session?.schedule?.packet) {
        return;
    }

    if (!['COMPLETED', 'TIMEOUT'].includes(String(session.status || '').toUpperCase()) || !session.submitTime) {
        return;
    }

    const normalizedAnswers = sanitizeAnswersForStorage(session.answers);
    const packetQuestions = Array.isArray(session.schedule.packet.questions)
        ? (session.schedule.packet.questions as Record<string, unknown>[])
        : [];
    const scoringQuestions = resolveScoringQuestionsForSession({
        packetQuestions,
        sessionAnswers: normalizedAnswers,
    });
    const resolvedScore =
        typeof session.score === 'number'
            ? session.score
            : packetQuestions.length > 0
              ? calculateScore(scoringQuestions, normalizedAnswers)
              : undefined;

    if (typeof resolvedScore === 'number' && session.score !== resolvedScore) {
        await prisma.studentExamSession.update({
            where: { id: session.id },
            data: {
                score: resolvedScore,
            },
        });
    }

    if (typeof resolvedScore === 'number' && task.accessRole === 'STUDENT') {
        await syncCompletedStudentExamArtifacts({
            sessionId: session.id,
            studentId: session.studentId,
            score: resolvedScore,
            packet: session.schedule.packet,
        });
    }

    if (
        typeof resolvedScore === 'number' &&
        task.accessRole === 'UMUM' &&
        Number.isFinite(Number(session.schedule.jobVacancyId || 0))
    ) {
        await syncBkkOnlineTestAssessmentFromExamSession({
            applicantId: session.studentId,
            vacancyId: Number(session.schedule.jobVacancyId),
            score: resolvedScore,
            assessedAt: new Date(),
        });
    }

    invalidateSessionDetailCacheBySession(session.id);
    invalidatePacketSubmissionsCacheByPacket(session.schedule.packet.id);
    invalidatePacketItemAnalysisCacheByPacket(session.schedule.packet.id);
}

function scheduleExamPostSubmitRetry(task: ExamPostSubmitTask) {
    if (task.attempt >= EXAM_POST_SUBMIT_RETRY_LIMIT) {
        console.error(
            `[EXAM_POST_SUBMIT] Session ${task.sessionId} gagal diproses setelah ${task.attempt + 1} percobaan.`,
        );
        return;
    }

    const nextAttempt = task.attempt + 1;
    const delayMs = EXAM_POST_SUBMIT_RETRY_BASE_MS * Math.max(1, 2 ** task.attempt);

    setTimeout(() => {
        enqueueExamPostSubmitTask({
            sessionId: task.sessionId,
            studentId: task.studentId,
            accessRole: task.accessRole,
            attempt: nextAttempt,
        });
    }, delayMs);
}

async function drainExamPostSubmitQueue() {
    while (
        examPostSubmitActiveWorkers < EXAM_POST_SUBMIT_QUEUE_CONCURRENCY &&
        examPostSubmitQueue.length > 0
    ) {
        const task = examPostSubmitQueue.shift();
        if (!task) break;

        examPostSubmitQueuedSessionIds.delete(task.sessionId);
        examPostSubmitInFlightSessionIds.add(task.sessionId);
        examPostSubmitActiveWorkers += 1;

        void processExamPostSubmitTask(task)
            .catch((error) => {
                console.error(
                    `[EXAM_POST_SUBMIT] Gagal memproses session ${task.sessionId}:`,
                    error,
                );
                scheduleExamPostSubmitRetry(task);
            })
            .finally(() => {
                examPostSubmitInFlightSessionIds.delete(task.sessionId);
                examPostSubmitActiveWorkers = Math.max(0, examPostSubmitActiveWorkers - 1);
                scheduleExamPostSubmitDrain(resolveExamPostSubmitDrainDelayMs());
            });
    }
}

function scheduleExamPostSubmitDrain(delayMs = 0) {
    if (examPostSubmitDrainScheduled) return;
    examPostSubmitDrainScheduled = true;

    setTimeout(() => {
        examPostSubmitDrainScheduled = false;
        void drainExamPostSubmitQueue();
    }, Math.max(0, delayMs));
}

function enqueueExamPostSubmitTask(
    task: Omit<ExamPostSubmitTask, 'attempt' | 'enqueuedAt'> & { attempt?: number },
) {
    if (!Number.isFinite(task.sessionId) || task.sessionId <= 0) return;
    if (
        examPostSubmitQueuedSessionIds.has(task.sessionId) ||
        examPostSubmitInFlightSessionIds.has(task.sessionId)
    ) {
        return;
    }

    examPostSubmitQueue.push({
        ...task,
        attempt: Number.isFinite(Number(task.attempt)) ? Number(task.attempt) : 0,
        enqueuedAt: Date.now(),
    });
    examPostSubmitQueuedSessionIds.add(task.sessionId);
    const pendingDepth = examPostSubmitQueue.length + examPostSubmitActiveWorkers;
    if (pendingDepth >= EXAM_POST_SUBMIT_QUEUE_HIGH_WATERMARK) {
        if (!examPostSubmitBackpressureWarningOpen) {
            console.warn(
                `[EXAM_POST_SUBMIT] Backpressure aktif. Pending queue depth=${pendingDepth}, concurrency=${EXAM_POST_SUBMIT_QUEUE_CONCURRENCY}.`,
            );
            examPostSubmitBackpressureWarningOpen = true;
        }
    } else if (examPostSubmitBackpressureWarningOpen && pendingDepth < EXAM_POST_SUBMIT_QUEUE_HIGH_WATERMARK / 2) {
        examPostSubmitBackpressureWarningOpen = false;
    }
    scheduleExamPostSubmitDrain(resolveExamPostSubmitDrainDelayMs());
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

    if (session.status === 'COMPLETED' || session.status === 'TIMEOUT' || Boolean(session.submitTime)) {
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
    const incomingMonitoring = extractMonitoringSummaryFromAnswers(normalizedIncomingAnswers);
    const shouldForceTimeout = incomingMonitoring.totalViolations >= 4;
    const shouldCloseSession = isFinished || shouldForceTimeout;

    if (!isFinished) {
        const unchangedPayload =
            stableSerializeJson(normalizedIncomingAnswers) === stableSerializeJson(previousAnswers);
        if (session.status === 'IN_PROGRESS' && unchangedPayload) {
            return res.json(new ApiResponse(200, session, 'Answers already up-to-date'));
        }
    }

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
    
    if (shouldCloseSession) {
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
                 ? (finishedSchedule.packet.questions as Record<string, unknown>[])
                 : [];
             const scoringQuestions = resolveScoringQuestionsForSession({
                 packetQuestions,
                 sessionAnswers: normalizedIncomingAnswers,
                 fallbackQuestionSet: previousQuestionSet,
             });

             if (!forceSubmit && !shouldForceTimeout) {
                 const unansweredCount = scoringQuestions.filter(
                     (question) =>
                         !isAnsweredForQuestion(
                             question,
                             normalizedIncomingAnswers[String(question?.id || '').trim()],
                         ),
                 ).length;
                 if (unansweredCount > 0) {
                     throw new ApiError(
                         400,
                         `Masih ada ${unansweredCount} soal belum dijawab. Jawab semua soal sebelum mengumpulkan ujian.`,
                     );
                 }
             }
        }
    }

    const updatedSession = await prisma.studentExamSession.update({
        where: { id: session.id },
        data: {
            answers: normalizedIncomingAnswers as Prisma.InputJsonValue,
            status: shouldForceTimeout ? 'TIMEOUT' : shouldCloseSession ? 'COMPLETED' : 'IN_PROGRESS',
            submitTime: shouldCloseSession ? new Date() : undefined,
            endTime: shouldCloseSession ? new Date() : undefined,
        }
    });

    if (shouldCloseSession && finishedSchedule?.packet?.id) {
        invalidatePacketItemAnalysisCacheByPacket(finishedSchedule.packet.id);
        invalidatePacketSubmissionsCacheByPacket(finishedSchedule.packet.id);
    }
    invalidateSessionDetailCacheBySession(session.id);

    availableExamsCache.delete(studentId);

    res.json(new ApiResponse(200, updatedSession, 'Answers saved'));

    if (shouldCloseSession && finishedSchedule?.packet?.id) {
        enqueueExamPostSubmitTask({
            sessionId: updatedSession.id,
            studentId,
            accessRole,
        });
    }
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

    const [allClassStudents, filteredStudents] = await Promise.all([
        listHistoricalStudentsForAcademicYear({
            academicYearId: parsedAcademicYearId,
            classId: parsedClassId,
        }),
        listHistoricalStudentsForAcademicYear({
            academicYearId: parsedAcademicYearId,
            classId: parsedClassId,
            search: String(search || '').trim() || null,
        }),
    ]);

    const total = filteredStudents.length;
    const students = filteredStudents.slice(skip, skip + limitNum).map((student) => ({
        id: student.id,
        nisn: student.nisn,
        name: student.name,
    }));

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
    const studentSnapshot = await getHistoricalStudentSnapshotForAcademicYear(
        parsedStudentId,
        parsedAcademicYearId,
    );
    if (!studentSnapshot) {
        throw new ApiError(400, 'Siswa tidak valid untuk tahun ajaran restriction yang dipilih.');
    }
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
