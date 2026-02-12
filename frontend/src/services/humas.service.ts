import api from './api';

export interface IndustryPartner {
  id: number;
  name: string;
  address: string;
  city?: string;
  sector?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  cooperationStatus: 'AKTIF' | 'NON_AKTIF' | 'PROSES';
  mouDocumentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobVacancy {
  id: number;
  title: string;
  companyName?: string;
  description?: string;
  requirements?: string;
  registrationLink?: string;
  deadline?: string;
  isOpen: boolean;
  industryPartnerId?: number;
  industryPartner?: IndustryPartner;
  createdAt: string;
  updatedAt: string;
}

export const humasService = {
  // Partners
  getPartners: async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    return await api.get('/humas/partners', { params });
  },

  createPartner: async (data: any) => {
    return await api.post('/humas/partners', data);
  },

  updatePartner: async (id: number, data: any) => {
    return await api.put(`/humas/partners/${id}`, data);
  },

  deletePartner: async (id: number) => {
    return await api.delete(`/humas/partners/${id}`);
  },

  // Vacancies
  getVacancies: async (params?: { page?: number; limit?: number; search?: string; isOpen?: boolean }) => {
    return await api.get('/humas/vacancies', { params });
  },

  createVacancy: async (data: any) => {
    return await api.post('/humas/vacancies', data);
  },

  updateVacancy: async (id: number, data: any) => {
    return await api.put(`/humas/vacancies/${id}`, data);
  },

  deleteVacancy: async (id: number) => {
    return await api.delete(`/humas/vacancies/${id}`);
  }
};
