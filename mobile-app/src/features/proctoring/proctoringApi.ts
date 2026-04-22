import { apiClient } from '../../lib/api/client';
import {
  ProctorEndSessionPayload,
  ProctorEndSessionResponse,
  ProctorReportPayload,
  ProctorScheduleDetail,
  ProctorScheduleSummary,
  ProctorWarningPayload,
  ProctorWarningResponse,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const proctoringApi = {
  async getSchedules(params?: { mode?: 'proctor' | 'author' }) {
    const response = await apiClient.get<ApiEnvelope<ProctorScheduleSummary[]>>('/proctoring/schedules', {
      params: {
        mode: params?.mode,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async getScheduleDetail(scheduleId: number, params?: { slotKey?: string | null }) {
    const response = await apiClient.get<ApiEnvelope<ProctorScheduleDetail>>(
      `/proctoring/schedules/${scheduleId}`,
      {
        params: {
          slotKey: params?.slotKey || undefined,
        },
      },
    );
    return response.data?.data;
  },

  async submitReport(scheduleId: number, payload: ProctorReportPayload, params?: { slotKey?: string | null }) {
    const response = await apiClient.post<ApiEnvelope<unknown>>(
      `/proctoring/schedules/${scheduleId}/report`,
      payload,
      {
        params: {
          slotKey: params?.slotKey || undefined,
        },
      },
    );
    return response.data?.data;
  },

  async sendWarning(scheduleId: number, payload: ProctorWarningPayload, params?: { slotKey?: string | null }) {
    const response = await apiClient.post<ApiEnvelope<ProctorWarningResponse>>(
      `/proctoring/schedules/${scheduleId}/warnings`,
      payload,
      {
        params: {
          slotKey: params?.slotKey || undefined,
        },
      },
    );
    return response.data?.data;
  },

  async endStudentSession(scheduleId: number, payload: ProctorEndSessionPayload, params?: { slotKey?: string | null }) {
    const response = await apiClient.post<ApiEnvelope<ProctorEndSessionResponse>>(
      `/proctoring/schedules/${scheduleId}/end-session`,
      payload,
      {
        params: {
          slotKey: params?.slotKey || undefined,
        },
      },
    );
    return response.data?.data;
  },
};
