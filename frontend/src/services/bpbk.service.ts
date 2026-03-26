import api from './api';

export type BpBkSummaryParams = {
  academicYearId?: number;
  classId?: number;
};

export type BpBkBehaviorParams = BpBkSummaryParams & {
  studentId?: number;
  type?: 'POSITIVE' | 'NEGATIVE';
  search?: string;
  page?: number;
  limit?: number;
};

export type BpBkPermissionParams = BpBkSummaryParams & {
  studentId?: number;
  type?: 'SICK' | 'PERMISSION' | 'OTHER';
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  search?: string;
  page?: number;
  limit?: number;
};

export type BpBkCounselingParams = BpBkSummaryParams & {
  studentId?: number;
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  summonParent?: boolean;
  search?: string;
  page?: number;
  limit?: number;
};

export type BpBkCounselingPayload = {
  academicYearId?: number;
  classId: number;
  studentId: number;
  behaviorId?: number;
  sessionDate: string;
  issueSummary: string;
  counselingNote?: string;
  followUpPlan?: string;
  summonParent?: boolean;
  summonDate?: string;
  summonLetterNumber?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
};

export type BpBkSummaryResponse = {
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
  recentBehaviors: Array<{
    id: number;
    date: string;
    type: 'POSITIVE' | 'NEGATIVE';
    category?: string | null;
    description: string;
    point: number;
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    class: {
      id: number;
      name: string;
    };
  }>;
  recentPermissions: Array<{
    id: number;
    type: 'SICK' | 'PERMISSION' | 'OTHER';
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason?: string | null;
    startDate: string;
    endDate: string;
    createdAt: string;
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
      studentClass?: {
        id: number;
        name: string;
      } | null;
    };
    approvedBy?: {
      id: number;
      name: string;
    } | null;
  }>;
  recentCounselings: Array<{
    id: number;
    sessionDate: string;
    issueSummary: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
    summonParent: boolean;
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    class: {
      id: number;
      name: string;
    };
  }>;
};

export const bpbkService = {
  getSummary: async (params?: BpBkSummaryParams) => {
    const response = await api.get<{ data: BpBkSummaryResponse }>('/bpbk/summary', { params });
    return response.data;
  },

  getBehaviors: async (params?: BpBkBehaviorParams) => {
    const response = await api.get<{
      data: {
        behaviors: any[];
        meta: { page: number; limit: number; total: number; totalPages: number };
        academicYear: { id: number; name: string };
      };
    }>('/bpbk/behaviors', { params });
    return response.data;
  },

  getPermissions: async (params?: BpBkPermissionParams) => {
    const response = await api.get<{
      data: {
        permissions: any[];
        meta: { page: number; limit: number; total: number; totalPages: number };
        academicYear: { id: number; name: string };
      };
    }>('/bpbk/permissions', { params });
    return response.data;
  },

  getCounselings: async (params?: BpBkCounselingParams) => {
    const response = await api.get<{
      data: {
        counselings: any[];
        meta: { page: number; limit: number; total: number; totalPages: number };
        academicYear: { id: number; name: string };
      };
    }>('/bpbk/counselings', { params });
    return response.data;
  },

  createCounseling: async (payload: BpBkCounselingPayload) => {
    const response = await api.post<{ data: any }>('/bpbk/counselings', payload);
    return response.data;
  },

  updateCounseling: async (id: number, payload: Partial<BpBkCounselingPayload>) => {
    const response = await api.patch<{ data: any }>(`/bpbk/counselings/${id}`, payload);
    return response.data;
  },
};
