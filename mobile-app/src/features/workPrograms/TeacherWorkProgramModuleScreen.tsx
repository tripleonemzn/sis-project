import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';
import { useAuth } from '../auth/AuthProvider';
import { formatWorkProgramDutyLabel, normalizeDutyCode } from './advisorDuty';
import { academicYearApi } from '../academicYear/academicYearApi';
import { osisApi } from '../osis/osisApi';
import { WorkProgramBudgetOwnerSection } from './WorkProgramBudgetOwnerSection';
import { WorkProgramRecord } from './types';
import { workProgramApi } from './workProgramApi';
import { scaleLineHeightWithAppTextScale, scaleWithAppTextScale } from '../../theme/AppTextScaleProvider';

type ModuleMode = 'OWNER' | 'APPROVAL';
type FilterStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

type ProgramFormState = {
  title: string;
  description: string;
  additionalDuty: string;
  majorId: string;
  semester: 'ODD' | 'EVEN';
  startMonth: string;
  endMonth: string;
  startWeek: string;
  endWeek: string;
  academicYearId: string;
};

type ItemEditorState = {
  programId: number;
  itemId: number | null;
  description: string;
  targetDate: string;
  note: string;
};

const DEFAULT_PROGRAM_FORM: ProgramFormState = {
  title: '',
  description: '',
  additionalDuty: '',
  majorId: '',
  semester: 'ODD',
  startMonth: '1',
  endMonth: '1',
  startWeek: '1',
  endWeek: '1',
  academicYearId: '',
};

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

