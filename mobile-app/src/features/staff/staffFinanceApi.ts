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
export type FinancePaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER';
export type FinancePaymentVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
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
export type FinanceCashSessionApprovalStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING_HEAD_TU'
  | 'PENDING_PRINCIPAL'
  | 'APPROVED'
  | 'AUTO_APPROVED'
  | 'REJECTED';
export type FinanceCashSessionPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'NONE';
export type FinanceClosingPeriodType = 'MONTHLY' | 'YEARLY';
export type FinanceClosingPeriodStatus = 'OPEN' | 'CLOSING_REVIEW' | 'CLOSED';
export type FinanceClosingPeriodApprovalStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING_HEAD_TU'
  | 'PENDING_PRINCIPAL'
  | 'APPROVED'
  | 'REJECTED';
export type FinanceClosingPeriodPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'NONE';
export type FinanceClosingPeriodReopenStatus =
  | 'PENDING_HEAD_TU'
  | 'PENDING_PRINCIPAL'
  | 'APPLIED'
  | 'REJECTED';
export type FinanceClosingPeriodReopenPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'NONE';
export type FinanceBankReconciliationStatus = 'OPEN' | 'FINALIZED';
export type FinanceBankStatementDirection = 'CREDIT' | 'DEBIT';
export type FinanceLedgerBook = 'ALL' | 'CASHBOOK' | 'BANKBOOK';
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

export type StaffFinanceCashSessionApprovalPolicy = {
  zeroVarianceAutoApproved: boolean;
  requireVarianceNote: boolean;
  principalApprovalThresholdAmount: number;
  notes?: string | null;
  updatedAt: string;
};

export type StaffFinanceClosingPeriodApprovalPolicy = {
  requireHeadTuApproval: boolean;
  requireHeadTuReopenApproval: boolean;
  requirePrincipalReopenApproval: boolean;
  principalApprovalThresholdAmount: number;
  escalateIfPendingVerification: boolean;
  escalateIfUnmatchedBankEntries: boolean;
  escalateIfOpenCashSession: boolean;
  escalateIfOpenReconciliation: boolean;
  notes?: string | null;
  updatedAt: string;
};

export type StaffFinanceBankAccount = {
  id: number;
  code: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string | null;
  notes?: string | null;
  isActive: boolean;
  label: string;
  createdAt: string;
  updatedAt: string;
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
    invoiceId?: number | null;
    invoiceNo?: string | null;
    periodKey?: string | null;
    semester?: SemesterCode | null;
    verificationStatus: FinancePaymentVerificationStatus;
    verificationNote?: string | null;
    verifiedAt?: string | null;
    verifiedBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    createdBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    bankAccount?: StaffFinanceBankAccount | null;
    matchedStatementEntry?: {
      id: number;
      entryDate: string;
      amount: number;
      direction: FinanceBankStatementDirection;
      referenceNo?: string | null;
      status: 'MATCHED' | 'UNMATCHED';
      reconciliation?: {
        id: number;
        reconciliationNo: string;
      } | null;
    } | null;
    referenceNo?: string | null;
    note?: string | null;
    proofFile?: {
      url: string;
      name?: string | null;
      mimetype?: string | null;
      size?: number | null;
    } | null;
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
  bankAccount?: StaffFinanceBankAccount | null;
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
  approvalStatus: FinanceCashSessionApprovalStatus;
  pendingActor: FinanceCashSessionPendingActor;
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
  headTuDecision: {
    approved: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
  principalDecision: {
    approved: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  };
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
    pendingHeadTuCount: number;
    pendingPrincipalCount: number;
    approvedCount: number;
    rejectedCount: number;
    totalExpectedCashIn: number;
    totalExpectedCashOut: number;
    totalExpectedClosingBalance: number;
    totalVarianceAmount: number;
  };
};

