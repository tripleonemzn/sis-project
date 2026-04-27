import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { examApi, type ExamRestrictionItem } from '../../../src/features/exams/examApi';
import { gradeApi } from '../../../src/features/grades/gradeApi';
import type { HomeroomResultPublicationStudentRow } from '../../../src/features/grades/types';
import HomeroomBookMobilePanel from '../../../src/features/homeroomBook/HomeroomBookMobilePanel';
import { permissionApi } from '../../../src/features/permissions/permissionApi';
import { PermissionStatus, PermissionType, StudentPermission } from '../../../src/features/permissions/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type StatusFilter = 'ALL' | PermissionStatus;
type TypeFilter = 'ALL' | PermissionType;
type HomeroomPermissionTab = 'IZIN' | 'AKSES_UJIAN' | 'PUBLIKASI_NILAI' | 'BUKU_WALI_KELAS';

const DEFAULT_MANUAL_RESTRICTION_REASON =
  'Masih ada administrasi/tunggakan yang belum diselesaikan. Silakan hubungi wali kelas.';

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: 'Semua',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

const TYPE_LABEL: Record<TypeFilter, string> = {
  ALL: 'Semua Jenis',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  OTHER: 'Lainnya',
};

function isHomeroomTeacher(duties?: string[], classesCount?: number) {
  if ((classesCount || 0) > 0) return true;
  const normalized = (duties || []).map((item) => item.trim().toUpperCase());
  return normalized.includes('WALI_KELAS');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateRange(start: string, end: string) {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function statusStyle(status: PermissionStatus) {
  if (status === 'APPROVED') return { text: '#15803d', border: '#86efac', bg: '#dcfce7' };
  if (status === 'REJECTED') return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2' };
  return { text: '#b45309', border: '#fcd34d', bg: '#fef3c7' };
}

function typeStyle(type: PermissionType) {
  if (type === 'SICK') return { text: '#b91c1c', bg: '#fee2e2' };
  if (type === 'PERMISSION') return { text: '#1d4ed8', bg: '#dbeafe' };
  return { text: '#475569', bg: '#e2e8f0' };
}

function formatExamCurrency(value: number) {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Math.round(Number(value || 0)));
  } catch {
    return `Rp ${Math.round(Number(value || 0))}`;
  }
}

function resolveRestrictionAutoReasons(item: ExamRestrictionItem) {
  const reasons: string[] = [];
  if (item.flags.belowKkm) reasons.push('nilai masih di bawah KKM');
  if (item.flags.financeBlocked) {
    reasons.push(
      item.flags.financeOverdue
        ? 'policy clearance finance belum terpenuhi karena ada tunggakan jatuh tempo'
        : 'policy clearance finance belum terpenuhi',
    );
  }
  return reasons;
}

function resolveFileUrl(fileUrl: string | null | undefined) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  if (fileUrl.startsWith('/')) return `${webBaseUrl}${fileUrl}`;
  return `${webBaseUrl}/${fileUrl}`;
}

