import api from './api';
import type { AcademicYear } from './academicYear.service';
import type { AdditionalDuty } from './workProgram.service';

export interface BudgetRequest {
  id: number;
  description: string;
  executionTime?: string;
  brand?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requesterId: number;
  academicYearId: number;
  additionalDuty: AdditionalDuty;
  workProgramId?: number;
  academicYear: AcademicYear;
  requester: { name: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetRequestPayload {
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

export const budgetRequestService = {
  list: async (params?: {
    academicYearId?: number;
    additionalDuty?: AdditionalDuty;
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
};
