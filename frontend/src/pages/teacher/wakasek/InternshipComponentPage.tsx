import React, { useState } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { internshipService } from '../../../services/internship.service';
import { classService, type Class } from '../../../services/class.service';
import { 
  Plus, 
  Edit, 
  Trash2, 
  X, 
  Building2, 
  Gavel, 
  FileText, 
  Save, 
  Search,
  Link,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';

// Types
interface AssessmentComponent {
  id: number;
  name: string;
  weight: number;
  description?: string;
  isActive: boolean;
}

interface Internship {
  id: number;
  student: {
    name: string;
    nis: string;
    studentClass: { name: string };
  };
  companyName: string;
  industryScore?: number;
  defenseScore?: number;
  finalGrade?: number;
  status: string;
  accessCode?: string;
  accessCodeExpiresAt?: string;
}

type ActiveYearContext = {
  activeYear?: {
    id?: number;
  } | null;
};

type ClassListPayload = {
  classes?: Class[];
};

type InternshipListPayload = {
  internships?: Internship[];
  data?: Internship[];
  pagination?: InternshipPaginationMeta;
  meta?: InternshipPaginationMeta;
};

type InternshipPaginationMeta = {
  total?: number;
  page?: number;
  limit?: number;
};

type NormalizedPaginationMeta = {
  total: number;
  page: number;
  limit: number;
};

type AssessmentComponentForm = {
  name: string;
  weight: number;
  description: string;
  isActive: boolean;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return err.response?.data?.message || err.message || fallback;
  }
  return fallback;
};

