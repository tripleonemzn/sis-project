import {
  FinanceAdjustmentKind,
  FinanceCreditTransactionKind,
  FinanceComponentPeriodicity,
  FinanceInvoiceStatus,
  FinanceLateFeeMode,
  FinancePaymentMethod,
  FinancePaymentSource,
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

function normalizeFinanceAmount(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
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
  balanceAmount: number;
  status: FinanceInvoiceStatus;
  isOverdue: boolean;
  daysPastDue: number;
};

function serializeFinanceInstallments(params: {
  invoiceTotalAmount: number;
  invoicePaidAmount: number;
  invoiceStatus: FinanceInvoiceStatus;
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

  return sourceInstallments.map((installment) => {
    const amount = normalizeFinanceAmount(installment.amount);
    const paidAmount =
      params.invoiceStatus === 'CANCELLED'
        ? 0
        : normalizeFinanceAmount(Math.min(remainingPaidAmount, amount));
    remainingPaidAmount = normalizeFinanceAmount(Math.max(remainingPaidAmount - paidAmount, 0));

    const dueDate = installment.dueDate ? new Date(installment.dueDate) : null;
    if (dueDate) {
      dueDate.setHours(0, 0, 0, 0);
    }

    const balanceAmount =
      params.invoiceStatus === 'CANCELLED'
        ? 0
        : normalizeFinanceAmount(Math.max(amount - paidAmount, 0));

    let status: FinanceInvoiceStatus = 'UNPAID';
    if (params.invoiceStatus === 'CANCELLED') {
      status = 'CANCELLED';
    } else if (balanceAmount <= 0) {
      status = 'PAID';
    } else if (paidAmount > 0) {
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
  invoiceStatus: FinanceInvoiceStatus;
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
    invoiceStatus: params.invoiceStatus,
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
      source?: FinancePaymentSource | null;
      method: FinancePaymentMethod;
      referenceNo?: string | null;
      paidAt: Date;
    }>;
    items?: Array<FinanceLateFeeInvoiceItemLike>;
  },
>(invoice: T, options?: { asOfDate?: Date }) {
  const totalAmount = Number(invoice.totalAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const balanceAmount = Number(invoice.balanceAmount || 0);
  const installments = serializeFinanceInstallments({
    invoiceTotalAmount: totalAmount,
    invoicePaidAmount: paidAmount,
    invoiceStatus: invoice.status,
    invoiceDueDate: invoice.dueDate || null,
    installments: invoice.installments || [],
    asOfDate: options?.asOfDate,
  });

  return {
    ...invoice,
    totalAmount,
    paidAmount,
    balanceAmount,
    installmentSummary: buildFinanceInstallmentSummary(installments),
    lateFeeSummary: invoice.items ? buildFinanceLateFeeSummary(invoice, options?.asOfDate) : undefined,
    installments,
    payments: (invoice.payments || []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount || 0),
      allocatedAmount: Number(payment.allocatedAmount || 0),
      creditedAmount: Number(payment.creditedAmount || 0),
      source: payment.source || FinancePaymentSource.DIRECT,
    })),
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
    invoiceStatus: invoice.status,
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
  source?: FinancePaymentSource | null;
  method?: FinancePaymentMethod | null;
  referenceNo?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  invoice?: {
    id: number;
    invoiceNo: string;
    periodKey?: string | null;
    semester?: Semester | null;
  } | null;
}) {
  return {
    id: payment.id,
    paymentNo: payment.paymentNo || null,
    amount: Number(payment.amount || 0),
    allocatedAmount: Number(payment.allocatedAmount || 0),
    creditedAmount: Number(payment.creditedAmount || 0),
    source: payment.source || FinancePaymentSource.DIRECT,
    method: payment.method || null,
    referenceNo: payment.referenceNo || null,
    invoiceId: payment.invoice?.id || null,
    invoiceNo: payment.invoice?.invoiceNo || null,
    periodKey: payment.invoice?.periodKey || null,
    semester: payment.invoice?.semester || null,
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

type FinanceReminderMode = 'ALL' | 'DUE_SOON' | 'OVERDUE';

type DispatchFinanceDueReminderOptions = {
  dueSoonDays?: number;
  mode?: FinanceReminderMode;
  preview?: boolean;
  now?: Date;
};

export async function dispatchFinanceDueReminders(options: DispatchFinanceDueReminderOptions = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dueSoonDays = Math.max(0, Math.min(30, Math.trunc(Number(options.dueSoonDays ?? 3))));
  const mode: FinanceReminderMode = options.mode || 'ALL';
  const preview = !!options.preview;

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
      balanceAmount: true,
      semester: true,
      periodKey: true,
      title: true,
      student: {
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
      },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });

  let dueSoonCount = 0;
  let overdueCount = 0;
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

    if (mode === 'DUE_SOON' && !isDueSoon) continue;
    if (mode === 'OVERDUE' && !isOverdue) continue;
    if (mode === 'ALL' && !isDueSoon && !isOverdue) continue;

    if (isDueSoon) dueSoonCount += 1;
    if (isOverdue) overdueCount += 1;

    const recipients = [
      { userId: invoice.student.id, role: invoice.student.role },
      ...invoice.student.parents.map((parent) => ({ userId: parent.id, role: parent.role })),
    ];

    const reminderType = isOverdue ? 'FINANCE_OVERDUE_REMINDER' : 'FINANCE_DUE_SOON_REMINDER';
    const absDays = Math.abs(dayDiff);
    const title = isOverdue ? 'Tagihan Lewat Jatuh Tempo' : 'Pengingat Jatuh Tempo Tagihan';
    const message = isOverdue
      ? `Tagihan ${invoice.invoiceNo} sudah lewat jatuh tempo ${absDays} hari. Sisa tagihan Rp${Math.round(Number(invoice.balanceAmount || 0)).toLocaleString('id-ID')}.`
      : `Tagihan ${invoice.invoiceNo} akan jatuh tempo ${dayDiff === 0 ? 'hari ini' : `${dayDiff} hari lagi`}. Sisa tagihan Rp${Math.round(Number(invoice.balanceAmount || 0)).toLocaleString('id-ID')}.`;

    for (const recipient of recipients) {
      targeted += 1;

      const existingToday = await prisma.notification.findFirst({
        where: {
          userId: recipient.userId,
          type: reminderType,
          createdAt: { gte: todayStart },
          message: { contains: invoice.invoiceNo },
        },
        select: { id: true },
      });

      if (existingToday) {
        skippedAlreadyNotified += 1;
        continue;
      }

      rows.push({
        userId: recipient.userId,
        type: reminderType,
        title,
        message,
        data: {
          module: 'FINANCE',
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          dueDate: invoice.dueDate,
          daysUntilDue: dayDiff,
          daysPastDue: isOverdue ? absDays : 0,
          semester: invoice.semester,
          periodKey: invoice.periodKey,
          route: resolveFinanceRouteByRole(recipient.role, invoice.studentId),
          studentId: invoice.studentId,
          title: invoice.title || null,
        },
      });
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
    createdNotifications: preview ? 0 : rows.length,
    previewNotifications: preview ? rows.length : 0,
    skippedAlreadyNotified,
    dueSoonDays,
    mode,
    preview,
    runAt: now.toISOString(),
  };
}

async function ensureFinanceActor(
  authUser: { id?: number; role?: string },
  options?: { allowPrincipalReadOnly?: boolean },
) {
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
  const isPrincipalReadOnly = options?.allowPrincipalReadOnly && user.role === 'PRINCIPAL';

  const isFinanceStaff =
    user.role === 'ADMIN' ||
    (user.role === 'STAFF' && user.ptkType === 'STAFF_KEUANGAN') ||
    duties.includes('BENDAHARA');

  if (!isFinanceStaff && !isPrincipalReadOnly) {
    throw new ApiError(403, 'Akses staff keuangan dibutuhkan untuk fitur ini');
  }

  return user;
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
  referenceNo: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
});

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

const createFinanceRefundSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.nativeEnum(FinancePaymentMethod).default('OTHER'),
  referenceNo: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  refundedAt: z.coerce.date().optional(),
});

