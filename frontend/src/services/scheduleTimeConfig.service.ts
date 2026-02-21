import api from './api';

export type PeriodType = 'TEACHING' | 'UPACARA' | 'ISTIRAHAT' | 'TADARUS' | 'OTHER';

export type ScheduleTimeConfigPayload = {
  periodTimes: Record<string, Record<number, string>>;
  periodNotes: Record<string, Record<number, string>>;
  periodTypes?: Record<string, Record<number, PeriodType>>;
};

export type ScheduleTimeConfig = {
  id: number;
  academicYearId: number;
  config: ScheduleTimeConfigPayload;
  createdAt: string;
  updatedAt: string;
};

export const scheduleTimeConfigService = {
  getConfig: async (academicYearId?: number) => {
    const params = academicYearId ? { academicYearId } : {};
    const response = await api.get<{ success: boolean; data: ScheduleTimeConfig | null }>('/schedule-time-configs', { params });
    return response.data.data;
  },

  saveConfig: async (academicYearId: number, config: ScheduleTimeConfigPayload) => {
    const response = await api.post('/schedule-time-configs', {
      academicYearId,
      config,
    });
    return response.data;
  },
};
