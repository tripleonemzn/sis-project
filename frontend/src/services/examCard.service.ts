import api from './api';

export type ExamCardSemester = 'ODD' | 'EVEN';

export interface ExamGeneratedCardPayload {
  schoolName: string;
  headerTitle: string;
  headerSubtitle: string;
  cardTitle?: string;
  examTitle?: string;
  institutionName?: string;
  academicYearId: number;
  academicYearName: string;
  programCode: string;
  programBaseTypeCode?: string | null;
  programLabel: string;
  semester: ExamCardSemester;
  generatedAt: string;
  participantNumber?: string | null;
  participantSequence?: number | null;
  generatedBy: {
    id: number;
    name: string;
  };
  issue?: {
    location?: string | null;
    date?: string | null;
    dateLabel?: string | null;
    signLabel?: string | null;
  };
  student: {
    id: number;
    name: string;
    username?: string | null;
    nis?: string | null;
    nisn?: string | null;
    className?: string | null;
    classLevelLabel?: string | null;
    classLevelNumber?: string | null;
    photoUrl?: string | null;
  };
  placement?: {
    roomName?: string | null;
    sessionLabel?: string | null;
    seatLabel?: string | null;
    startTime?: string | null;
    endTime?: string | null;
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
    principalTitle?: string | null;
    footerNote?: string | null;
    verificationToken?: string | null;
    verificationUrl?: string | null;
    verificationNote?: string | null;
  };
}

export interface ExamCardOverviewRow {
  studentId: number;
  studentName: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  className?: string | null;
  classId?: number | null;
  classLevelLabel?: string | null;
  classLevelNumber?: string | null;
  participantSequence?: number | null;
  participantNumber?: string | null;
  formalPhotoUrl?: string | null;
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
  status: {
    code:
      | 'PUBLISHED_ACTIVE'
      | 'READY_TO_GENERATE'
      | 'BLOCKED_KKM'
      | 'BLOCKED_FINANCE'
      | 'REVIEW_MANUAL_BLOCK'
      | 'REVIEW_PLACEMENT_SYNC'
      | 'REVIEW_STALE_CARD'
      | 'REVIEW_DATA_SYNC';
    category: 'PUBLISHED' | 'READY' | 'BLOCKED_KKM' | 'BLOCKED_FINANCE' | 'REVIEW_REQUIRED';
    label: string;
    detail: string;
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
    baseTypeCode?: string | null;
    displayOrder?: number;
  };
  semester: ExamCardSemester;
  summary: {
    totalStudents: number;
    eligibleStudents: number;
    blockedStudents: number;
    publishedCards: number;
    financeExceptionStudents: number;
    statusCounts: {
      publishedActive: number;
      readyToGenerate: number;
      blockedKkm: number;
      blockedFinance: number;
      reviewRequired: number;
      blockedManual: number;
      needsPlacementSync: number;
      staleCard: number;
      needsDataSync: number;
    };
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
    issueLocation?: string;
    issueDate?: string;
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
  getMyCards: async (params?: { academicYearId?: number; programCode?: string }) => {
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
