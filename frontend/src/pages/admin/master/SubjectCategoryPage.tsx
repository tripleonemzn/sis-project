import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubjectCategories, createSubjectCategory, updateSubjectCategory, deleteSubjectCategory } from '../../../services/subjectCategory.service';
import type { SubjectCategory } from '../../../services/subjectCategory.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2, Edit, Layers, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  code: z.string().min(1, 'Kode kategori wajib diisi'),
  name: z.string().min(1, 'Nama kategori wajib diisi'),
  description: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

const toPayload = (data: FormValues) => ({
  code: data.code,
  name: data.name,
  description: data.description ?? undefined,
});

const resolveApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (typeof message === 'string' && message.trim().length > 0) return message.trim();
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  return fallback;
};

export const SubjectCategoryPage = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['subject-categories'],
    queryFn: getSubjectCategories,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const createMutation = useMutation({
    mutationFn: createSubjectCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-categories'] });
      toast.success('Kategori berhasil dibuat');
      closeModal();
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, 'Gagal membuat kategori'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormValues }) =>
      updateSubjectCategory(id, toPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-categories'] });
      toast.success('Kategori berhasil diperbarui');
      closeModal();
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, 'Gagal memperbarui kategori'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubjectCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-categories'] });
      toast.success('Kategori berhasil dihapus');
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, 'Gagal menghapus kategori'));
    },
  });

  const onSubmit = (data: FormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(toPayload(data));
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    reset({ code: '', name: '', description: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (category: SubjectCategory) => {
    setEditingId(category.id);
    reset({
      code: category.code,
      name: category.name,
      description: category.description || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    reset();
  };

  const handleDelete = (id: number) => {
    if (confirm('Apakah Anda yakin ingin menghapus kategori ini?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Kategori Mata Pelajaran</h1>
          <p className="text-gray-500">Kelola kategori mata pelajaran secara dinamis</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} className="mr-2" />
          Tambah Kategori
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cari kategori..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-4 w-16">#</th>
                <th className="px-6 py-4 w-48">KODE</th>
                <th className="px-6 py-4 w-64">NAMA KATEGORI</th>
                <th className="px-6 py-4">KETERANGAN</th>
                <th className="px-6 py-4 w-32 text-center">JUMLAH MAPEL</th>
                <th className="px-6 py-4 w-32 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Belum ada data kategori.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500">{index + 1}</td>
                    <td className="px-6 py-4 font-mono text-gray-600">{item.code}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-blue-600" />
                        {item.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.description || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {item._count?.subjects || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus"
                          disabled={(item._count?.subjects || 0) > 0}
                        >
                          <Trash2 size={16} className={(item._count?.subjects || 0) > 0 ? 'opacity-50 cursor-not-allowed' : ''} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Kategori' : 'Tambah Kategori Baru'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kode Kategori</label>
                <input
                  {...register('code')}
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                  placeholder="Contoh: UMUM"
                />
                {errors.code && <p className="mt-1 text-sm text-red-600">{errors.code.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kategori</label>
                <input
                  {...register('name')}
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: Umum (Nasional)"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Deskripsi singkat kategori..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  {editingId ? 'Simpan Perubahan' : 'Buat Kategori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
