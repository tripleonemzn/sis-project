import { apiClient } from '../../lib/api/client';

export type ExamCardSemester = 'ODD' | 'EVEN';

export type ExamGeneratedCardPayload = {
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
};

export type ExamCardEligibility = {
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

export type ExamCardOverviewRow = {
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
  eligibility: ExamCardEligibility;
  card: {
    id: number;
    generatedAt: string;
    payload: ExamGeneratedCardPayload;
  } | null;
};

export type ExamCardOverviewResponse = {
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
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const examCardApi = {
  async getOverview(params: {
    academicYearId: number;
    programCode: string;
    semester?: ExamCardSemester;
  }) {
    const response = await apiClient.get<ApiEnvelope<ExamCardOverviewResponse>>('/exam-cards', {
      params,
    });
    return response.data.data;
  },
  async generate(payload: {
    academicYearId: number;
    programCode: string;
    semester?: ExamCardSemester;
  }) {
    const response = await apiClient.post<
      ApiEnvelope<{
        academicYearId: number;
        programCode: string;
        semester: ExamCardSemester;
        generatedAt: string;
        generatedCount: number;
        blockedCount: number;
        skippedWithoutRoomCount: number;
      }>
    >('/exam-cards/generate', payload);
    return response.data;
  },
  async getMyCards(params?: { academicYearId?: number }) {
    const response = await apiClient.get<
      ApiEnvelope<{
        cards: Array<{
          id: number;
          academicYearId: number;
          programCode: string;
          semester: ExamCardSemester;
          generatedAt: string;
          payload: ExamGeneratedCardPayload;
        }>;
      }>
    >('/exam-cards/my', {
      params,
    });
    return response.data.data.cards || [];
  },
};
