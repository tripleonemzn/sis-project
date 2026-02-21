import { apiClient } from '../../lib/api/client';
import {
  WorkProgramApprovalStatus,
  WorkProgramBudgetCreatePayload,
  WorkProgramBudgetLpjBundle,
  WorkProgramBudgetLpjInvoice,
  WorkProgramBudgetLpjItem,
  WorkProgramBudgetRequest,
  WorkProgramListResponse,
  WorkProgramRecord,
  WorkProgramUploadFile,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 50,
  total: 0,
  totalPages: 1,
};

function appendUploadFile(formData: FormData, field: string, file?: WorkProgramUploadFile | null) {
  if (!file?.uri) return;
  formData.append(field, {
    uri: file.uri,
    name: file.name || `${field}-upload`,
    type: file.mimeType || 'application/octet-stream',
  } as any);
}

export const workProgramApi = {
  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    academicYearId?: number;
    additionalDuty?: string;
    majorId?: number;
    semester?: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<ApiEnvelope<WorkProgramListResponse>>('/work-programs', {
      params: {
        page: params?.page,
        limit: params?.limit,
        search: params?.search,
        academicYearId: params?.academicYearId,
        additionalDuty: params?.additionalDuty,
        majorId: params?.majorId,
        semester: params?.semester,
      },
    });

    const data = response.data?.data;
    return {
      programs: Array.isArray(data?.programs) ? data.programs : [],
      pagination: data?.pagination || DEFAULT_PAGINATION,
    };
  },

  async listPendingApprovals() {
    const response = await apiClient.get<ApiEnvelope<WorkProgramRecord[]>>('/work-programs/pending');
    const data = response.data?.data;
    return Array.isArray(data) ? data : [];
  },

  async updateApprovalStatus(
    programId: number,
    payload: {
      status: WorkProgramApprovalStatus;
      feedback?: string;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<WorkProgramRecord>>(
      `/work-programs/${programId}/approval`,
      payload,
    );
    return response.data?.data;
  },

  async create(payload: {
    title: string;
    description?: string;
    academicYearId: number;
    additionalDuty: string;
    majorId?: number;
    semester: 'ODD' | 'EVEN';
    month: number;
    startWeek: number;
    endWeek: number;
    startMonth?: number;
    endMonth?: number;
  }) {
    const response = await apiClient.post<ApiEnvelope<WorkProgramRecord>>('/work-programs', payload);
    return response.data?.data;
  },

  async update(
    programId: number,
    payload: Partial<{
      title: string;
      description?: string;
      academicYearId: number;
      additionalDuty: string;
      majorId?: number;
      semester: 'ODD' | 'EVEN';
      month: number;
      startWeek: number;
      endWeek: number;
      startMonth?: number;
      endMonth?: number;
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<WorkProgramRecord>>(`/work-programs/${programId}`, payload);
    return response.data?.data;
  },

  async remove(programId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/work-programs/${programId}`);
    return response.data?.data;
  },

  async createItem(
    programId: number,
    payload: {
      description: string;
      targetDate?: string | null;
      note?: string | null;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<unknown>>(`/work-programs/${programId}/items`, payload);
    return response.data?.data;
  },

  async updateItem(
    itemId: number,
    payload: {
      description?: string;
      targetDate?: string | null;
      isCompleted?: boolean;
      note?: string | null;
    },
  ) {
    const response = await apiClient.put<ApiEnvelope<unknown>>(`/work-programs/items/${itemId}`, payload);
    return response.data?.data;
  },

  async removeItem(itemId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/work-programs/items/${itemId}`);
    return response.data?.data;
  },

  async listBudgetRequests(params?: {
    academicYearId?: number;
    additionalDuty?: string;
    view?: 'approver' | 'requester';
  }) {
    const response = await apiClient.get<ApiEnvelope<WorkProgramBudgetRequest[]>>('/budget-requests', {
      params: {
        academicYearId: params?.academicYearId,
        additionalDuty: params?.additionalDuty,
        view: params?.view,
      },
    });
    const data = response.data?.data;
    return Array.isArray(data) ? data : [];
  },

  async createBudgetRequest(payload: WorkProgramBudgetCreatePayload) {
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetRequest>>('/budget-requests', payload);
    return response.data?.data;
  },

  async removeBudgetRequest(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/budget-requests/${id}`);
    return response.data?.data;
  },

  async uploadBudgetLpjFile(id: number, file: WorkProgramUploadFile) {
    const formData = new FormData();
    appendUploadFile(formData, 'file', file);
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetRequest>>(
      `/budget-requests/${id}/lpj`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data?.data;
  },

  async listBudgetLpj(budgetRequestId: number) {
    const response = await apiClient.get<ApiEnvelope<WorkProgramBudgetLpjBundle>>('/budget-lpj', {
      params: { budgetRequestId },
    });
    return response.data?.data;
  },

  async createBudgetLpjInvoice(payload: { budgetRequestId: number; title?: string }) {
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetLpjInvoice>>('/budget-lpj/invoices', payload);
    return response.data?.data;
  },

  async createBudgetLpjItem(payload: {
    lpjInvoiceId: number;
    description: string;
    brand?: string;
    quantity: number;
    unitPrice: number;
  }) {
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetLpjItem>>('/budget-lpj/items', payload);
    return response.data?.data;
  },

  async removeBudgetLpjItem(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/budget-lpj/items/${id}`);
    return response.data?.data;
  },

  async uploadBudgetLpjInvoiceFile(invoiceId: number, file: WorkProgramUploadFile) {
    const formData = new FormData();
    appendUploadFile(formData, 'file', file);
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetLpjInvoice>>(
      `/budget-lpj/invoices/${invoiceId}/invoice-file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data?.data;
  },

  async uploadBudgetLpjProofFile(invoiceId: number, file: WorkProgramUploadFile) {
    const formData = new FormData();
    appendUploadFile(formData, 'file', file);
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetLpjInvoice>>(
      `/budget-lpj/invoices/${invoiceId}/proof-file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data?.data;
  },

  async submitBudgetLpjInvoice(invoiceId: number) {
    const response = await apiClient.post<ApiEnvelope<WorkProgramBudgetLpjInvoice>>(
      `/budget-lpj/invoices/${invoiceId}/submit`,
    );
    return response.data?.data;
  },
};
