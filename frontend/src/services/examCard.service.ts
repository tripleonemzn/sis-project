import api from './api';

export type ExamCardSemester = 'ODD' | 'EVEN';

export interface ExamGeneratedCardPayload {
  schoolName: string;
  headerTitle: string;
  headerSubtitle: string;
  academicYearId: number;
  academicYearName: string;
  programCode: string;
  programLabel: string;
  semester: ExamCardSemester;
  generatedAt: string;
  generatedBy: {
    id: number;
    name: string;
  };
  student: {
    id: number;
    name: string;
    username?: string | null;
    nis?: string | null;
    nisn?: string | null;
    className?: string | null;
  };
  entries: Array<{
    sittingId: number;
    roomName: string;
    sessionLabel?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    seatLabel?: string | null;
  }>;
  legality: {
    principalName: string;
    signatureLabel: string;
    principalBarcodeDataUrl?: string | null;
  };
}

export interface ExamCardOverviewRow {
  studentId: number;
  studentName: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  className?: string | null;
  entries: Array<{
    sittingId: number;
    roomName: string;
    sessionLabel?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    seatLabel?: string | null;
  }>;
  eligibility: {
    studentId: number;
    isEligible: boolean;
    reason: string;
    manualBlocked: boolean;
    autoBlocked: boolean;
    financeExceptionApplied: boolean;
    financeClearance: {
      blocksExam: boolean;
      hasOutstanding: boolean;
      hasOverdue: boolean;
      outstandingAmount: number;
      outstandingInvoices: number;
      overdueInvoices: number;
      mode: string;
      thresholdAmount: number;
      minOverdueInvoices: number;
      notes?: string | null;
      warningOnly: boolean;
      reason?: string | null;
    };
    automatic: {
      details: {
        belowKkmSubjects: Array<{
          subjectId: number;
          subjectName: string;
          score: number;
          kkm: number;
        }>;
      };
    };
  };
  card: {
    id: number;
    generatedAt: string;
    payload: ExamGeneratedCardPayload;
  } | null;
}

export interface ExamCardOverviewResponse {
  academicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  program: {
    code: string;
    label: string;
  };
  semester: ExamCardSemester;
  summary: {
    totalStudents: number;
    eligibleStudents: number;
    blockedStudents: number;
    publishedCards: number;
    financeExceptionStudents: number;
  };
  rows: ExamCardOverviewRow[];
}

export const examCardService = {
  getOverview: async (params: {
    academicYearId: number;
    programCode: string;
    semester?: ExamCardSemester;
  }) => {
    const response = await api.get('/exam-cards', { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: ExamCardOverviewResponse;
    };
  },
  generate: async (payload: {
    academicYearId: number;
    programCode: string;
    semester?: ExamCardSemester;
  }) => {
    const response = await api.post('/exam-cards/generate', payload);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        academicYearId: number;
        programCode: string;
        semester: ExamCardSemester;
        generatedAt: string;
        generatedCount: number;
        blockedCount: number;
        skippedWithoutRoomCount: number;
      };
    };
  },
  getMyCards: async (params?: { academicYearId?: number }) => {
    const response = await api.get('/exam-cards/my', { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        cards: Array<{
          id: number;
          academicYearId: number;
          programCode: string;
          semester: ExamCardSemester;
          generatedAt: string;
          payload: ExamGeneratedCardPayload;
        }>;
      };
    };
  },
};