const applyFinanceLateFeeSchema = z.object({
  note: z.string().trim().max(500).optional(),
  appliedAt: z.coerce.date().optional(),
});

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
  dueSoonDays: z.coerce.number().int().min(0).max(30).optional().default(3),
  mode: z.enum(['ALL', 'DUE_SOON', 'OVERDUE']).optional().default('ALL'),
  preview: z.coerce.boolean().optional().default(false),
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

    if (existingInvoice && Number(existingInvoice.paidAmount || 0) > 0) {
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
  const nextBalanceAmount = normalizeFinanceAmount(
    Math.max(Number(invoice.totalAmount || 0) - nextPaidAmount, 0),
  );
  const nextStatus: FinanceInvoiceStatus = nextBalanceAmount <= 0 ? 'PAID' : 'PARTIAL';
  const nextDueDate = resolveFinanceInvoiceDueDate({
    invoiceTotalAmount: Number(invoice.totalAmount || 0),
    invoicePaidAmount: nextPaidAmount,
    invoiceStatus: nextStatus,
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
          source: true,
          method: true,
          referenceNo: true,
          paidAt: true,
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

export const createFinancePayment = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});

  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw new ApiError(400, 'ID tagihan tidak valid');
  }

  const payload = createFinancePaymentSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
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

    const outstanding = Number(invoice.balanceAmount || 0);
    const allocatedAmount = Math.min(payload.amount, outstanding);
    const creditedAmount = Math.max(payload.amount - outstanding, 0);

    const paymentNo = makeFinancePaymentNo(invoice.studentId);

    const payment = await tx.financePayment.create({
      data: {
        paymentNo,
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        amount: payload.amount,
        allocatedAmount,
        creditedAmount,
        method: payload.method,
        referenceNo: payload.referenceNo?.trim() || null,
        note: payload.note?.trim() || null,
        paidAt: payload.paidAt || new Date(),
        createdById: actor.id,
      },
    });

    const paidAmount = Number(invoice.paidAmount || 0) + allocatedAmount;
    const balanceAmount = Math.max(Number(invoice.totalAmount || 0) - paidAmount, 0);
    const status: FinanceInvoiceStatus = balanceAmount <= 0 ? 'PAID' : 'PARTIAL';
    const nextDueDate = resolveFinanceInvoiceDueDate({
      invoiceTotalAmount: Number(invoice.totalAmount || 0),
      invoicePaidAmount: paidAmount,
      invoiceStatus: status,
      invoiceDueDate: invoice.dueDate || null,
      installments: invoice.installments,
    });

    const updatedInvoice = await tx.financeInvoice.update({
      where: { id: invoice.id },
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
      },
    });

    let creditBalanceSnapshot: {
      id: number;
      balanceAmount: number;
      balanceBefore: number;
    } | null = null;

    if (creditedAmount > 0) {
      const existingCreditBalance = await tx.financeCreditBalance.findUnique({
        where: { studentId: invoice.studentId },
        select: {
          id: true,
          balanceAmount: true,
        },
      });

      const balanceBefore = Number(existingCreditBalance?.balanceAmount || 0);
      const balanceAfter = balanceBefore + creditedAmount;

      const creditBalance = existingCreditBalance
        ? await tx.financeCreditBalance.update({
            where: { id: existingCreditBalance.id },
            data: {
              balanceAmount: balanceAfter,
            },
            select: {
              id: true,
              balanceAmount: true,
            },
          })
        : await tx.financeCreditBalance.create({
            data: {
              studentId: invoice.studentId,
              balanceAmount: balanceAfter,
            },
            select: {
              id: true,
              balanceAmount: true,
            },
          });

      await tx.financeCreditTransaction.create({
        data: {
          balanceId: creditBalance.id,
          studentId: invoice.studentId,
          paymentId: payment.id,
          kind: FinanceCreditTransactionKind.OVERPAYMENT,
          amount: creditedAmount,
          balanceBefore,
          balanceAfter,
          note: payload.note?.trim() || `Kelebihan bayar dari ${paymentNo}`,
          createdById: actor.id,
        },
      });

      creditBalanceSnapshot = {
        id: creditBalance.id,
        balanceAmount: Number(creditBalance.balanceAmount || 0),
        balanceBefore,
      };
    }

    const primaryPeriodicity = invoice.items[0]?.component?.periodicity;
    const legacyType: PaymentType = primaryPeriodicity === 'MONTHLY' ? 'MONTHLY' : 'ONE_TIME';

    const legacyStatus: PaymentStatus = status === 'PAID' ? 'PAID' : 'PARTIAL';

    await tx.payment.create({
      data: {
        studentId: invoice.studentId,
        amount: payload.amount,
        status: legacyStatus,
        type: legacyType,
      },
    });

    return {
      payment,
      invoice: updatedInvoice,
      creditBalance: creditBalanceSnapshot,
    };
  });

  const creditedAmount = Number(result.payment.creditedAmount || 0);

  await createFinanceNotifications({
    studentId: result.invoice.student.id,
    title: 'Pembayaran Tagihan Berhasil Dicatat',
    message: `Pembayaran Rp${Math.round(result.payment.amount).toLocaleString('id-ID')} untuk tagihan ${result.invoice.invoiceNo} berhasil dicatat. Sisa tagihan: Rp${Math.round(Number(result.invoice.balanceAmount || 0)).toLocaleString('id-ID')}.${creditedAmount > 0 ? ` Kelebihan bayar Rp${Math.round(creditedAmount).toLocaleString('id-ID')} masuk ke saldo kredit.` : ''}`,
    type: 'FINANCE_PAYMENT_RECORDED',
    data: {
      module: 'FINANCE',
      invoiceId,
      invoiceNo: result.invoice.invoiceNo,
      paymentId: result.payment.id,
      paymentNo: result.payment.paymentNo,
      paidAmount: result.payment.amount,
      allocatedAmount: Number(result.payment.allocatedAmount || 0),
      creditedAmount,
      remainingBalance: Number(result.invoice.balanceAmount || 0),
      creditBalanceAmount: Number(result.creditBalance?.balanceAmount || 0),
      semester: result.invoice.semester,
      periodKey: result.invoice.periodKey,
    },
  });

  try {
    await writeAuditLog(
      actor.id,
      actor.role,
      (actor.additionalDuties || []).map((duty) => String(duty)),
      'CREATE',
      'FINANCE_PAYMENT',
      result.payment.id,
      null,
      {
        invoiceId,
        invoiceNo: result.invoice.invoiceNo,
        studentId: result.invoice.student.id,
        paymentNo: result.payment.paymentNo,
        amount: Number(result.payment.amount || 0),
        allocatedAmount: Number(result.payment.allocatedAmount || 0),
        creditedAmount,
        creditBalanceAmount: Number(result.creditBalance?.balanceAmount || 0),
      },
      creditedAmount > 0 ? 'Pembayaran invoice dengan kelebihan bayar menjadi saldo kredit' : 'Pembayaran invoice',
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat pembayaran finance', auditError);
  }

  res
    .status(201)
    .json(new ApiResponse(201, result, 'Pembayaran tagihan berhasil dicatat'));
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
            source: true,
            method: true,
            referenceNo: true,
            paidAt: true,
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
      invoiceStatus: invoice.status,
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

    if (Number(invoice.paidAmount || 0) > 0) {
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
      invoiceStatus: invoice.status,
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
            source: true,
            method: true,
            referenceNo: true,
            paidAt: true,
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
            source: true,
            method: true,
            referenceNo: true,
            paidAt: true,
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
      invoiceStatus: invoice.status,
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
            source: true,
            method: true,
            referenceNo: true,
            paidAt: true,
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
    source: FinancePaymentSource;
    method: FinancePaymentMethod;
    referenceNo: string | null;
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
      statusSummary.PAID.amount += invoiceTotal;
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
                source: true,
                method: true,
                referenceNo: true,
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
            source: true,
            method: true,
            referenceNo: true,
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
