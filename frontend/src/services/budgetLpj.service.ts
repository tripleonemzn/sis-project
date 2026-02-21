import api from './api';

export type LpjInvoiceStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_SARPRAS'
  | 'RETURNED'
  | 'APPROVED_BY_SARPRAS'
  | 'SENT_TO_FINANCE';

export interface BudgetLpjItem {
  id: number;
  lpjInvoiceId: number;
  description: string;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  isMatched?: boolean | null;
  auditNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetLpjInvoice {
  id: number;
  budgetRequestId: number;
  title?: string | null;
  status: LpjInvoiceStatus;
  invoiceFileUrl?: string | null;
  invoiceFileName?: string | null;
  invoiceFileSize?: number | null;
  invoiceMimeType?: string | null;
  proofFileUrl?: string | null;
  proofFileName?: string | null;
  proofFileSize?: number | null;
  proofMimeType?: string | null;
  auditReport?: string | null;
  auditReportAt?: string | null;
  submittedAt?: string | null;
  returnedAt?: string | null;
  approvedBySarprasAt?: string | null;
  sentToFinanceAt?: string | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  items: BudgetLpjItem[];
}

export interface ListLpjInvoicesResponse {
  budget: {
    id: number;
    requesterId: number;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    realizationConfirmedAt?: string | null;
  };
  invoices: BudgetLpjInvoice[];
}

export const budgetLpjService = {
  listForFinance: async () => {
    const response = await api.get('/budget-lpj/finance');
    return response.data;
  },

  listByBudgetRequest: async (budgetRequestId: number) => {
    const response = await api.get('/budget-lpj', { params: { budgetRequestId } });
    return response.data as { data: ListLpjInvoicesResponse };
  },

  createInvoice: async (payload: { budgetRequestId: number; title?: string }) => {
    const response = await api.post('/budget-lpj/invoices', payload);
    return response.data;
  },

  createItem: async (payload: {
    lpjInvoiceId: number;
    description: string;
    brand?: string;
    quantity: number;
    unitPrice: number;
  }) => {
    const response = await api.post('/budget-lpj/items', payload);
    return response.data;
  },

  updateItem: async (
    id: number,
    payload: {
      description?: string;
      brand?: string;
      quantity?: number;
      unitPrice?: number;
    },
  ) => {
    const response = await api.put(`/budget-lpj/items/${id}`, payload);
    return response.data;
  },

  deleteItem: async (id: number) => {
    const response = await api.delete(`/budget-lpj/items/${id}`);
    return response.data;
  },

  submitInvoiceToSarpras: async (id: number) => {
    const response = await api.post(`/budget-lpj/invoices/${id}/submit`);
    return response.data;
  },

  auditItem: async (
    id: number,
    payload: {
      isMatched: boolean;
      auditNote?: string;
    },
  ) => {
    const response = await api.post(`/budget-lpj/items/${id}/audit`, payload);
    return response.data;
  },

  saveAuditReport: async (invoiceId: number, payload: { auditReport: string }) => {
    const response = await api.post(
      `/budget-lpj/invoices/${invoiceId}/audit-report`,
      payload,
    );
    return response.data;
  },

  uploadInvoiceFile: async (invoiceId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
      `/budget-lpj/invoices/${invoiceId}/invoice-file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  uploadProofFile: async (invoiceId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
      `/budget-lpj/invoices/${invoiceId}/proof-file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  sarprasDecision: async (
    invoiceId: number,
    payload: { action: 'APPROVE' | 'RETURN' | 'SEND_TO_FINANCE' },
  ) => {
    const response = await api.post(
      `/budget-lpj/invoices/${invoiceId}/sarpras-decision`,
      payload,
    );
    return response.data;
  },
};
