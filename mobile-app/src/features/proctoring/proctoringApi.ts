import { apiClient } from '../../lib/api/client';
import {
  ProctorReportPayload,
  ProctorScheduleDetail,
  ProctorScheduleSummary,
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

  async getScheduleDetail(scheduleId: number) {
    const response = await apiClient.get<ApiEnvelope<ProctorScheduleDetail>>(
      `/proctoring/schedules/${scheduleId}`,
    );
    return response.data?.data;
  },

  async submitReport(scheduleId: number, payload: ProctorReportPayload) {
    const response = await apiClient.post<ApiEnvelope<unknown>>(
      `/proctoring/schedules/${scheduleId}/report`,
      payload,
    );
    return response.data?.data;
  },
};
