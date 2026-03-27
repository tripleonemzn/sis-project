import { useMemo, useState, type FormEvent } from 'react';
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
import api from '../../services/api';
import { normalizeNisnInput } from '../../utils/nisn';

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
  method?: 'CASH' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'OTHER' | null;
  referenceNo?: string | null;
  invoiceId?: number | null;
  invoiceNo?: string | null;
  periodKey?: string | null;
  semester?: SemesterCode | null;
  createdAt: string;
  updatedAt: string;
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
      <PageHeader
        title="Dashboard Orang Tua"
        subtitle="Ringkasan anak, keuangan, dan akses cepat modul parent."
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

  const highestScore = useMemo(() => {
    const grades = reportCardQuery.data?.reportGrades || [];
    if (!grades.length) return null;
    return grades.reduce((max, item) => (item.finalScore > max ? item.finalScore : max), grades[0].finalScore);
  }, [reportCardQuery.data?.reportGrades]);

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
      <Route path="*" element={<Navigate to="overview" replace />} />
    </Routes>
  );
};
