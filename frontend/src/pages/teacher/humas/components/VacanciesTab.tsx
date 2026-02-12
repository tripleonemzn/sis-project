import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { humasService, type JobVacancy, type IndustryPartner } from '../../../../services/humas.service';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  X, 
  Briefcase, 
  Calendar, 
  Building2, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';

// Schema
const vacancySchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi'),
  companyName: z.string().optional(), // Optional if partner is selected
  industryPartnerId: z.string().optional(), // ID as string for select
  description: z.string().optional(),
  requirements: z.string().optional(),
  registrationLink: z.string().optional(),
  deadline: z.string().optional(),
  isOpen: z.boolean().default(true).optional()
}).refine((data) => data.companyName || data.industryPartnerId, {
  message: "Pilih Mitra Industri atau isi Nama Perusahaan",
  path: ["companyName"]
});

type VacancyFormValues = z.infer<typeof vacancySchema>;

export const VacanciesTab = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVacancy, setEditingVacancy] = useState<JobVacancy | null>(null);

  // Queries
  const { data: vacanciesData, isLoading } = useQuery({
    queryKey: ['vacancies', page, limit, search],
    queryFn: () => humasService.getVacancies({ page, limit, search })
  });

  const { data: partnersData } = useQuery({
    queryKey: ['partners-list'],
    queryFn: () => humasService.getPartners({ limit: 100, status: 'AKTIF' }) // Get active partners for dropdown
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => humasService.createVacancy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      setIsModalOpen(false);
      toast.success('Lowongan berhasil ditambahkan');
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menambahkan lowongan');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => humasService.updateVacancy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      setIsModalOpen(false);
      setEditingVacancy(null);
      toast.success('Lowongan berhasil diperbarui');
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal memperbarui lowongan');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => humasService.deleteVacancy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      toast.success('Lowongan berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menghapus lowongan');
    }
  });

  // Form
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<VacancyFormValues>({
    resolver: zodResolver(vacancySchema),
    defaultValues: {
      isOpen: true
    }
  });

  const handleEdit = (vacancy: JobVacancy) => {
    setEditingVacancy(vacancy);
    setValue('title', vacancy.title);
    setValue('companyName', vacancy.companyName || '');
    setValue('industryPartnerId', vacancy.industryPartnerId?.toString() || '');
    setValue('description', vacancy.description || '');
    setValue('requirements', vacancy.requirements || '');
    setValue('registrationLink', vacancy.registrationLink || '');
    setValue('deadline', vacancy.deadline ? new Date(vacancy.deadline).toISOString().split('T')[0] : '');
    setValue('isOpen', vacancy.isOpen);
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    Swal.fire({
      title: 'Apakah anda yakin?',
      text: "Data lowongan akan dihapus permanen!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Ya, hapus!',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) {
        deleteMutation.mutate(id);
      }
    });
  };

  const onSubmit = (data: VacancyFormValues) => {
    const payload = {
      ...data,
      industryPartnerId: data.industryPartnerId ? parseInt(data.industryPartnerId) : undefined,
      deadline: data.deadline ? new Date(data.deadline).toISOString() : undefined
    };

    if (editingVacancy) {
      updateMutation.mutate({ id: editingVacancy.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const vacancies = vacanciesData?.data?.data?.vacancies || [];
  const meta = vacanciesData?.data?.data || { page: 1, totalPages: 1, total: 0 };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Cari lowongan..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
          
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <button
          onClick={() => {
            setEditingVacancy(null);
            reset();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Lowongan
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vacancies.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-lg border border-gray-200">
              <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">Belum ada data lowongan pekerjaan</p>
            </div>
          ) : (
            vacancies.map((vacancy: JobVacancy) => (
              <div key={vacancy.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 line-clamp-1">{vacancy.title}</h3>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Building2 className="w-3 h-3" />
                        <span className="line-clamp-1">
                          {vacancy.industryPartner?.name || vacancy.companyName || 'Perusahaan Umum'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    vacancy.isOpen 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {vacancy.isOpen ? 'Dibuka' : 'Ditutup'}
                  </span>
                </div>

                <div className="space-y-3 flex-1">
                  {vacancy.deadline && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>Deadline: {new Date(vacancy.deadline).toLocaleDateString('id-ID')}</span>
                    </div>
                  )}
                  
                  {vacancy.description && (
                    <p className="text-sm text-gray-600 line-clamp-3">
                      {vacancy.description}
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex gap-2">
                    {vacancy.registrationLink && (
                      <a 
                        href={vacancy.registrationLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                      >
                        Link Daftar <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(vacancy)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(vacancy.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && vacancies.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4 rounded-lg shadow-sm">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Menampilkan <span className="font-medium">{(page - 1) * limit + 1}</span> sampai <span className="font-medium">{Math.min(page * limit, meta.total)}</span> dari <span className="font-medium">{meta.total}</span> data
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                {/* Simplified pagination numbers */}
                <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
                  Halaman {page} dari {meta.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={() => setIsModalOpen(false)}></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {editingVacancy ? 'Edit Lowongan' : 'Tambah Lowongan Baru'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form id="vacancyForm" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Judul Lowongan *</label>
                    <input
                      type="text"
                      {...register('title')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Contoh: Staff IT Support"
                    />
                    {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mitra Industri (Opsional)</label>
                    <select
                      {...register('industryPartnerId')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">-- Pilih Mitra --</option>
                      {partnersData?.data?.data?.partners?.map((p: IndustryPartner) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Pilih jika lowongan berasal dari mitra yang terdaftar</p>
                  </div>

                  {!watch('industryPartnerId') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nama Perusahaan *</label>
                      <input
                        type="text"
                        {...register('companyName')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Jika bukan mitra terdaftar"
                      />
                      {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Deskripsi pekerjaan..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Persyaratan</label>
                    <textarea
                      {...register('requirements')}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Kualifikasi yang dibutuhkan..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Batas Pendaftaran</label>
                      <input
                        type="date"
                        {...register('deadline')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <div className="flex items-center gap-4 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" value="true" {...register('isOpen', { setValueAs: v => v === 'true' || v === true })} checked={watch('isOpen') === true} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm text-gray-700">Dibuka</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" value="false" {...register('isOpen', { setValueAs: v => v === 'true' || v === true })} checked={watch('isOpen') === false} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm text-gray-700">Ditutup</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Link Pendaftaran (Opsional)</label>
                    <input
                      type="url"
                      {...register('registrationLink')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://..."
                    />
                  </div>
                </form>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="submit"
                  form="vacancyForm"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