export type StaffFinanceClosingPeriodSummary = {
  cashOpeningBalance: number;
  cashClosingBalance: number;
  bankOpeningBalance: number;
  bankClosingBalance: number;
  totalCashIn: number;
  totalCashOut: number;
  totalBankIn: number;
  totalBankOut: number;
  outstandingAmount: number;
  pendingVerificationAmount: number;
  unmatchedBankAmount: number;
  openCashSessionCount: number;
  openReconciliationCount: number;
};

export type StaffFinanceClosingPeriod = {
  id: number;
  periodNo: string;
  periodType: FinanceClosingPeriodType;
  periodYear: number;
  periodMonth?: number | null;
  label: string;
  periodStart: string;
  periodEnd: string;
  status: FinanceClosingPeriodStatus;
  approvalStatus: FinanceClosingPeriodApprovalStatus;
  pendingActor: FinanceClosingPeriodPendingActor;
  summary: StaffFinanceClosingPeriodSummary;
  closingNote?: string | null;
  requestedAt?: string | null;
  closedAt?: string | null;
  reopenedAt?: string | null;
  reopenNote?: string | null;
  requestedBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  headTuApproved?: boolean | null;
  headTuDecisionAt?: string | null;
  headTuDecisionNote?: string | null;
  headTuDecisionBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  principalApproved?: boolean | null;
  principalDecisionAt?: string | null;
  principalDecisionNote?: string | null;
  principalDecisionBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  closedBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  reopenedBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
};

export type StaffFinanceClosingPeriodListResult = {
  periods: StaffFinanceClosingPeriod[];
  summary: {
    totalPeriods: number;
    openCount: number;
    reviewCount: number;
    closedCount: number;
    pendingHeadTuCount: number;
    pendingPrincipalCount: number;
    totalOutstandingAmount: number;
    totalPendingVerificationAmount: number;
    totalUnmatchedBankAmount: number;
  };
};

export type StaffFinanceClosingPeriodReopenRequest = {
  id: number;
  requestNo: string;
  status: FinanceClosingPeriodReopenStatus;
  pendingActor: FinanceClosingPeriodReopenPendingActor;
  reason: string;
  requestedNote?: string | null;
  requestedAt: string;
  closingPeriod: Pick<
    StaffFinanceClosingPeriod,
    'id' | 'periodNo' | 'periodType' | 'periodYear' | 'periodMonth' | 'label' | 'periodStart' | 'periodEnd' | 'summary'
  >;
  requestedBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  headTuDecision: {
    approved?: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role: string;
    } | null;
  };
  principalDecision: {
    approved?: boolean | null;
    decidedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role: string;
    } | null;
  };
  application: {
    reopenedAt?: string | null;
    note?: string | null;
    by?: {
      id: number;
      name: string;
      role: string;
    } | null;
  };
};

export type StaffFinanceClosingPeriodReopenRequestListResult = {
  requests: StaffFinanceClosingPeriodReopenRequest[];
  summary: {
    totalRequests: number;
    pendingHeadTuCount: number;
    pendingPrincipalCount: number;
    appliedCount: number;
    rejectedCount: number;
  };
};

export type StaffFinanceBankStatementEntry = {
  id: number;
  entryDate: string;
  direction: FinanceBankStatementDirection;
  amount: number;
  referenceNo?: string | null;
  description?: string | null;
  status: 'MATCHED' | 'UNMATCHED';
  matchedPayment?: (StaffFinanceInvoice['payments'][number] & {
    bankAccount?: StaffFinanceBankAccount | null;
  }) | null;
  matchedRefund?: StaffFinanceRefundRecord | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffFinanceBankSystemPayment = StaffFinanceInvoice['payments'][number] & {
  bankAccount?: StaffFinanceBankAccount | null;
  netBankAmount: number;
  matched: boolean;
};

export type StaffFinanceBankSystemRefund = StaffFinanceRefundRecord & {
  matched: boolean;
};

export type StaffFinanceBankReconciliation = {
  id: number;
  reconciliationNo: string;
  status: FinanceBankReconciliationStatus;
  periodStart: string;
  periodEnd: string;
  statementOpeningBalance: number;
  statementClosingBalance: number;
  note?: string | null;
  bankAccount: StaffFinanceBankAccount;
  createdBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  finalizedBy?: {
    id: number;
    name: string;
    role: string;
  } | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    expectedBankIn: number;
    expectedBankOut: number;
    pendingVerificationAmount: number;
    expectedClosingBalance: number;
    statementRecordedIn: number;
    statementRecordedOut: number;
    statementComputedClosingBalance: number;
    varianceAmount: number;
    statementGapAmount: number;
    totalPaymentCount: number;
    verifiedPaymentCount: number;
    pendingPaymentCount: number;
    rejectedPaymentCount: number;
    totalRefundCount: number;
    matchedPaymentCount: number;
    matchedRefundCount: number;
    unmatchedPaymentCount: number;
    unmatchedRefundCount: number;
    matchedStatementEntryCount: number;
    unmatchedStatementEntryCount: number;
  };
  statementEntries: StaffFinanceBankStatementEntry[];
  systemPayments: StaffFinanceBankSystemPayment[];
  systemRefunds: StaffFinanceBankSystemRefund[];
};

