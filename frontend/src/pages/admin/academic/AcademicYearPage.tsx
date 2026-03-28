import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicYearService } from '../../../services/academicYear.service';
import type {
  AcademicFeatureFlags,
  AcademicPromotionWorkspace,
  AcademicPromotionWorkspaceClass,
  AcademicYear,
} from '../../../services/academicYear.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2,
  Plus,
  CheckCircle2,
  Trash2,
  Edit,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as {
      response?: {
        data?: {
          message?: string;
          errors?: string[];
        };
      };
    };
    if (Array.isArray(anyErr.response?.data?.errors) && anyErr.response?.data?.errors?.length) {
      return anyErr.response?.data?.errors?.[0] || anyErr.response?.data?.message || 'Terjadi kesalahan';
    }
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const schema = z.object({
  name: z.string().min(1, 'Nama tahun ajaran wajib diisi'),
  semester1Start: z.string().min(1, 'Tanggal mulai Semester 1 wajib diisi'),
  semester1End: z.string().min(1, 'Tanggal akhir Semester 1 wajib diisi'),
  semester2Start: z.string().min(1, 'Tanggal mulai Semester 2 wajib diisi'),
  semester2End: z.string().min(1, 'Tanggal akhir Semester 2 wajib diisi'),
  isActive: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;
type MappingDrafts = Record<number, number | null>;

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getResolvedTargetClassId(row: AcademicPromotionWorkspaceClass, drafts: MappingDrafts) {
  if (Object.prototype.hasOwnProperty.call(drafts, row.sourceClassId)) {
    return drafts[row.sourceClassId] ?? null;
  }
  return row.targetClassId ?? null;
}

export const AcademicYearPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [promotionSourceAcademicYearId, setPromotionSourceAcademicYearId] = useState('');
  const [promotionTargetAcademicYearId, setPromotionTargetAcademicYearId] = useState('');
  const [activateTargetYearAfterCommit, setActivateTargetYearAfterCommit] = useState(true);
  const [mappingDrafts, setMappingDrafts] = useState<MappingDrafts>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['academic-years', page, limit, debouncedSearch],
    queryFn: () => academicYearService.list({ page, limit, search: debouncedSearch }),
  });

  const { data: academicYearsOptionsData } = useQuery({
    queryKey: ['academic-years-options-all'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYearOptions = useMemo<AcademicYear[]>(
    () =>
      academicYearsOptionsData?.data?.academicYears ||
      academicYearsOptionsData?.academicYears ||
      [],
    [academicYearsOptionsData],
  );

  const promotionFeatureFlagsQuery = useQuery({
    queryKey: ['academic-feature-flags'],
    queryFn: () => academicYearService.getFeatureFlags(),
  });

  const promotionFeatureFlags: AcademicFeatureFlags | undefined = promotionFeatureFlagsQuery.data?.data;
  const isPromotionFeatureEnabled = promotionFeatureFlags?.academicPromotionV2Enabled === true;

  useEffect(() => {
    if (academicYearOptions.length === 0) return;

    const activeYear = academicYearOptions.find((item) => item.isActive) || academicYearOptions[0];
    if (!promotionSourceAcademicYearId) {
      setPromotionSourceAcademicYearId(String(activeYear.id));
    }
    if (!promotionTargetAcademicYearId) {
      const fallbackTarget =
        academicYearOptions.find((item) => item.id !== activeYear.id) || academicYearOptions[0];
      if (fallbackTarget) {
        setPromotionTargetAcademicYearId(String(fallbackTarget.id));
      }
    }
  }, [academicYearOptions, promotionSourceAcademicYearId, promotionTargetAcademicYearId]);

  const selectedSourceAcademicYearId = Number(promotionSourceAcademicYearId);
  const selectedTargetAcademicYearId = Number(promotionTargetAcademicYearId);
  const isPromotionSelectionValid =
    Number.isFinite(selectedSourceAcademicYearId) &&
    selectedSourceAcademicYearId > 0 &&
    Number.isFinite(selectedTargetAcademicYearId) &&
    selectedTargetAcademicYearId > 0 &&
    selectedSourceAcademicYearId !== selectedTargetAcademicYearId;

  const promotionWorkspaceQuery = useQuery({
    queryKey: ['academic-promotion-workspace', selectedSourceAcademicYearId, selectedTargetAcademicYearId],
    enabled: isPromotionFeatureEnabled && isPromotionSelectionValid,
    queryFn: () =>
      academicYearService.getPromotionWorkspace(selectedSourceAcademicYearId, selectedTargetAcademicYearId),
  });

  const promotionWorkspace: AcademicPromotionWorkspace | undefined = promotionWorkspaceQuery.data?.data;

  useEffect(() => {
    if (!promotionWorkspace) return;
    const nextDrafts: MappingDrafts = {};
    promotionWorkspace.classes.forEach((item) => {
      nextDrafts[item.sourceClassId] = item.targetClassId ?? null;
    });
    setMappingDrafts(nextDrafts);
  }, [promotionWorkspace]);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      semester1Start: '',
      semester1End: '',
      semester2Start: '',
      semester2End: '',
      isActive: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: academicYearService.create,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-years-options-all'] }),
      ]);
      toast.success('Tahun ajaran berhasil dibuat');
      setShowForm(false);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat tahun ajaran');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: payload }: { id: number; data: Partial<FormValues> }) =>
      academicYearService.update(id, payload as unknown as Partial<AcademicYear>),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-years-options-all'] }),
      ]);
      toast.success('Tahun ajaran berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui tahun ajaran');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => academicYearService.activate(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-years-options-all'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-promotion-workspace'] }),
      ]);
      toast.success('Tahun ajaran diaktifkan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengaktifkan tahun ajaran');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => academicYearService.remove(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-years-options-all'] }),
      ]);
      toast.success('Tahun ajaran dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus tahun ajaran');
    },
  });

  const savePromotionMappingsMutation = useMutation({
    mutationFn: async () => {
      if (!promotionWorkspace) {
        throw new Error('Workspace promotion belum tersedia.');
      }
      return academicYearService.savePromotionMappings(selectedSourceAcademicYearId, {
        targetAcademicYearId: selectedTargetAcademicYearId,
        mappings: promotionWorkspace.classes.map((item) => ({
          sourceClassId: item.sourceClassId,
          targetClassId:
            item.action === 'GRADUATE'
              ? null
              : getResolvedTargetClassId(item, mappingDrafts),
        })),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['academic-promotion-workspace', selectedSourceAcademicYearId, selectedTargetAcademicYearId],
      });
      toast.success('Mapping promotion berhasil disimpan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menyimpan mapping promotion');
    },
  });

  const commitPromotionMutation = useMutation({
    mutationFn: () =>
      academicYearService.commitPromotion(selectedSourceAcademicYearId, {
        targetAcademicYearId: selectedTargetAcademicYearId,
        activateTargetYear: activateTargetYearAfterCommit,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-years-options-all'] }),
        queryClient.invalidateQueries({ queryKey: ['academic-promotion-workspace'] }),
      ]);
      toast.success('Promotion berhasil di-commit');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal commit promotion');
    },
  });

  const onSubmit = (values: FormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
      return;
    }
    createMutation.mutate(values);
  };

  const handleEdit = (item: AcademicYear) => {
    setEditingId(item.id);
    setValue('name', item.name);
    setValue('semester1Start', item.semester1Start.split('T')[0]);
    setValue('semester1End', item.semester1End.split('T')[0]);
    setValue('semester2Start', item.semester2Start.split('T')[0]);
    setValue('semester2End', item.semester2End.split('T')[0]);
    setValue('isActive', item.isActive);
    setShowForm(true);
  };

  const resetPromotionDraftsToSuggested = () => {
    if (!promotionWorkspace) return;
    const nextDrafts: MappingDrafts = {};
    promotionWorkspace.classes.forEach((item) => {
      nextDrafts[item.sourceClassId] =
        item.action === 'GRADUATE' ? null : item.suggestedTargetClassId ?? null;
    });
    setMappingDrafts(nextDrafts);
  };

  const list: AcademicYear[] = data?.data?.academicYears || [];
  const pagination = data?.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tahun Ajaran</h1>
          <p className="text-gray-500">Kelola tahun ajaran, status aktif, dan promotion kenaikan kelas.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            <Plus size={18} />
            Tambah Tahun Ajaran
          </button>
        )}
      </div>

      {showForm ? (
        <div className="space-y-4 rounded-xl border-0 bg-white p-6 shadow-md">
          <h2 className="mb-4 border-b border-gray-100 pb-3 text-lg font-semibold text-gray-800">
            {editingId ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran Baru'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
                Nama Tahun Ajaran
              </label>
              <input
                id="name"
                {...register('name')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                placeholder="2026/2027"
                autoComplete="off"
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="semester1Start" className="mb-1 block text-sm font-medium text-gray-700">
                Semester Ganjil Mulai
              </label>
              <input
                id="semester1Start"
                type="date"
                {...register('semester1Start')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              {errors.semester1Start && <p className="mt-1 text-xs text-red-500">{errors.semester1Start.message}</p>}
            </div>

            <div>
              <label htmlFor="semester1End" className="mb-1 block text-sm font-medium text-gray-700">
                Semester Ganjil Akhir
              </label>
              <input
                id="semester1End"
                type="date"
                {...register('semester1End')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              {errors.semester1End && <p className="mt-1 text-xs text-red-500">{errors.semester1End.message}</p>}
            </div>

            <div>
              <label htmlFor="semester2Start" className="mb-1 block text-sm font-medium text-gray-700">
                Semester Genap Mulai
              </label>
              <input
                id="semester2Start"
                type="date"
                {...register('semester2Start')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              {errors.semester2Start && <p className="mt-1 text-xs text-red-500">{errors.semester2Start.message}</p>}
            </div>

            <div>
              <label htmlFor="semester2End" className="mb-1 block text-sm font-medium text-gray-700">
                Semester Genap Akhir
              </label>
              <input
                id="semester2End"
                type="date"
                {...register('semester2End')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              {errors.semester2End && <p className="mt-1 text-xs text-red-500">{errors.semester2End.message}</p>}
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              <input type="checkbox" id="isActive" {...register('isActive')} className="rounded border-gray-300" />
              <label htmlFor="isActive" className="text-sm text-gray-700">
                Set sebagai Tahun Ajaran Aktif
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-3 md:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset();
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-0 bg-white shadow-md">
          <div className="flex flex-col items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 p-4 sm:flex-row">
            <div className="relative w-full sm:w-72">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                id="search-academic-year"
                name="search-academic-year"
                placeholder="Cari tahun ajaran..."
                className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm leading-5 transition duration-150 ease-in-out placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="limit-academic-year" className="text-sm text-gray-600">
                Tampilkan:
              </label>
              <select
                id="limit-academic-year"
                name="limit-academic-year"
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={35}>35</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-3">
                <div className="text-sm text-gray-600">
                  Total: <span className="font-medium">{pagination.total}</span> tahun ajaran
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 font-medium text-gray-600">
                    <tr>
                      <th className="px-6 py-4">TAHUN AJARAN</th>
                      <th className="px-6 py-4">SEMESTER GANJIL</th>
                      <th className="px-6 py-4">SEMESTER GENAP</th>
                      <th className="px-6 py-4 text-center">STATUS</th>
                      <th className="px-6 py-4 text-center">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                          {search ? 'Tidak ada data yang cocok dengan pencarian' : 'Belum ada tahun ajaran'}
                        </td>
                      </tr>
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {formatDate(item.semester1Start)} - {formatDate(item.semester1End)}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {formatDate(item.semester2Start)} - {formatDate(item.semester2End)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {item.isActive ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                <CheckCircle2 size={14} /> Aktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                                Arsip
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {!item.isActive && (
                                <button
                                  onClick={() => activateMutation.mutate(item.id)}
                                  className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-50"
                                  title="Aktifkan"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                              )}
                              <button
                                onClick={() => handleEdit(item)}
                                className="rounded-lg p-1.5 text-yellow-600 transition-colors hover:bg-yellow-50"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Hapus tahun ajaran ini?')) {
                                    deleteMutation.mutate(item.id);
                                  }
                                }}
                                className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50"
                                title="Hapus"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                <div className="text-sm text-gray-500">
                  Menampilkan <span className="font-medium">{pagination.total === 0 ? 0 : (page - 1) * limit + 1}</span>{' '}
                  sampai <span className="font-medium">{Math.min(page * limit, pagination.total)}</span> dari{' '}
                  <span className="font-medium">{pagination.total}</span> data
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                    className="rounded-lg border p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                    disabled={page === pagination.totalPages}
                    className="rounded-lg border p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Promotion Center</h2>
            <p className="text-sm text-slate-600">
              Alur aman untuk preview, mapping kelas, dan commit kenaikan kelas/alumni tanpa mengganggu flow lama.
            </p>
          </div>
          <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            Parity contract web/mobile
          </div>
        </div>

        {promotionFeatureFlagsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : promotionFeatureFlagsQuery.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
            {getErrorMessage(promotionFeatureFlagsQuery.error) || 'Gagal memuat feature flag promotion.'}
          </div>
        ) : !isPromotionFeatureEnabled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
            Promotion v2 sedang dimatikan di server. Nyalakan env <code>ACADEMIC_PROMOTION_V2_ENABLED=true</code> saat siap uji.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Sumber</label>
                <select
                  value={promotionSourceAcademicYearId}
                  onChange={(event) => setPromotionSourceAcademicYearId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Pilih tahun sumber</option>
                  {academicYearOptions.map((item) => (
                    <option key={`source-${item.id}`} value={item.id}>
                      {item.name} {item.isActive ? '(Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Target</label>
                <select
                  value={promotionTargetAcademicYearId}
                  onChange={(event) => setPromotionTargetAcademicYearId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Pilih tahun target</option>
                  {academicYearOptions.map((item) => (
                    <option key={`target-${item.id}`} value={item.id}>
                      {item.name} {item.isActive ? '(Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                <input
                  type="checkbox"
                  checked={activateTargetYearAfterCommit}
                  onChange={(event) => setActivateTargetYearAfterCommit(event.target.checked)}
                  className="rounded border-slate-300"
                />
                Aktifkan tahun target setelah commit
              </label>
            </div>

            {!promotionSourceAcademicYearId || !promotionTargetAcademicYearId ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm text-slate-600">
            Pilih tahun sumber dan tahun target untuk memuat workspace promotion.
          </div>
            ) : !isPromotionSelectionValid ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
            Tahun sumber dan target harus berbeda.
          </div>
            ) : promotionWorkspaceQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
            ) : promotionWorkspaceQuery.isError || !promotionWorkspace ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
            {getErrorMessage(promotionWorkspaceQuery.error) || 'Gagal memuat workspace promotion.'}
          </div>
            ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Siswa Aktif</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{promotionWorkspace.summary.totalStudents}</p>
                <p className="mt-1 text-xs text-slate-500">Seluruh siswa yang akan diproses.</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Naik Kelas</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{promotionWorkspace.summary.promotedStudents}</p>
                <p className="mt-1 text-xs text-slate-500">Siswa X dan XI yang naik otomatis.</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Menjadi Alumni</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{promotionWorkspace.summary.graduatedStudents}</p>
                <p className="mt-1 text-xs text-slate-500">Siswa XII aktif yang diluluskan.</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Kelas Promote Terkonfigurasi</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {promotionWorkspace.summary.configuredPromoteClasses}/{promotionWorkspace.summary.promotableClasses}
                </p>
                <p className="mt-1 text-xs text-slate-500">Mapping kelas sumber ke target.</p>
              </div>
            </div>

            {promotionWorkspace.validation.errors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <h3 className="text-sm font-semibold text-red-800">Blocking Issues</h3>
                <ul className="mt-2 space-y-1 text-sm text-red-700">
                  {promotionWorkspace.validation.errors.map((item) => (
                    <li key={`promotion-error-${item}`}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}

            {promotionWorkspace.validation.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-800">Peringatan</h3>
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {promotionWorkspace.validation.warnings.map((item) => (
                    <li key={`promotion-warning-${item}`}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Mapping Kelas</h3>
                <p className="text-sm text-slate-600">
                  Simpan mapping dulu sebelum commit. Kelas target wajib kosong agar aman untuk production.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resetPromotionDraftsToSuggested}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Gunakan Saran Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => savePromotionMappingsMutation.mutate()}
                  disabled={savePromotionMappingsMutation.isPending}
                  className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                >
                  {savePromotionMappingsMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  Simpan Mapping
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (promotionWorkspace.validation.readyToCommit === false) {
                      toast.error('Masih ada issue blocking. Selesaikan dulu sebelum commit.');
                      return;
                    }
                    if (!confirm('Commit promotion sekarang? Perubahan siswa akan ditulis ke data aktif.')) {
                      return;
                    }
                    commitPromotionMutation.mutate();
                  }}
                  disabled={commitPromotionMutation.isPending}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {commitPromotionMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  Commit Promotion
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Kelas Sumber</th>
                      <th className="px-4 py-3 font-medium">Siswa Aktif</th>
                      <th className="px-4 py-3 font-medium">Aksi</th>
                      <th className="px-4 py-3 font-medium">Kelas Target</th>
                      <th className="px-4 py-3 font-medium">Validasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {promotionWorkspace.classes.map((item) => {
                      const selectedTargetClassId = getResolvedTargetClassId(item, mappingDrafts);
                      return (
                        <tr key={item.sourceClassId} className="align-top">
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-900">{item.sourceClassName}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.major.code} • Tingkat {item.sourceLevel}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {item.studentCount} siswa
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {item.action === 'GRADUATE' ? (
                              <div>
                                <p className="font-medium text-slate-900">Lulus jadi alumni</p>
                                <p className="mt-1 text-xs text-slate-500">Tidak memerlukan kelas target.</p>
                              </div>
                            ) : (
                              <div>
                                <p className="font-medium text-slate-900">Naik ke {item.expectedTargetLevel}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Source {item.mappingSource === 'SAVED' ? 'mapping tersimpan' : item.mappingSource === 'SUGGESTED' ? 'saran otomatis' : 'belum dipilih'}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {item.action === 'GRADUATE' ? (
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                Alumni
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <select
                                  value={selectedTargetClassId ?? ''}
                                  onChange={(event) =>
                                    setMappingDrafts((current) => ({
                                      ...current,
                                      [item.sourceClassId]: event.target.value ? Number(event.target.value) : null,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                  <option value="">Pilih kelas target</option>
                                  {item.targetOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.name} ({option.currentStudentCount} siswa aktif)
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-slate-500">
                                  Saran: {item.suggestedTargetClassId ? item.targetOptions.find((option) => option.id === item.suggestedTargetClassId)?.name || '-' : 'Belum ada'}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {item.validation.errors.length === 0 && item.validation.warnings.length === 0 ? (
                              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                                Siap
                              </span>
                            ) : (
                              <div className="space-y-2">
                                {item.validation.errors.map((entry) => (
                                  <div
                                    key={`${item.sourceClassId}-error-${entry}`}
                                    className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
                                  >
                                    {entry}
                                  </div>
                                ))}
                                {item.validation.warnings.map((entry) => (
                                  <div
                                    key={`${item.sourceClassId}-warning-${entry}`}
                                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"
                                  >
                                    {entry}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Riwayat Run</h3>
                  <p className="text-sm text-slate-600">5 commit promotion terakhir untuk kombinasi source-target ini.</p>
                </div>
              </div>
              {promotionWorkspace.recentRuns.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada run promotion untuk kombinasi tahun ini.</p>
              ) : (
                <div className="space-y-3">
                  {promotionWorkspace.recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            Run #{run.id} • {run.promotedStudents} naik • {run.graduatedStudents} alumni
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Commit: {formatDateTime(run.committedAt || run.createdAt)}
                          </p>
                        </div>
                        <div className="text-xs text-slate-500">
                          {run.createdBy ? `Oleh ${run.createdBy.name}` : 'Oleh sistem'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
