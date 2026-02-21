import { apiClient } from '../../lib/api/client';

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
    const response = await apiClient.get<ApiEnvelope<StudentExtracurricularListPayload>>('/extracurriculars', {
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
};

