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
  grade?: string | null;
  description?: string | null;
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
  programs: Array<{
    id: number;
    title: string;
    description?: string | null;
    semester?: 'ODD' | 'EVEN' | null;
    startMonth?: number | null;
    endMonth?: number | null;
    startWeek?: number | null;
    endWeek?: number | null;
    executionStatus?: string | null;
    owner?: {
      id: number;
      name: string;
      username?: string | null;
    } | null;
    items?: Array<{
      id: number;
      description: string;
      targetDate?: string | null;
      isCompleted?: boolean;
      note?: string | null;
    }>;
  }>;
};

export type StudentExtracurricularAttendanceSummary = {
  totalSessions: number;
  presentCount: number;
  permitCount: number;
  sickCount: number;
  absentCount: number;
  latestRecords: Array<{
    weekKey?: string | null;
    sessionIndex: number;
    status: 'PRESENT' | 'PERMIT' | 'SICK' | 'ABSENT' | string;
    note?: string | null;
  }>;
};

export type StudentRegularExtracurricularSummary = {
  id: number;
  academicYearId: number;
  grade?: string | null;
  description?: string | null;
  semesterGrades?: {
    sbtsOdd?: { grade?: string | null; description?: string | null };
    sas?: { grade?: string | null; description?: string | null };
    sbtsEven?: { grade?: string | null; description?: string | null };
    sat?: { grade?: string | null; description?: string | null };
  } | null;
  ekskul: {
    id: number;
    name: string;
    description?: string | null;
    tutors?: Array<{
      id?: number;
      name?: string | null;
      username?: string | null;
    }>;
  };
  attendanceSummary: StudentExtracurricularAttendanceSummary;
};

export type StudentExtracurricularSummary = {
  academicYear: {
    id: number;
    name: string;
  } | null;
  regularEnrollment: StudentRegularExtracurricularSummary | null;
  osisStatus: StudentOsisStatusPayload;
  actions: {
    canChooseRegular: boolean;
    canRequestOsis: boolean;
  };
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
  async listExtracurriculars(category?: ExtracurricularCategory) {
    const response = await apiClient.get<ApiEnvelope<StudentExtracurricularListPayload>>('/public/extracurriculars', {
      params: {
        page: 1,
        limit: 0,
        category,
      },
    });
    return response.data?.data?.extracurriculars || [];
  },
  async getSummary() {
    const response = await apiClient.get<ApiEnvelope<StudentExtracurricularSummary>>('/student/extracurriculars/summary');
    return response.data?.data || null;
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
