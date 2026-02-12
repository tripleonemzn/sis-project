import api from './api';

export interface TeacherAssignment {
  id: number;
  teacherId: number;
  subjectId: number;
  academicYearId: number;
  classId: number;
  kkm: number;
  competencyThresholds?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  } | null;
  teacher: {
    id: number;
    name: string;
    username: string;
  };
  subject: {
    id: number;
    name: string;
    code: string;
  };
  class: {
    id: number;
    name: string;
    level: string;
    major: {
      id: number;
      name: string;
      code: string;
    };
    students?: {
      id: number;
      name: string;
      nis: string | null;
      nisn?: string | null;
      gender: 'MALE' | 'FEMALE';
    }[];
    _count?: {
      students: number;
    };
  };
  academicYear: {
    id: number;
    name: string;
  };
}

export interface TeacherAssignmentResponse {
  assignments: TeacherAssignment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TeacherAssignmentDetail extends TeacherAssignment {
  class: {
    id: number;
    name: string;
    level: string;
    major: { id: number; name: string; code: string };
    students: Array<{
      id: number;
      name: string;
      nis: string | null;
      nisn: string | null;
      gender: 'MALE' | 'FEMALE';
    }>;
  };
  subject: {
    id: number;
    name: string;
    code: string;
  };
  academicYear: {
    id: number;
    name: string;
    semester: string;
  };
}

export const teacherAssignmentService = {
  list: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    academicYearId?: number;
    teacherId?: number;
    subjectId?: number;
    classId?: number;
  }) => {
    const response = await api.get<{ data: TeacherAssignmentResponse }>('/teacher-assignments', {
      params,
    });
    return response.data;
  },

  create: async (data: {
    academicYearId: number;
    teacherId: number;
    subjectId: number;
    classIds: number[];
  }) => {
    const response = await api.post<{ data: { assignments: TeacherAssignment[] } }>(
      '/teacher-assignments',
      data,
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete<{ data: null }>(`/teacher-assignments/${id}`);
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get<{ data: TeacherAssignment }>(`/teacher-assignments/${id}`);
    return response.data;
  },

  updateCompetencyThresholds: async (id: number, competencyThresholds: { A?: string; B?: string; C?: string; D?: string }) => {
    const response = await api.put<{ data: TeacherAssignment }>(`/teacher-assignments/${id}/competency`, {
      competencyThresholds,
    });
    return response.data;
  },
};
