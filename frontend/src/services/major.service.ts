import api from './api';

export interface Major {
  id: number;
  name: string;
  code: string;
  description?: string;
}

export const majorService = {
  list: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get('/majors', { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await api.get(`/majors/${id}`);
    return response.data;
  },
  create: async (data: Omit<Major, 'id'>) => {
    const response = await api.post('/majors', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Major>) => {
    const response = await api.put(`/majors/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/majors/${id}`);
    return response.data;
  },
};
