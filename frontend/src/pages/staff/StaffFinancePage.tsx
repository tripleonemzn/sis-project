import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Download, Loader2, Pencil, Plus, Power, ReceiptText, WalletCards, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { academicYearService, type AcademicYear } from '../../services/academicYear.service';
import {
  type FinanceAdjustmentKind,
  type FinanceAdjustmentRule,
  type FinanceBankAccount,
  type FinanceBankReconciliation,
  type FinanceClosingPeriod,
  type FinanceClosingPeriodApprovalPolicy,
  type FinanceClosingPeriodType,
  type FinanceBankStatementDirection,
  type FinanceBudgetProgressStage,
  type FinanceCashSession,
  type FinanceCashSessionApprovalPolicy,
  type FinanceCashSessionApprovalStatus,
  type FinanceCreditBalanceRow,
  type FinanceCreditTransaction,
  type FinanceRefundRecord,
  type FinancePaymentReversalRequest,
  staffFinanceService,
  type FinanceComponent,
  type FinanceComponentPeriodicity,
  type FinanceInvoice,
  type FinanceInvoiceStatus,
  type FinanceLedgerBook,
  type FinanceLedgerEntry,
  type FinanceLateFeeMode,
  type FinancePaymentMethod,
  type FinanceReminderMode,
  type FinanceReminderPolicy,
  type FinanceWriteOffRequest,
  type FinanceTariffRule,
  type FinanceReportSnapshot,
  type SemesterCode,
} from '../../services/staffFinance.service';
import { majorService, type Major } from '../../services/major.service';
import { userService } from '../../services/user.service';
import type { User } from '../../types/auth';

const PERIODICITY_OPTIONS: Array<{ value: FinanceComponentPeriodicity; label: string }> = [
  { value: 'MONTHLY', label: 'Bulanan' },
  { value: 'ONE_TIME', label: 'Sekali Bayar' },
  { value: 'PERIODIC', label: 'Periodik' },
];

const ADJUSTMENT_KIND_OPTIONS: Array<{ value: FinanceAdjustmentKind; label: string }> = [
  { value: 'DISCOUNT', label: 'Potongan' },
  { value: 'SCHOLARSHIP', label: 'Beasiswa' },
  { value: 'SURCHARGE', label: 'Surcharge' },
];

const PAYMENT_METHOD_OPTIONS: Array<{ value: FinancePaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Tunai' },
  { value: 'BANK_TRANSFER', label: 'Transfer Bank' },
  { value: 'VIRTUAL_ACCOUNT', label: 'Virtual Account' },
  { value: 'E_WALLET', label: 'E-Wallet' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'OTHER', label: 'Lainnya' },
];

const LATE_FEE_MODE_OPTIONS: Array<{ value: FinanceLateFeeMode; label: string }> = [
  { value: 'FIXED', label: 'Tetap per termin overdue' },
  { value: 'DAILY', label: 'Harian per termin overdue' },
];

const CLOSING_PERIOD_TYPE_OPTIONS: Array<{ value: FinanceClosingPeriodType; label: string }> = [
  { value: 'MONTHLY', label: 'Bulanan' },
  { value: 'YEARLY', label: 'Tahunan' },
];

const STATUS_OPTIONS: Array<{ value: '' | FinanceInvoiceStatus; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'UNPAID', label: 'Belum Bayar' },
  { value: 'PARTIAL', label: 'Parsial' },
  { value: 'PAID', label: 'Lunas' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getTodayInputDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthStartInputDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function getFinanceMonthLabel(month: number) {
  return new Date(2026, Math.max(0, month - 1), 1).toLocaleDateString('id-ID', {
    month: 'long',
  });
}

function getCollectionPriorityBadge(priority: 'MONITOR' | 'TINGGI' | 'KRITIS') {
  if (priority === 'KRITIS') {
    return 'bg-rose-50 text-rose-700 border border-rose-200';
  }
  if (priority === 'TINGGI') {
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  }
  return 'bg-sky-50 text-sky-700 border border-sky-200';
}

function getDueSoonLabel(daysUntilDue: number) {
  if (daysUntilDue <= 0) return 'Jatuh tempo hari ini';
  if (daysUntilDue === 1) return '1 hari lagi';
  return `${daysUntilDue} hari lagi`;
}

function formatEffectiveWindow(start?: string | null, end?: string | null) {
  if (!start && !end) return 'Selamanya';
  const startLabel = start ? formatDate(start) : 'Awal';
  const endLabel = end ? formatDate(end) : 'Seterusnya';
  return `${startLabel} - ${endLabel}`;
}

function normalizeClassLevel(raw?: string | null) {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^KELAS\s+/i, '')
    .trim();
  if (!normalized) return '';
  const tokenMatch = normalized.match(/\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|12|11|10|9|8|7|6|5|4|3|2|1)\b/);
  return (tokenMatch?.[1] || normalized.split(/\s+/)[0] || '').trim();
}

function getClassLevelLabel(level?: string | null) {
  const normalized = normalizeClassLevel(level);
  return normalized ? `Kelas ${normalized}` : 'Semua kelas';
}

function describeTariffScope(tariff: FinanceTariffRule) {
  const parts = [
    tariff.gradeLevel
      ? getClassLevelLabel(tariff.gradeLevel)
      : tariff.class?.level
        ? getClassLevelLabel(tariff.class.level)
        : tariff.class?.name || 'Semua kelas',
    tariff.major?.name ? `Jurusan ${tariff.major.name}` : 'Semua jurusan',
    tariff.semester === 'ODD' ? 'Ganjil' : tariff.semester === 'EVEN' ? 'Genap' : 'Semua semester',
    tariff.academicYear?.name || 'Semua tahun ajaran',
  ];

  if (tariff.effectiveStart || tariff.effectiveEnd) {
    parts.push(`Efektif ${formatEffectiveWindow(tariff.effectiveStart, tariff.effectiveEnd)}`);
  }

  return parts.join(' • ');
}

function getAdjustmentKindLabel(kind: FinanceAdjustmentKind) {
  return ADJUSTMENT_KIND_OPTIONS.find((option) => option.value === kind)?.label || kind;
}

function getPaymentMethodLabel(method?: FinancePaymentMethod | null) {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label || method || '-';
}

function isTrackedNonCashPaymentMethod(method?: FinancePaymentMethod | null) {
  return (
    method === 'BANK_TRANSFER' ||
    method === 'VIRTUAL_ACCOUNT' ||
    method === 'E_WALLET' ||
    method === 'QRIS'
  );
}

