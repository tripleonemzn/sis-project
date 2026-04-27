import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import type { User } from '../../../types/auth';
import type { Class } from '../../../services/class.service';
import { 
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ThumbsUp,
  ThumbsDown,
  X,
} from 'lucide-react';
import { behaviorService, type BehaviorType, type CreateBehaviorPayload, type UpdateBehaviorPayload, type StudentBehavior } from '../../../services/behavior.service';
import { classService } from '../../../services/class.service';
import { authService } from '../../../services/auth.service';
import { toast } from 'react-hot-toast';

interface HomeroomClass extends Class {
  students: User[];
}

export const HomeroomBehaviorPage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'behavior_log'>('behavior_log');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<BehaviorType | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<CreateBehaviorPayload> & { semester?: string }>({
    date: new Date().toISOString().split('T')[0],
    point: 0,
    description: '',
    semester: ''
  });

  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: User, activeYear: { id: number; name: string } }>() || {};

  // 1. Get Current User via Query (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  
  // 2. Get Active Academic Year
  const { data: fetchedActiveYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;

  // 3. Get Homeroom Class Summary
  const { data: classSummary } = useQuery({
    queryKey: ['homeroom-class-summary', user?.id, activeAcademicYear?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const response = await classService.list({ teacherId: user.id, limit: 100 });
      const activeClass = response.data.classes.find((c: Class) => c.academicYearId === activeAcademicYear?.id);
      return activeClass || null;
    },
    enabled: !!user?.id && user?.role === 'TEACHER' && !!activeAcademicYear?.id,
  });

  // 4. Get Homeroom Class Details (for student list)
  const { data: homeroomClass } = useQuery({
    queryKey: ['homeroom-class-details', classSummary?.id],
    queryFn: async () => {
      const response = await classService.getById(classSummary!.id);
      return response.data as HomeroomClass;
    },
    enabled: !!classSummary?.id,
  });

  // 5. Get Behaviors
  const { data: behaviorsData, isLoading } = useQuery({
    queryKey: ['behaviors', classSummary?.id, activeAcademicYear?.id, typeFilter, search, page, limit],
    queryFn: async () => {
      return await behaviorService.getBehaviors({
        classId: classSummary!.id,
        academicYearId: activeAcademicYear!.id,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        search,
        page,
        limit
      });
    },
    enabled: !!classSummary?.id && !!activeAcademicYear?.id,
  });

  const behaviors = behaviorsData?.behaviors || [];
  const meta = behaviorsData?.meta || { total: 0, totalPages: 0, page: 1, limit: 10 };

  // Sync semester with active academic year
  // useEffect(() => {
  //   if (activeAcademicYear?.semester) {
  //     setFormData(prev => ({ ...prev, semester: activeAcademicYear.semester }));
  //   }
  // }, [activeAcademicYear]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateBehaviorPayload) => behaviorService.createBehavior(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behaviors'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Catatan perilaku berhasil ditambahkan');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal menambahkan catatan');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number, payload: UpdateBehaviorPayload }) => behaviorService.updateBehavior(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behaviors'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Catatan perilaku berhasil diperbarui');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal memperbarui catatan');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => behaviorService.deleteBehavior(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behaviors'] });
      toast.success('Catatan perilaku berhasil dihapus');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal menghapus catatan');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classSummary || !activeAcademicYear || !formData.studentId) return;

    // Destructure semester out as it is not part of the API payload
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { semester, ...restFormData } = formData;

    const payload = {
      ...restFormData,
      classId: classSummary.id,
      academicYearId: activeAcademicYear.id,
    } as CreateBehaviorPayload;

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (behavior: StudentBehavior) => {
    setEditingId(behavior.id);
    setFormData({
      studentId: behavior.studentId,
      date: behavior.date.split('T')[0],
      type: behavior.type,
      category: behavior.category,
      description: behavior.description,
      point: behavior.point,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus catatan ini?')) {
      deleteMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      point: 0,
      description: '',
      semester: ''
    });
    setStudentSearch('');
    setIsStudentDropdownOpen(false);
  };

  // Searchable Dropdown State
  const [studentSearch, setStudentSearch] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);

  const students = homeroomClass?.students || [];

  const filteredStudents = students.filter((student: User) => {
    const searchLower = studentSearch.toLowerCase();
    return (
      student.name.toLowerCase().includes(searchLower) ||
      student.nis?.toLowerCase().includes(searchLower) ||
      student.nisn?.toLowerCase().includes(searchLower)
    );
  });

  const selectedStudent = students.find((s: User) => s.id === formData.studentId);

  const handleStudentSelect = (studentId: number) => {
    setFormData({ ...formData, studentId });
    setIsStudentDropdownOpen(false);
    setStudentSearch('');
  };

  // Reset pagination on tab/filter/search change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [activeTab, typeFilter, search]);

  if (!classSummary || !homeroomClass) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500">Memuat data kelas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catatan Perilaku Siswa</h1>
          <p className="text-gray-500 mt-1">
            Kelola poin pelanggaran dan penghargaan siswa kelas {classSummary.name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveTab('behavior_log')}
            className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
              activeTab === 'behavior_log'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ClipboardList size={16} />
              <span>Riwayat Perilaku</span>
            </div>
          </button>
        </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Actions & Filter Header */}
        <div className="border-b border-gray-200 bg-gray-50 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end xl:ml-auto">
            <button
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              Tambah Catatan
            </button>
          </div>
        </div>

        {/* Search & Limit Toolbar */}
        <div className="p-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-grow">
            <div className="relative w-full sm:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Cari nama, NIS, atau NISN..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter size={18} className="text-gray-400" />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as BehaviorType | 'ALL')}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white text-sm"
              >
                <option value="ALL">Semua Jenis</option>
                <option value="POSITIVE">Positif</option>
                <option value="NEGATIVE">Negatif</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="limit" className="text-sm text-gray-600">
              Tampilkan:
            </label>
            <select
              id="limit"
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">No</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">NISN</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">NAMA SISWA</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jenis</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deskripsi</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Poin</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Memuat data...
                  </td>
                </tr>
              ) : behaviors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ClipboardList className="text-gray-400" size={32} />
                    </div>
                    <p className="font-medium">Tidak ada data perilaku ditemukan</p>
                    <p className="text-sm mt-1">Coba sesuaikan filter atau pencarian Anda</p>
                  </td>
                </tr>
              ) : (
                behaviors.map((behavior: StudentBehavior, index: number) => (
                  <tr key={behavior.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {new Date(behavior.date).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {behavior.student.nisn || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                          {behavior.student.photo ? (
                            <img 
                              src={behavior.student.photo} 
                              alt={behavior.student.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold text-xs">
                              {behavior.student.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{behavior.student.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        behavior.type === 'POSITIVE' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {behavior.type === 'POSITIVE' ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
                        {behavior.type === 'POSITIVE' ? 'Positif' : 'Negatif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium mb-0.5">{behavior.category || '-'}</div>
                      <div className="text-gray-500 line-clamp-2">{behavior.description}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      <span className={behavior.type === 'POSITIVE' ? 'text-green-600' : 'text-red-600'}>
                        {behavior.type === 'POSITIVE' ? '+' : '-'}{Math.abs(behavior.point)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleEdit(behavior)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(behavior.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="text-sm text-gray-500">
            Menampilkan{' '}
            <span className="font-medium">
              {meta.total === 0 ? 0 : (page - 1) * limit + 1}
            </span>{' '}
            sampai{' '}
            <span className="font-medium">
              {Math.min(page * limit, meta.total)}
            </span>{' '}
            dari{' '}
            <span className="font-medium">
              {meta.total}
            </span>{' '}
            data
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(meta.totalPages, p + 1))
              }
              disabled={page === meta.totalPages}
              className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => setIsModalOpen(false)}>
          <div key={isModalOpen ? 'open' : 'closed'} className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Catatan Perilaku' : 'Tambah Catatan Perilaku'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4" autoComplete="off">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Semester
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    value={formData.semester || ''}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                  >
                    <option value="" disabled>Pilih Semester</option>
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jenis <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.type || ''}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as BehaviorType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Jenis Catatan</option>
                    <option value="POSITIVE">Positif</option>
                    <option value="NEGATIVE">Negatif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pilih Siswa <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div
                    onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer flex justify-between items-center"
                  >
                    <span className={selectedStudent ? 'text-gray-900' : 'text-gray-400'}>
                      {selectedStudent ? `${selectedStudent.name} (${selectedStudent.nisn || '-'})` : 'Pilih siswa...'}
                    </span>
                    <ChevronLeft className={`transform transition-transform ${isStudentDropdownOpen ? '-rotate-90' : 'rotate-0'} text-gray-400`} size={16} />
                  </div>
                  
                  {isStudentDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                      <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                        <input
                          type="text"
                          placeholder="Cari siswa..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      </div>
                      {filteredStudents.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                          Siswa tidak ditemukan
                        </div>
                      ) : (
                        filteredStudents.map((student: User) => (
                          <div
                            key={student.id}
                            onClick={() => handleStudentSelect(student.id)}
                            className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 ${
                              formData.studentId === student.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            <div className="font-medium">{student.name}</div>
                            <div className="text-xs text-gray-500">NISN: {student.nisn || '-'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kategori
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Kedisiplinan, Prestasi"
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Poin
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.point}
                    onChange={(e) => setFormData({ ...formData, point: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deskripsi <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Deskripsikan perilaku siswa..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {editingId ? 'Simpan Perubahan' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
