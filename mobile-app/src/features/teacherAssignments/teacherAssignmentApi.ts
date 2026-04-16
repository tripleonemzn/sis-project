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

type Semester = 'ODD' | 'EVEN';

export const teacherAssignmentApi = {
  async list(params: { academicYearId: number; teacherId?: number; limit?: number; semester?: Semester }) {
    const response = await apiClient.get<ListTeacherAssignmentsResponse>('/teacher-assignments', {
      params: {
        ...params,
        limit: params.limit ?? 200,
      },
    });
    return response.data.data.assignments || [];
  },
  async getById(id: number, semester?: Semester) {
    const response = await apiClient.get<TeacherAssignmentDetailResponse>(`/teacher-assignments/${id}`, {
      params: semester ? { semester } : undefined,
    });
    return response.data.data;
  },
  async updateCompetencyThresholds(
    id: number,
    competencyThresholds: {
      A?: string;
      B?: string;
      C?: string;
      D?: string;
      _byReligion?: Record<string, { A?: string; B?: string; C?: string; D?: string }>;
    },
    semester?: Semester,
  ) {
    const response = await apiClient.put<TeacherAssignmentMutationResponse>(`/teacher-assignments/${id}/competency`, {
      competencyThresholds,
      ...(semester ? { semester } : {}),
    });
    return response.data.data;
  },
};
