import { apiClient } from '../../lib/api/client';
import { TeacherAssignment, TeacherAssignmentDetail } from './types';

type ListTeacherAssignmentsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    assignments: TeacherAssignment[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type TeacherAssignmentDetailResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherAssignmentDetail;
};

type TeacherAssignmentMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherAssignment;
};

export const teacherAssignmentApi = {
  async list(params: { academicYearId: number; teacherId?: number; limit?: number }) {
    const response = await apiClient.get<ListTeacherAssignmentsResponse>('/teacher-assignments', {
      params: {
        ...params,
        limit: params.limit ?? 200,
      },
    });
    return response.data.data.assignments || [];
  },
  async getById(id: number) {
    const response = await apiClient.get<TeacherAssignmentDetailResponse>(`/teacher-assignments/${id}`);
    return response.data.data;
  },
  async updateCompetencyThresholds(
    id: number,
    competencyThresholds: { A?: string; B?: string; C?: string; D?: string },
  ) {
    const response = await apiClient.put<TeacherAssignmentMutationResponse>(`/teacher-assignments/${id}/competency`, {
      competencyThresholds,
    });
    return response.data.data;
  },
};
