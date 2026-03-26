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
  staffFinanceApi,
  type FinanceComponentPeriodicity,
  type FinanceInvoiceStatus,
  type FinancePaymentMethod,
  type FinanceReminderMode,
  type SemesterCode,
  type StaffFinanceAdjustmentRule,
  type StaffFinanceComponent,
  type StaffFinanceInvoice,
  type StaffFinanceTariffRule,
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

function describeTariffScope(tariff: StaffFinanceTariffRule) {
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

function describeAdjustmentScope(adjustment: StaffFinanceAdjustmentRule) {
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
  const [editingComponentId, setEditingComponentId] = useState<number | null>(null);

  const [tariffComponentId, setTariffComponentId] = useState<number | null>(null);
  const [tariffAcademicYearId, setTariffAcademicYearId] = useState<number | null>(null);
  const [tariffClassId, setTariffClassId] = useState<number | null>(null);
  const [tariffMajorId, setTariffMajorId] = useState<number | null>(null);
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
  const [adjustmentComponentId, setAdjustmentComponentId] = useState<number | null>(null);
  const [adjustmentAcademicYearId, setAdjustmentAcademicYearId] = useState<number | null>(null);
  const [adjustmentClassId, setAdjustmentClassId] = useState<number | null>(null);
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
  const [invoiceClassId, setInvoiceClassId] = useState<number | null>(null);
  const [invoiceMajorId, setInvoiceMajorId] = useState<number | null>(null);
  const [invoiceGradeLevel, setInvoiceGradeLevel] = useState('');
  const [invoiceReplaceExisting, setInvoiceReplaceExisting] = useState(false);
  const [invoiceStudentSearch, setInvoiceStudentSearch] = useState('');
  const [invoiceSelectedStudentIds, setInvoiceSelectedStudentIds] = useState<number[]>([]);

  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'' | FinanceInvoiceStatus>('');
  const [invoiceClassFilter, setInvoiceClassFilter] = useState<number | null>(null);

  const [reminderDueSoonDays, setReminderDueSoonDays] = useState('3');

  const [selectedInvoice, setSelectedInvoice] = useState<StaffFinanceInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

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

  const majorsQuery = useQuery({
    queryKey: ['mobile-staff-finance-majors'],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () => adminApi.listMajors({ page: 1, limit: 300 }),
    staleTime: 5 * 60 * 1000,
  });

  const classes = useMemo(() => {
    const map = new Map<number, { id: number; name: string; level: string }>();
    (studentsQuery.data || []).forEach((student) => {
      if (student.studentClass?.id && student.studentClass?.name) {
        map.set(student.studentClass.id, {
          id: student.studentClass.id,
          name: student.studentClass.name,
          level: student.studentClass.level || '',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsQuery.data]);

  const academicYears = academicYearsQuery.data?.items || [];
  const majors = majorsQuery.data?.items || [];
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
    queryKey: ['mobile-staff-finance-invoices', invoiceSearch, invoiceStatus, invoiceClassFilter],
    enabled: isAuthenticated && user?.role === 'STAFF' && canOpenPayments,
    queryFn: () =>
      staffFinanceApi.listInvoices({
        limit: 100,
        search: invoiceSearch.trim() || undefined,
        status: invoiceStatus || undefined,
        classId: invoiceClassFilter || undefined,
      }),
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

  const resetComponentForm = () => {
    setEditingComponentId(null);
    setComponentCode('');
    setComponentName('');
    setComponentDescription('');
    setComponentPeriodicity('MONTHLY');
  };

  const resetTariffForm = () => {
    setEditingTariffId(null);
    setTariffComponentId(null);
    setTariffAcademicYearId(null);
    setTariffClassId(null);
    setTariffMajorId(null);
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
    setAdjustmentComponentId(null);
    setAdjustmentAcademicYearId(null);
    setAdjustmentClassId(null);
    setAdjustmentMajorId(null);
    setAdjustmentStudentId(null);
    setAdjustmentStudentSearch('');
    setAdjustmentSemester('');
    setAdjustmentGradeLevel('');
    setAdjustmentEffectiveStart('');
    setAdjustmentEffectiveEnd('');
    setAdjustmentNotes('');
  };

  const invalidateFinanceQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-components'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-tariffs'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-adjustments'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-staff-finance-dashboard'] });
  };

  const saveComponentMutation = useMutation({
    mutationFn: () =>
      editingComponentId
        ? staffFinanceApi.updateComponent(editingComponentId, {
            code: componentCode,
            name: componentName,
            description: componentDescription || '',
            periodicity: componentPeriodicity,
          })
        : staffFinanceApi.createComponent({
            code: componentCode,
            name: componentName,
            description: componentDescription || undefined,
            periodicity: componentPeriodicity,
          }),
    onSuccess: () => {
      notifySuccess(editingComponentId ? 'Komponen diperbarui.' : 'Komponen ditambahkan.');
      resetComponentForm();
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
            classId: tariffClassId,
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
            classId: tariffClassId || undefined,
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
      resetTariffForm();
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
            classId: adjustmentClassId,
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
            classId: adjustmentClassId || undefined,
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
        classId: invoiceClassId || undefined,
        majorId: invoiceMajorId || undefined,
        gradeLevel: invoiceGradeLevel.trim() || undefined,
        studentIds: invoiceSelectedStudentIds.length > 0 ? invoiceSelectedStudentIds : undefined,
        replaceExisting: invoiceReplaceExisting,
      }),
    onSuccess: (result) => {
      notifySuccess(
        `Generate selesai: ${result.summary.created} baru, ${result.summary.updated} diperbarui.`,
      );
      previewInvoiceMutation.reset();
      invalidateFinanceQueries();
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
        classId: invoiceClassId || undefined,
        majorId: invoiceMajorId || undefined,
        gradeLevel: invoiceGradeLevel.trim() || undefined,
        studentIds: invoiceSelectedStudentIds.length > 0 ? invoiceSelectedStudentIds : undefined,
        replaceExisting: invoiceReplaceExisting,
      }),
    onError: (error: unknown) => notifyApiError(error, 'Gagal membuat preview generate.'),
  });

  const dispatchReminderMutation = useMutation({
    mutationFn: (mode: FinanceReminderMode) =>
      staffFinanceApi.dispatchDueReminders({
        mode,
        dueSoonDays: Math.max(0, Number(reminderDueSoonDays || 0)),
        preview: false,
      }),
    onSuccess: (result) => {
      notifySuccess(
        `Reminder terkirim ${result.createdNotifications} notifikasi (${result.dueSoonInvoices} due soon, ${result.overdueInvoices} overdue).`,
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
      invalidateFinanceQueries();
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mencatat pembayaran.'),
  });

  const handleSaveComponent = () => {
    if (!componentCode.trim() || !componentName.trim()) {
      notifyApiError(null, 'Kode dan nama komponen wajib diisi.');
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

  const handleGenerate = () => {
    if (!invoicePeriodKey.trim()) {
      notifyApiError(null, 'Period key wajib diisi (contoh 2026-03).');
      return;
    }
    generateInvoiceMutation.mutate();
  };

  const handlePreviewGenerate = () => {
    if (!invoicePeriodKey.trim()) {
      notifyApiError(null, 'Period key wajib diisi (contoh 2026-03).');
      return;
    }
    previewInvoiceMutation.mutate();
  };

  const handleManualReminder = (mode: FinanceReminderMode) => {
    const dueSoonDays = Number(reminderDueSoonDays || 0);
    if (!Number.isFinite(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 30) {
      notifyApiError(null, 'Due soon harus 0 - 30 hari.');
      return;
    }
    dispatchReminderMutation.mutate(mode);
  };

  const startPaying = (invoice: StaffFinanceInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(String(Number(invoice.balanceAmount || 0)));
    setPaymentMethod('CASH');
    setPaymentReference('');
    setPaymentNote('');
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
    setAdjustmentClassId(adjustment.classId || null);
    setAdjustmentMajorId(adjustment.majorId || null);
    setAdjustmentStudentId(adjustment.studentId || null);
    setAdjustmentStudentSearch('');
    setAdjustmentSemester(adjustment.semester || '');
    setAdjustmentGradeLevel(adjustment.gradeLevel || '');
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

  useEffect(() => {
    previewInvoiceMutation.reset();
  }, [
    invoiceAcademicYearId,
    invoiceSemester,
    invoicePeriodKey,
    invoiceDueDate,
    invoiceTitle,
    invoiceClassId,
    invoiceMajorId,
    invoiceGradeLevel,
    invoiceReplaceExisting,
    invoiceSelectedStudentIds,
  ]);

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
            invoicesQuery.isFetching ||
            dashboardQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void componentsQuery.refetch();
            void tariffsQuery.refetch();
            void adjustmentsQuery.refetch();
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
      {componentsQuery.isError || tariffsQuery.isError || adjustmentsQuery.isError || invoicesQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data keuangan staff."
          onRetry={() => {
            void componentsQuery.refetch();
            void tariffsQuery.refetch();
            void adjustmentsQuery.refetch();
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
        </View>
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
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Master Komponen</Text>
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

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={handleSaveComponent}
                disabled={saveComponentMutation.isPending}
                style={{ backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: saveComponentMutation.isPending ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {editingComponentId ? 'Simpan Perubahan' : 'Tambah Komponen'}
                </Text>
              </Pressable>
            </View>
            {editingComponentId ? (
              <View style={{ width: 120, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={resetComponentForm}
                  style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
            ) : null}
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
              <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => {
                      setEditingComponentId(component.id);
                      setComponentCode(component.code);
                      setComponentName(component.name);
                      setComponentDescription(component.description || '');
                      setComponentPeriodicity(component.periodicity);
                    }}
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
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Rule Tarif</Text>

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
                onPress={() => setTariffClassId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: tariffClassId === null ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: tariffClassId === null ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: tariffClassId === null ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua kelas
                </Text>
              </Pressable>
              {classes.map((classItem) => {
                const active = tariffClassId === classItem.id;
                return (
                  <Pressable
                    key={classItem.id}
                    onPress={() => setTariffClassId(classItem.id)}
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
                      {classItem.name}
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
            value={tariffGradeLevel}
            onChangeText={setTariffGradeLevel}
            placeholder="Tingkat (contoh: X / XI / XII)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
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

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={handleSaveTariff}
                disabled={saveTariffMutation.isPending}
                style={{ backgroundColor: '#059669', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: saveTariffMutation.isPending ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {editingTariffId ? 'Simpan Perubahan' : 'Tambah Tarif'}
                </Text>
              </Pressable>
            </View>
            {editingTariffId ? (
              <View style={{ width: 120, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={resetTariffForm}
                  style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
            ) : null}
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
                    onPress={() => {
                      setEditingTariffId(tariff.id);
                      setTariffComponentId(tariff.componentId);
                      setTariffAcademicYearId(tariff.academicYearId || null);
                      setTariffClassId(tariff.classId || null);
                      setTariffMajorId(tariff.majorId || null);
                      setTariffSemester(tariff.semester || '');
                      setTariffGradeLevel(tariff.gradeLevel || '');
                      setTariffAmount(String(Number(tariff.amount || 0)));
                      setTariffEffectiveStart(tariff.effectiveStart ? String(tariff.effectiveStart).slice(0, 10) : '');
                      setTariffEffectiveEnd(tariff.effectiveEnd ? String(tariff.effectiveEnd).slice(0, 10) : '');
                      setTariffNotes(tariff.notes || '');
                    }}
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
                onPress={() => setAdjustmentClassId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: adjustmentClassId === null ? '#7c3aed' : '#ddd6fe',
                  backgroundColor: adjustmentClassId === null ? '#f5f3ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: adjustmentClassId === null ? '#6d28d9' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua kelas
                </Text>
              </Pressable>
              {classes.map((classItem) => {
                const active = adjustmentClassId === classItem.id;
                return (
                  <Pressable
                    key={classItem.id}
                    onPress={() => setAdjustmentClassId(classItem.id)}
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
                      {classItem.name}
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
            value={adjustmentGradeLevel}
            onChangeText={setAdjustmentGradeLevel}
            placeholder="Tingkat (opsional)"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
          />
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
                onPress={() => setInvoiceClassId(null)}
                style={{
                  borderWidth: 1,
                  borderColor: invoiceClassId === null ? '#1d4ed8' : '#dbeafe',
                  backgroundColor: invoiceClassId === null ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: invoiceClassId === null ? '#1e3a8a' : '#475569', fontWeight: '700', fontSize: 12 }}>
                  Semua kelas
                </Text>
              </Pressable>
              {classes.map((classItem) => {
                const active = invoiceClassId === classItem.id;
                return (
                  <Pressable
                    key={classItem.id}
                    onPress={() => setInvoiceClassId(classItem.id)}
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
                      {classItem.name}
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

          <Text style={{ color: '#475569', marginBottom: 4 }}>Tingkat target (opsional)</Text>
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
                  Semua tingkat
                </Text>
              </Pressable>
              {gradeLevels.map((level) => {
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
                      Tingkat {level}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

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
                    {detail.reason ? (
                      <Text style={{ color: '#b45309', fontSize: 12, marginBottom: 4 }}>{detail.reason}</Text>
                    ) : null}
                    <Text style={{ color: '#0f172a', fontWeight: '700' }}>
                      {detail.totalAmount > 0 ? formatCurrency(detail.totalAmount) : '-'}
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
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                  Sisa: {formatCurrency(invoice.balanceAmount)}
                </Text>

                <Pressable
                  onPress={() => startPaying(invoice)}
                  disabled={invoice.status === 'PAID' || invoice.status === 'CANCELLED'}
                  style={{
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
            );
          })}

          {invoices.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 10, padding: 14 }}>
              <Text style={{ color: '#64748b', textAlign: 'center' }}>Belum ada tagihan.</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal visible={Boolean(selectedInvoice)} animationType="fade" transparent onRequestClose={() => setSelectedInvoice(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe7fb' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>Catat Pembayaran</Text>
              <Text style={{ color: '#64748b', marginTop: 2 }}>
                {selectedInvoice?.invoiceNo || '-'} • Sisa {formatCurrency(selectedInvoice?.balanceAmount || 0)}
              </Text>
            </View>

            <View style={{ padding: 14 }}>
              <TextInput
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder="Nominal pembayaran"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, color: '#0f172a', backgroundColor: '#fff' }}
              />

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
            </View>

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
                  onPress={() => payInvoiceMutation.mutate()}
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
    </ScrollView>
  );
}
