import api from './api';

export type AdditionalDuty =
  | 'WAKASEK_KURIKULUM'
  | 'SEKRETARIS_KURIKULUM'
  | 'WAKASEK_KESISWAAN'
  | 'SEKRETARIS_KESISWAAN'
  | 'WAKASEK_SARPRAS'
  | 'SEKRETARIS_SARPRAS'
  | 'WAKASEK_HUMAS'
  | 'SEKRETARIS_HUMAS'
  | 'KAPROG'
  | 'WALI_KELAS'
  | 'PEMBINA_OSIS'
  | 'PEMBINA_EKSKUL'
  | 'KEPALA_LAB'
  | 'KEPALA_PERPUSTAKAAN'
  | 'TIM_BOS'
  | 'BENDAHARA'
  | 'BP_BK';

export interface WorkProgramBudget {
  id: number;
  description: string;
  amount: number;
}

export interface WorkProgramItem {
  id: number;
  description: string;
  targetDate: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  note?: string | null;
  budgets: WorkProgramBudget[];
}

export interface WorkProgram {
  id: number;
  title: string;
  description?: string | null;
  academicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  academicYearId: number;
  additionalDuty: AdditionalDuty;
  majorId?: number | null;
  semester?: 'ODD' | 'EVEN' | null;
  month?: number | null;
  startWeek?: number | null;
  endWeek?: number | null;
  approverId?: number | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  items: WorkProgramItem[];
}

export interface WorkProgramPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WorkProgramListResponse {
  programs: WorkProgram[];
  pagination: WorkProgramPagination;
}

export const workProgramService = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    academicYearId?: number | null;
    additionalDuty?: AdditionalDuty | null;
    majorId?: number | null;
    semester?: 'ODD' | 'EVEN' | null;
  }) => {
    const response = await api.get('/work-programs', {
      params: {
        page: params?.page,
        limit: params?.limit,
        search: params?.search,
        academicYearId: params?.academicYearId ?? undefined,
        additionalDuty: params?.additionalDuty ?? undefined,
        majorId: params?.majorId ?? undefined,
        semester: params?.semester ?? undefined,
      },
    });
    return response.data as { data: WorkProgramListResponse };
  },
  create: async (data: {
    title: string;
    description?: string;
    academicYearId: number;
    additionalDuty: AdditionalDuty;
    majorId?: number;
    semester?: 'ODD' | 'EVEN' | null;
    month?: number;
    startWeek?: number;
    endWeek?: number;
  }) => {
    const response = await api.post('/work-programs', data);
    return response.data;
  },
  update: async (
    id: number,
    data: Partial<{
      title: string;
      description?: string;
      academicYearId: number;
      additionalDuty: AdditionalDuty;
    }>,
  ) => {
    const response = await api.put(`/work-programs/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/work-programs/${id}`);
    return response.data;
  },
  addItem: async (
    programId: number,
    data: { description: string; targetDate?: string | null; note?: string | null },
  ) => {
    const response = await api.post(`/work-programs/${programId}/items`, data);
    return response.data;
  },
  updateItem: async (
    itemId: number,
    data: {
      description?: string;
      targetDate?: string | null;
      isCompleted?: boolean;
      note?: string | null;
    },
  ) => {
    const response = await api.put(`/work-programs/items/${itemId}`, data);
    return response.data;
  },
  removeItem: async (itemId: number) => {
    const response = await api.delete(`/work-programs/items/${itemId}`);
    return response.data;
  },
  addBudget: async (
    itemId: number,
    data: { description: string; amount: number },
  ) => {
    const response = await api.post(`/work-programs/items/${itemId}/budgets`, data);
    return response.data;
  },
  removeBudget: async (budgetId: number) => {
    const response = await api.delete(`/work-programs/budgets/${budgetId}`);
    return response.data;
  },
};

