import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { userService } from '../../../services/user.service';
import type { User } from '../../../types/auth';
import type { Class } from '../../../services/class.service';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  XCircle, 
  FileText,
  ShieldAlert,
  BookOpenText,
  GraduationCap,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
// import { useAuth } from '../../../hooks/useAuth';
import { classService } from '../../../services/class.service';
import { permissionService, PermissionStatus, type StudentPermission } from '../../../services/permission.service';
import { academicYearService } from '../../../services/academicYear.service';
import { authService } from '../../../services/auth.service';
import { examService, type ExamRestriction } from '../../../services/exam.service';
import { gradeService, type HomeroomResultPublicationProgram } from '../../../services/grade.service';
import { liveQueryOptions } from '../../../lib/query/liveQuery';
import HomeroomBookPanel from '../../../components/homeroom/HomeroomBookPanel';

interface ExamRestrictionsResponse {
  restrictions: ExamRestriction[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface PermissionsQueryResponse {
  permissions: StudentPermission[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return '-';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return format(parsed, 'dd MMM yyyy HH:mm', { locale: idLocale });
};

export const HomeroomPermissionsPage = () => {
  const { user: contextUser } = useOutletContext<{ user: User; activeYear: unknown }>() || {};

  // Get Current User via Query (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const userId = user?.id;
  const queryClient = useQueryClient();
  type ActiveTab = 'permissions' | 'exam_restrictions' | 'result_publication' | 'homeroom_book';
  const [activeTabOverride, setActiveTabOverride] = useState<ActiveTab | null>(null);

  // Get Active Academic Year
  // const { data: fetchedActiveYear } = useActiveAcademicYear(); // Assuming useActiveAcademicYear is imported or needed
  // But wait, it's not imported in old_str. Let's see if it's used later.
  // The file Read showed "activeAcademicYear" used? No, I don't see it used in the snippet I read.
  // Ah, let's check the rest of the file.


  // Fetch User Profile for Preferences
  const { data: userData } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => {
      if (!userId) return null;
      return userService.getById(userId);
    },
    enabled: !!userId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<User>) => {
      if (!userId) throw new Error('User ID not found');
      return userService.update(userId, data);
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    }
  });

  const savedActiveTab = useMemo<ActiveTab>(() => {
    const prefs = userData?.data?.preferences as Record<string, unknown> | undefined;
    const savedTab = String(prefs?.['homeroom-permissions-active-tab'] || '');
    if (savedTab === 'exam_restrictions') return 'exam_restrictions';
    if (savedTab === 'result_publication') return 'result_publication';
    if (savedTab === 'homeroom_book') return 'homeroom_book';
    return 'permissions';
  }, [userData?.data?.preferences]);

