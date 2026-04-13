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

type AssignmentLabelSource = Pick<TeacherAssignment, 'subject' | 'class'>;

const compareNaturalText = (left: unknown, right: unknown): number =>
  String(left || '').localeCompare(String(right || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });

export const compareTeacherAssignmentsBySubjectClass = <T extends AssignmentLabelSource>(
  a: T,
  b: T,
): number => {
  const subjectCompare = compareNaturalText(a.subject?.name, b.subject?.name);
  if (subjectCompare !== 0) return subjectCompare;
  return compareNaturalText(a.class?.name, b.class?.name);
};

export const sortTeacherAssignmentsBySubjectClass = <T extends AssignmentLabelSource>(assignments: T[]): T[] =>
  [...assignments].sort(compareTeacherAssignmentsBySubjectClass);

export const formatTeacherAssignmentLabel = (assignment: AssignmentLabelSource): string =>
  `${assignment.subject?.name || '-'} - ${assignment.class?.name || '-'}`;

const ensurePositiveAssignmentId = (id: number) => {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Teacher assignment id tidak valid');
  }
};

export const teacherAssignmentService = {
  list: async (
    params: {
    page?: number;
    limit?: number;
    search?: string;
    academicYearId?: number;
    semester?: 'ODD' | 'EVEN';
    teacherId?: number;
    subjectId?: number;
    classId?: number;
    scope?: 'CURRICULUM';
  }): Promise<{ data: TeacherAssignmentResponse; [key: string]: unknown }> => {
    const response = await api.get<{ data: TeacherAssignmentResponse }>('/teacher-assignments', {
      params,
    });
    const payload = response.data as { data: TeacherAssignmentResponse; [key: string]: unknown };
    const assignments = Array.isArray(payload.data?.assignments) ? payload.data.assignments : [];
    return {
      ...payload,
      data: {
        ...payload.data,
        assignments: sortTeacherAssignmentsBySubjectClass(assignments),
      },
    };
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
    ensurePositiveAssignmentId(id);
    const response = await api.delete<{ data: null }>(`/teacher-assignments/${id}`);
    return response.data;
  },

  getById: async (id: number, semester?: 'ODD' | 'EVEN') => {
    ensurePositiveAssignmentId(id);
    const response = await api.get<{ data: TeacherAssignment }>(`/teacher-assignments/${id}`, {
      params: semester ? { semester } : undefined,
    });
    return response.data;
  },

  updateCompetencyThresholds: async (
    id: number,
    competencyThresholds: { A?: string; B?: string; C?: string; D?: string },
    semester?: 'ODD' | 'EVEN',
  ) => {
    ensurePositiveAssignmentId(id);
    const response = await api.put<{ data: TeacherAssignment }>(`/teacher-assignments/${id}/competency`, {
      competencyThresholds,
      ...(semester ? { semester } : {}),
    });
    return response.data;
  },
};
