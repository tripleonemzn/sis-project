import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2, Search } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { workProgramService } from '../../../../services/workProgram.service';
import { liveQueryOptions } from '../../../../lib/query/liveQuery';
import { isAdvisorDuty } from '../../../../utils/advisorDuty';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const DUTY_LABELS: Record<string, string> = {
  KAPROG: 'Kepala Kompetensi Keahlian',
  WAKASEK_KURIKULUM: 'Wakasek Kurikulum',
  WAKASEK_SARPRAS: 'Wakasek Sarpras',
  WAKASEK_KESISWAAN: 'Wakasek Kesiswaan',
  WAKASEK_HUMAS: 'Wakasek Humas',
  PEMBINA_EKSKUL: 'Pembina Ekstrakurikuler',
  PEMBINA_OSIS: 'Pembina OSIS',
  WALI_KELAS: 'Wali Kelas',
  GURU_MAPEL: 'Guru Mapel',
  GURU: 'Guru',
  UMUM: 'Umum / Non Jabatan',
};

const toDutyLabel = (value?: string | null): string => {
  const key = String(value || 'UMUM').trim().toUpperCase();
  if (!key) return DUTY_LABELS.UMUM;
  return DUTY_LABELS[key] || key.replace(/_/g, ' ');
};

const toDutyKey = (value?: string | null): string => {
  const key = String(value || 'UMUM').trim().toUpperCase();
  return key || 'UMUM';
};

type WorkProgramApprovalItem = {
  id: number;
  title: string;
  description?: string | null;
  additionalDuty?: string | null;
  owner?: {
    name?: string | null;
  } | null;
  academicYear?: {
    name?: string | null;
  } | null;
  major?: {
    id: number;
    name?: string | null;
    code?: string | null;
  } | null;
  semester?: 'ODD' | 'EVEN' | null;
  month?: number | null;
  startMonth?: number | null;
  endMonth?: number | null;
  startWeek?: number | null;
  endWeek?: number | null;
  feedback?: string | null;
};

