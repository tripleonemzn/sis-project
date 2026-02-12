import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subjectService } from '../../../services/subject.service';
import { getSubjectCategories } from '../../../services/subjectCategory.service';
import type { Subject } from '../../../services/subject.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2, Edit, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const getCategoryColor = (name: string) => {
  const upper = name.toUpperCase();
  if (upper.includes('UMUM')) return 'bg-blue-100 text-blue-800 border border-blue-200';
  if (upper.includes('KEJURUAN') || upper.includes('PRODUKTIF')) return 'bg-purple-100 text-purple-800 border border-purple-200';
  if (upper.includes('LOKAL')) return 'bg-green-100 text-green-800 border border-green-200';
  if (upper.includes('PILIHAN')) return 'bg-orange-100 text-orange-800 border border-orange-200';
  if (upper.includes('DASAR')) return 'bg-cyan-100 text-cyan-800 border border-cyan-200';
  return 'bg-gray-100 text-gray-800 border border-gray-200';
};

const schema = z.object({
  name: z.string().min(1, 'Nama mata pelajaran wajib diisi'),
  code: z.string().min(1, 'Kode mata pelajaran wajib diisi'),
  subjectCategoryId: z.number().int().min(1, 'Kategori wajib dipilih'),
  kkmX: z.preprocess((val) => (typeof val === 'number' && isNaN(val)) ? null : val, z.number().int().min(0, 'KKM X minimal 0').max(100, 'KKM X maksimal 100').nullable()).optional(),
  kkmXI: z.preprocess((val) => (typeof val === 'number' && isNaN(val)) ? null : val, z.number().int().min(0, 'KKM XI minimal 0').max(100, 'KKM XI maksimal 100').nullable()).optional(),
  kkmXII: z.preprocess((val) => (typeof val === 'number' && isNaN(val)) ? null : val, z.number().int().min(0, 'KKM XII minimal 0').max(100, 'KKM XII maksimal 100').nullable()).optional(),
});

type FormValues = z.infer<typeof schema>;

export const SubjectPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'ALL'>('ALL');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Categories
  const { data: categories = [] } = useQuery({
    queryKey: ['subject-categories'],
    queryFn: getSubjectCategories,
  });

  // Fetch Subjects
  const { data, isLoading } = useQuery({
    queryKey: ['subjects', page, limit, debouncedSearch, categoryFilter],
    queryFn: () => subjectService.list({ 
      page, 
      limit, 
      search: debouncedSearch, 
      subjectCategoryId: categoryFilter === 'ALL' ? undefined : categoryFilter 
    }),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: '',
      code: '',
      subjectCategoryId: undefined,
      kkmX: undefined,
      kkmXI: undefined,
      kkmXII: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: subjectService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success('Mata pelajaran berhasil dibuat');
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      setShowForm(false);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat mata pelajaran');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormValues> }) => 
      subjectService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success('Mata pelajaran berhasil diperbarui');
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui mata pelajaran');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => subjectService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success('Mata pelajaran dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus mata pelajaran');
    }
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      subjectCategoryId: Number(values.subjectCategoryId)
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: Subject) => {
    setEditingId(item.id);
    setValue('name', item.name);
    setValue('code', item.code);
    
    // Set category ID
    if (item.subjectCategoryId) {
       setValue('subjectCategoryId', item.subjectCategoryId);
    } else if (typeof item.category === 'object' && item.category !== null) {
       // @ts-ignore
       setValue('subjectCategoryId', item.category.id);
    }
    
    // Populate KKM
    setValue('kkmX', item.kkms?.find(k => k.classLevel === 'X')?.kkm);
    setValue('kkmXI', item.kkms?.find(k => k.classLevel === 'XI')?.kkm);
    setValue('kkmXII', item.kkms?.find(k => k.classLevel === 'XII')?.kkm);
    
    setShowForm(true);
  };

  const list: Subject[] = data?.data?.subjects || [];
  const pagination = data?.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mata Pelajaran</h1>
          <p className="text-gray-500">Kelola daftar mata pelajaran sekolah</p>
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
            Tambah Mapel
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3 mb-4">
            {editingId ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">Kode Mapel</label>
                <input
                  id="code"
                  {...register('code')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="MTK"
                  autoComplete="off"
                />
                {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nama Mata Pelajaran</label>
                <input
                  id="name"
                  {...register('name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Matematika"
                  autoComplete="off"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="subjectCategoryId" className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select
                  id="subjectCategoryId"
                  {...register('subjectCategoryId', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Pilih Kategori</option>
                  {categories.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {errors.subjectCategoryId && <p className="text-red-500 text-xs mt-1">{errors.subjectCategoryId.message}</p>}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 mt-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Pengaturan KKM per Tingkat Kelas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">KKM Kelas X</label>
                    <input 
                      type="number" 
                      {...register('kkmX', { valueAsNumber: true })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                      placeholder="75" 
                    />
                 </div>
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">KKM Kelas XI</label>
                    <input 
                      type="number" 
                      {...register('kkmXI', { valueAsNumber: true })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                      placeholder="75" 
                    />
                 </div>
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">KKM Kelas XII</label>
                    <input 
                      type="number" 
                      {...register('kkmXII', { valueAsNumber: true })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                      placeholder="75" 
                    />
                 </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset();
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={18} className="animate-spin" />}
                {editingId ? 'Simpan Perubahan' : 'Buat Mata Pelajaran'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
           <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50/50">
             <div className="flex flex-wrap gap-2">
               <button
                 onClick={() => setCategoryFilter('ALL')}
                 className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                   categoryFilter === 'ALL'
                     ? 'bg-blue-600 text-white'
                     : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                 }`}
               >
                 Semua
               </button>
               {categories.map((cat: any) => (
                 <button
                   key={cat.id}
                   onClick={() => setCategoryFilter(cat.id)}
                   className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                     categoryFilter === cat.id
                       ? 'bg-blue-600 text-white'
                       : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                   }`}
                 >
                   {cat.name}
                 </button>
               ))}
             </div>
             
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Cari mapel..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
             </div>
           </div>

           <div className="overflow-x-auto">
             <table className="w-full">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-left">Kode</th>
                    <th className="px-6 py-3 text-left">Mata Pelajaran</th>
                    <th className="px-6 py-3 text-left">Kategori</th>
                    <th className="px-4 py-3 text-center w-24">KKM X</th>
                    <th className="px-4 py-3 text-center w-24">KKM XI</th>
                    <th className="px-4 py-3 text-center w-24">KKM XII</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 size={24} className="animate-spin text-blue-500" />
                          <p>Memuat data...</p>
                        </div>
                      </td>
                    </tr>
                  ) : list.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        Belum ada data mata pelajaran
                      </td>
                    </tr>
                  ) : (
                    list.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.code}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {item.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(typeof item.category === 'object' && item.category !== null) ? getCategoryColor((item.category as any).name) : 'bg-gray-100 text-gray-800 border border-gray-200'}`}>
                             {(typeof item.category === 'object' && item.category !== null) ? (item.category as any).name : '-'}
                           </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                          {item.kkms?.find(k => k.classLevel === 'X')?.kkm || '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                          {item.kkms?.find(k => k.classLevel === 'XI')?.kkm || '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                          {item.kkms?.find(k => k.classLevel === 'XII')?.kkm || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Hapus mata pelajaran ini?')) {
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

           {data?.data && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-500">
                  Menampilkan {((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} dari {pagination.total} data
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
            </div>
           )}
        </div>
      )}
    </div>
  );
};
