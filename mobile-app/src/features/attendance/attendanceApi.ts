import { apiClient } from '../../lib/api/client';
import {
  DailyAttendanceEntry,
  DailyLateSummaryPayload,
  DailyPresenceOverview,
  DailyPresenceStudentState,
  StudentAttendanceHistory,
  TeacherSubjectAttendance,
  TeacherSubjectAttendanceRecord,
} from './types';

type AttendanceHistoryResponse = {
  success: boolean;
  message: string;
  data: StudentAttendanceHistory[];
};

type SubjectAttendanceResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherSubjectAttendance | null;
};

type DailyAttendanceResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyAttendanceEntry[];
};

type DailyLateSummaryResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyLateSummaryPayload;
};

type MutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: unknown;
};

type DailyPresenceOverviewResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceOverview;
};

type DailyPresenceStudentResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceStudentState;
};

export const attendanceApi = {
  async getStudentHistory(params: { month: number; year: number }) {
    const response = await apiClient.get<AttendanceHistoryResponse>('/attendances/student-history', {
      params,
    });
    return response.data?.data || [];
  },
  async getSubjectAttendance(params: {
    date: string;
    classId: number;
    subjectId: number;
    academicYearId: number;
  }) {
    const response = await apiClient.get<SubjectAttendanceResponse>('/attendances/subject', {
      params,
    });
    return response.data?.data || null;
  },
  async saveSubjectAttendance(payload: {
    date: string;
    classId: number;
    subjectId: number;
    academicYearId: number;
    records: TeacherSubjectAttendanceRecord[];
  }) {
    const response = await apiClient.post<SubjectAttendanceResponse>('/attendances/subject', payload);
    return response.data?.data || null;
  },
  async getDailyAttendance(params: {
    date: string;
    classId: number;
    academicYearId: number;
  }) {
    const response = await apiClient.get<DailyAttendanceResponse>('/attendances/daily', { params });
    return response.data?.data || [];
  },
  async saveDailyAttendance(payload: {
    date: string;
    classId: number;
    academicYearId: number;
    records: TeacherSubjectAttendanceRecord[];
  }) {
    const response = await apiClient.post<MutationResponse>('/attendances/daily', payload);
    return response.data?.data || null;
  },
  async getLateSummaryByClass(params: { classId: number; academicYearId?: number }) {
    const response = await apiClient.get<DailyLateSummaryResponse>('/attendances/daily/late-summary', { params });
    return response.data?.data;
  },
  async getDailyPresenceOverview(params?: { date?: string; limit?: number }) {
    const response = await apiClient.get<DailyPresenceOverviewResponse>('/attendances/daily-presence/overview', {
      params,
    });
    return response.data?.data;
  },
  async getStudentDailyPresence(params: { studentId: number; date?: string }) {
    const response = await apiClient.get<DailyPresenceStudentResponse>('/attendances/daily-presence/student', {
      params,
    });
    return response.data?.data;
  },
  async saveAssistedDailyPresence(payload: {
    studentId: number;
    checkpoint: 'CHECK_IN' | 'CHECK_OUT';
    reason: string;
    gateLabel?: string | null;
  }) {
    const response = await apiClient.post<DailyPresenceStudentResponse>('/attendances/daily-presence/assisted', payload);
    return response.data?.data;
  },
};
