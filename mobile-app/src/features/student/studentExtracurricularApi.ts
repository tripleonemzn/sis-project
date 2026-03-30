import { apiClient } from '../../lib/api/client';
import type { ExtracurricularCategory } from '../extracurricular/category';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type StudentExtracurricular = {
  id: number;
  name: string;
  description?: string | null;
  category?: ExtracurricularCategory;
  tutorAssignments?: Array<{
    id: number;
    tutor?: {
      name?: string | null;
    } | null;
  }>;
};

export type StudentExtracurricularEnrollment = {
  id: number;
  studentId: number;
  ekskulId: number;
  academicYearId: number;
  ekskul?: StudentExtracurricular | null;
};

export type StudentOsisMembershipStatus = {
  id: number;
  studentId: number;
  divisionId?: number | null;
  positionId: number;
  division?: {
    id: number;
    name: string;
  } | null;
  position?: {
    id: number;
    name: string;
    division?: {
      id: number;
      name: string;
    } | null;
  } | null;
};

export type StudentOsisJoinRequestStatus = {
  id: number;
  academicYearId: number;
  ekskulId: number;
  studentId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  note?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  ekskul?: StudentExtracurricular | null;
};

export type StudentOsisStatusPayload = {
  academicYearId: number | null;
  membership: StudentOsisMembershipStatus | null;
  request: StudentOsisJoinRequestStatus | null;
};

export type StudentExtracurricularListPayload = {
  extracurriculars: StudentExtracurricular[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const studentExtracurricularApi = {
  async listExtracurriculars() {
    const response = await apiClient.get<ApiEnvelope<StudentExtracurricularListPayload>>('/public/extracurriculars', {
      params: {
        page: 1,
        limit: 100,
      },
    });
    return response.data?.data?.extracurriculars || [];
  },
  async getMyEnrollment() {
    const response = await apiClient.get<ApiEnvelope<StudentExtracurricularEnrollment | null>>(
      '/student/extracurriculars/my',
    );
    return response.data?.data || null;
  },
  async enroll(ekskulId: number, academicYearId?: number) {
    const response = await apiClient.post<ApiEnvelope<StudentExtracurricularEnrollment>>(
      '/student/extracurriculars/enroll',
      {
        ekskulId,
        academicYearId,
      },
    );
    return response.data?.data;
  },
  async getMyOsisStatus() {
    const response = await apiClient.get<ApiEnvelope<StudentOsisStatusPayload>>('/osis/student/status');
    return response.data?.data || null;
  },
  async requestOsisJoin(ekskulId: number, academicYearId?: number) {
    const response = await apiClient.post<ApiEnvelope<StudentOsisJoinRequestStatus>>('/osis/student/requests', {
      ekskulId,
      academicYearId,
    });
    return response.data?.data;
  },
};
