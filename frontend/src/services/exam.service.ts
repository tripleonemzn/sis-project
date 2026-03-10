import api from './api';

export type ExamType = string;
export type ExamProgramCode = string;
export type ExamProgramBaseType = string;
export type ExamProgramGradeComponentType = string;
export type ExamProgramGradeEntryMode = string;
export type ExamProgramReportSlot = string;

export interface ExamGradeComponent {
    id?: number;
    code: string;
    label: string;
    type: ExamProgramGradeComponentType;
    typeCode?: string;
    entryMode: ExamProgramGradeEntryMode;
    entryModeCode?: string;
    reportSlot: ExamProgramReportSlot;
    reportSlotCode?: string;
    includeInFinalScore: boolean;
    description?: string | null;
    order: number;
    isActive: boolean;
}

export interface ExamProgram {
    id?: number;
    code: ExamProgramCode;
    baseType: ExamProgramBaseType;
    baseTypeCode?: string;
    gradeComponentType?: ExamProgramGradeComponentType;
    gradeComponentTypeCode?: string;
    gradeComponentCode?: string;
    gradeComponentLabel?: string;
    gradeEntryMode?: ExamProgramGradeEntryMode;
    gradeEntryModeCode?: string;
    label: string;
    shortLabel: string;
    description: string;
    fixedSemester: 'ODD' | 'EVEN' | null;
    order: number;
    isActive: boolean;
    showOnTeacherMenu: boolean;
    showOnStudentMenu: boolean;
    targetClassLevels?: string[];
    allowedSubjectIds?: number[];
    allowedAuthorIds?: number[];
    source: 'default' | 'custom';
}

export const DEFAULT_EXAM_PROGRAMS: ExamProgram[] = [];

export const DEFAULT_GRADE_COMPONENTS: ExamGradeComponent[] = [];

export const normalizeExamProgramCode = (raw: unknown): string => {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/QUIZ/g, 'FORMATIF')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
};

export const examProgramCodeToSlug = (rawCode: unknown): string => {
    const normalized = normalizeExamProgramCode(rawCode);
    return normalized.toLowerCase().replace(/_/g, '-');
};

export const findExamProgramBySlug = (programs: ExamProgram[], slug: string): ExamProgram | undefined => {
    const cleanedSlug = String(slug || '').trim().toLowerCase();
    if (!cleanedSlug) return undefined;
    return programs.find((program) => examProgramCodeToSlug(program.code) === cleanedSlug);
};

export interface QuestionBlueprint {
    competency?: string;
    learningObjective?: string;
    indicator?: string;
    materialScope?: string;
    cognitiveLevel?: string;
}

export interface QuestionCard {
    stimulus?: string;
    answerRationale?: string;
    scoringGuideline?: string;
    distractorNotes?: string;
}

export interface QuestionItemAnalysis {
    difficultyIndex?: number;
    discriminationIndex?: number;
    unansweredRate?: number;
    sampleSize?: number;
    generatedAt?: string;
    optionDistribution?: Record<string, number>;
}

export interface Question {
    id: string;
    type: 'MULTIPLE_CHOICE' | 'COMPLEX_MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'ESSAY' | 'MATCHING';
    content: string; // HTML/RichText
    options?: {
        id: string;
        content: string; // HTML/RichText (supports images)
        isCorrect: boolean;
    }[];
    score: number;
    blueprint?: QuestionBlueprint;
    questionCard?: QuestionCard;
    itemAnalysis?: QuestionItemAnalysis;
    metadata?: {
        blueprint?: QuestionBlueprint;
        questionCard?: QuestionCard;
        itemAnalysis?: QuestionItemAnalysis;
    };
}

export interface ExamPacket {
    id: number;
    title: string;
    description?: string;
    type: ExamType;
    programCode?: string | null;
    duration: number; // minutes
    publishedQuestionCount?: number | null;
    totalQuestionPoolCount?: number;
    kkm: number;
    instructions?: string;
    subjectId: number;
    subject?: { id: number; name: string; code: string };
    authorId: number;
    academicYearId: number;
    semester?: string;
    academicYear?: { id: number; name: string };
    questions?: Question[];
    _count?: {
        schedules: number;
    };
    createdAt: string;
}

export interface ExamSchedule {
    id: number;
    packetId: number;
    packet?: ExamPacket;
    classId: number;
    class?: { id: number; name: string };
    startTime: string;
    endTime: string;
    sessionId?: number | null;
    sessionLabel?: string | null;
    programSession?: {
        id: number;
        label: string;
        displayOrder?: number;
    } | null;
    token?: string;
    isActive: boolean;
    _count?: {
        sessions: number;
    };
}

