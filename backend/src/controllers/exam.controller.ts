import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { asyncHandler, ApiError, ApiResponse } from '../utils/api';
import { ExamType, Semester, GradeComponentType, GradeEntryMode, Prisma } from '@prisma/client';
import { syncReportGrade } from './grade.controller';
import { syncScoreEntriesFromStudentGrade, upsertScoreEntryFromExamSession } from '../services/scoreEntry.service';

const SUPPORTED_PACKET_TYPES: readonly ExamType[] = [
    ExamType.FORMATIF,
    ExamType.SBTS,
    ExamType.SAS,
    ExamType.SAT,
    ExamType.US_PRACTICE,
    ExamType.US_THEORY,
];

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

function normalizePacketType(rawType: unknown): ExamType {
    const value = String(rawType || '').toUpperCase();
    if (value === 'QUIZ') {
        return ExamType.FORMATIF;
    }
    if (SUPPORTED_PACKET_TYPES.includes(value as ExamType)) {
        return value as ExamType;
    }
    throw new ApiError(400, 'Tipe ujian tidak valid untuk packet ujian.');
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

function assertTypeSemesterCompatibility(type: ExamType, semester: Semester) {
    if (type === ExamType.SAS && semester !== Semester.ODD) {
        throw new ApiError(400, 'Ujian SAS hanya boleh dibuat untuk semester Ganjil (ODD).');
    }
    if (type === ExamType.SAT && semester !== Semester.EVEN) {
        throw new ApiError(400, 'Ujian SAT hanya boleh dibuat untuk semester Genap (EVEN).');
    }
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
    if (type === ExamType.FORMATIF) return GradeComponentType.FORMATIVE;
    if (type === ExamType.SBTS) return GradeComponentType.MIDTERM;
    if (type === ExamType.SAS || type === ExamType.SAT) return GradeComponentType.FINAL;
    if (type === ExamType.US_PRACTICE) return GradeComponentType.US_PRACTICE;
    if (type === ExamType.US_THEORY) return GradeComponentType.US_THEORY;
    return GradeComponentType.FORMATIVE;
}

function defaultGradeComponentCodeByPacketType(type: ExamType): string {
    if (type === ExamType.FORMATIF) return 'FORMATIVE';
    if (type === ExamType.SBTS) return 'MIDTERM';
    if (type === ExamType.SAS || type === ExamType.SAT) return 'FINAL';
    if (type === ExamType.US_PRACTICE) return 'US_PRACTICE';
    if (type === ExamType.US_THEORY) return 'US_THEORY';
    return 'FORMATIVE';
}

function defaultGradeEntryModeByCode(code: string): GradeEntryMode {
    return code === 'FORMATIVE' ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE;
}

function mapGradeComponentTypeFromCode(
    code: string,
    fallback: GradeComponentType = GradeComponentType.CUSTOM,
): GradeComponentType {
    if (code === 'FORMATIVE') return GradeComponentType.FORMATIVE;
    if (code === 'MIDTERM') return GradeComponentType.MIDTERM;
    if (code === 'FINAL') return GradeComponentType.FINAL;
    if (code === 'SKILL') return GradeComponentType.SKILL;
    if (code === 'US_PRACTICE') return GradeComponentType.US_PRACTICE;
    if (code === 'US_THEORY') return GradeComponentType.US_THEORY;
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

    const legacyType = normalizePacketType(params.legacyType);
    assertTypeSemesterCompatibility(legacyType, params.semester);

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
        programCode: legacyType,
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
};

type PacketSubmissionSummary = {
    generatedAt: string;
    classFilterId: number | null;
    statusFilter: string | null;
    scheduleCount: number;
    sessionCount: number;
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

type AnalysisQuestionAccumulator = {
    questionId: string;
    orderNumber: number;
    type: string;
    contentPreview: string;
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
    const plain = String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain) return '(tanpa teks soal)';
    return plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
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
    options: { classId?: number; user: { id: number; role: string } },
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

        return {
            questionId,
            orderNumber: Number(question.order_number || index + 1),
            type,
            contentPreview: sanitizeQuestionContentPreview(question.content || question.question_text),
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

    const [schedules, sessions, inProgressCount] = await Promise.all([
        prisma.examSchedule.findMany({
            where: scheduleWhere,
            select: { id: true, classId: true },
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
                scheduleId: true,
                status: true,
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
            scheduleCount: schedules.length,
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

    const [schedules, sessions] = await Promise.all([
        prisma.examSchedule.findMany({
            where: scheduleWhere,
            select: {
                id: true,
                class: { select: { id: true, name: true } },
            },
        }),
        prisma.studentExamSession.findMany({
            where: {
                schedule: scheduleWhere,
                ...(options.status ? { status: options.status } : {}),
            },
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

        let score: number | null = typeof session.score === 'number' ? Number(session.score.toFixed(2)) : null;
        if (score === null && objectiveQuestionCount > 0 && (session.status === 'COMPLETED' || session.status === 'TIMEOUT')) {
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
            status: session.status,
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
        };
    });

    const participantCount = new Set(sessionRows.map((row) => row.student.id)).size;
    const submittedCount = sessionRows.filter((row) => row.status === 'COMPLETED' || row.status === 'TIMEOUT').length;
    const inProgressCount = sessionRows.filter((row) => row.status === 'IN_PROGRESS').length;
    const scoreValues = sessionRows
        .map((row) => row.score)
        .filter((value): value is number => typeof value === 'number');
    const averageScore =
        scoreValues.length > 0
            ? Number((scoreValues.reduce((acc, value) => acc + value, 0) / scoreValues.length).toFixed(2))
            : null;
    const highestScore = scoreValues.length > 0 ? Number(Math.max(...scoreValues).toFixed(2)) : null;
    const lowestScore = scoreValues.length > 0 ? Number(Math.min(...scoreValues).toFixed(2)) : null;

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
            scheduleCount: schedules.length,
            sessionCount: sessionRows.length,
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
    
    const where: any = {};
    
    if (type) where.type = normalizePacketType(type);
    if (subjectId) where.subjectId = parseInt(subjectId as string);
    if (academicYearId) where.academicYearId = parseInt(academicYearId as string);
    if (semester) where.semester = semester;
    if (programCode) where.programCode = normalizeProgramCode(programCode);

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

    const packet = await prisma.examPacket.create({
        data: {
            title,
            subjectId: parseInt(subjectId),
            academicYearId: normalizedAcademicYearId,
            type: resolvedProgram.baseType,
            programCode: resolvedProgram.programCode,
            semester: normalizedSemester,
            duration: parseInt(duration),
            description,
            instructions,
            kkm: kkm ? parseFloat(kkm) : 75,
            questions: normalizedQuestions || questions,
            authorId: user.id
        }
    });

    // Handle Save to Question Bank
    if (saveToBank && normalizedQuestions && normalizedQuestions.length > 0) {
        try {
            // Create a new Question Bank for this exam
            const bank = await prisma.questionBank.create({
                data: {
                    title: `Bank Soal: ${title}`,
                    subjectId: parseInt(subjectId),
                    academicYearId: normalizedAcademicYearId,
                    semester: normalizedSemester,
                    classLevel: 'ALL', // Default or derived if possible
                    authorId: user.id
                }
            });

            // Create Questions
            const questionPromises = normalizedQuestions.map((q) =>
                createQuestionBankEntry({
                    bank: { connect: { id: bank.id } },
                    type: q.type as any,
                    content: q.content,
                    options: (q.options || []) as Prisma.InputJsonValue,
                    answerKey: q.answerKey || deriveAnswerKeyFromOptions(q.options),
                    points: q.score || 1,
                    mediaUrl: q.question_image_url || q.question_video_url,
                    mediaType: q.question_video_type || (q.question_image_url ? 'image' : null),
                    metadata: buildQuestionBankMetadata(q) as Prisma.InputJsonValue | undefined,
                }),
            );

            await Promise.all(questionPromises);
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
    } = req.body;

    const packetId = parseInt(id);
    const existingPacket = await prisma.examPacket.findUnique({
        where: { id: packetId },
        select: {
            id: true,
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
    const normalizedSemester = normalizePacketSemester(semester || existingPacket.semester);
    const resolvedProgram = await resolvePacketProgram({
        academicYearId: normalizedAcademicYearId,
        semester: normalizedSemester,
        programCode: programCode ?? existingPacket.programCode,
        legacyType: type ?? existingPacket.type,
        currentProgramCode: existingPacket.programCode,
    });
    const normalizedQuestions = normalizeQuestionsPayload(questions);

    const packet = await prisma.examPacket.update({
        where: { id: packetId },
        data: {
            title,
            subjectId: parseInt(subjectId),
            academicYearId: normalizedAcademicYearId,
            type: resolvedProgram.baseType,
            programCode: resolvedProgram.programCode,
            semester: normalizedSemester,
            duration: parseInt(duration),
            description,
            instructions,
            kkm: kkm ? parseFloat(kkm) : undefined,
            questions: normalizedQuestions || questions
        }
    });

    // Handle Save to Question Bank
    if (saveToBank && normalizedQuestions && normalizedQuestions.length > 0) {
        try {
            // Check if a bank already exists for this packet title to avoid duplicates
            // Ideally we might want to update it, but for simplicity let's create new or skip
            // Let's create a new one with timestamp to be safe or append (Copy)
            
            const bank = await prisma.questionBank.create({
                data: {
                    title: `Bank Soal: ${title} (Copy)`,
                    subjectId: parseInt(subjectId),
                    academicYearId: normalizedAcademicYearId,
                    semester: normalizedSemester,
                    classLevel: 'ALL',
                    authorId: (req as any).user.id
                }
            });

            const questionPromises = normalizedQuestions.map((q) =>
                createQuestionBankEntry({
                    bank: { connect: { id: bank.id } },
                    type: q.type as any,
                    content: q.content,
                    options: (q.options || []) as Prisma.InputJsonValue,
                    answerKey: q.answerKey || deriveAnswerKeyFromOptions(q.options),
                    points: q.score || 1,
                    mediaUrl: q.question_image_url || q.question_video_url,
                    mediaType: q.question_video_type || (q.question_image_url ? 'image' : null),
                    metadata: buildQuestionBankMetadata(q) as Prisma.InputJsonValue | undefined,
                }),
            );

            await Promise.all(questionPromises);
        } catch (error) {
            console.error('Failed to save questions to bank during update:', error);
        }
    }

    res.json(new ApiResponse(200, packet, 'Exam packet updated successfully'));
});

export const deletePacket = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.examPacket.delete({ where: { id: parseInt(id) } });
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
    const analysis = await buildPacketItemAnalysis(packetId, { classId, user });
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
    const user = (req as any).user as { id: number; role: string };
    const submissions = await buildPacketSubmissions(packetId, { classId, status, user });
    res.json(new ApiResponse(200, submissions, 'Daftar submission ujian berhasil diambil.'));
});

export const getSessionDetail = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
        throw new ApiError(400, 'ID session tidak valid.');
    }

    const user = (req as any).user as { id: number; role: string };
    const detail = await buildSessionDetail(sessionId, { user });
    res.json(new ApiResponse(200, detail, 'Detail jawaban sesi berhasil diambil.'));
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
    const analysis = await buildPacketItemAnalysis(packetId, { classId, user });

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

export const getSchedules = asyncHandler(async (req: Request, res: Response) => {
    const { classId, academicYearId, examType, programCode } = req.query;
    const where: Prisma.ExamScheduleWhereInput = {};

    if (classId) {
        where.classId = Number(classId);
    }
    if (academicYearId) {
        where.academicYearId = Number(academicYearId);
    }

    const normalizedProgramCode = normalizeProgramCode(programCode || examType);
    if (normalizedProgramCode) {
        const orFilters: Prisma.ExamScheduleWhereInput[] = [
            { examType: normalizedProgramCode },
            { packet: { is: { programCode: normalizedProgramCode } } },
        ];

        if (SUPPORTED_PACKET_TYPES.includes(normalizedProgramCode as ExamType)) {
            orFilters.push({ packet: { is: { type: normalizedProgramCode as ExamType } } });
        }

        where.OR = orFilters;
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        include: {
            class: true,
            packet: { include: { subject: true } },
            academicYear: true,
            subject: true,
            proctor: { select: { id: true, name: true } },
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
    } = req.body;
    const targetClassIds = classIds || (classId ? [classId] : []);
    
    if (targetClassIds.length === 0) {
        throw new ApiError(400, 'Class ID is required');
    }

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

    const createdSchedules = [];

    for (const cId of targetClassIds) {
        const schedule = await prisma.examSchedule.create({
            data: {
                classId: Number(cId),
                packetId: packet?.id ?? null,
                subjectId: fallbackSubjectId,
                startTime: normalizedStartTime,
                endTime: normalizedEndTime,
                proctorId: parsedProctorId,
                academicYearId: fallbackAcademicYearId,
                semester: normalizedSemester,
                examType: normalizedExamType,
                room,
            }
        });
        createdSchedules.push(schedule);
    }

    res.json(new ApiResponse(201, createdSchedules, 'Exam schedules created successfully'));
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { startTime, endTime, proctorId, room, isActive } = req.body;
    const schedule = await prisma.examSchedule.update({
        where: { id: parseInt(id) },
        data: {
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
            proctorId: proctorId ? parseInt(proctorId) : undefined,
            room,
            isActive
        }
    });
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

    res.json(new ApiResponse(200, null, 'Exam schedule deleted successfully'));
});

// ==========================================
// Student Exam Access
// ==========================================

export const getAvailableExams = asyncHandler(async (req: Request, res: Response) => {
    const studentId = (req as any).user!.id;
    const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { classId: true }
    });

    if (!student?.classId) {
        throw new ApiError(400, 'Student is not assigned to a class');
    }

    const now = new Date();

    // Find schedules for the student's class
    const schedules = await prisma.examSchedule.findMany({
        where: {
            classId: student.classId,
            isActive: true,
            // You might want to filter by time, but user might want to see upcoming/past exams too
            // For "Available" we usually mean exams they can take or see results for
        },
        include: {
            packet: {
                include: { subject: true }
            },
            sessions: {
                where: { studentId }
            }
        },
        orderBy: { startTime: 'asc' }
    });

    // Check restrictions
    const examsWithStatus = await Promise.all(schedules.map(async (schedule) => {
        let isBlocked = false;
        let blockReason = '';

        if (schedule.packet) {
            const restriction = await prisma.studentExamRestriction.findUnique({
                where: {
                    studentId_academicYearId_semester_examType: {
                        studentId,
                        academicYearId: schedule.packet.academicYearId,
                        semester: schedule.packet.semester,
                        examType: schedule.packet.type
                    }
                }
            });

            if (restriction && restriction.isBlocked) {
                isBlocked = true;
                blockReason = restriction.reason || 'Anda tidak diizinkan mengikuti ujian ini.';
            }
        }

        const session = schedule.sessions[0];
        const status = session ? session.status : (now > schedule.endTime ? 'MISSED' : (now < schedule.startTime ? 'UPCOMING' : 'OPEN'));

        return {
            ...schedule,
            status,
            has_submitted: session?.status === 'COMPLETED',
            isBlocked,
            blockReason
        };
    }));

    res.json(new ApiResponse(200, examsWithStatus));
});

export const startExam = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params; // scheduleId
    const studentId = (req as any).user!.id;

    const schedule = await prisma.examSchedule.findUnique({
        where: { id: parseInt(id) },
        include: { 
            packet: {
                include: {
                    subject: true
                }
            }
        }
    });

    if (!schedule || !schedule.packet) throw new ApiError(404, 'Exam not found');

    // Check restriction
    const restriction = await prisma.studentExamRestriction.findUnique({
        where: {
            studentId_academicYearId_semester_examType: {
                studentId,
                academicYearId: schedule.packet.academicYearId,
                semester: schedule.packet.semester,
                examType: schedule.packet.type
            }
        }
    });

    if (restriction && restriction.isBlocked) {
        throw new ApiError(403, restriction.reason || 'Access denied by homeroom teacher');
    }

    const now = new Date();
    if (now < schedule.startTime) throw new ApiError(400, 'Exam has not started yet');
    if (now > schedule.endTime) throw new ApiError(400, 'Exam has ended');

    // Create or get session
          let session = await prisma.studentExamSession.findFirst({
            where: { scheduleId: schedule.id, studentId }
          });

          if (session && (session.status === 'COMPLETED' || session.status === 'TIMEOUT')) {
            throw new ApiError(400, 'Anda sudah mengerjakan ujian ini.');
          }

          if (!session) {
        session = await prisma.studentExamSession.create({
            data: {
                scheduleId: schedule.id,
                studentId,
                startTime: now,
                status: 'IN_PROGRESS'
            }
        });
    }

    // Return packet with questions
    res.json(new ApiResponse(200, {
        session,
        packet: schedule.packet
    }));
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

export const submitAnswers = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params; // scheduleId
    const { answers, finish, is_final_submit } = req.body;
    const user = (req as any).user;
    const studentId = user.id;

    // Support both flags
    const isFinished = finish || is_final_submit;

    const session = await prisma.studentExamSession.findFirst({
        where: { scheduleId: parseInt(id), studentId }
    });

    if (!session) throw new ApiError(404, 'Session not found');

    // Calculate score if finishing
    let finalScore: number | undefined = undefined;
    
    if (isFinished) {
        // Get Exam Packet Questions
        const schedule = await prisma.examSchedule.findUnique({
            where: { id: parseInt(id) },
            include: { packet: true }
        });
        
        if (schedule && schedule.packet && schedule.packet.questions) {
             const questions = schedule.packet.questions as any[];
             finalScore = calculateScore(questions, answers);
        }
    }

    const updatedSession = await prisma.studentExamSession.update({
        where: { id: session.id },
        data: {
            answers,
            status: isFinished ? 'COMPLETED' : 'IN_PROGRESS',
            submitTime: isFinished ? new Date() : undefined,
            endTime: isFinished ? new Date() : undefined,
            score: finalScore
        }
    });

    // Auto-fill StudentGrade if finished and score calculated
    if (isFinished && finalScore !== undefined) {
        try {
            const schedule = await prisma.examSchedule.findUnique({
                where: { id: parseInt(id) },
                include: { packet: true }
            });

            if (schedule && schedule.packet) {
                const { subjectId, academicYearId, semester, type, programCode } = schedule.packet;
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

    res.json(new ApiResponse(200, updatedSession, 'Answers saved'));
});

// ==========================================
// Exam Restriction (Homeroom)
// ==========================================

export const getExamRestrictions = asyncHandler(async (req: Request, res: Response) => {
    const { classId, academicYearId, semester, examType, page = 1, limit = 10, search } = req.query;
    
    if (!classId || !academicYearId || !semester || !examType) {
        throw new ApiError(400, 'Missing required query parameters');
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { 
        classId: parseInt(classId as string), 
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
    const [students, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: { id: true, nisn: true, name: true },
            orderBy: { name: 'asc' },
            skip,
            take: limitNum
        }),
        prisma.user.count({
            where
        })
    ]);

    // Get existing restrictions for these students
    const restrictions = await prisma.studentExamRestriction.findMany({
        where: {
            academicYearId: parseInt(academicYearId as string),
            semester: semester as Semester,
            examType: examType as ExamType,
            studentId: { in: students.map(s => s.id) }
        }
    });

    // Merge
    const result = students.map(student => {
        const r = restrictions.find(res => res.studentId === student.id);
        return {
            student,
            isBlocked: r ? r.isBlocked : false,
            reason: r ? r.reason : ''
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
    const { studentId, academicYearId, semester, examType, isBlocked, reason } = req.body;

    const restriction = await prisma.studentExamRestriction.upsert({
        where: {
            studentId_academicYearId_semester_examType: {
                studentId,
                academicYearId,
                semester,
                examType
            }
        },
        update: {
            isBlocked,
            reason
        },
        create: {
            studentId,
            academicYearId,
            semester,
            examType,
            isBlocked,
            reason
        }
    });

    res.json(new ApiResponse(200, restriction, 'Status akses ujian berhasil diperbarui'));
});