export default function WorkProgramApprovalsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPrincipalView = location.pathname.startsWith('/principal/');
  const isReadOnly = ['1', 'true', 'yes'].includes(
    String(searchParams.get('readonly') || '').trim().toLowerCase(),
  );
  const focusProgramId = Number(searchParams.get('focusProgramId') || 0);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [action, setAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['work-programs', 'pending-approvals', isReadOnly ? 'readonly' : 'approver'],
    queryFn: () => workProgramService.listPendingForApproval({ includeReviewed: isReadOnly }),
    retry: false,
    ...liveQueryOptions,
  });

  const allPrograms = useMemo<WorkProgramApprovalItem[]>(
    () => (Array.isArray(data?.data) ? (data.data as WorkProgramApprovalItem[]) : []),
    [data],
  );

  const filteredPrograms = useMemo(
    () => {
      const all = allPrograms;
      if (!search.trim()) return all;
      const term = search.toLowerCase();
      return all.filter((p) => {
        return (
          p.title.toLowerCase().includes(term) ||
          (p.owner?.name && p.owner.name.toLowerCase().includes(term)) ||
          (p.academicYear?.name && p.academicYear.name.toLowerCase().includes(term)) ||
          (p.major?.name && p.major.name.toLowerCase().includes(term)) ||
          (p.major?.code && p.major.code.toLowerCase().includes(term))
        );
      });
    },
    [allPrograms, search],
  );

  const groupsByDuty = useMemo(
    () => isPrincipalView || allPrograms.some((program) => isAdvisorDuty(program.additionalDuty)),
    [allPrograms, isPrincipalView],
  );

  const getGroupKey = useCallback((program: WorkProgramApprovalItem): string => {
    if (groupsByDuty) {
      return `DUTY:${toDutyKey(program.additionalDuty)}`;
    }
    const majorId = program.major?.id ?? null;
    return `MAJOR:${majorId !== null ? String(majorId) : 'NO_MAJOR'}`;
  }, [groupsByDuty]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        code: string;
        count: number;
      }
    >();

    for (const p of filteredPrograms) {
      const key = getGroupKey(p);
      const name = groupsByDuty
        ? toDutyLabel(p.additionalDuty)
        : p.major?.name || 'Umum / Non Kompetensi';
      const code = groupsByDuty ? 'JABATAN' : p.major?.code || 'NON KOMPETENSI';
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, name, code, count: 1 });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredPrograms, getGroupKey, groupsByDuty]);

  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  const visiblePrograms = useMemo(() => {
    if (!groups.length) return filteredPrograms;
    const hasSelected = selectedGroupKey && groups.some((g) => g.key === selectedGroupKey);
    const activeKey = hasSelected ? selectedGroupKey : groups[0].key;
    return filteredPrograms.filter((p) => getGroupKey(p) === activeKey);
  }, [filteredPrograms, getGroupKey, groups, selectedGroupKey]);

  useEffect(() => {
    if (!focusProgramId || isReadOnly) return;
    const target = filteredPrograms.find((program) => Number(program.id) === focusProgramId);
    if (!target) return;

    const targetGroup = getGroupKey(target);
    if (selectedGroupKey !== targetGroup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGroupKey(targetGroup);
      return;
    }

    if (selectedId !== focusProgramId) {
      setSelectedId(focusProgramId);
      setFeedback(target.feedback || '');
      setAction('APPROVED');
    }
  }, [focusProgramId, filteredPrograms, isReadOnly, selectedGroupKey, selectedId, getGroupKey]);

  const approvalMutation = useMutation({
    mutationFn: async (payload: { id: number; status: 'APPROVED' | 'REJECTED'; feedback?: string }) =>
      workProgramService.updateApprovalStatus(payload.id, {
        status: payload.status,
        feedback: payload.feedback,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs', 'pending-approvals'] });
      toast.success('Status program kerja berhasil diperbarui');
      setSelectedId(null);
      setFeedback('');
      setAction('APPROVED');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui status program kerja');
    },
  });

  const bulkApprovalMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) =>
          workProgramService.updateApprovalStatus(id, {
            status: 'APPROVED',
          }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs', 'pending-approvals'] });
      toast.success('Semua program kerja dalam kompetensi ini berhasil disetujui');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menyetujui semua program kerja');
    },
  });

  const selectedProgram = visiblePrograms.find((p) => p.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Persetujuan Program Kerja</h1>
          <p className="text-gray-500 text-sm">
            {isReadOnly
              ? 'Mode monitor (read-only) untuk melihat progres program kerja pembina ekskul.'
              : isPrincipalView
              ? 'Kelola program kerja lintas jabatan pengaju secara dinamis.'
              : groupsByDuty
              ? 'Kelola program kerja pembina OSIS dan pembina ekstrakurikuler yang menunggu persetujuan Anda.'
              : 'Kelola program kerja yang diajukan oleh guru dan KAKOM.'}
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={
                groupsByDuty
                  ? 'Cari judul program kerja atau nama pengaju...'
                  : 'Cari judul program kerja atau nama guru...'
              }
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500">
            Total menunggu persetujuan:{' '}
            <span className="font-semibold text-gray-800">{filteredPrograms.length}</span>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {groups.map((group) => {
              const isActive =
                (selectedGroupKey ?? groups[0].key) === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setSelectedGroupKey(group.key)}
                  className={`min-w-[220px] px-4 py-3 rounded-lg border text-left transition ${
                    isActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-500">
                    {group.code || (groupsByDuty ? 'UMUM' : 'NON KOMPETENSI')}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mt-0.5">
                    {group.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{group.count} program menunggu persetujuan</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-gray-500">
            Menampilkan{' '}
            <span className="font-semibold text-gray-800">{visiblePrograms.length}</span>{' '}
            dari{' '}
            <span className="font-semibold text-gray-800">{filteredPrograms.length}</span>{' '}
            program menunggu persetujuan
          </div>
          {!isReadOnly && visiblePrograms.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (bulkApprovalMutation.isPending) return;
                const ids = visiblePrograms
                  .map((p) => Number(p.id))
                  .filter((id) => Number.isFinite(id));
                if (!ids.length) return;
                const confirmed = window.confirm(
                  groupsByDuty
                    ? 'Setujui semua program kerja pada jabatan ini?'
                    : 'Setujui semua program kerja yang ditampilkan pada kompetensi ini?',
                );
                if (!confirmed) return;
                bulkApprovalMutation.mutate(ids);
              }}
              disabled={bulkApprovalMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {bulkApprovalMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Setujui Semua di Tab Ini
            </button>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Program Kerja
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pengaju / Jabatan
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tahun Ajaran
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Semester
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bulan
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Minggu ke
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500 text-sm">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memuat data program kerja...</span>
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading && isError && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-red-500 text-sm">
                      {getErrorMessage(error) || 'Gagal memuat data program kerja.'}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && filteredPrograms.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500 text-sm">
                      Tidak ada program kerja yang menunggu persetujuan.
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  visiblePrograms.map((program) => (
                    <tr key={program.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{program.title}</div>
                        {program.description && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {program.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{program.owner?.name || '-'}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{toDutyLabel(program.additionalDuty)}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {program.academicYear?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {program.semester === 'ODD'
                          ? 'Ganjil'
                          : program.semester === 'EVEN'
                          ? 'Genap'
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {(() => {
                          const start =
                            program.startMonth ?? program.month ?? null;
                          const endRaw =
                            program.endMonth ??
                            program.startMonth ??
                            program.month ??
                            null;
                          if (!start || start < 1 || start > 12) return '-';
                          const startName = MONTH_NAMES[start - 1];
                          if (!endRaw || endRaw === start) return startName;
                          if (endRaw < 1 || endRaw > 12) return startName;
                          const endName = MONTH_NAMES[endRaw - 1];
                          return `${startName} - ${endName}`;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {(() => {
                          const start = program.startWeek ?? null;
                          const endRaw =
                            program.endWeek ?? program.startWeek ?? null;
                          if (!start) return '-';
                          if (!endRaw || endRaw === start) return `Minggu ke ${start}`;
                          return `Minggu ke ${start} s/d ${endRaw}`;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {isReadOnly ? (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Read Only
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(program.id);
                              setFeedback(program.feedback || '');
                              setAction('APPROVED');
                            }}
                            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            Tinjau & Proses
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {!isReadOnly && selectedProgram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            if (!approvalMutation.isPending) {
              setSelectedId(null);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-blue-50/70">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                {action === 'APPROVED' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {action === 'APPROVED' ? 'Setujui Program Kerja' : 'Tolak Program Kerja'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {action === 'APPROVED'
                    ? 'Program kerja akan ditandai sebagai disetujui.'
                    : 'Program kerja akan ditandai sebagai ditolak.'}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900">{selectedProgram.title}</div>
                <div className="text-xs text-gray-500">
                  {selectedProgram.owner?.name || '-'} •{' '}
                  {selectedProgram.academicYear?.name || '-'}
                </div>
                {selectedProgram.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {selectedProgram.description}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Keputusan</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAction('APPROVED')}
                      className={`px-3 py-1.5 text-xs rounded-full border ${
                        action === 'APPROVED'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('REJECTED')}
                      className={`px-3 py-1.5 text-xs rounded-full border ${
                        action === 'REJECTED'
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Tolak
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Catatan (opsional)
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    placeholder="Contoh: Program kerja sudah sesuai / perlu revisi anggaran, dll."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!approvalMutation.isPending) {
                    setSelectedId(null);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                disabled={approvalMutation.isPending}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedProgram || approvalMutation.isPending) return;
                  approvalMutation.mutate({
                    id: selectedProgram.id,
                    status: action,
                    feedback: feedback.trim() || undefined,
                  });
                }}
                disabled={approvalMutation.isPending}
                className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white ${
                  action === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                } ${approvalMutation.isPending ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {approvalMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {action === 'APPROVED' ? 'Setujui Program' : 'Tolak Program'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
