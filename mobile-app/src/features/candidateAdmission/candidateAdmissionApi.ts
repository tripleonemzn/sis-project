import { apiClient } from '../../lib/api/client';
import type {
  MobileCandidateAdmissionDetail,
  MobileCandidateAdmissionMajor,
  MobileCandidateAdmissionStatus,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type MajorListPayload = {
  majors: MobileCandidateAdmissionMajor[];
};

export const candidateAdmissionApi = {
  async getMyAdmission() {
    const response = await apiClient.get<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      '/candidate-admissions/me',
    );
    return response.data.data;
  },

  async saveMyAdmission(payload: {
    name?: string;
    phone?: string;
    email?: string;
    gender?: 'MALE' | 'FEMALE';
    birthPlace?: string;
    birthDate?: string;
    address?: string;
    religion?: string;
    previousSchool?: string;
    lastEducation?: string;
    desiredMajorId?: number;
    parentName?: string;
    parentPhone?: string;
    domicileCity?: string;
    motivation?: string;
    submissionNotes?: string;
  }) {
    const response = await apiClient.put<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      '/candidate-admissions/me',
      payload,
    );
    return response.data.data;
  },

  async submitMyAdmission() {
    const response = await apiClient.post<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      '/candidate-admissions/me/submit',
    );
    return response.data.data;
  },

  async listMajors(limit = 100) {
    const response = await apiClient.get<ApiEnvelope<MajorListPayload>>('/majors', {
      params: {
        page: 1,
        limit,
      },
    });
    return response.data?.data?.majors || [];
  },

  getStatusMeta(status: MobileCandidateAdmissionStatus) {
    switch (status) {
      case 'DRAFT':
        return { label: 'Draft', backgroundColor: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1' };
      case 'SUBMITTED':
        return { label: 'Dikirim', backgroundColor: '#e0f2fe', textColor: '#0369a1', borderColor: '#bae6fd' };
      case 'UNDER_REVIEW':
        return { label: 'Direview', backgroundColor: '#fef3c7', textColor: '#b45309', borderColor: '#fde68a' };
      case 'NEEDS_REVISION':
        return { label: 'Perlu Revisi', backgroundColor: '#ffedd5', textColor: '#c2410c', borderColor: '#fdba74' };
      case 'TEST_SCHEDULED':
        return { label: 'Tes Dijadwalkan', backgroundColor: '#e0e7ff', textColor: '#4338ca', borderColor: '#c7d2fe' };
      case 'PASSED_TEST':
        return { label: 'Lulus Tes', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
      case 'FAILED_TEST':
        return { label: 'Belum Lulus', backgroundColor: '#ffe4e6', textColor: '#be123c', borderColor: '#fecdd3' };
      case 'ACCEPTED':
        return { label: 'Diterima', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
      case 'REJECTED':
        return { label: 'Ditolak', backgroundColor: '#ffe4e6', textColor: '#be123c', borderColor: '#fecdd3' };
      default:
        return { label: status, backgroundColor: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1' };
    }
  },
};
