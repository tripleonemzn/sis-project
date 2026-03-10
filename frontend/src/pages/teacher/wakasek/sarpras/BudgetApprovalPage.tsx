import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { CheckCircle2, Loader2, Search, Filter, X } from 'lucide-react';
import {
  budgetRequestService,
  type BudgetRequest,
  type UpdateBudgetRequestStatusPayload,
} from '../../../../services/budgetRequest.service';
import { academicYearService, type AcademicYear } from '../../../../services/academicYear.service';
import { authService } from '../../../../services/auth.service';
import {
  budgetLpjService,
  type BudgetLpjInvoice,
} from '../../../../services/budgetLpj.service';
import { liveQueryOptions } from '../../../../lib/query/liveQuery';
import toast from 'react-hot-toast';

type BudgetApprovalContextUser = {
  role?: string;
  additionalDuties?: string[] | null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return err.response?.data?.message || err.message || fallback;
  }
  return fallback;
};

const BUDGET_STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;
type BudgetStatusFilter = (typeof BUDGET_STATUS_OPTIONS)[number];

export const BudgetApprovalPage = () => {
  const queryClient = useQueryClient();
  const { user: contextUser } = useOutletContext<{ user?: BudgetApprovalContextUser }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });

  const user = contextUser || authData?.data;
  const userDuties = ((user?.additionalDuties || []) as string[]).map((duty) =>
    String(duty || '').trim().toUpperCase(),
  );
  const isKesiswaanApprover =
    userDuties.includes('WAKASEK_KESISWAAN') || userDuties.includes('SEKRETARIS_KESISWAAN');

  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BudgetStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedForApprove, setSelectedForApprove] = useState<BudgetRequest | null>(null);
  const [selectedDuty, setSelectedDuty] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [lpjAuditModal, setLpjAuditModal] = useState<{
    isOpen: boolean;
    budget: BudgetRequest | null;
  }>({
    isOpen: false,
    budget: null,
  });

  const { data: yearsData } = useQuery({
    queryKey: ['academic-years', 'for-budgets'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] =
    yearsData?.data?.academicYears || yearsData?.academicYears || [];

  const activeYear = academicYears.find((y) => y.isActive) || academicYears[0];

  const effectiveYearId =
    selectedYearId === 'all' ? undefined : selectedYearId || activeYear?.id;

  const { data: budgetsData, isLoading } = useQuery({
    queryKey: ['budget-requests', 'sarpras', effectiveYearId],
    queryFn: () =>
      budgetRequestService.list({
        academicYearId: effectiveYearId,
        view: 'approver',
    }),
    enabled: !!user,
    ...liveQueryOptions,
  });

  const budgetsRaw = useMemo<BudgetRequest[]>(() => {
    if (Array.isArray(budgetsData?.data)) {
      return budgetsData.data as BudgetRequest[];
    }
    if (Array.isArray(budgetsData)) {
      return budgetsData as BudgetRequest[];
    }
    return [];
  }, [budgetsData]);

  const budgets = useMemo(() => {
    let next = budgetsRaw;
    if (statusFilter !== 'ALL') {
      next = next.filter((b) => b.status === statusFilter);
    }
    const searchTerm = search.trim().toLowerCase();
    if (!searchTerm) return next;
    return next.filter((b) => {
      const title = (b.title || '').toLowerCase();
      const desc = (b.description || '').toLowerCase();
      const requester = (b.requester?.name || '').toLowerCase();
      return title.includes(searchTerm) || desc.includes(searchTerm) || requester.includes(searchTerm);
    });
  }, [budgetsRaw, search, statusFilter]);

  const dutyGroups = useMemo(() => {
    const map = new Map<string, BudgetRequest[]>();
    budgets.forEach((b) => {
      const key =
        b.additionalDuty === 'KAPROG' && b.workProgram?.major?.name
          ? `KAPROG|${b.workProgram.major.name}`
          : b.additionalDuty;
      const current = map.get(key) || [];
      current.push(b);
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([groupKey, items]) => {
      const sample = items[0];
      const totalAmount = items.reduce((sum, b) => sum + b.totalAmount, 0);
      const pendingCount = items.filter((b) => b.status === 'PENDING').length;
      const approvedCount = items.filter((b) => b.status === 'APPROVED').length;
      const rejectedCount = items.filter((b) => b.status === 'REJECTED').length;

      const majorNameFromWorkProgram =
        items.find((b) => b.workProgram?.major?.name)?.workProgram?.major?.name;

      const majorNameFromRequester =
        items.find(
          (b) =>
            b.additionalDuty === 'KAPROG' &&
            Array.isArray(b.requester?.managedMajors) &&
            b.requester.managedMajors.length === 1 &&
            !!b.requester.managedMajors[0]?.name,
        )?.requester.managedMajors?.[0]?.name;

      const majorName = majorNameFromWorkProgram || majorNameFromRequester;

      let displayDuty = groupKey;
      if (sample.additionalDuty === 'KAPROG') {
        displayDuty = majorName ? `Kepala Kompetensi ${majorName}` : 'Kepala Kompetensi';
      } else {
        displayDuty = sample.additionalDuty.replace(/_/g, ' ');
      }

      return {
        key: groupKey,
        duty: displayDuty,
        rawDuty: sample.additionalDuty,
        items,
        totalAmount,
        pendingCount,
        approvedCount,
        rejectedCount,
      };
    });
  }, [budgets]);

  const getDutyLabel = (budget: BudgetRequest) => {
    if (budget.additionalDuty === 'KAPROG') {
      const majorNameFromWorkProgram = budget.workProgram?.major?.name;
      const majorNameFromRequester =
        Array.isArray(budget.requester?.managedMajors) &&
        budget.requester.managedMajors.length === 1
          ? budget.requester.managedMajors[0]?.name
          : undefined;
      const majorName = majorNameFromWorkProgram || majorNameFromRequester;
      if (majorName) {
        return `Kepala Kompetensi ${majorName}`;
      }
      return 'Kepala Kompetensi';
    }
    return budget.additionalDuty.replace(/_/g, ' ');
  };

  const updateStatusMutation = useMutation({
    mutationFn: (params: { id: number; payload: UpdateBudgetRequestStatusPayload }) =>
      budgetRequestService.updateStatus(params.id, params.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      queryClient.invalidateQueries({ queryKey: ['budget-requests', 'sarpras'] });
      toast.success('Status pengajuan anggaran diperbarui');
      setSelectedForApprove(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui status pengajuan'));
    },
  });

  const totalAmount = budgets.reduce((sum, b) => sum + b.totalAmount, 0);

  const visibleDutyGroups = dutyGroups;
  const selectedDutyGroup =
    selectedDuty != null ? dutyGroups.find((g) => g.key === selectedDuty) || null : null;
  const selectedDutyItems = selectedDutyGroup?.items ?? [];
  const selectedDutyTotal = selectedDutyItems.reduce(
    (sum, b) => sum + b.totalAmount,
    0,
  );

  const lpjAuditBudgetId = lpjAuditModal.budget?.id ?? null;

  const {
    data: lpjAuditData,
    isLoading: isLoadingLpjAudit,
  } = useQuery({
    queryKey: ['budget-lpj', lpjAuditBudgetId],
    queryFn: () => {
      if (!lpjAuditBudgetId) {
        throw new Error('LPJ belum dipilih');
      }
      return budgetLpjService.listByBudgetRequest(lpjAuditBudgetId);
    },
    enabled: !!lpjAuditBudgetId && lpjAuditModal.isOpen,
    ...liveQueryOptions,
  });

  const lpjAuditInvoices: BudgetLpjInvoice[] = lpjAuditData?.data.invoices || [];

  const auditItemMutation = useMutation({
    mutationFn: (params: { id: number; isMatched: boolean; auditNote?: string }) =>
      budgetLpjService.auditItem(params.id, {
        isMatched: params.isMatched,
        auditNote: params.auditNote,
      }),
    onSuccess: () => {
      if (lpjAuditBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjAuditBudgetId] });
      }
      toast.success('Hasil audit item LPJ disimpan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan hasil audit item LPJ'));
    },
  });

  const saveAuditReportMutation = useMutation({
    mutationFn: (params: { invoiceId: number; auditReport: string }) =>
      budgetLpjService.saveAuditReport(params.invoiceId, {
        auditReport: params.auditReport,
      }),
    onSuccess: () => {
      if (lpjAuditBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjAuditBudgetId] });
      }
      toast.success('Berita Acara LPJ disimpan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan Berita Acara LPJ'));
    },
  });

  const sarprasDecisionMutation = useMutation({
    mutationFn: (params: {
      invoiceId: number;
      action: 'APPROVE' | 'RETURN' | 'SEND_TO_FINANCE';
    }) =>
      budgetLpjService.sarprasDecision(params.invoiceId, {
        action: params.action,
      }),
    onSuccess: () => {
      if (lpjAuditBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjAuditBudgetId] });
      }
      queryClient.invalidateQueries({ queryKey: ['budget-requests', 'sarpras'] });
      toast.success('Keputusan LPJ berhasil disimpan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan keputusan LPJ'));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {isKesiswaanApprover ? 'Persetujuan Pengajuan Alat Ekskul' : 'Persetujuan Anggaran Sarpras'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isKesiswaanApprover
              ? 'Verifikasi awal pengajuan alat ekskul sebelum diteruskan ke Sarpras.'
              : 'Kelola pengajuan anggaran dari Program Kerja dan kebutuhan operasional.'}
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
              onChange={(e) => {
                const value = e.target.value as BudgetStatusFilter;
                if (BUDGET_STATUS_OPTIONS.includes(value)) {
                  setStatusFilter(value);
                }
              }}
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
            Total Nominal Terpilih
          </span>
          <span className="text-lg font-bold text-blue-600">
            Rp {totalAmount.toLocaleString('id-ID')}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5">
            {budgets.length} pengajuan ditemukan
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full flex items-center justify-center py-8 bg-white rounded-xl border border-gray-100">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : visibleDutyGroups.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-500">
              Belum ada pengajuan anggaran untuk filter ini.
            </div>
          ) : (
            visibleDutyGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() =>
                  setSelectedDuty((prev) =>
                    prev === group.key ? null : group.key,
                  )
                }
                className={`w-full text-left bg-white rounded-xl border ${
                  selectedDuty === group.duty
                    ? 'border-blue-500 shadow-md'
                    : 'border-gray-100 shadow-sm'
                } p-4 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Unit / Jabatan
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {group.duty}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-800 font-medium">
                        Menunggu: {group.pendingCount}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-800 font-medium">
                        Disetujui: {group.approvedCount}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-800 font-medium">
                        Ditolak: {group.rejectedCount}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">
                      Total Pengajuan
                    </div>
                    <div className="text-base font-bold text-blue-600">
                      Rp {group.totalAmount.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      {group.items.length} item pengajuan
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    Klik untuk {selectedDuty === group.duty ? 'menyembunyikan' : 'melihat'} detail
                  </span>
                  <span className="text-xs font-semibold text-blue-600">
                    Lihat detail pengajuan anggaran
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {selectedDuty && selectedDutyItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Detail Pengajuan Anggaran
                </div>
                <div className="text-sm text-gray-700">
                  {selectedDutyGroup?.duty || selectedDuty}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wider">
                    Total Anggaran Unit
                  </div>
                  <div className="text-sm font-semibold text-blue-600">
                    Rp {selectedDutyTotal.toLocaleString('id-ID')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDuty(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

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
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {selectedDutyItems.map((budget, index) => (
                    <tr key={budget.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium text-gray-900">{budget.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {budget.description}
                        </div>
                        {budget.executionTime && (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-[11px] text-blue-700 font-medium">
                            Jadwal: {budget.executionTime}
                          </div>
                        )}
                        {budget.brand && (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-700 font-medium">
                            Merek: {budget.brand}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-700 font-medium">
                          {getDutyLabel(budget)}
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
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            budget.status === 'APPROVED'
                              ? 'bg-green-100 text-green-800'
                              : budget.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {budget.status === 'APPROVED'
                            ? 'Disetujui'
                            : budget.status === 'REJECTED'
                            ? 'Ditolak'
                            : 'Menunggu'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {budget.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedForApprove(budget)}
                              disabled={updateStatusMutation.isPending}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {isKesiswaanApprover
                                ? 'Setujui & Kirim ke Sarpras'
                                : 'Setujui & Ajukan ke Principal'}
                            </button>
                            {(isKesiswaanApprover || budget.additionalDuty === 'PEMBINA_EKSKUL') && (
                              <button
                                type="button"
                                onClick={() => {
                                  const reason = window.prompt(
                                    'Masukkan alasan penolakan (opsional):',
                                    '',
                                  );
                                  if (reason === null) return;
                                  updateStatusMutation.mutate({
                                    id: budget.id,
                                    payload: {
                                      status: 'REJECTED',
                                      rejectionReason: reason.trim() || undefined,
                                    },
                                  });
                                }}
                                disabled={updateStatusMutation.isPending}
                                className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                              >
                                Tolak
                              </button>
                            )}
                          </div>
                        ) : budget.realizationConfirmedAt ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLpjAuditModal({
                                isOpen: true,
                                budget,
                              });
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
                          >
                            Audit LPJ
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Tidak ada aksi (status sudah diproses)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedForApprove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setSelectedForApprove(null);
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
                <h3 className="font-semibold text-gray-900">
                  {isKesiswaanApprover ? 'Setujui & Kirim ke Sarpras' : 'Setujui & Ajukan ke Principal'}
                </h3>
                <p className="text-xs text-gray-500">
                  {isKesiswaanApprover
                    ? 'Pengajuan alat ekskul yang disetujui akan diteruskan ke Wakasek Sarpras.'
                    : 'Pengajuan yang disetujui akan diteruskan ke Kepala Sekolah untuk proses persetujuan berikutnya.'}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedForApprove.title}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedForApprove.description}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {isKesiswaanApprover
                    ? 'Catatan untuk Wakasek Sarpras (opsional)'
                    : 'Rekomendasi untuk Kepala Sekolah (opsional)'}
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  placeholder={
                    isKesiswaanApprover
                      ? 'Contoh: Prioritas pembinaan lomba semester ini.'
                      : 'Contoh: Pengadaan ini prioritas karena menggantikan perangkat rusak, mohon dipertimbangkan.'
                  }
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedForApprove(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedForApprove) return;
                  updateStatusMutation.mutate({
                    id: selectedForApprove.id,
                    payload: {
                      status: 'APPROVED',
                      rejectionReason: recommendation.trim() || undefined,
                    },
                  });
                }}
                disabled={updateStatusMutation.isPending}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {updateStatusMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {isKesiswaanApprover ? 'Setujui & Kirim' : 'Setujui & Ajukan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lpjAuditModal.isOpen && lpjAuditModal.budget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setLpjAuditModal({ isOpen: false, budget: null });
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="font-semibold text-gray-900">Audit LPJ Anggaran</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {lpjAuditModal.budget.title || lpjAuditModal.budget.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLpjAuditModal({ isOpen: false, budget: null });
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {isLoadingLpjAudit ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : lpjAuditInvoices.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Belum ada LPJ yang diajukan oleh guru untuk anggaran ini.
                </p>
              ) : (
                <div className="space-y-4">
                  {lpjAuditInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50/60"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {invoice.title || 'Invoice LPJ'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Status:{' '}
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                invoice.status === 'APPROVED_BY_SARPRAS'
                                  ? 'bg-green-100 text-green-800'
                                  : invoice.status === 'SUBMITTED_TO_SARPRAS'
                                  ? 'bg-blue-100 text-blue-800'
                                  : invoice.status === 'RETURNED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {invoice.status === 'DRAFT' && 'Draft'}
                              {invoice.status === 'SUBMITTED_TO_SARPRAS' &&
                                'Diajukan ke Wakasek Sarpras'}
                              {invoice.status === 'RETURNED' && 'Dikembalikan'}
                              {invoice.status === 'APPROVED_BY_SARPRAS' && 'Disetujui Wakasek'}
                              {invoice.status === 'SENT_TO_FINANCE' && 'Diteruskan ke Keuangan'}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[11px]">
                          <div className="flex gap-2">
                            {invoice.invoiceFileUrl && (
                              <a
                                href={invoice.invoiceFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100"
                              >
                                Lihat Invoice
                              </a>
                            )}
                            {invoice.proofFileUrl && (
                              <a
                                href={invoice.proofFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100"
                              >
                                Lihat Bukti
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Barang
                              </th>
                              <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Brand
                              </th>
                              <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                QTY
                              </th>
                              <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Harga
                              </th>
                              <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Jumlah
                              </th>
                              <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                Audit
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {invoice.items.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-3 py-3 text-xs text-gray-500 text-center"
                                >
                                  Tidak ada item pada invoice ini.
                                </td>
                              </tr>
                            ) : (
                              invoice.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 text-xs text-gray-900">
                                    {item.description}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-500">
                                    {item.brand || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-900 text-right">
                                    {item.quantity}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-900 text-right">
                                    Rp {item.unitPrice.toLocaleString('id-ID')}
                                  </td>
                                  <td className="px-3 py-2 text-xs font-semibold text-gray-900 text-right">
                                    Rp {item.amount.toLocaleString('id-ID')}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    <div className="flex flex-col items-end gap-1">
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            auditItemMutation.mutate({
                                              id: item.id,
                                              isMatched: true,
                                              auditNote: item.auditNote || undefined,
                                            })
                                          }
                                          disabled={auditItemMutation.isPending}
                                          className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                          Sesuai
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            auditItemMutation.mutate({
                                              id: item.id,
                                              isMatched: false,
                                              auditNote: item.auditNote || undefined,
                                            })
                                          }
                                          disabled={auditItemMutation.isPending}
                                          className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-50"
                                        >
                                          Tidak Sesuai
                                        </button>
                                      </div>
                                      <div className="w-full">
                                        <textarea
                                          rows={2}
                                          defaultValue={item.auditNote || ''}
                                          className="w-full px-2 py-1 border border-gray-300 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                                          placeholder="Catatan audit (opsional)"
                                          onBlur={(e) => {
                                            const note = e.target.value.trim();
                                            if (!note && typeof item.isMatched !== 'boolean') {
                                              return;
                                            }
                                            const isMatched =
                                              typeof item.isMatched === 'boolean'
                                                ? item.isMatched
                                                : true;
                                            auditItemMutation.mutate({
                                              id: item.id,
                                              isMatched,
                                              auditNote: note || undefined,
                                            });
                                          }}
                                        />
                                        <div className="mt-0.5 text-[10px] text-gray-400 text-right">
                                          {typeof item.isMatched === 'boolean' ? (
                                            item.isMatched ? (
                                              <span className="text-emerald-600">
                                                Ditandai: Sesuai
                                              </span>
                                            ) : (
                                              <span className="text-red-600">
                                                Ditandai: Tidak Sesuai
                                              </span>
                                            )
                                          ) : (
                                            <span>Belum ditandai</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3">
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Berita Acara / Catatan Pemeriksaan
                        </label>
                        <textarea
                          rows={3}
                          defaultValue={invoice.auditReport || ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                          placeholder="Tuliskan Berita Acara singkat terkait pemeriksaan LPJ ini..."
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (!value) return;
                            saveAuditReportMutation.mutate({
                              invoiceId: invoice.id,
                              auditReport: value,
                            });
                          }}
                        />
                        <p className="mt-1 text-[11px] text-gray-400">
                          Berita Acara akan tersimpan otomatis saat Anda keluar dari kolom ini.
                        </p>
                      </div>
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-[11px] text-gray-500">
                          Setelah audit selesai, tentukan keputusan LPJ untuk melanjutkan proses.
                        </p>
                        <div className="flex justify-end gap-2">
                          {invoice.status === 'SUBMITTED_TO_SARPRAS' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  sarprasDecisionMutation.mutate({
                                    invoiceId: invoice.id,
                                    action: 'RETURN',
                                  })
                                }
                                disabled={sarprasDecisionMutation.isPending}
                                className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-50"
                              >
                                {sarprasDecisionMutation.isPending && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                Kembalikan ke Guru
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sarprasDecisionMutation.mutate({
                                    invoiceId: invoice.id,
                                    action: 'APPROVE',
                                  })
                                }
                                disabled={sarprasDecisionMutation.isPending}
                                className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {sarprasDecisionMutation.isPending && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                Setujui LPJ
                              </button>
                            </>
                          )}
                          {invoice.status === 'APPROVED_BY_SARPRAS' && (
                            <button
                              type="button"
                              onClick={() =>
                                sarprasDecisionMutation.mutate({
                                  invoiceId: invoice.id,
                                  action: 'SEND_TO_FINANCE',
                                })
                              }
                              disabled={sarprasDecisionMutation.isPending}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 disabled:opacity-50"
                            >
                              {sarprasDecisionMutation.isPending && (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              )}
                              Kirim ke Keuangan
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
