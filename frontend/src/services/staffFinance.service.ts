import api from './api';

export type FinanceComponentPeriodicity = 'MONTHLY' | 'ONE_TIME' | 'PERIODIC';
export type FinanceInvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type FinancePaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
export type SemesterCode = 'ODD' | 'EVEN';
export type FinanceReminderMode = 'ALL' | 'DUE_SOON' | 'OVERDUE';

export interface FinanceComponent {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  periodicity: FinanceComponentPeriodicity;
  isActive: boolean;
}

export interface FinanceTariffRule {
  id: number;
  componentId: number;
  academicYearId?: number | null;
  majorId?: number | null;
  classId?: number | null;
  semester?: SemesterCode | null;
  gradeLevel?: string | null;
  amount: number;
  isActive: boolean;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  notes?: string | null;
  component?: {
    id: number;
    code: string;
    name: string;
    periodicity: FinanceComponentPeriodicity;
  };
  academicYear?: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  class?: {
    id: number;
    name: string;
    level: string;
  } | null;
  major?: {
    id: number;
    name: string;
    code: string;
  } | null;
}

export interface FinanceInvoice {
  id: number;
  invoiceNo: string;
  studentId: number;
  academicYearId?: number | null;
  semester: SemesterCode;
  periodKey: string;
  title?: string | null;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: FinanceInvoiceStatus;
  student: {
    id: number;
    name: string;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
      level: string;
    } | null;
  };
  items: Array<{
    id: number;
    componentId?: number | null;
    componentCode?: string | null;
    componentName: string;
    amount: number;
    notes?: string | null;
  }>;
  payments: Array<{
    id: number;
    paymentNo: string;
    amount: number;
    method: FinancePaymentMethod;
    referenceNo?: string | null;
    paidAt: string;
  }>;
}

export type FinanceInvoiceGenerationDetailStatus =
  | 'READY_CREATE'
  | 'READY_UPDATE'
  | 'SKIPPED_NO_TARIFF'
  | 'SKIPPED_EXISTS'
  | 'SKIPPED_LOCKED_PAID'
  | 'CREATED'
  | 'UPDATED';

export interface FinanceInvoiceGenerationDetail {
  studentId: number;
  studentName: string;
  className: string;
  majorName?: string | null;
  gradeLevel?: string | null;
  status: FinanceInvoiceGenerationDetailStatus;
  invoiceId?: number | null;
  invoiceNo?: string | null;
  totalAmount: number;
  itemCount: number;
  componentNames: string[];
  items: Array<{
    componentId: number;
    componentCode: string;
    componentName: string;
    amount: number;
    notes?: string | null;
  }>;
  reason?: string | null;
}

export interface FinanceInvoiceGenerationResult {
  academicYearId: number;
  semester: SemesterCode;
  periodKey: string;
  filters: {
    classId: number | null;
    majorId: number | null;
    gradeLevel: string | null;
    replaceExisting: boolean;
    selectedStudentCount: number;
    selectionMode: 'FILTERS' | 'EXPLICIT_STUDENTS';
  };
  summary: {
    totalTargetStudents: number;
    created: number;
    updated: number;
    skippedNoTariff: number;
    skippedExisting: number;
    skippedLocked: number;
    totalProjectedAmount: number;
  };
  details: FinanceInvoiceGenerationDetail[];
}

export interface FinanceReportSummary {
  totalInvoices: number;
  totalStudents: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  cancelledCount: number;
  overdueInvoices: number;
  overdueOutstanding: number;
}

export interface FinanceMonthlyRecapRow {
  periodKey: string;
  invoiceCount: number;
  studentCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  cancelledCount: number;
  overdueCount: number;
  overdueOutstanding: number;
}

export interface FinanceClassRecapRow {
  classId: number | null;
  className: string;
  invoiceCount: number;
  studentCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueOutstanding: number;
}

export interface FinanceAgingPiutangRow {
  key: 'CURRENT' | 'DUE_1_30' | 'DUE_31_60' | 'DUE_61_90' | 'DUE_OVER_90';
  label: string;
  invoiceCount: number;
  totalOutstanding: number;
}