function formatDateTime(value?: string | null) {
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

function formatDuty(value?: string | null) {
  if (!value) return '-';
  return formatWorkProgramDutyLabel(value);
}

function formatSemester(value?: string | null) {
  if (!value) return '-';
  if (value === 'ODD') return 'Ganjil';
  if (value === 'EVEN') return 'Genap';
  return value;
}

function formatPeriod(record: WorkProgramRecord) {
  const startMonth = Number(record.startMonth || record.month || 0);
  const endMonth = Number(record.endMonth || record.month || 0);
  const startWeek = Number(record.startWeek || 0);
  const endWeek = Number(record.endWeek || 0);

  if (!startMonth || !endMonth || !startWeek || !endWeek) return '-';
  if (startMonth === endMonth && startWeek === endWeek) {
    return `Bulan ${startMonth}, Minggu ${startWeek}`;
  }
  return `Bulan ${startMonth} M${startWeek} - Bulan ${endMonth} M${endWeek}`;
}

function resolveApprovalStatus(record: WorkProgramRecord): FilterStatus {
  const status = String(record.approvalStatus || '').toUpperCase();
  if (status === 'APPROVED') return 'APPROVED';
  if (status === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function statusStyle(status: FilterStatus) {
  if (status === 'APPROVED') return { text: '#166534', border: '#86efac', bg: '#dcfce7', label: 'Disetujui' };
  if (status === 'REJECTED') return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2', label: 'Ditolak' };
  return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe', label: 'Menunggu' };
}

function toInt(value: string, fallback: number) {
  const parsed = Number(String(value || '').trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback;
  const err = error as {
    message?: string;
    response?: {
      data?: {
        message?: string;
      };
    };
  };
  return err.response?.data?.message || err.message || fallback;
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        keyboardType={keyboardType || 'default'}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: multiline ? 10 : 9,
          minHeight: multiline ? 84 : undefined,
          backgroundColor: '#fff',
          color: BRAND_COLORS.textDark,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function buildProgramForm(record: WorkProgramRecord, fallbackYearId?: number | null): ProgramFormState {
  return {
    title: record.title || '',
    description: record.description || '',
    additionalDuty: String(record.additionalDuty || '').trim().toUpperCase(),
    majorId: record.major?.id ? String(record.major.id) : '',
    semester: record.semester === 'EVEN' ? 'EVEN' : 'ODD',
    startMonth: String(Number(record.startMonth || record.month || 1)),
    endMonth: String(Number(record.endMonth || record.month || 1)),
    startWeek: String(Number(record.startWeek || 1)),
    endWeek: String(Number(record.endWeek || 1)),
    academicYearId: String(record.academicYear?.id || fallbackYearId || ''),
  };
}

export function TeacherWorkProgramModuleScreen({
  mode,
  title,
  subtitle,
  allowedRoles = ['TEACHER'],
  forcedDuty,
}: {
  mode: ModuleMode;
  title: string;
  subtitle: string;
  allowedRoles?: string[];
  forcedDuty?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [programFormVisible, setProgramFormVisible] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);
  const [programForm, setProgramForm] = useState<ProgramFormState>(DEFAULT_PROGRAM_FORM);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [expandedProgramIds, setExpandedProgramIds] = useState<Record<number, boolean>>({});
  const [budgetSectionVisible, setBudgetSectionVisible] = useState(false);
  const normalizedAllowedRoles = useMemo(
    () =>
      new Set(
        (Array.isArray(allowedRoles) && allowedRoles.length > 0 ? allowedRoles : ['TEACHER']).map((role) =>
          String(role || '')
            .trim()
            .toUpperCase(),
        ),
      ),
    [allowedRoles],
  );
  const isAllowedRole = normalizedAllowedRoles.has(
    String(user?.role || '')
      .trim()
      .toUpperCase(),
  );

  const activeYearQuery = useQuery({
    queryKey: ['mobile-work-program-active-year'],
    enabled: isAuthenticated && isAllowedRole,
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const managedMajors = (() => {
    if (Array.isArray(user?.managedMajors) && user.managedMajors.length > 0) return user.managedMajors;
    if (user?.managedMajor) return [user.managedMajor];
    return [];
  })();

  const dutyOptions = (() => {
    const normalizedForcedDuty = normalizeDutyCode(forcedDuty);
    if (normalizedForcedDuty) {
      return [normalizedForcedDuty];
    }
    if (String(user?.role || '').trim().toUpperCase() === 'EXTRACURRICULAR_TUTOR') {
      return ['PEMBINA_EKSKUL'];
    }
    const raw = Array.isArray(user?.additionalDuties) ? user.additionalDuties : [];
    const normalized = raw
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => item.length > 0 && !item.startsWith('SEKRETARIS_'));
    return Array.from(new Set(normalized));
  })();
  const ownerDutyFilter = dutyOptions.length === 1 ? dutyOptions[0] : undefined;
  const dutySelectOptions = useMemo(
    () => dutyOptions.map((item) => ({ value: item, label: formatDuty(item) })),
    [dutyOptions],
  );
  const majorSelectOptions = useMemo(
    () =>
      managedMajors.map((major) => ({
        value: String(major.id),
        label: major.code ? `${major.code} - ${major.name}` : major.name,
      })),
    [managedMajors],
  );
  const semesterSelectOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Ganjil' },
      { value: 'EVEN', label: 'Genap' },
    ],
    [],
  );
  const statusFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Status' },
      { value: 'PENDING', label: 'Menunggu' },
      { value: 'APPROVED', label: 'Disetujui' },
      { value: 'REJECTED', label: 'Ditolak' },
    ],
    [],
  );
  const normalizedOwnerDuty = normalizeDutyCode(ownerDutyFilter || forcedDuty);
  const isOsisOwnerDuty = mode === 'OWNER' && normalizedOwnerDuty === 'PEMBINA_OSIS';

  const ownerQuery = useQuery({
    queryKey: ['mobile-work-program-owner', user?.id, activeYearQuery.data?.id, ownerDutyFilter || 'ALL'],
    enabled: isAuthenticated && isAllowedRole && mode === 'OWNER',
    queryFn: async () =>
      workProgramApi.list({
        page: 1,
        limit: 100,
        academicYearId: activeYearQuery.data?.id,
        additionalDuty: ownerDutyFilter,
      }),
    ...mobileLiveQueryOptions,
  });

  const approvalQuery = useQuery({
    queryKey: ['mobile-work-program-approvals', user?.id],
    enabled: isAuthenticated && isAllowedRole && mode === 'APPROVAL',
    queryFn: async () => workProgramApi.listPendingApprovals(),
    ...mobileLiveQueryOptions,
  });

  const osisReadinessQuery = useQuery({
    queryKey: ['mobile-osis-work-program-readiness', activeYearQuery.data?.id, normalizedOwnerDuty],
    enabled: isAuthenticated && isAllowedRole && isOsisOwnerDuty && !!activeYearQuery.data?.id,
    queryFn: () => osisApi.getWorkProgramReadiness(activeYearQuery.data?.id),
    ...mobileLiveQueryOptions,
  });

  const osisReadiness = osisReadinessQuery.data || null;
  const isOsisProgramLocked = isOsisOwnerDuty && !osisReadiness?.canCreatePrograms;

  const refreshOwner = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner'] });
    await ownerQuery.refetch();
  };

  const approvalMutation = useMutation({
    mutationFn: async (payload: { id: number; status: 'APPROVED' | 'REJECTED' }) => {
      setUpdatingId(payload.id);
      return workProgramApi.updateApprovalStatus(payload.id, {
        status: payload.status,
        feedback: payload.status === 'REJECTED' ? 'Ditolak melalui aplikasi mobile' : undefined,
      });
    },
    onSuccess: () => {
      Alert.alert('Berhasil', 'Status persetujuan program kerja sudah diperbarui.');
      void approvalQuery.refetch();
    },
    onError: () => {
      Alert.alert('Gagal', 'Status persetujuan tidak dapat diperbarui saat ini.');
    },
    onSettled: () => {
      setUpdatingId(null);
    },
  });

  const createProgramMutation = useMutation({
    mutationFn: async () => {
      const titleValue = programForm.title.trim();
      if (!titleValue) throw new Error('Judul program kerja wajib diisi.');
      if (!programForm.additionalDuty) throw new Error('Pilih tugas tambahan.');

      const startMonth = clamp(toInt(programForm.startMonth, 1), 1, 12);
      const endMonth = clamp(toInt(programForm.endMonth, startMonth), 1, 12);
      const startWeek = clamp(toInt(programForm.startWeek, 1), 1, 5);
      const endWeek = clamp(toInt(programForm.endWeek, startWeek), 1, 5);

      const yearId = Number(programForm.academicYearId || activeYearQuery.data?.id || 0);
      if (!yearId) throw new Error('Tahun ajaran aktif belum tersedia.');

      const isKaprog = programForm.additionalDuty === 'KAPROG';
      const majorId = Number(programForm.majorId || 0) || undefined;
      if (isKaprog && managedMajors.length > 1 && !majorId) {
        throw new Error('Untuk tugas KAPROG, pilih jurusan terlebih dahulu.');
      }

      return workProgramApi.create({
        title: titleValue,
        description: programForm.description.trim() || undefined,
        additionalDuty: programForm.additionalDuty,
        academicYearId: yearId,
        semester: programForm.semester,
        month: startMonth,
        startMonth,
        endMonth,
        startWeek,
        endWeek,
        majorId: majorId || (isKaprog && managedMajors.length === 1 ? managedMajors[0]?.id : undefined),
      });
    },
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Program kerja berhasil ditambahkan.');
      setProgramFormVisible(false);
      setEditingProgramId(null);
      setProgramForm((prev) => ({
        ...DEFAULT_PROGRAM_FORM,
        additionalDuty: prev.additionalDuty || dutyOptions[0] || '',
        academicYearId: String(activeYearQuery.data?.id || ''),
      }));
      await refreshOwner();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Gagal menambah program kerja.'));
    },
  });

  const updateProgramMutation = useMutation({
    mutationFn: async () => {
      if (!editingProgramId) throw new Error('Program yang diedit tidak valid.');

      const titleValue = programForm.title.trim();
      if (!titleValue) throw new Error('Judul program kerja wajib diisi.');

      const startMonth = clamp(toInt(programForm.startMonth, 1), 1, 12);
      const endMonth = clamp(toInt(programForm.endMonth, startMonth), 1, 12);
      const startWeek = clamp(toInt(programForm.startWeek, 1), 1, 5);
      const endWeek = clamp(toInt(programForm.endWeek, startWeek), 1, 5);

      const yearId = Number(programForm.academicYearId || activeYearQuery.data?.id || 0);
      if (!yearId) throw new Error('Tahun ajaran aktif belum tersedia.');

      const isKaprog = programForm.additionalDuty === 'KAPROG';
      const majorId = Number(programForm.majorId || 0) || undefined;
      if (isKaprog && managedMajors.length > 1 && !majorId) {
        throw new Error('Untuk tugas KAPROG, pilih jurusan terlebih dahulu.');
      }

      return workProgramApi.update(editingProgramId, {
        title: titleValue,
        description: programForm.description.trim() || undefined,
        additionalDuty: programForm.additionalDuty,
        academicYearId: yearId,
        semester: programForm.semester,
        month: startMonth,
        startMonth,
        endMonth,
        startWeek,
        endWeek,
        majorId: majorId || (isKaprog && managedMajors.length === 1 ? managedMajors[0]?.id : undefined),
      });
    },
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Program kerja berhasil diperbarui.');
      setProgramFormVisible(false);
      setEditingProgramId(null);
      setProgramForm((prev) => ({
        ...DEFAULT_PROGRAM_FORM,
        additionalDuty: prev.additionalDuty || dutyOptions[0] || '',
        academicYearId: String(activeYearQuery.data?.id || ''),
      }));
      await refreshOwner();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Gagal memperbarui program kerja.'));
    },
  });

  const deleteProgramMutation = useMutation({
    mutationFn: async (programId: number) => workProgramApi.remove(programId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Program kerja berhasil dihapus.');
      await refreshOwner();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Gagal menghapus program kerja.'));
    },
  });

  const saveItemMutation = useMutation({
    mutationFn: async () => {
      if (!itemEditor) throw new Error('Data item tidak valid.');
      const description = itemEditor.description.trim();
      if (!description) throw new Error('Deskripsi item wajib diisi.');

      const targetDate = itemEditor.targetDate.trim();
      const payload = {
        description,
        targetDate: targetDate || null,
        note: itemEditor.note.trim() || null,
      };

      if (itemEditor.itemId) {
        return workProgramApi.updateItem(itemEditor.itemId, payload);
      }
      return workProgramApi.createItem(itemEditor.programId, payload);
    },
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Item program kerja berhasil disimpan.');
      setItemEditor(null);
      await refreshOwner();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Gagal menyimpan item program.'));
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: async (payload: { itemId: number; isCompleted: boolean }) =>
      workProgramApi.updateItem(payload.itemId, { isCompleted: payload.isCompleted }),
    onSuccess: async () => {
      await refreshOwner();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Gagal memperbarui status item.'));
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => workProgramApi.removeItem(itemId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Item program kerja berhasil dihapus.');
      await refreshOwner();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Gagal menghapus item program.'));
    },
  });

  const records = useMemo(() => {
    if (mode === 'APPROVAL') return approvalQuery.data || [];
    return ownerQuery.data?.programs || [];
  }, [mode, ownerQuery.data?.programs, approvalQuery.data]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((item) => {
      const status = resolveApprovalStatus(item);
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;

      if (!term) return true;
      const values = [
        item.title || '',
        item.description || '',
        item.academicYear?.name || '',
        item.major?.name || '',
        item.owner?.name || '',
        formatDuty(item.additionalDuty),
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [records, search, statusFilter]);

  const summary = useMemo(() => {
    const total = records.length;
    const pending = records.filter((item) => resolveApprovalStatus(item) === 'PENDING').length;
    const approved = records.filter((item) => resolveApprovalStatus(item) === 'APPROVED').length;

    const progressRaw = records.reduce(
      (acc, item) => {
        const items = item.items || [];
        acc.totalItems += items.length;
        acc.doneItems += items.filter((row) => row.isCompleted).length;
        return acc;
      },
      { totalItems: 0, doneItems: 0 },
    );

    return {
      total,
      pending,
      approved,
      doneItems: progressRaw.doneItems,
      totalItems: progressRaw.totalItems,
    };
  }, [records]);

  const activeQuery = mode === 'APPROVAL' ? approvalQuery : ownerQuery;

  const refreshData = () => {
    if (mode === 'APPROVAL') {
      void approvalQuery.refetch();
      return;
    }
    void ownerQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj'] });
  };

  const askApproval = (record: WorkProgramRecord, status: 'APPROVED' | 'REJECTED') => {
    const label = status === 'APPROVED' ? 'menyetujui' : 'menolak';
    Alert.alert('Konfirmasi', `Anda yakin ingin ${label} program kerja ini?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: status === 'APPROVED' ? 'Setujui' : 'Tolak',
        style: status === 'APPROVED' ? 'default' : 'destructive',
        onPress: () => {
          void approvalMutation.mutateAsync({ id: record.id, status });
        },
      },
    ]);
  };

  const openCreateProgram = () => {
    if (isOsisProgramLocked) {
      Alert.alert(
        'Program Kerja OSIS Belum Tersedia',
        osisReadiness?.message ||
          'Program kerja OSIS baru bisa dibuat setelah pemilihan selesai dan transisi kepengurusan dicatat.',
      );
      return;
    }
    setEditingProgramId(null);
    setProgramFormVisible(true);
    setProgramForm({
      ...DEFAULT_PROGRAM_FORM,
      additionalDuty: dutyOptions[0] || '',
      academicYearId: String(activeYearQuery.data?.id || ''),
    });
  };

  const openEditProgram = (record: WorkProgramRecord) => {
    setEditingProgramId(record.id);
    setProgramFormVisible(true);
    setProgramForm(buildProgramForm(record, activeYearQuery.data?.id));
  };

  const askDeleteProgram = (record: WorkProgramRecord) => {
    Alert.alert('Hapus Program', `Hapus program "${record.title}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteProgramMutation.mutate(record.id),
      },
    ]);
  };

  const openCreateItem = (programId: number) => {
    setItemEditor({
      programId,
      itemId: null,
      description: '',
      targetDate: '',
      note: '',
    });
  };

  const openEditItem = (programId: number, item: NonNullable<WorkProgramRecord['items']>[number]) => {
    setItemEditor({
      programId,
      itemId: item.id,
      description: item.description || '',
      targetDate: item.targetDate ? String(item.targetDate).slice(0, 10) : '',
      note: item.note || '',
    });
  };

  const askDeleteItem = (itemId: number) => {
    Alert.alert('Hapus Item', 'Yakin ingin menghapus item program kerja ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteItemMutation.mutate(itemId),
      },
    ]);
  };

  const toggleProgramExpanded = (programId: number) => {
    setExpandedProgramIds((prev) => ({
      ...prev,
      [programId]: !prev[programId],
    }));
  };

  if (isLoading) return <AppLoadingScreen message={`Memuat ${title.toLowerCase()}...`} />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!isAllowedRole) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Halaman ini tidak tersedia untuk role akun Anda." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={<RefreshControl refreshing={activeQuery.isFetching || activeYearQuery.isFetching} onRefresh={refreshData} />}
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{subtitle}</Text>

      {isOsisOwnerDuty ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: isOsisProgramLocked ? '#fcd34d' : '#86efac',
            backgroundColor: isOsisProgramLocked ? '#fffbeb' : '#ecfdf5',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: isOsisProgramLocked ? '#92400e' : '#166534',
              fontWeight: '700',
              fontSize: scaleWithAppTextScale(13),
              marginBottom: 4,
            }}
          >
            Alur Program Kerja OSIS
          </Text>
          <Text style={{ color: isOsisProgramLocked ? '#a16207' : '#166534', fontSize: scaleWithAppTextScale(13), lineHeight: scaleLineHeightWithAppTextScale(18) }}>
            {osisReadiness?.message ||
              'Program kerja OSIS mengikuti kesiapan periode kepengurusan aktif.'}
          </Text>
          {osisReadiness?.activeManagementPeriod ? (
            <Text style={{ color: isOsisProgramLocked ? '#a16207' : '#166534', fontSize: scaleWithAppTextScale(12), marginTop: 6 }}>
              Periode aktif: {osisReadiness.activeManagementPeriod.title}
              {osisReadiness.activeManagementPeriod.transitionLabel && osisReadiness.activeManagementPeriod.transitionAt
                ? ` • ${osisReadiness.activeManagementPeriod.transitionLabel} pada ${formatDate(
                    osisReadiness.activeManagementPeriod.transitionAt,
                  )}`
                : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <View style={{ flexBasis: '31%', flexGrow: 1 }}>
          <SummaryCard title="Total Program" value={String(summary.total)} subtitle="Seluruh data aktif" iconName="layers" accentColor="#2563eb" />
        </View>
        <View style={{ flexBasis: '31%', flexGrow: 1 }}>
          <SummaryCard title="Menunggu" value={String(summary.pending)} subtitle="Butuh tindak lanjut" iconName="clock" accentColor="#ea580c" />
        </View>
        <View style={{ flexBasis: '31%', flexGrow: 1 }}>
          <SummaryCard
            title={mode === 'APPROVAL' ? 'Siap Ditindak' : 'Progress Item'}
            value={mode === 'APPROVAL' ? String(filteredRecords.length) : `${summary.doneItems}/${summary.totalItems}`}
            subtitle={mode === 'APPROVAL' ? 'Hasil filter saat ini' : 'Item selesai / total item'}
            iconName={mode === 'APPROVAL' ? 'check-square' : 'check-circle'}
            accentColor={mode === 'APPROVAL' ? '#0f766e' : '#16a34a'}
          />
        </View>
      </View>

      {mode === 'OWNER' ? (
        <Pressable
          onPress={openCreateProgram}
          style={{
            backgroundColor: '#16a34a',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah Program Kerja</Text>
        </Pressable>
      ) : null}

      {mode === 'OWNER' && programFormVisible ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
            {editingProgramId ? 'Edit Program Kerja' : 'Program Kerja Baru'}
          </Text>

          {programForm.additionalDuty === 'PEMBINA_OSIS' ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: isOsisProgramLocked ? '#fcd34d' : '#86efac',
                backgroundColor: isOsisProgramLocked ? '#fffbeb' : '#ecfdf5',
                borderRadius: 12,
                padding: 10,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: isOsisProgramLocked ? '#92400e' : '#166534', fontSize: scaleWithAppTextScale(12), lineHeight: scaleLineHeightWithAppTextScale(18) }}>
                {osisReadiness?.message ||
                  'Program kerja OSIS mengikuti kesiapan periode kepengurusan aktif.'}
              </Text>
            </View>
          ) : null}

          <TextField
            label={programForm.additionalDuty === 'PEMBINA_OSIS' ? 'Program / Agenda OSIS' : 'Judul Program'}
            value={programForm.title}
            onChangeText={(title) => setProgramForm((prev) => ({ ...prev, title }))}
            placeholder={
              programForm.additionalDuty === 'PEMBINA_OSIS'
                ? 'Contoh: Rapat koordinasi bidang atau bakti sosial OSIS'
                : 'Contoh: Penguatan Literasi Siswa'
            }
          />

          <TextField
            label="Deskripsi"
            value={programForm.description}
            onChangeText={(description) => setProgramForm((prev) => ({ ...prev, description }))}
            placeholder="Ringkasan program kerja"
            multiline
          />

          {dutyOptions.length > 0 ? (
            <MobileSelectField
              label="Tugas Tambahan"
              value={programForm.additionalDuty}
              options={dutySelectOptions}
              onChange={(additionalDuty) => setProgramForm((prev) => ({ ...prev, additionalDuty }))}
              placeholder="Pilih tugas tambahan"
            />
          ) : (
            <Text style={{ color: '#64748b', marginBottom: 10 }}>Tidak ada duty pengaju pada akun Anda.</Text>
          )}

          {programForm.additionalDuty === 'KAPROG' ? (
            <MobileSelectField
              label="Jurusan"
              value={programForm.majorId}
              options={majorSelectOptions}
              onChange={(majorId) => setProgramForm((prev) => ({ ...prev, majorId }))}
              placeholder="Pilih jurusan"
            />
          ) : null}

          <MobileSelectField
            label="Semester"
            value={programForm.semester}
            options={semesterSelectOptions}
            onChange={(semester) =>
              setProgramForm((prev) => ({ ...prev, semester: semester === 'EVEN' ? 'EVEN' : 'ODD' }))
            }
            placeholder="Pilih semester"
          />

          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextField
                label="Mulai Bulan"
                value={programForm.startMonth}
                onChangeText={(startMonth) => setProgramForm((prev) => ({ ...prev, startMonth }))}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextField
                label="Akhir Bulan"
                value={programForm.endMonth}
                onChangeText={(endMonth) => setProgramForm((prev) => ({ ...prev, endMonth }))}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextField
                label="Mulai Minggu"
                value={programForm.startWeek}
                onChangeText={(startWeek) => setProgramForm((prev) => ({ ...prev, startWeek }))}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextField
                label="Akhir Minggu"
                value={programForm.endWeek}
                onChangeText={(endWeek) => setProgramForm((prev) => ({ ...prev, endWeek }))}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Pressable
              onPress={() => {
                setProgramFormVisible(false);
                setEditingProgramId(null);
              }}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (editingProgramId) {
                  updateProgramMutation.mutate();
                  return;
                }
                createProgramMutation.mutate();
              }}
              disabled={createProgramMutation.isPending || updateProgramMutation.isPending}
              style={{
                flex: 1,
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor: BRAND_COLORS.blue,
                opacity: createProgramMutation.isPending || updateProgramMutation.isPending ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {createProgramMutation.isPending || updateProgramMutation.isPending ? 'Menyimpan...' : 'Simpan Program'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <MobileSelectField
          label="Filter Status"
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(next) => setStatusFilter((next as FilterStatus) || 'ALL')}
          placeholder="Pilih status"
        />
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari judul, deskripsi, tahun ajaran, jurusan..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      {activeQuery.isLoading ? <QueryStateView type="loading" message="Memuat data program kerja..." /> : null}
      {activeQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data program kerja."
          onRetry={refreshData}
        />
      ) : null}

      {!activeQuery.isLoading && !activeQuery.isError ? (
        filteredRecords.length > 0 ? (
          filteredRecords.map((record) => {
            const status = resolveApprovalStatus(record);
            const style = statusStyle(status);
            const items = record.items || [];
            const doneItems = items.filter((item) => item.isCompleted).length;
            const showItemEditor = itemEditor?.programId === record.id;
            const isExpanded = Boolean(expandedProgramIds[record.id]);

            return (
              <View
                key={record.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{record.title}</Text>
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: scaleWithAppTextScale(12) }}>
                      {record.academicYear?.name || '-'} • {formatDuty(record.additionalDuty)}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: style.border,
                      backgroundColor: style.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: style.text, fontWeight: '700', fontSize: scaleWithAppTextScale(11) }}>{style.label}</Text>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  {record.description ? (
                    <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12), marginBottom: 2 }}>{record.description}</Text>
                  ) : null}
                  <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12) }}>Semester: {formatSemester(record.semester)}</Text>
                  <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                    Periode: {formatPeriod(record)}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                    Jurusan: {record.major?.name || '-'}
                  </Text>
                  {mode === 'APPROVAL' ? (
                    <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                      Pengaju: {record.owner?.name || '-'}
                    </Text>
                  ) : (
                    <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                      Progress item: {doneItems}/{items.length}
                    </Text>
                  )}
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginTop: 4 }}>
                    Dibuat: {formatDateTime(record.createdAt)}
                  </Text>
                  {record.feedback ? (
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Catatan: {record.feedback}</Text>
                  ) : null}
                </View>

                {mode === 'OWNER' ? (
                  <Pressable
                    onPress={() => toggleProgramExpanded(record.id)}
                    style={{
                      marginTop: 8,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700' }}>
                      {isExpanded ? 'Sembunyikan Detail Item' : 'Lihat Detail Item'}
                    </Text>
                  </Pressable>
                ) : null}

                {mode === 'OWNER' ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      onPress={() => openEditProgram(record)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#93c5fd',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit Program</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openCreateItem(record.id)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#86efac',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#f0fdf4',
                      }}
                    >
                      <Text style={{ color: '#166534', fontWeight: '700' }}>Tambah Item</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => askDeleteProgram(record)}
                      disabled={deleteProgramMutation.isPending}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#fca5a5',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#fff',
                        opacity: deleteProgramMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                    </Pressable>
                  </View>
                ) : null}

                {mode === 'APPROVAL' && status === 'PENDING' ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      onPress={() => askApproval(record, 'APPROVED')}
                      disabled={approvalMutation.isPending || updatingId === record.id}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: 'center',
                        backgroundColor: BRAND_COLORS.blue,
                        opacity: approvalMutation.isPending && updatingId === record.id ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Setujui</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => askApproval(record, 'REJECTED')}
                      disabled={approvalMutation.isPending || updatingId === record.id}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: '#fca5a5',
                        backgroundColor: '#fff',
                        opacity: approvalMutation.isPending && updatingId === record.id ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Tolak</Text>
                    </Pressable>
                  </View>
                ) : null}

                {mode === 'OWNER' && isExpanded ? (
                  <View
                    style={{
                      marginTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: '#e2e8f0',
                      paddingTop: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Item Program</Text>
                    {items.length > 0 ? (
                      items.map((item) => (
                        <View
                          key={item.id}
                          style={{
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                            <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1 }}>{item.description}</Text>
                            <View
                              style={{
                                borderWidth: 1,
                                borderColor: item.isCompleted ? '#86efac' : '#bfdbfe',
                                backgroundColor: item.isCompleted ? '#dcfce7' : '#eff6ff',
                                borderRadius: 999,
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                              }}
                            >
                              <Text style={{ color: item.isCompleted ? '#166534' : '#1d4ed8', fontWeight: '700', fontSize: scaleWithAppTextScale(11) }}>
                                {item.isCompleted ? 'Selesai' : 'Proses'}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                            Target: {formatDate(item.targetDate)}
                          </Text>
                          {item.note ? (
                            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>Catatan: {item.note}</Text>
                          ) : null}

                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Pressable
                              onPress={() =>
                                toggleItemMutation.mutate({ itemId: item.id, isCompleted: !item.isCompleted })
                              }
                              disabled={toggleItemMutation.isPending}
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: '#93c5fd',
                                borderRadius: 8,
                                paddingVertical: 8,
                                alignItems: 'center',
                                backgroundColor: '#fff',
                              }}
                            >
                              <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                                {item.isCompleted ? 'Buka Kembali' : 'Tandai Selesai'}
                              </Text>
                            </Pressable>

                            <Pressable
                              onPress={() => openEditItem(record.id, item)}
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: '#cbd5e1',
                                borderRadius: 8,
                                paddingVertical: 8,
                                alignItems: 'center',
                                backgroundColor: '#fff',
                              }}
                            >
                              <Text style={{ color: '#334155', fontWeight: '700' }}>Edit Item</Text>
                            </Pressable>

                            <Pressable
                              onPress={() => askDeleteItem(item.id)}
                              disabled={deleteItemMutation.isPending}
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: '#fca5a5',
                                borderRadius: 8,
                                paddingVertical: 8,
                                alignItems: 'center',
                                backgroundColor: '#fff',
                              }}
                            >
                              <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: '#64748b' }}>Belum ada item pada program ini.</Text>
                    )}

                    {showItemEditor ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          borderRadius: 10,
                          padding: 10,
                          backgroundColor: '#f8fbff',
                          marginTop: 8,
                        }}
                      >
                        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>
                          {itemEditor?.itemId ? 'Edit Item Program' : 'Item Program Baru'}
                        </Text>

                        <TextField
                          label="Deskripsi Item"
                          value={itemEditor?.description || ''}
                          onChangeText={(description) =>
                            setItemEditor((prev) => (prev ? { ...prev, description } : prev))
                          }
                          placeholder="Contoh: Koordinasi pelaksanaan kegiatan"
                        />

                        <TextField
                          label="Target Tanggal (YYYY-MM-DD)"
                          value={itemEditor?.targetDate || ''}
                          onChangeText={(targetDate) =>
                            setItemEditor((prev) => (prev ? { ...prev, targetDate } : prev))
                          }
                          placeholder="2026-02-21"
                        />

                        <TextField
                          label="Catatan"
                          value={itemEditor?.note || ''}
                          onChangeText={(note) => setItemEditor((prev) => (prev ? { ...prev, note } : prev))}
                          placeholder="Opsional"
                          multiline
                        />

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => setItemEditor(null)}
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#cbd5e1',
                              borderRadius: 8,
                              paddingVertical: 9,
                              alignItems: 'center',
                              backgroundColor: '#fff',
                            }}
                          >
                            <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => saveItemMutation.mutate()}
                            disabled={saveItemMutation.isPending}
                            style={{
                              flex: 1,
                              borderRadius: 8,
                              paddingVertical: 9,
                              alignItems: 'center',
                              backgroundColor: BRAND_COLORS.blue,
                              opacity: saveItemMutation.isPending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>
                              {saveItemMutation.isPending ? 'Menyimpan...' : 'Simpan Item'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
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
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Belum ada data
            </Text>
            <Text style={{ color: '#64748b' }}>
              Tidak ada program kerja yang sesuai dengan filter saat ini.
            </Text>
          </View>
        )
      ) : null}

      {mode === 'OWNER' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginTop: 2,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Anggaran & LPJ</Text>
          <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 8 }}>
            Bagian ini dimuat terpisah agar halaman Program Kerja utama lebih ringan saat dibuka.
          </Text>
          <Pressable
            onPress={() => setBudgetSectionVisible((prev) => !prev)}
            style={{
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 8,
              paddingVertical: 9,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
              {budgetSectionVisible ? 'Sembunyikan Anggaran & LPJ' : 'Tampilkan Anggaran & LPJ'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {mode === 'OWNER' && budgetSectionVisible ? (
        <WorkProgramBudgetOwnerSection
          activeYearId={activeYearQuery.data?.id}
          activeYearName={activeYearQuery.data?.name}
          dutyOptions={dutyOptions}
          forcedDuty={ownerDutyFilter || null}
        />
      ) : null}

    </ScrollView>
  );
}
