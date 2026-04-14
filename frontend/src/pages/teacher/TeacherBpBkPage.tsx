import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit,
  FileStack,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { classService } from '../../services/class.service';
import { bpbkService } from '../../services/bpbk.service';
import { behaviorService } from '../../services/behavior.service';
import { permissionService } from '../../services/permission.service';

type TabKey = 'summary' | 'behaviors' | 'permissions' | 'counselings';

type BehaviorTypeFilter = 'ALL' | 'POSITIVE' | 'NEGATIVE';
type PermissionStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type CounselingStatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

type BehaviorFormState = {
  id?: number;
  classId: string;
  studentId: string;
  date: string;
  type: 'POSITIVE' | 'NEGATIVE';
  category: string;
  point: string;
  description: string;
};

type CounselingFormState = {
  id?: number;
  classId: string;
  studentId: string;
  sessionDate: string;
  issueSummary: string;
  counselingNote: string;
  followUpPlan: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  summonParent: boolean;
  summonDate: string;
  summonLetterNumber: string;
};

const tabItems: Array<{ key: TabKey; label: string; path: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'summary', label: 'Dashboard BP/BK', path: '/teacher/bk', icon: ShieldAlert },
  { key: 'behaviors', label: 'Kasus Perilaku', path: '/teacher/bk/behaviors', icon: AlertCircle },
  { key: 'permissions', label: 'Perizinan Siswa', path: '/teacher/bk/permissions', icon: ClipboardList },
  { key: 'counselings', label: 'Konseling & Tindak Lanjut', path: '/teacher/bk/counselings', icon: FileStack },
];

function resolveActiveTab(pathname: string): TabKey {
  if (pathname.includes('/teacher/bk/behaviors')) return 'behaviors';
  if (pathname.includes('/teacher/bk/permissions')) return 'permissions';
  if (pathname.includes('/teacher/bk/counselings')) return 'counselings';
  return 'summary';
}

