import { useMemo, useState } from 'react';
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
import { authService } from '../../services/auth.service';
import { userService } from '../../services/user.service';
import { academicYearService } from '../../services/academicYear.service';
import api from '../../services/api';

type SemesterCode = 'ODD' | 'EVEN';
type ParentPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
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

interface ParentPayment {
  id: number;
  amount: number;
  status: ParentPaymentStatus;
  type: 'MONTHLY' | 'ONE_TIME';
  createdAt: string;
  updatedAt: string;
}

interface ParentChildFinanceOverview {
  student: ParentChild;
  summary: {
    totalRecords: number;
    totalAmount: number;
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
  };
  payments: ParentPayment[];
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
    monthlyAmount: number;
    oneTimeAmount: number;
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

function normalizeChildIds(me: ParentMePayload | undefined): number[] {
  const rawChildren = Array.isArray(me?.children) ? me.children : [];
  return rawChildren
    .map((child) => Number(child?.id || 0))
    .filter((id: number) => Number.isInteger(id) && id > 0);
}

function useParentChildrenData() {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const me = meQuery.data?.data as ParentMePayload | undefined;
  const isParent = me?.role === 'PARENT';
  const childIds = useMemo(() => normalizeChildIds(me), [me]);

  const childrenQuery = useQuery({
    queryKey: ['parent-children-web', childIds.join(',')],
    enabled: isParent,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!childIds.length) return [] as ParentChild[];
      const rows = await Promise.all(
        childIds.map(async (id: number) => {
          try {
            const response = await userService.getById(id);
            return (response?.data || null) as ParentChild | null;
          } catch {
            return null;
          }
        }),
      );
      return rows.filter(Boolean) as ParentChild[];
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
          <p className="mt-1 text-xs text-orange-800/70">Pending + parsial</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/parent/children"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          <Users className="w-4 h-4" />
          Data Anak
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
  const [search, setSearch] = useState('');

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Anak"
        subtitle="Daftar anak yang terhubung dengan akun orang tua."
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {childrenQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : childrenQuery.isError ? (
          <div className="py-10 text-center text-sm text-red-600">Gagal memuat data anak.</div>
        ) : filteredChildren.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Tidak ada data anak yang cocok dengan filter.</div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
          <p className="text-xs uppercase tracking-wider text-gray-500">Rata-rata Nilai</p>
          <p className="mt-2 text-xl font-bold text-blue-700">
            {reportCardQuery.isLoading ? '-' : (reportCardQuery.data?.average || 0).toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {activeYearName} • {semester === 'ODD' ? 'Semester Ganjil' : 'Semester Genap'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Riwayat Pembayaran</h3>
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
          ) : !selectedChildFinance || selectedChildFinance.payments.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada histori pembayaran untuk anak ini.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nominal</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {selectedChildFinance.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">{formatDate(payment.createdAt)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{payment.type === 'MONTHLY' ? 'Bulanan' : 'Sekali Bayar'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">{formatCurrency(payment.amount)}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${PAYMENT_STATUS_COLOR[payment.status]}`}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