export default function TeacherHomeroomPermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [activeTab, setActiveTab] = useState<HomeroomPermissionTab>('IZIN');
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSemesterOverride, setSelectedSemesterOverride] = useState<'ODD' | 'EVEN' | ''>('');
  const [selectedExamTypeOverride, setSelectedExamTypeOverride] = useState('');
  const [selectedPublicationCodeOverride, setSelectedPublicationCodeOverride] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState<Record<number, string>>({});
  const [summaryDetailVisible, setSummaryDetailVisible] = useState(false);
  const [restrictionModalVisible, setRestrictionModalVisible] = useState(false);
  const [restrictionTarget, setRestrictionTarget] = useState<ExamRestrictionItem | null>(null);
  const [restrictionReasonDraft, setRestrictionReasonDraft] = useState(DEFAULT_MANUAL_RESTRICTION_REASON);

  const isAllowed = user?.role === 'TEACHER' && isHomeroomTeacher(user?.additionalDuties, user?.teacherClasses?.length);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-homeroom-permissions-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-homeroom-permissions-classes', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!user?.id && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
        teacherId: user?.id,
      });
      return result.items;
    },
  });

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-homeroom-book-exam-programs', activeYearQuery.data?.id],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!activeYearQuery.data?.id &&
      (activeTab === 'AKSES_UJIAN' || activeTab === 'BUKU_WALI_KELAS'),
    queryFn: async () => {
      const result = await examApi.getExamPrograms({
        academicYearId: Number(activeYearQuery.data?.id),
        roleContext: 'student',
      });
      return result.programs || [];
    },
  });

  const classItems = classesQuery.data || [];
  const effectiveSelectedClassId = selectedClassId ?? classItems[0]?.id ?? null;
  const classSelectOptions = useMemo(
    () =>
      classItems.map((classItem) => ({
        value: String(classItem.id),
        label: classItem.major?.code ? `${classItem.name} • ${classItem.major.code}` : classItem.name,
      })),
    [classItems],
  );
  const statusFilterOptions = useMemo(
    () =>
      (Object.keys(STATUS_LABEL) as StatusFilter[]).map((status) => ({
        value: status,
        label: STATUS_LABEL[status],
      })),
    [],
  );
  const typeFilterOptions = useMemo(
    () =>
      (Object.keys(TYPE_LABEL) as TypeFilter[]).map((type) => ({
        value: type,
        label: TYPE_LABEL[type],
      })),
    [],
  );

  const defaultSemester = useMemo<'ODD' | 'EVEN' | ''>(() => {
    const name = String(activeYearQuery.data?.name || '').toUpperCase();
    if (name.includes('GANJIL')) return 'ODD';
    if (name.includes('GENAP')) return 'EVEN';
    return '';
  }, [activeYearQuery.data?.name]);

  const selectedSemester = selectedSemesterOverride || defaultSemester;

  const examTypeOptions = useMemo(() => {
    const programs = Array.isArray(examProgramsQuery.data) ? examProgramsQuery.data : [];
    const dedupByCode = new Map<string, { value: string; label: string }>();

    for (const program of programs) {
      if (!program?.isActive || !program?.showOnStudentMenu) continue;
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
  }, [examProgramsQuery.data, selectedSemester]);

  const selectedExamType = useMemo(() => {
    if (!selectedExamTypeOverride) return '';
    return examTypeOptions.some((option) => option.value === selectedExamTypeOverride)
      ? selectedExamTypeOverride
      : '';
  }, [examTypeOptions, selectedExamTypeOverride]);

  const permissionsQuery = useQuery({
    queryKey: [
      'mobile-homeroom-permissions',
      effectiveSelectedClassId,
      activeYearQuery.data?.id,
      statusFilter,
      typeFilter,
      search,
    ],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!effectiveSelectedClassId &&
      !!activeYearQuery.data?.id &&
      activeTab === 'IZIN',
    queryFn: async () =>
      permissionApi.listForHomeroom({
        classId: Number(effectiveSelectedClassId),
        academicYearId: Number(activeYearQuery.data?.id),
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        search: search.trim() || undefined,
        page: 1,
        limit: 250,
      }),
  });

  const restrictionsQuery = useQuery({
    queryKey: [
      'mobile-homeroom-exam-restrictions',
      effectiveSelectedClassId,
      activeYearQuery.data?.id,
      selectedSemester,
      selectedExamType,
      search,
    ],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!effectiveSelectedClassId &&
      !!activeYearQuery.data?.id &&
      activeTab === 'AKSES_UJIAN' &&
      !!selectedSemester &&
      !!selectedExamType,
    queryFn: async () =>
      examApi.getExamRestrictions({
        classId: Number(effectiveSelectedClassId),
        academicYearId: Number(activeYearQuery.data?.id),
        semester: selectedSemester as 'ODD' | 'EVEN',
        examType: selectedExamType,
        programCode: selectedExamType,
        page: 1,
        limit: 250,
        search: search.trim() || undefined,
      }),
  });

  const resultPublicationsQuery = useQuery({
    queryKey: [
      'mobile-homeroom-result-publications',
      effectiveSelectedClassId,
      activeYearQuery.data?.id,
      selectedSemester,
      selectedPublicationCodeOverride,
      search,
    ],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!effectiveSelectedClassId &&
      !!activeYearQuery.data?.id &&
      activeTab === 'PUBLIKASI_NILAI',
    queryFn: async () =>
      gradeApi.getHomeroomResultPublications({
        classId: Number(effectiveSelectedClassId),
        semester: selectedSemester || undefined,
        publicationCode: selectedPublicationCodeOverride || undefined,
        page: 1,
        limit: 250,
        search: search.trim() || undefined,
      }),
  });

  const decisionMutation = useMutation({
    mutationFn: (payload: { id: number; status: PermissionStatus; approvalNote?: string }) =>
      permissionApi.updateStatus(payload),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-permissions'] });
      const message = payload.status === 'APPROVED' ? 'Pengajuan izin disetujui.' : 'Pengajuan izin ditolak.';
      Alert.alert('Berhasil', message);
      setRejectionNotes((prev) => ({ ...prev, [payload.id]: '' }));
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = normalized.response?.data?.message || normalized.message || 'Gagal memproses persetujuan izin.';
      Alert.alert('Proses Gagal', msg);
    },
  });

  const updateRestrictionMutation = useMutation({
    mutationFn: (payload: {
      studentId: number;
      academicYearId: number;
      semester: 'ODD' | 'EVEN';
      examType: string;
      programCode: string;
      isBlocked: boolean;
      reason?: string;
    }) => examApi.updateExamRestriction(payload),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-exam-restrictions'] });
      setRestrictionModalVisible(false);
      setRestrictionTarget(null);
      setRestrictionReasonDraft(DEFAULT_MANUAL_RESTRICTION_REASON);
      Alert.alert(
        'Berhasil',
        payload.isBlocked ? 'Akses ujian berhasil ditolak.' : 'Akses ujian berhasil dibuka kembali.',
      );
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const message =
        normalized.response?.data?.message || normalized.message || 'Gagal memperbarui akses ujian.';
      Alert.alert('Proses Gagal', message);
    },
  });

  const updateResultPublicationMutation = useMutation({
    mutationFn: (payload: {
      classId: number;
      studentId: number;
      publicationCode: string;
      mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    }) => gradeApi.updateHomeroomResultPublication(payload),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-result-publications'] });
      Alert.alert(
        'Berhasil',
        payload.mode === 'BLOCKED'
          ? 'Publikasi nilai berhasil ditahan oleh wali kelas.'
          : 'Publikasi nilai kembali mengikuti jadwal Wakakur.',
      );
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const message =
        normalized.response?.data?.message || normalized.message || 'Gagal memperbarui publikasi nilai.';
      Alert.alert('Proses Gagal', message);
    },
  });

  const permissions = useMemo(
    () => permissionsQuery.data?.permissions || [],
    [permissionsQuery.data?.permissions],
  );
  const restrictions = useMemo(
    () => restrictionsQuery.data?.restrictions || [],
    [restrictionsQuery.data?.restrictions],
  );
  const resultPublicationPrograms = useMemo(
    () => resultPublicationsQuery.data?.programs || [],
    [resultPublicationsQuery.data?.programs],
  );
  const selectedResultPublicationProgram = resultPublicationsQuery.data?.selectedProgram || null;
  const resultPublicationRows = resultPublicationsQuery.data?.rows || [];
  const selectedResultPublicationCode = useMemo(() => {
    if (
      selectedPublicationCodeOverride &&
      resultPublicationPrograms.some((program) => program.publicationCode === selectedPublicationCodeOverride)
    ) {
      return selectedPublicationCodeOverride;
    }
    return selectedResultPublicationProgram?.publicationCode || '';
  }, [resultPublicationPrograms, selectedPublicationCodeOverride, selectedResultPublicationProgram?.publicationCode]);
  const selectedClass = classItems.find((item) => item.id === effectiveSelectedClassId) || null;

  const summary = useMemo(() => {
    const result = {
      total: permissions.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      sick: 0,
      permission: 0,
      other: 0,
    };
    for (const item of permissions) {
      if (item.status === 'PENDING') result.pending += 1;
      if (item.status === 'APPROVED') result.approved += 1;
      if (item.status === 'REJECTED') result.rejected += 1;

      if (item.type === 'SICK') result.sick += 1;
      if (item.type === 'PERMISSION') result.permission += 1;
      if (item.type === 'OTHER') result.other += 1;
    }
    return result;
  }, [permissions]);

  const restrictionSummary = useMemo(() => {
    const result = {
      total: restrictions.length,
      blocked: 0,
      manual: 0,
      automatic: 0,
    };
    for (const item of restrictions) {
      if (item.isBlocked) result.blocked += 1;
      if (item.manualBlocked) result.manual += 1;
      if (item.autoBlocked) result.automatic += 1;
    }
    return result;
  }, [restrictions]);

  const resultPublicationSummary = useMemo(() => {
    return (
      resultPublicationsQuery.data?.summary || {
        totalStudents: 0,
        blockedStudents: 0,
        visibleStudents: 0,
        waitingWakakurStudents: 0,
      }
    );
  }, [resultPublicationsQuery.data?.summary]);

  const openAttachment = async (item: StudentPermission) => {
    const url = resolveFileUrl(item.fileUrl);
    if (!url) {
      Alert.alert('Lampiran Tidak Ada', 'Pengajuan ini tidak memiliki lampiran bukti.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'teacher-homeroom-permissions',
      webPath: url,
      label: 'Bukti Izin',
    });
  };

  const handleApprove = (item: StudentPermission) => {
    Alert.alert('Konfirmasi Persetujuan', `Setujui pengajuan izin dari ${item.student?.name || 'siswa ini'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Setujui',
        style: 'default',
        onPress: () =>
          decisionMutation.mutate({
            id: item.id,
            status: 'APPROVED',
          }),
      },
    ]);
  };

  const handleReject = (item: StudentPermission) => {
    const note = (rejectionNotes[item.id] || '').trim() || 'Pengajuan tidak memenuhi ketentuan wali kelas.';
    Alert.alert('Konfirmasi Penolakan', `Tolak pengajuan izin dari ${item.student?.name || 'siswa ini'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Tolak',
        style: 'destructive',
        onPress: () =>
          decisionMutation.mutate({
            id: item.id,
            status: 'REJECTED',
            approvalNote: note,
          }),
      },
    ]);
  };

  const openRestrictionModal = (item: ExamRestrictionItem) => {
    if (!activeYearQuery.data?.id || !selectedSemester || !selectedExamType) {
      Alert.alert('Filter Belum Lengkap', 'Pilih semester dan jenis ujian terlebih dahulu.');
      return;
    }

    if (item.isBlocked && item.autoBlocked) {
      const autoReasons = resolveRestrictionAutoReasons(item);
      Alert.alert(
        'Akses Otomatis Ditolak',
        autoReasons.length > 0
          ? `Akses ujian otomatis ditolak karena ${autoReasons.join(', ')}. Selesaikan sumber masalahnya terlebih dahulu.`
          : 'Akses ujian otomatis ditolak. Selesaikan sumber masalahnya terlebih dahulu.',
      );
      return;
    }

    if (!item.isBlocked) {
      setRestrictionTarget(item);
      setRestrictionReasonDraft(item.reason?.trim() || DEFAULT_MANUAL_RESTRICTION_REASON);
      setRestrictionModalVisible(true);
      return;
    }

    Alert.alert('Buka Akses Ujian', `Buka akses ujian manual untuk ${item.student.name}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Buka Akses',
        style: 'default',
        onPress: () =>
          updateRestrictionMutation.mutate({
            studentId: item.student.id,
            academicYearId: Number(activeYearQuery.data?.id),
            semester: selectedSemester as 'ODD' | 'EVEN',
            examType: selectedExamType,
            programCode: selectedExamType,
            isBlocked: false,
            reason: '',
          }),
      },
    ]);
  };

  const submitRestrictionBlock = () => {
    if (!restrictionTarget || !activeYearQuery.data?.id || !selectedSemester || !selectedExamType) {
      Alert.alert('Filter Belum Lengkap', 'Pilih semester dan jenis ujian terlebih dahulu.');
      return;
    }

    const normalizedReason = restrictionReasonDraft.trim();
    if (!normalizedReason) {
      Alert.alert('Keterangan Wajib', 'Masukkan keterangan yang akan ditampilkan ke siswa.');
      return;
    }

    updateRestrictionMutation.mutate({
      studentId: restrictionTarget.student.id,
      academicYearId: Number(activeYearQuery.data?.id),
      semester: selectedSemester as 'ODD' | 'EVEN',
      examType: selectedExamType,
      programCode: selectedExamType,
      isBlocked: true,
      reason: normalizedReason,
    });
  };

  const handleToggleResultPublication = (row: HomeroomResultPublicationStudentRow) => {
    if (!effectiveSelectedClassId || !selectedClass || !selectedResultPublicationProgram) {
      Alert.alert('Kelas Tidak Ditemukan', 'Pilih kelas wali terlebih dahulu.');
      return;
    }

    const nextMode = row.homeroomPublication.mode === 'BLOCKED' ? 'FOLLOW_GLOBAL' : 'BLOCKED';
    const title = nextMode === 'BLOCKED' ? 'Tahan Publikasi Nilai' : 'Ikuti Jadwal Wakakur';
    const message =
      nextMode === 'BLOCKED'
        ? `Tahan hasil nilai ${selectedResultPublicationProgram.shortLabel} untuk ${row.student.name}?`
        : `Kembalikan hasil nilai ${selectedResultPublicationProgram.shortLabel} untuk ${row.student.name} agar mengikuti jadwal Wakakur?`;

    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      {
        text: nextMode === 'BLOCKED' ? 'Tahan' : 'Ikuti Wakakur',
        style: nextMode === 'BLOCKED' ? 'destructive' : 'default',
        onPress: () =>
          updateResultPublicationMutation.mutate({
            classId: Number(effectiveSelectedClassId),
            studentId: row.student.id,
            publicationCode: selectedResultPublicationProgram.publicationCode,
            mode: nextMode,
          }),
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat persetujuan izin..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Persetujuan Izin</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Persetujuan Izin
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia untuk wali kelas yang memiliki kelas aktif.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            classesQuery.isFetching ||
            (activeTab === 'IZIN' && permissionsQuery.isFetching) ||
            (activeTab === 'AKSES_UJIAN' && restrictionsQuery.isFetching) ||
            (activeTab === 'PUBLIKASI_NILAI' && resultPublicationsQuery.isFetching) ||
            ((activeTab === 'AKSES_UJIAN' || activeTab === 'BUKU_WALI_KELAS') && examProgramsQuery.isFetching)
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            if (activeTab === 'IZIN') {
              void permissionsQuery.refetch();
              return;
            }
            if (activeTab === 'AKSES_UJIAN') {
              void restrictionsQuery.refetch();
              void examProgramsQuery.refetch();
              return;
            }
            if (activeTab === 'PUBLIKASI_NILAI') {
              void resultPublicationsQuery.refetch();
              return;
            }
            void examProgramsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Persetujuan Izin
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola perizinan, akses ujian, publikasi nilai, dan Buku Wali Kelas siswa.
      </Text>

      <MobileMenuTabBar
        items={[
          { key: 'IZIN', label: 'Daftar Izin', iconName: 'file-text' },
          { key: 'AKSES_UJIAN', label: 'Akses Ujian', iconName: 'shield' },
          { key: 'PUBLIKASI_NILAI', label: 'Publikasi Nilai', iconName: 'award' },
          { key: 'BUKU_WALI_KELAS', label: 'Buku Wali Kelas', iconName: 'book-open' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as HomeroomPermissionTab)}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ paddingRight: 8 }}
      />

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kelas wali..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat kelas wali." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError ? (
        classItems.length > 0 ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <MobileSelectField
              label="Kelas Wali"
              value={effectiveSelectedClassId ? String(effectiveSelectedClassId) : ''}
              options={classSelectOptions}
              onChange={(next) => setSelectedClassId(next ? Number(next) : null)}
              placeholder="Pilih kelas wali"
            />
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Tidak ada kelas wali
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Anda belum terdaftar sebagai wali kelas di tahun ajaran aktif.
            </Text>
          </View>
        )
      ) : null}

      {selectedClass ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(16), lineHeight: scaleLineHeight(22) }}>
            {selectedClass.name}
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • Wali: {selectedClass.teacher?.name || '-'}
          </Text>
        </View>
      ) : null}

      {activeTab === 'IZIN' ? (
      <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {[
          {
            key: 'total',
            title: 'Total Pengajuan',
            value: `${summary.total}`,
            subtitle: 'Sesuai filter saat ini',
            iconName: 'inbox' as const,
            accentColor: '#2563eb',
          },
          {
            key: 'pending',
            title: 'Menunggu Proses',
            value: `${summary.pending}`,
            subtitle: 'Perlu verifikasi wali kelas',
            iconName: 'clock' as const,
            accentColor: '#f97316',
          },
          {
            key: 'approved',
            title: 'Disetujui',
            value: `${summary.approved}`,
            subtitle: `Sakit ${summary.sick} • Izin ${summary.permission}`,
            iconName: 'check-circle' as const,
            accentColor: '#16a34a',
          },
          {
            key: 'rejected',
            title: 'Ditolak',
            value: `${summary.rejected}`,
            subtitle: `Lainnya ${summary.other}`,
            iconName: 'x-circle' as const,
            accentColor: '#dc2626',
          },
        ].map((item) => (
          <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <MobileSummaryCard
              title={item.title}
              value={item.value}
              subtitle={item.subtitle}
              iconName={item.iconName}
              accentColor={item.accentColor}
              onPress={() => setSummaryDetailVisible(true)}
            />
          </View>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari siswa / NIS / NISN"
          placeholderTextColor="#8ea0bf"
          style={{
            flex: 1,
            paddingVertical: 11,
            paddingHorizontal: 9,
            color: BRAND_COLORS.textDark,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <MobileSelectField
          label="Filter Status"
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(next) => setStatusFilter((next as StatusFilter) || 'ALL')}
          placeholder="Pilih status pengajuan"
        />
        <MobileSelectField
          label="Filter Jenis Izin"
          value={typeFilter}
          options={typeFilterOptions}
          onChange={(next) => setTypeFilter((next as TypeFilter) || 'ALL')}
          placeholder="Pilih jenis izin"
        />
      </View>

      {permissionsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data izin siswa..." /> : null}
      {permissionsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data izin siswa."
          onRetry={() => permissionsQuery.refetch()}
        />
      ) : null}

      {!permissionsQuery.isLoading && !permissionsQuery.isError ? (
        permissions.length > 0 ? (
          permissions.map((item) => {
            const currentStatusStyle = statusStyle(item.status);
            const currentTypeStyle = typeStyle(item.type);
            const isPending = item.status === 'PENDING';
            return (
              <View
                key={item.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  backgroundColor: '#fff',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(15), lineHeight: scaleLineHeight(22) }}>
                      {item.student?.name || '-'}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2 }}>
                      NIS: {item.student?.nis || '-'} • NISN: {item.student?.nisn || '-'}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: currentStatusStyle.border,
                      backgroundColor: currentStatusStyle.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: currentStatusStyle.text, fontWeight: '700', fontSize: scaleFont(11) }}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    backgroundColor: currentTypeStyle.bg,
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ color: currentTypeStyle.text, fontWeight: '700', fontSize: scaleFont(12) }}>{TYPE_LABEL[item.type]}</Text>
                </View>

                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Tanggal: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{formatDateRange(item.startDate, item.endDate)}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Alasan: <Text style={{ color: BRAND_COLORS.textDark }}>{item.reason || '-'}</Text>
                </Text>
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                  Diajukan: {formatDate(item.createdAt)}
                </Text>

                {item.status === 'REJECTED' && item.approvalNote ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fff1f2',
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#991b1b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>{item.approvalNote}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: isPending ? 8 : 0 }}>
                  <Pressable
                    onPress={() => void openAttachment(item)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      backgroundColor: '#f8fafc',
                      paddingVertical: 9,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    >
                      <Feather name="paperclip" size={14} color="#334155" />
                    <Text style={{ color: '#334155', fontWeight: '600' }}>Lihat Bukti</Text>
                  </Pressable>
                </View>

                {isPending ? (
                  <>
                    <TextInput
                      value={rejectionNotes[item.id] || ''}
                      onChangeText={(value) =>
                        setRejectionNotes((prev) => ({
                          ...prev,
                          [item.id]: value,
                        }))
                      }
                      placeholder="Catatan penolakan (opsional)"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        color: BRAND_COLORS.textDark,
                        backgroundColor: '#f8fbff',
                        marginBottom: 8,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => handleApprove(item)}
                        disabled={decisionMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          backgroundColor: '#16a34a',
                          alignItems: 'center',
                          paddingVertical: 10,
                          opacity: decisionMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Setujui</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleReject(item)}
                        disabled={decisionMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          backgroundColor: '#dc2626',
                          alignItems: 'center',
                          paddingVertical: 10,
                          opacity: decisionMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Tolak</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            );
          })
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data izin siswa sesuai filter.</Text>
          </View>
        )
      ) : null}

      <MobileDetailModal
        visible={summaryDetailVisible}
        title="Ringkasan Persetujuan Izin"
        subtitle="Detail ringkas status pengajuan izin pada kelas dan filter yang sedang aktif."
        iconName="check-square"
        accentColor="#2563eb"
        onClose={() => setSummaryDetailVisible(false)}
      >
        <View style={{ gap: 10 }}>
          {[
            {
              label: 'Total Pengajuan',
              value: `${summary.total}`,
              note: 'Jumlah pengajuan yang tampil sesuai kelas dan pencarian aktif',
            },
            {
              label: 'Menunggu Proses',
              value: `${summary.pending}`,
              note: 'Masih menunggu verifikasi wali kelas',
            },
            {
              label: 'Disetujui',
              value: `${summary.approved}`,
              note: `Sakit ${summary.sick} • Izin ${summary.permission}`,
            },
            {
              label: 'Ditolak',
              value: `${summary.rejected}`,
              note: `Kategori lainnya ${summary.other}`,
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(18) }}>{item.value}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 3 }}>{item.note}</Text>
            </View>
          ))}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 11,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginBottom: 4 }}>Konteks Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
              Kelas: {selectedClass?.name || 'Semua kelas wali'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
              Status: {STATUS_LABEL[statusFilter]}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
              Jenis: {TYPE_LABEL[typeFilter]}
            </Text>
          </View>
        </View>
      </MobileDetailModal>
      </>
      ) : activeTab === 'AKSES_UJIAN' ? (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          {[
            {
              key: 'total',
              title: 'Total Siswa',
              value: `${restrictionSummary.total}`,
              subtitle: 'Sesuai filter ujian aktif',
              iconName: 'users' as const,
              accentColor: '#2563eb',
            },
            {
              key: 'blocked',
              title: 'Ditolak',
              value: `${restrictionSummary.blocked}`,
              subtitle: 'Akses ujian sedang dibatasi',
              iconName: 'x-circle' as const,
              accentColor: '#dc2626',
            },
            {
              key: 'manual',
              title: 'Manual',
              value: `${restrictionSummary.manual}`,
              subtitle: 'Blokir wali kelas',
              iconName: 'shield' as const,
              accentColor: '#d97706',
            },
            {
              key: 'automatic',
              title: 'Otomatis',
              value: `${restrictionSummary.automatic}`,
              subtitle: 'Dari policy sistem',
              iconName: 'alert-triangle' as const,
              accentColor: '#7c3aed',
            },
          ].map((item) => (
            <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MobileSummaryCard
                title={item.title}
                value={item.value}
                subtitle={item.subtitle}
                iconName={item.iconName}
                accentColor={item.accentColor}
              />
            </View>
          ))}
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#fcd34d',
            backgroundColor: '#fffbeb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', fontSize: scaleFont(14), marginBottom: 4 }}>Akses Ujian</Text>
          <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
            Gunakan blokir manual ini untuk kasus administrasi atau tunggakan yang belum tersinkron di modul finance.
            Keterangan yang Anda isi akan tampil ke siswa pada menu ujian.
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#d5e0f5',
            borderRadius: 10,
            paddingHorizontal: 10,
            backgroundColor: '#fff',
            marginBottom: 10,
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari siswa / NISN"
            placeholderTextColor="#8ea0bf"
            style={{
              flex: 1,
              paddingVertical: 11,
              paddingHorizontal: 9,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <MobileSelectField
            label="Semester"
            value={selectedSemester}
            options={[
              { value: 'ODD', label: 'Ganjil' },
              { value: 'EVEN', label: 'Genap' },
            ]}
            onChange={(next) => {
              setSelectedSemesterOverride((next as 'ODD' | 'EVEN' | '') || '');
              setSelectedExamTypeOverride('');
            }}
            placeholder="Pilih semester"
          />
          <MobileSelectField
            label="Jenis Ujian"
            value={selectedExamType}
            options={examTypeOptions}
            onChange={(next) => setSelectedExamTypeOverride(next || '')}
            placeholder="Pilih jenis ujian"
            helperText={examTypeOptions.length === 0 ? 'Program ujian siswa belum tersedia untuk semester ini.' : undefined}
          />
        </View>

        {!selectedSemester || !selectedExamType ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Filter Belum Lengkap
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Pilih semester dan jenis ujian terlebih dahulu untuk memuat akses ujian siswa.
            </Text>
          </View>
        ) : null}

        {selectedSemester && selectedExamType ? (
          <>
            {restrictionsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil data akses ujian..." />
            ) : null}
            {restrictionsQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat data akses ujian."
                onRetry={() => restrictionsQuery.refetch()}
              />
            ) : null}

            {!restrictionsQuery.isLoading && !restrictionsQuery.isError ? (
              restrictions.length > 0 ? (
                restrictions.map((item) => {
                  const isBlocked = item.isBlocked;
                  const canToggleManual = !item.autoBlocked;
                  const statusText = isBlocked ? 'Ditolak' : 'Diizinkan';
                  const actionLabel = !isBlocked
                    ? 'Blokir Manual'
                    : item.autoBlocked
                      ? 'Tinjau Penyebab'
                      : 'Buka Akses';
                  const statusColors = isBlocked
                    ? { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2' }
                    : { text: '#15803d', border: '#86efac', bg: '#dcfce7' };

                  return (
                    <View
                      key={item.student.id}
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        backgroundColor: '#fff',
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 10,
                          marginBottom: 6,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(15), lineHeight: scaleLineHeight(22) }}>
                            {item.student.name}
                          </Text>
                          <Text style={{ color: '#64748b', marginTop: 2 }}>
                            NISN: {item.student.nisn || '-'}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: statusColors.border,
                            backgroundColor: statusColors.bg,
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                          }}
                        >
                          <Text style={{ color: statusColors.text, fontWeight: '700', fontSize: scaleFont(11) }}>{statusText}</Text>
                        </View>
                      </View>

                      {isBlocked ? (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            backgroundColor: '#fff1f2',
                            borderRadius: 8,
                            padding: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: '#991b1b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                            {item.reason || 'Akses ditutup'}
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ color: '#15803d', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                          Akses ujian terbuka untuk siswa ini.
                        </Text>
                      )}

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {item.manualBlocked ? (
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#fef3c7',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: '#92400e', fontSize: scaleFont(11), fontWeight: '700' }}>Manual</Text>
                          </View>
                        ) : null}
                        {item.flags.belowKkm ? (
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#fee2e2',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontSize: scaleFont(11), fontWeight: '700' }}>Nilai &lt; KKM</Text>
                          </View>
                        ) : null}
                        {item.flags.financeBlocked ? (
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#ffedd5',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: '#c2410c', fontSize: scaleFont(11), fontWeight: '700' }}>Tunggakan</Text>
                          </View>
                        ) : null}
                        {item.flags.financeBlocked && item.flags.financeOverdue ? (
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#ffe4e6',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: '#be123c', fontSize: scaleFont(11), fontWeight: '700' }}>Jatuh Tempo</Text>
                          </View>
                        ) : null}
                        {item.flags.financeOutstanding && !item.flags.financeBlocked ? (
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#fef3c7',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: '#a16207', fontSize: scaleFont(11), fontWeight: '700' }}>Info Finance</Text>
                          </View>
                        ) : null}
                      </View>

                      {item.details.belowKkmSubjects.length > 0 ? (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            backgroundColor: '#fef2f2',
                            borderRadius: 8,
                            padding: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontSize: scaleFont(12), fontWeight: '700', marginBottom: 4 }}>
                            Mapel di bawah KKM
                          </Text>
                          <Text style={{ color: '#b91c1c', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                            {item.details.belowKkmSubjects
                              .slice(0, 3)
                              .map((subject) => `${subject.subjectName} (${subject.score}/${subject.kkm})`)
                              .join(', ')}
                            {item.details.belowKkmSubjects.length > 3
                              ? ` +${item.details.belowKkmSubjects.length - 3} mapel lainnya`
                              : ''}
                          </Text>
                        </View>
                      ) : null}

                      {item.flags.financeOutstanding ? (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#fed7aa',
                            backgroundColor: '#fff7ed',
                            borderRadius: 8,
                            padding: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: '#c2410c', fontSize: scaleFont(12), fontWeight: '700', marginBottom: 4 }}>
                            Tunggakan {formatExamCurrency(item.details.outstandingAmount)}
                          </Text>
                          <Text style={{ color: '#c2410c', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                            {item.details.outstandingInvoices} tagihan aktif
                            {item.details.overdueInvoices > 0
                              ? `, ${item.details.overdueInvoices} sudah jatuh tempo`
                              : ''}
                          </Text>
                          {!item.flags.financeBlocked ? (
                            <Text style={{ color: '#c2410c', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 4 }}>
                              Program ujian ini tidak memblokir akses dari status tunggakan tersebut.
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => openRestrictionModal(item)}
                        disabled={updateRestrictionMutation.isPending}
                        style={{
                          borderWidth: 1,
                          borderColor: !isBlocked ? '#f59e0b' : canToggleManual ? '#16a34a' : '#cbd5e1',
                          backgroundColor: !isBlocked ? '#fffbeb' : canToggleManual ? '#f0fdf4' : '#f8fafc',
                          borderRadius: 10,
                          paddingVertical: 10,
                          alignItems: 'center',
                          opacity: updateRestrictionMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text
                          style={{
                            color: !isBlocked ? '#b45309' : canToggleManual ? '#166534' : '#64748b',
                            fontWeight: '700',
                          }}
                        >
                          {actionLabel}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderStyle: 'dashed',
                    borderRadius: 10,
                    padding: 16,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada siswa yang ditemukan.</Text>
                </View>
              )
            ) : null}
          </>
        ) : null}
      </>
      ) : activeTab === 'PUBLIKASI_NILAI' ? (
      <>
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            backgroundColor: '#eff6ff',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(14), marginBottom: 4 }}>
            Publikasi Nilai
          </Text>
          <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
            Default publikasi tetap mengikuti jadwal Wakakur. Gunakan kontrol ini jika wali kelas perlu menahan hasil nilai siswa tertentu agar belum tampil ke akun siswa.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <MobileSelectField
            label="Semester"
            value={selectedSemester}
            options={[
              { value: 'ODD', label: 'Ganjil' },
              { value: 'EVEN', label: 'Genap' },
            ]}
            onChange={(next) => {
              setSelectedSemesterOverride((next as 'ODD' | 'EVEN' | '') || '');
              setSelectedPublicationCodeOverride('');
            }}
            placeholder="Pilih semester"
            helperText="Program yang tampil akan mengikuti semester yang dipilih."
          />
          <MobileSelectField
            label="Jenis Nilai"
            value={selectedResultPublicationCode}
            options={resultPublicationPrograms.map((program) => ({
              value: program.publicationCode,
              label: program.label,
            }))}
            onChange={(next) => setSelectedPublicationCodeOverride(next || '')}
            placeholder="Pilih jenis nilai"
            helperText="Satu jenis nilai ditampilkan dengan breakdown per siswa."
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#d5e0f5',
            borderRadius: 10,
            paddingHorizontal: 10,
            backgroundColor: '#fff',
            marginBottom: 10,
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari siswa / NIS / NISN"
            placeholderTextColor="#8ea0bf"
            style={{
              flex: 1,
              paddingVertical: 11,
              paddingHorizontal: 9,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        {selectedResultPublicationProgram ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(14) }}>
              {selectedResultPublicationProgram.label}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
              {selectedResultPublicationProgram.globalRelease.description}
            </Text>
            <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 4 }}>
              {selectedResultPublicationProgram.globalRelease.effectiveDate
                ? `Efektif ${formatDateTime(selectedResultPublicationProgram.globalRelease.effectiveDate)}`
                : 'Tanpa tanggal khusus'}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          {[
            {
              key: 'total',
              title: 'Total Siswa',
              value: `${resultPublicationSummary.totalStudents}`,
              subtitle: 'Sesuai kelas dan pencarian aktif',
              iconName: 'users' as const,
              accentColor: '#2563eb',
            },
            {
              key: 'visible',
              title: 'Sudah Tampil',
              value: `${resultPublicationSummary.visibleStudents}`,
              subtitle: 'Saat ini bisa dibuka siswa',
              iconName: 'check-circle' as const,
              accentColor: '#16a34a',
            },
            {
              key: 'blocked',
              title: 'Ditahan Wali',
              value: `${resultPublicationSummary.blockedStudents}`,
              subtitle: 'Ditahan per siswa oleh wali kelas',
              iconName: 'x-circle' as const,
              accentColor: '#dc2626',
            },
            {
              key: 'waiting',
              title: 'Menunggu Wakakur',
              value: `${resultPublicationSummary.waitingWakakurStudents}`,
              subtitle: 'Masih ikut jadwal rilis global',
              iconName: 'clock' as const,
              accentColor: '#d97706',
            },
          ].map((item) => (
            <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MobileSummaryCard
                title={item.title}
                value={item.value}
                subtitle={item.subtitle}
                iconName={item.iconName}
                accentColor={item.accentColor}
              />
            </View>
          ))}
        </View>

        {resultPublicationsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil kontrol publikasi nilai..." />
        ) : null}
        {resultPublicationsQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat kontrol publikasi nilai."
            onRetry={() => resultPublicationsQuery.refetch()}
          />
        ) : null}

        {!resultPublicationsQuery.isLoading && !resultPublicationsQuery.isError ? (
          resultPublicationPrograms.length > 0 ? (
            <View style={{ gap: 12 }}>
              {resultPublicationRows.length > 0 ? (
                resultPublicationRows.map((row) => {
                const isBlocked = row.homeroomPublication.mode === 'BLOCKED';
                const effectiveColors =
                  row.effectiveVisibility.tone === 'green'
                    ? { border: '#86efac', bg: '#dcfce7', text: '#166534' }
                    : row.effectiveVisibility.tone === 'amber'
                      ? { border: '#fcd34d', bg: '#fffbeb', text: '#92400e' }
                      : { border: '#fca5a5', bg: '#fee2e2', text: '#991b1b' };

                return (
                  <View
                    key={row.student.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      backgroundColor: '#fff',
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(15), lineHeight: scaleLineHeight(22) }}>
                          {row.student.name}
                        </Text>
                        <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => handleToggleResultPublication(row)}
                        disabled={updateResultPublicationMutation.isPending}
                        style={{
                          borderRadius: 10,
                          backgroundColor: isBlocked ? '#16a34a' : '#dc2626',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          opacity: updateResultPublicationMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
                          {isBlocked ? 'Publikasikan' : 'Tahan Publikasi'}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={{ gap: 8 }}>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: '#64748b', fontSize: scaleFont(11), fontWeight: '700', marginBottom: 4 }}>
                          RILIS WAKAKUR
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                          {selectedResultPublicationProgram?.globalRelease.label || '-'}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                          {selectedResultPublicationProgram?.globalRelease.effectiveDate
                            ? `Efektif ${formatDateTime(selectedResultPublicationProgram.globalRelease.effectiveDate)}`
                            : 'Tanpa tanggal khusus'}
                        </Text>
                      </View>

                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: '#64748b', fontSize: scaleFont(11), fontWeight: '700', marginBottom: 4 }}>
                          GATE WALI KELAS
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.homeroomPublication.label}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                          {row.homeroomPublication.updatedAt
                            ? `Diperbarui ${formatDateTime(row.homeroomPublication.updatedAt)}`
                            : 'Belum ada override manual'}
                        </Text>
                      </View>

                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: effectiveColors.border,
                          backgroundColor: effectiveColors.bg,
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: effectiveColors.text, fontSize: scaleFont(11), fontWeight: '700', marginBottom: 4 }}>
                          STATUS KE SISWA
                        </Text>
                        <Text style={{ color: effectiveColors.text, fontWeight: '700' }}>{row.effectiveVisibility.label}</Text>
                        <Text style={{ color: effectiveColors.text, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                          {row.effectiveVisibility.description}
                        </Text>
                      </View>

                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Kebijakan Aktif</Text>
                        <Text style={{ color: '#475569', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          {row.homeroomPublication.description}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderStyle: 'dashed',
                    borderRadius: 10,
                    padding: 16,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted }}>
                    Tidak ada siswa yang ditemukan untuk filter ini.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 16,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Tidak ada program nilai siswa yang relevan untuk semester ini.
              </Text>
            </View>
          )
        ) : null}
      </>
      ) : (
        <HomeroomBookMobilePanel
          mode="homeroom"
          academicYearId={activeYearQuery.data?.id}
          classId={effectiveSelectedClassId}
          examPrograms={examProgramsQuery.data || []}
        />
      )}

      <MobileDetailModal
        visible={restrictionModalVisible}
        title="Blokir Manual Akses Ujian"
        subtitle="Keterangan ini akan tampil ke siswa pada menu ujian."
        iconName="shield"
        accentColor="#d97706"
        onClose={() => {
          if (updateRestrictionMutation.isPending) return;
          setRestrictionModalVisible(false);
          setRestrictionTarget(null);
          setRestrictionReasonDraft(DEFAULT_MANUAL_RESTRICTION_REASON);
        }}
      >
        <View style={{ gap: 10 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              backgroundColor: '#f8fbff',
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginBottom: 4 }}>Siswa</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(15), lineHeight: scaleLineHeight(22) }}>
              {restrictionTarget?.student.name || '-'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
              NISN: {restrictionTarget?.student.nisn || '-'}
            </Text>
          </View>

          <TextInput
            value={restrictionReasonDraft}
            onChangeText={setRestrictionReasonDraft}
            placeholder="Masukkan keterangan pembatasan ujian"
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={5}
            style={{
              borderWidth: 1,
              borderColor: '#d6e2f7',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
              minHeight: 120,
              textAlignVertical: 'top',
              backgroundColor: '#fff',
            }}
          />

          <Pressable
            onPress={submitRestrictionBlock}
            disabled={updateRestrictionMutation.isPending}
            style={{
              borderRadius: 12,
              backgroundColor: '#d97706',
              paddingVertical: 12,
              alignItems: 'center',
              opacity: updateRestrictionMutation.isPending ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {updateRestrictionMutation.isPending ? 'Menyimpan...' : 'Simpan Blokir Manual'}
            </Text>
          </Pressable>
        </View>
      </MobileDetailModal>

    </ScrollView>
  );
}
