import api from './api';

export interface Extracurricular {
  id: number;
  name: string;
  description?: string | null;
  tutorAssignments?: {
    id: number;
    tutor: {
      name: string;
    };
  }[];
}

export const extracurricularService = {
  list: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get('/extracurriculars', { params });
    return response.data;
  },
  create: async (data: Omit<Extracurricular, 'id'>) => {
    const response = await api.post('/extracurriculars', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Extracurricular>) => {
    const response = await api.put(`/extracurriculars/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/extracurriculars/${id}`);
    return response.data;
  },

  getAssignments: async (params?: { academicYearId?: number; ekskulId?: number }) => {
    const response = await api.get('/extracurriculars/assignments', { params });
    return response.data;
  },

  assignTutor: async (data: { tutorId: number; ekskulId: number; academicYearId: number }) => {
    const response = await api.post('/extracurriculars/assignments', data);
    return response.data;
  },

  removeAssignment: async (id: number) => {
    const response = await api.delete(`/extracurriculars/assignments/${id}`);
    return response.data;
  },
};
