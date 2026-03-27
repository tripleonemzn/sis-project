import api from './api';

export type StudentPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
export type StudentPaymentType = 'MONTHLY' | 'ONE_TIME';
export type StudentPaymentSource = 'DIRECT' | 'CREDIT_BALANCE';

export interface FinancePortalBankAccount {
  id: number;
  code: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  label: string;
}

export interface FinancePaymentProofFile {
  url: string;
  name?: string | null;
  mimetype?: string | null;
  size?: number | null;
}

export interface StudentFinancePaymentSubmissionPayload {
  invoiceId: number;
  amount: number;
  method: 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER';
  bankAccountId?: number;
  referenceNo?: string;
  note?: string;
  paidAt?: string;
  proofFileUrl: string;
  proofFileName?: string;
  proofMimeType?: string;
  proofFileSize?: number;
}

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
    creditBalance: number;
  };
  actionCenter: {
    state:
      | 'NO_INVOICE'
      | 'OVERDUE'
      | 'LATE_FEE_WARNING'
      | 'DUE_SOON'
      | 'CREDIT_AVAILABLE'
      | 'UP_TO_DATE';
    headline: string;
    detail: string;
    overdueInvoiceCount: number;
    overdueAmount: number;
    overdueInstallmentCount: number;
    overdueInstallmentAmount: number;
    pendingLateFeeAmount: number;
    appliedLateFeeAmount: number;
    creditBalanceAmount: number;
    latestPaymentAt?: string | null;
    latestRefund?: {
      refundNo: string;
      amount: number;
      refundedAt: string;
      method: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
      referenceNo?: string | null;
      note?: string | null;
    } | null;
    nextDue?: {
      invoiceId: number;
      invoiceNo: string;
      title?: string | null;
      dueDate?: string | null;
      balanceAmount: number;
      installmentSequence?: number | null;
      daysUntilDue?: number | null;
      isOverdue: boolean;
    } | null;
  };
  payments: Array<{
    id: number;
    paymentNo?: string | null;
    amount: number;
    allocatedAmount?: number;
    creditedAmount?: number;
    reversedAmount?: number;
    reversedAllocatedAmount?: number;
    reversedCreditedAmount?: number;
    source?: StudentPaymentSource | null;
    status: StudentPaymentStatus;
    type: StudentPaymentType;
    method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER' | null;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
    verificationNote?: string | null;
    verifiedAt?: string | null;
    referenceNo?: string | null;
    invoiceId?: number | null;
    invoiceNo?: string | null;
    periodKey?: string | null;
    semester?: 'ODD' | 'EVEN' | null;
    proofFile?: FinancePaymentProofFile | null;
    createdBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
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
    installments: Array<{
      sequence: number;
      amount: number;
      dueDate?: string | null;
      paidAmount: number;
      balanceAmount: number;
      status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
      isOverdue: boolean;
      daysPastDue: number;
    }>;
    installmentSummary: {
      totalCount: number;
      paidCount: number;
      overdueCount: number;
      overdueAmount: number;
      nextInstallment: {
        sequence: number;
        amount: number;
        dueDate?: string | null;
        paidAmount: number;
        balanceAmount: number;
        status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
        isOverdue: boolean;
        daysPastDue: number;
      } | null;
    };
    lateFeeSummary?: {
      configured: boolean;
      hasPending: boolean;
      overdueInstallmentCount: number;
      calculatedAmount: number;
      appliedAmount: number;
      pendingAmount: number;
      asOfDate: string;
    };
  }>;
  creditBalance: {
    balanceAmount: number;
    updatedAt?: string | null;
    refunds: Array<{
      id: number;
      refundNo: string;
      amount: number;
      method: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
      refundedAt: string;
      referenceNo?: string | null;
      note?: string | null;
      createdAt: string;
    }>;
  };
}

export const studentFinanceService = {
  async getOverview(params?: { limit?: number }) {
    const response = await api.get<ApiResponse<StudentFinanceOverview>>('/payments/student-overview', {
      params,
    });
    return response.data.data;
  },
  async getPortalBankAccounts() {
    const response = await api.get<ApiResponse<{ accounts: FinancePortalBankAccount[] }>>(
      '/payments/portal-bank-accounts',
    );
    return response.data.data.accounts || [];
  },
  async submitPayment(payload: StudentFinancePaymentSubmissionPayload) {
    const response = await api.post<ApiResponse<{ payment: StudentFinanceOverview['payments'][number] }>>(
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
        proofMimeType: payload.proofMimeType,
        proofFileSize: payload.proofFileSize,
      },
    );
    return response.data.data.payment;
  },
};
