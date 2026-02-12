import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicYearService } from '../../../services/academicYear.service';
import type { AcademicYear } from '../../../services/academicYear.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, CheckCircle2, Trash2, Edit, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
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

export const AcademicYearPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['academic-years', page, limit, debouncedSearch],
    queryFn: () => academicYearService.list({ page, limit, search: debouncedSearch }),
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Tahun ajaran berhasil dibuat');
      setShowForm(false);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat tahun ajaran');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormValues> }) => 
      academicYearService.update(id, data as unknown as Partial<AcademicYear>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Tahun ajaran berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui tahun ajaran');
    }
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => academicYearService.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Tahun ajaran diaktifkan');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => academicYearService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Tahun ajaran dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus tahun ajaran');
    }
  });

  const onSubmit = (values: FormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate(values);
    }
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

  const list: AcademicYear[] = data?.data?.academicYears || [];
  const pagination = data?.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tahun Ajaran</h1>
          <p className="text-gray-500">Kelola tahun ajaran dan status aktif</p>
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
            Tambah Tahun Ajaran
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3 mb-4">
            {editingId ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran Baru'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nama Tahun Ajaran</label>
              <input
                id="name"
                {...register('name')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="2024/2025"
                autoComplete="off"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="semester1Start" className="block text-sm font-medium text-gray-700 mb-1">Semester Ganjil Mulai</label>
              <input 
                id="semester1Start"
                type="date" 
                {...register('semester1Start')} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoComplete="off" 
              />
              {errors.semester1Start && <p className="text-red-500 text-xs mt-1">{errors.semester1Start.message}</p>}
            </div>
            <div>
              <label htmlFor="semester1End" className="block text-sm font-medium text-gray-700 mb-1">Semester Ganjil Akhir</label>
              <input 
                id="semester1End"
                type="date" 
                {...register('semester1End')} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                autoComplete="off"
              />
              {errors.semester1End && <p className="text-red-500 text-xs mt-1">{errors.semester1End.message}</p>}
            </div>
            <div>
              <label htmlFor="semester2Start" className="block text-sm font-medium text-gray-700 mb-1">Semester Genap Mulai</label>
              <input 
                id="semester2Start"
                type="date" 
                {...register('semester2Start')} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                autoComplete="off"
              />
              {errors.semester2Start && <p className="text-red-500 text-xs mt-1">{errors.semester2Start.message}</p>}
            </div>
            <div>
              <label htmlFor="semester2End" className="block text-sm font-medium text-gray-700 mb-1">Semester Genap Akhir</label>
              <input 
                id="semester2End"
                type="date" 
                {...register('semester2End')} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                autoComplete="off"
              />
              {errors.semester2End && <p className="text-red-500 text-xs mt-1">{errors.semester2End.message}</p>}
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              <input type="checkbox" id="isActive" {...register('isActive')} className="rounded border-gray-300" />
              <label htmlFor="isActive" className="text-sm text-gray-700">Set sebagai Tahun Ajaran Aktif</label>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
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
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
          {/* Toolbar: Search & Limit */}
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
            <div className="relative w-full sm:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                id="search-academic-year"
                name="search-academic-year"
                placeholder="Cari tahun ajaran..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="limit-academic-year" className="text-sm text-gray-600">Tampilkan:</label>
              <select
                id="limit-academic-year"
                name="limit-academic-year"
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
                  Total: <span className="font-medium">{pagination.total}</span> tahun ajaran
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-6 py-4">TAHUN AJARAN</th>
                      <th className="px-6 py-4">SEMESTER GANJIL</th>
                      <th className="px-6 py-4">SEMESTER GENAP</th>
                      <th className="px-6 py-4 text-center">STATUS</th>
                      <th className="px-6 py-4 text-center w-32">AKSI</th>
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
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {new Date(item.semester1Start).toLocaleDateString()} - {new Date(item.semester1End).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {new Date(item.semester2Start).toLocaleDateString()} - {new Date(item.semester2End).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {item.isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle2 size={14} /> Aktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Arsip
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {!item.isActive && (
                                <button
                                  onClick={() => activateMutation.mutate(item.id)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Aktifkan"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                              )}
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
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
              
              {/* Pagination */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-500">
                  Menampilkan <span className="font-medium">{(page - 1) * limit + 1}</span> sampai <span className="font-medium">{Math.min(page * limit, pagination.total)}</span> dari <span className="font-medium">{pagination.total}</span> data
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
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
    </div>
  );
};
