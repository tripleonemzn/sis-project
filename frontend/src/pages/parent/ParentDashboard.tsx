import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { userService } from '../../services/user.service';
import { academicYearService } from '../../services/academicYear.service';
import { uploadService } from '../../services/upload.service';
import api from '../../services/api';
import { UserProfilePage } from '../common/UserProfilePage';
import { normalizeNisnInput } from '../../utils/nisn';
import { DashboardWelcomeCard } from '../../components/common/DashboardWelcomeCard';

type SemesterCode = 'ODD' | 'EVEN';
type ParentPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
type ParentPaymentSource = 'DIRECT' | 'CREDIT_BALANCE';
type ParentAttendanceStatus = 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT' | 'ALPHA' | 'LATE';

interface ParentChild {
  id: number;
  name: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  studentStatus?: string | null;
  verificationStatus?: string | null;
  studentClass?: {
    id: number;
    name: string;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
}

interface ParentChildLookupResult {
  student: ParentChild;
  alreadyLinkedToCurrentParent: boolean;
  linkedParentCount: number;
  oneTimeWarning: string;
}

interface ParentPayment {
  id: number;
  paymentNo?: string | null;
  amount: number;
  allocatedAmount?: number;
  creditedAmount?: number;
  reversedAmount?: number;
  reversedAllocatedAmount?: number;
  reversedCreditedAmount?: number;
  source?: ParentPaymentSource | null;
  status: ParentPaymentStatus;
  type: 'MONTHLY' | 'ONE_TIME';
  method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER' | null;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  verificationNote?: string | null;
  verifiedAt?: string | null;
  referenceNo?: string | null;
  invoiceId?: number | null;
  invoiceNo?: string | null;
  periodKey?: string | null;
  semester?: SemesterCode | null;
  proofFile?: {
    url: string;
    name?: string | null;
    mimetype?: string | null;
    size?: number | null;
  } | null;
  createdBy?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ParentFinancePortalBankAccount {
  id: number;
  code: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  label: string;
}

interface ParentChildFinanceOverview {
  student: ParentChild;
  summary: {
    totalRecords: number;
    totalAmount: number;
    overdueCount: number;
    overdueAmount: number;
    status: {
      pendingCount: number;
      pendingAmount: number;
      paidCount: number;
      paidAmount: number;
      partialCount: number;
      partialAmount: number;
      cancelledCount: number;
      cancelledAmount: number;
    };
    type: {
      monthlyCount: number;
      monthlyAmount: number;
      oneTimeCount: number;
      oneTimeAmount: number;
    };
    creditBalance: number;
  };
  actionCenter: {
    state:
      | 'NO_INVOICE'
      | 'OVERDUE'
      | 'LATE_FEE_WARNING'
      | 'DUE_SOON'
      | 'CREDIT_AVAILABLE'
      | 'UP_TO_DATE';
    headline: string;
    detail: string;
    overdueInvoiceCount: number;
    overdueAmount: number;
    overdueInstallmentCount: number;
    overdueInstallmentAmount: number;
    pendingLateFeeAmount: number;
    appliedLateFeeAmount: number;
    creditBalanceAmount: number;
    latestPaymentAt?: string | null;
    latestRefund?: {
      refundNo: string;
      amount: number;
      refundedAt: string;
      method: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
      referenceNo?: string | null;
      note?: string | null;
    } | null;
    nextDue?: {
      invoiceId: number;
      invoiceNo: string;
      title?: string | null;
      dueDate?: string | null;
      balanceAmount: number;
      installmentSequence?: number | null;
      daysUntilDue?: number | null;
      isOverdue: boolean;
    } | null;
  };
  invoices: Array<{
    id: number;
    invoiceNo: string;
    title?: string | null;
    periodKey: string;
    semester: SemesterCode;
    dueDate?: string | null;
    status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    isOverdue: boolean;
    daysPastDue: number;
    items: Array<{
      componentCode?: string | null;
      componentName: string;
      amount: number;
      periodicity?: 'MONTHLY' | 'ONE_TIME' | 'PERIODIC' | null;
    }>;
    installments: Array<{
      sequence: number;
      amount: number;
      dueDate?: string | null;
      paidAmount: number;
      balanceAmount: number;
      status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
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
        status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
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
      asOfDate: string;
    };
  }>;
  payments: ParentPayment[];
  creditBalance: {
    balanceAmount: number;
    updatedAt?: string | null;
    refunds: Array<{
      id: number;
      refundNo: string;
      amount: number;
      method: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER';
      refundedAt: string;
      referenceNo?: string | null;
      note?: string | null;
      createdAt: string;
    }>;
  };
}

interface ParentFinanceOverview {
  parent: {
    id: number;
    name: string;
    username: string;
  };
  summary: {
    childCount: number;
    totalRecords: number;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    partialAmount: number;
    cancelledAmount: number;
    overdueCount: number;
    overdueAmount: number;
    monthlyAmount: number;
    oneTimeAmount: number;
    creditBalanceAmount: number;
  };
  children: ParentChildFinanceOverview[];
}

interface ParentAttendanceRecord {
  id: number;
  date: string;
  status: ParentAttendanceStatus;
  note?: string | null;
}

interface ParentReportCard {
  student: ParentChild;
  reportGrades: Array<{
    id: number;
    finalScore: number;
    subject?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  }>;
  attendanceSummary: {
    hadir: number;
    sakit: number;
    izin: number;
    alpha: number;
  };
  average: number;
}

type ParentMePayload = {
  role?: string;
  children?: Array<{ id?: number | string | null }>;
};

type ActiveAcademicYearPayload = {
  id?: number | string | null;
  name?: string | null;
};

const PAYMENT_STATUS_LABELS: Record<ParentPaymentStatus, string> = {
  PENDING: 'Belum Bayar',
  PAID: 'Lunas',
  PARTIAL: 'Parsial',
  CANCELLED: 'Dibatalkan',
};

const PAYMENT_STATUS_COLOR: Record<ParentPaymentStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

function getParentPaymentSourceLabel(source?: ParentPaymentSource | null): string {
  return source === 'CREDIT_BALANCE' ? 'Saldo Kredit' : 'Pembayaran Langsung';
}

function getParentPaymentMethodLabel(
  method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER' | null,
): string {
  if (method === 'BANK_TRANSFER') return 'Transfer Bank';
  if (method === 'VIRTUAL_ACCOUNT') return 'Virtual Account';
  if (method === 'E_WALLET') return 'E-Wallet';
  if (method === 'QRIS') return 'QRIS';
  if (method === 'CASH') return 'Tunai';
  if (method === 'OTHER') return 'Metode Lain';
  return 'Metode belum dicatat';
}

function getParentVerificationBadgeClass(status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  if (status === 'VERIFIED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function getParentVerificationLabel(status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  if (status === 'VERIFIED') return 'Terverifikasi';
  if (status === 'REJECTED') return 'Ditolak';
  return 'Menunggu Verifikasi';
}

const INVOICE_STATUS_LABELS: Record<'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED', string> = {
  UNPAID: 'Belum Lunas',
  PARTIAL: 'Parsial',
  PAID: 'Lunas',
  CANCELLED: 'Dibatalkan',
};

const INVOICE_STATUS_COLOR: Record<'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED', string> = {
  UNPAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

function getFinanceActionCenterBadgeClass(
  state:
    | 'NO_INVOICE'
    | 'OVERDUE'
    | 'LATE_FEE_WARNING'
    | 'DUE_SOON'
    | 'CREDIT_AVAILABLE'
    | 'UP_TO_DATE',
) {
  if (state === 'OVERDUE') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (state === 'LATE_FEE_WARNING') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (state === 'DUE_SOON') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (state === 'CREDIT_AVAILABLE') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (state === 'NO_INVOICE') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getFinanceActionCenterLabel(
  state:
    | 'NO_INVOICE'
    | 'OVERDUE'
    | 'LATE_FEE_WARNING'
    | 'DUE_SOON'
    | 'CREDIT_AVAILABLE'
    | 'UP_TO_DATE',
) {
  if (state === 'OVERDUE') return 'Prioritas';
  if (state === 'LATE_FEE_WARNING') return 'Warning';
  if (state === 'DUE_SOON') return 'Segera';
  if (state === 'CREDIT_AVAILABLE') return 'Saldo';
  if (state === 'NO_INVOICE') return 'Info';
  return 'Aman';
}

const ATTENDANCE_STATUS_LABELS: Record<ParentAttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  ABSENT: 'Alpha',
  ALPHA: 'Alpha',
  LATE: 'Terlambat',
};

const ATTENDANCE_STATUS_COLOR: Record<ParentAttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SICK: 'bg-blue-50 text-blue-700 border-blue-200',
  PERMISSION: 'bg-amber-50 text-amber-700 border-amber-200',
  ABSENT: 'bg-rose-50 text-rose-700 border-rose-200',
  ALPHA: 'bg-rose-50 text-rose-700 border-rose-200',
  LATE: 'bg-orange-50 text-orange-700 border-orange-200',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function defaultSemesterByDate(): SemesterCode {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function useParentChildrenData() {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const me = meQuery.data?.data as ParentMePayload | undefined;
  const isParent = me?.role === 'PARENT';

  const childrenQuery = useQuery({
    queryKey: ['parent-children-web'],
    enabled: isParent,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await userService.getMyChildren();
      return (response.data || []) as ParentChild[];
    },
  });

  return {
    me,
    isParent,
    meQuery,
    childrenQuery,
    children: childrenQuery.data || [],
  };
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

const ParentOverviewPage = () => {
  const { isParent, meQuery, children, childrenQuery } = useParentChildrenData();
  const me = meQuery.data?.data as
    | (ParentMePayload & {
        name?: string;
        username?: string;
        photo?: string | null;
      })
    | undefined;

  const financeOverviewQuery = useQuery({
    queryKey: ['parent-finance-overview-web', 'all'],
    enabled: isParent,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await api.get('/payments/parent-overview', {
        params: { limit: 20 },
      });
      return (response.data?.data || null) as ParentFinanceOverview | null;
    },
  });

  const pendingTop = useMemo(() => {
    const rows = financeOverviewQuery.data?.children || [];
    return [...rows]
      .sort(
        (a, b) =>
          Number(b.summary.status.pendingAmount || 0) + Number(b.summary.status.partialAmount || 0) -
          (Number(a.summary.status.pendingAmount || 0) + Number(a.summary.status.partialAmount || 0)),
      )
      .slice(0, 5);
  }, [financeOverviewQuery.data?.children]);

  const summary = financeOverviewQuery.data?.summary;
  const loading = meQuery.isLoading || childrenQuery.isLoading || financeOverviewQuery.isLoading;
  const hasError = meQuery.isError || childrenQuery.isError || financeOverviewQuery.isError;

  return (
    <div className="space-y-6">
      <DashboardWelcomeCard
        user={me}
        eyebrow="Orang Tua / Wali"
        subtitle="Ringkasan anak, keuangan, dan akses cepat modul parent tersedia dari akun keluarga ini."
        meta={`Username akun: ${me?.username || '-'}`}
        tone="teal"
        className="mt-10"
        fallbackName="Orang Tua"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/parent/children" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="text-xs uppercase tracking-wider text-blue-700/80">Jumlah Anak</p>
          <p className="mt-2 text-2xl font-bold text-blue-900">
            {loading ? '-' : summary?.childCount || children.length}
          </p>
          <p className="mt-1 text-xs text-blue-800/70">Terhubung ke akun ini</p>
        </div>
        </Link>
        <Link to="/parent/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
        <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="text-xs uppercase tracking-wider text-teal-700/80">Total Transaksi</p>
          <p className="mt-2 text-2xl font-bold text-teal-900">
            {loading ? '-' : summary?.totalRecords || 0}
          </p>
          <p className="mt-1 text-xs text-teal-800/70">Riwayat pembayaran</p>
        </div>
        </Link>
        <Link to="/parent/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="text-xs uppercase tracking-wider text-emerald-700/80">Sudah Dibayar</p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">
            {loading ? '-' : formatCurrency(summary?.paidAmount || 0)}
          </p>
          <p className="mt-1 text-xs text-emerald-800/70">Nominal terbayar</p>
        </div>
        </Link>
        <Link to="/parent/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
        <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="text-xs uppercase tracking-wider text-orange-700/80">Belum Lunas</p>
          <p className="mt-2 text-2xl font-bold text-orange-900">
            {loading
              ? '-'
              : formatCurrency(Number(summary?.pendingAmount || 0) + Number(summary?.partialAmount || 0))}
          </p>
          <p className="mt-1 text-xs text-orange-800/70">
            {loading ? 'Pending + parsial' : `${summary?.overdueCount || 0} tagihan lewat jatuh tempo`}
          </p>
        </div>
        </Link>
      </div>

      {hasError && !loading && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Gagal memuat dashboard parent. Silakan muat ulang.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Daftar Anak</h3>
            <Link to="/parent/children" className="text-xs text-blue-600 hover:text-blue-700">
              Lihat detail
            </Link>
          </div>
          {childrenQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : children.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada data anak yang terhubung.</p>
          ) : (
            <div className="space-y-3">
              {children.slice(0, 6).map((child) => (
                <div key={child.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-sm font-semibold text-gray-900">{child.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {child.studentClass?.name || '-'} • NISN: {child.nisn || '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Anak Dengan Tunggakan Tertinggi</h3>
            <Link to="/parent/finance" className="text-xs text-blue-600 hover:text-blue-700">
              Buka keuangan
            </Link>
          </div>
          {financeOverviewQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : pendingTop.length === 0 ? (
            <p className="text-sm text-gray-500">Tidak ada tunggakan pada data saat ini.</p>
          ) : (
            <div className="space-y-3">
              {pendingTop.map((row) => (
                <div key={row.student.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-sm font-semibold text-gray-900">{row.student.name}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Pending: {formatCurrency(row.summary.status.pendingAmount + row.summary.status.partialAmount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          to="/parent/children"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          <Users className="w-4 h-4" />
          Data Anak
        </Link>
        <Link
          to="/parent/children?mode=link"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          <UserCheck className="w-4 h-4" />
          Hubungkan Anak
        </Link>
        <Link
          to="/parent/finance"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          <Wallet className="w-4 h-4" />
          Keuangan
        </Link>
        <Link
          to="/parent/attendance"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          <UserCheck className="w-4 h-4" />
          Absensi Anak
        </Link>
      </div>
    </div>
  );
};

const ParentChildrenPage = () => {
  const { isParent, childrenQuery, children } = useParentChildrenData();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [linkForm, setLinkForm] = useState({ nisn: '', birthDate: '' });
  const [lookupResult, setLookupResult] = useState<ParentChildLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingChildId, setUnlinkingChildId] = useState<number | null>(null);
  const isLinkMode = searchParams.get('mode') === 'link';

  const filteredChildren = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return children;
    return children.filter((child) => {
      const haystacks = [
        child.name || '',
        child.username || '',
        child.nis || '',
        child.nisn || '',
        child.studentClass?.name || '',
        child.studentClass?.major?.name || '',
      ];
      return haystacks.some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [children, search]);

  if (!isParent && !childrenQuery.isLoading) {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Halaman ini khusus untuk role orang tua.
      </div>
    );
  }

  const handleLookupChild = async () => {
    const nisn = linkForm.nisn.trim();

    if (!/^\d{10}$/.test(nisn)) {
      toast.error('NISN harus terdiri dari 10 digit angka');
      return;
    }

    try {
      setIsLookingUp(true);
      const response = await userService.lookupMyChild(nisn);
      setLookupResult(response.data as ParentChildLookupResult);
      toast.success(response.message || 'Data siswa ditemukan');
    } catch (error) {
      setLookupResult(null);
      toast.error(getErrorMessage(error, 'Data siswa tidak ditemukan.'));
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLinkChild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nisn = linkForm.nisn.trim();
    const birthDate = linkForm.birthDate.trim();

    if (!/^\d{10}$/.test(nisn)) {
      toast.error('NISN harus terdiri dari 10 digit angka');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      toast.error('Tanggal lahir wajib menggunakan format YYYY-MM-DD');
      return;
    }

    if (lookupResult?.alreadyLinkedToCurrentParent) {
      toast.error('NISN ini sudah terhubung ke akun orang tua Anda');
      return;
    }

    try {
      setIsLinking(true);
      const response = await userService.linkMyChild({ nisn, birthDate });
      authService.clearMeCache();
      toast.success(response.message || 'Data anak berhasil dihubungkan');
      setLinkForm({ nisn: '', birthDate: '' });
      setLookupResult(null);
      await childrenQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghubungkan data anak.'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkChild = async (child: ParentChild) => {
    const confirmed = window.confirm(`Lepas hubungan ${child.name} dari akun orang tua ini?`);
    if (!confirmed) return;

    try {
      setUnlinkingChildId(child.id);
      const response = await userService.unlinkMyChild(child.id);
      authService.clearMeCache();
      toast.success(response.message || 'Data anak berhasil dilepas');
      await childrenQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal melepas hubungan data anak.'));
    } finally {
      setUnlinkingChildId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Anak"
        subtitle={
          isLinkMode
            ? 'Cari siswa dengan NISN, cek datanya, lalu hubungkan ke akun orang tua ini.'
            : 'Daftar anak yang terhubung dengan akun orang tua.'
        }
      />

      <div className="space-y-4">
        <div className="max-w-3xl bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, username, NIS, NISN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => childrenQuery.refetch()}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Muat Ulang
          </button>
        </div>

        <div
          className={`bg-white rounded-xl shadow-sm border p-4 transition ${
            isLinkMode ? 'border-blue-200 ring-2 ring-blue-500/15' : 'border-gray-100'
          }`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Hubungkan Anak</h3>
              <p className="mt-1 text-xs text-gray-500">
                Cari siswa dengan NISN, lalu verifikasi tanggal lahir sebelum data anak dikaitkan ke akun ini.
              </p>
            </div>
            {isLinkMode ? (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                Mode Hubungkan
              </span>
            ) : null}
          </div>

          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Setiap NISN cukup dikaitkan satu kali ke akun ini. Jika Anda memiliki lebih dari satu anak di sekolah,
            ulangi proses dengan NISN yang berbeda untuk masing-masing anak.
          </div>

          <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={handleLinkChild}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">NISN</label>
              <input
                type="text"
                value={linkForm.nisn}
                onChange={(event) => {
                  const nextNisn = normalizeNisnInput(event.target.value);
                  setLinkForm((prev) => ({ ...prev, nisn: nextNisn }));
                  setLookupResult((prev) => (prev?.student.nisn === nextNisn ? prev : null));
                }}
                placeholder="10 digit NISN"
                inputMode="numeric"
                maxLength={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal Lahir</label>
              <input
                type="date"
                value={linkForm.birthDate}
                onChange={(event) => setLinkForm((prev) => ({ ...prev, birthDate: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-gray-500">
                Jika data siswa belum memiliki tanggal lahir di sistem, hubungan perlu dibantu admin sekolah.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLookupChild}
                  disabled={isLookingUp}
                  className="inline-flex items-center justify-center rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLookingUp ? 'Mencari...' : 'Cari NISN'}
                </button>
                <button
                  type="submit"
                  disabled={isLinking || lookupResult?.alreadyLinkedToCurrentParent}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLinking ? 'Menghubungkan...' : 'Hubungkan Anak'}
                </button>
              </div>
            </div>
          </form>

          {lookupResult ? (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 ${
                lookupResult.alreadyLinkedToCurrentParent
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hasil Pencarian NISN</p>
                  <h4 className="mt-1 text-base font-semibold text-gray-900">{lookupResult.student.name}</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    @{lookupResult.student.username} • {lookupResult.student.studentClass?.name || 'Belum ada kelas'}
                    {lookupResult.student.studentClass?.major?.code
                      ? ` (${lookupResult.student.studentClass.major.code})`
                      : ''}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    lookupResult.alreadyLinkedToCurrentParent
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {lookupResult.alreadyLinkedToCurrentParent ? 'Sudah Terkait' : 'Siap Diverifikasi'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                <div>NISN: {lookupResult.student.nisn || '-'}</div>
                <div>NIS: {lookupResult.student.nis || '-'}</div>
                <div>
                  Status: {lookupResult.student.studentStatus || '-'} / {lookupResult.student.verificationStatus || '-'}
                </div>
                <div>Sudah terhubung ke {lookupResult.linkedParentCount} akun orang tua</div>
              </div>

              <p className="mt-3 text-xs leading-5 text-gray-600">{lookupResult.oneTimeWarning}</p>
              {lookupResult.alreadyLinkedToCurrentParent ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  NISN ini sudah pernah dikaitkan ke akun Anda. Untuk anak lain, gunakan NISN yang berbeda.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {childrenQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : childrenQuery.isError ? (
          <div className="py-10 text-center text-sm text-red-600">Gagal memuat data anak.</div>
        ) : filteredChildren.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            {children.length === 0 && !search.trim()
              ? 'Belum ada data anak yang terhubung. Gunakan form di atas untuk menghubungkan anak pertama.'
              : 'Tidak ada data anak yang cocok dengan filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS / NISN</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredChildren.map((child) => (
                  <tr key={child.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{child.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">@{child.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>NIS: {child.nis || '-'}</div>
                      <div>NISN: {child.nisn || '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {child.studentClass?.name || '-'}
                      {child.studentClass?.major?.code ? ` (${child.studentClass.major.code})` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {child.studentStatus || '-'} / {child.verificationStatus || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          to={`/parent/attendance?childId=${child.id}`}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Absensi
                        </Link>
                        <Link
                          to={`/parent/finance?childId=${child.id}`}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          Keuangan
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleUnlinkChild(child)}
                          disabled={unlinkingChildId === child.id}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {unlinkingChildId === child.id ? 'Memproses...' : 'Lepas'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const ParentFinancePage = () => {
  const { isParent, children, childrenQuery } = useParentChildrenData();
  const [searchParams] = useSearchParams();
  const [selectedChildIdState, setSelectedChildIdState] = useState<number | null>(null);
  const [semester, setSemester] = useState<SemesterCode>(defaultSemesterByDate());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'QRIS' | 'OTHER'>('BANK_TRANSFER');
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const selectedChildId = useMemo(() => {
    if (!children.length) return null;
    if (selectedChildIdState && children.some((child) => child.id === selectedChildIdState)) {
      return selectedChildIdState;
    }
    const fromQuery = Number(searchParams.get('childId') || 0);
    const validQuery = fromQuery > 0 && children.some((child) => child.id === fromQuery);
    return validQuery ? fromQuery : children[0]?.id || null;
  }, [children, searchParams, selectedChildIdState]);

  const activeYearQuery = useQuery({
    queryKey: ['academic-year-active-parent'],
    queryFn: academicYearService.getActive,
    staleTime: 5 * 60 * 1000,
    enabled: isParent,
  });

  const activeYearPayload: ActiveAcademicYearPayload | null = (() => {
    const raw = activeYearQuery.data as unknown;
    if (raw && typeof raw === 'object' && 'data' in raw) {
      return ((raw as { data?: ActiveAcademicYearPayload | null }).data ?? null);
    }
    return (raw as ActiveAcademicYearPayload | null | undefined) ?? null;
  })();
  const activeYearId = Number(activeYearPayload?.id || 0) || null;
  const activeYearName = activeYearPayload?.name || '-';

  const financeQuery = useQuery({
    queryKey: ['parent-finance-overview-web', selectedChildId || 'all', 25],
    enabled: isParent,
    queryFn: async () => {
      const response = await api.get('/payments/parent-overview', {
        params: {
          student_id: selectedChildId || undefined,
          limit: 25,
        },
      });
      return (response.data?.data || null) as ParentFinanceOverview | null;
    },
  });
  const bankAccountsQuery = useQuery({
    queryKey: ['parent-finance-portal-bank-accounts-web'],
    enabled: isParent,
    queryFn: async () => {
      const response = await api.get('/payments/portal-bank-accounts');
      return ((response.data?.data?.accounts || []) as ParentFinancePortalBankAccount[]);
    },
  });

  const reportCardQuery = useQuery({
    queryKey: ['parent-report-card-web', selectedChildId, activeYearId, semester],
    enabled: isParent && !!selectedChildId && !!activeYearId,
    queryFn: async () => {
      const response = await api.get('/grades/report-card', {
        params: {
          student_id: selectedChildId,
          academic_year_id: activeYearId,
          semester,
        },
      });
      return (response.data?.data || null) as ParentReportCard | null;
    },
  });

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) || null,
    [children, selectedChildId],
  );

  const selectedChildFinance = useMemo(() => {
    const rows = financeQuery.data?.children || [];
    if (!rows.length) return null;
    if (!selectedChildId) return rows[0] || null;
    return rows.find((row) => row.student.id === selectedChildId) || rows[0] || null;
  }, [financeQuery.data?.children, selectedChildId]);
  const actionCenter = selectedChildFinance?.actionCenter || null;
  const latestRefund =
    selectedChildFinance?.creditBalance.refunds?.[0] || selectedChildFinance?.actionCenter.latestRefund || null;
  const outstandingInvoices = useMemo(
    () =>
      (selectedChildFinance?.invoices || []).filter(
        (invoice) =>
          invoice.status !== 'PAID' &&
          invoice.status !== 'CANCELLED' &&
          Number(invoice.balanceAmount || 0) > 0,
      ),
    [selectedChildFinance?.invoices],
  );
  const selectedInvoice =
    outstandingInvoices.find((invoice) => invoice.id === selectedInvoiceId) || outstandingInvoices[0] || null;

  const highestScore = useMemo(() => {
    const grades = reportCardQuery.data?.reportGrades || [];
    if (!grades.length) return null;
    return grades.reduce((max, item) => (item.finalScore > max ? item.finalScore : max), grades[0].finalScore);
  }, [reportCardQuery.data?.reportGrades]);

  useEffect(() => {
    if (!selectedInvoice) {
      if (selectedInvoiceId !== null) setSelectedInvoiceId(null);
      if (paymentAmount) setPaymentAmount('');
      return;
    }
    if (selectedInvoiceId !== selectedInvoice.id) {
      setSelectedInvoiceId(selectedInvoice.id);
      setPaymentAmount(String(Math.round(selectedInvoice.balanceAmount || 0)));
      return;
    }
    if (!paymentAmount) {
      setPaymentAmount(String(Math.round(selectedInvoice.balanceAmount || 0)));
    }
  }, [paymentAmount, selectedInvoice, selectedInvoiceId]);

  const handleSubmitPayment = async () => {
    if (!selectedChildFinance || !selectedInvoice) {
      toast.error('Belum ada tagihan aktif untuk anak yang dipilih.');
      return;
    }
    if (!proofFile) {
      toast.error('Bukti pembayaran wajib diunggah.');
      return;
    }

    const amount = Number(paymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Nominal pembayaran tidak valid.');
      return;
    }
    if (paymentMethod !== 'OTHER' && !bankAccountId) {
      toast.error('Pilih rekening tujuan terlebih dulu.');
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const uploaded = await uploadService.uploadFinanceProof(proofFile);
      await api.post(`/payments/invoices/${selectedInvoice.id}/portal-submissions`, {
        amount,
        method: paymentMethod,
        bankAccountId: bankAccountId ? Number(bankAccountId) : undefined,
        referenceNo: referenceNo.trim() || undefined,
        note: paymentNote.trim() || undefined,
        paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
        proofFileUrl: uploaded.url,
        proofFileName: uploaded.originalname,
        proofMimeType: uploaded.mimetype,
        proofFileSize: uploaded.size,
      });
      toast.success('Bukti pembayaran berhasil dikirim dan menunggu verifikasi bendahara.');
      setReferenceNo('');
      setPaymentNote('');
      setProofFile(null);
      const input = document.getElementById('parent-finance-proof-input') as HTMLInputElement | null;
      if (input) input.value = '';
      await financeQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal mengirim bukti pembayaran.'));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  if (!isParent && !childrenQuery.isLoading) {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Halaman ini khusus untuk role orang tua.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Keuangan Anak"
        subtitle="Pantau ringkasan pembayaran dan histori transaksi anak."
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {children.map((child) => {
              const selected = selectedChildId === child.id;
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedChildIdState(child.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    selected
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {child.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Semester</span>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value as SemesterCode)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ODD">Ganjil</option>
              <option value="EVEN">Genap</option>
            </select>
          </div>
        </div>

        {selectedChild && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">{selectedChild.name}</p>
            <p className="text-xs text-gray-500 mt-1">
              {selectedChild.studentClass?.name || '-'} • NISN: {selectedChild.nisn || '-'}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Total Nominal</p>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {formatCurrency(selectedChildFinance?.summary.totalAmount || 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Lunas</p>
          <p className="mt-2 text-xl font-bold text-emerald-700">
            {formatCurrency(selectedChildFinance?.summary.status.paidAmount || 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Belum Lunas</p>
          <p className="mt-2 text-xl font-bold text-amber-700">
            {formatCurrency(
              Number(selectedChildFinance?.summary.status.pendingAmount || 0) +
                Number(selectedChildFinance?.summary.status.partialAmount || 0),
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Lewat Jatuh Tempo</p>
          <p className="mt-2 text-xl font-bold text-rose-700">
            {selectedChildFinance?.summary.overdueCount || 0} tagihan
          </p>
          <p className="mt-1 text-xs text-rose-600">
            {formatCurrency(selectedChildFinance?.summary.overdueAmount || 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Rata-rata Nilai</p>
          <p className="mt-2 text-xl font-bold text-blue-700">
            {reportCardQuery.isLoading ? '-' : (reportCardQuery.data?.average || 0).toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {activeYearName} • {semester === 'ODD' ? 'Semester Ganjil' : 'Semester Genap'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Saldo Kredit</p>
          <p className="mt-2 text-xl font-bold text-sky-700">
            {formatCurrency(selectedChildFinance?.summary.creditBalance || 0)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Kelebihan bayar anak</p>
        </div>
      </div>

      {actionCenter ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Pusat Tindak Lanjut</p>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">{actionCenter.headline}</h3>
              <p className="mt-2 text-sm text-gray-600">{actionCenter.detail}</p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold ${getFinanceActionCenterBadgeClass(actionCenter.state)}`}
            >
              {getFinanceActionCenterLabel(actionCenter.state)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-violet-100 bg-violet-50/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-violet-700">Termin Berikutnya</p>
              <p className="mt-2 text-sm font-semibold text-violet-900">
                {actionCenter.nextDue?.invoiceNo || 'Belum ada agenda'}
              </p>
              <p className="mt-1 text-xs text-violet-700">
                {actionCenter.nextDue?.dueDate
                  ? `${formatDate(actionCenter.nextDue.dueDate)} • ${formatCurrency(actionCenter.nextDue.balanceAmount)}`
                  : 'Tidak ada termin aktif yang perlu dipantau'}
              </p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-amber-700">Potensi Denda</p>
              <p className="mt-2 text-sm font-semibold text-amber-900">
                {formatCurrency(actionCenter.pendingLateFeeAmount)}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                {actionCenter.overdueInstallmentCount} termin overdue • diterapkan{' '}
                {formatCurrency(actionCenter.appliedLateFeeAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-sky-700">Saldo Kredit & Refund</p>
              <p className="mt-2 text-sm font-semibold text-sky-900">
                {formatCurrency(actionCenter.creditBalanceAmount)}
              </p>
              <p className="mt-1 text-xs text-sky-700">
                {latestRefund
                  ? `Refund terakhir ${latestRefund.refundNo} • ${formatDate(latestRefund.refundedAt)}`
                  : 'Belum ada refund saldo kredit'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Kirim Bukti Bayar</p>
            <h3 className="mt-2 text-lg font-semibold text-gray-900">Pembayaran Non-Tunai Anak</h3>
            <p className="mt-2 text-sm text-gray-600">
              Pilih tagihan anak, unggah bukti transfer/VA/e-wallet/QRIS, lalu sistem akan memasukkannya ke antrean verifikasi bendahara.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Verifikasi Manual
          </span>
        </div>

        {!selectedChildFinance || !outstandingInvoices.length ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Belum ada tagihan aktif untuk anak yang dipilih.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tagihan</label>
              <select
                value={selectedInvoice?.id || ''}
                onChange={(event) => {
                  const invoice = outstandingInvoices.find((row) => row.id === Number(event.target.value)) || null;
                  setSelectedInvoiceId(invoice?.id || null);
                  setPaymentAmount(invoice ? String(Math.round(invoice.balanceAmount || 0)) : '');
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                {outstandingInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNo} • {formatCurrency(invoice.balanceAmount)}
                  </option>
                ))}
              </select>
              {selectedInvoice ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  {selectedInvoice.title || `${selectedInvoice.periodKey} • ${selectedInvoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}`}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Metode</label>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="BANK_TRANSFER">Transfer Bank</option>
                <option value="VIRTUAL_ACCOUNT">Virtual Account</option>
                <option value="E_WALLET">E-Wallet</option>
                <option value="QRIS">QRIS</option>
                <option value="OTHER">Metode Lain</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rekening Tujuan</label>
              <select
                value={bankAccountId}
                onChange={(event) => setBankAccountId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="">Pilih rekening</option>
                {(bankAccountsQuery.data || []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nominal</label>
              <input
                type="number"
                min={1}
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Referensi</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                placeholder="Nomor referensi transfer / VA / QRIS"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal Bayar</label>
              <input
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Catatan</label>
              <textarea
                rows={3}
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="Catatan tambahan untuk bendahara"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bukti Pembayaran</label>
              <input
                id="parent-finance-proof-input"
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-[11px] text-gray-500">Format gambar atau PDF, maksimal 3 MB.</p>
            </div>

            <div className="md:col-span-2 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs text-gray-500">
                {selectedInvoice
                  ? `Anak: ${selectedChildFinance.student.name} • ${selectedInvoice.invoiceNo} • outstanding ${formatCurrency(selectedInvoice.balanceAmount)}`
                  : 'Pilih tagihan aktif lebih dulu.'}
              </div>
              <button
                type="button"
                onClick={() => void handleSubmitPayment()}
                disabled={isSubmittingPayment || bankAccountsQuery.isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmittingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Kirim Bukti Bayar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Tagihan & Riwayat Pembayaran</h3>
            <button
              type="button"
              onClick={() => financeQuery.refetch()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Muat Ulang
            </button>
          </div>
          {financeQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : financeQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data pembayaran.</div>
          ) : !selectedChildFinance ? (
            <div className="py-10 text-center text-sm text-gray-500">Data keuangan anak belum tersedia.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div>
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Tagihan Siswa</h4>
                </div>
                {!selectedChildFinance.invoices.length ? (
                  <div className="py-8 text-center text-sm text-gray-500">Belum ada tagihan untuk anak ini.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Invoice
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Jatuh Tempo
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sisa
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedChildFinance.invoices.map((invoice) => (
                          <tr key={invoice.id}>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              <div className="font-medium text-gray-900">{invoice.invoiceNo}</div>
                              <div className="text-xs text-gray-500">
                                {invoice.title ||
                                  `${invoice.periodKey} • ${invoice.semester === 'ODD' ? 'Ganjil' : 'Genap'}`}
                              </div>
                              {invoice.items.length ? (
                                <div className="mt-1 text-[11px] text-gray-500">
                                  Komponen: {invoice.items.map((item) => item.componentName).join(' • ')}
                                </div>
                              ) : null}
                              <div className="mt-1 text-[11px] text-violet-700">
                                {invoice.installmentSummary.totalCount} termin • {invoice.installmentSummary.paidCount} lunas
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {formatDate(invoice.dueDate || '')}
                              {invoice.isOverdue ? (
                                <div className="text-xs text-rose-600">
                                  Terlambat {invoice.daysPastDue} hari
                                </div>
                              ) : null}
                              {invoice.installmentSummary.nextInstallment ? (
                                <div className="mt-1 text-[11px] text-violet-700">
                                  Termin berikutnya: {invoice.installmentSummary.nextInstallment.sequence} •{' '}
                                  {formatDate(invoice.installmentSummary.nextInstallment.dueDate || '')}
                                </div>
                              ) : null}
                              {invoice.installmentSummary.overdueCount > 0 ? (
                                <div className="mt-1 text-[11px] text-rose-600">
                                  {invoice.installmentSummary.overdueCount} termin overdue • outstanding{' '}
                                  {formatCurrency(invoice.installmentSummary.overdueAmount)}
                                </div>
                              ) : null}
                              {invoice.lateFeeSummary?.configured ? (
                                <div className="mt-1 text-[11px] text-amber-700">
                                  Denda keterlambatan: {formatCurrency(invoice.lateFeeSummary.appliedAmount)} diterapkan
                                  {' • '}
                                  {formatCurrency(invoice.lateFeeSummary.pendingAmount)} berpotensi ditambahkan
                                </div>
                              ) : null}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                              {formatCurrency(invoice.balanceAmount)}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${INVOICE_STATUS_COLOR[invoice.status]}`}
                              >
                                {INVOICE_STATUS_LABELS[invoice.status]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Riwayat Pembayaran</h4>
                </div>
                {!selectedChildFinance.payments.length ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    Belum ada histori pembayaran untuk anak ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Tanggal
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Jenis
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Nominal
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedChildFinance.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="px-6 py-4 text-sm text-gray-700">{formatDate(payment.createdAt)}</td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {payment.type === 'MONTHLY' ? 'Bulanan' : 'Sekali Bayar'}
                              <div className="mt-1 text-[11px] text-gray-500">
                                {getParentPaymentSourceLabel(payment.source)}
                              </div>
                              <div className="mt-1 text-[11px] text-gray-500">
                                {getParentPaymentMethodLabel(payment.method)}
                                {payment.referenceNo ? ` • Ref ${payment.referenceNo}` : ''}
                              </div>
                              <div className="mt-1">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getParentVerificationBadgeClass(payment.verificationStatus)}`}
                                >
                                  {getParentVerificationLabel(payment.verificationStatus)}
                                </span>
                              </div>
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
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                              {formatCurrency(payment.amount)}
                              {Number(payment.creditedAmount || 0) > 0 ? (
                                <div className="mt-1 text-[11px] font-normal text-sky-700">
                                  Kredit: {formatCurrency(payment.creditedAmount || 0)}
                                </div>
                              ) : null}
                              {Number(payment.reversedAmount || 0) > 0 ? (
                                <div className="mt-1 text-[11px] font-normal text-rose-700">
                                  Direversal: {formatCurrency(payment.reversedAmount || 0)}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${PAYMENT_STATUS_COLOR[payment.status]}`}
                              >
                                {PAYMENT_STATUS_LABELS[payment.status]}
                              </span>
                              {Number(payment.creditedAmount || 0) > 0 ? (
                                <div className="mt-1 text-[11px] text-gray-500">
                                  Dialokasikan: {formatCurrency(payment.allocatedAmount || 0)}
                                </div>
                              ) : null}
                              {Number(payment.reversedAmount || 0) > 0 ? (
                                <div className="mt-1 text-[11px] text-rose-600">
                                  Dikoreksi: alokasi dibalik {formatCurrency(payment.reversedAllocatedAmount || 0)}
                                  {Number(payment.reversedCreditedAmount || 0) > 0
                                    ? ` • saldo kredit dibalik ${formatCurrency(payment.reversedCreditedAmount || 0)}`
                                    : ''}
                                </div>
                              ) : null}
                              {payment.verificationNote ? (
                                <div className="mt-1 text-[11px] text-gray-500">
                                  Catatan verifikasi: {payment.verificationNote}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Saldo Kredit & Refund</h3>
              <p className="text-xs text-gray-500 mt-1">
                Pantau refund saldo kredit anak dan kelebihan bayar yang masih aktif.
              </p>
            </div>

            {selectedChildFinance?.creditBalance.refunds?.length ? (
              <>
                <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                  <p className="text-[11px] text-sky-700">Saldo kredit aktif</p>
                  <p className="text-sm font-semibold text-sky-900 mt-1">
                    {formatCurrency(selectedChildFinance.creditBalance.balanceAmount)}
                  </p>
                </div>
                <div className="space-y-3">
                  {selectedChildFinance.creditBalance.refunds.map((refund) => (
                    <div key={refund.id} className="rounded-lg border border-gray-100 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{refund.refundNo}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(refund.refundedAt)} • {getParentPaymentMethodLabel(refund.method)}
                            {refund.referenceNo ? ` • Ref ${refund.referenceNo}` : ''}
                          </p>
                          {refund.note ? (
                            <p className="mt-1 text-xs text-gray-500">{refund.note}</p>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-sky-800">{formatCurrency(refund.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-gray-100 px-3 py-2 text-xs text-gray-500">
                {selectedChildFinance?.creditBalance.balanceAmount
                  ? `Belum ada refund. Saldo kredit aktif saat ini ${formatCurrency(selectedChildFinance.creditBalance.balanceAmount)}.`
                  : 'Belum ada saldo kredit maupun refund untuk anak yang dipilih.'}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Ringkasan Akademik</h3>
            <p className="text-xs text-gray-500 mt-1">Diambil dari rapor anak pada tahun ajaran aktif.</p>
          </div>

          {reportCardQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : reportCardQuery.isError ? (
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Gagal memuat ringkasan akademik.
            </div>
          ) : reportCardQuery.data ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-100 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Mata Pelajaran</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{reportCardQuery.data.reportGrades.length}</p>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Nilai Tertinggi</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{highestScore?.toFixed(1) || '-'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 px-3 py-2">
                <p className="text-[11px] text-gray-500">Rekap Kehadiran (Rapor)</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <span>Hadir: {reportCardQuery.data.attendanceSummary.hadir}</span>
                  <span>Sakit: {reportCardQuery.data.attendanceSummary.sakit}</span>
                  <span>Izin: {reportCardQuery.data.attendanceSummary.izin}</span>
                  <span>Alpha: {reportCardQuery.data.attendanceSummary.alpha}</span>
                </div>
              </div>

              <Link
                to={`/parent/attendance${selectedChildId ? `?childId=${selectedChildId}` : ''}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                <CalendarDays className="w-4 h-4" />
                Lihat Absensi Anak
              </Link>
            </>
          ) : (
            <div className="rounded-lg border border-gray-100 px-3 py-2 text-xs text-gray-500">
              Data rapor belum tersedia untuk periode ini.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

const ParentAttendancePage = () => {
  const { isParent, children, childrenQuery } = useParentChildrenData();
  const [searchParams] = useSearchParams();
  const [selectedChildIdState, setSelectedChildIdState] = useState<number | null>(null);
  const [cursorDate, setCursorDate] = useState(() => new Date());

  const selectedChildId = useMemo(() => {
    if (!children.length) return null;
    if (selectedChildIdState && children.some((child) => child.id === selectedChildIdState)) {
      return selectedChildIdState;
    }
    const fromQuery = Number(searchParams.get('childId') || 0);
    const validQuery = fromQuery > 0 && children.some((child) => child.id === fromQuery);
    return validQuery ? fromQuery : children[0]?.id || null;
  }, [children, searchParams, selectedChildIdState]);

  const month = cursorDate.getMonth() + 1;
  const year = cursorDate.getFullYear();

  const attendanceQuery = useQuery({
    queryKey: ['parent-attendance-web', selectedChildId, year, month],
    enabled: isParent && !!selectedChildId,
    queryFn: async () => {
      const response = await api.get('/attendances/student-history', {
        params: {
          student_id: selectedChildId,
          month,
          year,
        },
      });
      return (response.data?.data || []) as ParentAttendanceRecord[];
    },
  });

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) || null,
    [children, selectedChildId],
  );

  const stats = useMemo(() => {
    const records = attendanceQuery.data || [];
    return records.reduce(
      (acc, item) => {
        if (item.status === 'PRESENT') acc.present += 1;
        if (item.status === 'SICK') acc.sick += 1;
        if (item.status === 'PERMISSION') acc.permission += 1;
        if (item.status === 'ABSENT' || item.status === 'ALPHA') acc.absent += 1;
        if (item.status === 'LATE') acc.late += 1;
        return acc;
      },
      { present: 0, sick: 0, permission: 0, absent: 0, late: 0 },
    );
  }, [attendanceQuery.data]);

  const moveMonth = (offset: number) => {
    setCursorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  if (!isParent && !childrenQuery.isLoading) {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Halaman ini khusus untuk role orang tua.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absensi Anak"
        subtitle="Pantau kehadiran harian anak berdasarkan periode bulan."
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {children.map((child) => {
              const selected = selectedChildId === child.id;
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedChildIdState(child.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    selected
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {child.name}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Bulan Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Bulan Berikutnya
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selectedChild && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">{selectedChild.name}</p>
            <p className="text-xs text-gray-500 mt-1">
              {selectedChild.studentClass?.name || '-'} • NISN: {selectedChild.nisn || '-'}
            </p>
          </div>
        )}

        <p className="text-sm font-medium text-gray-800">
          {cursorDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-center">
          <p className="text-[11px] text-gray-500">Hadir</p>
          <p className="mt-1 text-sm font-semibold text-emerald-700">{stats.present}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-center">
          <p className="text-[11px] text-gray-500">Sakit</p>
          <p className="mt-1 text-sm font-semibold text-blue-700">{stats.sick}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-center">
          <p className="text-[11px] text-gray-500">Izin</p>
          <p className="mt-1 text-sm font-semibold text-amber-700">{stats.permission}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-center">
          <p className="text-[11px] text-gray-500">Alpha</p>
          <p className="mt-1 text-sm font-semibold text-rose-700">{stats.absent}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-center">
          <p className="text-[11px] text-gray-500">Telat</p>
          <p className="mt-1 text-sm font-semibold text-orange-700">{stats.late}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {attendanceQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : attendanceQuery.isError ? (
          <div className="py-10 text-center text-sm text-red-600">Gagal memuat riwayat absensi anak.</div>
        ) : (attendanceQuery.data || []).length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Tidak ada data absensi pada periode ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(attendanceQuery.data || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatDate(item.date)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ATTENDANCE_STATUS_COLOR[item.status]}`}>
                        {ATTENDANCE_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const ParentDashboard = () => {
  return (
    <Routes>
      <Route index element={<ParentOverviewPage />} />
      <Route path="dashboard" element={<ParentOverviewPage />} />
      <Route path="overview" element={<ParentOverviewPage />} />
      <Route path="children" element={<ParentChildrenPage />} />
      <Route path="finance" element={<ParentFinancePage />} />
      <Route path="attendance" element={<ParentAttendancePage />} />
      <Route path="profile" element={<UserProfilePage />} />
      <Route path="*" element={<Navigate to="overview" replace />} />
    </Routes>
  );
};
