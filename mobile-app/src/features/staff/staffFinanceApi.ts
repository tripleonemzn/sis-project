import { apiClient } from '../../lib/api/client';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type SemesterCode = 'ODD' | 'EVEN';
export type FinanceComponentPeriodicity = 'MONTHLY' | 'ONE_TIME' | 'PERIODIC';
export type FinanceAdjustmentKind = 'DISCOUNT' | 'SCHOLARSHIP' | 'SURCHARGE';
export type FinanceInvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type FinanceLateFeeMode = 'FIXED' | 'DAILY';
export type FinancePaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
export type FinancePaymentSource = 'DIRECT' | 'CREDIT_BALANCE';
export type FinanceCreditTransactionKind = 'OVERPAYMENT' | 'APPLIED_TO_INVOICE' | 'REFUND' | 'PAYMENT_REVERSAL';
export type FinanceWriteOffStatus =
  | 'PENDING_HEAD_TU'
  | 'PENDING_PRINCIPAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED';
export type FinanceWriteOffPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'FINANCE_APPLY' | 'NONE';
export type FinancePaymentReversalStatus =
  | 'PENDING_HEAD_TU'
  | 'PENDING_PRINCIPAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED';
export type FinancePaymentReversalPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'FINANCE_APPLY' | 'NONE';
export type FinanceCashSessionStatus = 'OPEN' | 'CLOSED';
export type FinanceReminderMode = 'ALL' | 'DUE_SOON' | 'OVERDUE' | 'LATE_FEE' | 'ESCALATION';

export type StaffFinanceReminderPolicy = {
  isActive: boolean;
  dueSoonDays: number;
  dueSoonRepeatIntervalDays: number;
  overdueRepeatIntervalDays: number;
  lateFeeWarningEnabled: boolean;
  lateFeeWarningRepeatIntervalDays: number;
  escalationEnabled: boolean;
  escalationStartDays: number;
  escalationRepeatIntervalDays: number;
  escalationMinOutstandingAmount: number;
  sendStudentReminder: boolean;
  sendParentReminder: boolean;
  escalateToFinanceStaff: boolean;
  escalateToHeadTu: boolean;
  escalateToPrincipal: boolean;
  notes?: string | null;
  updatedAt: string;
};

export type StaffFinanceReminderDispatchResult = {
  checkedInvoices: number;
  targetedRecipients: number;
  dueSoonInvoices: number;
  overdueInvoices: number;
  lateFeeWarningInvoices: number;
  escalatedInvoices: number;
  createdNotifications: number;
  previewNotifications: number;
  skippedAlreadyNotified: number;
  dueSoonDays: number;
  mode: FinanceReminderMode;
  preview: boolean;
  runAt: string;
  disabledByPolicy: boolean;
  policy: StaffFinanceReminderPolicy;
};

export type StaffFinanceComponent = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  periodicity: FinanceComponentPeriodicity;
  lateFeeEnabled: boolean;
  lateFeeMode: FinanceLateFeeMode;
  lateFeeAmount: number;
  lateFeeGraceDays: number;
  lateFeeCapAmount?: number | null;
  isActive: boolean;
};