export const InternshipComponentPage = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const activeTab = (searchParams.get('tab') as 'industry' | 'components' | 'summary') || 'industry';

  const setActiveTab = (tab: 'industry' | 'components' | 'summary') => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', tab);
      return newParams;
    });
  };
  
  // --- States for Components Tab ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<AssessmentComponent | null>(null);
  const [componentForm, setComponentForm] = useState({
    name: '',
    weight: 0,
    description: '',
    isActive: true
  });

  // --- States for Industry Tab ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | undefined>(undefined);
  const [editingScores, setEditingScores] = useState<Record<number, number>>({});

  // ================= QUERIES =================

  // 0. Get Active Academic Year from Context (DashboardLayout)
  const context = useOutletContext<ActiveYearContext>();
  const activeYear = context?.activeYear;
  const activeYearId = activeYear?.id;

  // 1. Fetch Classes (for Filter)
  const { data: classesResponse } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classService.list({ limit: 100 })
  });
  const rawClassesData = classesResponse?.data as ClassListPayload | Class[] | undefined;
  // Handle response structure { classes: [...], pagination: ... } from class.controller.ts
  const classes: Class[] = Array.isArray(rawClassesData) ? rawClassesData : rawClassesData?.classes || [];

  // 1. Fetch Components (for Tab 2)
  const { data: componentsResponse, isLoading: isLoadingComponents } = useQuery({
    queryKey: ['internship-components'],
    queryFn: () => internshipService.getAssessmentComponents(),
    enabled: activeTab === 'components'
  });

  // 2. Fetch Internships (for Tab 1 & 3)
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState(10);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: internshipsResponse, isLoading: isLoadingInternships } = useQuery({
    queryKey: ['all-internships', page, limit, debouncedSearch, selectedClassId, activeYearId],
    queryFn: () => internshipService.getAllInternships({ 
      status: 'ACTIVE,DEFENSE_COMPLETED,REPORT_SUBMITTED,COMPLETED,DEFENSE_SCHEDULED,APPROVED',
      page,
      limit,
      search: debouncedSearch,
      classId: selectedClassId,
      academicYearId: activeYearId
    }),
    enabled: !!activeYearId,
    staleTime: 1000 * 60 * 5, // 5 menit cache agar tidak loading ulang saat pindah tab
    placeholderData: keepPreviousData // Keep showing old data while fetching new page
  });

  const components = componentsResponse?.data?.data || [];
  // Handle new response structure { data: [...], meta: ... }
  const rawInternshipsData = (
    internshipsResponse?.data as { data?: InternshipListPayload | Internship[] } | undefined
  )?.data;
  const internships: Internship[] = Array.isArray(rawInternshipsData) 
    ? rawInternshipsData 
    : (rawInternshipsData?.internships || rawInternshipsData?.data || []);
  
  const meta: NormalizedPaginationMeta = (() => {
    const source: InternshipPaginationMeta | undefined = !Array.isArray(rawInternshipsData)
      ? rawInternshipsData?.pagination || rawInternshipsData?.meta
      : undefined;
    return {
      total: Number(source?.total ?? 0),
      page: Number(source?.page ?? page),
      limit: Number(source?.limit ?? limit),
    };
  })();

  // No client-side filtering needed anymore
  const filteredInternships = internships;

  // ================= MUTATIONS =================

  // Component Mutations
  const createComponentMutation = useMutation({
    mutationFn: internshipService.createAssessmentComponent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internship-components'] });
      toast.success('Komponen penilaian berhasil dibuat');
      closeModal();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal membuat komponen'));
    }
  });

  const updateComponentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AssessmentComponentForm }) => 
      internshipService.updateAssessmentComponent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internship-components'] });
      toast.success('Komponen penilaian berhasil diperbarui');
      closeModal();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui komponen'));
    }
  });

  const deleteComponentMutation = useMutation({
    mutationFn: internshipService.deleteAssessmentComponent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internship-components'] });
      toast.success('Komponen penilaian berhasil dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus komponen'));
    }
  });

  // Industry Grade Mutation
  const updateIndustryGradeMutation = useMutation({
    mutationFn: ({ id, score }: { id: number; score: number }) => 
      internshipService.updateIndustryGrade(id, score),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-internships'] });
      toast.success('Nilai Industri berhasil disimpan');
      setEditingScores({});
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan nilai'));
    }
  });

  const generateAccessCodeMutation = useMutation({
    mutationFn: (id: number) => internshipService.generateAccessCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-internships'] });
      toast.success('Link akses berhasil dibuat');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal membuat link'));
    }
  });

  // ================= HANDLERS =================

  const handleGenerateLink = (id: number) => {
    generateAccessCodeMutation.mutate(id);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/pkl/grade/${code}`;
    navigator.clipboard.writeText(url);
    toast.success('Link berhasil disalin');
  };

  // Component Handlers
  const handleEditComponent = (component: AssessmentComponent) => {
    setEditingComponent(component);
    setComponentForm({
      name: component.name,
      weight: component.weight,
      description: component.description || '',
      isActive: component.isActive
    });
    setIsModalOpen(true);
  };

  const handleDeleteComponent = (id: number) => {
    Swal.fire({
      title: 'Hapus Komponen?',
      text: "Data yang dihapus tidak dapat dikembalikan!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Ya, Hapus!',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) {
        deleteComponentMutation.mutate(id);
      }
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingComponent(null);
    setComponentForm({
      name: '',
      weight: 0,
      description: '',
      isActive: true
    });
  };

  const handleComponentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingComponent) {
      updateComponentMutation.mutate({ id: editingComponent.id, data: componentForm });
    } else {
      createComponentMutation.mutate(componentForm);
    }
  };

  // Industry Grade Handlers
  const handleScoreChange = (id: number, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setEditingScores(prev => ({ ...prev, [id]: num }));
    }
  };

  const saveIndustryScore = (id: number) => {
    const score = editingScores[id];
    if (score !== undefined) {
      updateIndustryGradeMutation.mutate({ id, score });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nilai PKL</h1>
          <p className="text-gray-500">Manajemen nilai industri, komponen sidang, dan rekapitulasi.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
          <button
            onClick={() => setActiveTab('industry')}
            className={`
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === 'industry'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span>Nilai PKL (Industri)</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('components')}
            className={`
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === 'components'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center gap-2">
              <Gavel className="w-4 h-4" />
              <span>Nilai Sidang PKL (Komponen)</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('summary')}
            className={`
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === 'summary'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Rekap Nilai PKL</span>
            </div>
          </button>
        </div>
      </div>

      {/* TAB CONTENT: Industry Grades */}
      {activeTab === 'industry' && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-lg font-medium text-gray-900">Input Nilai Industri (Bobot 70%)</h3>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Pilih Kelas:</span>
                <select
                  value={selectedClassId || ''}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value ? Number(e.target.value) : undefined);
                    setPage(1); // Reset to page 1 when filter changes
                  }}
                  className="block w-full sm:w-48 rounded-lg border border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Semua Kelas</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari siswa..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NISN/NIS</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempat PKL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Akses Industri</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai Industri (0-100)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingInternships ? (
                  <tr><td colSpan={7} className="text-center py-4">Memuat data...</td></tr>
                ) : filteredInternships.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-4">Data tidak ditemukan</td></tr>
                ) : (
                  filteredInternships.map(internship => (
                    <tr key={internship.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {internship.student.nis}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {internship.student.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{internship.student.studentClass?.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{internship.companyName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {internship.accessCode ? (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleCopyLink(internship.accessCode!)}
                              className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                              title="Salin Link"
                            >
                              <Copy size={16} />
                            </button>
                            <a
                              href={`/pkl/grade/${internship.accessCode}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-50 transition-colors"
                              title="Buka Link"
                            >
                              <ExternalLink size={16} />
                            </a>
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">Aktif</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateLink(internship.id)}
                            className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            disabled={generateAccessCodeMutation.isPending}
                          >
                            <Link className="w-3 h-3 mr-1.5" />
                            Generate Link
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="w-24 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          value={editingScores[internship.id] ?? internship.industryScore ?? ''}
                          onChange={(e) => handleScoreChange(internship.id, e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {editingScores[internship.id] !== undefined && (
                          <button
                            onClick={() => saveIndustryScore(internship.id)}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Simpan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= meta.total}
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
              <div className="flex items-center gap-4">
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="block w-full rounded-md border-gray-300 py-1.5 text-base leading-5 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={35}>35</option>
                  <option value={50}>50</option>
                </select>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * limit >= meta.total}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Components (Existing Logic) */}
      {activeTab === 'components' && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-gray-900">Daftar Komponen Penilaian Sidang (Bobot 30%)</h3>
            <button
              onClick={() => {
                setEditingComponent(null);
                setComponentForm({ name: '', weight: 0, description: '', isActive: true });
                setIsModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Tambah Komponen
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Komponen</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deskripsi</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingComponents ? (
                  <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">Memuat data...</td></tr>
                ) : components.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">Belum ada komponen penilaian</td></tr>
                ) : (
                  components.map((component: AssessmentComponent) => (
                    <tr key={component.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{component.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{component.description || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          component.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {component.isActive ? 'Aktif' : 'Non-aktif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEditComponent(component)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteComponent(component.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= meta.total}
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
              <div className="flex items-center gap-4">
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="block w-full rounded-md border-gray-300 py-1.5 text-base leading-5 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={35}>35</option>
                  <option value={50}>50</option>
                </select>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * limit >= meta.total}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Summary */}
      {activeTab === 'summary' && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-lg font-medium text-gray-900">Rekapitulasi Nilai PKL Akhir</h3>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Pilih Kelas:</span>
                <select
                  value={selectedClassId || ''}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value ? Number(e.target.value) : undefined);
                    setPage(1); // Reset to page 1 when filter changes
                  }}
                  className="block w-full sm:w-48 rounded-lg border border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Semua Kelas</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari siswa..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NISN/NIS</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai Industri (70%)</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai Sidang (30%)</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingInternships ? (
                  <tr><td colSpan={6} className="text-center py-4">Memuat data...</td></tr>
                ) : filteredInternships.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-4">Data tidak ditemukan</td></tr>
                ) : (
                  filteredInternships.map(internship => (
                    <tr key={internship.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {internship.student.nis}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {internship.student.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{internship.student.studentClass?.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        {internship.industryScore ? (
                          <span className="font-medium text-gray-900">{internship.industryScore}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        {internship.defenseScore ? (
                          <span className="font-medium text-gray-900">{internship.defenseScore.toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {internship.finalGrade ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            internship.finalGrade >= 75 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {internship.finalGrade.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination for Summary Tab */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= meta.total}
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
              <div className="flex items-center gap-4">
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="block w-full rounded-md border-gray-300 py-1.5 text-base leading-5 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={35}>35</option>
                  <option value={50}>50</option>
                </select>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * limit >= meta.total}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Components (Same as before) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-900 opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full relative z-[101]">
              <form onSubmit={handleComponentSubmit}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {editingComponent ? 'Edit Komponen' : 'Tambah Komponen'}
                    </h3>
                    <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-500">
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nama Komponen</label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={componentForm.name}
                        onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })}
                        placeholder="Contoh: Penguasaan Materi"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Deskripsi</label>
                      <textarea
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        rows={3}
                        value={componentForm.description}
                        onChange={(e) => setComponentForm({ ...componentForm, description: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={componentForm.isActive}
                        onChange={(e) => setComponentForm({ ...componentForm, isActive: e.target.checked })}
                      />
                      <label className="ml-2 block text-sm text-gray-900">Aktif</label>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                    disabled={createComponentMutation.isPending || updateComponentMutation.isPending}
                  >
                    {createComponentMutation.isPending || updateComponentMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
