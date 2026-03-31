import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { useAuth } from '../auth/AuthProvider';
import { BRAND_COLORS } from '../../config/brand';
import { academicYearApi } from '../academicYear/academicYearApi';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../lib/ui/feedback';
import { osisApi } from './osisApi';

type PeriodFormState = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  allowQuickCount: boolean;
};

type CandidateFormState = {
  studentId: string;
  candidateNumber: string;
  vision: string;
  mission: string;
  youtubeUrl: string;
  isActive: boolean;
};

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function hasOsisDuty(duties?: string[]) {
  return Array.isArray(duties) && duties.some((duty) => normalizeDuty(duty) === 'PEMBINA_OSIS');
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

function toInputDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return normalized.toISOString().slice(0, 16);
}

function toIsoPayload(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function createDefaultPeriodForm() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    startAt: toInputDateTime(start.toISOString()),
    endAt: toInputDateTime(end.toISOString()),
    status: 'DRAFT' as const,
    allowQuickCount: true,
  };
}

function createDefaultCandidateForm(candidateNumber = 1): CandidateFormState {
  return {
    studentId: '',
    candidateNumber: String(candidateNumber),
    vision: '',
    mission: '',
    youtubeUrl: '',
    isActive: true,
  };
}

function SummaryCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 14,
        padding: 12,
        flexBasis: '48%',
        flexGrow: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: accent, fontWeight: '800', fontSize: 24, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
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
      <View>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '800', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>{label}</Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      multiline={multiline}
      style={{
        borderWidth: 1,
        borderColor: '#d6e2f7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: multiline ? 12 : 10,
        color: BRAND_COLORS.textDark,
        minHeight: multiline ? 92 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
        backgroundColor: '#fff',
      }}
    />
  );
}

export function TeacherOsisElectionModuleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodFormVisible, setPeriodFormVisible] = useState(false);
  const [periodMode, setPeriodMode] = useState<'create' | 'edit'>('create');
  const [periodForm, setPeriodForm] = useState<PeriodFormState>(createDefaultPeriodForm());
  const [candidateFormVisible, setCandidateFormVisible] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<number | null>(null);
  const [candidateForm, setCandidateForm] = useState<CandidateFormState>(createDefaultCandidateForm());
  const [studentSearch, setStudentSearch] = useState('');

  const activeYearQuery = useQuery({
    queryKey: ['mobile-osis-election-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER' && hasOsisDuty(user?.additionalDuties),
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
    staleTime: 5 * 60 * 1000,
  });

  const periodsQuery = useQuery({
    queryKey: ['mobile-osis-election-periods', activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && Boolean(activeYearQuery.data?.id),
    queryFn: () => osisApi.getPeriods(activeYearQuery.data?.id ? { academicYearId: activeYearQuery.data.id } : undefined),
  });

  const periods = useMemo(() => periodsQuery.data || [], [periodsQuery.data]);
  const effectiveSelectedPeriodId =
    selectedPeriodId && periods.some((item) => item.id === selectedPeriodId)
      ? selectedPeriodId
      : periods[0]?.id || null;
  const selectedPeriod = useMemo(
    () => periods.find((item) => item.id === effectiveSelectedPeriodId) || null,
    [effectiveSelectedPeriodId, periods],
  );

  const quickCountQuery = useQuery({
    queryKey: ['mobile-osis-election-quick-count', selectedPeriod?.id || 'none'],
    enabled: Boolean(selectedPeriod?.id),
    queryFn: () => osisApi.getQuickCount(selectedPeriod!.id),
  });

  const eligibleStudentsQuery = useQuery({
    queryKey: ['mobile-osis-eligible-students', activeYearQuery.data?.id || 'none', studentSearch],
    enabled: isAuthenticated && Boolean(activeYearQuery.data?.id),
    queryFn: () =>
      osisApi.getEligibleStudents({
        academicYearId: activeYearQuery.data!.id,
        search: studentSearch.trim() || undefined,
      }),
  });

  const refetchAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mobile-osis-election-periods'] });
    await queryClient.invalidateQueries({ queryKey: ['mobile-osis-election-quick-count'] });
  };

  const savePeriodMutation = useMutation({
    mutationFn: async () => {
      const academicYearId = activeYearQuery.data?.id;
      if (!academicYearId) throw new Error('Tahun ajaran aktif belum tersedia.');
      const payload = {
        academicYearId,
        title: periodForm.title.trim(),
        description: periodForm.description.trim() || null,
        startAt: toIsoPayload(periodForm.startAt),
        endAt: toIsoPayload(periodForm.endAt),
        status: periodForm.status,
        allowQuickCount: periodForm.allowQuickCount,
      };
      if (!payload.title) throw new Error('Judul periode wajib diisi.');
      if (!payload.startAt || !payload.endAt) throw new Error('Tanggal mulai dan selesai wajib valid.');
      if (periodMode === 'edit' && selectedPeriod?.id) {
        return osisApi.updatePeriod(selectedPeriod.id, payload);
      }
      return osisApi.createPeriod(payload);
    },
    onSuccess: async (saved) => {
      notifySuccess(periodMode === 'edit' ? 'Periode OSIS diperbarui.' : 'Periode OSIS dibuat.');
      setPeriodFormVisible(false);
      if (saved?.id) setSelectedPeriodId(saved.id);
      await refetchAll();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan periode OSIS.'),
  });

  const saveCandidateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error('Pilih periode pemilihan terlebih dahulu.');
      const studentId = Number(candidateForm.studentId);
      const candidateNumber = Number(candidateForm.candidateNumber);
      if (!Number.isFinite(studentId) || studentId <= 0) throw new Error('Pilih siswa kandidat.');
      if (!Number.isFinite(candidateNumber) || candidateNumber <= 0) throw new Error('Nomor kandidat tidak valid.');
      const payload = {
        studentId,
        candidateNumber,
        vision: candidateForm.vision.trim() || null,
        mission: candidateForm.mission.trim() || null,
        youtubeUrl: candidateForm.youtubeUrl.trim() || null,
        isActive: candidateForm.isActive,
      };
      if (editingCandidateId) {
        return osisApi.updateCandidate(editingCandidateId, payload);
      }
      return osisApi.createCandidate(selectedPeriod.id, payload);
    },
    onSuccess: async () => {
      notifySuccess(editingCandidateId ? 'Kandidat diperbarui.' : 'Kandidat ditambahkan.');
      setCandidateFormVisible(false);
      setEditingCandidateId(null);
      setCandidateForm(createDefaultCandidateForm((selectedPeriod?.candidates.length || 0) + 1));
      await refetchAll();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan kandidat OSIS.'),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error('Pilih periode yang ingin difinalisasi.');
      return osisApi.finalizePeriod(selectedPeriod.id);
    },
    onSuccess: async () => {
      notifySuccess('Periode pemilihan berhasil difinalisasi.');
      await refetchAll();
    },
    onError: (error) => notifyApiError(error, 'Gagal memfinalisasi periode pemilihan.'),
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: (candidateId: number) => osisApi.deleteCandidate(candidateId),
    onSuccess: async () => {
      notifySuccess('Kandidat dihapus.');
      await refetchAll();
    },
    onError: (error) => notifyApiError(error, 'Gagal menghapus kandidat.'),
  });

  const stats = useMemo(() => {
    const totalPeriods = periodsQuery.data?.length || 0;
    const activePeriods = (periodsQuery.data || []).filter((period) => period.status === 'PUBLISHED').length;
    const activeCandidates = selectedPeriod?.candidates.filter((candidate) => candidate.isActive).length || 0;
    const totalVotes = quickCountQuery.data?.totalVotes || selectedPeriod?._count?.votes || 0;
    return { totalPeriods, activePeriods, activeCandidates, totalVotes };
  }, [periodsQuery.data, quickCountQuery.data, selectedPeriod]);

  const selectedStudent = useMemo(
    () => eligibleStudentsQuery.data?.find((student) => student.id === Number(candidateForm.studentId)) || null,
    [candidateForm.studentId, eligibleStudentsQuery.data],
  );

  const openCreatePeriod = () => {
    setPeriodMode('create');
    setPeriodForm(createDefaultPeriodForm());
    setPeriodFormVisible(true);
  };

  const openEditPeriod = () => {
    if (!selectedPeriod) return;
    setPeriodMode('edit');
    setPeriodForm({
      title: selectedPeriod.title,
      description: selectedPeriod.description || '',
      startAt: toInputDateTime(selectedPeriod.startAt),
      endAt: toInputDateTime(selectedPeriod.endAt),
      status: selectedPeriod.status,
      allowQuickCount: Boolean(selectedPeriod.allowQuickCount),
    });
    setPeriodFormVisible(true);
  };

  const openCreateCandidate = () => {
    setEditingCandidateId(null);
    setCandidateForm(createDefaultCandidateForm((selectedPeriod?.candidates.length || 0) + 1));
    setCandidateFormVisible(true);
  };

  const openEditCandidate = (candidate: NonNullable<typeof selectedPeriod>['candidates'][number]) => {
    setEditingCandidateId(candidate.id);
    setCandidateForm({
      studentId: String(candidate.studentId),
      candidateNumber: String(candidate.candidateNumber),
      vision: candidate.vision || '',
      mission: candidate.mission || '',
      youtubeUrl: candidate.youtubeUrl || '',
      isActive: candidate.isActive,
    });
    setCandidateFormVisible(true);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat pemilihan OSIS..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER' || !hasOsisDuty(user?.additionalDuties)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>
          Pemilihan OSIS
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus pembina OSIS." />
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
            activeYearQuery.isFetching
            || periodsQuery.isFetching
            || quickCountQuery.isFetching
            || eligibleStudentsQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void periodsQuery.refetch();
            void quickCountQuery.refetch();
            void eligibleStudentsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Pemilihan OSIS
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola periode pemilihan, kandidat, quick count, dan finalisasi hasil dari mobile.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={() => router.push('/teacher/osis/management' as never)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1f5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Struktur & Nilai</Text>
        </Pressable>
        <View style={{ backgroundColor: '#e9f1ff', borderWidth: 1, borderColor: BRAND_COLORS.blue, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800', fontSize: 12 }}>Pemilihan OSIS</Text>
        </View>
        <Pressable
          onPress={() => router.push('/teacher/osis/vote' as never)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1f5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Pemungutan Suara</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/teacher/osis/inventory' as never)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1f5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Inventaris OSIS</Text>
        </Pressable>
      </View>

      <SectionCard title="Ringkasan Pemilihan" subtitle={activeYearQuery.data?.name || 'Tahun ajaran aktif belum ditemukan'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <SummaryCard title="Total Periode" value={String(stats.totalPeriods)} subtitle="Semua periode pemilihan" accent="#2563eb" />
          <SummaryCard title="Periode Aktif" value={String(stats.activePeriods)} subtitle="Status published" accent="#059669" />
          <SummaryCard title="Calon Aktif" value={String(stats.activeCandidates)} subtitle="Pada periode terpilih" accent="#7c3aed" />
          <SummaryCard title="Suara Masuk" value={String(stats.totalVotes)} subtitle="Quick count periode terpilih" accent="#d97706" />
        </View>
      </SectionCard>

      <SectionCard title="Periode Pemilihan" subtitle="Pilih periode untuk melihat kandidat dan quick count, atau buat periode baru.">
        {periodsQuery.isLoading ? <QueryStateView type="loading" message="Memuat periode pemilihan..." /> : null}
        {periodsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat periode pemilihan." onRetry={() => periodsQuery.refetch()} />
        ) : null}
        {!periodsQuery.isLoading && !periodsQuery.isError ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {periods.map((period) => (
                <FilterChip
                  key={period.id}
                  label={period.title}
                  active={selectedPeriod?.id === period.id}
                  onPress={() => setSelectedPeriodId(period.id)}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={openCreatePeriod}
                style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Buat Periode</Text>
              </Pressable>
              <Pressable
                disabled={!selectedPeriod}
                onPress={openEditPeriod}
                style={{ flex: 1, backgroundColor: selectedPeriod ? '#fff' : '#e2e8f0', borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: selectedPeriod ? BRAND_COLORS.navy : '#94a3b8', fontWeight: '800' }}>Edit Periode</Text>
              </Pressable>
            </View>

            {selectedPeriod ? (
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, gap: 6 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{selectedPeriod.title}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>{formatDateTime(selectedPeriod.startAt)} - {formatDateTime(selectedPeriod.endAt)}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Status: {selectedPeriod.status} • Quick count: {selectedPeriod.allowQuickCount ? 'Aktif' : 'Nonaktif'}
                </Text>
                {selectedPeriod.description ? <Text style={{ color: BRAND_COLORS.textMuted }}>{selectedPeriod.description}</Text> : null}
                <Pressable
                  disabled={selectedPeriod.status === 'CLOSED' || finalizeMutation.isPending}
                  onPress={() =>
                    Alert.alert(
                      'Finalisasi Periode',
                      'Setelah difinalisasi, hasil pemilihan akan ditutup. Lanjutkan?',
                      [
                        { text: 'Batal', style: 'cancel' },
                        { text: 'Finalisasi', style: 'destructive', onPress: () => finalizeMutation.mutate() },
                      ],
                    )
                  }
                  style={{
                    marginTop: 8,
                    backgroundColor: selectedPeriod.status === 'CLOSED' ? '#cbd5e1' : '#f59e0b',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    {selectedPeriod.status === 'CLOSED' ? 'Periode Sudah Ditutup' : 'Finalisasi Periode'}
                  </Text>
                </Pressable>
              </View>
            ) : periods.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada periode pemilihan OSIS.</Text>
            ) : null}

            {periodFormVisible ? (
              <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                  {periodMode === 'edit' ? 'Edit Periode Pemilihan' : 'Periode Pemilihan Baru'}
                </Text>
                <Field label="Judul Periode">
                  <Input value={periodForm.title} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, title: value }))} placeholder="Contoh: Pemilihan Ketua OSIS 2025/2026" />
                </Field>
                <Field label="Deskripsi">
                  <Input value={periodForm.description} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, description: value }))} placeholder="Catatan singkat periode pemilihan" multiline />
                </Field>
                <Field label="Mulai">
                  <Input value={periodForm.startAt} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, startAt: value }))} placeholder="YYYY-MM-DDTHH:MM" />
                </Field>
                <Field label="Selesai">
                  <Input value={periodForm.endAt} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, endAt: value }))} placeholder="YYYY-MM-DDTHH:MM" />
                </Field>
                <Field label="Status">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(['DRAFT', 'PUBLISHED', 'CLOSED'] as const).map((status) => (
                      <FilterChip
                        key={status}
                        label={status}
                        active={periodForm.status === status}
                        onPress={() => setPeriodForm((prev) => ({ ...prev, status }))}
                      />
                    ))}
                  </View>
                </Field>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Aktifkan Quick Count</Text>
                  <Switch
                    value={periodForm.allowQuickCount}
                    onValueChange={(value) => setPeriodForm((prev) => ({ ...prev, allowQuickCount: value }))}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => setPeriodFormVisible(false)}
                    style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
                  </Pressable>
                  <Pressable
                    disabled={savePeriodMutation.isPending}
                    onPress={() => savePeriodMutation.mutate()}
                    style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>
                      {savePeriodMutation.isPending ? 'Menyimpan...' : 'Simpan Periode'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Kandidat" subtitle="Tambah calon, atur nomor urut, dan pantau quick count periode terpilih.">
        {!selectedPeriod ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Pilih periode pemilihan terlebih dahulu.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={openCreateCandidate}
                style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Tambah Kandidat</Text>
              </Pressable>
              <Pressable
                onPress={() => quickCountQuery.refetch()}
                style={{ flex: 1, borderWidth: 1, borderColor: '#c7d6f5', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>Segarkan Quick Count</Text>
              </Pressable>
            </View>

            {candidateFormVisible ? (
              <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                  {editingCandidateId ? 'Edit Kandidat' : 'Kandidat Baru'}
                </Text>
                <Field label="Cari Siswa">
                  <Input value={studentSearch} onChangeText={setStudentSearch} placeholder="Cari nama, NIS, atau NISN siswa" />
                </Field>
                <Field label="Pilih Siswa">
                  <View style={{ gap: 8 }}>
                    {selectedStudent ? (
                      <View style={{ backgroundColor: '#e9f1ff', borderRadius: 10, padding: 10 }}>
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>{selectedStudent.name}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                          {selectedStudent.studentClass?.name || '-'} • {selectedStudent.nis || selectedStudent.nisn || '-'}
                        </Text>
                      </View>
                    ) : null}
                    {(eligibleStudentsQuery.data || []).slice(0, 12).map((student) => {
                      const active = Number(candidateForm.studentId) === student.id;
                      return (
                        <Pressable
                          key={student.id}
                          onPress={() => setCandidateForm((prev) => ({ ...prev, studentId: String(student.id) }))}
                          style={{
                            borderWidth: 1,
                            borderColor: active ? BRAND_COLORS.blue : '#d6e2f7',
                            backgroundColor: active ? '#e9f1ff' : '#fff',
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                            {student.name}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                            {student.studentClass?.name || '-'} • {student.nis || student.nisn || '-'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
                <Field label="Nomor Urut">
                  <Input value={candidateForm.candidateNumber} onChangeText={(value) => setCandidateForm((prev) => ({ ...prev, candidateNumber: value }))} placeholder="Contoh: 1" />
                </Field>
                <Field label="Visi">
                  <Input value={candidateForm.vision} onChangeText={(value) => setCandidateForm((prev) => ({ ...prev, vision: value }))} placeholder="Visi kandidat" multiline />
                </Field>
                <Field label="Misi">
                  <Input value={candidateForm.mission} onChangeText={(value) => setCandidateForm((prev) => ({ ...prev, mission: value }))} placeholder="Misi kandidat" multiline />
                </Field>
                <Field label="Tautan Video Orasi">
                  <Input value={candidateForm.youtubeUrl} onChangeText={(value) => setCandidateForm((prev) => ({ ...prev, youtubeUrl: value }))} placeholder="https://youtu.be/..." />
                </Field>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Kandidat Aktif</Text>
                  <Switch value={candidateForm.isActive} onValueChange={(value) => setCandidateForm((prev) => ({ ...prev, isActive: value }))} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      setCandidateFormVisible(false);
                      setEditingCandidateId(null);
                    }}
                    style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
                  </Pressable>
                  <Pressable
                    disabled={saveCandidateMutation.isPending}
                    onPress={() => saveCandidateMutation.mutate()}
                    style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>
                      {saveCandidateMutation.isPending ? 'Menyimpan...' : 'Simpan Kandidat'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {(selectedPeriod.candidates || [])
              .slice()
              .sort((a, b) => a.candidateNumber - b.candidateNumber)
              .map((candidate) => {
                const quickCountRow = quickCountQuery.data?.candidates.find((row) => row.id === candidate.id) || null;
                return (
                  <View key={candidate.id} style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 14, padding: 12, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.blue, fontWeight: '800', fontSize: 12 }}>KANDIDAT NO. {candidate.candidateNumber}</Text>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 17, marginTop: 2 }}>
                          {candidate.student.name}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                          {candidate.student.studentClass?.name || '-'} • {candidate.student.nis || '-'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: candidate.isActive ? '#dcfce7' : '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: candidate.isActive ? '#166534' : '#475569', fontWeight: '800', fontSize: 11 }}>
                          {candidate.isActive ? 'AKTIF' : 'NONAKTIF'}
                        </Text>
                      </View>
                    </View>
                    {candidate.vision ? <Text style={{ color: BRAND_COLORS.textMuted }}>Visi: {candidate.vision}</Text> : null}
                    {candidate.mission ? <Text style={{ color: BRAND_COLORS.textMuted }}>Misi: {candidate.mission}</Text> : null}
                    {quickCountRow ? (
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        Quick count: {quickCountRow.votes} suara • {quickCountRow.percentage}% • peringkat #{quickCountRow.rank}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => openEditCandidate(candidate)}
                        style={{ flex: 1, borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                      >
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>Edit</Text>
                      </Pressable>
                      <Pressable
                        disabled={deleteCandidateMutation.isPending}
                        onPress={() =>
                          Alert.alert(
                            'Hapus Kandidat',
                            `Hapus kandidat ${candidate.student.name}?`,
                            [
                              { text: 'Batal', style: 'cancel' },
                              { text: 'Hapus', style: 'destructive', onPress: () => deleteCandidateMutation.mutate(candidate.id) },
                            ],
                          )
                        }
                        style={{ flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                      >
                        <Text style={{ color: '#be123c', fontWeight: '800' }}>Hapus</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

            {!selectedPeriod.candidates.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada kandidat pada periode ini.</Text>
            ) : null}

            {quickCountQuery.data ? (
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, gap: 6 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>Quick Count Saat Ini</Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Turnout {quickCountQuery.data.turnoutPercentage}% • total suara {quickCountQuery.data.totalVotes} • belum voting {quickCountQuery.data.remainingVoters}
                </Text>
                {quickCountQuery.data.winner ? (
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    Pimpinan saat ini: No. {quickCountQuery.data.winner.candidateNumber} • {quickCountQuery.data.winner.studentName}
                  </Text>
                ) : quickCountQuery.data.hasTie ? (
                  <Text style={{ color: '#b45309', fontWeight: '700' }}>
                    Suara teratas masih imbang.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </SectionCard>
    </ScrollView>
  );
}