export interface FinanceDetailRow {
  invoiceNo: string;
  studentName: string;
  username: string;
  nis: string;
  nisn: string;
  className: string;
  periodKey: string;
  semester: string;
  dueDate: string | null;
  status: FinanceInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  daysPastDue: number;
  agingLabel: string;
  isOverdue: boolean;
  title: string;
  issuedAt: string | null;
}

export type FinanceCollectionPriority = 'MONITOR' | 'TINGGI' | 'KRITIS';

export interface FinanceCollectionQueueRow {
  studentId: number;
  studentName: string;
  username: string;
  nis: string;
  className: string;
  phone?: string | null;
  totalOutstanding: number;
  overdueOutstanding: number;
  openInvoices: number;
  overdueInvoices: number;
  maxDaysPastDue: number;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  priority: FinanceCollectionPriority;
}

export interface FinanceDueSoonInvoiceRow {
  invoiceId: number;
  invoiceNo: string;
  studentId: number;
  studentName: string;
  className: string;
  dueDate: string | null;
  balanceAmount: number;
  daysUntilDue: number;
  status: FinanceInvoiceStatus;
  semester: SemesterCode;
  periodKey: string;
  title: string;
}

export interface FinanceComponentReceivableRow {
  componentCode: string;
  componentName: string;
  invoiceCount: number;
  studentCount: number;
  totalAmount: number;
  totalOutstanding: number;
  overdueOutstanding: number;
}

export interface FinanceReportSnapshot {
  filters: {
    academicYearId: number | null;
    semester: SemesterCode | null;
    classId: number | null;
    periodFrom: string | null;
    periodTo: string | null;
    asOfDate: string | null;
  };
  summary: FinanceReportSummary;
  kpi: {
    collectionRate: number;
    dsoDays: number;
    overdueRate: number;
    windowDays: number;
  };
  monthlyRecap: FinanceMonthlyRecapRow[];
  classRecap: FinanceClassRecapRow[];
  agingPiutang: FinanceAgingPiutangRow[];
  paymentDailyTrend: Array<{
    date: string;
    paymentCount: number;
    totalPaid: number;
  }>;
  detailRows: FinanceDetailRow[];
  collectionOverview: {
    studentsWithOutstanding: number;
    criticalCount: number;
    highPriorityCount: number;
    dueSoonCount: number;
    dueSoonOutstanding: number;
  };
  collectionPriorityQueue: FinanceCollectionQueueRow[];
  dueSoonInvoices: FinanceDueSoonInvoiceRow[];
  componentReceivableRecap: FinanceComponentReceivableRow[];
}

export interface FinanceReportQueryParams {
  academicYearId?: number;
  semester?: SemesterCode;
  classId?: number;
  periodFrom?: string;
  periodTo?: string;
  asOfDate?: string;
}

interface ApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

