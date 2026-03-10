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
} from 'lucide-react';
import { authService } from '../../services/auth.service';
import {
  budgetLpjService,
  type BudgetLpjInvoice,
} from '../../services/budgetLpj.service';
import { userService } from '../../services/user.service';
import toast from 'react-hot-toast';

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

export const StaffDashboard = () => {
  const location = useLocation();
  const queryClient = useQueryClient();

  const isAdminPage =
    location.pathname === '/staff' ||
    location.pathname === '/staff/' ||
    location.pathname.startsWith('/staff/admin') ||
    location.pathname.startsWith('/staff/dashboard');
  const isPaymentsPage = location.pathname.startsWith('/staff/payments');
  const isStudentsPage = location.pathname.startsWith('/staff/students');
  const isFinancePage = isPaymentsPage;
  const shouldLoadBudgets = isAdminPage || isPaymentsPage;

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
    (currentUser?.role === 'STAFF' && currentUser?.ptkType === 'STAFF_KEUANGAN') ||
    financeDuties.includes('BENDAHARA') ||
    currentUser?.role === 'ADMIN';

  const { data: yearsData } = useQuery({
    queryKey: ['academic-years', 'staff-finance'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    enabled: isPaymentsPage,
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
    enabled: isFinancePage && isFinanceStaff,
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

  const studentsQuery = useQuery({
    queryKey: ['staff-students-web'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    enabled: isStudentsPage || isAdminPage,
    staleTime: 5 * 60 * 1000,
  });

  const students = useMemo(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);

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

  const adminSummary = useMemo(() => {
    const pending = allBudgets.filter((item) => item.status === 'PENDING').length;
    const approved = allBudgets.filter((item) => item.status === 'APPROVED').length;
    const rejected = allBudgets.filter((item) => item.status === 'REJECTED').length;
    const totalAmount = allBudgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    return {
      pending,
      approved,
      rejected,
      totalAmount,
    };
  }, [allBudgets]);

  const recentPendingBudgets = useMemo(
    () => allBudgets.filter((item) => item.status === 'PENDING').slice(0, 6),
    [allBudgets],
  );

  let budgets = allBudgets;
  if (isPaymentsPage && statusFilter !== 'ALL') {
    budgets = budgets.filter((b) => b.status === statusFilter);
  }

  const searchTerm = search.trim().toLowerCase();
  if (isPaymentsPage && searchTerm) {
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

  if (isAdminPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Administrasi Staff</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ringkasan pengajuan anggaran dan data siswa untuk kebutuhan operasional staff.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Link to="/staff/students" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Data Siswa</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">
              {studentsQuery.isLoading ? '-' : students.length.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-blue-800/70">Total siswa terdaftar</p>
          </div>
          </Link>
          <Link to="/staff/payments" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
          <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-teal-700/80">Total Pengajuan</p>
            <p className="mt-2 text-2xl font-bold text-teal-900">
              {isLoading ? '-' : allBudgets.length.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-teal-800/70">Pengajuan anggaran</p>
          </div>
          </Link>
          <Link to="/staff/payments" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
          <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-orange-700/80">Menunggu</p>
            <p className="mt-2 text-2xl font-bold text-orange-900">
              {isLoading ? '-' : adminSummary.pending.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-orange-800/70">Belum diproses</p>
          </div>
          </Link>
          <Link to="/staff/payments" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div className="rounded-xl border border-red-100 bg-gradient-to-br from-rose-50 to-red-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-rose-700/80">Total Nominal</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">
              {isLoading ? '-' : `Rp ${adminSummary.totalAmount.toLocaleString('id-ID')}`}
            </p>
            <p className="mt-1 text-xs text-rose-800/70">Akumulasi seluruh pengajuan</p>
          </div>
          </Link>
        </div>

        {(studentsQuery.isError || (!isLoading && !allBudgets.length && !students.length)) && (
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-600">
            {studentsQuery.isError
              ? 'Gagal memuat ringkasan data siswa.'
              : 'Belum ada data administrasi yang dapat ditampilkan saat ini.'}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Ringkasan Status Pengajuan</h3>
            {isLoading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  Menunggu:{' '}
                  <span className="font-semibold text-amber-700">
                    {adminSummary.pending.toLocaleString('id-ID')}
                  </span>
                </p>
                <p className="text-gray-700">
                  Disetujui:{' '}
                  <span className="font-semibold text-emerald-700">
                    {adminSummary.approved.toLocaleString('id-ID')}
                  </span>
                </p>
                <p className="text-gray-700">
                  Ditolak:{' '}
                  <span className="font-semibold text-rose-700">
                    {adminSummary.rejected.toLocaleString('id-ID')}
                  </span>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/staff/payments"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Buka Pembayaran
          </Link>
          <Link
            to="/staff/students"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Buka Data Siswa
          </Link>
        </div>
      </div>
    );
  }

  if (!isFinancePage) {
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeInvoices.map((invoice, index) => {
                    const budget = invoice.budgetRequest;
                    const sentAt = invoice.sentToFinanceAt
                      ? new Date(invoice.sentToFinanceAt).toLocaleString('id-ID')
                      : '-';

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
                          <span className="px-2 inline-flex text-xs leading-5 font-medium rounded-full bg-gray-50 text-gray-700">
                            Menunggu proses keuangan
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-500">
                          {sentAt}
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
    </div>
  );
};
