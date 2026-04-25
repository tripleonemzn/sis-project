import { apiClient } from '../../lib/api/client';
import {
  DailyAttendanceEntry,
  DailyLateSummaryPayload,
  DailyPresenceMonitorScanResult,
  DailyPresenceOperationalParticipant,
  DailyPresenceOperationalStudent,
  DailyPresenceOwnState,
  DailyPresencePolicy,
  DailyPresencePolicyPayload,
  DailyPresenceSelfScanManagerSession,
  DailyPresenceSelfScanPass,
  DailyPresenceSelfScanPreview,
  DailyPresenceSelfScanSession,
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

type ApiListResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T[];
};

type DailyPresenceOverviewResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceOverview;
};

type DailyPresencePolicyResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresencePolicyPayload;
};

type DailyPresenceStudentResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceStudentState;
};

type DailyPresenceOwnResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceOwnState;
};

type DailyPresenceSelfScanSessionEnvelope = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYear: {
      id: number;
      name: string;
    };
    session: DailyPresenceSelfScanSession | DailyPresenceSelfScanManagerSession | null;
  };
};

type DailyPresenceSelfScanManagerEnvelope = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYear: {
      id: number;
      name: string;
    };
    session: DailyPresenceSelfScanManagerSession;
  };
};

type DailyPresenceSelfScanPassEnvelope = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceSelfScanPass;
};

type DailyPresenceSelfScanPreviewEnvelope = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceSelfScanPreview;
};

type DailyPresenceMonitorScanEnvelope = {
  statusCode: number;
  success: boolean;
  message: string;
  data: DailyPresenceMonitorScanResult;
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
  async getDailyPresencePolicy() {
    const response = await apiClient.get<DailyPresencePolicyResponse>('/attendances/daily-presence/policy');
    return response.data?.data;
  },
  async saveDailyPresencePolicy(policy: DailyPresencePolicy) {
    const response = await apiClient.put<DailyPresencePolicyResponse>('/attendances/daily-presence/policy', {
      policy,
    });
    return response.data?.data;
  },
  async getDailyPresenceStudents(params?: { query?: string; limit?: number }) {
    const response = await apiClient.get<ApiListResponse<DailyPresenceOperationalStudent>>(
      '/attendances/daily-presence/students',
      {
        params: {
          q: params?.query,
          limit: params?.limit,
        },
      },
    );
    return response.data?.data || [];
  },
  async getDailyPresenceParticipants(params?: { query?: string; limit?: number }) {
    const response = await apiClient.get<ApiListResponse<DailyPresenceOperationalParticipant>>(
      '/attendances/daily-presence/participants',
      {
        params: {
          q: params?.query,
          limit: params?.limit,
        },
      },
    );
    return response.data?.data || [];
  },
  async getStudentDailyPresence(params: { studentId: number; date?: string }) {
    const response = await apiClient.get<DailyPresenceStudentResponse>('/attendances/daily-presence/student', {
      params,
    });
    return response.data?.data;
  },
  async getOwnDailyPresence(params?: { date?: string }) {
    const response = await apiClient.get<DailyPresenceOwnResponse>('/attendances/daily-presence/me', {
      params,
    });
    return response.data?.data;
  },
  async getParticipantDailyPresence(params: { userId: number; date?: string }) {
    const response = await apiClient.get<DailyPresenceOwnResponse>('/attendances/daily-presence/participant', {
      params,
    });
    return response.data?.data;
  },
  async getOwnDailyPresenceHistory(params?: { month?: number; year?: number }) {
    const response = await apiClient.get<AttendanceHistoryResponse>('/attendances/daily-presence/me/history', {
      params,
    });
    return response.data?.data || [];
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
  async saveAssistedUserDailyPresence(payload: {
    userId: number;
    checkpoint: 'CHECK_IN' | 'CHECK_OUT';
    reason: string;
    gateLabel?: string | null;
  }) {
    const response = await apiClient.post<DailyPresenceOwnResponse>('/attendances/daily-presence/assisted-user', payload);
    return response.data?.data;
  },
  async getActiveSelfScanSession(params: { checkpoint: 'CHECK_IN' | 'CHECK_OUT' }) {
    const response = await apiClient.get<DailyPresenceSelfScanSessionEnvelope>(
      '/attendances/daily-presence/self-scan/session',
      {
        params,
      },
    );
    return response.data?.data?.session || null;
  },
  async getActiveManagerSelfScanSession(params: { checkpoint: 'CHECK_IN' | 'CHECK_OUT' }) {
    const response = await apiClient.get<DailyPresenceSelfScanManagerEnvelope>(
      '/attendances/daily-presence/self-scan/session',
      {
        params,
      },
    );
    return response.data?.data?.session || null;
  },
  async startSelfScanSession(payload: {
    checkpoint: 'CHECK_IN' | 'CHECK_OUT';
    gateLabel?: string | null;
  }) {
    const response = await apiClient.post<DailyPresenceSelfScanManagerEnvelope>(
      '/attendances/daily-presence/self-scan/session',
      payload,
    );
    return response.data?.data?.session;
  },
  async closeSelfScanSession(payload: { checkpoint: 'CHECK_IN' | 'CHECK_OUT' }) {
    await apiClient.post('/attendances/daily-presence/self-scan/session/close', payload);
  },
  async createSelfScanPass(payload: {
    checkpoint: 'CHECK_IN' | 'CHECK_OUT';
    challengeCode: string;
  }) {
    const response = await apiClient.post<DailyPresenceSelfScanPassEnvelope>(
      '/attendances/daily-presence/self-scan/pass',
      payload,
    );
    return response.data?.data;
  },
  async previewSelfScanPass(payload: { qrToken: string }) {
    const response = await apiClient.post<DailyPresenceSelfScanPreviewEnvelope>(
      '/attendances/daily-presence/self-scan/preview',
      payload,
    );
    return response.data?.data;
  },
  async confirmSelfScanPass(payload: { qrToken: string }) {
    const response = await apiClient.post<DailyPresenceStudentResponse>(
      '/attendances/daily-presence/self-scan/confirm',
      payload,
    );
    return response.data?.data;
  },
  async confirmSelfScanMonitorPass(payload: { qrToken: string }) {
    const response = await apiClient.post<DailyPresenceMonitorScanEnvelope>(
      '/attendances/daily-presence/self-scan/monitor/confirm',
      payload,
    );
    return response.data?.data;
  },
};