export interface ExamProgramSession {
    id: number;
    academicYearId: number;
    programCode: string;
    label: string;
    displayOrder: number;
    isActive: boolean;
}

export interface ExamRestriction {
    student: {
        id: number;
        nisn: string;
        name: string;
    };
    isBlocked: boolean;
    reason: string | null;
}

export interface PacketItemAnalysisOptionRow {
    optionId: string;
    label: string;
    isCorrect: boolean;
    selectedCount: number;
    selectedRate: number;
}

export interface PacketItemAnalysisQuestionRow {
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
    optionDistribution: PacketItemAnalysisOptionRow[];
}

export interface PacketItemAnalysisSummary {
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
}

export interface PacketItemAnalysisResponse {
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
    items: PacketItemAnalysisQuestionRow[];
}

export interface PacketSubmissionSessionRow {
    sessionId: number;
    scheduleId: number;
    class: { id: number; name: string } | null;
    student: { id: number; name: string; nis: string | null };
    status: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' | string;
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
    monitoring?: {
        totalViolations: number;
        tabSwitchCount: number;
        fullscreenExitCount: number;
        appSwitchCount: number;
        lastViolationType: string | null;
        lastViolationAt: string | null;
    };
}

export interface PacketSubmissionsSummary {
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
}

export interface PacketSubmissionsResponse {
    packet: {
        id: number;
        title: string;
        type: string;
        semester: string;
        subject: { id: number; name: string; code: string };
        academicYear: { id: number; name: string };
        author: { id: number; name: string };
    };
    summary: PacketSubmissionsSummary;
    sessions: PacketSubmissionSessionRow[];
}

export interface SessionQuestionDetailRow {
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
}

export interface SessionDetailResponse {
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
        monitoring?: {
            totalViolations: number;
            tabSwitchCount: number;
            fullscreenExitCount: number;
            appSwitchCount: number;
            lastViolationType: string | null;
            lastViolationAt: string | null;
        };
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
}

