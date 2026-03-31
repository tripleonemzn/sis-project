import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type TeacherBpBkSummary = {
  academicYear: {
    id: number;
    name: string;
  };
  summary: {
    totalCases: number;
    positiveCases: number;
    negativeCases: number;
    negativeCasesThisMonth: number;
    highRiskStudents: number;
    pendingPermissions: number;
    approvedPermissions: number;
    rejectedPermissions: number;
    openCounselings: number;
    inProgressCounselings: number;
    closedCounselings: number;
    summonPendingCounselings: number;
  };
  recentBehaviors: TeacherBpBkBehaviorRow[];
  recentPermissions: TeacherBpBkPermissionRow[];
  recentCounselings: TeacherBpBkCounselingRow[];
};

export type TeacherBpBkBehaviorRow = {
  id: number;
  studentId: number;
  classId: number;
  academicYearId: number;
  date: string;
  type: 'POSITIVE' | 'NEGATIVE';
  category?: string | null;
  description: string;
  point: number;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    photo?: string | null;
  } | null;
  class?: {
    id: number;
    name: string;
    major?: {
      id: number;
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
};

export type TeacherBpBkPermissionRow = {
  id: number;
  studentId: number;
  type: 'SICK' | 'PERMISSION' | 'OTHER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  approvalNote?: string | null;
  fileUrl?: string | null;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
    } | null;
  } | null;
  approvedBy?: {
    id: number;
    name: string;
  } | null;
};

export type TeacherBpBkCounselingRow = {
  id: number;
  classId: number;
  studentId: number;
  academicYearId: number;
  counselorId?: number | null;
  behaviorId?: number | null;
  sessionDate: string;
  issueSummary: string;
  counselingNote?: string | null;
  followUpPlan?: string | null;
  summonParent: boolean;
  summonDate?: string | null;
  summonLetterNumber?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  } | null;
  class?: {
    id: number;
    name: string;
  } | null;
  counselor?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  behavior?: {
    id: number;
    category?: string | null;
    description?: string | null;
    type?: 'POSITIVE' | 'NEGATIVE' | null;
  } | null;
};

export type TeacherBpBkPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type TeacherBpBkBehaviorListPayload = {
  academicYear: {
    id: number;
    name: string;
  };
  behaviors: TeacherBpBkBehaviorRow[];
  meta: TeacherBpBkPagination;
};

export type TeacherBpBkPermissionListPayload = {
  academicYear: {
    id: number;
    name: string;
  };
  permissions: TeacherBpBkPermissionRow[];
  meta: TeacherBpBkPagination;
};

export type TeacherBpBkCounselingListPayload = {
  academicYear: {
    id: number;
    name: string;
  };
  counselings: TeacherBpBkCounselingRow[];
  meta: TeacherBpBkPagination;
};

export type TeacherBpBkCounselingPayload = {
  academicYearId?: number;
  classId: number;
  studentId: number;
  sessionDate: string;
  issueSummary: string;
  counselingNote?: string;
  followUpPlan?: string;
  summonParent?: boolean;
  summonDate?: string;
  summonLetterNumber?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
};

export const teacherBpBkApi = {
  async getSummary(params?: { academicYearId?: number; classId?: number }) {
    const response = await apiClient.get<ApiEnvelope<TeacherBpBkSummary>>('/bpbk/summary', {
      params: {
        academicYearId: params?.academicYearId,
        classId: params?.classId,
      },
    });
    return response.data?.data;
  },

  async listBehaviors(params?: {
    academicYearId?: number;
    classId?: number;
    studentId?: number;
    type?: 'POSITIVE' | 'NEGATIVE';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<TeacherBpBkBehaviorListPayload>>('/bpbk/behaviors', {
      params: {
        academicYearId: params?.academicYearId,
        classId: params?.classId,
        studentId: params?.studentId,
        type: params?.type,
        search: params?.search,
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });

    return (
      response.data?.data || {
        academicYear: {
          id: Number(params?.academicYearId || 0),
          name: '-',
        },
        behaviors: [],
        meta: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          total: 0,
          totalPages: 1,
        },
      }
    );
  },

  async listPermissions(params?: {
    academicYearId?: number;
    classId?: number;
    studentId?: number;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<TeacherBpBkPermissionListPayload>>('/bpbk/permissions', {
      params: {
        academicYearId: params?.academicYearId,
        classId: params?.classId,
        studentId: params?.studentId,
        status: params?.status,
        search: params?.search,
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });

    return (
      response.data?.data || {
        academicYear: {
          id: Number(params?.academicYearId || 0),
          name: '-',
        },
        permissions: [],
        meta: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          total: 0,
          totalPages: 1,
        },
      }
    );
  },

  async listCounselings(params?: {
    academicYearId?: number;
    classId?: number;
    studentId?: number;
    status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<TeacherBpBkCounselingListPayload>>('/bpbk/counselings', {
      params: {
        academicYearId: params?.academicYearId,
        classId: params?.classId,
        studentId: params?.studentId,
        status: params?.status,
        search: params?.search,
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });

    return (
      response.data?.data || {
        academicYear: {
          id: Number(params?.academicYearId || 0),
          name: '-',
        },
        counselings: [],
        meta: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          total: 0,
          totalPages: 1,
        },
      }
    );
  },

  async createCounseling(payload: TeacherBpBkCounselingPayload) {
    const response = await apiClient.post<ApiEnvelope<TeacherBpBkCounselingRow>>('/bpbk/counselings', payload);
    return response.data?.data;
  },

  async updateCounseling(id: number, payload: Partial<TeacherBpBkCounselingPayload>) {
    const response = await apiClient.patch<ApiEnvelope<TeacherBpBkCounselingRow>>(`/bpbk/counselings/${id}`, payload);
    return response.data?.data;
  },
};
