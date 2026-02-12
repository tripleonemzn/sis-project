import api from './api';

export interface AcademicYear {
  id: number;
  name: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  isActive: boolean;
  pklEligibleGrades?: string | null;
}

export const academicYearService = {
  list: async (params?: { page?: number; limit?: number; isActive?: boolean; search?: string }) => {
    const response = await api.get('/academic-years', { params });
    return response.data;
  },
  getActive: async () => {
    const response = await api.get('/academic-years/active');
    return response.data;
  },
  create: async (data: Omit<AcademicYear, 'id' | 'isActive'> & { isActive?: boolean }) => {
    const response = await api.post('/academic-years', data);
    return response.data;
  },
  update: async (id: number, data: Partial<AcademicYear>) => {
    const response = await api.put(`/academic-years/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/academic-years/${id}`);
    return response.data;
  },
  activate: async (id: number) => {
    const response = await api.post(`/academic-years/${id}/activate`);
    return response.data;
  },
  updatePklConfig: async (pklEligibleGrades: string) => {
    const response = await api.patch('/academic-years/pkl-config', { pklEligibleGrades });
    return response.data;
  },
};
