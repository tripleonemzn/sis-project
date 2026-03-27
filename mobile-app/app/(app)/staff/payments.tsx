import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  type FinanceAdjustmentKind,
  type FinanceBankStatementDirection,
  staffFinanceApi,
  type StaffFinanceBankAccount,
  type StaffFinanceBankReconciliation,
  type StaffFinanceCashSession,
  type StaffFinanceCashSessionApprovalPolicy,
  type FinanceComponentPeriodicity,
  type StaffFinanceCreditBalanceRow,
  type StaffFinanceCreditTransaction,
  type FinanceInvoiceStatus,
  type FinanceLateFeeMode,
  type FinancePaymentMethod,
  type FinanceReminderMode,
  type SemesterCode,
  type StaffFinanceAdjustmentRule,
  type StaffFinanceComponent,
  type StaffFinanceInvoice,
  type StaffFinanceReminderPolicy,
  type StaffFinanceRefundRecord,
  type StaffFinancePaymentReversalRequest,
  type StaffFinanceTariffRule,
  type StaffFinanceWriteOffRequest,
} from '../../../src/features/staff/staffFinanceApi';
import { staffApi } from '../../../src/features/staff/staffApi';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { canAccessStaffPayments, getStaffPaymentsBlockedMessage } from '../../../src/features/staff/staffRole';

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

