import { apiClient } from '../../lib/api/client';
import {
  HeadProgramClassRow,
  HeadProgramInternshipRow,
  IndustryPartnerRow,
  JobVacancyRow,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type ClassesListData = {
  classes: HeadProgramClassRow[];
  pagination?: {
    total?: number;
  };
};

type InternshipListData = {
  internships: HeadProgramInternshipRow[];
  pagination?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
};

type PartnerListData = {
  partners: IndustryPartnerRow[];
  total?: number;
  page?: number;
  totalPages?: number;
};

type VacancyListData = {
  vacancies: JobVacancyRow[];
  total?: number;
  page?: number;
  totalPages?: number;
};

export const headProgramApi = {
  async listClassesByMajors(params: { majorIds: number[]; academicYearId?: number }) {
    if (!params.majorIds.length) return [];

    const responses = await Promise.all(
      params.majorIds.map((majorId) =>
        apiClient.get<ApiEnvelope<ClassesListData>>('/classes', {
          params: {
            page: 1,
            limit: 200,
            majorId,
            academicYearId: params.academicYearId,
          },
        }),
      ),
    );

    const rowsMap = new Map<number, HeadProgramClassRow>();
    for (const response of responses) {
      const rows = response.data?.data?.classes || [];
      for (const row of rows) {
        rowsMap.set(row.id, row);
      }
    }

    return Array.from(rowsMap.values()).sort((a, b) => {
      const levelA = String(a.level || '');
      const levelB = String(b.level || '');
      if (levelA !== levelB) return levelA.localeCompare(levelB, 'id');
      const majorA = String(a.major?.code || a.major?.name || '');
      const majorB = String(b.major?.code || b.major?.name || '');
      if (majorA !== majorB) return majorA.localeCompare(majorB, 'id');
      return String(a.name || '').localeCompare(String(b.name || ''), 'id');
    });
  },

  async listInternships(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<InternshipListData>>('/internships/all', {
      params: {
        page: 1,
        limit: 300,
        academicYearId: params?.academicYearId,
      },
    });

    const rows = response.data?.data?.internships;
    return Array.isArray(rows) ? rows : [];
  },

  async listPartners(params?: { search?: string }) {
    const response = await apiClient.get<ApiEnvelope<PartnerListData>>('/humas/partners', {
      params: {
        page: 1,
        limit: 300,
        search: params?.search,
      },
    });

    const rows = response.data?.data?.partners;
    return Array.isArray(rows) ? rows : [];
  },

  async createPartner(payload: {
    name: string;
    address: string;
    city?: string;
    sector?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    website?: string;
    cooperationStatus: 'AKTIF' | 'NON_AKTIF' | 'PROSES';
  }) {
    const response = await apiClient.post<ApiEnvelope<IndustryPartnerRow>>('/humas/partners', payload);
    return response.data?.data;
  },

  async updatePartner(
    partnerId: number,
    payload: Partial<{
      name: string;
      address: string;
      city: string;
      sector: string;
      contactPerson: string;
      phone: string;
      email: string;
      website: string;
      cooperationStatus: 'AKTIF' | 'NON_AKTIF' | 'PROSES';
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<IndustryPartnerRow>>(`/humas/partners/${partnerId}`, payload);
    return response.data?.data;
  },

  async removePartner(partnerId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/humas/partners/${partnerId}`);
    return response.data?.success;
  },

  async listVacancies(params?: { search?: string }) {
    const response = await apiClient.get<ApiEnvelope<VacancyListData>>('/humas/vacancies', {
      params: {
        page: 1,
        limit: 300,
        search: params?.search,
      },
    });

    const rows = response.data?.data?.vacancies;
    return Array.isArray(rows) ? rows : [];
  },

  async createVacancy(payload: {
    title: string;
    companyName?: string;
    industryPartnerId?: number;
    description?: string;
    requirements?: string;
    registrationLink?: string;
    deadline?: string;
    isOpen?: boolean;
  }) {
    const response = await apiClient.post<ApiEnvelope<JobVacancyRow>>('/humas/vacancies', payload);
    return response.data?.data;
  },

  async updateVacancy(
    vacancyId: number,
    payload: Partial<{
      title: string;
      companyName: string;
      industryPartnerId: number;
      description: string;
      requirements: string;
      registrationLink: string;
      deadline: string;
      isOpen: boolean;
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<JobVacancyRow>>(`/humas/vacancies/${vacancyId}`, payload);
    return response.data?.data;
  },

  async removeVacancy(vacancyId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/humas/vacancies/${vacancyId}`);
    return response.data?.success;
  },
};
