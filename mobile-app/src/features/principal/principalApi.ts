import { apiClient } from '../../lib/api/client';
import {
  PrincipalAcademicOverview,
  PrincipalBpBkSummaryResponse,
  PrincipalBudgetRequest,
  PrincipalDashboardSummary,
  PrincipalOfficeSummary,
  PrincipalProctorReportsResponse,
} from './types';

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
  async getDashboardSummary(params?: { academicYearId?: number; semester?: 'ODD' | 'EVEN' }) {
    const response = await apiClient.get<ApiResponse<PrincipalDashboardSummary>>(
      '/reports/principal-dashboard-summary',
      {
        params: {
          academicYearId: params?.academicYearId,
          semester: params?.semester,
        },
      },
    );
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
  async getProctorReports(params?: {
    academicYearId?: number;
    examType?: string;
    date?: string;
  }) {
    const response = await apiClient.get<ApiResponse<PrincipalProctorReportsResponse>>('/proctoring/reports', {
      params: {
        academicYearId: params?.academicYearId,
        examType: params?.examType,
        date: params?.date,
      },
    });
    return response.data.data;
  },
  async getBpBkSummary(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiResponse<PrincipalBpBkSummaryResponse>>('/bpbk/principal-summary', {
      params: {
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data;
  },
  async getOfficeSummary(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiResponse<PrincipalOfficeSummary>>('/office/summary', {
      params: {
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data;
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
