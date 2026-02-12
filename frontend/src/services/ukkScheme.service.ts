import api from './api';

export interface UkkScheme {
  id: number;
  name: string;
  subjectId: number;
  subject: { id: number; name: string };
  majorId?: number;
  major?: { id: number; name: string };
  academicYearId: number;
  academicYear: { id: number; name: string };
  criteria: { id?: string; name: string; maxScore: number; aliases?: string[] }[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchemePayload {
  name: string;
  subjectId: number;
  majorId?: number;
  academicYearId: number;
  criteria: { id?: string; name: string; maxScore: number; aliases?: string[] }[];
}

export const ukkSchemeService = {
  getSchemes: async (academicYearId?: number) => {
    const response = await api.get('/ukk-schemes', { params: { academicYearId } });
    return response.data;
  },

  getSchemeDetail: async (id: number) => {
    const response = await api.get(`/ukk-schemes/${id}`);
    return response.data;
  },

  createScheme: async (payload: CreateSchemePayload) => {
    const response = await api.post('/ukk-schemes', payload);
    return response.data;
  },

  updateScheme: async (id: number, payload: Partial<CreateSchemePayload>) => {
    const response = await api.put(`/ukk-schemes/${id}`, payload);
    return response.data;
  },

  deleteScheme: async (id: number) => {
    const response = await api.delete(`/ukk-schemes/${id}`);
    return response.data;
  }
};
