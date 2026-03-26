import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../services/academicYear.service';
import {
  budgetRequestService,
  type BudgetRequest,
} from '../../services/budgetRequest.service';
import {
  Loader2,
  Search,
  Filter,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { authService } from '../../services/auth.service';
import StaffFinancePage from './StaffFinancePage';
import { staffFinanceService, type FinanceReportSnapshot } from '../../services/staffFinance.service';
import {
  budgetLpjService,
  type BudgetLpjInvoice,
  type LpjInvoiceStatus,
} from '../../services/budgetLpj.service';
import { userService } from '../../services/user.service';
import toast from 'react-hot-toast';
import { isFinanceStaffProfile } from '../../utils/staffRole';

type FinanceLpjInvoice = BudgetLpjInvoice & {
  budgetRequest: {
    id: number;
    title?: string | null;
    description?: string | null;
    totalAmount: number;
    additionalDuty: string;
    requester?: {
      id: number;
      name: string;
    } | null;
  };
};

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

function getPriorityBadgeClass(priority: 'MONITOR' | 'TINGGI' | 'KRITIS') {
  if (priority === 'KRITIS') return 'bg-rose-50 text-rose-700 border border-rose-200';
  if (priority === 'TINGGI') return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-sky-50 text-sky-700 border border-sky-200';
}

function getDueSoonLabel(daysUntilDue: number) {
  if (daysUntilDue <= 0) return 'Hari ini';
  if (daysUntilDue === 1) return '1 hari lagi';
  return `${daysUntilDue} hari lagi`;
}

export const StaffFinanceWorkspace = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/staff';

  const isDashboardPage =
    normalizedPath === '/staff' ||
    normalizedPath === '/staff/dashboard';
  const isAdminPage =
    normalizedPath.startsWith('/staff/finance/operations') ||
    normalizedPath.startsWith('/staff/admin');
  const isPaymentsPage =
    normalizedPath === '/staff/finance' ||
    normalizedPath.startsWith('/staff/payments');
  const isStudentsPage =
    normalizedPath.startsWith('/staff/finance/students') ||
    normalizedPath.startsWith('/staff/students');
  const shouldLoadBudgets = isAdminPage || isDashboardPage;

  const { data: meResponse } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5,
  });

  const currentUser = meResponse?.data as
    | {
        additionalDuties?: string[];
        role?: string;
        ptkType?: string;
      }
    | undefined;

  const financeDuties = ((currentUser?.additionalDuties || []) as string[]).map((d) =>
    String(d).trim().toUpperCase(),
  );

  const isFinanceStaff =
    isFinanceStaffProfile(currentUser, { allowAdmin: true }) || financeDuties.includes('BENDAHARA');

  const { data: yearsData } = useQuery({
    queryKey: ['academic-years', 'staff-finance'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    enabled: isPaymentsPage || isDashboardPage,
  });

  const academicYears: AcademicYear[] =
    yearsData?.data?.academicYears || yearsData?.academicYears || [];

  const activeYear = academicYears.find((y) => y.isActive) || academicYears[0];

  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'ALL',
  );
  const [search, setSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('ALL');
  const [selectedForConfirm, setSelectedForConfirm] = useState<BudgetRequest | null>(null);
  const [selectedFinanceLpj, setSelectedFinanceLpj] = useState<FinanceLpjInvoice | null>(null);
  const [financeNoteDraft, setFinanceNoteDraft] = useState('');

  const effectiveYearId = useMemo(
    () => (selectedYearId === 'all' ? undefined : selectedYearId || activeYear?.id),
    [selectedYearId, activeYear],
  );

  const { data: budgetsData, isLoading } = useQuery({
    queryKey: ['budget-requests', 'staff', isPaymentsPage ? effectiveYearId : 'all'],
    queryFn: () =>
      budgetRequestService.list({
        academicYearId: isPaymentsPage ? effectiveYearId : undefined,
        view: 'approver',
      }),
    enabled: shouldLoadBudgets && (isAdminPage || !!activeYear),
  });

  const allBudgets: BudgetRequest[] = useMemo(
    () => budgetsData?.data || budgetsData || [],
    [budgetsData],
  );

  const { data: financeLpjData } = useQuery({
    queryKey: ['budget-lpj', 'finance'],
    queryFn: () => budgetLpjService.listForFinance(),
    enabled: isAdminPage && isFinanceStaff,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    initialData: {
      data: {
        invoices: [],
      },
    },
  });

  const financeInvoices: FinanceLpjInvoice[] =
    (financeLpjData?.data?.invoices as FinanceLpjInvoice[]) || [];

  const financeDecisionMutation = useMutation({
    mutationFn: ({
      invoiceId,
      action,
      financeNote,
    }: {
      invoiceId: number;
      action: 'PROCESS' | 'COMPLETE' | 'RETURN';
      financeNote?: string;
    }) => budgetLpjService.financeDecision(invoiceId, { action, financeNote }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget-lpj', 'finance'] });
      queryClient.invalidateQueries({ queryKey: ['budget-lpj'] });
      const successLabel =
        variables.action === 'PROCESS'
          ? 'LPJ masuk tahap proses keuangan'
          : variables.action === 'COMPLETE'
            ? 'LPJ pembelanjaan selesai diproses'
            : 'LPJ dikembalikan ke pengaju';
      toast.success(successLabel);
      if (selectedFinanceLpj) {
        setSelectedFinanceLpj({
          ...selectedFinanceLpj,
          status:
            variables.action === 'PROCESS'
              ? 'PROCESSING_FINANCE'
              : variables.action === 'COMPLETE'
                ? 'COMPLETED'
                : 'RETURNED_BY_FINANCE',
          financeNote: variables.financeNote?.trim() || null,
        });
      }
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses LPJ keuangan');
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['staff-students-web'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    enabled: isStudentsPage || isAdminPage || isDashboardPage,
    staleTime: 5 * 60 * 1000,
  });

  const students = useMemo(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);
  const dashboardSnapshotQuery = useQuery({
    queryKey: ['staff-finance-dashboard', activeYear?.id || 'none'],
    queryFn: () =>
      staffFinanceService.listReports({
        academicYearId: activeYear?.id,
      }),
    enabled: isDashboardPage && Boolean(activeYear?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const dashboardSnapshot = dashboardSnapshotQuery.data as FinanceReportSnapshot | undefined;

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((student) => {
      if (student.studentClass?.id && student.studentClass?.name) {
        map.set(String(student.studentClass.id), student.studentClass.name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const normalizedStudentSearch = studentSearch.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      if (studentClassFilter !== 'ALL' && String(student.studentClass?.id || '') !== studentClassFilter) {
        return false;
      }

      if (!normalizedStudentSearch) return true;
      const haystacks = [
        student.name || '',
        student.nis || '',
        student.nisn || '',
        student.studentClass?.name || '',
        student.studentClass?.major?.name || '',
      ];
      return haystacks.some((item) => item.toLowerCase().includes(normalizedStudentSearch));
    });
  }, [students, studentClassFilter, normalizedStudentSearch]);

  const recentPendingBudgets = useMemo(
    () => allBudgets.filter((item) => item.status === 'PENDING').slice(0, 6),
    [allBudgets],
  );

  let budgets = allBudgets;
  if (isAdminPage && statusFilter !== 'ALL') {
    budgets = budgets.filter((b) => b.status === statusFilter);
  }

  const searchTerm = search.trim().toLowerCase();
  if (isAdminPage && searchTerm) {
    budgets = budgets.filter((b) => {
      const title = (b.title || '').toLowerCase();
      const desc = (b.description || '').toLowerCase();
      const requester = (b.requester?.name || '').toLowerCase();
      return (
        title.includes(searchTerm) || desc.includes(searchTerm) || requester.includes(searchTerm)
      );
    });
  }

  const confirmRealizationMutation = useMutation({
    mutationFn: (id: number) => budgetRequestService.confirmRealization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success('Realisasi anggaran dikonfirmasi');
      setSelectedForConfirm(null);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengkonfirmasi realisasi anggaran');
    },
  });

  const handleConfirm = () => {
    if (!selectedForConfirm) return;
    confirmRealizationMutation.mutate(selectedForConfirm.id);
  };

  const openFinanceInvoice = (invoice: FinanceLpjInvoice) => {
    setSelectedFinanceLpj(invoice);
    setFinanceNoteDraft(invoice.financeNote || '');
  };

  const getFinanceStatusMeta = (status: LpjInvoiceStatus) => {
    switch (status) {
      case 'SENT_TO_FINANCE':
        return {
          label: 'Menunggu proses keuangan',
          className: 'bg-amber-50 text-amber-700',
        };
      case 'PROCESSING_FINANCE':
        return {
          label: 'Sedang diproses keuangan',
          className: 'bg-blue-50 text-blue-700',
        };
      case 'COMPLETED':
        return {
          label: 'Selesai diproses',
          className: 'bg-emerald-50 text-emerald-700',
        };
      case 'RETURNED_BY_FINANCE':
        return {
          label: 'Dikembalikan ke pengaju',
          className: 'bg-red-50 text-red-700',
        };
      default:
        return {
          label: status,
          className: 'bg-gray-50 text-gray-700',
        };
    }
  };

  if (isStudentsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">Daftar siswa untuk kebutuhan administrasi staff.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama, NIS, NISN, kelas"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 w-72"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={studentClassFilter}
                onChange={(e) => setStudentClassFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="ALL">Semua Kelas</option>
                {classOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => studentsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {studentsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : studentsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data siswa.</div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data siswa yang cocok dengan filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS / NISN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-gray-500">@{student.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIS: {student.nis || '-'}</div>
                        <div>NISN: {student.nisn || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {student.studentClass?.name || '-'}
                        {student.studentClass?.major?.code ? ` (${student.studentClass.major.code})` : ''}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {student.studentStatus || '-'} / {student.verificationStatus || '-'}
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
  }

  if (isPaymentsPage) {
    return <StaffFinancePage />;
  }

  if (isDashboardPage) {
    const dashboardSummary = dashboardSnapshot?.summary;
    const dashboardKpi = dashboardSnapshot?.kpi;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard Staff Keuangan</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ringkasan tagihan siswa, kolektibilitas pembayaran, dan prioritas operasional.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Link to="/staff/finance/students" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
              <p className="text-xs uppercase tracking-wider text-blue-700/80">Data Siswa</p>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {studentsQuery.isLoading ? '-' : students.length.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-blue-800/70">Total siswa terdaftar</p>
            </div>
          </Link>
          <Link to="/staff/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
              <p className="text-xs uppercase tracking-wider text-violet-700/80">Total Tagihan</p>
              <p className="mt-2 text-2xl font-bold text-violet-900">
                {dashboardSnapshotQuery.isLoading || !dashboardSummary ? '-' : dashboardSummary.totalInvoices.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-violet-800/70">Invoice aktif</p>
            </div>
          </Link>
          <Link to="/staff/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
              <p className="text-xs uppercase tracking-wider text-orange-700/80">Outstanding</p>
              <p className="mt-2 text-xl font-bold text-orange-900">
                {dashboardSnapshotQuery.isLoading || !dashboardSummary
                  ? '-'
                  : `Rp ${dashboardSummary.totalOutstanding.toLocaleString('id-ID')}`}
              </p>
              <p className="mt-1 text-xs text-orange-800/70">Belum terbayar</p>
            </div>
          </Link>
          <Link to="/staff/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
              <p className="text-xs uppercase tracking-wider text-emerald-700/80">Terbayar</p>
              <p className="mt-2 text-xl font-bold text-emerald-900">
                {dashboardSnapshotQuery.isLoading || !dashboardSummary
                  ? '-'
                  : `Rp ${dashboardSummary.totalPaid.toLocaleString('id-ID')}`}
              </p>
              <p className="mt-1 text-xs text-emerald-800/70">Pembayaran tercatat</p>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">KPI Kolektibilitas</h3>
            {dashboardSnapshotQuery.isLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : !dashboardKpi ? (
              <p className="text-sm text-gray-500">Data KPI belum tersedia.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  Collection rate:{' '}
                  <span className="font-semibold text-emerald-700">{dashboardKpi.collectionRate.toFixed(1)}%</span>
                </p>
                <p className="text-gray-700">
                  Overdue rate:{' '}
                  <span className="font-semibold text-amber-700">{dashboardKpi.overdueRate.toFixed(1)}%</span>
                </p>
                <p className="text-gray-700">
                  DSO:{' '}
                  <span className="font-semibold text-blue-700">{dashboardKpi.dsoDays.toFixed(1)} hari</span>
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Pengajuan Menunggu Tindak Lanjut</h3>
              <button
                type="button"
                onClick={() => {
                  void studentsQuery.refetch();
                  void dashboardSnapshotQuery.refetch();
                  queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
                }}
                className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Muat Ulang
              </button>
            </div>
            {isLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : recentPendingBudgets.length === 0 ? (
              <p className="text-sm text-gray-500">Tidak ada pengajuan pending saat ini.</p>
            ) : (
              <div className="space-y-3">
                {recentPendingBudgets.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                    <p className="text-sm font-semibold text-gray-900">{item.title || 'Tanpa judul'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Pengaju: {item.requester?.name || '-'} • Rp{' '}
                      {Number(item.totalAmount || 0).toLocaleString('id-ID')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-rose-100 bg-rose-50/70 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-rose-700/80">Siswa Follow Up</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">
              {dashboardSnapshotQuery.isLoading || !dashboardSnapshot
                ? '-'
                : dashboardSnapshot.collectionOverview.studentsWithOutstanding.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-rose-800/70">Memiliki saldo outstanding aktif</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-amber-700/80">Prioritas Tinggi</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">
              {dashboardSnapshotQuery.isLoading || !dashboardSnapshot
                ? '-'
                : dashboardSnapshot.collectionOverview.highPriorityCount.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-amber-800/70">Butuh penagihan aktif</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50/70 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-rose-700/80">Kasus Kritis</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">
              {dashboardSnapshotQuery.isLoading || !dashboardSnapshot
                ? '-'
                : dashboardSnapshot.collectionOverview.criticalCount.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-rose-800/70">Outstanding besar / terlambat lama</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-sky-700/80">Jatuh Tempo 7 Hari</p>
            <p className="mt-2 text-xl font-bold text-sky-900">
              {dashboardSnapshotQuery.isLoading || !dashboardSnapshot
                ? '-'
                : dashboardSnapshot.collectionOverview.dueSoonCount.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-sky-800/70">
              {dashboardSnapshotQuery.isLoading || !dashboardSnapshot
                ? 'Menunggu data'
                : formatCurrency(dashboardSnapshot.collectionOverview.dueSoonOutstanding)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Antrian Penagihan Prioritas</h3>
            {dashboardSnapshotQuery.isLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : !dashboardSnapshot || dashboardSnapshot.collectionPriorityQueue.length === 0 ? (
              <p className="text-sm text-gray-500">Belum ada saldo outstanding aktif.</p>
            ) : (
              <div className="space-y-3">
                {dashboardSnapshot.collectionPriorityQueue.slice(0, 5).map((row) => (
                  <div key={row.studentId} className="rounded-lg border border-gray-100 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{row.studentName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {row.className} • {row.nis || row.username}
                        </p>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPriorityBadgeClass(row.priority)}`}>
                        {row.priority}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      Outstanding <span className="font-semibold text-gray-900">{formatCurrency(row.totalOutstanding)}</span> • overdue {formatCurrency(row.overdueOutstanding)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Max lewat {row.maxDaysPastDue} hari • pembayaran terakhir {formatDate(row.lastPaymentDate)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Tagihan Jatuh Tempo Dekat</h3>
            {dashboardSnapshotQuery.isLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : !dashboardSnapshot || dashboardSnapshot.dueSoonInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">Tidak ada tagihan jatuh tempo dalam 7 hari.</p>
            ) : (
              <div className="space-y-3">
                {dashboardSnapshot.dueSoonInvoices.slice(0, 5).map((row) => (
                  <div key={row.invoiceId} className="rounded-lg border border-gray-100 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{row.studentName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {row.invoiceNo} • {row.className}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        {getDueSoonLabel(row.daysUntilDue)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-sky-900 mt-2">{formatCurrency(row.balanceAmount)}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Jatuh tempo {formatDate(row.dueDate)} • {row.title || row.periodKey}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Komponen Penyumbang Tunggakan</h3>
            {dashboardSnapshotQuery.isLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : !dashboardSnapshot || dashboardSnapshot.componentReceivableRecap.length === 0 ? (
              <p className="text-sm text-gray-500">Belum ada outstanding per komponen.</p>
            ) : (
              <div className="space-y-3">
                {dashboardSnapshot.componentReceivableRecap.slice(0, 5).map((row) => (
                  <div key={`${row.componentCode}-${row.componentName}`} className="rounded-lg border border-gray-100 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{row.componentName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {row.componentCode || '-'} • {row.studentCount} siswa
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-amber-700">{formatCurrency(row.totalOutstanding)}</p>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                      Overdue {formatCurrency(row.overdueOutstanding)} • {row.invoiceCount} invoice aktif
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            to="/staff/finance"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Buka Pembayaran
          </Link>
          <Link
            to="/staff/finance/operations"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Buka Administrasi
          </Link>
          <Link
            to="/staff/finance/students"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Buka Data Siswa
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdminPage && !isPaymentsPage) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Dashboard Staff</h2>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-gray-700 text-sm">
            Pilih menu di sidebar untuk mengelola pembayaran SPP atau administrasi.
          </p>
        </div>
      </div>
    );
  }

  const totalAmount = budgets.reduce((sum, b) => sum + b.totalAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Realisasi Pengajuan Anggaran</h2>
          <p className="mt-1 text-sm text-gray-500">
            Konfirmasi realisasi pengajuan anggaran yang telah disetujui Kepala Sekolah.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari uraian, judul, atau pengaju..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED')
              }
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">Menunggu</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Ditolak</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tahun Ajaran
            </span>
            <select
              value={selectedYearId === 'all' ? 'all' : String(selectedYearId || activeYear?.id || '')}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'all') {
                  setSelectedYearId('all');
                } else {
                  setSelectedYearId(Number(value));
                }
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="all">Semua</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isActive ? ' (Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">
            Total Nominal Pengajuan
          </span>
          <span className="text-lg font-bold text-blue-600">
            Rp {totalAmount.toLocaleString('id-ID')}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5">
            {budgets.length} pengajuan ditemukan
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : budgets.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada pengajuan anggaran yang menunggu realisasi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uraian / Kegiatan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit / Jabatan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pengaju
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QTY
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Harga Satuan
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tahap
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {budgets.map((budget, index) => {
                  const isConfirmed = !!budget.realizationConfirmedAt;
                  const hasLpj = !!budget.lpjSubmittedAt;

                  let stageLabel = 'Menunggu persetujuan Kepala Sekolah';
                  if (budget.status === 'APPROVED' && !isConfirmed) {
                    stageLabel = 'Menunggu konfirmasi realisasi';
                  } else if (isConfirmed && !hasLpj) {
                    stageLabel = 'Menunggu LPJ dari pengaju';
                  } else if (isConfirmed && hasLpj) {
                    stageLabel = 'Selesai (LPJ diterima)';
                  } else if (budget.status === 'REJECTED') {
                    stageLabel = 'Ditolak Kepala Sekolah';
                  }

                  return (
                    <tr key={budget.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium text-gray-900">{budget.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{budget.description}</div>
                        {budget.executionTime && (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-[11px] text-blue-700 font-medium">
                            Jadwal: {budget.executionTime}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-700 font-medium">
                          {budget.additionalDuty.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {budget.requester?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {budget.quantity}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        Rp {budget.unitPrice.toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        Rp {budget.totalAmount.toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="px-2 inline-flex text-xs leading-5 font-medium rounded-full bg-gray-50 text-gray-700">
                          {stageLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {budget.status === 'APPROVED' && !isConfirmed ? (
                          <button
                            onClick={() => setSelectedForConfirm(budget)}
                            disabled={confirmRealizationMutation.isPending}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Konfirmasi Realisasi
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Tidak ada aksi</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isFinanceStaff && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">LPJ Untuk Keuangan</h2>
              <p className="mt-1 text-xs text-gray-500">
                Daftar LPJ yang telah disetujui Wakasek Sarpras dan diteruskan ke keuangan.
              </p>
            </div>
          </div>
          {financeInvoices.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              Belum ada LPJ yang perlu diproses keuangan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uraian / Kegiatan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit / Jabatan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pengaju
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tahap
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Diteruskan Keuangan
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeInvoices.map((invoice, index) => {
                    const budget = invoice.budgetRequest;
                    const sentAt = invoice.sentToFinanceAt
                      ? new Date(invoice.sentToFinanceAt).toLocaleString('id-ID')
                      : '-';
                    const stage = getFinanceStatusMeta(invoice.status);

                    return (
                      <tr key={invoice.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="font-medium text-gray-900">
                            {budget.title || invoice.title || '-'}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {budget.description || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-700 font-medium">
                            {budget.additionalDuty.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {budget.requester?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          Rp {budget.totalAmount.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 text-sm text-center">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-medium rounded-full ${stage.className}`}
                          >
                            {stage.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-500">
                          {sentAt}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => openFinanceInvoice(invoice)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
                          >
                            <Eye className="w-3 h-3" />
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedForConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setSelectedForConfirm(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-emerald-50/60">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Konfirmasi Realisasi Anggaran</h3>
                <p className="text-xs text-gray-500">
                  Pastikan dana sudah direalisasikan sebelum melakukan konfirmasi.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedForConfirm.title}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedForConfirm.description}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedForConfirm(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmRealizationMutation.isPending}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {confirmRealizationMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedFinanceLpj && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35"
          onClick={() => {
            if (!financeDecisionMutation.isPending) {
              setSelectedFinanceLpj(null);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 bg-blue-50/60 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">Detail LPJ Pembelanjaan</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Telaah realisasi pembelanjaan sebelum diproses oleh bagian keuangan.
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  getFinanceStatusMeta(selectedFinanceLpj.status).className
                }`}
              >
                {getFinanceStatusMeta(selectedFinanceLpj.status).label}
              </span>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(90vh-150px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    Uraian / Kegiatan
                  </p>
                  <p className="font-semibold text-gray-900">
                    {selectedFinanceLpj.budgetRequest.title || selectedFinanceLpj.title || '-'}
                  </p>
                  <p className="text-gray-500">
                    {selectedFinanceLpj.budgetRequest.description || '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    Pengaju
                  </p>
                  <p className="font-semibold text-gray-900">
                    {selectedFinanceLpj.budgetRequest.requester?.name || '-'}
                  </p>
                  <p className="text-gray-500">
                    Duty: {selectedFinanceLpj.budgetRequest.additionalDuty.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    Total Anggaran
                  </p>
                  <p className="font-semibold text-gray-900">
                    Rp {selectedFinanceLpj.budgetRequest.totalAmount.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    Timeline Keuangan
                  </p>
                  <p className="text-gray-700">
                    Diteruskan: {selectedFinanceLpj.sentToFinanceAt ? new Date(selectedFinanceLpj.sentToFinanceAt).toLocaleString('id-ID') : '-'}
                  </p>
                  <p className="text-gray-700">
                    Diproses: {selectedFinanceLpj.financeProcessedAt ? new Date(selectedFinanceLpj.financeProcessedAt).toLocaleString('id-ID') : '-'}
                  </p>
                  <p className="text-gray-700">
                    Selesai: {selectedFinanceLpj.financeCompletedAt ? new Date(selectedFinanceLpj.financeCompletedAt).toLocaleString('id-ID') : '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-900">Dokumen Pendukung</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedFinanceLpj.invoiceFileUrl ? (
                      <a
                        href={selectedFinanceLpj.invoiceFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
                      >
                        Lihat Invoice
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Invoice belum diunggah</span>
                    )}
                    {selectedFinanceLpj.proofFileUrl ? (
                      <a
                        href={selectedFinanceLpj.proofFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                      >
                        Lihat Bukti
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Bukti pembelian belum diunggah</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-900">Catatan Audit Sarpras</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {selectedFinanceLpj.auditReport || 'Belum ada catatan audit dari sarpras.'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-900">Rincian Pembelanjaan</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                          Barang
                        </th>
                        <th className="px-4 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                          Brand
                        </th>
                        <th className="px-4 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                          Qty
                        </th>
                        <th className="px-4 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                          Harga
                        </th>
                        <th className="px-4 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                          Jumlah
                        </th>
                        <th className="px-4 py-2 text-center text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                          Audit Sarpras
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedFinanceLpj.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-xs text-gray-900">{item.description}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{item.brand || '-'}</td>
                          <td className="px-4 py-2 text-xs text-right text-gray-900">{item.quantity}</td>
                          <td className="px-4 py-2 text-xs text-right text-gray-900">
                            Rp {item.unitPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-2 text-xs text-right font-semibold text-gray-900">
                            Rp {item.amount.toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-2 text-xs text-center">
                            {typeof item.isMatched === 'boolean' ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  item.isMatched ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {item.isMatched ? 'Sesuai' : 'Tidak sesuai'}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400">Belum diaudit</span>
                            )}
                            {item.auditNote && (
                              <p className="mt-1 text-[11px] text-red-600">{item.auditNote}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Catatan Bagian Keuangan
                </label>
                <textarea
                  value={financeNoteDraft}
                  onChange={(e) => setFinanceNoteDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  placeholder="Catatan hasil verifikasi, pengembalian, atau penyelesaian LPJ..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedFinanceLpj(null)}
                disabled={financeDecisionMutation.isPending}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Tutup
              </button>
              <div className="flex flex-wrap justify-end gap-2">
                {['SENT_TO_FINANCE', 'RETURNED_BY_FINANCE'].includes(selectedFinanceLpj.status) && (
                  <button
                    type="button"
                    onClick={() =>
                      financeDecisionMutation.mutate({
                        invoiceId: selectedFinanceLpj.id,
                        action: 'PROCESS',
                        financeNote: financeNoteDraft,
                      })
                    }
                    disabled={financeDecisionMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    Proses Keuangan
                  </button>
                )}
                {['SENT_TO_FINANCE', 'PROCESSING_FINANCE'].includes(selectedFinanceLpj.status) && (
                  <button
                    type="button"
                    onClick={() =>
                      financeDecisionMutation.mutate({
                        invoiceId: selectedFinanceLpj.id,
                        action: 'RETURN',
                        financeNote: financeNoteDraft,
                      })
                    }
                    disabled={financeDecisionMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    Kembalikan ke Pengaju
                  </button>
                )}
                {['SENT_TO_FINANCE', 'PROCESSING_FINANCE'].includes(selectedFinanceLpj.status) && (
                  <button
                    type="button"
                    onClick={() =>
                      financeDecisionMutation.mutate({
                        invoiceId: selectedFinanceLpj.id,
                        action: 'COMPLETE',
                        financeNote: financeNoteDraft,
                      })
                    }
                    disabled={financeDecisionMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Tandai Selesai
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffFinanceWorkspace;
