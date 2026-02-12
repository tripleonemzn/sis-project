import api from './api';

export type ScheduleTimeConfig = {
  id: number;
  academicYearId: number;
  config: {
    periodTimes: Record<string, Record<number, string>>;
    periodNotes: Record<string, Record<number, string>>;
  };
  createdAt: string;
  updatedAt: string;
};

export const scheduleTimeConfigService = {
  getConfig: async (academicYearId?: number) => {
    const params = academicYearId ? { academicYearId } : {};
    const response = await api.get<{ success: boolean; data: ScheduleTimeConfig | null }>('/schedule-time-configs', { params });
    return response.data.data;
  },

  saveConfig: async (academicYearId: number, config: { periodTimes: Record<string, Record<number, string>>; periodNotes: Record<string, Record<number, string>> }) => {
    const response = await api.post('/schedule-time-configs', {
      academicYearId,
      config,
    });
    return response.data;
  },
};