export const examService = {
    getGradeComponents: async (params?: {
        academicYearId?: number;
        includeInactive?: boolean;
    }) => {
        const response = await api.get('/exams/components', { params });
        return response.data as {
            statusCode: number;
            success: boolean;
            message: string;
            data: {
                academicYearId: number;
                components: ExamGradeComponent[];
            };
        };
    },
    updateGradeComponents: async (payload: {
        academicYearId?: number;
        components: Array<{
            id?: number | null;
            code: string;
            label?: string;
            type?: ExamProgramGradeComponentType;
            typeCode?: string;
            entryMode?: ExamProgramGradeEntryMode;
            entryModeCode?: string;
            reportSlot?: ExamProgramReportSlot;
            reportSlotCode?: string;
            includeInFinalScore?: boolean;
            description?: string | null;
            order?: number;
            isActive?: boolean;
        }>;
    }) => {
        const response = await api.put('/exams/components', payload);
        return response.data as {
            statusCode: number;
            success: boolean;
            message: string;
            data: {
                academicYearId: number;
                components: ExamGradeComponent[];
            };
        };
    },
    getPrograms: async (params?: {
        academicYearId?: number;
        roleContext?: 'teacher' | 'student' | 'all';
        includeInactive?: boolean;
    }) => {
        const response = await api.get('/exams/programs', { params });
        return response.data as {
            statusCode: number;
            success: boolean;
            message: string;
            data: {
                academicYearId: number;
                roleContext: 'teacher' | 'student' | 'all';
                programs: ExamProgram[];
            };
        };
    },
    getProgramSessions: async (params: {
        academicYearId: number;
        programCode?: string;
        examType?: string;
        includeInactive?: boolean;
    }) => {
        const response = await api.get('/exams/program-sessions', { params });
        return response.data as {
            statusCode: number;
            success: boolean;
            message: string;
            data: {
                academicYearId: number;
                programCode: string;
                sessions: ExamProgramSession[];
            };
        };
    },
    createProgramSession: async (payload: {
        academicYearId: number;
        programCode?: string;
        examType?: string;
        label: string;
        displayOrder?: number;
    }) => {
        const response = await api.post('/exams/program-sessions', payload);
        return response.data as {
            statusCode: number;
            success: boolean;
            message: string;
            data: ExamProgramSession;
        };
    },
    updatePrograms: async (payload: {
        academicYearId?: number;
        programs: Array<{
            id?: number | null;
            code: ExamProgramCode;
            baseType?: ExamProgramBaseType;
            baseTypeCode?: string;
            gradeComponentType?: ExamProgramGradeComponentType;
            gradeComponentTypeCode?: string;
            gradeComponentCode?: string;
            gradeComponentLabel?: string | null;
            gradeEntryMode?: ExamProgramGradeEntryMode;
            gradeEntryModeCode?: string;
            label?: string;
            shortLabel?: string | null;
            description?: string | null;
            fixedSemester?: 'ODD' | 'EVEN' | 'GANJIL' | 'GENAP' | null;
            order?: number;
            isActive?: boolean;
            showOnTeacherMenu?: boolean;
            showOnStudentMenu?: boolean;
            targetClassLevels?: string[];
            allowedSubjectIds?: number[];
            allowedAuthorIds?: number[];
        }>;
    }) => {
        const response = await api.put('/exams/programs', payload);
        return response.data as {
            statusCode: number;
            success: boolean;
            message: string;
            data: {
                academicYearId: number;
                programs: ExamProgram[];
            };
        };
    },
    getPackets: async (params?: {
        type?: ExamType;
        programCode?: string;
        subjectId?: number;
        academicYearId?: number;
        semester?: string;
        page?: number;
        limit?: number;
    }) => {
        const response = await api.get('/exams/packets', { params });
        return response.data;
    },
    getQuestions: async (params?: { subjectId?: number; academicYearId?: number; semester?: string; type?: string; search?: string; page?: number; limit?: number }) => {
        const response = await api.get('/exams/questions', { params });
        return response.data;
    },
    getPacketById: async (id: number) => {
        const response = await api.get(`/exams/packets/${id}`);
        return response.data;
    },
    getPacketItemAnalysis: async (id: number, params?: { classId?: number; includeContentHtml?: boolean }) => {
        const response = await api.get(`/exams/packets/${id}/item-analysis`, { params });
        return response.data as { statusCode: number; success: boolean; message: string; data: PacketItemAnalysisResponse };
    },
    syncPacketItemAnalysis: async (id: number, params?: { classId?: number }) => {
        const response = await api.post(`/exams/packets/${id}/item-analysis/sync`, undefined, { params });
        return response.data as { statusCode: number; success: boolean; message: string; data: PacketItemAnalysisResponse };
    },
    getPacketSubmissions: async (
        id: number,
        params?: {
            classId?: number;
            status?: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';
            page?: number;
            limit?: number;
        },
    ) => {
        const response = await api.get(`/exams/packets/${id}/submissions`, { params });
        return response.data as { statusCode: number; success: boolean; message: string; data: PacketSubmissionsResponse };
    },
    getSessionDetail: async (id: number) => {
        const response = await api.get(`/exams/sessions/${id}/detail`);
        return response.data as { statusCode: number; success: boolean; message: string; data: SessionDetailResponse };
    },
    createPacket: async (data: Record<string, unknown>) => {
        const response = await api.post('/exams/packets', data);
        return response.data;
    },
    updatePacket: async (id: number, data: Record<string, unknown>) => {
        const response = await api.put(`/exams/packets/${id}`, data);
        return response.data;
    },
    deletePacket: async (id: number) => {
        const response = await api.delete(`/exams/packets/${id}`);
        return response.data;
    },
    getSchedules: async (params?: { packetId?: number; classId?: number }) => {
        const response = await api.get('/exams/schedules', { params });
        return response.data;
    },
    createSchedule: async (data: {
        packetId: number;
        classIds: number[];
        startTime: string;
        endTime: string;
        proctorId?: number;
        room?: string;
        sessionId?: number | null;
    }) => {
        const response = await api.post('/exams/schedules', data);
        return response.data;
    },
    updateSchedule: async (
        id: number,
        data: {
            startTime?: string;
            endTime?: string;
            proctorId?: number | null;
            room?: string | null;
            isActive?: boolean;
            sessionId?: number | null;
        },
    ) => {
        const response = await api.patch(`/exams/schedules/${id}`, data);
        return response.data;
    },
    deleteSchedule: async (id: number) => {
        const response = await api.delete(`/exams/schedules/${id}`);
        return response.data;
    },
    getAvailableExams: async () => {
        const response = await api.get('/exams/available');
        return response.data;
    },
    getRestrictions: async (params: { classId: number; academicYearId: number; semester: string; examType?: string; programCode?: string; page?: number; limit?: number; search?: string }) => {
        const response = await api.get('/exams/restrictions', { params });
        return response.data;
    },
    updateRestriction: async (data: { studentId: number; academicYearId: number; semester: string; examType?: string; programCode?: string; isBlocked: boolean; reason?: string }) => {
        const response = await api.put('/exams/restrictions', data);
        return response.data;
    }
};
