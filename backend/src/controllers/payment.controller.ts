import {
  FinanceAdjustmentKind,
  FinanceCashSessionApprovalStatus,
  FinanceCashSessionStatus,
  FinanceCreditTransactionKind,
  FinanceComponentPeriodicity,
  FinanceInvoiceStatus,
  FinanceLateFeeMode,
  FinancePaymentMethod,
  FinancePaymentVerificationStatus,
  FinancePaymentSource,
  FinancePaymentReversalStatus,
  FinanceWriteOffStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  Semester,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { writeAuditLog } from '../utils/auditLog';

const listParentPaymentsQuerySchema = z.object({
  studentId: z.coerce.number().int().positive().optional(),
  student_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const listStudentPaymentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'PARTIAL', 'CANCELLED'];
const PAYMENT_TYPES: PaymentType[] = ['MONTHLY', 'ONE_TIME'];
const FINANCE_LEDGER_BOOKS = ['ALL', 'CASHBOOK', 'BANKBOOK'] as const;
const FINANCE_BANK_RECONCILIATION_STATUSES = ['OPEN', 'FINALIZED'] as const;
const FINANCE_BANK_STATEMENT_DIRECTIONS = ['CREDIT', 'DEBIT'] as const;
const FINANCE_BANK_STATEMENT_ENTRY_STATUSES = ['MATCHED', 'UNMATCHED'] as const;

type FinanceLedgerBook = (typeof FINANCE_LEDGER_BOOKS)[number];
type FinanceBankReconciliationStatus = (typeof FINANCE_BANK_RECONCILIATION_STATUSES)[number];
type FinanceBankStatementDirection = (typeof FINANCE_BANK_STATEMENT_DIRECTIONS)[number];
type FinanceBankStatementEntryStatus = (typeof FINANCE_BANK_STATEMENT_ENTRY_STATUSES)[number];

type StatusSummary = Record<PaymentStatus, { count: number; amount: number }>;
type TypeSummary = Record<PaymentType, { count: number; amount: number }>;

function createStatusSummary(): StatusSummary {
  return {
    PENDING: { count: 0, amount: 0 },
    PAID: { count: 0, amount: 0 },
    PARTIAL: { count: 0, amount: 0 },
    CANCELLED: { count: 0, amount: 0 },
  };
}

function createTypeSummary(): TypeSummary {
  return {
    MONTHLY: { count: 0, amount: 0 },
    ONE_TIME: { count: 0, amount: 0 },
  };
}

function normalizeFinanceCode(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function makeFinanceInvoiceNo(periodKey: string, studentId: number): string {
  const normalizedPeriod = periodKey.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `INV-${normalizedPeriod}-${studentId}-${ts}${rand}`;
}

function makeFinancePaymentNo(studentId: number): string {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `PAY-${studentId}-${ts}${rand}`;
}

function makeFinanceRefundNo(studentId: number): string {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `REF-${studentId}-${ts}${rand}`;
}

function makeFinancePaymentReversalNo(studentId: number): string {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `RVP-${studentId}-${ts}${rand}`;
}

function makeFinanceCashSessionNo(userId: number): string {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `CSH-${userId}-${ts}${rand}`;
}

function makeFinanceBankReconciliationNo(bankAccountId: number): string {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `BNK-${bankAccountId}-${ts}${rand}`;
}

function isFinanceBankTrackedMethod(method?: FinancePaymentMethod | null) {
  return (
    method === FinancePaymentMethod.BANK_TRANSFER ||
    method === FinancePaymentMethod.VIRTUAL_ACCOUNT ||
    method === FinancePaymentMethod.E_WALLET ||
    method === FinancePaymentMethod.QRIS
  );
}

function requiresFinancePaymentVerification(method?: FinancePaymentMethod | null) {
  return isFinanceBankTrackedMethod(method);
}

function normalizeFinanceReferenceKey(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function resolveFinancePaymentReversalAvailability(payment: {
  amount: number;
  allocatedAmount?: number | null;
  creditedAmount?: number | null;
  reversedAmount?: number | null;
  reversedAllocatedAmount?: number | null;
  reversedCreditedAmount?: number | null;
  source?: FinancePaymentSource | null;
  verificationStatus?: FinancePaymentVerificationStatus | null;
}) {
  const totalAmount = normalizeFinanceAmount(Number(payment.amount || 0));
  const allocatedAmount = normalizeFinanceAmount(Number(payment.allocatedAmount || 0));
  const creditedAmount = normalizeFinanceAmount(Number(payment.creditedAmount || 0));
  const reversedAmount = normalizeFinanceAmount(Number(payment.reversedAmount || 0));
  const reversedAllocatedAmount = normalizeFinanceAmount(Number(payment.reversedAllocatedAmount || 0));
  const reversedCreditedAmount = normalizeFinanceAmount(Number(payment.reversedCreditedAmount || 0));
  const remainingReversibleAmount = normalizeFinanceAmount(Math.max(totalAmount - reversedAmount, 0));
  const remainingAllocatedAmount = normalizeFinanceAmount(Math.max(allocatedAmount - reversedAllocatedAmount, 0));
  const remainingCreditedAmount = normalizeFinanceAmount(Math.max(creditedAmount - reversedCreditedAmount, 0));

  return {
    totalAmount,
    allocatedAmount,
    creditedAmount,
    reversedAmount,
    reversedAllocatedAmount,
    reversedCreditedAmount,
    remainingReversibleAmount,
    remainingAllocatedAmount,
    remainingCreditedAmount,
    isFullyReversed: remainingReversibleAmount <= 0,
    canRequestReversal:
      (payment.source || FinancePaymentSource.DIRECT) === FinancePaymentSource.DIRECT &&
      (payment.verificationStatus || FinancePaymentVerificationStatus.VERIFIED) ===
        FinancePaymentVerificationStatus.VERIFIED &&
      remainingReversibleAmount > 0,
  };
}

function makeFinanceWriteOffNo(studentId: number): string {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `WO-${studentId}-${ts}${rand}`;
}

function normalizeFinanceAmount(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isFinanceNonZeroAmount(value: number | null | undefined) {
  return Math.abs(Number(value || 0)) > 0.009;
}

function getFinanceEndOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function normalizeFinanceBusinessDateInput(value?: string | Date | null) {
  if (value instanceof Date) {
    return getFinanceStartOfDay(value);
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return getFinanceStartOfDay(new Date());
  }

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'Tanggal bisnis sesi kas tidak valid');
  }

  return getFinanceStartOfDay(parsed);
}

function inferFinanceWrittenOffAmount(params: {
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  writtenOffAmount?: number | null;
  status?: FinanceInvoiceStatus;
}) {
  if (params.status === 'CANCELLED') return 0;
  if (params.writtenOffAmount != null) {
    return normalizeFinanceAmount(Math.max(Number(params.writtenOffAmount || 0), 0));
  }

  return normalizeFinanceAmount(
    Math.max(
      Number(params.totalAmount || 0) - Number(params.paidAmount || 0) - Number(params.balanceAmount || 0),
      0,
    ),
  );
}

function calculateFinanceInvoiceBalanceAmount(params: {
  totalAmount: number;
  paidAmount: number;
  writtenOffAmount?: number;
  status?: FinanceInvoiceStatus;
}) {
  if (params.status === 'CANCELLED') return 0;
  return normalizeFinanceAmount(
    Math.max(
      Number(params.totalAmount || 0) -
        Number(params.paidAmount || 0) -
        Number(params.writtenOffAmount || 0),
      0,
    ),
  );
}

function calculateFinanceInvoiceStatus(params: {
  balanceAmount: number;
  paidAmount?: number;
  writtenOffAmount?: number;
  currentStatus?: FinanceInvoiceStatus;
}) {
  if (params.currentStatus === 'CANCELLED') return 'CANCELLED' as const;
  if (normalizeFinanceAmount(params.balanceAmount) <= 0) return 'PAID' as const;
  if (
    normalizeFinanceAmount(Number(params.paidAmount || 0)) > 0 ||
    normalizeFinanceAmount(Number(params.writtenOffAmount || 0)) > 0
  ) {
    return 'PARTIAL' as const;
  }
  return 'UNPAID' as const;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isSameFinanceDate(left?: Date | null, right?: Date | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function buildFinanceInstallmentPlan(params: {
  totalAmount: number;
  installmentCount?: number;
  firstDueDate?: Date | null;
  intervalDays?: number;
}) {
  const count = Math.max(1, Math.floor(Number(params.installmentCount || 1)));
  const intervalDays = Math.max(1, Math.floor(Number(params.intervalDays || 30)));
  const totalMinorUnits = Math.max(0, Math.round(normalizeFinanceAmount(params.totalAmount) * 100));
  const baseMinorUnits = Math.floor(totalMinorUnits / count);
  let remainderMinorUnits = totalMinorUnits - baseMinorUnits * count;
  const firstDueDate = params.firstDueDate ? new Date(params.firstDueDate) : null;

  return Array.from({ length: count }, (_, index) => {
    const extraMinorUnits = remainderMinorUnits > 0 ? 1 : 0;
    if (remainderMinorUnits > 0) {
      remainderMinorUnits -= 1;
    }

    return {
      sequence: index + 1,
      amount: normalizeFinanceAmount((baseMinorUnits + extraMinorUnits) / 100),
      dueDate: firstDueDate ? addDays(firstDueDate, index * intervalDays) : null,
    };
  });
}

type SerializedFinanceInstallment = {
  sequence: number;
  amount: number;
  dueDate: Date | null;
  paidAmount: number;
  writtenOffAmount: number;
  balanceAmount: number;
  status: FinanceInvoiceStatus;
  isOverdue: boolean;
  daysPastDue: number;
};

function serializeFinanceInstallments(params: {
  invoiceTotalAmount: number;
  invoicePaidAmount: number;
  invoiceBalanceAmount: number;
  invoiceStatus: FinanceInvoiceStatus;
  invoiceWrittenOffAmount?: number | null;
  invoiceDueDate?: Date | null;
  installments?: Array<{
    sequence: number;
    amount: number;
    dueDate?: Date | null;
  }> | null;
  asOfDate?: Date;
}) {
  const sourceInstallments =
    params.installments && params.installments.length > 0
      ? [...params.installments].sort((left, right) => left.sequence - right.sequence)
      : [
          {
            sequence: 1,
            amount: Number(params.invoiceTotalAmount || 0),
            dueDate: params.invoiceDueDate || null,
          },
        ];

  const today = params.asOfDate ? new Date(params.asOfDate) : new Date();
  today.setHours(0, 0, 0, 0);

  let remainingPaidAmount = normalizeFinanceAmount(params.invoicePaidAmount);
  let remainingWrittenOffAmount = inferFinanceWrittenOffAmount({
    totalAmount: params.invoiceTotalAmount,
    paidAmount: params.invoicePaidAmount,
    balanceAmount: params.invoiceBalanceAmount,
    writtenOffAmount: params.invoiceWrittenOffAmount,
    status: params.invoiceStatus,
  });

  return sourceInstallments.map((installment) => {
    const amount = normalizeFinanceAmount(installment.amount);
    const paidAmount =
      params.invoiceStatus === 'CANCELLED'
        ? 0
        : normalizeFinanceAmount(Math.min(remainingPaidAmount, amount));
    remainingPaidAmount = normalizeFinanceAmount(Math.max(remainingPaidAmount - paidAmount, 0));
    const remainingAfterPaid = normalizeFinanceAmount(Math.max(amount - paidAmount, 0));
    const writtenOffAmount =
      params.invoiceStatus === 'CANCELLED'
        ? 0
        : normalizeFinanceAmount(Math.min(remainingWrittenOffAmount, remainingAfterPaid));
    remainingWrittenOffAmount = normalizeFinanceAmount(
      Math.max(remainingWrittenOffAmount - writtenOffAmount, 0),
    );

    const dueDate = installment.dueDate ? new Date(installment.dueDate) : null;
    if (dueDate) {
      dueDate.setHours(0, 0, 0, 0);
    }

    const balanceAmount =
      params.invoiceStatus === 'CANCELLED'
        ? 0
        : normalizeFinanceAmount(Math.max(amount - paidAmount - writtenOffAmount, 0));

    let status: FinanceInvoiceStatus = 'UNPAID';
    if (params.invoiceStatus === 'CANCELLED') {
      status = 'CANCELLED';
    } else if (balanceAmount <= 0) {
      status = 'PAID';
    } else if (paidAmount > 0 || writtenOffAmount > 0) {
      status = 'PARTIAL';
    }

    const isOverdue =
      Boolean(dueDate) &&
      dueDate != null &&
      balanceAmount > 0 &&
      status !== 'PAID' &&
      status !== 'CANCELLED' &&
      dueDate.getTime() < today.getTime();

    const daysPastDue =
      dueDate && isOverdue
        ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000))
        : 0;

    return {
      sequence: installment.sequence,
      amount,
      dueDate,
      paidAmount,
      writtenOffAmount,
      balanceAmount,
      status,
      isOverdue,
      daysPastDue,
    };
  });
}

function buildFinanceInstallmentSummary(installments: SerializedFinanceInstallment[]) {
  const totalCount = installments.length;
  const paidCount = installments.filter((installment) => installment.status === 'PAID').length;
  const overdueInstallments = installments.filter((installment) => installment.isOverdue);
  const overdueCount = overdueInstallments.length;
  const overdueAmount = overdueInstallments.reduce(
    (sum, installment) => sum + Number(installment.balanceAmount || 0),
    0,
  );
  const nextInstallment =
    [...installments]
      .filter((installment) => installment.balanceAmount > 0)
      .sort((left, right) => {
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (leftDue !== rightDue) return leftDue - rightDue;
        return left.sequence - right.sequence;
      })[0] || null;

  return {
    totalCount,
    paidCount,
    overdueCount,
    overdueAmount: normalizeFinanceAmount(overdueAmount),
    nextInstallment: nextInstallment
      ? {
          sequence: nextInstallment.sequence,
          amount: normalizeFinanceAmount(nextInstallment.amount),
          dueDate: nextInstallment.dueDate || null,
          paidAmount: normalizeFinanceAmount(nextInstallment.paidAmount),
          writtenOffAmount: normalizeFinanceAmount(nextInstallment.writtenOffAmount),
          balanceAmount: normalizeFinanceAmount(nextInstallment.balanceAmount),
          status: nextInstallment.status,
          isOverdue: nextInstallment.isOverdue,
          daysPastDue: nextInstallment.daysPastDue,
        }
      : null,
  };
}

function resolveFinanceInvoiceDueDate(params: {
  invoiceTotalAmount: number;
  invoicePaidAmount: number;
  invoiceBalanceAmount: number;
  invoiceStatus: FinanceInvoiceStatus;
  invoiceWrittenOffAmount?: number | null;
  invoiceDueDate?: Date | null;
  installments?: Array<{
    sequence: number;
    amount: number;
    dueDate?: Date | null;
  }> | null;
}) {
  const serializedInstallments = serializeFinanceInstallments({
    invoiceTotalAmount: params.invoiceTotalAmount,
    invoicePaidAmount: params.invoicePaidAmount,
    invoiceBalanceAmount: params.invoiceBalanceAmount,
    invoiceStatus: params.invoiceStatus,
    invoiceWrittenOffAmount: params.invoiceWrittenOffAmount,
    invoiceDueDate: params.invoiceDueDate || null,
    installments: params.installments || [],
  });

  const nextInstallment =
    [...serializedInstallments]
      .filter((installment) => installment.balanceAmount > 0)
      .sort((left, right) => {
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (leftDue !== rightDue) return leftDue - rightDue;
        return left.sequence - right.sequence;
      })[0] || null;
  if (nextInstallment?.dueDate) {
    return nextInstallment.dueDate;
  }

  const datedInstallment = serializedInstallments.find((installment) => installment.dueDate);
  if (datedInstallment?.dueDate) {
    return datedInstallment.dueDate;
  }

  return params.invoiceDueDate || null;
}

type FinanceLateFeeInvoiceItemLike = {
  componentId?: number | null;
  componentCode?: string | null;
  componentName?: string | null;
  amount: number;
  component?: {
    id?: number | null;
    code?: string | null;
    name?: string | null;
    lateFeeEnabled?: boolean | null;
    lateFeeMode?: FinanceLateFeeMode | null;
    lateFeeAmount?: number | null;
    lateFeeGraceDays?: number | null;
    lateFeeCapAmount?: number | null;
  } | null;
};

function serializeFinanceInvoiceRecord<
  T extends {
    totalAmount: number;
    paidAmount: number;
    writtenOffAmount?: number | null;
    balanceAmount: number;
    status: FinanceInvoiceStatus;
    dueDate?: Date | null;
    installments?: Array<{
      sequence: number;
      amount: number;
      dueDate?: Date | null;
    }> | null;
    payments?: Array<{
      id: number;
      paymentNo: string;
      amount: number;
      allocatedAmount: number;
      creditedAmount: number;
      reversedAmount?: number | null;
      reversedAllocatedAmount?: number | null;
      reversedCreditedAmount?: number | null;
      source?: FinancePaymentSource | null;
      method: FinancePaymentMethod;
      referenceNo?: string | null;
      note?: string | null;
      paidAt: Date;
      createdAt?: Date;
      updatedAt?: Date;
    }>;
    items?: Array<FinanceLateFeeInvoiceItemLike>;
    writeOffRequests?: Array<{
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
      headTuApproved?: boolean | null;
      headTuDecisionAt?: Date | null;
      headTuDecisionNote?: string | null;
      principalApproved?: boolean | null;
      principalDecisionAt?: Date | null;
      principalDecisionNote?: string | null;
      appliedAt?: Date | null;
      applyNote?: string | null;
      createdAt: Date;
      updatedAt: Date;
      invoice?: {
        id: number;
        invoiceNo: string;
        periodKey: string;
        semester: Semester;
        title?: string | null;
        dueDate?: Date | null;
        totalAmount: number;
        paidAmount: number;
        writtenOffAmount?: number | null;
        balanceAmount: number;
        status: FinanceInvoiceStatus;
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
          level?: string | null;
        } | null;
      } | null;
      requestedBy?: {
        id: number;
        name: string;
        role?: string | null;
      } | null;
      headTuDecisionBy?: {
        id: number;
        name: string;
        role?: string | null;
      } | null;
      principalDecisionBy?: {
        id: number;
        name: string;
        role?: string | null;
      } | null;
      appliedBy?: {
        id: number;
        name: string;
        role?: string | null;
      } | null;
    }>;
  },
>(invoice: T, options?: { asOfDate?: Date }) {
  const totalAmount = Number(invoice.totalAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const balanceAmount = Number(invoice.balanceAmount || 0);
  const writtenOffAmount = inferFinanceWrittenOffAmount({
    totalAmount,
    paidAmount,
    balanceAmount,
    writtenOffAmount: invoice.writtenOffAmount,
    status: invoice.status,
  });
  const installments = serializeFinanceInstallments({
    invoiceTotalAmount: totalAmount,
    invoicePaidAmount: paidAmount,
    invoiceBalanceAmount: balanceAmount,
    invoiceStatus: invoice.status,
    invoiceWrittenOffAmount: writtenOffAmount,
    invoiceDueDate: invoice.dueDate || null,
    installments: invoice.installments || [],
    asOfDate: options?.asOfDate,
  });

  return {
    ...invoice,
    totalAmount,
    paidAmount,
    writtenOffAmount,
    balanceAmount,
    installmentSummary: buildFinanceInstallmentSummary(installments),
    lateFeeSummary: invoice.items ? buildFinanceLateFeeSummary(invoice, options?.asOfDate) : undefined,
    installments,
    payments: (invoice.payments || []).map((payment) => ({
      ...serializeFinancePaymentRecord({
        ...payment,
        createdAt: payment.createdAt || payment.paidAt,
        updatedAt: payment.updatedAt || payment.paidAt,
      }),
      paidAt: payment.paidAt,
    })),
    writeOffRequests: (invoice.writeOffRequests || []).map((request) =>
      serializeFinanceWriteOffRecord(request),
    ),
  };
}

type FinanceLateFeeBreakdown = {
  componentId: number;
  componentCode: string;
  componentName: string;
  mode: FinanceLateFeeMode;
  amount: number;
  graceDays: number;
  capAmount: number | null;
  overdueInstallmentCount: number;
  chargeableDays: number;
  calculatedAmount: number;
  appliedAmount: number;
  pendingAmount: number;
};

type FinanceLateFeeSummary = {
  configured: boolean;
  hasPending: boolean;
  overdueInstallmentCount: number;
  calculatedAmount: number;
  appliedAmount: number;
  pendingAmount: number;
  breakdown: FinanceLateFeeBreakdown[];
  asOfDate: Date;
};

function buildFinanceLateFeeSummary<
  T extends {
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    status: FinanceInvoiceStatus;
    dueDate?: Date | null;
    installments?: Array<{
      sequence: number;
      amount: number;
      dueDate?: Date | null;
    }> | null;
    items?: Array<FinanceLateFeeInvoiceItemLike>;
  },
>(invoice: T, asOfDate?: Date) {
  const invoiceItems = invoice.items || [];
  const snapshotDate = asOfDate ? new Date(asOfDate) : new Date();
  const serializedInstallments = serializeFinanceInstallments({
    invoiceTotalAmount: Number(invoice.totalAmount || 0),
    invoicePaidAmount: Number(invoice.paidAmount || 0),
    invoiceBalanceAmount: Number(invoice.balanceAmount || 0),
    invoiceStatus: invoice.status,
    invoiceWrittenOffAmount:
      'writtenOffAmount' in invoice
        ? Number((invoice as { writtenOffAmount?: number | null }).writtenOffAmount || 0)
        : undefined,
    invoiceDueDate: invoice.dueDate || null,
    installments: invoice.installments || [],
    asOfDate: snapshotDate,
  });

  const overdueInstallments = serializedInstallments.filter(
    (installment) => installment.balanceAmount > 0 && installment.isOverdue,
  );

  const appliedLateFeeMap = new Map<string, number>();
  for (const item of invoiceItems) {
    const componentCode = String(item.componentCode || item.component?.code || '');
    if (!componentCode.startsWith('LATE_FEE:')) continue;
    const originalCode = componentCode.replace(/^LATE_FEE:/, '');
    appliedLateFeeMap.set(
      originalCode,
      normalizeFinanceAmount((appliedLateFeeMap.get(originalCode) || 0) + Number(item.amount || 0)),
    );
  }

  const configuredComponents = new Map<
    string,
    {
      componentId: number;
      componentCode: string;
      componentName: string;
      mode: FinanceLateFeeMode;
      amount: number;
      graceDays: number;
      capAmount: number | null;
    }
  >();

  for (const item of invoiceItems) {
    if (Number(item.amount || 0) <= 0) continue;
    if (!item.component) continue;
    if (!item.component.lateFeeEnabled || Number(item.component.lateFeeAmount || 0) <= 0) continue;
    const componentCode = String(item.component.code || item.componentCode || '');
    if (!componentCode) continue;
    if (configuredComponents.has(componentCode)) continue;
    configuredComponents.set(componentCode, {
      componentId: Number(item.component.id || item.componentId || 0),
      componentCode,
      componentName: String(item.component.name || item.componentName || 'Komponen'),
      mode: item.component.lateFeeMode || FinanceLateFeeMode.FIXED,
      amount: normalizeFinanceAmount(Number(item.component.lateFeeAmount || 0)),
      graceDays: Math.max(0, Math.trunc(Number(item.component.lateFeeGraceDays || 0))),
      capAmount:
        item.component.lateFeeCapAmount == null
          ? null
          : normalizeFinanceAmount(Number(item.component.lateFeeCapAmount || 0)),
    });
  }

  const breakdown = Array.from(configuredComponents.values())
    .map<FinanceLateFeeBreakdown>((component) => {
      let chargeableInstallmentCount = 0;
      let chargeableDays = 0;
      let calculatedAmount = 0;

      for (const installment of overdueInstallments) {
        const overdueDays = Math.max(0, Number(installment.daysPastDue || 0));
        const effectiveDays = Math.max(overdueDays - component.graceDays, 0);
        if (effectiveDays <= 0) continue;

        chargeableInstallmentCount += 1;
        chargeableDays += effectiveDays;

        const rawAmount =
          component.mode === FinanceLateFeeMode.DAILY
            ? normalizeFinanceAmount(component.amount * effectiveDays)
            : component.amount;

        calculatedAmount +=
          component.capAmount != null
            ? Math.min(rawAmount, component.capAmount)
            : rawAmount;
      }

      calculatedAmount = normalizeFinanceAmount(calculatedAmount);
      const appliedAmount = normalizeFinanceAmount(
        Number(appliedLateFeeMap.get(component.componentCode) || 0),
      );
      const pendingAmount = normalizeFinanceAmount(Math.max(calculatedAmount - appliedAmount, 0));

      return {
        componentId: component.componentId,
        componentCode: component.componentCode,
        componentName: component.componentName,
        mode: component.mode,
        amount: component.amount,
        graceDays: component.graceDays,
        capAmount: component.capAmount,
        overdueInstallmentCount: chargeableInstallmentCount,
        chargeableDays,
        calculatedAmount,
        appliedAmount,
        pendingAmount,
      };
    })
    .filter((item) => item.calculatedAmount > 0 || item.appliedAmount > 0)
    .sort((left, right) => right.pendingAmount - left.pendingAmount || left.componentName.localeCompare(right.componentName));

  const calculatedAmount = normalizeFinanceAmount(
    breakdown.reduce((sum, item) => sum + Number(item.calculatedAmount || 0), 0),
  );
  const appliedAmount = normalizeFinanceAmount(
    breakdown.reduce((sum, item) => sum + Number(item.appliedAmount || 0), 0),
  );
  const pendingAmount = normalizeFinanceAmount(
    breakdown.reduce((sum, item) => sum + Number(item.pendingAmount || 0), 0),
  );

  return {
    configured: configuredComponents.size > 0,
    hasPending: pendingAmount > 0,
    overdueInstallmentCount: overdueInstallments.length,
    calculatedAmount,
    appliedAmount,
    pendingAmount,
    breakdown,
    asOfDate: snapshotDate,
  };
}

function resolveFinanceRouteByRole(role: string, studentId: number): string {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'PARENT') return `/parent/finance?childId=${studentId}`;
  if (normalized === 'STUDENT') return '/student/finance';
  return '/notifications';
}

function serializeFinancePaymentRecord(payment: {
  id: number;
  paymentNo?: string | null;
  amount: number;
  allocatedAmount?: number | null;
  creditedAmount?: number | null;
  reversedAmount?: number | null;
  reversedAllocatedAmount?: number | null;
  reversedCreditedAmount?: number | null;
  source?: FinancePaymentSource | null;
  method?: FinancePaymentMethod | null;
  verificationStatus?: FinancePaymentVerificationStatus | null;
  verificationNote?: string | null;
  verifiedAt?: Date | null;
  referenceNo?: string | null;
  note?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  invoice?: {
    id: number;
    invoiceNo: string;
    periodKey?: string | null;
    semester?: Semester | null;
  } | null;
  bankAccount?: {
    id: number;
    code: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
  } | null;
  verifiedBy?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
  bankStatementEntries?: Array<{
    id: number;
    entryDate: Date;
    amount: number;
    direction: FinanceBankStatementDirection;
    referenceNo?: string | null;
    status: FinanceBankStatementEntryStatus;
    reconciliation?: {
      id: number;
      reconciliationNo: string;
    } | null;
  }> | null;
}) {
  const reversal = resolveFinancePaymentReversalAvailability(payment);
  const verificationStatus =
    payment.verificationStatus || FinancePaymentVerificationStatus.VERIFIED;
  const matchedStatementEntry = (payment.bankStatementEntries || [])[0] || null;

  return {
    id: payment.id,
    paymentNo: payment.paymentNo || null,
    amount: Number(payment.amount || 0),
    allocatedAmount: Number(payment.allocatedAmount || 0),
    creditedAmount: Number(payment.creditedAmount || 0),
    reversedAmount: reversal.reversedAmount,
    reversedAllocatedAmount: reversal.reversedAllocatedAmount,
    reversedCreditedAmount: reversal.reversedCreditedAmount,
    remainingReversibleAmount: reversal.remainingReversibleAmount,
    remainingAllocatedAmount: reversal.remainingAllocatedAmount,
    remainingCreditedAmount: reversal.remainingCreditedAmount,
    isFullyReversed: reversal.isFullyReversed,
    canRequestReversal: reversal.canRequestReversal,
    source: payment.source || FinancePaymentSource.DIRECT,
    method: payment.method || null,
    verificationStatus,
    verificationNote: payment.verificationNote || null,
    verifiedAt: payment.verifiedAt || null,
    verifiedBy: payment.verifiedBy
      ? {
          id: payment.verifiedBy.id,
          name: payment.verifiedBy.name,
          role: payment.verifiedBy.role || null,
        }
      : null,
    referenceNo: payment.referenceNo || null,
    note: payment.note || null,
    invoiceId: payment.invoice?.id || null,
    invoiceNo: payment.invoice?.invoiceNo || null,
    periodKey: payment.invoice?.periodKey || null,
    semester: payment.invoice?.semester || null,
    bankAccount: payment.bankAccount
      ? {
          id: payment.bankAccount.id,
          code: payment.bankAccount.code,
          bankName: payment.bankAccount.bankName,
          accountName: payment.bankAccount.accountName,
          accountNumber: payment.bankAccount.accountNumber,
        }
      : null,
    matchedStatementEntry: matchedStatementEntry
      ? {
          id: matchedStatementEntry.id,
          entryDate: matchedStatementEntry.entryDate,
          amount: Number(matchedStatementEntry.amount || 0),
          direction: matchedStatementEntry.direction,
          referenceNo: matchedStatementEntry.referenceNo || null,
          status: matchedStatementEntry.status,
          reconciliation: matchedStatementEntry.reconciliation
            ? {
                id: matchedStatementEntry.reconciliation.id,
                reconciliationNo: matchedStatementEntry.reconciliation.reconciliationNo,
              }
            : null,
        }
      : null,
    createdAt: payment.paidAt || payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function serializeFinanceRefundRecord(refund: {
  id: number;
  refundNo: string;
  amount: number;
  method: FinancePaymentMethod;
  referenceNo?: string | null;
  note?: string | null;
  refundedAt: Date;
  createdAt: Date;
  student: {
    id: number;
    name: string;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
      level?: string | null;
    } | null;
  };
  createdBy?: {
    id: number;
    name: string;
  } | null;
  bankAccount?: {
    id: number;
    code: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
  } | null;
}) {
  return {
    id: refund.id,
    refundNo: refund.refundNo,
    amount: Number(refund.amount || 0),
    method: refund.method,
    referenceNo: refund.referenceNo || null,
    note: refund.note || null,
    refundedAt: refund.refundedAt,
    createdAt: refund.createdAt,
    student: refund.student,
    createdBy: refund.createdBy || null,
    bankAccount: refund.bankAccount
      ? {
          id: refund.bankAccount.id,
          code: refund.bankAccount.code,
          bankName: refund.bankAccount.bankName,
          accountName: refund.bankAccount.accountName,
          accountNumber: refund.bankAccount.accountNumber,
        }
      : null,
  };
}

function serializeFinanceBankAccount(bankAccount: {
  id: number;
  code: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: bankAccount.id,
    code: bankAccount.code,
    bankName: bankAccount.bankName,
    accountName: bankAccount.accountName,
    accountNumber: bankAccount.accountNumber,
    branch: bankAccount.branch || null,
    notes: bankAccount.notes || null,
    isActive: Boolean(bankAccount.isActive),
    label: `${bankAccount.bankName} • ${bankAccount.accountNumber}`,
    createdAt: bankAccount.createdAt,
    updatedAt: bankAccount.updatedAt,
  };
}

type SerializedFinanceBankStatementEntry = {
  id: number;
  entryDate: Date;
  direction: FinanceBankStatementDirection;
  amount: number;
  referenceNo: string | null;
  description: string | null;
  status: FinanceBankStatementEntryStatus;
  matchedPayment: ReturnType<typeof serializeFinancePaymentRecord> | null;
  matchedRefund: ReturnType<typeof serializeFinanceRefundRecord> | null;
  createdAt: Date;
  updatedAt: Date;
};

type SerializedFinanceBankSystemPayment = ReturnType<typeof serializeFinancePaymentRecord> & {
  netBankAmount: number;
  matched: boolean;
};

type SerializedFinanceBankSystemRefund = ReturnType<typeof serializeFinanceRefundRecord> & {
  matched: boolean;
};

type SerializedFinanceBankReconciliationSummary = {
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

type SerializedFinanceBankReconciliation = {
  id: number;
  reconciliationNo: string;
  status: FinanceBankReconciliationStatus;
  periodStart: Date;
  periodEnd: Date;
  statementOpeningBalance: number;
  statementClosingBalance: number;
  note: string | null;
  bankAccount: ReturnType<typeof serializeFinanceBankAccount>;
  createdBy: {
    id: number;
    name: string;
    role: string;
  } | null;
  finalizedBy: {
    id: number;
    name: string;
    role: string;
  } | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  summary: SerializedFinanceBankReconciliationSummary;
  statementEntries: SerializedFinanceBankStatementEntry[];
  systemPayments: SerializedFinanceBankSystemPayment[];
  systemRefunds: SerializedFinanceBankSystemRefund[];
};

type SerializedFinanceLedgerEntry = {
  id: string;
  sourceType: 'PAYMENT' | 'REFUND';
  book: Exclude<FinanceLedgerBook, 'ALL'>;
  direction: 'IN' | 'OUT';
  transactionDate: Date;
  transactionNo: string | null;
  amount: number;
  affectsBalance: boolean;
  runningBalance: number;
  accountRunningBalance: number | null;
  referenceNo: string | null;
  note: string | null;
  method: FinancePaymentMethod | null;
  verificationStatus: FinancePaymentVerificationStatus | null;
  matched: boolean;
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
  } | null;
  invoice: {
    id: number;
    invoiceNo: string;
    periodKey?: string | null;
    semester?: Semester | null;
  } | null;
  bankAccount: ReturnType<typeof serializeFinanceBankAccount> | null;
  matchedStatementEntry: {
    id: number;
    entryDate: Date;
    amount: number;
    direction: FinanceBankStatementDirection;
    referenceNo: string | null;
    status: FinanceBankStatementEntryStatus;
    reconciliation: {
      id: number;
      reconciliationNo: string;
    } | null;
  } | null;
};

type SerializedFinanceLedgerBookSummary = {
  book: Exclude<FinanceLedgerBook, 'ALL'>;
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

type SerializedFinanceLedgerBankAccountSummary = {
  bankAccount: ReturnType<typeof serializeFinanceBankAccount>;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  pendingVerificationAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
  entryCount: number;
  latestFinalizedReconciliation: {
    id: number;
    reconciliationNo: string;
    periodEnd: Date;
    statementClosingBalance: number;
    finalizedAt: Date | null;
  } | null;
};

type SerializedFinanceLedgerSnapshot = {
  filters: {
    book: FinanceLedgerBook;
    bankAccountId: number | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    search: string | null;
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
  books: SerializedFinanceLedgerBookSummary[];
  bankAccounts: SerializedFinanceLedgerBankAccountSummary[];
  entries: SerializedFinanceLedgerEntry[];
};

type SerializedFinanceCashSessionSummary = {
  expectedCashIn: number;
  expectedCashOut: number;
  expectedClosingBalance: number;
  totalCashPayments: number;
  totalCashRefunds: number;
  recentCashPayments: Array<{
    id: number;
    paymentNo: string | null;
    amount: number;
    netCashAmount: number;
    reversedAmount: number;
    paidAt: Date | null;
    student: {
      id: number;
      name: string;
      username: string;
      nis?: string | null;
      nisn?: string | null;
      studentClass?: {
        id: number;
        name: string;
        level?: string | null;
      } | null;
    } | null;
    invoice: {
      id: number;
      invoiceNo: string;
      periodKey: string;
      semester: Semester;
    } | null;
  }>;
  recentCashRefunds: Array<ReturnType<typeof serializeFinanceRefundRecord>>;
};

type SerializedFinanceCashSession = {
  id: number;
  sessionNo: string;
  businessDate: Date;
  status: FinanceCashSessionStatus;
  approvalStatus: FinanceCashSessionApprovalStatus;
  pendingActor: FinanceCashSessionPendingActor;
  openingBalance: number;
  expectedCashIn: number;
  expectedCashOut: number;
  expectedClosingBalance: number;
  actualClosingBalance: number | null;
  varianceAmount: number | null;
  totalCashPayments: number;
  totalCashRefunds: number;
  openedAt: Date;
  closedAt: Date | null;
  openingNote: string | null;
  closingNote: string | null;
  headTuDecision: {
    approved: boolean | null;
    decidedAt: Date | null;
    note: string | null;
    by: {
      id: number;
      name: string;
      role: string | null;
    } | null;
  };
  principalDecision: {
    approved: boolean | null;
    decidedAt: Date | null;
    note: string | null;
    by: {
      id: number;
      name: string;
      role: string | null;
    } | null;
  };
  openedBy: {
    id: number;
    name: string;
    role: string | null;
  } | null;
  closedBy: {
    id: number;
    name: string;
    role: string | null;
  } | null;
  recentCashPayments: SerializedFinanceCashSessionSummary['recentCashPayments'];
  recentCashRefunds: SerializedFinanceCashSessionSummary['recentCashRefunds'];
};

function serializeFinanceCashSessionRecord(
  session: {
    id: number;
    sessionNo: string;
    businessDate: Date;
    status: FinanceCashSessionStatus;
    approvalStatus?: FinanceCashSessionApprovalStatus | null;
    openingBalance: number;
    expectedCashIn?: number | null;
    expectedCashOut?: number | null;
    expectedClosingBalance?: number | null;
    actualClosingBalance?: number | null;
    varianceAmount?: number | null;
    totalCashPayments?: number | null;
    totalCashRefunds?: number | null;
    openedAt: Date;
    closedAt?: Date | null;
    openingNote?: string | null;
    closingNote?: string | null;
    headTuApproved?: boolean | null;
    headTuDecisionAt?: Date | null;
    headTuDecisionNote?: string | null;
    principalApproved?: boolean | null;
    principalDecisionAt?: Date | null;
    principalDecisionNote?: string | null;
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
    headTuDecisionBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    principalDecisionBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  },
  summary?: SerializedFinanceCashSessionSummary | null,
): SerializedFinanceCashSession {
  const resolvedSummary =
    summary ||
    ({
      expectedCashIn: Number(session.expectedCashIn || 0),
      expectedCashOut: Number(session.expectedCashOut || 0),
      expectedClosingBalance: Number(session.expectedClosingBalance || 0),
      totalCashPayments: Number(session.totalCashPayments || 0),
      totalCashRefunds: Number(session.totalCashRefunds || 0),
      recentCashPayments: [],
      recentCashRefunds: [],
    } satisfies SerializedFinanceCashSessionSummary);

  return {
    id: session.id,
    sessionNo: session.sessionNo,
    businessDate: session.businessDate,
    status: session.status,
    approvalStatus: session.approvalStatus || FinanceCashSessionApprovalStatus.NOT_SUBMITTED,
    pendingActor: getFinanceCashSessionPendingActor(
      session.approvalStatus || FinanceCashSessionApprovalStatus.NOT_SUBMITTED,
    ),
    openingBalance: Number(session.openingBalance || 0),
    expectedCashIn: normalizeFinanceAmount(resolvedSummary.expectedCashIn),
    expectedCashOut: normalizeFinanceAmount(resolvedSummary.expectedCashOut),
    expectedClosingBalance: normalizeFinanceAmount(resolvedSummary.expectedClosingBalance),
    actualClosingBalance:
      session.actualClosingBalance == null ? null : normalizeFinanceAmount(Number(session.actualClosingBalance || 0)),
    varianceAmount:
      session.varianceAmount == null ? null : normalizeFinanceAmount(Number(session.varianceAmount || 0)),
    totalCashPayments: Number(resolvedSummary.totalCashPayments || 0),
    totalCashRefunds: Number(resolvedSummary.totalCashRefunds || 0),
    openedAt: session.openedAt,
    closedAt: session.closedAt || null,
    openingNote: session.openingNote || null,
    closingNote: session.closingNote || null,
    headTuDecision: {
      approved: session.headTuApproved ?? null,
      decidedAt: session.headTuDecisionAt || null,
      note: session.headTuDecisionNote || null,
      by: session.headTuDecisionBy
        ? {
            id: session.headTuDecisionBy.id,
            name: session.headTuDecisionBy.name,
            role: session.headTuDecisionBy.role || null,
          }
        : null,
    },
    principalDecision: {
      approved: session.principalApproved ?? null,
      decidedAt: session.principalDecisionAt || null,
      note: session.principalDecisionNote || null,
      by: session.principalDecisionBy
        ? {
            id: session.principalDecisionBy.id,
            name: session.principalDecisionBy.name,
            role: session.principalDecisionBy.role || null,
          }
        : null,
    },
    openedBy: session.openedBy
      ? {
          id: session.openedBy.id,
          name: session.openedBy.name,
          role: session.openedBy.role || null,
        }
      : null,
    closedBy: session.closedBy
      ? {
          id: session.closedBy.id,
          name: session.closedBy.name,
          role: session.closedBy.role || null,
        }
      : null,
    recentCashPayments: resolvedSummary.recentCashPayments,
    recentCashRefunds: resolvedSummary.recentCashRefunds,
  };
}

type FinancePaymentReversalPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'FINANCE_APPLY' | 'NONE';

function getFinancePaymentReversalPendingActor(
  status: FinancePaymentReversalStatus,
): FinancePaymentReversalPendingActor {
  if (status === FinancePaymentReversalStatus.PENDING_HEAD_TU) return 'HEAD_TU';
  if (status === FinancePaymentReversalStatus.PENDING_PRINCIPAL) return 'PRINCIPAL';
  if (status === FinancePaymentReversalStatus.APPROVED) return 'FINANCE_APPLY';
  return 'NONE';
}

function serializeFinancePaymentReversalRecord<
  T extends {
    id: number;
    requestNo: string;
    paymentId: number;
    invoiceId: number;
    studentId: number;
    requestedAmount: number;
    requestedAllocatedAmount?: number | null;
    requestedCreditedAmount?: number | null;
    approvedAmount?: number | null;
    approvedAllocatedAmount?: number | null;
    approvedCreditedAmount?: number | null;
    appliedAmount?: number | null;
    appliedAllocatedAmount?: number | null;
    appliedCreditedAmount?: number | null;
    reason: string;
    requestedNote?: string | null;
    status: FinancePaymentReversalStatus;
    headTuApproved?: boolean | null;
    headTuDecisionAt?: Date | null;
    headTuDecisionNote?: string | null;
    principalApproved?: boolean | null;
    principalDecisionAt?: Date | null;
    principalDecisionNote?: string | null;
    appliedAt?: Date | null;
    applyNote?: string | null;
    createdAt: Date;
    updatedAt: Date;
    payment?: {
      id: number;
      paymentNo?: string | null;
      amount: number;
      allocatedAmount?: number | null;
      creditedAmount?: number | null;
      reversedAmount?: number | null;
      reversedAllocatedAmount?: number | null;
      reversedCreditedAmount?: number | null;
      source?: FinancePaymentSource | null;
      method?: FinancePaymentMethod | null;
      referenceNo?: string | null;
      note?: string | null;
      paidAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null;
    invoice?: {
      id: number;
      invoiceNo: string;
      periodKey: string;
      semester: Semester;
      title?: string | null;
      dueDate?: Date | null;
      totalAmount: number;
      paidAmount: number;
      writtenOffAmount?: number | null;
      balanceAmount: number;
      status: FinanceInvoiceStatus;
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
        level?: string | null;
      } | null;
    } | null;
    requestedBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    headTuDecisionBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    principalDecisionBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    appliedBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  },
>(request: T) {
  const payment = request.payment ? serializeFinancePaymentRecord(request.payment) : null;

  return {
    id: request.id,
    requestNo: request.requestNo,
    paymentId: request.paymentId,
    invoiceId: request.invoiceId,
    studentId: request.studentId,
    requestedAmount: Number(request.requestedAmount || 0),
    requestedAllocatedAmount: Number(request.requestedAllocatedAmount || 0),
    requestedCreditedAmount: Number(request.requestedCreditedAmount || 0),
    approvedAmount:
      request.approvedAmount == null ? null : Number(request.approvedAmount || 0),
    approvedAllocatedAmount:
      request.approvedAllocatedAmount == null ? null : Number(request.approvedAllocatedAmount || 0),
    approvedCreditedAmount:
      request.approvedCreditedAmount == null ? null : Number(request.approvedCreditedAmount || 0),
    appliedAmount:
      request.appliedAmount == null ? null : Number(request.appliedAmount || 0),
    appliedAllocatedAmount:
      request.appliedAllocatedAmount == null ? null : Number(request.appliedAllocatedAmount || 0),
    appliedCreditedAmount:
      request.appliedCreditedAmount == null ? null : Number(request.appliedCreditedAmount || 0),
    reason: request.reason,
    requestedNote: request.requestedNote || null,
    status: request.status,
    pendingActor: getFinancePaymentReversalPendingActor(request.status),
    remainingEligibleAmount: payment?.remainingReversibleAmount || 0,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    headTuDecision: {
      approved: request.headTuApproved ?? null,
      decidedAt: request.headTuDecisionAt || null,
      note: request.headTuDecisionNote || null,
      by: request.headTuDecisionBy || null,
    },
    principalDecision: {
      approved: request.principalApproved ?? null,
      decidedAt: request.principalDecisionAt || null,
      note: request.principalDecisionNote || null,
      by: request.principalDecisionBy || null,
    },
    application: {
      appliedAt: request.appliedAt || null,
      note: request.applyNote || null,
      by: request.appliedBy || null,
    },
    requestedBy: request.requestedBy || null,
    student: request.student || null,
    payment,
    invoice: request.invoice
      ? {
          ...request.invoice,
          totalAmount: Number(request.invoice.totalAmount || 0),
          paidAmount: Number(request.invoice.paidAmount || 0),
          writtenOffAmount: inferFinanceWrittenOffAmount({
            totalAmount: Number(request.invoice.totalAmount || 0),
            paidAmount: Number(request.invoice.paidAmount || 0),
            balanceAmount: Number(request.invoice.balanceAmount || 0),
            writtenOffAmount: request.invoice.writtenOffAmount,
            status: request.invoice.status,
          }),
          balanceAmount: Number(request.invoice.balanceAmount || 0),
        }
      : null,
  };
}

type FinanceWriteOffPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'FINANCE_APPLY' | 'NONE';

function getFinanceWriteOffPendingActor(status: FinanceWriteOffStatus): FinanceWriteOffPendingActor {
  if (status === FinanceWriteOffStatus.PENDING_HEAD_TU) return 'HEAD_TU';
  if (status === FinanceWriteOffStatus.PENDING_PRINCIPAL) return 'PRINCIPAL';
  if (status === FinanceWriteOffStatus.APPROVED) return 'FINANCE_APPLY';
  return 'NONE';
}

function serializeFinanceWriteOffRecord<
  T extends {
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
    headTuApproved?: boolean | null;
    headTuDecisionAt?: Date | null;
    headTuDecisionNote?: string | null;
    principalApproved?: boolean | null;
    principalDecisionAt?: Date | null;
    principalDecisionNote?: string | null;
    appliedAt?: Date | null;
    applyNote?: string | null;
    createdAt: Date;
    updatedAt: Date;
    invoice?: {
      id: number;
      invoiceNo: string;
      periodKey: string;
      semester: Semester;
      title?: string | null;
      dueDate?: Date | null;
      totalAmount: number;
      paidAmount: number;
      writtenOffAmount?: number | null;
      balanceAmount: number;
      status: FinanceInvoiceStatus;
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
        level?: string | null;
      } | null;
    } | null;
    requestedBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    headTuDecisionBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    principalDecisionBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
    appliedBy?: {
      id: number;
      name: string;
      role?: string | null;
    } | null;
  },
>(request: T) {
  const requestedAmount = normalizeFinanceAmount(Number(request.requestedAmount || 0));
  const approvedAmount =
    request.approvedAmount == null ? null : normalizeFinanceAmount(Number(request.approvedAmount || 0));
  const appliedAmount =
    request.appliedAmount == null ? null : normalizeFinanceAmount(Number(request.appliedAmount || 0));
  const invoiceBalanceAmount = request.invoice ? normalizeFinanceAmount(Number(request.invoice.balanceAmount || 0)) : 0;
  const invoiceWrittenOffAmount = request.invoice
    ? inferFinanceWrittenOffAmount({
        totalAmount: Number(request.invoice.totalAmount || 0),
        paidAmount: Number(request.invoice.paidAmount || 0),
        balanceAmount: Number(request.invoice.balanceAmount || 0),
        writtenOffAmount: request.invoice.writtenOffAmount,
        status: request.invoice.status,
      })
    : 0;
  const baseAmount = approvedAmount ?? requestedAmount;
  const remainingEligibleAmount =
    request.status === FinanceWriteOffStatus.APPLIED || request.status === FinanceWriteOffStatus.REJECTED
      ? 0
      : normalizeFinanceAmount(Math.min(baseAmount, invoiceBalanceAmount));

  return {
    id: request.id,
    requestNo: request.requestNo,
    invoiceId: request.invoiceId,
    studentId: request.studentId,
    requestedAmount,
    approvedAmount,
    appliedAmount,
    reason: request.reason,
    requestedNote: request.requestedNote || null,
    status: request.status,
    pendingActor: getFinanceWriteOffPendingActor(request.status),
    remainingEligibleAmount,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    headTuDecision: {
      approved: request.headTuApproved ?? null,
      decidedAt: request.headTuDecisionAt || null,
      note: request.headTuDecisionNote || null,
      by: request.headTuDecisionBy || null,
    },
    principalDecision: {
      approved: request.principalApproved ?? null,
      decidedAt: request.principalDecisionAt || null,
      note: request.principalDecisionNote || null,
      by: request.principalDecisionBy || null,
    },
    application: {
      appliedAt: request.appliedAt || null,
      note: request.applyNote || null,
      by: request.appliedBy || null,
    },
    requestedBy: request.requestedBy || null,
    student: request.student || null,
    invoice: request.invoice
      ? {
          id: request.invoice.id,
          invoiceNo: request.invoice.invoiceNo,
          periodKey: request.invoice.periodKey,
          semester: request.invoice.semester,
          title: request.invoice.title || null,
          dueDate: request.invoice.dueDate || null,
          totalAmount: Number(request.invoice.totalAmount || 0),
          paidAmount: Number(request.invoice.paidAmount || 0),
          writtenOffAmount: invoiceWrittenOffAmount,
          balanceAmount: invoiceBalanceAmount,
          status: request.invoice.status,
        }
      : null,
  };
}

type FinanceNotificationRecipient = {
  userId: number;
  role: string;
};

async function getFinanceNotificationRecipients(studentId: number): Promise<FinanceNotificationRecipient[]> {
  const studentWithParents = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
      parents: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

  if (!studentWithParents) return [];

  const recipients = [
    { userId: studentWithParents.id, role: studentWithParents.role },
    ...studentWithParents.parents.map((parent) => ({
      userId: parent.id,
      role: parent.role,
    })),
  ];

  const uniqueByUserId = new Map<number, FinanceNotificationRecipient>();
  for (const recipient of recipients) {
    if (!uniqueByUserId.has(recipient.userId)) {
      uniqueByUserId.set(recipient.userId, recipient);
    }
  }
  return Array.from(uniqueByUserId.values());
}

async function createFinanceNotifications(params: {
  studentId: number;
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
}) {
  const recipients = await getFinanceNotificationRecipients(params.studentId);
  if (!recipients.length) return;

  const rows = recipients.map((recipient) => ({
    userId: recipient.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    data: {
      ...(params.data || {}),
      module: 'FINANCE',
      studentId: params.studentId,
      route: resolveFinanceRouteByRole(recipient.role, params.studentId),
    },
  })) as Prisma.NotificationCreateManyInput[];

  await prisma.notification.createMany({ data: rows });
}

const DEFAULT_FINANCE_REMINDER_POLICY = {
  isActive: true,
  dueSoonDays: 3,
  dueSoonRepeatIntervalDays: 1,
  overdueRepeatIntervalDays: 3,
  lateFeeWarningEnabled: true,
  lateFeeWarningRepeatIntervalDays: 3,
  escalationEnabled: true,
  escalationStartDays: 7,
  escalationRepeatIntervalDays: 3,
  escalationMinOutstandingAmount: 0,
  sendStudentReminder: true,
  sendParentReminder: true,
  escalateToFinanceStaff: true,
  escalateToHeadTu: true,
  escalateToPrincipal: false,
  notes: null as string | null,
} as const;

const DEFAULT_FINANCE_CASH_SESSION_APPROVAL_POLICY = {
  zeroVarianceAutoApproved: true,
  requireVarianceNote: true,
  principalApprovalThresholdAmount: 100000,
  notes: null as string | null,
} as const;

type FinanceReminderMode = 'ALL' | 'DUE_SOON' | 'OVERDUE' | 'LATE_FEE' | 'ESCALATION';
type FinanceCashSessionPendingActor = 'HEAD_TU' | 'PRINCIPAL' | 'NONE';

type SerializedFinanceReminderPolicy = {
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
  notes: string | null;
  updatedAt: Date;
};

type DispatchFinanceDueReminderOptions = {
  dueSoonDays?: number;
  mode?: FinanceReminderMode;
  preview?: boolean;
  now?: Date;
};

type SerializedFinanceCashSessionApprovalPolicy = {
  zeroVarianceAutoApproved: boolean;
  requireVarianceNote: boolean;
  principalApprovalThresholdAmount: number;
  notes: string | null;
  updatedAt: Date;
};

function getFinanceStartOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function normalizeReminderIntervalDays(value: number, fallback: number) {
  const normalized = Math.trunc(Number(value || 0));
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return Math.min(30, normalized);
}

function serializeFinanceReminderPolicy(policy: {
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
  updatedAt: Date;
}): SerializedFinanceReminderPolicy {
  return {
    isActive: Boolean(policy.isActive),
    dueSoonDays: Math.max(0, Math.min(30, Math.trunc(Number(policy.dueSoonDays || 0)))),
    dueSoonRepeatIntervalDays: normalizeReminderIntervalDays(policy.dueSoonRepeatIntervalDays, 1),
    overdueRepeatIntervalDays: normalizeReminderIntervalDays(policy.overdueRepeatIntervalDays, 3),
    lateFeeWarningEnabled: Boolean(policy.lateFeeWarningEnabled),
    lateFeeWarningRepeatIntervalDays: normalizeReminderIntervalDays(
      policy.lateFeeWarningRepeatIntervalDays,
      3,
    ),
    escalationEnabled: Boolean(policy.escalationEnabled),
    escalationStartDays: Math.max(1, Math.min(180, Math.trunc(Number(policy.escalationStartDays || 0)))),
    escalationRepeatIntervalDays: normalizeReminderIntervalDays(policy.escalationRepeatIntervalDays, 3),
    escalationMinOutstandingAmount: normalizeFinanceAmount(
      Math.max(0, Number(policy.escalationMinOutstandingAmount || 0)),
    ),
    sendStudentReminder: Boolean(policy.sendStudentReminder),
    sendParentReminder: Boolean(policy.sendParentReminder),
    escalateToFinanceStaff: Boolean(policy.escalateToFinanceStaff),
    escalateToHeadTu: Boolean(policy.escalateToHeadTu),
    escalateToPrincipal: Boolean(policy.escalateToPrincipal),
    notes: policy.notes?.trim() ? policy.notes.trim() : null,
    updatedAt: policy.updatedAt,
  };
}

async function ensureFinanceReminderPolicy() {
  const policy = await prisma.financeReminderPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      ...DEFAULT_FINANCE_REMINDER_POLICY,
    },
  });

  return serializeFinanceReminderPolicy(policy);
}

function serializeFinanceCashSessionApprovalPolicy(policy: {
  zeroVarianceAutoApproved: boolean;
  requireVarianceNote: boolean;
  principalApprovalThresholdAmount: number;
  notes?: string | null;
  updatedAt: Date;
}): SerializedFinanceCashSessionApprovalPolicy {
  return {
    zeroVarianceAutoApproved: Boolean(policy.zeroVarianceAutoApproved),
    requireVarianceNote: Boolean(policy.requireVarianceNote),
    principalApprovalThresholdAmount: normalizeFinanceAmount(
      Math.max(0, Number(policy.principalApprovalThresholdAmount || 0)),
    ),
    notes: policy.notes?.trim() ? policy.notes.trim() : null,
    updatedAt: policy.updatedAt,
  };
}

async function ensureFinanceCashSessionApprovalPolicy() {
  const policy = await prisma.financeCashSessionApprovalPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      ...DEFAULT_FINANCE_CASH_SESSION_APPROVAL_POLICY,
    },
  });

  return serializeFinanceCashSessionApprovalPolicy(policy);
}

function getFinanceCashSessionPendingActor(
  approvalStatus: FinanceCashSessionApprovalStatus,
): FinanceCashSessionPendingActor {
  if (approvalStatus === FinanceCashSessionApprovalStatus.PENDING_HEAD_TU) return 'HEAD_TU';
  if (approvalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL) return 'PRINCIPAL';
  return 'NONE';
}

function resolveFinanceCashSessionCloseApprovalStatus(
  policy: SerializedFinanceCashSessionApprovalPolicy,
  varianceAmount: number,
): FinanceCashSessionApprovalStatus {
  if (!isFinanceNonZeroAmount(varianceAmount) && policy.zeroVarianceAutoApproved) {
    return FinanceCashSessionApprovalStatus.AUTO_APPROVED;
  }

  return FinanceCashSessionApprovalStatus.PENDING_HEAD_TU;
}

async function hasRecentFinanceNotification(params: {
  userId: number;
  type: string;
  since: Date;
  invoiceNo: string;
}) {
  const row = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      type: params.type,
      createdAt: { gte: params.since },
      message: { contains: params.invoiceNo },
    },
    select: { id: true },
  });

  return Boolean(row);
}

type FinanceEscalationRecipient = {
  userId: number;
  role: string;
  ptkType?: string | null;
  additionalDuties?: string[] | null;
};

function resolveFinanceEscalationRoute(recipient: FinanceEscalationRecipient) {
  const normalizedRole = String(recipient.role || '').toUpperCase();
  const normalizedPtkType = String(recipient.ptkType || '').toUpperCase();
  const duties = (recipient.additionalDuties || []).map((duty) => String(duty || '').trim().toUpperCase());

  if (normalizedRole === 'PRINCIPAL') return '/principal/dashboard';
  if (
    normalizedRole === 'ADMIN' ||
    (normalizedRole === 'STAFF' && normalizedPtkType === 'STAFF_KEUANGAN') ||
    duties.includes('BENDAHARA')
  ) {
    return '/staff/finance';
  }
  if (normalizedRole === 'STAFF' && (normalizedPtkType === 'KEPALA_TU' || normalizedPtkType === 'KEPALA_TATA_USAHA')) {
    return '/staff/admin';
  }
  return '/notifications';
}

async function listFinanceEscalationRecipients(
  policy: SerializedFinanceReminderPolicy,
): Promise<FinanceEscalationRecipient[]> {
  const clauses: Prisma.UserWhereInput[] = [];

  if (policy.escalateToFinanceStaff) {
    clauses.push({ role: 'ADMIN' });
    clauses.push({ role: 'STAFF', ptkType: 'STAFF_KEUANGAN' });
    clauses.push({ additionalDuties: { has: 'BENDAHARA' } });
  }

  if (policy.escalateToHeadTu) {
    clauses.push({ role: 'STAFF', ptkType: 'KEPALA_TU' });
    clauses.push({ role: 'STAFF', ptkType: 'KEPALA_TATA_USAHA' });
  }

  if (policy.escalateToPrincipal) {
    clauses.push({ role: 'PRINCIPAL' });
  }

  if (!clauses.length) return [];

  const users = await prisma.user.findMany({
    where: { OR: clauses },
    select: {
      id: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
    },
  });

  const uniqueByUserId = new Map<number, FinanceEscalationRecipient>();
  for (const user of users) {
    if (!uniqueByUserId.has(user.id)) {
      uniqueByUserId.set(user.id, {
        userId: user.id,
        role: user.role,
        ptkType: user.ptkType,
        additionalDuties: (user.additionalDuties || []).map((duty) => String(duty)),
      });
    }
  }

  return Array.from(uniqueByUserId.values());
}

type FinanceInternalNotificationScope = 'FINANCE' | 'HEAD_TU' | 'PRINCIPAL';

function resolveFinanceInternalRoute(recipient: FinanceEscalationRecipient) {
  const normalizedRole = String(recipient.role || '').toUpperCase();
  const normalizedPtkType = String(recipient.ptkType || '').toUpperCase();
  const duties = (recipient.additionalDuties || []).map((duty) => String(duty || '').trim().toUpperCase());

  if (normalizedRole === 'PRINCIPAL') return '/principal/approvals';
  if (normalizedRole === 'STAFF' && (normalizedPtkType === 'KEPALA_TU' || normalizedPtkType === 'KEPALA_TATA_USAHA')) {
    return '/staff/head-tu/finance';
  }
  if (
    normalizedRole === 'ADMIN' ||
    (normalizedRole === 'STAFF' && normalizedPtkType === 'STAFF_KEUANGAN') ||
    duties.includes('BENDAHARA')
  ) {
    return '/staff/finance';
  }
  return '/notifications';
}

async function listFinanceInternalRecipients(
  scopes: FinanceInternalNotificationScope[],
): Promise<FinanceEscalationRecipient[]> {
  const clauses: Prisma.UserWhereInput[] = [];

  if (scopes.includes('FINANCE')) {
    clauses.push({ role: 'ADMIN' });
    clauses.push({ role: 'STAFF', ptkType: 'STAFF_KEUANGAN' });
    clauses.push({ additionalDuties: { has: 'BENDAHARA' } });
  }

  if (scopes.includes('HEAD_TU')) {
    clauses.push({ role: 'STAFF', ptkType: 'KEPALA_TU' });
    clauses.push({ role: 'STAFF', ptkType: 'KEPALA_TATA_USAHA' });
  }

  if (scopes.includes('PRINCIPAL')) {
    clauses.push({ role: 'PRINCIPAL' });
  }

  if (!clauses.length) return [];

  const users = await prisma.user.findMany({
    where: { OR: clauses },
    select: {
      id: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
    },
  });

  const uniqueByUserId = new Map<number, FinanceEscalationRecipient>();
  for (const user of users) {
    if (!uniqueByUserId.has(user.id)) {
      uniqueByUserId.set(user.id, {
        userId: user.id,
        role: user.role,
        ptkType: user.ptkType,
        additionalDuties: (user.additionalDuties || []).map((duty) => String(duty)),
      });
    }
  }

  return Array.from(uniqueByUserId.values());
}

async function createFinanceInternalNotifications(params: {
  scopes: FinanceInternalNotificationScope[];
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
}) {
  const recipients = await listFinanceInternalRecipients(params.scopes);
  if (!recipients.length) return;

  const rows = recipients.map((recipient) => ({
    userId: recipient.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    data: {
      ...(params.data || {}),
      module: 'FINANCE',
      route: resolveFinanceInternalRoute(recipient),
    },
  })) as Prisma.NotificationCreateManyInput[];

  await prisma.notification.createMany({ data: rows });
}

export async function dispatchFinanceDueReminders(options: DispatchFinanceDueReminderOptions = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const todayStart = getFinanceStartOfDay(now);
  const policy = await ensureFinanceReminderPolicy();
  const dueSoonDays = Math.max(
    0,
    Math.min(30, Math.trunc(Number(options.dueSoonDays ?? policy.dueSoonDays))),
  );
  const mode: FinanceReminderMode = options.mode || 'ALL';
  const preview = !!options.preview;

  const shouldProcessDueSoon = mode === 'ALL' || mode === 'DUE_SOON';
  const shouldProcessOverdue = mode === 'ALL' || mode === 'OVERDUE';
  const shouldProcessLateFee =
    (mode === 'ALL' || mode === 'LATE_FEE') && policy.lateFeeWarningEnabled;
  const shouldProcessEscalation = (mode === 'ALL' || mode === 'ESCALATION') && policy.escalationEnabled;

  if (!policy.isActive && mode === 'ALL') {
    return {
      checkedInvoices: 0,
      targetedRecipients: 0,
      dueSoonInvoices: 0,
      overdueInvoices: 0,
      lateFeeWarningInvoices: 0,
      escalatedInvoices: 0,
      createdNotifications: 0,
      previewNotifications: 0,
      skippedAlreadyNotified: 0,
      dueSoonDays,
      mode,
      preview,
      runAt: now.toISOString(),
      disabledByPolicy: true,
      policy,
    };
  }

  const escalationRecipients = shouldProcessEscalation
    ? await listFinanceEscalationRecipients(policy)
    : [];

  const invoices = await prisma.financeInvoice.findMany({
    where: {
      status: { in: ['UNPAID', 'PARTIAL'] },
      balanceAmount: { gt: 0 },
      dueDate: { not: null },
    },
    select: {
      id: true,
      invoiceNo: true,
      studentId: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      status: true,
      semester: true,
      periodKey: true,
      title: true,
      installments: {
        select: {
          sequence: true,
          amount: true,
          dueDate: true,
        },
        orderBy: { sequence: 'asc' },
      },
      items: {
        select: {
          componentId: true,
          componentCode: true,
          componentName: true,
          amount: true,
          component: {
            select: {
              id: true,
              code: true,
              name: true,
              lateFeeEnabled: true,
              lateFeeMode: true,
              lateFeeAmount: true,
              lateFeeGraceDays: true,
              lateFeeCapAmount: true,
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          role: true,
          parents: {
            select: {
              id: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });

  let dueSoonCount = 0;
  let overdueCount = 0;
  let lateFeeWarningCount = 0;
  let escalatedCount = 0;
  let skippedAlreadyNotified = 0;
  let targeted = 0;
  const rows: Prisma.NotificationCreateManyInput[] = [];

  for (const invoice of invoices) {
    if (!invoice.dueDate) continue;

    const dueDate = new Date(invoice.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const dayDiff = Math.floor((dueDate.getTime() - todayStart.getTime()) / 86_400_000);
    const isDueSoon = dayDiff >= 0 && dayDiff <= dueSoonDays;
    const isOverdue = dayDiff < 0;

    const absDays = Math.abs(dayDiff);
    const externalRecipients = (() => {
      const recipients: FinanceNotificationRecipient[] = [];
      if (policy.sendStudentReminder) {
        recipients.push({ userId: invoice.student.id, role: invoice.student.role });
      }
      if (policy.sendParentReminder) {
        recipients.push(
          ...invoice.student.parents.map((parent) => ({ userId: parent.id, role: parent.role })),
        );
      }
      const uniqueByUserId = new Map<number, FinanceNotificationRecipient>();
      for (const recipient of recipients) {
        if (!uniqueByUserId.has(recipient.userId)) {
          uniqueByUserId.set(recipient.userId, recipient);
        }
      }
      return Array.from(uniqueByUserId.values());
    })();

    if (shouldProcessDueSoon && isDueSoon) {
      dueSoonCount += 1;
      const title = 'Pengingat Jatuh Tempo Tagihan';
      const message = `Tagihan ${invoice.invoiceNo} akan jatuh tempo ${
        dayDiff === 0 ? 'hari ini' : `${dayDiff} hari lagi`
      }. Sisa tagihan Rp${Math.round(Number(invoice.balanceAmount || 0)).toLocaleString('id-ID')}.`;
      const since = addDays(todayStart, -Math.max(0, policy.dueSoonRepeatIntervalDays - 1));

      for (const recipient of externalRecipients) {
        targeted += 1;
        const alreadyNotified = await hasRecentFinanceNotification({
          userId: recipient.userId,
          type: 'FINANCE_DUE_SOON_REMINDER',
          since,
          invoiceNo: invoice.invoiceNo,
        });
        if (alreadyNotified) {
          skippedAlreadyNotified += 1;
          continue;
        }
        rows.push({
          userId: recipient.userId,
          type: 'FINANCE_DUE_SOON_REMINDER',
          title,
          message,
          data: {
            module: 'FINANCE',
            invoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            dueDate: invoice.dueDate,
            daysUntilDue: dayDiff,
            daysPastDue: 0,
            semester: invoice.semester,
            periodKey: invoice.periodKey,
            route: resolveFinanceRouteByRole(recipient.role, invoice.studentId),
            studentId: invoice.studentId,
            title: invoice.title || null,
          },
        });
      }
    }

    if (shouldProcessOverdue && isOverdue) {
      overdueCount += 1;
      const title = 'Tagihan Lewat Jatuh Tempo';
      const message = `Tagihan ${invoice.invoiceNo} sudah lewat jatuh tempo ${absDays} hari. Sisa tagihan Rp${Math.round(
        Number(invoice.balanceAmount || 0),
      ).toLocaleString('id-ID')}.`;
      const since = addDays(todayStart, -Math.max(0, policy.overdueRepeatIntervalDays - 1));

      for (const recipient of externalRecipients) {
        targeted += 1;
        const alreadyNotified = await hasRecentFinanceNotification({
          userId: recipient.userId,
          type: 'FINANCE_OVERDUE_REMINDER',
          since,
          invoiceNo: invoice.invoiceNo,
        });
        if (alreadyNotified) {
          skippedAlreadyNotified += 1;
          continue;
        }
        rows.push({
          userId: recipient.userId,
          type: 'FINANCE_OVERDUE_REMINDER',
          title,
          message,
          data: {
            module: 'FINANCE',
            invoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            dueDate: invoice.dueDate,
            daysUntilDue: dayDiff,
            daysPastDue: absDays,
            semester: invoice.semester,
            periodKey: invoice.periodKey,
            route: resolveFinanceRouteByRole(recipient.role, invoice.studentId),
            studentId: invoice.studentId,
            title: invoice.title || null,
          },
        });
      }
    }

    const lateFeeSummary =
      shouldProcessLateFee || shouldProcessEscalation
        ? buildFinanceLateFeeSummary(
            {
              totalAmount: Number(invoice.totalAmount || 0),
              paidAmount: Number(invoice.paidAmount || 0),
              balanceAmount: Number(invoice.balanceAmount || 0),
              status: invoice.status,
              dueDate: invoice.dueDate,
              installments: invoice.installments,
              items: invoice.items,
            },
            now,
          )
        : null;

    if (shouldProcessLateFee && lateFeeSummary?.hasPending) {
      lateFeeWarningCount += 1;
      const title = 'Peringatan Denda Keterlambatan';
      const message = `Tagihan ${invoice.invoiceNo} sudah melewati grace period dan berpotensi dikenai denda Rp${Math.round(
        Number(lateFeeSummary.pendingAmount || 0),
      ).toLocaleString('id-ID')}. Sisa tagihan Rp${Math.round(Number(invoice.balanceAmount || 0)).toLocaleString('id-ID')}.`;
      const since = addDays(
        todayStart,
        -Math.max(0, policy.lateFeeWarningRepeatIntervalDays - 1),
      );

      for (const recipient of externalRecipients) {
        targeted += 1;
        const alreadyNotified = await hasRecentFinanceNotification({
          userId: recipient.userId,
          type: 'FINANCE_LATE_FEE_WARNING',
          since,
          invoiceNo: invoice.invoiceNo,
        });
        if (alreadyNotified) {
          skippedAlreadyNotified += 1;
          continue;
        }
        rows.push({
          userId: recipient.userId,
          type: 'FINANCE_LATE_FEE_WARNING',
          title,
          message,
          data: {
            module: 'FINANCE',
            invoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            dueDate: invoice.dueDate,
            daysUntilDue: dayDiff,
            daysPastDue: absDays,
            semester: invoice.semester,
            periodKey: invoice.periodKey,
            pendingLateFeeAmount: lateFeeSummary.pendingAmount,
            calculatedLateFeeAmount: lateFeeSummary.calculatedAmount,
            route: resolveFinanceRouteByRole(recipient.role, invoice.studentId),
            studentId: invoice.studentId,
            title: invoice.title || null,
          },
        });
      }
    }

    const isEscalationCandidate =
      shouldProcessEscalation &&
      isOverdue &&
      absDays >= policy.escalationStartDays &&
      Number(invoice.balanceAmount || 0) >= Number(policy.escalationMinOutstandingAmount || 0);

    if (isEscalationCandidate) {
      escalatedCount += 1;
      const title = 'Eskalasi Tunggakan Keuangan';
      const pendingLateFeeAmount = Number(lateFeeSummary?.pendingAmount || 0);
      const message = `Siswa ${invoice.student.name} memiliki tagihan ${invoice.invoiceNo} overdue ${absDays} hari dengan sisa Rp${Math.round(
        Number(invoice.balanceAmount || 0),
      ).toLocaleString('id-ID')}${
        pendingLateFeeAmount > 0
          ? ` dan potensi denda Rp${Math.round(pendingLateFeeAmount).toLocaleString('id-ID')}`
          : ''
      }.`;
      const since = addDays(
        todayStart,
        -Math.max(0, policy.escalationRepeatIntervalDays - 1),
      );

      for (const recipient of escalationRecipients) {
        targeted += 1;
        const alreadyNotified = await hasRecentFinanceNotification({
          userId: recipient.userId,
          type: 'FINANCE_ESCALATION_REMINDER',
          since,
          invoiceNo: invoice.invoiceNo,
        });
        if (alreadyNotified) {
          skippedAlreadyNotified += 1;
          continue;
        }
        rows.push({
          userId: recipient.userId,
          type: 'FINANCE_ESCALATION_REMINDER',
          title,
          message,
          data: {
            module: 'FINANCE',
            invoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            dueDate: invoice.dueDate,
            daysPastDue: absDays,
            semester: invoice.semester,
            periodKey: invoice.periodKey,
            pendingLateFeeAmount,
            escalationStartDays: policy.escalationStartDays,
            route: resolveFinanceEscalationRoute(recipient),
            studentId: invoice.studentId,
            studentName: invoice.student.name,
            title: invoice.title || null,
          },
        });
      }
    }
  }

  if (!preview && rows.length > 0) {
    await prisma.notification.createMany({ data: rows });
  }

  return {
    checkedInvoices: invoices.length,
    targetedRecipients: targeted,
    dueSoonInvoices: dueSoonCount,
    overdueInvoices: overdueCount,
    lateFeeWarningInvoices: lateFeeWarningCount,
    escalatedInvoices: escalatedCount,
    createdNotifications: preview ? 0 : rows.length,
    previewNotifications: preview ? rows.length : 0,
    skippedAlreadyNotified,
    dueSoonDays,
    mode,
    preview,
    runAt: now.toISOString(),
    disabledByPolicy: !policy.isActive,
    policy,
  };
}

type FinanceActorContext = {
  id: number;
  role: string;
  ptkType: string | null;
  additionalDuties: string[];
  isFinanceStaff: boolean;
  isHeadTu: boolean;
  isPrincipal: boolean;
};

async function loadFinanceActorContext(authUser: { id?: number; role?: string }) {
  const userId = Number(authUser?.id || 0);
  if (!userId) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
    },
  });

  if (!user) {
    throw new ApiError(401, 'Data pengguna tidak ditemukan');
  }

  const duties = (user.additionalDuties || []).map((duty) => String(duty).toUpperCase());
  const isFinanceStaff =
    user.role === 'ADMIN' ||
    (user.role === 'STAFF' && user.ptkType === 'STAFF_KEUANGAN') ||
    duties.includes('BENDAHARA');

  const isHeadTu =
    user.role === 'STAFF' &&
    (user.ptkType === 'KEPALA_TU' || user.ptkType === 'KEPALA_TATA_USAHA');
  const isPrincipal = user.role === 'PRINCIPAL';

  return {
    id: user.id,
    role: user.role,
    ptkType: user.ptkType || null,
    additionalDuties: duties,
    isFinanceStaff,
    isHeadTu,
    isPrincipal,
  } satisfies FinanceActorContext;
}

async function ensureFinanceActor(
  authUser: { id?: number; role?: string },
  options?: { allowPrincipalReadOnly?: boolean; allowHeadTuReadOnly?: boolean },
) {
  const user = await loadFinanceActorContext(authUser);
  const isPrincipalReadOnly = options?.allowPrincipalReadOnly && user.isPrincipal;
  const isHeadTuReadOnly = options?.allowHeadTuReadOnly && user.isHeadTu;

  if (!user.isFinanceStaff && !isPrincipalReadOnly && !isHeadTuReadOnly) {
    throw new ApiError(403, 'Akses staff keuangan dibutuhkan untuk fitur ini');
  }

  return user;
}

async function ensureFinanceHeadTuActor(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isHeadTu) {
    throw new ApiError(403, 'Akses Kepala TU dibutuhkan untuk persetujuan finance');
  }
  return user;
}

async function ensureFinancePrincipalActor(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isPrincipal) {
    throw new ApiError(403, 'Akses kepala sekolah dibutuhkan untuk persetujuan finance');
  }
  return user;
}

async function ensureFinanceWriteOffViewer(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isFinanceStaff && !user.isHeadTu && !user.isPrincipal) {
    throw new ApiError(403, 'Akses finance monitoring dibutuhkan untuk melihat write-off');
  }
  return user;
}

async function ensureFinancePaymentReversalViewer(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isFinanceStaff && !user.isHeadTu && !user.isPrincipal) {
    throw new ApiError(403, 'Akses finance monitoring dibutuhkan untuk melihat reversal pembayaran');
  }
  return user;
}

async function ensureFinanceCashSessionViewer(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isFinanceStaff && !user.isHeadTu && !user.isPrincipal) {
    throw new ApiError(403, 'Akses finance monitoring dibutuhkan untuk melihat settlement kas harian');
  }
  return user;
}

async function ensureFinanceBankReconciliationViewer(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isFinanceStaff && !user.isHeadTu && !user.isPrincipal) {
    throw new ApiError(403, 'Akses finance monitoring dibutuhkan untuk melihat rekonsiliasi bank');
  }
  return user;
}

async function ensureFinancePaymentVerificationViewer(authUser: { id?: number; role?: string }) {
  const user = await loadFinanceActorContext(authUser);
  if (!user.isFinanceStaff && !user.isHeadTu && !user.isPrincipal) {
    throw new ApiError(403, 'Akses finance monitoring dibutuhkan untuk melihat verifikasi pembayaran');
  }
  return user;
}

async function resolveFinanceBankAccountForTransaction(
  db: Prisma.TransactionClient | typeof prisma,
  method: FinancePaymentMethod,
  bankAccountId?: number,
) {
  if (method === FinancePaymentMethod.CASH) {
    if (bankAccountId != null) {
      throw new ApiError(400, 'Transaksi tunai tidak boleh memakai rekening bank');
    }
    return null;
  }

  if (!bankAccountId) {
    if (isFinanceBankTrackedMethod(method)) {
      throw new ApiError(400, 'Rekening bank wajib dipilih untuk transaksi non-tunai ini');
    }
    return null;
  }

  const bankAccount = await db.financeBankAccount.findUnique({
    where: { id: bankAccountId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!bankAccount || !bankAccount.isActive) {
    throw new ApiError(400, 'Rekening bank tidak valid atau sudah nonaktif');
  }

  return bankAccount;
}

async function settleFinanceVerifiedPayment(
  db: Prisma.TransactionClient | typeof prisma,
  params: {
    paymentId: number;
    actorId: number;
    verificationStatus?: FinancePaymentVerificationStatus;
    verificationNote?: string | null;
    verifiedAt?: Date;
  },
) {
  const payment = await db.financePayment.findUnique({
    where: { id: params.paymentId },
    include: {
      invoice: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              username: true,
              nis: true,
              nisn: true,
            },
          },
          items: {
            include: {
              component: {
                select: {
                  periodicity: true,
                },
              },
            },
          },
          installments: {
            select: {
              id: true,
              sequence: true,
              amount: true,
              dueDate: true,
            },
            orderBy: [{ sequence: 'asc' }],
          },
        },
      },
      bankAccount: {
        select: {
          id: true,
          code: true,
          bankName: true,
          accountName: true,
          accountNumber: true,
        },
      },
      verifiedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      bankStatementEntries: {
        select: {
          id: true,
          entryDate: true,
          amount: true,
          direction: true,
          referenceNo: true,
          status: true,
          reconciliation: {
            select: {
              id: true,
              reconciliationNo: true,
            },
          },
        },
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  });

  if (!payment) {
    throw new ApiError(404, 'Pembayaran tidak ditemukan');
  }

  if (payment.invoice.status === 'CANCELLED') {
    throw new ApiError(400, 'Tagihan sudah dibatalkan sehingga pembayaran tidak bisa diverifikasi');
  }

  if (
    payment.verificationStatus === FinancePaymentVerificationStatus.VERIFIED &&
    (Number(payment.allocatedAmount || 0) > 0 || Number(payment.creditedAmount || 0) > 0)
  ) {
    throw new ApiError(400, 'Pembayaran ini sudah diverifikasi');
  }

  if (payment.verificationStatus === FinancePaymentVerificationStatus.REJECTED) {
    throw new ApiError(400, 'Pembayaran yang sudah ditolak tidak bisa diverifikasi');
  }

  const outstanding = Number(payment.invoice.balanceAmount || 0);
  const allocatedAmount = Math.min(Number(payment.amount || 0), outstanding);
  const creditedAmount = Math.max(Number(payment.amount || 0) - outstanding, 0);

  const paidAmount = normalizeFinanceAmount(Number(payment.invoice.paidAmount || 0) + allocatedAmount);
  const writtenOffAmount = inferFinanceWrittenOffAmount({
    totalAmount: Number(payment.invoice.totalAmount || 0),
    paidAmount: Number(payment.invoice.paidAmount || 0),
    balanceAmount: Number(payment.invoice.balanceAmount || 0),
    writtenOffAmount: payment.invoice.writtenOffAmount,
    status: payment.invoice.status,
  });
  const balanceAmount = calculateFinanceInvoiceBalanceAmount({
    totalAmount: Number(payment.invoice.totalAmount || 0),
    paidAmount,
    writtenOffAmount,
    status: payment.invoice.status,
  });
  const status = calculateFinanceInvoiceStatus({
    balanceAmount,
    paidAmount,
    writtenOffAmount,
    currentStatus: payment.invoice.status,
  });
  const nextDueDate = resolveFinanceInvoiceDueDate({
    invoiceTotalAmount: Number(payment.invoice.totalAmount || 0),
    invoicePaidAmount: paidAmount,
    invoiceBalanceAmount: balanceAmount,
    invoiceStatus: status,
    invoiceWrittenOffAmount: writtenOffAmount,
    invoiceDueDate: payment.invoice.dueDate || null,
    installments: payment.invoice.installments,
  });

  const verifiedAt = params.verifiedAt || new Date();
  const nextVerificationStatus =
    params.verificationStatus || FinancePaymentVerificationStatus.VERIFIED;

  const updatedPayment = await db.financePayment.update({
    where: { id: payment.id },
    data: {
      allocatedAmount,
      creditedAmount,
      verificationStatus: nextVerificationStatus,
      verificationNote: params.verificationNote?.trim() || null,
      verifiedAt,
      verifiedById: params.actorId,
    },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          periodKey: true,
          semester: true,
        },
      },
      bankAccount: {
        select: {
          id: true,
          code: true,
          bankName: true,
          accountName: true,
          accountNumber: true,
        },
      },
      verifiedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      bankStatementEntries: {
        select: {
          id: true,
          entryDate: true,
          amount: true,
          direction: true,
          referenceNo: true,
          status: true,
          reconciliation: {
            select: {
              id: true,
              reconciliationNo: true,
            },
          },
        },
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  });

  const updatedInvoice = await db.financeInvoice.update({
    where: { id: payment.invoiceId },
    data: {
      paidAmount,
      balanceAmount,
      status,
      dueDate: nextDueDate,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
        },
      },
      items: true,
      payments: {
        select: {
          id: true,
          paymentNo: true,
          amount: true,
          allocatedAmount: true,
          creditedAmount: true,
          reversedAmount: true,
          reversedAllocatedAmount: true,
          reversedCreditedAmount: true,
          source: true,
          method: true,
          verificationStatus: true,
          verificationNote: true,
          verifiedAt: true,
          referenceNo: true,
          note: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      },
      installments: {
        select: {
          id: true,
          sequence: true,
          amount: true,
          dueDate: true,
        },
        orderBy: [{ sequence: 'asc' }],
      },
      writeOffRequests: {
        include: financeWriteOffRecordInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  let creditBalanceSnapshot: {
    id: number;
    balanceAmount: number;
    balanceBefore: number;
  } | null = null;

  if (creditedAmount > 0) {
    const existingCreditBalance = await db.financeCreditBalance.findUnique({
      where: { studentId: payment.studentId },
      select: {
        id: true,
        balanceAmount: true,
      },
    });

    const balanceBefore = Number(existingCreditBalance?.balanceAmount || 0);
    const balanceAfter = balanceBefore + creditedAmount;

    const creditBalance = existingCreditBalance
      ? await db.financeCreditBalance.update({
          where: { id: existingCreditBalance.id },
          data: {
            balanceAmount: balanceAfter,
          },
          select: {
            id: true,
            balanceAmount: true,
          },
        })
      : await db.financeCreditBalance.create({
          data: {
            studentId: payment.studentId,
            balanceAmount: balanceAfter,
          },
          select: {
            id: true,
            balanceAmount: true,
          },
        });

    await db.financeCreditTransaction.create({
      data: {
        balanceId: creditBalance.id,
        studentId: payment.studentId,
        paymentId: payment.id,
        kind: FinanceCreditTransactionKind.OVERPAYMENT,
        amount: creditedAmount,
        balanceBefore,
        balanceAfter,
        note: payment.note?.trim() || `Kelebihan bayar dari ${payment.paymentNo}`,
        createdById: params.actorId,
      },
    });

    creditBalanceSnapshot = {
      id: creditBalance.id,
      balanceAmount: Number(creditBalance.balanceAmount || 0),
      balanceBefore,
    };
  }

  const primaryPeriodicity = payment.invoice.items[0]?.component?.periodicity;
  const legacyType: PaymentType = primaryPeriodicity === 'MONTHLY' ? 'MONTHLY' : 'ONE_TIME';
  const legacyStatus: PaymentStatus = status === 'PAID' ? 'PAID' : 'PARTIAL';

  await db.payment.create({
    data: {
      studentId: payment.studentId,
      amount: Number(payment.amount || 0),
      status: legacyStatus,
      type: legacyType,
    },
  });

  return {
    payment: updatedPayment,
    invoice: updatedInvoice,
    creditBalance: creditBalanceSnapshot,
    allocatedAmount,
    creditedAmount,
  };
}

function buildFinanceStudentSearchFilter(search?: string) {
  const normalizedSearch = search?.trim();
  if (!normalizedSearch) return undefined;

  return {
    OR: [
      { name: { contains: normalizedSearch, mode: 'insensitive' as const } },
      { username: { contains: normalizedSearch, mode: 'insensitive' as const } },
      { nis: { contains: normalizedSearch, mode: 'insensitive' as const } },
      { nisn: { contains: normalizedSearch, mode: 'insensitive' as const } },
      { studentClass: { name: { contains: normalizedSearch, mode: 'insensitive' as const } } },
    ],
  };
}

const listFinanceComponentsQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return undefined;
    }),
  search: z.string().optional(),
});

const listFinanceClassLevelsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
});

const listFinanceBankAccountsQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return undefined;
    }),
  search: z.string().optional(),
});

const financeComponentSchemaFields = {
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  periodicity: z.nativeEnum(FinanceComponentPeriodicity).default('ONE_TIME'),
  lateFeeEnabled: z.boolean().optional().default(false),
  lateFeeMode: z.nativeEnum(FinanceLateFeeMode).optional().default('FIXED'),
  lateFeeAmount: z.coerce.number().min(0).optional().default(0),
  lateFeeGraceDays: z.coerce.number().int().min(0).max(180).optional().default(0),
  lateFeeCapAmount: z.coerce.number().min(0).nullable().optional(),
  isActive: z.boolean().optional().default(true),
};

function validateFinanceComponentLateFee(
  payload: {
    lateFeeEnabled?: boolean;
    lateFeeAmount?: number;
  },
  ctx: z.RefinementCtx,
) {
  if (payload.lateFeeEnabled && Number(payload.lateFeeAmount || 0) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lateFeeAmount'],
      message: 'Nominal denda harus lebih dari 0 ketika denda diaktifkan',
    });
  }
}

const createFinanceComponentSchema = z
  .object(financeComponentSchemaFields)
  .superRefine(validateFinanceComponentLateFee);

const updateFinanceComponentSchema = z
  .object(financeComponentSchemaFields)
  .partial()
  .superRefine((payload, ctx) => {
    if (Object.keys(payload).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tidak ada perubahan data',
      });
    }
    validateFinanceComponentLateFee(payload, ctx);
  });

const listFinanceTariffsQuerySchema = z.object({
  componentId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  majorId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  isActive: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return undefined;
    }),
});

const listFinanceAdjustmentsQuerySchema = z.object({
  componentId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  majorId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  kind: z.nativeEnum(FinanceAdjustmentKind).optional(),
  isActive: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return undefined;
    }),
});

const createFinanceTariffSchema = z.object({
  componentId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive().optional(),
  majorId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  gradeLevel: z.string().trim().min(1).max(20).optional(),
  amount: z.coerce.number().positive(),
  isActive: z.boolean().optional().default(true),
  effectiveStart: z.coerce.date().optional(),
  effectiveEnd: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});

const updateFinanceTariffSchema = createFinanceTariffSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  'Tidak ada perubahan data',
);

const createFinanceAdjustmentSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  kind: z.nativeEnum(FinanceAdjustmentKind).default('DISCOUNT'),
  amount: z.coerce.number().positive(),
  componentId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  majorId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  gradeLevel: z.string().trim().min(1).max(20).optional(),
  isActive: z.boolean().optional().default(true),
  effectiveStart: z.coerce.date().optional(),
  effectiveEnd: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});

const updateFinanceAdjustmentSchema = createFinanceAdjustmentSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  'Tidak ada perubahan data',
);

const generateInvoicesSchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester),
  periodKey: z.string().trim().min(1).max(40),
  dueDate: z.coerce.date().optional(),
  title: z.string().trim().max(160).optional(),
  classId: z.coerce.number().int().positive().optional(),
  majorId: z.coerce.number().int().positive().optional(),
  gradeLevel: z.string().trim().min(1).max(20).optional(),
  installmentCount: z.coerce.number().int().min(1).max(24).optional().default(1),
  installmentIntervalDays: z.coerce.number().int().min(1).max(180).optional().default(30),
  autoApplyCreditBalance: z.boolean().optional().default(true),
  studentIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  replaceExisting: z.boolean().optional().default(false),
});

const listFinanceInvoicesQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  classId: z.coerce.number().int().positive().optional(),
  gradeLevel: z.string().trim().min(1).max(20).optional(),
  studentId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(FinanceInvoiceStatus).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const createFinancePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.nativeEnum(FinancePaymentMethod).default('OTHER'),
  bankAccountId: z.coerce.number().int().positive().optional(),
  referenceNo: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
});

const listFinancePaymentVerificationsQuerySchema = z.object({
  verificationStatus: z.nativeEnum(FinancePaymentVerificationStatus).optional(),
  bankAccountId: z.coerce.number().int().positive().optional(),
  matchedOnly: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return undefined;
    }),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const decideFinancePaymentVerificationSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const listFinanceLedgerBooksQuerySchema = z
  .object({
    book: z.enum(FINANCE_LEDGER_BOOKS).optional().default('ALL'),
    bankAccountId: z.coerce.number().int().positive().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(120),
  })
  .refine(
    (payload) =>
      !payload.dateFrom ||
      !payload.dateTo ||
      new Date(`${payload.dateTo}T23:59:59.999`).getTime() >=
        new Date(`${payload.dateFrom}T00:00:00.000`).getTime(),
    {
      message: 'Rentang tanggal ledger tidak valid',
      path: ['dateTo'],
    },
  );

const financeOptionalDateSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.date().nullable(),
);

const updateFinanceInvoiceInstallmentsSchema = z.object({
  installments: z
    .array(
      z.object({
        sequence: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive(),
        dueDate: financeOptionalDateSchema.optional().default(null),
      }),
    )
    .min(1)
    .max(24)
    .refine(
      (installments) => new Set(installments.map((installment) => installment.sequence)).size === installments.length,
      'Urutan termin harus unik',
    )
    .refine(
      (installments) =>
        [...installments]
          .sort((left, right) => left.sequence - right.sequence)
          .every((installment, index) => installment.sequence === index + 1),
      'Urutan termin harus berurutan mulai dari 1',
    ),
  note: z.string().trim().max(500).optional(),
});

const listFinanceCreditsQuerySchema = z.object({
  studentId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const listFinanceCashSessionsQuerySchema = z.object({
  openedById: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(FinanceCashSessionStatus).optional(),
  approvalStatus: z.nativeEnum(FinanceCashSessionApprovalStatus).optional(),
  pendingFor: z.enum(['HEAD_TU', 'PRINCIPAL']).optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mine: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === '') return undefined;
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return undefined;
    }),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
});

const listFinanceBankReconciliationsQuerySchema = z.object({
  bankAccountId: z.coerce.number().int().positive().optional(),
  status: z.enum(FINANCE_BANK_RECONCILIATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(8),
});

const createFinanceBankAccountSchema = z.object({
  code: z.string().trim().min(2).max(30),
  bankName: z.string().trim().min(2).max(120),
  accountName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(4).max(40),
  branch: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional().default(true),
});

const updateFinanceBankAccountSchema = createFinanceBankAccountSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, 'Tidak ada perubahan data');

const createFinanceBankReconciliationSchema = z
  .object({
    bankAccountId: z.coerce.number().int().positive(),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statementOpeningBalance: z.coerce.number().min(0).optional().default(0),
    statementClosingBalance: z.coerce.number().min(0).default(0),
    note: z.string().trim().max(500).optional(),
  })
  .refine((payload) => payload.periodEnd >= payload.periodStart, {
    path: ['periodEnd'],
    message: 'periodEnd tidak boleh lebih kecil dari periodStart',
  });

const createFinanceBankStatementEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(FINANCE_BANK_STATEMENT_DIRECTIONS),
  amount: z.coerce.number().positive(),
  referenceNo: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

const finalizeFinanceBankReconciliationSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const openFinanceCashSessionSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  openingBalance: z.coerce.number().min(0).optional().default(0),
  note: z.string().trim().max(500).optional(),
});

const closeFinanceCashSessionSchema = z.object({
  actualClosingBalance: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional(),
});

const updateFinanceCashSessionApprovalPolicySchema = z.object({
  zeroVarianceAutoApproved: z.boolean().optional(),
  requireVarianceNote: z.boolean().optional(),
  principalApprovalThresholdAmount: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

const decideFinanceCashSessionSchema = z.object({
  approved: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

const createFinanceRefundSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.nativeEnum(FinancePaymentMethod).default('OTHER'),
  bankAccountId: z.coerce.number().int().positive().optional(),
  referenceNo: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  refundedAt: z.coerce.date().optional(),
});

const listFinanceWriteOffsQuerySchema = z.object({
  invoiceId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(FinanceWriteOffStatus).optional(),
  pendingFor: z.enum(['HEAD_TU', 'PRINCIPAL', 'FINANCE_APPLY']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const createFinanceWriteOffSchema = z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(5).max(500),
  note: z.string().trim().max(500).optional(),
});

const decideFinanceWriteOffSchema = z
  .object({
    approved: z.boolean(),
    approvedAmount: z.coerce.number().positive().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((payload, ctx) => {
    if (!payload.approved && payload.approvedAmount != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedAmount'],
        message: 'Nominal persetujuan hanya boleh diisi saat menyetujui write-off',
      });
    }
  });

const applyFinanceWriteOffSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

const listFinancePaymentReversalsQuerySchema = z.object({
  paymentId: z.coerce.number().int().positive().optional(),
  invoiceId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(FinancePaymentReversalStatus).optional(),
  pendingFor: z.enum(['HEAD_TU', 'PRINCIPAL', 'FINANCE_APPLY']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const createFinancePaymentReversalSchema = z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(5).max(500),
  note: z.string().trim().max(500).optional(),
});

const decideFinancePaymentReversalSchema = z.object({
  approved: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

const applyFinancePaymentReversalSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const applyFinanceLateFeeSchema = z.object({
  note: z.string().trim().max(500).optional(),
  appliedAt: z.coerce.date().optional(),
});

const financeWriteOffRecordInclude = Prisma.validator<Prisma.FinanceWriteOffRequestInclude>()({
  invoice: {
    select: {
      id: true,
      invoiceNo: true,
      periodKey: true,
      semester: true,
      title: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      writtenOffAmount: true,
      balanceAmount: true,
      status: true,
    },
  },
  student: {
    select: {
      id: true,
      name: true,
      username: true,
      nis: true,
      nisn: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
    },
  },
  requestedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  headTuDecisionBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  principalDecisionBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  appliedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
});

const financePaymentReversalRecordInclude =
  Prisma.validator<Prisma.FinancePaymentReversalRequestInclude>()({
    payment: {
      select: {
        id: true,
        paymentNo: true,
        amount: true,
        allocatedAmount: true,
        creditedAmount: true,
        reversedAmount: true,
        reversedAllocatedAmount: true,
        reversedCreditedAmount: true,
        source: true,
        method: true,
        verificationStatus: true,
        verificationNote: true,
        verifiedAt: true,
        referenceNo: true,
        note: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    invoice: {
      select: {
        id: true,
        invoiceNo: true,
        periodKey: true,
        semester: true,
        title: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        writtenOffAmount: true,
        balanceAmount: true,
        status: true,
      },
    },
    student: {
      select: {
        id: true,
        name: true,
        username: true,
        nis: true,
        nisn: true,
        studentClass: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
    },
    requestedBy: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    headTuDecisionBy: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    principalDecisionBy: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    appliedBy: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
  });

const financeCashSessionRecordInclude = Prisma.validator<Prisma.FinanceCashSessionInclude>()({
  openedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  closedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  headTuDecisionBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  principalDecisionBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
});

const financeBankReconciliationRecordInclude = {
  bankAccount: {
    select: {
      id: true,
      code: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      branch: true,
      notes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  finalizedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
} as const;

async function buildFinanceCashSessionSummary(
  db: Prisma.TransactionClient | typeof prisma,
  session: {
    id: number;
    openedById: number;
    openingBalance: number;
    openedAt: Date;
    closedAt?: Date | null;
  },
): Promise<SerializedFinanceCashSessionSummary> {
  const periodEnd = session.closedAt || new Date();
  const paymentWhere: Prisma.FinancePaymentWhereInput = {
    createdById: session.openedById,
    method: FinancePaymentMethod.CASH,
    source: FinancePaymentSource.DIRECT,
    paidAt: {
      gte: session.openedAt,
      lte: periodEnd,
    },
  };
  const refundWhere: Prisma.FinanceRefundWhereInput = {
    createdById: session.openedById,
    method: FinancePaymentMethod.CASH,
    refundedAt: {
      gte: session.openedAt,
      lte: periodEnd,
    },
  };

  const [paymentAggregate, refundAggregate, recentPayments, recentRefunds] = await Promise.all([
    db.financePayment.aggregate({
      where: paymentWhere,
      _count: { _all: true },
      _sum: {
        amount: true,
        reversedAmount: true,
      },
    }),
    db.financeRefund.aggregate({
      where: refundWhere,
      _count: { _all: true },
      _sum: {
        amount: true,
      },
    }),
    db.financePayment.findMany({
      where: paymentWhere,
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: 8,
      select: {
        id: true,
        paymentNo: true,
        amount: true,
        reversedAmount: true,
        paidAt: true,
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
      },
    }),
    db.financeRefund.findMany({
      where: refundWhere,
      orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
      take: 8,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const grossCashIn = normalizeFinanceAmount(Number(paymentAggregate._sum.amount || 0));
  const reversedCashIn = normalizeFinanceAmount(Number(paymentAggregate._sum.reversedAmount || 0));
  const expectedCashIn = normalizeFinanceAmount(Math.max(grossCashIn - reversedCashIn, 0));
  const expectedCashOut = normalizeFinanceAmount(Number(refundAggregate._sum.amount || 0));
  const expectedClosingBalance = normalizeFinanceAmount(
    Number(session.openingBalance || 0) + expectedCashIn - expectedCashOut,
  );

  return {
    expectedCashIn,
    expectedCashOut,
    expectedClosingBalance,
    totalCashPayments: paymentAggregate._count._all,
    totalCashRefunds: refundAggregate._count._all,
    recentCashPayments: recentPayments.map((payment) => {
      const reversedAmount = normalizeFinanceAmount(Number(payment.reversedAmount || 0));
      return {
        id: payment.id,
        paymentNo: payment.paymentNo || null,
        amount: Number(payment.amount || 0),
        netCashAmount: normalizeFinanceAmount(Math.max(Number(payment.amount || 0) - reversedAmount, 0)),
        reversedAmount,
        paidAt: payment.paidAt || null,
        student: payment.student || null,
        invoice: payment.invoice || null,
      };
    }),
    recentCashRefunds: recentRefunds.map((refund) => serializeFinanceRefundRecord(refund)),
  };
}

function parseFinanceDateInput(value: string, endOfDay = false) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new ApiError(400, 'Format tanggal harus YYYY-MM-DD');
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
}

function isFinanceSameDay(left?: Date | null, right?: Date | null) {
  if (!left || !right) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function serializeFinanceBankStatementEntry(entry: {
  id: number;
  entryDate: Date;
  direction: FinanceBankStatementDirection;
  amount: number;
  referenceNo?: string | null;
  description?: string | null;
  status: FinanceBankStatementEntryStatus;
  createdAt: Date;
  updatedAt: Date;
  matchedPayment?: Parameters<typeof serializeFinancePaymentRecord>[0] | null;
  matchedRefund?: Parameters<typeof serializeFinanceRefundRecord>[0] | null;
}): SerializedFinanceBankStatementEntry {
  return {
    id: entry.id,
    entryDate: entry.entryDate,
    direction: entry.direction,
    amount: normalizeFinanceAmount(Number(entry.amount || 0)),
    referenceNo: entry.referenceNo || null,
    description: entry.description || null,
    status: entry.status,
    matchedPayment: entry.matchedPayment ? serializeFinancePaymentRecord(entry.matchedPayment) : null,
    matchedRefund: entry.matchedRefund ? serializeFinanceRefundRecord(entry.matchedRefund) : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function loadFinanceBankReconciliationTransactions(
  db: Prisma.TransactionClient | typeof prisma,
  reconciliation: {
    id: number;
    bankAccountId: number;
    periodStart: Date;
    periodEnd: Date;
  },
) {
  const paymentWhere = {
    bankAccountId: reconciliation.bankAccountId,
    source: FinancePaymentSource.DIRECT,
    method: { not: FinancePaymentMethod.CASH },
    paidAt: {
      gte: reconciliation.periodStart,
      lte: reconciliation.periodEnd,
    },
  };

  const refundWhere = {
    bankAccountId: reconciliation.bankAccountId,
    method: { not: FinancePaymentMethod.CASH },
    refundedAt: {
      gte: reconciliation.periodStart,
      lte: reconciliation.periodEnd,
    },
  };

  const [payments, refunds, statementEntries] = await Promise.all([
    db.financePayment.findMany({
      where: paymentWhere,
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        paymentNo: true,
        amount: true,
        allocatedAmount: true,
        creditedAmount: true,
        reversedAmount: true,
        reversedAllocatedAmount: true,
        reversedCreditedAmount: true,
        source: true,
        method: true,
        verificationStatus: true,
        verificationNote: true,
        verifiedAt: true,
        referenceNo: true,
        note: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        bankStatementEntries: {
          select: {
            id: true,
            entryDate: true,
            amount: true,
            direction: true,
            referenceNo: true,
            status: true,
            reconciliation: {
              select: {
                id: true,
                reconciliationNo: true,
              },
            },
          },
          orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
      },
    }),
    db.financeRefund.findMany({
      where: refundWhere,
      orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        refundNo: true,
        amount: true,
        method: true,
        referenceNo: true,
        note: true,
        refundedAt: true,
        createdAt: true,
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    db.financeBankStatementEntry.findMany({
      where: { reconciliationId: reconciliation.id },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
      include: {
        matchedPayment: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            verificationStatus: true,
            verificationNote: true,
            verifiedAt: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
            bankAccount: {
              select: {
                id: true,
                code: true,
                bankName: true,
                accountName: true,
                accountNumber: true,
              },
            },
            verifiedBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            bankStatementEntries: {
              select: {
                id: true,
                entryDate: true,
                amount: true,
                direction: true,
                referenceNo: true,
                status: true,
                reconciliation: {
                  select: {
                    id: true,
                    reconciliationNo: true,
                  },
                },
              },
              orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                periodKey: true,
                semester: true,
              },
            },
          },
        },
        matchedRefund: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            bankAccount: {
              select: {
                id: true,
                code: true,
                bankName: true,
                accountName: true,
                accountNumber: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return { payments, refunds, statementEntries };
}

async function buildFinanceBankReconciliationSummary(
  db: Prisma.TransactionClient | typeof prisma,
  reconciliation: {
    id: number;
    bankAccountId: number;
    periodStart: Date;
    periodEnd: Date;
    statementOpeningBalance: number;
    statementClosingBalance: number;
  },
) {
  const { payments, refunds, statementEntries } = await loadFinanceBankReconciliationTransactions(
    db,
    reconciliation,
  );
  const paymentRows = payments as any[];
  const refundRows = refunds as any[];
  const statementEntryRows = statementEntries as any[];

  const matchedPaymentIds = new Set(
    statementEntryRows
      .map((entry: any) => entry.matchedPaymentId)
      .filter((value: any): value is number => Number.isInteger(value)),
  );
  const matchedRefundIds = new Set(
    statementEntryRows
      .map((entry: any) => entry.matchedRefundId)
      .filter((value: any): value is number => Number.isInteger(value)),
  );

  const systemPayments = paymentRows
    .filter(
      (payment: any) =>
        payment.verificationStatus !== FinancePaymentVerificationStatus.REJECTED,
    )
    .map((payment: any) => {
      const serialized = serializeFinancePaymentRecord(payment);
      const netBankAmount = normalizeFinanceAmount(
        Math.max(Number(payment.amount || 0) - Number(payment.reversedAmount || 0), 0),
      );
      return {
        ...serialized,
        netBankAmount,
        matched: matchedPaymentIds.has(payment.id),
      } satisfies SerializedFinanceBankSystemPayment;
    })
    .filter((payment: any) => payment.netBankAmount > 0);

  const systemRefunds = refundRows.map((refund: any) => ({
    ...serializeFinanceRefundRecord(refund),
    matched: matchedRefundIds.has(refund.id),
  })) satisfies SerializedFinanceBankSystemRefund[];

  const statementIn = normalizeFinanceAmount(
    statementEntryRows
      .filter((entry: any) => entry.direction === 'CREDIT')
      .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0),
  );
  const statementOut = normalizeFinanceAmount(
    statementEntryRows
      .filter((entry: any) => entry.direction === 'DEBIT')
      .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0),
  );
  const expectedBankIn = normalizeFinanceAmount(
    systemPayments.reduce((sum: number, payment: any) => sum + Number(payment.netBankAmount || 0), 0),
  );
  const pendingVerificationAmount = normalizeFinanceAmount(
    systemPayments
      .filter((payment: any) => payment.verificationStatus === FinancePaymentVerificationStatus.PENDING)
      .reduce((sum: number, payment: any) => sum + Number(payment.netBankAmount || 0), 0),
  );
  const expectedBankOut = normalizeFinanceAmount(
    systemRefunds.reduce((sum: number, refund: any) => sum + Number(refund.amount || 0), 0),
  );
  const expectedClosingBalance = normalizeFinanceAmount(
    Number(reconciliation.statementOpeningBalance || 0) + expectedBankIn - expectedBankOut,
  );
  const statementComputedClosingBalance = normalizeFinanceAmount(
    Number(reconciliation.statementOpeningBalance || 0) + statementIn - statementOut,
  );
  const varianceAmount = normalizeFinanceAmount(
    Number(reconciliation.statementClosingBalance || 0) - expectedClosingBalance,
  );
  const statementGapAmount = normalizeFinanceAmount(
    Number(reconciliation.statementClosingBalance || 0) - statementComputedClosingBalance,
  );

  const summary: SerializedFinanceBankReconciliationSummary = {
    expectedBankIn,
    expectedBankOut,
    pendingVerificationAmount,
    expectedClosingBalance,
    statementRecordedIn: statementIn,
    statementRecordedOut: statementOut,
    statementComputedClosingBalance,
    varianceAmount,
    statementGapAmount,
    totalPaymentCount: systemPayments.length,
    verifiedPaymentCount: systemPayments.filter(
      (payment: any) => payment.verificationStatus === FinancePaymentVerificationStatus.VERIFIED,
    ).length,
    pendingPaymentCount: systemPayments.filter(
      (payment: any) => payment.verificationStatus === FinancePaymentVerificationStatus.PENDING,
    ).length,
    rejectedPaymentCount: paymentRows.filter(
      (payment: any) => payment.verificationStatus === FinancePaymentVerificationStatus.REJECTED,
    ).length,
    totalRefundCount: systemRefunds.length,
    matchedPaymentCount: systemPayments.filter((payment: any) => payment.matched).length,
    matchedRefundCount: systemRefunds.filter((refund: any) => refund.matched).length,
    unmatchedPaymentCount: systemPayments.filter((payment: any) => !payment.matched).length,
    unmatchedRefundCount: systemRefunds.filter((refund: any) => !refund.matched).length,
    matchedStatementEntryCount: statementEntryRows.filter((entry: any) => entry.status === 'MATCHED').length,
    unmatchedStatementEntryCount: statementEntryRows.filter((entry: any) => entry.status !== 'MATCHED').length,
  };

  return {
    summary,
    statementEntries: statementEntryRows.map((entry: any) => serializeFinanceBankStatementEntry(entry)),
    systemPayments: systemPayments.slice(0, 12),
    systemRefunds: systemRefunds.slice(0, 12),
  };
}

function serializeFinanceLedgerStudent(student?: {
  id: number;
  name: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  studentClass?: {
    id: number;
    name: string;
    level?: string | null;
  } | null;
} | null) {
  if (!student) return null;

  return {
    id: student.id,
    name: student.name,
    username: student.username,
    nis: student.nis || null,
    nisn: student.nisn || null,
    studentClass: student.studentClass
      ? {
          id: student.studentClass.id,
          name: student.studentClass.name,
          level: String(student.studentClass.level || ''),
        }
      : null,
  };
}

function serializeFinanceLedgerMatchedStatementEntry(entry?: {
  id: number;
  entryDate: Date;
  amount: number;
  direction: FinanceBankStatementDirection;
  referenceNo?: string | null;
  status: FinanceBankStatementEntryStatus;
  reconciliation?: {
    id: number;
    reconciliationNo: string;
  } | null;
} | null) {
  if (!entry) return null;

  return {
    id: entry.id,
    entryDate: entry.entryDate,
    amount: normalizeFinanceAmount(Number(entry.amount || 0)),
    direction: entry.direction,
    referenceNo: entry.referenceNo || null,
    status: entry.status,
    reconciliation: entry.reconciliation
      ? {
          id: entry.reconciliation.id,
          reconciliationNo: entry.reconciliation.reconciliationNo,
        }
      : null,
  };
}

function sortFinanceLedgerEntriesAsc(
  left: Pick<SerializedFinanceLedgerEntry, 'transactionDate' | 'id'>,
  right: Pick<SerializedFinanceLedgerEntry, 'transactionDate' | 'id'>,
) {
  const leftTime = new Date(left.transactionDate).getTime();
  const rightTime = new Date(right.transactionDate).getTime();
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.id.localeCompare(right.id);
}

function applyFinanceLedgerRunningBalances(
  entries: Array<Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>>,
  openingBalance: number,
  openingByAccount?: Map<number, number>,
) {
  let runningBalance = normalizeFinanceAmount(openingBalance);
  const accountRunning = new Map<number, number>(
    Array.from(openingByAccount?.entries() || []).map(([accountId, amount]) => [
      accountId,
      normalizeFinanceAmount(amount),
    ]),
  );

  return [...entries]
    .sort(sortFinanceLedgerEntriesAsc)
    .map((entry) => {
      const delta = entry.direction === 'IN' ? entry.amount : -entry.amount;
      if (entry.affectsBalance) {
        runningBalance = normalizeFinanceAmount(runningBalance + delta);
      }

      let accountRunningBalance: number | null = null;
      if (entry.bankAccount?.id) {
        const current = normalizeFinanceAmount(accountRunning.get(entry.bankAccount.id) || 0);
        const next = entry.affectsBalance ? normalizeFinanceAmount(current + delta) : current;
        accountRunning.set(entry.bankAccount.id, next);
        accountRunningBalance = next;
      }

      return {
        ...entry,
        runningBalance,
        accountRunningBalance,
      } satisfies SerializedFinanceLedgerEntry;
    });
}

async function buildFinanceLedgerSnapshot(
  db: Prisma.TransactionClient | typeof prisma,
  params: {
    book: FinanceLedgerBook;
    bankAccountId?: number | null;
    dateFrom?: Date | null;
    dateTo?: Date | null;
    search?: string | null;
    limit: number;
  },
): Promise<SerializedFinanceLedgerSnapshot> {
  const wantsCash = params.book === 'ALL' || params.book === 'CASHBOOK';
  const wantsBank = params.book === 'ALL' || params.book === 'BANKBOOK';
  const normalizedSearch = params.search?.trim() || undefined;
  const effectiveBankAccountId = wantsBank ? Number(params.bankAccountId || 0) || null : null;
  const studentSearchWhere = buildFinanceStudentSearchFilter(normalizedSearch);

  const paymentSearchClauses: Prisma.FinancePaymentWhereInput[] = [];
  const refundSearchClauses: Prisma.FinanceRefundWhereInput[] = [];
  if (normalizedSearch) {
    paymentSearchClauses.push({ paymentNo: { contains: normalizedSearch, mode: 'insensitive' } });
    paymentSearchClauses.push({ referenceNo: { contains: normalizedSearch, mode: 'insensitive' } });
    paymentSearchClauses.push({ note: { contains: normalizedSearch, mode: 'insensitive' } });
    paymentSearchClauses.push({ invoice: { invoiceNo: { contains: normalizedSearch, mode: 'insensitive' } } });
    refundSearchClauses.push({ refundNo: { contains: normalizedSearch, mode: 'insensitive' } });
    refundSearchClauses.push({ referenceNo: { contains: normalizedSearch, mode: 'insensitive' } });
    refundSearchClauses.push({ note: { contains: normalizedSearch, mode: 'insensitive' } });
    if (studentSearchWhere) {
      paymentSearchClauses.push({ student: studentSearchWhere });
      refundSearchClauses.push({ student: studentSearchWhere });
    }
  }

  const paymentDateWhere =
    params.dateFrom || params.dateTo
      ? {
          paidAt: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {};
  const refundDateWhere =
    params.dateFrom || params.dateTo
      ? {
          refundedAt: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {};

  const cashPaymentWhere: Prisma.FinancePaymentWhereInput = wantsCash
    ? {
        source: FinancePaymentSource.DIRECT,
        method: FinancePaymentMethod.CASH,
        ...paymentDateWhere,
        ...(paymentSearchClauses.length > 0 ? { OR: paymentSearchClauses } : {}),
      }
    : { id: -1 };
  const cashRefundWhere: Prisma.FinanceRefundWhereInput = wantsCash
    ? {
        method: FinancePaymentMethod.CASH,
        ...refundDateWhere,
        ...(refundSearchClauses.length > 0 ? { OR: refundSearchClauses } : {}),
      }
    : { id: -1 };
  const bankPaymentWhere: Prisma.FinancePaymentWhereInput = wantsBank
    ? {
        source: FinancePaymentSource.DIRECT,
        method: { not: FinancePaymentMethod.CASH },
        verificationStatus: { not: FinancePaymentVerificationStatus.REJECTED },
        ...(effectiveBankAccountId ? { bankAccountId: effectiveBankAccountId } : {}),
        ...paymentDateWhere,
        ...(paymentSearchClauses.length > 0 ? { OR: paymentSearchClauses } : {}),
      }
    : { id: -1 };
  const bankRefundWhere: Prisma.FinanceRefundWhereInput = wantsBank
    ? {
        method: { not: FinancePaymentMethod.CASH },
        ...(effectiveBankAccountId ? { bankAccountId: effectiveBankAccountId } : {}),
        ...refundDateWhere,
        ...(refundSearchClauses.length > 0 ? { OR: refundSearchClauses } : {}),
      }
    : { id: -1 };

  const bankOpeningPaymentGroups =
    wantsBank && params.dateFrom
      ? ((await (db.financePayment.groupBy({
          by: ['bankAccountId'],
          where: {
            source: FinancePaymentSource.DIRECT,
            method: { not: FinancePaymentMethod.CASH },
            verificationStatus: FinancePaymentVerificationStatus.VERIFIED,
            bankAccountId: effectiveBankAccountId ? effectiveBankAccountId : { not: null },
            paidAt: { lt: params.dateFrom },
          },
          _sum: {
            amount: true,
            reversedAmount: true,
          },
        }) as any)) as Array<{
          bankAccountId: number | null;
          _sum: { amount: number | null; reversedAmount: number | null };
        }>)
      : [];
  const bankOpeningRefundGroups =
    wantsBank && params.dateFrom
      ? ((await (db.financeRefund.groupBy({
          by: ['bankAccountId'],
          where: {
            method: { not: FinancePaymentMethod.CASH },
            bankAccountId: effectiveBankAccountId ? effectiveBankAccountId : { not: null },
            refundedAt: { lt: params.dateFrom },
          },
          _sum: {
            amount: true,
          },
        }) as any)) as Array<{
          bankAccountId: number | null;
          _sum: { amount: number | null };
        }>)
      : [];

  const [
    cashOpeningPaymentAggregate,
    cashOpeningRefundAggregate,
    cashPayments,
    cashRefunds,
    bankPayments,
    bankRefunds,
  ] = await Promise.all([
    wantsCash && params.dateFrom
      ? db.financePayment.aggregate({
          where: {
            source: FinancePaymentSource.DIRECT,
            method: FinancePaymentMethod.CASH,
            paidAt: { lt: params.dateFrom },
          },
          _sum: {
            amount: true,
            reversedAmount: true,
          },
        })
      : Promise.resolve({ _sum: { amount: 0, reversedAmount: 0 } }),
    wantsCash && params.dateFrom
      ? db.financeRefund.aggregate({
          where: {
            method: FinancePaymentMethod.CASH,
            refundedAt: { lt: params.dateFrom },
          },
          _sum: {
            amount: true,
          },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
    wantsCash
      ? db.financePayment.findMany({
          where: cashPaymentWhere,
          orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            verificationStatus: true,
            verificationNote: true,
            verifiedAt: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                periodKey: true,
                semester: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    wantsCash
      ? db.financeRefund.findMany({
          where: cashRefundWhere,
          orderBy: [{ refundedAt: 'asc' }, { id: 'asc' }],
          include: {
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    wantsBank
      ? db.financePayment.findMany({
          where: bankPaymentWhere,
          orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            paymentNo: true,
            bankAccountId: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            verificationStatus: true,
            verificationNote: true,
            verifiedAt: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                periodKey: true,
                semester: true,
              },
            },
            verifiedBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            bankStatementEntries: {
              select: {
                id: true,
                entryDate: true,
                amount: true,
                direction: true,
                referenceNo: true,
                status: true,
                reconciliation: {
                  select: {
                    id: true,
                    reconciliationNo: true,
                  },
                },
              },
              orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    wantsBank
      ? db.financeRefund.findMany({
          where: bankRefundWhere,
          orderBy: [{ refundedAt: 'asc' }, { id: 'asc' }],
          include: {
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            bankStatementEntries: {
              select: {
                id: true,
                entryDate: true,
                amount: true,
                direction: true,
                referenceNo: true,
                status: true,
                reconciliation: {
                  select: {
                    id: true,
                    reconciliationNo: true,
                  },
                },
              },
              orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const openingCashBalance = wantsCash
    ? normalizeFinanceAmount(
        Number(cashOpeningPaymentAggregate._sum.amount || 0) -
          Number(cashOpeningPaymentAggregate._sum.reversedAmount || 0) -
          Number(cashOpeningRefundAggregate._sum.amount || 0),
      )
    : 0;

  const openingBankByAccount = new Map<number, number>();
  for (const row of bankOpeningPaymentGroups) {
    if (!Number.isInteger(row.bankAccountId)) continue;
    const current = normalizeFinanceAmount(openingBankByAccount.get(row.bankAccountId!) || 0);
    const netAmount = normalizeFinanceAmount(
      Number(row._sum.amount || 0) - Number(row._sum.reversedAmount || 0),
    );
    openingBankByAccount.set(row.bankAccountId!, normalizeFinanceAmount(current + netAmount));
  }
  for (const row of bankOpeningRefundGroups) {
    if (!Number.isInteger(row.bankAccountId)) continue;
    const current = normalizeFinanceAmount(openingBankByAccount.get(row.bankAccountId!) || 0);
    openingBankByAccount.set(
      row.bankAccountId!,
      normalizeFinanceAmount(current - Number(row._sum.amount || 0)),
    );
  }

  const openingBankBalance = normalizeFinanceAmount(
    Array.from(openingBankByAccount.values()).reduce((sum, amount) => sum + Number(amount || 0), 0),
  );

  const bankAccountIds = Array.from(
    new Set(
      [
        ...Array.from(openingBankByAccount.keys()),
        ...((bankPayments as any[]).map((payment) => Number(payment.bankAccountId || 0))),
        ...((bankRefunds as any[]).map((refund) => Number(refund.bankAccountId || 0))),
        effectiveBankAccountId || 0,
      ].filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

  const [bankAccountRows, latestFinalizedReconciliations] = await Promise.all([
    bankAccountIds.length
      ? db.financeBankAccount.findMany({
          where: {
            id: { in: bankAccountIds },
          },
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
            branch: true,
            notes: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    bankAccountIds.length
      ? db.financeBankReconciliation.findMany({
          where: {
            bankAccountId: { in: bankAccountIds },
            status: 'FINALIZED',
            ...(params.dateTo ? { periodEnd: { lte: params.dateTo } } : {}),
          },
          orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            bankAccountId: true,
            reconciliationNo: true,
            periodEnd: true,
            statementClosingBalance: true,
            finalizedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const bankAccountMap = new Map(
    (bankAccountRows as any[]).map((account) => [account.id, serializeFinanceBankAccount(account)]),
  );
  const latestFinalizedByAccount = new Map<
    number,
    {
      id: number;
      reconciliationNo: string;
      periodEnd: Date;
      statementClosingBalance: number;
      finalizedAt: Date | null;
    }
  >();
  for (const row of latestFinalizedReconciliations as any[]) {
    if (!latestFinalizedByAccount.has(row.bankAccountId)) {
      latestFinalizedByAccount.set(row.bankAccountId, {
        id: row.id,
        reconciliationNo: row.reconciliationNo,
        periodEnd: row.periodEnd,
        statementClosingBalance: normalizeFinanceAmount(Number(row.statementClosingBalance || 0)),
        finalizedAt: row.finalizedAt || null,
      });
    }
  }

  const cashEntryDrafts = [
    ...(cashPayments as any[])
      .map((payment) => {
        const serializedPayment = serializeFinancePaymentRecord(payment);
        const amount = normalizeFinanceAmount(
          Math.max(Number(payment.amount || 0) - Number(payment.reversedAmount || 0), 0),
        );
        if (amount <= 0) return null;
        return {
          id: `CASH-PAYMENT-${payment.id}`,
          sourceType: 'PAYMENT',
          book: 'CASHBOOK',
          direction: 'IN',
          transactionDate: payment.paidAt || payment.createdAt,
          transactionNo: serializedPayment.paymentNo || null,
          amount,
          affectsBalance: true,
          referenceNo: serializedPayment.referenceNo || null,
          note: serializedPayment.note || null,
          method: serializedPayment.method || FinancePaymentMethod.CASH,
          verificationStatus: serializedPayment.verificationStatus || FinancePaymentVerificationStatus.VERIFIED,
          matched: false,
          student: serializeFinanceLedgerStudent(payment.student),
          invoice: payment.invoice
            ? {
                id: payment.invoice.id,
                invoiceNo: payment.invoice.invoiceNo,
                periodKey: payment.invoice.periodKey || null,
                semester: payment.invoice.semester || null,
              }
            : null,
          bankAccount: null,
          matchedStatementEntry: null,
        } satisfies Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>;
      })
      .filter(Boolean),
    ...(cashRefunds as any[]).map((refund) => {
      const serializedRefund = serializeFinanceRefundRecord(refund);
      return {
        id: `CASH-REFUND-${refund.id}`,
        sourceType: 'REFUND',
        book: 'CASHBOOK',
        direction: 'OUT',
        transactionDate: refund.refundedAt || refund.createdAt,
        transactionNo: serializedRefund.refundNo || null,
        amount: serializedRefund.amount,
        affectsBalance: true,
        referenceNo: serializedRefund.referenceNo || null,
        note: serializedRefund.note || null,
        method: serializedRefund.method || FinancePaymentMethod.CASH,
        verificationStatus: null,
        matched: false,
        student: serializeFinanceLedgerStudent(serializedRefund.student),
        invoice: null,
        bankAccount: null,
        matchedStatementEntry: null,
      } satisfies Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>;
    }),
  ] as Array<Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>>;

  const bankEntryDrafts = [
    ...(bankPayments as any[])
      .map((payment) => {
        const serializedPayment = serializeFinancePaymentRecord(payment);
        const amount = normalizeFinanceAmount(
          Math.max(Number(payment.amount || 0) - Number(payment.reversedAmount || 0), 0),
        );
        if (amount <= 0) return null;
        return {
          id: `BANK-PAYMENT-${payment.id}`,
          sourceType: 'PAYMENT',
          book: 'BANKBOOK',
          direction: 'IN',
          transactionDate: payment.paidAt || payment.createdAt,
          transactionNo: serializedPayment.paymentNo || null,
          amount,
          affectsBalance: serializedPayment.verificationStatus === FinancePaymentVerificationStatus.VERIFIED,
          referenceNo: serializedPayment.referenceNo || null,
          note: serializedPayment.note || null,
          method: serializedPayment.method || null,
          verificationStatus: serializedPayment.verificationStatus || FinancePaymentVerificationStatus.VERIFIED,
          matched: Boolean(serializedPayment.matchedStatementEntry),
          student: serializeFinanceLedgerStudent(payment.student),
          invoice: payment.invoice
            ? {
                id: payment.invoice.id,
                invoiceNo: payment.invoice.invoiceNo,
                periodKey: payment.invoice.periodKey || null,
                semester: payment.invoice.semester || null,
              }
            : null,
          bankAccount: payment.bankAccountId ? bankAccountMap.get(payment.bankAccountId) || null : null,
          matchedStatementEntry: serializeFinanceLedgerMatchedStatementEntry(
            (payment.bankStatementEntries || [])[0] || null,
          ),
        } satisfies Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>;
      })
      .filter(Boolean),
    ...(bankRefunds as any[]).map((refund) => {
      const serializedRefund = serializeFinanceRefundRecord(refund);
      const matchedStatementEntry = serializeFinanceLedgerMatchedStatementEntry(
        (refund.bankStatementEntries || [])[0] || null,
      );
      return {
        id: `BANK-REFUND-${refund.id}`,
        sourceType: 'REFUND',
        book: 'BANKBOOK',
        direction: 'OUT',
        transactionDate: refund.refundedAt || refund.createdAt,
        transactionNo: serializedRefund.refundNo || null,
        amount: serializedRefund.amount,
        affectsBalance: true,
        referenceNo: serializedRefund.referenceNo || null,
        note: serializedRefund.note || null,
        method: serializedRefund.method || null,
        verificationStatus: null,
        matched: Boolean(matchedStatementEntry),
        student: serializeFinanceLedgerStudent(serializedRefund.student),
        invoice: null,
        bankAccount: refund.bankAccountId ? bankAccountMap.get(refund.bankAccountId) || null : null,
        matchedStatementEntry,
      } satisfies Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>;
    }),
  ] as Array<Omit<SerializedFinanceLedgerEntry, 'runningBalance' | 'accountRunningBalance'>>;

  const cashEntries = applyFinanceLedgerRunningBalances(cashEntryDrafts, openingCashBalance);
  const bankEntries = applyFinanceLedgerRunningBalances(
    bankEntryDrafts,
    openingBankBalance,
    openingBankByAccount,
  );

  const totalCashIn = normalizeFinanceAmount(
    cashEntries
      .filter((entry) => entry.direction === 'IN')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const totalCashOut = normalizeFinanceAmount(
    cashEntries
      .filter((entry) => entry.direction === 'OUT')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const totalBankIn = normalizeFinanceAmount(
    bankEntries
      .filter((entry) => entry.direction === 'IN' && entry.affectsBalance)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const totalBankOut = normalizeFinanceAmount(
    bankEntries
      .filter((entry) => entry.direction === 'OUT' && entry.affectsBalance)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const pendingBankVerificationAmount = normalizeFinanceAmount(
    bankEntries
      .filter((entry) => entry.direction === 'IN' && !entry.affectsBalance)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const matchedBankAmount = normalizeFinanceAmount(
    bankEntries
      .filter((entry) => entry.affectsBalance && entry.matched)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const unmatchedBankAmount = normalizeFinanceAmount(
    bankEntries
      .filter((entry) => entry.affectsBalance && !entry.matched)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );

  const books: SerializedFinanceLedgerBookSummary[] = [];
  if (wantsCash) {
    books.push({
      book: 'CASHBOOK',
      label: 'Buku Kas',
      openingBalance: openingCashBalance,
      totalIn: totalCashIn,
      totalOut: totalCashOut,
      closingBalance: normalizeFinanceAmount(openingCashBalance + totalCashIn - totalCashOut),
      pendingAmount: 0,
      matchedAmount: 0,
      unmatchedAmount: 0,
      entryCount: cashEntries.length,
    });
  }
  if (wantsBank) {
    books.push({
      book: 'BANKBOOK',
      label: 'Buku Bank',
      openingBalance: openingBankBalance,
      totalIn: totalBankIn,
      totalOut: totalBankOut,
      closingBalance: normalizeFinanceAmount(openingBankBalance + totalBankIn - totalBankOut),
      pendingAmount: pendingBankVerificationAmount,
      matchedAmount: matchedBankAmount,
      unmatchedAmount: unmatchedBankAmount,
      entryCount: bankEntries.length,
    });
  }

  const bankAccountSummariesMap = new Map<
    number,
    Omit<SerializedFinanceLedgerBankAccountSummary, 'bankAccount' | 'latestFinalizedReconciliation'> & {
      latestFinalizedReconciliation: SerializedFinanceLedgerBankAccountSummary['latestFinalizedReconciliation'];
    }
  >();
  for (const accountId of bankAccountIds) {
    bankAccountSummariesMap.set(accountId, {
      openingBalance: normalizeFinanceAmount(openingBankByAccount.get(accountId) || 0),
      totalIn: 0,
      totalOut: 0,
      closingBalance: normalizeFinanceAmount(openingBankByAccount.get(accountId) || 0),
      pendingVerificationAmount: 0,
      matchedAmount: 0,
      unmatchedAmount: 0,
      entryCount: 0,
      latestFinalizedReconciliation: latestFinalizedByAccount.get(accountId) || null,
    });
  }

  for (const entry of bankEntries) {
    const accountId = entry.bankAccount?.id;
    if (!accountId) continue;
    const summary = bankAccountSummariesMap.get(accountId);
    if (!summary) continue;
    summary.entryCount += 1;
    summary.closingBalance = entry.accountRunningBalance ?? summary.closingBalance;
    if (entry.direction === 'IN' && entry.affectsBalance) {
      summary.totalIn = normalizeFinanceAmount(summary.totalIn + entry.amount);
    }
    if (entry.direction === 'OUT' && entry.affectsBalance) {
      summary.totalOut = normalizeFinanceAmount(summary.totalOut + entry.amount);
    }
    if (entry.direction === 'IN' && !entry.affectsBalance) {
      summary.pendingVerificationAmount = normalizeFinanceAmount(
        summary.pendingVerificationAmount + entry.amount,
      );
    }
    if (entry.affectsBalance) {
      if (entry.matched) {
        summary.matchedAmount = normalizeFinanceAmount(summary.matchedAmount + entry.amount);
      } else {
        summary.unmatchedAmount = normalizeFinanceAmount(summary.unmatchedAmount + entry.amount);
      }
    }
  }

  const bankAccounts = Array.from(bankAccountSummariesMap.entries())
    .map(([accountId, summary]) => {
      const bankAccount = bankAccountMap.get(accountId);
      if (!bankAccount) return null;
      return {
        bankAccount,
        openingBalance: summary.openingBalance,
        totalIn: summary.totalIn,
        totalOut: summary.totalOut,
        closingBalance: normalizeFinanceAmount(summary.openingBalance + summary.totalIn - summary.totalOut),
        pendingVerificationAmount: summary.pendingVerificationAmount,
        matchedAmount: summary.matchedAmount,
        unmatchedAmount: summary.unmatchedAmount,
        entryCount: summary.entryCount,
        latestFinalizedReconciliation: summary.latestFinalizedReconciliation,
      } satisfies SerializedFinanceLedgerBankAccountSummary;
    })
    .filter((summary): summary is SerializedFinanceLedgerBankAccountSummary => Boolean(summary))
    .sort((left, right) => left.bankAccount.bankName.localeCompare(right.bankAccount.bankName));

  const mergedEntries = [...cashEntries, ...bankEntries].sort((left, right) => {
    const time = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
    if (time !== 0) return time;
    return left.id.localeCompare(right.id);
  });

  return {
    filters: {
      book: params.book,
      bankAccountId: effectiveBankAccountId,
      dateFrom: params.dateFrom || null,
      dateTo: params.dateTo || null,
      search: normalizedSearch || null,
      limit: params.limit,
    },
    summary: {
      totalEntries: mergedEntries.length,
      openingCashBalance,
      totalCashIn,
      totalCashOut,
      closingCashBalance: normalizeFinanceAmount(openingCashBalance + totalCashIn - totalCashOut),
      openingBankBalance,
      totalBankIn,
      totalBankOut,
      closingBankBalance: normalizeFinanceAmount(openingBankBalance + totalBankIn - totalBankOut),
      pendingBankVerificationAmount,
      matchedBankAmount,
      unmatchedBankAmount,
    },
    books,
    bankAccounts,
    entries: mergedEntries.slice(0, params.limit),
  };
}

async function serializeFinanceBankReconciliationRecord(
  db: Prisma.TransactionClient | typeof prisma,
  reconciliation: {
    id: number;
    bankAccountId: number;
    reconciliationNo: string;
    status: FinanceBankReconciliationStatus;
    periodStart: Date;
    periodEnd: Date;
    statementOpeningBalance: number;
    statementClosingBalance: number;
    note?: string | null;
    finalizedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    bankAccount: {
      id: number;
      code: string;
      bankName: string;
      accountName: string;
      accountNumber: string;
      branch?: string | null;
      notes?: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
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
  },
): Promise<SerializedFinanceBankReconciliation> {
  const details = await buildFinanceBankReconciliationSummary(db, reconciliation);

  return {
    id: reconciliation.id,
    reconciliationNo: reconciliation.reconciliationNo,
    status: reconciliation.status,
    periodStart: reconciliation.periodStart,
    periodEnd: reconciliation.periodEnd,
    statementOpeningBalance: normalizeFinanceAmount(Number(reconciliation.statementOpeningBalance || 0)),
    statementClosingBalance: normalizeFinanceAmount(Number(reconciliation.statementClosingBalance || 0)),
    note: reconciliation.note || null,
    bankAccount: serializeFinanceBankAccount(reconciliation.bankAccount),
    createdBy: reconciliation.createdBy || null,
    finalizedBy: reconciliation.finalizedBy || null,
    finalizedAt: reconciliation.finalizedAt || null,
    createdAt: reconciliation.createdAt,
    updatedAt: reconciliation.updatedAt,
    summary: details.summary,
    statementEntries: details.statementEntries,
    systemPayments: details.systemPayments,
    systemRefunds: details.systemRefunds,
  };
}

async function resolveFinanceBankStatementAutoMatch(
  db: Prisma.TransactionClient | typeof prisma,
  reconciliation: {
    id: number;
    bankAccountId: number;
    periodStart: Date;
    periodEnd: Date;
  },
  payload: {
    entryDate: Date;
    direction: FinanceBankStatementDirection;
    amount: number;
    referenceNo?: string | null;
  },
): Promise<{
  status: FinanceBankStatementEntryStatus;
  matchedPaymentId: number | null;
  matchedRefundId: number | null;
}> {
  const { payments, refunds, statementEntries } = await loadFinanceBankReconciliationTransactions(db, reconciliation);
  const paymentRows = payments as any[];
  const refundRows = refunds as any[];
  const statementEntryRows = statementEntries as any[];
  const normalizedAmount = normalizeFinanceAmount(Number(payload.amount || 0));
  const referenceKey = normalizeFinanceReferenceKey(payload.referenceNo);

  if (payload.direction === 'CREDIT') {
    const reservedPaymentIds = new Set(
      statementEntryRows
        .map((entry: any) => entry.matchedPaymentId)
        .filter((value: any): value is number => Number.isInteger(value)),
    );
    const candidates = paymentRows
      .filter(
        (payment: any) =>
          !reservedPaymentIds.has(payment.id) &&
          payment.verificationStatus !== FinancePaymentVerificationStatus.REJECTED,
      )
      .map((payment: any) => ({
        payment,
        netBankAmount: normalizeFinanceAmount(
          Math.max(Number(payment.amount || 0) - Number(payment.reversedAmount || 0), 0),
        ),
      }))
      .filter((row: any) => row.netBankAmount > 0 && row.netBankAmount === normalizedAmount);

    if (referenceKey) {
      const exact = candidates.filter((row: any) => {
        const paymentRefKey = normalizeFinanceReferenceKey(row.payment.referenceNo);
        const paymentNoKey = normalizeFinanceReferenceKey(row.payment.paymentNo);
        return paymentRefKey === referenceKey || paymentNoKey === referenceKey;
      });
      if (exact.length === 1) {
        return {
          status: 'MATCHED',
          matchedPaymentId: exact[0].payment.id,
          matchedRefundId: null,
        };
      }
    }

    const sameDay = candidates.filter((row: any) => isFinanceSameDay(row.payment.paidAt, payload.entryDate));
    if (sameDay.length === 1) {
      return {
        status: 'MATCHED',
        matchedPaymentId: sameDay[0].payment.id,
        matchedRefundId: null,
      };
    }
  } else {
    const reservedRefundIds = new Set(
      statementEntryRows
        .map((entry: any) => entry.matchedRefundId)
        .filter((value: any): value is number => Number.isInteger(value)),
    );
    const candidates = refundRows
      .filter((refund: any) => !reservedRefundIds.has(refund.id))
      .filter((refund: any) => normalizeFinanceAmount(Number(refund.amount || 0)) === normalizedAmount);

    if (referenceKey) {
      const exact = candidates.filter((refund: any) => {
        const refundRefKey = normalizeFinanceReferenceKey(refund.referenceNo);
        const refundNoKey = normalizeFinanceReferenceKey(refund.refundNo);
        return refundRefKey === referenceKey || refundNoKey === referenceKey;
      });
      if (exact.length === 1) {
        return {
          status: 'MATCHED',
          matchedPaymentId: null,
          matchedRefundId: exact[0].id,
        };
      }
    }

    const sameDay = candidates.filter((refund: any) => isFinanceSameDay(refund.refundedAt, payload.entryDate));
    if (sameDay.length === 1) {
      return {
        status: 'MATCHED',
        matchedPaymentId: null,
        matchedRefundId: sameDay[0].id,
      };
    }
  }

  return {
    status: 'UNMATCHED',
    matchedPaymentId: null,
    matchedRefundId: null,
  };
}

const PERIOD_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const listFinanceReportQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  classId: z.coerce.number().int().positive().optional(),
  gradeLevel: z.string().trim().min(1).max(20).optional(),
  periodFrom: z
    .string()
    .trim()
    .regex(PERIOD_KEY_REGEX, 'Format periodFrom harus YYYY-MM')
    .optional(),
  periodTo: z
    .string()
    .trim()
    .regex(PERIOD_KEY_REGEX, 'Format periodTo harus YYYY-MM')
    .optional(),
  asOfDate: z.coerce.date().optional(),
});

const exportFinanceReportQuerySchema = listFinanceReportQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
  reportType: z.enum(['all', 'monthly', 'class', 'aging', 'detail', 'trend']).default('all'),
});

const dispatchFinanceReminderSchema = z.object({
  dueSoonDays: z.coerce.number().int().min(0).max(30).optional(),
  mode: z.enum(['ALL', 'DUE_SOON', 'OVERDUE', 'LATE_FEE', 'ESCALATION']).optional().default('ALL'),
  preview: z.coerce.boolean().optional().default(false),
});

const updateFinanceReminderPolicySchema = z.object({
  isActive: z.boolean().optional(),
  dueSoonDays: z.coerce.number().int().min(0).max(30).optional(),
  dueSoonRepeatIntervalDays: z.coerce.number().int().min(1).max(30).optional(),
  overdueRepeatIntervalDays: z.coerce.number().int().min(1).max(30).optional(),
  lateFeeWarningEnabled: z.boolean().optional(),
  lateFeeWarningRepeatIntervalDays: z.coerce.number().int().min(1).max(30).optional(),
  escalationEnabled: z.boolean().optional(),
  escalationStartDays: z.coerce.number().int().min(1).max(180).optional(),
  escalationRepeatIntervalDays: z.coerce.number().int().min(1).max(30).optional(),
  escalationMinOutstandingAmount: z.coerce.number().min(0).optional(),
  sendStudentReminder: z.boolean().optional(),
  sendParentReminder: z.boolean().optional(),
  escalateToFinanceStaff: z.boolean().optional(),
  escalateToHeadTu: z.boolean().optional(),
  escalateToPrincipal: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

type FinanceAgingBucketKey = 'CURRENT' | 'DUE_1_30' | 'DUE_31_60' | 'DUE_61_90' | 'DUE_OVER_90';
type FinanceCollectionPriority = 'MONITOR' | 'TINGGI' | 'KRITIS';

const FINANCE_AGING_BUCKETS: Array<{ key: FinanceAgingBucketKey; label: string }> = [
  { key: 'CURRENT', label: 'Belum Jatuh Tempo / Hari Ini' },
  { key: 'DUE_1_30', label: 'Lewat 1-30 Hari' },
  { key: 'DUE_31_60', label: 'Lewat 31-60 Hari' },
  { key: 'DUE_61_90', label: 'Lewat 61-90 Hari' },
  { key: 'DUE_OVER_90', label: 'Lewat > 90 Hari' },
];

type FinanceReportFilters = {
  academicYearId?: number;
  semester?: Semester;
  classId?: number;
  gradeLevel?: string;
  periodFrom?: string;
  periodTo?: string;
  asOfDate?: Date;
};

function resolveAgingBucketKey(daysPastDue: number): FinanceAgingBucketKey {
  if (daysPastDue <= 0) return 'CURRENT';
  if (daysPastDue <= 30) return 'DUE_1_30';
  if (daysPastDue <= 60) return 'DUE_31_60';
  if (daysPastDue <= 90) return 'DUE_61_90';
  return 'DUE_OVER_90';
}

function toIsoDate(date?: Date | null): string | null {
  if (!date) return null;
  const normalized = new Date(date);
  if (Number.isNaN(normalized.getTime())) return null;
  return normalized.toISOString().slice(0, 10);
}

function resolveFinanceCollectionPriority(params: {
  maxDaysPastDue: number;
  overdueOutstanding: number;
  overdueInvoices: number;
}): FinanceCollectionPriority {
  if (
    params.maxDaysPastDue >= 60 ||
    params.overdueOutstanding >= 5_000_000 ||
    params.overdueInvoices >= 4
  ) {
    return 'KRITIS';
  }

  if (
    params.maxDaysPastDue >= 14 ||
    params.overdueOutstanding >= 2_000_000 ||
    params.overdueInvoices >= 2
  ) {
    return 'TINGGI';
  }

  return 'MONITOR';
}

function getFinanceCollectionPriorityWeight(priority: FinanceCollectionPriority): number {
  if (priority === 'KRITIS') return 3;
  if (priority === 'TINGGI') return 2;
  return 1;
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toCsvContent(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.map((header) => escapeCsvCell(header)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header])).join(','),
  );
  return [headerLine, ...dataLines].join('\n');
}

async function buildFinanceReportSnapshot(filters: FinanceReportFilters) {
  const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();
  asOfDate.setHours(0, 0, 0, 0);

  const periodFilter =
    filters.periodFrom || filters.periodTo
      ? {
          periodKey: {
            ...(filters.periodFrom ? { gte: filters.periodFrom } : {}),
            ...(filters.periodTo ? { lte: filters.periodTo } : {}),
          },
        }
      : {};

  const invoices = await prisma.financeInvoice.findMany({
    where: {
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.semester ? { semester: filters.semester } : {}),
      ...((filters.classId || filters.gradeLevel)
        ? {
            student: {
              ...(filters.classId ? { classId: filters.classId } : {}),
              ...(filters.gradeLevel
                ? {
                    studentClass: {
                      level: {
                        equals: filters.gradeLevel.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...periodFilter,
    },
    select: {
      id: true,
      invoiceNo: true,
      studentId: true,
      academicYearId: true,
      semester: true,
      periodKey: true,
      title: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      status: true,
      issuedAt: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          componentId: true,
          componentCode: true,
          componentName: true,
          amount: true,
        },
      },
      payments: {
        select: {
          amount: true,
          source: true,
          paidAt: true,
          createdAt: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
          phone: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      },
    },
    orderBy: [{ periodKey: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });

  const monthlyMap = new Map<
    string,
    {
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
  >();
  const monthlyStudentSetMap = new Map<string, Set<number>>();

  const classMap = new Map<
    string,
    {
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
  >();
  const classStudentSetMap = new Map<string, Set<number>>();

  const agingMap = new Map(
    FINANCE_AGING_BUCKETS.map((bucket) => [
      bucket.key,
      {
        key: bucket.key,
        label: bucket.label,
        invoiceCount: 0,
        totalOutstanding: 0,
      },
    ]),
  );

  const detailRows: Array<{
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
  }> = [];

  const collectionQueueMap = new Map<
    number,
    {
      studentId: number;
      studentName: string;
      username: string;
      nis: string;
      className: string;
      phone: string;
      totalOutstanding: number;
      overdueOutstanding: number;
      openInvoices: number;
      overdueInvoices: number;
      maxDaysPastDue: number;
      nextDueDate: Date | null;
      lastPaymentDate: Date | null;
    }
  >();
  const dueSoonInvoices: Array<{
    invoiceId: number;
    invoiceNo: string;
    studentId: number;
    studentName: string;
    className: string;
    dueDate: string | null;
    balanceAmount: number;
    daysUntilDue: number;
    status: FinanceInvoiceStatus;
    semester: Semester;
    periodKey: string;
    title: string;
  }> = [];
  const componentReceivableMap = new Map<
    string,
    {
      componentCode: string;
      componentName: string;
      totalAmount: number;
      totalOutstanding: number;
      overdueOutstanding: number;
    }
  >();
  const componentStudentSetMap = new Map<string, Set<number>>();
  const componentInvoiceSetMap = new Map<string, Set<number>>();

  const summary = {
    totalInvoices: 0,
    totalStudents: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    unpaidCount: 0,
    partialCount: 0,
    paidCount: 0,
    cancelledCount: 0,
    overdueInvoices: 0,
    overdueOutstanding: 0,
  };
  const summaryStudentSet = new Set<number>();
  const paymentTrendMap = new Map<string, { date: string; paymentCount: number; totalPaid: number }>();
  let reportWindowMinDate: Date | null = null;
  let reportWindowMaxDate: Date | null = null;
  let dueSoonOutstanding = 0;

  for (const invoice of invoices) {
    const totalAmount = Number(invoice.totalAmount || 0);
    const paidAmount = Number(invoice.paidAmount || 0);
    const balanceAmount = Number(invoice.balanceAmount || 0);
    const periodKey = String(invoice.periodKey || '-');
    const classId = invoice.student.studentClass?.id ?? null;
    const className = invoice.student.studentClass?.name || 'Tanpa Kelas';
    const classMapKey = String(classId ?? 0);

    let daysPastDue = 0;
    if (invoice.dueDate) {
      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      daysPastDue = Math.floor((asOfDate.getTime() - dueDate.getTime()) / 86_400_000);
    }
    const isOverdue =
      balanceAmount > 0 &&
      invoice.status !== 'PAID' &&
      invoice.status !== 'CANCELLED' &&
      invoice.dueDate != null &&
      daysPastDue > 0;
    const isOpenInvoice = balanceAmount > 0 && invoice.status !== 'CANCELLED';
    const agingBucketKey = resolveAgingBucketKey(daysPastDue);
    const agingBucket = agingMap.get(agingBucketKey)!;
    const issuedDate = new Date(invoice.issuedAt || invoice.createdAt);
    if (!Number.isNaN(issuedDate.getTime())) {
      issuedDate.setHours(0, 0, 0, 0);
      if (!reportWindowMinDate || issuedDate < reportWindowMinDate) {
        reportWindowMinDate = issuedDate;
      }
      if (!reportWindowMaxDate || issuedDate > reportWindowMaxDate) {
        reportWindowMaxDate = issuedDate;
      }
    }

    summary.totalInvoices += 1;
    summary.totalAmount += totalAmount;
    summary.totalPaid += paidAmount;
    summary.totalOutstanding += balanceAmount;
    if (invoice.status === 'UNPAID') summary.unpaidCount += 1;
    if (invoice.status === 'PARTIAL') summary.partialCount += 1;
    if (invoice.status === 'PAID') summary.paidCount += 1;
    if (invoice.status === 'CANCELLED') summary.cancelledCount += 1;
    if (isOverdue) {
      summary.overdueInvoices += 1;
      summary.overdueOutstanding += balanceAmount;
    }
    summaryStudentSet.add(invoice.studentId);

    const monthly = monthlyMap.get(periodKey) || {
      periodKey,
      invoiceCount: 0,
      studentCount: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      unpaidCount: 0,
      partialCount: 0,
      paidCount: 0,
      cancelledCount: 0,
      overdueCount: 0,
      overdueOutstanding: 0,
    };
    monthly.invoiceCount += 1;
    monthly.totalAmount += totalAmount;
    monthly.totalPaid += paidAmount;
    monthly.totalOutstanding += balanceAmount;
    if (invoice.status === 'UNPAID') monthly.unpaidCount += 1;
    if (invoice.status === 'PARTIAL') monthly.partialCount += 1;
    if (invoice.status === 'PAID') monthly.paidCount += 1;
    if (invoice.status === 'CANCELLED') monthly.cancelledCount += 1;
    if (isOverdue) {
      monthly.overdueCount += 1;
      monthly.overdueOutstanding += balanceAmount;
    }
    monthlyMap.set(periodKey, monthly);
    const monthlyStudents = monthlyStudentSetMap.get(periodKey) || new Set<number>();
    monthlyStudents.add(invoice.studentId);
    monthlyStudentSetMap.set(periodKey, monthlyStudents);

    const classRow = classMap.get(classMapKey) || {
      classId,
      className,
      invoiceCount: 0,
      studentCount: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueCount: 0,
      overdueOutstanding: 0,
    };
    classRow.invoiceCount += 1;
    classRow.totalAmount += totalAmount;
    classRow.totalPaid += paidAmount;
    classRow.totalOutstanding += balanceAmount;
    if (isOverdue) {
      classRow.overdueCount += 1;
      classRow.overdueOutstanding += balanceAmount;
    }
    classMap.set(classMapKey, classRow);
    const classStudents = classStudentSetMap.get(classMapKey) || new Set<number>();
    classStudents.add(invoice.studentId);
    classStudentSetMap.set(classMapKey, classStudents);

    if (balanceAmount > 0 && invoice.status !== 'CANCELLED') {
      agingBucket.invoiceCount += 1;
      agingBucket.totalOutstanding += balanceAmount;
    }

    if (isOpenInvoice) {
      const collectionRow = collectionQueueMap.get(invoice.studentId) || {
        studentId: invoice.studentId,
        studentName: invoice.student.name,
        username: invoice.student.username,
        nis: invoice.student.nis || '',
        className,
        phone: invoice.student.phone || '',
        totalOutstanding: 0,
        overdueOutstanding: 0,
        openInvoices: 0,
        overdueInvoices: 0,
        maxDaysPastDue: 0,
        nextDueDate: null,
        lastPaymentDate: null,
      };

      collectionRow.totalOutstanding += balanceAmount;
      collectionRow.openInvoices += 1;

      if (isOverdue) {
        collectionRow.overdueOutstanding += balanceAmount;
        collectionRow.overdueInvoices += 1;
        collectionRow.maxDaysPastDue = Math.max(collectionRow.maxDaysPastDue, daysPastDue);
      }

      if (invoice.dueDate) {
        const dueDate = new Date(invoice.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        if (!Number.isNaN(dueDate.getTime())) {
          if (!collectionRow.nextDueDate || dueDate < collectionRow.nextDueDate) {
            collectionRow.nextDueDate = dueDate;
          }

          const daysUntilDue = Math.floor((dueDate.getTime() - asOfDate.getTime()) / 86_400_000);
          if (daysUntilDue >= 0 && daysUntilDue <= 7) {
            dueSoonOutstanding += balanceAmount;
            dueSoonInvoices.push({
              invoiceId: invoice.id,
              invoiceNo: invoice.invoiceNo,
              studentId: invoice.studentId,
              studentName: invoice.student.name,
              className,
              dueDate: toIsoDate(dueDate),
              balanceAmount,
              daysUntilDue,
              status: invoice.status,
              semester: invoice.semester,
              periodKey,
              title: invoice.title || '',
            });
          }
        }
      }

      collectionQueueMap.set(invoice.studentId, collectionRow);
    }

    detailRows.push({
      invoiceNo: invoice.invoiceNo,
      studentName: invoice.student.name,
      username: invoice.student.username,
      nis: invoice.student.nis || '',
      nisn: invoice.student.nisn || '',
      className,
      periodKey,
      semester: invoice.semester === 'ODD' ? 'Ganjil' : 'Genap',
      dueDate: toIsoDate(invoice.dueDate),
      status: invoice.status,
      totalAmount,
      paidAmount,
      balanceAmount,
      daysPastDue,
      agingLabel: FINANCE_AGING_BUCKETS.find((bucket) => bucket.key === agingBucketKey)?.label || '-',
      isOverdue,
      title: invoice.title || '',
      issuedAt: toIsoDate(invoice.issuedAt || invoice.createdAt),
    });

    for (const payment of invoice.payments) {
      if (payment.source === FinancePaymentSource.CREDIT_BALANCE) {
        continue;
      }

      const paymentDate = new Date(payment.paidAt || payment.createdAt);
      if (Number.isNaN(paymentDate.getTime())) continue;
      paymentDate.setHours(0, 0, 0, 0);
      if (paymentDate > asOfDate) continue;

      if (isOpenInvoice) {
        const collectionRow = collectionQueueMap.get(invoice.studentId);
        if (collectionRow && (!collectionRow.lastPaymentDate || paymentDate > collectionRow.lastPaymentDate)) {
          collectionRow.lastPaymentDate = paymentDate;
        }
      }

      const dateKey = toIsoDate(paymentDate);
      if (!dateKey) continue;
      const trendRow = paymentTrendMap.get(dateKey) || {
        date: dateKey,
        paymentCount: 0,
        totalPaid: 0,
      };
      trendRow.paymentCount += 1;
      trendRow.totalPaid += Number(payment.amount || 0);
      paymentTrendMap.set(dateKey, trendRow);
    }

    if (isOpenInvoice && invoice.items.length > 0) {
      const outstandingRatio = totalAmount > 0 ? Math.min(1, Math.max(0, balanceAmount / totalAmount)) : 0;
      for (const item of invoice.items) {
        const componentKey =
          item.componentId != null
            ? `id:${item.componentId}`
            : item.componentCode
              ? `code:${item.componentCode}`
              : `name:${item.componentName}`;
        const componentRow = componentReceivableMap.get(componentKey) || {
          componentCode: item.componentCode || '-',
          componentName: item.componentName || item.componentCode || 'Komponen Tanpa Nama',
          totalAmount: 0,
          totalOutstanding: 0,
          overdueOutstanding: 0,
        };
        const itemAmount = Number(item.amount || 0);
        const itemOutstanding = itemAmount * outstandingRatio;

        componentRow.totalAmount += itemAmount;
        componentRow.totalOutstanding += itemOutstanding;
        if (isOverdue) {
          componentRow.overdueOutstanding += itemOutstanding;
        }
        componentReceivableMap.set(componentKey, componentRow);

        const componentStudents = componentStudentSetMap.get(componentKey) || new Set<number>();
        componentStudents.add(invoice.studentId);
        componentStudentSetMap.set(componentKey, componentStudents);

        const componentInvoices = componentInvoiceSetMap.get(componentKey) || new Set<number>();
        componentInvoices.add(invoice.id);
        componentInvoiceSetMap.set(componentKey, componentInvoices);
      }
    }
  }

  summary.totalStudents = summaryStudentSet.size;

  const monthlyRecap = Array.from(monthlyMap.values())
    .map((row) => ({
      ...row,
      studentCount: monthlyStudentSetMap.get(row.periodKey)?.size || 0,
    }))
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey));

  const classRecap = Array.from(classMap.values())
    .map((row) => ({
      ...row,
      studentCount: classStudentSetMap.get(String(row.classId ?? 0))?.size || 0,
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding || a.className.localeCompare(b.className));

  const agingPiutang = FINANCE_AGING_BUCKETS.map((bucket) => agingMap.get(bucket.key)!);
  const paymentDailyTrend = Array.from(paymentTrendMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60);
  const collectionPriorityQueue = Array.from(collectionQueueMap.values())
    .map((row) => {
      const priority = resolveFinanceCollectionPriority({
        maxDaysPastDue: row.maxDaysPastDue,
        overdueOutstanding: row.overdueOutstanding,
        overdueInvoices: row.overdueInvoices,
      });

      return {
        studentId: row.studentId,
        studentName: row.studentName,
        username: row.username,
        nis: row.nis,
        className: row.className,
        phone: row.phone || null,
        totalOutstanding: row.totalOutstanding,
        overdueOutstanding: row.overdueOutstanding,
        openInvoices: row.openInvoices,
        overdueInvoices: row.overdueInvoices,
        maxDaysPastDue: row.maxDaysPastDue,
        nextDueDate: toIsoDate(row.nextDueDate),
        lastPaymentDate: toIsoDate(row.lastPaymentDate),
        priority,
      };
    })
    .sort((a, b) => {
      const priorityDiff =
        getFinanceCollectionPriorityWeight(b.priority) - getFinanceCollectionPriorityWeight(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      if (b.overdueOutstanding !== a.overdueOutstanding) {
        return b.overdueOutstanding - a.overdueOutstanding;
      }
      if (b.maxDaysPastDue !== a.maxDaysPastDue) {
        return b.maxDaysPastDue - a.maxDaysPastDue;
      }
      if (b.totalOutstanding !== a.totalOutstanding) {
        return b.totalOutstanding - a.totalOutstanding;
      }
      return a.studentName.localeCompare(b.studentName, 'id-ID', { sensitivity: 'base' });
    })
    .slice(0, 100);
  const collectionOverview = {
    studentsWithOutstanding: collectionPriorityQueue.length,
    criticalCount: collectionPriorityQueue.filter((row) => row.priority === 'KRITIS').length,
    highPriorityCount: collectionPriorityQueue.filter((row) => row.priority === 'TINGGI').length,
    dueSoonCount: dueSoonInvoices.length,
    dueSoonOutstanding,
  };
  const componentReceivableRecap = Array.from(componentReceivableMap.entries())
    .map(([key, row]) => ({
      componentCode: row.componentCode,
      componentName: row.componentName,
      invoiceCount: componentInvoiceSetMap.get(key)?.size || 0,
      studentCount: componentStudentSetMap.get(key)?.size || 0,
      totalAmount: row.totalAmount,
      totalOutstanding: row.totalOutstanding,
      overdueOutstanding: row.overdueOutstanding,
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding || a.componentName.localeCompare(b.componentName))
    .slice(0, 100);
  const sortedDueSoonInvoices = [...dueSoonInvoices]
    .sort((a, b) => {
      if (a.daysUntilDue !== b.daysUntilDue) return a.daysUntilDue - b.daysUntilDue;
      if (b.balanceAmount !== a.balanceAmount) return b.balanceAmount - a.balanceAmount;
      return a.studentName.localeCompare(b.studentName, 'id-ID', { sensitivity: 'base' });
    })
    .slice(0, 100);

  const fallbackWindowStart = new Date(asOfDate);
  fallbackWindowStart.setDate(fallbackWindowStart.getDate() - 29);
  const windowStart = reportWindowMinDate || fallbackWindowStart;
  const windowEndBase = reportWindowMaxDate && reportWindowMaxDate < asOfDate ? reportWindowMaxDate : asOfDate;
  const rawDiff = windowEndBase.getTime() - windowStart.getTime();
  const windowDays = rawDiff >= 0 ? Math.floor(rawDiff / 86_400_000) + 1 : 1;
  const collectionRate = summary.totalAmount > 0 ? (summary.totalPaid / summary.totalAmount) * 100 : 0;
  const dsoDays =
    summary.totalAmount > 0 ? (summary.totalOutstanding / summary.totalAmount) * windowDays : 0;
  const overdueRate =
    summary.totalOutstanding > 0
      ? (summary.overdueOutstanding / summary.totalOutstanding) * 100
      : 0;

  return {
    filters: {
      academicYearId: filters.academicYearId || null,
      semester: filters.semester || null,
      classId: filters.classId || null,
      gradeLevel: filters.gradeLevel?.trim() || null,
      periodFrom: filters.periodFrom || null,
      periodTo: filters.periodTo || null,
      asOfDate: toIsoDate(asOfDate),
    },
    summary,
    kpi: {
      collectionRate,
      dsoDays,
      overdueRate,
      windowDays,
    },
    monthlyRecap,
    classRecap,
    agingPiutang,
    paymentDailyTrend,
    detailRows,
    collectionOverview,
    collectionPriorityQueue,
    dueSoonInvoices: sortedDueSoonInvoices,
    componentReceivableRecap,
  };
}

function isDateInsideRange(date: Date, start?: Date | null, end?: Date | null): boolean {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function scoreTariffForStudent(
  tariff: {
    classId: number | null;
    majorId: number | null;
    gradeLevel: string | null;
    academicYearId: number | null;
    semester: Semester | null;
  },
  student: {
    classId: number | null;
    studentClass: {
      level: string;
      majorId: number;
    } | null;
  },
  academicYearId: number,
  semester: Semester,
): number {
  if (tariff.classId != null && tariff.classId !== student.classId) return -1;
  if (tariff.majorId != null && tariff.majorId !== student.studentClass?.majorId) return -1;
  if (
    tariff.gradeLevel != null &&
    tariff.gradeLevel.trim().toUpperCase() !== (student.studentClass?.level || '').trim().toUpperCase()
  ) {
    return -1;
  }
  if (tariff.academicYearId != null && tariff.academicYearId !== academicYearId) return -1;
  if (tariff.semester != null && tariff.semester !== semester) return -1;

  let score = 0;
  if (tariff.classId != null) score += 64;
  if (tariff.majorId != null) score += 32;
  if (tariff.gradeLevel != null) score += 16;
  if (tariff.academicYearId != null) score += 8;
  if (tariff.semester != null) score += 4;
  return score;
}

function scoreAdjustmentRuleForStudent(
  rule: {
    studentId: number | null;
    classId: number | null;
    majorId: number | null;
    gradeLevel: string | null;
    academicYearId: number | null;
    semester: Semester | null;
  },
  student: {
    id: number;
    classId: number | null;
    studentClass: {
      level: string;
      majorId: number;
    } | null;
  },
  academicYearId: number,
  semester: Semester,
): number {
  if (rule.studentId != null && rule.studentId !== student.id) return -1;
  if (rule.classId != null && rule.classId !== student.classId) return -1;
  if (rule.majorId != null && rule.majorId !== student.studentClass?.majorId) return -1;
  if (
    rule.gradeLevel != null &&
    rule.gradeLevel.trim().toUpperCase() !== (student.studentClass?.level || '').trim().toUpperCase()
  ) {
    return -1;
  }
  if (rule.academicYearId != null && rule.academicYearId !== academicYearId) return -1;
  if (rule.semester != null && rule.semester !== semester) return -1;

  let score = 0;
  if (rule.studentId != null) score += 128;
  if (rule.classId != null) score += 64;
  if (rule.majorId != null) score += 32;
  if (rule.gradeLevel != null) score += 16;
  if (rule.academicYearId != null) score += 8;
  if (rule.semester != null) score += 4;
  return score;
}

type FinanceInvoiceTargetStudent = {
  id: number;
  name: string;
  classId: number | null;
  role: string;
  studentClass: {
    id: number;
    name: string;
    level: string;
    majorId: number;
    major: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
  parents: Array<{
    id: number;
    role: string;
  }>;
};

type FinanceInvoiceGenerationPlanStatus =
  | 'READY_CREATE'
  | 'READY_UPDATE'
  | 'SKIPPED_NO_TARIFF'
  | 'SKIPPED_EXISTS'
  | 'SKIPPED_LOCKED_PAID';

type FinanceInvoiceGenerationPlanItem = {
  itemKey: string;
  componentId: number | null;
  componentCode: string | null;
  componentName: string;
  amount: number;
  notes: string | null;
};

type FinanceInvoiceGenerationPlanInstallment = {
  sequence: number;
  amount: number;
  dueDate: Date | null;
};

type FinanceInvoiceGenerationPlanRow = {
  student: FinanceInvoiceTargetStudent;
  status: FinanceInvoiceGenerationPlanStatus;
  invoiceId: number | null;
  invoiceNo: string | null;
  totalAmount: number;
  projectedPaidAmount: number;
  projectedBalanceAmount: number;
  creditAutoApply: {
    enabled: boolean;
    availableBalance: number;
    appliedAmount: number;
    remainingBalance: number;
  };
  installmentPlan: {
    count: number;
    intervalDays: number;
    installments: FinanceInvoiceGenerationPlanInstallment[];
  };
  items: FinanceInvoiceGenerationPlanItem[];
};

function normalizeFinanceComparableText(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function normalizeFinanceClassLevel(value?: string | null) {
  const normalized = normalizeFinanceComparableText(value).replace(/^KELAS\s+/i, '').trim();
  if (!normalized) return '';
  const tokenMatch = normalized.match(/\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|12|11|10|9|8|7|6|5|4|3|2|1)\b/);
  return (tokenMatch?.[1] || normalized.split(/\s+/)[0] || '').trim();
}

function getFinanceClassLevelSortRank(level: string) {
  const normalized = normalizeFinanceClassLevel(level);
  const rankMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
  };
  if (rankMap[normalized] != null) return rankMap[normalized];
  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  return Number.MAX_SAFE_INTEGER;
}

type FinanceAdjustmentRuleCandidate = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  kind: FinanceAdjustmentKind;
  amount: number;
  componentId: number | null;
  academicYearId: number | null;
  majorId: number | null;
  classId: number | null;
  studentId: number | null;
  semester: Semester | null;
  gradeLevel: string | null;
  effectiveStart: Date | null;
  effectiveEnd: Date | null;
  notes: string | null;
  component: {
    id: number;
    code: string;
    name: string;
  } | null;
};

function getFinanceAdjustmentKindLabel(kind: FinanceAdjustmentKind) {
  if (kind === 'SCHOLARSHIP') return 'Beasiswa';
  if (kind === 'SURCHARGE') return 'Surcharge';
  return 'Potongan';
}

function getFinanceAdjustmentItemName(rule: FinanceAdjustmentRuleCandidate) {
  const prefix = getFinanceAdjustmentKindLabel(rule.kind);
  if (rule.component?.name) {
    return `${prefix} - ${rule.name} (${rule.component.name})`;
  }
  return `${prefix} - ${rule.name}`;
}

function getFinanceAdjustmentItemNotes(rule: FinanceAdjustmentRuleCandidate, options?: { capped?: boolean }) {
  const notes = [rule.description?.trim(), rule.notes?.trim()].filter((value): value is string => Boolean(value));
  if (options?.capped && (rule.kind === 'DISCOUNT' || rule.kind === 'SCHOLARSHIP')) {
    notes.push('Nominal diterapkan parsial sesuai sisa tagihan yang masih bisa disesuaikan.');
  }
  return notes.join(' • ') || null;
}

function compareFinanceAdjustmentRules(
  left: { rule: FinanceAdjustmentRuleCandidate; score: number },
  right: { rule: FinanceAdjustmentRuleCandidate; score: number },
) {
  const getPriority = (rule: FinanceAdjustmentRuleCandidate) => {
    if (rule.componentId != null && (rule.kind === 'DISCOUNT' || rule.kind === 'SCHOLARSHIP')) return 0;
    if (rule.componentId != null && rule.kind === 'SURCHARGE') return 1;
    if (rule.componentId == null && (rule.kind === 'DISCOUNT' || rule.kind === 'SCHOLARSHIP')) return 2;
    return 3;
  };

  const priorityDiff = getPriority(left.rule) - getPriority(right.rule);
  if (priorityDiff !== 0) return priorityDiff;
  if (left.score !== right.score) return right.score - left.score;
  if (left.rule.amount !== right.rule.amount) return right.rule.amount - left.rule.amount;
  return left.rule.id - right.rule.id;
}

async function resolveFinanceTargetAcademicYearId(academicYearId?: number) {
  if (academicYearId) return academicYearId;

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  return activeYear?.id || null;
}

function summarizeFinanceInvoiceGenerationRows(rows: FinanceInvoiceGenerationPlanRow[]) {
  return rows.reduce(
    (acc, row) => {
      if (row.status === 'READY_CREATE') {
        acc.created += 1;
        acc.totalProjectedAmount += row.totalAmount;
        acc.totalProjectedAppliedCredit += row.creditAutoApply.appliedAmount;
        acc.totalProjectedOutstanding += row.projectedBalanceAmount;
      } else if (row.status === 'READY_UPDATE') {
        acc.updated += 1;
        acc.totalProjectedAmount += row.totalAmount;
        acc.totalProjectedAppliedCredit += row.creditAutoApply.appliedAmount;
        acc.totalProjectedOutstanding += row.projectedBalanceAmount;
      } else if (row.status === 'SKIPPED_NO_TARIFF') {
        acc.skippedNoTariff += 1;
      } else if (row.status === 'SKIPPED_EXISTS') {
        acc.skippedExisting += 1;
      } else if (row.status === 'SKIPPED_LOCKED_PAID') {
        acc.skippedLocked += 1;
      }

      return acc;
    },
    {
      totalTargetStudents: rows.length,
      created: 0,
      updated: 0,
      skippedNoTariff: 0,
      skippedExisting: 0,
      skippedLocked: 0,
      totalProjectedAmount: 0,
      totalProjectedAppliedCredit: 0,
      totalProjectedOutstanding: 0,
    },
  );
}

function getFinanceInvoiceGenerationReason(row: FinanceInvoiceGenerationPlanRow) {
  if (row.status === 'SKIPPED_NO_TARIFF') {
    return 'Tidak ada rule tarif aktif yang cocok untuk siswa ini pada filter dan periode yang dipilih.';
  }
  if (row.status === 'SKIPPED_EXISTS') {
    return 'Invoice periode ini sudah ada. Aktifkan replace jika ingin memperbarui invoice yang belum dibayar.';
  }
  if (row.status === 'SKIPPED_LOCKED_PAID') {
    return 'Invoice periode ini sudah memiliki pembayaran sehingga tidak bisa diganti otomatis.';
  }
  if (row.status === 'READY_UPDATE') {
    return 'Invoice existing belum dibayar dan siap diperbarui jika generate dijalankan.';
  }
  if (row.status === 'READY_CREATE') {
    return 'Invoice baru siap dibuat berdasarkan rule tarif yang cocok.';
  }
  return null;
}

function mapFinanceInvoiceGenerationRowDetail(row: FinanceInvoiceGenerationPlanRow) {
  return {
    studentId: row.student.id,
    studentName: row.student.name,
    className: row.student.studentClass?.name || 'Tanpa Kelas',
    majorName: row.student.studentClass?.major?.name || null,
    gradeLevel: row.student.studentClass?.level || null,
    status: row.status,
    invoiceId: row.invoiceId,
    invoiceNo: row.invoiceNo,
    totalAmount: row.totalAmount,
    projectedPaidAmount: row.projectedPaidAmount,
    projectedBalanceAmount: row.projectedBalanceAmount,
    itemCount: row.items.length,
    componentNames: row.items.map((item) => item.componentName),
    items: row.items.map((item) => ({
      itemKey: item.itemKey,
      componentId: item.componentId,
      componentCode: item.componentCode,
      componentName: item.componentName,
      amount: item.amount,
      notes: item.notes,
    })),
    creditAutoApply: {
      enabled: row.creditAutoApply.enabled,
      availableBalance: row.creditAutoApply.availableBalance,
      appliedAmount: row.creditAutoApply.appliedAmount,
      remainingBalance: row.creditAutoApply.remainingBalance,
    },
    installmentPlan: {
      count: row.installmentPlan.count,
      intervalDays: row.installmentPlan.intervalDays,
      installments: row.installmentPlan.installments.map((installment) => ({
        sequence: installment.sequence,
        amount: installment.amount,
        dueDate: installment.dueDate,
      })),
    },
    reason: getFinanceInvoiceGenerationReason(row),
  };
}

async function buildFinanceInvoiceGenerationPlan(payload: z.infer<typeof generateInvoicesSchema>) {
  const targetAcademicYearId = await resolveFinanceTargetAcademicYearId(payload.academicYearId);

  if (!targetAcademicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
  }

  const studentWhere: Record<string, unknown> = {
    role: 'STUDENT',
  };

  const hasExplicitStudentSelection = payload.studentIds.length > 0;

  if (!hasExplicitStudentSelection && payload.classId) {
    studentWhere.classId = payload.classId;
  }

  if (hasExplicitStudentSelection) {
    studentWhere.id = { in: payload.studentIds };
  }

  const rawStudents = await prisma.user.findMany({
    where: studentWhere,
    select: {
      id: true,
      name: true,
      classId: true,
      role: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          level: true,
          majorId: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      parents: {
        select: {
          id: true,
          role: true,
        },
      },
    },
    orderBy: [{ name: 'asc' }],
  });

  const normalizedGradeLevel = normalizeFinanceComparableText(payload.gradeLevel);
  const students = rawStudents.filter((student) => {
    if (!hasExplicitStudentSelection && payload.majorId && student.studentClass?.majorId !== payload.majorId) {
      return false;
    }
    if (
      !hasExplicitStudentSelection &&
      normalizedGradeLevel &&
      normalizeFinanceComparableText(student.studentClass?.level) !== normalizedGradeLevel
    ) {
      return false;
    }
    return true;
  }) as FinanceInvoiceTargetStudent[];

  if (students.length === 0) {
    throw new ApiError(404, 'Siswa target tidak ditemukan untuk generate tagihan');
  }

  const today = new Date();

  const tariffs = await prisma.financeTariffRule.findMany({
    where: {
      isActive: true,
      component: {
        isActive: true,
      },
      AND: [
        { OR: [{ academicYearId: null }, { academicYearId: targetAcademicYearId }] },
        { OR: [{ semester: null }, { semester: payload.semester }] },
      ],
    },
    include: {
      component: true,
    },
  });

  const adjustmentRules = await prisma.financeAdjustmentRule.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ academicYearId: null }, { academicYearId: targetAcademicYearId }] },
        { OR: [{ semester: null }, { semester: payload.semester }] },
      ],
    },
    include: {
      component: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: [{ id: 'asc' }],
  });

  const existingInvoices = await prisma.financeInvoice.findMany({
    where: {
      studentId: {
        in: students.map((student) => student.id),
      },
      semester: payload.semester,
      periodKey: payload.periodKey,
    },
    select: {
      id: true,
      studentId: true,
      invoiceNo: true,
      paidAmount: true,
      totalAmount: true,
      balanceAmount: true,
      writtenOffAmount: true,
    },
  });

  const existingInvoiceMap = new Map(existingInvoices.map((invoice) => [invoice.studentId, invoice]));
  const creditBalances = payload.autoApplyCreditBalance
    ? await prisma.financeCreditBalance.findMany({
        where: {
          studentId: {
            in: students.map((student) => student.id),
          },
          balanceAmount: {
            gt: 0,
          },
        },
        select: {
          studentId: true,
          balanceAmount: true,
        },
      })
    : [];
  const creditBalanceMap = new Map(
    creditBalances.map((balance) => [balance.studentId, Number(balance.balanceAmount || 0)]),
  );

  const rows = students.map<FinanceInvoiceGenerationPlanRow>((student) => {
    const scoredTariffs = tariffs
      .filter((tariff) => isDateInsideRange(today, tariff.effectiveStart, tariff.effectiveEnd))
      .map((tariff) => ({
        tariff,
        score: scoreTariffForStudent(tariff, student, targetAcademicYearId, payload.semester),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);

    const bestTariffByComponent = new Map<number, (typeof scoredTariffs)[number]>();
    for (const item of scoredTariffs) {
      const existing = bestTariffByComponent.get(item.tariff.componentId);
      if (!existing || item.score > existing.score) {
        bestTariffByComponent.set(item.tariff.componentId, item);
      }
    }

    const selectedTariffs = Array.from(bestTariffByComponent.values()).map((item) => item.tariff);

    if (selectedTariffs.length === 0) {
      return {
        student,
        status: 'SKIPPED_NO_TARIFF',
        invoiceId: null,
        invoiceNo: null,
        totalAmount: 0,
        projectedPaidAmount: 0,
        projectedBalanceAmount: 0,
        creditAutoApply: {
          enabled: payload.autoApplyCreditBalance,
          availableBalance: normalizeFinanceAmount(creditBalanceMap.get(student.id) || 0),
          appliedAmount: 0,
          remainingBalance: normalizeFinanceAmount(creditBalanceMap.get(student.id) || 0),
        },
        installmentPlan: {
          count: Math.max(1, payload.installmentCount),
          intervalDays: payload.installmentIntervalDays,
          installments: buildFinanceInstallmentPlan({
            totalAmount: 0,
            installmentCount: payload.installmentCount,
            firstDueDate: payload.dueDate || null,
            intervalDays: payload.installmentIntervalDays,
          }),
        },
        items: [],
      };
    }

    const items = selectedTariffs.map<FinanceInvoiceGenerationPlanItem>((tariff) => ({
      itemKey: `COMP-${tariff.componentId}`,
      componentId: tariff.componentId,
      componentCode: tariff.component.code,
      componentName: tariff.component.name,
      amount: Number(tariff.amount || 0),
      notes: tariff.notes || null,
    }));

    const matchedAdjustments = adjustmentRules
      .filter((rule) => isDateInsideRange(today, rule.effectiveStart, rule.effectiveEnd))
      .map((rule) => ({
        rule: rule as FinanceAdjustmentRuleCandidate,
        score: scoreAdjustmentRuleForStudent(rule, student, targetAcademicYearId, payload.semester),
      }))
      .filter((item) => item.score >= 0)
      .sort(compareFinanceAdjustmentRules);

    const componentRunningTotals = new Map<number, number>();
    let runningSubtotal = 0;
    for (const item of items) {
      runningSubtotal += item.amount;
      if (item.componentId != null) {
        componentRunningTotals.set(
          item.componentId,
          (componentRunningTotals.get(item.componentId) || 0) + item.amount,
        );
      }
    }

    for (const { rule } of matchedAdjustments) {
      const isReduction = rule.kind === 'DISCOUNT' || rule.kind === 'SCHOLARSHIP';
      const targetComponentTotal =
        rule.componentId != null ? Math.max(0, componentRunningTotals.get(rule.componentId) || 0) : null;
      const availableAmount = rule.componentId != null ? targetComponentTotal || 0 : Math.max(0, runningSubtotal);
      let appliedAmount = Number(rule.amount || 0);
      let capped = false;

      if (isReduction) {
        appliedAmount = Math.min(appliedAmount, availableAmount);
        capped = appliedAmount < Number(rule.amount || 0);
      }

      if (appliedAmount <= 0) {
        continue;
      }

      const signedAmount = isReduction ? -appliedAmount : appliedAmount;
      items.push({
        itemKey: `ADJ-${rule.code}-${rule.componentId || 'ALL'}-${rule.studentId || student.id}`,
        componentId: rule.componentId || null,
        componentCode: rule.code,
        componentName: getFinanceAdjustmentItemName(rule),
        amount: signedAmount,
        notes: getFinanceAdjustmentItemNotes(rule, { capped }),
      });

      runningSubtotal += signedAmount;
      if (rule.componentId != null) {
        componentRunningTotals.set(rule.componentId, (componentRunningTotals.get(rule.componentId) || 0) + signedAmount);
      }
    }

    const totalAmount = Math.max(0, items.reduce((sum, item) => sum + item.amount, 0));
    const installmentPlan = buildFinanceInstallmentPlan({
      totalAmount,
      installmentCount: payload.installmentCount,
      firstDueDate: payload.dueDate || null,
      intervalDays: payload.installmentIntervalDays,
    });
    const availableCreditBalance = normalizeFinanceAmount(creditBalanceMap.get(student.id) || 0);
    const appliedCreditAmount = payload.autoApplyCreditBalance
      ? normalizeFinanceAmount(Math.min(totalAmount, availableCreditBalance))
      : 0;
    const remainingCreditBalance = normalizeFinanceAmount(
      Math.max(availableCreditBalance - appliedCreditAmount, 0),
    );
    const projectedBalanceAmount = normalizeFinanceAmount(Math.max(totalAmount - appliedCreditAmount, 0));
    const existingInvoice = existingInvoiceMap.get(student.id);

    const existingWrittenOffAmount = existingInvoice
      ? inferFinanceWrittenOffAmount({
          totalAmount: Number(existingInvoice.totalAmount || 0),
          paidAmount: Number(existingInvoice.paidAmount || 0),
          balanceAmount: Number(existingInvoice.balanceAmount || 0),
          writtenOffAmount: existingInvoice.writtenOffAmount,
        })
      : 0;

    if (existingInvoice && (Number(existingInvoice.paidAmount || 0) > 0 || existingWrittenOffAmount > 0)) {
      return {
        student,
        status: 'SKIPPED_LOCKED_PAID',
        invoiceId: existingInvoice.id,
        invoiceNo: existingInvoice.invoiceNo,
        totalAmount,
        projectedPaidAmount: 0,
        projectedBalanceAmount: totalAmount,
        creditAutoApply: {
          enabled: payload.autoApplyCreditBalance,
          availableBalance: availableCreditBalance,
          appliedAmount: 0,
          remainingBalance: availableCreditBalance,
        },
        installmentPlan: {
          count: installmentPlan.length,
          intervalDays: payload.installmentIntervalDays,
          installments: installmentPlan,
        },
        items,
      };
    }

    if (existingInvoice && !payload.replaceExisting) {
      return {
        student,
        status: 'SKIPPED_EXISTS',
        invoiceId: existingInvoice.id,
        invoiceNo: existingInvoice.invoiceNo,
        totalAmount,
        projectedPaidAmount: 0,
        projectedBalanceAmount: totalAmount,
        creditAutoApply: {
          enabled: payload.autoApplyCreditBalance,
          availableBalance: availableCreditBalance,
          appliedAmount: 0,
          remainingBalance: availableCreditBalance,
        },
        installmentPlan: {
          count: installmentPlan.length,
          intervalDays: payload.installmentIntervalDays,
          installments: installmentPlan,
        },
        items,
      };
    }

    return {
      student,
      status: existingInvoice ? 'READY_UPDATE' : 'READY_CREATE',
      invoiceId: existingInvoice?.id || null,
      invoiceNo: existingInvoice?.invoiceNo || null,
      totalAmount,
      projectedPaidAmount: appliedCreditAmount,
      projectedBalanceAmount,
      creditAutoApply: {
        enabled: payload.autoApplyCreditBalance,
        availableBalance: availableCreditBalance,
        appliedAmount: appliedCreditAmount,
        remainingBalance: remainingCreditBalance,
      },
      installmentPlan: {
        count: installmentPlan.length,
        intervalDays: payload.installmentIntervalDays,
        installments: installmentPlan,
      },
      items,
    };
  });

  return {
    academicYearId: targetAcademicYearId,
    selectionMode: hasExplicitStudentSelection ? 'EXPLICIT_STUDENTS' : 'FILTERS',
    rows,
    summary: summarizeFinanceInvoiceGenerationRows(rows),
  };
}

async function replaceFinanceInvoiceInstallments(
  tx: Prisma.TransactionClient,
  params: {
    invoiceId: number;
    installments: Array<{
      sequence: number;
      amount: number;
      dueDate?: Date | null;
    }>;
  },
) {
  const installments = [...params.installments]
    .sort((left, right) => left.sequence - right.sequence)
    .map((installment) => ({
      sequence: installment.sequence,
      amount: normalizeFinanceAmount(installment.amount),
      dueDate: installment.dueDate ? new Date(installment.dueDate) : null,
    }));

  await tx.financeInvoiceInstallment.deleteMany({
    where: { invoiceId: params.invoiceId },
  });

  if (installments.length > 0) {
    await tx.financeInvoiceInstallment.createMany({
      data: installments.map((installment) => ({
        invoiceId: params.invoiceId,
        sequence: installment.sequence,
        amount: installment.amount,
        dueDate: installment.dueDate,
      })),
    });
  }

  return installments;
}

async function syncFinanceInvoiceInstallments(
  tx: Prisma.TransactionClient,
  params: {
    invoiceId: number;
    totalAmount: number;
    dueDate?: Date | null;
    installmentCount: number;
    installmentIntervalDays: number;
  },
) {
  const installments = buildFinanceInstallmentPlan({
    totalAmount: params.totalAmount,
    installmentCount: params.installmentCount,
    firstDueDate: params.dueDate || null,
    intervalDays: params.installmentIntervalDays,
  });

  return replaceFinanceInvoiceInstallments(tx, {
    invoiceId: params.invoiceId,
    installments,
  });
}

async function autoApplyFinanceCreditBalanceToInvoice(
  tx: Prisma.TransactionClient,
  params: {
    invoiceId: number;
    invoiceNo: string;
    studentId: number;
    actorId: number;
    enabled: boolean;
    dueDate?: Date | null;
    installments?: Array<{
      sequence: number;
      amount: number;
      dueDate?: Date | null;
    }> | null;
  },
) {
  if (!params.enabled) {
    return {
      appliedAmount: 0,
      balanceBefore: 0,
      balanceAfter: 0,
      payment: null as null | {
        id: number;
        paymentNo: string;
      },
      invoice: null as null | {
        paidAmount: number;
        balanceAmount: number;
        status: FinanceInvoiceStatus;
        dueDate: Date | null;
      },
    };
  }

  const [invoice, creditBalance] = await Promise.all([
    tx.financeInvoice.findUnique({
      where: { id: params.invoiceId },
      select: {
        id: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        status: true,
      },
    }),
    tx.financeCreditBalance.findUnique({
      where: { studentId: params.studentId },
      select: {
        id: true,
        balanceAmount: true,
      },
    }),
  ]);

  if (!invoice) {
    throw new ApiError(404, 'Invoice tidak ditemukan saat auto-apply saldo kredit');
  }

  if (!creditBalance) {
    return {
      appliedAmount: 0,
      balanceBefore: 0,
      balanceAfter: 0,
      payment: null,
      invoice: {
        paidAmount: Number(invoice.paidAmount || 0),
        balanceAmount: Number(invoice.balanceAmount || 0),
        status: invoice.status,
        dueDate: params.dueDate || null,
      },
    };
  }

  const balanceBefore = normalizeFinanceAmount(creditBalance.balanceAmount);
  const outstandingAmount = normalizeFinanceAmount(invoice.balanceAmount);
  const appliedAmount = normalizeFinanceAmount(Math.min(balanceBefore, outstandingAmount));

  if (appliedAmount <= 0 || invoice.status === 'CANCELLED') {
    return {
      appliedAmount: 0,
      balanceBefore,
      balanceAfter: balanceBefore,
      payment: null,
      invoice: {
        paidAmount: Number(invoice.paidAmount || 0),
        balanceAmount: Number(invoice.balanceAmount || 0),
        status: invoice.status,
        dueDate: params.dueDate || null,
      },
    };
  }

  const nextPaidAmount = normalizeFinanceAmount(Number(invoice.paidAmount || 0) + appliedAmount);
  const writtenOffAmount = inferFinanceWrittenOffAmount({
    totalAmount: Number(invoice.totalAmount || 0),
    paidAmount: Number(invoice.paidAmount || 0),
    balanceAmount: Number(invoice.balanceAmount || 0),
    status: invoice.status,
  });
  const nextBalanceAmount = calculateFinanceInvoiceBalanceAmount({
    totalAmount: Number(invoice.totalAmount || 0),
    paidAmount: nextPaidAmount,
    writtenOffAmount,
    status: invoice.status,
  });
  const nextStatus = calculateFinanceInvoiceStatus({
    balanceAmount: nextBalanceAmount,
    paidAmount: nextPaidAmount,
    writtenOffAmount,
    currentStatus: invoice.status,
  });
  const nextDueDate = resolveFinanceInvoiceDueDate({
    invoiceTotalAmount: Number(invoice.totalAmount || 0),
    invoicePaidAmount: nextPaidAmount,
    invoiceBalanceAmount: nextBalanceAmount,
    invoiceStatus: nextStatus,
    invoiceWrittenOffAmount: writtenOffAmount,
    invoiceDueDate: params.dueDate || null,
    installments: params.installments || [],
  });
  const balanceAfter = normalizeFinanceAmount(Math.max(balanceBefore - appliedAmount, 0));
  const paymentNo = makeFinancePaymentNo(params.studentId);

  const payment = await tx.financePayment.create({
    data: {
      paymentNo,
      studentId: params.studentId,
      invoiceId: params.invoiceId,
      amount: appliedAmount,
      allocatedAmount: appliedAmount,
      creditedAmount: 0,
      source: FinancePaymentSource.CREDIT_BALANCE,
      method: FinancePaymentMethod.OTHER,
      note: `Auto-apply saldo kredit ke invoice ${params.invoiceNo}`,
      paidAt: new Date(),
      createdById: params.actorId,
    },
    select: {
      id: true,
      paymentNo: true,
    },
  });

  await tx.financeInvoice.update({
    where: { id: params.invoiceId },
    data: {
      paidAmount: nextPaidAmount,
      balanceAmount: nextBalanceAmount,
      status: nextStatus,
      dueDate: nextDueDate,
    },
  });

  await tx.financeCreditBalance.update({
    where: { id: creditBalance.id },
    data: {
      balanceAmount: balanceAfter,
    },
  });

  await tx.financeCreditTransaction.create({
    data: {
      balanceId: creditBalance.id,
      studentId: params.studentId,
      paymentId: payment.id,
      kind: FinanceCreditTransactionKind.APPLIED_TO_INVOICE,
      amount: appliedAmount,
      balanceBefore,
      balanceAfter,
      note: `Saldo kredit dipakai otomatis untuk invoice ${params.invoiceNo}`,
      createdById: params.actorId,
    },
  });

  return {
    appliedAmount,
    balanceBefore,
    balanceAfter,
    payment,
    invoice: {
      paidAmount: nextPaidAmount,
      balanceAmount: nextBalanceAmount,
      status: nextStatus,
      dueDate: nextDueDate,
    },
  };
}

export const listFinanceComponents = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { isActive, search } = listFinanceComponentsQuerySchema.parse(req.query);
  const normalizedSearch = search?.trim();

  const components = await prisma.financeComponent.findMany({
    where: {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { name: { contains: normalizedSearch, mode: 'insensitive' } },
              { code: { contains: normalizedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: 'asc' }],
  });

  res.status(200).json(new ApiResponse(200, { components }, 'Komponen keuangan berhasil diambil'));
});

export const listFinanceClassLevels = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { academicYearId } = listFinanceClassLevelsQuerySchema.parse(req.query);

  const classes = await prisma.class.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
    },
    select: {
      level: true,
      name: true,
    },
  });

  const levels = Array.from(
    new Set(
      classes
        .map((classRow) => normalizeFinanceClassLevel(classRow.level || classRow.name))
        .filter((level) => level.length > 0),
    ),
  ).sort((a, b) => {
    const rankDiff = getFinanceClassLevelSortRank(a) - getFinanceClassLevelSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, 'id-ID', { numeric: true });
  });

  res.status(200).json(new ApiResponse(200, { levels }, 'Level kelas finance berhasil diambil'));
});

export const listFinanceBankAccounts = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, {
    allowPrincipalReadOnly: true,
    allowHeadTuReadOnly: true,
  });

  const { isActive, search } = listFinanceBankAccountsQuerySchema.parse(req.query);
  const normalizedSearch = search?.trim();

  const rows = await prisma.financeBankAccount.findMany({
    where: {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { code: { contains: normalizedSearch, mode: 'insensitive' } },
              { bankName: { contains: normalizedSearch, mode: 'insensitive' } },
              { accountName: { contains: normalizedSearch, mode: 'insensitive' } },
              { accountNumber: { contains: normalizedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: 'desc' }, { bankName: 'asc' }, { accountNumber: 'asc' }],
  });

  const accounts = rows.map((row: any) => serializeFinanceBankAccount(row));

  res.status(200).json(new ApiResponse(200, { accounts }, 'Rekening bank finance berhasil diambil'));
});

export const createFinanceBankAccount = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = createFinanceBankAccountSchema.parse(req.body || {});
  const code = normalizeFinanceCode(payload.code);

  const existing = await prisma.financeBankAccount.findFirst({
    where: {
      OR: [{ code }, { bankName: payload.bankName, accountNumber: payload.accountNumber }],
    },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(400, 'Rekening bank dengan kode atau nomor akun tersebut sudah ada');
  }

  const bankAccount = await prisma.financeBankAccount.create({
    data: {
      code,
      bankName: payload.bankName.trim(),
      accountName: payload.accountName.trim(),
      accountNumber: payload.accountNumber.trim(),
      branch: payload.branch?.trim() || null,
      notes: payload.notes?.trim() || null,
      isActive: payload.isActive ?? true,
      createdById: actor.id,
    },
  });

  const serialized = serializeFinanceBankAccount(bankAccount);

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'CREATE',
      'FINANCE_BANK_ACCOUNT',
      serialized.id,
      null,
      serialized,
      'Pembuatan rekening bank finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat rekening bank finance', auditError);
  }

  res.status(201).json(new ApiResponse(201, { account: serialized }, 'Rekening bank berhasil ditambahkan'));
});

export const updateFinanceBankAccount = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new ApiError(400, 'ID rekening bank tidak valid');
  }

  const payload = updateFinanceBankAccountSchema.parse(req.body || {});
  const before = await prisma.financeBankAccount.findUnique({
    where: { id: accountId },
  });

  if (!before) {
    throw new ApiError(404, 'Rekening bank tidak ditemukan');
  }

  const code = payload.code ? normalizeFinanceCode(payload.code) : undefined;
  if (code && code !== before.code) {
    const duplicate = await prisma.financeBankAccount.findFirst({
      where: {
        code,
        NOT: { id: accountId },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ApiError(400, 'Kode rekening bank sudah digunakan');
    }
  }

  const updated = await prisma.financeBankAccount.update({
    where: { id: accountId },
    data: {
      ...(code ? { code } : {}),
      ...(payload.bankName !== undefined ? { bankName: payload.bankName.trim() } : {}),
      ...(payload.accountName !== undefined ? { accountName: payload.accountName.trim() } : {}),
      ...(payload.accountNumber !== undefined ? { accountNumber: payload.accountNumber.trim() } : {}),
      ...(payload.branch !== undefined ? { branch: payload.branch?.trim() || null } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    },
  });

  const serialized = serializeFinanceBankAccount(updated);

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_BANK_ACCOUNT',
      serialized.id,
      before,
      serialized,
      'Perubahan rekening bank finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat perubahan rekening bank finance', auditError);
  }

  res.status(200).json(new ApiResponse(200, { account: serialized }, 'Rekening bank berhasil diperbarui'));
});

export const getFinanceReminderPolicy = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const policy = await ensureFinanceReminderPolicy();

  res
    .status(200)
    .json(new ApiResponse(200, { policy }, 'Policy reminder finance berhasil diambil'));
});

export const updateFinanceReminderPolicy = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = updateFinanceReminderPolicySchema.parse(req.body || {});

  if (Object.keys(payload).length === 0) {
    throw new ApiError(400, 'Tidak ada perubahan policy reminder yang dikirim');
  }

  const policy = serializeFinanceReminderPolicy(
    await prisma.financeReminderPolicy.upsert({
      where: { id: 1 },
      update: {
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        ...(payload.dueSoonDays !== undefined ? { dueSoonDays: payload.dueSoonDays } : {}),
        ...(payload.dueSoonRepeatIntervalDays !== undefined
          ? { dueSoonRepeatIntervalDays: payload.dueSoonRepeatIntervalDays }
          : {}),
        ...(payload.overdueRepeatIntervalDays !== undefined
          ? { overdueRepeatIntervalDays: payload.overdueRepeatIntervalDays }
          : {}),
        ...(payload.lateFeeWarningEnabled !== undefined
          ? { lateFeeWarningEnabled: payload.lateFeeWarningEnabled }
          : {}),
        ...(payload.lateFeeWarningRepeatIntervalDays !== undefined
          ? { lateFeeWarningRepeatIntervalDays: payload.lateFeeWarningRepeatIntervalDays }
          : {}),
        ...(payload.escalationEnabled !== undefined ? { escalationEnabled: payload.escalationEnabled } : {}),
        ...(payload.escalationStartDays !== undefined
          ? { escalationStartDays: payload.escalationStartDays }
          : {}),
        ...(payload.escalationRepeatIntervalDays !== undefined
          ? { escalationRepeatIntervalDays: payload.escalationRepeatIntervalDays }
          : {}),
        ...(payload.escalationMinOutstandingAmount !== undefined
          ? { escalationMinOutstandingAmount: normalizeFinanceAmount(payload.escalationMinOutstandingAmount) }
          : {}),
        ...(payload.sendStudentReminder !== undefined
          ? { sendStudentReminder: payload.sendStudentReminder }
          : {}),
        ...(payload.sendParentReminder !== undefined ? { sendParentReminder: payload.sendParentReminder } : {}),
        ...(payload.escalateToFinanceStaff !== undefined
          ? { escalateToFinanceStaff: payload.escalateToFinanceStaff }
          : {}),
        ...(payload.escalateToHeadTu !== undefined ? { escalateToHeadTu: payload.escalateToHeadTu } : {}),
        ...(payload.escalateToPrincipal !== undefined
          ? { escalateToPrincipal: payload.escalateToPrincipal }
          : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
      },
      create: {
        id: 1,
        ...DEFAULT_FINANCE_REMINDER_POLICY,
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        ...(payload.dueSoonDays !== undefined ? { dueSoonDays: payload.dueSoonDays } : {}),
        ...(payload.dueSoonRepeatIntervalDays !== undefined
          ? { dueSoonRepeatIntervalDays: payload.dueSoonRepeatIntervalDays }
          : {}),
        ...(payload.overdueRepeatIntervalDays !== undefined
          ? { overdueRepeatIntervalDays: payload.overdueRepeatIntervalDays }
          : {}),
        ...(payload.lateFeeWarningEnabled !== undefined
          ? { lateFeeWarningEnabled: payload.lateFeeWarningEnabled }
          : {}),
        ...(payload.lateFeeWarningRepeatIntervalDays !== undefined
          ? { lateFeeWarningRepeatIntervalDays: payload.lateFeeWarningRepeatIntervalDays }
          : {}),
        ...(payload.escalationEnabled !== undefined ? { escalationEnabled: payload.escalationEnabled } : {}),
        ...(payload.escalationStartDays !== undefined
          ? { escalationStartDays: payload.escalationStartDays }
          : {}),
        ...(payload.escalationRepeatIntervalDays !== undefined
          ? { escalationRepeatIntervalDays: payload.escalationRepeatIntervalDays }
          : {}),
        ...(payload.escalationMinOutstandingAmount !== undefined
          ? { escalationMinOutstandingAmount: normalizeFinanceAmount(payload.escalationMinOutstandingAmount) }
          : {}),
        ...(payload.sendStudentReminder !== undefined
          ? { sendStudentReminder: payload.sendStudentReminder }
          : {}),
        ...(payload.sendParentReminder !== undefined ? { sendParentReminder: payload.sendParentReminder } : {}),
        ...(payload.escalateToFinanceStaff !== undefined
          ? { escalateToFinanceStaff: payload.escalateToFinanceStaff }
          : {}),
        ...(payload.escalateToHeadTu !== undefined ? { escalateToHeadTu: payload.escalateToHeadTu } : {}),
        ...(payload.escalateToPrincipal !== undefined
          ? { escalateToPrincipal: payload.escalateToPrincipal }
          : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
      },
    }),
  );

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'UPDATE',
      'FINANCE_REMINDER_POLICY',
      1,
      null,
      policy,
      'Memperbarui policy reminder dan escalation finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat perubahan finance reminder policy', auditError);
  }

  res
    .status(200)
    .json(new ApiResponse(200, { policy }, 'Policy reminder finance berhasil diperbarui'));
});

export const getFinanceCashSessionApprovalPolicy = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, {
    allowPrincipalReadOnly: true,
    allowHeadTuReadOnly: true,
  });

  const policy = await ensureFinanceCashSessionApprovalPolicy();

  res.status(200).json(
    new ApiResponse(200, { policy }, 'Policy approval settlement kas berhasil diambil'),
  );
});

export const updateFinanceCashSessionApprovalPolicy = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = updateFinanceCashSessionApprovalPolicySchema.parse(req.body || {});

  if (Object.keys(payload).length === 0) {
    throw new ApiError(400, 'Tidak ada perubahan policy approval settlement yang dikirim');
  }

  const policy = serializeFinanceCashSessionApprovalPolicy(
    await prisma.financeCashSessionApprovalPolicy.upsert({
      where: { id: 1 },
      update: {
        ...(payload.zeroVarianceAutoApproved !== undefined
          ? { zeroVarianceAutoApproved: payload.zeroVarianceAutoApproved }
          : {}),
        ...(payload.requireVarianceNote !== undefined
          ? { requireVarianceNote: payload.requireVarianceNote }
          : {}),
        ...(payload.principalApprovalThresholdAmount !== undefined
          ? {
              principalApprovalThresholdAmount: normalizeFinanceAmount(
                payload.principalApprovalThresholdAmount,
              ),
            }
          : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
      },
      create: {
        id: 1,
        ...DEFAULT_FINANCE_CASH_SESSION_APPROVAL_POLICY,
        ...(payload.zeroVarianceAutoApproved !== undefined
          ? { zeroVarianceAutoApproved: payload.zeroVarianceAutoApproved }
          : {}),
        ...(payload.requireVarianceNote !== undefined
          ? { requireVarianceNote: payload.requireVarianceNote }
          : {}),
        ...(payload.principalApprovalThresholdAmount !== undefined
          ? {
              principalApprovalThresholdAmount: normalizeFinanceAmount(
                payload.principalApprovalThresholdAmount,
              ),
            }
          : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
      },
    }),
  );

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'UPDATE',
      'FINANCE_CASH_SESSION_APPROVAL_POLICY',
      1,
      null,
      policy,
      'Memperbarui policy approval settlement kas harian',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat perubahan policy approval settlement kas', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, { policy }, 'Policy approval settlement kas berhasil diperbarui'),
  );
});

export const createFinanceComponent = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = createFinanceComponentSchema.parse(req.body);

  const code = normalizeFinanceCode(payload.code);
  if (!code) {
    throw new ApiError(400, 'Kode komponen tidak valid');
  }

  const component = await prisma.financeComponent.create({
    data: {
      code,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      periodicity: payload.periodicity,
      lateFeeEnabled: payload.lateFeeEnabled,
      lateFeeMode: payload.lateFeeMode,
      lateFeeAmount: normalizeFinanceAmount(payload.lateFeeAmount),
      lateFeeGraceDays: payload.lateFeeGraceDays,
      lateFeeCapAmount:
        payload.lateFeeCapAmount == null ? null : normalizeFinanceAmount(payload.lateFeeCapAmount),
      isActive: payload.isActive,
      createdById: actor.id,
    },
  });

  res.status(201).json(new ApiResponse(201, { component }, 'Komponen keuangan berhasil dibuat'));
});

export const updateFinanceComponent = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {});

  const componentId = Number(req.params.id);
  if (!Number.isInteger(componentId) || componentId <= 0) {
    throw new ApiError(400, 'ID komponen tidak valid');
  }

  const payload = updateFinanceComponentSchema.parse(req.body);

  const data: Record<string, unknown> = {};
  if (payload.code !== undefined) {
    const normalizedCode = normalizeFinanceCode(payload.code);
    if (!normalizedCode) {
      throw new ApiError(400, 'Kode komponen tidak valid');
    }
    data.code = normalizedCode;
  }
  if (payload.name !== undefined) data.name = payload.name.trim();
  if (payload.description !== undefined) data.description = payload.description?.trim() || null;
  if (payload.periodicity !== undefined) data.periodicity = payload.periodicity;
  if (payload.lateFeeEnabled !== undefined) data.lateFeeEnabled = payload.lateFeeEnabled;
  if (payload.lateFeeMode !== undefined) data.lateFeeMode = payload.lateFeeMode;
  if (payload.lateFeeAmount !== undefined) data.lateFeeAmount = normalizeFinanceAmount(payload.lateFeeAmount);
  if (payload.lateFeeGraceDays !== undefined) data.lateFeeGraceDays = payload.lateFeeGraceDays;
  if (payload.lateFeeCapAmount !== undefined) {
    data.lateFeeCapAmount =
      payload.lateFeeCapAmount == null ? null : normalizeFinanceAmount(payload.lateFeeCapAmount);
  }
  if (payload.isActive !== undefined) data.isActive = payload.isActive;

  const component = await prisma.financeComponent.update({
    where: { id: componentId },
    data,
  });

  res.status(200).json(new ApiResponse(200, { component }, 'Komponen keuangan berhasil diperbarui'));
});

export const listFinanceTariffRules = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { componentId, academicYearId, classId, majorId, semester, isActive } =
    listFinanceTariffsQuerySchema.parse(req.query);

  const tariffs = await prisma.financeTariffRule.findMany({
    where: {
      ...(componentId ? { componentId } : {}),
      ...(academicYearId ? { academicYearId } : {}),
      ...(classId ? { classId } : {}),
      ...(majorId ? { majorId } : {}),
      ...(semester ? { semester } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: {
      component: {
        select: {
          id: true,
          code: true,
          name: true,
          periodicity: true,
        },
      },
      academicYear: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
      major: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: [{ component: { name: 'asc' } }, { amount: 'desc' }],
  });

  res.status(200).json(new ApiResponse(200, { tariffs }, 'Tarif keuangan berhasil diambil'));
});

export const createFinanceTariffRule = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = createFinanceTariffSchema.parse(req.body);

  if (payload.effectiveStart && payload.effectiveEnd && payload.effectiveEnd < payload.effectiveStart) {
    throw new ApiError(400, 'Periode efektif tarif tidak valid');
  }

  const tariff = await prisma.financeTariffRule.create({
    data: {
      componentId: payload.componentId,
      academicYearId: payload.academicYearId || null,
      majorId: payload.majorId || null,
      classId: payload.classId || null,
      semester: payload.semester || null,
      gradeLevel: payload.gradeLevel?.trim() || null,
      amount: payload.amount,
      isActive: payload.isActive,
      effectiveStart: payload.effectiveStart || null,
      effectiveEnd: payload.effectiveEnd || null,
      notes: payload.notes?.trim() || null,
      createdById: actor.id,
    },
    include: {
      component: true,
    },
  });

  res.status(201).json(new ApiResponse(201, { tariff }, 'Tarif keuangan berhasil dibuat'));
});

export const updateFinanceTariffRule = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {});

  const tariffId = Number(req.params.id);
  if (!Number.isInteger(tariffId) || tariffId <= 0) {
    throw new ApiError(400, 'ID tarif tidak valid');
  }

  const payload = updateFinanceTariffSchema.parse(req.body);

  const data: Record<string, unknown> = {};
  if (payload.componentId !== undefined) data.componentId = payload.componentId;
  if (payload.academicYearId !== undefined) data.academicYearId = payload.academicYearId || null;
  if (payload.majorId !== undefined) data.majorId = payload.majorId || null;
  if (payload.classId !== undefined) data.classId = payload.classId || null;
  if (payload.semester !== undefined) data.semester = payload.semester || null;
  if (payload.gradeLevel !== undefined) data.gradeLevel = payload.gradeLevel?.trim() || null;
  if (payload.amount !== undefined) data.amount = payload.amount;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  if (payload.effectiveStart !== undefined) data.effectiveStart = payload.effectiveStart || null;
  if (payload.effectiveEnd !== undefined) data.effectiveEnd = payload.effectiveEnd || null;
  if (payload.notes !== undefined) data.notes = payload.notes?.trim() || null;

  if (
    (data.effectiveStart instanceof Date || data.effectiveEnd instanceof Date) &&
    data.effectiveStart instanceof Date &&
    data.effectiveEnd instanceof Date &&
    data.effectiveEnd < data.effectiveStart
  ) {
    throw new ApiError(400, 'Periode efektif tarif tidak valid');
  }

  const tariff = await prisma.financeTariffRule.update({
    where: { id: tariffId },
    data,
    include: {
      component: true,
    },
  });

  res.status(200).json(new ApiResponse(200, { tariff }, 'Tarif keuangan berhasil diperbarui'));
});

export const listFinanceAdjustmentRules = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { componentId, academicYearId, classId, majorId, studentId, semester, kind, isActive } =
    listFinanceAdjustmentsQuerySchema.parse(req.query);

  const adjustments = await prisma.financeAdjustmentRule.findMany({
    where: {
      ...(componentId ? { componentId } : {}),
      ...(academicYearId ? { academicYearId } : {}),
      ...(classId ? { classId } : {}),
      ...(majorId ? { majorId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(semester ? { semester } : {}),
      ...(kind ? { kind } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: {
      component: {
        select: {
          id: true,
          code: true,
          name: true,
          periodicity: true,
        },
      },
      academicYear: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
      major: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      },
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });

  res.status(200).json(new ApiResponse(200, { adjustments }, 'Rule penyesuaian keuangan berhasil diambil'));
});

export const createFinanceAdjustmentRule = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = createFinanceAdjustmentSchema.parse(req.body);

  if (payload.effectiveStart && payload.effectiveEnd && payload.effectiveEnd < payload.effectiveStart) {
    throw new ApiError(400, 'Periode efektif penyesuaian tidak valid');
  }

  const code = normalizeFinanceCode(payload.code);
  if (!code) {
    throw new ApiError(400, 'Kode penyesuaian tidak valid');
  }

  const adjustment = await prisma.financeAdjustmentRule.create({
    data: {
      code,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      kind: payload.kind,
      amount: payload.amount,
      componentId: payload.componentId || null,
      academicYearId: payload.academicYearId || null,
      majorId: payload.majorId || null,
      classId: payload.classId || null,
      studentId: payload.studentId || null,
      semester: payload.semester || null,
      gradeLevel: payload.gradeLevel?.trim() || null,
      isActive: payload.isActive,
      effectiveStart: payload.effectiveStart || null,
      effectiveEnd: payload.effectiveEnd || null,
      notes: payload.notes?.trim() || null,
      createdById: actor.id,
    },
    include: {
      component: true,
      academicYear: true,
      class: true,
      major: true,
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
        },
      },
    },
  });

  res.status(201).json(new ApiResponse(201, { adjustment }, 'Rule penyesuaian keuangan berhasil dibuat'));
});

export const updateFinanceAdjustmentRule = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {});

  const adjustmentId = Number(req.params.id);
  if (!Number.isInteger(adjustmentId) || adjustmentId <= 0) {
    throw new ApiError(400, 'ID penyesuaian tidak valid');
  }

  const payload = updateFinanceAdjustmentSchema.parse(req.body);
  const data: Record<string, unknown> = {};

  if (payload.code !== undefined) {
    const normalizedCode = normalizeFinanceCode(payload.code);
    if (!normalizedCode) {
      throw new ApiError(400, 'Kode penyesuaian tidak valid');
    }
    data.code = normalizedCode;
  }
  if (payload.name !== undefined) data.name = payload.name.trim();
  if (payload.description !== undefined) data.description = payload.description?.trim() || null;
  if (payload.kind !== undefined) data.kind = payload.kind;
  if (payload.amount !== undefined) data.amount = payload.amount;
  if (payload.componentId !== undefined) data.componentId = payload.componentId || null;
  if (payload.academicYearId !== undefined) data.academicYearId = payload.academicYearId || null;
  if (payload.majorId !== undefined) data.majorId = payload.majorId || null;
  if (payload.classId !== undefined) data.classId = payload.classId || null;
  if (payload.studentId !== undefined) data.studentId = payload.studentId || null;
  if (payload.semester !== undefined) data.semester = payload.semester || null;
  if (payload.gradeLevel !== undefined) data.gradeLevel = payload.gradeLevel?.trim() || null;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  if (payload.effectiveStart !== undefined) data.effectiveStart = payload.effectiveStart || null;
  if (payload.effectiveEnd !== undefined) data.effectiveEnd = payload.effectiveEnd || null;
  if (payload.notes !== undefined) data.notes = payload.notes?.trim() || null;

  if (
    (data.effectiveStart instanceof Date || data.effectiveEnd instanceof Date) &&
    data.effectiveStart instanceof Date &&
    data.effectiveEnd instanceof Date &&
    data.effectiveEnd < data.effectiveStart
  ) {
    throw new ApiError(400, 'Periode efektif penyesuaian tidak valid');
  }

  const adjustment = await prisma.financeAdjustmentRule.update({
    where: { id: adjustmentId },
    data,
    include: {
      component: true,
      academicYear: true,
      class: true,
      major: true,
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
        },
      },
    },
  });

  res.status(200).json(new ApiResponse(200, { adjustment }, 'Rule penyesuaian keuangan berhasil diperbarui'));
});

export const generateFinanceInvoices = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = generateInvoicesSchema.parse(req.body);
  const plan = await buildFinanceInvoiceGenerationPlan(payload);
  const queuedNotifications: Array<{
    userId: number;
    title: string;
    message: string;
    type: string;
    data: Prisma.InputJsonValue;
  }> = [];

  const details = [] as Array<
    Omit<ReturnType<typeof mapFinanceInvoiceGenerationRowDetail>, 'status'> & {
      status: 'CREATED' | 'UPDATED' | 'SKIPPED_NO_TARIFF' | 'SKIPPED_EXISTS' | 'SKIPPED_LOCKED_PAID';
    }
  >;

  for (const row of plan.rows) {
    const nextStatus: FinanceInvoiceStatus = row.totalAmount <= 0 ? 'PAID' : 'UNPAID';
    if (row.status === 'SKIPPED_NO_TARIFF') {
      details.push({ ...mapFinanceInvoiceGenerationRowDetail(row), status: 'SKIPPED_NO_TARIFF' });
      continue;
    }
    if (row.status === 'SKIPPED_EXISTS') {
      details.push({ ...mapFinanceInvoiceGenerationRowDetail(row), status: 'SKIPPED_EXISTS' });
      continue;
    }
    if (row.status === 'SKIPPED_LOCKED_PAID') {
      details.push({ ...mapFinanceInvoiceGenerationRowDetail(row), status: 'SKIPPED_LOCKED_PAID' });
      continue;
    }
    if (row.status === 'READY_UPDATE' && (!row.invoiceId || !row.invoiceNo)) {
      throw new ApiError(500, `Data invoice existing tidak lengkap untuk siswa ${row.student.name}`);
    }
    if (row.status === 'READY_UPDATE' && row.invoiceId && row.invoiceNo) {
      const updateResult = await prisma.$transaction(async (tx) => {
        await tx.financeInvoiceItem.deleteMany({ where: { invoiceId: row.invoiceId! } });
        await tx.financeInvoice.update({
          where: { id: row.invoiceId! },
          data: {
            title: payload.title || null,
            dueDate: payload.dueDate || null,
            totalAmount: row.totalAmount,
            paidAmount: 0,
            balanceAmount: row.totalAmount,
            status: nextStatus,
            createdById: actor.id,
          },
        });
        await tx.financeInvoiceItem.createMany({
          data: row.items.map((item) => ({
            invoiceId: row.invoiceId!,
            componentId: item.componentId,
            componentCode: item.componentCode,
            componentName: item.componentName,
            amount: item.amount,
            notes: item.notes,
          })),
        });
        const syncedInstallments = await syncFinanceInvoiceInstallments(tx, {
          invoiceId: row.invoiceId!,
          totalAmount: row.totalAmount,
          dueDate: payload.dueDate || null,
          installmentCount: payload.installmentCount,
          installmentIntervalDays: payload.installmentIntervalDays,
        });

        const creditApplication = await autoApplyFinanceCreditBalanceToInvoice(tx, {
          invoiceId: row.invoiceId!,
          invoiceNo: row.invoiceNo!,
          studentId: row.student.id,
          actorId: actor.id,
          enabled: payload.autoApplyCreditBalance,
          dueDate: payload.dueDate || null,
          installments: syncedInstallments,
        });

        return {
          creditApplication,
        };
      });

      const recipients = [
        { userId: row.student.id, role: row.student.role },
        ...row.student.parents.map((parent) => ({ userId: parent.id, role: parent.role })),
      ];
      const updatedBalanceAmount = Number(
        updateResult.creditApplication.invoice?.balanceAmount ?? row.totalAmount,
      );
      const autoAppliedCreditAmount = Number(updateResult.creditApplication.appliedAmount || 0);
      const updateMessageSuffix =
        autoAppliedCreditAmount > 0
          ? updatedBalanceAmount > 0
            ? ` Saldo kredit Rp${Math.round(autoAppliedCreditAmount).toLocaleString('id-ID')} langsung dipakai sehingga sisa tagihan menjadi Rp${Math.round(updatedBalanceAmount).toLocaleString('id-ID')}.`
            : ` Saldo kredit Rp${Math.round(autoAppliedCreditAmount).toLocaleString('id-ID')} langsung melunasi tagihan ini.`
          : '';
      for (const recipient of recipients) {
        queuedNotifications.push({
          userId: recipient.userId,
          title: 'Tagihan Diperbarui',
          message: `Tagihan ${row.invoiceNo} periode ${payload.periodKey} telah diperbarui. Total tagihan saat ini Rp${Math.round(row.totalAmount).toLocaleString('id-ID')}.${updateMessageSuffix}`,
          type: 'FINANCE_INVOICE_UPDATED',
          data: {
            module: 'FINANCE',
            invoiceNo: row.invoiceNo,
            invoiceId: row.invoiceId,
            periodKey: payload.periodKey,
            semester: payload.semester,
            route: resolveFinanceRouteByRole(recipient.role, row.student.id),
            studentId: row.student.id,
          },
        });
      }
      details.push({
        ...mapFinanceInvoiceGenerationRowDetail(row),
        status: 'UPDATED',
        projectedPaidAmount: Number(updateResult.creditApplication.invoice?.paidAmount ?? row.projectedPaidAmount),
        projectedBalanceAmount: updatedBalanceAmount,
        creditAutoApply: {
          ...row.creditAutoApply,
          appliedAmount: autoAppliedCreditAmount,
          remainingBalance: Number(updateResult.creditApplication.balanceAfter ?? row.creditAutoApply.remainingBalance),
        },
      });
      continue;
    }

    const invoiceNo = makeFinanceInvoiceNo(payload.periodKey, row.student.id);
    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.financeInvoice.create({
        data: {
          invoiceNo,
          studentId: row.student.id,
          academicYearId: plan.academicYearId,
          semester: payload.semester,
          periodKey: payload.periodKey,
          title: payload.title || null,
          dueDate: payload.dueDate || null,
          totalAmount: row.totalAmount,
          paidAmount: 0,
          balanceAmount: row.totalAmount,
          status: nextStatus,
          createdById: actor.id,
          items: {
            create: row.items.map((item) => ({
              componentId: item.componentId,
              componentCode: item.componentCode,
              componentName: item.componentName,
              amount: item.amount,
              notes: item.notes,
            })),
          },
        },
        select: {
          id: true,
          invoiceNo: true,
        },
      });

      const syncedInstallments = await syncFinanceInvoiceInstallments(tx, {
        invoiceId: createdInvoice.id,
        totalAmount: row.totalAmount,
        dueDate: payload.dueDate || null,
        installmentCount: payload.installmentCount,
        installmentIntervalDays: payload.installmentIntervalDays,
      });

      const creditApplication = await autoApplyFinanceCreditBalanceToInvoice(tx, {
        invoiceId: createdInvoice.id,
        invoiceNo: createdInvoice.invoiceNo,
        studentId: row.student.id,
        actorId: actor.id,
        enabled: payload.autoApplyCreditBalance,
        dueDate: payload.dueDate || null,
        installments: syncedInstallments,
      });

      return {
        ...createdInvoice,
        creditApplication,
      };
    });

    const recipients = [
      { userId: row.student.id, role: row.student.role },
      ...row.student.parents.map((parent) => ({ userId: parent.id, role: parent.role })),
    ];
    const createdBalanceAmount = Number(invoice.creditApplication.invoice?.balanceAmount ?? row.totalAmount);
    const createdAutoAppliedCreditAmount = Number(invoice.creditApplication.appliedAmount || 0);
    const createMessageSuffix =
      createdAutoAppliedCreditAmount > 0
        ? createdBalanceAmount > 0
          ? ` Saldo kredit Rp${Math.round(createdAutoAppliedCreditAmount).toLocaleString('id-ID')} langsung dipakai sehingga sisa tagihan menjadi Rp${Math.round(createdBalanceAmount).toLocaleString('id-ID')}.`
          : ` Saldo kredit Rp${Math.round(createdAutoAppliedCreditAmount).toLocaleString('id-ID')} langsung melunasi tagihan ini.`
        : '';
    for (const recipient of recipients) {
      queuedNotifications.push({
        userId: recipient.userId,
        title: 'Tagihan Baru',
        message: `Tagihan ${invoice.invoiceNo} periode ${payload.periodKey} telah diterbitkan dengan total Rp${Math.round(row.totalAmount).toLocaleString('id-ID')}.${createMessageSuffix}`,
        type: 'FINANCE_INVOICE_CREATED',
        data: {
          module: 'FINANCE',
          invoiceNo: invoice.invoiceNo,
          invoiceId: invoice.id,
          periodKey: payload.periodKey,
          semester: payload.semester,
          route: resolveFinanceRouteByRole(recipient.role, row.student.id),
          studentId: row.student.id,
        },
      });
    }
    details.push({
      ...mapFinanceInvoiceGenerationRowDetail({
        ...row,
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
      }),
      status: 'CREATED',
      projectedPaidAmount: Number(invoice.creditApplication.invoice?.paidAmount ?? row.projectedPaidAmount),
      projectedBalanceAmount: createdBalanceAmount,
      creditAutoApply: {
        ...row.creditAutoApply,
        appliedAmount: createdAutoAppliedCreditAmount,
        remainingBalance: Number(invoice.creditApplication.balanceAfter ?? row.creditAutoApply.remainingBalance),
      },
    });
  }

  if (queuedNotifications.length > 0) {
    await prisma.notification.createMany({ data: queuedNotifications });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId: plan.academicYearId,
        semester: payload.semester,
        periodKey: payload.periodKey,
        filters: {
          classId: payload.classId || null,
          majorId: payload.majorId || null,
          gradeLevel: payload.gradeLevel?.trim() || null,
          installmentCount: payload.installmentCount,
          installmentIntervalDays: payload.installmentIntervalDays,
          autoApplyCreditBalance: payload.autoApplyCreditBalance,
          replaceExisting: payload.replaceExisting,
          selectedStudentCount: payload.studentIds.length,
          selectionMode: plan.selectionMode,
        },
        summary: plan.summary,
        details,
      },
      'Generate tagihan siswa selesai',
    ),
  );
});

export const previewFinanceInvoices = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {});
  const payload = generateInvoicesSchema.parse(req.body);
  const plan = await buildFinanceInvoiceGenerationPlan(payload);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId: plan.academicYearId,
        semester: payload.semester,
        periodKey: payload.periodKey,
        filters: {
          classId: payload.classId || null,
          majorId: payload.majorId || null,
          gradeLevel: payload.gradeLevel?.trim() || null,
          installmentCount: payload.installmentCount,
          installmentIntervalDays: payload.installmentIntervalDays,
          autoApplyCreditBalance: payload.autoApplyCreditBalance,
          replaceExisting: payload.replaceExisting,
          selectedStudentCount: payload.studentIds.length,
          selectionMode: plan.selectionMode,
        },
        summary: plan.summary,
        details: plan.rows.map((row) => mapFinanceInvoiceGenerationRowDetail(row)),
      },
      'Pratinjau generate tagihan siswa berhasil dibuat',
    ),
  );
});

export const listFinanceInvoices = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { academicYearId, semester, classId, gradeLevel, studentId, status, search, limit } =
    listFinanceInvoicesQuerySchema.parse(req.query);

  const normalizedSearch = search?.trim();

  const invoices = await prisma.financeInvoice.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      ...(semester ? { semester } : {}),
      ...(status ? { status } : {}),
      ...(studentId ? { studentId } : {}),
      ...((classId || gradeLevel)
        ? {
            student: {
              ...(classId ? { classId } : {}),
              ...(gradeLevel
                ? {
                    studentClass: {
                      level: {
                        equals: gradeLevel.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { invoiceNo: { contains: normalizedSearch, mode: 'insensitive' } },
              { title: { contains: normalizedSearch, mode: 'insensitive' } },
              { student: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
              { student: { nis: { contains: normalizedSearch, mode: 'insensitive' } } },
              { student: { nisn: { contains: normalizedSearch, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          componentId: true,
          componentCode: true,
          componentName: true,
          amount: true,
          notes: true,
          component: {
            select: {
              id: true,
              code: true,
              name: true,
              lateFeeEnabled: true,
              lateFeeMode: true,
              lateFeeAmount: true,
              lateFeeGraceDays: true,
              lateFeeCapAmount: true,
            },
          },
        },
      },
      payments: {
        select: {
          id: true,
          paymentNo: true,
          amount: true,
          allocatedAmount: true,
          creditedAmount: true,
          reversedAmount: true,
          reversedAllocatedAmount: true,
          reversedCreditedAmount: true,
          source: true,
          method: true,
          verificationStatus: true,
          verificationNote: true,
          verifiedAt: true,
          referenceNo: true,
          note: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          bankAccount: {
            select: {
              id: true,
              code: true,
              bankName: true,
              accountName: true,
              accountNumber: true,
            },
          },
          verifiedBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: [{ paidAt: 'desc' }],
      },
      installments: {
        select: {
          id: true,
          sequence: true,
          amount: true,
          dueDate: true,
        },
        orderBy: [{ sequence: 'asc' }],
      },
      writeOffRequests: {
        include: financeWriteOffRecordInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const serializedInvoices = invoices.map((invoice) => serializeFinanceInvoiceRecord(invoice));

  const summary = serializedInvoices.reduce(
    (acc, invoice) => {
      acc.totalInvoices += 1;
      acc.totalAmount += Number(invoice.totalAmount || 0);
      acc.totalPaid += Number(invoice.paidAmount || 0);
      acc.totalOutstanding += Number(invoice.balanceAmount || 0);
      if (invoice.status === 'UNPAID') acc.unpaid += 1;
      if (invoice.status === 'PARTIAL') acc.partial += 1;
      if (invoice.status === 'PAID') acc.paid += 1;
      if (invoice.status === 'CANCELLED') acc.cancelled += 1;
      return acc;
    },
    {
      totalInvoices: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      unpaid: 0,
      partial: 0,
      paid: 0,
      cancelled: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(200, { invoices: serializedInvoices, summary }, 'Tagihan siswa berhasil diambil'),
  );
});

export const listFinanceReports = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const filters = listFinanceReportQuerySchema.parse(req.query);
  if (filters.periodFrom && filters.periodTo && filters.periodFrom > filters.periodTo) {
    throw new ApiError(400, 'periodFrom tidak boleh lebih besar dari periodTo');
  }

  const snapshot = await buildFinanceReportSnapshot(filters);
  res.status(200).json(new ApiResponse(200, snapshot, 'Laporan keuangan berhasil diambil'));
});

export const exportFinanceReports = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { format, reportType, ...filters } = exportFinanceReportQuerySchema.parse(req.query);
  if (filters.periodFrom && filters.periodTo && filters.periodFrom > filters.periodTo) {
    throw new ApiError(400, 'periodFrom tidak boleh lebih besar dari periodTo');
  }

  const snapshot = await buildFinanceReportSnapshot(filters);

  const summaryHeaders = [
    'Total Invoice',
    'Total Siswa',
    'Total Nominal',
    'Total Terbayar',
    'Total Outstanding',
    'Invoice Overdue',
    'Outstanding Overdue',
    'Collection Rate (%)',
    'DSO (hari)',
    'Overdue Rate (%)',
    'Periode DSO (hari)',
  ];
  const summaryRows: Array<Record<string, unknown>> = [
    {
      'Total Invoice': snapshot.summary.totalInvoices,
      'Total Siswa': snapshot.summary.totalStudents,
      'Total Nominal': snapshot.summary.totalAmount,
      'Total Terbayar': snapshot.summary.totalPaid,
      'Total Outstanding': snapshot.summary.totalOutstanding,
      'Invoice Overdue': snapshot.summary.overdueInvoices,
      'Outstanding Overdue': snapshot.summary.overdueOutstanding,
      'Collection Rate (%)': snapshot.kpi.collectionRate.toFixed(2),
      'DSO (hari)': snapshot.kpi.dsoDays.toFixed(1),
      'Overdue Rate (%)': snapshot.kpi.overdueRate.toFixed(2),
      'Periode DSO (hari)': snapshot.kpi.windowDays,
    },
  ];

  const monthlyHeaders = [
    'Periode',
    'Jumlah Invoice',
    'Jumlah Siswa',
    'Total Nominal',
    'Total Terbayar',
    'Total Outstanding',
    'Invoice Overdue',
    'Outstanding Overdue',
    'UNPAID',
    'PARTIAL',
    'PAID',
    'CANCELLED',
  ];
  const monthlyRows: Array<Record<string, unknown>> = snapshot.monthlyRecap.map((row) => ({
    Periode: row.periodKey,
    'Jumlah Invoice': row.invoiceCount,
    'Jumlah Siswa': row.studentCount,
    'Total Nominal': row.totalAmount,
    'Total Terbayar': row.totalPaid,
    'Total Outstanding': row.totalOutstanding,
    'Invoice Overdue': row.overdueCount,
    'Outstanding Overdue': row.overdueOutstanding,
    UNPAID: row.unpaidCount,
    PARTIAL: row.partialCount,
    PAID: row.paidCount,
    CANCELLED: row.cancelledCount,
  }));

  const classHeaders = [
    'Kelas',
    'Jumlah Invoice',
    'Jumlah Siswa',
    'Total Nominal',
    'Total Terbayar',
    'Total Outstanding',
    'Invoice Overdue',
    'Outstanding Overdue',
  ];
  const classRows: Array<Record<string, unknown>> = snapshot.classRecap.map((row) => ({
    Kelas: row.className,
    'Jumlah Invoice': row.invoiceCount,
    'Jumlah Siswa': row.studentCount,
    'Total Nominal': row.totalAmount,
    'Total Terbayar': row.totalPaid,
    'Total Outstanding': row.totalOutstanding,
    'Invoice Overdue': row.overdueCount,
    'Outstanding Overdue': row.overdueOutstanding,
  }));

  const agingHeaders = ['Bucket Aging', 'Jumlah Invoice', 'Total Outstanding'];
  const agingRows: Array<Record<string, unknown>> = snapshot.agingPiutang.map((row) => ({
    'Bucket Aging': row.label,
    'Jumlah Invoice': row.invoiceCount,
    'Total Outstanding': row.totalOutstanding,
  }));

  const detailHeaders = [
    'No Invoice',
    'Siswa',
    'Username',
    'NIS',
    'NISN',
    'Kelas',
    'Periode',
    'Semester',
    'Judul Tagihan',
    'Jatuh Tempo',
    'Status',
    'Total',
    'Terbayar',
    'Outstanding',
    'Hari Lewat Jatuh Tempo',
    'Bucket Aging',
    'Overdue',
    'Tanggal Terbit',
  ];
  const detailRows: Array<Record<string, unknown>> = snapshot.detailRows.map((row) => ({
    'No Invoice': row.invoiceNo,
    Siswa: row.studentName,
    Username: row.username,
    NIS: row.nis,
    NISN: row.nisn,
    Kelas: row.className,
    Periode: row.periodKey,
    Semester: row.semester,
    'Judul Tagihan': row.title,
    'Jatuh Tempo': row.dueDate || '-',
    Status: row.status,
    Total: row.totalAmount,
    Terbayar: row.paidAmount,
    Outstanding: row.balanceAmount,
    'Hari Lewat Jatuh Tempo': row.daysPastDue,
    'Bucket Aging': row.agingLabel,
    Overdue: row.isOverdue ? 'YA' : 'TIDAK',
    'Tanggal Terbit': row.issuedAt || '-',
  }));

  const trendHeaders = ['Tanggal', 'Jumlah Pembayaran', 'Total Nominal Terbayar'];
  const trendRows: Array<Record<string, unknown>> = snapshot.paymentDailyTrend.map((row) => ({
    Tanggal: row.date,
    'Jumlah Pembayaran': row.paymentCount,
    'Total Nominal Terbayar': row.totalPaid,
  }));

  const reportDate = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const sections: string[] = [];
    const pushSection = (
      title: string,
      headers: string[],
      rows: Array<Record<string, unknown>>,
    ) => {
      sections.push(title);
      sections.push(toCsvContent(headers, rows));
      sections.push('');
    };

    if (reportType === 'all' || reportType === 'monthly') {
      pushSection('REKAP BULANAN', monthlyHeaders, monthlyRows);
    }
    if (reportType === 'all' || reportType === 'class') {
      pushSection('REKAP PER KELAS', classHeaders, classRows);
    }
    if (reportType === 'all' || reportType === 'aging') {
      pushSection('AGING PIUTANG', agingHeaders, agingRows);
    }
    if (reportType === 'all' || reportType === 'detail') {
      pushSection('DETAIL TAGIHAN', detailHeaders, detailRows);
    }
    if (reportType === 'all' || reportType === 'trend') {
      pushSection('TREN PEMBAYARAN HARIAN', trendHeaders, trendRows);
    }
    if (reportType === 'all') {
      pushSection('RINGKASAN', summaryHeaders, summaryRows);
    }

    const fileName = `finance-report-${reportType}-${reportDate}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(`\uFEFF${sections.join('\n')}`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIS KGB2';
  workbook.created = new Date();
  workbook.modified = new Date();

  const addSheet = (
    sheetName: string,
    headers: string[],
    rows: Array<Record<string, unknown>>,
  ) => {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(16, Math.min(42, header.length + 8)),
    }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  if (reportType === 'all') {
    addSheet('Ringkasan', summaryHeaders, summaryRows);
    addSheet('Rekap Bulanan', monthlyHeaders, monthlyRows);
    addSheet('Rekap Kelas', classHeaders, classRows);
    addSheet('Aging Piutang', agingHeaders, agingRows);
    addSheet('Detail Tagihan', detailHeaders, detailRows);
    addSheet('Trend Harian', trendHeaders, trendRows);
  } else if (reportType === 'monthly') {
    addSheet('Rekap Bulanan', monthlyHeaders, monthlyRows);
  } else if (reportType === 'class') {
    addSheet('Rekap Kelas', classHeaders, classRows);
  } else if (reportType === 'aging') {
    addSheet('Aging Piutang', agingHeaders, agingRows);
  } else if (reportType === 'trend') {
    addSheet('Trend Harian', trendHeaders, trendRows);
  } else {
    addSheet('Detail Tagihan', detailHeaders, detailRows);
  }

  const fileName = `finance-report-${reportType}-${reportDate}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  await workbook.xlsx.write(res);
  res.end();
});

export const dispatchFinanceDueRemindersHandler = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {});

  const payload = dispatchFinanceReminderSchema.parse(req.body || {});
  const result = await dispatchFinanceDueReminders({
    dueSoonDays: payload.dueSoonDays,
    mode: payload.mode,
    preview: payload.preview,
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        payload.preview
          ? 'Preview reminder jatuh tempo berhasil'
          : 'Reminder jatuh tempo berhasil dijalankan',
      ),
    );
});

export const listFinancePaymentVerifications = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinancePaymentVerificationViewer((req as any).user || {});

  const { verificationStatus, bankAccountId, matchedOnly, search, limit } =
    listFinancePaymentVerificationsQuerySchema.parse(req.query || {});
  const normalizedSearch = search?.trim();

  const payments = await prisma.financePayment.findMany({
    where: {
      source: FinancePaymentSource.DIRECT,
      method: {
        in: [
          FinancePaymentMethod.BANK_TRANSFER,
          FinancePaymentMethod.VIRTUAL_ACCOUNT,
          FinancePaymentMethod.E_WALLET,
          FinancePaymentMethod.QRIS,
        ],
      },
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(matchedOnly === true
        ? { bankStatementEntries: { some: {} } }
        : matchedOnly === false
          ? { bankStatementEntries: { none: {} } }
          : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { paymentNo: { contains: normalizedSearch, mode: 'insensitive' } },
              { referenceNo: { contains: normalizedSearch, mode: 'insensitive' } },
              { note: { contains: normalizedSearch, mode: 'insensitive' } },
              { student: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
              { student: { nis: { contains: normalizedSearch, mode: 'insensitive' } } },
              { student: { nisn: { contains: normalizedSearch, mode: 'insensitive' } } },
              { invoice: { invoiceNo: { contains: normalizedSearch, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      },
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          periodKey: true,
          semester: true,
        },
      },
      bankAccount: {
        select: {
          id: true,
          code: true,
          bankName: true,
          accountName: true,
          accountNumber: true,
        },
      },
      verifiedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      bankStatementEntries: {
        select: {
          id: true,
          entryDate: true,
          amount: true,
          direction: true,
          referenceNo: true,
          status: true,
          reconciliation: {
            select: {
              id: true,
              reconciliationNo: true,
            },
          },
        },
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  });

  const rows = payments.map((payment) => ({
    ...serializeFinancePaymentRecord(payment),
    student: payment.student,
  }));

  const summary = rows.reduce(
    (acc, payment) => {
      acc.totalPayments += 1;
      acc.totalAmount += Number(payment.amount || 0);

      if (payment.verificationStatus === FinancePaymentVerificationStatus.PENDING) {
        acc.pendingCount += 1;
        acc.pendingAmount += Number(payment.amount || 0);
      } else if (payment.verificationStatus === FinancePaymentVerificationStatus.VERIFIED) {
        acc.verifiedCount += 1;
        acc.verifiedAmount += Number(payment.amount || 0);
      } else {
        acc.rejectedCount += 1;
        acc.rejectedAmount += Number(payment.amount || 0);
      }

      if (payment.matchedStatementEntry) {
        acc.matchedCount += 1;
      } else {
        acc.unmatchedCount += 1;
      }
      return acc;
    },
    {
      totalPayments: 0,
      totalAmount: 0,
      pendingCount: 0,
      pendingAmount: 0,
      verifiedCount: 0,
      verifiedAmount: 0,
      rejectedCount: 0,
      rejectedAmount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        payments: rows,
        summary,
      },
      'Daftar verifikasi pembayaran finance',
    ),
  );
});

export const verifyFinancePayment = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new ApiError(400, 'ID pembayaran tidak valid');
  }

  const payload = decideFinancePaymentVerificationSchema.parse(req.body || {});

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.financePayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    if (!before) {
      throw new ApiError(404, 'Pembayaran tidak ditemukan');
    }

    if (before.verificationStatus === FinancePaymentVerificationStatus.VERIFIED) {
      throw new ApiError(400, 'Pembayaran ini sudah diverifikasi');
    }

    if (before.verificationStatus === FinancePaymentVerificationStatus.REJECTED) {
      throw new ApiError(400, 'Pembayaran yang sudah ditolak tidak bisa diverifikasi');
    }

    const settled = await settleFinanceVerifiedPayment(tx, {
      paymentId,
      actorId: actor.id,
      verificationStatus: FinancePaymentVerificationStatus.VERIFIED,
      verificationNote: payload.note || null,
    });

    return {
      before,
      ...settled,
    };
  });

  const serializedPayment = serializeFinancePaymentRecord(result.payment);
  const serializedInvoice = serializeFinanceInvoiceRecord(result.invoice);
  const creditedAmount = Number(result.creditedAmount || 0);

  await Promise.all([
    createFinanceNotifications({
      studentId: result.invoice.student.id,
      title: 'Pembayaran Berhasil Diverifikasi',
      message: `Pembayaran ${serializedPayment.paymentNo || '-'} sebesar Rp${Math.round(
        serializedPayment.amount,
      ).toLocaleString('id-ID')} untuk invoice ${
        serializedInvoice.invoiceNo
      } sudah diverifikasi. Sisa tagihan sekarang Rp${Math.round(serializedInvoice.balanceAmount).toLocaleString(
        'id-ID',
      )}.${creditedAmount > 0 ? ` Kelebihan bayar Rp${Math.round(creditedAmount).toLocaleString('id-ID')} masuk ke saldo kredit.` : ''}`,
      type: 'FINANCE_PAYMENT_RECORDED',
      data: {
        module: 'FINANCE',
        invoiceId: serializedInvoice.id,
        invoiceNo: serializedInvoice.invoiceNo,
        paymentId: serializedPayment.id,
        paymentNo: serializedPayment.paymentNo,
        paidAmount: serializedPayment.amount,
        allocatedAmount: serializedPayment.allocatedAmount,
        creditedAmount,
        remainingBalance: serializedInvoice.balanceAmount,
        creditBalanceAmount: Number(result.creditBalance?.balanceAmount || 0),
        verificationStatus: serializedPayment.verificationStatus,
      },
    }),
    createFinanceInternalNotifications({
      scopes: ['FINANCE'],
      title: 'Pembayaran Non-Tunai Diverifikasi',
      message: `Pembayaran ${serializedPayment.paymentNo || '-'} untuk ${
        result.invoice.student.name
      } sudah diverifikasi sebesar Rp${Math.round(serializedPayment.amount).toLocaleString('id-ID')}.`,
      type: 'FINANCE_PAYMENT_VERIFIED',
      data: {
        paymentId: serializedPayment.id,
        paymentNo: serializedPayment.paymentNo,
        invoiceId: serializedInvoice.id,
        invoiceNo: serializedInvoice.invoiceNo,
        studentId: result.invoice.student.id,
        studentName: result.invoice.student.name,
        amount: serializedPayment.amount,
      },
    }),
  ]);

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_PAYMENT_VERIFY',
      serializedPayment.id,
      result.before,
      {
        payment: serializedPayment,
        invoice: {
          id: serializedInvoice.id,
          invoiceNo: serializedInvoice.invoiceNo,
          paidAmount: serializedInvoice.paidAmount,
          balanceAmount: serializedInvoice.balanceAmount,
          status: serializedInvoice.status,
        },
        creditBalance: result.creditBalance,
      },
      'Verifikasi pembayaran non-tunai finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat verifikasi pembayaran finance', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        payment: serializedPayment,
        invoice: serializedInvoice,
        creditBalance: result.creditBalance,
      },
      'Pembayaran berhasil diverifikasi',
    ),
  );
});

export const rejectFinancePayment = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new ApiError(400, 'ID pembayaran tidak valid');
  }

  const payload = decideFinancePaymentVerificationSchema.parse(req.body || {});

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.financePayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        bankStatementEntries: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!before) {
      throw new ApiError(404, 'Pembayaran tidak ditemukan');
    }

    if (before.verificationStatus === FinancePaymentVerificationStatus.VERIFIED) {
      throw new ApiError(400, 'Pembayaran yang sudah diverifikasi tidak bisa ditolak');
    }

    if (before.verificationStatus === FinancePaymentVerificationStatus.REJECTED) {
      throw new ApiError(400, 'Pembayaran ini sudah ditolak');
    }

    await tx.financeBankStatementEntry.updateMany({
      where: {
        matchedPaymentId: paymentId,
      },
      data: {
        matchedPaymentId: null,
        status: 'UNMATCHED',
      },
    });

    const payment = await tx.financePayment.update({
      where: { id: paymentId },
      data: {
        verificationStatus: FinancePaymentVerificationStatus.REJECTED,
        verificationNote: payload.note || null,
        verifiedAt: new Date(),
        verifiedById: actor.id,
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        bankStatementEntries: {
          select: {
            id: true,
            entryDate: true,
            amount: true,
            direction: true,
            referenceNo: true,
            status: true,
            reconciliation: {
              select: {
                id: true,
                reconciliationNo: true,
              },
            },
          },
          orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });

    return {
      before,
      payment,
      student: before.student,
      invoice: before.invoice,
    };
  });

  const serializedPayment = serializeFinancePaymentRecord(result.payment);

  await Promise.all([
    createFinanceNotifications({
      studentId: result.student.id,
      title: 'Pembayaran Ditolak',
      message: `Pembayaran ${serializedPayment.paymentNo || '-'} untuk invoice ${
        result.invoice?.invoiceNo || '-'
      } ditolak dan tidak memengaruhi tagihan. Mohon periksa kembali referensi transaksi atau bukti pembayaran.`,
      type: 'FINANCE_PAYMENT_REJECTED',
      data: {
        module: 'FINANCE',
        paymentId: serializedPayment.id,
        paymentNo: serializedPayment.paymentNo,
        invoiceId: result.invoice?.id || null,
        invoiceNo: result.invoice?.invoiceNo || null,
        verificationStatus: serializedPayment.verificationStatus,
        verificationNote: serializedPayment.verificationNote,
      },
    }),
    createFinanceInternalNotifications({
      scopes: ['FINANCE'],
      title: 'Pembayaran Non-Tunai Ditolak',
      message: `Pembayaran ${serializedPayment.paymentNo || '-'} untuk ${
        result.student.name
      } ditolak. Jika sebelumnya matched ke mutasi bank, matching dilepas kembali.`,
      type: 'FINANCE_PAYMENT_REJECTED',
      data: {
        paymentId: serializedPayment.id,
        paymentNo: serializedPayment.paymentNo,
        studentId: result.student.id,
        studentName: result.student.name,
        invoiceId: result.invoice?.id || null,
        invoiceNo: result.invoice?.invoiceNo || null,
      },
    }),
  ]);

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_PAYMENT_REJECT',
      serializedPayment.id,
      result.before,
      {
        payment: serializedPayment,
        student: result.student,
        invoice: result.invoice,
      },
      'Penolakan pembayaran non-tunai finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat penolakan pembayaran finance', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, { payment: serializedPayment }, 'Pembayaran berhasil ditolak'),
  );
});

export const createFinancePayment = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw new ApiError(400, 'ID tagihan tidak valid');
  }

  const payload = createFinancePaymentSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const bankAccount = await resolveFinanceBankAccountForTransaction(
      tx,
      payload.method,
      payload.bankAccountId,
    );

    const invoice = await tx.financeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          include: {
            component: {
              select: {
                periodicity: true,
              },
            },
          },
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
      },
    });

    if (!invoice) {
      throw new ApiError(404, 'Tagihan tidak ditemukan');
    }

    if (invoice.status === 'PAID') {
      throw new ApiError(400, 'Tagihan sudah lunas');
    }

    if (invoice.status === 'CANCELLED') {
      throw new ApiError(400, 'Tagihan sudah dibatalkan');
    }

    const paymentNo = makeFinancePaymentNo(invoice.studentId);
    const requiresVerification = requiresFinancePaymentVerification(payload.method);

    const payment = await tx.financePayment.create({
      data: {
        paymentNo,
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        amount: payload.amount,
        allocatedAmount: 0,
        creditedAmount: 0,
        method: payload.method,
        verificationStatus: requiresVerification
          ? FinancePaymentVerificationStatus.PENDING
          : FinancePaymentVerificationStatus.VERIFIED,
        verificationNote: null,
        verifiedAt: requiresVerification ? null : payload.paidAt || new Date(),
        verifiedById: requiresVerification ? null : actor.id,
        bankAccountId: bankAccount?.id || null,
        referenceNo: payload.referenceNo?.trim() || null,
        note: payload.note?.trim() || null,
        paidAt: payload.paidAt || new Date(),
        createdById: actor.id,
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        bankStatementEntries: {
          select: {
            id: true,
            entryDate: true,
            amount: true,
            direction: true,
            referenceNo: true,
            status: true,
            reconciliation: {
              select: {
                id: true,
                reconciliationNo: true,
              },
            },
          },
          orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });

    if (requiresVerification) {
      return {
        payment,
        invoice,
        creditBalance: null,
        allocatedAmount: 0,
        creditedAmount: 0,
        pendingVerification: true,
      };
    }

    const settled = await settleFinanceVerifiedPayment(tx, {
      paymentId: payment.id,
      actorId: actor.id,
      verificationStatus: FinancePaymentVerificationStatus.VERIFIED,
      verificationNote: payload.note || null,
      verifiedAt: payload.paidAt || new Date(),
    });

    return {
      ...settled,
      pendingVerification: false,
    };
  });

  const serializedPayment = serializeFinancePaymentRecord(result.payment);

  if (result.pendingVerification) {
    await Promise.all([
      createFinanceNotifications({
        studentId: result.invoice.studentId,
        title: 'Pembayaran Menunggu Verifikasi',
        message: `Pembayaran ${serializedPayment.paymentNo || '-'} sebesar Rp${Math.round(
          serializedPayment.amount,
        ).toLocaleString('id-ID')} sudah dicatat dan sedang menunggu verifikasi bendahara. Tagihan belum berkurang sebelum verifikasi selesai.`,
        type: 'FINANCE_PAYMENT_PENDING',
        data: {
          module: 'FINANCE',
          invoiceId,
          invoiceNo: result.invoice.invoiceNo,
          paymentId: serializedPayment.id,
          paymentNo: serializedPayment.paymentNo,
          paidAmount: serializedPayment.amount,
          verificationStatus: serializedPayment.verificationStatus,
          semester: result.invoice.semester,
          periodKey: result.invoice.periodKey,
        },
      }),
      createFinanceInternalNotifications({
        scopes: ['FINANCE'],
        title: 'Pembayaran Non-Tunai Menunggu Verifikasi',
        message: `Pembayaran ${serializedPayment.paymentNo || '-'} untuk invoice ${
          result.invoice.invoiceNo
        } masuk antrean verifikasi.`,
        type: 'FINANCE_PAYMENT_PENDING',
        data: {
          paymentId: serializedPayment.id,
          paymentNo: serializedPayment.paymentNo,
          invoiceId,
          invoiceNo: result.invoice.invoiceNo,
          amount: serializedPayment.amount,
          method: serializedPayment.method,
        },
      }),
    ]);
  } else {
    const settledInvoice = result.invoice as typeof result.invoice & {
      student: { id: number; name: string };
      balanceAmount: number;
      invoiceNo: string;
      semester: Semester;
      periodKey: string;
    };
    const creditedAmount = Number(result.creditedAmount || 0);
    await createFinanceNotifications({
      studentId: settledInvoice.student.id,
      title: 'Pembayaran Tagihan Berhasil Dicatat',
      message: `Pembayaran Rp${Math.round(serializedPayment.amount).toLocaleString('id-ID')} untuk tagihan ${
        settledInvoice.invoiceNo
      } berhasil dicatat. Sisa tagihan: Rp${Math.round(Number(settledInvoice.balanceAmount || 0)).toLocaleString(
        'id-ID',
      )}.${creditedAmount > 0 ? ` Kelebihan bayar Rp${Math.round(creditedAmount).toLocaleString('id-ID')} masuk ke saldo kredit.` : ''}`,
      type: 'FINANCE_PAYMENT_RECORDED',
      data: {
        module: 'FINANCE',
        invoiceId,
        invoiceNo: settledInvoice.invoiceNo,
        paymentId: serializedPayment.id,
        paymentNo: serializedPayment.paymentNo,
        paidAmount: serializedPayment.amount,
        allocatedAmount: Number(serializedPayment.allocatedAmount || 0),
        creditedAmount,
        remainingBalance: Number(settledInvoice.balanceAmount || 0),
        creditBalanceAmount: Number(result.creditBalance?.balanceAmount || 0),
        semester: settledInvoice.semester,
        periodKey: settledInvoice.periodKey,
        verificationStatus: serializedPayment.verificationStatus,
      },
    });
  }

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'CREATE',
      'FINANCE_PAYMENT',
      serializedPayment.id,
      null,
      {
        invoiceId,
        invoiceNo: result.invoice.invoiceNo,
        studentId: 'student' in result.invoice ? result.invoice.student.id : result.invoice.studentId,
        paymentNo: serializedPayment.paymentNo,
        amount: Number(serializedPayment.amount || 0),
        allocatedAmount: Number(serializedPayment.allocatedAmount || 0),
        creditedAmount: Number(result.creditedAmount || 0),
        creditBalanceAmount: Number(result.creditBalance?.balanceAmount || 0),
        verificationStatus: serializedPayment.verificationStatus,
      },
      result.pendingVerification
        ? 'Pembayaran non-tunai masuk antrean verifikasi'
        : Number(result.creditedAmount || 0) > 0
          ? 'Pembayaran invoice dengan kelebihan bayar menjadi saldo kredit'
          : 'Pembayaran invoice',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat pembayaran finance', auditError);
  }

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        {
          ...result,
          payment: serializedPayment,
          invoice:
            'student' in result.invoice ? serializeFinanceInvoiceRecord(result.invoice as any) : result.invoice,
        },
        result.pendingVerification
          ? 'Pembayaran non-tunai berhasil dicatat dan menunggu verifikasi'
          : 'Pembayaran tagihan berhasil dicatat',
      ),
    );
});

export const updateFinanceInvoiceInstallments = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw new ApiError(400, 'ID tagihan tidak valid');
  }

  const payload = updateFinanceInvoiceInstallmentsSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.financeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            verificationStatus: true,
            verificationNote: true,
            verifiedAt: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
      },
    });

    if (!invoice) {
      throw new ApiError(404, 'Tagihan tidak ditemukan');
    }

    if (invoice.status === 'PAID') {
      throw new ApiError(400, 'Tagihan yang sudah lunas tidak bisa dijadwalkan ulang');
    }

    if (invoice.status === 'CANCELLED') {
      throw new ApiError(400, 'Tagihan yang dibatalkan tidak bisa dijadwalkan ulang');
    }

    const currentInstallments = serializeFinanceInstallments({
      invoiceTotalAmount: Number(invoice.totalAmount || 0),
      invoicePaidAmount: Number(invoice.paidAmount || 0),
      invoiceBalanceAmount: Number(invoice.balanceAmount || 0),
      invoiceStatus: invoice.status,
      invoiceWrittenOffAmount: invoice.writtenOffAmount,
      invoiceDueDate: invoice.dueDate || null,
      installments: invoice.installments,
    });

    const nextInstallments = [...payload.installments]
      .sort((left, right) => left.sequence - right.sequence)
      .map((installment) => ({
        sequence: installment.sequence,
        amount: normalizeFinanceAmount(installment.amount),
        dueDate: installment.dueDate ? new Date(installment.dueDate) : null,
      }));

    const settledAmount =
      normalizeFinanceAmount(Number(invoice.paidAmount || 0)) +
      inferFinanceWrittenOffAmount({
        totalAmount: Number(invoice.totalAmount || 0),
        paidAmount: Number(invoice.paidAmount || 0),
        balanceAmount: Number(invoice.balanceAmount || 0),
        writtenOffAmount: invoice.writtenOffAmount,
        status: invoice.status,
      });

    if (settledAmount > 0) {
      if (nextInstallments.length !== currentInstallments.length) {
        throw new ApiError(
          400,
          'Invoice yang sudah memiliki pembayaran hanya boleh mengubah jatuh tempo termin yang masih berjalan',
        );
      }

      for (const currentInstallment of currentInstallments) {
        const nextInstallment = nextInstallments.find(
          (installment) => installment.sequence === currentInstallment.sequence,
        );

        if (!nextInstallment) {
          throw new ApiError(400, 'Data termin pengganti tidak lengkap');
        }

        if (
          Math.abs(
            normalizeFinanceAmount(nextInstallment.amount) -
              normalizeFinanceAmount(currentInstallment.amount),
          ) > 0.009
        ) {
          throw new ApiError(
            400,
            'Nominal termin tidak boleh diubah setelah invoice menerima pembayaran',
          );
        }

        if (
          currentInstallment.balanceAmount <= 0 &&
          !isSameFinanceDate(nextInstallment.dueDate, currentInstallment.dueDate)
        ) {
          throw new ApiError(
            400,
            `Termin ${currentInstallment.sequence} yang sudah lunas tidak boleh diubah jatuh temponya`,
          );
        }
      }
    } else {
      const nextTotalAmount = normalizeFinanceAmount(
        nextInstallments.reduce((sum, installment) => sum + installment.amount, 0),
      );

      if (Math.abs(nextTotalAmount - normalizeFinanceAmount(Number(invoice.totalAmount || 0))) > 0.009) {
        throw new ApiError(400, 'Total seluruh termin harus sama dengan total invoice');
      }
    }

    const savedInstallments = await replaceFinanceInvoiceInstallments(tx, {
      invoiceId: invoice.id,
      installments: nextInstallments,
    });

    const nextDueDate = resolveFinanceInvoiceDueDate({
      invoiceTotalAmount: Number(invoice.totalAmount || 0),
      invoicePaidAmount: Number(invoice.paidAmount || 0),
      invoiceBalanceAmount: Number(invoice.balanceAmount || 0),
      invoiceStatus: invoice.status,
      invoiceWrittenOffAmount: invoice.writtenOffAmount,
      invoiceDueDate: invoice.dueDate || null,
      installments: savedInstallments,
    });

    const updatedInvoice = await tx.financeInvoice.update({
      where: { id: invoice.id },
      data: {
        dueDate: nextDueDate,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
      },
    });

    return {
      beforeInstallments: currentInstallments,
      invoice: updatedInvoice,
    };
  });

  const serializedInvoice = serializeFinanceInvoiceRecord(result.invoice);
  const nextInstallment = serializedInvoice.installmentSummary.nextInstallment;

  await createFinanceNotifications({
    studentId: result.invoice.student.id,
    title: 'Jadwal Cicilan Diperbarui',
    message: nextInstallment
      ? `Jadwal cicilan invoice ${result.invoice.invoiceNo} diperbarui. Termin berikutnya sekarang termin ${nextInstallment.sequence} dengan jatuh tempo ${nextInstallment.dueDate ? new Date(nextInstallment.dueDate).toLocaleDateString('id-ID') : 'belum ditentukan'}.`
      : `Jadwal cicilan invoice ${result.invoice.invoiceNo} berhasil diperbarui.`,
    type: 'FINANCE_INSTALLMENTS_UPDATED',
    data: {
      module: 'FINANCE',
      invoiceId: result.invoice.id,
      invoiceNo: result.invoice.invoiceNo,
      studentId: result.invoice.student.id,
      nextInstallment: nextInstallment
        ? {
            sequence: nextInstallment.sequence,
            dueDate: nextInstallment.dueDate,
            balanceAmount: nextInstallment.balanceAmount,
          }
        : null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'UPDATE',
      'FINANCE_INVOICE_INSTALLMENTS',
      result.invoice.id,
      {
        invoiceNo: result.invoice.invoiceNo,
        installments: result.beforeInstallments,
      },
      {
        invoiceNo: result.invoice.invoiceNo,
        installments: serializedInvoice.installments,
        note: payload.note?.trim() || null,
      },
      payload.note?.trim() || 'Pembaruan jadwal cicilan invoice',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat perubahan cicilan finance', auditError);
  }

  res
    .status(200)
    .json(new ApiResponse(200, { invoice: serializedInvoice }, 'Jadwal cicilan berhasil diperbarui'));
});

export const applyFinanceInvoiceLateFees = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw new ApiError(400, 'ID tagihan tidak valid');
  }

  const payload = applyFinanceLateFeeSchema.parse(req.body || {});
  const appliedAt = payload.appliedAt || new Date();

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.financeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                lateFeeEnabled: true,
                lateFeeMode: true,
                lateFeeAmount: true,
                lateFeeGraceDays: true,
                lateFeeCapAmount: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
      },
    });

    if (!invoice) {
      throw new ApiError(404, 'Tagihan tidak ditemukan');
    }

    if (invoice.status === 'PAID') {
      throw new ApiError(400, 'Tagihan yang sudah lunas tidak bisa ditambah denda');
    }

    if (invoice.status === 'CANCELLED') {
      throw new ApiError(400, 'Tagihan yang dibatalkan tidak bisa ditambah denda');
    }

    const lateFeeSummary = buildFinanceLateFeeSummary(invoice, appliedAt);
    const pendingBreakdown = lateFeeSummary.breakdown.filter((item) => item.pendingAmount > 0);

    if (!pendingBreakdown.length || lateFeeSummary.pendingAmount <= 0) {
      throw new ApiError(400, 'Belum ada denda keterlambatan yang bisa diterapkan pada invoice ini');
    }

    await tx.financeInvoiceItem.createMany({
      data: pendingBreakdown.map((item) => ({
        invoiceId: invoice.id,
        componentId: null,
        componentCode: `LATE_FEE:${item.componentCode}`,
        componentName: `Denda ${item.componentName}`,
        amount: item.pendingAmount,
        notes:
          payload.note?.trim() ||
          `Denda keterlambatan ${
            item.mode === FinanceLateFeeMode.DAILY ? 'harian' : 'tetap'
          } • grace ${item.graceDays} hari • snapshot ${appliedAt.toISOString()}`,
      })),
    });

    const nextSequence =
      invoice.installments.reduce((max, installment) => Math.max(max, installment.sequence), 0) + 1;
    const lateFeeInstallment = {
      sequence: nextSequence,
      amount: normalizeFinanceAmount(lateFeeSummary.pendingAmount),
      dueDate: appliedAt,
    };

    await tx.financeInvoiceInstallment.create({
      data: {
        invoiceId: invoice.id,
        sequence: lateFeeInstallment.sequence,
        amount: lateFeeInstallment.amount,
        dueDate: lateFeeInstallment.dueDate,
      },
    });

    const nextTotalAmount = normalizeFinanceAmount(
      Number(invoice.totalAmount || 0) + lateFeeInstallment.amount,
    );
    const nextBalanceAmount = normalizeFinanceAmount(
      Number(invoice.balanceAmount || 0) + lateFeeInstallment.amount,
    );
    const nextDueDate = resolveFinanceInvoiceDueDate({
      invoiceTotalAmount: nextTotalAmount,
      invoicePaidAmount: Number(invoice.paidAmount || 0),
      invoiceBalanceAmount: nextBalanceAmount,
      invoiceStatus: invoice.status,
      invoiceWrittenOffAmount: invoice.writtenOffAmount,
      invoiceDueDate: invoice.dueDate || null,
      installments: [...invoice.installments, lateFeeInstallment],
    });

    const updatedInvoice = await tx.financeInvoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: nextTotalAmount,
        balanceAmount: nextBalanceAmount,
        dueDate: nextDueDate,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                lateFeeEnabled: true,
                lateFeeMode: true,
                lateFeeAmount: true,
                lateFeeGraceDays: true,
                lateFeeCapAmount: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
      },
    });

    return {
      invoice: updatedInvoice,
      lateFeeSummary,
      pendingBreakdown,
      appliedAmount: lateFeeSummary.pendingAmount,
    };
  });

  const serializedInvoice = serializeFinanceInvoiceRecord(result.invoice, { asOfDate: appliedAt });

  await createFinanceNotifications({
    studentId: result.invoice.student.id,
    title: 'Denda Keterlambatan Diterapkan',
    message: `Invoice ${result.invoice.invoiceNo} dikenakan denda keterlambatan Rp${Math.round(
      result.appliedAmount,
    ).toLocaleString('id-ID')}. Sisa tagihan saat ini Rp${Math.round(
      Number(result.invoice.balanceAmount || 0),
    ).toLocaleString('id-ID')}.`,
    type: 'FINANCE_LATE_FEE_APPLIED',
    data: {
      module: 'FINANCE',
      invoiceId: result.invoice.id,
      invoiceNo: result.invoice.invoiceNo,
      studentId: result.invoice.student.id,
      appliedLateFeeAmount: result.appliedAmount,
      breakdown: result.pendingBreakdown.map((item) => ({
        componentCode: item.componentCode,
        componentName: item.componentName,
        amount: item.pendingAmount,
        mode: item.mode,
        graceDays: item.graceDays,
      })),
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'CREATE',
      'FINANCE_LATE_FEE',
      result.invoice.id,
      {
        invoiceNo: result.invoice.invoiceNo,
        lateFeeSummary: result.lateFeeSummary,
      },
      {
        invoiceNo: result.invoice.invoiceNo,
        appliedAmount: result.appliedAmount,
        breakdown: result.pendingBreakdown,
        note: payload.note?.trim() || null,
      },
      payload.note?.trim() || 'Penerapan denda keterlambatan invoice',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat penerapan denda finance', auditError);
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        invoice: serializedInvoice,
        lateFeeSummary: serializedInvoice.lateFeeSummary,
      },
      'Denda keterlambatan berhasil diterapkan',
    ),
  );
});

export const listFinanceCredits = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { studentId, search, limit } = listFinanceCreditsQuerySchema.parse(req.query);
  const studentSearchWhere = buildFinanceStudentSearchFilter(search);

  const activeCreditWhere: Prisma.FinanceCreditBalanceWhereInput = {
    balanceAmount: { gt: 0 },
    ...(studentId ? { studentId } : {}),
    ...(studentSearchWhere ? { student: studentSearchWhere } : {}),
  };

  const listWhere: Prisma.FinanceCreditBalanceWhereInput = studentId
    ? {
        studentId,
        ...(studentSearchWhere ? { student: studentSearchWhere } : {}),
      }
    : activeCreditWhere;

  const refundWhere: Prisma.FinanceRefundWhereInput = {
    ...(studentId ? { studentId } : {}),
    ...(studentSearchWhere ? { student: studentSearchWhere } : {}),
  };

  const [balances, totalStudentsWithCredit, totalCreditAggregate, totalRefundAggregate, recentRefunds] =
    await Promise.all([
      prisma.financeCreditBalance.findMany({
        where: listWhere,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              username: true,
              nis: true,
              nisn: true,
              studentClass: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                },
              },
            },
          },
          transactions: {
            take: 3,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: {
              payment: {
                select: {
                  id: true,
                  paymentNo: true,
                  source: true,
                  invoice: {
                    select: {
                      id: true,
                      invoiceNo: true,
                      periodKey: true,
                      semester: true,
                    },
                  },
                },
              },
              refund: {
                select: {
                  id: true,
                  refundNo: true,
                  refundedAt: true,
                  method: true,
                },
              },
              createdBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ balanceAmount: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      prisma.financeCreditBalance.count({ where: activeCreditWhere }),
      prisma.financeCreditBalance.aggregate({
        where: activeCreditWhere,
        _sum: {
          balanceAmount: true,
        },
      }),
      prisma.financeRefund.aggregate({
        where: refundWhere,
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.financeRefund.findMany({
        where: refundWhere,
        take: 12,
        orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
        include: {
          student: {
            select: {
              id: true,
              name: true,
              username: true,
              nis: true,
              nisn: true,
              studentClass: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: {
          totalStudentsWithCredit,
          totalCreditBalance: Number(totalCreditAggregate._sum.balanceAmount || 0),
          totalRefundRecords: totalRefundAggregate._count._all,
          totalRefundAmount: Number(totalRefundAggregate._sum.amount || 0),
        },
        balances: balances.map((balance) => ({
          balanceId: balance.id,
          studentId: balance.studentId,
          balanceAmount: Number(balance.balanceAmount || 0),
          updatedAt: balance.updatedAt,
          student: balance.student,
          recentTransactions: balance.transactions.map((transaction) => ({
            id: transaction.id,
            kind: transaction.kind,
            amount: Number(transaction.amount || 0),
            balanceBefore: Number(transaction.balanceBefore || 0),
            balanceAfter: Number(transaction.balanceAfter || 0),
            note: transaction.note || null,
            createdAt: transaction.createdAt,
            createdBy: transaction.createdBy || null,
                payment: transaction.payment
                  ? {
                      id: transaction.payment.id,
                      paymentNo: transaction.payment.paymentNo,
                      source: transaction.payment.source,
                      invoiceId: transaction.payment.invoice?.id || null,
                      invoiceNo: transaction.payment.invoice?.invoiceNo || null,
                      periodKey: transaction.payment.invoice?.periodKey || null,
                  semester: transaction.payment.invoice?.semester || null,
                }
              : null,
            refund: transaction.refund
              ? {
                  id: transaction.refund.id,
                  refundNo: transaction.refund.refundNo,
                  refundedAt: transaction.refund.refundedAt,
                  method: transaction.refund.method,
                }
              : null,
          })),
        })),
        recentRefunds: recentRefunds.map((refund) => serializeFinanceRefundRecord(refund)),
      },
      'Saldo kredit dan refund berhasil diambil',
    ),
  );
});

export const createFinanceRefund = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(400, 'ID siswa tidak valid');
  }

  const payload = createFinanceRefundSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const bankAccount = await resolveFinanceBankAccountForTransaction(
      tx,
      payload.method,
      payload.bankAccountId,
    );

    const creditBalance = await tx.financeCreditBalance.findUnique({
      where: { studentId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
      },
    });

    if (!creditBalance) {
      throw new ApiError(404, 'Saldo kredit siswa tidak ditemukan');
    }

    const balanceBefore = Number(creditBalance.balanceAmount || 0);
    if (balanceBefore <= 0) {
      throw new ApiError(400, 'Saldo kredit siswa sudah kosong');
    }

    if (payload.amount > balanceBefore) {
      throw new ApiError(400, `Nominal refund melebihi saldo kredit (maksimal ${balanceBefore})`);
    }

    const balanceAfter = Math.max(balanceBefore - payload.amount, 0);

    const updatedBalance = await tx.financeCreditBalance.update({
      where: { id: creditBalance.id },
      data: {
        balanceAmount: balanceAfter,
      },
      select: {
        id: true,
        balanceAmount: true,
        updatedAt: true,
      },
    });

    const creditTransaction = await tx.financeCreditTransaction.create({
      data: {
        balanceId: creditBalance.id,
        studentId,
        kind: FinanceCreditTransactionKind.REFUND,
        amount: payload.amount,
        balanceBefore,
        balanceAfter,
        note: payload.note?.trim() || null,
        createdById: actor.id,
      },
      select: {
        id: true,
      },
    });

    const refund = await tx.financeRefund.create({
      data: {
        refundNo: makeFinanceRefundNo(studentId),
        studentId,
        creditBalanceId: creditBalance.id,
        creditTransactionId: creditTransaction.id,
        amount: payload.amount,
        method: payload.method,
        bankAccountId: bankAccount?.id || null,
        referenceNo: payload.referenceNo?.trim() || null,
        note: payload.note?.trim() || null,
        refundedAt: payload.refundedAt || new Date(),
        createdById: actor.id,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        },
      },
    });

    return {
      balance: {
        id: updatedBalance.id,
        amount: Number(updatedBalance.balanceAmount || 0),
        updatedAt: updatedBalance.updatedAt,
      },
      refund: serializeFinanceRefundRecord(refund),
      student: creditBalance.student,
      balanceBefore,
    };
  });

  await createFinanceNotifications({
    studentId,
    title: 'Refund Saldo Kredit Diproses',
    message: `Refund saldo kredit sebesar Rp${Math.round(result.refund.amount).toLocaleString('id-ID')} berhasil diproses. Sisa saldo kredit: Rp${Math.round(result.balance.amount).toLocaleString('id-ID')}.`,
    type: 'FINANCE_CREDIT_REFUND_RECORDED',
    data: {
      module: 'FINANCE',
      studentId,
      refundId: result.refund.id,
      refundNo: result.refund.refundNo,
      refundAmount: result.refund.amount,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balance.amount,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'CREATE',
      'FINANCE_REFUND',
      result.refund.id,
      null,
      {
        studentId,
        refundNo: result.refund.refundNo,
        amount: result.refund.amount,
        method: result.refund.method,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balance.amount,
      },
      'Refund saldo kredit siswa',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat refund finance', auditError);
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        refund: result.refund,
        balance: result.balance,
      },
      'Refund saldo kredit berhasil dicatat',
    ),
  );
});

export const listFinanceBankReconciliations = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceBankReconciliationViewer((req as any).user || {});

  const { bankAccountId, status, limit } = listFinanceBankReconciliationsQuerySchema.parse(req.query);

  const rows = await prisma.financeBankReconciliation.findMany({
    where: {
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status } : {}),
    },
    include: financeBankReconciliationRecordInclude,
    orderBy: [{ status: 'asc' }, { periodEnd: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const reconciliations = await Promise.all(
    rows.map((row: any) => serializeFinanceBankReconciliationRecord(prisma, row)),
  );

  const summary = reconciliations.reduce(
    (acc: any, reconciliation: any) => {
      acc.totalReconciliations += 1;
      if (reconciliation.status === 'OPEN') acc.openCount += 1;
      if (reconciliation.status === 'FINALIZED') acc.finalizedCount += 1;
      acc.totalExpectedBankIn += reconciliation.summary.expectedBankIn;
      acc.totalExpectedBankOut += reconciliation.summary.expectedBankOut;
      acc.totalVarianceAmount += reconciliation.summary.varianceAmount;
      acc.totalStatementGapAmount += reconciliation.summary.statementGapAmount;
      acc.totalUnmatchedPayments += reconciliation.summary.unmatchedPaymentCount;
      acc.totalUnmatchedRefunds += reconciliation.summary.unmatchedRefundCount;
      acc.totalUnmatchedStatementEntries += reconciliation.summary.unmatchedStatementEntryCount;
      return acc;
    },
    {
      totalReconciliations: 0,
      openCount: 0,
      finalizedCount: 0,
      totalExpectedBankIn: 0,
      totalExpectedBankOut: 0,
      totalVarianceAmount: 0,
      totalStatementGapAmount: 0,
      totalUnmatchedPayments: 0,
      totalUnmatchedRefunds: 0,
      totalUnmatchedStatementEntries: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        reconciliations,
        summary,
      },
      'Rekonsiliasi bank berhasil diambil',
    ),
  );
});

export const listFinanceLedgerBooks = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceBankReconciliationViewer((req as any).user || {});

  const { book, bankAccountId, dateFrom, dateTo, search, limit } = listFinanceLedgerBooksQuerySchema.parse(
    req.query || {},
  );

  const snapshot = await buildFinanceLedgerSnapshot(prisma, {
    book,
    bankAccountId: bankAccountId || null,
    dateFrom: dateFrom ? parseFinanceDateInput(dateFrom, false) : null,
    dateTo: dateTo ? parseFinanceDateInput(dateTo, true) : null,
    search: search?.trim() || null,
    limit,
  });

  res.status(200).json(
    new ApiResponse(200, snapshot, 'Ledger treasury finance berhasil diambil'),
  );
});

export const createFinanceBankReconciliation = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = createFinanceBankReconciliationSchema.parse(req.body || {});
  const periodStart = parseFinanceDateInput(payload.periodStart, false);
  const periodEnd = parseFinanceDateInput(payload.periodEnd, true);

  const result = await prisma.$transaction(async (tx) => {
    const bankAccount = await tx.financeBankAccount.findUnique({
      where: { id: payload.bankAccountId },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!bankAccount || !bankAccount.isActive) {
      throw new ApiError(400, 'Rekening bank tidak valid atau sudah nonaktif');
    }

    const overlapping = await tx.financeBankReconciliation.findFirst({
      where: {
        bankAccountId: payload.bankAccountId,
        status: 'OPEN',
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: {
        id: true,
        reconciliationNo: true,
      },
    });

    if (overlapping) {
      throw new ApiError(
        400,
        `Masih ada rekonsiliasi bank terbuka yang overlap (${overlapping.reconciliationNo})`,
      );
    }

    const reconciliation = await tx.financeBankReconciliation.create({
      data: {
        reconciliationNo: makeFinanceBankReconciliationNo(payload.bankAccountId),
        bankAccountId: payload.bankAccountId,
        periodStart,
        periodEnd,
        statementOpeningBalance: normalizeFinanceAmount(Number(payload.statementOpeningBalance || 0)),
        statementClosingBalance: normalizeFinanceAmount(Number(payload.statementClosingBalance || 0)),
        note: payload.note?.trim() || null,
        createdById: actor.id,
      },
      include: financeBankReconciliationRecordInclude,
    });

    return serializeFinanceBankReconciliationRecord(tx, reconciliation);
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'CREATE',
      'FINANCE_BANK_RECONCILIATION',
      result.id,
      null,
      result,
      'Pembuatan rekonsiliasi bank finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat pembuatan rekonsiliasi bank finance', auditError);
  }

  res.status(201).json(
    new ApiResponse(201, { reconciliation: result }, 'Rekonsiliasi bank berhasil dibuat'),
  );
});

export const createFinanceBankStatementEntry = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const reconciliationId = Number(req.params.id);
  if (!Number.isInteger(reconciliationId) || reconciliationId <= 0) {
    throw new ApiError(400, 'ID rekonsiliasi bank tidak valid');
  }

  const payload = createFinanceBankStatementEntrySchema.parse(req.body || {});
  const entryDate = parseFinanceDateInput(payload.entryDate, false);

  const result = await prisma.$transaction(async (tx) => {
    const reconciliation = await tx.financeBankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: financeBankReconciliationRecordInclude,
    });

    if (!reconciliation) {
      throw new ApiError(404, 'Rekonsiliasi bank tidak ditemukan');
    }

    if (reconciliation.status !== 'OPEN') {
      throw new ApiError(400, 'Mutasi hanya bisa ditambahkan ke rekonsiliasi bank yang masih terbuka');
    }

    const autoMatch = await resolveFinanceBankStatementAutoMatch(tx, reconciliation, {
      entryDate,
      direction: payload.direction,
      amount: payload.amount,
      referenceNo: payload.referenceNo?.trim() || null,
    });

    const entry = await tx.financeBankStatementEntry.create({
      data: {
        reconciliationId,
        entryDate,
        direction: payload.direction,
        amount: normalizeFinanceAmount(Number(payload.amount || 0)),
        referenceNo: payload.referenceNo?.trim() || null,
        description: payload.description?.trim() || null,
        status: autoMatch.status,
        matchedPaymentId: autoMatch.matchedPaymentId,
        matchedRefundId: autoMatch.matchedRefundId,
        createdById: actor.id,
      },
      include: {
        matchedPayment: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
            bankAccount: {
              select: {
                id: true,
                code: true,
                bankName: true,
                accountName: true,
                accountNumber: true,
              },
            },
            verifiedBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            bankStatementEntries: {
              select: {
                id: true,
                entryDate: true,
                amount: true,
                direction: true,
                referenceNo: true,
                status: true,
                reconciliation: {
                  select: {
                    id: true,
                    reconciliationNo: true,
                  },
                },
              },
              orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                periodKey: true,
                semester: true,
              },
            },
          },
        },
        matchedRefund: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            bankAccount: {
              select: {
                id: true,
                code: true,
                bankName: true,
                accountName: true,
                accountNumber: true,
              },
            },
          },
        },
      },
    });

    const refreshedReconciliation = await tx.financeBankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: financeBankReconciliationRecordInclude,
    });

    if (!refreshedReconciliation) {
      throw new ApiError(404, 'Rekonsiliasi bank tidak ditemukan setelah mutasi ditambahkan');
    }

    const serializedReconciliation = await serializeFinanceBankReconciliationRecord(
      tx,
      refreshedReconciliation,
    );
    return {
      entry: serializeFinanceBankStatementEntry(entry),
      reconciliation: serializedReconciliation,
    };
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'CREATE',
      'FINANCE_BANK_STATEMENT_ENTRY',
      result.entry.id,
      null,
      result.entry,
      'Pencatatan mutasi statement bank finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat mutasi statement bank finance', auditError);
  }

  res.status(201).json(
    new ApiResponse(
      201,
      result,
      result.entry.status === 'MATCHED'
        ? 'Mutasi bank berhasil ditambahkan dan otomatis matched'
        : 'Mutasi bank berhasil ditambahkan',
    ),
  );
});

export const finalizeFinanceBankReconciliation = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const reconciliationId = Number(req.params.id);
  if (!Number.isInteger(reconciliationId) || reconciliationId <= 0) {
    throw new ApiError(400, 'ID rekonsiliasi bank tidak valid');
  }

  const payload = finalizeFinanceBankReconciliationSchema.parse(req.body || {});

  const before = await prisma.financeBankReconciliation.findUnique({
    where: { id: reconciliationId },
    include: financeBankReconciliationRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Rekonsiliasi bank tidak ditemukan');
  }

  if (before.status !== 'OPEN') {
    throw new ApiError(400, 'Rekonsiliasi bank sudah difinalkan');
  }

  const snapshot = await buildFinanceBankReconciliationSummary(prisma, before);
  const hasVariance = isFinanceNonZeroAmount(snapshot.summary.varianceAmount);
  const hasStatementGap = isFinanceNonZeroAmount(snapshot.summary.statementGapAmount);
  const hasOpenItems =
    snapshot.summary.unmatchedPaymentCount > 0 ||
    snapshot.summary.unmatchedRefundCount > 0 ||
    snapshot.summary.unmatchedStatementEntryCount > 0;

  if ((hasVariance || hasStatementGap || hasOpenItems) && !payload.note?.trim()) {
    throw new ApiError(
      400,
      'Catatan finalisasi wajib diisi jika masih ada variance, gap statement, atau item yang belum matched',
    );
  }

  const updated = await prisma.financeBankReconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: 'FINALIZED',
      finalizedById: actor.id,
      finalizedAt: new Date(),
      note: payload.note?.trim() || before.note || null,
    },
    include: financeBankReconciliationRecordInclude,
  });

  const serialized = await serializeFinanceBankReconciliationRecord(prisma, updated);

  await createFinanceInternalNotifications({
    scopes: ['HEAD_TU', 'PRINCIPAL'],
    title: 'Rekonsiliasi Bank Difinalkan',
    message: `Rekonsiliasi ${serialized.reconciliationNo} untuk ${serialized.bankAccount.bankName} ${serialized.bankAccount.accountNumber} sudah difinalkan.`,
    type: 'FINANCE_BANK_RECONCILIATION_FINALIZED',
    data: {
      reconciliationId: serialized.id,
      reconciliationNo: serialized.reconciliationNo,
      bankAccountId: serialized.bankAccount.id,
      bankAccountCode: serialized.bankAccount.code,
      varianceAmount: serialized.summary.varianceAmount,
      unmatchedPaymentCount: serialized.summary.unmatchedPaymentCount,
      unmatchedRefundCount: serialized.summary.unmatchedRefundCount,
      unmatchedStatementEntryCount: serialized.summary.unmatchedStatementEntryCount,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_BANK_RECONCILIATION_FINALIZE',
      serialized.id,
      before,
      serialized,
      'Finalisasi rekonsiliasi bank finance',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat finalisasi rekonsiliasi bank finance', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, { reconciliation: serialized }, 'Rekonsiliasi bank berhasil difinalkan'),
  );
});

export const listFinanceCashSessions = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceCashSessionViewer((req as any).user || {});

  const { openedById, status, approvalStatus, pendingFor, businessDate, mine, limit } =
    listFinanceCashSessionsQuerySchema.parse(req.query);
  const effectiveMine = mine ?? (!actor.isHeadTu && !actor.isPrincipal ? true : undefined);
  const dateFilter = businessDate ? normalizeFinanceBusinessDateInput(businessDate) : null;
  const approvalWhere =
    approvalStatus != null
      ? { approvalStatus }
      : pendingFor === 'HEAD_TU'
        ? { approvalStatus: FinanceCashSessionApprovalStatus.PENDING_HEAD_TU }
        : pendingFor === 'PRINCIPAL'
          ? { approvalStatus: FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL }
          : {};

  const where: Prisma.FinanceCashSessionWhereInput = {
    ...(openedById ? { openedById } : {}),
    ...(status ? { status } : {}),
    ...approvalWhere,
    ...(effectiveMine ? { openedById: actor.id } : {}),
    ...(dateFilter
      ? {
          businessDate: {
            gte: dateFilter,
            lte: getFinanceEndOfDay(dateFilter),
          },
        }
      : {}),
  };

  const sessions = await prisma.financeCashSession.findMany({
    where,
    include: financeCashSessionRecordInclude,
    orderBy: [{ status: 'asc' }, { openedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const serializedSessions = await Promise.all(
    sessions.map(async (session) => {
      const liveSummary = await buildFinanceCashSessionSummary(prisma, session);
      const resolvedSummary =
        session.status === FinanceCashSessionStatus.OPEN
          ? liveSummary
          : {
              ...liveSummary,
              expectedCashIn: Number(session.expectedCashIn || 0),
              expectedCashOut: Number(session.expectedCashOut || 0),
              expectedClosingBalance: Number(session.expectedClosingBalance || 0),
              totalCashPayments: Number(session.totalCashPayments || 0),
              totalCashRefunds: Number(session.totalCashRefunds || 0),
            };

      return serializeFinanceCashSessionRecord(session, resolvedSummary);
    }),
  );

  const summary = serializedSessions.reduce(
    (acc, session) => {
      acc.totalSessions += 1;
      acc.totalExpectedCashIn += session.expectedCashIn;
      acc.totalExpectedCashOut += session.expectedCashOut;
      acc.totalExpectedClosingBalance += session.expectedClosingBalance;
      acc.totalVarianceAmount += Number(session.varianceAmount || 0);
      if (session.status === FinanceCashSessionStatus.OPEN) {
        acc.openCount += 1;
      } else {
        acc.closedCount += 1;
      }
      if (session.approvalStatus === FinanceCashSessionApprovalStatus.PENDING_HEAD_TU) acc.pendingHeadTuCount += 1;
      if (session.approvalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL) {
        acc.pendingPrincipalCount += 1;
      }
      if (
        session.approvalStatus === FinanceCashSessionApprovalStatus.APPROVED ||
        session.approvalStatus === FinanceCashSessionApprovalStatus.AUTO_APPROVED
      ) {
        acc.approvedCount += 1;
      }
      if (session.approvalStatus === FinanceCashSessionApprovalStatus.REJECTED) acc.rejectedCount += 1;
      return acc;
    },
    {
      totalSessions: 0,
      openCount: 0,
      closedCount: 0,
      pendingHeadTuCount: 0,
      pendingPrincipalCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      totalExpectedCashIn: 0,
      totalExpectedCashOut: 0,
      totalExpectedClosingBalance: 0,
      totalVarianceAmount: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        activeSession:
          serializedSessions.find((session) => session.status === FinanceCashSessionStatus.OPEN) || null,
        sessions: serializedSessions,
        summary: {
          ...summary,
          totalExpectedCashIn: normalizeFinanceAmount(summary.totalExpectedCashIn),
          totalExpectedCashOut: normalizeFinanceAmount(summary.totalExpectedCashOut),
          totalExpectedClosingBalance: normalizeFinanceAmount(summary.totalExpectedClosingBalance),
          totalVarianceAmount: normalizeFinanceAmount(summary.totalVarianceAmount),
        },
      },
      'Settlement kas harian berhasil diambil',
    ),
  );
});

export const openFinanceCashSession = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = openFinanceCashSessionSchema.parse(req.body || {});

  const existingOpen = await prisma.financeCashSession.findFirst({
    where: {
      openedById: actor.id,
      status: FinanceCashSessionStatus.OPEN,
    },
    select: {
      id: true,
      sessionNo: true,
    },
  });

  if (existingOpen) {
    throw new ApiError(400, `Masih ada sesi kas terbuka (${existingOpen.sessionNo}) yang belum ditutup`);
  }

  const businessDate = normalizeFinanceBusinessDateInput(payload.businessDate);
  const session = await prisma.financeCashSession.create({
    data: {
      sessionNo: makeFinanceCashSessionNo(actor.id),
      businessDate,
      approvalStatus: FinanceCashSessionApprovalStatus.NOT_SUBMITTED,
      openingBalance: normalizeFinanceAmount(Number(payload.openingBalance || 0)),
      expectedClosingBalance: normalizeFinanceAmount(Number(payload.openingBalance || 0)),
      openingNote: payload.note?.trim() || null,
      openedById: actor.id,
    },
    include: financeCashSessionRecordInclude,
  });

  const serializedSession = serializeFinanceCashSessionRecord(session, {
    expectedCashIn: 0,
    expectedCashOut: 0,
    expectedClosingBalance: Number(session.openingBalance || 0),
    totalCashPayments: 0,
    totalCashRefunds: 0,
    recentCashPayments: [],
    recentCashRefunds: [],
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'CREATE',
      'FINANCE_CASH_SESSION',
      session.id,
      null,
      {
        sessionNo: session.sessionNo,
        businessDate: businessDate.toISOString(),
        openingBalance: Number(session.openingBalance || 0),
        openingNote: session.openingNote || null,
      },
      'Pembukaan sesi kas harian bendahara',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat pembukaan sesi kas finance', auditError);
  }

  res.status(201).json(
    new ApiResponse(201, { session: serializedSession }, 'Sesi kas harian berhasil dibuka'),
  );
});

export const closeFinanceCashSession = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const approvalPolicy = await ensureFinanceCashSessionApprovalPolicy();

  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ApiError(400, 'ID sesi kas tidak valid');
  }

  const payload = closeFinanceCashSessionSchema.parse(req.body || {});
  const before = await prisma.financeCashSession.findUnique({
    where: { id: sessionId },
    include: financeCashSessionRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Sesi kas tidak ditemukan');
  }

  if (before.status !== FinanceCashSessionStatus.OPEN) {
    throw new ApiError(400, 'Sesi kas ini sudah ditutup');
  }

  if (before.openedById !== actor.id && actor.role !== 'ADMIN') {
    throw new ApiError(403, 'Hanya petugas pembuka sesi atau admin yang boleh menutup sesi kas ini');
  }

  const closedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const liveSummary = await buildFinanceCashSessionSummary(tx, {
      ...before,
      closedAt,
    });

    const actualClosingBalance = normalizeFinanceAmount(Number(payload.actualClosingBalance || 0));
    const varianceAmount = normalizeFinanceAmount(actualClosingBalance - liveSummary.expectedClosingBalance);
    const closingNote = payload.note?.trim() || null;

    if (approvalPolicy.requireVarianceNote && isFinanceNonZeroAmount(varianceAmount) && !closingNote) {
      throw new ApiError(400, 'Catatan closing wajib diisi saat ada selisih settlement kas');
    }

    const approvalStatus = resolveFinanceCashSessionCloseApprovalStatus(approvalPolicy, varianceAmount);

    const updated = await tx.financeCashSession.update({
      where: { id: before.id },
      data: {
        status: FinanceCashSessionStatus.CLOSED,
        approvalStatus,
        expectedCashIn: liveSummary.expectedCashIn,
        expectedCashOut: liveSummary.expectedCashOut,
        expectedClosingBalance: liveSummary.expectedClosingBalance,
        actualClosingBalance,
        varianceAmount,
        totalCashPayments: liveSummary.totalCashPayments,
        totalCashRefunds: liveSummary.totalCashRefunds,
        closedById: actor.id,
        closedAt,
        closingNote,
        headTuApproved: null,
        headTuDecisionById: null,
        headTuDecisionAt: null,
        headTuDecisionNote: null,
        principalApproved: null,
        principalDecisionById: null,
        principalDecisionAt: null,
        principalDecisionNote: null,
      },
      include: financeCashSessionRecordInclude,
    });

    return {
      session: serializeFinanceCashSessionRecord(updated, liveSummary),
      varianceAmount,
      approvalStatus,
    };
  });

  if (result.approvalStatus === FinanceCashSessionApprovalStatus.PENDING_HEAD_TU) {
    await createFinanceInternalNotifications({
      scopes: ['HEAD_TU'],
      title: 'Review Settlement Kas Harian',
      message: `Sesi kas ${result.session.sessionNo} ditutup dengan selisih ${Math.round(
        Number(result.varianceAmount || 0),
      ).toLocaleString('id-ID')} rupiah dan menunggu review Kepala TU.`,
      type: 'FINANCE_CASH_SESSION_REVIEW_REQUESTED',
      data: {
        module: 'FINANCE',
        sessionId: result.session.id,
        sessionNo: result.session.sessionNo,
        businessDate: result.session.businessDate,
        approvalStatus: result.approvalStatus,
        varianceAmount: result.varianceAmount,
        expectedClosingBalance: result.session.expectedClosingBalance,
        actualClosingBalance: result.session.actualClosingBalance,
      },
    });
  }

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_CASH_SESSION',
      before.id,
      before,
      result.session,
      'Penutupan settlement kas harian bendahara',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat penutupan sesi kas finance', auditError);
  }

  res.status(200).json(
    new ApiResponse(200, { session: result.session }, 'Sesi kas harian berhasil ditutup'),
  );
});

export const decideFinanceCashSessionAsHeadTu = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceHeadTuActor((req as any).user || {});
  const policy = await ensureFinanceCashSessionApprovalPolicy();

  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ApiError(400, 'ID sesi kas tidak valid');
  }

  const payload = decideFinanceCashSessionSchema.parse(req.body || {});
  if (!payload.approved && !payload.note?.trim()) {
    throw new ApiError(400, 'Catatan keputusan wajib diisi saat menolak settlement kas');
  }

  const before = await prisma.financeCashSession.findUnique({
    where: { id: sessionId },
    include: financeCashSessionRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Sesi kas tidak ditemukan');
  }

  if (before.status !== FinanceCashSessionStatus.CLOSED) {
    throw new ApiError(400, 'Sesi kas ini belum ditutup');
  }

  if (before.approvalStatus !== FinanceCashSessionApprovalStatus.PENDING_HEAD_TU) {
    throw new ApiError(400, 'Sesi kas ini tidak sedang menunggu review Kepala TU');
  }

  const varianceAbs = Math.abs(Number(before.varianceAmount || 0));
  const nextApprovalStatus = payload.approved
    ? !isFinanceNonZeroAmount(before.varianceAmount) || varianceAbs < Number(policy.principalApprovalThresholdAmount || 0)
      ? FinanceCashSessionApprovalStatus.APPROVED
      : FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
    : FinanceCashSessionApprovalStatus.REJECTED;

  const updated = await prisma.financeCashSession.update({
    where: { id: sessionId },
    data: {
      approvalStatus: nextApprovalStatus,
      headTuApproved: payload.approved,
      headTuDecisionById: actor.id,
      headTuDecisionAt: new Date(),
      headTuDecisionNote: payload.note?.trim() || null,
      ...(payload.approved
        ? {}
        : {
            principalApproved: null,
            principalDecisionById: null,
            principalDecisionAt: null,
            principalDecisionNote: null,
          }),
    },
    include: financeCashSessionRecordInclude,
  });

  const serializedSession = serializeFinanceCashSessionRecord(updated);

  await createFinanceInternalNotifications({
    scopes:
      nextApprovalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
        ? ['PRINCIPAL', 'FINANCE']
        : ['FINANCE'],
    title:
      nextApprovalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
        ? 'Settlement Kas Diteruskan ke Kepala Sekolah'
        : payload.approved
          ? 'Settlement Kas Disetujui Kepala TU'
          : 'Settlement Kas Ditolak Kepala TU',
    message:
      nextApprovalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
        ? `Settlement kas ${serializedSession.sessionNo} diteruskan ke Kepala Sekolah karena selisih mencapai Rp${Math.round(
            Number(serializedSession.varianceAmount || 0),
          ).toLocaleString('id-ID')}.`
        : payload.approved
          ? `Settlement kas ${serializedSession.sessionNo} disetujui oleh Kepala TU.`
          : `Settlement kas ${serializedSession.sessionNo} ditolak oleh Kepala TU.`,
    type:
      nextApprovalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
        ? 'FINANCE_CASH_SESSION_HEAD_TU_ESCALATED'
        : payload.approved
          ? 'FINANCE_CASH_SESSION_HEAD_TU_APPROVED'
          : 'FINANCE_CASH_SESSION_HEAD_TU_REJECTED',
    data: {
      module: 'FINANCE',
      sessionId: serializedSession.id,
      sessionNo: serializedSession.sessionNo,
      businessDate: serializedSession.businessDate,
      varianceAmount: serializedSession.varianceAmount,
      approvalStatus: serializedSession.approvalStatus,
      note: payload.note?.trim() || null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_CASH_SESSION_HEAD_TU_DECISION',
      before.id,
      before,
      serializedSession,
      payload.approved
        ? nextApprovalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
          ? 'Kepala TU meneruskan settlement kas ke Kepala Sekolah'
          : 'Kepala TU menyetujui settlement kas'
        : 'Kepala TU menolak settlement kas',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat keputusan settlement kas oleh Head TU', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { session: serializedSession },
      nextApprovalStatus === FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL
        ? 'Settlement kas diteruskan ke Kepala Sekolah'
        : payload.approved
          ? 'Settlement kas disetujui Kepala TU'
          : 'Settlement kas ditolak Kepala TU',
    ),
  );
});

export const decideFinanceCashSessionAsPrincipal = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinancePrincipalActor((req as any).user || {});

  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ApiError(400, 'ID sesi kas tidak valid');
  }

  const payload = decideFinanceCashSessionSchema.parse(req.body || {});
  if (!payload.approved && !payload.note?.trim()) {
    throw new ApiError(400, 'Catatan keputusan wajib diisi saat menolak settlement kas');
  }

  const before = await prisma.financeCashSession.findUnique({
    where: { id: sessionId },
    include: financeCashSessionRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Sesi kas tidak ditemukan');
  }

  if (before.status !== FinanceCashSessionStatus.CLOSED) {
    throw new ApiError(400, 'Sesi kas ini belum ditutup');
  }

  if (before.approvalStatus !== FinanceCashSessionApprovalStatus.PENDING_PRINCIPAL) {
    throw new ApiError(400, 'Sesi kas ini tidak sedang menunggu keputusan Kepala Sekolah');
  }

  const updated = await prisma.financeCashSession.update({
    where: { id: sessionId },
    data: {
      approvalStatus: payload.approved
        ? FinanceCashSessionApprovalStatus.APPROVED
        : FinanceCashSessionApprovalStatus.REJECTED,
      principalApproved: payload.approved,
      principalDecisionById: actor.id,
      principalDecisionAt: new Date(),
      principalDecisionNote: payload.note?.trim() || null,
    },
    include: financeCashSessionRecordInclude,
  });

  const serializedSession = serializeFinanceCashSessionRecord(updated);

  await createFinanceInternalNotifications({
    scopes: ['FINANCE', 'HEAD_TU'],
    title: payload.approved
      ? 'Settlement Kas Disetujui Kepala Sekolah'
      : 'Settlement Kas Ditolak Kepala Sekolah',
    message: payload.approved
      ? `Settlement kas ${serializedSession.sessionNo} disetujui oleh Kepala Sekolah.`
      : `Settlement kas ${serializedSession.sessionNo} ditolak oleh Kepala Sekolah.`,
    type: payload.approved
      ? 'FINANCE_CASH_SESSION_PRINCIPAL_APPROVED'
      : 'FINANCE_CASH_SESSION_PRINCIPAL_REJECTED',
    data: {
      module: 'FINANCE',
      sessionId: serializedSession.id,
      sessionNo: serializedSession.sessionNo,
      businessDate: serializedSession.businessDate,
      varianceAmount: serializedSession.varianceAmount,
      approvalStatus: serializedSession.approvalStatus,
      note: payload.note?.trim() || null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_CASH_SESSION_PRINCIPAL_DECISION',
      before.id,
      before,
      serializedSession,
      payload.approved ? 'Kepala Sekolah menyetujui settlement kas' : 'Kepala Sekolah menolak settlement kas',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat keputusan settlement kas oleh principal', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { session: serializedSession },
      payload.approved ? 'Settlement kas disetujui Kepala Sekolah' : 'Settlement kas ditolak Kepala Sekolah',
    ),
  );
});

export const listFinanceWriteOffs = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceWriteOffViewer((req as any).user || {});

  const { invoiceId, studentId, status, pendingFor, search, limit } =
    listFinanceWriteOffsQuerySchema.parse(req.query);
  const normalizedSearch = search?.trim();

  const statusWhere =
    status != null
      ? { status }
      : pendingFor === 'HEAD_TU'
        ? { status: FinanceWriteOffStatus.PENDING_HEAD_TU }
        : pendingFor === 'PRINCIPAL'
          ? { status: FinanceWriteOffStatus.PENDING_PRINCIPAL }
          : pendingFor === 'FINANCE_APPLY'
            ? { status: FinanceWriteOffStatus.APPROVED }
            : {};

  const where: Prisma.FinanceWriteOffRequestWhereInput = {
    ...(invoiceId ? { invoiceId } : {}),
    ...(studentId ? { studentId } : {}),
    ...statusWhere,
    ...(normalizedSearch
      ? {
          OR: [
            { requestNo: { contains: normalizedSearch, mode: 'insensitive' } },
            { reason: { contains: normalizedSearch, mode: 'insensitive' } },
            { invoice: { invoiceNo: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { username: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { nis: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { nisn: { contains: normalizedSearch, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [requests, groupedSummary] = await Promise.all([
    prisma.financeWriteOffRequest.findMany({
      where,
      include: financeWriteOffRecordInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.financeWriteOffRequest.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: {
        requestedAmount: true,
        approvedAmount: true,
        appliedAmount: true,
      },
    }),
  ]);

  const summary = groupedSummary.reduce(
    (acc, row) => {
      acc.totalRequests += row._count._all;
      acc.totalRequestedAmount += Number(row._sum.requestedAmount || 0);
      acc.totalApprovedAmount += Number(row._sum.approvedAmount || 0);
      acc.totalAppliedAmount += Number(row._sum.appliedAmount || 0);

      if (row.status === FinanceWriteOffStatus.PENDING_HEAD_TU) acc.pendingHeadTuCount += row._count._all;
      if (row.status === FinanceWriteOffStatus.PENDING_PRINCIPAL) acc.pendingPrincipalCount += row._count._all;
      if (row.status === FinanceWriteOffStatus.APPROVED) acc.approvedCount += row._count._all;
      if (row.status === FinanceWriteOffStatus.REJECTED) acc.rejectedCount += row._count._all;
      if (row.status === FinanceWriteOffStatus.APPLIED) acc.appliedCount += row._count._all;

      return acc;
    },
    {
      totalRequests: 0,
      pendingHeadTuCount: 0,
      pendingPrincipalCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      appliedCount: 0,
      totalRequestedAmount: 0,
      totalApprovedAmount: 0,
      totalAppliedAmount: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: {
          ...summary,
          totalRequestedAmount: normalizeFinanceAmount(summary.totalRequestedAmount),
          totalApprovedAmount: normalizeFinanceAmount(summary.totalApprovedAmount),
          totalAppliedAmount: normalizeFinanceAmount(summary.totalAppliedAmount),
        },
        requests: requests.map((request) => serializeFinanceWriteOffRecord(request)),
      },
      'Daftar write-off berhasil diambil',
    ),
  );
});

export const createFinanceWriteOffRequest = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw new ApiError(400, 'ID tagihan tidak valid');
  }

  const payload = createFinanceWriteOffSchema.parse(req.body || {});

  const result = await prisma.$transaction(async (tx) => {
    const [invoice, activeRequest] = await Promise.all([
      tx.financeInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              username: true,
              nis: true,
              nisn: true,
              studentClass: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                },
              },
            },
          },
        },
      }),
      tx.financeWriteOffRequest.findFirst({
        where: {
          invoiceId,
          status: {
            in: [
              FinanceWriteOffStatus.PENDING_HEAD_TU,
              FinanceWriteOffStatus.PENDING_PRINCIPAL,
              FinanceWriteOffStatus.APPROVED,
            ],
          },
        },
        select: {
          id: true,
          requestNo: true,
        },
      }),
    ]);

    if (!invoice) {
      throw new ApiError(404, 'Tagihan tidak ditemukan');
    }

    if (invoice.status === 'CANCELLED') {
      throw new ApiError(400, 'Tagihan yang dibatalkan tidak dapat diajukan write-off');
    }

    if (Number(invoice.balanceAmount || 0) <= 0) {
      throw new ApiError(400, 'Tagihan sudah tidak memiliki outstanding untuk di-write-off');
    }

    if (activeRequest) {
      throw new ApiError(
        400,
        `Masih ada pengajuan write-off aktif (${activeRequest.requestNo}) untuk invoice ini`,
      );
    }

    const requestedAmount = normalizeFinanceAmount(Number(payload.amount || 0));
    if (requestedAmount > Number(invoice.balanceAmount || 0)) {
      throw new ApiError(
        400,
        `Nominal write-off melebihi outstanding invoice (maksimal Rp${Math.round(
          Number(invoice.balanceAmount || 0),
        ).toLocaleString('id-ID')})`,
      );
    }

    const request = await tx.financeWriteOffRequest.create({
      data: {
        requestNo: makeFinanceWriteOffNo(invoice.studentId),
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        requestedAmount,
        reason: payload.reason.trim(),
        requestedNote: payload.note?.trim() || null,
        requestedById: actor.id,
      },
      include: financeWriteOffRecordInclude,
    });

    return request;
  });

  const serializedRequest = serializeFinanceWriteOffRecord(result);

  await createFinanceInternalNotifications({
    scopes: ['HEAD_TU'],
    title: 'Pengajuan Write-Off Baru',
    message: `Invoice ${serializedRequest.invoice?.invoiceNo || '-'} untuk ${
      serializedRequest.student?.name || 'siswa'
    } diajukan write-off sebesar Rp${Math.round(serializedRequest.requestedAmount).toLocaleString('id-ID')}.`,
    type: 'FINANCE_WRITE_OFF_REQUESTED',
    data: {
      requestId: serializedRequest.id,
      requestNo: serializedRequest.requestNo,
      invoiceId: serializedRequest.invoiceId,
      invoiceNo: serializedRequest.invoice?.invoiceNo || null,
      studentId: serializedRequest.studentId,
      studentName: serializedRequest.student?.name || null,
      requestedAmount: serializedRequest.requestedAmount,
      reason: serializedRequest.reason,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'CREATE',
      'FINANCE_WRITE_OFF_REQUEST',
      serializedRequest.id,
      null,
      {
        requestNo: serializedRequest.requestNo,
        invoiceId: serializedRequest.invoiceId,
        invoiceNo: serializedRequest.invoice?.invoiceNo || null,
        studentId: serializedRequest.studentId,
        requestedAmount: serializedRequest.requestedAmount,
        reason: serializedRequest.reason,
      },
      'Pengajuan write-off piutang siswa',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat pengajuan write-off finance', auditError);
  }

  res
    .status(201)
    .json(new ApiResponse(201, { request: serializedRequest }, 'Pengajuan write-off berhasil dibuat'));
});

export const decideFinanceWriteOffAsHeadTu = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceHeadTuActor((req as any).user || {});

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError(400, 'ID pengajuan write-off tidak valid');
  }

  const payload = decideFinanceWriteOffSchema.parse(req.body || {});

  const before = await prisma.financeWriteOffRequest.findUnique({
    where: { id: requestId },
    include: financeWriteOffRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Pengajuan write-off tidak ditemukan');
  }

  if (before.status !== FinanceWriteOffStatus.PENDING_HEAD_TU) {
    throw new ApiError(400, 'Pengajuan write-off ini tidak sedang menunggu persetujuan Kepala TU');
  }

  const invoiceBalanceAmount = Number(before.invoice?.balanceAmount || 0);
  const approvedAmount = payload.approved
    ? normalizeFinanceAmount(Number(payload.approvedAmount || before.requestedAmount || 0))
    : null;

  if (payload.approved && approvedAmount != null && approvedAmount > invoiceBalanceAmount) {
    throw new ApiError(400, 'Nominal persetujuan melebihi outstanding invoice saat ini');
  }

  const updated = await prisma.financeWriteOffRequest.update({
    where: { id: requestId },
    data: {
      status: payload.approved ? FinanceWriteOffStatus.PENDING_PRINCIPAL : FinanceWriteOffStatus.REJECTED,
      approvedAmount: payload.approved ? approvedAmount : null,
      headTuApproved: payload.approved,
      headTuDecisionById: actor.id,
      headTuDecisionAt: new Date(),
      headTuDecisionNote: payload.note?.trim() || null,
    },
    include: financeWriteOffRecordInclude,
  });

  const serializedRequest = serializeFinanceWriteOffRecord(updated);

  await createFinanceInternalNotifications({
    scopes: payload.approved ? ['PRINCIPAL', 'FINANCE'] : ['FINANCE'],
    title: payload.approved ? 'Write-Off Disetujui Kepala TU' : 'Write-Off Ditolak Kepala TU',
    message: payload.approved
      ? `Pengajuan ${serializedRequest.requestNo} untuk invoice ${
          serializedRequest.invoice?.invoiceNo || '-'
        } disetujui Kepala TU dan diteruskan ke Kepala Sekolah.`
      : `Pengajuan ${serializedRequest.requestNo} untuk invoice ${
          serializedRequest.invoice?.invoiceNo || '-'
        } ditolak oleh Kepala TU.`,
    type: payload.approved ? 'FINANCE_WRITE_OFF_HEAD_TU_APPROVED' : 'FINANCE_WRITE_OFF_HEAD_TU_REJECTED',
    data: {
      requestId: serializedRequest.id,
      requestNo: serializedRequest.requestNo,
      invoiceId: serializedRequest.invoiceId,
      invoiceNo: serializedRequest.invoice?.invoiceNo || null,
      studentId: serializedRequest.studentId,
      studentName: serializedRequest.student?.name || null,
      requestedAmount: serializedRequest.requestedAmount,
      approvedAmount: serializedRequest.approvedAmount,
      note: payload.note?.trim() || null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_WRITE_OFF_HEAD_TU_DECISION',
      serializedRequest.id,
      before,
      serializedRequest,
      payload.approved ? 'Persetujuan write-off oleh Kepala TU' : 'Penolakan write-off oleh Kepala TU',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat keputusan write-off Head TU', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { request: serializedRequest },
      payload.approved ? 'Write-off diteruskan ke persetujuan Kepala Sekolah' : 'Write-off ditolak Kepala TU',
    ),
  );
});

export const decideFinanceWriteOffAsPrincipal = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinancePrincipalActor((req as any).user || {});

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError(400, 'ID pengajuan write-off tidak valid');
  }

  const payload = decideFinanceWriteOffSchema.parse(req.body || {});

  const before = await prisma.financeWriteOffRequest.findUnique({
    where: { id: requestId },
    include: financeWriteOffRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Pengajuan write-off tidak ditemukan');
  }

  if (before.status !== FinanceWriteOffStatus.PENDING_PRINCIPAL) {
    throw new ApiError(400, 'Pengajuan write-off ini tidak sedang menunggu persetujuan Kepala Sekolah');
  }

  const invoiceBalanceAmount = Number(before.invoice?.balanceAmount || 0);
  const approvedAmount = payload.approved
    ? normalizeFinanceAmount(Number(payload.approvedAmount || before.approvedAmount || before.requestedAmount || 0))
    : null;

  if (payload.approved && approvedAmount != null && approvedAmount > invoiceBalanceAmount) {
    throw new ApiError(400, 'Nominal persetujuan melebihi outstanding invoice saat ini');
  }

  const updated = await prisma.financeWriteOffRequest.update({
    where: { id: requestId },
    data: {
      status: payload.approved ? FinanceWriteOffStatus.APPROVED : FinanceWriteOffStatus.REJECTED,
      approvedAmount: payload.approved ? approvedAmount : before.approvedAmount,
      principalApproved: payload.approved,
      principalDecisionById: actor.id,
      principalDecisionAt: new Date(),
      principalDecisionNote: payload.note?.trim() || null,
    },
    include: financeWriteOffRecordInclude,
  });

  const serializedRequest = serializeFinanceWriteOffRecord(updated);

  await createFinanceInternalNotifications({
    scopes: ['FINANCE', 'HEAD_TU'],
    title: payload.approved ? 'Write-Off Disetujui Kepala Sekolah' : 'Write-Off Ditolak Kepala Sekolah',
    message: payload.approved
      ? `Pengajuan ${serializedRequest.requestNo} disetujui Kepala Sekolah dengan nominal Rp${Math.round(
          Number(serializedRequest.approvedAmount || 0),
        ).toLocaleString('id-ID')} dan siap diterapkan oleh bendahara.`
      : `Pengajuan ${serializedRequest.requestNo} ditolak oleh Kepala Sekolah.`,
    type: payload.approved ? 'FINANCE_WRITE_OFF_PRINCIPAL_APPROVED' : 'FINANCE_WRITE_OFF_PRINCIPAL_REJECTED',
    data: {
      requestId: serializedRequest.id,
      requestNo: serializedRequest.requestNo,
      invoiceId: serializedRequest.invoiceId,
      invoiceNo: serializedRequest.invoice?.invoiceNo || null,
      studentId: serializedRequest.studentId,
      studentName: serializedRequest.student?.name || null,
      requestedAmount: serializedRequest.requestedAmount,
      approvedAmount: serializedRequest.approvedAmount,
      note: payload.note?.trim() || null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_WRITE_OFF_PRINCIPAL_DECISION',
      serializedRequest.id,
      before,
      serializedRequest,
      payload.approved
        ? 'Persetujuan write-off oleh Kepala Sekolah'
        : 'Penolakan write-off oleh Kepala Sekolah',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat keputusan write-off Kepala Sekolah', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { request: serializedRequest },
      payload.approved ? 'Write-off disetujui Kepala Sekolah' : 'Write-off ditolak Kepala Sekolah',
    ),
  );
});

export const applyFinanceWriteOff = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError(400, 'ID pengajuan write-off tidak valid');
  }

  const payload = applyFinanceWriteOffSchema.parse(req.body || {});

  const before = await prisma.financeWriteOffRequest.findUnique({
    where: { id: requestId },
    include: financeWriteOffRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Pengajuan write-off tidak ditemukan');
  }

  if (before.status !== FinanceWriteOffStatus.APPROVED) {
    throw new ApiError(400, 'Pengajuan write-off ini belum siap diterapkan');
  }

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.financeInvoice.findUnique({
      where: { id: before.invoiceId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                lateFeeEnabled: true,
                lateFeeMode: true,
                lateFeeAmount: true,
                lateFeeGraceDays: true,
                lateFeeCapAmount: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
        writeOffRequests: {
          include: financeWriteOffRecordInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!invoice) {
      throw new ApiError(404, 'Tagihan tidak ditemukan');
    }

    if (invoice.status === 'CANCELLED') {
      throw new ApiError(400, 'Tagihan yang dibatalkan tidak dapat diterapkan write-off');
    }

    const currentWrittenOffAmount = inferFinanceWrittenOffAmount({
      totalAmount: Number(invoice.totalAmount || 0),
      paidAmount: Number(invoice.paidAmount || 0),
      balanceAmount: Number(invoice.balanceAmount || 0),
      writtenOffAmount: invoice.writtenOffAmount,
      status: invoice.status,
    });
    const baseApprovedAmount = normalizeFinanceAmount(
      Number(before.approvedAmount || before.requestedAmount || 0),
    );
    const maxApplicableAmount = normalizeFinanceAmount(
      Math.min(baseApprovedAmount, Number(invoice.balanceAmount || 0)),
    );

    if (maxApplicableAmount <= 0) {
      throw new ApiError(400, 'Outstanding invoice sudah tidak tersedia untuk diterapkan write-off');
    }

    const applyAmount = normalizeFinanceAmount(Number(payload.amount || maxApplicableAmount));
    if (applyAmount > maxApplicableAmount) {
      throw new ApiError(400, 'Nominal apply write-off melebihi outstanding yang dapat diproses');
    }

    const nextWrittenOffAmount = normalizeFinanceAmount(currentWrittenOffAmount + applyAmount);
    const nextBalanceAmount = calculateFinanceInvoiceBalanceAmount({
      totalAmount: Number(invoice.totalAmount || 0),
      paidAmount: Number(invoice.paidAmount || 0),
      writtenOffAmount: nextWrittenOffAmount,
      status: invoice.status,
    });
    const nextStatus = calculateFinanceInvoiceStatus({
      balanceAmount: nextBalanceAmount,
      paidAmount: Number(invoice.paidAmount || 0),
      writtenOffAmount: nextWrittenOffAmount,
      currentStatus: invoice.status,
    });
    const nextDueDate = resolveFinanceInvoiceDueDate({
      invoiceTotalAmount: Number(invoice.totalAmount || 0),
      invoicePaidAmount: Number(invoice.paidAmount || 0),
      invoiceBalanceAmount: nextBalanceAmount,
      invoiceStatus: nextStatus,
      invoiceWrittenOffAmount: nextWrittenOffAmount,
      invoiceDueDate: invoice.dueDate || null,
      installments: invoice.installments,
    });

    const updatedInvoice = await tx.financeInvoice.update({
      where: { id: invoice.id },
      data: {
        writtenOffAmount: nextWrittenOffAmount,
        balanceAmount: nextBalanceAmount,
        status: nextStatus,
        dueDate: nextDueDate,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                lateFeeEnabled: true,
                lateFeeMode: true,
                lateFeeAmount: true,
                lateFeeGraceDays: true,
                lateFeeCapAmount: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
        writeOffRequests: {
          include: financeWriteOffRecordInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    const updatedRequest = await tx.financeWriteOffRequest.update({
      where: { id: before.id },
      data: {
        status: FinanceWriteOffStatus.APPLIED,
        appliedAmount: applyAmount,
        appliedById: actor.id,
        appliedAt: new Date(),
        applyNote: payload.note?.trim() || null,
      },
      include: financeWriteOffRecordInclude,
    });

    return {
      request: updatedRequest,
      invoice: updatedInvoice,
      appliedAmount: applyAmount,
      previousWrittenOffAmount: currentWrittenOffAmount,
    };
  });

  const serializedRequest = serializeFinanceWriteOffRecord(result.request);
  const serializedInvoice = serializeFinanceInvoiceRecord(result.invoice);

  await Promise.all([
    createFinanceInternalNotifications({
      scopes: ['HEAD_TU', 'PRINCIPAL'],
      title: 'Write-Off Sudah Diterapkan',
      message: `Pengajuan ${serializedRequest.requestNo} sudah diterapkan ke invoice ${
        serializedRequest.invoice?.invoiceNo || '-'
      } sebesar Rp${Math.round(result.appliedAmount).toLocaleString('id-ID')}.`,
      type: 'FINANCE_WRITE_OFF_APPLIED',
      data: {
        requestId: serializedRequest.id,
        requestNo: serializedRequest.requestNo,
        invoiceId: serializedRequest.invoiceId,
        invoiceNo: serializedRequest.invoice?.invoiceNo || null,
        studentId: serializedRequest.studentId,
        studentName: serializedRequest.student?.name || null,
        appliedAmount: result.appliedAmount,
        remainingBalance: serializedInvoice.balanceAmount,
      },
    }),
    createFinanceNotifications({
      studentId: serializedRequest.studentId,
      title: 'Penyesuaian Tagihan Diterapkan',
      message: `Penyesuaian write-off sebesar Rp${Math.round(result.appliedAmount).toLocaleString(
        'id-ID',
      )} diterapkan ke invoice ${serializedRequest.invoice?.invoiceNo || '-'}. Sisa tagihan sekarang Rp${Math.round(
        serializedInvoice.balanceAmount,
      ).toLocaleString('id-ID')}.`,
      type: 'FINANCE_WRITE_OFF_APPLIED',
      data: {
        requestId: serializedRequest.id,
        requestNo: serializedRequest.requestNo,
        invoiceId: serializedRequest.invoiceId,
        invoiceNo: serializedRequest.invoice?.invoiceNo || null,
        appliedAmount: result.appliedAmount,
        remainingBalance: serializedInvoice.balanceAmount,
      },
    }),
  ]);

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_WRITE_OFF_APPLY',
      serializedRequest.id,
      before,
      {
        request: serializedRequest,
        invoice: {
          id: serializedInvoice.id,
          invoiceNo: serializedInvoice.invoiceNo,
          writtenOffAmount: serializedInvoice.writtenOffAmount,
          balanceAmount: serializedInvoice.balanceAmount,
          status: serializedInvoice.status,
        },
      },
      'Penerapan write-off ke invoice siswa',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat penerapan write-off finance', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        request: serializedRequest,
        invoice: serializedInvoice,
      },
      'Write-off berhasil diterapkan ke invoice',
    ),
  );
});

export const listFinancePaymentReversals = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinancePaymentReversalViewer((req as any).user || {});

  const { paymentId, invoiceId, studentId, status, pendingFor, search, limit } =
    listFinancePaymentReversalsQuerySchema.parse(req.query);
  const normalizedSearch = search?.trim();

  const statusWhere =
    status != null
      ? { status }
      : pendingFor === 'HEAD_TU'
        ? { status: FinancePaymentReversalStatus.PENDING_HEAD_TU }
        : pendingFor === 'PRINCIPAL'
          ? { status: FinancePaymentReversalStatus.PENDING_PRINCIPAL }
          : pendingFor === 'FINANCE_APPLY'
            ? { status: FinancePaymentReversalStatus.APPROVED }
            : {};

  const where: Prisma.FinancePaymentReversalRequestWhereInput = {
    ...(paymentId ? { paymentId } : {}),
    ...(invoiceId ? { invoiceId } : {}),
    ...(studentId ? { studentId } : {}),
    ...statusWhere,
    ...(normalizedSearch
      ? {
          OR: [
            { requestNo: { contains: normalizedSearch, mode: 'insensitive' } },
            { reason: { contains: normalizedSearch, mode: 'insensitive' } },
            { payment: { paymentNo: { contains: normalizedSearch, mode: 'insensitive' } } },
            { invoice: { invoiceNo: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { username: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { nis: { contains: normalizedSearch, mode: 'insensitive' } } },
            { student: { nisn: { contains: normalizedSearch, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [requests, groupedSummary] = await Promise.all([
    prisma.financePaymentReversalRequest.findMany({
      where,
      include: financePaymentReversalRecordInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.financePaymentReversalRequest.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: {
        requestedAmount: true,
        approvedAmount: true,
        appliedAmount: true,
      },
    }),
  ]);

  const summary = groupedSummary.reduce(
    (acc, row) => {
      acc.totalRequests += row._count._all;
      acc.totalRequestedAmount += Number(row._sum.requestedAmount || 0);
      acc.totalApprovedAmount += Number(row._sum.approvedAmount || 0);
      acc.totalAppliedAmount += Number(row._sum.appliedAmount || 0);

      if (row.status === FinancePaymentReversalStatus.PENDING_HEAD_TU) acc.pendingHeadTuCount += row._count._all;
      if (row.status === FinancePaymentReversalStatus.PENDING_PRINCIPAL) acc.pendingPrincipalCount += row._count._all;
      if (row.status === FinancePaymentReversalStatus.APPROVED) acc.approvedCount += row._count._all;
      if (row.status === FinancePaymentReversalStatus.REJECTED) acc.rejectedCount += row._count._all;
      if (row.status === FinancePaymentReversalStatus.APPLIED) acc.appliedCount += row._count._all;

      return acc;
    },
    {
      totalRequests: 0,
      pendingHeadTuCount: 0,
      pendingPrincipalCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      appliedCount: 0,
      totalRequestedAmount: 0,
      totalApprovedAmount: 0,
      totalAppliedAmount: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: {
          ...summary,
          totalRequestedAmount: normalizeFinanceAmount(summary.totalRequestedAmount),
          totalApprovedAmount: normalizeFinanceAmount(summary.totalApprovedAmount),
          totalAppliedAmount: normalizeFinanceAmount(summary.totalAppliedAmount),
        },
        requests: requests.map((request) => serializeFinancePaymentReversalRecord(request)),
      },
      'Daftar reversal pembayaran berhasil diambil',
    ),
  );
});

export const createFinancePaymentReversalRequest = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new ApiError(400, 'ID pembayaran tidak valid');
  }

  const payload = createFinancePaymentReversalSchema.parse(req.body || {});

  const result = await prisma.$transaction(async (tx) => {
    const [payment, activeRequest] = await Promise.all([
      tx.financePayment.findUnique({
        where: { id: paymentId },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              periodKey: true,
              semester: true,
              title: true,
              dueDate: true,
              totalAmount: true,
              paidAmount: true,
              writtenOffAmount: true,
              balanceAmount: true,
              status: true,
            },
          },
          student: {
            select: {
              id: true,
              name: true,
              username: true,
              nis: true,
              nisn: true,
              studentClass: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                },
              },
            },
          },
        },
      }),
      tx.financePaymentReversalRequest.findFirst({
        where: {
          paymentId,
          status: {
            in: [
              FinancePaymentReversalStatus.PENDING_HEAD_TU,
              FinancePaymentReversalStatus.PENDING_PRINCIPAL,
              FinancePaymentReversalStatus.APPROVED,
            ],
          },
        },
        select: {
          id: true,
          requestNo: true,
        },
      }),
    ]);

    if (!payment) {
      throw new ApiError(404, 'Pembayaran tidak ditemukan');
    }

    if (payment.source !== FinancePaymentSource.DIRECT) {
      throw new ApiError(400, 'Reversal hanya tersedia untuk pembayaran langsung');
    }

    if (payment.invoice.status === FinanceInvoiceStatus.CANCELLED) {
      throw new ApiError(400, 'Invoice yang dibatalkan tidak dapat diajukan reversal');
    }

    if (activeRequest) {
      throw new ApiError(
        400,
        `Masih ada pengajuan reversal aktif (${activeRequest.requestNo}) untuk pembayaran ini`,
      );
    }

    const availability = resolveFinancePaymentReversalAvailability(payment);
    if (availability.remainingReversibleAmount <= 0) {
      throw new ApiError(400, 'Pembayaran ini sudah tidak memiliki nominal yang bisa direversal');
    }

    const requestedAmount = normalizeFinanceAmount(Number(payload.amount || 0));
    if (requestedAmount > availability.remainingReversibleAmount) {
      throw new ApiError(
        400,
        `Nominal reversal melebihi sisa pembayaran yang dapat direversal (maksimal Rp${Math.round(
          availability.remainingReversibleAmount,
        ).toLocaleString('id-ID')})`,
      );
    }

    const requestedCreditedAmount = normalizeFinanceAmount(
      Math.min(requestedAmount, availability.remainingCreditedAmount),
    );
    const requestedAllocatedAmount = normalizeFinanceAmount(
      Math.max(requestedAmount - requestedCreditedAmount, 0),
    );

    if (requestedAllocatedAmount > Number(payment.invoice.paidAmount || 0)) {
      throw new ApiError(400, 'Alokasi pembayaran aktif di invoice tidak cukup untuk direversal');
    }

    const request = await tx.financePaymentReversalRequest.create({
      data: {
        requestNo: makeFinancePaymentReversalNo(payment.studentId),
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        studentId: payment.studentId,
        requestedAmount,
        requestedAllocatedAmount,
        requestedCreditedAmount,
        reason: payload.reason.trim(),
        requestedNote: payload.note?.trim() || null,
        requestedById: actor.id,
      },
      include: financePaymentReversalRecordInclude,
    });

    return request;
  });

  const serializedRequest = serializeFinancePaymentReversalRecord(result);

  await createFinanceInternalNotifications({
    scopes: ['HEAD_TU'],
    title: 'Pengajuan Reversal Pembayaran Baru',
    message: `Pembayaran ${serializedRequest.payment?.paymentNo || '-'} untuk ${
      serializedRequest.student?.name || 'siswa'
    } diajukan reversal sebesar Rp${Math.round(serializedRequest.requestedAmount).toLocaleString('id-ID')}.`,
    type: 'FINANCE_PAYMENT_REVERSAL_REQUESTED',
    data: {
      requestId: serializedRequest.id,
      requestNo: serializedRequest.requestNo,
      paymentId: serializedRequest.paymentId,
      paymentNo: serializedRequest.payment?.paymentNo || null,
      invoiceId: serializedRequest.invoiceId,
      invoiceNo: serializedRequest.invoice?.invoiceNo || null,
      studentId: serializedRequest.studentId,
      studentName: serializedRequest.student?.name || null,
      requestedAmount: serializedRequest.requestedAmount,
      requestedAllocatedAmount: serializedRequest.requestedAllocatedAmount,
      requestedCreditedAmount: serializedRequest.requestedCreditedAmount,
      reason: serializedRequest.reason,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'CREATE',
      'FINANCE_PAYMENT_REVERSAL_REQUEST',
      serializedRequest.id,
      null,
      {
        requestNo: serializedRequest.requestNo,
        paymentId: serializedRequest.paymentId,
        paymentNo: serializedRequest.payment?.paymentNo || null,
        invoiceId: serializedRequest.invoiceId,
        invoiceNo: serializedRequest.invoice?.invoiceNo || null,
        studentId: serializedRequest.studentId,
        requestedAmount: serializedRequest.requestedAmount,
        requestedAllocatedAmount: serializedRequest.requestedAllocatedAmount,
        requestedCreditedAmount: serializedRequest.requestedCreditedAmount,
        reason: serializedRequest.reason,
      },
      'Pengajuan reversal pembayaran siswa',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat pengajuan reversal pembayaran finance', auditError);
  }

  res.status(201).json(
    new ApiResponse(201, { request: serializedRequest }, 'Pengajuan reversal pembayaran berhasil dibuat'),
  );
});

export const decideFinancePaymentReversalAsHeadTu = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceHeadTuActor((req as any).user || {});

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError(400, 'ID pengajuan reversal tidak valid');
  }

  const payload = decideFinancePaymentReversalSchema.parse(req.body || {});

  const before = await prisma.financePaymentReversalRequest.findUnique({
    where: { id: requestId },
    include: financePaymentReversalRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Pengajuan reversal pembayaran tidak ditemukan');
  }

  if (before.status !== FinancePaymentReversalStatus.PENDING_HEAD_TU) {
    throw new ApiError(400, 'Pengajuan reversal ini tidak sedang menunggu persetujuan Kepala TU');
  }

  const paymentRemainingAmount = before.payment
    ? resolveFinancePaymentReversalAvailability(before.payment).remainingReversibleAmount
    : 0;
  if (payload.approved && paymentRemainingAmount < Number(before.requestedAmount || 0)) {
    throw new ApiError(400, 'Sisa pembayaran yang dapat direversal berubah dan tidak lagi mencukupi');
  }

  const updated = await prisma.financePaymentReversalRequest.update({
    where: { id: requestId },
    data: {
      status: payload.approved
        ? FinancePaymentReversalStatus.PENDING_PRINCIPAL
        : FinancePaymentReversalStatus.REJECTED,
      approvedAmount: payload.approved ? before.requestedAmount : null,
      approvedAllocatedAmount: payload.approved ? before.requestedAllocatedAmount : null,
      approvedCreditedAmount: payload.approved ? before.requestedCreditedAmount : null,
      headTuApproved: payload.approved,
      headTuDecisionById: actor.id,
      headTuDecisionAt: new Date(),
      headTuDecisionNote: payload.note?.trim() || null,
    },
    include: financePaymentReversalRecordInclude,
  });

  const serializedRequest = serializeFinancePaymentReversalRecord(updated);

  await createFinanceInternalNotifications({
    scopes: payload.approved ? ['PRINCIPAL', 'FINANCE'] : ['FINANCE'],
    title: payload.approved ? 'Reversal Disetujui Kepala TU' : 'Reversal Ditolak Kepala TU',
    message: payload.approved
      ? `Pengajuan ${serializedRequest.requestNo} untuk pembayaran ${
          serializedRequest.payment?.paymentNo || '-'
        } disetujui Kepala TU dan diteruskan ke Kepala Sekolah.`
      : `Pengajuan ${serializedRequest.requestNo} untuk pembayaran ${
          serializedRequest.payment?.paymentNo || '-'
        } ditolak oleh Kepala TU.`,
    type: payload.approved
      ? 'FINANCE_PAYMENT_REVERSAL_HEAD_TU_APPROVED'
      : 'FINANCE_PAYMENT_REVERSAL_HEAD_TU_REJECTED',
    data: {
      requestId: serializedRequest.id,
      requestNo: serializedRequest.requestNo,
      paymentId: serializedRequest.paymentId,
      paymentNo: serializedRequest.payment?.paymentNo || null,
      invoiceId: serializedRequest.invoiceId,
      invoiceNo: serializedRequest.invoice?.invoiceNo || null,
      studentId: serializedRequest.studentId,
      studentName: serializedRequest.student?.name || null,
      approvedAmount: serializedRequest.approvedAmount,
      note: payload.note?.trim() || null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_PAYMENT_REVERSAL_HEAD_TU_DECISION',
      serializedRequest.id,
      before,
      serializedRequest,
      payload.approved
        ? 'Persetujuan reversal pembayaran oleh Kepala TU'
        : 'Penolakan reversal pembayaran oleh Kepala TU',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat keputusan reversal pembayaran Head TU', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { request: serializedRequest },
      payload.approved
        ? 'Reversal pembayaran diteruskan ke persetujuan Kepala Sekolah'
        : 'Reversal pembayaran ditolak Kepala TU',
    ),
  );
});

export const decideFinancePaymentReversalAsPrincipal = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinancePrincipalActor((req as any).user || {});

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError(400, 'ID pengajuan reversal tidak valid');
  }

  const payload = decideFinancePaymentReversalSchema.parse(req.body || {});

  const before = await prisma.financePaymentReversalRequest.findUnique({
    where: { id: requestId },
    include: financePaymentReversalRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Pengajuan reversal pembayaran tidak ditemukan');
  }

  if (before.status !== FinancePaymentReversalStatus.PENDING_PRINCIPAL) {
    throw new ApiError(400, 'Pengajuan reversal ini tidak sedang menunggu persetujuan Kepala Sekolah');
  }

  const paymentRemainingAmount = before.payment
    ? resolveFinancePaymentReversalAvailability(before.payment).remainingReversibleAmount
    : 0;
  if (payload.approved && paymentRemainingAmount < Number(before.approvedAmount || before.requestedAmount || 0)) {
    throw new ApiError(400, 'Sisa pembayaran yang dapat direversal berubah dan tidak lagi mencukupi');
  }

  const updated = await prisma.financePaymentReversalRequest.update({
    where: { id: requestId },
    data: {
      status: payload.approved ? FinancePaymentReversalStatus.APPROVED : FinancePaymentReversalStatus.REJECTED,
      principalApproved: payload.approved,
      principalDecisionById: actor.id,
      principalDecisionAt: new Date(),
      principalDecisionNote: payload.note?.trim() || null,
    },
    include: financePaymentReversalRecordInclude,
  });

  const serializedRequest = serializeFinancePaymentReversalRecord(updated);

  await createFinanceInternalNotifications({
    scopes: ['FINANCE', 'HEAD_TU'],
    title: payload.approved ? 'Reversal Disetujui Kepala Sekolah' : 'Reversal Ditolak Kepala Sekolah',
    message: payload.approved
      ? `Pengajuan ${serializedRequest.requestNo} disetujui Kepala Sekolah dan siap diterapkan oleh bendahara.`
      : `Pengajuan ${serializedRequest.requestNo} ditolak oleh Kepala Sekolah.`,
    type: payload.approved
      ? 'FINANCE_PAYMENT_REVERSAL_PRINCIPAL_APPROVED'
      : 'FINANCE_PAYMENT_REVERSAL_PRINCIPAL_REJECTED',
    data: {
      requestId: serializedRequest.id,
      requestNo: serializedRequest.requestNo,
      paymentId: serializedRequest.paymentId,
      paymentNo: serializedRequest.payment?.paymentNo || null,
      invoiceId: serializedRequest.invoiceId,
      invoiceNo: serializedRequest.invoice?.invoiceNo || null,
      studentId: serializedRequest.studentId,
      studentName: serializedRequest.student?.name || null,
      approvedAmount: serializedRequest.approvedAmount,
      note: payload.note?.trim() || null,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_PAYMENT_REVERSAL_PRINCIPAL_DECISION',
      serializedRequest.id,
      before,
      serializedRequest,
      payload.approved
        ? 'Persetujuan reversal pembayaran oleh Kepala Sekolah'
        : 'Penolakan reversal pembayaran oleh Kepala Sekolah',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat keputusan reversal pembayaran Kepala Sekolah', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { request: serializedRequest },
      payload.approved
        ? 'Reversal pembayaran disetujui Kepala Sekolah'
        : 'Reversal pembayaran ditolak Kepala Sekolah',
    ),
  );
});

export const applyFinancePaymentReversal = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError(400, 'ID pengajuan reversal tidak valid');
  }

  const payload = applyFinancePaymentReversalSchema.parse(req.body || {});

  const before = await prisma.financePaymentReversalRequest.findUnique({
    where: { id: requestId },
    include: financePaymentReversalRecordInclude,
  });

  if (!before) {
    throw new ApiError(404, 'Pengajuan reversal pembayaran tidak ditemukan');
  }

  if (before.status !== FinancePaymentReversalStatus.APPROVED) {
    throw new ApiError(400, 'Pengajuan reversal pembayaran ini belum siap diterapkan');
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.financePayment.findUnique({
      where: { id: before.paymentId },
      include: {
        invoice: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                username: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                  },
                },
              },
            },
            items: {
              select: {
                id: true,
                componentId: true,
                componentCode: true,
                componentName: true,
                amount: true,
                notes: true,
                component: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    lateFeeEnabled: true,
                    lateFeeMode: true,
                    lateFeeAmount: true,
                    lateFeeGraceDays: true,
                    lateFeeCapAmount: true,
                  },
                },
              },
            },
            payments: {
              select: {
                id: true,
                paymentNo: true,
                amount: true,
                allocatedAmount: true,
                creditedAmount: true,
                reversedAmount: true,
                reversedAllocatedAmount: true,
                reversedCreditedAmount: true,
                source: true,
                method: true,
                referenceNo: true,
                note: true,
                paidAt: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
            },
            installments: {
              select: {
                id: true,
                sequence: true,
                amount: true,
                dueDate: true,
              },
              orderBy: [{ sequence: 'asc' }],
            },
            writeOffRequests: {
              include: financeWriteOffRecordInclude,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            },
          },
        },
      },
    });

    if (!payment) {
      throw new ApiError(404, 'Pembayaran tidak ditemukan');
    }

    if (payment.source !== FinancePaymentSource.DIRECT) {
      throw new ApiError(400, 'Reversal hanya tersedia untuk pembayaran langsung');
    }

    if (payment.invoice.status === FinanceInvoiceStatus.CANCELLED) {
      throw new ApiError(400, 'Invoice yang dibatalkan tidak dapat diterapkan reversal');
    }

    const availability = resolveFinancePaymentReversalAvailability(payment);
    const approvedAmount = normalizeFinanceAmount(
      Number(before.approvedAmount || before.requestedAmount || 0),
    );
    const approvedAllocatedAmount = normalizeFinanceAmount(
      Number(before.approvedAllocatedAmount || before.requestedAllocatedAmount || 0),
    );
    const approvedCreditedAmount = normalizeFinanceAmount(
      Number(before.approvedCreditedAmount || before.requestedCreditedAmount || 0),
    );

    if (approvedAmount <= 0) {
      throw new ApiError(400, 'Nominal reversal yang disetujui tidak valid');
    }

    if (approvedAmount > availability.remainingReversibleAmount) {
      throw new ApiError(400, 'Sisa pembayaran yang dapat direversal sudah berubah');
    }

    if (approvedAllocatedAmount > availability.remainingAllocatedAmount) {
      throw new ApiError(400, 'Alokasi pembayaran yang dapat direversal sudah berubah');
    }

    if (approvedCreditedAmount > availability.remainingCreditedAmount) {
      throw new ApiError(400, 'Porsi saldo kredit dari pembayaran ini sudah tidak tersedia penuh');
    }

    let creditBalanceSnapshot: {
      id: number;
      balanceBefore: number;
      balanceAfter: number;
    } | null = null;

    if (approvedCreditedAmount > 0) {
      const creditBalance = await tx.financeCreditBalance.findUnique({
        where: { studentId: payment.studentId },
        select: {
          id: true,
          balanceAmount: true,
        },
      });

      const balanceBefore = Number(creditBalance?.balanceAmount || 0);
      if (!creditBalance || balanceBefore < approvedCreditedAmount) {
        throw new ApiError(
          400,
          'Saldo kredit siswa sudah terpakai atau direfund, sehingga reversal tidak bisa diterapkan penuh',
        );
      }

      const balanceAfter = normalizeFinanceAmount(Math.max(balanceBefore - approvedCreditedAmount, 0));

      await tx.financeCreditBalance.update({
        where: { id: creditBalance.id },
        data: {
          balanceAmount: balanceAfter,
        },
      });

      await tx.financeCreditTransaction.create({
        data: {
          balanceId: creditBalance.id,
          studentId: payment.studentId,
          paymentId: payment.id,
          kind: FinanceCreditTransactionKind.PAYMENT_REVERSAL,
          amount: approvedCreditedAmount,
          balanceBefore,
          balanceAfter,
          note:
            payload.note?.trim() ||
            `Reversal pembayaran ${payment.paymentNo} mengurangi saldo kredit`,
          createdById: actor.id,
        },
      });

      creditBalanceSnapshot = {
        id: creditBalance.id,
        balanceBefore,
        balanceAfter,
      };
    }

    const nextPayment = await tx.financePayment.update({
      where: { id: payment.id },
      data: {
        reversedAmount: normalizeFinanceAmount(Number(payment.reversedAmount || 0) + approvedAmount),
        reversedAllocatedAmount: normalizeFinanceAmount(
          Number(payment.reversedAllocatedAmount || 0) + approvedAllocatedAmount,
        ),
        reversedCreditedAmount: normalizeFinanceAmount(
          Number(payment.reversedCreditedAmount || 0) + approvedCreditedAmount,
        ),
      },
      select: {
        id: true,
        paymentNo: true,
        amount: true,
        allocatedAmount: true,
        creditedAmount: true,
        reversedAmount: true,
        reversedAllocatedAmount: true,
        reversedCreditedAmount: true,
        source: true,
        method: true,
        referenceNo: true,
        note: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            periodKey: true,
            semester: true,
          },
        },
      },
    });

    const currentWrittenOffAmount = inferFinanceWrittenOffAmount({
      totalAmount: Number(payment.invoice.totalAmount || 0),
      paidAmount: Number(payment.invoice.paidAmount || 0),
      balanceAmount: Number(payment.invoice.balanceAmount || 0),
      writtenOffAmount: payment.invoice.writtenOffAmount,
      status: payment.invoice.status,
    });
    const nextPaidAmount = normalizeFinanceAmount(
      Math.max(Number(payment.invoice.paidAmount || 0) - approvedAllocatedAmount, 0),
    );
    const nextBalanceAmount = calculateFinanceInvoiceBalanceAmount({
      totalAmount: Number(payment.invoice.totalAmount || 0),
      paidAmount: nextPaidAmount,
      writtenOffAmount: currentWrittenOffAmount,
      status: payment.invoice.status,
    });
    const nextStatus = calculateFinanceInvoiceStatus({
      balanceAmount: nextBalanceAmount,
      paidAmount: nextPaidAmount,
      writtenOffAmount: currentWrittenOffAmount,
      currentStatus: payment.invoice.status,
    });
    const nextDueDate = resolveFinanceInvoiceDueDate({
      invoiceTotalAmount: Number(payment.invoice.totalAmount || 0),
      invoicePaidAmount: nextPaidAmount,
      invoiceBalanceAmount: nextBalanceAmount,
      invoiceStatus: nextStatus,
      invoiceWrittenOffAmount: currentWrittenOffAmount,
      invoiceDueDate: payment.invoice.dueDate || null,
      installments: payment.invoice.installments,
    });

    const updatedInvoice = await tx.financeInvoice.update({
      where: { id: payment.invoice.id },
      data: {
        paidAmount: nextPaidAmount,
        balanceAmount: nextBalanceAmount,
        status: nextStatus,
        dueDate: nextDueDate,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            username: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                id: true,
                name: true,
                level: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            notes: true,
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                lateFeeEnabled: true,
                lateFeeMode: true,
                lateFeeAmount: true,
                lateFeeGraceDays: true,
                lateFeeCapAmount: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
        writeOffRequests: {
          include: financeWriteOffRecordInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    const updatedRequest = await tx.financePaymentReversalRequest.update({
      where: { id: before.id },
      data: {
        status: FinancePaymentReversalStatus.APPLIED,
        appliedAmount: approvedAmount,
        appliedAllocatedAmount: approvedAllocatedAmount,
        appliedCreditedAmount: approvedCreditedAmount,
        appliedById: actor.id,
        appliedAt: new Date(),
        applyNote: payload.note?.trim() || null,
      },
      include: financePaymentReversalRecordInclude,
    });

    return {
      request: updatedRequest,
      payment: nextPayment,
      invoice: updatedInvoice,
      creditBalance: creditBalanceSnapshot,
      appliedAmount: approvedAmount,
      appliedAllocatedAmount: approvedAllocatedAmount,
      appliedCreditedAmount: approvedCreditedAmount,
    };
  });

  const serializedRequest = serializeFinancePaymentReversalRecord(result.request);
  const serializedPayment = serializeFinancePaymentRecord(result.payment);
  const serializedInvoice = serializeFinanceInvoiceRecord(result.invoice);

  await Promise.all([
    createFinanceInternalNotifications({
      scopes: ['HEAD_TU', 'PRINCIPAL'],
      title: 'Reversal Pembayaran Sudah Diterapkan',
      message: `Pengajuan ${serializedRequest.requestNo} sudah diterapkan ke pembayaran ${
        serializedRequest.payment?.paymentNo || '-'
      } sebesar Rp${Math.round(result.appliedAmount).toLocaleString('id-ID')}.`,
      type: 'FINANCE_PAYMENT_REVERSAL_APPLIED',
      data: {
        requestId: serializedRequest.id,
        requestNo: serializedRequest.requestNo,
        paymentId: serializedRequest.paymentId,
        paymentNo: serializedRequest.payment?.paymentNo || null,
        invoiceId: serializedRequest.invoiceId,
        invoiceNo: serializedRequest.invoice?.invoiceNo || null,
        studentId: serializedRequest.studentId,
        studentName: serializedRequest.student?.name || null,
        appliedAmount: result.appliedAmount,
        appliedAllocatedAmount: result.appliedAllocatedAmount,
        appliedCreditedAmount: result.appliedCreditedAmount,
        remainingBalance: serializedInvoice.balanceAmount,
      },
    }),
    createFinanceNotifications({
      studentId: serializedRequest.studentId,
      title: 'Penyesuaian Pembayaran Diterapkan',
      message: `Pembayaran ${serializedRequest.payment?.paymentNo || '-'} sebesar Rp${Math.round(
        result.appliedAmount,
      ).toLocaleString('id-ID')} direversal. Sisa tagihan invoice ${
        serializedRequest.invoice?.invoiceNo || '-'
      } sekarang Rp${Math.round(serializedInvoice.balanceAmount).toLocaleString('id-ID')}.`,
      type: 'FINANCE_PAYMENT_REVERSAL_APPLIED',
      data: {
        requestId: serializedRequest.id,
        requestNo: serializedRequest.requestNo,
        paymentId: serializedRequest.paymentId,
        paymentNo: serializedRequest.payment?.paymentNo || null,
        invoiceId: serializedRequest.invoiceId,
        invoiceNo: serializedRequest.invoice?.invoiceNo || null,
        appliedAmount: result.appliedAmount,
        appliedAllocatedAmount: result.appliedAllocatedAmount,
        appliedCreditedAmount: result.appliedCreditedAmount,
        remainingBalance: serializedInvoice.balanceAmount,
        creditBalanceAmount: Number(result.creditBalance?.balanceAfter || 0),
      },
    }),
  ]);

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      actor.additionalDuties,
      'UPDATE',
      'FINANCE_PAYMENT_REVERSAL_APPLY',
      serializedRequest.id,
      before,
      {
        request: serializedRequest,
        payment: serializedPayment,
        invoice: {
          id: serializedInvoice.id,
          invoiceNo: serializedInvoice.invoiceNo,
          paidAmount: serializedInvoice.paidAmount,
          balanceAmount: serializedInvoice.balanceAmount,
          status: serializedInvoice.status,
        },
        creditBalance: result.creditBalance,
      },
      'Penerapan reversal pembayaran siswa',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat penerapan reversal pembayaran finance', auditError);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        request: serializedRequest,
        payment: serializedPayment,
        invoice: serializedInvoice,
      },
      'Reversal pembayaran berhasil diterapkan',
    ),
  );
});

type FinancePortalInvoiceRecord = {
  id: number;
  invoiceNo: string;
  title: string | null;
  periodKey: string;
  semester: Semester;
  dueDate: Date | null;
  status: FinanceInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  writtenOffAmount?: number | null;
  balanceAmount: number;
  items: Array<{
    componentId?: number | null;
    componentCode?: string | null;
    componentName?: string | null;
    amount: number;
    component: {
      id?: number | null;
      code: string;
      name: string;
      periodicity: FinanceComponentPeriodicity;
      lateFeeEnabled?: boolean | null;
      lateFeeMode?: FinanceLateFeeMode | null;
      lateFeeAmount?: number | null;
      lateFeeGraceDays?: number | null;
      lateFeeCapAmount?: number | null;
    } | null;
  }>;
  installments: Array<{
    id: number;
    sequence: number;
    amount: number;
    dueDate: Date | null;
  }>;
  payments: Array<{
    id: number;
    paymentNo: string;
    amount: number;
    allocatedAmount: number;
    creditedAmount: number;
    reversedAmount?: number | null;
    reversedAllocatedAmount?: number | null;
    reversedCreditedAmount?: number | null;
    source: FinancePaymentSource;
    method: FinancePaymentMethod;
    referenceNo: string | null;
    note?: string | null;
    paidAt: Date;
    createdAt: Date;
    updatedAt: Date;
    invoice: {
      id: number;
      invoiceNo: string;
      periodKey: string;
      semester: Semester;
    } | null;
  }>;
};

function buildFinancePortalOverview(financeInvoices: FinancePortalInvoiceRecord[], limit: number) {
  const statusSummary = createStatusSummary();
  const typeSummary = createTypeSummary();
  let totalAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const financePayments = financeInvoices
    .flatMap((invoice) => {
      const monthlyAmount = invoice.items.reduce(
        (sum, item) =>
          item.component?.periodicity === 'MONTHLY' ? sum + Number(item.amount || 0) : sum,
        0,
      );
      const oneTimeAmount = Math.max(Number(invoice.totalAmount || 0) - monthlyAmount, 0);
      const invoiceType: PaymentType = monthlyAmount >= oneTimeAmount ? 'MONTHLY' : 'ONE_TIME';
      const paymentStatus: PaymentStatus =
        invoice.status === 'PAID' ? 'PAID' : invoice.status === 'CANCELLED' ? 'CANCELLED' : 'PARTIAL';

      return invoice.payments.map((payment) => ({
        ...serializeFinancePaymentRecord(payment),
        status: paymentStatus,
        type: invoiceType,
      }));
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit);

  const invoiceRows = financeInvoices.slice(0, limit).map((invoice) => {
    const serializedInvoice = serializeFinanceInvoiceRecord(invoice, { asOfDate: today });
    const dueDate = serializedInvoice.dueDate ? new Date(serializedInvoice.dueDate) : null;
    if (dueDate) {
      dueDate.setHours(0, 0, 0, 0);
    }

    const isOverdue =
      !!dueDate &&
      dueDate < today &&
      serializedInvoice.balanceAmount > 0 &&
      serializedInvoice.status !== 'PAID' &&
      serializedInvoice.status !== 'CANCELLED';
    const daysPastDue =
      dueDate && isOverdue
        ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000))
        : 0;

    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      title: invoice.title,
      periodKey: invoice.periodKey,
      semester: invoice.semester,
      dueDate: invoice.dueDate,
      status: invoice.status,
      totalAmount: serializedInvoice.totalAmount,
      paidAmount: serializedInvoice.paidAmount,
      writtenOffAmount: serializedInvoice.writtenOffAmount,
      balanceAmount: serializedInvoice.balanceAmount,
      isOverdue,
      daysPastDue,
      items: invoice.items.map((item) => ({
        componentCode: item.component?.code || item.componentCode || null,
        componentName: item.component?.name || item.componentName || 'Komponen',
        amount: Number(item.amount || 0),
        periodicity: item.component?.periodicity || null,
      })),
      lateFeeSummary: serializedInvoice.lateFeeSummary,
      installmentSummary: serializedInvoice.installmentSummary,
      installments: serializedInvoice.installments,
    };
  });

  for (const invoice of financeInvoices) {
    const invoiceTotal = Number(invoice.totalAmount || 0);
    const invoicePaid = Number(invoice.paidAmount || 0);
    const invoiceBalance = Number(invoice.balanceAmount || 0);
    totalAmount += invoiceTotal;

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (dueDate) {
      dueDate.setHours(0, 0, 0, 0);
    }

    if (
      dueDate &&
      dueDate < today &&
      invoiceBalance > 0 &&
      invoice.status !== 'PAID' &&
      invoice.status !== 'CANCELLED'
    ) {
      overdueCount += 1;
      overdueAmount += invoiceBalance;
    }

    if (invoice.status === 'UNPAID') {
      statusSummary.PENDING.count += 1;
      statusSummary.PENDING.amount += invoiceBalance;
    } else if (invoice.status === 'PARTIAL') {
      statusSummary.PARTIAL.count += 1;
      statusSummary.PARTIAL.amount += invoiceBalance;
      statusSummary.PAID.amount += invoicePaid;
    } else if (invoice.status === 'PAID') {
      statusSummary.PAID.count += 1;
      statusSummary.PAID.amount += invoicePaid;
    } else if (invoice.status === 'CANCELLED') {
      statusSummary.CANCELLED.count += 1;
      statusSummary.CANCELLED.amount += invoiceTotal;
    }

    for (const item of invoice.items) {
      const amount = Number(item.amount || 0);
      if (item.component?.periodicity === 'MONTHLY') {
        typeSummary.MONTHLY.count += 1;
        typeSummary.MONTHLY.amount += amount;
      } else {
        typeSummary.ONE_TIME.count += 1;
        typeSummary.ONE_TIME.amount += amount;
      }
    }
  }

  return {
    summary: {
      totalRecords: financeInvoices.length,
      totalAmount,
      overdueCount,
      overdueAmount,
      status: {
        pendingCount: statusSummary.PENDING.count,
        pendingAmount: statusSummary.PENDING.amount,
        paidCount: statusSummary.PAID.count,
        paidAmount: statusSummary.PAID.amount,
        partialCount: statusSummary.PARTIAL.count,
        partialAmount: statusSummary.PARTIAL.amount,
        cancelledCount: statusSummary.CANCELLED.count,
        cancelledAmount: statusSummary.CANCELLED.amount,
      },
      type: {
        monthlyCount: typeSummary.MONTHLY.count,
        monthlyAmount: typeSummary.MONTHLY.amount,
        oneTimeCount: typeSummary.ONE_TIME.count,
        oneTimeAmount: typeSummary.ONE_TIME.amount,
      },
    },
    invoices: invoiceRows,
    payments: financePayments,
  };
}

export const listParentPayments = asyncHandler(async (req: Request, res: Response) => {
  const { studentId, student_id, limit } = listParentPaymentsQuerySchema.parse(req.query);
  const requestedStudentId = studentId ?? student_id ?? null;
  const authUser = (req as any).user;

  const parent = await prisma.user.findUnique({
    where: { id: Number(authUser.id) },
    select: {
      id: true,
      name: true,
      username: true,
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              major: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Data orang tua tidak ditemukan');
  }

  let targetChildren = parent.children;

  if (requestedStudentId != null) {
    const selectedChild = targetChildren.find((item) => item.id === Number(requestedStudentId));
    if (!selectedChild) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke data keuangan siswa ini');
    }
    targetChildren = [selectedChild];
  }

  const childrenOverview = await Promise.all(
    targetChildren.map(async (child) => {
      const [financeInvoices, creditBalance] = await Promise.all([
        prisma.financeInvoice.findMany({
          where: { studentId: child.id },
          include: {
            items: {
              select: {
                componentId: true,
                componentCode: true,
                componentName: true,
                amount: true,
                component: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    periodicity: true,
                    lateFeeEnabled: true,
                    lateFeeMode: true,
                    lateFeeAmount: true,
                    lateFeeGraceDays: true,
                    lateFeeCapAmount: true,
                  },
                },
              },
            },
            payments: {
              select: {
                id: true,
                paymentNo: true,
                amount: true,
                allocatedAmount: true,
                creditedAmount: true,
                reversedAmount: true,
                reversedAllocatedAmount: true,
                reversedCreditedAmount: true,
                source: true,
                method: true,
                referenceNo: true,
                note: true,
                paidAt: true,
                createdAt: true,
                updatedAt: true,
                invoice: {
                  select: {
                    id: true,
                    invoiceNo: true,
                    periodKey: true,
                    semester: true,
                  },
                },
              },
              orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
            },
            installments: {
              select: {
                id: true,
                sequence: true,
                amount: true,
                dueDate: true,
              },
              orderBy: [{ sequence: 'asc' }],
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.financeCreditBalance.findUnique({
          where: { studentId: child.id },
          select: {
            balanceAmount: true,
            updatedAt: true,
            refunds: {
              take: 3,
              orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
              select: {
                id: true,
                refundNo: true,
                amount: true,
                method: true,
                refundedAt: true,
                referenceNo: true,
                note: true,
                createdAt: true,
              },
            },
          },
        }),
      ]);

      // Prefer dynamic invoice engine when available.
      if (financeInvoices.length > 0) {
        const dynamicOverview = buildFinancePortalOverview(
          financeInvoices as FinancePortalInvoiceRecord[],
          limit,
        );

        return {
          student: child,
          summary: {
            ...dynamicOverview.summary,
            creditBalance: Number(creditBalance?.balanceAmount || 0),
          },
          invoices: dynamicOverview.invoices,
          payments: dynamicOverview.payments,
          creditBalance: {
            balanceAmount: Number(creditBalance?.balanceAmount || 0),
            updatedAt: creditBalance?.updatedAt || null,
            refunds: (creditBalance?.refunds || []).map((refund) => ({
              id: refund.id,
              refundNo: refund.refundNo,
              amount: Number(refund.amount || 0),
              method: refund.method,
              refundedAt: refund.refundedAt,
              referenceNo: refund.referenceNo || null,
              note: refund.note || null,
              createdAt: refund.createdAt,
            })),
          },
        };
      }

      // Fallback for legacy payment-only records.
      const [payments, statusGroups, typeGroups] = await Promise.all([
        prisma.payment.findMany({
          where: { studentId: child.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
        }),
        prisma.payment.groupBy({
          by: ['status'],
          where: { studentId: child.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.payment.groupBy({
          by: ['type'],
          where: { studentId: child.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

      const statusSummary = createStatusSummary();
      for (const group of statusGroups) {
        if (!PAYMENT_STATUSES.includes(group.status)) continue;
        statusSummary[group.status] = {
          count: group._count._all,
          amount: Number(group._sum.amount || 0),
        };
      }

      const typeSummary = createTypeSummary();
      for (const group of typeGroups) {
        if (!PAYMENT_TYPES.includes(group.type)) continue;
        typeSummary[group.type] = {
          count: group._count._all,
          amount: Number(group._sum.amount || 0),
        };
      }

      const totalAmount = PAYMENT_STATUSES.reduce((sum, status) => sum + statusSummary[status].amount, 0);
      const totalRecords = PAYMENT_STATUSES.reduce((sum, status) => sum + statusSummary[status].count, 0);

      return {
        student: child,
        summary: {
          totalRecords,
          totalAmount,
          overdueCount: 0,
          overdueAmount: 0,
          status: {
            pendingCount: statusSummary.PENDING.count,
            pendingAmount: statusSummary.PENDING.amount,
            paidCount: statusSummary.PAID.count,
            paidAmount: statusSummary.PAID.amount,
            partialCount: statusSummary.PARTIAL.count,
            partialAmount: statusSummary.PARTIAL.amount,
            cancelledCount: statusSummary.CANCELLED.count,
            cancelledAmount: statusSummary.CANCELLED.amount,
          },
            type: {
              monthlyCount: typeSummary.MONTHLY.count,
              monthlyAmount: typeSummary.MONTHLY.amount,
              oneTimeCount: typeSummary.ONE_TIME.count,
              oneTimeAmount: typeSummary.ONE_TIME.amount,
            },
            creditBalance: Number(creditBalance?.balanceAmount || 0),
          },
        invoices: [],
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          type: payment.type,
          paymentNo: null,
          allocatedAmount: payment.amount,
          creditedAmount: 0,
          method: null,
          referenceNo: null,
          invoiceId: null,
          invoiceNo: null,
          periodKey: null,
          semester: null,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
        creditBalance: {
          balanceAmount: Number(creditBalance?.balanceAmount || 0),
          updatedAt: creditBalance?.updatedAt || null,
          refunds: (creditBalance?.refunds || []).map((refund) => ({
            id: refund.id,
            refundNo: refund.refundNo,
            amount: Number(refund.amount || 0),
            method: refund.method,
            refundedAt: refund.refundedAt,
            referenceNo: refund.referenceNo || null,
            note: refund.note || null,
            createdAt: refund.createdAt,
          })),
        },
      };
    }),
  );

  const summary = childrenOverview.reduce(
    (acc, child) => {
      acc.totalRecords += child.summary.totalRecords;
      acc.totalAmount += child.summary.totalAmount;
      acc.paidAmount += child.summary.status.paidAmount;
      acc.pendingAmount += child.summary.status.pendingAmount;
      acc.partialAmount += child.summary.status.partialAmount;
      acc.cancelledAmount += child.summary.status.cancelledAmount;
      acc.overdueCount += child.summary.overdueCount;
      acc.overdueAmount += child.summary.overdueAmount;
      acc.monthlyAmount += child.summary.type.monthlyAmount;
      acc.oneTimeAmount += child.summary.type.oneTimeAmount;
      acc.creditBalanceAmount += Number(child.summary.creditBalance || 0);
      return acc;
    },
    {
      childCount: childrenOverview.length,
      totalRecords: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      partialAmount: 0,
      cancelledAmount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      monthlyAmount: 0,
      oneTimeAmount: 0,
      creditBalanceAmount: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        parent: {
          id: parent.id,
          name: parent.name,
          username: parent.username,
        },
        summary,
        children: childrenOverview,
      },
      'Data keuangan anak berhasil diambil',
    ),
  );
});

export const listStudentPayments = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = listStudentPaymentsQuerySchema.parse(req.query);
  const authUser = (req as any).user;
  const studentId = Number(authUser?.id || 0);

  if (!studentId) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
      name: true,
      username: true,
      nis: true,
      nisn: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
  });

  if (!student || student.role !== 'STUDENT') {
    throw new ApiError(404, 'Data siswa tidak ditemukan');
  }

  const [financeInvoices, creditBalance] = await Promise.all([
    prisma.financeInvoice.findMany({
      where: { studentId },
      include: {
        items: {
          select: {
            componentId: true,
            componentCode: true,
            componentName: true,
            amount: true,
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                periodicity: true,
                lateFeeEnabled: true,
                lateFeeMode: true,
                lateFeeAmount: true,
                lateFeeGraceDays: true,
                lateFeeCapAmount: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            amount: true,
            allocatedAmount: true,
            creditedAmount: true,
            reversedAmount: true,
            reversedAllocatedAmount: true,
            reversedCreditedAmount: true,
            source: true,
            method: true,
            referenceNo: true,
            note: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                periodKey: true,
                semester: true,
              },
            },
          },
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        },
        installments: {
          select: {
            id: true,
            sequence: true,
            amount: true,
            dueDate: true,
          },
          orderBy: [{ sequence: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.financeCreditBalance.findUnique({
      where: { studentId },
      select: {
        balanceAmount: true,
        updatedAt: true,
        refunds: {
          take: 3,
          orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            refundNo: true,
            amount: true,
            method: true,
            refundedAt: true,
            referenceNo: true,
            note: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  if (financeInvoices.length > 0) {
    const dynamicOverview = buildFinancePortalOverview(
      financeInvoices as FinancePortalInvoiceRecord[],
      limit,
    );

    res.status(200).json(
      new ApiResponse(
        200,
        {
          student,
          summary: {
            ...dynamicOverview.summary,
            creditBalance: Number(creditBalance?.balanceAmount || 0),
          },
          invoices: dynamicOverview.invoices,
          payments: dynamicOverview.payments,
          creditBalance: {
            balanceAmount: Number(creditBalance?.balanceAmount || 0),
            updatedAt: creditBalance?.updatedAt || null,
            refunds: (creditBalance?.refunds || []).map((refund) => ({
              id: refund.id,
              refundNo: refund.refundNo,
              amount: Number(refund.amount || 0),
              method: refund.method,
              refundedAt: refund.refundedAt,
              referenceNo: refund.referenceNo || null,
              note: refund.note || null,
              createdAt: refund.createdAt,
            })),
          },
        },
        'Data keuangan siswa berhasil diambil',
      ),
    );
    return;
  }

  const [payments, statusGroups, typeGroups] = await Promise.all([
    prisma.payment.findMany({
      where: { studentId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.payment.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['type'],
      where: { studentId },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const statusSummary = createStatusSummary();
  for (const group of statusGroups) {
    if (!PAYMENT_STATUSES.includes(group.status)) continue;
    statusSummary[group.status] = {
      count: group._count._all,
      amount: Number(group._sum.amount || 0),
    };
  }

  const typeSummary = createTypeSummary();
  for (const group of typeGroups) {
    if (!PAYMENT_TYPES.includes(group.type)) continue;
    typeSummary[group.type] = {
      count: group._count._all,
      amount: Number(group._sum.amount || 0),
    };
  }

  const totalAmount = PAYMENT_STATUSES.reduce((sum, status) => sum + statusSummary[status].amount, 0);
  const totalRecords = PAYMENT_STATUSES.reduce((sum, status) => sum + statusSummary[status].count, 0);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        student,
        summary: {
          totalRecords,
          totalAmount,
          overdueCount: 0,
          overdueAmount: 0,
          status: {
            pendingCount: statusSummary.PENDING.count,
            pendingAmount: statusSummary.PENDING.amount,
            paidCount: statusSummary.PAID.count,
            paidAmount: statusSummary.PAID.amount,
            partialCount: statusSummary.PARTIAL.count,
            partialAmount: statusSummary.PARTIAL.amount,
            cancelledCount: statusSummary.CANCELLED.count,
            cancelledAmount: statusSummary.CANCELLED.amount,
          },
          type: {
            monthlyCount: typeSummary.MONTHLY.count,
            monthlyAmount: typeSummary.MONTHLY.amount,
            oneTimeCount: typeSummary.ONE_TIME.count,
            oneTimeAmount: typeSummary.ONE_TIME.amount,
          },
          creditBalance: Number(creditBalance?.balanceAmount || 0),
        },
        invoices: [],
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          type: payment.type,
          paymentNo: null,
          allocatedAmount: payment.amount,
          creditedAmount: 0,
          method: null,
          referenceNo: null,
          invoiceId: null,
          invoiceNo: null,
          periodKey: null,
          semester: null,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
        creditBalance: {
          balanceAmount: Number(creditBalance?.balanceAmount || 0),
          updatedAt: creditBalance?.updatedAt || null,
          refunds: (creditBalance?.refunds || []).map((refund) => ({
            id: refund.id,
            refundNo: refund.refundNo,
            amount: Number(refund.amount || 0),
            method: refund.method,
            refundedAt: refund.refundedAt,
            referenceNo: refund.referenceNo || null,
            note: refund.note || null,
            createdAt: refund.createdAt,
          })),
        },
      },
      'Data keuangan siswa berhasil diambil',
    ),
  );
});
