import { apiClient } from '../../lib/api/client';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type SemesterCode = 'ODD' | 'EVEN';
export type FinanceComponentPeriodicity = 'MONTHLY' | 'ONE_TIME' | 'PERIODIC';
export type FinanceInvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type FinancePaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
export type FinanceReminderMode = 'ALL' | 'DUE_SOON' | 'OVERDUE';

export type StaffFinanceComponent = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  periodicity: FinanceComponentPeriodicity;
  isActive: boolean;
};

export type StaffFinanceTariffRule = {
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
  academicYear?: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
};

export type StaffFinanceInvoice = {
  id: number;
  invoiceNo: string;
  studentId: number;
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
    studentClass?: {
      id: number;
      name: string;
      level: string;
    } | null;
  };
};

export type StaffFinanceInvoiceGenerationDetailStatus =
  | 'READY_CREATE'
  | 'READY_UPDATE'
  | 'SKIPPED_NO_TARIFF'
  | 'SKIPPED_EXISTS'
  | 'SKIPPED_LOCKED_PAID'
  | 'CREATED'
  | 'UPDATED';

export type StaffFinanceInvoiceGenerationDetail = {
  studentId: number;
  studentName: string;
  className: string;
  majorName?: string | null;
  gradeLevel?: string | null;
  status: StaffFinanceInvoiceGenerationDetailStatus;
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
};

export type StaffFinanceInvoiceGenerationResult = {
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
  details: StaffFinanceInvoiceGenerationDetail[];
};

export type StaffFinanceInvoiceListResult = {
  invoices: StaffFinanceInvoice[];
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
};

export type StaffFinanceReportSnapshot = {
  summary: {
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
  };
  kpi: {
    collectionRate: number;
    dsoDays: number;
    overdueRate: number;
    windowDays: number;
  };
  collectionOverview: {
    studentsWithOutstanding: number;
    criticalCount: number;
    highPriorityCount: number;
    dueSoonCount: number;
    dueSoonOutstanding: number;
  };
  collectionPriorityQueue: Array<{
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
    priority: 'MONITOR' | 'TINGGI' | 'KRITIS';
  }>;
  dueSoonInvoices: Array<{
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
  }>;
  componentReceivableRecap: Array<{
    componentCode: string;
    componentName: string;
    invoiceCount: number;
    studentCount: number;
    totalAmount: number;
    totalOutstanding: number;
    overdueOutstanding: number;
  }>;
};

export const staffFinanceApi = {
  async listComponents(params?: { isActive?: boolean; search?: string }) {
    const response = await apiClient.get<ApiResponse<{ components: StaffFinanceComponent[] }>>(
      '/payments/components',
      { params },
    );
    return response.data.data.components || [];
  },

  async createComponent(payload: {
    code: string;
    name: string;
    description?: string;
    periodicity: FinanceComponentPeriodicity;
  }) {
    const response = await apiClient.post<ApiResponse<{ component: StaffFinanceComponent }>>(
      '/payments/components',
      payload,
    );
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
    const response = await apiClient.patch<ApiResponse<{ component: StaffFinanceComponent }>>(
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
    const response = await apiClient.get<ApiResponse<{ tariffs: StaffFinanceTariffRule[] }>>(
      '/payments/tariffs',
      { params },
    );
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
    const response = await apiClient.post<ApiResponse<{ tariff: StaffFinanceTariffRule }>>(
      '/payments/tariffs',
      payload,
    );
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
    const response = await apiClient.patch<ApiResponse<{ tariff: StaffFinanceTariffRule }>>(
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
    const response = await apiClient.post<ApiResponse<StaffFinanceInvoiceGenerationResult>>(
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
    const response = await apiClient.post<ApiResponse<StaffFinanceInvoiceGenerationResult>>(
      '/payments/invoices/preview',
      payload,
    );
    return response.data.data;
  },

  async listInvoices(params?: {
    academicYearId?: number;
    semester?: SemesterCode;
    classId?: number;
    status?: FinanceInvoiceStatus;
    search?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceInvoiceListResult>>('/payments/invoices', {
      params,
    });
    return response.data.data;
  },

  async payInvoice(
    invoiceId: number,
    payload: {
      amount: number;
      method: FinancePaymentMethod;
      referenceNo?: string;
      note?: string;
    },
  ) {
    const response = await apiClient.post<
      ApiResponse<{
        payment: {
          id: number;
          paymentNo: string;
          amount: number;
          method: FinancePaymentMethod;
        };
      }>
    >(`/payments/invoices/${invoiceId}/payments`, payload);
    return response.data.data;
  },

  async listReports(params?: {
    academicYearId?: number;
    semester?: SemesterCode;
    classId?: number;
    periodFrom?: string;
    periodTo?: string;
    asOfDate?: string;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceReportSnapshot>>('/payments/reports', {
      params,
    });
    return response.data.data;
  },

  async dispatchDueReminders(payload?: {
    dueSoonDays?: number;
    mode?: FinanceReminderMode;
    preview?: boolean;
  }) {
    const response = await apiClient.post<
      ApiResponse<{
        checkedInvoices: number;
        targetedRecipients: number;
        dueSoonInvoices: number;
        overdueInvoices: number;
        createdNotifications: number;
        skippedAlreadyNotified: number;
      }>
    >('/payments/reminders/dispatch', payload || {});
    return response.data.data;
  },
};
