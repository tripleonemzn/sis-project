import { apiClient } from '../../lib/api/client';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type AdministrationCompletenessLabel = 'Lengkap' | 'Perlu Lengkapi' | 'Prioritas';

export type StaffAdministrationSummary = {
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
};

export const staffAdministrationApi = {
  async getSummary(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiResponse<StaffAdministrationSummary>>(
      '/office/administration-summary',
      {
        params,
      },
    );
    return response.data.data;
  },
};
