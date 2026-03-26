import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Download, Loader2, Pencil, Plus, Power, ReceiptText, WalletCards, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { academicYearService, type AcademicYear } from '../../services/academicYear.service';
import {
  type FinanceAdjustmentKind,
  type FinanceAdjustmentRule,
  type FinanceCreditBalanceRow,
  type FinanceCreditTransaction,
  type FinanceRefundRecord,
  staffFinanceService,
  type FinanceComponent,
  type FinanceComponentPeriodicity,
  type FinanceInvoice,
  type FinanceInvoiceStatus,
  type FinancePaymentMethod,
  type FinanceReminderMode,
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
  { value: 'OTHER', label: 'Lainnya' },
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

function describeTariffScope(tariff: FinanceTariffRule) {
  const parts = [
    tariff.class?.name || 'Semua kelas',
    tariff.major?.name ? `Jurusan ${tariff.major.name}` : 'Semua jurusan',
    tariff.gradeLevel ? `Tingkat ${tariff.gradeLevel}` : 'Semua tingkat',
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

function getCreditTransactionLabel(transaction: FinanceCreditTransaction) {
  if (transaction.kind === 'APPLIED_TO_INVOICE') return 'Saldo kredit dipakai ke invoice';
  if (transaction.kind === 'REFUND') return 'Refund saldo kredit';
  return 'Kelebihan bayar masuk saldo kredit';
}

function describeAdjustmentScope(adjustment: FinanceAdjustmentRule) {
  const parts = [
    adjustment.component?.name ? `Komponen ${adjustment.component.name}` : 'Seluruh invoice',
    adjustment.student?.name
      ? `Siswa ${adjustment.student.name}`
      : adjustment.class?.name || 'Semua kelas',
    adjustment.major?.name ? `Jurusan ${adjustment.major.name}` : 'Semua jurusan',
    adjustment.gradeLevel ? `Tingkat ${adjustment.gradeLevel}` : 'Semua tingkat',
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

export const StaffFinancePage = () => {
  const queryClient = useQueryClient();

  const [componentCode, setComponentCode] = useState('');
  const [componentName, setComponentName] = useState('');
  const [componentDescription, setComponentDescription] = useState('');
  const [componentPeriodicity, setComponentPeriodicity] = useState<FinanceComponentPeriodicity>('MONTHLY');
  const [editingComponentId, setEditingComponentId] = useState<number | null>(null);

  const [tariffComponentId, setTariffComponentId] = useState<number | ''>('');
  const [tariffAcademicYearId, setTariffAcademicYearId] = useState<number | ''>('');
  const [tariffClassId, setTariffClassId] = useState<number | ''>('');
  const [tariffMajorId, setTariffMajorId] = useState<number | ''>('');
  const [tariffSemester, setTariffSemester] = useState<SemesterCode | ''>('');
  const [tariffGradeLevel, setTariffGradeLevel] = useState('');
  const [tariffAmount, setTariffAmount] = useState('');
  const [tariffEffectiveStart, setTariffEffectiveStart] = useState('');
  const [tariffEffectiveEnd, setTariffEffectiveEnd] = useState('');
  const [tariffNotes, setTariffNotes] = useState('');
  const [editingTariffId, setEditingTariffId] = useState<number | null>(null);

  const [adjustmentCode, setAdjustmentCode] = useState('');
  const [adjustmentName, setAdjustmentName] = useState('');
  const [adjustmentDescription, setAdjustmentDescription] = useState('');
  const [adjustmentKind, setAdjustmentKind] = useState<FinanceAdjustmentKind>('DISCOUNT');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentComponentId, setAdjustmentComponentId] = useState<number | ''>('');
  const [adjustmentAcademicYearId, setAdjustmentAcademicYearId] = useState<number | ''>('');
  const [adjustmentClassId, setAdjustmentClassId] = useState<number | ''>('');
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
  const [invoiceClassId, setInvoiceClassId] = useState<number | ''>('');
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
  const [invoiceClassFilter, setInvoiceClassFilter] = useState<number | ''>('');
  const [reportYearId, setReportYearId] = useState<number | ''>('');
  const [reportSemester, setReportSemester] = useState<SemesterCode | ''>('');
  const [reportClassId, setReportClassId] = useState<number | ''>('');
  const [reportPeriodFrom, setReportPeriodFrom] = useState('');
  const [reportPeriodTo, setReportPeriodTo] = useState('');
  const [reportAsOfDate, setReportAsOfDate] = useState(getTodayInputDate());
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [reminderDueSoonDays, setReminderDueSoonDays] = useState('3');

  const [selectedInvoice, setSelectedInvoice] = useState<FinanceInvoice | null>(null);
  const [installmentDrafts, setInstallmentDrafts] = useState<
    Array<{ sequence: number; amount: string; dueDate: string }>
  >([]);
  const [installmentScheduleNote, setInstallmentScheduleNote] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [creditSearch, setCreditSearch] = useState('');
  const [selectedCreditBalance, setSelectedCreditBalance] = useState<FinanceCreditBalanceRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<FinancePaymentMethod>('BANK_TRANSFER');
  const [refundReference, setRefundReference] = useState('');
  const [refundNote, setRefundNote] = useState('');

  const yearsQuery = useQuery({
    queryKey: ['staff-finance-academic-years'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const majorsQuery = useQuery({
    queryKey: ['staff-finance-majors'],
    queryFn: () => majorService.list({ page: 1, limit: 300 }),
    staleTime: 5 * 60 * 1000,
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
    queryKey: ['staff-finance-invoices', invoiceSearch, invoiceStatusFilter, invoiceClassFilter],
    queryFn: () =>
      staffFinanceService.listInvoices({
        limit: 100,
        status: invoiceStatusFilter || undefined,
        search: invoiceSearch.trim() || undefined,
        classId: invoiceClassFilter === '' ? undefined : Number(invoiceClassFilter),
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

  const classes = useMemo<Array<{ id: number; name: string; level: string }>>(() => {
    const map = new Map<number, { id: number; name: string; level: string }>();
    students.forEach((student) => {
      if (student.studentClass?.id && student.studentClass?.name) {
        map.set(student.studentClass.id, {
          id: student.studentClass.id,
          name: student.studentClass.name,
          level: student.studentClass.level || '',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const gradeLevels = useMemo(
    () =>
      Array.from(
        new Set(
          classes
            .map((classItem) => classItem.level.trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [classes],
  );

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
      reportClassId || null,
      reportPeriodFrom || null,
      reportPeriodTo || null,
      reportAsOfDate || null,
    ],
    queryFn: () =>
      staffFinanceService.listReports({
        academicYearId: reportYearId === '' ? activeYear?.id : Number(reportYearId),
        semester: reportSemester === '' ? undefined : reportSemester,
        classId: reportClassId === '' ? undefined : Number(reportClassId),
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
  const selectedInvoiceCanEditAmounts = Number(selectedInvoice?.paidAmount || 0) <= 0;
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

  const resetComponentForm = () => {
    setEditingComponentId(null);
    setComponentCode('');
    setComponentName('');
    setComponentDescription('');
    setComponentPeriodicity('MONTHLY');
  };

  const resetTariffForm = () => {
    setEditingTariffId(null);
    setTariffComponentId('');
    setTariffAcademicYearId('');
    setTariffClassId('');
    setTariffMajorId('');
    setTariffSemester('');
    setTariffGradeLevel('');
    setTariffAmount('');
    setTariffEffectiveStart('');
    setTariffEffectiveEnd('');
    setTariffNotes('');
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
    setAdjustmentClassId('');
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
    setRefundReference('');
    setRefundNote('');
  };

  const saveComponentMutation = useMutation({
    mutationFn: () =>
      editingComponentId
        ? staffFinanceService.updateComponent(editingComponentId, {
            code: componentCode,
            name: componentName,
            description: componentDescription || '',
            periodicity: componentPeriodicity,
          })
        : staffFinanceService.createComponent({
            code: componentCode,
            name: componentName,
            description: componentDescription || undefined,
            periodicity: componentPeriodicity,
          }),
    onSuccess: () => {
      toast.success(editingComponentId ? 'Komponen berhasil diperbarui' : 'Komponen berhasil ditambahkan');
      resetComponentForm();
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
            classId: tariffClassId === '' ? null : Number(tariffClassId),
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
            classId: tariffClassId === '' ? undefined : Number(tariffClassId),
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
      resetTariffForm();
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
            classId: adjustmentClassId === '' ? null : Number(adjustmentClassId),
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
            classId: adjustmentClassId === '' ? undefined : Number(adjustmentClassId),
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
        classId: invoiceClassId === '' ? undefined : Number(invoiceClassId),
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
        classId: invoiceClassId === '' ? undefined : Number(invoiceClassId),
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
        referenceNo: paymentReference || undefined,
        note: paymentNote || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Pembayaran berhasil dicatat');
      setSelectedInvoice(null);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNote('');
      setPaymentMethod('CASH');
      queryClient.invalidateQueries({ queryKey: ['staff-finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-credits'] });
      queryClient.invalidateQueries({ queryKey: ['staff-finance-reports'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mencatat pembayaran');
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

  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedCreditBalance) {
        throw new Error('Saldo kredit belum dipilih');
      }
      return staffFinanceService.createRefund(selectedCreditBalance.studentId, {
        amount: Number(refundAmount),
        method: refundMethod,
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
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mencatat refund saldo kredit');
    },
  });

  const dispatchReminderMutation = useMutation({
    mutationFn: (mode: FinanceReminderMode) =>
      staffFinanceService.dispatchDueReminders({
        dueSoonDays: Math.max(0, Number(reminderDueSoonDays || 0)),
        mode,
        preview: false,
      }),
    onSuccess: (data) => {
      toast.success(
        `Reminder jalan: ${data.createdNotifications} notifikasi dibuat (${data.dueSoonInvoices} due soon, ${data.overdueInvoices} overdue)`,
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menjalankan reminder jatuh tempo');
    },
  });

  const startPaying = (invoice: FinanceInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(String(invoice.balanceAmount || 0));
    setPaymentMethod('CASH');
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
    setRefundReference('');
    setRefundNote('');
  };

  const handleSaveComponent = () => {
    if (!componentCode.trim() || !componentName.trim()) {
      toast.error('Kode dan nama komponen wajib diisi');
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

  const handleEditComponent = (component: FinanceComponent) => {
    setEditingComponentId(component.id);
    setComponentCode(component.code);
    setComponentName(component.name);
    setComponentDescription(component.description || '');
    setComponentPeriodicity(component.periodicity);
  };

  const handleEditTariff = (tariff: FinanceTariffRule) => {
    setEditingTariffId(tariff.id);
    setTariffComponentId(tariff.componentId);
    setTariffAcademicYearId(tariff.academicYearId || '');
    setTariffClassId(tariff.classId || '');
    setTariffMajorId(tariff.majorId || '');
    setTariffSemester(tariff.semester || '');
    setTariffGradeLevel(tariff.gradeLevel || '');
    setTariffAmount(String(Number(tariff.amount || 0)));
    setTariffEffectiveStart(tariff.effectiveStart ? String(tariff.effectiveStart).slice(0, 10) : '');
    setTariffEffectiveEnd(tariff.effectiveEnd ? String(tariff.effectiveEnd).slice(0, 10) : '');
    setTariffNotes(tariff.notes || '');
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
    setAdjustmentClassId(adjustment.classId || '');
    setAdjustmentMajorId(adjustment.majorId || '');
    setAdjustmentStudentId(adjustment.studentId || '');
    setAdjustmentStudentSearch('');
    setAdjustmentSemester(adjustment.semester || '');
    setAdjustmentGradeLevel(adjustment.gradeLevel || '');
    setAdjustmentEffectiveStart(adjustment.effectiveStart ? String(adjustment.effectiveStart).slice(0, 10) : '');
    setAdjustmentEffectiveEnd(adjustment.effectiveEnd ? String(adjustment.effectiveEnd).slice(0, 10) : '');
    setAdjustmentNotes(adjustment.notes || '');
  };

  const handleDispatchReminder = (mode: FinanceReminderMode) => {
    const dueSoonDays = Number(reminderDueSoonDays || 0);
    if (!Number.isFinite(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 30) {
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
    refundMutation.mutate();
  };

  useEffect(() => {
    previewInvoiceMutation.reset();
  }, [
    invoiceYearId,
    invoiceSemester,
    invoicePeriodKey,
    invoiceDueDate,
    invoiceTitle,
    invoiceClassId,
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
        classId: reportClassId === '' ? undefined : Number(reportClassId),
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
              Pengingat otomatis tetap berjalan via worker server. Gunakan tombol ini untuk trigger manual saat dibutuhkan.
            </p>
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
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Master Komponen Biaya</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <button
              type="button"
              onClick={handleSaveComponent}
              disabled={saveComponentMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {saveComponentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingComponentId ? 'Simpan Perubahan' : 'Tambah Komponen'}
            </button>
            {editingComponentId ? (
              <button
                type="button"
                onClick={resetComponentForm}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold px-4 py-2 hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Batal Edit
              </button>
            ) : null}
          </div>
          <textarea
            value={componentDescription}
            onChange={(event) => setComponentDescription(event.target.value)}
            placeholder="Deskripsi komponen (opsional)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20 w-full"
          />
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
                      <td className="px-3 py-2 text-sm text-gray-900">{component.name}</td>
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
          <div className="flex items-center gap-2">
            <WalletCards className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Rule Tarif Dinamis</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
              onChange={(event) =>
                setTariffAcademicYearId(event.target.value ? Number(event.target.value) : '')
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
              value={tariffClassId === '' ? '' : String(tariffClassId)}
              onChange={(event) => setTariffClassId(event.target.value ? Number(event.target.value) : '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Semua kelas</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
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
              value={tariffGradeLevel}
              onChange={(event) => setTariffGradeLevel(event.target.value)}
              placeholder="Tingkat (contoh: X / XI / XII)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
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
            <button
              type="button"
              onClick={handleSaveTariff}
              disabled={saveTariffMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
            >
              {saveTariffMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTariffId ? 'Simpan Perubahan' : 'Tambah Tarif'}
            </button>
            {editingTariffId ? (
              <button
                type="button"
                onClick={resetTariffForm}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold px-4 py-2 hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Batal Edit
              </button>
            ) : null}
          </div>
          <textarea
            value={tariffNotes}
            onChange={(event) => setTariffNotes(event.target.value)}
            placeholder="Catatan tarif (opsional)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20 w-full"
          />
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
            value={adjustmentClassId === '' ? '' : String(adjustmentClassId)}
            onChange={(event) => setAdjustmentClassId(event.target.value ? Number(event.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua kelas</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
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
            value={adjustmentGradeLevel}
            onChange={(event) => setAdjustmentGradeLevel(event.target.value)}
            placeholder="Tingkat (opsional)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
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
            value={invoiceClassId === '' ? '' : String(invoiceClassId)}
            onChange={(event) => setInvoiceClassId(event.target.value ? Number(event.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua kelas</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
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
          <select
            value={invoiceGradeLevel}
            onChange={(event) => setInvoiceGradeLevel(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Semua tingkat</option>
            {gradeLevels.map((level) => (
              <option key={level} value={level}>
                Tingkat {level}
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
              value={invoiceClassFilter === '' ? '' : String(invoiceClassFilter)}
              onChange={(event) => setInvoiceClassFilter(event.target.value ? Number(event.target.value) : '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Semua Kelas</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
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
                      <button
                        type="button"
                        onClick={() => startPaying(invoice)}
                        disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED'}
                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        Catat Bayar
                      </button>
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
              value={reportClassId === '' ? '' : String(reportClassId)}
              onChange={(event) => setReportClassId(event.target.value ? Number(event.target.value) : '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Semua Kelas</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
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
              {selectedInvoiceCreditAppliedAmount > 0 ? (
                <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-800">
                  Saldo kredit yang sudah terpakai ke invoice ini:{' '}
                  <span className="font-semibold">{formatCurrency(selectedInvoiceCreditAppliedAmount)}</span>
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
                <div>Dialokasikan ke invoice: <span className="font-semibold">{formatCurrency(paymentAllocatedAmount)}</span></div>
                <div>Masuk saldo kredit: <span className="font-semibold">{formatCurrency(paymentCreditedAmount)}</span></div>
              </div>
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
                onClick={() => payInvoiceMutation.mutate()}
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
    </div>
  );
};

export default StaffFinancePage;
