import { apiClient } from '../../lib/api/client';
import {
  HumasAcademicYear,
  HumasInternshipRow,
  HumasJournalRow,
  HumasPartnerRow,
  HumasVacancyRow,
  InternshipAssessmentComponentRow,
  PklEligibleGrades,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type InternshipListData = {
  internships: HumasInternshipRow[];
  pagination?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
};

type PartnerListData = {
  partners: HumasPartnerRow[];
  total?: number;
  page?: number;
  totalPages?: number;
};

type VacancyListData = {
  vacancies: HumasVacancyRow[];
  total?: number;
  page?: number;
  totalPages?: number;
};

export const humasApi = {
  async getActiveAcademicYear() {
    const response = await apiClient.get<ApiEnvelope<HumasAcademicYear>>('/academic-years/active');
    return response.data?.data;
  },

  async updatePklConfig(pklEligibleGrades: PklEligibleGrades) {
    const response = await apiClient.patch<ApiEnvelope<HumasAcademicYear>>('/academic-years/pkl-config', {
      pklEligibleGrades,
    });
    return response.data?.data;
  },

  async listInternships(params?: {
    status?: string;
    classId?: number;
    page?: number;
    limit?: number;
    search?: string;
    academicYearId?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<InternshipListData>>('/internships/all', {
      params: {
        status: params?.status,
        classId: params?.classId,
        page: params?.page ?? 1,
        limit: params?.limit ?? 200,
        search: params?.search,
        academicYearId: params?.academicYearId,
      },
    });

    const rows = response.data?.data?.internships;
    return Array.isArray(rows) ? rows : [];
  },

  async updateInternshipStatus(
    internshipId: number,
    payload: {
      status: 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'DEFENSE_COMPLETED';
      rejectionReason?: string;
      teacherId?: number | null;
      mentorName?: string;
      mentorPhone?: string;
      companyLatitude?: string;
      companyLongitude?: string;
    },
  ) {
    const response = await apiClient.patch<ApiEnvelope<HumasInternshipRow>>(
      `/internships/${internshipId}/status`,
      payload,
    );
    return response.data?.data;
  },

  async listAssessmentComponents() {
    const response = await apiClient.get<ApiEnvelope<InternshipAssessmentComponentRow[]>>(
      '/internships/components',
    );
    const rows = response.data?.data;
    return Array.isArray(rows) ? rows : [];
  },

  async createAssessmentComponent(payload: {
    name: string;
    description?: string;
    weight: number;
    isActive?: boolean;
  }) {
    const response = await apiClient.post<ApiEnvelope<InternshipAssessmentComponentRow>>(
      '/internships/components',
      {
        ...payload,
        isActive: payload.isActive ?? true,
      },
    );
    return response.data?.data;
  },

  async updateAssessmentComponent(
    componentId: number,
    payload: {
      name?: string;
      description?: string;
      weight?: number;
      isActive?: boolean;
    },
  ) {
    const response = await apiClient.put<ApiEnvelope<InternshipAssessmentComponentRow>>(
      `/internships/components/${componentId}`,
      payload,
    );
    return response.data?.data;
  },

  async listJournals(internshipId: number) {
    const response = await apiClient.get<ApiEnvelope<HumasJournalRow[]>>(`/internships/${internshipId}/journals`);
    const rows = response.data?.data;
    return Array.isArray(rows) ? rows : [];
  },

  async updateJournalStatus(
    journalId: number,
    payload: {
      status: 'VERIFIED' | 'REJECTED';
      feedback?: string;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<HumasJournalRow>>(
      `/internships/journal/${journalId}/approve`,
      payload,
    );
    return response.data?.data;
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
    const response = await apiClient.post<ApiEnvelope<HumasPartnerRow>>('/humas/partners', payload);
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
    const response = await apiClient.put<ApiEnvelope<HumasPartnerRow>>(`/humas/partners/${partnerId}`, payload);
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
    const response = await apiClient.post<ApiEnvelope<HumasVacancyRow>>('/humas/vacancies', payload);
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
    const response = await apiClient.put<ApiEnvelope<HumasVacancyRow>>(`/humas/vacancies/${vacancyId}`, payload);
    return response.data?.data;
  },

  async removeVacancy(vacancyId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/humas/vacancies/${vacancyId}`);
    return response.data?.success;
  },
};
