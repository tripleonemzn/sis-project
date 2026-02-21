import { apiClient } from '../../lib/api/client';
import { StaffBudgetRequest, StaffStudent } from './types';

type ApiListResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T[];
};

type ApiSingleResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const staffApi = {
  async listBudgetRequests(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiListResponse<StaffBudgetRequest>>('/budget-requests', {
      params: {
        view: 'approver',
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data || [];
  },
  async confirmBudgetRealization(id: number) {
    const response = await apiClient.patch<ApiSingleResponse<StaffBudgetRequest>>(`/budget-requests/${id}/realization`);
    return response.data.data;
  },
  async listStudents() {
    const response = await apiClient.get<ApiListResponse<StaffStudent>>('/users', {
      params: {
        role: 'STUDENT',
      },
    });
    return response.data.data || [];
  },
};
