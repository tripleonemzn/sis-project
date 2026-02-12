import api from './api';

export interface Subject {
  id: number;
  name: string;
  code: string;
  category?: {
    id: number;
    name: string;
    code: string;
  } | string;
  subjectCategoryId?: number;
  subjectCategory?: {
    id: number;
    name: string;
    code: string;
  };
  kkmX?: number | null;
  kkmXI?: number | null;
  kkmXII?: number | null;
  kkms?: { classLevel: 'X' | 'XI' | 'XII'; kkm: number }[];
  parentId?: number | null;
  parent?: {
    id: number;
    name: string;
    code: string;
  };
  _count?: {
    children: number;
    teacherAssignments: number;
  };
}

export const subjectService = {
  list: async (params?: { page?: number; limit?: number; search?: string; category?: string; subjectCategoryId?: number }) => {
    const response = await api.get('/subjects', { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await api.get(`/subjects/${id}`);
    return response.data;
  },
  create: async (data: Omit<Subject, 'id' | 'parent' | '_count' | 'kkms'>) => {
    const response = await api.post('/subjects', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Subject>) => {
    const response = await api.patch(`/subjects/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/subjects/${id}`);
    return response.data;
  },
};
