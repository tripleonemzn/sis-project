import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type TutorAssignment = {
  id: number;
  tutorId: number;
  ekskulId: number;
  academicYearId: number;
  isActive: boolean;
  ekskul?: {
    id: number;
    name: string;
    description?: string | null;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
};

export type TutorMember = {
  id: number;
  studentId: number;
  ekskulId: number;
  academicYearId: number;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      name: string;
    } | null;
  } | null;
  grade?: string | null;
  description?: string | null;
  gradeSbtsOdd?: string | null;
  descSbtsOdd?: string | null;
  gradeSas?: string | null;
  descSas?: string | null;
  gradeSbtsEven?: string | null;
  descSbtsEven?: string | null;
  gradeSat?: string | null;
  descSat?: string | null;
};

export const tutorApi = {
  async listAssignments(academicYearId?: number) {
    const response = await apiClient.get<ApiEnvelope<TutorAssignment[]>>('/tutor/assignments', {
      params: {
        academicYearId,
      },
    });
    return response.data?.data || [];
  },
  async listMembers(params: { ekskulId: number; academicYearId: number }) {
    const response = await apiClient.get<ApiEnvelope<TutorMember[]>>('/tutor/members', {
      params: {
        ekskulId: params.ekskulId,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data || [];
  },
  async inputGrade(payload: {
    enrollmentId: number;
    grade: string;
    description: string;
    semester?: 'ODD' | 'EVEN';
    reportType?: 'SBTS' | 'SAS' | 'SAT';
  }) {
    const response = await apiClient.post<ApiEnvelope<TutorMember>>('/tutor/grades', payload);
    return response.data?.data;
  },
};

