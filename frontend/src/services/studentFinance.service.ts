import api from './api';

export type StudentPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
export type StudentPaymentType = 'MONTHLY' | 'ONE_TIME';

interface ApiResponse<T> {
  data: T;
  success?: boolean;
  message?: string;
}

export interface StudentFinanceOverview {
  student: {
    id: number;
    name: string;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
      major?: {
        id: number;
        name: string;
        code?: string | null;
      } | null;
    } | null;
  };
  summary: {
    totalRecords: number;
    totalAmount: number;
    overdueCount: number;
    overdueAmount: number;
    status: {
      pendingCount: number;
      pendingAmount: number;
      paidCount: number;
      paidAmount: number;
      partialCount: number;
      partialAmount: number;
      cancelledCount: number;
      cancelledAmount: number;
    };
    type: {
      monthlyCount: number;
      monthlyAmount: number;
      oneTimeCount: number;
      oneTimeAmount: number;
    };
  };
  payments: Array<{
    id: number;
    amount: number;
    status: StudentPaymentStatus;
    type: StudentPaymentType;
    createdAt: string;
    updatedAt: string;
  }>;
  invoices: Array<{
    id: number;
    invoiceNo: string;
    title?: string | null;
    periodKey: string;
    semester: 'ODD' | 'EVEN';
    dueDate?: string | null;
    status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    isOverdue: boolean;
    daysPastDue: number;
    items: Array<{
      componentCode?: string | null;
      componentName: string;
      amount: number;
      periodicity?: 'MONTHLY' | 'ONE_TIME' | 'PERIODIC' | null;
    }>;
  }>;
}

export const studentFinanceService = {
  async getOverview(params?: { limit?: number }) {
    const response = await api.get<ApiResponse<StudentFinanceOverview>>('/payments/student-overview', {
      params,
    });
    return response.data.data;
  },
};
