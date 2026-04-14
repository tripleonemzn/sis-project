import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  extracurricularService,
  type Extracurricular,
  type ExtracurricularPayload,
} from '../../../services/extracurricular.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Search, ChevronLeft, ChevronRight, Plus, Trash2, Edit, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { TutorAssignmentModal } from './TutorAssignmentModal';
import {
  EXTRACURRICULAR_CATEGORY_OPTIONS,
  getExtracurricularCategoryLabel,
  type ExtracurricularCategory,
} from '../../../features/extracurricular/category';

const schema = z.object({
  name: z.string().min(1, 'Nama ekstrakurikuler wajib diisi'),
  description: z.string().optional().nullable(),
  category: z.enum(['EXTRACURRICULAR', 'OSIS']),
});

type FormValues = z.infer<typeof schema>;

export const ExtracurricularPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | ExtracurricularCategory>('ALL');
  const [selectedEkskulForAssignment, setSelectedEkskulForAssignment] = useState<Extracurricular | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['extracurriculars', page, limit, debouncedSearch, selectedCategoryFilter],
    queryFn: () =>
      extracurricularService.list({
        page,
        limit,
        search: debouncedSearch,
        category: selectedCategoryFilter === 'ALL' ? undefined : selectedCategoryFilter,
      }),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      category: 'EXTRACURRICULAR',
    },
  });

  const createMutation = useMutation({
    mutationFn: extracurricularService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracurriculars'] });
      toast.success('Ekstrakurikuler berhasil dibuat');
      setShowForm(false);
      reset();
    },
    onError: () => {
      toast.error('Gagal membuat ekstrakurikuler');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ExtracurricularPayload> }) =>
      extracurricularService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracurriculars'] });
      toast.success('Ekstrakurikuler berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: () => {
      toast.error('Gagal memperbarui ekstrakurikuler');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => extracurricularService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracurriculars'] });
      toast.success('Ekstrakurikuler dihapus');
    },
    onError: () => {
      toast.error('Gagal menghapus ekstrakurikuler');
    },
  });

  const onSubmit = (values: FormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (item: Extracurricular) => {
    setEditingId(item.id);
    setValue('name', item.name);
    setValue('description', item.description ?? '');
    setValue('category', item.category || 'EXTRACURRICULAR');
    setShowForm(true);
  };

  const list: Extracurricular[] = data?.data?.extracurriculars || [];
  const pagination = data?.data?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Ekstrakurikuler</h1>
          <p className="text-gray-500">Kelola daftar ekstrakurikuler dan organisasi siswa sekolah</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            Tambah Ekstrakurikuler
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3 mb-4">
            {editingId ? 'Edit Ekstrakurikuler' : 'Tambah Ekstrakurikuler Baru'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Nama Ekstrakurikuler
              </label>
              <input
                id="name"
                {...register('name')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Contoh: Pramuka"
                autoComplete="off"
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                Kategori
              </label>
              <select
                id="category"
                {...register('category')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {EXTRACURRICULAR_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="text-red-500 text-xs mt-1">{errors.category.message}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Deskripsi (Opsional)
              </label>
              <textarea
                id="description"
                rows={3}
                {...register('description')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Keterangan singkat kegiatan ekstrakurikuler"
              />
              {errors.description && (
                <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset();
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
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
        <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
            <div className="relative w-full sm:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                id="search-extracurricular"
                name="search-extracurricular"
                placeholder="Cari nama ekstrakurikuler..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="extracurricular-category-filter" className="text-sm text-gray-600">Kategori:</label>
              <select
                id="extracurricular-category-filter"
                name="extracurricular-category-filter"
                value={selectedCategoryFilter}
                onChange={(e) => {
                  setSelectedCategoryFilter(e.target.value as 'ALL' | ExtracurricularCategory);
                  setPage(1);
                }}
                className="w-40 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              >
                <option value="ALL">Semua</option>
                {EXTRACURRICULAR_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label htmlFor="limit-extracurricular" className="text-sm text-gray-600">Tampilkan:</label>
              <select
                id="limit-extracurricular"
                name="limit-extracurricular"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={35}>35</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-600">
                  Total: <span className="font-medium">{pagination.total}</span> unit kegiatan
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-6 py-4">NAMA</th>
                      <th className="px-6 py-4">KATEGORI</th>
                      <th className="px-6 py-4">DESKRIPSI</th>
                      <th className="px-6 py-4">NAMA PEMBINA</th>
                      <th className="px-6 py-4 text-center">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                          {search
                            ? 'Tidak ada data yang cocok dengan pencarian'
                            : 'Belum ada data ekstrakurikuler'}
                        </td>
                      </tr>
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.category === 'OSIS'
                                ? 'bg-violet-100 text-violet-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {getExtracurricularCategoryLabel(item.category)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.description || (
                              <span className="text-gray-400 italic">Belum ada deskripsi</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-900">
                            {item.tutorAssignments && item.tutorAssignments.length > 0
                              ? item.tutorAssignments.map((a) => a.tutor.name).join(', ')
                              : <span className="text-gray-400 italic">Belum ada pembina</span>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setSelectedEkskulForAssignment(item)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Kelola Pembina"
                              >
                                <Users size={18} />
                              </button>
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Hapus ekstrakurikuler ini?')) {
                                    deleteMutation.mutate(item.id);
                                  }
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-500">
                  Menampilkan{' '}
                  <span className="font-medium">
                    {pagination.total === 0 ? 0 : (page - 1) * limit + 1}
                  </span>{' '}
                  sampai{' '}
                  <span className="font-medium">
                    {Math.min(page * limit, pagination.total)}
                  </span>{' '}
                  dari <span className="font-medium">{pagination.total}</span> data
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {selectedEkskulForAssignment && (
        <TutorAssignmentModal
          ekskul={selectedEkskulForAssignment}
          onClose={() => setSelectedEkskulForAssignment(null)}
          onUpdate={refetch}
        />
      )}
    </div>
  );
}