export type StaffFinanceClassLevelListResult = {
  levels: string[];
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

export type StaffFinanceAdjustmentRule = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  kind: FinanceAdjustmentKind;
  amount: number;
  componentId?: number | null;
  academicYearId?: number | null;
  majorId?: number | null;
  classId?: number | null;
  studentId?: number | null;
  semester?: SemesterCode | null;
  gradeLevel?: string | null;
  isActive: boolean;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  notes?: string | null;
  component?: {
    id: number;
    code: string;
    name: string;
    periodicity: FinanceComponentPeriodicity;
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
  academicYear?: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  student?: {
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
  writtenOffAmount: number;
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
  payments: Array<{
    id: number;
    paymentNo: string;
    amount: number;
    allocatedAmount: number;
    creditedAmount: number;
    reversedAmount: number;
    reversedAllocatedAmount: number;
    reversedCreditedAmount: number;
    remainingReversibleAmount: number;
    remainingAllocatedAmount: number;
    remainingCreditedAmount: number;
    isFullyReversed: boolean;
    canRequestReversal: boolean;
    source: FinancePaymentSource;
    method: FinancePaymentMethod;
    referenceNo?: string | null;
    note?: string | null;
    paidAt: string;
  }>;
  installments: Array<{
    sequence: number;
    amount: number;
    dueDate?: string | null;
    paidAmount: number;
    balanceAmount: number;
    status: FinanceInvoiceStatus;
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
      status: FinanceInvoiceStatus;
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
    breakdown: Array<{
      componentId: number;
      componentCode: string;
      componentName: string;
      mode: FinanceLateFeeMode;
      amount: number;
      graceDays: number;
      capAmount?: number | null;
      overdueInstallmentCount: number;
      chargeableDays: number;
      calculatedAmount: number;
      appliedAmount: number;
      pendingAmount: number;
    }>;
    asOfDate: string;
  };
  writeOffRequests: StaffFinanceWriteOffRequest[];
};

export type StaffFinanceWriteOffRequest = {
  id: number;
  requestNo: string;
  invoiceId: number;
  studentId: number;
  requestedAmount: number;
  approvedAmount?: number | null;
  appliedAmount?: number | null;
  reason: string;
  requestedNote?: string | null;
  status: FinanceWriteOffStatus;
  pendingActor: FinanceWriteOffPendingActor;
  remainingEligibleAmount: number;
  createdAt: string;
  updatedAt: string;
  headTuDecision: {
    approved?: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  principalDecision: {
    approved?: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  application: {
    appliedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  requestedBy?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
  student?: {
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
  } | null;
  invoice?: {
    id: number;
    invoiceNo: string;
    periodKey: string;
    semester: SemesterCode;
    title?: string | null;
    dueDate?: string | null;
    totalAmount: number;
    paidAmount: number;
    writtenOffAmount: number;
    balanceAmount: number;
    status: FinanceInvoiceStatus;
  } | null;
};

export type StaffFinanceWriteOffListResult = {
  summary: {
    totalRequests: number;
    pendingHeadTuCount: number;
    pendingPrincipalCount: number;
    approvedCount: number;
    rejectedCount: number;
    appliedCount: number;
    totalRequestedAmount: number;
    totalApprovedAmount: number;
    totalAppliedAmount: number;
  };
  requests: StaffFinanceWriteOffRequest[];
};

export type StaffFinancePaymentReversalRequest = {
  id: number;
  requestNo: string;
  paymentId: number;
  invoiceId: number;
  studentId: number;
  requestedAmount: number;
  requestedAllocatedAmount: number;
  requestedCreditedAmount: number;
  approvedAmount?: number | null;
  approvedAllocatedAmount?: number | null;
  approvedCreditedAmount?: number | null;
  appliedAmount?: number | null;
  appliedAllocatedAmount?: number | null;
  appliedCreditedAmount?: number | null;
  reason: string;
  requestedNote?: string | null;
  status: FinancePaymentReversalStatus;
  pendingActor: FinancePaymentReversalPendingActor;
  remainingEligibleAmount: number;
  createdAt: string;
  updatedAt: string;
  headTuDecision: {
    approved?: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  principalDecision: {
    approved?: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  application: {
    appliedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  requestedBy?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
  student?: {
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
  } | null;
  payment?: {
    id: number;
    paymentNo?: string | null;
    amount: number;
    allocatedAmount: number;
    creditedAmount: number;
    reversedAmount: number;
    reversedAllocatedAmount: number;
    reversedCreditedAmount: number;
    remainingReversibleAmount: number;
    remainingAllocatedAmount: number;
    remainingCreditedAmount: number;
    isFullyReversed: boolean;
    canRequestReversal: boolean;
    source: FinancePaymentSource;
    method: FinancePaymentMethod;
    referenceNo?: string | null;
    note?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  invoice?: {
    id: number;
    invoiceNo: string;
    periodKey: string;
    semester: SemesterCode;
    title?: string | null;
    dueDate?: string | null;
    totalAmount: number;
    paidAmount: number;
    writtenOffAmount: number;
    balanceAmount: number;
    status: FinanceInvoiceStatus;
  } | null;
};

export type StaffFinancePaymentReversalListResult = {
  summary: {
    totalRequests: number;
    pendingHeadTuCount: number;
    pendingPrincipalCount: number;
    approvedCount: number;
    rejectedCount: number;
    appliedCount: number;
    totalRequestedAmount: number;
    totalApprovedAmount: number;
    totalAppliedAmount: number;
  };
  requests: StaffFinancePaymentReversalRequest[];
};

export type StaffFinanceCreditTransaction = {
  id: number;
  kind: FinanceCreditTransactionKind;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string | null;
  createdAt: string;
  createdBy?: {
    id: number;
    name: string;
  } | null;
  payment?: {
    id: number;
    paymentNo: string;
    source?: FinancePaymentSource | null;
    invoiceId?: number | null;
    invoiceNo?: string | null;
    periodKey?: string | null;
    semester?: SemesterCode | null;
  } | null;
  refund?: {
    id: number;
    refundNo: string;
    refundedAt: string;
    method: FinancePaymentMethod;
  } | null;
};

export type StaffFinanceRefundRecord = {
  id: number;
  refundNo: string;
  amount: number;
  method: FinancePaymentMethod;
  referenceNo?: string | null;
  note?: string | null;
  refundedAt: string;
  createdAt: string;
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
  createdBy?: {
    id: number;
    name: string;
  } | null;
};

export type StaffFinanceCreditBalanceRow = {
  balanceId: number;
  studentId: number;
  balanceAmount: number;
  updatedAt: string;
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
  recentTransactions: StaffFinanceCreditTransaction[];
};

export type StaffFinanceCreditBalanceListResult = {
  summary: {
    totalStudentsWithCredit: number;
    totalCreditBalance: number;
    totalRefundRecords: number;
    totalRefundAmount: number;
  };
  balances: StaffFinanceCreditBalanceRow[];
  recentRefunds: StaffFinanceRefundRecord[];
};

export type StaffFinanceCashSession = {
  id: number;
  sessionNo: string;
  businessDate: string;
  status: FinanceCashSessionStatus;
  openingBalance: number;
  expectedCashIn: number;
  expectedCashOut: number;
  expectedClosingBalance: number;
  actualClosingBalance?: number | null;
  varianceAmount?: number | null;
  totalCashPayments: number;
  totalCashRefunds: number;
  openedAt: string;
  closedAt?: string | null;
  openingNote?: string | null;
  closingNote?: string | null;
  openedBy?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
  closedBy?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
  recentCashPayments: Array<{
    id: number;
    paymentNo?: string | null;
    amount: number;
    netCashAmount: number;
    reversedAmount: number;
    paidAt?: string | null;
    student?: {
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
    } | null;
    invoice?: {
      id: number;
      invoiceNo: string;
      periodKey: string;
      semester: SemesterCode;
    } | null;
  }>;
  recentCashRefunds: StaffFinanceRefundRecord[];
};

export type StaffFinanceCashSessionListResult = {
  activeSession: StaffFinanceCashSession | null;
  sessions: StaffFinanceCashSession[];
  summary: {
    totalSessions: number;
    openCount: number;
    closedCount: number;
    totalExpectedCashIn: number;
    totalExpectedCashOut: number;
    totalExpectedClosingBalance: number;
    totalVarianceAmount: number;
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
  projectedPaidAmount: number;
  projectedBalanceAmount: number;
  itemCount: number;
  componentNames: string[];
  items: Array<{
    itemKey: string;
    componentId?: number | null;
    componentCode?: string | null;
    componentName: string;
    amount: number;
    notes?: string | null;
  }>;
  creditAutoApply: {
    enabled: boolean;
    availableBalance: number;
    appliedAmount: number;
    remainingBalance: number;
  };
  installmentPlan: {
    count: number;
    intervalDays: number;
    installments: Array<{
      sequence: number;
      amount: number;
      dueDate?: string | null;
    }>;
  };
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
    installmentCount: number;
    installmentIntervalDays: number;
    autoApplyCreditBalance: boolean;
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
    totalProjectedAppliedCredit: number;
    totalProjectedOutstanding: number;
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
  async listClassLevels(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceClassLevelListResult>>(
      '/payments/class-levels',
      {
        params,
      },
    );
    return response.data.data.levels || [];
  },

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
    lateFeeEnabled?: boolean;
    lateFeeMode?: FinanceLateFeeMode;
    lateFeeAmount?: number;
    lateFeeGraceDays?: number;
    lateFeeCapAmount?: number | null;
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
      lateFeeEnabled: boolean;
      lateFeeMode: FinanceLateFeeMode;
      lateFeeAmount: number;
      lateFeeGraceDays: number;
      lateFeeCapAmount: number | null;
      isActive: boolean;
    }>,
  ) {
    const response = await apiClient.patch<ApiResponse<{ component: StaffFinanceComponent }>>(
      `/payments/components/${componentId}`,
      payload,
    );
    return response.data.data.component;
  },

  async applyInvoiceLateFees(
    invoiceId: number,
    payload?: {
      note?: string;
      appliedAt?: string;
    },
  ) {
    const response = await apiClient.post<
      ApiResponse<{ invoice: StaffFinanceInvoice; lateFeeSummary?: StaffFinanceInvoice['lateFeeSummary'] }>
    >(`/payments/invoices/${invoiceId}/late-fees/apply`, payload);
    return response.data.data.invoice;
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

  async listAdjustments(params?: {
    componentId?: number;
    academicYearId?: number;
    classId?: number;
    majorId?: number;
    studentId?: number;
    semester?: SemesterCode;
    kind?: FinanceAdjustmentKind;
    isActive?: boolean;
  }) {
    const response = await apiClient.get<ApiResponse<{ adjustments: StaffFinanceAdjustmentRule[] }>>(
      '/payments/adjustments',
      { params },
    );
    return response.data.data.adjustments || [];
  },

  async createAdjustment(payload: {
    code: string;
    name: string;
    description?: string;
    kind: FinanceAdjustmentKind;
    amount: number;
    componentId?: number;
    academicYearId?: number;
    classId?: number;
    majorId?: number;
    studentId?: number;
    semester?: SemesterCode;
    gradeLevel?: string;
    effectiveStart?: string;
    effectiveEnd?: string;
    notes?: string;
  }) {
    const response = await apiClient.post<ApiResponse<{ adjustment: StaffFinanceAdjustmentRule }>>(
      '/payments/adjustments',
      payload,
    );
    return response.data.data.adjustment;
  },

  async updateAdjustment(
    adjustmentId: number,
    payload: Partial<{
      code: string;
      name: string;
      description: string | null;
      kind: FinanceAdjustmentKind;
      amount: number;
      componentId: number | null;
      academicYearId: number | null;
      classId: number | null;
      majorId: number | null;
      studentId: number | null;
      semester: SemesterCode | null;
      gradeLevel: string | null;
      effectiveStart: string | null;
      effectiveEnd: string | null;
      notes: string | null;
      isActive: boolean;
    }>,
  ) {
    const response = await apiClient.patch<ApiResponse<{ adjustment: StaffFinanceAdjustmentRule }>>(
      `/payments/adjustments/${adjustmentId}`,
      payload,
    );
    return response.data.data.adjustment;
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
    installmentCount?: number;
    installmentIntervalDays?: number;
    autoApplyCreditBalance?: boolean;
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
    installmentCount?: number;
    installmentIntervalDays?: number;
    autoApplyCreditBalance?: boolean;
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
    gradeLevel?: string;
    status?: FinanceInvoiceStatus;
    search?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceInvoiceListResult>>('/payments/invoices', {
      params,
    });
    return response.data.data;
  },

  async updateInvoiceInstallments(
    invoiceId: number,
    payload: {
      installments: Array<{
        sequence: number;
        amount: number;
        dueDate?: string | null;
      }>;
      note?: string;
    },
  ) {
    const response = await apiClient.patch<ApiResponse<{ invoice: StaffFinanceInvoice }>>(
      `/payments/invoices/${invoiceId}/installments`,
      payload,
    );
    return response.data.data.invoice;
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
          allocatedAmount: number;
          creditedAmount: number;
          method: FinancePaymentMethod;
        };
        creditBalance?: {
          id: number;
          balanceAmount: number;
          balanceBefore: number;
        } | null;
      }>
    >(`/payments/invoices/${invoiceId}/payments`, payload);
    return response.data.data;
  },

  async listCredits(params?: { studentId?: number; search?: string; limit?: number }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceCreditBalanceListResult>>('/payments/credits', {
      params,
    });
    return response.data.data;
  },

  async listCashSessions(params?: {
    openedById?: number;
    status?: FinanceCashSessionStatus;
    businessDate?: string;
    mine?: boolean;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceCashSessionListResult>>('/payments/cash-sessions', {
      params,
    });
    return response.data.data;
  },

  async openCashSession(payload?: {
    businessDate?: string;
    openingBalance?: number;
    note?: string;
  }) {
    const response = await apiClient.post<ApiResponse<{ session: StaffFinanceCashSession }>>(
      '/payments/cash-sessions/open',
      payload || {},
    );
    return response.data.data.session;
  },

  async closeCashSession(
    sessionId: number,
    payload: {
      actualClosingBalance: number;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ session: StaffFinanceCashSession }>>(
      `/payments/cash-sessions/${sessionId}/close`,
      payload,
    );
    return response.data.data.session;
  },

  async createRefund(
    studentId: number,
    payload: {
      amount: number;
      method: FinancePaymentMethod;
      referenceNo?: string;
      note?: string;
      refundedAt?: string;
    },
  ) {
    const response = await apiClient.post<
      ApiResponse<{
        refund: StaffFinanceRefundRecord;
        balance: {
          id: number;
          amount: number;
          updatedAt: string;
        };
      }>
    >(`/payments/credits/${studentId}/refunds`, payload);
    return response.data.data;
  },

  async listWriteOffs(params?: {
    invoiceId?: number;
    studentId?: number;
    status?: FinanceWriteOffStatus;
    pendingFor?: 'HEAD_TU' | 'PRINCIPAL' | 'FINANCE_APPLY';
    search?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceWriteOffListResult>>('/payments/write-offs', {
      params,
    });
    return response.data.data;
  },

  async createWriteOffRequest(
    invoiceId: number,
    payload: {
      amount: number;
      reason: string;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinanceWriteOffRequest }>>(
      `/payments/invoices/${invoiceId}/write-offs`,
      payload,
    );
    return response.data.data.request;
  },

  async decideWriteOffAsHeadTu(
    requestId: number,
    payload: {
      approved: boolean;
      approvedAmount?: number;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinanceWriteOffRequest }>>(
      `/payments/write-offs/${requestId}/head-tu-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async decideWriteOffAsPrincipal(
    requestId: number,
    payload: {
      approved: boolean;
      approvedAmount?: number;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinanceWriteOffRequest }>>(
      `/payments/write-offs/${requestId}/principal-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async applyWriteOff(
    requestId: number,
    payload?: {
      amount?: number;
      note?: string;
    },
  ) {
    const response = await apiClient.post<
      ApiResponse<{ request: StaffFinanceWriteOffRequest; invoice: StaffFinanceInvoice }>
    >(`/payments/write-offs/${requestId}/apply`, payload || {});
    return response.data.data;
  },

  async listPaymentReversals(params?: {
    paymentId?: number;
    invoiceId?: number;
    studentId?: number;
    status?: FinancePaymentReversalStatus;
    pendingFor?: 'HEAD_TU' | 'PRINCIPAL' | 'FINANCE_APPLY';
    search?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinancePaymentReversalListResult>>('/payments/reversals', {
      params,
    });
    return response.data.data;
  },

  async createPaymentReversalRequest(
    paymentId: number,
    payload: {
      amount: number;
      reason: string;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinancePaymentReversalRequest }>>(
      `/payments/payment-records/${paymentId}/reversals`,
      payload,
    );
    return response.data.data.request;
  },

  async decidePaymentReversalAsHeadTu(
    requestId: number,
    payload: {
      approved: boolean;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinancePaymentReversalRequest }>>(
      `/payments/reversals/${requestId}/head-tu-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async decidePaymentReversalAsPrincipal(
    requestId: number,
    payload: {
      approved: boolean;
      note?: string;
    },
  ) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinancePaymentReversalRequest }>>(
      `/payments/reversals/${requestId}/principal-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async applyPaymentReversal(
    requestId: number,
    payload?: {
      note?: string;
    },
  ) {
    const response = await apiClient.post<
      ApiResponse<{
        request: StaffFinancePaymentReversalRequest;
        payment: StaffFinanceInvoice['payments'][number];
        invoice: StaffFinanceInvoice;
      }>
    >(`/payments/reversals/${requestId}/apply`, payload || {});
    return response.data.data;
  },

  async listReports(params?: {
    academicYearId?: number;
    semester?: SemesterCode;
    classId?: number;
    gradeLevel?: string;
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
      ApiResponse<StaffFinanceReminderDispatchResult>
    >('/payments/reminders/dispatch', payload || {});
    return response.data.data;
  },

  async getReminderPolicy() {
    const response = await apiClient.get<ApiResponse<{ policy: StaffFinanceReminderPolicy }>>(
      '/payments/reminder-policy',
    );
    return response.data.data.policy;
  },

  async updateReminderPolicy(payload: Partial<Omit<StaffFinanceReminderPolicy, 'updatedAt'>>) {
    const response = await apiClient.put<ApiResponse<{ policy: StaffFinanceReminderPolicy }>>(
      '/payments/reminder-policy',
      payload,
    );
    return response.data.data.policy;
  },
};
