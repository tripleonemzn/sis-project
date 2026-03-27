import api from './api';

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
export type SemesterCode = 'ODD' | 'EVEN';
export type FinanceReminderMode = 'ALL' | 'DUE_SOON' | 'OVERDUE' | 'LATE_FEE' | 'ESCALATION';

export interface FinanceReminderPolicy {
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
}

export interface FinanceReminderDispatchResult {
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
  policy: FinanceReminderPolicy;
}

export interface FinanceCashSessionApprovalPolicy {
  zeroVarianceAutoApproved: boolean;
  requireVarianceNote: boolean;
  principalApprovalThresholdAmount: number;
  notes?: string | null;
  updatedAt: string;
}

export interface FinanceClosingPeriodApprovalPolicy {
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
}

export interface FinanceBankAccount {
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
}

export interface FinanceComponent {
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
}

export interface FinanceClassLevelListResult {
  levels: string[];
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

export interface FinanceAdjustmentRule {
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
  writtenOffAmount: number;
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
    bankAccount?: FinanceBankAccount | null;
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
  writeOffRequests: FinanceWriteOffRequest[];
}

export interface FinanceWriteOffRequest {
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
}

export interface FinanceWriteOffListResult {
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
  requests: FinanceWriteOffRequest[];
}

export interface FinancePaymentReversalRequest {
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
}

export interface FinancePaymentReversalListResult {
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
  requests: FinancePaymentReversalRequest[];
}

export interface FinanceCreditTransaction {
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
}

export interface FinanceRefundRecord {
  id: number;
  refundNo: string;
  amount: number;
  method: FinancePaymentMethod;
  bankAccount?: FinanceBankAccount | null;
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
}

export interface FinanceCreditBalanceRow {
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
  recentTransactions: FinanceCreditTransaction[];
}

export interface FinanceCreditBalanceListResult {
  summary: {
    totalStudentsWithCredit: number;
    totalCreditBalance: number;
    totalRefundRecords: number;
    totalRefundAmount: number;
  };
  balances: FinanceCreditBalanceRow[];
  recentRefunds: FinanceRefundRecord[];
}

export interface FinanceCashSession {
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
  recentCashRefunds: FinanceRefundRecord[];
}

export interface FinanceCashSessionListResult {
  activeSession: FinanceCashSession | null;
  sessions: FinanceCashSession[];
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
}

export interface FinanceClosingPeriodSummary {
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
}

export interface FinanceClosingPeriod {
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
  summary: FinanceClosingPeriodSummary;
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
}

export interface FinanceClosingPeriodListResult {
  periods: FinanceClosingPeriod[];
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
}

export interface FinanceClosingPeriodReopenRequest {
  id: number;
  requestNo: string;
  status: FinanceClosingPeriodReopenStatus;
  pendingActor: FinanceClosingPeriodReopenPendingActor;
  reason: string;
  requestedNote?: string | null;
  requestedAt: string;
  closingPeriod: Pick<
    FinanceClosingPeriod,
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
}

export interface FinanceClosingPeriodReopenRequestListResult {
  requests: FinanceClosingPeriodReopenRequest[];
  summary: {
    totalRequests: number;
    pendingHeadTuCount: number;
    pendingPrincipalCount: number;
    appliedCount: number;
    rejectedCount: number;
  };
}

export interface FinanceBankStatementEntry {
  id: number;
  entryDate: string;
  direction: FinanceBankStatementDirection;
  amount: number;
  referenceNo?: string | null;
  description?: string | null;
  status: 'MATCHED' | 'UNMATCHED';
  matchedPayment?: (FinanceInvoice['payments'][number] & {
    bankAccount?: FinanceBankAccount | null;
  }) | null;
  matchedRefund?: FinanceRefundRecord | null;
  createdAt: string;
  updatedAt: string;
}

export type FinanceBankSystemPayment = FinanceInvoice['payments'][number] & {
  bankAccount?: FinanceBankAccount | null;
  netBankAmount: number;
  matched: boolean;
};

export type FinanceBankSystemRefund = FinanceRefundRecord & {
  matched: boolean;
};

export interface FinanceBankReconciliation {
  id: number;
  reconciliationNo: string;
  status: FinanceBankReconciliationStatus;
  periodStart: string;
  periodEnd: string;
  statementOpeningBalance: number;
  statementClosingBalance: number;
  note?: string | null;
  bankAccount: FinanceBankAccount;
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
  statementEntries: FinanceBankStatementEntry[];
  systemPayments: FinanceBankSystemPayment[];
  systemRefunds: FinanceBankSystemRefund[];
}

export interface FinanceBankReconciliationListResult {
  reconciliations: FinanceBankReconciliation[];
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
}

export interface FinanceLedgerEntry {
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
  bankAccount?: FinanceBankAccount | null;
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
}

export interface FinanceLedgerBookSummary {
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
}

export interface FinanceLedgerBankAccountSummary {
  bankAccount: FinanceBankAccount;
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
}

export interface FinanceLedgerSnapshot {
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
  books: FinanceLedgerBookSummary[];
  bankAccounts: FinanceLedgerBankAccountSummary[];
  entries: FinanceLedgerEntry[];
}

export type FinancePaymentVerificationRow = FinanceInvoice['payments'][number] & {
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

export interface FinancePaymentVerificationListResult {
  payments: FinancePaymentVerificationRow[];
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
}

export interface FinanceInvoiceGenerationResult {
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
    gradeLevel?: string | null;
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

export type FinanceBudgetProgressStage =
  | 'PENDING_APPROVAL'
  | 'WAITING_REALIZATION'
  | 'WAITING_LPJ'
  | 'LPJ_PREPARATION'
  | 'FINANCE_REVIEW'
  | 'RETURNED_BY_FINANCE'
  | 'REALIZED'
  | 'REJECTED';

export interface FinanceBudgetRealizationDutyRecap {
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
}

export interface FinanceBudgetRealizationQueueRow {
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
}

export interface FinanceBudgetRealizationRecentRow {
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
}

export interface FinanceBudgetRealizationSnapshot {
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
  dutyRecap: FinanceBudgetRealizationDutyRecap[];
  followUpQueue: FinanceBudgetRealizationQueueRow[];
  recentRealizations: FinanceBudgetRealizationRecentRow[];
}

export type FinanceGovernanceArea = 'COLLECTION' | 'TREASURY' | 'APPROVAL' | 'BUDGET' | 'CLOSING';
export type FinanceGovernanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FinanceAuditArea = 'POLICY' | 'COLLECTION' | 'TREASURY' | 'APPROVAL';
export type FinanceAuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FinanceGovernanceFollowUpItem {
  key: string;
  category: FinanceGovernanceArea;
  severity: FinanceGovernanceSeverity;
  title: string;
  detail: string;
  amount: number;
  referenceLabel?: string | null;
  updatedAt?: string | null;
}

export interface FinanceGovernanceSummary {
  filters: {
    academicYearId: number | null;
    generatedAt: string;
  };
  overview: {
    riskLevel: FinanceGovernanceSeverity;
    dominantArea: FinanceGovernanceArea;
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
  followUpQueue: FinanceGovernanceFollowUpItem[];
}

export interface FinanceAuditSummary {
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
    category: FinanceAuditArea;
    severity: FinanceAuditSeverity;
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
}

export interface FinanceReportQueryParams {
  academicYearId?: number;
  semester?: SemesterCode;
  classId?: number;
  gradeLevel?: string;
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
  async listClassLevels(params?: { academicYearId?: number }) {
    const response = await api.get<ApiResponse<FinanceClassLevelListResult>>('/payments/class-levels', {
      params,
    });
    return response.data.data.levels || [];
  },

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
    lateFeeEnabled?: boolean;
    lateFeeMode?: FinanceLateFeeMode;
    lateFeeAmount?: number;
    lateFeeGraceDays?: number;
    lateFeeCapAmount?: number | null;
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
      lateFeeEnabled: boolean;
      lateFeeMode: FinanceLateFeeMode;
      lateFeeAmount: number;
      lateFeeGraceDays: number;
      lateFeeCapAmount: number | null;
      isActive: boolean;
    }>,
  ) {
    const response = await api.patch<ApiResponse<{ component: FinanceComponent }>>(
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
    const response = await api.post<ApiResponse<{ invoice: FinanceInvoice; lateFeeSummary?: FinanceInvoice['lateFeeSummary'] }>>(
      `/payments/invoices/${invoiceId}/late-fees/apply`,
      payload,
    );
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
    const response = await api.get<ApiResponse<{ tariffs: FinanceTariffRule[] }>>('/payments/tariffs', {
      params,
    });
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
    const response = await api.get<ApiResponse<{ adjustments: FinanceAdjustmentRule[] }>>(
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
    const response = await api.post<ApiResponse<{ adjustment: FinanceAdjustmentRule }>>(
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
    const response = await api.patch<ApiResponse<{ adjustment: FinanceAdjustmentRule }>>(
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
    installmentCount?: number;
    installmentIntervalDays?: number;
    autoApplyCreditBalance?: boolean;
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
    installmentCount?: number;
    installmentIntervalDays?: number;
    autoApplyCreditBalance?: boolean;
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
    gradeLevel?: string;
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
    const response = await api.patch<ApiResponse<{ invoice: FinanceInvoice }>>(
      `/payments/invoices/${invoiceId}/installments`,
      payload,
    );
    return response.data.data.invoice;
  },

  async listReports(params?: FinanceReportQueryParams) {
    const response = await api.get<ApiResponse<FinanceReportSnapshot>>('/payments/reports', { params });
    return response.data.data;
  },

  async getBudgetRealizationSummary(params?: {
    academicYearId?: number;
    additionalDuty?: string;
    limit?: number;
  }) {
    const response = await api.get<ApiResponse<FinanceBudgetRealizationSnapshot>>(
      '/payments/budget-realization',
      { params },
    );
    return response.data.data;
  },

  async getGovernanceSummary(params?: {
    academicYearId?: number;
    limit?: number;
  }) {
    const response = await api.get<ApiResponse<FinanceGovernanceSummary>>(
      '/payments/governance-summary',
      { params },
    );
    return response.data.data;
  },

  async getAuditSummary(params?: {
    days?: number;
    limit?: number;
  }) {
    const response = await api.get<ApiResponse<FinanceAuditSummary>>(
      '/payments/audit-summary',
      { params },
    );
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
      ApiResponse<FinanceReminderDispatchResult>
    >('/payments/reminders/dispatch', payload || {});
    return response.data.data;
  },

  async getReminderPolicy() {
    const response = await api.get<ApiResponse<{ policy: FinanceReminderPolicy }>>('/payments/reminder-policy');
    return response.data.data.policy;
  },

  async listBankAccounts(params?: { isActive?: boolean; search?: string }) {
    const response = await api.get<ApiResponse<{ accounts: FinanceBankAccount[] }>>('/payments/bank-accounts', {
      params,
    });
    return response.data.data.accounts;
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
    const response = await api.post<ApiResponse<{ account: FinanceBankAccount }>>(
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
    const response = await api.patch<ApiResponse<{ account: FinanceBankAccount }>>(
      `/payments/bank-accounts/${accountId}`,
      payload,
    );
    return response.data.data.account;
  },

  async updateReminderPolicy(payload: Partial<Omit<FinanceReminderPolicy, 'updatedAt'>>) {
    const response = await api.put<ApiResponse<{ policy: FinanceReminderPolicy }>>(
      '/payments/reminder-policy',
      payload,
    );
    return response.data.data.policy;
  },

  async payInvoice(
    invoiceId: number,
    payload: {
      amount: number;
      method: FinancePaymentMethod;
      bankAccountId?: number;
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
        allocatedAmount: number;
        creditedAmount: number;
        method: FinancePaymentMethod;
        verificationStatus: FinancePaymentVerificationStatus;
      };
      invoice: FinanceInvoice;
      creditBalance?: {
        id: number;
        balanceAmount: number;
        balanceBefore: number;
      } | null;
    }>>(`/payments/invoices/${invoiceId}/payments`, payload);

    return response.data.data;
  },

  async listPaymentVerifications(params?: {
    verificationStatus?: FinancePaymentVerificationStatus;
    bankAccountId?: number;
    matchedOnly?: boolean;
    search?: string;
    limit?: number;
  }) {
    const response = await api.get<ApiResponse<FinancePaymentVerificationListResult>>('/payments/payment-records', {
      params,
    });
    return response.data.data;
  },

  async verifyPayment(paymentId: number, payload?: { note?: string }) {
    const response = await api.post<
      ApiResponse<{
        payment: FinanceInvoice['payments'][number];
        invoice: FinanceInvoice;
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
    const response = await api.post<
      ApiResponse<{
        payment: FinanceInvoice['payments'][number];
      }>
    >(`/payments/payment-records/${paymentId}/reject`, payload || {});
    return response.data.data;
  },

  async listCredits(params?: { studentId?: number; search?: string; limit?: number }) {
    const response = await api.get<ApiResponse<FinanceCreditBalanceListResult>>('/payments/credits', {
      params,
    });
    return response.data.data;
  },

  async listBankReconciliations(params?: {
    bankAccountId?: number;
    status?: FinanceBankReconciliationStatus;
    limit?: number;
  }) {
    const response = await api.get<ApiResponse<FinanceBankReconciliationListResult>>(
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
    const response = await api.get<ApiResponse<FinanceLedgerSnapshot>>('/payments/ledger-books', {
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
    const response = await api.post<ApiResponse<{ reconciliation: FinanceBankReconciliation }>>(
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
    const response = await api.post<
      ApiResponse<{
        entry: FinanceBankStatementEntry;
        reconciliation: FinanceBankReconciliation;
      }>
    >(`/payments/bank-reconciliations/${reconciliationId}/entries`, payload);
    return response.data.data;
  },

  async finalizeBankReconciliation(reconciliationId: number, payload?: { note?: string }) {
    const response = await api.post<ApiResponse<{ reconciliation: FinanceBankReconciliation }>>(
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
    const response = await api.get<ApiResponse<FinanceCashSessionListResult>>('/payments/cash-sessions', {
      params,
    });
    return response.data.data;
  },

  async openCashSession(payload?: {
    businessDate?: string;
    openingBalance?: number;
    note?: string;
  }) {
    const response = await api.post<ApiResponse<{ session: FinanceCashSession }>>(
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
    const response = await api.post<ApiResponse<{ session: FinanceCashSession }>>(
      `/payments/cash-sessions/${sessionId}/close`,
      payload,
    );
    return response.data.data.session;
  },

  async getCashSessionApprovalPolicy() {
    const response = await api.get<ApiResponse<{ policy: FinanceCashSessionApprovalPolicy }>>(
      '/payments/cash-session-policy',
    );
    return response.data.data.policy;
  },

  async getClosingPeriodApprovalPolicy() {
    const response = await api.get<ApiResponse<{ policy: FinanceClosingPeriodApprovalPolicy }>>(
      '/payments/closing-period-policy',
    );
    return response.data.data.policy;
  },

  async updateCashSessionApprovalPolicy(
    payload: Partial<Omit<FinanceCashSessionApprovalPolicy, 'updatedAt'>>,
  ) {
    const response = await api.put<ApiResponse<{ policy: FinanceCashSessionApprovalPolicy }>>(
      '/payments/cash-session-policy',
      payload,
    );
    return response.data.data.policy;
  },

  async updateClosingPeriodApprovalPolicy(
    payload: Partial<Omit<FinanceClosingPeriodApprovalPolicy, 'updatedAt'>>,
  ) {
    const response = await api.put<ApiResponse<{ policy: FinanceClosingPeriodApprovalPolicy }>>(
      '/payments/closing-period-policy',
      payload,
    );
    return response.data.data.policy;
  },

  async decideCashSessionAsHeadTu(sessionId: number, payload: { approved: boolean; note?: string }) {
    const response = await api.post<ApiResponse<{ session: FinanceCashSession }>>(
      `/payments/cash-sessions/${sessionId}/head-tu-decision`,
      payload,
    );
    return response.data.data.session;
  },

  async decideCashSessionAsPrincipal(sessionId: number, payload: { approved: boolean; note?: string }) {
    const response = await api.post<ApiResponse<{ session: FinanceCashSession }>>(
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
    const response = await api.get<ApiResponse<FinanceClosingPeriodListResult>>('/payments/closing-periods', {
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
    const response = await api.get<ApiResponse<FinanceClosingPeriodReopenRequestListResult>>(
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
    const response = await api.post<
      ApiResponse<{ period: FinanceClosingPeriod; policy: FinanceClosingPeriodApprovalPolicy }>
    >('/payments/closing-periods', payload);
    return response.data.data;
  },

  async createClosingPeriodReopenRequest(periodId: number, payload: { reason: string; note?: string }) {
    const response = await api.post<ApiResponse<{ request: FinanceClosingPeriodReopenRequest }>>(
      `/payments/closing-periods/${periodId}/reopen-requests`,
      payload,
    );
    return response.data.data.request;
  },

  async decideClosingPeriodAsHeadTu(periodId: number, payload: { approved: boolean; note?: string }) {
    const response = await api.post<ApiResponse<{ period: FinanceClosingPeriod }>>(
      `/payments/closing-periods/${periodId}/head-tu-decision`,
      payload,
    );
    return response.data.data.period;
  },

  async decideClosingPeriodReopenAsHeadTu(requestId: number, payload: { approved: boolean; note?: string }) {
    const response = await api.post<ApiResponse<{ request: FinanceClosingPeriodReopenRequest }>>(
      `/payments/closing-period-reopen-requests/${requestId}/head-tu-decision`,
      payload,
    );
    return response.data.data.request;
  },

  async decideClosingPeriodAsPrincipal(periodId: number, payload: { approved: boolean; note?: string }) {
    const response = await api.post<ApiResponse<{ period: FinanceClosingPeriod }>>(
      `/payments/closing-periods/${periodId}/principal-decision`,
      payload,
    );
    return response.data.data.period;
  },

  async decideClosingPeriodReopenAsPrincipal(requestId: number, payload: { approved: boolean; note?: string }) {
    const response = await api.post<ApiResponse<{ request: FinanceClosingPeriodReopenRequest }>>(
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
    const response = await api.post<
      ApiResponse<{
        refund: FinanceRefundRecord;
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
    const response = await api.get<ApiResponse<FinanceWriteOffListResult>>('/payments/write-offs', {
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
    const response = await api.post<ApiResponse<{ request: FinanceWriteOffRequest }>>(
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
    const response = await api.post<ApiResponse<{ request: FinanceWriteOffRequest }>>(
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
    const response = await api.post<ApiResponse<{ request: FinanceWriteOffRequest }>>(
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
    const response = await api.post<ApiResponse<{ request: FinanceWriteOffRequest; invoice: FinanceInvoice }>>(
      `/payments/write-offs/${requestId}/apply`,
      payload || {},
    );
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
    const response = await api.get<ApiResponse<FinancePaymentReversalListResult>>('/payments/reversals', {
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
    const response = await api.post<ApiResponse<{ request: FinancePaymentReversalRequest }>>(
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
    const response = await api.post<ApiResponse<{ request: FinancePaymentReversalRequest }>>(
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
    const response = await api.post<ApiResponse<{ request: FinancePaymentReversalRequest }>>(
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
    const response = await api.post<
      ApiResponse<{ request: FinancePaymentReversalRequest; payment: FinanceInvoice['payments'][number]; invoice: FinanceInvoice }>
    >(`/payments/reversals/${requestId}/apply`, payload || {});
    return response.data.data;
  },
};
