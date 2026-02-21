import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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

  const isAdminPage = location.pathname.startsWith('/staff/admin');

  const { data: meResponse } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5,
  });

  const currentUser: any = meResponse?.data;

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
    enabled: isAdminPage,
  });

  const academicYears: AcademicYear[] =
    yearsData?.data?.academicYears || yearsData?.academicYears || [];

  const activeYear = academicYears.find((y) => y.isActive) || academicYears[0];

  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'ALL',
  );
  const [search, setSearch] = useState('');
  const [selectedForConfirm, setSelectedForConfirm] = useState<BudgetRequest | null>(null);

  const effectiveYearId = useMemo(
    () => (selectedYearId === 'all' ? undefined : selectedYearId || activeYear?.id),
    [selectedYearId, activeYear],
  );

  const { data: budgetsData, isLoading } = useQuery({
    queryKey: ['budget-requests', 'staff', effectiveYearId],
    queryFn: () =>
      budgetRequestService.list({
        academicYearId: effectiveYearId,
        view: 'approver',
      }),
    enabled: isAdminPage && !!activeYear,
  });

  let budgets: BudgetRequest[] = budgetsData?.data || budgetsData || [];

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

  if (statusFilter !== 'ALL') {
    budgets = budgets.filter((b) => b.status === statusFilter);
  }

  const searchTerm = search.trim().toLowerCase();
  if (searchTerm) {
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
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal mengkonfirmasi realisasi anggaran');
    },
  });

  const handleConfirm = () => {
    if (!selectedForConfirm) return;
    confirmRealizationMutation.mutate(selectedForConfirm.id);
  };

  if (!isAdminPage) {
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
              onChange={(e) => setStatusFilter(e.target.value as any)}
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
