import { apiClient } from '../../lib/api/client';
import { AttendanceRecapPayload } from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const attendanceRecapApi = {
  async getDailyRecap(params: { classId: number; academicYearId?: number; semester?: 'ALL' | 'ODD' | 'EVEN' }) {
    const response = await apiClient.get<ApiEnvelope<AttendanceRecapPayload>>('/attendances/daily/recap', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data.data;
  },
};