function getPaymentVerificationMeta(status?: FinanceInvoice['payments'][number]['verificationStatus']) {
  if (status === 'PENDING') {
    return {
      label: 'Menunggu Verifikasi',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }
  if (status === 'REJECTED') {
    return {
      label: 'Ditolak',
      className: 'bg-rose-50 text-rose-700 border border-rose-200',
    };
  }
  return {
    label: 'Terverifikasi',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  };
}

function getFinanceLedgerBookMeta(book: FinanceLedgerBook | FinanceLedgerEntry['book']) {
  if (book === 'CASHBOOK') {
    return {
      label: 'Buku Kas',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }

  return {
    label: 'Buku Bank',
    className: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  };
}

function getFinanceLedgerDirectionMeta(direction: FinanceLedgerEntry['direction']) {
  if (direction === 'IN') {
    return {
      label: 'Masuk',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
  }

  return {
    label: 'Keluar',
    className: 'bg-rose-50 text-rose-700 border border-rose-200',
  };
}

function getLateFeeModeLabel(mode?: FinanceLateFeeMode | null) {
  return LATE_FEE_MODE_OPTIONS.find((option) => option.value === mode)?.label || mode || '-';
}

function getCreditTransactionLabel(transaction: FinanceCreditTransaction) {
  if (transaction.kind === 'APPLIED_TO_INVOICE') return 'Saldo kredit dipakai ke invoice';
  if (transaction.kind === 'REFUND') return 'Refund saldo kredit';
  if (transaction.kind === 'PAYMENT_REVERSAL') return 'Reversal mengurangi saldo kredit';
  return 'Kelebihan bayar masuk saldo kredit';
}

function describeAdjustmentScope(adjustment: FinanceAdjustmentRule) {
  const parts = [
    adjustment.component?.name ? `Komponen ${adjustment.component.name}` : 'Seluruh invoice',
    adjustment.student?.name
      ? `Siswa ${adjustment.student.name}`
      : adjustment.gradeLevel
        ? getClassLevelLabel(adjustment.gradeLevel)
        : adjustment.class?.level
          ? getClassLevelLabel(adjustment.class.level)
          : adjustment.class?.name || 'Semua kelas',
    adjustment.major?.name ? `Jurusan ${adjustment.major.name}` : 'Semua jurusan',
    adjustment.semester === 'ODD'
      ? 'Ganjil'
      : adjustment.semester === 'EVEN'
        ? 'Genap'
        : 'Semua semester',
    adjustment.academicYear?.name || 'Semua tahun ajaran',
  ];

  if (adjustment.effectiveStart || adjustment.effectiveEnd) {
    parts.push(`Efektif ${formatEffectiveWindow(adjustment.effectiveStart, adjustment.effectiveEnd)}`);
  }

  return parts.join(' • ');
}

function getInvoicePreviewStatusMeta(status: string) {
  if (status === 'READY_CREATE' || status === 'CREATED') {
    return {
      label: status === 'CREATED' ? 'Dibuat' : 'Siap Dibuat',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
  }
  if (status === 'READY_UPDATE' || status === 'UPDATED') {
    return {
      label: status === 'UPDATED' ? 'Diperbarui' : 'Siap Diperbarui',
      className: 'bg-blue-50 text-blue-700 border border-blue-200',
    };
  }
  if (status === 'SKIPPED_EXISTS') {
    return {
      label: 'Sudah Ada',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }
  if (status === 'SKIPPED_LOCKED_PAID') {
    return {
      label: 'Terkunci Pembayaran',
      className: 'bg-rose-50 text-rose-700 border border-rose-200',
    };
  }
  return {
    label: 'Tanpa Tarif',
    className: 'bg-slate-50 text-slate-700 border border-slate-200',
  };
}

function getWriteOffStatusMeta(status: FinanceWriteOffRequest['status']) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Kepala TU', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepala Sekolah', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (status === 'APPROVED') {
    return { label: 'Siap Diterapkan', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (status === 'APPLIED') {
    return { label: 'Sudah Diterapkan', className: 'bg-violet-50 text-violet-700 border border-violet-200' };
  }
  return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getPaymentReversalStatusMeta(status: FinancePaymentReversalRequest['status']) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Kepala TU', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepala Sekolah', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (status === 'APPROVED') {
    return { label: 'Siap Diterapkan', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (status === 'APPLIED') {
    return { label: 'Sudah Diterapkan', className: 'bg-violet-50 text-violet-700 border border-violet-200' };
  }
  return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getCashSessionStatusMeta(status: FinanceCashSession['status']) {
  if (status === 'OPEN') {
    return { label: 'Masih Dibuka', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  return { label: 'Sudah Ditutup', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getCashSessionApprovalMeta(status: FinanceCashSessionApprovalStatus) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Head TU', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepsek', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (status === 'APPROVED') {
    return { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (status === 'AUTO_APPROVED') {
    return { label: 'Auto Approved', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (status === 'REJECTED') {
    return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  return { label: 'Belum Diajukan', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getClosingPeriodStatusMeta(status: FinanceClosingPeriod['status']) {
  if (status === 'CLOSED') {
    return { label: 'Terkunci', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (status === 'CLOSING_REVIEW') {
    return { label: 'Review Closing', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  return { label: 'Terbuka', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getClosingPeriodApprovalMeta(status: FinanceClosingPeriod['approvalStatus']) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Head TU', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepsek', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (status === 'APPROVED') {
    return { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (status === 'REJECTED') {
    return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  return { label: 'Belum Diajukan', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getBudgetProgressStageMeta(stage: FinanceBudgetProgressStage) {
  if (stage === 'RETURNED_BY_FINANCE') {
    return { label: 'Dikembalikan Keuangan', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  if (stage === 'FINANCE_REVIEW') {
    return { label: 'Review Keuangan', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (stage === 'LPJ_PREPARATION') {
    return { label: 'Persiapan LPJ', className: 'bg-violet-50 text-violet-700 border border-violet-200' };
  }
  if (stage === 'WAITING_LPJ') {
    return { label: 'Menunggu LPJ', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (stage === 'WAITING_REALIZATION') {
    return { label: 'Menunggu Realisasi', className: 'bg-orange-50 text-orange-700 border border-orange-200' };
  }
  if (stage === 'PENDING_APPROVAL') {
    return { label: 'Menunggu Persetujuan', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
  }
  if (stage === 'REALIZED') {
    return { label: 'Terealisasi', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getBankReconciliationStatusMeta(status: FinanceBankReconciliation['status']) {
  if (status === 'FINALIZED') {
    return { label: 'Final', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  return { label: 'Terbuka', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
}

export const StaffFinancePage = () => {
  const queryClient = useQueryClient();

  const [componentCode, setComponentCode] = useState('');
  const [componentName, setComponentName] = useState('');
  const [componentDescription, setComponentDescription] = useState('');
  const [componentPeriodicity, setComponentPeriodicity] = useState<FinanceComponentPeriodicity>('MONTHLY');
  const [componentLateFeeEnabled, setComponentLateFeeEnabled] = useState(false);
  const [componentLateFeeMode, setComponentLateFeeMode] = useState<FinanceLateFeeMode>('FIXED');
  const [componentLateFeeAmount, setComponentLateFeeAmount] = useState('');
  const [componentLateFeeGraceDays, setComponentLateFeeGraceDays] = useState('0');
  const [componentLateFeeCapAmount, setComponentLateFeeCapAmount] = useState('');
  const [editingComponentId, setEditingComponentId] = useState<number | null>(null);
  const [isComponentModalOpen, setIsComponentModalOpen] = useState(false);

  const [tariffComponentId, setTariffComponentId] = useState<number | ''>('');
  const [tariffAcademicYearId, setTariffAcademicYearId] = useState<number | ''>('');
  const [tariffMajorId, setTariffMajorId] = useState<number | ''>('');
  const [tariffSemester, setTariffSemester] = useState<SemesterCode | ''>('');
  const [tariffGradeLevel, setTariffGradeLevel] = useState('');
  const [tariffAmount, setTariffAmount] = useState('');
  const [tariffEffectiveStart, setTariffEffectiveStart] = useState('');
  const [tariffEffectiveEnd, setTariffEffectiveEnd] = useState('');
  const [tariffNotes, setTariffNotes] = useState('');
  const [editingTariffId, setEditingTariffId] = useState<number | null>(null);
  const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);

  const [adjustmentCode, setAdjustmentCode] = useState('');
  const [adjustmentName, setAdjustmentName] = useState('');
  const [adjustmentDescription, setAdjustmentDescription] = useState('');
  const [adjustmentKind, setAdjustmentKind] = useState<FinanceAdjustmentKind>('DISCOUNT');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentComponentId, setAdjustmentComponentId] = useState<number | ''>('');
  const [adjustmentAcademicYearId, setAdjustmentAcademicYearId] = useState<number | ''>('');
  const [adjustmentMajorId, setAdjustmentMajorId] = useState<number | ''>('');
  const [adjustmentStudentId, setAdjustmentStudentId] = useState<number | ''>('');
  const [adjustmentStudentSearch, setAdjustmentStudentSearch] = useState('');
  const [adjustmentSemester, setAdjustmentSemester] = useState<SemesterCode | ''>('');
  const [adjustmentGradeLevel, setAdjustmentGradeLevel] = useState('');
  const [adjustmentEffectiveStart, setAdjustmentEffectiveStart] = useState('');
  const [adjustmentEffectiveEnd, setAdjustmentEffectiveEnd] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<number | null>(null);

  const [invoiceYearId, setInvoiceYearId] = useState<number | ''>('');
  const [invoiceSemester, setInvoiceSemester] = useState<SemesterCode>('EVEN');
  const [invoicePeriodKey, setInvoicePeriodKey] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceTitle, setInvoiceTitle] = useState('');
  const [invoiceMajorId, setInvoiceMajorId] = useState<number | ''>('');
  const [invoiceGradeLevel, setInvoiceGradeLevel] = useState('');
  const [invoiceInstallmentCount, setInvoiceInstallmentCount] = useState(1);
  const [invoiceInstallmentIntervalDays, setInvoiceInstallmentIntervalDays] = useState(30);
  const [invoiceAutoApplyCreditBalance, setInvoiceAutoApplyCreditBalance] = useState(true);
  const [invoiceReplaceExisting, setInvoiceReplaceExisting] = useState(false);
  const [invoiceStudentSearch, setInvoiceStudentSearch] = useState('');
  const [invoiceSelectedStudentIds, setInvoiceSelectedStudentIds] = useState<number[]>([]);

  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'' | FinanceInvoiceStatus>('');
  const [invoiceGradeLevelFilter, setInvoiceGradeLevelFilter] = useState('');
  const [reportYearId, setReportYearId] = useState<number | ''>('');
  const [reportSemester, setReportSemester] = useState<SemesterCode | ''>('');
  const [reportGradeLevelFilter, setReportGradeLevelFilter] = useState('');
  const [reportPeriodFrom, setReportPeriodFrom] = useState('');
  const [reportPeriodTo, setReportPeriodTo] = useState('');
  const [reportAsOfDate, setReportAsOfDate] = useState(getTodayInputDate());
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [isReminderPolicyModalOpen, setIsReminderPolicyModalOpen] = useState(false);
  const [reminderDueSoonDays, setReminderDueSoonDays] = useState('3');
  const [reminderPolicyIsActive, setReminderPolicyIsActive] = useState(true);
  const [reminderDueSoonRepeatIntervalDays, setReminderDueSoonRepeatIntervalDays] = useState('1');
  const [reminderOverdueRepeatIntervalDays, setReminderOverdueRepeatIntervalDays] = useState('3');
  const [reminderLateFeeWarningEnabled, setReminderLateFeeWarningEnabled] = useState(true);
  const [reminderLateFeeWarningRepeatIntervalDays, setReminderLateFeeWarningRepeatIntervalDays] = useState('3');
  const [reminderEscalationEnabled, setReminderEscalationEnabled] = useState(true);
  const [reminderEscalationStartDays, setReminderEscalationStartDays] = useState('7');
  const [reminderEscalationRepeatIntervalDays, setReminderEscalationRepeatIntervalDays] = useState('3');
  const [reminderEscalationMinOutstandingAmount, setReminderEscalationMinOutstandingAmount] = useState('0');
  const [reminderSendStudent, setReminderSendStudent] = useState(true);
  const [reminderSendParent, setReminderSendParent] = useState(true);
  const [reminderEscalateToFinanceStaff, setReminderEscalateToFinanceStaff] = useState(true);
  const [reminderEscalateToHeadTu, setReminderEscalateToHeadTu] = useState(true);
  const [reminderEscalateToPrincipal, setReminderEscalateToPrincipal] = useState(false);
  const [reminderPolicyNotes, setReminderPolicyNotes] = useState('');

  const [selectedInvoice, setSelectedInvoice] = useState<FinanceInvoice | null>(null);
  const [installmentDrafts, setInstallmentDrafts] = useState<
    Array<{ sequence: number; amount: string; dueDate: string }>
  >([]);
  const [installmentScheduleNote, setInstallmentScheduleNote] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>('CASH');
  const [paymentBankAccountId, setPaymentBankAccountId] = useState<number | ''>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentVerificationSearch, setPaymentVerificationSearch] = useState('');
  const [ledgerBookFilter, setLedgerBookFilter] = useState<FinanceLedgerBook>('ALL');
  const [ledgerBankAccountId, setLedgerBankAccountId] = useState<number | ''>('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState(getMonthStartInputDate());
  const [ledgerDateTo, setLedgerDateTo] = useState(getTodayInputDate());
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [creditSearch, setCreditSearch] = useState('');
  const [selectedCreditBalance, setSelectedCreditBalance] = useState<FinanceCreditBalanceRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<FinancePaymentMethod>('BANK_TRANSFER');
  const [refundBankAccountId, setRefundBankAccountId] = useState<number | ''>('');
  const [refundReference, setRefundReference] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [writeOffTargetInvoice, setWriteOffTargetInvoice] = useState<FinanceInvoice | null>(null);
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [writeOffNote, setWriteOffNote] = useState('');
  const [reversalTargetPayment, setReversalTargetPayment] = useState<FinanceInvoice['payments'][number] | null>(null);
  const [reversalAmount, setReversalAmount] = useState('');
  const [reversalReason, setReversalReason] = useState('');
  const [reversalNote, setReversalNote] = useState('');
  const [cashSessionBusinessDate, setCashSessionBusinessDate] = useState(getTodayInputDate());
  const [cashSessionOpeningBalance, setCashSessionOpeningBalance] = useState('0');
  const [cashSessionOpeningNote, setCashSessionOpeningNote] = useState('');
  const [cashSessionActualClosingBalance, setCashSessionActualClosingBalance] = useState('');
  const [cashSessionClosingNote, setCashSessionClosingNote] = useState('');
  const [cashSessionZeroVarianceAutoApproved, setCashSessionZeroVarianceAutoApproved] = useState(true);
  const [cashSessionRequireVarianceNote, setCashSessionRequireVarianceNote] = useState(true);
  const [cashSessionPrincipalApprovalThresholdAmount, setCashSessionPrincipalApprovalThresholdAmount] = useState('100000');
  const [cashSessionApprovalPolicyNotes, setCashSessionApprovalPolicyNotes] = useState('');
  const [closingPeriodType, setClosingPeriodType] = useState<FinanceClosingPeriodType>('MONTHLY');
  const [closingPeriodYear, setClosingPeriodYear] = useState(String(new Date().getFullYear()));
  const [closingPeriodMonth, setClosingPeriodMonth] = useState(String(new Date().getMonth() + 1));
  const [closingPeriodLabel, setClosingPeriodLabel] = useState('');
  const [closingPeriodNote, setClosingPeriodNote] = useState('');
  const [closingPeriodRequireHeadTuApproval, setClosingPeriodRequireHeadTuApproval] = useState(true);
  const [closingPeriodPrincipalApprovalThresholdAmount, setClosingPeriodPrincipalApprovalThresholdAmount] = useState('100000');
  const [closingPeriodEscalateIfPendingVerification, setClosingPeriodEscalateIfPendingVerification] = useState(true);
  const [closingPeriodEscalateIfUnmatchedBankEntries, setClosingPeriodEscalateIfUnmatchedBankEntries] = useState(true);
  const [closingPeriodEscalateIfOpenCashSession, setClosingPeriodEscalateIfOpenCashSession] = useState(true);
  const [closingPeriodEscalateIfOpenReconciliation, setClosingPeriodEscalateIfOpenReconciliation] = useState(true);
  const [closingPeriodPolicyNotes, setClosingPeriodPolicyNotes] = useState('');
  const [editingBankAccountId, setEditingBankAccountId] = useState<number | null>(null);
  const [bankAccountCode, setBankAccountCode] = useState('');
  const [bankAccountBankName, setBankAccountBankName] = useState('');
  const [bankAccountAccountName, setBankAccountAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountBranch, setBankAccountBranch] = useState('');
  const [bankAccountNotes, setBankAccountNotes] = useState('');
  const [bankReconciliationAccountId, setBankReconciliationAccountId] = useState<number | ''>('');
  const [bankReconciliationPeriodStart, setBankReconciliationPeriodStart] = useState(getTodayInputDate());
  const [bankReconciliationPeriodEnd, setBankReconciliationPeriodEnd] = useState(getTodayInputDate());
  const [bankReconciliationOpeningBalance, setBankReconciliationOpeningBalance] = useState('0');
  const [bankReconciliationClosingBalance, setBankReconciliationClosingBalance] = useState('0');
  const [bankReconciliationNote, setBankReconciliationNote] = useState('');
  const [selectedBankReconciliationId, setSelectedBankReconciliationId] = useState<number | null>(null);
  const [bankStatementEntryDate, setBankStatementEntryDate] = useState(getTodayInputDate());
  const [bankStatementDirection, setBankStatementDirection] =
    useState<FinanceBankStatementDirection>('CREDIT');
  const [bankStatementAmount, setBankStatementAmount] = useState('');
  const [bankStatementReference, setBankStatementReference] = useState('');
  const [bankStatementDescription, setBankStatementDescription] = useState('');

  const yearsQuery = useQuery({
    queryKey: ['staff-finance-academic-years'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const activeYearId = useMemo(() => {
    const payload = yearsQuery.data as
      | { data?: { academicYears?: AcademicYear[] }; academicYears?: AcademicYear[] }
      | undefined;
    const loadedYears = payload?.data?.academicYears || payload?.academicYears || [];
    return loadedYears.find((year) => year.isActive)?.id || loadedYears[0]?.id || null;
  }, [yearsQuery.data]);

  const majorsQuery = useQuery({
    queryKey: ['staff-finance-majors'],
    queryFn: () => majorService.list({ page: 1, limit: 300 }),
    staleTime: 5 * 60 * 1000,
  });

  const classLevelsQuery = useQuery({
    queryKey: ['staff-finance-class-levels'],
    queryFn: () => staffFinanceService.listClassLevels(),
    staleTime: 5 * 60 * 1000,
  });

  const bankAccountsQuery = useQuery({
    queryKey: ['staff-finance-bank-accounts'],
    queryFn: () => staffFinanceService.listBankAccounts(),
    staleTime: 60_000,
  });

  const bankReconciliationsQuery = useQuery({
    queryKey: ['staff-finance-bank-reconciliations'],
    queryFn: () => staffFinanceService.listBankReconciliations({ limit: 8 }),
    staleTime: 30_000,
  });

  const paymentVerificationsQuery = useQuery({
    queryKey: ['staff-finance-payment-verifications', paymentVerificationSearch],
    queryFn: () =>
      staffFinanceService.listPaymentVerifications({
        limit: 50,
        search: paymentVerificationSearch.trim() || undefined,
      }),
    staleTime: 30_000,
  });

  const ledgerBooksQuery = useQuery({
    queryKey: [
      'staff-finance-ledger-books',
      ledgerBookFilter,
      ledgerBankAccountId === '' ? 'all' : ledgerBankAccountId,
      ledgerDateFrom || 'none',
      ledgerDateTo || 'none',
      ledgerSearch,
    ],
    queryFn: () =>
      staffFinanceService.listLedgerBooks({
        book: ledgerBookFilter,
        bankAccountId:
          ledgerBookFilter === 'CASHBOOK' || ledgerBankAccountId === ''
            ? undefined
            : Number(ledgerBankAccountId),
        dateFrom: ledgerDateFrom || undefined,
        dateTo: ledgerDateTo || undefined,
        search: ledgerSearch.trim() || undefined,
        limit: 150,
      }),
    staleTime: 30_000,
  });

  const studentsQuery = useQuery({
    queryKey: ['staff-finance-students'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const componentsQuery = useQuery({
    queryKey: ['staff-finance-components'],
    queryFn: () => staffFinanceService.listComponents(),
    staleTime: 60_000,
  });

  const tariffsQuery = useQuery({
    queryKey: ['staff-finance-tariffs'],
    queryFn: () => staffFinanceService.listTariffs(),
    staleTime: 60_000,
  });

  const adjustmentsQuery = useQuery({
    queryKey: ['staff-finance-adjustments'],
    queryFn: () => staffFinanceService.listAdjustments(),
    staleTime: 60_000,
  });

  const invoicesQuery = useQuery({
    queryKey: ['staff-finance-invoices', invoiceSearch, invoiceStatusFilter, invoiceGradeLevelFilter],
    queryFn: () =>
      staffFinanceService.listInvoices({
        limit: 100,
        status: invoiceStatusFilter || undefined,
        search: invoiceSearch.trim() || undefined,
        gradeLevel: invoiceGradeLevelFilter.trim() || undefined,
      }),
  });

  const creditsQuery = useQuery({
    queryKey: ['staff-finance-credits', creditSearch],
    queryFn: () =>
      staffFinanceService.listCredits({
        limit: 50,
        search: creditSearch.trim() || undefined,
      }),
  });

  const cashSessionsQuery = useQuery({
    queryKey: ['staff-finance-cash-sessions'],
    queryFn: () =>
      staffFinanceService.listCashSessions({
        mine: true,
        limit: 10,
      }),
    staleTime: 30_000,
  });

  const writeOffsQuery = useQuery({
    queryKey: ['staff-finance-write-offs'],
    queryFn: () => staffFinanceService.listWriteOffs({ limit: 100 }),
    staleTime: 60_000,
  });

  const paymentReversalsQuery = useQuery({
    queryKey: ['staff-finance-payment-reversals'],
    queryFn: () => staffFinanceService.listPaymentReversals({ limit: 100 }),
    staleTime: 60_000,
  });

  const reminderPolicyQuery = useQuery({
    queryKey: ['staff-finance-reminder-policy'],
    queryFn: () => staffFinanceService.getReminderPolicy(),
    staleTime: 60_000,
  });

  const cashSessionApprovalPolicyQuery = useQuery({
    queryKey: ['staff-finance-cash-session-policy'],
    queryFn: () => staffFinanceService.getCashSessionApprovalPolicy(),
    staleTime: 60_000,
  });

  const closingPeriodsQuery = useQuery({
    queryKey: ['staff-finance-closing-periods'],
    queryFn: () => staffFinanceService.listClosingPeriods({ limit: 12 }),
    staleTime: 30_000,
  });

  const budgetRealizationQuery = useQuery({
    queryKey: ['staff-finance-budget-realization', activeYearId || 'none'],
    queryFn: () =>
      staffFinanceService.getBudgetRealizationSummary({
        academicYearId: activeYearId || undefined,
        limit: 10,
      }),
    staleTime: 30_000,
  });

  const closingPeriodApprovalPolicyQuery = useQuery({
    queryKey: ['staff-finance-closing-period-policy'],
    queryFn: () => staffFinanceService.getClosingPeriodApprovalPolicy(),
    staleTime: 60_000,
  });

  const years = useMemo<AcademicYear[]>(() => {
    const payload = yearsQuery.data as
      | { data?: { academicYears?: AcademicYear[] }; academicYears?: AcademicYear[] }
      | undefined;
    return payload?.data?.academicYears || payload?.academicYears || [];
  }, [yearsQuery.data]);

  const majors = useMemo<Major[]>(() => {
    const payload = majorsQuery.data as
      | { data?: { majors?: Major[] }; majors?: Major[] }
      | undefined;
    return payload?.data?.majors || payload?.majors || [];
  }, [majorsQuery.data]);

  const students = useMemo<User[]>(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);

  const classLevelOptions = useMemo(
    () => (classLevelsQuery.data || []).map((level) => normalizeClassLevel(level)).filter((value) => value.length > 0),
    [classLevelsQuery.data],
  );
  const bankAccounts = bankAccountsQuery.data || [];
  const activeBankAccounts = useMemo(
    () => bankAccounts.filter((account) => account.isActive),
    [bankAccounts],
  );
  const bankReconciliationSummary = bankReconciliationsQuery.data?.summary;
  const bankReconciliations = bankReconciliationsQuery.data?.reconciliations || [];
  const paymentVerificationSummary = paymentVerificationsQuery.data?.summary;
  const paymentVerificationRows = paymentVerificationsQuery.data?.payments || [];
  const ledgerSummary = ledgerBooksQuery.data?.summary;
  const ledgerBookSummaries = ledgerBooksQuery.data?.books || [];
  const ledgerBankAccountSummaries = ledgerBooksQuery.data?.bankAccounts || [];
  const ledgerEntries = ledgerBooksQuery.data?.entries || [];
  const pendingPaymentVerificationRows = useMemo(
    () =>
      paymentVerificationRows.filter(
        (payment) => payment.verificationStatus === 'PENDING',
      ),
    [paymentVerificationRows],
  );

  const reminderPolicy = reminderPolicyQuery.data || null;
  const cashSessionApprovalPolicy = cashSessionApprovalPolicyQuery.data || null;
  const closingPeriodsSummary = closingPeriodsQuery.data?.summary;
  const closingPeriods = closingPeriodsQuery.data?.periods || [];
  const closingPeriodApprovalPolicy = closingPeriodApprovalPolicyQuery.data || null;
  const budgetRealizationSummary = budgetRealizationQuery.data || null;

  useEffect(() => {
    if (bankReconciliationAccountId === '' && activeBankAccounts[0]?.id) {
      setBankReconciliationAccountId(activeBankAccounts[0].id);
    }
  }, [activeBankAccounts, bankReconciliationAccountId]);

  useEffect(() => {
    if (ledgerBookFilter === 'CASHBOOK' && ledgerBankAccountId !== '') {
      setLedgerBankAccountId('');
    }
  }, [ledgerBankAccountId, ledgerBookFilter]);

  useEffect(() => {
    if (paymentMethod !== 'CASH' && paymentBankAccountId === '' && activeBankAccounts[0]?.id) {
      setPaymentBankAccountId(activeBankAccounts[0].id);
    }
    if (paymentMethod === 'CASH' && paymentBankAccountId !== '') {
      setPaymentBankAccountId('');
    }
  }, [activeBankAccounts, paymentBankAccountId, paymentMethod]);

  useEffect(() => {
    if (refundMethod !== 'CASH' && refundBankAccountId === '' && activeBankAccounts[0]?.id) {
      setRefundBankAccountId(activeBankAccounts[0].id);
    }
    if (refundMethod === 'CASH' && refundBankAccountId !== '') {
      setRefundBankAccountId('');
    }
  }, [activeBankAccounts, refundBankAccountId, refundMethod]);

  useEffect(() => {
    if (!bankReconciliations.length) {
      setSelectedBankReconciliationId(null);
      return;
    }
    if (
      selectedBankReconciliationId == null ||
      !bankReconciliations.some((reconciliation) => reconciliation.id === selectedBankReconciliationId)
    ) {
      setSelectedBankReconciliationId(bankReconciliations[0].id);
    }
  }, [bankReconciliations, selectedBankReconciliationId]);

  useEffect(() => {
    if (!reminderPolicy) return;
    applyReminderPolicyToForm(reminderPolicy);
  }, [reminderPolicy?.updatedAt]);

  useEffect(() => {
    if (!cashSessionApprovalPolicy) return;
    applyCashSessionApprovalPolicyToForm(cashSessionApprovalPolicy);
  }, [cashSessionApprovalPolicy?.updatedAt]);

  useEffect(() => {
    if (!closingPeriodApprovalPolicy) return;
    applyClosingPeriodApprovalPolicyToForm(closingPeriodApprovalPolicy);
  }, [closingPeriodApprovalPolicy?.updatedAt]);

  const studentLookup = useMemo(() => {
    return new Map(students.map((student) => [student.id, student]));
  }, [students]);

  const selectedInvoiceStudents = useMemo(
    () =>
      invoiceSelectedStudentIds
        .map((studentId) => studentLookup.get(studentId))
        .filter((student): student is User => Boolean(student)),
    [invoiceSelectedStudentIds, studentLookup],
  );

  const invoiceStudentCandidates = useMemo(() => {
    const keyword = invoiceStudentSearch.trim().toLowerCase();
    return students
      .filter((student) => !invoiceSelectedStudentIds.includes(student.id))
      .filter((student) => {
        if (!keyword) return true;
        const haystack = [
          student.name,
          student.username,
          student.nis || '',
          student.nisn || '',
          student.studentClass?.name || '',
          student.studentClass?.major?.name || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, keyword ? 12 : 8);
  }, [invoiceSelectedStudentIds, invoiceStudentSearch, students]);

  const selectedAdjustmentStudent = useMemo(
    () => (adjustmentStudentId === '' ? null : studentLookup.get(Number(adjustmentStudentId)) || null),
    [adjustmentStudentId, studentLookup],
  );

  const adjustmentStudentCandidates = useMemo(() => {
    const keyword = adjustmentStudentSearch.trim().toLowerCase();
    return students
      .filter((student) => (adjustmentStudentId === '' ? true : student.id !== Number(adjustmentStudentId)))
      .filter((student) => {
        if (!keyword) return true;
        const haystack = [
          student.name,
          student.username,
          student.nis || '',
          student.nisn || '',
          student.studentClass?.name || '',
          student.studentClass?.major?.name || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, keyword ? 8 : 6);
  }, [adjustmentStudentId, adjustmentStudentSearch, students]);

  const activeYear = useMemo(() => years.find((year) => year.isActive), [years]);

  const reportsQuery = useQuery({
    queryKey: [
      'staff-finance-reports',
      reportYearId || null,
      reportSemester || null,
      reportGradeLevelFilter || null,
      reportPeriodFrom || null,
      reportPeriodTo || null,
      reportAsOfDate || null,
    ],
    queryFn: () =>
      staffFinanceService.listReports({
        academicYearId: reportYearId === '' ? activeYear?.id : Number(reportYearId),
        semester: reportSemester === '' ? undefined : reportSemester,
        gradeLevel: reportGradeLevelFilter.trim() || undefined,
        periodFrom: reportPeriodFrom.trim() || undefined,
        periodTo: reportPeriodTo.trim() || undefined,
        asOfDate: reportAsOfDate || undefined,
      }),
  });

  const components = componentsQuery.data || [];
  const tariffs = tariffsQuery.data || [];
  const adjustments = adjustmentsQuery.data || [];
  const invoices = invoicesQuery.data?.invoices || [];
  const invoiceSummary = invoicesQuery.data?.summary;
  const creditSummary = creditsQuery.data?.summary;
  const creditBalances = creditsQuery.data?.balances || [];
  const recentRefunds = creditsQuery.data?.recentRefunds || [];
  const cashSessionSummary = cashSessionsQuery.data?.summary;
  const cashSessions = cashSessionsQuery.data?.sessions || [];
  const activeCashSession = cashSessionsQuery.data?.activeSession || null;
  const selectedBankReconciliation =
    bankReconciliations.find((reconciliation) => reconciliation.id === selectedBankReconciliationId) ||
    bankReconciliations[0] ||
    null;
  const writeOffSummary = writeOffsQuery.data?.summary;
  const writeOffRequests = writeOffsQuery.data?.requests || [];
  const paymentReversalSummary = paymentReversalsQuery.data?.summary;
  const paymentReversalRequests = paymentReversalsQuery.data?.requests || [];
  const paymentPreviewAmount = Number(paymentAmount || 0);
  const paymentAllocatedAmount = Math.min(paymentPreviewAmount, Number(selectedInvoice?.balanceAmount || 0));
  const paymentCreditedAmount = Math.max(paymentPreviewAmount - Number(selectedInvoice?.balanceAmount || 0), 0);
  const selectedInvoiceInstallments = selectedInvoice?.installments || [];
  const selectedInvoiceNextInstallment =
    selectedInvoice?.installmentSummary?.nextInstallment ||
    selectedInvoiceInstallments.find((installment) => installment.balanceAmount > 0) ||
    null;
  const selectedInvoiceCreditAppliedAmount = (selectedInvoice?.payments || [])
    .filter((payment) => payment.source === 'CREDIT_BALANCE')
    .reduce((sum, payment) => sum + Number(payment.allocatedAmount || payment.amount || 0), 0);
  const selectedInvoiceCanEditAmounts =
    Number(selectedInvoice?.paidAmount || 0) + Number(selectedInvoice?.writtenOffAmount || 0) <= 0;
  const selectedInvoicePaymentReversals = useMemo(
    () =>
      selectedInvoice
        ? paymentReversalRequests.filter((request) => request.invoiceId === selectedInvoice.id)
        : [],
    [paymentReversalRequests, selectedInvoice],
  );
  const overdueCount = useMemo(() => {
    const today = Date.now();
    return invoices.filter((invoice) => {
      if (!invoice.dueDate) return false;
      if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return false;
      return new Date(invoice.dueDate).getTime() < today;
    }).length;
  }, [invoices]);

  const classOutstanding = useMemo(() => {
    const map = new Map<string, { className: string; totalOutstanding: number; totalInvoices: number }>();
    for (const invoice of invoices) {
      const className = invoice.student.studentClass?.name || 'Tanpa Kelas';
      const prev = map.get(className) || { className, totalOutstanding: 0, totalInvoices: 0 };
      prev.totalOutstanding += Number(invoice.balanceAmount || 0);
      prev.totalInvoices += 1;
      map.set(className, prev);
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 5);
  }, [invoices]);

  const reportSnapshot = reportsQuery.data as FinanceReportSnapshot | undefined;

  useEffect(() => {
    resetCashSessionCloseForm(activeCashSession);
  }, [activeCashSession?.id, activeCashSession?.expectedClosingBalance]);

  const resetComponentForm = () => {
    setEditingComponentId(null);
    setComponentCode('');
    setComponentName('');
    setComponentDescription('');
    setComponentPeriodicity('MONTHLY');
    setComponentLateFeeEnabled(false);
    setComponentLateFeeMode('FIXED');
    setComponentLateFeeAmount('');
    setComponentLateFeeGraceDays('0');
    setComponentLateFeeCapAmount('');
  };

  const openCreateComponentModal = () => {
    resetComponentForm();
    setIsComponentModalOpen(true);
  };

  const closeComponentModal = () => {
    setIsComponentModalOpen(false);
    resetComponentForm();
  };

  const resetTariffForm = () => {
    setEditingTariffId(null);
    setTariffComponentId('');
    setTariffAcademicYearId('');
    setTariffMajorId('');
    setTariffSemester('');
    setTariffGradeLevel('');
    setTariffAmount('');
    setTariffEffectiveStart('');
    setTariffEffectiveEnd('');
    setTariffNotes('');
  };

  const openCreateTariffModal = () => {
    resetTariffForm();
    setIsTariffModalOpen(true);
  };

  const closeTariffModal = () => {
    setIsTariffModalOpen(false);
    resetTariffForm();
  };

  const applyReminderPolicyToForm = (policy: FinanceReminderPolicy) => {
    setReminderPolicyIsActive(policy.isActive);
    setReminderDueSoonDays(String(policy.dueSoonDays));
    setReminderDueSoonRepeatIntervalDays(String(policy.dueSoonRepeatIntervalDays));
    setReminderOverdueRepeatIntervalDays(String(policy.overdueRepeatIntervalDays));
    setReminderLateFeeWarningEnabled(policy.lateFeeWarningEnabled);
    setReminderLateFeeWarningRepeatIntervalDays(String(policy.lateFeeWarningRepeatIntervalDays));
    setReminderEscalationEnabled(policy.escalationEnabled);
    setReminderEscalationStartDays(String(policy.escalationStartDays));
    setReminderEscalationRepeatIntervalDays(String(policy.escalationRepeatIntervalDays));
    setReminderEscalationMinOutstandingAmount(String(Number(policy.escalationMinOutstandingAmount || 0)));
    setReminderSendStudent(policy.sendStudentReminder);
    setReminderSendParent(policy.sendParentReminder);
    setReminderEscalateToFinanceStaff(policy.escalateToFinanceStaff);
    setReminderEscalateToHeadTu(policy.escalateToHeadTu);
    setReminderEscalateToPrincipal(policy.escalateToPrincipal);
    setReminderPolicyNotes(policy.notes || '');
  };

  const applyCashSessionApprovalPolicyToForm = (policy: FinanceCashSessionApprovalPolicy) => {
    setCashSessionZeroVarianceAutoApproved(policy.zeroVarianceAutoApproved);
    setCashSessionRequireVarianceNote(policy.requireVarianceNote);
    setCashSessionPrincipalApprovalThresholdAmount(String(Number(policy.principalApprovalThresholdAmount || 0)));
    setCashSessionApprovalPolicyNotes(policy.notes || '');
  };

  const applyClosingPeriodApprovalPolicyToForm = (policy: FinanceClosingPeriodApprovalPolicy) => {
    setClosingPeriodRequireHeadTuApproval(policy.requireHeadTuApproval);
    setClosingPeriodPrincipalApprovalThresholdAmount(
      String(Number(policy.principalApprovalThresholdAmount || 0)),
    );
    setClosingPeriodEscalateIfPendingVerification(policy.escalateIfPendingVerification);
    setClosingPeriodEscalateIfUnmatchedBankEntries(policy.escalateIfUnmatchedBankEntries);
    setClosingPeriodEscalateIfOpenCashSession(policy.escalateIfOpenCashSession);
    setClosingPeriodEscalateIfOpenReconciliation(policy.escalateIfOpenReconciliation);
    setClosingPeriodPolicyNotes(policy.notes || '');
  };

  const openReminderPolicyModal = () => {
    if (reminderPolicy) {
      applyReminderPolicyToForm(reminderPolicy);
    }
    setIsReminderPolicyModalOpen(true);
  };

  const closeReminderPolicyModal = () => {
    setIsReminderPolicyModalOpen(false);
    if (reminderPolicy) {
      applyReminderPolicyToForm(reminderPolicy);
    }
  };

  const resetAdjustmentForm = () => {
    setEditingAdjustmentId(null);
    setAdjustmentCode('');
    setAdjustmentName('');
    setAdjustmentDescription('');
    setAdjustmentKind('DISCOUNT');
    setAdjustmentAmount('');
    setAdjustmentComponentId('');
    setAdjustmentAcademicYearId('');
    setAdjustmentMajorId('');
    setAdjustmentStudentId('');
    setAdjustmentStudentSearch('');
    setAdjustmentSemester('');
    setAdjustmentGradeLevel('');
    setAdjustmentEffectiveStart('');
    setAdjustmentEffectiveEnd('');
    setAdjustmentNotes('');
  };

  const resetRefundForm = () => {
    setSelectedCreditBalance(null);
    setRefundAmount('');
    setRefundMethod('BANK_TRANSFER');
    setRefundBankAccountId('');
    setRefundReference('');
    setRefundNote('');
  };

  const resetBankAccountForm = () => {
    setEditingBankAccountId(null);
    setBankAccountCode('');
    setBankAccountBankName('');
    setBankAccountAccountName('');
    setBankAccountNumber('');
    setBankAccountBranch('');
    setBankAccountNotes('');
  };

  const resetBankReconciliationForm = () => {
    setBankReconciliationPeriodStart(getTodayInputDate());
    setBankReconciliationPeriodEnd(getTodayInputDate());
    setBankReconciliationOpeningBalance('0');
    setBankReconciliationClosingBalance('0');
    setBankReconciliationNote('');
    setBankStatementEntryDate(getTodayInputDate());
    setBankStatementDirection('CREDIT');
    setBankStatementAmount('');
    setBankStatementReference('');
    setBankStatementDescription('');
  };

  const resetBankStatementEntryForm = () => {
    setBankStatementEntryDate(getTodayInputDate());
    setBankStatementDirection('CREDIT');
    setBankStatementAmount('');
    setBankStatementReference('');
    setBankStatementDescription('');
  };

  const resetWriteOffForm = () => {
    setWriteOffTargetInvoice(null);
    setWriteOffAmount('');
    setWriteOffReason('');
    setWriteOffNote('');
  };

  const resetReversalForm = () => {
    setReversalTargetPayment(null);
    setReversalAmount('');
    setReversalReason('');
    setReversalNote('');
  };

  const resetCashSessionOpenForm = () => {
    setCashSessionBusinessDate(getTodayInputDate());
    setCashSessionOpeningBalance('0');
    setCashSessionOpeningNote('');
  };

  const resetCashSessionCloseForm = (session?: FinanceCashSession | null) => {
    setCashSessionActualClosingBalance(
      session ? String(Number(session.expectedClosingBalance || 0)) : '',
    );
    setCashSessionClosingNote('');
  };

  const openWriteOffModal = (invoice: FinanceInvoice) => {
    setWriteOffTargetInvoice(invoice);
    setWriteOffAmount(String(Number(invoice.balanceAmount || 0)));
    setWriteOffReason('');
    setWriteOffNote('');
  };

  const openReversalModal = (payment: FinanceInvoice['payments'][number]) => {
    setReversalTargetPayment(payment);
    setReversalAmount(String(Number(payment.remainingReversibleAmount || 0)));
    setReversalReason('');
    setReversalNote('');
  };

  const saveComponentMutation = useMutation({
    mutationFn: () =>
      editingComponentId
        ? staffFinanceService.updateComponent(editingComponentId, {
            code: componentCode,
            name: componentName,
            description: componentDescription || '',
            periodicity: componentPeriodicity,
            lateFeeEnabled: componentLateFeeEnabled,
            lateFeeMode: componentLateFeeMode,
            lateFeeAmount: componentLateFeeEnabled ? Number(componentLateFeeAmount || 0) : 0,
            lateFeeGraceDays: Number(componentLateFeeGraceDays || 0),
            lateFeeCapAmount:
              componentLateFeeEnabled && componentLateFeeCapAmount !== ''
                ? Number(componentLateFeeCapAmount)
                : null,
          })
        : staffFinanceService.createComponent({
            code: componentCode,
            name: componentName,
            description: componentDescription || undefined,
            periodicity: componentPeriodicity,
            lateFeeEnabled: componentLateFeeEnabled,
            lateFeeMode: componentLateFeeMode,
            lateFeeAmount: componentLateFeeEnabled ? Number(componentLateFeeAmount || 0) : 0,
            lateFeeGraceDays: Number(componentLateFeeGraceDays || 0),
            lateFeeCapAmount:
              componentLateFeeEnabled && componentLateFeeCapAmount !== ''
                ? Number(componentLateFeeCapAmount)
                : null,
          }),
    onSuccess: () => {
      toast.success(editingComponentId ? 'Komponen berhasil diperbarui' : 'Komponen berhasil ditambahkan');
      closeComponentModal();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-components'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-tariffs'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan komponen');
    },
  });

  const toggleComponentMutation = useMutation({
    mutationFn: ({ componentId, isActive }: { componentId: number; isActive: boolean }) =>
      staffFinanceService.updateComponent(componentId, { isActive }),
    onSuccess: (_, payload) => {
      toast.success(payload.isActive ? 'Komponen diaktifkan' : 'Komponen dinonaktifkan');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-components'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-tariffs'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengubah status komponen');
    },
  });

  const saveTariffMutation = useMutation({
    mutationFn: () =>
      editingTariffId
        ? staffFinanceService.updateTariff(editingTariffId, {
            componentId: Number(tariffComponentId),
            academicYearId: tariffAcademicYearId === '' ? null : Number(tariffAcademicYearId),
            classId: null,
            majorId: tariffMajorId === '' ? null : Number(tariffMajorId),
            semester: tariffSemester === '' ? null : tariffSemester,
            gradeLevel: tariffGradeLevel.trim() || null,
            amount: Number(tariffAmount),
            effectiveStart: tariffEffectiveStart || null,
            effectiveEnd: tariffEffectiveEnd || null,
            notes: tariffNotes || null,
          })
        : staffFinanceService.createTariff({
            componentId: Number(tariffComponentId),
            academicYearId: tariffAcademicYearId === '' ? undefined : Number(tariffAcademicYearId),
            majorId: tariffMajorId === '' ? undefined : Number(tariffMajorId),
            semester: tariffSemester === '' ? undefined : tariffSemester,
            gradeLevel: tariffGradeLevel.trim() || undefined,
            amount: Number(tariffAmount),
            effectiveStart: tariffEffectiveStart || undefined,
            effectiveEnd: tariffEffectiveEnd || undefined,
            notes: tariffNotes || undefined,
          }),
    onSuccess: () => {
      toast.success(editingTariffId ? 'Tarif berhasil diperbarui' : 'Tarif berhasil ditambahkan');
      closeTariffModal();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-tariffs'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan tarif');
    },
  });

  const toggleTariffMutation = useMutation({
    mutationFn: ({ tariffId, isActive }: { tariffId: number; isActive: boolean }) =>
      staffFinanceService.updateTariff(tariffId, { isActive }),
    onSuccess: (_, payload) => {
      toast.success(payload.isActive ? 'Tarif diaktifkan' : 'Tarif dinonaktifkan');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-tariffs'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengubah status tarif');
    },
  });

  const saveAdjustmentMutation = useMutation({
    mutationFn: () =>
      editingAdjustmentId
        ? staffFinanceService.updateAdjustment(editingAdjustmentId, {
            code: adjustmentCode,
            name: adjustmentName,
            description: adjustmentDescription.trim() || null,
            kind: adjustmentKind,
            amount: Number(adjustmentAmount),
            componentId: adjustmentComponentId === '' ? null : Number(adjustmentComponentId),
            academicYearId: adjustmentAcademicYearId === '' ? null : Number(adjustmentAcademicYearId),
            classId: null,
            majorId: adjustmentMajorId === '' ? null : Number(adjustmentMajorId),
            studentId: adjustmentStudentId === '' ? null : Number(adjustmentStudentId),
            semester: adjustmentSemester === '' ? null : adjustmentSemester,
            gradeLevel: adjustmentGradeLevel.trim() || null,
            effectiveStart: adjustmentEffectiveStart || null,
            effectiveEnd: adjustmentEffectiveEnd || null,
            notes: adjustmentNotes.trim() || null,
          })
        : staffFinanceService.createAdjustment({
            code: adjustmentCode,
            name: adjustmentName,
            description: adjustmentDescription.trim() || undefined,
            kind: adjustmentKind,
            amount: Number(adjustmentAmount),
            componentId: adjustmentComponentId === '' ? undefined : Number(adjustmentComponentId),
            academicYearId: adjustmentAcademicYearId === '' ? undefined : Number(adjustmentAcademicYearId),
            majorId: adjustmentMajorId === '' ? undefined : Number(adjustmentMajorId),
            studentId: adjustmentStudentId === '' ? undefined : Number(adjustmentStudentId),
            semester: adjustmentSemester === '' ? undefined : adjustmentSemester,
            gradeLevel: adjustmentGradeLevel.trim() || undefined,
            effectiveStart: adjustmentEffectiveStart || undefined,
            effectiveEnd: adjustmentEffectiveEnd || undefined,
            notes: adjustmentNotes.trim() || undefined,
          }),
    onSuccess: () => {
      toast.success(editingAdjustmentId ? 'Rule penyesuaian berhasil diperbarui' : 'Rule penyesuaian berhasil ditambahkan');
      resetAdjustmentForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan rule penyesuaian');
    },
  });

  const toggleAdjustmentMutation = useMutation({
    mutationFn: ({ adjustmentId, isActive }: { adjustmentId: number; isActive: boolean }) =>
      staffFinanceService.updateAdjustment(adjustmentId, { isActive }),
    onSuccess: (_, payload) => {
      toast.success(payload.isActive ? 'Rule penyesuaian diaktifkan' : 'Rule penyesuaian dinonaktifkan');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengubah status rule penyesuaian');
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.generateInvoices({
        academicYearId: invoiceYearId === '' ? undefined : Number(invoiceYearId),
        semester: invoiceSemester,
        periodKey: invoicePeriodKey,
        dueDate: invoiceDueDate || undefined,
        title: invoiceTitle || undefined,
        majorId: invoiceMajorId === '' ? undefined : Number(invoiceMajorId),
        gradeLevel: invoiceGradeLevel.trim() || undefined,
        installmentCount: Math.max(1, Number(invoiceInstallmentCount || 1)),
        installmentIntervalDays: Math.max(1, Number(invoiceInstallmentIntervalDays || 30)),
        autoApplyCreditBalance: invoiceAutoApplyCreditBalance,
        studentIds: invoiceSelectedStudentIds.length > 0 ? invoiceSelectedStudentIds : undefined,
        replaceExisting: invoiceReplaceExisting,
      }),
    onSuccess: (data) => {
      toast.success(
        `Generate tagihan selesai: ${data.summary.created} baru, ${data.summary.updated} diperbarui`,
      );
      previewInvoiceMutation.reset();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal generate tagihan');
    },
  });

  const previewInvoiceMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.previewInvoices({
        academicYearId: invoiceYearId === '' ? undefined : Number(invoiceYearId),
        semester: invoiceSemester,
        periodKey: invoicePeriodKey,
        dueDate: invoiceDueDate || undefined,
        title: invoiceTitle || undefined,
        majorId: invoiceMajorId === '' ? undefined : Number(invoiceMajorId),
        gradeLevel: invoiceGradeLevel.trim() || undefined,
        installmentCount: Math.max(1, Number(invoiceInstallmentCount || 1)),
        installmentIntervalDays: Math.max(1, Number(invoiceInstallmentIntervalDays || 30)),
        autoApplyCreditBalance: invoiceAutoApplyCreditBalance,
        studentIds: invoiceSelectedStudentIds.length > 0 ? invoiceSelectedStudentIds : undefined,
        replaceExisting: invoiceReplaceExisting,
      }),
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal membuat preview generate tagihan');
    },
  });

  const payInvoiceMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) {
        throw new Error('Tagihan belum dipilih');
      }
      return staffFinanceService.payInvoice(selectedInvoice.id, {
        amount: Number(paymentAmount),
        method: paymentMethod,
        bankAccountId: paymentBankAccountId === '' ? undefined : Number(paymentBankAccountId),
        referenceNo: paymentReference || undefined,
        note: paymentNote || undefined,
      });
    },
    onSuccess: (data) => {
      toast.success(
        data.payment.verificationStatus === 'PENDING'
          ? 'Pembayaran non-tunai dicatat dan masuk antrean verifikasi'
          : 'Pembayaran berhasil dicatat',
      );
      setSelectedInvoice(null);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNote('');
      setPaymentMethod('CASH');
      setPaymentBankAccountId('');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-verifications'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mencatat pembayaran');
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: (paymentId: number) => staffFinanceService.verifyPayment(paymentId),
    onSuccess: () => {
      toast.success('Pembayaran non-tunai berhasil diverifikasi');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-verifications'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memverifikasi pembayaran');
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: (paymentId: number) => staffFinanceService.rejectPayment(paymentId),
    onSuccess: () => {
      toast.success('Pembayaran non-tunai berhasil ditolak');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-verifications'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menolak pembayaran');
    },
  });

  const updateInstallmentsMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) {
        throw new Error('Tagihan belum dipilih');
      }

      return staffFinanceService.updateInvoiceInstallments(selectedInvoice.id, {
        installments: installmentDrafts.map((draft) => ({
          sequence: draft.sequence,
          amount: Number(draft.amount),
          dueDate: draft.dueDate || null,
        })),
        note: installmentScheduleNote.trim() || undefined,
      });
    },
    onSuccess: (invoice) => {
      toast.success('Jadwal cicilan berhasil diperbarui');
      setSelectedInvoice(invoice);
      setInstallmentScheduleNote('');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memperbarui jadwal cicilan');
    },
  });

  const applyLateFeesMutation = useMutation({
    mutationFn: (invoice: FinanceInvoice) => staffFinanceService.applyInvoiceLateFees(invoice.id),
    onSuccess: (invoice) => {
      toast.success('Denda keterlambatan berhasil diterapkan');
      setSelectedInvoice(invoice);
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menerapkan denda keterlambatan');
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedCreditBalance) {
        throw new Error('Saldo kredit belum dipilih');
      }
      return staffFinanceService.createRefund(selectedCreditBalance.studentId, {
        amount: Number(refundAmount),
        method: refundMethod,
        bankAccountId: refundBankAccountId === '' ? undefined : Number(refundBankAccountId),
        referenceNo: refundReference || undefined,
        note: refundNote || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Refund saldo kredit berhasil dicatat');
      resetRefundForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mencatat refund saldo kredit');
    },
  });

  const saveBankAccountMutation = useMutation({
    mutationFn: () =>
      editingBankAccountId
        ? staffFinanceService.updateBankAccount(editingBankAccountId, {
            code: bankAccountCode,
            bankName: bankAccountBankName,
            accountName: bankAccountAccountName,
            accountNumber: bankAccountNumber,
            branch: bankAccountBranch || undefined,
            notes: bankAccountNotes || undefined,
          })
        : staffFinanceService.createBankAccount({
            code: bankAccountCode,
            bankName: bankAccountBankName,
            accountName: bankAccountAccountName,
            accountNumber: bankAccountNumber,
            branch: bankAccountBranch || undefined,
            notes: bankAccountNotes || undefined,
          }),
    onSuccess: () => {
      toast.success(editingBankAccountId ? 'Rekening bank berhasil diperbarui' : 'Rekening bank berhasil ditambahkan');
      resetBankAccountForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan rekening bank');
    },
  });

  const toggleBankAccountMutation = useMutation({
    mutationFn: (account: FinanceBankAccount) =>
      staffFinanceService.updateBankAccount(account.id, { isActive: !account.isActive }),
    onSuccess: (_, account) => {
      toast.success(account.isActive ? 'Rekening bank dinonaktifkan' : 'Rekening bank diaktifkan');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengubah status rekening bank');
    },
  });

  const createBankReconciliationMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.createBankReconciliation({
        bankAccountId: Number(bankReconciliationAccountId),
        periodStart: bankReconciliationPeriodStart,
        periodEnd: bankReconciliationPeriodEnd,
        statementOpeningBalance: Number(bankReconciliationOpeningBalance || 0),
        statementClosingBalance: Number(bankReconciliationClosingBalance || 0),
        note: bankReconciliationNote.trim() || undefined,
      }),
    onSuccess: (reconciliation) => {
      toast.success('Rekonsiliasi bank berhasil dibuat');
      setSelectedBankReconciliationId(reconciliation.id);
      resetBankReconciliationForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal membuat rekonsiliasi bank');
    },
  });

  const createBankStatementEntryMutation = useMutation({
    mutationFn: (reconciliation: FinanceBankReconciliation) =>
      staffFinanceService.createBankStatementEntry(reconciliation.id, {
        entryDate: bankStatementEntryDate,
        direction: bankStatementDirection,
        amount: Number(bankStatementAmount || 0),
        referenceNo: bankStatementReference.trim() || undefined,
        description: bankStatementDescription.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Mutasi statement bank berhasil dicatat');
      resetBankStatementEntryForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-verifications'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mencatat mutasi statement bank');
    },
  });

  const finalizeBankReconciliationMutation = useMutation({
    mutationFn: (reconciliation: FinanceBankReconciliation) =>
      staffFinanceService.finalizeBankReconciliation(reconciliation.id, {
        note: bankReconciliationNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Rekonsiliasi bank berhasil difinalkan');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memfinalkan rekonsiliasi bank');
    },
  });

  const openCashSessionMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.openCashSession({
        businessDate: cashSessionBusinessDate,
        openingBalance: Number(cashSessionOpeningBalance || 0),
        note: cashSessionOpeningNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Sesi kas harian berhasil dibuka');
      resetCashSessionOpenForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-sessions'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal membuka sesi kas harian');
    },
  });

  const closeCashSessionMutation = useMutation({
    mutationFn: (session: FinanceCashSession) =>
      staffFinanceService.closeCashSession(session.id, {
        actualClosingBalance: Number(cashSessionActualClosingBalance || 0),
        note: cashSessionClosingNote.trim() || undefined,
      }),
    onSuccess: (session) => {
      const approvalLabel =
        session.approvalStatus === 'PENDING_HEAD_TU'
          ? 'dan menunggu review Head TU'
          : session.approvalStatus === 'AUTO_APPROVED'
            ? 'dan auto-approved'
            : '';
      toast.success(`Sesi kas harian berhasil ditutup ${approvalLabel}`.trim());
      resetCashSessionCloseForm(null);
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-sessions'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menutup sesi kas harian');
    },
  });

  const createWriteOffMutation = useMutation({
    mutationFn: () => {
      if (!writeOffTargetInvoice) {
        throw new Error('Tagihan belum dipilih');
      }
      return staffFinanceService.createWriteOffRequest(writeOffTargetInvoice.id, {
        amount: Number(writeOffAmount),
        reason: writeOffReason,
        note: writeOffNote || undefined,
      });
    },
    onSuccess: (request) => {
      toast.success('Pengajuan write-off berhasil dikirim ke Kepala TU');
      if (selectedInvoice?.id === request.invoiceId && selectedInvoice) {
        setSelectedInvoice({
          ...selectedInvoice,
          writeOffRequests: [request, ...(selectedInvoice.writeOffRequests || [])],
        });
      }
      resetWriteOffForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-write-offs'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal membuat pengajuan write-off');
    },
  });

  const applyWriteOffMutation = useMutation({
    mutationFn: (request: FinanceWriteOffRequest) => staffFinanceService.applyWriteOff(request.id),
    onSuccess: (result) => {
      toast.success('Write-off berhasil diterapkan ke invoice');
      setSelectedInvoice(result.invoice);
      queryClient.invalidateQueries({ queryKey: ['staff-finance-write-offs'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menerapkan write-off');
    },
  });

  const createPaymentReversalMutation = useMutation({
    mutationFn: () => {
      if (!reversalTargetPayment) {
        throw new Error('Pembayaran belum dipilih');
      }
      return staffFinanceService.createPaymentReversalRequest(reversalTargetPayment.id, {
        amount: Number(reversalAmount),
        reason: reversalReason,
        note: reversalNote || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Pengajuan reversal pembayaran berhasil dikirim ke Kepala TU');
      resetReversalForm();
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-reversals'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal membuat pengajuan reversal pembayaran');
    },
  });

  const applyPaymentReversalMutation = useMutation({
    mutationFn: (request: FinancePaymentReversalRequest) => staffFinanceService.applyPaymentReversal(request.id),
    onSuccess: (result) => {
      toast.success('Reversal pembayaran berhasil diterapkan');
      setSelectedInvoice(result.invoice);
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-reversals'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menerapkan reversal pembayaran');
    },
  });

  const saveReminderPolicyMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.updateReminderPolicy({
        isActive: reminderPolicyIsActive,
        dueSoonDays: Math.max(0, Number(reminderDueSoonDays || 0)),
        dueSoonRepeatIntervalDays: Math.max(1, Number(reminderDueSoonRepeatIntervalDays || 1)),
        overdueRepeatIntervalDays: Math.max(1, Number(reminderOverdueRepeatIntervalDays || 1)),
        lateFeeWarningEnabled: reminderLateFeeWarningEnabled,
        lateFeeWarningRepeatIntervalDays: Math.max(1, Number(reminderLateFeeWarningRepeatIntervalDays || 1)),
        escalationEnabled: reminderEscalationEnabled,
        escalationStartDays: Math.max(1, Number(reminderEscalationStartDays || 1)),
        escalationRepeatIntervalDays: Math.max(1, Number(reminderEscalationRepeatIntervalDays || 1)),
        escalationMinOutstandingAmount: Math.max(0, Number(reminderEscalationMinOutstandingAmount || 0)),
        sendStudentReminder: reminderSendStudent,
        sendParentReminder: reminderSendParent,
        escalateToFinanceStaff: reminderEscalateToFinanceStaff,
        escalateToHeadTu: reminderEscalateToHeadTu,
        escalateToPrincipal: reminderEscalateToPrincipal,
        notes: reminderPolicyNotes.trim() || null,
      }),
    onSuccess: (policy) => {
      toast.success('Policy reminder finance berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reminder-policy'] });
      applyReminderPolicyToForm(policy);
      setIsReminderPolicyModalOpen(false);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memperbarui policy reminder finance');
    },
  });

  const saveCashSessionApprovalPolicyMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.updateCashSessionApprovalPolicy({
        zeroVarianceAutoApproved: cashSessionZeroVarianceAutoApproved,
        requireVarianceNote: cashSessionRequireVarianceNote,
        principalApprovalThresholdAmount: Math.max(
          0,
          Number(cashSessionPrincipalApprovalThresholdAmount || 0),
        ),
        notes: cashSessionApprovalPolicyNotes.trim() || null,
      }),
    onSuccess: (policy) => {
      toast.success('Policy approval settlement kas berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-session-policy'] });
      applyCashSessionApprovalPolicyToForm(policy);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memperbarui policy approval settlement kas');
    },
  });

  const saveClosingPeriodApprovalPolicyMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.updateClosingPeriodApprovalPolicy({
        requireHeadTuApproval: closingPeriodRequireHeadTuApproval,
        principalApprovalThresholdAmount: Math.max(
          0,
          Number(closingPeriodPrincipalApprovalThresholdAmount || 0),
        ),
        escalateIfPendingVerification: closingPeriodEscalateIfPendingVerification,
        escalateIfUnmatchedBankEntries: closingPeriodEscalateIfUnmatchedBankEntries,
        escalateIfOpenCashSession: closingPeriodEscalateIfOpenCashSession,
        escalateIfOpenReconciliation: closingPeriodEscalateIfOpenReconciliation,
        notes: closingPeriodPolicyNotes.trim() || null,
      }),
    onSuccess: (policy) => {
      toast.success('Policy approval closing period berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-closing-period-policy'] });
      applyClosingPeriodApprovalPolicyToForm(policy);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memperbarui policy closing period');
    },
  });

  const createClosingPeriodMutation = useMutation({
    mutationFn: () =>
      staffFinanceService.createClosingPeriod({
        periodType: closingPeriodType,
        periodYear: Number(closingPeriodYear || 0),
        periodMonth: closingPeriodType === 'MONTHLY' ? Number(closingPeriodMonth || 0) : undefined,
        label: closingPeriodLabel.trim() || undefined,
        note: closingPeriodNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Closing period berhasil diajukan');
      setClosingPeriodLabel('');
      setClosingPeriodNote('');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-closing-periods'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-ledger-books'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-payment-verifications'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengajukan closing period');
    },
  });

  const dispatchReminderMutation = useMutation({
    mutationFn: (mode: FinanceReminderMode) =>
      staffFinanceService.dispatchDueReminders({
        dueSoonDays: Math.max(0, Number(reminderDueSoonDays || 0)),
        mode,
        preview: false,
      }),
    onSuccess: (data, mode) => {
      const stats = [
        `${data.dueSoonInvoices} due soon`,
        `${data.overdueInvoices} overdue`,
        `${data.lateFeeWarningInvoices} warning denda`,
        `${data.escalatedInvoices} eskalasi`,
      ].join(', ');
      toast.success(
        data.disabledByPolicy && mode === 'ALL'
          ? 'Policy reminder otomatis sedang nonaktif. Aktifkan dulu dari pengaturan.'
          : `Reminder jalan: ${data.createdNotifications} notifikasi dibuat (${stats})`,
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menjalankan reminder jatuh tempo');
    },
  });

  const handleOpenCashSession = () => {
    const openingBalance = Number(cashSessionOpeningBalance || 0);
    if (!cashSessionBusinessDate) {
      toast.error('Tanggal bisnis sesi kas wajib diisi');
      return;
    }
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error('Saldo awal sesi kas tidak valid');
      return;
    }
    openCashSessionMutation.mutate();
  };

  const handleCloseCashSession = (session: FinanceCashSession) => {
    const actualClosingBalance = Number(cashSessionActualClosingBalance || 0);
    if (!Number.isFinite(actualClosingBalance) || actualClosingBalance < 0) {
      toast.error('Saldo aktual penutupan tidak valid');
      return;
    }
    const projectedVariance = actualClosingBalance - Number(session.expectedClosingBalance || 0);
    if (
      cashSessionRequireVarianceNote &&
      Math.abs(projectedVariance) > 0.009 &&
      !cashSessionClosingNote.trim()
    ) {
      toast.error('Catatan closing wajib diisi saat ada selisih settlement kas');
      return;
    }
    closeCashSessionMutation.mutate(session);
  };

  const handleEditBankAccount = (account: FinanceBankAccount) => {
    setEditingBankAccountId(account.id);
    setBankAccountCode(account.code);
    setBankAccountBankName(account.bankName);
    setBankAccountAccountName(account.accountName);
    setBankAccountNumber(account.accountNumber);
    setBankAccountBranch(account.branch || '');
    setBankAccountNotes(account.notes || '');
  };

  const handleSaveBankAccount = () => {
    if (
      !bankAccountCode.trim() ||
      !bankAccountBankName.trim() ||
      !bankAccountAccountName.trim() ||
      !bankAccountNumber.trim()
    ) {
      toast.error('Kode, nama bank, nama akun, dan nomor rekening wajib diisi');
      return;
    }
    saveBankAccountMutation.mutate();
  };

  const handleCreateBankReconciliation = () => {
    if (!bankReconciliationAccountId) {
      toast.error('Pilih rekening bank terlebih dahulu');
      return;
    }
    if (!bankReconciliationPeriodStart || !bankReconciliationPeriodEnd) {
      toast.error('Periode rekonsiliasi wajib diisi');
      return;
    }
    if (bankReconciliationPeriodEnd < bankReconciliationPeriodStart) {
      toast.error('Periode rekonsiliasi tidak valid');
      return;
    }
    if (Number(bankReconciliationClosingBalance || 0) < 0 || Number(bankReconciliationOpeningBalance || 0) < 0) {
      toast.error('Saldo statement tidak boleh negatif');
      return;
    }
    createBankReconciliationMutation.mutate();
  };

  const handleAddBankStatementEntry = (reconciliation: FinanceBankReconciliation) => {
    if (!bankStatementEntryDate) {
      toast.error('Tanggal mutasi bank wajib diisi');
      return;
    }
    if (Number(bankStatementAmount || 0) <= 0) {
      toast.error('Nominal mutasi bank harus lebih dari nol');
      return;
    }
    createBankStatementEntryMutation.mutate(reconciliation);
  };

  const handleFinalizeBankReconciliation = (reconciliation: FinanceBankReconciliation) => {
    if (reconciliation.status === 'FINALIZED') {
      toast.error('Rekonsiliasi bank sudah final');
      return;
    }
    finalizeBankReconciliationMutation.mutate(reconciliation);
  };

  const handleCreateClosingPeriod = () => {
    if (Number(closingPeriodYear || 0) < 2020) {
      toast.error('Tahun closing period tidak valid');
      return;
    }
    if (closingPeriodType === 'MONTHLY' && (Number(closingPeriodMonth || 0) < 1 || Number(closingPeriodMonth || 0) > 12)) {
      toast.error('Bulan closing period tidak valid');
      return;
    }
    createClosingPeriodMutation.mutate();
  };

  const startPaying = (invoice: FinanceInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(String(invoice.balanceAmount || 0));
    setPaymentMethod('CASH');
    setPaymentBankAccountId('');
    setPaymentReference('');
    setPaymentNote('');
  };

  const handleInstallmentDraftChange = (
    sequence: number,
    field: 'amount' | 'dueDate',
    value: string,
  ) => {
    setInstallmentDrafts((current) =>
      current.map((draft) => (draft.sequence === sequence ? { ...draft, [field]: value } : draft)),
    );
  };

  const startRefund = (balance: FinanceCreditBalanceRow) => {
    setSelectedCreditBalance(balance);
    setRefundAmount(String(Number(balance.balanceAmount || 0)));
    setRefundMethod('BANK_TRANSFER');
    setRefundBankAccountId(activeBankAccounts[0]?.id || '');
    setRefundReference('');
    setRefundNote('');
  };

  const handleSaveComponent = () => {
    if (!componentCode.trim() || !componentName.trim()) {
      toast.error('Kode dan nama komponen wajib diisi');
      return;
    }
    if (componentLateFeeEnabled && Number(componentLateFeeAmount || 0) <= 0) {
      toast.error('Nominal denda harus lebih dari 0');
      return;
    }
    if (Number(componentLateFeeGraceDays || 0) < 0) {
      toast.error('Grace period tidak boleh negatif');
      return;
    }
    if (componentLateFeeCapAmount !== '' && Number(componentLateFeeCapAmount) < 0) {
      toast.error('Maksimum denda tidak boleh negatif');
      return;
    }
    saveComponentMutation.mutate();
  };

  const handleSaveTariff = () => {
    if (!tariffComponentId || Number(tariffAmount) <= 0) {
      toast.error('Komponen dan nominal tarif wajib diisi');
      return;
    }
    if (tariffEffectiveStart && tariffEffectiveEnd && tariffEffectiveEnd < tariffEffectiveStart) {
      toast.error('Periode efektif tarif tidak valid');
      return;
    }
    saveTariffMutation.mutate();
  };

  const handleSaveAdjustment = () => {
    if (!adjustmentCode.trim() || !adjustmentName.trim() || Number(adjustmentAmount) <= 0) {
      toast.error('Kode, nama, dan nominal penyesuaian wajib diisi');
      return;
    }
    if (adjustmentEffectiveStart && adjustmentEffectiveEnd && adjustmentEffectiveEnd < adjustmentEffectiveStart) {
      toast.error('Periode efektif penyesuaian tidak valid');
      return;
    }
    saveAdjustmentMutation.mutate();
  };

  const handleSaveReminderPolicy = () => {
    const dueSoonDays = Number(reminderDueSoonDays || 0);
    const dueSoonRepeat = Number(reminderDueSoonRepeatIntervalDays || 0);
    const overdueRepeat = Number(reminderOverdueRepeatIntervalDays || 0);
    const lateFeeRepeat = Number(reminderLateFeeWarningRepeatIntervalDays || 0);
    const escalationStart = Number(reminderEscalationStartDays || 0);
    const escalationRepeat = Number(reminderEscalationRepeatIntervalDays || 0);
    const escalationMinOutstanding = Number(reminderEscalationMinOutstandingAmount || 0);

    if (!Number.isFinite(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 30) {
      toast.error('Due soon harus antara 0 sampai 30 hari');
      return;
    }
    if (!Number.isFinite(dueSoonRepeat) || dueSoonRepeat < 1 || dueSoonRepeat > 30) {
      toast.error('Interval due soon harus antara 1 sampai 30 hari');
      return;
    }
    if (!Number.isFinite(overdueRepeat) || overdueRepeat < 1 || overdueRepeat > 30) {
      toast.error('Interval overdue harus antara 1 sampai 30 hari');
      return;
    }
    if (!Number.isFinite(lateFeeRepeat) || lateFeeRepeat < 1 || lateFeeRepeat > 30) {
      toast.error('Interval warning denda harus antara 1 sampai 30 hari');
      return;
    }
    if (!Number.isFinite(escalationStart) || escalationStart < 1 || escalationStart > 180) {
      toast.error('Mulai eskalasi harus antara 1 sampai 180 hari');
      return;
    }
    if (!Number.isFinite(escalationRepeat) || escalationRepeat < 1 || escalationRepeat > 30) {
      toast.error('Interval eskalasi harus antara 1 sampai 30 hari');
      return;
    }
    if (!Number.isFinite(escalationMinOutstanding) || escalationMinOutstanding < 0) {
      toast.error('Minimum nominal eskalasi tidak valid');
      return;
    }
    if (!reminderSendStudent && !reminderSendParent) {
      toast.error('Pilih minimal satu penerima eksternal: siswa atau orang tua');
      return;
    }
    if (
      reminderEscalationEnabled &&
      !reminderEscalateToFinanceStaff &&
      !reminderEscalateToHeadTu &&
      !reminderEscalateToPrincipal
    ) {
      toast.error('Pilih minimal satu penerima eskalasi internal');
      return;
    }
    saveReminderPolicyMutation.mutate();
  };

  const handleEditComponent = (component: FinanceComponent) => {
    setEditingComponentId(component.id);
    setComponentCode(component.code);
    setComponentName(component.name);
    setComponentDescription(component.description || '');
    setComponentPeriodicity(component.periodicity);
    setComponentLateFeeEnabled(component.lateFeeEnabled);
    setComponentLateFeeMode(component.lateFeeMode);
    setComponentLateFeeAmount(String(Number(component.lateFeeAmount || 0)));
    setComponentLateFeeGraceDays(String(Number(component.lateFeeGraceDays || 0)));
    setComponentLateFeeCapAmount(
      component.lateFeeCapAmount == null ? '' : String(Number(component.lateFeeCapAmount || 0)),
    );
    setIsComponentModalOpen(true);
  };

  const handleEditTariff = (tariff: FinanceTariffRule) => {
    setEditingTariffId(tariff.id);
    setTariffComponentId(tariff.componentId);
    setTariffAcademicYearId(tariff.academicYearId || '');
    setTariffMajorId(tariff.majorId || '');
    setTariffSemester(tariff.semester || '');
    setTariffGradeLevel(tariff.gradeLevel || tariff.class?.level || '');
    setTariffAmount(String(Number(tariff.amount || 0)));
    setTariffEffectiveStart(tariff.effectiveStart ? String(tariff.effectiveStart).slice(0, 10) : '');
    setTariffEffectiveEnd(tariff.effectiveEnd ? String(tariff.effectiveEnd).slice(0, 10) : '');
    setTariffNotes(tariff.notes || '');
    setIsTariffModalOpen(true);
  };

  const handleEditAdjustment = (adjustment: FinanceAdjustmentRule) => {
    setEditingAdjustmentId(adjustment.id);
    setAdjustmentCode(adjustment.code);
    setAdjustmentName(adjustment.name);
    setAdjustmentDescription(adjustment.description || '');
    setAdjustmentKind(adjustment.kind);
    setAdjustmentAmount(String(Number(adjustment.amount || 0)));
    setAdjustmentComponentId(adjustment.componentId || '');
    setAdjustmentAcademicYearId(adjustment.academicYearId || '');
    setAdjustmentMajorId(adjustment.majorId || '');
    setAdjustmentStudentId(adjustment.studentId || '');
    setAdjustmentStudentSearch('');
    setAdjustmentSemester(adjustment.semester || '');
    setAdjustmentGradeLevel(adjustment.gradeLevel || adjustment.class?.level || '');
    setAdjustmentEffectiveStart(adjustment.effectiveStart ? String(adjustment.effectiveStart).slice(0, 10) : '');
    setAdjustmentEffectiveEnd(adjustment.effectiveEnd ? String(adjustment.effectiveEnd).slice(0, 10) : '');
    setAdjustmentNotes(adjustment.notes || '');
  };

  const handleDispatchReminder = (mode: FinanceReminderMode) => {
    const dueSoonDays = Number(reminderDueSoonDays || 0);
    if ((mode === 'ALL' || mode === 'DUE_SOON') && (!Number.isFinite(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 30)) {
      toast.error('Hari reminder harus antara 0 sampai 30');
      return;
    }
    dispatchReminderMutation.mutate(mode);
  };

  const handleGenerateInvoices = () => {
    if (!invoicePeriodKey.trim()) {
      toast.error('Period key wajib diisi, contoh 2026-03');
      return;
    }
    if (!Number.isFinite(invoiceInstallmentCount) || invoiceInstallmentCount < 1 || invoiceInstallmentCount > 24) {
      toast.error('Jumlah cicilan harus antara 1 sampai 24');
      return;
    }
    if (
      !Number.isFinite(invoiceInstallmentIntervalDays) ||
      invoiceInstallmentIntervalDays < 1 ||
      invoiceInstallmentIntervalDays > 180
    ) {
      toast.error('Jarak antar cicilan harus antara 1 sampai 180 hari');
      return;
    }
    generateInvoiceMutation.mutate();
  };

  const handlePreviewInvoices = () => {
    if (!invoicePeriodKey.trim()) {
      toast.error('Period key wajib diisi, contoh 2026-03');
      return;
    }
    if (!Number.isFinite(invoiceInstallmentCount) || invoiceInstallmentCount < 1 || invoiceInstallmentCount > 24) {
      toast.error('Jumlah cicilan harus antara 1 sampai 24');
      return;
    }
    if (
      !Number.isFinite(invoiceInstallmentIntervalDays) ||
      invoiceInstallmentIntervalDays < 1 ||
      invoiceInstallmentIntervalDays > 180
    ) {
      toast.error('Jarak antar cicilan harus antara 1 sampai 180 hari');
      return;
    }
    previewInvoiceMutation.mutate();
  };

  const handleSelectInvoiceStudent = (studentId: number) => {
    setInvoiceSelectedStudentIds((current) => (current.includes(studentId) ? current : [...current, studentId]));
    setInvoiceStudentSearch('');
  };

  const handleRemoveInvoiceStudent = (studentId: number) => {
    setInvoiceSelectedStudentIds((current) => current.filter((id) => id !== studentId));
  };

  const handleClearInvoiceStudentSelection = () => {
    setInvoiceSelectedStudentIds([]);
    setInvoiceStudentSearch('');
  };

  const handleSelectAdjustmentStudent = (studentId: number) => {
    setAdjustmentStudentId(studentId);
    setAdjustmentStudentSearch('');
  };

  const handleClearAdjustmentStudent = () => {
    setAdjustmentStudentId('');
    setAdjustmentStudentSearch('');
  };

  const handleSaveInstallments = () => {
    if (!selectedInvoice) {
      toast.error('Tagihan belum dipilih');
      return;
    }

    if (installmentDrafts.length === 0) {
      toast.error('Skema cicilan belum tersedia');
      return;
    }

    if (installmentDrafts.some((draft) => Number(draft.amount) <= 0)) {
      toast.error('Nominal setiap termin harus lebih dari 0');
      return;
    }

    if (selectedInvoiceCanEditAmounts) {
      const totalInstallments = installmentDrafts.reduce((sum, draft) => sum + Number(draft.amount || 0), 0);
      if (Math.abs(totalInstallments - Number(selectedInvoice.totalAmount || 0)) > 0.009) {
        toast.error('Total seluruh termin harus sama dengan total invoice');
        return;
      }
    }

    updateInstallmentsMutation.mutate();
  };

  const handleSavePayment = () => {
    if (!selectedInvoice) {
      toast.error('Tagihan belum dipilih');
      return;
    }
    if (Number(paymentAmount) <= 0) {
      toast.error('Nominal pembayaran harus lebih dari nol');
      return;
    }
    if (paymentMethod !== 'CASH' && isNaN(Number(paymentBankAccountId || ''))) {
      toast.error('Pilih rekening bank untuk pembayaran non-tunai');
      return;
    }
    payInvoiceMutation.mutate();
  };

  const handleSaveRefund = () => {
    if (!selectedCreditBalance) {
      toast.error('Saldo kredit siswa belum dipilih');
      return;
    }
    if (Number(refundAmount) <= 0) {
      toast.error('Nominal refund harus lebih dari nol');
      return;
    }
    if (Number(refundAmount) > Number(selectedCreditBalance.balanceAmount || 0)) {
      toast.error('Nominal refund melebihi saldo kredit siswa');
      return;
    }
    if (refundMethod !== 'CASH' && isNaN(Number(refundBankAccountId || ''))) {
      toast.error('Pilih rekening bank untuk refund non-tunai');
      return;
    }
    refundMutation.mutate();
  };

  const handleSaveWriteOff = () => {
    if (!writeOffTargetInvoice) {
      toast.error('Tagihan belum dipilih');
      return;
    }
    if (Number(writeOffAmount) <= 0) {
      toast.error('Nominal write-off harus lebih dari nol');
      return;
    }
    if (Number(writeOffAmount) > Number(writeOffTargetInvoice.balanceAmount || 0)) {
      toast.error('Nominal write-off melebihi outstanding invoice');
      return;
    }
    if (writeOffReason.trim().length < 5) {
      toast.error('Alasan write-off minimal 5 karakter');
      return;
    }
    createWriteOffMutation.mutate();
  };

  const handleSavePaymentReversal = () => {
    if (!reversalTargetPayment) {
      toast.error('Pembayaran belum dipilih');
      return;
    }
    if (Number(reversalAmount) <= 0) {
      toast.error('Nominal reversal harus lebih dari nol');
      return;
    }
    if (Number(reversalAmount) > Number(reversalTargetPayment.remainingReversibleAmount || 0)) {
      toast.error('Nominal reversal melebihi sisa pembayaran yang dapat direversal');
      return;
    }
    if (reversalReason.trim().length < 5) {
      toast.error('Alasan reversal minimal 5 karakter');
      return;
    }
    createPaymentReversalMutation.mutate();
  };

  useEffect(() => {
    previewInvoiceMutation.reset();
  }, [
    invoiceYearId,
    invoiceSemester,
    invoicePeriodKey,
    invoiceDueDate,
    invoiceTitle,
    invoiceMajorId,
    invoiceGradeLevel,
    invoiceInstallmentCount,
    invoiceInstallmentIntervalDays,
    invoiceAutoApplyCreditBalance,
    invoiceReplaceExisting,
    invoiceSelectedStudentIds,
  ]);

  useEffect(() => {
    if (!selectedInvoice) {
      setInstallmentDrafts([]);
      setInstallmentScheduleNote('');
      return;
    }

    setInstallmentDrafts(
      (selectedInvoice.installments || []).map((installment) => ({
        sequence: installment.sequence,
        amount: String(Number(installment.amount || 0)),
        dueDate: installment.dueDate ? String(installment.dueDate).slice(0, 10) : '',
      })),
    );
    setInstallmentScheduleNote('');
  }, [selectedInvoice]);

  const handleExportReport = async (
    format: 'csv' | 'xlsx',
    reportType: 'all' | 'monthly' | 'class' | 'aging' | 'detail' | 'trend',
  ) => {
    const key = `${format}-${reportType}`;
    try {
      setExportingKey(key);
      const blob = await staffFinanceService.exportReports({
        format,
        reportType,
        academicYearId: reportYearId === '' ? activeYear?.id : Number(reportYearId),
        semester: reportSemester === '' ? undefined : reportSemester,
        gradeLevel: reportGradeLevelFilter.trim() || undefined,
        periodFrom: reportPeriodFrom.trim() || undefined,
        periodTo: reportPeriodTo.trim() || undefined,
        asOfDate: reportAsOfDate || undefined,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `finance-report-${reportType}-${dateStamp}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Export laporan berhasil');
    } catch (error) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal export laporan');
    } finally {
      setExportingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Pembayaran (SPP) - Staff Keuangan</h2>
        <p className="mt-1 text-sm text-gray-500">
          Kelola komponen biaya, tarif dinamis, generate tagihan, pencatatan pembayaran, dan tindak lanjut kolektibilitas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="text-xs text-blue-700 uppercase tracking-wider">Total Tagihan</div>
          <div className="mt-2 text-2xl font-bold text-blue-900">{invoiceSummary?.totalInvoices || 0}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
          <div className="text-xs text-amber-700 uppercase tracking-wider">Outstanding</div>
          <div className="mt-2 text-xl font-bold text-amber-900">{formatCurrency(invoiceSummary?.totalOutstanding || 0)}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="text-xs text-emerald-700 uppercase tracking-wider">Terbayar</div>
          <div className="mt-2 text-xl font-bold text-emerald-900">{formatCurrency(invoiceSummary?.totalPaid || 0)}</div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
          <div className="text-xs text-violet-700 uppercase tracking-wider">Total Nominal</div>
          <div className="mt-2 text-xl font-bold text-violet-900">{formatCurrency(invoiceSummary?.totalAmount || 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
          <div className="text-xs text-rose-700 uppercase tracking-wider">Tagihan Lewat Jatuh Tempo</div>
          <div className="mt-2 text-2xl font-bold text-rose-900">{overdueCount}</div>
          <div className="mt-1 text-xs text-rose-700/80">Butuh tindak lanjut prioritas</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="text-xs text-slate-700 uppercase tracking-wider mb-2">Top Tunggakan per Kelas</div>
          {classOutstanding.length === 0 ? (
            <div className="text-xs text-slate-500">Belum ada data tagihan.</div>
          ) : (
            <div className="space-y-1.5">
              {classOutstanding.map((row) => (
                <div key={row.className} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    {row.className} ({row.totalInvoices})
                  </span>
                  <span className="font-semibold text-slate-900">{formatCurrency(row.totalOutstanding)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-emerald-50 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-700">Saldo Kredit Siswa</div>
              <p className="mt-1 text-sm text-slate-600">
                Kelebihan bayar otomatis masuk ke saldo kredit dan bisa direfund dari sini.
              </p>
            </div>
            <input
              value={creditSearch}
              onChange={(event) => setCreditSearch(event.target.value)}
              placeholder="Cari siswa / NIS / kelas"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full lg:w-72"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 px-4 py-4 border-b border-gray-100 bg-emerald-50/40">
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-700">Siswa dengan Kredit</div>
              <div className="mt-1 text-lg font-bold text-emerald-900">{creditSummary?.totalStudentsWithCredit || 0}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-700">Total Saldo Kredit</div>
              <div className="mt-1 text-lg font-bold text-emerald-900">
                {formatCurrency(creditSummary?.totalCreditBalance || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-sky-700">Total Refund</div>
              <div className="mt-1 text-lg font-bold text-sky-900">{creditSummary?.totalRefundRecords || 0}</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-sky-700">Nominal Refund</div>
              <div className="mt-1 text-lg font-bold text-sky-900">
                {formatCurrency(creditSummary?.totalRefundAmount || 0)}
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {creditsQuery.isLoading ? (
              <div className="px-4 py-8 text-sm text-slate-500">Memuat saldo kredit...</div>
            ) : creditBalances.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500">Belum ada saldo kredit aktif.</div>
            ) : (
              creditBalances.map((balance) => (
                <div key={balance.balanceId} className="px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{balance.student.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {balance.student.studentClass?.name || 'Tanpa kelas'} • {balance.student.nis || balance.student.username}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {balance.recentTransactions.map((transaction) => (
                          <span
                            key={transaction.id}
                            className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${
                              transaction.kind === 'REFUND'
                                ? 'border-sky-200 bg-sky-50 text-sky-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {getCreditTransactionLabel(transaction)} • {formatCurrency(transaction.amount)}
                          </span>
                        ))}
                      </div>
                      {balance.recentTransactions.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {balance.recentTransactions.map((transaction) => (
                            <div key={`detail-${transaction.id}`} className="text-xs text-slate-500">
                              {formatDate(transaction.createdAt)} • saldo {formatCurrency(transaction.balanceAfter)}
                              {transaction.payment?.invoiceNo ? ` • ${transaction.payment.invoiceNo}` : ''}
                              {transaction.refund?.refundNo ? ` • ${transaction.refund.refundNo}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-start lg:items-end gap-2">
                      <div className="text-xs uppercase tracking-wider text-slate-500">Saldo Kredit</div>
                      <div className="text-xl font-bold text-emerald-900">{formatCurrency(balance.balanceAmount)}</div>
                      <button
                        type="button"
                        onClick={() => startRefund(balance)}
                        disabled={balance.balanceAmount <= 0}
                        className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                      >
                        Proses Refund
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-sky-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-sky-50">
            <div className="text-xs uppercase tracking-wider text-sky-700">Refund Terbaru</div>
            <p className="mt-1 text-sm text-slate-600">Riwayat pengembalian saldo kredit yang sudah diproses.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {creditsQuery.isLoading ? (
              <div className="px-4 py-8 text-sm text-slate-500">Memuat refund...</div>
            ) : recentRefunds.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500">Belum ada refund saldo kredit.</div>
            ) : (
              recentRefunds.map((refund: FinanceRefundRecord) => (
                <div key={refund.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{refund.student.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{refund.refundNo} • {getPaymentMethodLabel(refund.method)}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDate(refund.refundedAt)}</div>
                      {refund.note ? <div className="mt-1 text-xs text-slate-500">{refund.note}</div> : null}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-sky-900">{formatCurrency(refund.amount)}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{refund.student.studentClass?.name || 'Tanpa kelas'}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-sky-700">
              <BellRing className="w-3.5 h-3.5" />
              Reminder Jatuh Tempo
            </div>
            <p className="mt-1 text-sm text-sky-900">
              Pengingat otomatis berjalan mengikuti policy finance. Anda bisa atur interval due soon, overdue, warning denda, dan eskalasi tanpa hardcode.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-sky-900">
              <span
                className={`rounded-full px-2 py-1 font-semibold ${
                  reminderPolicy?.isActive
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {reminderPolicy?.isActive ? 'Worker reminder aktif' : 'Worker reminder nonaktif'}
              </span>
              <span className="rounded-full bg-white px-2 py-1">
                Due soon {reminderPolicy?.dueSoonDays ?? 3} hari • ulang {reminderPolicy?.dueSoonRepeatIntervalDays ?? 1} hari
              </span>
              <span className="rounded-full bg-white px-2 py-1">
                Overdue ulang {reminderPolicy?.overdueRepeatIntervalDays ?? 3} hari
              </span>
              <span className="rounded-full bg-white px-2 py-1">
                Warning denda {reminderPolicy?.lateFeeWarningEnabled ? 'aktif' : 'nonaktif'}
              </span>
              <span className="rounded-full bg-white px-2 py-1">
                Eskalasi {reminderPolicy?.escalationEnabled ? `mulai ${reminderPolicy?.escalationStartDays ?? 7} hari` : 'nonaktif'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-sky-800">Due soon (hari)</label>
            <input
              type="number"
              min={0}
              max={30}
              value={reminderDueSoonDays}
              onChange={(event) => setReminderDueSoonDays(event.target.value)}
              className="w-20 border border-sky-200 rounded-lg px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => handleDispatchReminder('DUE_SOON')}
              disabled={dispatchReminderMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            >
              {dispatchReminderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Kirim Due Soon
            </button>
            <button
              type="button"
              onClick={() => handleDispatchReminder('OVERDUE')}
              disabled={dispatchReminderMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {dispatchReminderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Kirim Overdue
            </button>
            <button
              type="button"
              onClick={() => handleDispatchReminder('LATE_FEE')}
              disabled={dispatchReminderMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {dispatchReminderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Warning Denda
            </button>
            <button
              type="button"
              onClick={() => handleDispatchReminder('ESCALATION')}
              disabled={dispatchReminderMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {dispatchReminderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Kirim Eskalasi
            </button>
            <button
              type="button"
              onClick={openReminderPolicyModal}
              disabled={reminderPolicyQuery.isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Pengaturan Policy
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="rounded-xl border border-amber-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-amber-50 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-700">Cashier Closing Harian</div>
              <p className="mt-1 text-sm text-slate-600">
                Sesi kas membaca transaksi tunai yang dicatat petugas dalam rentang sesi, jadi settlement harian tetap akurat tanpa mengubah alur pembayaran yang sudah berjalan.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[320px]">
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-amber-700">Sesi terbuka</div>
                <div className="mt-1 font-semibold text-amber-900">{cashSessionSummary?.openCount || 0}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-slate-700">Sesi ditutup</div>
                <div className="mt-1 font-semibold text-slate-900">{cashSessionSummary?.closedCount || 0}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-emerald-700">Kas masuk</div>
                <div className="mt-1 font-semibold text-emerald-900">
                  {formatCurrency(cashSessionSummary?.totalExpectedCashIn || 0)}
                </div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="text-rose-700">Kas keluar</div>
                <div className="mt-1 font-semibold text-rose-900">
                  {formatCurrency(cashSessionSummary?.totalExpectedCashOut || 0)}
                </div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                <div className="text-sky-700">Pending Head TU</div>
                <div className="mt-1 font-semibold text-sky-900">{cashSessionSummary?.pendingHeadTuCount || 0}</div>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                <div className="text-violet-700">Pending Kepsek</div>
                <div className="mt-1 font-semibold text-violet-900">{cashSessionSummary?.pendingPrincipalCount || 0}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-4 p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              {!activeCashSession ? (
                <>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Buka Sesi Kas</div>
                    <p className="mt-1 text-xs text-slate-500">
                      Gunakan saat shift kasir dimulai. Semua pembayaran tunai dan refund tunai setelah sesi dibuka akan masuk ke ringkasan settlement.
                    </p>
                  </div>
                  <input
                    type="date"
                    value={cashSessionBusinessDate}
                    onChange={(event) => setCashSessionBusinessDate(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    value={cashSessionOpeningBalance}
                    onChange={(event) => setCashSessionOpeningBalance(event.target.value)}
                    placeholder="Saldo awal kas"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={cashSessionOpeningNote}
                    onChange={(event) => setCashSessionOpeningNote(event.target.value)}
                    placeholder="Catatan pembukaan sesi (opsional)"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleOpenCashSession}
                    disabled={openCashSessionMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {openCashSessionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Buka Sesi Hari Ini
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{activeCashSession.sessionNo}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatDate(activeCashSession.businessDate)} • dibuka {formatDate(activeCashSession.openedAt)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getCashSessionStatusMeta(
                          activeCashSession.status,
                        ).className}`}
                      >
                        {getCashSessionStatusMeta(activeCashSession.status).label}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getCashSessionApprovalMeta(
                          activeCashSession.approvalStatus,
                        ).className}`}
                      >
                        {getCashSessionApprovalMeta(activeCashSession.approvalStatus).label}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-slate-500">Saldo awal</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {formatCurrency(activeCashSession.openingBalance)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                      <div className="text-emerald-700">Expected closing</div>
                      <div className="mt-1 font-semibold text-emerald-900">
                        {formatCurrency(activeCashSession.expectedClosingBalance)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                      <div className="text-emerald-700">Kas masuk</div>
                      <div className="mt-1 font-semibold text-emerald-900">
                        {formatCurrency(activeCashSession.expectedCashIn)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-rose-100 bg-white px-3 py-2">
                      <div className="text-rose-700">Kas keluar</div>
                      <div className="mt-1 font-semibold text-rose-900">
                        {formatCurrency(activeCashSession.expectedCashOut)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed border-amber-200 bg-white px-3 py-3 text-xs text-slate-600">
                    {activeCashSession.totalCashPayments} pembayaran tunai • {activeCashSession.totalCashRefunds} refund tunai
                    {activeCashSession.openingNote ? ` • catatan: ${activeCashSession.openingNote}` : ''}
                  </div>
                  <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-xs text-sky-900">
                    Zero variance {cashSessionZeroVarianceAutoApproved ? 'auto-approved' : 'tetap direview Head TU'} •
                    eskalasi ke Kepala Sekolah mulai{' '}
                    <span className="font-semibold">
                      {formatCurrency(Number(cashSessionPrincipalApprovalThresholdAmount || 0))}
                    </span>
                    {cashSessionRequireVarianceNote ? ' • catatan selisih wajib diisi' : ''}
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={cashSessionActualClosingBalance}
                    onChange={(event) => setCashSessionActualClosingBalance(event.target.value)}
                    placeholder="Saldo kas aktual saat tutup"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={cashSessionClosingNote}
                    onChange={(event) => setCashSessionClosingNote(event.target.value)}
                    placeholder="Catatan closing / settlement"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleCloseCashSession(activeCashSession)}
                    disabled={closeCashSessionMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {closeCashSessionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Tutup Sesi Kas
                  </button>
                </>
              )}

              <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-sky-900">Policy Approval Settlement</div>
                  <p className="mt-1 text-xs text-sky-800">
                    Workflow review settlement dibaca live dari policy ini di web dan mobile.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-sky-900">
                  <input
                    type="checkbox"
                    checked={cashSessionZeroVarianceAutoApproved}
                    onChange={(event) => setCashSessionZeroVarianceAutoApproved(event.target.checked)}
                  />
                  Auto-approve jika selisih nol
                </label>
                <label className="flex items-center gap-2 text-xs text-sky-900">
                  <input
                    type="checkbox"
                    checked={cashSessionRequireVarianceNote}
                    onChange={(event) => setCashSessionRequireVarianceNote(event.target.checked)}
                  />
                  Wajib catatan saat ada selisih
                </label>
                <div>
                  <label className="text-xs font-medium text-sky-900">Threshold eskalasi ke Kepala Sekolah</label>
                  <input
                    type="number"
                    min={0}
                    value={cashSessionPrincipalApprovalThresholdAmount}
                    onChange={(event) => setCashSessionPrincipalApprovalThresholdAmount(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={cashSessionApprovalPolicyNotes}
                  onChange={(event) => setCashSessionApprovalPolicyNotes(event.target.value)}
                  placeholder="Catatan policy approval settlement"
                  rows={3}
                  className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => saveCashSessionApprovalPolicyMutation.mutate()}
                  disabled={saveCashSessionApprovalPolicyMutation.isPending || cashSessionApprovalPolicyQuery.isLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                >
                  {saveCashSessionApprovalPolicyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Simpan Policy Approval
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-gray-100 bg-white">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">Aktivitas Tunai Dalam Sesi</div>
                  <p className="mt-1 text-xs text-slate-500">Pembayaran tunai bersih dan refund tunai terbaru pada sesi aktif atau sesi terakhir.</p>
                </div>
                <div className="p-4 space-y-3">
                  {cashSessionsQuery.isLoading ? (
                    <div className="text-sm text-slate-500">Memuat settlement kas...</div>
                  ) : (activeCashSession || cashSessions[0]) ? (
                    <>
                      {((activeCashSession || cashSessions[0])?.recentCashPayments || []).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                          Belum ada pembayaran tunai yang masuk ke sesi ini.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(activeCashSession || cashSessions[0])?.recentCashPayments.map((payment) => (
                            <div key={`cash-payment-${payment.id}`} className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-emerald-900">{payment.paymentNo || 'Pembayaran tunai'}</div>
                                  <div className="mt-1 text-[11px] text-emerald-800">
                                    {payment.student?.name || '-'} • {payment.invoice?.invoiceNo || '-'} • {formatDate(payment.paidAt)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold text-emerald-900">{formatCurrency(payment.netCashAmount)}</div>
                                  {payment.reversedAmount > 0 ? (
                                    <div className="mt-1 text-[11px] text-rose-700">reversal {formatCurrency(payment.reversedAmount)}</div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {((activeCashSession || cashSessions[0])?.recentCashRefunds || []).length > 0 ? (
                        <div className="space-y-2">
                          {(activeCashSession || cashSessions[0])?.recentCashRefunds.map((refund) => (
                            <div key={`cash-refund-${refund.id}`} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-rose-900">{refund.refundNo}</div>
                                  <div className="mt-1 text-[11px] text-rose-800">
                                    {refund.student.name} • {refund.student.studentClass?.name || '-'} • {formatDate(refund.refundedAt)}
                                  </div>
                                </div>
                                <div className="text-sm font-bold text-rose-900">{formatCurrency(refund.amount)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-sm text-slate-500">Belum ada sesi kas harian.</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">Riwayat Sesi Kas</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {cashSessionsQuery.isLoading ? (
                    <div className="px-4 py-6 text-sm text-slate-500">Memuat riwayat sesi...</div>
                  ) : cashSessions.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500">Belum ada sesi kas yang tercatat.</div>
                  ) : (
                    cashSessions.slice(0, 6).map((session) => {
                      const status = getCashSessionStatusMeta(session.status);
                      const approval = getCashSessionApprovalMeta(session.approvalStatus);
                      return (
                        <div key={session.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{session.sessionNo}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatDate(session.businessDate)} • dibuka {formatDate(session.openedAt)}
                                {session.closedAt ? ` • ditutup ${formatDate(session.closedAt)}` : ''}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                Kas masuk {formatCurrency(session.expectedCashIn)} • kas keluar {formatCurrency(session.expectedCashOut)} • expected close {formatCurrency(session.expectedClosingBalance)}
                              </div>
                              {session.varianceAmount != null ? (
                                <div className={`mt-1 text-[11px] ${Number(session.varianceAmount) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  Selisih {formatCurrency(session.varianceAmount)}
                                </div>
                              ) : null}
                              {session.headTuDecision.note ? (
                                <div className="mt-1 text-[11px] text-slate-500">
                                  Review Head TU: {session.headTuDecision.note}
                                </div>
                              ) : null}
                              {session.principalDecision.note ? (
                                <div className="mt-1 text-[11px] text-slate-500">
                                  Review Kepala Sekolah: {session.principalDecision.note}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>
                                {status.label}
                              </span>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${approval.className}`}>
                                {approval.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="text-xs uppercase tracking-wider text-slate-600">Kontrol Settlement</div>
            <p className="mt-1 text-sm text-slate-600">
              Closing tunai ini menyatu dengan pembayaran, refund, dan reversal tunai sehingga operasional kas harian bendahara tetap sinkron.
            </p>
          </div>
          <div className="p-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              Pembayaran tunai baru akan langsung menambah expected cash pada sesi yang sedang aktif.
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              Refund tunai akan mengurangi expected cash out dan ikut tercatat pada riwayat sesi yang sama.
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              Jika ada reversal pada pembayaran tunai, net kas masuk sesi ikut terkoreksi sehingga angka closing tidak misleading.
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 text-amber-900">
              Head TU dan Kepala Sekolah bisa membaca settlement ini melalui endpoint finance yang sama, jadi monitoring lintas web/mobile tetap konsisten.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-amber-100">
          <div className="text-xs uppercase tracking-wider text-amber-700">Verifikasi Pembayaran Non-Tunai</div>
          <p className="mt-1 text-sm text-slate-600">
            Transfer bank, virtual account, e-wallet, dan QRIS sekarang masuk antrean verifikasi sebelum mengurangi tagihan siswa.
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-amber-700">Pending</div>
              <div className="mt-1 font-semibold text-amber-900">{paymentVerificationSummary?.pendingCount || 0}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="text-emerald-700">Verified</div>
              <div className="mt-1 font-semibold text-emerald-900">{paymentVerificationSummary?.verifiedCount || 0}</div>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <div className="text-rose-700">Rejected</div>
              <div className="mt-1 font-semibold text-rose-900">{paymentVerificationSummary?.rejectedCount || 0}</div>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
              <div className="text-indigo-700">Matched Mutasi</div>
              <div className="mt-1 font-semibold text-indigo-900">{paymentVerificationSummary?.matchedCount || 0}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-600">Pending Nominal</div>
              <div className="mt-1 font-semibold text-slate-900">{formatCurrency(paymentVerificationSummary?.pendingAmount || 0)}</div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={paymentVerificationSearch}
              onChange={(event) => setPaymentVerificationSearch(event.target.value)}
              placeholder="Cari pembayaran, referensi, siswa, atau invoice"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Pending akan muncul juga di rekonsiliasi bank dan bisa diverifikasi dari dua tempat yang sama.
            </div>
          </div>

          <div className="space-y-3">
            {paymentVerificationsQuery.isLoading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Memuat antrean verifikasi pembayaran...
              </div>
            ) : pendingPaymentVerificationRows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Belum ada pembayaran non-tunai yang menunggu verifikasi.
              </div>
            ) : (
              pendingPaymentVerificationRows.slice(0, 8).map((payment) => {
                const verificationMeta = getPaymentVerificationMeta(payment.verificationStatus);
                return (
                  <div key={`payment-verification-${payment.id}`} className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {payment.student.name} • {payment.paymentNo || '-'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {payment.student.studentClass?.name || 'Tanpa kelas'} • invoice {payment.invoiceNo || '-'} • {getPaymentMethodLabel(payment.method)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Referensi {payment.referenceNo || 'Tanpa referensi'} • dibayar {formatDate(payment.paidAt)}
                        </div>
                        {payment.createdBy ? (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Dikirim oleh {payment.createdBy.name} • {payment.createdBy.role || '-'}
                          </div>
                        ) : null}
                        {payment.proofFile?.url ? (
                          <div className="mt-1 text-[11px]">
                            <a
                              href={payment.proofFile.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              Lihat bukti bayar
                            </a>
                            {payment.proofFile.name ? ` • ${payment.proofFile.name}` : ''}
                          </div>
                        ) : null}
                        {payment.matchedStatementEntry ? (
                          <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">
                            Matched ke mutasi {payment.matchedStatementEntry.referenceNo || 'tanpa referensi'} •{' '}
                            {formatCurrency(payment.matchedStatementEntry.amount)} •{' '}
                            {payment.matchedStatementEntry.reconciliation?.reconciliationNo || 'rekonsiliasi aktif'}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                            Belum matched ke mutasi statement bank.
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">{formatCurrency(payment.amount)}</div>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${verificationMeta.className}`}>
                          {verificationMeta.label}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => verifyPaymentMutation.mutate(payment.id)}
                        disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {verifyPaymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Verifikasi
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectPaymentMutation.mutate(payment.id)}
                        disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {rejectPaymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Tolak
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-4">
        <div className="rounded-xl border border-blue-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-blue-100">
            <div className="text-xs uppercase tracking-wider text-blue-700">Master Rekening Bank</div>
            <p className="mt-1 text-sm text-slate-600">
              Rekening bank ini dipakai bersama oleh pembayaran non-tunai, refund, dan rekonsiliasi bank.
            </p>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={bankAccountCode}
                onChange={(event) => setBankAccountCode(event.target.value)}
                placeholder="Kode rekening"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={bankAccountBankName}
                onChange={(event) => setBankAccountBankName(event.target.value)}
                placeholder="Nama bank"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={bankAccountAccountName}
                onChange={(event) => setBankAccountAccountName(event.target.value)}
                placeholder="Nama pemilik rekening"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={bankAccountNumber}
                onChange={(event) => setBankAccountNumber(event.target.value)}
                placeholder="Nomor rekening"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={bankAccountBranch}
                onChange={(event) => setBankAccountBranch(event.target.value)}
                placeholder="Cabang (opsional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <textarea
              value={bankAccountNotes}
              onChange={(event) => setBankAccountNotes(event.target.value)}
              placeholder="Catatan rekening (opsional)"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveBankAccount}
                disabled={saveBankAccountMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saveBankAccountMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingBankAccountId ? 'Simpan Perubahan Rekening' : 'Tambah Rekening'}
              </button>
              {editingBankAccountId ? (
                <button
                  type="button"
                  onClick={resetBankAccountForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Batal Edit
                </button>
              ) : null}
            </div>
            <div className="divide-y divide-blue-50 rounded-xl border border-blue-100 overflow-hidden">
              {bankAccountsQuery.isLoading ? (
                <div className="px-4 py-6 text-sm text-slate-500">Memuat rekening bank...</div>
              ) : bankAccounts.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">Belum ada rekening bank yang terdaftar.</div>
              ) : (
                bankAccounts.map((account) => (
                  <div key={account.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {account.bankName} • {account.accountNumber}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {account.code} • {account.accountName}
                          {account.branch ? ` • ${account.branch}` : ''}
                        </div>
                        {account.notes ? (
                          <div className="mt-1 text-[11px] text-slate-500">{account.notes}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                            account.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {account.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEditBankAccount(account)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBankAccountMutation.mutate(account)}
                          disabled={toggleBankAccountMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Power className="w-3.5 h-3.5" />
                          {account.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-indigo-100">
            <div className="text-xs uppercase tracking-wider text-indigo-700">Rekonsiliasi Bank</div>
            <p className="mt-1 text-sm text-slate-600">
              Cocokkan mutasi statement bank dengan pembayaran dan refund non-tunai yang sudah tercatat.
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                <div className="text-indigo-700">Rekonsiliasi</div>
                <div className="mt-1 font-semibold text-indigo-900">{bankReconciliationSummary?.totalReconciliations || 0}</div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-amber-700">Terbuka</div>
                <div className="mt-1 font-semibold text-amber-900">{bankReconciliationSummary?.openCount || 0}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-emerald-700">Expected Bank In</div>
                <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(bankReconciliationSummary?.totalExpectedBankIn || 0)}</div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="text-rose-700">Unmatched Statement</div>
                <div className="mt-1 font-semibold text-rose-900">{bankReconciliationSummary?.totalUnmatchedStatementEntries || 0}</div>
              </div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <div className="text-sm font-semibold text-indigo-900">Buka Rekonsiliasi Baru</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={bankReconciliationAccountId}
                  onChange={(event) => setBankReconciliationAccountId(event.target.value ? Number(event.target.value) : '')}
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Pilih rekening bank</option>
                  {activeBankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.bankName} • {account.accountNumber}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={bankReconciliationPeriodStart}
                  onChange={(event) => setBankReconciliationPeriodStart(event.target.value)}
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={bankReconciliationPeriodEnd}
                  onChange={(event) => setBankReconciliationPeriodEnd(event.target.value)}
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  value={bankReconciliationOpeningBalance}
                  onChange={(event) => setBankReconciliationOpeningBalance(event.target.value)}
                  placeholder="Saldo awal statement"
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  value={bankReconciliationClosingBalance}
                  onChange={(event) => setBankReconciliationClosingBalance(event.target.value)}
                  placeholder="Saldo akhir statement"
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
              </div>
              <textarea
                value={bankReconciliationNote}
                onChange={(event) => setBankReconciliationNote(event.target.value)}
                placeholder="Catatan rekonsiliasi / alasan variance (opsional)"
                rows={3}
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateBankReconciliation}
                  disabled={createBankReconciliationMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createBankReconciliationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Buat Rekonsiliasi
                </button>
                <button
                  type="button"
                  onClick={resetBankReconciliationForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Reset Form
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.45fr_0.55fr] gap-4">
              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">Daftar Rekonsiliasi</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {bankReconciliationsQuery.isLoading ? (
                    <div className="px-4 py-6 text-sm text-slate-500">Memuat rekonsiliasi bank...</div>
                  ) : bankReconciliations.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500">Belum ada rekonsiliasi bank.</div>
                  ) : (
                    bankReconciliations.map((reconciliation) => {
                      const status = getBankReconciliationStatusMeta(reconciliation.status);
                      const active = selectedBankReconciliation?.id === reconciliation.id;
                      return (
                        <button
                          key={reconciliation.id}
                          type="button"
                          onClick={() => setSelectedBankReconciliationId(reconciliation.id)}
                          className={`w-full px-4 py-3 text-left transition ${
                            active ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{reconciliation.reconciliationNo}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {reconciliation.bankAccount.bankName} • {reconciliation.bankAccount.accountNumber}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {formatDate(reconciliation.periodStart)} - {formatDate(reconciliation.periodEnd)}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                Variance {formatCurrency(reconciliation.summary.varianceAmount)} • unmatched {reconciliation.summary.unmatchedStatementEntryCount}
                              </div>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">Detail Rekonsiliasi</div>
                </div>
                <div className="p-4 space-y-3">
                  {!selectedBankReconciliation ? (
                    <div className="text-sm text-slate-500">Pilih rekonsiliasi untuk melihat detail matching bank.</div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{selectedBankReconciliation.reconciliationNo}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {selectedBankReconciliation.bankAccount.bankName} • {selectedBankReconciliation.bankAccount.accountNumber}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Periode {formatDate(selectedBankReconciliation.periodStart)} - {formatDate(selectedBankReconciliation.periodEnd)}
                          </div>
                        </div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getBankReconciliationStatusMeta(selectedBankReconciliation.status).className}`}>
                          {getBankReconciliationStatusMeta(selectedBankReconciliation.status).label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                          <div className="text-emerald-700">Expected masuk</div>
                          <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(selectedBankReconciliation.summary.expectedBankIn)}</div>
                        </div>
                        <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                          <div className="text-rose-700">Expected keluar</div>
                          <div className="mt-1 font-semibold text-rose-900">{formatCurrency(selectedBankReconciliation.summary.expectedBankOut)}</div>
                        </div>
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                          <div className="text-indigo-700">Statement tercatat</div>
                          <div className="mt-1 font-semibold text-indigo-900">
                            {formatCurrency(selectedBankReconciliation.summary.statementRecordedIn - selectedBankReconciliation.summary.statementRecordedOut)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                          <div className="text-sky-700">Pending Verifikasi</div>
                          <div className="mt-1 font-semibold text-sky-900">
                            {formatCurrency(selectedBankReconciliation.summary.pendingVerificationAmount)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                          <div className="text-amber-700">Variance</div>
                          <div className="mt-1 font-semibold text-amber-900">{formatCurrency(selectedBankReconciliation.summary.varianceAmount)}</div>
                        </div>
                      </div>

                      {selectedBankReconciliation.status === 'OPEN' ? (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                          <div className="text-sm font-semibold text-indigo-900">Tambah Mutasi Statement</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                              type="date"
                              value={bankStatementEntryDate}
                              onChange={(event) => setBankStatementEntryDate(event.target.value)}
                              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                            />
                            <select
                              value={bankStatementDirection}
                              onChange={(event) => setBankStatementDirection(event.target.value as FinanceBankStatementDirection)}
                              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="CREDIT">Kredit / Bank Masuk</option>
                              <option value="DEBIT">Debit / Bank Keluar</option>
                            </select>
                            <input
                              type="number"
                              min={0}
                              value={bankStatementAmount}
                              onChange={(event) => setBankStatementAmount(event.target.value)}
                              placeholder="Nominal mutasi"
                              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                            />
                            <input
                              value={bankStatementReference}
                              onChange={(event) => setBankStatementReference(event.target.value)}
                              placeholder="Referensi / no mutasi"
                              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <textarea
                            value={bankStatementDescription}
                            onChange={(event) => setBankStatementDescription(event.target.value)}
                            placeholder="Deskripsi mutasi (opsional)"
                            rows={3}
                            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAddBankStatementEntry(selectedBankReconciliation)}
                              disabled={createBankStatementEntryMutation.isPending}
                              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {createBankStatementEntryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                              Tambah Mutasi
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFinalizeBankReconciliation(selectedBankReconciliation)}
                              disabled={finalizeBankReconciliationMutation.isPending}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {finalizeBankReconciliationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                              Finalkan Rekonsiliasi
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-gray-100 bg-slate-50/70 p-4">
                        <div className="text-sm font-semibold text-slate-900">Mutasi Statement</div>
                        <div className="mt-3 space-y-2">
                          {selectedBankReconciliation.statementEntries.length === 0 ? (
                            <div className="text-xs text-slate-500">Belum ada mutasi statement yang dicatat.</div>
                          ) : (
                            selectedBankReconciliation.statementEntries.map((entry) => (
                              <div key={entry.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900">
                                      {entry.direction === 'CREDIT' ? 'Bank Masuk' : 'Bank Keluar'} • {formatCurrency(entry.amount)}
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      {formatDate(entry.entryDate)} • {entry.referenceNo || 'Tanpa referensi'}
                                    </div>
                                    {entry.description ? <div className="mt-1 text-[11px] text-slate-500">{entry.description}</div> : null}
                                    {entry.matchedPayment ? (
                                      <div className="mt-1 text-[11px] text-emerald-700">
                                        Matched ke pembayaran {entry.matchedPayment.paymentNo} • {entry.matchedPayment.referenceNo || 'Tanpa referensi'}
                                      </div>
                                    ) : null}
                                    {entry.matchedPayment ? (
                                      <div className="mt-1 text-[11px] text-sky-700">
                                        Status pembayaran {getPaymentVerificationMeta(entry.matchedPayment.verificationStatus).label}
                                      </div>
                                    ) : entry.matchedRefund ? (
                                      <div className="mt-1 text-[11px] text-emerald-700">
                                        Matched ke refund {entry.matchedRefund.refundNo} • {entry.matchedRefund.student.name}
                                      </div>
                                    ) : null}
                                  </div>
                                  <span
                                    className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                                      entry.status === 'MATCHED'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {entry.status === 'MATCHED' ? 'Matched' : 'Unmatched'}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-100 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">Pembayaran Sistem</div>
                          <div className="mt-3 space-y-2">
                            {selectedBankReconciliation.systemPayments.length === 0 ? (
                              <div className="text-xs text-slate-500">Belum ada pembayaran non-tunai pada periode ini.</div>
                            ) : (
                              selectedBankReconciliation.systemPayments.slice(0, 6).map((payment) => (
                                <div key={payment.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-slate-900">{payment.paymentNo || 'Pembayaran'}</div>
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        {payment.referenceNo || 'Tanpa referensi'}
                                        {payment.bankAccount ? ` • ${payment.bankAccount.bankName}` : ''}
                                      </div>
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        {getPaymentMethodLabel(payment.method)} • {getPaymentVerificationMeta(payment.verificationStatus).label}
                                      </div>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${payment.matched ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                      {payment.matched ? 'Matched' : 'Belum matched'}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500">{formatCurrency(payment.netBankAmount)}</div>
                                  {payment.verificationStatus === 'PENDING' ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => verifyPaymentMutation.mutate(payment.id)}
                                        disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        {verifyPaymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                        Verifikasi
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => rejectPaymentMutation.mutate(payment.id)}
                                        disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                      >
                                        {rejectPaymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                        Tolak
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">Refund Sistem</div>
                          <div className="mt-3 space-y-2">
                            {selectedBankReconciliation.systemRefunds.length === 0 ? (
                              <div className="text-xs text-slate-500">Belum ada refund non-tunai pada periode ini.</div>
                            ) : (
                              selectedBankReconciliation.systemRefunds.slice(0, 6).map((refund) => (
                                <div key={refund.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-slate-900">{refund.refundNo}</div>
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        {refund.student.name} • {refund.referenceNo || 'Tanpa referensi'}
                                      </div>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${refund.matched ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                      {refund.matched ? 'Matched' : 'Belum matched'}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500">{formatCurrency(refund.amount)}</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="text-xs uppercase tracking-wider text-slate-700">Ledger / Cashbook / Bankbook</div>
          <p className="mt-1 text-sm text-slate-600">
            Buku treasury ini membaca transaksi finance live. Buku kas hanya menghitung penerimaan dan refund tunai,
            sedangkan buku bank menampilkan transaksi non-tunai beserta status verifikasi dan matching mutasi.
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <select
              value={ledgerBookFilter}
              onChange={(event) => setLedgerBookFilter(event.target.value as FinanceLedgerBook)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">Semua buku treasury</option>
              <option value="CASHBOOK">Buku Kas</option>
              <option value="BANKBOOK">Buku Bank</option>
            </select>
            <select
              value={ledgerBankAccountId}
              onChange={(event) =>
                setLedgerBankAccountId(event.target.value ? Number(event.target.value) : '')
              }
              disabled={ledgerBookFilter === 'CASHBOOK'}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Semua rekening bank</option>
              {activeBankAccounts.map((account) => (
                <option key={`ledger-account-${account.id}`} value={account.id}>
                  {account.bankName} • {account.accountNumber}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={ledgerDateFrom}
              onChange={(event) => setLedgerDateFrom(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={ledgerDateTo}
              onChange={(event) => setLedgerDateTo(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <input
              value={ledgerSearch}
              onChange={(event) => setLedgerSearch(event.target.value)}
              placeholder="Cari no transaksi / siswa / invoice / referensi"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-amber-700">Saldo Awal Kas</div>
              <div className="mt-1 text-sm font-bold text-amber-900">
                {formatCurrency(ledgerSummary?.openingCashBalance || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-700">Kas Masuk</div>
              <div className="mt-1 text-sm font-bold text-emerald-900">
                {formatCurrency(ledgerSummary?.totalCashIn || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-rose-700">Kas Keluar</div>
              <div className="mt-1 text-sm font-bold text-rose-900">
                {formatCurrency(ledgerSummary?.totalCashOut || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-indigo-700">Saldo Awal Bank</div>
              <div className="mt-1 text-sm font-bold text-indigo-900">
                {formatCurrency(ledgerSummary?.openingBankBalance || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-sky-700">Pending Verifikasi</div>
              <div className="mt-1 text-sm font-bold text-sky-900">
                {formatCurrency(ledgerSummary?.pendingBankVerificationAmount || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-violet-700">Saldo Akhir Bank</div>
              <div className="mt-1 text-sm font-bold text-violet-900">
                {formatCurrency(ledgerSummary?.closingBankBalance || 0)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.42fr_0.58fr] gap-4">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">Ringkasan Buku</div>
                <div className="mt-3 space-y-3">
                  {ledgerBooksQuery.isLoading ? (
                    <div className="text-sm text-slate-500">Memuat snapshot ledger...</div>
                  ) : ledgerBookSummaries.length === 0 ? (
                    <div className="text-sm text-slate-500">Belum ada data buku pada rentang yang dipilih.</div>
                  ) : (
                    ledgerBookSummaries.map((summary) => {
                      const bookMeta = getFinanceLedgerBookMeta(summary.book);
                      return (
                        <div key={summary.book} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{summary.label}</div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {summary.entryCount} transaksi • saldo awal {formatCurrency(summary.openingBalance)}
                              </div>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${bookMeta.className}`}>
                              {bookMeta.label}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                              <div className="text-emerald-700">Masuk</div>
                              <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(summary.totalIn)}</div>
                            </div>
                            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                              <div className="text-rose-700">Keluar</div>
                              <div className="mt-1 font-semibold text-rose-900">{formatCurrency(summary.totalOut)}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="text-slate-700">Saldo akhir</div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {formatCurrency(summary.closingBalance)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                              <div className="text-sky-700">
                                {summary.book === 'BANKBOOK' ? 'Pending / unmatched' : 'Status sinkron'}
                              </div>
                              <div className="mt-1 font-semibold text-sky-900">
                                {summary.book === 'BANKBOOK'
                                  ? `${formatCurrency(summary.pendingAmount)} / ${formatCurrency(summary.unmatchedAmount)}`
                                  : 'Live'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {ledgerBookFilter !== 'CASHBOOK' ? (
                <div className="rounded-xl border border-indigo-100 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">Ringkasan per Rekening</div>
                  <div className="mt-3 space-y-3">
                    {ledgerBooksQuery.isLoading ? (
                      <div className="text-sm text-slate-500">Memuat ringkasan rekening...</div>
                    ) : ledgerBankAccountSummaries.length === 0 ? (
                      <div className="text-sm text-slate-500">Belum ada mutasi buku bank pada filter ini.</div>
                    ) : (
                      ledgerBankAccountSummaries.map((summary) => (
                        <div key={summary.bankAccount.id} className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-3">
                          <div className="text-sm font-semibold text-slate-900">
                            {summary.bankAccount.bankName} • {summary.bankAccount.accountNumber}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Saldo awal {formatCurrency(summary.openingBalance)} • saldo akhir{' '}
                            {formatCurrency(summary.closingBalance)}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                              <div className="text-emerald-700">Masuk</div>
                              <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(summary.totalIn)}</div>
                            </div>
                            <div className="rounded-lg border border-rose-100 bg-white px-3 py-2">
                              <div className="text-rose-700">Keluar</div>
                              <div className="mt-1 font-semibold text-rose-900">{formatCurrency(summary.totalOut)}</div>
                            </div>
                            <div className="rounded-lg border border-sky-100 bg-white px-3 py-2">
                              <div className="text-sky-700">Pending verifikasi</div>
                              <div className="mt-1 font-semibold text-sky-900">
                                {formatCurrency(summary.pendingVerificationAmount)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                              <div className="text-amber-700">Matched / unmatched</div>
                              <div className="mt-1 font-semibold text-amber-900">
                                {formatCurrency(summary.matchedAmount)} / {formatCurrency(summary.unmatchedAmount)}
                              </div>
                            </div>
                          </div>
                          {summary.latestFinalizedReconciliation ? (
                            <div className="mt-2 text-[11px] text-slate-500">
                              Final rekonsiliasi terakhir {summary.latestFinalizedReconciliation.reconciliationNo} •{' '}
                              {formatDate(summary.latestFinalizedReconciliation.periodEnd)} • closing statement{' '}
                              {formatCurrency(summary.latestFinalizedReconciliation.statementClosingBalance)}
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-500">
                              Belum ada rekonsiliasi final untuk rekening ini.
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Daftar Transaksi Buku</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Pembayaran bank yang masih pending tetap ditampilkan, tetapi tidak mengubah running balance sampai diverifikasi.
                  </div>
                </div>
                <div className="text-xs text-slate-500">{ledgerSummary?.totalEntries || 0} transaksi pada filter ini</div>
              </div>
              <div className="p-4 space-y-3 max-h-[820px] overflow-y-auto">
                {ledgerBooksQuery.isLoading ? (
                  <div className="text-sm text-slate-500">Memuat transaksi treasury...</div>
                ) : ledgerEntries.length === 0 ? (
                  <div className="text-sm text-slate-500">Belum ada transaksi treasury pada rentang yang dipilih.</div>
                ) : (
                  ledgerEntries.map((entry) => {
                    const bookMeta = getFinanceLedgerBookMeta(entry.book);
                    const directionMeta = getFinanceLedgerDirectionMeta(entry.direction);
                    const verificationMeta = entry.verificationStatus
                      ? getPaymentVerificationMeta(entry.verificationStatus)
                      : null;
                    return (
                      <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {entry.transactionNo || (entry.sourceType === 'PAYMENT' ? 'Pembayaran' : 'Refund')}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {formatDate(entry.transactionDate)}
                              {entry.student?.name ? ` • ${entry.student.name}` : ''}
                              {entry.invoice?.invoiceNo ? ` • ${entry.invoice.invoiceNo}` : ''}
                              {entry.bankAccount ? ` • ${entry.bankAccount.bankName}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${bookMeta.className}`}>
                                {bookMeta.label}
                              </span>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${directionMeta.className}`}>
                                {directionMeta.label}
                              </span>
                              {verificationMeta ? (
                                <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${verificationMeta.className}`}>
                                  {verificationMeta.label}
                                </span>
                              ) : null}
                              {entry.book === 'BANKBOOK' ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                                    entry.matched
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {entry.matched ? 'Sudah matched' : 'Belum matched'}
                                </span>
                              ) : null}
                            </div>
                            {entry.referenceNo ? (
                              <div className="mt-2 text-[11px] text-slate-500">Referensi: {entry.referenceNo}</div>
                            ) : null}
                            {entry.note ? <div className="mt-1 text-[11px] text-slate-500">{entry.note}</div> : null}
                            {entry.matchedStatementEntry ? (
                              <div className="mt-1 text-[11px] text-emerald-700">
                                Matched ke mutasi {entry.matchedStatementEntry.referenceNo || 'tanpa referensi'}
                                {entry.matchedStatementEntry.reconciliation
                                  ? ` • ${entry.matchedStatementEntry.reconciliation.reconciliationNo}`
                                  : ''}
                              </div>
                            ) : entry.book === 'BANKBOOK' && !entry.affectsBalance ? (
                              <div className="mt-1 text-[11px] text-sky-700">
                                Transaksi menunggu verifikasi, jadi belum masuk saldo buku bank.
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-sm font-bold ${entry.direction === 'IN' ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {entry.direction === 'IN' ? '+' : '-'} {formatCurrency(entry.amount)}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              Saldo {entry.book === 'CASHBOOK' ? 'kas' : 'buku bank'}
                            </div>
                            <div className="text-xs font-semibold text-slate-900">
                              {formatCurrency(entry.runningBalance)}
                            </div>
                            {entry.book === 'BANKBOOK' && entry.accountRunningBalance != null ? (
                              <div className="mt-1 text-[11px] text-slate-500">
                                Saldo rekening {formatCurrency(entry.accountRunningBalance)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="text-xs uppercase tracking-wider text-slate-700">Budget vs Realization</div>
          <p className="mt-1 text-sm text-slate-600">
            Kontrol anggaran finance yang menggabungkan pengajuan disetujui, konfirmasi realisasi, progres LPJ, dan actual spent dari LPJ yang selesai diproses.
            {activeYear?.name ? ` Fokus ${activeYear.name}.` : ''}
          </p>
        </div>
        <div className="p-4 space-y-4">
          {budgetRealizationQuery.isLoading ? (
            <div className="text-sm text-slate-500">Memuat ringkasan budget vs realization...</div>
          ) : !budgetRealizationSummary ? (
            <div className="text-sm text-slate-500">Ringkasan budget vs realization belum tersedia.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-700">Budget Approved</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {formatCurrency(budgetRealizationSummary.overview.approvedBudgetAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-700">Actual Realized</div>
                  <div className="mt-1 text-sm font-bold text-emerald-900">
                    {formatCurrency(budgetRealizationSummary.overview.actualRealizedAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-sky-700">Realisasi Confirmed</div>
                  <div className="mt-1 text-sm font-bold text-sky-900">
                    {formatCurrency(budgetRealizationSummary.overview.realizationConfirmedBudgetAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-violet-700">Variance</div>
                  <div className="mt-1 text-sm font-bold text-violet-900">
                    {formatCurrency(budgetRealizationSummary.overview.varianceAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-amber-700">Menunggu LPJ</div>
                  <div className="mt-1 text-sm font-bold text-amber-900">
                    {budgetRealizationSummary.overview.stageSummary.waitingLpjCount} budget
                  </div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    {formatCurrency(budgetRealizationSummary.overview.stageSummary.waitingLpjAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-rose-700">Review/Return Finance</div>
                  <div className="mt-1 text-sm font-bold text-rose-900">
                    {budgetRealizationSummary.overview.stageSummary.financeReviewCount +
                      budgetRealizationSummary.overview.stageSummary.returnedByFinanceCount}{' '}
                    budget
                  </div>
                  <div className="mt-1 text-[11px] text-rose-700">
                    {formatCurrency(
                      budgetRealizationSummary.overview.stageSummary.financeReviewAmount +
                        budgetRealizationSummary.overview.stageSummary.returnedByFinanceAmount,
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.48fr_0.52fr] gap-4">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Rekap per Duty</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Budget approved, actual realized, dan variance per penanggung jawab anggaran.
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{budgetRealizationSummary.dutyRecap.length} duty</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Duty</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Approved</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actual</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Variance</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {budgetRealizationSummary.dutyRecap.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                              Belum ada data duty untuk tahun ajaran ini.
                            </td>
                          </tr>
                        ) : (
                          budgetRealizationSummary.dutyRecap.map((row) => (
                            <tr key={row.additionalDuty}>
                              <td className="px-4 py-3 text-sm text-slate-700">
                                <div className="font-semibold text-slate-900">{row.additionalDutyLabel}</div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                  {row.totalRequests} request • {row.approvedCount} approved
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                {formatCurrency(row.approvedBudgetAmount)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">
                                {formatCurrency(row.actualRealizedAmount)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-violet-700">
                                {formatCurrency(row.varianceAmount)}
                              </td>
                              <td className="px-4 py-3 text-right text-[11px] text-slate-500">
                                {row.waitingRealizationCount + row.waitingLpjCount + row.financeReviewCount + row.returnedByFinanceCount} tindak lanjut
                                <div className="mt-1 text-slate-700">{row.realizationRate.toFixed(1)}%</div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Antrian Tindak Lanjut</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Budget yang masih tertahan di approval, realisasi, LPJ, atau review finance.
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{budgetRealizationSummary.followUpQueue.length} item</div>
                    </div>
                    <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                      {budgetRealizationSummary.followUpQueue.length === 0 ? (
                        <div className="text-sm text-slate-500">Tidak ada antrian tindak lanjut. Semua budget sudah rapi.</div>
                      ) : (
                        budgetRealizationSummary.followUpQueue.map((row) => {
                          const stageMeta = getBudgetProgressStageMeta(row.stage);
                          return (
                            <div key={`budget-follow-up-${row.budgetId}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">{row.title}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {row.requesterName} • {row.additionalDutyLabel}
                                  </div>
                                </div>
                                <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${stageMeta.className}`}>
                                  {stageMeta.label}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-slate-500">Approved</div>
                                  <div className="mt-1 font-semibold text-slate-900">{formatCurrency(row.approvedBudgetAmount)}</div>
                                </div>
                                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                                  <div className="text-emerald-700">Actual</div>
                                  <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(row.actualRealizedAmount)}</div>
                                </div>
                                <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                                  <div className="text-violet-700">Variance</div>
                                  <div className="mt-1 font-semibold text-violet-900">{formatCurrency(row.varianceAmount)}</div>
                                </div>
                              </div>
                              <div className="mt-2 text-[11px] text-slate-500">
                                {row.pendingSince ? `Sejak ${formatDate(row.pendingSince)}` : 'Belum ada tanggal stage'} • {row.daysInStage} hari
                                {row.latestLpjStatus ? ` • LPJ ${row.latestLpjStatus}` : ''}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Realisasi Terbaru</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Budget yang sudah selesai diproses finance, untuk memantau actual spent terbaru.
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{budgetRealizationSummary.recentRealizations.length} item</div>
                    </div>
                    <div className="p-4 space-y-3 max-h-[280px] overflow-y-auto">
                      {budgetRealizationSummary.recentRealizations.length === 0 ? (
                        <div className="text-sm text-slate-500">Belum ada realisasi selesai dari LPJ finance.</div>
                      ) : (
                        budgetRealizationSummary.recentRealizations.map((row) => (
                          <div key={`budget-realized-${row.budgetId}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="text-sm font-semibold text-slate-900">{row.title}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {row.requesterName} • {row.additionalDutyLabel}
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <div className="text-slate-500">Approved</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatCurrency(row.approvedBudgetAmount)}</div>
                              </div>
                              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                                <div className="text-emerald-700">Actual</div>
                                <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(row.actualRealizedAmount)}</div>
                              </div>
                              <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                                <div className="text-violet-700">Variance</div>
                                <div className="mt-1 font-semibold text-violet-900">{formatCurrency(row.varianceAmount)}</div>
                              </div>
                            </div>
                            <div className="mt-2 text-[11px] text-slate-500">
                              Selesai {row.completedAt ? formatDate(row.completedAt) : '-'} • {row.completedInvoiceCount} invoice LPJ
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="text-xs uppercase tracking-wider text-slate-700">Closing Period Finance</div>
          <p className="mt-1 text-sm text-slate-600">
            Ajukan closing bulanan atau tahunan dengan snapshot kas, bank, outstanding, dan kontrol lock periode yang akan dibaca seluruh modul finance.
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-700">Total Period</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {closingPeriodsSummary?.totalPeriods || 0}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-sky-700">Masih Terbuka</div>
              <div className="mt-1 text-sm font-bold text-sky-900">
                {closingPeriodsSummary?.openCount || 0}
              </div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-amber-700">Review Closing</div>
              <div className="mt-1 text-sm font-bold text-amber-900">
                {closingPeriodsSummary?.reviewCount || 0}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-700">Sudah Locked</div>
              <div className="mt-1 text-sm font-bold text-emerald-900">
                {closingPeriodsSummary?.closedCount || 0}
              </div>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-rose-700">Pending Verifikasi</div>
              <div className="mt-1 text-sm font-bold text-rose-900">
                {formatCurrency(closingPeriodsSummary?.totalPendingVerificationAmount || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-violet-700">Unmatched Bank</div>
              <div className="mt-1 text-sm font-bold text-violet-900">
                {formatCurrency(closingPeriodsSummary?.totalUnmatchedBankAmount || 0)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.42fr_0.58fr] gap-4">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">Ajukan Closing Period</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={closingPeriodType}
                    onChange={(event) => setClosingPeriodType(event.target.value as FinanceClosingPeriodType)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {CLOSING_PERIOD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={closingPeriodYear}
                    onChange={(event) => setClosingPeriodYear(event.target.value)}
                    placeholder="Tahun closing"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  {closingPeriodType === 'MONTHLY' ? (
                    <select
                      value={closingPeriodMonth}
                      onChange={(event) => setClosingPeriodMonth(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                        <option key={`closing-period-month-${month}`} value={String(month)}>
                          {getFinanceMonthLabel(month)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      Closing tahunan akan memakai seluruh periode Januari-Desember.
                    </div>
                  )}
                  <input
                    value={closingPeriodLabel}
                    onChange={(event) => setClosingPeriodLabel(event.target.value)}
                    placeholder="Label closing opsional"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={closingPeriodNote}
                  onChange={(event) => setClosingPeriodNote(event.target.value)}
                  rows={3}
                  placeholder="Catatan closing, misalnya kondisi verifikasi transfer atau alasan percepatan lock periode."
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Setelah disetujui, transaksi pada periode ini akan terkunci sesuai policy approval closing.
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateClosingPeriod}
                    disabled={createClosingPeriodMutation.isPending}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {createClosingPeriodMutation.isPending ? 'Mengajukan...' : 'Ajukan Closing'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Policy Approval Closing</div>
                <div className="mt-3 space-y-3">
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={closingPeriodRequireHeadTuApproval}
                      onChange={(event) => setClosingPeriodRequireHeadTuApproval(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Wajib review Head TU</div>
                      <div className="text-xs text-slate-500">
                        Jika aktif, semua closing period minimal akan masuk review Kepala TU sebelum bisa ditutup.
                      </div>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs uppercase tracking-wider text-slate-500">Threshold Eskalasi Kepsek</div>
                      <input
                        value={closingPeriodPrincipalApprovalThresholdAmount}
                        onChange={(event) => setClosingPeriodPrincipalApprovalThresholdAmount(event.target.value)}
                        placeholder="Nominal eskalasi"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <textarea
                      value={closingPeriodPolicyNotes}
                      onChange={(event) => setClosingPeriodPolicyNotes(event.target.value)}
                      rows={3}
                      placeholder="Catatan policy approval closing"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      {
                        checked: closingPeriodEscalateIfPendingVerification,
                        onChange: setClosingPeriodEscalateIfPendingVerification,
                        title: 'Eskalasi jika masih ada payment pending',
                      },
                      {
                        checked: closingPeriodEscalateIfUnmatchedBankEntries,
                        onChange: setClosingPeriodEscalateIfUnmatchedBankEntries,
                        title: 'Eskalasi jika mutasi bank belum matched',
                      },
                      {
                        checked: closingPeriodEscalateIfOpenCashSession,
                        onChange: setClosingPeriodEscalateIfOpenCashSession,
                        title: 'Eskalasi jika masih ada sesi kas terbuka',
                      },
                      {
                        checked: closingPeriodEscalateIfOpenReconciliation,
                        onChange: setClosingPeriodEscalateIfOpenReconciliation,
                        title: 'Eskalasi jika rekonsiliasi bank belum final',
                      },
                    ].map((item) => (
                      <label
                        key={item.title}
                        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) => item.onChange(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{item.title}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => saveClosingPeriodApprovalPolicyMutation.mutate()}
                      disabled={saveClosingPeriodApprovalPolicyMutation.isPending || closingPeriodApprovalPolicyQuery.isLoading}
                      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saveClosingPeriodApprovalPolicyMutation.isPending ? 'Menyimpan...' : 'Simpan Policy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Riwayat Closing Period</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Snapshot terbaru untuk memonitor lock periode, outstanding, dan eskalasi approval.
                  </div>
                </div>
                <div className="text-xs text-slate-500">{closingPeriods.length} periode</div>
              </div>
              <div className="p-4 space-y-3 max-h-[720px] overflow-y-auto">
                {closingPeriodsQuery.isLoading ? (
                  <div className="text-sm text-slate-500">Memuat closing period...</div>
                ) : closingPeriods.length === 0 ? (
                  <div className="text-sm text-slate-500">Belum ada closing period yang diajukan.</div>
                ) : (
                  closingPeriods.map((period) => {
                    const statusMeta = getClosingPeriodStatusMeta(period.status);
                    const approvalMeta = getClosingPeriodApprovalMeta(period.approvalStatus);
                    return (
                      <div key={period.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">{period.label}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                              {period.requestedBy?.name ? ` • diajukan ${period.requestedBy.name}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusMeta.className}`}>
                                {statusMeta.label}
                              </span>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${approvalMeta.className}`}>
                                {approvalMeta.label}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[280px]">
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div className="text-slate-500">Outstanding</div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {formatCurrency(period.summary.outstandingAmount)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                              <div className="text-sky-700">Pending Verifikasi</div>
                              <div className="mt-1 font-semibold text-sky-900">
                                {formatCurrency(period.summary.pendingVerificationAmount)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                              <div className="text-violet-700">Unmatched Bank</div>
                              <div className="mt-1 font-semibold text-violet-900">
                                {formatCurrency(period.summary.unmatchedBankAmount)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                              <div className="text-amber-700">Kas/Rekon Terbuka</div>
                              <div className="mt-1 font-semibold text-amber-900">
                                {period.summary.openCashSessionCount} / {period.summary.openReconciliationCount}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <div className="text-slate-500">Saldo Kas</div>
                            <div className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(period.summary.cashClosingBalance)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <div className="text-slate-500">Saldo Bank</div>
                            <div className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(period.summary.bankClosingBalance)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                            <div className="text-emerald-700">Cash In / Out</div>
                            <div className="mt-1 font-semibold text-emerald-900">
                              {formatCurrency(period.summary.totalCashIn)} / {formatCurrency(period.summary.totalCashOut)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                            <div className="text-indigo-700">Bank In / Out</div>
                            <div className="mt-1 font-semibold text-indigo-900">
                              {formatCurrency(period.summary.totalBankIn)} / {formatCurrency(period.summary.totalBankOut)}
                            </div>
                          </div>
                        </div>
                        {period.closingNote ? (
                          <div className="mt-3 text-[11px] text-slate-500">{period.closingNote}</div>
                        ) : null}
                        {period.headTuDecisionNote ? (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Review Head TU: {period.headTuDecisionNote}
                          </div>
                        ) : null}
                        {period.principalDecisionNote ? (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Keputusan Kepsek: {period.principalDecisionNote}
                          </div>
                        ) : null}
                        {period.closedAt ? (
                          <div className="mt-1 text-[11px] text-emerald-700">
                            Locked {formatDate(period.closedAt)}{period.closedBy?.name ? ` oleh ${period.closedBy.name}` : ''}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Master Komponen Biaya</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Penambahan komponen dilakukan lewat popup agar tabel hasil tetap rapi dan fokus.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openCreateComponentModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Tambah Komponen
            </button>
          </div>
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Periode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {componentsQuery.isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={5}>
                      Memuat komponen...
                    </td>
                  </tr>
                ) : components.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={5}>
                      Belum ada komponen.
                    </td>
                  </tr>
                ) : (
                  components.map((component: FinanceComponent) => (
                    <tr key={component.id}>
                      <td className="px-3 py-2 text-sm text-gray-700">{component.code}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">
                        <div className="font-medium">{component.name}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {component.lateFeeEnabled
                            ? `Denda ${getLateFeeModeLabel(component.lateFeeMode)} • ${formatCurrency(
                                component.lateFeeAmount,
                              )} • grace ${component.lateFeeGraceDays} hari${
                                component.lateFeeCapAmount != null
                                  ? ` • cap ${formatCurrency(component.lateFeeCapAmount)}`
                                  : ''
                              }`
                            : 'Tanpa denda keterlambatan'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {PERIODICITY_OPTIONS.find((option) => option.value === component.periodicity)?.label ||
                          component.periodicity}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${
                            component.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {component.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditComponent(component)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              toggleComponentMutation.mutate({
                                componentId: component.id,
                                isActive: !component.isActive,
                              })
                            }
                            disabled={toggleComponentMutation.isPending}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${
                              component.isActive
                                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            } disabled:opacity-50`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {component.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-2">
              <WalletCards className="w-4 h-4 text-emerald-600" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Rule Tarif Dinamis</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Penambahan tarif dibuka lewat popup, lalu hasilnya langsung tampil di tabel berikut.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openCreateTariffModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Tambah Tarif
            </button>
          </div>
          <div className="border border-gray-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Komponen</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Nominal</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tariffsQuery.isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={5}>
                      Memuat tarif...
                    </td>
                  </tr>
                ) : tariffs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={5}>
                      Belum ada tarif.
                    </td>
                  </tr>
                ) : (
                  tariffs.map((tariff) => (
                    <tr key={tariff.id}>
                      <td className="px-3 py-2 text-sm text-gray-900">{tariff.component?.name || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        <div>{describeTariffScope(tariff)}</div>
                        {tariff.notes ? <div className="mt-1 text-[11px] text-gray-500">{tariff.notes}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${
                            tariff.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {tariff.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-right text-gray-700">{formatCurrency(tariff.amount)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTariff(tariff)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              toggleTariffMutation.mutate({
                                tariffId: tariff.id,
                                isActive: !tariff.isActive,
                              })
                            }
                            disabled={toggleTariffMutation.isPending}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${
                              tariff.isActive
                                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            } disabled:opacity-50`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {tariff.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-2">
          <WalletCards className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-gray-900">Rule Penyesuaian Dinamis</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            value={adjustmentCode}
            onChange={(event) => setAdjustmentCode(event.target.value)}
            placeholder="Kode rule (contoh: BEASISWA_PRESTASI)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={adjustmentName}
            onChange={(event) => setAdjustmentName(event.target.value)}
            placeholder="Nama rule penyesuaian"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={adjustmentKind}
            onChange={(event) => setAdjustmentKind(event.target.value as FinanceAdjustmentKind)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {ADJUSTMENT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={adjustmentAmount}
            onChange={(event) => setAdjustmentAmount(event.target.value)}
            placeholder="Nominal penyesuaian"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={adjustmentComponentId === '' ? '' : String(adjustmentComponentId)}
            onChange={(event) => setAdjustmentComponentId(event.target.value ? Number(event.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Seluruh invoice</option>
            {components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
          <select
            value={adjustmentAcademicYearId === '' ? '' : String(adjustmentAcademicYearId)}
            onChange={(event) =>
              setAdjustmentAcademicYearId(event.target.value ? Number(event.target.value) : '')
            }
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua tahun ajaran</option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
                {year.isActive ? ' (Aktif)' : ''}
              </option>
            ))}
          </select>
          <select
            value={adjustmentGradeLevel}
            onChange={(event) => setAdjustmentGradeLevel(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua kelas</option>
            {classLevelOptions.map((level) => (
              <option key={level} value={level}>
                {getClassLevelLabel(level)}
              </option>
            ))}
          </select>
          <select
            value={adjustmentMajorId === '' ? '' : String(adjustmentMajorId)}
            onChange={(event) => setAdjustmentMajorId(event.target.value ? Number(event.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua jurusan</option>
            {majors.map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </select>
          <select
            value={adjustmentSemester}
            onChange={(event) => setAdjustmentSemester(event.target.value as SemesterCode | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua semester</option>
            <option value="ODD">Ganjil</option>
            <option value="EVEN">Genap</option>
          </select>
          <input
            type="date"
            value={adjustmentEffectiveStart}
            onChange={(event) => setAdjustmentEffectiveStart(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={adjustmentEffectiveEnd}
            onChange={(event) => setAdjustmentEffectiveEnd(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSaveAdjustment}
            disabled={saveAdjustmentMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 text-white text-sm font-semibold px-4 py-2 hover:bg-violet-700 disabled:opacity-50"
          >
            {saveAdjustmentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingAdjustmentId ? 'Simpan Perubahan' : 'Tambah Penyesuaian'}
          </button>
          {editingAdjustmentId ? (
            <button
              type="button"
              onClick={resetAdjustmentForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold px-4 py-2 hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              Batal Edit
            </button>
          ) : null}
        </div>

        <textarea
          value={adjustmentDescription}
          onChange={(event) => setAdjustmentDescription(event.target.value)}
          placeholder="Deskripsi penyesuaian (opsional)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20 w-full"
        />
        <textarea
          value={adjustmentNotes}
          onChange={(event) => setAdjustmentNotes(event.target.value)}
          placeholder="Catatan tambahan (opsional)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20 w-full"
        />

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900">Target Siswa Spesifik</div>
              <p className="text-xs text-slate-600 mt-1">
                Kosongkan jika rule berlaku global sesuai filter. Isi jika rule hanya berlaku untuk siswa tertentu.
              </p>
            </div>
            {selectedAdjustmentStudent ? (
              <button
                type="button"
                onClick={handleClearAdjustmentStudent}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
                Reset Siswa
              </button>
            ) : null}
          </div>
          <input
            value={adjustmentStudentSearch}
            onChange={(event) => setAdjustmentStudentSearch(event.target.value)}
            placeholder="Cari siswa berdasarkan nama, username, NIS, NISN, kelas"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
          />
          {selectedAdjustmentStudent ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-900">
              <span>
                {selectedAdjustmentStudent.name} • {selectedAdjustmentStudent.studentClass?.name || '-'}
              </span>
              <button
                type="button"
                onClick={handleClearAdjustmentStudent}
                className="text-violet-700 hover:text-violet-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Belum ada siswa spesifik yang dipilih.</div>
          )}
          {adjustmentStudentCandidates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {adjustmentStudentCandidates.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleSelectAdjustmentStudent(student.id)}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-violet-200 hover:bg-violet-50/60"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{student.name}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {student.username} • {student.studentClass?.name || 'Tanpa kelas'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {(student.nis ? `NIS ${student.nis}` : student.nisn ? `NISN ${student.nisn}` : 'Tanpa identitas') +
                        ' • ' +
                        (student.studentClass?.major?.name || 'Tanpa jurusan')}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700">
                    Pilih
                  </span>
                </button>
              ))}
            </div>
          ) : adjustmentStudentSearch.trim() ? (
            <div className="text-xs text-slate-500">Tidak ada siswa yang cocok dengan pencarian.</div>
          ) : null}
        </div>

        <div className="border border-gray-100 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rule</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Nominal</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adjustmentsQuery.isLoading ? (
                <tr>
                  <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={5}>
                    Memuat rule penyesuaian...
                  </td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={5}>
                    Belum ada rule penyesuaian.
                  </td>
                </tr>
              ) : (
                adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      <div className="font-medium">{adjustment.name}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {adjustment.code} • {getAdjustmentKindLabel(adjustment.kind)}
                      </div>
                      {adjustment.notes ? <div className="mt-1 text-[11px] text-gray-500">{adjustment.notes}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      <div>{describeAdjustmentScope(adjustment)}</div>
                      {adjustment.description ? (
                        <div className="mt-1 text-[11px] text-gray-500">{adjustment.description}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${
                          adjustment.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {adjustment.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-gray-700">
                      {(adjustment.kind === 'DISCOUNT' || adjustment.kind === 'SCHOLARSHIP' ? '-' : '+') +
                        formatCurrency(adjustment.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditAdjustment(adjustment)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            toggleAdjustmentMutation.mutate({
                              adjustmentId: adjustment.id,
                              isActive: !adjustment.isActive,
                            })
                          }
                          disabled={toggleAdjustmentMutation.isPending}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${
                            adjustment.isActive
                              ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          } disabled:opacity-50`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {adjustment.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ReceiptText className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">Generate Tagihan Siswa</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <select
            value={invoiceYearId === '' ? String(activeYear?.id || '') : String(invoiceYearId)}
            onChange={(event) => setInvoiceYearId(event.target.value ? Number(event.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
                {year.isActive ? ' (Aktif)' : ''}
              </option>
            ))}
          </select>
          <select
            value={invoiceSemester}
            onChange={(event) => setInvoiceSemester(event.target.value as SemesterCode)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="ODD">Ganjil</option>
            <option value="EVEN">Genap</option>
          </select>
          <input
            value={invoicePeriodKey}
            onChange={(event) => setInvoicePeriodKey(event.target.value)}
            placeholder="Period key (contoh: 2026-03)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={invoiceDueDate}
            onChange={(event) => setInvoiceDueDate(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={invoiceGradeLevel}
            onChange={(event) => setInvoiceGradeLevel(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua kelas</option>
            {classLevelOptions.map((level) => (
              <option key={level} value={level}>
                {getClassLevelLabel(level)}
              </option>
            ))}
          </select>
          <select
            value={invoiceMajorId === '' ? '' : String(invoiceMajorId)}
            onChange={(event) => setInvoiceMajorId(event.target.value ? Number(event.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua jurusan</option>
            {majors.map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </select>
          <input
            value={invoiceTitle}
            onChange={(event) => setInvoiceTitle(event.target.value)}
            placeholder="Judul tagihan (opsional)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={24}
            value={invoiceInstallmentCount}
            onChange={(event) =>
              setInvoiceInstallmentCount(Math.max(1, Math.min(24, Number(event.target.value || 1))))
            }
            placeholder="Jumlah cicilan"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={180}
            value={invoiceInstallmentIntervalDays}
            onChange={(event) =>
              setInvoiceInstallmentIntervalDays(
                Math.max(1, Math.min(180, Number(event.target.value || 30))),
              )
            }
            placeholder="Jarak cicilan (hari)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            <input
              type="checkbox"
              checked={invoiceAutoApplyCreditBalance}
              onChange={(event) => setInvoiceAutoApplyCreditBalance(event.target.checked)}
              className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
            />
            Auto-apply saldo kredit yang tersedia
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={invoiceReplaceExisting}
              onChange={(event) => setInvoiceReplaceExisting(event.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Replace invoice existing yang belum dibayar
          </label>
          <div className="md:col-span-3 xl:col-span-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">Target Siswa Spesifik</div>
                <p className="text-xs text-slate-600 mt-1">
                  Jika ada siswa dipilih, generate hanya memproses siswa terpilih dan filter kelas/jurusan/tingkat
                  menjadi referensi visual.
                </p>
              </div>
              {invoiceSelectedStudentIds.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClearInvoiceStudentSelection}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-3.5 h-3.5" />
                  Reset Pilihan
                </button>
              ) : null}
            </div>
            <input
              value={invoiceStudentSearch}
              onChange={(event) => setInvoiceStudentSearch(event.target.value)}
              placeholder="Cari siswa spesifik berdasarkan nama, username, NIS, NISN, kelas"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            />
            {selectedInvoiceStudents.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedInvoiceStudents.map((student) => (
                  <span
                    key={student.id}
                    className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900"
                  >
                    <span>
                      {student.name} • {student.studentClass?.name || '-'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveInvoiceStudent(student.id)}
                      className="text-indigo-700 hover:text-indigo-900"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Belum ada siswa spesifik yang dipilih.</div>
            )}
            {invoiceStudentCandidates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {invoiceStudentCandidates.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => handleSelectInvoiceStudent(student.id)}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50/60"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{student.name}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {student.username} • {student.studentClass?.name || 'Tanpa kelas'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {(student.nis ? `NIS ${student.nis}` : student.nisn ? `NISN ${student.nisn}` : 'Tanpa identitas') +
                          ' • ' +
                          (student.studentClass?.major?.name || 'Tanpa jurusan')}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                      Pilih
                    </span>
                  </button>
                ))}
              </div>
            ) : invoiceStudentSearch.trim() ? (
              <div className="text-xs text-slate-500">Tidak ada siswa yang cocok dengan pencarian.</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handlePreviewInvoices}
            disabled={previewInvoiceMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold px-4 py-2 hover:bg-indigo-100 disabled:opacity-50"
          >
            {previewInvoiceMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Preview Target
          </button>
          <button
            type="button"
            onClick={handleGenerateInvoices}
            disabled={generateInvoiceMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold px-4 py-2 hover:bg-indigo-700 disabled:opacity-50"
          >
            {generateInvoiceMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Generate
          </button>
        </div>
        {previewInvoiceMutation.data ? (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-indigo-700">Preview Generate</div>
                <p className="mt-1 text-sm text-indigo-900">
                  {previewInvoiceMutation.data.summary.totalTargetStudents} siswa terjaring dengan proyeksi tagihan{' '}
                  {formatCurrency(previewInvoiceMutation.data.summary.totalProjectedAmount)}.
                </p>
                {previewInvoiceMutation.data.filters.selectedStudentCount > 0 ? (
                  <p className="mt-1 text-xs text-indigo-700">
                    Mode target eksplisit aktif untuk {previewInvoiceMutation.data.filters.selectedStudentCount} siswa.
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs min-w-[320px]">
                <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2">
                  <div className="text-emerald-700">Siap dibuat</div>
                  <div className="mt-1 text-base font-semibold text-emerald-900">
                    {previewInvoiceMutation.data.summary.created}
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-blue-100 px-3 py-2">
                  <div className="text-blue-700">Siap diperbarui</div>
                  <div className="mt-1 text-base font-semibold text-blue-900">
                    {previewInvoiceMutation.data.summary.updated}
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-amber-100 px-3 py-2">
                  <div className="text-amber-700">Sudah ada</div>
                  <div className="mt-1 text-base font-semibold text-amber-900">
                    {previewInvoiceMutation.data.summary.skippedExisting}
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-rose-100 px-3 py-2">
                  <div className="text-rose-700">Terkunci</div>
                  <div className="mt-1 text-base font-semibold text-rose-900">
                    {previewInvoiceMutation.data.summary.skippedLocked}
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <div className="text-slate-700">Tanpa tarif</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {previewInvoiceMutation.data.summary.skippedNoTariff}
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-sky-100 px-3 py-2">
                  <div className="text-sky-700">Auto-apply kredit</div>
                  <div className="mt-1 text-sm font-semibold text-sky-900">
                    {formatCurrency(previewInvoiceMutation.data.summary.totalProjectedAppliedCredit)}
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-violet-100 px-3 py-2">
                  <div className="text-violet-700">Outstanding akhir</div>
                  <div className="mt-1 text-sm font-semibold text-violet-900">
                    {formatCurrency(previewInvoiceMutation.data.summary.totalProjectedOutstanding)}
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-indigo-100 rounded-lg overflow-hidden max-h-80 overflow-y-auto bg-white">
              <table className="min-w-full divide-y divide-indigo-100">
                <thead className="bg-indigo-50/70">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-indigo-700 uppercase">Siswa</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-indigo-700 uppercase">Scope</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-indigo-700 uppercase">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-indigo-700 uppercase">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50">
                  {previewInvoiceMutation.data.details.map((detail) => {
                    const status = getInvoicePreviewStatusMeta(detail.status);
                    return (
                      <tr key={`${detail.studentId}-${detail.status}`}>
                        <td className="px-3 py-2 text-sm text-gray-900">
                          <div className="font-medium">{detail.studentName}</div>
                          {detail.invoiceNo ? (
                            <div className="text-[11px] text-gray-500">{detail.invoiceNo}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          <div>{detail.className}</div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            {(detail.majorName ? `Jurusan ${detail.majorName}` : 'Semua jurusan') +
                              ' • ' +
                              (detail.gradeLevel ? `Tingkat ${detail.gradeLevel}` : 'Semua tingkat')}
                          </div>
                          {detail.items.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              {detail.items.map((item) => (
                                <div key={`${detail.studentId}-${item.itemKey}`} className="text-[11px] text-gray-500">
                                  <span className="font-medium text-gray-600">{item.componentName}</span> •{' '}
                                  {formatCurrency(item.amount)}
                                  {item.notes ? ` • ${item.notes}` : ''}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {detail.creditAutoApply.appliedAmount > 0 ? (
                            <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/80 px-2 py-1.5 text-[11px] text-sky-800">
                              Auto-apply saldo kredit: {formatCurrency(detail.creditAutoApply.appliedAmount)} dari saldo{' '}
                              {formatCurrency(detail.creditAutoApply.availableBalance)}.
                              <span className="font-semibold text-sky-900">
                                {' '}Sisa tagihan setelah apply {formatCurrency(detail.projectedBalanceAmount)}
                              </span>
                            </div>
                          ) : null}
                          <div className="mt-2 text-[11px] text-violet-700">
                            Skema cicilan: {detail.installmentPlan.count} termin • interval {detail.installmentPlan.intervalDays} hari
                          </div>
                          {detail.installmentPlan.installments.length > 0 ? (
                            <div className="mt-1 space-y-1">
                              {detail.installmentPlan.installments.map((installment) => (
                                <div
                                  key={`${detail.studentId}-${installment.sequence}`}
                                  className="text-[11px] text-violet-800"
                                >
                                  Termin {installment.sequence} • {formatCurrency(installment.amount)} • jatuh tempo{' '}
                                  {formatDate(installment.dueDate)}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {detail.reason ? <div className="mt-2 text-[11px] text-amber-700">{detail.reason}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-gray-800">
                          <div>{detail.totalAmount > 0 ? formatCurrency(detail.totalAmount) : '-'}</div>
                          <div className="mt-1 text-[11px] text-violet-700">
                            Akhir {detail.projectedBalanceAmount > 0 ? formatCurrency(detail.projectedBalanceAmount) : 'Lunas'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Write-Off Piutang</h3>
            <p className="mt-1 text-xs text-gray-500">
              Monitor pengajuan, approval, dan penerapan penghapusan piutang siswa.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-amber-700">Pending Kepala TU</div>
              <div className="mt-1 font-semibold text-amber-900">{writeOffSummary?.pendingHeadTuCount || 0}</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
              <div className="text-sky-700">Pending Kepala Sekolah</div>
              <div className="mt-1 font-semibold text-sky-900">{writeOffSummary?.pendingPrincipalCount || 0}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="text-emerald-700">Siap Apply</div>
              <div className="mt-1 font-semibold text-emerald-900">{writeOffSummary?.approvedCount || 0}</div>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
              <div className="text-violet-700">Sudah Diterapkan</div>
              <div className="mt-1 font-semibold text-violet-900">{writeOffSummary?.appliedCount || 0}</div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pengajuan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Nominal</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {writeOffsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Memuat pengajuan write-off...
                  </td>
                </tr>
              ) : writeOffRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Belum ada pengajuan write-off.
                  </td>
                </tr>
              ) : (
                writeOffRequests.slice(0, 12).map((request) => {
                  const status = getWriteOffStatusMeta(request.status);
                  return (
                    <tr key={request.id}>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{request.requestNo}</div>
                        <div className="text-xs text-gray-500">{request.student?.name || '-'}</div>
                        <div className="mt-1 text-[11px] text-gray-500">{request.reason}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{request.invoice?.invoiceNo || '-'}</div>
                        <div className="text-xs text-gray-500">
                          Outstanding {formatCurrency(request.invoice?.balanceAmount || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        <div>{formatCurrency(request.requestedAmount)}</div>
                        <div className="text-xs text-emerald-700">
                          Approved {formatCurrency(request.approvedAmount || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {request.status === 'APPROVED' ? (
                            <button
                              type="button"
                              onClick={() => applyWriteOffMutation.mutate(request)}
                              disabled={applyWriteOffMutation.isPending}
                              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              {applyWriteOffMutation.isPending ? 'Menerapkan...' : 'Terapkan'}
                            </button>
                          ) : null}
                          {request.invoiceId ? (
                            <button
                              type="button"
                              onClick={() => {
                                const invoice = invoices.find((item) => item.id === request.invoiceId);
                                if (invoice) setSelectedInvoice(invoice);
                              }}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Buka Invoice
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Reversal Pembayaran</h3>
            <p className="mt-1 text-xs text-gray-500">
              Monitor koreksi pembayaran, approval, dan penerapan reversal pembayaran langsung.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-amber-700">Pending Kepala TU</div>
              <div className="mt-1 font-semibold text-amber-900">{paymentReversalSummary?.pendingHeadTuCount || 0}</div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
              <div className="text-sky-700">Pending Kepala Sekolah</div>
              <div className="mt-1 font-semibold text-sky-900">{paymentReversalSummary?.pendingPrincipalCount || 0}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="text-emerald-700">Siap Apply</div>
              <div className="mt-1 font-semibold text-emerald-900">{paymentReversalSummary?.approvedCount || 0}</div>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
              <div className="text-violet-700">Sudah Diterapkan</div>
              <div className="mt-1 font-semibold text-violet-900">{paymentReversalSummary?.appliedCount || 0}</div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pengajuan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pembayaran</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Nominal</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paymentReversalsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Memuat pengajuan reversal pembayaran...
                  </td>
                </tr>
              ) : paymentReversalRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Belum ada pengajuan reversal pembayaran.
                  </td>
                </tr>
              ) : (
                paymentReversalRequests.slice(0, 12).map((request) => {
                  const status = getPaymentReversalStatusMeta(request.status);
                  return (
                    <tr key={request.id}>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{request.requestNo}</div>
                        <div className="text-xs text-gray-500">{request.student?.name || '-'}</div>
                        <div className="mt-1 text-[11px] text-gray-500">{request.reason}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{request.payment?.paymentNo || '-'}</div>
                        <div className="text-xs text-gray-500">
                          Invoice {request.invoice?.invoiceNo || '-'} • tersisa {formatCurrency(request.payment?.remainingReversibleAmount || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        <div>{formatCurrency(request.requestedAmount)}</div>
                        <div className="text-xs text-emerald-700">
                          Approved {formatCurrency(request.approvedAmount || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {request.status === 'APPROVED' ? (
                            <button
                              type="button"
                              onClick={() => applyPaymentReversalMutation.mutate(request)}
                              disabled={applyPaymentReversalMutation.isPending}
                              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              {applyPaymentReversalMutation.isPending ? 'Menerapkan...' : 'Terapkan'}
                            </button>
                          ) : null}
                          {request.invoiceId ? (
                            <button
                              type="button"
                              onClick={() => {
                                const invoice = invoices.find((item) => item.id === request.invoiceId);
                                if (invoice) setSelectedInvoice(invoice);
                              }}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Buka Invoice
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Daftar Tagihan</h3>
          <div className="flex gap-3">
            <input
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
              placeholder="Cari invoice/siswa"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={invoiceGradeLevelFilter}
              onChange={(event) => setInvoiceGradeLevelFilter(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Semua Kelas</option>
              {classLevelOptions.map((level) => (
                <option key={level} value={level}>
                  {getClassLevelLabel(level)}
                </option>
              ))}
            </select>
            <select
              value={invoiceStatusFilter}
              onChange={(event) => setInvoiceStatusFilter(event.target.value as '' | FinanceInvoiceStatus)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Siswa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Periode</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sisa</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoicesQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    Memuat tagihan...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    Belum ada tagihan.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{invoice.invoiceNo}</div>
                      <div className="text-xs text-gray-500">Jatuh tempo: {formatDate(invoice.dueDate)}</div>
                      <div className="mt-1 text-[11px] text-violet-700">
                        {invoice.installmentSummary.totalCount} termin • {invoice.installmentSummary.paidCount} lunas
                      </div>
                      {invoice.installmentSummary.nextInstallment ? (
                        <div className="mt-1 text-[11px] text-violet-700">
                          Termin berikutnya {invoice.installmentSummary.nextInstallment.sequence} • jatuh tempo{' '}
                          {formatDate(invoice.installmentSummary.nextInstallment.dueDate)}
                        </div>
                      ) : null}
                      {invoice.installmentSummary.overdueCount > 0 ? (
                        <div className="mt-1 text-[11px] text-rose-700">
                          {invoice.installmentSummary.overdueCount} termin overdue • outstanding{' '}
                          {formatCurrency(invoice.installmentSummary.overdueAmount)}
                        </div>
                      ) : null}
                      {invoice.lateFeeSummary?.configured ? (
                        <div className="mt-1 text-[11px] text-amber-700">
                          Potensi denda {formatCurrency(invoice.lateFeeSummary.calculatedAmount)} • sudah diterapkan{' '}
                          {formatCurrency(invoice.lateFeeSummary.appliedAmount)} • pending{' '}
                          {formatCurrency(invoice.lateFeeSummary.pendingAmount)}
                        </div>
                      ) : null}
                      {invoice.payments.some((payment) => payment.source === 'CREDIT_BALANCE') ? (
                        <div className="mt-1 text-[11px] text-sky-700">
                          Auto-apply kredit{' '}
                          {formatCurrency(
                            invoice.payments
                              .filter((payment) => payment.source === 'CREDIT_BALANCE')
                              .reduce(
                                (sum, payment) => sum + Number(payment.allocatedAmount || payment.amount || 0),
                                0,
                              ),
                          )}
                        </div>
                      ) : null}
                      {Number(invoice.writtenOffAmount || 0) > 0 ? (
                        <div className="mt-1 text-[11px] text-violet-700">
                          Write-off diterapkan {formatCurrency(invoice.writtenOffAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="font-medium text-gray-900">{invoice.student.name}</div>
                      <div className="text-xs text-gray-500">{invoice.student.studentClass?.name || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {invoice.periodKey} • {invoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(invoice.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-amber-700">
                      {formatCurrency(invoice.balanceAmount)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">{invoice.status}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.lateFeeSummary?.hasPending ? (
                          <button
                            type="button"
                            onClick={() => applyLateFeesMutation.mutate(invoice)}
                            disabled={applyLateFeesMutation.isPending}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                          >
                            {applyLateFeesMutation.isPending ? 'Menerapkan...' : 'Terapkan Denda'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openWriteOffModal(invoice)}
                          disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED' || createWriteOffMutation.isPending}
                          className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40"
                        >
                          Ajukan Write-Off
                        </button>
                        <button
                          type="button"
                          onClick={() => startPaying(invoice)}
                          disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED'}
                          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                        >
                          Catat Bayar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Laporan Keuangan</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExportReport('csv', 'monthly')}
                disabled={exportingKey === 'csv-monthly'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {exportingKey === 'csv-monthly' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                CSV Bulanan
              </button>
              <button
                type="button"
                onClick={() => handleExportReport('csv', 'class')}
                disabled={exportingKey === 'csv-class'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {exportingKey === 'csv-class' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                CSV Kelas
              </button>
              <button
                type="button"
                onClick={() => handleExportReport('csv', 'aging')}
                disabled={exportingKey === 'csv-aging'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {exportingKey === 'csv-aging' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                CSV Aging
              </button>
              <button
                type="button"
                onClick={() => handleExportReport('xlsx', 'all')}
                disabled={exportingKey === 'xlsx-all'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {exportingKey === 'xlsx-all' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                XLSX Lengkap
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <select
              value={reportYearId === '' ? String(activeYear?.id || '') : String(reportYearId)}
              onChange={(event) => setReportYearId(event.target.value ? Number(event.target.value) : '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isActive ? ' (Aktif)' : ''}
                </option>
              ))}
            </select>
            <select
              value={reportSemester}
              onChange={(event) => setReportSemester(event.target.value as SemesterCode | '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Semua Semester</option>
              <option value="ODD">Ganjil</option>
              <option value="EVEN">Genap</option>
            </select>
            <select
              value={reportGradeLevelFilter}
              onChange={(event) => setReportGradeLevelFilter(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Semua Kelas</option>
              {classLevelOptions.map((level) => (
                <option key={level} value={level}>
                  {getClassLevelLabel(level)}
                </option>
              ))}
            </select>
            <input
              value={reportPeriodFrom}
              onChange={(event) => setReportPeriodFrom(event.target.value)}
              placeholder="Period From (YYYY-MM)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={reportPeriodTo}
              onChange={(event) => setReportPeriodTo(event.target.value)}
              placeholder="Period To (YYYY-MM)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={reportAsOfDate}
              onChange={(event) => setReportAsOfDate(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {reportsQuery.isLoading ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              Memuat laporan keuangan...
            </div>
          ) : !reportSnapshot ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              Laporan tidak tersedia.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-blue-700">Total Invoice</div>
                  <div className="mt-1 text-lg font-bold text-blue-900">{reportSnapshot.summary.totalInvoices}</div>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-amber-700">Nominal Ditagihkan</div>
                  <div className="mt-1 text-lg font-bold text-amber-900">
                    {formatCurrency(reportSnapshot.summary.totalAmount)}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-emerald-700">Terbayar</div>
                  <div className="mt-1 text-lg font-bold text-emerald-900">
                    {formatCurrency(reportSnapshot.summary.totalPaid)}
                  </div>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-rose-700">Outstanding</div>
                  <div className="mt-1 text-lg font-bold text-rose-900">
                    {formatCurrency(reportSnapshot.summary.totalOutstanding)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-indigo-700">Collection Rate</div>
                  <div className="mt-1 text-lg font-bold text-indigo-900">
                    {reportSnapshot.kpi.collectionRate.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-indigo-700/80">Rasio pembayaran terhadap total tagihan</div>
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-violet-700">DSO Sederhana</div>
                  <div className="mt-1 text-lg font-bold text-violet-900">
                    {reportSnapshot.kpi.dsoDays.toFixed(1)} hari
                  </div>
                  <div className="text-[11px] text-violet-700/80">
                    Window {reportSnapshot.kpi.windowDays} hari
                  </div>
                </div>
                <div className="rounded-lg border border-orange-100 bg-orange-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-orange-700">Overdue Rate</div>
                  <div className="mt-1 text-lg font-bold text-orange-900">
                    {reportSnapshot.kpi.overdueRate.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-orange-700/80">Outstanding yang sudah lewat jatuh tempo</div>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-emerald-700">Pembayaran Harian</div>
                  <div className="mt-1 text-lg font-bold text-emerald-900">
                    {reportSnapshot.paymentDailyTrend.length} hari terpantau
                  </div>
                  <div className="text-[11px] text-emerald-700/80">Tren 60 hari terakhir</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-rose-700">Siswa Perlu Follow Up</div>
                  <div className="mt-1 text-lg font-bold text-rose-900">
                    {reportSnapshot.collectionOverview.studentsWithOutstanding}
                  </div>
                  <div className="text-[11px] text-rose-700/80">Memiliki saldo outstanding aktif</div>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-amber-700">Prioritas Tinggi</div>
                  <div className="mt-1 text-lg font-bold text-amber-900">
                    {reportSnapshot.collectionOverview.highPriorityCount}
                  </div>
                  <div className="text-[11px] text-amber-700/80">Butuh penagihan aktif dalam waktu dekat</div>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-rose-700">Kasus Kritis</div>
                  <div className="mt-1 text-lg font-bold text-rose-900">
                    {reportSnapshot.collectionOverview.criticalCount}
                  </div>
                  <div className="text-[11px] text-rose-700/80">Lewat lama / outstanding besar</div>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-sky-700">Jatuh Tempo 7 Hari</div>
                  <div className="mt-1 text-lg font-bold text-sky-900">
                    {reportSnapshot.collectionOverview.dueSoonCount}
                  </div>
                  <div className="text-[11px] text-sky-700/80">
                    {formatCurrency(reportSnapshot.collectionOverview.dueSoonOutstanding)} masih harus diamankan
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase">
                    Antrian Penagihan Prioritas
                  </div>
                  <div className="max-h-80 overflow-auto divide-y divide-gray-100">
                    {reportSnapshot.collectionPriorityQueue.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500">Belum ada saldo outstanding aktif.</div>
                    ) : (
                      reportSnapshot.collectionPriorityQueue.slice(0, 8).map((row) => (
                        <div key={row.studentId} className="px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{row.studentName}</div>
                              <div className="text-xs text-gray-500">
                                {row.className} • {row.nis || row.username}
                              </div>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getCollectionPriorityBadge(row.priority)}`}>
                              {row.priority}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                            <div>
                              Outstanding
                              <div className="font-semibold text-gray-900">{formatCurrency(row.totalOutstanding)}</div>
                            </div>
                            <div>
                              Overdue
                              <div className="font-semibold text-rose-700">{formatCurrency(row.overdueOutstanding)}</div>
                            </div>
                            <div>
                              Invoice aktif
                              <div className="font-semibold text-gray-900">{row.openInvoices}</div>
                            </div>
                            <div>
                              Max lewat
                              <div className="font-semibold text-gray-900">{row.maxDaysPastDue} hari</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-gray-500">
                            Jatuh tempo berikutnya: {formatDate(row.nextDueDate)} • Pembayaran terakhir: {formatDate(row.lastPaymentDate)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase">
                    Tagihan Jatuh Tempo Dekat
                  </div>
                  <div className="max-h-80 overflow-auto divide-y divide-gray-100">
                    {reportSnapshot.dueSoonInvoices.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500">Tidak ada tagihan jatuh tempo dalam 7 hari.</div>
                    ) : (
                      reportSnapshot.dueSoonInvoices.slice(0, 8).map((row) => (
                        <div key={row.invoiceId} className="px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{row.studentName}</div>
                              <div className="text-xs text-gray-500">
                                {row.invoiceNo} • {row.className}
                              </div>
                            </div>
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                              {getDueSoonLabel(row.daysUntilDue)}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-sky-900">
                            {formatCurrency(row.balanceAmount)}
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            Jatuh tempo {formatDate(row.dueDate)} • {row.title || row.periodKey}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase">
                    Komponen Penyumbang Tunggakan
                  </div>
                  <div className="max-h-80 overflow-auto divide-y divide-gray-100">
                    {reportSnapshot.componentReceivableRecap.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500">Belum ada komponen outstanding.</div>
                    ) : (
                      reportSnapshot.componentReceivableRecap.slice(0, 8).map((row) => (
                        <div key={`${row.componentCode}-${row.componentName}`} className="px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{row.componentName}</div>
                              <div className="text-xs text-gray-500">
                                {row.componentCode || '-'} • {row.studentCount} siswa
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-amber-700">
                                {formatCurrency(row.totalOutstanding)}
                              </div>
                              <div className="text-[11px] text-gray-500">{row.invoiceCount} invoice</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-gray-500">
                            Outstanding overdue: {formatCurrency(row.overdueOutstanding)} dari total tagihan {formatCurrency(row.totalAmount)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase flex items-center justify-between gap-2">
                    <span>Rekap Bulanan</span>
                    <button
                      type="button"
                      onClick={() => handleExportReport('csv', 'monthly')}
                      disabled={exportingKey === 'csv-monthly'}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      {exportingKey === 'csv-monthly' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      Export CSV
                    </button>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Periode</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Invoice</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reportSnapshot.monthlyRecap.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-sm text-gray-500 text-center" colSpan={3}>
                              Belum ada data.
                            </td>
                          </tr>
                        ) : (
                          reportSnapshot.monthlyRecap.map((row) => (
                            <tr key={row.periodKey}>
                              <td className="px-3 py-2 text-sm text-gray-800">{row.periodKey}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-700">{row.invoiceCount}</td>
                              <td className="px-3 py-2 text-sm text-right font-medium text-amber-700">
                                {formatCurrency(row.totalOutstanding)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase flex items-center justify-between gap-2">
                    <span>Rekap per Kelas</span>
                    <button
                      type="button"
                      onClick={() => handleExportReport('csv', 'class')}
                      disabled={exportingKey === 'csv-class'}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      {exportingKey === 'csv-class' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      Export CSV
                    </button>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Kelas</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Invoice</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reportSnapshot.classRecap.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-sm text-gray-500 text-center" colSpan={3}>
                              Belum ada data.
                            </td>
                          </tr>
                        ) : (
                          reportSnapshot.classRecap.map((row) => (
                            <tr key={`${row.classId ?? 0}-${row.className}`}>
                              <td className="px-3 py-2 text-sm text-gray-800">{row.className}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-700">{row.invoiceCount}</td>
                              <td className="px-3 py-2 text-sm text-right font-medium text-amber-700">
                                {formatCurrency(row.totalOutstanding)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase flex items-center justify-between gap-2">
                  <span>Aging Piutang</span>
                  <button
                    type="button"
                    onClick={() => handleExportReport('csv', 'aging')}
                    disabled={exportingKey === 'csv-aging'}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {exportingKey === 'csv-aging' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Bucket</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Invoice</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportSnapshot.agingPiutang.map((row) => (
                        <tr key={row.key}>
                          <td className="px-3 py-2 text-sm text-gray-800">{row.label}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-700">{row.invoiceCount}</td>
                          <td className="px-3 py-2 text-sm text-right font-semibold text-amber-700">
                            {formatCurrency(row.totalOutstanding)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-700 uppercase flex items-center justify-between gap-2">
                  <span>Tren Pembayaran Harian</span>
                  <button
                    type="button"
                    onClick={() => handleExportReport('csv', 'trend')}
                    disabled={exportingKey === 'csv-trend'}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {exportingKey === 'csv-trend' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Tanggal</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Transaksi</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportSnapshot.paymentDailyTrend.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-sm text-gray-500 text-center" colSpan={3}>
                            Belum ada pembayaran di rentang data ini.
                          </td>
                        </tr>
                      ) : (
                        [...reportSnapshot.paymentDailyTrend]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((row) => (
                            <tr key={row.date}>
                              <td className="px-3 py-2 text-sm text-gray-800">{formatDate(row.date)}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-700">{row.paymentCount}</td>
                              <td className="px-3 py-2 text-sm text-right font-semibold text-emerald-700">
                                {formatCurrency(row.totalPaid)}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {isComponentModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={closeComponentModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {editingComponentId ? 'Edit Master Komponen Biaya' : 'Tambah Master Komponen Biaya'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Setelah disimpan, komponen akan langsung muncul pada tabel utama.
                </p>
              </div>
              <button
                type="button"
                onClick={closeComponentModal}
                className="rounded-lg border border-gray-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={componentCode}
                  onChange={(event) => setComponentCode(event.target.value)}
                  placeholder="Kode komponen (contoh: SPP_BULANAN)"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={componentName}
                  onChange={(event) => setComponentName(event.target.value)}
                  placeholder="Nama komponen"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <select
                  value={componentPeriodicity}
                  onChange={(event) => setComponentPeriodicity(event.target.value as FinanceComponentPeriodicity)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {PERIODICITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={componentDescription}
                onChange={(event) => setComponentDescription(event.target.value)}
                placeholder="Deskripsi komponen (opsional)"
                className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={componentLateFeeEnabled}
                    onChange={(event) => setComponentLateFeeEnabled(event.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Aktifkan denda keterlambatan untuk komponen ini
                </label>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <select
                    value={componentLateFeeMode}
                    onChange={(event) => setComponentLateFeeMode(event.target.value as FinanceLateFeeMode)}
                    disabled={!componentLateFeeEnabled}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    {LATE_FEE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={componentLateFeeAmount}
                    onChange={(event) => setComponentLateFeeAmount(event.target.value)}
                    disabled={!componentLateFeeEnabled}
                    placeholder="Nominal denda"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                  <input
                    type="number"
                    min={0}
                    value={componentLateFeeGraceDays}
                    onChange={(event) => setComponentLateFeeGraceDays(event.target.value)}
                    disabled={!componentLateFeeEnabled}
                    placeholder="Grace period (hari)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  value={componentLateFeeCapAmount}
                  onChange={(event) => setComponentLateFeeCapAmount(event.target.value)}
                  disabled={!componentLateFeeEnabled}
                  placeholder="Maksimum denda per termin (opsional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={closeComponentModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveComponent}
                disabled={saveComponentMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saveComponentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingComponentId ? 'Simpan Perubahan' : 'Tambah Komponen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTariffModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={closeTariffModal}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {editingTariffId ? 'Edit Rule Tarif Dinamis' : 'Tambah Rule Tarif Dinamis'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Level kelas diambil dari master kelas admin tanpa membawa rombel.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTariffModal}
                className="rounded-lg border border-gray-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <select
                  value={tariffComponentId === '' ? '' : String(tariffComponentId)}
                  onChange={(event) => setTariffComponentId(event.target.value ? Number(event.target.value) : '')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Pilih komponen</option>
                  {components.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
                <select
                  value={tariffAcademicYearId === '' ? '' : String(tariffAcademicYearId)}
                  onChange={(event) => setTariffAcademicYearId(event.target.value ? Number(event.target.value) : '')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Semua tahun ajaran</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                      {year.isActive ? ' (Aktif)' : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={tariffGradeLevel}
                  onChange={(event) => setTariffGradeLevel(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Semua kelas</option>
                  {classLevelsQuery.isLoading && classLevelOptions.length === 0 ? (
                    <option value="" disabled>
                      Memuat level kelas...
                    </option>
                  ) : null}
                  {!classLevelsQuery.isLoading && classLevelOptions.length === 0 ? (
                    <option value="" disabled>
                      Belum ada level kelas admin
                    </option>
                  ) : null}
                  {classLevelOptions.map((level) => (
                    <option key={level} value={level}>
                      {getClassLevelLabel(level)}
                    </option>
                  ))}
                </select>
                <select
                  value={tariffMajorId === '' ? '' : String(tariffMajorId)}
                  onChange={(event) => setTariffMajorId(event.target.value ? Number(event.target.value) : '')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Semua jurusan</option>
                  {majors.map((major) => (
                    <option key={major.id} value={major.id}>
                      {major.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={tariffAmount}
                  onChange={(event) => setTariffAmount(event.target.value)}
                  placeholder="Nominal tarif"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <select
                  value={tariffSemester}
                  onChange={(event) => setTariffSemester(event.target.value as SemesterCode | '')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Semua semester</option>
                  <option value="ODD">Ganjil</option>
                  <option value="EVEN">Genap</option>
                </select>
                <input
                  type="date"
                  value={tariffEffectiveStart}
                  onChange={(event) => setTariffEffectiveStart(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={tariffEffectiveEnd}
                  onChange={(event) => setTariffEffectiveEnd(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={tariffNotes}
                onChange={(event) => setTariffNotes(event.target.value)}
                placeholder="Catatan tarif (opsional)"
                className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={closeTariffModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveTariff}
                disabled={saveTariffMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saveTariffMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingTariffId ? 'Simpan Perubahan' : 'Tambah Tarif'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isReminderPolicyModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={closeReminderPolicyModal}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Policy Reminder & Eskalasi Finance</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Worker production akan memakai policy ini untuk reminder due soon, overdue, warning denda, dan eskalasi.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReminderPolicyModal}
                className="rounded-lg border border-gray-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={reminderPolicyIsActive}
                    onChange={(event) => setReminderPolicyIsActive(event.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Aktifkan worker reminder otomatis
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  Saat nonaktif, worker background tidak akan mengirim reminder otomatis. Trigger manual tetap tersedia untuk staff finance.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/70 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-sky-900">Reminder Siswa & Orang Tua</h4>
                    <p className="mt-1 text-xs text-sky-800">
                      Semua pengingat eksternal membaca pengaturan ini secara live.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Due soon (hari)</label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={reminderDueSoonDays}
                        onChange={(event) => setReminderDueSoonDays(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Ulang due soon tiap (hari)</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={reminderDueSoonRepeatIntervalDays}
                        onChange={(event) => setReminderDueSoonRepeatIntervalDays(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Ulang overdue tiap (hari)</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={reminderOverdueRepeatIntervalDays}
                        onChange={(event) => setReminderOverdueRepeatIntervalDays(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Ulang warning denda tiap (hari)</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={reminderLateFeeWarningRepeatIntervalDays}
                        onChange={(event) => setReminderLateFeeWarningRepeatIntervalDays(event.target.value)}
                        disabled={!reminderLateFeeWarningEnabled}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderSendStudent}
                        onChange={(event) => setReminderSendStudent(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Kirim ke siswa
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderSendParent}
                        onChange={(event) => setReminderSendParent(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Kirim ke orang tua
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderLateFeeWarningEnabled}
                        onChange={(event) => setReminderLateFeeWarningEnabled(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Aktifkan warning denda
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/70 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-violet-900">Eskalasi Internal</h4>
                    <p className="mt-1 text-xs text-violet-800">
                      Dipakai saat tagihan melewati ambang overdue dan nominal outstanding tertentu.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Mulai eskalasi setelah (hari overdue)</label>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={reminderEscalationStartDays}
                        onChange={(event) => setReminderEscalationStartDays(event.target.value)}
                        disabled={!reminderEscalationEnabled}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Ulang eskalasi tiap (hari)</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={reminderEscalationRepeatIntervalDays}
                        onChange={(event) => setReminderEscalationRepeatIntervalDays(event.target.value)}
                        disabled={!reminderEscalationEnabled}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-slate-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-slate-600">Minimum outstanding untuk eskalasi</label>
                      <input
                        type="number"
                        min={0}
                        value={reminderEscalationMinOutstandingAmount}
                        onChange={(event) => setReminderEscalationMinOutstandingAmount(event.target.value)}
                        disabled={!reminderEscalationEnabled}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderEscalationEnabled}
                        onChange={(event) => setReminderEscalationEnabled(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Aktifkan eskalasi
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderEscalateToFinanceStaff}
                        onChange={(event) => setReminderEscalateToFinanceStaff(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Tujuan: staff keuangan
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderEscalateToHeadTu}
                        onChange={(event) => setReminderEscalateToHeadTu(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Tujuan: Kepala TU
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reminderEscalateToPrincipal}
                        onChange={(event) => setReminderEscalateToPrincipal(event.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Tujuan: Kepala Sekolah
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Catatan policy (opsional)</label>
                <textarea
                  value={reminderPolicyNotes}
                  onChange={(event) => setReminderPolicyNotes(event.target.value)}
                  placeholder="Contoh: Eskalasi principal hanya untuk outstanding besar atau kasus prioritas."
                  className="mt-1 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="mt-2 text-[11px] text-slate-500">
                  Update terakhir:{' '}
                  {reminderPolicy?.updatedAt ? formatDate(reminderPolicy.updatedAt) : '-'}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={closeReminderPolicyModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveReminderPolicy}
                disabled={saveReminderPolicyMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {saveReminderPolicyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Simpan Policy
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedInvoice && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
            onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Kelola Tagihan</h3>
              <p className="text-xs text-gray-500 mt-1">Invoice: {selectedInvoice.invoiceNo}</p>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="text-xs text-gray-600">
                Sisa tagihan: <span className="font-semibold">{formatCurrency(selectedInvoice.balanceAmount)}</span>
              </div>
              {Number(selectedInvoice.writtenOffAmount || 0) > 0 ? (
                <div className="rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs text-violet-800">
                  Write-off yang sudah diterapkan:{' '}
                  <span className="font-semibold">{formatCurrency(selectedInvoice.writtenOffAmount)}</span>
                </div>
              ) : null}
              {selectedInvoiceCreditAppliedAmount > 0 ? (
                <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-800">
                  Saldo kredit yang sudah terpakai ke invoice ini:{' '}
                  <span className="font-semibold">{formatCurrency(selectedInvoiceCreditAppliedAmount)}</span>
                </div>
              ) : null}
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900">
                <div className="font-semibold">Riwayat pembayaran & reversal</div>
                <div className="mt-1 text-[11px] text-emerald-700">
                  {(selectedInvoice.payments || []).length} pembayaran tercatat • {selectedInvoicePaymentReversals.length} pengajuan reversal.
                </div>
                {(selectedInvoice.payments || []).length === 0 ? (
                  <div className="mt-2 text-[11px] text-emerald-700">Belum ada pembayaran pada invoice ini.</div>
                ) : (
                  (selectedInvoice.payments || []).map((payment) => {
                    const paymentRequests = selectedInvoicePaymentReversals.filter((request) => request.paymentId === payment.id);
                    return (
                      <div key={`selected-payment-${payment.id}`} className="mt-2 rounded-md border border-emerald-200 bg-white/80 px-2 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-emerald-900">
                              {payment.paymentNo} • {formatCurrency(payment.amount)}
                            </div>
                            <div className="mt-1 text-[11px] text-emerald-700">
                              {formatDate(payment.paidAt)} • {getPaymentMethodLabel(payment.method)} • sumber {payment.source === 'CREDIT_BALANCE' ? 'Saldo Kredit' : 'Pembayaran Langsung'}
                            </div>
                            <div className="mt-1 text-[11px] text-emerald-700">
                              Status verifikasi {getPaymentVerificationMeta(payment.verificationStatus).label}
                              {payment.matchedStatementEntry
                                ? ` • matched ${payment.matchedStatementEntry.referenceNo || payment.matchedStatementEntry.reconciliation?.reconciliationNo || 'mutasi bank'}`
                                : ''}
                            </div>
                            <div className="mt-1 text-[11px] text-emerald-700">
                              Dialokasikan {formatCurrency(payment.allocatedAmount || 0)} • saldo kredit {formatCurrency(payment.creditedAmount || 0)} • sudah direversal {formatCurrency(payment.reversedAmount || 0)}
                            </div>
                            <div className="mt-1 text-[11px] text-emerald-700">
                              Sisa reversible {formatCurrency(payment.remainingReversibleAmount || 0)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openReversalModal(payment)}
                            disabled={!payment.canRequestReversal || createPaymentReversalMutation.isPending || payment.source !== 'DIRECT'}
                            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            Ajukan Reversal
                          </button>
                        </div>
                        {paymentRequests.map((request) => {
                          const status = getPaymentReversalStatusMeta(request.status);
                          return (
                            <div key={`selected-reversal-${request.id}`} className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/60 px-2 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-medium text-emerald-900">{request.requestNo}</div>
                                  <div className="mt-1 text-[11px] text-emerald-700">{request.reason}</div>
                                </div>
                                <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>
                                  {status.label}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-emerald-700">
                                Request {formatCurrency(request.requestedAmount)} • approved {formatCurrency(request.approvedAmount || 0)} • applied {formatCurrency(request.appliedAmount || 0)}
                              </div>
                              {request.status === 'APPROVED' ? (
                                <button
                                  type="button"
                                  onClick={() => applyPaymentReversalMutation.mutate(request)}
                                  disabled={applyPaymentReversalMutation.isPending}
                                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {applyPaymentReversalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                  Terapkan Reversal
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 text-xs text-violet-900">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Workflow write-off</div>
                    <div className="mt-1 text-[11px] text-violet-700">
                      {selectedInvoice.writeOffRequests?.length || 0} pengajuan tercatat untuk invoice ini.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWriteOffModal(selectedInvoice)}
                    disabled={createWriteOffMutation.isPending || selectedInvoice.status === 'PAID' || selectedInvoice.status === 'CANCELLED'}
                    className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                  >
                    Ajukan Write-Off
                  </button>
                </div>
                {(selectedInvoice.writeOffRequests || []).slice(0, 3).map((request) => {
                  const status = getWriteOffStatusMeta(request.status);
                  return (
                    <div key={`selected-writeoff-${request.id}`} className="mt-2 rounded-md border border-violet-200 bg-white/80 px-2 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-violet-900">{request.requestNo}</div>
                          <div className="mt-1 text-[11px] text-violet-700">{request.reason}</div>
                        </div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-violet-700">
                        Request {formatCurrency(request.requestedAmount)} • approved{' '}
                        {formatCurrency(request.approvedAmount || 0)} • applied{' '}
                        {formatCurrency(request.appliedAmount || 0)}
                      </div>
                      {request.status === 'APPROVED' ? (
                        <button
                          type="button"
                          onClick={() => applyWriteOffMutation.mutate(request)}
                          disabled={applyWriteOffMutation.isPending}
                          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {applyWriteOffMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Terapkan Write-Off
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {selectedInvoice.lateFeeSummary?.configured ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <div className="font-semibold">
                    Potensi denda {formatCurrency(selectedInvoice.lateFeeSummary.calculatedAmount)} • pending{' '}
                    {formatCurrency(selectedInvoice.lateFeeSummary.pendingAmount)}
                  </div>
                  {selectedInvoice.lateFeeSummary.breakdown.map((item) => (
                    <div key={`late-fee-${item.componentCode}`} className="mt-1">
                      {item.componentName} • {getLateFeeModeLabel(item.mode)} • grace {item.graceDays} hari • pending{' '}
                      {formatCurrency(item.pendingAmount)}
                    </div>
                  ))}
                  {selectedInvoice.lateFeeSummary.hasPending ? (
                    <button
                      type="button"
                      onClick={() => applyLateFeesMutation.mutate(selectedInvoice)}
                      disabled={applyLateFeesMutation.isPending}
                      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {applyLateFeesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Terapkan Denda Keterlambatan
                    </button>
                  ) : null}
                </div>
              ) : null}
              {selectedInvoiceInstallments.length > 0 ? (
                <div className="rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs text-violet-900">
                  <div className="font-semibold">
                    Skema cicilan {selectedInvoiceInstallments.length} termin
                    {selectedInvoiceNextInstallment
                      ? ` • Termin berikutnya ${selectedInvoiceNextInstallment.sequence} (${formatCurrency(
                          selectedInvoiceNextInstallment.balanceAmount,
                        )})`
                      : ' • Semua termin sudah lunas'}
                  </div>
                  {selectedInvoice.installmentSummary.overdueCount > 0 ? (
                    <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                      {selectedInvoice.installmentSummary.overdueCount} termin overdue • outstanding{' '}
                      {formatCurrency(selectedInvoice.installmentSummary.overdueAmount)}
                    </div>
                  ) : null}
                  <div className="mt-2 rounded-md border border-violet-200 bg-white/80 px-2 py-1 text-[11px] text-violet-800">
                    {selectedInvoiceCanEditAmounts
                      ? 'Invoice belum menerima pembayaran. Anda bisa ubah nominal dan jatuh tempo, selama total seluruh termin tetap sama dengan total invoice.'
                      : 'Invoice sudah menerima pembayaran. Nominal termin dikunci, tetapi jatuh tempo termin yang masih berjalan masih bisa digeser.'}
                  </div>
                  <div className="mt-2 space-y-1">
                    {selectedInvoiceInstallments.map((installment, index) => (
                      <div
                        key={`${selectedInvoice.id}-${installment.sequence}`}
                        className="rounded-md border border-violet-200 bg-white/80 px-2 py-2"
                      >
                        <div className="font-medium text-violet-900">
                          Termin {installment.sequence} • sisa {formatCurrency(installment.balanceAmount)}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            min={0}
                            value={installmentDrafts[index]?.amount || ''}
                            onChange={(event) =>
                              handleInstallmentDraftChange(
                                installment.sequence,
                                'amount',
                                event.target.value,
                              )
                            }
                            disabled={!selectedInvoiceCanEditAmounts}
                            className="border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-500"
                          />
                          <input
                            type="date"
                            value={installmentDrafts[index]?.dueDate || ''}
                            onChange={(event) =>
                              handleInstallmentDraftChange(
                                installment.sequence,
                                'dueDate',
                                event.target.value,
                              )
                            }
                            disabled={!selectedInvoiceCanEditAmounts && installment.balanceAmount <= 0}
                            className="border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-violet-700">
                          Jatuh tempo saat ini: {formatDate(installment.dueDate)} • status {installment.status}
                          {installment.isOverdue ? ` • overdue ${installment.daysPastDue} hari` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={installmentScheduleNote}
                    onChange={(event) => setInstallmentScheduleNote(event.target.value)}
                    placeholder="Catatan perubahan jadwal cicilan (opsional)"
                    className="mt-3 border border-violet-200 rounded-lg px-3 py-2 text-xs w-full min-h-20 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveInstallments()}
                    disabled={updateInstallmentsMutation.isPending}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {updateInstallmentsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Simpan Jadwal Cicilan
                  </button>
                </div>
              ) : null}
              <input
                type="number"
                min={0}
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                placeholder="Nominal pembayaran"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                <div>
                  {isTrackedNonCashPaymentMethod(paymentMethod) ? 'Proyeksi alokasi saat diverifikasi' : 'Dialokasikan ke invoice'}:{' '}
                  <span className="font-semibold">{formatCurrency(paymentAllocatedAmount)}</span>
                </div>
                <div>
                  {isTrackedNonCashPaymentMethod(paymentMethod) ? 'Proyeksi saldo kredit saat diverifikasi' : 'Masuk saldo kredit'}:{' '}
                  <span className="font-semibold">{formatCurrency(paymentCreditedAmount)}</span>
                </div>
              </div>
              {isTrackedNonCashPaymentMethod(paymentMethod) ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Pembayaran non-tunai akan masuk antrean verifikasi dulu. Tagihan siswa baru berkurang setelah bendahara memverifikasi transaksi ini.
                </div>
              ) : null}
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as FinancePaymentMethod)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {paymentMethod !== 'CASH' ? (
                <select
                  value={paymentBankAccountId}
                  onChange={(event) => setPaymentBankAccountId(event.target.value ? Number(event.target.value) : '')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">Pilih rekening bank</option>
                  {activeBankAccounts.map((account) => (
                    <option key={`payment-bank-${account.id}`} value={account.id}>
                      {account.bankName} • {account.accountNumber}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="Referensi transaksi (opsional)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
              <textarea
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="Catatan (opsional)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full min-h-20"
              />
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePayment}
                disabled={payInvoiceMutation.isPending || Number(paymentAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {payInvoiceMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCreditBalance && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={resetRefundForm}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Refund Saldo Kredit</h3>
              <p className="text-xs text-gray-500 mt-1">
                {selectedCreditBalance.student.name} • Saldo {formatCurrency(selectedCreditBalance.balanceAmount)}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                type="number"
                min={0}
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                placeholder="Nominal refund"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
              <select
                value={refundMethod}
                onChange={(event) => setRefundMethod(event.target.value as FinancePaymentMethod)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={`refund-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {refundMethod !== 'CASH' ? (
                <select
                  value={refundBankAccountId}
                  onChange={(event) => setRefundBankAccountId(event.target.value ? Number(event.target.value) : '')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">Pilih rekening bank</option>
                  {activeBankAccounts.map((account) => (
                    <option key={`refund-bank-${account.id}`} value={account.id}>
                      {account.bankName} • {account.accountNumber}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                value={refundReference}
                onChange={(event) => setRefundReference(event.target.value)}
                placeholder="Referensi refund (opsional)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
              <textarea
                value={refundNote}
                onChange={(event) => setRefundNote(event.target.value)}
                placeholder="Catatan refund (opsional)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full min-h-20"
              />
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetRefundForm}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveRefund}
                disabled={refundMutation.isPending || Number(refundAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {refundMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {reversalTargetPayment ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={resetReversalForm}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Ajukan Reversal Pembayaran</h3>
              <p className="text-xs text-gray-500 mt-1">
                {reversalTargetPayment.paymentNo} • Sisa reversible {formatCurrency(reversalTargetPayment.remainingReversibleAmount || 0)}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                type="number"
                min={0}
                value={reversalAmount}
                onChange={(event) => setReversalAmount(event.target.value)}
                placeholder="Nominal reversal"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
              <textarea
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
                placeholder="Alasan pengajuan reversal pembayaran"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full min-h-24"
              />
              <textarea
                value={reversalNote}
                onChange={(event) => setReversalNote(event.target.value)}
                placeholder="Catatan internal (opsional)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full min-h-20"
              />
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Approval berjalan berurutan: Kepala TU, lalu Kepala Sekolah, lalu bendahara menerapkan reversal ke pembayaran.
              </div>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetReversalForm}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePaymentReversal}
                disabled={createPaymentReversalMutation.isPending || Number(reversalAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {createPaymentReversalMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Kirim Pengajuan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {writeOffTargetInvoice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={resetWriteOffForm}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Ajukan Write-Off</h3>
              <p className="text-xs text-gray-500 mt-1">
                {writeOffTargetInvoice.invoiceNo} • Outstanding {formatCurrency(writeOffTargetInvoice.balanceAmount)}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                type="number"
                min={0}
                value={writeOffAmount}
                onChange={(event) => setWriteOffAmount(event.target.value)}
                placeholder="Nominal write-off"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
              <textarea
                value={writeOffReason}
                onChange={(event) => setWriteOffReason(event.target.value)}
                placeholder="Alasan pengajuan write-off"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full min-h-24"
              />
              <textarea
                value={writeOffNote}
                onChange={(event) => setWriteOffNote(event.target.value)}
                placeholder="Catatan internal (opsional)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full min-h-20"
              />
              <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                Pengajuan ini akan masuk approval Kepala TU dulu, lalu Kepala Sekolah, baru sesudah itu bisa diterapkan oleh bendahara.
              </div>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetWriteOffForm}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveWriteOff}
                disabled={createWriteOffMutation.isPending || Number(writeOffAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {createWriteOffMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Kirim Pengajuan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StaffFinancePage;