export type StaffFinanceBankReconciliationListResult = {
  reconciliations: StaffFinanceBankReconciliation[];
  summary: {
    totalReconciliations: number;
    openCount: number;
    finalizedCount: number;
    totalExpectedBankIn: number;
    totalExpectedBankOut: number;
    totalVarianceAmount: number;
    totalStatementGapAmount: number;
    totalUnmatchedPayments: number;
    totalUnmatchedRefunds: number;
    totalUnmatchedStatementEntries: number;
  };
};

export type StaffFinanceBankStatementImportResult = {
  entries: StaffFinanceBankStatementEntry[];
  reconciliation: StaffFinanceBankReconciliation;
  summary: {
    submittedCount: number;
    createdCount: number;
    skippedCount: number;
    matchedCount: number;
    unmatchedCount: number;
  };
};

export type StaffFinanceLedgerEntry = {
  id: string;
  sourceType: 'PAYMENT' | 'REFUND';
  book: 'CASHBOOK' | 'BANKBOOK';
  direction: 'IN' | 'OUT';
  transactionDate: string;
  transactionNo?: string | null;
  amount: number;
  affectsBalance: boolean;
  runningBalance: number;
  accountRunningBalance?: number | null;
  referenceNo?: string | null;
  note?: string | null;
  method?: FinancePaymentMethod | null;
  verificationStatus?: FinancePaymentVerificationStatus | null;
  matched: boolean;
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
    periodKey?: string | null;
    semester?: SemesterCode | null;
  } | null;
  bankAccount?: StaffFinanceBankAccount | null;
  matchedStatementEntry?: {
    id: number;
    entryDate: string;
    amount: number;
    direction: FinanceBankStatementDirection;
    referenceNo?: string | null;
    status: 'MATCHED' | 'UNMATCHED';
    reconciliation?: {
      id: number;
      reconciliationNo: string;
    } | null;
  } | null;
};

export type StaffFinanceLedgerBookSummary = {
  book: 'CASHBOOK' | 'BANKBOOK';
  label: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  pendingAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
  entryCount: number;
};

export type StaffFinanceLedgerBankAccountSummary = {
  bankAccount: StaffFinanceBankAccount;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  pendingVerificationAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
  entryCount: number;
  latestFinalizedReconciliation?: {
    id: number;
    reconciliationNo: string;
    periodEnd: string;
    statementClosingBalance: number;
    finalizedAt?: string | null;
  } | null;
};

export type StaffFinanceLedgerSnapshot = {
  filters: {
    book: FinanceLedgerBook;
    bankAccountId?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string | null;
    limit: number;
  };
  summary: {
    totalEntries: number;
    openingCashBalance: number;
    totalCashIn: number;
    totalCashOut: number;
    closingCashBalance: number;
    openingBankBalance: number;
    totalBankIn: number;
    totalBankOut: number;
    closingBankBalance: number;
    pendingBankVerificationAmount: number;
    matchedBankAmount: number;
    unmatchedBankAmount: number;
  };
  books: StaffFinanceLedgerBookSummary[];
  bankAccounts: StaffFinanceLedgerBankAccountSummary[];
  entries: StaffFinanceLedgerEntry[];
};

