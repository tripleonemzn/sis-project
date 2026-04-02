import { apiClient } from '../../lib/api/client';
import type {
  PublicBkkApplicantProfile,
  PublicBkkApplication,
  PublicBkkApplicationSummary,
  PublicBkkApplicationStatus,
  PublicBkkVacancy,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type VacancyListData = {
  vacancies: PublicBkkVacancy[];
};

type ApplicationListData = {
  applications: PublicBkkApplication[];
  summary: PublicBkkApplicationSummary;
};

export const publicBkkApi = {
  async listOpenVacancies(limit = 24) {
    const response = await apiClient.get<ApiEnvelope<VacancyListData>>('/humas/vacancies', {
      params: {
        page: 1,
        limit,
        isOpen: true,
      },
    });
    return response.data?.data?.vacancies || [];
  },

  async getApplicantProfile() {
    const response = await apiClient.get<ApiEnvelope<PublicBkkApplicantProfile>>('/humas/applicant-profile/me');
    return response.data.data;
  },

  async saveApplicantProfile(payload: {
    name: string;
    headline?: string;
    phone?: string;
    email?: string;
    address?: string;
    educationLevel?: string;
    graduationYear?: string;
    schoolName?: string;
    major?: string;
    educationHistories?: Array<{
      level: 'TK' | 'SD' | 'SMP_MTS' | 'SLTA' | 'D1' | 'D2' | 'D3' | 'D4_S1' | 'S2' | 'S3';
      institutionName?: string | null;
      faculty?: string | null;
      studyProgram?: string | null;
      gpa?: string | null;
      degree?: string | null;
      documents: Array<{
        kind: 'IJAZAH' | 'SKHUN' | 'TRANSKRIP';
        label: string;
        fileUrl: string;
        originalName?: string | null;
        mimeType?: string | null;
        size?: number | null;
        uploadedAt?: string | null;
      }>;
    }>;
    skills?: string;
    experienceSummary?: string;
    cvUrl?: string;
    portfolioUrl?: string;
    linkedinUrl?: string;
  }) {
    const response = await apiClient.put<ApiEnvelope<PublicBkkApplicantProfile>>('/humas/applicant-profile/me', payload);
    return response.data.data;
  },

  async listMyApplications() {
    const response = await apiClient.get<ApiEnvelope<ApplicationListData>>('/humas/applications/me');
    return response.data.data;
  },

  async applyToVacancy(
    vacancyId: number,
    payload?: {
      coverLetter?: string;
      expectedSalary?: string;
      source?: string;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<PublicBkkApplication>>(`/humas/vacancies/${vacancyId}/apply`, payload || {});
    return response.data.data;
  },

  async withdrawApplication(applicationId: number) {
    const response = await apiClient.patch<ApiEnvelope<PublicBkkApplication>>(`/humas/applications/${applicationId}/withdraw`);
    return response.data.data;
  },

  isWithdrawable(status: PublicBkkApplicationStatus) {
    return status === 'SUBMITTED' || status === 'REVIEWING' || status === 'INTERVIEW';
  },

  getStatusMeta(status: PublicBkkApplicationStatus) {
    switch (status) {
      case 'SUBMITTED':
        return { label: 'Dikirim', backgroundColor: '#e0f2fe', textColor: '#0369a1', borderColor: '#bae6fd' };
      case 'REVIEWING':
        return { label: 'Review Internal', backgroundColor: '#fef3c7', textColor: '#b45309', borderColor: '#fde68a' };
      case 'SHORTLISTED':
        return { label: 'Shortlist Mitra', backgroundColor: '#e0e7ff', textColor: '#4338ca', borderColor: '#c7d2fe' };
      case 'PARTNER_INTERVIEW':
        return { label: 'Interview Mitra', backgroundColor: '#f3e8ff', textColor: '#7e22ce', borderColor: '#e9d5ff' };
      case 'INTERVIEW':
        return { label: 'Interview (Legacy)', backgroundColor: '#fae8ff', textColor: '#a21caf', borderColor: '#f5d0fe' };
      case 'HIRED':
        return { label: 'Diterima Mitra', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
      case 'ACCEPTED':
        return { label: 'Diterima (Legacy)', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
      case 'REJECTED':
        return { label: 'Ditolak', backgroundColor: '#ffe4e6', textColor: '#be123c', borderColor: '#fecdd3' };
      case 'WITHDRAWN':
        return { label: 'Dibatalkan', backgroundColor: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1' };
      default:
        return { label: status, backgroundColor: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1' };
    }
  },

  getActiveProcessingCount(summary: PublicBkkApplicationSummary) {
    return summary.submitted + summary.reviewing + summary.shortlisted + summary.partnerInterview + summary.interview;
  },

  getSuccessfulPlacementCount(summary: PublicBkkApplicationSummary) {
    return summary.hired + Math.max(summary.accepted - summary.hired, 0);
  },

  resolveCompanyName(vacancy: { companyName?: string | null; industryPartner?: { name?: string | null } | null }) {
    return vacancy.industryPartner?.name || vacancy.companyName || 'Perusahaan umum';
  },
};