export const staffFinanceService = {
  async listComponents(params?: { isActive?: boolean; search?: string }) {
    const response = await api.get<ApiResponse<{ components: FinanceComponent[] }>>('/payments/components', {
      params,
    });
    return response.data.data.components || [];
  },

  async createComponent(payload: {
    code: string;
    name: string;
    description?: string;
    periodicity: FinanceComponentPeriodicity;
  }) {
    const response = await api.post<ApiResponse<{ component: FinanceComponent }>>('/payments/components', payload);
    return response.data.data.component;
  },

  async updateComponent(
    componentId: number,
    payload: Partial<{
      code: string;
      name: string;
      description: string;
      periodicity: FinanceComponentPeriodicity;
      isActive: boolean;
    }>,
  ) {
    const response = await api.patch<ApiResponse<{ component: FinanceComponent }>>(
      `/payments/components/${componentId}`,
      payload,
    );
    return response.data.data.component;
  },

  async listTariffs(params?: {
    componentId?: number;
    academicYearId?: number;
    classId?: number;
    majorId?: number;
    semester?: SemesterCode;
    isActive?: boolean;
  }) {
    const response = await api.get<ApiResponse<{ tariffs: FinanceTariffRule[] }>>('/payments/tariffs', {
      params,
    });
    return response.data.data.tariffs || [];
  },

  async createTariff(payload: {
    componentId: number;
    academicYearId?: number;
    classId?: number;
    majorId?: number;
    semester?: SemesterCode;
    gradeLevel?: string;
    amount: number;
    effectiveStart?: string;
    effectiveEnd?: string;
    notes?: string;
  }) {
    const response = await api.post<ApiResponse<{ tariff: FinanceTariffRule }>>('/payments/tariffs', payload);
    return response.data.data.tariff;
  },

  async updateTariff(
    tariffId: number,
    payload: Partial<{
      componentId: number;
      academicYearId: number | null;
      classId: number | null;
      majorId: number | null;
      semester: SemesterCode | null;
      gradeLevel: string | null;
      amount: number;
      effectiveStart: string | null;
      effectiveEnd: string | null;
      notes: string | null;
      isActive: boolean;
    }>,
  ) {
    const response = await api.patch<ApiResponse<{ tariff: FinanceTariffRule }>>(
      `/payments/tariffs/${tariffId}`,
      payload,
    );
    return response.data.data.tariff;
  },

  async generateInvoices(payload: {
    academicYearId?: number;
    semester: SemesterCode;
    periodKey: string;
    dueDate?: string;
    title?: string;
    classId?: number;
    majorId?: number;
    gradeLevel?: string;
    studentIds?: number[];
    replaceExisting?: boolean;
  }) {
    const response = await api.post<ApiResponse<FinanceInvoiceGenerationResult>>(
      '/payments/invoices/generate',
      payload,
    );
    return response.data.data;
  },

  async previewInvoices(payload: {
    academicYearId?: number;
    semester: SemesterCode;
    periodKey: string;
    dueDate?: string;
    title?: string;
    classId?: number;
    majorId?: number;
    gradeLevel?: string;
    studentIds?: number[];
    replaceExisting?: boolean;
  }) {
    const response = await api.post<ApiResponse<FinanceInvoiceGenerationResult>>(
      '/payments/invoices/preview',
      payload,
    );
    return response.data.data;
  },

  async listInvoices(params?: {
    academicYearId?: number;
    semester?: SemesterCode;
    classId?: number;
    studentId?: number;
    status?: FinanceInvoiceStatus;
    search?: string;
    limit?: number;
  }) {
    const response = await api.get<ApiResponse<{
      invoices: FinanceInvoice[];
      summary: {
        totalInvoices: number;
        totalAmount: number;
        totalPaid: number;
        totalOutstanding: number;
        unpaid: number;
        partial: number;
        paid: number;
        cancelled: number;
      };
    }>>('/payments/invoices', {
      params,
    });

    return response.data.data;
  },

  async listReports(params?: FinanceReportQueryParams) {
    const response = await api.get<ApiResponse<FinanceReportSnapshot>>('/payments/reports', { params });
    return response.data.data;
  },

  async exportReports(
    params: FinanceReportQueryParams & {
      format: 'csv' | 'xlsx';
      reportType?: 'all' | 'monthly' | 'class' | 'aging' | 'detail' | 'trend';
    },
  ) {
    const response = await api.get<Blob>('/payments/reports/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  async dispatchDueReminders(payload?: {
    dueSoonDays?: number;
    mode?: FinanceReminderMode;
    preview?: boolean;
  }) {
    const response = await api.post<
      ApiResponse<{
        checkedInvoices: number;
        targetedRecipients: number;
        dueSoonInvoices: number;
        overdueInvoices: number;
        createdNotifications: number;
        previewNotifications: number;
        skippedAlreadyNotified: number;
        dueSoonDays: number;
        mode: FinanceReminderMode;
        preview: boolean;
        runAt: string;
      }>
    >('/payments/reminders/dispatch', payload || {});
    return response.data.data;
  },

  async payInvoice(
    invoiceId: number,
    payload: {
      amount: number;
      method: FinancePaymentMethod;
      referenceNo?: string;
      note?: string;
      paidAt?: string;
    },
  ) {
    const response = await api.post<ApiResponse<{
      payment: {
        id: number;
        paymentNo: string;
        amount: number;
        method: FinancePaymentMethod;
      };
      invoice: FinanceInvoice;
    }>>(`/payments/invoices/${invoiceId}/payments`, payload);

    return response.data.data;
  },
};
