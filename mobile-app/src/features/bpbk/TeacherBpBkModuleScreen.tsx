import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../components/MobileMenuTabBar';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { ENV } from '../../config/env';
import { adminApi, AdminClass, AdminClassDetailStudent } from '../admin/adminApi';
import { academicYearApi } from '../academicYear/academicYearApi';
import { useAuth } from '../auth/AuthProvider';
import { kesiswaanApi } from '../kesiswaan/kesiswaanApi';
import { KesiswaanBehaviorType } from '../kesiswaan/types';
import { openWebModuleRoute } from '../../lib/navigation/webModuleRoute';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../lib/ui/feedback';
import {
  teacherBpBkApi,
  TeacherBpBkBehaviorRow,
  TeacherBpBkCounselingRow,
  TeacherBpBkPermissionRow,
} from './teacherBpBkApi';

type ModuleMode = 'SUMMARY' | 'BEHAVIORS' | 'PERMISSIONS' | 'COUNSELINGS';
type BehaviorTypeFilter = 'ALL' | KesiswaanBehaviorType;
type PermissionStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type CounselingStatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

type BehaviorFormState = {
  studentId: string;
  classId: string;
  date: string;
  type: KesiswaanBehaviorType;
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

const MODULE_TABS: Array<{
  mode: ModuleMode;
  label: string;
  iconName: React.ComponentProps<typeof Feather>['name'];
  route: '/teacher/bk' | '/teacher/bk/behaviors' | '/teacher/bk/permissions' | '/teacher/bk/counselings';
}> = [
  { mode: 'SUMMARY', label: 'Dashboard', iconName: 'grid', route: '/teacher/bk' },
  { mode: 'BEHAVIORS', label: 'Perilaku', iconName: 'alert-circle', route: '/teacher/bk/behaviors' },
  { mode: 'PERMISSIONS', label: 'Perizinan', iconName: 'file-text', route: '/teacher/bk/permissions' },
  { mode: 'COUNSELINGS', label: 'Konseling', iconName: 'message-circle', route: '/teacher/bk/counselings' },
];

const BEHAVIOR_FILTER_OPTIONS: Array<{ value: BehaviorTypeFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Perilaku' },
  { value: 'NEGATIVE', label: 'Negatif' },
  { value: 'POSITIVE', label: 'Positif' },
];

const BEHAVIOR_TYPE_OPTIONS: Array<{ value: KesiswaanBehaviorType; label: string }> = [
  { value: 'NEGATIVE', label: 'Negatif' },
  { value: 'POSITIVE', label: 'Positif' },
];

const PERMISSION_STATUS_OPTIONS: Array<{ value: PermissionStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const COUNSELING_STATUS_OPTIONS: Array<{ value: CounselingStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'OPEN', label: 'Baru' },
  { value: 'IN_PROGRESS', label: 'Diproses' },
  { value: 'CLOSED', label: 'Selesai' },
];

const COUNSELING_FORM_STATUS_OPTIONS: Array<{ value: CounselingFormState['status']; label: string }> = [
  { value: 'OPEN', label: 'Baru' },
  { value: 'IN_PROGRESS', label: 'Diproses' },
  { value: 'CLOSED', label: 'Selesai' },
];

const SUMMON_PARENT_OPTIONS = [
  { value: 'NO', label: 'Tanpa Surat Panggilan' },
  { value: 'YES', label: 'Butuh Surat Panggilan' },
] as const;

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function hasBpBkDuty(duties?: string[]) {
  if (!Array.isArray(duties)) return false;
  return duties.some((duty) => normalizeDuty(duty) === 'BP_BK');
}

function todayIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultBehaviorForm(classId?: number): BehaviorFormState {
  return {
    studentId: '',
    classId: classId ? String(classId) : '',
    date: todayIsoDate(),
    type: 'NEGATIVE',
    category: '',
    point: '0',
    description: '',
  };
}

function createDefaultCounselingForm(classId?: number): CounselingFormState {
  return {
    classId: classId ? String(classId) : '',
    studentId: '',
    sessionDate: todayIsoDate(),
    issueSummary: '',
    counselingNote: '',
    followUpPlan: '',
    status: 'OPEN',
    summonParent: false,
    summonDate: '',
    summonLetterNumber: '',
  };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateRange(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return '-';
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function behaviorBadge(type: KesiswaanBehaviorType) {
  if (type === 'POSITIVE') {
    return { label: 'Positif', color: '#166534', bg: '#dcfce7', border: '#86efac' };
  }
  return { label: 'Negatif', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
}

function permissionBadge(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  if (status === 'APPROVED') {
    return { label: 'Disetujui', color: '#166534', bg: '#dcfce7', border: '#86efac' };
  }
  if (status === 'REJECTED') {
    return { label: 'Ditolak', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
  }
  return { label: 'Menunggu', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' };
}

function counselingBadge(status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED') {
  if (status === 'CLOSED') {
    return { label: 'Selesai', color: '#166534', bg: '#dcfce7', border: '#86efac' };
  }
  if (status === 'IN_PROGRESS') {
    return { label: 'Diproses', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' };
  }
  return { label: 'Baru', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
}

function resolvePermissionType(type?: string | null) {
  const value = String(type || '').toUpperCase();
  if (value === 'SICK') return 'Sakit';
  if (value === 'PERMISSION') return 'Izin';
  return 'Lainnya';
}

function resolveAttachmentUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return fileUrl.startsWith('/') ? `${webBaseUrl}${fileUrl}` : `${webBaseUrl}/${fileUrl}`;
}

function SectionCard({
  title,
  subtitle,
  children,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>{title}</Text>
          {subtitle ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{subtitle}</Text> : null}
        </View>
        {rightAction}
      </View>
      {children}
    </View>
  );
}

function EmptyStateCard({ message }: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderStyle: 'dashed',
        borderRadius: 12,
        backgroundColor: '#fff',
        padding: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada data</Text>
      <Text style={{ color: '#64748b' }}>{message}</Text>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 }}>{children}</Text>;
}

function Input({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={keyboardType}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={{
        borderWidth: 1,
        borderColor: '#d7e3f8',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: multiline ? 12 : 10,
        minHeight: multiline ? 96 : undefined,
        backgroundColor: '#fff',
        color: BRAND_COLORS.textDark,
      }}
      placeholderTextColor="#94a3b8"
    />
  );
}

function Pager({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
        Halaman {page} / {Math.max(totalPages, 1)} • Total {total}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onPrev}
          disabled={page <= 1}
          style={{
            borderWidth: 1,
            borderColor: '#d5e1f5',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: page <= 1 ? 0.5 : 1,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Sebelumnya</Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          disabled={page >= totalPages}
          style={{
            borderWidth: 1,
            borderColor: '#d5e1f5',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: page >= totalPages ? 0.5 : 1,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Berikutnya</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TeacherBpBkModuleScreen({
  mode,
  title,
  subtitle,
}: {
  mode: ModuleMode;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [selectedClassId, setSelectedClassId] = useState<number | 'ALL'>('ALL');
  const [behaviorSearch, setBehaviorSearch] = useState('');
  const [behaviorType, setBehaviorType] = useState<BehaviorTypeFilter>('ALL');
  const [behaviorPage, setBehaviorPage] = useState(1);
  const [showBehaviorForm, setShowBehaviorForm] = useState(false);
  const [editingBehaviorId, setEditingBehaviorId] = useState<number | null>(null);
  const [behaviorForm, setBehaviorForm] = useState<BehaviorFormState>(createDefaultBehaviorForm());
  const [behaviorStudentSearch, setBehaviorStudentSearch] = useState('');

  const [permissionSearch, setPermissionSearch] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatusFilter>('ALL');
  const [permissionPage, setPermissionPage] = useState(1);
  const [rejectingPermissionId, setRejectingPermissionId] = useState<number | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');

  const [counselingSearch, setCounselingSearch] = useState('');
  const [counselingStatus, setCounselingStatus] = useState<CounselingStatusFilter>('ALL');
  const [counselingPage, setCounselingPage] = useState(1);
  const [showCounselingForm, setShowCounselingForm] = useState(false);
  const [counselingForm, setCounselingForm] = useState<CounselingFormState>(createDefaultCounselingForm());
  const [counselingStudentSearch, setCounselingStudentSearch] = useState('');

  const isAllowed = user?.role === 'TEACHER' && hasBpBkDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-teacher-bpbk-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive({ allowStaleOnError: true });
      } catch {
        return null;
      }
    },
    ...mobileLiveQueryOptions,
  });

  const activeYearId = Number(activeYearQuery.data?.id || 0);

  const classesQuery = useQuery({
    queryKey: ['mobile-teacher-bpbk-classes', activeYearId],
    enabled: isAuthenticated && isAllowed && activeYearId > 0,
    queryFn: async () =>
      adminApi.listClasses({
        academicYearId: activeYearId,
        page: 1,
        limit: 320,
      }),
    ...mobileLiveQueryOptions,
  });

  const classes = useMemo(() => classesQuery.data?.items || [], [classesQuery.data?.items]);
  const defaultClassId = selectedClassId === 'ALL' ? classes[0]?.id : Number(selectedClassId);
  const selectedClassName = useMemo(() => {
    if (selectedClassId === 'ALL') return 'Semua kelas';
    return classes.find((item) => item.id === selectedClassId)?.name || `Kelas ${selectedClassId}`;
  }, [classes, selectedClassId]);
  const classFilterOptions = useMemo(
    () => [{ value: 'ALL', label: 'Semua Kelas' }, ...classes.map((item) => ({ value: String(item.id), label: item.name }))],
    [classes],
  );

  const activeBehaviorFormClassId = Number(behaviorForm.classId || defaultClassId || 0);
  const activeCounselingFormClassId = Number(counselingForm.classId || defaultClassId || 0);

  const behaviorStudentsQuery = useQuery({
    queryKey: ['mobile-teacher-bpbk-class-students-behavior', activeBehaviorFormClassId],
    enabled: isAuthenticated && isAllowed && showBehaviorForm && activeBehaviorFormClassId > 0,
    queryFn: async () => adminApi.getClassById(activeBehaviorFormClassId),
  });

  const counselingStudentsQuery = useQuery({
    queryKey: ['mobile-teacher-bpbk-class-students-counseling', activeCounselingFormClassId],
    enabled: isAuthenticated && isAllowed && showCounselingForm && activeCounselingFormClassId > 0,
    queryFn: async () => adminApi.getClassById(activeCounselingFormClassId),
  });

  const behaviorStudents = useMemo(
    () => behaviorStudentsQuery.data?.students || [],
    [behaviorStudentsQuery.data?.students],
  );
  const counselingStudents = useMemo(
    () => counselingStudentsQuery.data?.students || [],
    [counselingStudentsQuery.data?.students],
  );

  const activeBehaviorStudentId = behaviorForm.studentId || (behaviorStudents[0]?.id ? String(behaviorStudents[0].id) : '');
  const activeCounselingStudentId =
    counselingForm.studentId || (counselingStudents[0]?.id ? String(counselingStudents[0].id) : '');

  const filteredBehaviorStudents = useMemo(() => {
    const query = behaviorStudentSearch.trim().toLowerCase();
    if (!query) return behaviorStudents;
    return behaviorStudents.filter((item) => {
      const haystack = `${item.name} ${item.nis || ''} ${item.nisn || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [behaviorStudentSearch, behaviorStudents]);
  const behaviorStudentOptions = useMemo(
    () =>
      filteredBehaviorStudents.map((item: AdminClassDetailStudent) => ({
        value: String(item.id),
        label: `${item.name} (${item.nisn || item.nis || '-'})`,
      })),
    [filteredBehaviorStudents],
  );

  const filteredCounselingStudents = useMemo(() => {
    const query = counselingStudentSearch.trim().toLowerCase();
    if (!query) return counselingStudents;
    return counselingStudents.filter((item) => {
      const haystack = `${item.name} ${item.nis || ''} ${item.nisn || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [counselingStudentSearch, counselingStudents]);
  const counselingStudentOptions = useMemo(
    () =>
      filteredCounselingStudents.map((item: AdminClassDetailStudent) => ({
        value: String(item.id),
        label: `${item.name} (${item.nisn || item.nis || '-'})`,
      })),
    [filteredCounselingStudents],
  );

  const summaryQuery = useQuery({
    queryKey: ['mobile-teacher-bpbk-summary', activeYearId, selectedClassId],
    enabled: isAuthenticated && isAllowed && activeYearId > 0,
    queryFn: () =>
      teacherBpBkApi.getSummary({
        academicYearId: activeYearId,
        classId: selectedClassId === 'ALL' ? undefined : selectedClassId,
      }),
    ...mobileLiveQueryOptions,
  });

  const behaviorsQuery = useQuery({
    queryKey: [
      'mobile-teacher-bpbk-behaviors',
      activeYearId,
      selectedClassId,
      behaviorType,
      behaviorSearch,
      behaviorPage,
    ],
    enabled: isAuthenticated && isAllowed && activeYearId > 0 && mode === 'BEHAVIORS',
    queryFn: () =>
      teacherBpBkApi.listBehaviors({
        academicYearId: activeYearId,
        classId: selectedClassId === 'ALL' ? undefined : selectedClassId,
        type: behaviorType === 'ALL' ? undefined : behaviorType,
        search: behaviorSearch.trim() || undefined,
        page: behaviorPage,
        limit: 20,
      }),
    ...mobileLiveQueryOptions,
  });

  const permissionsQuery = useQuery({
    queryKey: [
      'mobile-teacher-bpbk-permissions',
      activeYearId,
      selectedClassId,
      permissionStatus,
      permissionSearch,
      permissionPage,
    ],
    enabled: isAuthenticated && isAllowed && activeYearId > 0 && mode === 'PERMISSIONS',
    queryFn: () =>
      teacherBpBkApi.listPermissions({
        academicYearId: activeYearId,
        classId: selectedClassId === 'ALL' ? undefined : selectedClassId,
        status: permissionStatus === 'ALL' ? undefined : permissionStatus,
        search: permissionSearch.trim() || undefined,
        page: permissionPage,
        limit: 20,
      }),
    ...mobileLiveQueryOptions,
  });

  const counselingsQuery = useQuery({
    queryKey: [
      'mobile-teacher-bpbk-counselings',
      activeYearId,
      selectedClassId,
      counselingStatus,
      counselingSearch,
      counselingPage,
    ],
    enabled: isAuthenticated && isAllowed && activeYearId > 0 && mode === 'COUNSELINGS',
    queryFn: () =>
      teacherBpBkApi.listCounselings({
        academicYearId: activeYearId,
        classId: selectedClassId === 'ALL' ? undefined : selectedClassId,
        status: counselingStatus === 'ALL' ? undefined : counselingStatus,
        search: counselingSearch.trim() || undefined,
        page: counselingPage,
        limit: 20,
      }),
    ...mobileLiveQueryOptions,
  });

  const resetBehaviorForm = () => {
    setEditingBehaviorId(null);
    setBehaviorStudentSearch('');
    setBehaviorForm(createDefaultBehaviorForm(defaultClassId));
  };

  const resetCounselingForm = () => {
    setCounselingStudentSearch('');
    setCounselingForm(createDefaultCounselingForm(defaultClassId));
  };

  const createBehaviorMutation = useMutation({
    mutationFn: async () => {
      const classId = activeBehaviorFormClassId;
      const studentId = Number(activeBehaviorStudentId || 0);
      const point = Math.abs(Math.trunc(Number(behaviorForm.point || 0)));

      if (!activeYearId || !classId || !studentId || !behaviorForm.description.trim()) {
        throw new Error('Lengkapi data catatan perilaku terlebih dahulu.');
      }
      if (!Number.isFinite(point)) {
        throw new Error('Poin perilaku tidak valid.');
      }

      return kesiswaanApi.createBehavior({
        academicYearId: activeYearId,
        classId,
        studentId,
        date: behaviorForm.date,
        type: behaviorForm.type,
        category: behaviorForm.category.trim() || undefined,
        description: behaviorForm.description.trim(),
        point,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-behaviors'] }),
      ]);
      notifySuccess('Catatan perilaku berhasil ditambahkan.');
      resetBehaviorForm();
      setShowBehaviorForm(false);
    },
    onError: (error) => notifyApiError(error, 'Gagal menambah catatan perilaku.'),
  });

  const updateBehaviorMutation = useMutation({
    mutationFn: async () => {
      if (!editingBehaviorId) throw new Error('Catatan perilaku tidak ditemukan.');
      const point = Math.abs(Math.trunc(Number(behaviorForm.point || 0)));
      if (!behaviorForm.description.trim()) {
        throw new Error('Deskripsi perilaku wajib diisi.');
      }
      if (!Number.isFinite(point)) {
        throw new Error('Poin perilaku tidak valid.');
      }

      return kesiswaanApi.updateBehavior(editingBehaviorId, {
        date: behaviorForm.date,
        type: behaviorForm.type,
        category: behaviorForm.category.trim() || undefined,
        description: behaviorForm.description.trim(),
        point,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-behaviors'] }),
      ]);
      notifySuccess('Catatan perilaku berhasil diperbarui.');
      resetBehaviorForm();
      setShowBehaviorForm(false);
    },
    onError: (error) => notifyApiError(error, 'Gagal memperbarui catatan perilaku.'),
  });

  const deleteBehaviorMutation = useMutation({
    mutationFn: (behaviorId: number) => kesiswaanApi.deleteBehavior(behaviorId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-behaviors'] }),
      ]);
      notifySuccess('Catatan perilaku berhasil dihapus.');
    },
    onError: (error) => notifyApiError(error, 'Gagal menghapus catatan perilaku.'),
  });

  const permissionDecisionMutation = useMutation({
    mutationFn: (payload: { id: number; status: 'APPROVED' | 'REJECTED'; approvalNote?: string }) =>
      kesiswaanApi.updatePermissionApprovalStatus(payload.id, {
        status: payload.status,
        approvalNote: payload.approvalNote,
      }),
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-permissions'] }),
      ]);
      notifySuccess(payload.status === 'APPROVED' ? 'Perizinan disetujui.' : 'Perizinan ditolak.');
      setRejectingPermissionId(null);
      setRejectionNote('');
    },
    onError: (error) => notifyApiError(error, 'Gagal memperbarui status perizinan.'),
  });

  const createCounselingMutation = useMutation({
    mutationFn: async () => {
      const classId = activeCounselingFormClassId;
      const studentId = Number(activeCounselingStudentId || 0);
      if (!activeYearId || !classId || !studentId || !counselingForm.issueSummary.trim()) {
        throw new Error('Lengkapi data konseling terlebih dahulu.');
      }
      if (counselingForm.summonParent && !counselingForm.summonDate) {
        throw new Error('Tanggal panggil orang tua wajib diisi.');
      }

      return teacherBpBkApi.createCounseling({
        academicYearId: activeYearId,
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
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-counselings'] }),
      ]);
      notifySuccess('Data konseling berhasil ditambahkan.');
      resetCounselingForm();
      setShowCounselingForm(false);
    },
    onError: (error) => notifyApiError(error, 'Gagal menambah data konseling.'),
  });

  const updateCounselingMutation = useMutation({
    mutationFn: async () => {
      if (!counselingForm.id) throw new Error('Data konseling tidak ditemukan.');
      const classId = activeCounselingFormClassId;
      const studentId = Number(activeCounselingStudentId || 0);
      if (!classId || !studentId || !counselingForm.issueSummary.trim()) {
        throw new Error('Lengkapi data konseling terlebih dahulu.');
      }
      if (counselingForm.summonParent && !counselingForm.summonDate) {
        throw new Error('Tanggal panggil orang tua wajib diisi.');
      }

      return teacherBpBkApi.updateCounseling(counselingForm.id, {
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
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-bpbk-counselings'] }),
      ]);
      notifySuccess('Data konseling berhasil diperbarui.');
      resetCounselingForm();
      setShowCounselingForm(false);
    },
    onError: (error) => notifyApiError(error, 'Gagal memperbarui data konseling.'),
  });

  const summary = summaryQuery.data?.summary;
  const recentBehaviors = summaryQuery.data?.recentBehaviors || [];
  const recentPermissions = summaryQuery.data?.recentPermissions || [];
  const recentCounselings = summaryQuery.data?.recentCounselings || [];

  const behaviorRows = behaviorsQuery.data?.behaviors || [];
  const behaviorMeta = behaviorsQuery.data?.meta;
  const permissionRows = permissionsQuery.data?.permissions || [];
  const permissionMeta = permissionsQuery.data?.meta;
  const counselingRows = counselingsQuery.data?.counselings || [];
  const counselingMeta = counselingsQuery.data?.meta;

  const onRefresh = async () => {
    await Promise.all([
      summaryQuery.refetch(),
      mode === 'BEHAVIORS' ? behaviorsQuery.refetch() : Promise.resolve(),
      mode === 'PERMISSIONS' ? permissionsQuery.refetch() : Promise.resolve(),
      mode === 'COUNSELINGS' ? counselingsQuery.refetch() : Promise.resolve(),
    ]);
  };

  const onOpenCreateBehavior = () => {
    resetBehaviorForm();
    setShowBehaviorForm(true);
  };

  const onOpenEditBehavior = (item: TeacherBpBkBehaviorRow) => {
    setEditingBehaviorId(item.id);
    setBehaviorStudentSearch('');
    setBehaviorForm({
      classId: String(item.classId),
      studentId: String(item.studentId),
      date: todayIsoDate(),
      type: item.type === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE',
      category: item.category || '',
      point: String(item.point ?? 0),
      description: item.description || '',
    });
    if (item.date) {
      const parsed = new Date(item.date);
      if (!Number.isNaN(parsed.getTime())) {
        setBehaviorForm((prev) => ({
          ...prev,
          date: parsed.toISOString().slice(0, 10),
        }));
      }
    }
    setShowBehaviorForm(true);
  };

  const onDeleteBehavior = (behaviorId: number) => {
    Alert.alert('Hapus Catatan', 'Hapus catatan perilaku ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteBehaviorMutation.mutate(behaviorId),
      },
    ]);
  };

  const onEditCounseling = (item: TeacherBpBkCounselingRow) => {
    setCounselingStudentSearch('');
    setCounselingForm({
      id: item.id,
      classId: String(item.classId),
      studentId: String(item.studentId),
      sessionDate: item.sessionDate ? new Date(item.sessionDate).toISOString().slice(0, 10) : todayIsoDate(),
      issueSummary: item.issueSummary || '',
      counselingNote: item.counselingNote || '',
      followUpPlan: item.followUpPlan || '',
      status: item.status || 'OPEN',
      summonParent: Boolean(item.summonParent),
      summonDate: item.summonDate ? new Date(item.summonDate).toISOString().slice(0, 10) : '',
      summonLetterNumber: item.summonLetterNumber || '',
    });
    setShowCounselingForm(true);
  };

  const onOpenCreateCounseling = () => {
    resetCounselingForm();
    setShowCounselingForm(true);
  };

  const submitBehavior = () => {
    if (!activeBehaviorStudentId) {
      notifyInfo('Pilih siswa terlebih dahulu.', { title: 'Validasi' });
      return;
    }
    if (!behaviorForm.description.trim()) {
      notifyInfo('Deskripsi perilaku wajib diisi.', { title: 'Validasi' });
      return;
    }
    if (editingBehaviorId) {
      updateBehaviorMutation.mutate();
      return;
    }
    createBehaviorMutation.mutate();
  };

  const submitCounseling = () => {
    if (!activeCounselingStudentId) {
      notifyInfo('Pilih siswa terlebih dahulu.', { title: 'Validasi' });
      return;
    }
    if (!counselingForm.issueSummary.trim()) {
      notifyInfo('Ringkasan masalah wajib diisi.', { title: 'Validasi' });
      return;
    }
    if (counselingForm.id) {
      updateCounselingMutation.mutate();
      return;
    }
    createCounselingMutation.mutate();
  };

  const openPermissionAttachment = (item: TeacherBpBkPermissionRow) => {
    const url = resolveAttachmentUrl(item.fileUrl);
    if (!url) {
      notifyInfo('Pengajuan ini tidak memiliki lampiran bukti.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'teacher-bk-permission-attachment',
      webPath: url,
      label: 'Lampiran Perizinan',
    });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul BP/BK..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          {title}
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          {title}
        </Text>
        <QueryStateView
          type="error"
          message="Akses modul ini membutuhkan tugas tambahan BP/BK."
        />
      </ScrollView>
    );
  }

  if (activeYearQuery.isLoading) return <AppLoadingScreen message="Menyiapkan tahun ajaran aktif..." />;

  if (!activeYearId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          {title}
        </Text>
        <QueryStateView
          type="error"
          message="Tahun ajaran aktif belum tersedia."
          onRetry={() => void activeYearQuery.refetch()}
        />
      </ScrollView>
    );
  }

  const isScreenLoading =
    summaryQuery.isLoading ||
    (mode === 'BEHAVIORS' && behaviorsQuery.isLoading) ||
    (mode === 'PERMISSIONS' && permissionsQuery.isLoading) ||
    (mode === 'COUNSELINGS' && counselingsQuery.isLoading);

  const isScreenError =
    summaryQuery.isError ||
    (mode === 'BEHAVIORS' && behaviorsQuery.isError) ||
    (mode === 'PERMISSIONS' && permissionsQuery.isError) ||
    (mode === 'COUNSELINGS' && counselingsQuery.isError);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{ ...pagePadding, gap: 14 }}
      refreshControl={<RefreshControl refreshing={isScreenLoading && !showBehaviorForm && !showCounselingForm} onRefresh={() => void onRefresh()} />}
    >
      <View
        style={{
          backgroundColor: '#eef4ff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 18,
          padding: 16,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#dbeafe',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="shield" size={20} color={BRAND_COLORS.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 20 }}>{title}</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>{subtitle}</Text>
          </View>
        </View>

        <MobileMenuTabBar
          items={MODULE_TABS.map((tab) => ({
            key: tab.mode,
            label: tab.label,
            iconName: tab.iconName,
          }))}
          activeKey={mode}
          onChange={(key) => {
            const nextTab = MODULE_TABS.find((tab) => tab.mode === key);
            if (nextTab) router.replace(nextTab.route);
          }}
          minTabWidth={90}
          maxTabWidth={118}
        />

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 14,
            padding: 12,
            gap: 8,
          }}
        >
          <MobileSelectField
            label="Filter Kelas"
            value={selectedClassId === 'ALL' ? 'ALL' : String(selectedClassId)}
            options={classFilterOptions}
            onChange={(value) => {
              setSelectedClassId(value === 'ALL' ? 'ALL' : Number(value));
              setBehaviorPage(1);
              setPermissionPage(1);
              setCounselingPage(1);
            }}
            placeholder="Pilih kelas"
          />
        </View>
      </View>

      {isScreenError ? (
        <QueryStateView type="error" message="Gagal memuat data BP/BK." onRetry={() => void onRefresh()} />
      ) : null}

      {!isScreenError && mode === 'SUMMARY' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <SummaryCard
              title="Kasus Negatif"
              value={String(summary?.negativeCases || 0)}
              subtitle={`Bulan ini ${summary?.negativeCasesThisMonth || 0}`}
              iconName="alert-triangle"
              accentColor="#b91c1c"
            />
            <SummaryCard
              title="Kasus Positif"
              value={String(summary?.positiveCases || 0)}
              subtitle={`Total kasus ${summary?.totalCases || 0}`}
              iconName="thumbs-up"
              accentColor="#15803d"
            />
            <SummaryCard
              title="Izin Pending"
              value={String(summary?.pendingPermissions || 0)}
              subtitle={`Approved ${summary?.approvedPermissions || 0} • Rejected ${summary?.rejectedPermissions || 0}`}
              iconName="file-text"
              accentColor="#1d4ed8"
            />
            <SummaryCard
              title="Siswa Risiko Tinggi"
              value={String(summary?.highRiskStudents || 0)}
              subtitle="Threshold otomatis BP/BK"
              iconName="activity"
              accentColor="#a16207"
            />
            <SummaryCard
              title="Konseling Baru"
              value={String(summary?.openCounselings || 0)}
              subtitle="Masih menunggu tindak lanjut"
              iconName="message-circle"
              accentColor="#dc2626"
            />
            <SummaryCard
              title="Konseling Diproses"
              value={String(summary?.inProgressCounselings || 0)}
              subtitle="Sedang ditangani"
              iconName="clock"
              accentColor="#d97706"
            />
            <SummaryCard
              title="Konseling Selesai"
              value={String(summary?.closedCounselings || 0)}
              subtitle="Sudah ditutup"
              iconName="check-circle"
              accentColor="#16a34a"
            />
            <SummaryCard
              title="Surat Panggilan Aktif"
              value={String(summary?.summonPendingCounselings || 0)}
              subtitle={selectedClassName}
              iconName="mail"
              accentColor="#7c3aed"
            />
          </View>

          <SectionCard title="Kasus Terbaru" subtitle="Catatan perilaku lintas kelas terbaru.">
            {recentBehaviors.length === 0 ? (
              <EmptyStateCard message="Belum ada catatan perilaku pada filter ini." />
            ) : (
              recentBehaviors.map((item) => {
                const badge = behaviorBadge(item.type);
                return (
                  <View
                    key={item.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {item.class?.name || '-'} • {formatDate(item.date)}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: badge.color, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: BRAND_COLORS.textDark }}>{item.description || '-'}</Text>
                  </View>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="Perizinan Terbaru" subtitle="Ringkasan pengajuan izin siswa terbaru.">
            {recentPermissions.length === 0 ? (
              <EmptyStateCard message="Belum ada data perizinan pada filter ini." />
            ) : (
              recentPermissions.map((item) => {
                const badge = permissionBadge(item.status);
                return (
                  <View
                    key={item.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {item.student?.studentClass?.name || '-'} • {formatDateRange(item.startDate, item.endDate)}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: badge.color, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: BRAND_COLORS.textDark }}>{item.reason || '-'}</Text>
                  </View>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="Konseling Terbaru" subtitle="Daftar tindak lanjut terbaru.">
            {recentCounselings.length === 0 ? (
              <EmptyStateCard message="Belum ada data konseling pada filter ini." />
            ) : (
              recentCounselings.map((item) => {
                const badge = counselingBadge(item.status);
                return (
                  <View
                    key={item.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {item.class?.name || '-'} • {formatDate(item.sessionDate)}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: badge.color, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: BRAND_COLORS.textDark }}>{item.issueSummary || '-'}</Text>
                  </View>
                );
              })
            )}
          </SectionCard>
        </>
      ) : null}

      {!isScreenError && mode === 'BEHAVIORS' ? (
        <>
          <SectionCard
            title="Kasus Perilaku"
            subtitle="Kelola catatan perilaku siswa lintas kelas."
            rightAction={
              <Pressable
                onPress={onOpenCreateBehavior}
                style={{
                  backgroundColor: BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah</Text>
              </Pressable>
            }
          >
            <Input
              value={behaviorSearch}
              onChangeText={(value) => {
                setBehaviorSearch(value);
                setBehaviorPage(1);
              }}
              placeholder="Cari nama / NIS / NISN / deskripsi..."
            />
            <MobileSelectField
              label="Filter Jenis Perilaku"
              value={behaviorType}
              options={BEHAVIOR_FILTER_OPTIONS}
              onChange={(value) => {
                setBehaviorType(value as BehaviorTypeFilter);
                setBehaviorPage(1);
              }}
              placeholder="Pilih jenis perilaku"
            />

            {showBehaviorForm ? (
              <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 12, gap: 12 }}>
                <MobileSelectField
                  label="Kelas"
                  value={String(activeBehaviorFormClassId || '')}
                  options={classes.map((item) => ({ value: String(item.id), label: item.name }))}
                  onChange={(value) => {
                    setBehaviorStudentSearch('');
                    setBehaviorForm((prev) => ({ ...prev, classId: value, studentId: '' }));
                  }}
                  placeholder="Pilih kelas"
                />

                <View style={{ gap: 8 }}>
                  <FieldLabel>Cari siswa</FieldLabel>
                  <Input
                    value={behaviorStudentSearch}
                    onChangeText={setBehaviorStudentSearch}
                    placeholder="Cari nama / NIS / NISN"
                  />
                  {behaviorStudentsQuery.isLoading ? (
                    <QueryStateView type="loading" message="Memuat siswa kelas..." />
                  ) : filteredBehaviorStudents.length > 0 ? (
                    <MobileSelectField
                      value={activeBehaviorStudentId}
                      options={behaviorStudentOptions}
                      onChange={(value) => setBehaviorForm((prev) => ({ ...prev, studentId: value }))}
                      placeholder="Pilih siswa"
                    />
                  ) : (
                    <EmptyStateCard message="Siswa untuk kelas ini belum tersedia." />
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <FieldLabel>Tanggal</FieldLabel>
                    <Input value={behaviorForm.date} onChangeText={(value) => setBehaviorForm((prev) => ({ ...prev, date: value }))} placeholder="YYYY-MM-DD" />
                  </View>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <MobileSelectField
                      label="Tipe"
                      value={behaviorForm.type}
                      options={BEHAVIOR_TYPE_OPTIONS}
                      onChange={(value) => setBehaviorForm((prev) => ({ ...prev, type: value as KesiswaanBehaviorType }))}
                      placeholder="Pilih tipe perilaku"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <FieldLabel>Kategori</FieldLabel>
                    <Input value={behaviorForm.category} onChangeText={(value) => setBehaviorForm((prev) => ({ ...prev, category: value }))} placeholder="Opsional" />
                  </View>
                  <View style={{ width: 120 }}>
                    <FieldLabel>Poin</FieldLabel>
                    <Input value={behaviorForm.point} onChangeText={(value) => setBehaviorForm((prev) => ({ ...prev, point: value }))} keyboardType="numeric" placeholder="0" />
                  </View>
                </View>

                <View>
                  <FieldLabel>Deskripsi</FieldLabel>
                  <Input
                    value={behaviorForm.description}
                    onChangeText={(value) => setBehaviorForm((prev) => ({ ...prev, description: value }))}
                    multiline
                    placeholder="Uraikan catatan perilaku siswa"
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      setShowBehaviorForm(false);
                      resetBehaviorForm();
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#d5e1f5',
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Batal</Text>
                  </Pressable>
                  <Pressable
                    onPress={submitBehavior}
                    disabled={createBehaviorMutation.isPending || updateBehaviorMutation.isPending}
                    style={{
                      backgroundColor: BRAND_COLORS.blue,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      opacity: createBehaviorMutation.isPending || updateBehaviorMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {editingBehaviorId ? 'Simpan Perubahan' : 'Simpan Catatan'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {behaviorsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil daftar kasus perilaku..." />
            ) : behaviorRows.length > 0 ? (
              behaviorRows.map((item: TeacherBpBkBehaviorRow) => {
                const badge = behaviorBadge(item.type);
                return (
                  <View
                    key={item.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {item.class?.name || '-'} • {formatDate(item.date)} • Poin {Math.abs(item.point || 0)}
                        </Text>
                        {item.category ? (
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>Kategori: {item.category}</Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          alignSelf: 'flex-start',
                        }}
                      >
                        <Text style={{ color: badge.color, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: BRAND_COLORS.textDark }}>{item.description || '-'}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                      <Pressable onPress={() => onOpenEditBehavior(item)}>
                        <Text style={{ color: BRAND_COLORS.blue, fontWeight: '700' }}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => onDeleteBehavior(item.id)}>
                        <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyStateCard message="Belum ada catatan perilaku pada filter ini." />
            )}

            <Pager
              page={behaviorMeta?.page || 1}
              totalPages={behaviorMeta?.totalPages || 1}
              total={behaviorMeta?.total || 0}
              onPrev={() => setBehaviorPage((value) => Math.max(1, value - 1))}
              onNext={() => setBehaviorPage((value) => Math.min(behaviorMeta?.totalPages || 1, value + 1))}
            />
          </SectionCard>
        </>
      ) : null}

      {!isScreenError && mode === 'PERMISSIONS' ? (
        <SectionCard title="Perizinan Siswa" subtitle="Tinjau dan proses pengajuan izin lintas kelas.">
          <Input
            value={permissionSearch}
            onChangeText={(value) => {
              setPermissionSearch(value);
              setPermissionPage(1);
            }}
            placeholder="Cari nama / NIS / NISN / alasan..."
          />
          <MobileSelectField
            label="Filter Status Perizinan"
            value={permissionStatus}
            options={PERMISSION_STATUS_OPTIONS}
            onChange={(value) => {
              setPermissionStatus(value as PermissionStatusFilter);
              setPermissionPage(1);
            }}
            placeholder="Pilih status perizinan"
          />

          {permissionsQuery.isLoading ? (
            <QueryStateView type="loading" message="Mengambil daftar perizinan..." />
          ) : permissionRows.length > 0 ? (
            permissionRows.map((item: TeacherBpBkPermissionRow) => {
              const badge = permissionBadge(item.status);
              return (
                <View
                  key={item.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        {item.student?.studentClass?.name || '-'} • {formatDateRange(item.startDate, item.endDate)}
                      </Text>
                      <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                        Jenis: {resolvePermissionType(item.type)}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: badge.border,
                        backgroundColor: badge.bg,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ color: badge.color, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                    </View>
                  </View>

                  <Text style={{ color: BRAND_COLORS.textDark }}>{item.reason || '-'}</Text>
                  {item.approvalNote ? (
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Catatan approval: {item.approvalNote}</Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {item.fileUrl ? (
                      <Pressable onPress={() => openPermissionAttachment(item)}>
                        <Text style={{ color: BRAND_COLORS.blue, fontWeight: '700' }}>Buka Lampiran</Text>
                      </Pressable>
                    ) : null}
                    {item.status === 'PENDING' ? (
                      <>
                        <Pressable
                          onPress={() =>
                            Alert.alert('Setujui Izin', `Setujui pengajuan dari ${item.student?.name || 'siswa ini'}?`, [
                              { text: 'Batal', style: 'cancel' },
                              {
                                text: 'Setujui',
                                onPress: () =>
                                  permissionDecisionMutation.mutate({
                                    id: item.id,
                                    status: 'APPROVED',
                                  }),
                              },
                            ])
                          }
                        >
                          <Text style={{ color: '#15803d', fontWeight: '700' }}>Setujui</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setRejectingPermissionId((value) => (value === item.id ? null : item.id));
                            setRejectionNote('');
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Tolak</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>

                  {rejectingPermissionId === item.id ? (
                    <View style={{ gap: 8 }}>
                      <Input
                        value={rejectionNote}
                        onChangeText={setRejectionNote}
                        multiline
                        placeholder="Masukkan alasan penolakan"
                      />
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                        <Pressable
                          onPress={() => {
                            setRejectingPermissionId(null);
                            setRejectionNote('');
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: '#d5e1f5',
                            borderRadius: 10,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Batal</Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            permissionDecisionMutation.mutate({
                              id: item.id,
                              status: 'REJECTED',
                              approvalNote: rejectionNote.trim() || 'Pengajuan tidak memenuhi ketentuan.',
                            })
                          }
                          disabled={permissionDecisionMutation.isPending}
                          style={{
                            backgroundColor: '#dc2626',
                            borderRadius: 10,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            opacity: permissionDecisionMutation.isPending ? 0.6 : 1,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>Kirim Penolakan</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <EmptyStateCard message="Belum ada perizinan pada filter ini." />
          )}

          <Pager
            page={permissionMeta?.page || 1}
            totalPages={permissionMeta?.totalPages || 1}
            total={permissionMeta?.total || 0}
            onPrev={() => setPermissionPage((value) => Math.max(1, value - 1))}
            onNext={() => setPermissionPage((value) => Math.min(permissionMeta?.totalPages || 1, value + 1))}
          />
        </SectionCard>
      ) : null}

      {!isScreenError && mode === 'COUNSELINGS' ? (
        <SectionCard
          title="Konseling & Tindak Lanjut"
          subtitle="Kelola tindak lanjut kasus siswa lintas kelas."
          rightAction={
            <Pressable
              onPress={onOpenCreateCounseling}
              style={{
                backgroundColor: BRAND_COLORS.blue,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah</Text>
            </Pressable>
          }
        >
          <Input
            value={counselingSearch}
            onChangeText={(value) => {
              setCounselingSearch(value);
              setCounselingPage(1);
            }}
            placeholder="Cari ringkasan / nama siswa / surat..."
          />
          <MobileSelectField
            label="Filter Status Konseling"
            value={counselingStatus}
            options={COUNSELING_STATUS_OPTIONS}
            onChange={(value) => {
              setCounselingStatus(value as CounselingStatusFilter);
              setCounselingPage(1);
            }}
            placeholder="Pilih status konseling"
          />

          {showCounselingForm ? (
            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 12, gap: 12 }}>
              <MobileSelectField
                label="Kelas"
                value={String(activeCounselingFormClassId || '')}
                options={classes.map((item) => ({ value: String(item.id), label: item.name }))}
                onChange={(value) => {
                  setCounselingStudentSearch('');
                  setCounselingForm((prev) => ({ ...prev, classId: value, studentId: '' }));
                }}
                placeholder="Pilih kelas"
              />

              <View style={{ gap: 8 }}>
                <FieldLabel>Cari siswa</FieldLabel>
                <Input
                  value={counselingStudentSearch}
                  onChangeText={setCounselingStudentSearch}
                  placeholder="Cari nama / NIS / NISN"
                />
                {counselingStudentsQuery.isLoading ? (
                  <QueryStateView type="loading" message="Memuat siswa kelas..." />
                ) : filteredCounselingStudents.length > 0 ? (
                  <MobileSelectField
                    value={activeCounselingStudentId}
                    options={counselingStudentOptions}
                    onChange={(value) => setCounselingForm((prev) => ({ ...prev, studentId: value }))}
                    placeholder="Pilih siswa"
                  />
                ) : (
                  <EmptyStateCard message="Siswa untuk kelas ini belum tersedia." />
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <FieldLabel>Tanggal Konseling</FieldLabel>
                  <Input
                    value={counselingForm.sessionDate}
                    onChangeText={(value) => setCounselingForm((prev) => ({ ...prev, sessionDate: value }))}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <MobileSelectField
                    label="Status"
                    value={counselingForm.status}
                    options={COUNSELING_FORM_STATUS_OPTIONS}
                    onChange={(value) =>
                      setCounselingForm((prev) => ({ ...prev, status: value as CounselingFormState['status'] }))
                    }
                    placeholder="Pilih status konseling"
                  />
                </View>
              </View>

              <View>
                <FieldLabel>Ringkasan Masalah</FieldLabel>
                <Input
                  value={counselingForm.issueSummary}
                  onChangeText={(value) => setCounselingForm((prev) => ({ ...prev, issueSummary: value }))}
                  multiline
                  placeholder="Uraikan ringkasan masalah"
                />
              </View>

              <View>
                <FieldLabel>Catatan Konseling</FieldLabel>
                <Input
                  value={counselingForm.counselingNote}
                  onChangeText={(value) => setCounselingForm((prev) => ({ ...prev, counselingNote: value }))}
                  multiline
                  placeholder="Opsional"
                />
              </View>

              <View>
                <FieldLabel>Rencana Tindak Lanjut</FieldLabel>
                <Input
                  value={counselingForm.followUpPlan}
                  onChangeText={(value) => setCounselingForm((prev) => ({ ...prev, followUpPlan: value }))}
                  multiline
                  placeholder="Opsional"
                />
              </View>

              <MobileSelectField
                label="Surat Panggilan Orang Tua"
                value={counselingForm.summonParent ? 'YES' : 'NO'}
                options={SUMMON_PARENT_OPTIONS.map((option) => ({ ...option }))}
                onChange={(value) =>
                  setCounselingForm((prev) => ({
                    ...prev,
                    summonParent: value === 'YES',
                    ...(value === 'YES' ? {} : { summonDate: '', summonLetterNumber: '' }),
                  }))
                }
                placeholder="Pilih kebutuhan surat panggilan"
              />

              {counselingForm.summonParent ? (
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <FieldLabel>Tanggal Panggilan</FieldLabel>
                    <Input
                      value={counselingForm.summonDate}
                      onChangeText={(value) => setCounselingForm((prev) => ({ ...prev, summonDate: value }))}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <FieldLabel>No. Surat</FieldLabel>
                    <Input
                      value={counselingForm.summonLetterNumber}
                      onChangeText={(value) => setCounselingForm((prev) => ({ ...prev, summonLetterNumber: value }))}
                      placeholder="Opsional"
                    />
                  </View>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setShowCounselingForm(false);
                    resetCounselingForm();
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Batal</Text>
                </Pressable>
                <Pressable
                  onPress={submitCounseling}
                  disabled={createCounselingMutation.isPending || updateCounselingMutation.isPending}
                  style={{
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: createCounselingMutation.isPending || updateCounselingMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {counselingForm.id ? 'Simpan Perubahan' : 'Simpan Konseling'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {counselingsQuery.isLoading ? (
            <QueryStateView type="loading" message="Mengambil daftar konseling..." />
          ) : counselingRows.length > 0 ? (
            counselingRows.map((item: TeacherBpBkCounselingRow) => {
              const badge = counselingBadge(item.status);
              return (
                <View
                  key={item.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        {item.class?.name || '-'} • {formatDate(item.sessionDate)}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: badge.border,
                        backgroundColor: badge.bg,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ color: badge.color, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
                    </View>
                  </View>

                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Ringkasan</Text>
                  <Text style={{ color: BRAND_COLORS.textDark }}>{item.issueSummary || '-'}</Text>

                  {item.counselingNote ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Catatan Konseling</Text>
                      <Text style={{ color: '#475569' }}>{item.counselingNote}</Text>
                    </>
                  ) : null}

                  {item.followUpPlan ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Tindak Lanjut</Text>
                      <Text style={{ color: '#475569' }}>{item.followUpPlan}</Text>
                    </>
                  ) : null}

                  {item.summonParent ? (
                    <Text style={{ color: '#7c3aed', fontSize: 12 }}>
                      Panggil orang tua pada {formatDate(item.summonDate)} • Surat {item.summonLetterNumber || '-'}
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <Pressable onPress={() => onEditCounseling(item)}>
                      <Text style={{ color: BRAND_COLORS.blue, fontWeight: '700' }}>Edit</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyStateCard message="Belum ada data konseling pada filter ini." />
          )}

          <Pager
            page={counselingMeta?.page || 1}
            totalPages={counselingMeta?.totalPages || 1}
            total={counselingMeta?.total || 0}
            onPrev={() => setCounselingPage((value) => Math.max(1, value - 1))}
            onNext={() => setCounselingPage((value) => Math.min(counselingMeta?.totalPages || 1, value + 1))}
          />
        </SectionCard>
      ) : null}
    </ScrollView>
  );
}
