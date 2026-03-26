import {
  FinanceComponentPeriodicity,
  FinanceInvoiceStatus,
  FinancePaymentMethod,
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

function resolveFinanceRouteByRole(role: string, studentId: number): string {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'PARENT') return `/parent/finance?childId=${studentId}`;
  if (normalized === 'STUDENT') return '/student/finance';
  return '/notifications';
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

const createFinanceComponentSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  periodicity: z.nativeEnum(FinanceComponentPeriodicity).default('ONE_TIME'),
  isActive: z.boolean().optional().default(true),
});

const updateFinanceComponentSchema = createFinanceComponentSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  'Tidak ada perubahan data',
);

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

const generateInvoicesSchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester),
  periodKey: z.string().trim().min(1).max(40),
  dueDate: z.coerce.date().optional(),
  title: z.string().trim().max(160).optional(),
  classId: z.coerce.number().int().positive().optional(),
  studentIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  replaceExisting: z.boolean().optional().default(false),
});

const listFinanceInvoicesQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  classId: z.coerce.number().int().positive().optional(),
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

const PERIOD_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const listFinanceReportQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  semester: z.nativeEnum(Semester).optional(),
  classId: z.coerce.number().int().positive().optional(),
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
      ...(filters.classId
        ? {
            student: {
              classId: filters.classId,
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

export const generateFinanceInvoices = asyncHandler(async (req: Request, res: Response) => {
  const actor = await ensureFinanceActor((req as any).user || {});
  const payload = generateInvoicesSchema.parse(req.body);

  const targetAcademicYearId = payload.academicYearId
    ? payload.academicYearId
    : (
        await prisma.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        })
      )?.id;

  if (!targetAcademicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
  }

  const studentWhere: Record<string, unknown> = {
    role: 'STUDENT',
  };

  if (payload.classId) {
    studentWhere.classId = payload.classId;
  }

  if (payload.studentIds.length > 0) {
    studentWhere.id = { in: payload.studentIds };
  }

  const students = await prisma.user.findMany({
    where: studentWhere,
    select: {
      id: true,
      name: true,
      classId: true,
      role: true,
      studentClass: {
        select: {
          id: true,
          level: true,
          majorId: true,
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

  const result = {
    created: 0,
    updated: 0,
    skippedNoTariff: 0,
    skippedExisting: 0,
    skippedLocked: 0,
    details: [] as Array<{ studentId: number; studentName: string; status: string; invoiceNo?: string }>,
  };
  const queuedNotifications: Array<{
    userId: number;
    title: string;
    message: string;
    type: string;
    data: Prisma.InputJsonValue;
  }> = [];

  for (const student of students) {
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
      const componentId = item.tariff.componentId;
      const existing = bestTariffByComponent.get(componentId);
      if (!existing || item.score > existing.score) {
        bestTariffByComponent.set(componentId, item);
      }
    }

    const selectedTariffs = Array.from(bestTariffByComponent.values()).map((item) => item.tariff);

    if (selectedTariffs.length === 0) {
      result.skippedNoTariff += 1;
      result.details.push({ studentId: student.id, studentName: student.name, status: 'SKIPPED_NO_TARIFF' });
      continue;
    }

    const totalAmount = selectedTariffs.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const existingInvoice = await prisma.financeInvoice.findUnique({
      where: {
        studentId_semester_periodKey: {
          studentId: student.id,
          semester: payload.semester,
          periodKey: payload.periodKey,
        },
      },
      select: {
        id: true,
        invoiceNo: true,
        paidAmount: true,
      },
    });

    if (existingInvoice && !payload.replaceExisting) {
      result.skippedExisting += 1;
      result.details.push({
        studentId: student.id,
        studentName: student.name,
        status: 'SKIPPED_EXISTS',
        invoiceNo: existingInvoice.invoiceNo,
      });
      continue;
    }

    if (existingInvoice && existingInvoice.paidAmount > 0) {
      result.skippedLocked += 1;
      result.details.push({
        studentId: student.id,
        studentName: student.name,
        status: 'SKIPPED_LOCKED_PAID',
        invoiceNo: existingInvoice.invoiceNo,
      });
      continue;
    }

    const invoiceNo = existingInvoice?.invoiceNo || makeFinanceInvoiceNo(payload.periodKey, student.id);

    if (existingInvoice) {
      await prisma.$transaction(async (tx) => {
        await tx.financeInvoiceItem.deleteMany({ where: { invoiceId: existingInvoice.id } });
        await tx.financeInvoice.update({
          where: { id: existingInvoice.id },
          data: {
            title: payload.title || null,
            dueDate: payload.dueDate || null,
            totalAmount,
            paidAmount: 0,
            balanceAmount: totalAmount,
            status: 'UNPAID',
            createdById: actor.id,
          },
        });
        await tx.financeInvoiceItem.createMany({
          data: selectedTariffs.map((tariff) => ({
            invoiceId: existingInvoice.id,
            componentId: tariff.componentId,
            componentCode: tariff.component.code,
            componentName: tariff.component.name,
            amount: tariff.amount,
            notes: tariff.notes || null,
          })),
        });
      });

      result.updated += 1;
      result.details.push({ studentId: student.id, studentName: student.name, status: 'UPDATED', invoiceNo });
      const recipients = [
        { userId: student.id, role: student.role },
        ...student.parents.map((parent) => ({ userId: parent.id, role: parent.role })),
      ];
      for (const recipient of recipients) {
        queuedNotifications.push({
          userId: recipient.userId,
          title: 'Tagihan Diperbarui',
          message: `Tagihan ${invoiceNo} periode ${payload.periodKey} telah diperbarui. Total tagihan saat ini Rp${Math.round(totalAmount).toLocaleString('id-ID')}.`,
          type: 'FINANCE_INVOICE_UPDATED',
          data: {
            module: 'FINANCE',
            invoiceNo,
            invoiceId: existingInvoice.id,
            periodKey: payload.periodKey,
            semester: payload.semester,
            route: resolveFinanceRouteByRole(recipient.role, student.id),
            studentId: student.id,
          },
        });
      }
      continue;
    }

    const invoice = await prisma.financeInvoice.create({
      data: {
        invoiceNo,
        studentId: student.id,
        academicYearId: targetAcademicYearId,
        semester: payload.semester,
        periodKey: payload.periodKey,
        title: payload.title || null,
        dueDate: payload.dueDate || null,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        status: 'UNPAID',
        createdById: actor.id,
        items: {
          create: selectedTariffs.map((tariff) => ({
            componentId: tariff.componentId,
            componentCode: tariff.component.code,
            componentName: tariff.component.name,
            amount: tariff.amount,
            notes: tariff.notes || null,
          })),
        },
      },
      select: {
        id: true,
        invoiceNo: true,
      },
    });

    result.created += 1;
    result.details.push({
      studentId: student.id,
      studentName: student.name,
      status: 'CREATED',
      invoiceNo: invoice.invoiceNo,
    });
    const recipients = [
      { userId: student.id, role: student.role },
      ...student.parents.map((parent) => ({ userId: parent.id, role: parent.role })),
    ];
    for (const recipient of recipients) {
      queuedNotifications.push({
        userId: recipient.userId,
        title: 'Tagihan Baru',
        message: `Tagihan ${invoice.invoiceNo} periode ${payload.periodKey} telah diterbitkan dengan total Rp${Math.round(totalAmount).toLocaleString('id-ID')}.`,
        type: 'FINANCE_INVOICE_CREATED',
        data: {
          module: 'FINANCE',
          invoiceNo: invoice.invoiceNo,
          invoiceId: invoice.id,
          periodKey: payload.periodKey,
          semester: payload.semester,
          route: resolveFinanceRouteByRole(recipient.role, student.id),
          studentId: student.id,
        },
      });
    }
  }

  if (queuedNotifications.length > 0) {
    await prisma.notification.createMany({ data: queuedNotifications });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId: targetAcademicYearId,
        semester: payload.semester,
        periodKey: payload.periodKey,
        summary: {
          totalTargetStudents: students.length,
          created: result.created,
          updated: result.updated,
          skippedNoTariff: result.skippedNoTariff,
          skippedExisting: result.skippedExisting,
          skippedLocked: result.skippedLocked,
        },
        details: result.details,
      },
      'Generate tagihan siswa selesai',
    ),
  );
});

export const listFinanceInvoices = asyncHandler(async (req: Request, res: Response) => {
  await ensureFinanceActor((req as any).user || {}, { allowPrincipalReadOnly: true });

  const { academicYearId, semester, classId, studentId, status, search, limit } =
    listFinanceInvoicesQuerySchema.parse(req.query);

  const normalizedSearch = search?.trim();

  const invoices = await prisma.financeInvoice.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      ...(semester ? { semester } : {}),
      ...(status ? { status } : {}),
      ...(studentId ? { studentId } : {}),
      ...(classId
        ? {
            student: {
              classId,
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
        },
      },
      payments: {
        select: {
          id: true,
          paymentNo: true,
          amount: true,
          method: true,
          referenceNo: true,
          paidAt: true,
        },
        orderBy: [{ paidAt: 'desc' }],
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const summary = invoices.reduce(
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

  res.status(200).json(new ApiResponse(200, { invoices, summary }, 'Tagihan siswa berhasil diambil'));
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
    if (payload.amount > outstanding) {
      throw new ApiError(400, `Nominal melebihi sisa tagihan (maksimal ${outstanding})`);
    }

    const paymentNo = makeFinancePaymentNo(invoice.studentId);

    const payment = await tx.financePayment.create({
      data: {
        paymentNo,
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        amount: payload.amount,
        method: payload.method,
        referenceNo: payload.referenceNo?.trim() || null,
        note: payload.note?.trim() || null,
        paidAt: payload.paidAt || new Date(),
        createdById: actor.id,
      },
    });

    const paidAmount = Number(invoice.paidAmount || 0) + payload.amount;
    const balanceAmount = Math.max(Number(invoice.totalAmount || 0) - paidAmount, 0);
    const status: FinanceInvoiceStatus = balanceAmount <= 0 ? 'PAID' : 'PARTIAL';

    const updatedInvoice = await tx.financeInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount,
        balanceAmount,
        status,
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
    };
  });

  await createFinanceNotifications({
    studentId: result.invoice.student.id,
    title: 'Pembayaran Tagihan Berhasil Dicatat',
    message: `Pembayaran Rp${Math.round(result.payment.amount).toLocaleString('id-ID')} untuk tagihan ${result.invoice.invoiceNo} berhasil dicatat. Sisa tagihan: Rp${Math.round(Number(result.invoice.balanceAmount || 0)).toLocaleString('id-ID')}.`,
    type: 'FINANCE_PAYMENT_RECORDED',
    data: {
      module: 'FINANCE',
      invoiceId,
      invoiceNo: result.invoice.invoiceNo,
      paymentId: result.payment.id,
      paymentNo: result.payment.paymentNo,
      paidAmount: result.payment.amount,
      remainingBalance: Number(result.invoice.balanceAmount || 0),
      semester: result.invoice.semester,
      periodKey: result.invoice.periodKey,
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, result, 'Pembayaran tagihan berhasil dicatat'));
});

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
      const financeInvoices = await prisma.financeInvoice.findMany({
        where: { studentId: child.id },
        include: {
          items: {
            select: {
              amount: true,
              component: {
                select: {
                  code: true,
                  name: true,
                  periodicity: true,
                },
              },
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              paidAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      // Prefer dynamic invoice engine when available.
      if (financeInvoices.length > 0) {
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

            return invoice.payments.map((payment) => ({
              id: payment.id,
              amount: Number(payment.amount || 0),
              status: (invoice.status === 'PAID' ? 'PAID' : 'PARTIAL') as PaymentStatus,
              type: invoiceType,
              createdAt: payment.paidAt || payment.createdAt,
              updatedAt: payment.updatedAt,
            }));
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limit);

        const invoiceRows = financeInvoices.slice(0, limit).map((invoice) => {
          const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
          if (dueDate) {
            dueDate.setHours(0, 0, 0, 0);
          }
          const balanceAmount = Number(invoice.balanceAmount || 0);
          const isOverdue =
            !!dueDate &&
            dueDate < today &&
            balanceAmount > 0 &&
            invoice.status !== 'PAID' &&
            invoice.status !== 'CANCELLED';
          const daysPastDue =
            dueDate && isOverdue
              ? Math.max(
                  0,
                  Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)),
                )
              : 0;

          return {
            id: invoice.id,
            invoiceNo: invoice.invoiceNo,
            title: invoice.title,
            periodKey: invoice.periodKey,
            semester: invoice.semester,
            dueDate: invoice.dueDate,
            status: invoice.status,
            totalAmount: Number(invoice.totalAmount || 0),
            paidAmount: Number(invoice.paidAmount || 0),
            balanceAmount,
            isOverdue,
            daysPastDue,
            items: invoice.items.map((item) => ({
              componentCode: item.component?.code || null,
              componentName: item.component?.name || 'Komponen',
              amount: Number(item.amount || 0),
              periodicity: item.component?.periodicity || null,
            })),
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
          student: child,
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
        },
        invoices: [],
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          type: payment.type,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
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

  const financeInvoices = await prisma.financeInvoice.findMany({
    where: { studentId },
    include: {
      items: {
        select: {
          amount: true,
          component: {
            select: {
              code: true,
              name: true,
              periodicity: true,
            },
          },
        },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (financeInvoices.length > 0) {
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

        return invoice.payments.map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount || 0),
          status: (invoice.status === 'PAID' ? 'PAID' : 'PARTIAL') as PaymentStatus,
          type: invoiceType,
          createdAt: payment.paidAt || payment.createdAt,
          updatedAt: payment.updatedAt,
        }));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const invoiceRows = financeInvoices.slice(0, limit).map((invoice) => {
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      if (dueDate) {
        dueDate.setHours(0, 0, 0, 0);
      }
      const balanceAmount = Number(invoice.balanceAmount || 0);
      const isOverdue =
        !!dueDate &&
        dueDate < today &&
        balanceAmount > 0 &&
        invoice.status !== 'PAID' &&
        invoice.status !== 'CANCELLED';
      const daysPastDue =
        dueDate && isOverdue
          ? Math.max(
              0,
              Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)),
            )
          : 0;

      return {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        title: invoice.title,
        periodKey: invoice.periodKey,
        semester: invoice.semester,
        dueDate: invoice.dueDate,
        status: invoice.status,
        totalAmount: Number(invoice.totalAmount || 0),
        paidAmount: Number(invoice.paidAmount || 0),
        balanceAmount,
        isOverdue,
        daysPastDue,
        items: invoice.items.map((item) => ({
          componentCode: item.component?.code || null,
          componentName: item.component?.name || 'Komponen',
          amount: Number(item.amount || 0),
          periodicity: item.component?.periodicity || null,
        })),
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

    res.status(200).json(
      new ApiResponse(
        200,
        {
          student,
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
        },
        invoices: [],
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          type: payment.type,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
      },
      'Data keuangan siswa berhasil diambil',
    ),
  );
});