export type StaffFinancePaymentVerificationRow = StaffFinanceInvoice['payments'][number] & {
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
};

export type StaffFinancePaymentVerificationListResult = {
  payments: StaffFinancePaymentVerificationRow[];
  summary: {
    totalPayments: number;
    totalAmount: number;
    pendingCount: number;
    pendingAmount: number;
    verifiedCount: number;
    verifiedAmount: number;
    rejectedCount: number;
    rejectedAmount: number;
    matchedCount: number;
    unmatchedCount: number;
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

export type FinanceBudgetProgressStage =
  | 'PENDING_APPROVAL'
  | 'WAITING_REALIZATION'
  | 'WAITING_LPJ'
  | 'LPJ_PREPARATION'
  | 'FINANCE_REVIEW'
  | 'RETURNED_BY_FINANCE'
  | 'REALIZED'
  | 'REJECTED';

export type StaffFinanceBudgetRealizationDutyRecap = {
  additionalDuty: string;
  additionalDutyLabel: string;
  totalRequests: number;
  pendingApprovalCount: number;
  approvedCount: number;
  rejectedCount: number;
  approvedBudgetAmount: number;
  realizationConfirmedBudgetAmount: number;
  actualRealizedAmount: number;
  varianceAmount: number;
  realizationRate: number;
  waitingRealizationCount: number;
  waitingLpjCount: number;
  lpjPreparationCount: number;
  financeReviewCount: number;
  returnedByFinanceCount: number;
  realizedCount: number;
};

export type StaffFinanceBudgetRealizationQueueRow = {
  budgetId: number;
  title: string;
  requesterName: string;
  additionalDuty: string;
  additionalDutyLabel: string;
  stage: FinanceBudgetProgressStage;
  stageLabel: string;
  approvalStatus: string;
  approvedBudgetAmount: number;
  actualRealizedAmount: number;
  varianceAmount: number;
  latestLpjStatus?: string | null;
  latestLpjTitle?: string | null;
  realizationConfirmedAt?: string | null;
  pendingSince?: string | null;
  daysInStage: number;
  updatedAt: string;
};

export type StaffFinanceBudgetRealizationRecentRow = {
  budgetId: number;
  title: string;
  requesterName: string;
  additionalDuty: string;
  additionalDutyLabel: string;
  approvedBudgetAmount: number;
  actualRealizedAmount: number;
  varianceAmount: number;
  completedAt?: string | null;
  completedInvoiceCount: number;
};

export type StaffFinanceBudgetRealizationSnapshot = {
  filters: {
    academicYearId: number | null;
    additionalDuty: string | null;
    generatedAt: string;
  };
  overview: {
    totalRequests: number;
    pendingApprovalCount: number;
    approvedCount: number;
    rejectedCount: number;
    approvedBudgetAmount: number;
    realizationConfirmedBudgetAmount: number;
    actualRealizedAmount: number;
    varianceAmount: number;
    realizationRate: number;
    completionRate: number;
    totalLpjInvoices: number;
    completedLpjInvoices: number;
    processingLpjInvoices: number;
    returnedLpjInvoices: number;
    stageSummary: {
      pendingApprovalCount: number;
      pendingApprovalAmount: number;
      waitingRealizationCount: number;
      waitingRealizationAmount: number;
      waitingLpjCount: number;
      waitingLpjAmount: number;
      lpjPreparationCount: number;
      lpjPreparationAmount: number;
      financeReviewCount: number;
      financeReviewAmount: number;
      returnedByFinanceCount: number;
      returnedByFinanceAmount: number;
      realizedCount: number;
      realizedAmount: number;
    };
  };
  dutyRecap: StaffFinanceBudgetRealizationDutyRecap[];
  followUpQueue: StaffFinanceBudgetRealizationQueueRow[];
  recentRealizations: StaffFinanceBudgetRealizationRecentRow[];
};

export type StaffFinanceGovernanceArea = 'COLLECTION' | 'TREASURY' | 'APPROVAL' | 'BUDGET' | 'CLOSING';
export type StaffFinanceGovernanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type StaffFinanceAuditArea = 'POLICY' | 'COLLECTION' | 'TREASURY' | 'APPROVAL';
export type StaffFinanceAuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type StaffFinanceGovernanceFollowUpItem = {
  key: string;
  category: StaffFinanceGovernanceArea;
  severity: StaffFinanceGovernanceSeverity;
  title: string;
  detail: string;
  amount: number;
  referenceLabel?: string | null;
  updatedAt?: string | null;
};

export type StaffFinanceGovernanceSummary = {
  filters: {
    academicYearId: number | null;
    generatedAt: string;
  };
  overview: {
    riskLevel: StaffFinanceGovernanceSeverity;
    dominantArea: StaffFinanceGovernanceArea;
    headline: string;
    detail: string;
    attentionItems: number;
    attentionAmount: number;
  };
  collection: {
    criticalCount: number;
    highPriorityCount: number;
    dueSoonCount: number;
    dueSoonOutstanding: number;
    overdueInvoices: number;
    overdueOutstanding: number;
    totalOutstanding: number;
  };
  treasury: {
    openCashSessions: number;
    pendingCashSessionApprovals: number;
    totalCashVarianceAmount: number;
    openBankReconciliations: number;
    unmatchedStatementEntries: number;
    totalBankVarianceAmount: number;
    pendingBankVerificationAmount: number;
  };
  approvals: {
    pendingHeadTuWriteOffs: number;
    pendingPrincipalWriteOffs: number;
    pendingHeadTuPaymentReversals: number;
    pendingPrincipalPaymentReversals: number;
    pendingHeadTuCashSessions: number;
    pendingPrincipalCashSessions: number;
    pendingHeadTuClosingPeriods: number;
    pendingPrincipalClosingPeriods: number;
    totalPendingCount: number;
    totalPendingAmount: number;
  };
  budgetControl: {
    approvedBudgetAmount: number;
    actualRealizedAmount: number;
    varianceAmount: number;
    financeReviewCount: number;
    returnedByFinanceCount: number;
    followUpCount: number;
  };
  closingControl: {
    openCount: number;
    reviewCount: number;
    closedCount: number;
    pendingVerificationAmount: number;
    unmatchedBankAmount: number;
    openCashSessionCount: number;
    openReconciliationCount: number;
  };
  followUpQueue: StaffFinanceGovernanceFollowUpItem[];
};

export type StaffFinanceAuditSummary = {
  filters: {
    days: number;
    limit: number;
    generatedAt: string;
  };
  overview: {
    totalEvents: number;
    uniqueActors: number;
    criticalCount: number;
    highCount: number;
    policyChangeCount: number;
    approvalActionCount: number;
  };
  categorySummary: {
    policyCount: number;
    collectionCount: number;
    treasuryCount: number;
    approvalCount: number;
  };
  actorSummary: Array<{
    actorId: number;
    actorName: string;
    actorRole: string;
    actorDuties: string[];
    totalEvents: number;
    criticalCount: number;
    approvalCount: number;
    lastActivityAt: string;
  }>;
  recentEvents: Array<{
    id: number;
    createdAt: string;
    action: string;
    entity: string;
    entityId?: number | null;
    reason?: string | null;
    category: StaffFinanceAuditArea;
    severity: StaffFinanceAuditSeverity;
    label: string;
    summary: string;
    actor: {
      id: number;
      name: string;
      username?: string | null;
      role: string;
      duties: string[];
      label: string;
    };
  }>;
};

export type StaffFinancePerformanceSignalTone = 'POSITIVE' | 'WATCH' | 'RISK';

export type StaffFinancePerformanceSummary = {
  filters: {
    months: number;
    generatedAt: string;
  };
  overview: {
    averageIssuedInvoiceAmount: number;
    averageCollectedAgainstIssuedAmount: number;
    averageCollectionRate: number;
    latestMonthLabel?: string | null;
    latestCollectionRate: number;
    latestOutstandingAmount: number;
    latestPendingVerificationAmount: number;
    latestNetFlowAmount: number;
  };
  highlights: {
    bestCollectionMonth: {
      label: string;
      collectionRate: number;
      amount: number;
    } | null;
    highestOutstandingMonth: {
      label: string;
      outstandingAmount: number;
      overdueOutstandingAmount: number;
    } | null;
    highestPendingVerificationMonth: {
      label: string;
      pendingPaymentCount: number;
      pendingVerificationAmount: number;
    } | null;
    strongestNetFlowMonth: {
      label: string;
      netFlowAmount: number;
    } | null;
  };
  signals: Array<{
    key: string;
    title: string;
    detail: string;
    tone: StaffFinancePerformanceSignalTone;
    metric: string;
    amount: number;
  }>;
  monthlyTrend: Array<{
    periodKey: string;
    label: string;
    issuedInvoiceCount: number;
    issuedInvoiceAmount: number;
    collectedAgainstIssuedAmount: number;
    collectionRate: number;
    outstandingAmount: number;
    overdueOutstandingAmount: number;
    pendingPaymentCount: number;
    pendingVerificationAmount: number;
    cashInAmount: number;
    nonCashVerifiedAmount: number;
    refundAmount: number;
    netFlowAmount: number;
    finalizedReconciliationCount: number;
    finalizedClosingCount: number;
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

  async listBankAccounts(params?: { isActive?: boolean; search?: string }) {
    const response = await apiClient.get<ApiResponse<{ accounts: StaffFinanceBankAccount[] }>>(
      '/payments/bank-accounts',
      { params },
    );
    return response.data.data.accounts || [];
  },

  async createBankAccount(payload: {
    code: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    branch?: string;
    notes?: string;
    isActive?: boolean;
  }) {
    const response = await apiClient.post<ApiResponse<{ account: StaffFinanceBankAccount }>>(
      '/payments/bank-accounts',
      payload,
    );
    return response.data.data.account;
  },

  async updateBankAccount(
    accountId: number,
    payload: Partial<{
      code: string;
      bankName: string;
      accountName: string;
      accountNumber: string;
      branch?: string;
      notes?: string;
      isActive: boolean;
    }>,
  ) {
    const response = await apiClient.patch<ApiResponse<{ account: StaffFinanceBankAccount }>>(
      `/payments/bank-accounts/${accountId}`,
      payload,
    );
    return response.data.data.account;
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
      bankAccountId?: number;
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
        verificationStatus: FinancePaymentVerificationStatus;
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

  async listPaymentVerifications(params?: {
    verificationStatus?: FinancePaymentVerificationStatus;
    bankAccountId?: number;
    matchedOnly?: boolean;
    search?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinancePaymentVerificationListResult>>(
      '/payments/payment-records',
      {
        params,
      },
    );
    return response.data.data;
  },

  async verifyPayment(paymentId: number, payload?: { note?: string }) {
    const response = await apiClient.post<
      ApiResponse<{
        payment: StaffFinanceInvoice['payments'][number];
        invoice: StaffFinanceInvoice;
        creditBalance?: {
          id: number;
          balanceAmount: number;
          balanceBefore: number;
        } | null;
      }>
    >(`/payments/payment-records/${paymentId}/verify`, payload || {});
    return response.data.data;
  },

  async rejectPayment(paymentId: number, payload?: { note?: string }) {
    const response = await apiClient.post<
      ApiResponse<{
        payment: StaffFinanceInvoice['payments'][number];
      }>
    >(`/payments/payment-records/${paymentId}/reject`, payload || {});
    return response.data.data;
  },

  async listCredits(params?: { studentId?: number; search?: string; limit?: number }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceCreditBalanceListResult>>('/payments/credits', {
      params,
    });
    return response.data.data;
  },

  async listBankReconciliations(params?: {
    bankAccountId?: number;
    status?: FinanceBankReconciliationStatus;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceBankReconciliationListResult>>(
      '/payments/bank-reconciliations',
      {
        params,
      },
    );
    return response.data.data;
  },

  async listLedgerBooks(params?: {
    book?: FinanceLedgerBook;
    bankAccountId?: number;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceLedgerSnapshot>>('/payments/ledger-books', {
      params,
    });
    return response.data.data;
  },

  async createBankReconciliation(payload: {
    bankAccountId: number;
    periodStart: string;
    periodEnd: string;
    statementOpeningBalance?: number;
    statementClosingBalance: number;
    note?: string;
  }) {
    const response = await apiClient.post<ApiResponse<{ reconciliation: StaffFinanceBankReconciliation }>>(
      '/payments/bank-reconciliations',
      payload,
    );
    return response.data.data.reconciliation;
  },

  async createBankStatementEntry(
    reconciliationId: number,
    payload: {
      entryDate: string;
      direction: FinanceBankStatementDirection;
      amount: number;
      referenceNo?: string;
      description?: string;
    },
  ) {
    const response = await apiClient.post<
      ApiResponse<{
        entry: StaffFinanceBankStatementEntry;
        reconciliation: StaffFinanceBankReconciliation;
      }>
    >(`/payments/bank-reconciliations/${reconciliationId}/entries`, payload);
    return response.data.data;
  },

  async importBankStatementEntries(
    reconciliationId: number,
    payload: {
      entries: Array<{
        entryDate: string;
        direction: FinanceBankStatementDirection;
        amount: number;
        referenceNo?: string;
        description?: string;
      }>;
      skipDuplicates?: boolean;
    },
  ) {
    const response = await apiClient.post<ApiResponse<StaffFinanceBankStatementImportResult>>(
      `/payments/bank-reconciliations/${reconciliationId}/entries/import`,
      payload,
    );
    return response.data.data;
  },

  async finalizeBankReconciliation(reconciliationId: number, payload?: { note?: string }) {
    const response = await apiClient.post<ApiResponse<{ reconciliation: StaffFinanceBankReconciliation }>>(
      `/payments/bank-reconciliations/${reconciliationId}/finalize`,
      payload || {},
    );
    return response.data.data.reconciliation;
  },

  async listCashSessions(params?: {
    openedById?: number;
    status?: FinanceCashSessionStatus;
    approvalStatus?: FinanceCashSessionApprovalStatus;
    pendingFor?: 'HEAD_TU' | 'PRINCIPAL';
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

  async getCashSessionApprovalPolicy() {
    const response = await apiClient.get<ApiResponse<{ policy: StaffFinanceCashSessionApprovalPolicy }>>(
      '/payments/cash-session-policy',
    );
    return response.data.data.policy;
  },

  async getClosingPeriodApprovalPolicy() {
    const response = await apiClient.get<ApiResponse<{ policy: StaffFinanceClosingPeriodApprovalPolicy }>>(
      '/payments/closing-period-policy',
    );
    return response.data.data.policy;
  },

  async updateCashSessionApprovalPolicy(
    payload: Partial<Omit<StaffFinanceCashSessionApprovalPolicy, 'updatedAt'>>,
  ) {
    const response = await apiClient.put<ApiResponse<{ policy: StaffFinanceCashSessionApprovalPolicy }>>(
      '/payments/cash-session-policy',
      payload,
    );
    return response.data.data.policy;
  },

  async updateClosingPeriodApprovalPolicy(
    payload: Partial<Omit<StaffFinanceClosingPeriodApprovalPolicy, 'updatedAt'>>,
  ) {
    const response = await apiClient.put<ApiResponse<{ policy: StaffFinanceClosingPeriodApprovalPolicy }>>(
      '/payments/closing-period-policy',
      payload,
    );
    return response.data.data.policy;
  },

  async decideCashSessionAsHeadTu(sessionId: number, payload: { approved: boolean; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ session: StaffFinanceCashSession }>>(
      `/payments/cash-sessions/${sessionId}/head-tu-decision`,
      payload,
    );
    return response.data.data.session;
  },

  async decideCashSessionAsPrincipal(sessionId: number, payload: { approved: boolean; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ session: StaffFinanceCashSession }>>(
      `/payments/cash-sessions/${sessionId}/principal-decision`,
      payload,
    );
    return response.data.data.session;
  },

  async listClosingPeriods(params?: {
    periodType?: FinanceClosingPeriodType;
    periodYear?: number;
    status?: FinanceClosingPeriodStatus;
    approvalStatus?: FinanceClosingPeriodApprovalStatus;
    pendingFor?: 'HEAD_TU' | 'PRINCIPAL';
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceClosingPeriodListResult>>('/payments/closing-periods', {
      params,
    });
    return response.data.data;
  },

  async listClosingPeriodReopenRequests(params?: {
    closingPeriodId?: number;
    status?: FinanceClosingPeriodReopenStatus;
    pendingFor?: 'HEAD_TU' | 'PRINCIPAL';
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceClosingPeriodReopenRequestListResult>>(
      '/payments/closing-period-reopen-requests',
      { params },
    );
    return response.data.data;
  },

  async createClosingPeriod(payload: {
    periodType: FinanceClosingPeriodType;
    periodYear: number;
    periodMonth?: number;
    label?: string;
    note?: string;
  }) {
    const response = await apiClient.post<
      ApiResponse<{ period: StaffFinanceClosingPeriod; policy: StaffFinanceClosingPeriodApprovalPolicy }>
    >('/payments/closing-periods', payload);
    return response.data.data;
  },

  async createClosingPeriodReopenRequest(periodId: number, payload: { reason: string; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinanceClosingPeriodReopenRequest }>>(
      `/payments/closing-periods/${periodId}/reopen-requests`,
      payload,
    );
    return response.data.data.request;
  },

  async decideClosingPeriodAsHeadTu(periodId: number, payload: { approved: boolean; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ period: StaffFinanceClosingPeriod }>>(
      `/payments/closing-periods/${periodId}/head-tu-decision`,
      payload,
    );
    return response.data.data.period;
  },

  async decideClosingPeriodReopenAsHeadTu(requestId: number, payload: { approved: boolean; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinanceClosingPeriodReopenRequest }>>(
      `/payments/closing-period-reopen-requests/${requestId}/head-tu-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async decideClosingPeriodAsPrincipal(periodId: number, payload: { approved: boolean; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ period: StaffFinanceClosingPeriod }>>(
      `/payments/closing-periods/${periodId}/principal-decision`,
      payload,
    );
    return response.data.data.period;
  },

  async decideClosingPeriodReopenAsPrincipal(requestId: number, payload: { approved: boolean; note?: string }) {
    const response = await apiClient.post<ApiResponse<{ request: StaffFinanceClosingPeriodReopenRequest }>>(
      `/payments/closing-period-reopen-requests/${requestId}/principal-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async createRefund(
    studentId: number,
    payload: {
      amount: number;
      method: FinancePaymentMethod;
      bankAccountId?: number;
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

  async getBudgetRealizationSummary(params?: {
    academicYearId?: number;
    additionalDuty?: string;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceBudgetRealizationSnapshot>>(
      '/payments/budget-realization',
      {
        params,
      },
    );
    return response.data.data;
  },

  async getGovernanceSummary(params?: {
    academicYearId?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceGovernanceSummary>>(
      '/payments/governance-summary',
      {
        params,
      },
    );
    return response.data.data;
  },

  async getAuditSummary(params?: {
    days?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinanceAuditSummary>>(
      '/payments/audit-summary',
      {
        params,
      },
    );
    return response.data.data;
  },

  async getPerformanceSummary(params?: {
    months?: number;
  }) {
    const response = await apiClient.get<ApiResponse<StaffFinancePerformanceSummary>>(
      '/payments/performance-summary',
      {
        params,
      },
    );
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
