import { apiClient } from '../../lib/api/client';
import {
  SarprasBudgetLpjBundle,
  SarprasBudgetRequest,
  SarprasInventoryItem,
  SarprasLibraryBookLoan,
  SarprasLibraryClassOption,
  SarprasLibraryLoanSettings,
  SarprasLpjInvoice,
  SarprasLpjItem,
  SarprasRoom,
  SarprasRoomCategory,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const sarprasApi = {
  async listRoomCategories() {
    const response = await apiClient.get<ApiEnvelope<SarprasRoomCategory[]>>('/inventory/categories');
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createRoomCategory(payload: { name: string; description?: string; inventoryTemplateKey?: string }) {
    const response = await apiClient.post<ApiEnvelope<SarprasRoomCategory>>('/inventory/categories', payload);
    return response.data?.data;
  },

  async updateRoomCategory(
    categoryId: number,
    payload: Partial<{ name: string; description: string; inventoryTemplateKey: string }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<SarprasRoomCategory>>(`/inventory/categories/${categoryId}`, payload);
    return response.data?.data;
  },

  async removeRoomCategory(categoryId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/inventory/categories/${categoryId}`);
    return response.data?.success;
  },

  async listRooms(params?: { categoryId?: number }) {
    const response = await apiClient.get<ApiEnvelope<SarprasRoom[]>>('/inventory/rooms', {
      params: {
        categoryId: params?.categoryId,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createRoom(payload: {
    categoryId: number;
    name: string;
    capacity?: number;
    location?: string;
    condition?: string;
    description?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<SarprasRoom>>('/inventory/rooms', payload);
    return response.data?.data;
  },

  async updateRoom(
    roomId: number,
    payload: Partial<{
      categoryId: number;
      name: string;
      capacity: number;
      location: string;
      condition: string;
      description: string;
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<SarprasRoom>>(`/inventory/rooms/${roomId}`, payload);
    return response.data?.data;
  },

  async removeRoom(roomId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/inventory/rooms/${roomId}`);
    return response.data?.success;
  },

  async listInventoryByRoom(roomId: number) {
    const response = await apiClient.get<ApiEnvelope<SarprasInventoryItem[]>>(`/inventory/rooms/${roomId}/inventory`);
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createInventory(payload: {
    roomId: number;
    name: string;
    code?: string;
    brand?: string;
    quantity?: number;
    goodQty: number;
    minorDamageQty: number;
    majorDamageQty: number;
    purchaseDate?: string;
    price?: number;
    source?: string;
    description?: string;
    attributes?: Record<string, unknown>;
  }) {
    const response = await apiClient.post<ApiEnvelope<SarprasInventoryItem>>('/inventory/inventory', payload);
    return response.data?.data;
  },

  async updateInventory(
    itemId: number,
    payload: Partial<{
      name: string;
      code: string;
      brand: string;
      quantity: number;
      goodQty: number;
      minorDamageQty: number;
      majorDamageQty: number;
      purchaseDate: string;
      price: number;
      source: string;
      description: string;
      attributes: Record<string, unknown>;
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<SarprasInventoryItem>>(`/inventory/inventory/${itemId}`, payload);
    return response.data?.data;
  },

  async removeInventory(itemId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/inventory/inventory/${itemId}`);
    return response.data?.success;
  },

  async listLibraryLoanClassOptions() {
    const response = await apiClient.get<ApiEnvelope<SarprasLibraryClassOption[]>>('/inventory/library-loans/classes');
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async listLibraryBookLoans(params?: { q?: string }) {
    const response = await apiClient.get<ApiEnvelope<SarprasLibraryBookLoan[]>>('/inventory/library-loans', {
      params: {
        q: params?.q || undefined,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async getLibraryLoanSettings() {
    const response = await apiClient.get<ApiEnvelope<SarprasLibraryLoanSettings>>('/inventory/library-loans/settings');
    return response.data?.data;
  },

  async updateLibraryLoanSettings(payload: { finePerDay: number }) {
    const response = await apiClient.put<ApiEnvelope<SarprasLibraryLoanSettings>>(
      '/inventory/library-loans/settings',
      payload,
    );
    return response.data?.data;
  },

  async createLibraryBookLoan(payload: {
    borrowDate: string;
    borrowerName: string;
    borrowerStatus: 'TEACHER' | 'STUDENT';
    classId?: number | null;
    bookTitle: string;
    publishYear?: number;
    returnDate?: string | null;
    returnStatus?: 'RETURNED' | 'NOT_RETURNED';
    phoneNumber?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<SarprasLibraryBookLoan>>('/inventory/library-loans', payload);
    return response.data?.data;
  },

  async updateLibraryBookLoan(
    loanId: number,
    payload: Partial<{
      borrowDate: string;
      borrowerName: string;
      borrowerStatus: 'TEACHER' | 'STUDENT';
      classId: number | null;
      bookTitle: string;
      publishYear: number;
      returnDate: string | null;
      returnStatus: 'RETURNED' | 'NOT_RETURNED';
      phoneNumber: string;
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<SarprasLibraryBookLoan>>(`/inventory/library-loans/${loanId}`, payload);
    return response.data?.data;
  },

  async removeLibraryBookLoan(loanId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/inventory/library-loans/${loanId}`);
    return response.data?.success;
  },

  async listBudgetApprovals(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<SarprasBudgetRequest[]>>('/budget-requests', {
      params: {
        view: 'approver',
        academicYearId: params?.academicYearId,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async updateBudgetRequestStatus(params: {
    id: number;
    status: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  }) {
    const response = await apiClient.patch<ApiEnvelope<SarprasBudgetRequest>>(
      `/budget-requests/${params.id}/status`,
      {
        status: params.status,
        rejectionReason: params.rejectionReason,
      },
    );
    return response.data?.data;
  },

  async listBudgetLpjByBudgetRequest(budgetRequestId: number) {
    const response = await apiClient.get<ApiEnvelope<SarprasBudgetLpjBundle>>('/budget-lpj', {
      params: { budgetRequestId },
    });
    return response.data?.data;
  },

  async auditBudgetLpjItem(params: { id: number; isMatched: boolean; auditNote?: string }) {
    const response = await apiClient.post<ApiEnvelope<SarprasLpjItem>>(`/budget-lpj/items/${params.id}/audit`, {
      isMatched: params.isMatched,
      auditNote: params.auditNote,
    });
    return response.data?.data;
  },

  async saveBudgetLpjAuditReport(params: { invoiceId: number; auditReport: string }) {
    const response = await apiClient.post<ApiEnvelope<SarprasLpjInvoice>>(
      `/budget-lpj/invoices/${params.invoiceId}/audit-report`,
      { auditReport: params.auditReport },
    );
    return response.data?.data;
  },

  async sarprasDecisionOnBudgetLpj(params: {
    invoiceId: number;
    action: 'APPROVE' | 'RETURN' | 'SEND_TO_FINANCE';
  }) {
    const response = await apiClient.post<ApiEnvelope<SarprasLpjInvoice>>(
      `/budget-lpj/invoices/${params.invoiceId}/sarpras-decision`,
      { action: params.action },
    );
    return response.data?.data;
  },
};