const STATUS_OPTIONS: Array<{ value: '' | FinanceInvoiceStatus; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'UNPAID', label: 'Belum Bayar' },
  { value: 'PARTIAL', label: 'Parsial' },
  { value: 'PAID', label: 'Lunas' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

const PAYMENT_METHOD_OPTIONS: Array<{ value: FinancePaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Tunai' },
  { value: 'BANK_TRANSFER', label: 'Transfer Bank' },
  { value: 'VIRTUAL_ACCOUNT', label: 'Virtual Account' },
  { value: 'E_WALLET', label: 'E-Wallet' },
  { value: 'OTHER', label: 'Lainnya' },
];

const LATE_FEE_MODE_OPTIONS: Array<{ value: FinanceLateFeeMode; label: string }> = [
  { value: 'FIXED', label: 'Tetap per termin overdue' },
  { value: 'DAILY', label: 'Harian per termin overdue' },
];

type FinanceTab = 'dashboard' | 'components' | 'tariffs' | 'adjustments' | 'invoices';

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

function getStatusBadge(status: FinanceInvoiceStatus) {
  if (status === 'PAID') return { label: 'Lunas', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (status === 'PARTIAL') return { label: 'Parsial', bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
  if (status === 'CANCELLED') return { label: 'Dibatalkan', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  return { label: 'Belum Bayar', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
}

function getCollectionPriorityStyle(priority: 'MONITOR' | 'TINGGI' | 'KRITIS') {
  if (priority === 'KRITIS') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  if (priority === 'TINGGI') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985' };
}

function getDueSoonLabel(daysUntilDue: number) {
  if (daysUntilDue <= 0) return 'Hari ini';
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

function describeTariffScope(tariff: StaffFinanceTariffRule) {
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

function getLateFeeModeLabel(mode?: FinanceLateFeeMode | null) {
  return LATE_FEE_MODE_OPTIONS.find((option) => option.value === mode)?.label || mode || '-';
}

function getCreditTransactionLabel(transaction: StaffFinanceCreditTransaction) {
  if (transaction.kind === 'APPLIED_TO_INVOICE') return 'Saldo kredit dipakai ke invoice';
  if (transaction.kind === 'REFUND') return 'Refund saldo kredit';
  if (transaction.kind === 'PAYMENT_REVERSAL') return 'Reversal mengurangi saldo kredit';
  return 'Kelebihan bayar masuk saldo kredit';
}

function describeAdjustmentScope(adjustment: StaffFinanceAdjustmentRule) {
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
      label: status === 'CREATED' ? 'Dibuat' : 'Siap dibuat',
      bg: '#dcfce7',
      border: '#86efac',
      text: '#166534',
    };
  }
  if (status === 'READY_UPDATE' || status === 'UPDATED') {
    return {
      label: status === 'UPDATED' ? 'Diperbarui' : 'Siap update',
      bg: '#dbeafe',
      border: '#93c5fd',
      text: '#1d4ed8',
    };
  }
  if (status === 'SKIPPED_EXISTS') {
    return {
      label: 'Sudah ada',
      bg: '#fef3c7',
      border: '#fcd34d',
      text: '#92400e',
    };
  }
  if (status === 'SKIPPED_LOCKED_PAID') {
    return {
      label: 'Terkunci',
      bg: '#fee2e2',
      border: '#fecaca',
      text: '#991b1b',
    };
  }
  return {
    label: 'Tanpa tarif',
    bg: '#f8fafc',
    border: '#cbd5e1',
    text: '#475569',
  };
}

function getWriteOffStatusBadge(status: StaffFinanceWriteOffRequest['status']) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Kepala TU', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepsek', bg: '#e0f2fe', border: '#bae6fd', text: '#075985' };
  }
  if (status === 'APPROVED') {
    return { label: 'Siap diterapkan', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  if (status === 'APPLIED') {
    return { label: 'Sudah diterapkan', bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' };
  }
  return { label: 'Ditolak', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
}

function getPaymentReversalStatusBadge(status: StaffFinancePaymentReversalRequest['status']) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Kepala TU', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepsek', bg: '#e0f2fe', border: '#bae6fd', text: '#075985' };
  }
  if (status === 'APPROVED') {
    return { label: 'Siap diterapkan', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  if (status === 'APPLIED') {
    return { label: 'Sudah diterapkan', bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' };
  }
  return { label: 'Ditolak', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
}

function getCashSessionStatusBadge(status: StaffFinanceCashSession['status']) {
  if (status === 'OPEN') {
    return { label: 'Masih Dibuka', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  return { label: 'Sudah Ditutup', bg: '#f8fafc', border: '#cbd5e1', text: '#475569' };
}

function getCashSessionApprovalBadge(status: StaffFinanceCashSession['approvalStatus']) {
  if (status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Head TU', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }
  if (status === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepsek', bg: '#e0f2fe', border: '#7dd3fc', text: '#075985' };
  }
  if (status === 'REJECTED') {
    return { label: 'Ditolak', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  }
  if (status === 'AUTO_APPROVED') {
    return { label: 'Auto Approved', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  if (status === 'APPROVED') {
    return { label: 'Disetujui', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  return { label: 'Belum Diajukan', bg: '#f8fafc', border: '#cbd5e1', text: '#475569' };
}

function getBankReconciliationStatusBadge(status: StaffFinanceBankReconciliation['status']) {
  if (status === 'FINALIZED') {
    return { label: 'Final', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  return { label: 'Terbuka', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
}

export default function StaffPaymentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const canOpenPayments = canAccessStaffPayments(user);

  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');

  const [componentCode, setComponentCode] = useState('');
  const [componentName, setComponentName] = useState('');
  const [componentDescription, setComponentDescription] = useState('');
  const [componentPeriodicity, setComponentPeriodicity] =
    useState<FinanceComponentPeriodicity>('MONTHLY');
  const [componentLateFeeEnabled, setComponentLateFeeEnabled] = useState(false);
  const [componentLateFeeMode, setComponentLateFeeMode] = useState<FinanceLateFeeMode>('FIXED');
  const [componentLateFeeAmount, setComponentLateFeeAmount] = useState('');
  const [componentLateFeeGraceDays, setComponentLateFeeGraceDays] = useState('0');
  const [componentLateFeeCapAmount, setComponentLateFeeCapAmount] = useState('');
  const [editingComponentId, setEditingComponentId] = useState<number | null>(null);
  const [isComponentModalOpen, setIsComponentModalOpen] = useState(false);

  const [tariffComponentId, setTariffComponentId] = useState<number | null>(null);
  const [tariffAcademicYearId, setTariffAcademicYearId] = useState<number | null>(null);
  const [tariffMajorId, setTariffMajorId] = useState<number | null>(null);
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
  const [adjustmentComponentId, setAdjustmentComponentId] = useState<number | null>(null);
  const [adjustmentAcademicYearId, setAdjustmentAcademicYearId] = useState<number | null>(null);
  const [adjustmentMajorId, setAdjustmentMajorId] = useState<number | null>(null);
  const [adjustmentStudentId, setAdjustmentStudentId] = useState<number | null>(null);
  const [adjustmentStudentSearch, setAdjustmentStudentSearch] = useState('');
  const [adjustmentSemester, setAdjustmentSemester] = useState<SemesterCode | ''>('');
  const [adjustmentGradeLevel, setAdjustmentGradeLevel] = useState('');
  const [adjustmentEffectiveStart, setAdjustmentEffectiveStart] = useState('');
  const [adjustmentEffectiveEnd, setAdjustmentEffectiveEnd] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<number | null>(null);

  const [invoiceSemester, setInvoiceSemester] = useState<SemesterCode>('EVEN');
  const [invoiceAcademicYearId, setInvoiceAcademicYearId] = useState<number | null>(null);
  const [invoicePeriodKey, setInvoicePeriodKey] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceTitle, setInvoiceTitle] = useState('');
  const [invoiceMajorId, setInvoiceMajorId] = useState<number | null>(null);
  const [invoiceGradeLevel, setInvoiceGradeLevel] = useState('');
  const [invoiceInstallmentCount, setInvoiceInstallmentCount] = useState(1);
  const [invoiceInstallmentIntervalDays, setInvoiceInstallmentIntervalDays] = useState(30);
  const [invoiceAutoApplyCreditBalance, setInvoiceAutoApplyCreditBalance] = useState(true);
  const [invoiceReplaceExisting, setInvoiceReplaceExisting] = useState(false);
  const [invoiceStudentSearch, setInvoiceStudentSearch] = useState('');
  const [invoiceSelectedStudentIds, setInvoiceSelectedStudentIds] = useState<number[]>([]);

  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'' | FinanceInvoiceStatus>('');
  const [invoiceGradeLevelFilter, setInvoiceGradeLevelFilter] = useState('');

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

  const [selectedInvoice, setSelectedInvoice] = useState<StaffFinanceInvoice | null>(null);
  const [installmentDrafts, setInstallmentDrafts] = useState<
    Array<{ sequence: number; amount: string; dueDate: string }>
  >([]);
  const [installmentScheduleNote, setInstallmentScheduleNote] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>('CASH');
  const [paymentBankAccountId, setPaymentBankAccountId] = useState<number | ''>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [creditSearch, setCreditSearch] = useState('');
  const [selectedCreditBalance, setSelectedCreditBalance] = useState<StaffFinanceCreditBalanceRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<FinancePaymentMethod>('BANK_TRANSFER');
  const [refundBankAccountId, setRefundBankAccountId] = useState<number | ''>('');
  const [refundReference, setRefundReference] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [writeOffTargetInvoice, setWriteOffTargetInvoice] = useState<StaffFinanceInvoice | null>(null);
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [writeOffNote, setWriteOffNote] = useState('');
  const [reversalTargetPayment, setReversalTargetPayment] = useState<StaffFinanceInvoice['payments'][number] | null>(null);
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
  const [bankStatementDirection, setBankStatementDirection] = useState<FinanceBankStatementDirection>('CREDIT');
  const [bankStatementAmount, setBankStatementAmount] = useState('');
  const [bankStatementReference, setBankStatementReference] = useState('');
  const [bankStatementDescription, setBankStatementDescription] = useState('');

  const activeYearQuery = useQuery({
    queryKey: ['mobile-staff-finance-active-year'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
  });

  const studentsQuery = useQuery({
    queryKey: ['mobile-staff-finance-students'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffApi.listStudents(),
    staleTime: 5 * 60 * 1000,
  });

  const academicYearsQuery = useQuery({
    queryKey: ['mobile-staff-finance-academic-years'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => adminApi.listAcademicYears({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const classLevelsQuery = useQuery({
    queryKey: ['mobile-staff-finance-class-levels'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listClassLevels(),
    staleTime: 5 * 60 * 1000,
  });

  const bankAccountsQuery = useQuery({
    queryKey: ['mobile-staff-finance-bank-accounts'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listBankAccounts(),
    staleTime: 60_000,
  });

  const bankReconciliationsQuery = useQuery({
    queryKey: ['mobile-staff-finance-bank-reconciliations'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listBankReconciliations({ limit: 8 }),
    staleTime: 30_000,
  });

  const majorsQuery = useQuery({
    queryKey: ['mobile-staff-finance-majors'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => adminApi.listMajors({ page: 1, limit: 300 }),
    staleTime: 5 * 60 * 1000,
  });

  const reminderPolicyQuery = useQuery({
    queryKey: ['mobile-staff-finance-reminder-policy'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.getReminderPolicy(),
    staleTime: 60_000,
  });

  const cashSessionApprovalPolicyQuery = useQuery({
    queryKey: ['mobile-staff-finance-cash-session-policy'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.getCashSessionApprovalPolicy(),
    staleTime: 60_000,
  });

  const academicYears = academicYearsQuery.data?.items || [];
  const majors = majorsQuery.data?.items || [];
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

  const reminderPolicy = reminderPolicyQuery.data || null;
  const cashSessionApprovalPolicy = cashSessionApprovalPolicyQuery.data || null;

  useEffect(() => {
    if (bankReconciliationAccountId === '' && activeBankAccounts[0]?.id) {
      setBankReconciliationAccountId(activeBankAccounts[0].id);
    }
  }, [activeBankAccounts, bankReconciliationAccountId]);

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

  const studentLookup = useMemo(() => {
    return new Map((studentsQuery.data || []).map((student) => [student.id, student]));
  }, [studentsQuery.data]);

  const selectedInvoiceStudents = useMemo(
    () =>
      invoiceSelectedStudentIds
        .map((studentId) => studentLookup.get(studentId))
        .filter((student): student is NonNullable<typeof student> => Boolean(student)),
    [invoiceSelectedStudentIds, studentLookup],
  );

  const invoiceStudentCandidates = useMemo(() => {
    const keyword = invoiceStudentSearch.trim().toLowerCase();
    return (studentsQuery.data || [])
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
  }, [invoiceSelectedStudentIds, invoiceStudentSearch, studentsQuery.data]);

  const selectedAdjustmentStudent = useMemo(
    () => (adjustmentStudentId == null ? null : studentLookup.get(adjustmentStudentId) || null),
    [adjustmentStudentId, studentLookup],
  );

  const adjustmentStudentCandidates = useMemo(() => {
    const keyword = adjustmentStudentSearch.trim().toLowerCase();
    return (studentsQuery.data || [])
      .filter((student) => (adjustmentStudentId == null ? true : student.id !== adjustmentStudentId))
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
  }, [adjustmentStudentId, adjustmentStudentSearch, studentsQuery.data]);

  const componentsQuery = useQuery({
    queryKey: ['mobile-staff-finance-components'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listComponents(),
  });

  const tariffsQuery = useQuery({
    queryKey: ['mobile-staff-finance-tariffs'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listTariffs(),
  });

  const adjustmentsQuery = useQuery({
    queryKey: ['mobile-staff-finance-adjustments'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listAdjustments(),
  });

  const invoicesQuery = useQuery({
    queryKey: ['mobile-staff-finance-invoices', invoiceSearch, invoiceStatus, invoiceGradeLevelFilter],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () =>
      staffFinanceApi.listInvoices({
        limit: 100,
        search: invoiceSearch.trim() || undefined,
        status: invoiceStatus || undefined,
        gradeLevel: invoiceGradeLevelFilter.trim() || undefined,
      }),
  });

  const creditsQuery = useQuery({
    queryKey: ['mobile-staff-finance-credits', creditSearch],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () =>
      staffFinanceApi.listCredits({
        limit: 50,
        search: creditSearch.trim() || undefined,
      }),
  });

  const cashSessionsQuery = useQuery({
    queryKey: ['mobile-staff-finance-cash-sessions'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () =>
      staffFinanceApi.listCashSessions({
        mine: true,
        limit: 10,
      }),
    staleTime: 30_000,
  });

  const writeOffsQuery = useQuery({
    queryKey: ['mobile-staff-finance-write-offs'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listWriteOffs({ limit: 100 }),
    staleTime: 60_000,
  });

  const paymentReversalsQuery = useQuery({
    queryKey: ['mobile-staff-finance-payment-reversals'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => staffFinanceApi.listPaymentReversals({ limit: 100 }),
    staleTime: 60_000,
  });

  const dashboardQuery = useQuery({
    queryKey: ['mobile-staff-finance-dashboard', activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments && Boolean(activeYearQuery.data?.id),
    queryFn: () =>
      staffFinanceApi.listReports({
        academicYearId: activeYearQuery.data?.id,
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

  useEffect(() => {
    if (invoiceAcademicYearId == null && activeYearQuery.data?.id) {
      setInvoiceAcademicYearId(activeYearQuery.data.id);
    }
  }, [activeYearQuery.data?.id, invoiceAcademicYearId]);

  const overdueCount = useMemo(() => {
    const today = Date.now();
    return invoices.filter((invoice) => {
      if (!invoice.dueDate) return false;
      if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return false;
      return new Date(invoice.dueDate).getTime() < today;
    }).length;
  }, [invoices]);

  const topClassOutstanding = useMemo(() => {
    const map = new Map<string, { className: string; amount: number }>();
    invoices.forEach((invoice) => {
      const className = invoice.student.studentClass?.name || 'Tanpa Kelas';
      const prev = map.get(className) || { className, amount: 0 };
      prev.amount += Number(invoice.balanceAmount || 0);
      map.set(className, prev);
    });
    return Array.from(map.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [invoices]);

  useEffect(() => {
    setCashSessionActualClosingBalance(
      activeCashSession ? String(Number(activeCashSession.expectedClosingBalance || 0)) : '',
    );
    setCashSessionClosingNote('');
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
    setTariffComponentId(null);
    setTariffAcademicYearId(null);
    setTariffMajorId(null);
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

  const applyReminderPolicyToForm = (policy: StaffFinanceReminderPolicy) => {
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

  const applyCashSessionApprovalPolicyToForm = (policy: StaffFinanceCashSessionApprovalPolicy) => {
    setCashSessionZeroVarianceAutoApproved(policy.zeroVarianceAutoApproved);
    setCashSessionRequireVarianceNote(policy.requireVarianceNote);
    setCashSessionPrincipalApprovalThresholdAmount(String(Number(policy.principalApprovalThresholdAmount || 0)));
    setCashSessionApprovalPolicyNotes(policy.notes || '');
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
    setAdjustmentComponentId(null);
    setAdjustmentAcademicYearId(null);
    setAdjustmentMajorId(null);
    setAdjustmentStudentId(null);
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

  const openWriteOffModal = (invoice: StaffFinanceInvoice) => {
    setWriteOffTargetInvoice(invoice);
    setWriteOffAmount(String(Number(invoice.balanceAmount || 0)));
    setWriteOffReason('');
    setWriteOffNote('');
  };

  const openReversalModal = (payment: StaffFinanceInvoice['payments'][number]) => {
    setReversalTargetPayment(payment);
    setReversalAmount(String(Number(payment.remainingReversibleAmount || 0)));
    setReversalReason('');
    setReversalNote('');
  };

  const invalidateFinanceQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-components'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-tariffs'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-adjustments'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-credits'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-bank-accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-bank-reconciliations'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-cash-sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-write-offs'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-payment-reversals'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-reminder-policy'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-cash-session-policy'] });
  };

  const saveComponentMutation = useMutation({
    mutationFn: () =>
      editingComponentId
        ? staffFinanceApi.updateComponent(editingComponentId, {
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
        : staffFinanceApi.createComponent({
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
      notifySuccess(editingComponentId ? 'Komponen diperbarui.' : 'Komponen ditambahkan.');
      closeComponentModal();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan komponen.'),
  });

  const toggleComponentMutation = useMutation({
    mutationFn: (payload: { componentId: number; isActive: boolean }) =>
      staffFinanceApi.updateComponent(payload.componentId, { isActive: payload.isActive }),
    onSuccess: (_, payload) => {
      notifySuccess(payload.isActive ? 'Komponen diaktifkan.' : 'Komponen dinonaktifkan.');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mengubah status komponen.'),
  });

  const saveTariffMutation = useMutation({
    mutationFn: () =>
      editingTariffId
        ? staffFinanceApi.updateTariff(editingTariffId, {
            componentId: Number(tariffComponentId),
            academicYearId: tariffAcademicYearId,
            classId: null,
            majorId: tariffMajorId,
            semester: tariffSemester || null,
            gradeLevel: tariffGradeLevel.trim() || null,
            amount: Number(tariffAmount),
            effectiveStart: tariffEffectiveStart || null,
            effectiveEnd: tariffEffectiveEnd || null,
            notes: tariffNotes || null,
          })
        : staffFinanceApi.createTariff({
            componentId: Number(tariffComponentId),
            academicYearId: tariffAcademicYearId || undefined,
            majorId: tariffMajorId || undefined,
            semester: tariffSemester || undefined,
            gradeLevel: tariffGradeLevel.trim() || undefined,
            amount: Number(tariffAmount),
            effectiveStart: tariffEffectiveStart || undefined,
            effectiveEnd: tariffEffectiveEnd || undefined,
            notes: tariffNotes || undefined,
          }),
    onSuccess: () => {
      notifySuccess(editingTariffId ? 'Tarif diperbarui.' : 'Tarif ditambahkan.');
      closeTariffModal();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan tarif.'),
  });

  const toggleTariffMutation = useMutation({
    mutationFn: (payload: { tariffId: number; isActive: boolean }) =>
      staffFinanceApi.updateTariff(payload.tariffId, { isActive: payload.isActive }),
    onSuccess: (_, payload) => {
      notifySuccess(payload.isActive ? 'Tarif diaktifkan.' : 'Tarif dinonaktifkan.');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mengubah status tarif.'),
  });

  const saveAdjustmentMutation = useMutation({
    mutationFn: () =>
      editingAdjustmentId
        ? staffFinanceApi.updateAdjustment(editingAdjustmentId, {
            code: adjustmentCode,
            name: adjustmentName,
            description: adjustmentDescription.trim() || null,
            kind: adjustmentKind,
            amount: Number(adjustmentAmount),
            componentId: adjustmentComponentId,
            academicYearId: adjustmentAcademicYearId,
            classId: null,
            majorId: adjustmentMajorId,
            studentId: adjustmentStudentId,
            semester: adjustmentSemester || null,
            gradeLevel: adjustmentGradeLevel.trim() || null,
            effectiveStart: adjustmentEffectiveStart || null,
            effectiveEnd: adjustmentEffectiveEnd || null,
            notes: adjustmentNotes.trim() || null,
          })
        : staffFinanceApi.createAdjustment({
            code: adjustmentCode,
            name: adjustmentName,
            description: adjustmentDescription.trim() || undefined,
            kind: adjustmentKind,
            amount: Number(adjustmentAmount),
            componentId: adjustmentComponentId || undefined,
            academicYearId: adjustmentAcademicYearId || undefined,
            majorId: adjustmentMajorId || undefined,
            studentId: adjustmentStudentId || undefined,
            semester: adjustmentSemester || undefined,
            gradeLevel: adjustmentGradeLevel.trim() || undefined,
            effectiveStart: adjustmentEffectiveStart || undefined,
            effectiveEnd: adjustmentEffectiveEnd || undefined,
            notes: adjustmentNotes.trim() || undefined,
          }),
    onSuccess: () => {
      notifySuccess(editingAdjustmentId ? 'Rule penyesuaian diperbarui.' : 'Rule penyesuaian ditambahkan.');
      resetAdjustmentForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan rule penyesuaian.'),
  });

  const toggleAdjustmentMutation = useMutation({
    mutationFn: (payload: { adjustmentId: number; isActive: boolean }) =>
      staffFinanceApi.updateAdjustment(payload.adjustmentId, { isActive: payload.isActive }),
    onSuccess: (_, payload) => {
      notifySuccess(payload.isActive ? 'Rule penyesuaian diaktifkan.' : 'Rule penyesuaian dinonaktifkan.');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mengubah status rule penyesuaian.'),
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: () =>
      staffFinanceApi.generateInvoices({
        academicYearId: invoiceAcademicYearId || activeYearQuery.data?.id || undefined,
        semester: invoiceSemester,
        periodKey: invoicePeriodKey,
        dueDate: invoiceDueDate || undefined,
        title: invoiceTitle || undefined,
        majorId: invoiceMajorId || undefined,
        gradeLevel: invoiceGradeLevel.trim() || undefined,
        installmentCount: Math.max(1, Number(invoiceInstallmentCount || 1)),
        installmentIntervalDays: Math.max(1, Number(invoiceInstallmentIntervalDays || 30)),
        autoApplyCreditBalance: invoiceAutoApplyCreditBalance,
        studentIds: invoiceSelectedStudentIds.length > 0 ? invoiceSelectedStudentIds : undefined,
        replaceExisting: invoiceReplaceExisting,
      }),
    onSuccess: (result) => {
      notifySuccess(
        `Generate selesai: ${result.summary.created} baru, ${result.summary.updated} diperbarui.`,
      );
      previewInvoiceMutation.reset();
      invalidateFinanceQueries();
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-credits'] });
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal generate tagihan.'),
  });

  const previewInvoiceMutation = useMutation({
    mutationFn: () =>
      staffFinanceApi.previewInvoices({
        academicYearId: invoiceAcademicYearId || activeYearQuery.data?.id || undefined,
        semester: invoiceSemester,
        periodKey: invoicePeriodKey,
        dueDate: invoiceDueDate || undefined,
        title: invoiceTitle || undefined,
        majorId: invoiceMajorId || undefined,
        gradeLevel: invoiceGradeLevel.trim() || undefined,
        installmentCount: Math.max(1, Number(invoiceInstallmentCount || 1)),
        installmentIntervalDays: Math.max(1, Number(invoiceInstallmentIntervalDays || 30)),
        autoApplyCreditBalance: invoiceAutoApplyCreditBalance,
        studentIds: invoiceSelectedStudentIds.length > 0 ? invoiceSelectedStudentIds : undefined,
        replaceExisting: invoiceReplaceExisting,
      }),
    onError: (error: unknown) => notifyApiError(error, 'Gagal membuat preview generate.'),
  });

  const saveReminderPolicyMutation = useMutation({
    mutationFn: () =>
      staffFinanceApi.updateReminderPolicy({
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
      notifySuccess('Policy reminder finance berhasil diperbarui.');
      applyReminderPolicyToForm(policy);
      setIsReminderPolicyModalOpen(false);
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal memperbarui policy reminder finance.'),
  });

  const saveCashSessionApprovalPolicyMutation = useMutation({
    mutationFn: () =>
      staffFinanceApi.updateCashSessionApprovalPolicy({
        zeroVarianceAutoApproved: cashSessionZeroVarianceAutoApproved,
        requireVarianceNote: cashSessionRequireVarianceNote,
        principalApprovalThresholdAmount: Math.max(0, Number(cashSessionPrincipalApprovalThresholdAmount || 0)),
        notes: cashSessionApprovalPolicyNotes.trim() || null,
      }),
    onSuccess: (policy) => {
      notifySuccess('Policy approval settlement kas berhasil diperbarui.');
      applyCashSessionApprovalPolicyToForm(policy);
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal memperbarui policy approval settlement kas.'),
  });

  const dispatchReminderMutation = useMutation({
    mutationFn: (mode: FinanceReminderMode) =>
      staffFinanceApi.dispatchDueReminders({
        mode,
        dueSoonDays: Math.max(0, Number(reminderDueSoonDays || 0)),
        preview: false,
      }),
    onSuccess: (result, mode) => {
      const stats = [
        `${result.dueSoonInvoices} due soon`,
        `${result.overdueInvoices} overdue`,
        `${result.lateFeeWarningInvoices} warning denda`,
        `${result.escalatedInvoices} eskalasi`,
      ].join(', ');
      notifySuccess(
        result.disabledByPolicy && mode === 'ALL'
          ? 'Policy reminder otomatis sedang nonaktif. Aktifkan dulu dari pengaturan.'
          : `Reminder terkirim ${result.createdNotifications} notifikasi (${stats}).`,
      );
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menjalankan reminder.'),
  });

  const payInvoiceMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) throw new Error('Tagihan belum dipilih');
      return staffFinanceApi.payInvoice(selectedInvoice.id, {
        amount: Number(paymentAmount),
        method: paymentMethod,
        bankAccountId: paymentBankAccountId === '' ? undefined : Number(paymentBankAccountId),
        referenceNo: paymentReference || undefined,
        note: paymentNote || undefined,
      });
    },
    onSuccess: () => {
      notifySuccess('Pembayaran berhasil dicatat.');
      setSelectedInvoice(null);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNote('');
      setPaymentMethod('CASH');
      setPaymentBankAccountId('');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mencatat pembayaran.'),
  });

  const updateInstallmentsMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) throw new Error('Tagihan belum dipilih');
      return staffFinanceApi.updateInvoiceInstallments(selectedInvoice.id, {
        installments: installmentDrafts.map((draft) => ({
          sequence: draft.sequence,
          amount: Number(draft.amount),
          dueDate: draft.dueDate || null,
        })),
        note: installmentScheduleNote.trim() || undefined,
      });
    },
    onSuccess: (invoice) => {
      notifySuccess('Jadwal cicilan diperbarui.');
      setSelectedInvoice(invoice);
      setInstallmentScheduleNote('');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal memperbarui jadwal cicilan.'),
  });

  const applyLateFeesMutation = useMutation({
    mutationFn: (invoice: StaffFinanceInvoice) => staffFinanceApi.applyInvoiceLateFees(invoice.id),
    onSuccess: (invoice) => {
      notifySuccess('Denda keterlambatan diterapkan.');
      setSelectedInvoice(invoice);
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menerapkan denda keterlambatan.'),
  });

  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedCreditBalance) throw new Error('Saldo kredit belum dipilih');
      return staffFinanceApi.createRefund(selectedCreditBalance.studentId, {
        amount: Number(refundAmount),
        method: refundMethod,
        bankAccountId: refundBankAccountId === '' ? undefined : Number(refundBankAccountId),
        referenceNo: refundReference || undefined,
        note: refundNote || undefined,
      });
    },
    onSuccess: () => {
      notifySuccess('Refund saldo kredit berhasil dicatat.');
      resetRefundForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mencatat refund saldo kredit.'),
  });

  const saveBankAccountMutation = useMutation({
    mutationFn: () =>
      editingBankAccountId
        ? staffFinanceApi.updateBankAccount(editingBankAccountId, {
            code: bankAccountCode,
            bankName: bankAccountBankName,
            accountName: bankAccountAccountName,
            accountNumber: bankAccountNumber,
            branch: bankAccountBranch || undefined,
            notes: bankAccountNotes || undefined,
          })
        : staffFinanceApi.createBankAccount({
            code: bankAccountCode,
            bankName: bankAccountBankName,
            accountName: bankAccountAccountName,
            accountNumber: bankAccountNumber,
            branch: bankAccountBranch || undefined,
            notes: bankAccountNotes || undefined,
          }),
    onSuccess: () => {
      notifySuccess(editingBankAccountId ? 'Rekening bank diperbarui.' : 'Rekening bank ditambahkan.');
      resetBankAccountForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan rekening bank.'),
  });

  const toggleBankAccountMutation = useMutation({
    mutationFn: (account: StaffFinanceBankAccount) =>
      staffFinanceApi.updateBankAccount(account.id, { isActive: !account.isActive }),
    onSuccess: (_, account) => {
      notifySuccess(account.isActive ? 'Rekening bank dinonaktifkan.' : 'Rekening bank diaktifkan.');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mengubah status rekening bank.'),
  });

  const createBankReconciliationMutation = useMutation({
    mutationFn: () =>
      staffFinanceApi.createBankReconciliation({
        bankAccountId: Number(bankReconciliationAccountId),
        periodStart: bankReconciliationPeriodStart,
        periodEnd: bankReconciliationPeriodEnd,
        statementOpeningBalance: Number(bankReconciliationOpeningBalance || 0),
        statementClosingBalance: Number(bankReconciliationClosingBalance || 0),
        note: bankReconciliationNote.trim() || undefined,
      }),
    onSuccess: (reconciliation) => {
      notifySuccess('Rekonsiliasi bank berhasil dibuat.');
      setSelectedBankReconciliationId(reconciliation.id);
      resetBankReconciliationForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal membuat rekonsiliasi bank.'),
  });

  const createBankStatementEntryMutation = useMutation({
    mutationFn: (reconciliation: StaffFinanceBankReconciliation) =>
      staffFinanceApi.createBankStatementEntry(reconciliation.id, {
        entryDate: bankStatementEntryDate,
        direction: bankStatementDirection,
        amount: Number(bankStatementAmount || 0),
        referenceNo: bankStatementReference.trim() || undefined,
        description: bankStatementDescription.trim() || undefined,
      }),
    onSuccess: () => {
      notifySuccess('Mutasi statement bank dicatat.');
      resetBankStatementEntryForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mencatat mutasi statement bank.'),
  });

  const finalizeBankReconciliationMutation = useMutation({
    mutationFn: (reconciliation: StaffFinanceBankReconciliation) =>
      staffFinanceApi.finalizeBankReconciliation(reconciliation.id, {
        note: bankReconciliationNote.trim() || undefined,
      }),
    onSuccess: () => {
      notifySuccess('Rekonsiliasi bank berhasil difinalkan.');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal memfinalkan rekonsiliasi bank.'),
  });

  const openCashSessionMutation = useMutation({
    mutationFn: () =>
      staffFinanceApi.openCashSession({
        businessDate: cashSessionBusinessDate,
        openingBalance: Number(cashSessionOpeningBalance || 0),
        note: cashSessionOpeningNote.trim() || undefined,
      }),
    onSuccess: () => {
      notifySuccess('Sesi kas harian berhasil dibuka.');
      setCashSessionBusinessDate(getTodayInputDate());
      setCashSessionOpeningBalance('0');
      setCashSessionOpeningNote('');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal membuka sesi kas harian.'),
  });

  const closeCashSessionMutation = useMutation({
    mutationFn: (session: StaffFinanceCashSession) =>
      staffFinanceApi.closeCashSession(session.id, {
        actualClosingBalance: Number(cashSessionActualClosingBalance || 0),
        note: cashSessionClosingNote.trim() || undefined,
      }),
    onSuccess: (session) => {
      notifySuccess(
        session.approvalStatus === 'PENDING_HEAD_TU'
          ? 'Sesi kas ditutup dan menunggu review Head TU.'
          : session.approvalStatus === 'AUTO_APPROVED'
            ? 'Sesi kas ditutup dan auto-approved.'
            : 'Sesi kas harian berhasil ditutup.',
      );
      setCashSessionActualClosingBalance('');
      setCashSessionClosingNote('');
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menutup sesi kas harian.'),
  });

  const createWriteOffMutation = useMutation({
    mutationFn: () => {
      if (!writeOffTargetInvoice) throw new Error('Tagihan belum dipilih');
      return staffFinanceApi.createWriteOffRequest(writeOffTargetInvoice.id, {
        amount: Number(writeOffAmount),
        reason: writeOffReason,
        note: writeOffNote || undefined,
      });
    },
    onSuccess: (request) => {
      notifySuccess('Pengajuan write-off dikirim ke Kepala TU.');
      if (selectedInvoice?.id === request.invoiceId && selectedInvoice) {
        setSelectedInvoice({
          ...selectedInvoice,
          writeOffRequests: [request, ...(selectedInvoice.writeOffRequests || [])],
        });
      }
      resetWriteOffForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal membuat pengajuan write-off.'),
  });

  const applyWriteOffMutation = useMutation({
    mutationFn: (request: StaffFinanceWriteOffRequest) => staffFinanceApi.applyWriteOff(request.id),
    onSuccess: (result) => {
      notifySuccess('Write-off berhasil diterapkan.');
      setSelectedInvoice(result.invoice);
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menerapkan write-off.'),
  });

  const createPaymentReversalMutation = useMutation({
    mutationFn: () => {
      if (!reversalTargetPayment) throw new Error('Pembayaran belum dipilih');
      return staffFinanceApi.createPaymentReversalRequest(reversalTargetPayment.id, {
        amount: Number(reversalAmount),
        reason: reversalReason,
        note: reversalNote || undefined,
      });
    },
    onSuccess: () => {
      notifySuccess('Pengajuan reversal pembayaran dikirim ke Kepala TU.');
      resetReversalForm();
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal membuat pengajuan reversal pembayaran.'),
  });

  const applyPaymentReversalMutation = useMutation({
    mutationFn: (request: StaffFinancePaymentReversalRequest) => staffFinanceApi.applyPaymentReversal(request.id),
    onSuccess: (result) => {
      notifySuccess('Reversal pembayaran berhasil diterapkan.');
      setSelectedInvoice(result.invoice);
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menerapkan reversal pembayaran.'),
  });

  const handleSaveComponent = () => {
    if (!componentCode.trim() || !componentName.trim()) {
      notifyApiError(null, 'Kode dan nama komponen wajib diisi.');
      return;
    }
    if (componentLateFeeEnabled && Number(componentLateFeeAmount || 0) <= 0) {
      notifyApiError(null, 'Nominal denda harus lebih dari 0.');
      return;
    }
    if (Number(componentLateFeeGraceDays || 0) < 0) {
      notifyApiError(null, 'Grace period tidak boleh negatif.');
      return;
    }
    if (componentLateFeeCapAmount !== '' && Number(componentLateFeeCapAmount) < 0) {
      notifyApiError(null, 'Maksimum denda tidak boleh negatif.');
      return;
    }
    saveComponentMutation.mutate();
  };

  const handleSaveTariff = () => {
    if (!tariffComponentId || Number(tariffAmount) <= 0) {
      notifyApiError(null, 'Komponen dan nominal tarif wajib diisi.');
      return;
    }
    if (tariffEffectiveStart && tariffEffectiveEnd && tariffEffectiveEnd < tariffEffectiveStart) {
      notifyApiError(null, 'Periode efektif tarif tidak valid.');
      return;
    }
    saveTariffMutation.mutate();
  };

  const handleSaveAdjustment = () => {
    if (!adjustmentCode.trim() || !adjustmentName.trim() || Number(adjustmentAmount) <= 0) {
      notifyApiError(null, 'Kode, nama, dan nominal penyesuaian wajib diisi.');
      return;
    }
    if (
      adjustmentEffectiveStart &&
      adjustmentEffectiveEnd &&
      adjustmentEffectiveEnd < adjustmentEffectiveStart
    ) {
      notifyApiError(null, 'Periode efektif penyesuaian tidak valid.');
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
      notifyApiError(null, 'Due soon harus 0 - 30 hari.');
      return;
    }
    if (!Number.isFinite(dueSoonRepeat) || dueSoonRepeat < 1 || dueSoonRepeat > 30) {
      notifyApiError(null, 'Interval due soon harus 1 - 30 hari.');
      return;
    }
    if (!Number.isFinite(overdueRepeat) || overdueRepeat < 1 || overdueRepeat > 30) {
      notifyApiError(null, 'Interval overdue harus 1 - 30 hari.');
      return;
    }
    if (!Number.isFinite(lateFeeRepeat) || lateFeeRepeat < 1 || lateFeeRepeat > 30) {
      notifyApiError(null, 'Interval warning denda harus 1 - 30 hari.');
      return;
    }
    if (!Number.isFinite(escalationStart) || escalationStart < 1 || escalationStart > 180) {
      notifyApiError(null, 'Mulai eskalasi harus 1 - 180 hari.');
      return;
    }
    if (!Number.isFinite(escalationRepeat) || escalationRepeat < 1 || escalationRepeat > 30) {
      notifyApiError(null, 'Interval eskalasi harus 1 - 30 hari.');
      return;
    }
    if (!Number.isFinite(escalationMinOutstanding) || escalationMinOutstanding < 0) {
      notifyApiError(null, 'Minimum nominal eskalasi tidak valid.');
      return;
    }
    if (!reminderSendStudent && !reminderSendParent) {
      notifyApiError(null, 'Pilih minimal satu penerima eksternal: siswa atau orang tua.');
      return;
    }
    if (
      reminderEscalationEnabled &&
      !reminderEscalateToFinanceStaff &&
      !reminderEscalateToHeadTu &&
      !reminderEscalateToPrincipal
    ) {
      notifyApiError(null, 'Pilih minimal satu penerima eskalasi internal.');
      return;
    }
    saveReminderPolicyMutation.mutate();
  };

  const handleGenerate = () => {
    if (!invoicePeriodKey.trim()) {
      notifyApiError(null, 'Period key wajib diisi (contoh 2026-03).');
      return;
    }
    if (!Number.isFinite(invoiceInstallmentCount) || invoiceInstallmentCount < 1 || invoiceInstallmentCount > 24) {
      notifyApiError(null, 'Jumlah cicilan harus antara 1 sampai 24.');
      return;
    }
    if (
      !Number.isFinite(invoiceInstallmentIntervalDays) ||
      invoiceInstallmentIntervalDays < 1 ||
      invoiceInstallmentIntervalDays > 180
    ) {
      notifyApiError(null, 'Jarak antar cicilan harus antara 1 sampai 180 hari.');
      return;
    }
    generateInvoiceMutation.mutate();
  };

  const handlePreviewGenerate = () => {
    if (!invoicePeriodKey.trim()) {
      notifyApiError(null, 'Period key wajib diisi (contoh 2026-03).');
      return;
    }
    if (!Number.isFinite(invoiceInstallmentCount) || invoiceInstallmentCount < 1 || invoiceInstallmentCount > 24) {
      notifyApiError(null, 'Jumlah cicilan harus antara 1 sampai 24.');
      return;
    }
    if (
      !Number.isFinite(invoiceInstallmentIntervalDays) ||
      invoiceInstallmentIntervalDays < 1 ||
      invoiceInstallmentIntervalDays > 180
    ) {
      notifyApiError(null, 'Jarak antar cicilan harus antara 1 sampai 180 hari.');
      return;
    }
    previewInvoiceMutation.mutate();
  };

  const handleManualReminder = (mode: FinanceReminderMode) => {
    const dueSoonDays = Number(reminderDueSoonDays || 0);
    if ((mode === 'ALL' || mode === 'DUE_SOON') && (!Number.isFinite(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 30)) {
      notifyApiError(null, 'Due soon harus 0 - 30 hari.');
      return;
    }
    dispatchReminderMutation.mutate(mode);
  };

  const handleOpenCashSession = () => {
    const openingBalance = Number(cashSessionOpeningBalance || 0);
    if (!cashSessionBusinessDate) {
      notifyApiError(null, 'Tanggal bisnis sesi kas wajib diisi.');
      return;
    }
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      notifyApiError(null, 'Saldo awal sesi kas tidak valid.');
      return;
    }
    openCashSessionMutation.mutate();
  };

  const handleCloseCashSession = (session: StaffFinanceCashSession) => {
    const actualClosingBalance = Number(cashSessionActualClosingBalance || 0);
    if (!Number.isFinite(actualClosingBalance) || actualClosingBalance < 0) {
      notifyApiError(null, 'Saldo aktual penutupan tidak valid.');
      return;
    }
    const projectedVariance = actualClosingBalance - Number(session.expectedClosingBalance || 0);
    if (
      cashSessionRequireVarianceNote &&
      Math.abs(projectedVariance) > 0.009 &&
      !cashSessionClosingNote.trim()
    ) {
      notifyApiError(null, 'Catatan closing wajib diisi saat ada selisih settlement kas.');
      return;
    }
    closeCashSessionMutation.mutate(session);
  };

  const handleEditBankAccount = (account: StaffFinanceBankAccount) => {
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
      notifyApiError(null, 'Kode, nama bank, nama akun, dan nomor rekening wajib diisi.');
      return;
    }
    saveBankAccountMutation.mutate();
  };

  const handleCreateBankReconciliation = () => {
    if (!bankReconciliationAccountId) {
      notifyApiError(null, 'Pilih rekening bank terlebih dahulu.');
      return;
    }
    if (!bankReconciliationPeriodStart || !bankReconciliationPeriodEnd) {
      notifyApiError(null, 'Periode rekonsiliasi wajib diisi.');
      return;
    }
    if (bankReconciliationPeriodEnd < bankReconciliationPeriodStart) {
      notifyApiError(null, 'Periode rekonsiliasi tidak valid.');
      return;
    }
    if (Number(bankReconciliationOpeningBalance || 0) < 0 || Number(bankReconciliationClosingBalance || 0) < 0) {
      notifyApiError(null, 'Saldo statement tidak boleh negatif.');
      return;
    }
    createBankReconciliationMutation.mutate();
  };

  const handleAddBankStatementEntry = (reconciliation: StaffFinanceBankReconciliation) => {
    if (!bankStatementEntryDate) {
      notifyApiError(null, 'Tanggal mutasi bank wajib diisi.');
      return;
    }
    if (Number(bankStatementAmount || 0) <= 0) {
      notifyApiError(null, 'Nominal mutasi bank harus lebih dari nol.');
      return;
    }
    createBankStatementEntryMutation.mutate(reconciliation);
  };

  const handleFinalizeBankReconciliation = (reconciliation: StaffFinanceBankReconciliation) => {
    if (reconciliation.status === 'FINALIZED') {
      notifyApiError(null, 'Rekonsiliasi bank sudah final.');
      return;
    }
    finalizeBankReconciliationMutation.mutate(reconciliation);
  };

  const startPaying = (invoice: StaffFinanceInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(String(Number(invoice.balanceAmount || 0)));
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

  const startRefund = (balance: StaffFinanceCreditBalanceRow) => {
    setSelectedCreditBalance(balance);
    setRefundAmount(String(Number(balance.balanceAmount || 0)));
    setRefundMethod('BANK_TRANSFER');
    setRefundBankAccountId(activeBankAccounts[0]?.id || '');
    setRefundReference('');
    setRefundNote('');
  };

  const handleEditComponent = (component: StaffFinanceComponent) => {
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

  const handleEditTariff = (tariff: StaffFinanceTariffRule) => {
    setEditingTariffId(tariff.id);
    setTariffComponentId(tariff.componentId);
    setTariffAcademicYearId(tariff.academicYearId || null);
    setTariffMajorId(tariff.majorId || null);
    setTariffSemester(tariff.semester || '');
    setTariffGradeLevel(tariff.gradeLevel || tariff.class?.level || '');
    setTariffAmount(String(Number(tariff.amount || 0)));
    setTariffEffectiveStart(tariff.effectiveStart ? String(tariff.effectiveStart).slice(0, 10) : '');
    setTariffEffectiveEnd(tariff.effectiveEnd ? String(tariff.effectiveEnd).slice(0, 10) : '');
    setTariffNotes(tariff.notes || '');
    setIsTariffModalOpen(true);
  };

  const handleEditAdjustment = (adjustment: StaffFinanceAdjustmentRule) => {
    setEditingAdjustmentId(adjustment.id);
    setAdjustmentCode(adjustment.code);
    setAdjustmentName(adjustment.name);
    setAdjustmentDescription(adjustment.description || '');
    setAdjustmentKind(adjustment.kind);
    setAdjustmentAmount(String(Number(adjustment.amount || 0)));
    setAdjustmentComponentId(adjustment.componentId || null);
    setAdjustmentAcademicYearId(adjustment.academicYearId || null);
    setAdjustmentMajorId(adjustment.majorId || null);
    setAdjustmentStudentId(adjustment.studentId || null);
    setAdjustmentStudentSearch('');
    setAdjustmentSemester(adjustment.semester || '');
    setAdjustmentGradeLevel(adjustment.gradeLevel || adjustment.class?.level || '');
    setAdjustmentEffectiveStart(adjustment.effectiveStart ? String(adjustment.effectiveStart).slice(0, 10) : '');
    setAdjustmentEffectiveEnd(adjustment.effectiveEnd ? String(adjustment.effectiveEnd).slice(0, 10) : '');
    setAdjustmentNotes(adjustment.notes || '');
    setActiveTab('adjustments');
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
    setAdjustmentStudentId(null);
    setAdjustmentStudentSearch('');
  };

  const handleSaveInstallments = () => {
    if (!selectedInvoice) {
      notifyApiError(null, 'Tagihan belum dipilih.');
      return;
    }

    if (installmentDrafts.length === 0) {
      notifyApiError(null, 'Skema cicilan belum tersedia.');
      return;
    }

    if (installmentDrafts.some((draft) => Number(draft.amount) <= 0)) {
      notifyApiError(null, 'Nominal setiap termin harus lebih dari 0.');
      return;
    }

    if (selectedInvoiceCanEditAmounts) {
      const totalInstallments = installmentDrafts.reduce((sum, draft) => sum + Number(draft.amount || 0), 0);
      if (Math.abs(totalInstallments - Number(selectedInvoice.totalAmount || 0)) > 0.009) {
        notifyApiError(null, 'Total seluruh termin harus sama dengan total invoice.');
        return;
      }
    }

    updateInstallmentsMutation.mutate();
  };

  const handleSaveRefund = () => {
    if (!selectedCreditBalance) {
      notifyApiError(null, 'Saldo kredit siswa belum dipilih.');
      return;
    }
    if (Number(refundAmount) <= 0) {
      notifyApiError(null, 'Nominal refund harus lebih dari nol.');
      return;
    }
    if (Number(refundAmount) > Number(selectedCreditBalance.balanceAmount || 0)) {
      notifyApiError(null, 'Nominal refund melebihi saldo kredit siswa.');
      return;
    }
    if (refundMethod !== 'CASH' && refundBankAccountId === '') {
      notifyApiError(null, 'Pilih rekening bank untuk refund non-tunai.');
      return;
    }
    refundMutation.mutate();
  };

  const handleSavePayment = () => {
    if (!selectedInvoice) {
      notifyApiError(null, 'Tagihan belum dipilih.');
      return;
    }
    if (Number(paymentAmount) <= 0) {
      notifyApiError(null, 'Nominal pembayaran harus lebih dari nol.');
      return;
    }
    if (paymentMethod !== 'CASH' && paymentBankAccountId === '') {
      notifyApiError(null, 'Pilih rekening bank untuk pembayaran non-tunai.');
      return;
    }
    payInvoiceMutation.mutate();
  };

  const handleSaveWriteOff = () => {
    if (!writeOffTargetInvoice) {
      notifyApiError(null, 'Tagihan belum dipilih.');
      return;
    }
    if (Number(writeOffAmount) <= 0) {
      notifyApiError(null, 'Nominal write-off harus lebih dari nol.');
      return;
    }
    if (Number(writeOffAmount) > Number(writeOffTargetInvoice.balanceAmount || 0)) {
      notifyApiError(null, 'Nominal write-off melebihi outstanding invoice.');
      return;
    }
    if (writeOffReason.trim().length < 5) {
      notifyApiError(null, 'Alasan write-off minimal 5 karakter.');
      return;
    }
    createWriteOffMutation.mutate();
  };

  const handleSavePaymentReversal = () => {
    if (!reversalTargetPayment) {
      notifyApiError(null, 'Pembayaran belum dipilih.');
      return;
    }
    if (Number(reversalAmount) <= 0) {
      notifyApiError(null, 'Nominal reversal harus lebih dari nol.');
      return;
    }
    if (Number(reversalAmount) > Number(reversalTargetPayment.remainingReversibleAmount || 0)) {
      notifyApiError(null, 'Nominal reversal melebihi sisa pembayaran yang dapat direversal.');
      return;
    }
    if (reversalReason.trim().length < 5) {
      notifyApiError(null, 'Alasan reversal minimal 5 karakter.');
      return;
    }
    createPaymentReversalMutation.mutate();
  };

  useEffect(() => {
    previewInvoiceMutation.reset();
  }, [
    invoiceAcademicYearId,
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

  if (isLoading) return <AppLoadingScreen message="Memuat modul keuangan staff..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role === 'STAFF' && !canOpenPayments) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>
          Pembayaran Staff
        </Text>
        <QueryStateView type="error" message={getStaffPaymentsBlockedMessage(user)} />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (user?.role !== 'STAFF') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Staff Keuangan
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus role staff." />
      </ScrollView>
    );
  }

  const isInitialLoading =
    activeYearQuery.isLoading ||
    componentsQuery.isLoading ||
    tariffsQuery.isLoading ||
    adjustmentsQuery.isLoading ||
    bankAccountsQuery.isLoading ||
    bankReconciliationsQuery.isLoading ||
    cashSessionsQuery.isLoading ||
    creditsQuery.isLoading ||
    invoicesQuery.isLoading ||
    studentsQuery.isLoading;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            componentsQuery.isFetching ||
            tariffsQuery.isFetching ||
            adjustmentsQuery.isFetching ||
            bankAccountsQuery.isFetching ||
            bankReconciliationsQuery.isFetching ||
            cashSessionsQuery.isFetching ||
            creditsQuery.isFetching ||
            invoicesQuery.isFetching ||
            dashboardQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void componentsQuery.refetch();
            void tariffsQuery.refetch();
            void adjustmentsQuery.refetch();
            void bankAccountsQuery.refetch();
            void bankReconciliationsQuery.refetch();
            void cashSessionsQuery.refetch();
            void creditsQuery.refetch();
            void invoicesQuery.refetch();
            void dashboardQuery.refetch();
            void studentsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Staff Keuangan
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola komponen biaya, tarif dinamis, tagihan siswa, dan reminder jatuh tempo.
      </Text>

      {isInitialLoading ? <QueryStateView type="loading" message="Mengambil data keuangan..." /> : null}
      {componentsQuery.isError || tariffsQuery.isError || adjustmentsQuery.isError || creditsQuery.isError || invoicesQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data keuangan staff."
          onRetry={() => {
            void componentsQuery.refetch();
            void tariffsQuery.refetch();
            void adjustmentsQuery.refetch();
            void creditsQuery.refetch();
            void invoicesQuery.refetch();
          }}
        />
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 8 }}>
          Tahun ajaran aktif: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{activeYearQuery.data?.name || '-'}</Text>
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#1d4ed8', fontSize: 11 }}>Total Tagihan</Text>
              <Text style={{ color: '#1e3a8a', fontWeight: '700', fontSize: 18 }}>{invoiceSummary?.totalInvoices || 0}</Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#92400e', fontSize: 11 }}>Outstanding</Text>
              <Text style={{ color: '#78350f', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                {formatCurrency(invoiceSummary?.totalOutstanding || 0)}
              </Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#166534', fontSize: 11 }}>Terbayar</Text>
              <Text style={{ color: '#14532d', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                {formatCurrency(invoiceSummary?.totalPaid || 0)}
              </Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#991b1b', fontSize: 11 }}>Lewat Jatuh Tempo</Text>
              <Text style={{ color: '#7f1d1d', fontWeight: '700', fontSize: 18 }}>{overdueCount}</Text>
            </View>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 }}>
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Reminder Jatuh Tempo</Text>
          <Text style={{ color: '#0f172a', fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
            Worker reminder mengikuti policy finance yang bisa diubah live untuk due soon, overdue, warning denda, dan eskalasi.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
              <View
                style={{
                  backgroundColor: reminderPolicy?.isActive ? '#dcfce7' : '#fee2e2',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: reminderPolicy?.isActive ? '#166534' : '#991b1b', fontSize: 11, fontWeight: '700' }}>
                  {reminderPolicy?.isActive ? 'Worker aktif' : 'Worker nonaktif'}
                </Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: '#0f172a', fontSize: 11 }}>
                  Due soon {reminderPolicy?.dueSoonDays ?? 3} hari
                </Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: '#0f172a', fontSize: 11 }}>
                  Warning denda {reminderPolicy?.lateFeeWarningEnabled ? 'aktif' : 'off'}
                </Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: '#0f172a', fontSize: 11 }}>
                  Eskalasi {reminderPolicy?.escalationEnabled ? `mulai ${reminderPolicy?.escalationStartDays ?? 7} hari` : 'off'}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#475569', marginRight: 8 }}>Due soon (hari)</Text>
            <TextInput
              keyboardType="numeric"
              value={reminderDueSoonDays}
              onChangeText={setReminderDueSoonDays}
              style={{
                width: 68,
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 6,
                color: '#0f172a',
                backgroundColor: '#fff',
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                disabled={dispatchReminderMutation.isPending}
                onPress={() => handleManualReminder('DUE_SOON')}
                style={{
                  backgroundColor: '#eff6ff',
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  opacity: dispatchReminderMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Kirim Due Soon</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                disabled={dispatchReminderMutation.isPending}
                onPress={() => handleManualReminder('OVERDUE')}
                style={{
                  backgroundColor: '#fff1f2',
                  borderWidth: 1,
                  borderColor: '#fda4af',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  opacity: dispatchReminderMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700', fontSize: 12 }}>Kirim Overdue</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                disabled={dispatchReminderMutation.isPending}
                onPress={() => handleManualReminder('LATE_FEE')}
                style={{
                  backgroundColor: '#fffbeb',
                  borderWidth: 1,
                  borderColor: '#fcd34d',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  opacity: dispatchReminderMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 12 }}>Warning Denda</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                disabled={dispatchReminderMutation.isPending}
                onPress={() => handleManualReminder('ESCALATION')}
                style={{
                  backgroundColor: '#f5f3ff',
                  borderWidth: 1,
                  borderColor: '#c4b5fd',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  opacity: dispatchReminderMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#6d28d9', fontWeight: '700', fontSize: 12 }}>Kirim Eskalasi</Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            disabled={reminderPolicyQuery.isLoading}
            onPress={openReminderPolicyModal}
            style={{
              marginTop: 8,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              opacity: reminderPolicyQuery.isLoading ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Pengaturan Policy Reminder</Text>
          </Pressable>
        </View>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#fcd34d',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Cashier Closing Harian</Text>
        <Text style={{ color: '#475569', fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
          Settlement kas membaca pembayaran tunai, refund tunai, dan koreksi reversal tunai dalam rentang sesi yang sama.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#b45309', fontSize: 11 }}>Sesi terbuka</Text>
              <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 18 }}>{cashSessionSummary?.openCount || 0}</Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#475569', fontSize: 11 }}>Sesi ditutup</Text>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 18 }}>{cashSessionSummary?.closedCount || 0}</Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#166534', fontSize: 11 }}>Kas masuk</Text>
              <Text style={{ color: '#14532d', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                {formatCurrency(cashSessionSummary?.totalExpectedCashIn || 0)}
              </Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fda4af', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#be123c', fontSize: 11 }}>Kas keluar</Text>
              <Text style={{ color: '#9f1239', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                {formatCurrency(cashSessionSummary?.totalExpectedCashOut || 0)}
              </Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#1d4ed8', fontSize: 11 }}>Pending Head TU</Text>
              <Text style={{ color: '#1e3a8a', fontWeight: '700', fontSize: 18 }}>{cashSessionSummary?.pendingHeadTuCount || 0}</Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#7c3aed', fontSize: 11 }}>Pending Kepsek</Text>
              <Text style={{ color: '#5b21b6', fontWeight: '700', fontSize: 18 }}>{cashSessionSummary?.pendingPrincipalCount || 0}</Text>
            </View>
          </View>
        </View>

        {!activeCashSession ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#fde68a',
              backgroundColor: '#fffbeb',
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 8 }}>Buka sesi kas baru</Text>
            <TextInput
              value={cashSessionBusinessDate}
              onChangeText={setCashSessionBusinessDate}
              placeholder="Tanggal bisnis (YYYY-MM-DD)"
              placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
            />
            <TextInput
              keyboardType="numeric"
              value={cashSessionOpeningBalance}
              onChangeText={setCashSessionOpeningBalance}
              placeholder="Saldo awal kas"
              placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
            />
            <TextInput
              value={cashSessionOpeningNote}
              onChangeText={setCashSessionOpeningNote}
              placeholder="Catatan pembukaan sesi (opsional)"
              placeholderTextColor="#94a3b8"
              multiline
              style={{ borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', color: '#0f172a', backgroundColor: '#fff' }}
            />
            <Pressable
              onPress={handleOpenCashSession}
              disabled={openCashSessionMutation.isPending}
              style={{
                marginTop: 10,
                backgroundColor: openCashSessionMutation.isPending ? '#fdba74' : '#d97706',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {openCashSessionMutation.isPending ? 'Membuka sesi...' : 'Buka Sesi Kas'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#fde68a',
              backgroundColor: '#fffbeb',
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#92400e', fontWeight: '700' }}>{activeCashSession.sessionNo}</Text>
                <Text style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
                  {formatDate(activeCashSession.businessDate)} • dibuka {formatDate(activeCashSession.openedAt)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: getCashSessionStatusBadge(activeCashSession.status).border,
                    backgroundColor: getCashSessionStatusBadge(activeCashSession.status).bg,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: getCashSessionStatusBadge(activeCashSession.status).text, fontSize: 11, fontWeight: '700' }}>
                    {getCashSessionStatusBadge(activeCashSession.status).label}
                  </Text>
                </View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: getCashSessionApprovalBadge(activeCashSession.approvalStatus).border,
                    backgroundColor: getCashSessionApprovalBadge(activeCashSession.approvalStatus).bg,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: getCashSessionApprovalBadge(activeCashSession.approvalStatus).text, fontSize: 11, fontWeight: '700' }}>
                    {getCashSessionApprovalBadge(activeCashSession.approvalStatus).label}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
              Saldo awal <Text style={{ color: '#0f172a', fontWeight: '700' }}>{formatCurrency(activeCashSession.openingBalance)}</Text>
            </Text>
            <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
              Kas masuk <Text style={{ color: '#166534', fontWeight: '700' }}>{formatCurrency(activeCashSession.expectedCashIn)}</Text> • kas keluar{' '}
              <Text style={{ color: '#be123c', fontWeight: '700' }}>{formatCurrency(activeCashSession.expectedCashOut)}</Text>
            </Text>
            <Text style={{ color: '#475569', fontSize: 12, marginBottom: 8 }}>
              Expected closing <Text style={{ color: '#0f172a', fontWeight: '700' }}>{formatCurrency(activeCashSession.expectedClosingBalance)}</Text> •{' '}
              {activeCashSession.totalCashPayments} pembayaran • {activeCashSession.totalCashRefunds} refund
            </Text>
            <Text style={{ color: '#0f172a', fontSize: 12, marginBottom: 8 }}>
              Zero variance {cashSessionZeroVarianceAutoApproved ? 'auto-approved' : 'direview Head TU'} • eskalasi kepsek{' '}
              <Text style={{ fontWeight: '700' }}>{formatCurrency(Number(cashSessionPrincipalApprovalThresholdAmount || 0))}</Text>
            </Text>
            <TextInput
              keyboardType="numeric"
              value={cashSessionActualClosingBalance}
              onChangeText={setCashSessionActualClosingBalance}
              placeholder="Saldo aktual saat tutup sesi"
              placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
            />
            <TextInput
              value={cashSessionClosingNote}
              onChangeText={setCashSessionClosingNote}
              placeholder="Catatan closing / settlement"
              placeholderTextColor="#94a3b8"
              multiline
              style={{ borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', color: '#0f172a', backgroundColor: '#fff' }}
            />
            <Pressable
              onPress={() => handleCloseCashSession(activeCashSession)}
              disabled={closeCashSessionMutation.isPending}
              style={{
                marginTop: 10,
                backgroundColor: closeCashSessionMutation.isPending ? '#94a3b8' : '#0f172a',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {closeCashSessionMutation.isPending ? 'Menutup sesi...' : 'Tutup Sesi Kas'}
              </Text>
            </Pressable>
          </View>
        )}

        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            borderRadius: 10,
            padding: 10,
            backgroundColor: '#eff6ff',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700', marginBottom: 8 }}>Policy Approval Settlement</Text>
          <Text style={{ color: '#475569', fontSize: 12, marginBottom: 8 }}>
            Workflow review settlement dibaca live dari policy yang sama di web dan mobile.
          </Text>
          <Pressable
            onPress={() => setCashSessionZeroVarianceAutoApproved((value) => !value)}
            style={{ marginBottom: 8 }}
          >
            <Text style={{ color: '#0f172a', fontSize: 12 }}>
              {cashSessionZeroVarianceAutoApproved ? 'Aktif' : 'Nonaktif'} • auto-approve jika selisih nol
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCashSessionRequireVarianceNote((value) => !value)}
            style={{ marginBottom: 8 }}
          >
            <Text style={{ color: '#0f172a', fontSize: 12 }}>
              {cashSessionRequireVarianceNote ? 'Aktif' : 'Nonaktif'} • wajib catatan saat ada selisih
            </Text>
          </Pressable>
          <TextInput
            keyboardType="numeric"
            value={cashSessionPrincipalApprovalThresholdAmount}
            onChangeText={setCashSessionPrincipalApprovalThresholdAmount}
            placeholder="Threshold eskalasi ke Kepala Sekolah"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
          <TextInput
            value={cashSessionApprovalPolicyNotes}
            onChangeText={setCashSessionApprovalPolicyNotes}
            placeholder="Catatan policy approval settlement"
            placeholderTextColor="#94a3b8"
            multiline
            style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', color: '#0f172a', backgroundColor: '#fff' }}
          />
          <Pressable
            onPress={() => saveCashSessionApprovalPolicyMutation.mutate()}
            disabled={saveCashSessionApprovalPolicyMutation.isPending || cashSessionApprovalPolicyQuery.isLoading}
            style={{
              marginTop: 10,
              backgroundColor: saveCashSessionApprovalPolicyMutation.isPending ? '#93c5fd' : '#2563eb',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {saveCashSessionApprovalPolicyMutation.isPending ? 'Menyimpan policy...' : 'Simpan Policy Approval'}
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#e2e8f0',
            borderRadius: 10,
            padding: 10,
            backgroundColor: '#fff',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Aktivitas tunai sesi</Text>
          {(activeCashSession || cashSessions[0])?.recentCashPayments?.length ? (
            (activeCashSession || cashSessions[0])?.recentCashPayments.map((payment) => (
              <View key={`cash-payment-${payment.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eef2ff', paddingVertical: 8 }}>
                <Text style={{ color: '#166534', fontWeight: '700' }}>{payment.paymentNo || 'Pembayaran tunai'}</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                  {payment.student?.name || '-'} • {payment.invoice?.invoiceNo || '-'} • {formatDate(payment.paidAt)}
                </Text>
                <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                  Net {formatCurrency(payment.netCashAmount)}
                  {payment.reversedAmount > 0 ? ` • reversal ${formatCurrency(payment.reversedAmount)}` : ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: '#64748b', fontSize: 12 }}>Belum ada pembayaran tunai di sesi ini.</Text>
          )}
          {(activeCashSession || cashSessions[0])?.recentCashRefunds?.length ? (
            (activeCashSession || cashSessions[0])?.recentCashRefunds.map((refund) => (
              <View key={`cash-refund-${refund.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eef2ff', paddingVertical: 8 }}>
                <Text style={{ color: '#be123c', fontWeight: '700' }}>{refund.refundNo}</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                  {refund.student.name} • {refund.student.studentClass?.name || '-'} • {formatDate(refund.refundedAt)}
                </Text>
                <Text style={{ color: '#be123c', fontSize: 12, marginTop: 2 }}>{formatCurrency(refund.amount)}</Text>
              </View>
            ))
          ) : null}
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#e2e8f0',
            borderRadius: 10,
            padding: 10,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Riwayat sesi kas</Text>
          {cashSessionsQuery.isLoading ? (
            <Text style={{ color: '#64748b', fontSize: 12 }}>Memuat sesi kas...</Text>
          ) : cashSessions.length === 0 ? (
            <Text style={{ color: '#64748b', fontSize: 12 }}>Belum ada sesi kas tercatat.</Text>
          ) : (
            cashSessions.slice(0, 4).map((session) => {
              const badge = getCashSessionStatusBadge(session.status);
              const approvalBadge = getCashSessionApprovalBadge(session.approvalStatus);
              return (
                <View key={session.id} style={{ borderTopWidth: 1, borderTopColor: '#eef2ff', paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{session.sessionNo}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {formatDate(session.businessDate)} • expected {formatCurrency(session.expectedClosingBalance)}
                      </Text>
                      {session.varianceAmount != null ? (
                        <Text style={{ color: Number(session.varianceAmount) === 0 ? '#166534' : '#be123c', fontSize: 12, marginTop: 2 }}>
                          Selisih {formatCurrency(session.varianceAmount)}
                        </Text>
                      ) : null}
                      {session.headTuDecision.note ? (
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          Review Head TU: {session.headTuDecision.note}
                        </Text>
                      ) : null}
                      {session.principalDecision.note ? (
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          Review Kepsek: {session.principalDecision.note}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: approvalBadge.border,
                          backgroundColor: approvalBadge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: approvalBadge.text, fontWeight: '700', fontSize: 11 }}>{approvalBadge.label}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Master Rekening Bank</Text>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
          Rekening aktif dipakai bersama di web dan mobile untuk pembayaran non-tunai, refund, dan rekonsiliasi bank.
        </Text>

        <TextInput
          value={bankAccountCode}
          onChangeText={setBankAccountCode}
          placeholder="Kode rekening"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankAccountBankName}
          onChangeText={setBankAccountBankName}
          placeholder="Nama bank"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankAccountAccountName}
          onChangeText={setBankAccountAccountName}
          placeholder="Nama pemilik rekening"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankAccountNumber}
          onChangeText={setBankAccountNumber}
          placeholder="Nomor rekening"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankAccountBranch}
          onChangeText={setBankAccountBranch}
          placeholder="Cabang (opsional)"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankAccountNotes}
          onChangeText={setBankAccountNotes}
          placeholder="Catatan rekening (opsional)"
          placeholderTextColor="#94a3b8"
          multiline
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />

        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <Pressable
              onPress={handleSaveBankAccount}
              disabled={saveBankAccountMutation.isPending}
              style={{
                backgroundColor: saveBankAccountMutation.isPending ? '#93c5fd' : '#2563eb',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveBankAccountMutation.isPending
                  ? 'Menyimpan rekening...'
                  : editingBankAccountId
                    ? 'Simpan Perubahan Rekening'
                    : 'Tambah Rekening'}
              </Text>
            </Pressable>
          </View>
          {editingBankAccountId ? (
            <View style={{ width: 120, paddingHorizontal: 4 }}>
              <Pressable
                onPress={resetBankAccountForm}
                style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {bankAccountsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil rekening bank..." />
        ) : bankAccounts.length === 0 ? (
          <Text style={{ color: '#64748b', fontSize: 12 }}>Belum ada rekening bank.</Text>
        ) : (
          bankAccounts.map((account) => (
            <View key={account.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#0f172a', fontWeight: '700' }}>{account.bankName}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                    {account.accountName} • {account.accountNumber}
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {account.code}
                    {account.branch ? ` • ${account.branch}` : ''}
                  </Text>
                </View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: account.isActive ? '#86efac' : '#fecaca',
                    backgroundColor: account.isActive ? '#dcfce7' : '#fee2e2',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: account.isActive ? '#166534' : '#991b1b', fontSize: 11, fontWeight: '700' }}>
                    {account.isActive ? 'Aktif' : 'Nonaktif'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => handleEditBankAccount(account)}
                    style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => toggleBankAccountMutation.mutate(account)}
                    disabled={toggleBankAccountMutation.isPending}
                    style={{
                      borderWidth: 1,
                      borderColor: account.isActive ? '#fecaca' : '#86efac',
                      backgroundColor: account.isActive ? '#fff1f2' : '#f0fdf4',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: account.isActive ? '#be123c' : '#166534', fontWeight: '700' }}>
                      {account.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Rekonsiliasi Bank</Text>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
          Cocokkan transaksi bank non-tunai dengan mutasi statement agar kontrol kas dan bank tetap akurat.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#1d4ed8', fontSize: 11 }}>Rekonsiliasi terbuka</Text>
              <Text style={{ color: '#1e3a8a', fontWeight: '700', fontSize: 18 }}>{bankReconciliationSummary?.openCount || 0}</Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#166534', fontSize: 11 }}>Final</Text>
              <Text style={{ color: '#14532d', fontWeight: '700', fontSize: 18 }}>{bankReconciliationSummary?.finalizedCount || 0}</Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#b45309', fontSize: 11 }}>Variance total</Text>
              <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                {formatCurrency(bankReconciliationSummary?.totalVarianceAmount || 0)}
              </Text>
            </View>
          </View>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#be123c', fontSize: 11 }}>Unmatched statement</Text>
              <Text style={{ color: '#9f1239', fontWeight: '700', fontSize: 18 }}>
                {bankReconciliationSummary?.totalUnmatchedStatementEntries || 0}
              </Text>
            </View>
          </View>
        </View>

        <Text style={{ color: '#475569', marginBottom: 4 }}>Rekening bank</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {activeBankAccounts.map((account) => {
              const active = bankReconciliationAccountId === account.id;
              return (
                <Pressable
                  key={`recon-account-${account.id}`}
                  onPress={() => setBankReconciliationAccountId(account.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? '#4f46e5' : '#c7d2fe',
                    backgroundColor: active ? '#eef2ff' : '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: active ? '#3730a3' : '#475569', fontWeight: '700', fontSize: 12 }}>
                    {account.bankName} • {account.accountNumber}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <TextInput
          value={bankReconciliationPeriodStart}
          onChangeText={setBankReconciliationPeriodStart}
          placeholder="Periode mulai (YYYY-MM-DD)"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankReconciliationPeriodEnd}
          onChangeText={setBankReconciliationPeriodEnd}
          placeholder="Periode akhir (YYYY-MM-DD)"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          keyboardType="numeric"
          value={bankReconciliationOpeningBalance}
          onChangeText={setBankReconciliationOpeningBalance}
          placeholder="Saldo awal statement"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          keyboardType="numeric"
          value={bankReconciliationClosingBalance}
          onChangeText={setBankReconciliationClosingBalance}
          placeholder="Saldo akhir statement"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />
        <TextInput
          value={bankReconciliationNote}
          onChangeText={setBankReconciliationNote}
          placeholder="Catatan rekonsiliasi / finalisasi"
          placeholderTextColor="#94a3b8"
          multiline
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
        />

        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <Pressable
              onPress={handleCreateBankReconciliation}
              disabled={createBankReconciliationMutation.isPending || activeBankAccounts.length === 0}
              style={{
                backgroundColor: createBankReconciliationMutation.isPending || activeBankAccounts.length === 0 ? '#818cf8' : '#4f46e5',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {createBankReconciliationMutation.isPending ? 'Membuat rekonsiliasi...' : 'Buat Rekonsiliasi'}
              </Text>
            </Pressable>
          </View>
          <View style={{ width: 120, paddingHorizontal: 4 }}>
            <Pressable
              onPress={resetBankReconciliationForm}
              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: '#334155', fontWeight: '700' }}>Reset</Text>
            </Pressable>
          </View>
        </View>

        {bankReconciliationsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil rekonsiliasi bank..." />
        ) : bankReconciliations.length === 0 ? (
          <Text style={{ color: '#64748b', fontSize: 12 }}>Belum ada rekonsiliasi bank.</Text>
        ) : (
          <View>
            {bankReconciliations.map((reconciliation) => {
              const badge = getBankReconciliationStatusBadge(reconciliation.status);
              const active = selectedBankReconciliation?.id === reconciliation.id;
              return (
                <Pressable
                  key={reconciliation.id}
                  onPress={() => setSelectedBankReconciliationId(reconciliation.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? '#6366f1' : '#dbe7fb',
                    backgroundColor: active ? '#eef2ff' : '#fff',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{reconciliation.reconciliationNo}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {reconciliation.bankAccount.bankName} • {reconciliation.bankAccount.accountNumber}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {formatDate(reconciliation.periodStart)} - {formatDate(reconciliation.periodEnd)}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: badge.border,
                        backgroundColor: badge.bg,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>
                    Variance {formatCurrency(reconciliation.summary.varianceAmount)} • statement gap{' '}
                    {formatCurrency(reconciliation.summary.statementGapAmount)}
                  </Text>
                </Pressable>
              );
            })}

            {selectedBankReconciliation ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#c7d2fe',
                  backgroundColor: '#f8fafc',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                  Detail {selectedBankReconciliation.reconciliationNo}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
                  Expected masuk {formatCurrency(selectedBankReconciliation.summary.expectedBankIn)} • keluar{' '}
                  {formatCurrency(selectedBankReconciliation.summary.expectedBankOut)}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginBottom: 8 }}>
                  Statement masuk {formatCurrency(selectedBankReconciliation.summary.statementRecordedIn)} • keluar{' '}
                  {formatCurrency(selectedBankReconciliation.summary.statementRecordedOut)}
                </Text>

                {selectedBankReconciliation.status === 'OPEN' ? (
                  <>
                    <TextInput
                      value={bankStatementEntryDate}
                      onChangeText={setBankStatementEntryDate}
                      placeholder="Tanggal mutasi (YYYY-MM-DD)"
                      placeholderTextColor="#94a3b8"
                      style={{ borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                    />
                    <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                      {[
                        { value: 'CREDIT' as FinanceBankStatementDirection, label: 'Bank Masuk' },
                        { value: 'DEBIT' as FinanceBankStatementDirection, label: 'Bank Keluar' },
                      ].map((option) => {
                        const active = bankStatementDirection === option.value;
                        return (
                          <View key={option.value} style={{ flex: 1, paddingHorizontal: 4 }}>
                            <Pressable
                              onPress={() => setBankStatementDirection(option.value)}
                              style={{
                                borderWidth: 1,
                                borderColor: active ? '#4f46e5' : '#c7d2fe',
                                backgroundColor: active ? '#eef2ff' : '#fff',
                                borderRadius: 8,
                                paddingVertical: 8,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ color: active ? '#3730a3' : '#475569', fontWeight: '700' }}>{option.label}</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                    <TextInput
                      keyboardType="numeric"
                      value={bankStatementAmount}
                      onChangeText={setBankStatementAmount}
                      placeholder="Nominal mutasi"
                      placeholderTextColor="#94a3b8"
                      style={{ borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                    />
                    <TextInput
                      value={bankStatementReference}
                      onChangeText={setBankStatementReference}
                      placeholder="Referensi / nomor mutasi"
                      placeholderTextColor="#94a3b8"
                      style={{ borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                    />
                    <TextInput
                      value={bankStatementDescription}
                      onChangeText={setBankStatementDescription}
                      placeholder="Deskripsi mutasi (opsional)"
                      placeholderTextColor="#94a3b8"
                      multiline
                      style={{ borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                    />
                    <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                      <View style={{ flex: 1, paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() => handleAddBankStatementEntry(selectedBankReconciliation)}
                          disabled={createBankStatementEntryMutation.isPending}
                          style={{
                            backgroundColor: createBankStatementEntryMutation.isPending ? '#818cf8' : '#4f46e5',
                            borderRadius: 10,
                            paddingVertical: 10,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>
                            {createBankStatementEntryMutation.isPending ? 'Menambah mutasi...' : 'Tambah Mutasi'}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ flex: 1, paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() => handleFinalizeBankReconciliation(selectedBankReconciliation)}
                          disabled={finalizeBankReconciliationMutation.isPending}
                          style={{
                            backgroundColor: finalizeBankReconciliationMutation.isPending ? '#94a3b8' : '#0f172a',
                            borderRadius: 10,
                            paddingVertical: 10,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>
                            {finalizeBankReconciliationMutation.isPending ? 'Memfinalkan...' : 'Finalkan'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                ) : null}

                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Mutasi Statement</Text>
                {selectedBankReconciliation.statementEntries.length === 0 ? (
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                    Belum ada mutasi statement untuk rekonsiliasi ini.
                  </Text>
                ) : (
                  selectedBankReconciliation.statementEntries.map((entry) => (
                    <View key={entry.id} style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingVertical: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#0f172a', fontWeight: '700' }}>
                            {entry.direction === 'CREDIT' ? 'Bank Masuk' : 'Bank Keluar'} • {formatCurrency(entry.amount)}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                            {formatDate(entry.entryDate)} • {entry.referenceNo || 'Tanpa referensi'}
                          </Text>
                          {entry.matchedPayment ? (
                            <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                              Matched ke pembayaran {entry.matchedPayment.paymentNo || '-'}
                            </Text>
                          ) : entry.matchedRefund ? (
                            <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                              Matched ke refund {entry.matchedRefund.refundNo || '-'}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: entry.status === 'MATCHED' ? '#86efac' : '#fecaca',
                            backgroundColor: entry.status === 'MATCHED' ? '#dcfce7' : '#fee2e2',
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={{ color: entry.status === 'MATCHED' ? '#166534' : '#991b1b', fontSize: 11, fontWeight: '700' }}>
                            {entry.status === 'MATCHED' ? 'Matched' : 'Unmatched'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}

                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Pembayaran Sistem</Text>
                {selectedBankReconciliation.systemPayments.length === 0 ? (
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                    Belum ada pembayaran non-tunai pada periode ini.
                  </Text>
                ) : (
                  selectedBankReconciliation.systemPayments.slice(0, 6).map((payment) => (
                    <View key={payment.id} style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingVertical: 8 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{payment.paymentNo || 'Pembayaran'}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {payment.referenceNo || 'Tanpa referensi'}
                        {payment.bankAccount ? ` • ${payment.bankAccount.bankName}` : ''}
                      </Text>
                      <Text style={{ color: payment.matched ? '#166534' : '#b45309', fontSize: 12, marginTop: 2 }}>
                        {payment.matched ? 'Matched' : 'Belum matched'} • {formatCurrency(payment.netBankAmount)}
                      </Text>
                    </View>
                  ))
                )}

                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Refund Sistem</Text>
                {selectedBankReconciliation.systemRefunds.length === 0 ? (
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    Belum ada refund non-tunai pada periode ini.
                  </Text>
                ) : (
                  selectedBankReconciliation.systemRefunds.slice(0, 6).map((refund) => (
                    <View key={refund.id} style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingVertical: 8 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{refund.refundNo || 'Refund'}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {refund.student.name} • {refund.referenceNo || 'Tanpa referensi'}
                      </Text>
                      <Text style={{ color: refund.matched ? '#166534' : '#b45309', fontSize: 12, marginTop: 2 }}>
                        {refund.matched ? 'Matched' : 'Belum matched'} • {formatCurrency(refund.amount)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {(
          [
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'components', label: 'Komponen' },
            { key: 'tariffs', label: 'Tarif' },
            { key: 'adjustments', label: 'Penyesuaian' },
            { key: 'invoices', label: 'Tagihan' },
          ] as Array<{ key: FinanceTab; label: string }>
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <View key={tab.key} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setActiveTab(tab.key)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? '#1d4ed8' : '#d6e2f7',
                  backgroundColor: active ? '#e9f1ff' : '#fff',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700' }}>{tab.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {activeTab === 'dashboard' ? (
        <>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>KPI Kolektibilitas</Text>
            <Text style={{ color: '#334155', marginBottom: 4 }}>
              Collection rate:{' '}
              <Text style={{ color: '#166534', fontWeight: '700' }}>
                {dashboardQuery.data ? `${dashboardQuery.data.kpi.collectionRate.toFixed(1)}%` : '-'}
              </Text>
            </Text>
            <Text style={{ color: '#334155', marginBottom: 4 }}>
              Overdue rate:{' '}
              <Text style={{ color: '#b45309', fontWeight: '700' }}>
                {dashboardQuery.data ? `${dashboardQuery.data.kpi.overdueRate.toFixed(1)}%` : '-'}
              </Text>
            </Text>
            <Text style={{ color: '#334155', marginBottom: 8 }}>
              DSO:{' '}
              <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                {dashboardQuery.data ? `${dashboardQuery.data.kpi.dsoDays.toFixed(1)} hari` : '-'}
              </Text>
            </Text>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Top Tunggakan per Kelas</Text>
              {topClassOutstanding.length === 0 ? (
                <Text style={{ color: '#64748b' }}>Belum ada data tunggakan.</Text>
              ) : (
                topClassOutstanding.map((row) => (
                  <View
                    key={row.className}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f1f5f9',
                    }}
                  >
                    <Text style={{ color: '#334155' }}>{row.className}</Text>
                    <Text style={{ color: '#92400e', fontWeight: '700' }}>{formatCurrency(row.amount)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Saldo Kredit Siswa</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
              Kelebihan bayar akan masuk ke saldo kredit dan bisa direfund dari sini.
            </Text>

            <TextInput
              value={creditSearch}
              onChangeText={setCreditSearch}
              placeholder="Cari siswa / NIS / kelas"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 9,
                marginBottom: 10,
                color: '#0f172a',
                backgroundColor: '#fff',
              }}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#166534', fontSize: 11 }}>Siswa dengan Kredit</Text>
                  <Text style={{ color: '#166534', fontWeight: '700', fontSize: 16, marginTop: 3 }}>
                    {creditSummary?.totalStudentsWithCredit || 0}
                  </Text>
                </View>
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#166534', fontSize: 11 }}>Total Saldo Kredit</Text>
                  <Text style={{ color: '#166534', fontWeight: '700', fontSize: 16, marginTop: 3 }}>
                    {formatCurrency(creditSummary?.totalCreditBalance || 0)}
                  </Text>
                </View>
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <View style={{ backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#0369a1', fontSize: 11 }}>Total Refund</Text>
                  <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: 16, marginTop: 3 }}>
                    {creditSummary?.totalRefundRecords || 0}
                  </Text>
                </View>
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <View style={{ backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#0369a1', fontSize: 11 }}>Nominal Refund</Text>
                  <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: 16, marginTop: 3 }}>
                    {formatCurrency(creditSummary?.totalRefundAmount || 0)}
                  </Text>
                </View>
              </View>
            </View>

            {creditsQuery.isLoading ? (
              <Text style={{ color: '#64748b' }}>Memuat saldo kredit...</Text>
            ) : creditBalances.length === 0 ? (
              <Text style={{ color: '#64748b' }}>Belum ada saldo kredit aktif.</Text>
            ) : (
              creditBalances.map((balance) => (
                <View
                  key={balance.balanceId}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: '#eef2ff',
                    paddingVertical: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{balance.student.name}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {balance.student.studentClass?.name || 'Tanpa kelas'} • {balance.student.nis || balance.student.username}
                      </Text>
                      {balance.recentTransactions.map((transaction) => (
                        <Text key={transaction.id} style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                          {getCreditTransactionLabel(transaction)} • {formatCurrency(transaction.amount)} • saldo {formatCurrency(transaction.balanceAfter)}
                        </Text>
                      ))}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#166534', fontWeight: '700' }}>{formatCurrency(balance.balanceAmount)}</Text>
                      <Pressable
                        onPress={() => startRefund(balance)}
                        disabled={balance.balanceAmount <= 0}
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: '#bae6fd',
                          backgroundColor: '#f0f9ff',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          opacity: balance.balanceAmount <= 0 ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: 12 }}>Refund</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 8 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Refund Terbaru</Text>
              {recentRefunds.length === 0 ? (
                <Text style={{ color: '#64748b' }}>Belum ada refund saldo kredit.</Text>
              ) : (
                recentRefunds.slice(0, 6).map((refund: StaffFinanceRefundRecord) => (
                  <View key={refund.id} style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#eef2ff' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{refund.student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {refund.refundNo} • {getPaymentMethodLabel(refund.method)}
                        </Text>
                      </View>
                      <Text style={{ color: '#0369a1', fontWeight: '700' }}>{formatCurrency(refund.amount)}</Text>
                    </View>
                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      {formatDate(refund.refundedAt)} • {refund.student.studentClass?.name || 'Tanpa kelas'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View style={{ backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#be123c', fontSize: 11 }}>Siswa Follow Up</Text>
                <Text style={{ color: '#881337', fontWeight: '700', fontSize: 18, marginTop: 3 }}>
                  {dashboardQuery.data?.collectionOverview.studentsWithOutstanding || 0}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View style={{ backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#c2410c', fontSize: 11 }}>Prioritas Tinggi</Text>
                <Text style={{ color: '#9a3412', fontWeight: '700', fontSize: 18, marginTop: 3 }}>
                  {dashboardQuery.data?.collectionOverview.highPriorityCount || 0}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#b91c1c', fontSize: 11 }}>Kasus Kritis</Text>
                <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 18, marginTop: 3 }}>
                  {dashboardQuery.data?.collectionOverview.criticalCount || 0}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View style={{ backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#0369a1', fontSize: 11 }}>Jatuh Tempo 7 Hari</Text>
                <Text style={{ color: '#0c4a6e', fontWeight: '700', fontSize: 18, marginTop: 3 }}>
                  {dashboardQuery.data?.collectionOverview.dueSoonCount || 0}
                </Text>
                <Text style={{ color: '#0369a1', fontSize: 11, marginTop: 2 }}>
                  {formatCurrency(dashboardQuery.data?.collectionOverview.dueSoonOutstanding || 0)}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Antrian Penagihan Prioritas</Text>
            {!dashboardQuery.data?.collectionPriorityQueue?.length ? (
              <Text style={{ color: '#64748b' }}>Belum ada saldo outstanding aktif.</Text>
            ) : (
              dashboardQuery.data.collectionPriorityQueue.slice(0, 5).map((row) => {
                const badge = getCollectionPriorityStyle(row.priority);
                return (
                  <View key={row.studentId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{row.studentName}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {row.className} • {row.nis || row.username}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: badge.bg, borderColor: badge.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{row.priority}</Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>
                      Outstanding <Text style={{ fontWeight: '700', color: '#0f172a' }}>{formatCurrency(row.totalOutstanding)}</Text> • overdue {formatCurrency(row.overdueOutstanding)}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      Max lewat {row.maxDaysPastDue} hari • pembayaran terakhir {formatDate(row.lastPaymentDate)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Tagihan Jatuh Tempo Dekat</Text>
            {!dashboardQuery.data?.dueSoonInvoices?.length ? (
              <Text style={{ color: '#64748b' }}>Tidak ada tagihan jatuh tempo dalam 7 hari.</Text>
            ) : (
              dashboardQuery.data.dueSoonInvoices.slice(0, 5).map((row) => (
                <View key={row.invoiceId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{row.studentName}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {row.invoiceNo} • {row.className}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#0369a1', fontSize: 11, fontWeight: '700' }}>{getDueSoonLabel(row.daysUntilDue)}</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#0c4a6e', fontWeight: '700', marginTop: 6 }}>{formatCurrency(row.balanceAmount)}</Text>
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    Jatuh tempo {formatDate(row.dueDate)} • {row.title || row.periodKey}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Komponen Penyumbang Tunggakan</Text>
            {!dashboardQuery.data?.componentReceivableRecap?.length ? (
              <Text style={{ color: '#64748b' }}>Belum ada outstanding per komponen.</Text>
            ) : (
              dashboardQuery.data.componentReceivableRecap.slice(0, 5).map((row) => (
                <View key={`${row.componentCode}-${row.componentName}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{row.componentName}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {row.componentCode || '-'} • {row.studentCount} siswa
                      </Text>
                    </View>
                    <Text style={{ color: '#92400e', fontWeight: '700' }}>{formatCurrency(row.totalOutstanding)}</Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    Overdue {formatCurrency(row.overdueOutstanding)} • {row.invoiceCount} invoice aktif
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}

      {activeTab === 'components' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Master Komponen</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                Tambah atau edit komponen dibuka lewat popup agar daftar hasil tetap fokus.
              </Text>
            </View>
            <Pressable
              onPress={openCreateComponentModal}
              style={{ backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah Komponen</Text>
            </Pressable>
          </View>

          {(components || []).map((component: StaffFinanceComponent) => (
            <View
              key={component.id}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                backgroundColor: '#fff',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>{component.name}</Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: component.isActive ? '#86efac' : '#fecaca',
                    backgroundColor: component.isActive ? '#dcfce7' : '#fee2e2',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: component.isActive ? '#166534' : '#991b1b', fontSize: 11, fontWeight: '700' }}>
                    {component.isActive ? 'Aktif' : 'Nonaktif'}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#475569', fontSize: 12 }}>{component.code}</Text>
              {component.description ? <Text style={{ color: '#64748b', marginTop: 2 }}>{component.description}</Text> : null}
              <Text style={{ color: component.lateFeeEnabled ? '#92400e' : '#64748b', marginTop: 4, fontSize: 12 }}>
                {component.lateFeeEnabled
                  ? `Denda ${getLateFeeModeLabel(component.lateFeeMode)} • ${formatCurrency(component.lateFeeAmount)} • grace ${component.lateFeeGraceDays} hari${
                      component.lateFeeCapAmount != null
                        ? ` • cap ${formatCurrency(component.lateFeeCapAmount)}`
                        : ''
                    }`
                  : 'Tanpa denda keterlambatan'}
              </Text>
              <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => handleEditComponent(component)}
                    style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() =>
                      toggleComponentMutation.mutate({
                        componentId: component.id,
                        isActive: !component.isActive,
                      })
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: component.isActive ? '#fecaca' : '#86efac',
                      backgroundColor: component.isActive ? '#fff1f2' : '#f0fdf4',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: component.isActive ? '#be123c' : '#166534', fontWeight: '700' }}>
                      {component.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === 'tariffs' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Rule Tarif</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                Form tambah tarif dibuka lewat popup, dan level kelas diambil dari master kelas admin tanpa rombel.
              </Text>
            </View>
            <Pressable
              onPress={openCreateTariffModal}
              style={{ backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah Tarif</Text>
            </Pressable>
          </View>

          {tariffs.map((tariff: StaffFinanceTariffRule) => (
            <View key={tariff.id} style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fff' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>{tariff.component?.name || '-'}</Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: tariff.isActive ? '#86efac' : '#fecaca',
                    backgroundColor: tariff.isActive ? '#dcfce7' : '#fee2e2',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: tariff.isActive ? '#166534' : '#991b1b', fontSize: 11, fontWeight: '700' }}>
                    {tariff.isActive ? 'Aktif' : 'Nonaktif'}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#64748b', marginBottom: 2 }}>
                Scope: {describeTariffScope(tariff)}
              </Text>
              {tariff.notes ? <Text style={{ color: '#64748b', marginBottom: 2 }}>{tariff.notes}</Text> : null}
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>{formatCurrency(tariff.amount)}</Text>

              <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => handleEditTariff(tariff)}
                    style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() =>
                      toggleTariffMutation.mutate({
                        tariffId: tariff.id,
                        isActive: !tariff.isActive,
                      })
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: tariff.isActive ? '#fecaca' : '#86efac',
                      backgroundColor: tariff.isActive ? '#fff1f2' : '#f0fdf4',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: tariff.isActive ? '#be123c' : '#166534', fontWeight: '700' }}>
                      {tariff.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === 'adjustments' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Rule Penyesuaian Dinamis</Text>

          <TextInput
            value={adjustmentCode}
            onChangeText={setAdjustmentCode}
            placeholder="Kode rule (contoh: BEASISWA_PRESTASI)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
          <TextInput
            value={adjustmentName}
            onChangeText={setAdjustmentName}
            placeholder="Nama rule penyesuaian"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ADJUSTMENT_KIND_OPTIONS.map((option) => {
                const active = adjustmentKind === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setAdjustmentKind(option.value)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#7c3aed' : '#ddd6fe',
                      backgroundColor: active ? '#f5f3ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: active ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <TextInput
            keyboardType="numeric"
            value={adjustmentAmount}
            onChangeText={setAdjustmentAmount}
            placeholder="Nominal penyesuaian"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />

          <Text style={{ color: '#475569', marginBottom: 4 }}>Komponen target (opsional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setAdjustmentComponentId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentComponentId === null ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentComponentId === null ? '#f5f3ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: adjustmentComponentId === null ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Seluruh invoice
                </Text>
              </Pressable>
              {components.map((component) => {
                const active = adjustmentComponentId === component.id;
                return (
                  <Pressable
                    key={component.id}
                    onPress={() => setAdjustmentComponentId(component.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#7c3aed' : '#ddd6fe',
                      backgroundColor: active ? '#f5f3ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {component.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={{ color: '#475569', marginBottom: 4 }}>Tahun ajaran (opsional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setAdjustmentAcademicYearId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentAcademicYearId === null ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentAcademicYearId === null ? '#f5f3ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: adjustmentAcademicYearId === null ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua tahun
                </Text>
              </Pressable>
              {academicYears.map((year) => {
                const active = adjustmentAcademicYearId === year.id;
                return (
                  <Pressable
                    key={year.id}
                    onPress={() => setAdjustmentAcademicYearId(year.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#7c3aed' : '#ddd6fe',
                      backgroundColor: active ? '#f5f3ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {year.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={{ color: '#475569', marginBottom: 4 }}>Kelas (opsional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setAdjustmentGradeLevel('')}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentGradeLevel === '' ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentGradeLevel === '' ? '#f5f3ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: adjustmentGradeLevel === '' ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua kelas
                </Text>
              </Pressable>
              {classLevelOptions.map((level) => {
                const active = adjustmentGradeLevel === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => setAdjustmentGradeLevel(level)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#7c3aed' : '#ddd6fe',
                      backgroundColor: active ? '#f5f3ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {getClassLevelLabel(level)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={{ color: '#475569', marginBottom: 4 }}>Jurusan (opsional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setAdjustmentMajorId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentMajorId === null ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentMajorId === null ? '#f5f3ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: adjustmentMajorId === null ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua jurusan
                </Text>
              </Pressable>
              {majors.map((major) => {
                const active = adjustmentMajorId === major.id;
                return (
                  <Pressable
                    key={major.id}
                    onPress={() => setAdjustmentMajorId(major.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#7c3aed' : '#ddd6fe',
                      backgroundColor: active ? '#f5f3ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {major.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setAdjustmentSemester('')}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentSemester === '' ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentSemester === '' ? '#f5f3ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: adjustmentSemester === '' ? '#6d28d9' : '#475569', fontWeight: '700' }}>Semua</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setAdjustmentSemester('ODD')}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentSemester === 'ODD' ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentSemester === 'ODD' ? '#f5f3ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: adjustmentSemester === 'ODD' ? '#6d28d9' : '#475569', fontWeight: '700' }}>Ganjil</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setAdjustmentSemester('EVEN')}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentSemester === 'EVEN' ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentSemester === 'EVEN' ? '#f5f3ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: adjustmentSemester === 'EVEN' ? '#6d28d9' : '#475569', fontWeight: '700' }}>Genap</Text>
              </Pressable>
            </View>
          </View>

          <TextInput
            value={adjustmentEffectiveStart}
            onChangeText={setAdjustmentEffectiveStart}
            placeholder="Efektif mulai (YYYY-MM-DD, opsional)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
          <TextInput
            value={adjustmentEffectiveEnd}
            onChangeText={setAdjustmentEffectiveEnd}
            placeholder="Efektif sampai (YYYY-MM-DD, opsional)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
          <TextInput
            value={adjustmentDescription}
            onChangeText={setAdjustmentDescription}
            placeholder="Deskripsi (opsional)"
            placeholderTextColor="#94a3b8"
            multiline
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 64, textAlignVertical: 'top', backgroundColor: '#fff' }}
          />
          <TextInput
            value={adjustmentNotes}
            onChangeText={setAdjustmentNotes}
            placeholder="Catatan (opsional)"
            placeholderTextColor="#94a3b8"
            multiline
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 64, textAlignVertical: 'top', backgroundColor: '#fff' }}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: '#ddd6fe',
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Target Siswa Spesifik</Text>
                <Text style={{ color: '#64748b', fontSize: 12 }}>
                  Kosongkan jika rule berlaku global sesuai filter. Isi jika rule hanya berlaku untuk siswa tertentu.
                </Text>
              </View>
              {selectedAdjustmentStudent ? (
                <Pressable
                  onPress={handleClearAdjustmentStudent}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Reset</Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              value={adjustmentStudentSearch}
              onChangeText={setAdjustmentStudentSearch}
              placeholder="Cari siswa berdasarkan nama, username, NIS, NISN, kelas"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 9,
                marginBottom: 8,
                color: '#0f172a',
                backgroundColor: '#fff',
              }}
            />

            {selectedAdjustmentStudent ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#c7d2fe',
                  backgroundColor: '#eef2ff',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#312e81', fontWeight: '700' }}>{selectedAdjustmentStudent.name}</Text>
                  <Text style={{ color: '#4338ca', fontSize: 12 }}>
                    {selectedAdjustmentStudent.studentClass?.name || 'Tanpa kelas'} • {selectedAdjustmentStudent.username}
                  </Text>
                </View>
                <Pressable
                  onPress={handleClearAdjustmentStudent}
                  style={{
                    borderWidth: 1,
                    borderColor: '#c7d2fe',
                    backgroundColor: '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: '#4338ca', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                Belum ada siswa spesifik yang dipilih.
              </Text>
            )}

            {adjustmentStudentCandidates.length > 0 ? (
              <View>
                {adjustmentStudentCandidates.map((student) => (
                  <Pressable
                    key={student.id}
                    onPress={() => handleSelectAdjustmentStudent(student.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      backgroundColor: '#fff',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {student.username} • {student.studentClass?.name || 'Tanpa kelas'}
                        </Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                          {(student.nis ? `NIS ${student.nis}` : student.nisn ? `NISN ${student.nisn}` : 'Tanpa identitas') +
                            ' • ' +
                            (student.studentClass?.major?.name || 'Tanpa jurusan')}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#c7d2fe',
                          backgroundColor: '#eef2ff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: '#4338ca', fontWeight: '700', fontSize: 11 }}>Pilih</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : adjustmentStudentSearch.trim() ? (
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                Tidak ada siswa yang cocok dengan pencarian.
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={handleSaveAdjustment}
                disabled={saveAdjustmentMutation.isPending}
                style={{ backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: saveAdjustmentMutation.isPending ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {editingAdjustmentId ? 'Simpan Perubahan' : 'Tambah Penyesuaian'}
                </Text>
              </Pressable>
            </View>
            {editingAdjustmentId ? (
              <View style={{ width: 120, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={resetAdjustmentForm}
                  style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {adjustments.map((adjustment: StaffFinanceAdjustmentRule) => (
            <View key={adjustment.id} style={{ borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fff' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: '#0f172a', fontWeight: '700' }}>{adjustment.name}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    {adjustment.code} • {getAdjustmentKindLabel(adjustment.kind)}
                  </Text>
                </View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: adjustment.isActive ? '#86efac' : '#fecaca',
                    backgroundColor: adjustment.isActive ? '#dcfce7' : '#fee2e2',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: adjustment.isActive ? '#166534' : '#991b1b', fontSize: 11, fontWeight: '700' }}>
                    {adjustment.isActive ? 'Aktif' : 'Nonaktif'}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#64748b', marginBottom: 2 }}>
                Scope: {describeAdjustmentScope(adjustment)}
              </Text>
              {adjustment.description ? <Text style={{ color: '#64748b', marginBottom: 2 }}>{adjustment.description}</Text> : null}
              {adjustment.notes ? <Text style={{ color: '#94a3b8', marginBottom: 2 }}>{adjustment.notes}</Text> : null}
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                {(adjustment.kind === 'DISCOUNT' || adjustment.kind === 'SCHOLARSHIP' ? '-' : '+') +
                  formatCurrency(adjustment.amount)}
              </Text>

              <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => handleEditAdjustment(adjustment)}
                    style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() =>
                      toggleAdjustmentMutation.mutate({
                        adjustmentId: adjustment.id,
                        isActive: !adjustment.isActive,
                      })
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: adjustment.isActive ? '#fecaca' : '#86efac',
                      backgroundColor: adjustment.isActive ? '#fff1f2' : '#f0fdf4',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: adjustment.isActive ? '#be123c' : '#166534', fontWeight: '700' }}>
                      {adjustment.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === 'invoices' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Generate Tagihan</Text>

          <Text style={{ color: '#475569', marginBottom: 4 }}>Tahun ajaran</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {academicYears.map((year) => {
                const active = (invoiceAcademicYearId || activeYearQuery.data?.id || null) === year.id;
                return (
                  <Pressable
                    key={year.id}
                    onPress={() => setInvoiceAcademicYearId(year.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: active ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {year.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setInvoiceSemester('ODD')}
                style={{
                  borderWidth: 1,
                  borderColor: invoiceSemester === 'ODD' ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: invoiceSemester === 'ODD' ? '#e9f1ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: invoiceSemester === 'ODD' ? '#1e3a8a' : '#475569', fontWeight: '700' }}>Ganjil</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setInvoiceSemester('EVEN')}
                style={{
                  borderWidth: 1,
                  borderColor: invoiceSemester === 'EVEN' ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: invoiceSemester === 'EVEN' ? '#e9f1ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: invoiceSemester === 'EVEN' ? '#1e3a8a' : '#475569', fontWeight: '700' }}>Genap</Text>
              </Pressable>
            </View>
          </View>

          <TextInput
            value={invoicePeriodKey}
            onChangeText={setInvoicePeriodKey}
            placeholder="Period key (YYYY-MM)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
          <TextInput
            value={invoiceDueDate}
            onChangeText={setInvoiceDueDate}
            placeholder="Jatuh tempo (YYYY-MM-DD, opsional)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
          <TextInput
            value={invoiceTitle}
            onChangeText={setInvoiceTitle}
            placeholder="Judul tagihan (opsional)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />

          <Text style={{ color: '#475569', marginBottom: 4 }}>Kelas target (opsional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setInvoiceGradeLevel('')}
                style={{
                  borderWidth: 1,
                  borderColor: invoiceGradeLevel === '' ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: invoiceGradeLevel === '' ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: invoiceGradeLevel === '' ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua kelas
                </Text>
              </Pressable>
              {classLevelOptions.map((level) => {
                const active = invoiceGradeLevel === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => setInvoiceGradeLevel(level)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: active ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {getClassLevelLabel(level)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={{ color: '#475569', marginBottom: 4 }}>Jurusan target (opsional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setInvoiceMajorId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: invoiceMajorId === null ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: invoiceMajorId === null ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: invoiceMajorId === null ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua jurusan
                </Text>
              </Pressable>
              {majors.map((major) => {
                const active = invoiceMajorId === major.id;
                return (
                  <Pressable
                    key={major.id}
                    onPress={() => setInvoiceMajorId(major.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: active ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {major.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={{ color: '#475569', marginBottom: 4 }}>Jumlah termin cicilan</Text>
          <TextInput
            keyboardType="numeric"
            value={String(invoiceInstallmentCount)}
            onChangeText={(value) =>
              setInvoiceInstallmentCount(Math.max(1, Math.min(24, Number(value || 1))))
            }
            placeholder="Jumlah cicilan"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />

          <Text style={{ color: '#475569', marginBottom: 4 }}>Jarak antar termin (hari)</Text>
          <TextInput
            keyboardType="numeric"
            value={String(invoiceInstallmentIntervalDays)}
            onChangeText={(value) =>
              setInvoiceInstallmentIntervalDays(Math.max(1, Math.min(180, Number(value || 30))))
            }
            placeholder="Jarak cicilan (hari)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />

          <Pressable
            onPress={() => setInvoiceAutoApplyCreditBalance((value) => !value)}
            style={{
              borderWidth: 1,
              borderColor: invoiceAutoApplyCreditBalance ? '#bae6fd' : '#d1d5db',
              backgroundColor: invoiceAutoApplyCreditBalance ? '#e0f2fe' : '#fff',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: invoiceAutoApplyCreditBalance ? '#075985' : '#334155', fontWeight: '700' }}>
              {invoiceAutoApplyCreditBalance ? 'Aktif' : 'Nonaktif'}: auto-apply saldo kredit yang tersedia
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setInvoiceReplaceExisting((value) => !value)}
            style={{
              borderWidth: 1,
              borderColor: invoiceReplaceExisting ? '#c7d2fe' : '#d1d5db',
              backgroundColor: invoiceReplaceExisting ? '#eef2ff' : '#fff',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: invoiceReplaceExisting ? '#3730a3' : '#334155', fontWeight: '700' }}>
              {invoiceReplaceExisting ? 'Aktif' : 'Nonaktif'}: replace invoice existing yang belum dibayar
            </Text>
          </Pressable>

          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                  Target Siswa Spesifik
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12 }}>
                  Jika ada siswa dipilih, generate hanya memproses siswa terpilih. Filter kelas, jurusan,
                  dan tingkat tetap tampil sebagai referensi visual.
                </Text>
              </View>
              {invoiceSelectedStudentIds.length > 0 ? (
                <Pressable
                  onPress={handleClearInvoiceStudentSelection}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Reset</Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              value={invoiceStudentSearch}
              onChangeText={setInvoiceStudentSearch}
              placeholder="Cari siswa berdasarkan nama, username, NIS, NISN, kelas"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 9,
                marginBottom: 8,
                color: '#0f172a',
                backgroundColor: '#fff',
              }}
            />

            {selectedInvoiceStudents.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                {selectedInvoiceStudents.map((student) => (
                  <View
                    key={student.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#c7d2fe',
                      backgroundColor: '#eef2ff',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 6,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#312e81', fontWeight: '700' }}>{student.name}</Text>
                      <Text style={{ color: '#4338ca', fontSize: 12 }}>
                        {student.studentClass?.name || 'Tanpa kelas'} • {student.username}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleRemoveInvoiceStudent(student.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#c7d2fe',
                        backgroundColor: '#fff',
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#4338ca', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                Belum ada siswa spesifik yang dipilih.
              </Text>
            )}

            {invoiceStudentCandidates.length > 0 ? (
              <View>
                {invoiceStudentCandidates.map((student) => (
                  <Pressable
                    key={student.id}
                    onPress={() => handleSelectInvoiceStudent(student.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      backgroundColor: '#fff',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {student.username} • {student.studentClass?.name || 'Tanpa kelas'}
                        </Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                          {(student.nis ? `NIS ${student.nis}` : student.nisn ? `NISN ${student.nisn}` : 'Tanpa identitas') +
                            ' • ' +
                            (student.studentClass?.major?.name || 'Tanpa jurusan')}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#c7d2fe',
                          backgroundColor: '#eef2ff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: '#4338ca', fontWeight: '700', fontSize: 11 }}>Pilih</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : invoiceStudentSearch.trim() ? (
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                Tidak ada siswa yang cocok dengan pencarian.
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={handlePreviewGenerate}
                disabled={previewInvoiceMutation.isPending}
                style={{
                  borderWidth: 1,
                  borderColor: '#c7d2fe',
                  backgroundColor: '#eef2ff',
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  opacity: previewInvoiceMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#4338ca', fontWeight: '700' }}>
                  {previewInvoiceMutation.isPending ? 'Membuat preview...' : 'Preview Target'}
                </Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={handleGenerate}
                disabled={generateInvoiceMutation.isPending}
                style={{
                  backgroundColor: '#4f46e5',
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  opacity: generateInvoiceMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {generateInvoiceMutation.isPending ? 'Memproses...' : 'Generate Tagihan'}
                </Text>
              </Pressable>
            </View>
          </View>

          {previewInvoiceMutation.data ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#c7d2fe',
                backgroundColor: '#eef2ff',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#3730a3', fontWeight: '700', marginBottom: 4 }}>Preview Generate</Text>
              <Text style={{ color: '#312e81', marginBottom: 10 }}>
                {previewInvoiceMutation.data.summary.totalTargetStudents} siswa terjaring dengan proyeksi tagihan{' '}
                {formatCurrency(previewInvoiceMutation.data.summary.totalProjectedAmount)}.
              </Text>
              {previewInvoiceMutation.data.filters.selectedStudentCount > 0 ? (
                <Text style={{ color: '#4338ca', fontSize: 12, marginBottom: 10 }}>
                  Mode target eksplisit aktif untuk {previewInvoiceMutation.data.filters.selectedStudentCount} siswa.
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
                {[
                  { label: 'Siap dibuat', value: previewInvoiceMutation.data.summary.created, tone: '#166534', border: '#86efac', bg: '#dcfce7' },
                  { label: 'Siap update', value: previewInvoiceMutation.data.summary.updated, tone: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' },
                  { label: 'Sudah ada', value: previewInvoiceMutation.data.summary.skippedExisting, tone: '#92400e', border: '#fcd34d', bg: '#fef3c7' },
                  { label: 'Terkunci', value: previewInvoiceMutation.data.summary.skippedLocked, tone: '#991b1b', border: '#fecaca', bg: '#fee2e2' },
                  { label: 'Tanpa tarif', value: previewInvoiceMutation.data.summary.skippedNoTariff, tone: '#475569', border: '#cbd5e1', bg: '#f8fafc' },
                  { label: 'Auto-apply kredit', value: formatCurrency(previewInvoiceMutation.data.summary.totalProjectedAppliedCredit), tone: '#075985', border: '#bae6fd', bg: '#e0f2fe' },
                  { label: 'Outstanding akhir', value: formatCurrency(previewInvoiceMutation.data.summary.totalProjectedOutstanding), tone: '#6d28d9', border: '#ddd6fe', bg: '#f5f3ff' },
                ].map((item) => (
                  <View key={item.label} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <View style={{ borderWidth: 1, borderColor: item.border, backgroundColor: item.bg, borderRadius: 10, padding: 10 }}>
                      <Text style={{ color: item.tone, fontSize: 12 }}>{item.label}</Text>
                      <Text style={{ color: item.tone, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {previewInvoiceMutation.data.details.map((detail) => {
                const status = getInvoicePreviewStatusMeta(detail.status);
                return (
                  <View
                    key={`${detail.studentId}-${detail.status}`}
                    style={{
                      borderWidth: 1,
                      borderColor: '#c7d2fe',
                      backgroundColor: '#fff',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{detail.studentName}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12 }}>
                          {detail.className} • {detail.majorName ? `Jurusan ${detail.majorName}` : 'Semua jurusan'}
                        </Text>
                        <Text style={{ color: '#64748b', fontSize: 12 }}>
                          {detail.gradeLevel ? `Tingkat ${detail.gradeLevel}` : 'Semua tingkat'}
                        </Text>
                        {detail.invoiceNo ? (
                          <Text style={{ color: '#64748b', fontSize: 12 }}>{detail.invoiceNo}</Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: status.border,
                          backgroundColor: status.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                    >
                        <Text style={{ color: status.text, fontWeight: '700', fontSize: 11 }}>{status.label}</Text>
                      </View>
                    </View>
                    {detail.items.length > 0 ? (
                      <View style={{ marginBottom: 4 }}>
                        {detail.items.map((item) => (
                          <Text
                            key={`${detail.studentId}-${item.itemKey}`}
                            style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}
                          >
                            <Text style={{ color: '#475569', fontWeight: '700' }}>{item.componentName}</Text>
                            {' • '}
                            {formatCurrency(item.amount)}
                            {item.notes ? ` • ${item.notes}` : ''}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {detail.creditAutoApply.appliedAmount > 0 ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#bae6fd',
                          backgroundColor: '#f0f9ff',
                          borderRadius: 8,
                          padding: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ color: '#075985', fontSize: 12 }}>
                          Auto-apply saldo kredit {formatCurrency(detail.creditAutoApply.appliedAmount)} dari saldo{' '}
                          {formatCurrency(detail.creditAutoApply.availableBalance)}.
                        </Text>
                        <Text style={{ color: '#0c4a6e', fontSize: 12, marginTop: 2, fontWeight: '700' }}>
                          Sisa tagihan setelah apply {formatCurrency(detail.projectedBalanceAmount)}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={{ color: '#6d28d9', fontSize: 12, marginBottom: 4 }}>
                      Skema cicilan {detail.installmentPlan.count} termin • interval {detail.installmentPlan.intervalDays} hari
                    </Text>
                    {detail.installmentPlan.installments.map((installment) => (
                      <Text
                        key={`${detail.studentId}-installment-${installment.sequence}`}
                        style={{ color: '#5b21b6', fontSize: 11, marginBottom: 2 }}
                      >
                        Termin {installment.sequence} • {formatCurrency(installment.amount)} • jatuh tempo {formatDate(installment.dueDate || '')}
                      </Text>
                    ))}
                    {detail.reason ? (
                      <Text style={{ color: '#b45309', fontSize: 12, marginBottom: 4 }}>{detail.reason}</Text>
                    ) : null}
                    <Text style={{ color: '#0f172a', fontWeight: '700' }}>
                      {detail.totalAmount > 0 ? formatCurrency(detail.totalAmount) : '-'}
                    </Text>
                    <Text style={{ color: '#6d28d9', fontSize: 12, marginTop: 2 }}>
                      Akhir: {detail.projectedBalanceAmount > 0 ? formatCurrency(detail.projectedBalanceAmount) : 'Lunas'}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Daftar Tagihan</Text>
          <TextInput
            value={invoiceSearch}
            onChangeText={setInvoiceSearch}
            placeholder="Cari invoice / nama siswa"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setInvoiceGradeLevelFilter('')}
                style={{
                  borderWidth: 1,
                  borderColor: invoiceGradeLevelFilter === '' ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: invoiceGradeLevelFilter === '' ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: invoiceGradeLevelFilter === '' ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua kelas
                </Text>
              </Pressable>
              {classLevelOptions.map((level) => {
                const active = invoiceGradeLevelFilter === level;
                return (
                  <Pressable
                    key={`filter-${level}`}
                    onPress={() => setInvoiceGradeLevelFilter(level)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: active ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {getClassLevelLabel(level)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {STATUS_OPTIONS.map((statusOption) => {
                const active = invoiceStatus === statusOption.value;
                return (
                  <Pressable
                    key={statusOption.label}
                    onPress={() => setInvoiceStatus(statusOption.value)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: active ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      {statusOption.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {invoices.map((invoice) => {
            const status = getStatusBadge(invoice.status);
            return (
              <View
                key={invoice.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 8,
                  backgroundColor: '#fff',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700' }}>{invoice.invoiceNo}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      {invoice.student.name} • {invoice.student.studentClass?.name || '-'}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: status.border,
                      backgroundColor: status.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ color: status.text, fontWeight: '700', fontSize: 11 }}>{status.label}</Text>
                  </View>
                </View>

                <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
                  Periode: {invoice.periodKey} • {invoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
                  Jatuh tempo: {formatDate(invoice.dueDate)}
                </Text>
                <Text style={{ color: '#6d28d9', fontSize: 12, marginBottom: 2 }}>
                  {invoice.installmentSummary?.totalCount ?? (invoice.installments || []).length} termin •{' '}
                  {invoice.installmentSummary?.paidCount ?? (invoice.installments || []).filter((installment) => installment.status === 'PAID').length} lunas
                </Text>
                {invoice.installmentSummary?.nextInstallment ? (
                  <Text style={{ color: '#6d28d9', fontSize: 12, marginBottom: 2 }}>
                    Termin berikutnya {invoice.installmentSummary.nextInstallment.sequence} • jatuh tempo{' '}
                    {formatDate(invoice.installmentSummary.nextInstallment.dueDate || '')}
                  </Text>
                ) : null}
                {(invoice.installmentSummary?.overdueCount || 0) > 0 ? (
                  <Text style={{ color: '#b91c1c', fontSize: 12, marginBottom: 2 }}>
                    {invoice.installmentSummary?.overdueCount || 0} termin overdue • outstanding{' '}
                    {formatCurrency(invoice.installmentSummary?.overdueAmount || 0)}
                  </Text>
                ) : null}
                {invoice.lateFeeSummary?.configured ? (
                  <Text style={{ color: '#92400e', fontSize: 12, marginBottom: 2 }}>
                    Potensi denda {formatCurrency(invoice.lateFeeSummary.calculatedAmount)} • pending{' '}
                    {formatCurrency(invoice.lateFeeSummary.pendingAmount)}
                  </Text>
                ) : null}
                {invoice.payments.some((payment) => payment.source === 'CREDIT_BALANCE') ? (
                  <Text style={{ color: '#0369a1', fontSize: 12, marginBottom: 2 }}>
                    Auto-apply kredit{' '}
                    {formatCurrency(
                      invoice.payments
                        .filter((payment) => payment.source === 'CREDIT_BALANCE')
                        .reduce((sum, payment) => sum + Number(payment.allocatedAmount || payment.amount || 0), 0),
                    )}
                  </Text>
                ) : null}
                {Number(invoice.writtenOffAmount || 0) > 0 ? (
                  <Text style={{ color: '#6d28d9', fontSize: 12, marginBottom: 2 }}>
                    Write-off diterapkan {formatCurrency(invoice.writtenOffAmount)}
                  </Text>
                ) : null}
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                  Sisa: {formatCurrency(invoice.balanceAmount)}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {invoice.lateFeeSummary?.hasPending ? (
                    <Pressable
                      onPress={() => applyLateFeesMutation.mutate(invoice)}
                      disabled={applyLateFeesMutation.isPending}
                      style={{
                        flex: 1,
                        backgroundColor: applyLateFeesMutation.isPending ? '#fcd34d' : '#d97706',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {applyLateFeesMutation.isPending ? 'Menerapkan...' : 'Terapkan Denda'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => openWriteOffModal(invoice)}
                    disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED' || createWriteOffMutation.isPending}
                    style={{
                      flex: 1,
                      backgroundColor:
                        invoice.status === 'PAID' || invoice.status === 'CANCELLED' || createWriteOffMutation.isPending
                          ? '#ddd6fe'
                          : '#7c3aed',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Ajukan Write-Off</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => startPaying(invoice)}
                    disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED'}
                    style={{
                      flex: 1,
                      backgroundColor:
                        invoice.status === 'PAID' || invoice.status === 'CANCELLED' ? '#cbd5e1' : '#059669',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Catat Pembayaran</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Write-Off Piutang</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
              Pending Kepala TU {writeOffSummary?.pendingHeadTuCount || 0} • pending Kepala Sekolah {writeOffSummary?.pendingPrincipalCount || 0} • siap apply {writeOffSummary?.approvedCount || 0}
            </Text>
            {writeOffsQuery.isLoading ? (
              <Text style={{ color: '#64748b' }}>Memuat pengajuan write-off...</Text>
            ) : writeOffRequests.length === 0 ? (
              <Text style={{ color: '#64748b' }}>Belum ada pengajuan write-off.</Text>
            ) : (
              writeOffRequests.slice(0, 8).map((request) => {
                const badge = getWriteOffStatusBadge(request.status);
                return (
                  <View key={request.id} style={{ borderTopWidth: 1, borderTopColor: '#eef2ff', paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{request.requestNo}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {request.student?.name || '-'} • {request.invoice?.invoiceNo || '-'}
                        </Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{request.reason}</Text>
                        <Text style={{ color: '#5b21b6', fontSize: 11, marginTop: 2 }}>
                          Request {formatCurrency(request.requestedAmount)} • approved {formatCurrency(request.approvedAmount || 0)} • applied {formatCurrency(request.appliedAmount || 0)}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                    </View>
                    {request.status === 'APPROVED' ? (
                      <Pressable
                        onPress={() => applyWriteOffMutation.mutate(request)}
                        disabled={applyWriteOffMutation.isPending}
                        style={{
                          marginTop: 8,
                          backgroundColor: applyWriteOffMutation.isPending ? '#a7f3d0' : '#059669',
                          borderRadius: 8,
                          paddingVertical: 9,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          {applyWriteOffMutation.isPending ? 'Menerapkan...' : 'Terapkan Write-Off'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Reversal Pembayaran</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
              Pending Kepala TU {paymentReversalSummary?.pendingHeadTuCount || 0} • pending Kepala Sekolah {paymentReversalSummary?.pendingPrincipalCount || 0} • siap apply {paymentReversalSummary?.approvedCount || 0}
            </Text>
            {paymentReversalsQuery.isLoading ? (
              <Text style={{ color: '#64748b' }}>Memuat pengajuan reversal pembayaran...</Text>
            ) : paymentReversalRequests.length === 0 ? (
              <Text style={{ color: '#64748b' }}>Belum ada pengajuan reversal pembayaran.</Text>
            ) : (
              paymentReversalRequests.slice(0, 8).map((request) => {
                const badge = getPaymentReversalStatusBadge(request.status);
                return (
                  <View key={request.id} style={{ borderTopWidth: 1, borderTopColor: '#eef2ff', paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{request.requestNo}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {request.student?.name || '-'} • {request.payment?.paymentNo || '-'}
                        </Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{request.reason}</Text>
                        <Text style={{ color: '#047857', fontSize: 11, marginTop: 2 }}>
                          Request {formatCurrency(request.requestedAmount)} • approved {formatCurrency(request.approvedAmount || 0)} • applied {formatCurrency(request.appliedAmount || 0)}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                    </View>
                    {request.status === 'APPROVED' ? (
                      <Pressable
                        onPress={() => applyPaymentReversalMutation.mutate(request)}
                        disabled={applyPaymentReversalMutation.isPending}
                        style={{
                          marginTop: 8,
                          backgroundColor: applyPaymentReversalMutation.isPending ? '#a7f3d0' : '#059669',
                          borderRadius: 8,
                          paddingVertical: 9,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          {applyPaymentReversalMutation.isPending ? 'Menerapkan...' : 'Terapkan Reversal'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          {invoices.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 10, padding: 14 }}>
              <Text style={{ color: '#64748b', textAlign: 'center' }}>Belum ada tagihan.</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal visible={isComponentModalOpen} animationType="fade" transparent onRequestClose={closeComponentModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>
                  {editingComponentId ? 'Edit Master Komponen' : 'Tambah Master Komponen'}
                </Text>
                <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                  Setelah disimpan, hasilnya langsung muncul di daftar komponen.
                </Text>
              </View>
              <Pressable onPress={closeComponentModal} style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, padding: 8 }}>
                <Feather name="x" size={16} color="#475569" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 14 }}>
              <TextInput
                value={componentCode}
                onChangeText={setComponentCode}
                placeholder="Kode komponen"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={componentName}
                onChangeText={setComponentName}
                placeholder="Nama komponen"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={componentDescription}
                onChangeText={setComponentDescription}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 72, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />

              <ScrollView horizontal style={{ marginBottom: 8 }} showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {PERIODICITY_OPTIONS.map((option) => {
                    const active = componentPeriodicity === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setComponentPeriodicity(option.value)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: '#f8fafc',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Pressable
                  onPress={() => setComponentLateFeeEnabled((current) => !current)}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700', flex: 1, paddingRight: 8 }}>
                    Aktifkan denda keterlambatan
                  </Text>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: componentLateFeeEnabled ? '#f59e0b' : '#cbd5e1',
                      backgroundColor: componentLateFeeEnabled ? '#fef3c7' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: componentLateFeeEnabled ? '#92400e' : '#64748b', fontWeight: '700', fontSize: 12 }}>
                      {componentLateFeeEnabled ? 'Aktif' : 'Off'}
                    </Text>
                  </View>
                </Pressable>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {LATE_FEE_MODE_OPTIONS.map((option) => {
                      const active = componentLateFeeMode === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setComponentLateFeeMode(option.value)}
                          disabled={!componentLateFeeEnabled}
                          style={{
                            borderWidth: 1,
                            borderColor: active ? '#d97706' : '#fde68a',
                            backgroundColor: active ? '#fff7ed' : '#fff',
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            opacity: componentLateFeeEnabled ? 1 : 0.5,
                          }}
                        >
                          <Text style={{ color: active ? '#9a3412' : '#92400e', fontWeight: '700', fontSize: 12 }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                <TextInput
                  keyboardType="numeric"
                  value={componentLateFeeAmount}
                  onChangeText={setComponentLateFeeAmount}
                  editable={componentLateFeeEnabled}
                  placeholder="Nominal denda"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: componentLateFeeEnabled ? '#fff' : '#f8fafc' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={componentLateFeeGraceDays}
                  onChangeText={setComponentLateFeeGraceDays}
                  editable={componentLateFeeEnabled}
                  placeholder="Grace period (hari)"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: componentLateFeeEnabled ? '#fff' : '#f8fafc' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={componentLateFeeCapAmount}
                  onChangeText={setComponentLateFeeCapAmount}
                  editable={componentLateFeeEnabled}
                  placeholder="Maksimum denda per termin (opsional)"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, color: '#0f172a', backgroundColor: componentLateFeeEnabled ? '#fff' : '#f8fafc' }}
                />
              </View>
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={closeComponentModal}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  onPress={handleSaveComponent}
                  disabled={saveComponentMutation.isPending}
                  style={{
                    backgroundColor: saveComponentMutation.isPending ? '#93c5fd' : '#2563eb',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveComponentMutation.isPending
                      ? 'Menyimpan...'
                      : editingComponentId
                        ? 'Simpan Perubahan'
                        : 'Tambah Komponen'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isTariffModalOpen} animationType="fade" transparent onRequestClose={closeTariffModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>
                  {editingTariffId ? 'Edit Rule Tarif' : 'Tambah Rule Tarif'}
                </Text>
                <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                  Level kelas diambil dari master kelas admin tanpa rombel.
                </Text>
              </View>
              <Pressable onPress={closeTariffModal} style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, padding: 8 }}>
                <Feather name="x" size={16} color="#475569" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 14 }}>
              <Text style={{ color: '#475569', marginBottom: 4 }}>Komponen</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {components.map((component) => {
                    const active = tariffComponentId === component.id;
                    return (
                      <Pressable
                        key={component.id}
                        onPress={() => setTariffComponentId(component.id)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {component.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={{ color: '#475569', marginBottom: 4 }}>Tahun ajaran (opsional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => setTariffAcademicYearId(null)}
                    style={{
                      borderWidth: 1,
                      borderColor: tariffAcademicYearId === null ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: tariffAcademicYearId === null ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: tariffAcademicYearId === null ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      Semua tahun
                    </Text>
                  </Pressable>
                  {academicYears.map((year) => {
                    const active = tariffAcademicYearId === year.id;
                    return (
                      <Pressable
                        key={year.id}
                        onPress={() => setTariffAcademicYearId(year.id)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {year.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={{ color: '#475569', marginBottom: 4 }}>Kelas (opsional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => setTariffGradeLevel('')}
                    style={{
                      borderWidth: 1,
                      borderColor: tariffGradeLevel === '' ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: tariffGradeLevel === '' ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: tariffGradeLevel === '' ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      Semua kelas
                    </Text>
                  </Pressable>
                  {classLevelOptions.map((level) => {
                    const active = tariffGradeLevel === level;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => setTariffGradeLevel(level)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {getClassLevelLabel(level)}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {classLevelsQuery.isLoading && classLevelOptions.length === 0 ? (
                    <View style={{ borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fafc', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12 }}>Memuat level kelas...</Text>
                    </View>
                  ) : null}
                  {!classLevelsQuery.isLoading && classLevelOptions.length === 0 ? (
                    <View style={{ borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12 }}>Belum ada level kelas admin</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              <Text style={{ color: '#475569', marginBottom: 4 }}>Jurusan (opsional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => setTariffMajorId(null)}
                    style={{
                      borderWidth: 1,
                      borderColor: tariffMajorId === null ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: tariffMajorId === null ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: tariffMajorId === null ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                      Semua jurusan
                    </Text>
                  </Pressable>
                  {majors.map((major) => {
                    const active = tariffMajorId === major.id;
                    return (
                      <Pressable
                        key={major.id}
                        onPress={() => setTariffMajorId(major.id)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {major.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => setTariffSemester('')}
                    style={{
                      borderWidth: 1,
                      borderColor: tariffSemester === '' ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: tariffSemester === '' ? '#e9f1ff' : '#fff',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: tariffSemester === '' ? '#1e3a8a' : '#475569', fontWeight: '700' }}>Semua</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => setTariffSemester('ODD')}
                    style={{
                      borderWidth: 1,
                      borderColor: tariffSemester === 'ODD' ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: tariffSemester === 'ODD' ? '#e9f1ff' : '#fff',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: tariffSemester === 'ODD' ? '#1e3a8a' : '#475569', fontWeight: '700' }}>Ganjil</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => setTariffSemester('EVEN')}
                    style={{
                      borderWidth: 1,
                      borderColor: tariffSemester === 'EVEN' ? '#1d4ed8' : '#dbeafe',
                      backgroundColor: tariffSemester === 'EVEN' ? '#e9f1ff' : '#fff',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: tariffSemester === 'EVEN' ? '#1e3a8a' : '#475569', fontWeight: '700' }}>Genap</Text>
                  </Pressable>
                </View>
              </View>

              <TextInput
                value={tariffEffectiveStart}
                onChangeText={setTariffEffectiveStart}
                placeholder="Efektif mulai (YYYY-MM-DD, opsional)"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={tariffEffectiveEnd}
                onChangeText={setTariffEffectiveEnd}
                placeholder="Efektif sampai (YYYY-MM-DD, opsional)"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                keyboardType="numeric"
                value={tariffAmount}
                onChangeText={setTariffAmount}
                placeholder="Nominal tarif"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={tariffNotes}
                onChangeText={setTariffNotes}
                placeholder="Catatan (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 64, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={closeTariffModal}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  onPress={handleSaveTariff}
                  disabled={saveTariffMutation.isPending}
                  style={{
                    backgroundColor: saveTariffMutation.isPending ? '#6ee7b7' : '#059669',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveTariffMutation.isPending
                      ? 'Menyimpan...'
                      : editingTariffId
                        ? 'Simpan Perubahan'
                        : 'Tambah Tarif'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isReminderPolicyModalOpen} animationType="fade" transparent onRequestClose={closeReminderPolicyModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>
                  Policy Reminder & Eskalasi Finance
                </Text>
                <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                  Worker production memakai policy ini untuk due soon, overdue, warning denda, dan eskalasi.
                </Text>
              </View>
              <Pressable onPress={closeReminderPolicyModal} style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, padding: 8 }}>
                <Feather name="x" size={16} color="#475569" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 14 }}>
              <Pressable
                onPress={() => setReminderPolicyIsActive((current) => !current)}
                style={{
                  borderWidth: 1,
                  borderColor: reminderPolicyIsActive ? '#86efac' : '#fca5a5',
                  backgroundColor: reminderPolicyIsActive ? '#f0fdf4' : '#fff1f2',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>
                  Worker reminder otomatis: {reminderPolicyIsActive ? 'Aktif' : 'Nonaktif'}
                </Text>
                <Text style={{ color: '#475569', marginTop: 4, fontSize: 12 }}>
                  Saat nonaktif, worker background berhenti mengirim reminder otomatis. Trigger manual tetap bisa dipakai bendahara.
                </Text>
              </Pressable>

              <View style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 8 }}>Reminder siswa & orang tua</Text>
                <TextInput
                  keyboardType="numeric"
                  value={reminderDueSoonDays}
                  onChangeText={setReminderDueSoonDays}
                  placeholder="Due soon (hari)"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={reminderDueSoonRepeatIntervalDays}
                  onChangeText={setReminderDueSoonRepeatIntervalDays}
                  placeholder="Ulang due soon tiap berapa hari"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={reminderOverdueRepeatIntervalDays}
                  onChangeText={setReminderOverdueRepeatIntervalDays}
                  placeholder="Ulang overdue tiap berapa hari"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={reminderLateFeeWarningRepeatIntervalDays}
                  onChangeText={setReminderLateFeeWarningRepeatIntervalDays}
                  editable={reminderLateFeeWarningEnabled}
                  placeholder="Ulang warning denda tiap berapa hari"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: reminderLateFeeWarningEnabled ? '#fff' : '#f8fafc' }}
                />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {[
                    {
                      key: 'student',
                      active: reminderSendStudent,
                      label: 'Kirim ke siswa',
                      onPress: () => setReminderSendStudent((current) => !current),
                    },
                    {
                      key: 'parent',
                      active: reminderSendParent,
                      label: 'Kirim ke orang tua',
                      onPress: () => setReminderSendParent((current) => !current),
                    },
                    {
                      key: 'late-fee',
                      active: reminderLateFeeWarningEnabled,
                      label: 'Aktifkan warning denda',
                      onPress: () => setReminderLateFeeWarningEnabled((current) => !current),
                    },
                  ].map((item) => (
                    <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, paddingBottom: 8 }}>
                      <Pressable
                        onPress={item.onPress}
                        style={{
                          borderWidth: 1,
                          borderColor: item.active ? '#1d4ed8' : '#cbd5e1',
                          backgroundColor: item.active ? '#dbeafe' : '#fff',
                          borderRadius: 10,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: item.active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {item.label}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#5b21b6', fontWeight: '700', marginBottom: 8 }}>Eskalasi internal</Text>
                <TextInput
                  keyboardType="numeric"
                  value={reminderEscalationStartDays}
                  onChangeText={setReminderEscalationStartDays}
                  editable={reminderEscalationEnabled}
                  placeholder="Mulai eskalasi setelah berapa hari overdue"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: reminderEscalationEnabled ? '#fff' : '#f8fafc' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={reminderEscalationRepeatIntervalDays}
                  onChangeText={setReminderEscalationRepeatIntervalDays}
                  editable={reminderEscalationEnabled}
                  placeholder="Ulang eskalasi tiap berapa hari"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: reminderEscalationEnabled ? '#fff' : '#f8fafc' }}
                />
                <TextInput
                  keyboardType="numeric"
                  value={reminderEscalationMinOutstandingAmount}
                  onChangeText={setReminderEscalationMinOutstandingAmount}
                  editable={reminderEscalationEnabled}
                  placeholder="Minimum nominal outstanding untuk eskalasi"
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: reminderEscalationEnabled ? '#fff' : '#f8fafc' }}
                />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {[
                    {
                      key: 'escalation',
                      active: reminderEscalationEnabled,
                      label: 'Aktifkan eskalasi',
                      onPress: () => setReminderEscalationEnabled((current) => !current),
                    },
                    {
                      key: 'finance',
                      active: reminderEscalateToFinanceStaff,
                      label: 'Tujuan: staff keuangan',
                      onPress: () => setReminderEscalateToFinanceStaff((current) => !current),
                    },
                    {
                      key: 'head-tu',
                      active: reminderEscalateToHeadTu,
                      label: 'Tujuan: Kepala TU',
                      onPress: () => setReminderEscalateToHeadTu((current) => !current),
                    },
                    {
                      key: 'principal',
                      active: reminderEscalateToPrincipal,
                      label: 'Tujuan: Kepala Sekolah',
                      onPress: () => setReminderEscalateToPrincipal((current) => !current),
                    },
                  ].map((item) => (
                    <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, paddingBottom: 8 }}>
                      <Pressable
                        onPress={item.onPress}
                        style={{
                          borderWidth: 1,
                          borderColor: item.active ? '#7c3aed' : '#cbd5e1',
                          backgroundColor: item.active ? '#ede9fe' : '#fff',
                          borderRadius: 10,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: item.active ? '#5b21b6' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {item.label}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>

              <TextInput
                value={reminderPolicyNotes}
                onChangeText={setReminderPolicyNotes}
                placeholder="Catatan policy (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 72, textAlignVertical: 'top', color: '#0f172a', backgroundColor: '#fff' }}
              />
              <Text style={{ color: '#64748b', marginTop: 8, fontSize: 12 }}>
                Update terakhir: {reminderPolicy?.updatedAt ? formatDate(reminderPolicy.updatedAt) : '-'}
              </Text>
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={closeReminderPolicyModal}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  onPress={handleSaveReminderPolicy}
                  disabled={saveReminderPolicyMutation.isPending}
                  style={{
                    backgroundColor: saveReminderPolicyMutation.isPending ? '#7dd3fc' : '#0284c7',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveReminderPolicyMutation.isPending ? 'Menyimpan...' : 'Simpan Policy'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedInvoice)} animationType="fade" transparent onRequestClose={() => setSelectedInvoice(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>Kelola Tagihan</Text>
              <Text style={{ color: '#64748b', marginTop: 2 }}>
                {selectedInvoice?.invoiceNo || '-'} • Sisa {formatCurrency(selectedInvoice?.balanceAmount || 0)}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 14 }}>
              {Number(selectedInvoice?.writtenOffAmount || 0) > 0 ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd6fe',
                    backgroundColor: '#f5f3ff',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#5b21b6', fontSize: 12 }}>
                    Write-off yang sudah diterapkan:{' '}
                    <Text style={{ fontWeight: '700' }}>{formatCurrency(selectedInvoice?.writtenOffAmount || 0)}</Text>
                  </Text>
                </View>
              ) : null}
              {selectedInvoiceCreditAppliedAmount > 0 ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#bae6fd',
                    backgroundColor: '#f0f9ff',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#075985', fontSize: 12 }}>
                    Saldo kredit yang sudah terpakai: <Text style={{ fontWeight: '700' }}>{formatCurrency(selectedInvoiceCreditAppliedAmount)}</Text>
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#bbf7d0',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#166534', fontSize: 12, fontWeight: '700' }}>Riwayat pembayaran & reversal</Text>
                <Text style={{ color: '#15803d', fontSize: 11, marginTop: 2 }}>
                  {(selectedInvoice?.payments || []).length} pembayaran tercatat • {selectedInvoicePaymentReversals.length} pengajuan reversal.
                </Text>
                {(selectedInvoice?.payments || []).length === 0 ? (
                  <Text style={{ color: '#15803d', fontSize: 11, marginTop: 8 }}>Belum ada pembayaran pada invoice ini.</Text>
                ) : (
                  (selectedInvoice?.payments || []).map((payment) => {
                    const paymentRequests = selectedInvoicePaymentReversals.filter((request) => request.paymentId === payment.id);
                    return (
                      <View
                        key={`selected-payment-${payment.id}`}
                        style={{
                          borderWidth: 1,
                          borderColor: '#bbf7d0',
                          backgroundColor: '#fff',
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 8,
                          marginTop: 8,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#166534', fontSize: 12, fontWeight: '700' }}>
                              {payment.paymentNo} • {formatCurrency(payment.amount)}
                            </Text>
                            <Text style={{ color: '#15803d', fontSize: 11, marginTop: 2 }}>
                              {formatDate(payment.paidAt)} • {getPaymentMethodLabel(payment.method)} • sumber {payment.source === 'CREDIT_BALANCE' ? 'Saldo Kredit' : 'Pembayaran Langsung'}
                            </Text>
                            <Text style={{ color: '#15803d', fontSize: 11, marginTop: 2 }}>
                              Dialokasikan {formatCurrency(payment.allocatedAmount || 0)} • saldo kredit {formatCurrency(payment.creditedAmount || 0)} • sudah direversal {formatCurrency(payment.reversedAmount || 0)}
                            </Text>
                            <Text style={{ color: '#15803d', fontSize: 11, marginTop: 2 }}>
                              Sisa reversible {formatCurrency(payment.remainingReversibleAmount || 0)}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => openReversalModal(payment)}
                            disabled={!payment.canRequestReversal || createPaymentReversalMutation.isPending || payment.source !== 'DIRECT'}
                            style={{
                              backgroundColor:
                                !payment.canRequestReversal || createPaymentReversalMutation.isPending || payment.source !== 'DIRECT'
                                  ? '#bbf7d0'
                                  : '#16a34a',
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 9,
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Ajukan</Text>
                          </Pressable>
                        </View>
                        {paymentRequests.map((request) => {
                          const badge = getPaymentReversalStatusBadge(request.status);
                          return (
                            <View
                              key={`selected-reversal-${request.id}`}
                              style={{
                                borderWidth: 1,
                                borderColor: '#bbf7d0',
                                backgroundColor: '#f0fdf4',
                                borderRadius: 8,
                                paddingHorizontal: 8,
                                paddingVertical: 8,
                                marginTop: 8,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: '#166534', fontSize: 12, fontWeight: '700' }}>{request.requestNo}</Text>
                                  <Text style={{ color: '#15803d', fontSize: 11, marginTop: 2 }}>{request.reason}</Text>
                                  <Text style={{ color: '#15803d', fontSize: 11, marginTop: 2 }}>
                                    Request {formatCurrency(request.requestedAmount)} • approved {formatCurrency(request.approvedAmount || 0)} • applied {formatCurrency(request.appliedAmount || 0)}
                                  </Text>
                                </View>
                                <View
                                  style={{
                                    borderWidth: 1,
                                    borderColor: badge.border,
                                    backgroundColor: badge.bg,
                                    borderRadius: 999,
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                  }}
                                >
                                  <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                                </View>
                              </View>
                              {request.status === 'APPROVED' ? (
                                <Pressable
                                  onPress={() => applyPaymentReversalMutation.mutate(request)}
                                  disabled={applyPaymentReversalMutation.isPending}
                                  style={{
                                    marginTop: 8,
                                    backgroundColor: applyPaymentReversalMutation.isPending ? '#86efac' : '#16a34a',
                                    borderRadius: 8,
                                    paddingVertical: 9,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                                    {applyPaymentReversalMutation.isPending ? 'Menerapkan...' : 'Terapkan Reversal'}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd6fe',
                  backgroundColor: '#f5f3ff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#5b21b6', fontSize: 12, fontWeight: '700' }}>Workflow write-off</Text>
                    <Text style={{ color: '#6d28d9', fontSize: 11, marginTop: 2 }}>
                      {(selectedInvoice?.writeOffRequests || []).length} pengajuan tercatat untuk invoice ini.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => selectedInvoice && openWriteOffModal(selectedInvoice)}
                    disabled={createWriteOffMutation.isPending || selectedInvoice?.status === 'PAID' || selectedInvoice?.status === 'CANCELLED'}
                    style={{
                      backgroundColor:
                        createWriteOffMutation.isPending || selectedInvoice?.status === 'PAID' || selectedInvoice?.status === 'CANCELLED'
                          ? '#ddd6fe'
                          : '#7c3aed',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Ajukan</Text>
                  </Pressable>
                </View>
                {(selectedInvoice?.writeOffRequests || []).slice(0, 3).map((request) => {
                  const badge = getWriteOffStatusBadge(request.status);
                  return (
                    <View
                      key={`selected-writeoff-${request.id}`}
                      style={{
                        borderWidth: 1,
                        borderColor: '#c4b5fd',
                        backgroundColor: '#fff',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 8,
                        marginTop: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#5b21b6', fontSize: 12, fontWeight: '700' }}>{request.requestNo}</Text>
                          <Text style={{ color: '#6d28d9', fontSize: 11, marginTop: 2 }}>{request.reason}</Text>
                          <Text style={{ color: '#6d28d9', fontSize: 11, marginTop: 2 }}>
                            Request {formatCurrency(request.requestedAmount)} • approved {formatCurrency(request.approvedAmount || 0)} • applied {formatCurrency(request.appliedAmount || 0)}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: badge.border,
                            backgroundColor: badge.bg,
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                        </View>
                      </View>
                      {request.status === 'APPROVED' ? (
                        <Pressable
                          onPress={() => applyWriteOffMutation.mutate(request)}
                          disabled={applyWriteOffMutation.isPending}
                          style={{
                            marginTop: 8,
                            backgroundColor: applyWriteOffMutation.isPending ? '#c4b5fd' : '#7c3aed',
                            borderRadius: 8,
                            paddingVertical: 9,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>
                            {applyWriteOffMutation.isPending ? 'Menerapkan...' : 'Terapkan Write-Off'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {selectedInvoice?.lateFeeSummary?.configured ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fcd34d',
                    backgroundColor: '#fffbeb',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#92400e', fontSize: 12, fontWeight: '700' }}>
                    Potensi denda {formatCurrency(selectedInvoice.lateFeeSummary.calculatedAmount)} • pending{' '}
                    {formatCurrency(selectedInvoice.lateFeeSummary.pendingAmount)}
                  </Text>
                  {(selectedInvoice.lateFeeSummary.breakdown || []).map((item) => (
                    <Text key={`late-fee-${item.componentCode}`} style={{ color: '#92400e', fontSize: 11, marginTop: 4 }}>
                      {item.componentName} • {getLateFeeModeLabel(item.mode)} • grace {item.graceDays} hari • pending{' '}
                      {formatCurrency(item.pendingAmount)}
                    </Text>
                  ))}
                  {selectedInvoice.lateFeeSummary.hasPending ? (
                    <Pressable
                      onPress={() => applyLateFeesMutation.mutate(selectedInvoice)}
                      disabled={applyLateFeesMutation.isPending}
                      style={{
                        backgroundColor: applyLateFeesMutation.isPending ? '#fcd34d' : '#d97706',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        marginTop: 8,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {applyLateFeesMutation.isPending ? 'Menerapkan denda...' : 'Terapkan Denda Keterlambatan'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {selectedInvoiceInstallments.length > 0 ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd6fe',
                    backgroundColor: '#f5f3ff',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#5b21b6', fontSize: 12, fontWeight: '700' }}>
                    Skema cicilan {selectedInvoiceInstallments.length} termin
                    {selectedInvoiceNextInstallment
                      ? ` • Termin berikutnya ${selectedInvoiceNextInstallment.sequence} (${formatCurrency(selectedInvoiceNextInstallment.balanceAmount)})`
                      : ' • Semua termin sudah lunas'}
                  </Text>
                  {(selectedInvoice?.installmentSummary?.overdueCount || 0) > 0 ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fff1f2',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        marginTop: 8,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontSize: 11 }}>
                        {selectedInvoice?.installmentSummary?.overdueCount || 0} termin overdue • outstanding{' '}
                        {formatCurrency(selectedInvoice?.installmentSummary?.overdueAmount || 0)}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#c4b5fd',
                      backgroundColor: '#ffffff',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ color: '#6d28d9', fontSize: 11 }}>
                      {selectedInvoiceCanEditAmounts
                        ? 'Invoice belum menerima pembayaran. Nominal dan jatuh tempo termin bisa diubah selama total seluruh termin tetap sama.'
                        : 'Invoice sudah menerima pembayaran. Nominal termin dikunci, tetapi jatuh tempo termin yang masih aktif masih bisa digeser.'}
                    </Text>
                  </View>
                  {selectedInvoiceInstallments.map((installment, index) => (
                    <View
                      key={`${selectedInvoice?.id || 0}-${installment.sequence}`}
                      style={{
                        borderWidth: 1,
                        borderColor: '#c4b5fd',
                        backgroundColor: '#fff',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 8,
                        marginTop: 8,
                      }}
                    >
                      <Text style={{ color: '#5b21b6', fontSize: 12, fontWeight: '700' }}>
                        Termin {installment.sequence} • sisa {formatCurrency(installment.balanceAmount)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TextInput
                          keyboardType="numeric"
                          value={installmentDrafts[index]?.amount || ''}
                          onChangeText={(value) => handleInstallmentDraftChange(installment.sequence, 'amount', value)}
                          editable={selectedInvoiceCanEditAmounts}
                          placeholder="Nominal"
                          placeholderTextColor="#a78bfa"
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: '#c4b5fd',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            color: selectedInvoiceCanEditAmounts ? '#0f172a' : '#64748b',
                            backgroundColor: selectedInvoiceCanEditAmounts ? '#fff' : '#f8fafc',
                          }}
                        />
                        <TextInput
                          value={installmentDrafts[index]?.dueDate || ''}
                          onChangeText={(value) => handleInstallmentDraftChange(installment.sequence, 'dueDate', value)}
                          editable={selectedInvoiceCanEditAmounts || installment.balanceAmount > 0}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#a78bfa"
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: '#c4b5fd',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            color:
                              selectedInvoiceCanEditAmounts || installment.balanceAmount > 0
                                ? '#0f172a'
                                : '#64748b',
                            backgroundColor:
                              selectedInvoiceCanEditAmounts || installment.balanceAmount > 0
                                ? '#fff'
                                : '#f8fafc',
                          }}
                        />
                      </View>
                      <Text style={{ color: '#6d28d9', fontSize: 11, marginTop: 6 }}>
                        Jatuh tempo saat ini: {formatDate(installment.dueDate || '')} • status {installment.status}
                        {installment.isOverdue ? ` • overdue ${installment.daysPastDue} hari` : ''}
                      </Text>
                    </View>
                  ))}
                  <TextInput
                    value={installmentScheduleNote}
                    onChangeText={setInstallmentScheduleNote}
                    placeholder="Catatan perubahan jadwal cicilan (opsional)"
                    placeholderTextColor="#a78bfa"
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: '#c4b5fd',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      marginTop: 10,
                      color: '#0f172a',
                      minHeight: 72,
                      textAlignVertical: 'top',
                      backgroundColor: '#fff',
                    }}
                  />
                  <Pressable
                    onPress={handleSaveInstallments}
                    disabled={updateInstallmentsMutation.isPending}
                    style={{
                      backgroundColor: updateInstallmentsMutation.isPending ? '#c4b5fd' : '#7c3aed',
                      borderRadius: 8,
                      paddingVertical: 10,
                      alignItems: 'center',
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {updateInstallmentsMutation.isPending ? 'Menyimpan jadwal...' : 'Simpan Jadwal Cicilan'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <TextInput
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder="Nominal pembayaran"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#bbf7d0',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#166534', fontSize: 12 }}>
                  Dialokasikan ke invoice: <Text style={{ fontWeight: '700' }}>{formatCurrency(paymentAllocatedAmount)}</Text>
                </Text>
                <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                  Masuk saldo kredit: <Text style={{ fontWeight: '700' }}>{formatCurrency(paymentCreditedAmount)}</Text>
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {PAYMENT_METHOD_OPTIONS.map((methodOption) => {
                    const active = paymentMethod === methodOption.value;
                    return (
                      <Pressable
                        key={methodOption.value}
                        onPress={() => setPaymentMethod(methodOption.value)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {methodOption.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {paymentMethod !== 'CASH' ? (
                <>
                  <Text style={{ color: '#475569', marginBottom: 4 }}>Rekening bank penerimaan</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {activeBankAccounts.map((account) => {
                        const active = paymentBankAccountId === account.id;
                        return (
                          <Pressable
                            key={`payment-bank-${account.id}`}
                            onPress={() => setPaymentBankAccountId(account.id)}
                            style={{
                              borderWidth: 1,
                              borderColor: active ? '#1d4ed8' : '#bfdbfe',
                              backgroundColor: active ? '#e9f1ff' : '#fff',
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                              {account.bankName} • {account.accountNumber}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              ) : null}

              <TextInput
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Referensi (opsional)"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="Catatan (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 72, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={() => setSelectedInvoice(null)}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  disabled={payInvoiceMutation.isPending || Number(paymentAmount) <= 0}
                  onPress={handleSavePayment}
                  style={{
                    backgroundColor: payInvoiceMutation.isPending || Number(paymentAmount) <= 0 ? '#93c5fd' : '#2563eb',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {payInvoiceMutation.isPending ? 'Memproses...' : 'Simpan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedCreditBalance)} animationType="fade" transparent onRequestClose={resetRefundForm}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>Refund Saldo Kredit</Text>
              <Text style={{ color: '#64748b', marginTop: 2 }}>
                {selectedCreditBalance?.student.name || '-'} • Saldo {formatCurrency(selectedCreditBalance?.balanceAmount || 0)}
              </Text>
            </View>

            <View style={{ padding: 14 }}>
              <TextInput
                keyboardType="numeric"
                value={refundAmount}
                onChangeText={setRefundAmount}
                placeholder="Nominal refund"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {PAYMENT_METHOD_OPTIONS.map((methodOption) => {
                    const active = refundMethod === methodOption.value;
                    return (
                      <Pressable
                        key={`refund-${methodOption.value}`}
                        onPress={() => setRefundMethod(methodOption.value)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? '#1d4ed8' : '#dbeafe',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                          {methodOption.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {refundMethod !== 'CASH' ? (
                <>
                  <Text style={{ color: '#475569', marginBottom: 4 }}>Rekening bank refund</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {activeBankAccounts.map((account) => {
                        const active = refundBankAccountId === account.id;
                        return (
                          <Pressable
                            key={`refund-bank-${account.id}`}
                            onPress={() => setRefundBankAccountId(account.id)}
                            style={{
                              borderWidth: 1,
                              borderColor: active ? '#1d4ed8' : '#bfdbfe',
                              backgroundColor: active ? '#e9f1ff' : '#fff',
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <Text style={{ color: active ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                              {account.bankName} • {account.accountNumber}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              ) : null}

              <TextInput
                value={refundReference}
                onChangeText={setRefundReference}
                placeholder="Referensi refund (opsional)"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={refundNote}
                onChangeText={setRefundNote}
                placeholder="Catatan refund (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 72, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={resetRefundForm}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  disabled={refundMutation.isPending || Number(refundAmount) <= 0}
                  onPress={handleSaveRefund}
                  style={{
                    backgroundColor: refundMutation.isPending || Number(refundAmount) <= 0 ? '#93c5fd' : '#0284c7',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {refundMutation.isPending ? 'Memproses...' : 'Simpan Refund'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(reversalTargetPayment)} animationType="fade" transparent onRequestClose={resetReversalForm}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>Ajukan Reversal Pembayaran</Text>
              <Text style={{ color: '#64748b', marginTop: 2 }}>
                {reversalTargetPayment?.paymentNo || '-'} • Sisa reversible {formatCurrency(reversalTargetPayment?.remainingReversibleAmount || 0)}
              </Text>
            </View>

            <View style={{ padding: 14 }}>
              <TextInput
                keyboardType="numeric"
                value={reversalAmount}
                onChangeText={setReversalAmount}
                placeholder="Nominal reversal"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={reversalReason}
                onChangeText={setReversalReason}
                placeholder="Alasan pengajuan reversal pembayaran"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 90, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
              <TextInput
                value={reversalNote}
                onChangeText={setReversalNote}
                placeholder="Catatan internal (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 72, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#bbf7d0',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#166534', fontSize: 12 }}>
                  Approval akan berjalan berurutan: Kepala TU, lalu Kepala Sekolah, baru setelah itu bendahara bisa menerapkan reversal ke pembayaran.
                </Text>
              </View>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={resetReversalForm}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  disabled={createPaymentReversalMutation.isPending || Number(reversalAmount) <= 0}
                  onPress={handleSavePaymentReversal}
                  style={{
                    backgroundColor: createPaymentReversalMutation.isPending || Number(reversalAmount) <= 0 ? '#86efac' : '#16a34a',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {createPaymentReversalMutation.isPending ? 'Mengirim...' : 'Kirim Pengajuan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(writeOffTargetInvoice)} animationType="fade" transparent onRequestClose={resetWriteOffForm}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>Ajukan Write-Off</Text>
              <Text style={{ color: '#64748b', marginTop: 2 }}>
                {writeOffTargetInvoice?.invoiceNo || '-'} • Outstanding {formatCurrency(writeOffTargetInvoice?.balanceAmount || 0)}
              </Text>
            </View>

            <View style={{ padding: 14 }}>
              <TextInput
                keyboardType="numeric"
                value={writeOffAmount}
                onChangeText={setWriteOffAmount}
                placeholder="Nominal write-off"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />
              <TextInput
                value={writeOffReason}
                onChangeText={setWriteOffReason}
                placeholder="Alasan pengajuan write-off"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 90, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
              <TextInput
                value={writeOffNote}
                onChangeText={setWriteOffNote}
                placeholder="Catatan internal (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', minHeight: 72, textAlignVertical: 'top', backgroundColor: '#fff' }}
              />
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd6fe',
                  backgroundColor: '#f5f3ff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#5b21b6', fontSize: 12 }}>
                  Approval akan berjalan berurutan: Kepala TU, lalu Kepala Sekolah, baru setelah itu bendahara bisa menerapkan write-off ke invoice.
                </Text>
              </View>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Pressable
                  onPress={resetWriteOffForm}
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Pressable
                  disabled={createWriteOffMutation.isPending || Number(writeOffAmount) <= 0}
                  onPress={handleSaveWriteOff}
                  style={{
                    backgroundColor: createWriteOffMutation.isPending || Number(writeOffAmount) <= 0 ? '#c4b5fd' : '#7c3aed',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {createWriteOffMutation.isPending ? 'Mengirim...' : 'Kirim Pengajuan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
