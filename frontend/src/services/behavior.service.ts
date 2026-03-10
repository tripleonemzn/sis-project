import api from './api';

export type BehaviorType = 'POSITIVE' | 'NEGATIVE';

export interface StudentBehavior {
  id: number;
  studentId: number;
  classId: number;
  academicYearId: number;
  date: string;
  type: BehaviorType;
  category?: string;
  description: string;
  point: number;
  createdAt: string;
  updatedAt: string;
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
    photo: string | null;
  };
}

interface BehaviorMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CreateBehaviorPayload {
  studentId: number;
  classId: number;
  academicYearId: number;
  date: string;
  type: BehaviorType;
  category?: string;
  description: string;
  point: number;
}

export interface UpdateBehaviorPayload {
  date?: string;
  type?: BehaviorType;
  category?: string;
  description?: string;
  point?: number;
}

export const behaviorService = {
  getBehaviors: async (params: {
    classId: number;
    academicYearId: number;
    studentId?: number;
    type?: BehaviorType;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get<{ data: { behaviors: StudentBehavior[]; meta: BehaviorMeta } }>('/behaviors', { params });
    return response.data.data;
  },

  createBehavior: async (data: CreateBehaviorPayload) => {
    const response = await api.post<{ data: StudentBehavior }>('/behaviors', data);
    return response.data.data;
  },

  updateBehavior: async (id: number, data: UpdateBehaviorPayload) => {
    const response = await api.put<{ data: StudentBehavior }>(`/behaviors/${id}`, data);
    return response.data.data;
  },

  deleteBehavior: async (id: number) => {
    const response = await api.delete<{ data: null }>(`/behaviors/${id}`);
    return response.data.data;
  },
};
