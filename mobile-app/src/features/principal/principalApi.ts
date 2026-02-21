import { apiClient } from '../../lib/api/client';
import { PrincipalAcademicOverview, PrincipalBudgetRequest } from './types';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const principalApi = {
  async getAcademicOverview(params?: { academicYearId?: number; semester?: 'ODD' | 'EVEN' }) {
    const response = await apiClient.get<ApiResponse<PrincipalAcademicOverview>>('/reports/principal-overview', {
      params: {
        academicYearId: params?.academicYearId,
        semester: params?.semester,
      },
    });
    return response.data.data;
  },
  async listBudgetApprovals(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiResponse<PrincipalBudgetRequest[]>>('/budget-requests', {
      params: {
        view: 'approver',
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data || [];
  },
  async updateBudgetRequestStatus(params: {
    id: number;
    status: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  }) {
    const response = await apiClient.patch<ApiResponse<PrincipalBudgetRequest>>(`/budget-requests/${params.id}/status`, {
      status: params.status,
      rejectionReason: params.rejectionReason,
    });
    return response.data.data;
  },
};
