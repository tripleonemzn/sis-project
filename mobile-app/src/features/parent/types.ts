import { StudentAttendanceHistory } from '../attendance/types';

export type ParentChildDetail = {
  id: number;
  name: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  birthDate?: string | null;
  studentStatus?: string | null;
  verificationStatus?: string | null;
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

export type ParentChildLinkPayload = {
  nisn: string;
  birthDate: string;
};

export type ParentChildLookupResult = {
  student: ParentChildDetail;
  alreadyLinkedToCurrentParent: boolean;
  linkedParentCount: number;
  oneTimeWarning: string;
};

export type ParentAttendanceRecord = StudentAttendanceHistory;

export type ParentChildReportCard = {
  student: {
    id: number;
    name: string;
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
  reportGrades: Array<{
    id: number;
    finalScore: number;
    formatifScore?: number | null;
    sbtsScore?: number | null;
    sasScore?: number | null;
    subject?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  }>;
  reportNotes?: {
    id: number;
    note?: string | null;
    behaviorNote?: string | null;
    achievementNote?: string | null;
  } | null;
  attendanceSummary: {
    hadir: number;
    sakit: number;
    izin: number;
    alpha: number;
  };
  average: number;
};

export type ParentPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
export type ParentPaymentType = 'MONTHLY' | 'ONE_TIME';
export type ParentPaymentSource = 'DIRECT' | 'CREDIT_BALANCE';

export type ParentPaymentRecord = {
  id: number;
  paymentNo?: string | null;
  amount: number;
  allocatedAmount?: number;
  creditedAmount?: number;
  source?: ParentPaymentSource | null;
  status: ParentPaymentStatus;
  type: ParentPaymentType;
  method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER' | null;
  referenceNo?: string | null;
  invoiceId?: number | null;
  invoiceNo?: string | null;
  periodKey?: string | null;
  semester?: 'ODD' | 'EVEN' | null;
  createdAt: string;
  updatedAt: string;
};

export type ParentChildFinanceSummary = {
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

export type ParentChildFinanceOverview = {
  student: ParentChildDetail;
  summary: ParentChildFinanceSummary;
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
  payments: ParentPaymentRecord[];
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
};

export type ParentFinanceOverview = {
  parent: {
    id: number;
    name: string;
    username: string;
  };
  summary: {
    childCount: number;
    totalRecords: number;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    partialAmount: number;
    cancelledAmount: number;
    overdueCount: number;
    overdueAmount: number;
    monthlyAmount: number;
    oneTimeAmount: number;
    creditBalanceAmount: number;
  };
  children: ParentChildFinanceOverview[];
};
