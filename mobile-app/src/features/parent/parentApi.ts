import { apiClient } from '../../lib/api/client';
import {
  ParentAttendanceRecord,
  ParentChildDetail,
  ParentChildLinkPayload,
  ParentChildLookupResult,
  ParentChildReportCard,
  ParentFinanceOverview,
  ParentFinancePaymentSubmissionPayload,
  ParentFinancePortalBankAccount,
} from './types';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

export const parentApi = {
  async getMyChildren() {
    const response = await apiClient.get<ApiResponse<ParentChildDetail[]>>('/users/me/children');
    return response.data.data || [];
  },
  async lookupMyChild(nisn: string) {
    const response = await apiClient.get<ApiResponse<ParentChildLookupResult>>('/users/me/children/lookup', {
      params: { nisn },
    });
    return response.data.data;
  },
  async getChildById(childId: number) {
    const response = await apiClient.get<ApiResponse<ParentChildDetail>>(`/users/${childId}`);
    return response.data.data;
  },
  async getChildrenByIds(childIds: number[]) {
    if (!childIds.length) return [];
    const results = await Promise.all(childIds.map((id) => parentApi.getChildById(id)));
    return results;
  },
  async linkMyChild(payload: ParentChildLinkPayload) {
    const response = await apiClient.post<ApiResponse<ParentChildDetail[]>>('/users/me/children/link', payload);
    return response.data;
  },
  async unlinkMyChild(childId: number) {
    const response = await apiClient.delete<ApiResponse<ParentChildDetail[]>>(`/users/me/children/${childId}`);
    return response.data;
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
  async getPortalBankAccounts() {
    const response = await apiClient.get<ApiResponse<{ accounts: ParentFinancePortalBankAccount[] }>>(
      '/payments/portal-bank-accounts',
    );
    return response.data.data.accounts || [];
  },
  async uploadPaymentProof(file: { uri: string; name?: string; type?: string }) {
    const formData = new FormData();
    const filePart: ReactNativeFilePart = {
      uri: file.uri,
      name: file.name || 'payment-proof.jpg',
      type: file.type || 'application/octet-stream',
    };
    formData.append('file', filePart as unknown as Blob);
    const response = await apiClient.post<
      ApiResponse<{
        url: string;
        filename: string;
        originalname: string;
        mimetype: string;
        size: number;
      }>
    >('/upload/finance-proof', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },
  async submitPayment(payload: ParentFinancePaymentSubmissionPayload) {
    const response = await apiClient.post<ApiResponse<{ payment: ParentFinanceOverview['children'][number]['payments'][number] }>>(
      `/payments/invoices/${payload.invoiceId}/portal-submissions`,
      {
        amount: payload.amount,
        method: payload.method,
        bankAccountId: payload.bankAccountId,
        referenceNo: payload.referenceNo,
        note: payload.note,
        paidAt: payload.paidAt,
        proofFileUrl: payload.proofFileUrl,
        proofFileName: payload.proofFileName,
        proofMimeType: payload.proofFileMimeType,
        proofFileSize: payload.proofFileSize,
      },
    );
    return response.data.data.payment;
  },
};
