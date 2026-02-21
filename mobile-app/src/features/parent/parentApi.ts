import { apiClient } from '../../lib/api/client';
import { ParentAttendanceRecord, ParentChildDetail, ParentChildReportCard, ParentFinanceOverview } from './types';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const parentApi = {
  async getChildById(childId: number) {
    const response = await apiClient.get<ApiResponse<ParentChildDetail>>(`/users/${childId}`);
    return response.data.data;
  },
  async getChildrenByIds(childIds: number[]) {
    if (!childIds.length) return [];
    const results = await Promise.all(childIds.map((id) => parentApi.getChildById(id)));
    return results;
  },
  async getChildAttendanceHistory(params: { childId: number; month: number; year: number }) {
    const response = await apiClient.get<ApiResponse<ParentAttendanceRecord[]>>('/attendances/student-history', {
      params: {
        month: params.month,
        year: params.year,
        student_id: params.childId,
      },
    });
    return response.data.data || [];
  },
  async getChildReportCard(params: {
    childId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<ApiResponse<ParentChildReportCard>>('/grades/report-card', {
      params: {
        student_id: params.childId,
        academic_year_id: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data.data;
  },
  async getParentFinanceOverview(params?: { childId?: number | null; limit?: number }) {
    const response = await apiClient.get<ApiResponse<ParentFinanceOverview>>('/payments/parent-overview', {
      params: {
        student_id: params?.childId ?? undefined,
        limit: params?.limit,
      },
    });
    return response.data.data;
  },
};
