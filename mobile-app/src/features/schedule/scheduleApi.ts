import { apiClient } from '../../lib/api/client';
import { ScheduleListResponse } from './types';

export const scheduleApi = {
  async list(params: { academicYearId: number; classId?: number; teacherId?: number }) {
    const response = await apiClient.get<ScheduleListResponse>('/schedules', { params });
    return response.data.data.entries || [];
  },
};