  const activeTab: ActiveTab = activeTabOverride || savedActiveTab;

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTabOverride(tab);
    setPage(1);
    setSearch('');
    if (userId) {
      const currentPrefs = (userData?.data?.preferences || {}) as Record<string, unknown>;
      updateProfileMutation.mutate({
        preferences: { ...currentPrefs, 'homeroom-permissions-active-tab': tab }
      });
    }
  };
  
  // Shared Pagination & Search State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  
  // Filter States
  const [selectedSemesterOverride, setSelectedSemesterOverride] = useState<'ODD' | 'EVEN' | ''>('');
  const [selectedExamTypeOverride, setSelectedExamTypeOverride] = useState('');
  
  // Fetch Active Academic Year
  const { data: activeAcademicYear } = useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      const res = await academicYearService.getActive();
      return res.data;
    }
  });

  const { data: examPrograms } = useQuery({
    queryKey: ['exam-programs', 'student', activeAcademicYear?.id],
    queryFn: async () => {
      if (!activeAcademicYear?.id) return [];
      const res = await examService.getPrograms({
        academicYearId: activeAcademicYear.id,
        roleContext: 'student',
      });
      return res?.data?.programs || [];
    },
    enabled: !!activeAcademicYear?.id && (activeTab === 'exam_restrictions' || activeTab === 'homeroom_book'),
    ...liveQueryOptions,
  });

  // Fetch Homeroom Class
  const { data: homeroomClass } = useQuery({
    queryKey: ['homeroom-class', user?.id, activeAcademicYear?.id],
    queryFn: async () => {
      if (!user?.id || !activeAcademicYear?.id) return null;
      const response = await classService.list({ teacherId: user.id, limit: 100 });
      const activeClass = response.data?.classes?.find((c: Class) => c.academicYearId === activeAcademicYear.id);
      return activeClass || null;
    },
    enabled: !!user?.id && !!activeAcademicYear?.id,
  });

  const defaultSemester = useMemo<'ODD' | 'EVEN' | ''>(() => {
    const name = String(activeAcademicYear?.name || '').toUpperCase();
    if (name.includes('GANJIL')) return 'ODD';
    if (name.includes('GENAP')) return 'EVEN';
    return '';
  }, [activeAcademicYear?.name]);

  const selectedSemester = selectedSemesterOverride || defaultSemester;

  const examTypeOptions = useMemo(() => {
    const programs = Array.isArray(examPrograms) ? examPrograms : [];
    const dedupByCode = new Map<string, { value: string; label: string }>();

    for (const program of programs) {
      if (!program?.isActive) continue;
      if (!program?.showOnStudentMenu) continue;

      const fixedSemester = program.fixedSemester as 'ODD' | 'EVEN' | null;
      if (selectedSemester && fixedSemester && fixedSemester !== selectedSemester) continue;

      const value = String(program.code || '').trim().toUpperCase();
      if (!value || dedupByCode.has(value)) continue;

      const baseType = String(program.baseTypeCode || program.baseType || '').trim().toUpperCase();
      const rawLabel = String(program.shortLabel || program.label || value).trim();
      const label = baseType ? `${rawLabel} (${baseType})` : rawLabel;
      dedupByCode.set(value, { value, label: label || value });
    }

    return Array.from(dedupByCode.values());
  }, [examPrograms, selectedSemester]);

  const selectedExamType = useMemo(() => {
    if (!selectedExamTypeOverride) return '';
    const stillAvailable = examTypeOptions.some((option) => option.value === selectedExamTypeOverride);
    return stillAvailable ? selectedExamTypeOverride : '';
  }, [examTypeOptions, selectedExamTypeOverride]);
  // Fetch Class Students (Independent of Exam Type) - REMOVED as we use server-side pagination in restrictions query

  // Permissions Query
  const { data: permissionsResponse, isLoading: isLoadingPermissions } = useQuery<PermissionsQueryResponse>({
    queryKey: ['homeroom-permissions', homeroomClass?.id, activeAcademicYear?.id, page, limit, search],
    queryFn: async () => {
      if (!homeroomClass || !activeAcademicYear) {
        return {
          permissions: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        };
      }
      const res = await permissionService.getPermissions({
        classId: homeroomClass.id,
        academicYearId: activeAcademicYear.id,
        page,
        limit,
        search
      });
      return res.data as PermissionsQueryResponse;
    },
    enabled: !!homeroomClass && !!activeAcademicYear && activeTab === 'permissions',
    ...liveQueryOptions,
  });

  // Exam Restrictions Query (Only when filters selected)
  const { data: restrictionsResponse, isLoading: isLoadingRestrictions } = useQuery<ExamRestrictionsResponse>({
    queryKey: ['exam-restrictions', homeroomClass?.id, activeAcademicYear?.id, selectedSemester, selectedExamType, page, limit, search],
    queryFn: async () => {
      if (!homeroomClass || !activeAcademicYear || !selectedSemester || !selectedExamType) {
        return { restrictions: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      }
      const res = await examService.getRestrictions({
        classId: homeroomClass.id,
        academicYearId: activeAcademicYear.id,
        semester: selectedSemester,
        examType: selectedExamType,
        programCode: selectedExamType,
        page,
        limit,
        search
      });
      return res.data as ExamRestrictionsResponse; // Structure: { restrictions: [...], meta: {...} }
    },
    enabled: !!homeroomClass && !!activeAcademicYear && !!selectedSemester && !!selectedExamType && activeTab === 'exam_restrictions',
    placeholderData: keepPreviousData,
    ...liveQueryOptions,
  });

  const {
    data: resultPublicationResponse,
    isLoading: isLoadingResultPublications,
    isError: isResultPublicationsError,
    refetch: refetchResultPublications,
  } = useQuery({
    queryKey: ['homeroom-result-publications', homeroomClass?.id, activeAcademicYear?.id],
    queryFn: async () => {
      if (!homeroomClass?.id) return null;
      return gradeService.getHomeroomResultPublications({ classId: homeroomClass.id });
    },
    enabled: !!homeroomClass?.id && !!activeAcademicYear?.id && activeTab === 'result_publication',
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number, status: PermissionStatus, note?: string }) => 
      permissionService.updateStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homeroom-permissions'] });
      toast.success('Status izin berhasil diperbarui');
    },
    onError: () => toast.error('Gagal memperbarui status izin')
  });

  const updateRestrictionMutation = useMutation({
    mutationFn: (data: { academicYearId: number; semester: string; examType: string; programCode?: string; studentId: number; isBlocked: boolean; reason?: string }) => examService.updateRestriction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-restrictions'] });
      toast.success('Akses ujian berhasil diperbarui');
    },
    onError: () => toast.error('Gagal memperbarui akses ujian')
  });

  const updateResultPublicationMutation = useMutation({
    mutationFn: (payload: { classId: number; publicationCode: string; mode: 'FOLLOW_GLOBAL' | 'BLOCKED' }) =>
      gradeService.updateHomeroomResultPublication(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homeroom-result-publications'] });
      toast.success('Publikasi nilai berhasil diperbarui');
    },
    onError: () => toast.error('Gagal memperbarui publikasi nilai'),
  });

  // Handlers
  const handleApprove = (id: number) => {
    if (window.confirm('Setujui pengajuan izin ini?')) {
      updateStatusMutation.mutate({ id, status: PermissionStatus.APPROVED });
    }
  };

  const handleReject = (id: number) => {
    const note = window.prompt('Masukkan alasan penolakan:');
    if (note !== null) {
      updateStatusMutation.mutate({ id, status: PermissionStatus.REJECTED, note });
    }
  };

  const handleToggleRestriction = (item: ExamRestriction) => {
    if (!activeAcademicYear || !selectedSemester || !selectedExamType) {
        toast.error('Pilih semester dan jenis ujian terlebih dahulu');
        return;
    }

    if (item.isBlocked && item.autoBlocked) {
      const autoReasons: string[] = [];
      if (item.flags.belowKkm) autoReasons.push('nilai masih di bawah KKM');
      if (item.flags.financeBlocked) {
        autoReasons.push(
          item.flags.financeOverdue
            ? 'policy clearance finance belum terpenuhi karena ada tunggakan jatuh tempo'
            : 'policy clearance finance belum terpenuhi',
        );
      }

      toast.error(
        autoReasons.length > 0
          ? `Akses ujian otomatis ditolak karena ${autoReasons.join(', ')}. Selesaikan sumber masalahnya terlebih dahulu.`
          : 'Akses ujian otomatis ditolak. Selesaikan sumber masalahnya terlebih dahulu.',
      );
      return;
    }

    if (!item.isBlocked) {
      const reason = window.prompt(
        `Masukkan alasan pembatasan ujian untuk ${item.student.name}:`,
        'Masih ada administrasi/tunggakan yang belum diselesaikan. Silakan hubungi wali kelas.',
      );
      if (reason === null) return;

      updateRestrictionMutation.mutate({
        studentId: item.student.id,
        academicYearId: activeAcademicYear.id,
        semester: selectedSemester,
        examType: selectedExamType,
        programCode: selectedExamType,
        isBlocked: true,
        reason,
      });
    } else {
      if (window.confirm(`Buka akses ujian manual untuk ${item.student.name}?`)) {
        updateRestrictionMutation.mutate({
          studentId: item.student.id,
          academicYearId: activeAcademicYear.id,
          semester: selectedSemester,
          examType: selectedExamType,
          programCode: selectedExamType,
          isBlocked: false,
          reason: '',
        });
      }
    }
  };

  // Removed unused handleReasonChange function

  const resultPublicationPrograms = useMemo(() => {
    const rows = resultPublicationResponse?.programs || [];
    return rows.filter((program) => {
      const fixedSemester = program.fixedSemester as 'ODD' | 'EVEN' | null;
      if (selectedSemester && fixedSemester && fixedSemester !== selectedSemester) return false;
      return true;
    });
  }, [resultPublicationResponse?.programs, selectedSemester]);

  const resultPublicationSummary = useMemo(() => {
    const total = resultPublicationPrograms.length;
    const blocked = resultPublicationPrograms.filter((program) => program.homeroomPublication.mode === 'BLOCKED').length;
    const visible = resultPublicationPrograms.filter((program) => program.effectiveVisibility.canViewDetails).length;
    const waitingWakakur = resultPublicationPrograms.filter(
      (program) =>
        program.homeroomPublication.mode === 'FOLLOW_GLOBAL' && !program.globalRelease.canViewDetails,
    ).length;

    return {
      total,
      blocked,
      visible,
      waitingWakakur,
    };
  }, [resultPublicationPrograms]);

  const handleToggleResultPublication = (program: HomeroomResultPublicationProgram) => {
    if (!homeroomClass?.id) {
      toast.error('Kelas wali belum ditemukan.');
      return;
    }

    const nextMode = program.homeroomPublication.mode === 'BLOCKED' ? 'FOLLOW_GLOBAL' : 'BLOCKED';
    const message =
      nextMode === 'BLOCKED'
        ? `Tahan publikasi nilai ${program.shortLabel} untuk siswa di kelas ${homeroomClass.name}?`
        : `Kembalikan publikasi nilai ${program.shortLabel} agar mengikuti jadwal Wakakur?`;

    if (!window.confirm(message)) return;

    updateResultPublicationMutation.mutate({
      classId: homeroomClass.id,
      publicationCode: program.publicationCode,
      mode: nextMode,
    });
  };


  // Derived Data for Pagination
  const permissions = permissionsResponse?.permissions || [];
  const permissionsMeta = permissionsResponse?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };

  // Use server-side paginated data directly
  const restrictionsPaginated = restrictionsResponse?.restrictions || [];
  const restrictionsMeta = restrictionsResponse?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };

  const currentTotal = activeTab === 'permissions' ? permissionsMeta.total : restrictionsMeta.total;
  const currentTotalPages = activeTab === 'permissions' ? permissionsMeta.totalPages : restrictionsMeta.totalPages;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Persetujuan Izin</h1>
          <p className="text-gray-500 mt-1">Kelola perizinan, akses ujian, publikasi nilai, dan Buku Wali Kelas siswa</p>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs & Filter Header */}
        <div className="border-b border-gray-200 bg-gray-50 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200">
              <button
                onClick={() => handleTabChange('permissions')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'permissions'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} />
                  <span>Daftar Izin</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('exam_restrictions')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'exam_restrictions'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} />
                  <span>Akses Ujian</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('homeroom_book')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'homeroom_book'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpenText size={16} />
                  <span>Buku Wali Kelas</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('result_publication')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'result_publication'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GraduationCap size={16} />
                  <span>Publikasi Nilai</span>
                </div>
              </button>
            </div>
          </div>

          {activeTab === 'exam_restrictions' && (
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto justify-end">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Semester</span>
                <select
                  value={selectedSemester}
                  onChange={(e) => {
                    setSelectedSemesterOverride(e.target.value as 'ODD' | 'EVEN' | '');
                    setSelectedExamTypeOverride('');
                    setPage(1);
                  }}
                  className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white text-sm"
                >
                  <option value="" disabled>Pilih Semester</option>
                  <option value="ODD">Ganjil</option>
                  <option value="EVEN">Genap</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Jenis Ujian</span>
                <select
                  value={selectedExamType}
                  onChange={(e) => {
                    setSelectedExamTypeOverride(e.target.value);
                    setPage(1);
                  }}
                  className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white text-sm"
                >
                  <option value="" disabled>Pilih Jenis Ujian</option>
                  {examTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'result_publication' && (
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto justify-end">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Semester</span>
                <select
                  value={selectedSemester}
                  onChange={(e) => {
                    setSelectedSemesterOverride(e.target.value as 'ODD' | 'EVEN' | '');
                    setPage(1);
                  }}
                  className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white text-sm"
                >
                  <option value="" disabled>Pilih Semester</option>
                  <option value="ODD">Ganjil</option>
                  <option value="EVEN">Genap</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Search & Limit Toolbar */}
        {activeTab !== 'homeroom_book' && activeTab !== 'result_publication' ? (
        <div className="p-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Cari siswa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
            />
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
        ) : null}

        {/* Content Table */}
        {activeTab === 'homeroom_book' ? (
          <div className="p-4">
            <HomeroomBookPanel
              mode="homeroom"
              academicYearId={activeAcademicYear?.id}
              classId={homeroomClass?.id}
              examPrograms={examPrograms}
            />
          </div>
        ) : activeTab === 'result_publication' ? (
          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Default publikasi tetap mengikuti jadwal Wakakur. Gunakan kontrol ini jika wali kelas perlu menahan hasil nilai program tertentu agar belum tampil ke akun siswa.
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  key: 'total',
                  title: 'Program Semester',
                  value: String(resultPublicationSummary.total),
                  subtitle: selectedSemester === 'EVEN' ? 'Program semester genap' : 'Program semester ganjil',
                  tone: 'border-blue-200 bg-blue-50 text-blue-700',
                },
                {
                  key: 'visible',
                  title: 'Sudah Tampil',
                  value: String(resultPublicationSummary.visible),
                  subtitle: 'Saat ini bisa dibuka siswa',
                  tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                },
                {
                  key: 'blocked',
                  title: 'Ditahan Wali',
                  value: String(resultPublicationSummary.blocked),
                  subtitle: 'Ditahan manual wali kelas',
                  tone: 'border-rose-200 bg-rose-50 text-rose-700',
                },
                {
                  key: 'waiting',
                  title: 'Menunggu Wakakur',
                  value: String(resultPublicationSummary.waitingWakakur),
                  subtitle: 'Masih ikut jadwal rilis global',
                  tone: 'border-amber-200 bg-amber-50 text-amber-700',
                },
              ].map((item) => (
                <div key={item.key} className={`rounded-xl border p-4 ${item.tone}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">{item.title}</p>
                  <p className="mt-2 text-2xl font-bold">{item.value}</p>
                  <p className="mt-2 text-xs">{item.subtitle}</p>
                </div>
              ))}
            </div>

            {isLoadingResultPublications ? (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-gray-500">
                Memuat kontrol publikasi nilai...
              </div>
            ) : isResultPublicationsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-rose-700">
                <p className="font-medium">Gagal memuat kontrol publikasi nilai.</p>
                <button
                  type="button"
                  onClick={() => refetchResultPublications()}
                  className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-700"
                >
                  Coba Lagi
                </button>
              </div>
            ) : resultPublicationPrograms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-gray-500">
                Tidak ada program ujian siswa yang relevan untuk semester ini.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {resultPublicationPrograms.map((program) => {
                  const isBlocked = program.homeroomPublication.mode === 'BLOCKED';
                  const effectiveTone =
                    program.effectiveVisibility.tone === 'green'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : program.effectiveVisibility.tone === 'amber'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700';

                  return (
                    <div key={program.publicationCode} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                            <span>{program.publicationCode}</span>
                            <span>•</span>
                            <span>
                              {program.fixedSemester === 'EVEN'
                                ? 'Semester Genap'
                                : program.fixedSemester === 'ODD'
                                  ? 'Semester Ganjil'
                                  : 'Semua Semester'}
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-gray-900">{program.label}</h3>
                          <p className="mt-1 text-sm text-gray-500">{program.globalRelease.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleResultPublication(program)}
                          disabled={updateResultPublicationMutation.isPending}
                          className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            isBlocked
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-rose-600 text-white hover:bg-rose-700'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {isBlocked ? 'Ikuti Jadwal Wakakur' : 'Tahan Publikasi'}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Rilis Wakakur</p>
                          <p className="mt-2 text-sm font-semibold text-gray-900">{program.globalRelease.label}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {program.globalRelease.effectiveDate
                              ? `Efektif ${formatDateTime(program.globalRelease.effectiveDate)}`
                              : 'Tanpa tanggal khusus'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Gate Wali Kelas</p>
                          <p className="mt-2 text-sm font-semibold text-gray-900">{program.homeroomPublication.label}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {program.homeroomPublication.updatedAt
                              ? `Diperbarui ${formatDateTime(program.homeroomPublication.updatedAt)}`
                              : 'Belum ada override manual'}
                          </p>
                        </div>
                        <div className={`rounded-xl border p-3 ${effectiveTone}`}>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Status ke Siswa</p>
                          <p className="mt-2 text-sm font-semibold">{program.effectiveVisibility.label}</p>
                          <p className="mt-1 text-xs">{program.effectiveVisibility.description}</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Kebijakan aktif</p>
                        <p className="mt-1">{program.homeroomPublication.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <div className="overflow-x-auto">
          {activeTab === 'exam_restrictions' ? (
            <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Gunakan blokir manual ini untuk kasus administrasi atau tunggakan yang belum tersinkron di modul finance.
              Keterangan yang Anda isi akan tampil ke siswa pada menu ujian.
            </div>
          ) : null}
          {activeTab === 'permissions' ? (
              /* Permissions Table */
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    No
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    NISN
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nama Siswa
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tanggal
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jenis
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keterangan
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bukti
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingPermissions ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      Memuat data...
                    </td>
                  </tr>
                ) : permissions.map((item: StudentPermission, index: number) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.student?.nisn || item.student?.nis}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          {item.student?.photo ? (
                            <img className="h-10 w-10 rounded-full object-cover" src={item.student.photo} alt="" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-xs">
                              {item.student?.name?.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{item.student?.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">
                          {format(new Date(item.startDate), 'dd MMM', { locale: idLocale })} - {format(new Date(item.endDate), 'dd MMM yyyy', { locale: idLocale })}
                        </span>
                        <span className="text-xs text-gray-400">
                          Diajukan: {format(new Date(item.createdAt), 'dd/MM/yyyy', { locale: idLocale })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.type === 'SICK' ? 'bg-red-100 text-red-800' :
                        item.type === 'PERMISSION' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.type === 'SICK' ? 'Sakit' : item.type === 'PERMISSION' ? 'Izin' : 'Lainnya'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={item.reason || ''}>
                      {item.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {item.fileUrl ? (
                        <a 
                          href={item.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 inline-flex items-center"
                          title="Lihat Bukti"
                        >
                          <FileText size={18} />
                        </a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        item.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.status === 'APPROVED' ? 'Disetujui' : 
                         item.status === 'REJECTED' ? 'Ditolak' : 'Menunggu'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      {item.status === 'PENDING' && (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="text-green-600 hover:text-green-900 bg-green-50 p-1 rounded hover:bg-green-100 transition-colors"
                            title="Setujui"
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            className="text-red-600 hover:text-red-900 bg-red-50 p-1 rounded hover:bg-red-100 transition-colors"
                            title="Tolak"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      )}
                      {item.status !== 'PENDING' && (
                        <span className="text-gray-400 text-xs italic">
                          Selesai
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {permissions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-900 font-medium">Tidak ada data pengajuan izin</p>
                        <p className="text-sm text-gray-500">Belum ada siswa yang mengajukan izin pada periode ini.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* Exam Restrictions Table */
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    No
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    NISN
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nama Siswa
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Izinkan/Tolak
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keterangan
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingRestrictions ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Memuat data akses ujian...
                    </td>
                  </tr>
                ) : restrictionsPaginated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <ShieldAlert className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-900 font-medium">Data tidak ditemukan</p>
                        <p className="text-sm text-gray-500">
                          {!selectedSemester || !selectedExamType 
                            ? "Silakan pilih semester dan jenis ujian terlebih dahulu" 
                            : "Tidak ada siswa yang ditemukan"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  restrictionsPaginated.map((item: ExamRestriction, index: number) => (
                    <tr key={item.student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {item.student.nisn || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.student.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <div className="flex justify-center items-center gap-4">
                           {/* Toggle Switch */}
                           <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={!item.isBlocked}
                              onChange={() => handleToggleRestriction(item)}
                            />
                            <div className="w-11 h-6 bg-red-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                          </label>
                          <span className={`text-xs font-medium w-16 text-left ${!item.isBlocked ? 'text-green-600' : 'text-red-600'}`}>
                            {!item.isBlocked ? 'Diizinkan' : 'Ditolak'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {!item.isBlocked ? (
                          <span className="italic text-gray-400">-</span>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm text-gray-700">
                              {item.reason || 'Akses ditutup'}
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {item.manualBlocked && (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                  Manual
                                </span>
                              )}
                              {item.flags.belowKkm && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                  Nilai &lt; KKM
                                </span>
                              )}
                              {item.flags.financeBlocked && (
                                <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                  Tunggakan
                                </span>
                              )}
                              {item.flags.financeBlocked && item.flags.financeOverdue && (
                                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                                  Jatuh Tempo
                                </span>
                              )}
                              {item.flags.financeOutstanding && !item.flags.financeBlocked && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  Info Finance
                                </span>
                              )}
                            </div>

                            {item.details.belowKkmSubjects.length > 0 && (
                              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                <p className="font-medium">Mapel di bawah KKM</p>
                                <p>
                                  {item.details.belowKkmSubjects
                                    .slice(0, 3)
                                    .map((subject) => `${subject.subjectName} (${subject.score}/${subject.kkm})`)
                                    .join(', ')}
                                  {item.details.belowKkmSubjects.length > 3
                                    ? ` +${item.details.belowKkmSubjects.length - 3} mapel lainnya`
                                    : ''}
                                </p>
                              </div>
                            )}

                            {item.flags.financeOutstanding && (
                              <div className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
                                <p className="font-medium">
                                  Tunggakan {formatCurrency(item.details.outstandingAmount)}
                                </p>
                                <p>
                                  {item.details.outstandingInvoices} tagihan aktif
                                  {item.details.overdueInvoices > 0
                                    ? `, ${item.details.overdueInvoices} sudah jatuh tempo`
                                    : ''}
                                </p>
                                {!item.flags.financeBlocked ? (
                                  <p className="mt-1 text-[11px] text-orange-600">
                                    Program ujian ini tidak memblokir akses dari status tunggakan tersebut.
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        )}

        {/* Pagination Footer */}
        {activeTab !== 'homeroom_book' && activeTab !== 'result_publication' ? (
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="text-sm text-gray-500">
            Menampilkan{' '}
            <span className="font-medium">
              {currentTotal === 0 ? 0 : (page - 1) * limit + 1}
            </span>{' '}
            sampai{' '}
            <span className="font-medium">
              {Math.min(page * limit, currentTotal)}
            </span>{' '}
            dari{' '}
            <span className="font-medium">
              {currentTotal}
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
                setPage((p) => Math.min(currentTotalPages, p + 1))
              }
              disabled={page === currentTotalPages}
              className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
};

export default HomeroomPermissionsPage;
