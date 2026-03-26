import api from './api';

export type OfficeLetterType =
  | 'STUDENT_CERTIFICATE'
  | 'TEACHER_CERTIFICATE'
  | 'EXAM_CARD_COVER'
  | 'CANDIDATE_ADMISSION_RESULT';

export interface OfficeLetter {
  id: number;
  academicYearId: number;
  createdById: number;
  recipientId?: number | null;
  type: OfficeLetterType;
  letterNumber: string;
  title: string;
  recipientName: string;
  recipientRole?: string | null;
  recipientClass?: string | null;
  recipientPrimaryId?: string | null;
  purpose?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
  printedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  };
  createdBy?: {
    id: number;
    name: string;
    username: string;
    ptkType?: string | null;
  };
  recipient?: {
    id: number;
    name: string;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    nip?: string | null;
    nuptk?: string | null;
  } | null;
}

export type AdministrationCompletenessLabel = 'Lengkap' | 'Perlu Lengkapi' | 'Prioritas';

export interface AdministrationSummaryResponse {
  filters: {
    academicYearId: number;
    generatedAt: string;
  };
  overview: {
    totalStudents: number;
    totalTeachers: number;
    studentCompletenessRate: number;
    teacherCompletenessRate: number;
    studentsCompleteCount: number;
    studentsNeedAttentionCount: number;
    studentsPriorityCount: number;
    teachersCompleteCount: number;
    teachersNeedAttentionCount: number;
    teachersPriorityCount: number;
    pendingStudentVerification: number;
    rejectedStudentVerification: number;
    pendingTeacherVerification: number;
    rejectedTeacherVerification: number;
    pendingPermissions: number;
    approvedPermissions: number;
    rejectedPermissions: number;
  };
  studentClassRecap: Array<{
    classId: number | null;
    className: string;
    totalStudents: number;
    completeCount: number;
    needAttentionCount: number;
    priorityCount: number;
    completenessRate: number;
    pendingVerificationCount: number;
  }>;
  teacherPtkRecap: Array<{
    ptkType: string;
    totalTeachers: number;
    completeCount: number;
    needAttentionCount: number;
    priorityCount: number;
    completenessRate: number;
    pendingVerificationCount: number;
  }>;
  studentPriorityQueue: Array<{
    id: number;
    name: string;
    username: string;
    classId: number | null;
    className: string;
    verificationStatus?: string | null;
    studentStatus?: string | null;
    completionRate: number;
    filled: number;
    total: number;
    label: AdministrationCompletenessLabel;
    missingFields: string[];
  }>;
  teacherPriorityQueue: Array<{
    id: number;
    name: string;
    username: string;
    ptkType: string;
    verificationStatus?: string | null;
    employeeStatus?: string | null;
    completionRate: number;
    filled: number;
    total: number;
    label: AdministrationCompletenessLabel;
    missingFields: string[];
  }>;
  studentVerificationQueue: Array<{
    id: number;
    name: string;
    username: string;
    classId: number | null;
    className: string;
    verificationStatus?: string | null;
    completionRate: number;
    missingFields: string[];
  }>;
  teacherVerificationQueue: Array<{
    id: number;
    name: string;
    username: string;
    ptkType: string;
    verificationStatus?: string | null;
    completionRate: number;
    missingFields: string[];
  }>;
  permissionAging: Array<{
    label: string;
    count: number;
  }>;
  permissionQueue: Array<{
    id: number;
    studentId: number;
    studentName: string;
    nis: string;
    nisn: string;
    className: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    ageDays: number;
    agingLabel: string;
    reason?: string | null;
    approvalNote?: string | null;
  }>;
}

interface ApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

export const officeService = {
  async listLetters(params?: {
    academicYearId?: number;
    type?: OfficeLetterType;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<
      ApiResponse<{
        letters: OfficeLetter[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>
    >('/office/letters', { params });
    return response.data.data;
  },

  async createLetter(payload: {
    academicYearId?: number;
    type: OfficeLetterType;
    recipientId?: number | null;
    recipientName: string;
    recipientRole?: string | null;
    recipientClass?: string | null;
    recipientPrimaryId?: string | null;
    purpose?: string | null;
    notes?: string | null;
    payload?: Record<string, unknown> | null;
    printedAt?: string | null;
  }) {
    const response = await api.post<ApiResponse<{ letter: OfficeLetter }>>('/office/letters', payload);
    return response.data.data.letter;
  },

  async getSummary(params?: { academicYearId?: number }) {
    const response = await api.get<
      ApiResponse<{
        totalLetters: number;
        monthlyLetters: number;
        byType: Array<{ type: string; _count: { _all: number } }>;
        latest: OfficeLetter[];
      }>
    >('/office/summary', { params });
    return response.data.data;
  },

  async getAdministrationSummary(params?: { academicYearId?: number }) {
    const response = await api.get<ApiResponse<AdministrationSummaryResponse>>('/office/administration-summary', {
      params,
    });
    return response.data.data;
  },
};
