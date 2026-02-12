import api from './api';

export interface Class {
  id: number;
  name: string;
  level: string;
  majorId: number;
  academicYearId: number;
  teacherId?: number | null;
  presidentId?: number | null;
  major?: {
    id: number;
    name: string;
    code: string;
  };
  academicYear?: {
    id: number;
    name: string;
    isActive: boolean;
  };
  teacher?: {
    id: number;
    name: string;
    username: string;
  };
  president?: {
    id: number;
    name: string;
  };
  _count?: {
    students: number;
  };
}

export const classService = {
  list: async (params?: { page?: number; limit?: number; search?: string; level?: string; majorId?: number; academicYearId?: number; teacherId?: number }) => {
    const response = await api.get('/classes', { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await api.get(`/classes/${id}`);
    return response.data;
  },
  create: async (data: Omit<Class, 'id' | 'major' | 'academicYear' | 'teacher' | '_count'>) => {
    const response = await api.post('/classes', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Class>) => {
    const response = await api.put(`/classes/${id}`, data);
    return response.data;
  },
  updatePresident: async (id: number, presidentId: number) => {
    const response = await api.put(`/classes/${id}/president`, { presidentId });
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/classes/${id}`);
    return response.data;
  },
};