function formatDate(dateString?: string | Date | null) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function parseClassList(payload: any): Array<{ id: number; name: string }> {
  const rawList = payload?.data?.classes || payload?.classes || payload?.data?.data?.classes || [];
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item) => ({ id: Number(item?.id), name: String(item?.name || '-') }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function parseStudentList(payload: any): Array<{ id: number; name: string; nis: string; nisn: string }> {
  const rawList = payload?.data?.students || payload?.students || [];
  if (!Array.isArray(rawList)) return [];

  return rawList
    .map((item) => ({
      id: Number(item?.id),
      name: String(item?.name || '-'),
      nis: String(item?.nis || '-'),
      nisn: String(item?.nisn || '-'),
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getPermissionBadgeClass(status: string) {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'REJECTED') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function getPermissionLabel(status: string) {
  if (status === 'APPROVED') return 'Disetujui';
  if (status === 'REJECTED') return 'Ditolak';
  return 'Pending';
}

function getCounselingStatusLabel(status: string) {
  if (status === 'OPEN') return 'Baru';
  if (status === 'IN_PROGRESS') return 'Diproses';
  return 'Selesai';
}

function getCounselingStatusClass(status: string) {
  if (status === 'OPEN') return 'bg-red-100 text-red-700';
  if (status === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

const defaultBehaviorForm = (classId?: number): BehaviorFormState => ({
  classId: classId ? String(classId) : '',
  studentId: '',
  date: new Date().toISOString().split('T')[0],
  type: 'NEGATIVE',
  category: '',
  point: '0',
  description: '',
});

const defaultCounselingForm = (classId?: number): CounselingFormState => ({
  classId: classId ? String(classId) : '',
  studentId: '',
  sessionDate: new Date().toISOString().split('T')[0],
  issueSummary: '',
  counselingNote: '',
  followUpPlan: '',
  status: 'OPEN',
  summonParent: false,
  summonDate: '',
  summonLetterNumber: '',
});

export function TeacherBpBkPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const activeTab = resolveActiveTab(location.pathname);
  const { data: activeYear } = useActiveAcademicYear();

  const academicYearId = useMemo(() => {
    const raw = (activeYear as any)?.id ?? (activeYear as any)?.academicYearId;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : undefined;
  }, [activeYear]);

  const [classIdFilter, setClassIdFilter] = useState<string>('all');

  const [behaviorSearch, setBehaviorSearch] = useState('');
  const [behaviorType, setBehaviorType] = useState<BehaviorTypeFilter>('ALL');
  const [behaviorPage, setBehaviorPage] = useState(1);

  const [permissionSearch, setPermissionSearch] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatusFilter>('ALL');
  const [permissionPage, setPermissionPage] = useState(1);

  const [counselingSearch, setCounselingSearch] = useState('');
  const [counselingStatus, setCounselingStatus] = useState<CounselingStatusFilter>('ALL');
  const [counselingPage, setCounselingPage] = useState(1);

  const [isBehaviorModalOpen, setIsBehaviorModalOpen] = useState(false);
  const [behaviorForm, setBehaviorForm] = useState<BehaviorFormState>(defaultBehaviorForm());

  const [isCounselingModalOpen, setIsCounselingModalOpen] = useState(false);
  const [counselingForm, setCounselingForm] = useState<CounselingFormState>(defaultCounselingForm());

  const limit = 20;

  const selectedClassId = classIdFilter === 'all' ? undefined : Number(classIdFilter);

  const classesQuery = useQuery({
    queryKey: ['bpbk-class-options', academicYearId],
    enabled: Boolean(academicYearId),
    queryFn: async () => classService.list({ academicYearId, page: 1, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });

  const classes = useMemo(() => parseClassList(classesQuery.data), [classesQuery.data]);

  useEffect(() => {
    if (!isBehaviorModalOpen) return;
    if (!behaviorForm.classId && classes.length > 0) {
      setBehaviorForm((prev) => ({ ...prev, classId: String(selectedClassId || classes[0].id) }));
    }
  }, [classes, behaviorForm.classId, isBehaviorModalOpen, selectedClassId]);

  useEffect(() => {
    if (!isCounselingModalOpen) return;
    if (!counselingForm.classId && classes.length > 0) {
      setCounselingForm((prev) => ({ ...prev, classId: String(selectedClassId || classes[0].id) }));
    }
  }, [classes, counselingForm.classId, isCounselingModalOpen, selectedClassId]);

  const behaviorFormClassId = Number(behaviorForm.classId);
  const counselingFormClassId = Number(counselingForm.classId);

  const classStudentsBehaviorQuery = useQuery({
    queryKey: ['bpbk-class-students-behavior', behaviorFormClassId],
    enabled: isBehaviorModalOpen && Number.isFinite(behaviorFormClassId) && behaviorFormClassId > 0,
    queryFn: async () => classService.getById(behaviorFormClassId),
    staleTime: 60 * 1000,
  });

  const classStudentsCounselingQuery = useQuery({
    queryKey: ['bpbk-class-students-counseling', counselingFormClassId],
    enabled: isCounselingModalOpen && Number.isFinite(counselingFormClassId) && counselingFormClassId > 0,
    queryFn: async () => classService.getById(counselingFormClassId),
    staleTime: 60 * 1000,
  });

  const behaviorStudents = useMemo(() => parseStudentList(classStudentsBehaviorQuery.data), [classStudentsBehaviorQuery.data]);
  const counselingStudents = useMemo(() => parseStudentList(classStudentsCounselingQuery.data), [classStudentsCounselingQuery.data]);

  const summaryQuery = useQuery({
    queryKey: ['bpbk-summary', academicYearId, selectedClassId],
    enabled: Boolean(academicYearId),
    queryFn: async () =>
      bpbkService.getSummary({
        academicYearId,
        classId: selectedClassId,
      }),
  });

  const behaviorQuery = useQuery({
    queryKey: ['bpbk-behaviors', academicYearId, selectedClassId, behaviorType, behaviorSearch, behaviorPage],
    enabled: Boolean(academicYearId) && activeTab === 'behaviors',
    queryFn: async () =>
      bpbkService.getBehaviors({
        academicYearId,
        classId: selectedClassId,
        type: behaviorType === 'ALL' ? undefined : behaviorType,
        search: behaviorSearch.trim() || undefined,
        page: behaviorPage,
        limit,
      }),
  });

  const permissionQuery = useQuery({
    queryKey: ['bpbk-permissions', academicYearId, selectedClassId, permissionStatus, permissionSearch, permissionPage],
    enabled: Boolean(academicYearId) && activeTab === 'permissions',
    queryFn: async () =>
      bpbkService.getPermissions({
        academicYearId,
        classId: selectedClassId,
        status: permissionStatus === 'ALL' ? undefined : permissionStatus,
        search: permissionSearch.trim() || undefined,
        page: permissionPage,
        limit,
      }),
  });

  const counselingQuery = useQuery({
    queryKey: ['bpbk-counselings', academicYearId, selectedClassId, counselingStatus, counselingSearch, counselingPage],
    enabled: Boolean(academicYearId) && activeTab === 'counselings',
    queryFn: async () =>
      bpbkService.getCounselings({
        academicYearId,
        classId: selectedClassId,
        status: counselingStatus === 'ALL' ? undefined : counselingStatus,
        search: counselingSearch.trim() || undefined,
        page: counselingPage,
        limit,
      }),
  });

  const createBehaviorMutation = useMutation({
    mutationFn: behaviorService.createBehavior,
    onSuccess: () => {
      toast.success('Catatan perilaku berhasil ditambahkan');
      setIsBehaviorModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['bpbk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bpbk-behaviors'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menambah catatan perilaku');
    },
  });

  const updateBehaviorMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => behaviorService.updateBehavior(id, payload),
    onSuccess: () => {
      toast.success('Catatan perilaku berhasil diperbarui');
      setIsBehaviorModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['bpbk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bpbk-behaviors'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal memperbarui catatan perilaku');
    },
  });

  const deleteBehaviorMutation = useMutation({
    mutationFn: (id: number) => behaviorService.deleteBehavior(id),
    onSuccess: () => {
      toast.success('Catatan perilaku berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['bpbk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bpbk-behaviors'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menghapus catatan perilaku');
    },
  });

  const permissionDecisionMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: 'APPROVED' | 'REJECTED'; note?: string }) =>
      permissionService.updateStatus(id, status, note),
    onSuccess: () => {
      toast.success('Status perizinan berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['bpbk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bpbk-permissions'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal memperbarui status perizinan');
    },
  });

  const createCounselingMutation = useMutation({
    mutationFn: bpbkService.createCounseling,
    onSuccess: () => {
      toast.success('Data konseling berhasil ditambahkan');
      setIsCounselingModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['bpbk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bpbk-counselings'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menambah data konseling');
    },
  });

  const updateCounselingMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => bpbkService.updateCounseling(id, payload),
    onSuccess: () => {
      toast.success('Data konseling berhasil diperbarui');
      setIsCounselingModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['bpbk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bpbk-counselings'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal memperbarui data konseling');
    },
  });

  const summary = summaryQuery.data?.data?.summary;
  const recentBehaviors = summaryQuery.data?.data?.recentBehaviors || [];
  const recentPermissions = summaryQuery.data?.data?.recentPermissions || [];
  const recentCounselings = summaryQuery.data?.data?.recentCounselings || [];
  const behaviorRows = behaviorQuery.data?.data?.behaviors || [];
  const behaviorMeta = behaviorQuery.data?.data?.meta;
  const permissionRows = permissionQuery.data?.data?.permissions || [];
  const permissionMeta = permissionQuery.data?.data?.meta;
  const counselingRows = counselingQuery.data?.data?.counselings || [];
  const counselingMeta = counselingQuery.data?.data?.meta;

  const isLoadingTabData =
    summaryQuery.isLoading ||
    (activeTab === 'behaviors' && behaviorQuery.isLoading) ||
    (activeTab === 'permissions' && permissionQuery.isLoading) ||
    (activeTab === 'counselings' && counselingQuery.isLoading);

  const onOpenCreateBehavior = () => {
    setBehaviorForm(defaultBehaviorForm(selectedClassId || classes[0]?.id));
    setIsBehaviorModalOpen(true);
  };

  const onOpenEditBehavior = (row: any) => {
    setBehaviorForm({
      id: row.id,
      classId: String(row.classId || selectedClassId || classes[0]?.id || ''),
      studentId: String(row.studentId || ''),
      date: new Date(row.date).toISOString().split('T')[0],
      type: row.type === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE',
      category: row.category || '',
      point: String(row.point ?? 0),
      description: row.description || '',
    });
    setIsBehaviorModalOpen(true);
  };

  const onSubmitBehavior = (event: React.FormEvent) => {
    event.preventDefault();

    const classId = Number(behaviorForm.classId);
    const studentId = Number(behaviorForm.studentId);
    const point = Number(behaviorForm.point);

    if (!academicYearId || !classId || !studentId || !behaviorForm.date || !behaviorForm.description.trim()) {
      toast.error('Lengkapi data catatan perilaku terlebih dahulu.');
      return;
    }

    if (!Number.isFinite(point)) {
      toast.error('Poin tidak valid.');
      return;
    }

    const payload = {
      studentId,
      classId,
      academicYearId,
      date: behaviorForm.date,
      type: behaviorForm.type,
      category: behaviorForm.category.trim() || undefined,
      description: behaviorForm.description.trim(),
      point,
    };

    if (behaviorForm.id) {
      updateBehaviorMutation.mutate({ id: behaviorForm.id, payload });
      return;
    }

    createBehaviorMutation.mutate(payload as any);
  };

  const onDeleteBehavior = (id: number) => {
    if (!window.confirm('Hapus catatan perilaku ini?')) return;
    deleteBehaviorMutation.mutate(id);
  };

  const onPermissionDecision = (id: number, status: 'APPROVED' | 'REJECTED') => {
    if (status === 'APPROVED') {
      if (!window.confirm('Setujui pengajuan izin ini?')) return;
      permissionDecisionMutation.mutate({ id, status });
      return;
    }

    const note = window.prompt('Masukkan alasan penolakan (opsional):') || undefined;
    permissionDecisionMutation.mutate({ id, status, note });
  };

  const onOpenCreateCounseling = () => {
    setCounselingForm(defaultCounselingForm(selectedClassId || classes[0]?.id));
    setIsCounselingModalOpen(true);
  };

  const onOpenEditCounseling = (row: any) => {
    setCounselingForm({
      id: row.id,
      classId: String(row.classId || selectedClassId || classes[0]?.id || ''),
      studentId: String(row.studentId || ''),
      sessionDate: new Date(row.sessionDate).toISOString().split('T')[0],
      issueSummary: row.issueSummary || '',
      counselingNote: row.counselingNote || '',
      followUpPlan: row.followUpPlan || '',
      status: row.status || 'OPEN',
      summonParent: Boolean(row.summonParent),
      summonDate: row.summonDate ? new Date(row.summonDate).toISOString().split('T')[0] : '',
      summonLetterNumber: row.summonLetterNumber || '',
    });
    setIsCounselingModalOpen(true);
  };

  const onSubmitCounseling = (event: React.FormEvent) => {
    event.preventDefault();

    const classId = Number(counselingForm.classId);
    const studentId = Number(counselingForm.studentId);

    if (!classId || !studentId || !counselingForm.sessionDate || !counselingForm.issueSummary.trim()) {
      toast.error('Lengkapi data konseling terlebih dahulu.');
      return;
    }

    if (counselingForm.summonParent && !counselingForm.summonDate) {
      toast.error('Tanggal pemanggilan orang tua wajib diisi.');
      return;
    }

    const payload = {
      academicYearId,
      classId,
      studentId,
      sessionDate: counselingForm.sessionDate,
      issueSummary: counselingForm.issueSummary.trim(),
      counselingNote: counselingForm.counselingNote.trim() || undefined,
      followUpPlan: counselingForm.followUpPlan.trim() || undefined,
      status: counselingForm.status,
      summonParent: counselingForm.summonParent,
      summonDate: counselingForm.summonParent ? counselingForm.summonDate : undefined,
      summonLetterNumber: counselingForm.summonParent ? counselingForm.summonLetterNumber.trim() || undefined : undefined,
    };

    if (counselingForm.id) {
      updateCounselingMutation.mutate({ id: counselingForm.id, payload });
      return;
    }

    createCounselingMutation.mutate(payload as any);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
        <h1 className="text-lg font-bold text-gray-900">BP/BK Center</h1>
        <p className="mt-1 text-sm text-gray-600">Monitoring perilaku, perizinan, konseling, dan tindak lanjut siswa lintas kelas.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <Link
                key={tab.key}
                to={tab.path}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-3 border-b border-gray-100 p-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-500">Filter Kelas</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={classIdFilter}
              onChange={(event) => {
                setClassIdFilter(event.target.value);
                setBehaviorPage(1);
                setPermissionPage(1);
                setCounselingPage(1);
              }}
            >
              <option value="all">Semua Kelas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={String(cls.id)}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'behaviors' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Tipe</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={behaviorType}
                  onChange={(event) => {
                    setBehaviorType(event.target.value as BehaviorTypeFilter);
                    setBehaviorPage(1);
                  }}
                >
                  <option value="ALL">Semua</option>
                  <option value="NEGATIVE">Negatif</option>
                  <option value="POSITIVE">Positif</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Cari</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Nama/NIS/NISN/kasus..."
                  value={behaviorSearch}
                  onChange={(event) => {
                    setBehaviorSearch(event.target.value);
                    setBehaviorPage(1);
                  }}
                />
              </div>
            </>
          ) : null}

          {activeTab === 'permissions' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Status</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={permissionStatus}
                  onChange={(event) => {
                    setPermissionStatus(event.target.value as PermissionStatusFilter);
                    setPermissionPage(1);
                  }}
                >
                  <option value="ALL">Semua</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Disetujui</option>
                  <option value="REJECTED">Ditolak</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Cari</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Nama/NIS/NISN/alasan..."
                  value={permissionSearch}
                  onChange={(event) => {
                    setPermissionSearch(event.target.value);
                    setPermissionPage(1);
                  }}
                />
              </div>
            </>
          ) : null}

          {activeTab === 'counselings' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Status Konseling</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={counselingStatus}
                  onChange={(event) => {
                    setCounselingStatus(event.target.value as CounselingStatusFilter);
                    setCounselingPage(1);
                  }}
                >
                  <option value="ALL">Semua</option>
                  <option value="OPEN">Baru</option>
                  <option value="IN_PROGRESS">Diproses</option>
                  <option value="CLOSED">Selesai</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Cari</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Cari ringkasan/nama siswa..."
                  value={counselingSearch}
                  onChange={(event) => {
                    setCounselingSearch(event.target.value);
                    setCounselingPage(1);
                  }}
                />
              </div>
            </>
          ) : null}
        </div>

        {isLoadingTabData ? <div className="p-6 text-sm text-gray-500">Memuat data BP/BK...</div> : null}

        {!isLoadingTabData && activeTab === 'summary' ? (
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Kasus Negatif</p>
                <p className="mt-1 text-2xl font-bold text-red-700">{summary?.negativeCases || 0}</p>
                <p className="mt-1 text-xs text-red-600">Bulan ini: {summary?.negativeCasesThisMonth || 0}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Kasus Positif</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{summary?.positiveCases || 0}</p>
                <p className="mt-1 text-xs text-emerald-600">Total kasus: {summary?.totalCases || 0}</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Izin Pending</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">{summary?.pendingPermissions || 0}</p>
                <p className="mt-1 text-xs text-blue-600">
                  Approved: {summary?.approvedPermissions || 0} • Rejected: {summary?.rejectedPermissions || 0}
                </p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Siswa Risiko Tinggi</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">{summary?.highRiskStudents || 0}</p>
                <p className="mt-1 text-xs text-amber-600">Threshold otomatis BP/BK</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Konseling Baru</p>
                <p className="mt-1 text-2xl font-bold text-red-700">{summary?.openCounselings || 0}</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Konseling Diproses</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">{summary?.inProgressCounselings || 0}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Konseling Selesai</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{summary?.closedCounselings || 0}</p>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Surat Panggilan Aktif</p>
                <p className="mt-1 text-2xl font-bold text-violet-700">{summary?.summonPendingCounselings || 0}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">Kasus Terbaru</div>
                <div className="divide-y divide-gray-100">
                  {recentBehaviors.length === 0 ? <div className="p-4 text-sm text-gray-500">Belum ada kasus perilaku.</div> : null}
                  {recentBehaviors.map((item: any) => (
                    <div key={item.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">{item.student?.name || '-'}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.type === 'NEGATIVE' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.type === 'NEGATIVE' ? 'Negatif' : 'Positif'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.class?.name || '-'} • {formatDate(item.date)}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{item.description || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">Perizinan Terbaru</div>
                <div className="divide-y divide-gray-100">
                  {recentPermissions.length === 0 ? <div className="p-4 text-sm text-gray-500">Belum ada data perizinan.</div> : null}
                  {recentPermissions.map((item: any) => (
                    <div key={item.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">{item.student?.name || '-'}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getPermissionBadgeClass(item.status)}`}>
                          {getPermissionLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.student?.studentClass?.name || '-'} • {formatDate(item.startDate)} - {formatDate(item.endDate)}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{item.reason || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">Konseling Terbaru</div>
                <div className="divide-y divide-gray-100">
                  {recentCounselings.length === 0 ? <div className="p-4 text-sm text-gray-500">Belum ada data konseling.</div> : null}
                  {recentCounselings.map((item: any) => (
                    <div key={item.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">{item.student?.name || '-'}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getCounselingStatusClass(item.status)}`}>
                          {getCounselingStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.class?.name || '-'} • {formatDate(item.sessionDate)}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{item.issueSummary || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoadingTabData && activeTab === 'behaviors' ? (
          <div>
            <div className="flex justify-end border-b border-gray-100 p-3">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={onOpenCreateBehavior}
              >
                <Plus size={16} />
                Tambah Catatan
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">No</th>
                    <th className="px-3 py-2 text-left">Tanggal</th>
                    <th className="px-3 py-2 text-left">Nama Siswa</th>
                    <th className="px-3 py-2 text-left">Kelas</th>
                    <th className="px-3 py-2 text-left">Tipe</th>
                    <th className="px-3 py-2 text-left">Kategori</th>
                    <th className="px-3 py-2 text-left">Poin</th>
                    <th className="px-3 py-2 text-left">Deskripsi</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {behaviorRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                        Tidak ada data kasus perilaku.
                      </td>
                    </tr>
                  ) : null}
                  {behaviorRows.map((item: any, index: number) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{(behaviorPage - 1) * limit + index + 1}</td>
                      <td className="px-3 py-2">{formatDate(item.date)}</td>
                      <td className="px-3 py-2">{item.student?.name || '-'}</td>
                      <td className="px-3 py-2">{item.class?.name || '-'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.type === 'NEGATIVE' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.type === 'NEGATIVE' ? 'Negatif' : 'Positif'}
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.category || '-'}</td>
                      <td className="px-3 py-2">{item.point ?? 0}</td>
                      <td className="max-w-xs px-3 py-2">{item.description || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded-md border border-blue-200 p-1.5 text-blue-700 hover:bg-blue-50"
                            onClick={() => onOpenEditBehavior(item)}
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                            onClick={() => onDeleteBehavior(item.id)}
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-end gap-3 border-t border-gray-100 p-3 text-xs text-gray-500">
                <button
                  className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                  disabled={behaviorPage <= 1}
                  onClick={() => setBehaviorPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Hal {behaviorMeta?.page || 1} / {Math.max(behaviorMeta?.totalPages || 1, 1)}
                </span>
                <button
                  className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                  disabled={(behaviorMeta?.page || 1) >= (behaviorMeta?.totalPages || 1)}
                  onClick={() => setBehaviorPage((prev) => prev + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoadingTabData && activeTab === 'permissions' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">No</th>
                  <th className="px-3 py-2 text-left">Siswa</th>
                  <th className="px-3 py-2 text-left">Kelas</th>
                  <th className="px-3 py-2 text-left">Tipe</th>
                  <th className="px-3 py-2 text-left">Periode</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Alasan</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {permissionRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                      Tidak ada data perizinan.
                    </td>
                  </tr>
                ) : null}
                {permissionRows.map((item: any, index: number) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{(permissionPage - 1) * limit + index + 1}</td>
                    <td className="px-3 py-2">{item.student?.name || '-'}</td>
                    <td className="px-3 py-2">{item.student?.studentClass?.name || '-'}</td>
                    <td className="px-3 py-2">{item.type}</td>
                    <td className="px-3 py-2">
                      <div className="inline-flex items-center gap-1 text-xs text-gray-600">
                        <CalendarDays size={14} />
                        <span>
                          {formatDate(item.startDate)} - {formatDate(item.endDate)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${getPermissionBadgeClass(item.status)}`}>
                        {item.status === 'APPROVED' ? <CheckCircle2 size={13} /> : null}
                        {getPermissionLabel(item.status)}
                      </span>
                    </td>
                    <td className="max-w-sm px-3 py-2">{item.reason || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {item.status === 'PENDING' ? (
                          <>
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              onClick={() => onPermissionDecision(item.id, 'APPROVED')}
                            >
                              <CheckCircle2 size={13} /> Setujui
                            </button>
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              onClick={() => onPermissionDecision(item.id, 'REJECTED')}
                            >
                              <XCircle size={13} /> Tolak
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Selesai</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 p-3 text-xs text-gray-500">
              <button
                className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                disabled={permissionPage <= 1}
                onClick={() => setPermissionPage((prev) => Math.max(1, prev - 1))}
              >
                Prev
              </button>
              <span>
                Hal {permissionMeta?.page || 1} / {Math.max(permissionMeta?.totalPages || 1, 1)}
              </span>
              <button
                className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                disabled={(permissionMeta?.page || 1) >= (permissionMeta?.totalPages || 1)}
                onClick={() => setPermissionPage((prev) => prev + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {!isLoadingTabData && activeTab === 'counselings' ? (
          <div>
            <div className="flex justify-end border-b border-gray-100 p-3">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={onOpenCreateCounseling}
              >
                <Plus size={16} />
                Tambah Konseling
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">No</th>
                    <th className="px-3 py-2 text-left">Tanggal</th>
                    <th className="px-3 py-2 text-left">Siswa</th>
                    <th className="px-3 py-2 text-left">Kelas</th>
                    <th className="px-3 py-2 text-left">Ringkasan</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Surat Panggilan</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {counselingRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                        Tidak ada data konseling.
                      </td>
                    </tr>
                  ) : null}
                  {counselingRows.map((item: any, index: number) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{(counselingPage - 1) * limit + index + 1}</td>
                      <td className="px-3 py-2">{formatDate(item.sessionDate)}</td>
                      <td className="px-3 py-2">{item.student?.name || '-'}</td>
                      <td className="px-3 py-2">{item.class?.name || '-'}</td>
                      <td className="max-w-sm px-3 py-2">{item.issueSummary || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getCounselingStatusClass(item.status)}`}>
                          {getCounselingStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {item.summonParent ? (
                          <div>
                            <p className="font-semibold text-violet-700">Aktif</p>
                            <p>{formatDate(item.summonDate)}</p>
                            <p>{item.summonLetterNumber || '-'}</p>
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded-md border border-blue-200 p-1.5 text-blue-700 hover:bg-blue-50"
                            onClick={() => onOpenEditCounseling(item)}
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-end gap-3 border-t border-gray-100 p-3 text-xs text-gray-500">
                <button
                  className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                  disabled={counselingPage <= 1}
                  onClick={() => setCounselingPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Hal {counselingMeta?.page || 1} / {Math.max(counselingMeta?.totalPages || 1, 1)}
                </span>
                <button
                  className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                  disabled={(counselingMeta?.page || 1) >= (counselingMeta?.totalPages || 1)}
                  onClick={() => setCounselingPage((prev) => prev + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isBehaviorModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setIsBehaviorModalOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{behaviorForm.id ? 'Edit Catatan Perilaku' : 'Tambah Catatan Perilaku'}</h3>
            </div>
            <form className="space-y-4 p-5" onSubmit={onSubmitBehavior}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Kelas</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={behaviorForm.classId}
                    onChange={(event) => setBehaviorForm((prev) => ({ ...prev, classId: event.target.value, studentId: '' }))}
                    required
                  >
                    <option value="" disabled>
                      Pilih kelas
                    </option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={String(cls.id)}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Siswa</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={behaviorForm.studentId}
                    onChange={(event) => setBehaviorForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    required
                  >
                    <option value="" disabled>
                      {classStudentsBehaviorQuery.isLoading ? 'Memuat siswa...' : 'Pilih siswa'}
                    </option>
                    {behaviorStudents.map((student) => (
                      <option key={student.id} value={String(student.id)}>
                        {student.name} ({student.nisn !== '-' ? student.nisn : student.nis})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Tanggal</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={behaviorForm.date}
                    onChange={(event) => setBehaviorForm((prev) => ({ ...prev, date: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Tipe</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={behaviorForm.type}
                    onChange={(event) => setBehaviorForm((prev) => ({ ...prev, type: event.target.value as 'POSITIVE' | 'NEGATIVE' }))}
                    required
                  >
                    <option value="NEGATIVE">Negatif</option>
                    <option value="POSITIVE">Positif</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Kategori</label>
                  <input
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={behaviorForm.category}
                    onChange={(event) => setBehaviorForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Kategori"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Poin</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={behaviorForm.point}
                    onChange={(event) => setBehaviorForm((prev) => ({ ...prev, point: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Deskripsi</label>
                <textarea
                  className="min-h-[96px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={behaviorForm.description}
                  onChange={(event) => setBehaviorForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Deskripsi catatan perilaku"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setIsBehaviorModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={createBehaviorMutation.isPending || updateBehaviorMutation.isPending}
                >
                  {createBehaviorMutation.isPending || updateBehaviorMutation.isPending
                    ? 'Menyimpan...'
                    : behaviorForm.id
                      ? 'Simpan Perubahan'
                      : 'Simpan Catatan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCounselingModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setIsCounselingModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{counselingForm.id ? 'Edit Konseling' : 'Tambah Konseling & Tindak Lanjut'}</h3>
            </div>
            <form className="space-y-4 p-5" onSubmit={onSubmitCounseling}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Kelas</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={counselingForm.classId}
                    onChange={(event) => setCounselingForm((prev) => ({ ...prev, classId: event.target.value, studentId: '' }))}
                    required
                  >
                    <option value="" disabled>
                      Pilih kelas
                    </option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={String(cls.id)}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Siswa</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={counselingForm.studentId}
                    onChange={(event) => setCounselingForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    required
                  >
                    <option value="" disabled>
                      {classStudentsCounselingQuery.isLoading ? 'Memuat siswa...' : 'Pilih siswa'}
                    </option>
                    {counselingStudents.map((student) => (
                      <option key={student.id} value={String(student.id)}>
                        {student.name} ({student.nisn !== '-' ? student.nisn : student.nis})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Tanggal Konseling</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={counselingForm.sessionDate}
                    onChange={(event) => setCounselingForm((prev) => ({ ...prev, sessionDate: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Status</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={counselingForm.status}
                    onChange={(event) =>
                      setCounselingForm((prev) => ({ ...prev, status: event.target.value as 'OPEN' | 'IN_PROGRESS' | 'CLOSED' }))
                    }
                  >
                    <option value="OPEN">Baru</option>
                    <option value="IN_PROGRESS">Diproses</option>
                    <option value="CLOSED">Selesai</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={counselingForm.summonParent}
                      onChange={(event) =>
                        setCounselingForm((prev) => ({ ...prev, summonParent: event.target.checked, summonDate: '', summonLetterNumber: '' }))
                      }
                    />
                    Butuh surat panggilan orang tua
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Ringkasan Masalah</label>
                <textarea
                  className="min-h-[90px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={counselingForm.issueSummary}
                  onChange={(event) => setCounselingForm((prev) => ({ ...prev, issueSummary: event.target.value }))}
                  required
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Catatan Konseling</label>
                  <textarea
                    className="min-h-[90px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={counselingForm.counselingNote}
                    onChange={(event) => setCounselingForm((prev) => ({ ...prev, counselingNote: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Rencana Tindak Lanjut</label>
                  <textarea
                    className="min-h-[90px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={counselingForm.followUpPlan}
                    onChange={(event) => setCounselingForm((prev) => ({ ...prev, followUpPlan: event.target.value }))}
                  />
                </div>
              </div>

              {counselingForm.summonParent ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Tanggal Panggil Orang Tua</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      value={counselingForm.summonDate}
                      onChange={(event) => setCounselingForm((prev) => ({ ...prev, summonDate: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">No. Surat Panggilan</label>
                    <input
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      value={counselingForm.summonLetterNumber}
                      onChange={(event) => setCounselingForm((prev) => ({ ...prev, summonLetterNumber: event.target.value }))}
                      placeholder="Opsional"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setIsCounselingModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={createCounselingMutation.isPending || updateCounselingMutation.isPending}
                >
                  {createCounselingMutation.isPending || updateCounselingMutation.isPending
                    ? 'Menyimpan...'
                    : counselingForm.id
                      ? 'Simpan Perubahan'
                      : 'Simpan Konseling'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TeacherBpBkPage;
