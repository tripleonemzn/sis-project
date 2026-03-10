import api from './api';
import type { AcademicYear } from './academicYear.service';
import type { AdditionalDuty } from './workProgram.service';

export interface BudgetRequest {
  id: number;
  title: string;
  description: string;
  executionTime?: string;
  brand?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  requesterId: number;
  approverId?: number | null;
  academicYearId: number;
  additionalDuty: AdditionalDuty;
  workProgramId?: number;
  academicYear: AcademicYear;
  requester: {
    name: string;
    managedMajors?: {
      name: string;
    }[];
  };
  approver?: {
    id: number;
    name: string;
    role: string;
    additionalDuties?: AdditionalDuty[] | null;
  } | null;
  workProgram?: {
    id: number;
    title?: string | null;
    semester?: 'ODD' | 'EVEN' | null;
    major?: {
      name: string;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string | null;
  realizationConfirmedAt?: string | null;
  lpjFileUrl?: string | null;
  lpjFileName?: string | null;
  lpjFileSize?: number | null;
  lpjMimeType?: string | null;
  lpjSubmittedAt?: string | null;
}

export interface CreateBudgetRequestPayload {
  title: string;
  description: string;
  executionTime?: string;
  brand?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  academicYearId: number;
  additionalDuty: AdditionalDuty;
  workProgramId?: number;
}

export interface UpdateBudgetRequestStatusPayload {
  status: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

export interface ConfirmRealizationPayload {
  id: number;
}

export const budgetRequestService = {

  list: async (params?: {
    academicYearId?: number;
    additionalDuty?: AdditionalDuty;
    view?: 'approver' | 'requester';
  }) => {
    const response = await api.get('/budget-requests', { params });
    return response.data;
  },

  create: async (data: CreateBudgetRequestPayload) => {
    const response = await api.post('/budget-requests', data);
    return response.data;
  },

  remove: async (id: number) => {
    const response = await api.delete(`/budget-requests/${id}`);
    return response.data;
  },

  updateStatus: async (id: number, data: UpdateBudgetRequestStatusPayload) => {
    const response = await api.patch(`/budget-requests/${id}/status`, data);
    return response.data;
  },

  confirmRealization: async (id: number) => {
    const response = await api.patch(`/budget-requests/${id}/realization`);
    return response.data;
  },

  uploadLpj: async (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/budget-requests/${id}/lpj`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
