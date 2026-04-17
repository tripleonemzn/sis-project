import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';
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
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { candidateAdmissionApi } from '../../../src/features/candidateAdmission/candidateAdmissionApi';
import type {
  MobileCandidateAdmissionDetail,
  MobileCandidateAdmissionStatus,
} from '../../../src/features/candidateAdmission/types';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type StatusFilter = MobileCandidateAdmissionStatus | 'ALL';
type ReviewMode = 'save' | 'publish' | 'unpublish';
type ManualAssessmentKey = 'LITERACY_COLOR' | 'INTERVIEW' | 'PHYSICAL';

type ReviewFormState = {
  status: MobileCandidateAdmissionStatus;
  reviewNotes: string;
  decisionTitle: string;
  decisionSummary: string;
  decisionNextSteps: string;
};

type ManualAssessmentForm = Record<
  ManualAssessmentKey,
  {
    score: string;
    maxScore: string;
    weight: string;
    passingScore: string;
    notes: string;
    assessedAt: string;
  }
>;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Dikirim' },
  { value: 'UNDER_REVIEW', label: 'Direview' },
  { value: 'NEEDS_REVISION', label: 'Revisi' },
  { value: 'TEST_SCHEDULED', label: 'Tes' },
  { value: 'PASSED_TEST', label: 'Lulus' },
  { value: 'FAILED_TEST', label: 'Belum Lulus' },
  { value: 'ACCEPTED', label: 'Diterima' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const REVIEW_OPTIONS: Array<{ value: MobileCandidateAdmissionStatus; label: string }> = [
  { value: 'UNDER_REVIEW', label: 'Direview' },
  { value: 'NEEDS_REVISION', label: 'Perlu Revisi' },
  { value: 'TEST_SCHEDULED', label: 'Tes Dijadwalkan' },
  { value: 'PASSED_TEST', label: 'Lulus Tes' },
  { value: 'FAILED_TEST', label: 'Belum Lulus Tes' },
  { value: 'ACCEPTED', label: 'Diterima' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const MANUAL_ASSESSMENT_META: Array<{
  code: ManualAssessmentKey;
  title: string;
  description: string;
}> = [
  {
    code: 'LITERACY_COLOR',
    title: 'Tes Buta Huruf & Warna',
    description: 'Nilai observasi dasar untuk membaca sederhana, huruf, dan pemeriksaan warna.',
  },
  {
    code: 'INTERVIEW',
    title: 'Tes Wawancara',
    description: 'Nilai komunikasi, motivasi, dan kesiapan belajar calon siswa.',
  },
  {
    code: 'PHYSICAL',
    title: 'Tes Fisik',
    description: 'Nilai kebugaran atau aspek fisik yang dipakai panitia seleksi.',
  },
];

const DEFAULT_SUMMARY = {
  total: 0,
  draft: 0,
  submitted: 0,
  underReview: 0,
  needsRevision: 0,
  testScheduled: 0,
  passedTest: 0,
  failedTest: 0,
  accepted: 0,
  rejected: 0,
};

function formatDateTime(value?: string | null, withTime = true) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
        }
      : {}),
  });
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function toDateInputValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolvePublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return fileUrl.startsWith('/') ? `${webBaseUrl}${fileUrl}` : `${webBaseUrl}/${fileUrl}`;
}

function createEmptyAssessmentForm(): ManualAssessmentForm {
  return {
    LITERACY_COLOR: {
      score: '',
      maxScore: '100',
      weight: '15',
      passingScore: '70',
      notes: '',
      assessedAt: '',
    },
    INTERVIEW: {
      score: '',
      maxScore: '100',
      weight: '25',
      passingScore: '70',
      notes: '',
      assessedAt: '',
    },
    PHYSICAL: {
      score: '',
      maxScore: '100',
      weight: '20',
      passingScore: '70',
      notes: '',
      assessedAt: '',
    },
  };
}

function getVerificationMeta(status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  if (status === 'VERIFIED') {
    return { label: 'Terverifikasi', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
  }
  if (status === 'REJECTED') {
    return { label: 'Ditolak', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c' };
  }
  return { label: 'Pending', bg: '#fef3c7', border: '#fde68a', text: '#b45309' };
}

function getFinanceSummaryMeta(state?: string | null) {
  if (state === 'CLEAR') return { label: 'Clear', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
  if (state === 'PENDING') return { label: 'Ada Tagihan', bg: '#fef3c7', border: '#fde68a', text: '#b45309' };
  if (state === 'OVERDUE') return { label: 'Terlambat', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c' };
  return { label: 'Belum Terbit', bg: '#e2e8f0', border: '#cbd5e1', text: '#475569' };
}

function getSelectionStatusMeta(status: string, passed?: boolean | null) {
  const normalized = String(status || '').toUpperCase();
  if (passed === true) return { label: 'Lulus', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
  if (passed === false) return { label: 'Belum Lulus', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c' };
  if (normalized === 'COMPLETED') return { label: 'Selesai', bg: '#e0f2fe', border: '#bae6fd', text: '#0369a1' };
  if (normalized === 'TIMEOUT') return { label: 'Waktu Habis', bg: '#ffedd5', border: '#fdba74', text: '#c2410c' };
  if (normalized === 'IN_PROGRESS') return { label: 'Berlangsung', bg: '#fef3c7', border: '#fde68a', text: '#b45309' };
  return { label: 'Belum Mulai', bg: '#e2e8f0', border: '#cbd5e1', text: '#475569' };
}

function getAssessmentMeta(completed: boolean, passed?: boolean | null) {
  if (!completed) return { label: 'Menunggu', bg: '#fef3c7', border: '#fde68a', text: '#b45309' };
  if (passed === false) return { label: 'Perlu Atensi', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c' };
  return { label: 'Tercatat', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
}

function buildReviewForm(detail?: MobileCandidateAdmissionDetail | null): ReviewFormState {
  const nextStatus = REVIEW_OPTIONS.some((option) => option.value === detail?.status)
    ? (detail?.status as MobileCandidateAdmissionStatus)
    : 'UNDER_REVIEW';
  return {
    status: nextStatus,
    reviewNotes: detail?.reviewNotes || '',
    decisionTitle: detail?.decisionTitle || '',
    decisionSummary: detail?.decisionSummary || '',
    decisionNextSteps: detail?.decisionNextSteps || '',
  };
}

function buildAssessmentForm(detail?: MobileCandidateAdmissionDetail | null): ManualAssessmentForm {
  const next = createEmptyAssessmentForm();
  (detail?.assessmentBoard?.items || []).forEach((item) => {
    if (!MANUAL_ASSESSMENT_META.some((meta) => meta.code === item.code)) return;
    const code = item.code as ManualAssessmentKey;
    next[code] = {
      score: item.rawScore != null ? String(item.rawScore) : item.score != null ? String(item.score) : '',
      maxScore: item.maxScore != null ? String(item.maxScore) : next[code].maxScore,
      weight: item.weight != null ? String(item.weight) : next[code].weight,
      passingScore: item.passingScore != null ? String(item.passingScore) : next[code].passingScore,
      notes: item.notes || '',
      assessedAt: toDateInputValue(item.assessedAt),
    };
  });
  return next;
}

function getOfficialStudentPlacementMessage(detail: MobileCandidateAdmissionDetail) {
  if (!detail.officialStudentAccount) return null;

  const currentClassName = detail.officialStudentAccount.currentClass?.name?.trim();
  if (currentClassName) {
    return `Penempatan kelas awal sudah tercatat di ${currentClassName} dan akun siap mengikuti alur siswa aktif.`;
  }

  if (!detail.officialStudentAccount.currentAcademicYear?.id) {
    return 'Belum ada tahun akademik aktif, jadi penempatan kelas awal masih menunggu konfigurasi sekolah.';
  }

  if (!detail.desiredMajor?.id) {
    return 'Jurusan tujuan belum ditentukan, jadi penempatan kelas awal masih perlu diproses manual.';
  }

  return `Penempatan kelas awal belum terbentuk otomatis. Pastikan kelas X jurusan ${detail.desiredMajor.code} - ${detail.desiredMajor.name} tersedia di tahun akademik aktif, lalu tempatkan manual bila perlu.`;
}

function SectionCard({
  title,
  children,
  helper,
}: {
  title: string;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 18,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: scaleWithAppTextScale(16) }}>{title}</Text>
      {helper ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{helper}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        backgroundColor: '#f8fafc',
        padding: 16,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textMuted }}>{message}</Text>
    </View>
  );
}

function Chip({
  label,
  meta,
}: {
  label: string;
  meta: { bg: string; border: string; text: string };
}) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: meta.border,
        backgroundColor: meta.bg,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: meta.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 9,
          color: '#0f172a',
          backgroundColor: '#fff',
          minHeight: multiline ? 96 : undefined,
        }}
      />
    </View>
  );
}

export default function AdminCandidateAdmissionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [majorFilter, setMajorFilter] = useState<number | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(buildReviewForm());
  const [assessmentForm, setAssessmentForm] = useState<ManualAssessmentForm>(createEmptyAssessmentForm());

  const majorsQuery = useQuery({
    queryKey: ['mobile-admin-candidate-admission-majors'],
    enabled: isAuthenticated && user?.role === 'ADMIN',
    queryFn: async () => adminApi.listMajors({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const listQuery = useQuery({
    queryKey: ['mobile-admin-candidate-admissions', page, search, statusFilter, majorFilter],
    enabled: isAuthenticated && user?.role === 'ADMIN',
    queryFn: async () =>
      adminApi.listCandidateAdmissions({
        page,
        limit: 12,
        search: search.trim() || undefined,
        status: statusFilter,
        desiredMajorId: majorFilter,
      }),
  });

  const listPayload = listQuery.data || {
    applications: [],
    total: 0,
    page,
    totalPages: 1,
    summary: DEFAULT_SUMMARY,
  };

  useEffect(() => {
    if (!listPayload.applications.length) {
      setSelectedId(null);
      return;
    }
    const stillExists = listPayload.applications.some((item) => item.id === selectedId);
    if (!stillExists) {
      setSelectedId(listPayload.applications[0].id);
    }
  }, [listPayload.applications, selectedId]);

  const detailQuery = useQuery({
    queryKey: ['mobile-admin-candidate-admission-detail', selectedId],
    enabled: isAuthenticated && user?.role === 'ADMIN' && Boolean(selectedId),
    queryFn: async () => adminApi.getCandidateAdmissionById(selectedId as number),
  });

  const detail = detailQuery.data || null;
  const statusFilterOptions = useMemo(
    () => STATUS_FILTERS.map((item) => ({ value: item.value, label: item.label })),
    [],
  );
  const majorFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Jurusan' },
      ...(majorsQuery.data?.items || []).map((major) => ({
        value: String(major.id),
        label: `${major.code} - ${major.name}`,
      })),
    ],
    [majorsQuery.data?.items],
  );
  const reviewStatusOptions = useMemo(
    () => REVIEW_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    [],
  );

  useEffect(() => {
    setReviewForm(buildReviewForm(detail));
    setAssessmentForm(buildAssessmentForm(detail));
  }, [detail]);

  const reviewMutation = useMutation({
    mutationFn: async (mode: ReviewMode) => {
      if (!selectedId) throw new Error('Pilih calon siswa terlebih dahulu.');
      return adminApi.reviewCandidateAdmission(selectedId, {
        status: reviewForm.status,
        reviewNotes: reviewForm.reviewNotes.trim() || undefined,
        decisionTitle: reviewForm.decisionTitle.trim() || undefined,
        decisionSummary: reviewForm.decisionSummary.trim() || undefined,
        decisionNextSteps: reviewForm.decisionNextSteps.trim() || undefined,
        ...(mode === 'publish' ? { publishDecision: true } : {}),
        ...(mode === 'unpublish' ? { publishDecision: false } : {}),
      });
    },
    onSuccess: async (_data, mode) => {
      notifySuccess(
        mode === 'publish'
          ? 'Hasil seleksi berhasil dipublikasikan.'
          : mode === 'unpublish'
            ? 'Publikasi hasil seleksi berhasil ditarik.'
            : 'Review PPDB berhasil diperbarui.',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-candidate-admissions'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-candidate-admission-detail', selectedId] }),
      ]);
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal memperbarui review PPDB.'),
  });

  const assessmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Pilih calon siswa terlebih dahulu.');
      return adminApi.saveCandidateAdmissionAssessmentBoard(selectedId, {
        items: MANUAL_ASSESSMENT_META.map((meta) => ({
          componentCode: meta.code,
          score: toNullableNumber(assessmentForm[meta.code].score),
          maxScore: toNullableNumber(assessmentForm[meta.code].maxScore),
          weight: toNullableNumber(assessmentForm[meta.code].weight),
          passingScore: toNullableNumber(assessmentForm[meta.code].passingScore),
          notes: assessmentForm[meta.code].notes.trim() || null,
          assessedAt: assessmentForm[meta.code].assessedAt || null,
        })),
      });
    },
    onSuccess: async () => {
      notifySuccess('Board penilaian PPDB berhasil diperbarui.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-candidate-admission-detail', selectedId] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-candidate-admissions'] }),
      ]);
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan board penilaian PPDB.'),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Pilih calon siswa terlebih dahulu.');
      return adminApi.acceptCandidateAdmissionAsStudent(selectedId);
    },
    onSuccess: async (data) => {
      const assignedClassName = data?.officialStudentAccount?.currentClass?.name?.trim();
      notifySuccess(
        assignedClassName
          ? `Calon siswa berhasil diaktifkan dan ditempatkan ke ${assignedClassName}.`
          : 'Calon siswa berhasil diaktifkan menjadi akun siswa resmi.',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-candidate-admissions'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-candidate-admission-detail', selectedId] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
      ]);
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mempromosikan calon siswa.'),
  });

  const handleRefresh = async () => {
    await Promise.all([majorsQuery.refetch(), listQuery.refetch(), detailQuery.refetch()]);
  };

  const selectedSummary = useMemo(() => {
    const financeSummary = detail?.financeSummary;
    const financeMeta = getFinanceSummaryMeta(financeSummary?.state);
    const reviewStatusMeta = candidateAdmissionApi.getStatusMeta(detail?.status || 'DRAFT');
    const verificationMeta = getVerificationMeta(detail?.accountVerificationStatus);
    return { financeSummary, financeMeta, reviewStatusMeta, verificationMeta };
  }, [detail]);

  if (isLoading) return <AppLoadingScreen message="Memuat workspace PPDB admin..." />;
  if (!isAuthenticated || !user) return <Redirect href="/welcome" />;
  if (user.role !== 'ADMIN') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#eef3fb' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={Boolean((listQuery.isFetching || detailQuery.isFetching) && !listQuery.isLoading)}
          onRefresh={() => void handleRefresh()}
        />
      }
    >
      <SectionCard
        title="PPDB Calon Siswa"
        helper="Review formulir calon siswa, cek kelengkapan, isi board penilaian, publikasi hasil, dan aktifkan yang diterima menjadi akun siswa resmi."
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: '#e0ecff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="file-text" size={20} color={BRAND_COLORS.navy} />
          </View>
          <Text style={{ color: BRAND_COLORS.textMuted, flex: 1 }}>
            Batch ini menyamakan modul PPDB admin web ke mobile tanpa perlu keluar dari aplikasi.
          </Text>
        </View>
      </SectionCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 14 }}>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Total Pendaftar"
            value={String(listPayload.summary.total)}
            subtitle={`${listPayload.summary.submitted} sudah dikirim`}
            iconName="users"
            accentColor="#2563eb"
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Perlu Tindakan"
            value={String(listPayload.summary.submitted + listPayload.summary.needsRevision + listPayload.summary.testScheduled)}
            subtitle={`${listPayload.summary.needsRevision} revisi`}
            iconName="alert-circle"
            accentColor="#d97706"
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Direview"
            value={String(listPayload.summary.underReview)}
            subtitle={`${listPayload.summary.draft} masih draft`}
            iconName="search"
            accentColor="#0f766e"
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Lulus / Diterima"
            value={String(listPayload.summary.passedTest + listPayload.summary.accepted)}
            subtitle={`${listPayload.summary.accepted} diterima`}
            iconName="check-circle"
            accentColor="#16a34a"
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Tidak Lulus"
            value={String(listPayload.summary.failedTest + listPayload.summary.rejected)}
            subtitle={`${listPayload.summary.rejected} ditolak`}
            iconName="x-circle"
            accentColor="#dc2626"
          />
        </View>
      </View>

      <SectionCard title="Filter & Daftar Pendaftar">
        <Field
          label="Cari"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Cari nama, NISN, username, atau nomor pendaftaran"
        />

        <MobileSelectField
          label="Status"
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(next) => {
            setStatusFilter((next as StatusFilter) || 'ALL');
            setPage(1);
          }}
          placeholder="Pilih status pendaftaran"
        />

        <MobileSelectField
          label="Jurusan"
          value={String(majorFilter)}
          options={majorFilterOptions}
          onChange={(next) => {
            setMajorFilter(next === 'ALL' ? 'ALL' : Number(next));
            setPage(1);
          }}
          placeholder="Pilih jurusan tujuan"
        />

        {listQuery.isLoading ? (
          <View style={{ paddingVertical: 28 }}>
            <AppLoadingScreen message="Memuat daftar calon siswa..." />
          </View>
        ) : listQuery.isError ? (
          <QueryStateView
            type="error"
            message="Daftar calon siswa gagal dimuat."
            onRetry={() => void listQuery.refetch()}
          />
        ) : listPayload.applications.length === 0 ? (
          <EmptyState message="Belum ada pendaftar yang sesuai dengan filter ini." />
        ) : (
          <View style={{ gap: 10 }}>
            {listPayload.applications.map((item) => {
              const meta = candidateAdmissionApi.getStatusMeta(item.status);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selectedId === item.id ? '#93c5fd' : '#d6e0f2',
                    backgroundColor: selectedId === item.id ? '#eff6ff' : '#fff',
                    padding: 14,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: scaleWithAppTextScale(15) }}>
                        {item.user.name}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                        {item.registrationNumber} • {item.user.nisn || item.user.username}
                      </Text>
                    </View>
                    <Chip label={meta.label} meta={{ bg: meta.backgroundColor, border: meta.borderColor, text: meta.textColor }} />
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12) }}>
                      Jurusan: {item.desiredMajor ? `${item.desiredMajor.code} - ${item.desiredMajor.name}` : '-'}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12) }}>
                      Kelengkapan: {item.completeness.percent}% • {item.documentCount} dokumen
                    </Text>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12) }}>
                      Dikirim: {formatDateTime(item.submittedAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Halaman {listPayload.page} dari {Math.max(1, listPayload.totalPages)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: page <= 1 ? '#f8fafc' : '#fff',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: page <= 1 ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Sebelumnya</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPage((prev) => Math.min(listPayload.totalPages || 1, prev + 1))}
                  disabled={page >= (listPayload.totalPages || 1)}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: page >= (listPayload.totalPages || 1) ? '#f8fafc' : '#fff',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: page >= (listPayload.totalPages || 1) ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Berikutnya</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </SectionCard>

      {!selectedId ? (
        <SectionCard title="Detail Review" helper="Pilih salah satu pendaftar di atas untuk melihat detail dan melakukan review.">
          <EmptyState message="Belum ada calon siswa yang dipilih." />
        </SectionCard>
      ) : detailQuery.isLoading ? (
        <SectionCard title="Detail Review">
          <AppLoadingScreen message="Memuat detail pendaftaran..." />
        </SectionCard>
      ) : detailQuery.isError || !detail ? (
        <SectionCard title="Detail Review">
          <QueryStateView
            type="error"
            message="Detail pendaftaran tidak berhasil dimuat."
            onRetry={() => void detailQuery.refetch()}
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard title={detail.user.name} helper={`${detail.registrationNumber} • ${detail.user.nisn || detail.user.username}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <Chip
                label={selectedSummary.reviewStatusMeta.label}
                meta={{
                  bg: selectedSummary.reviewStatusMeta.backgroundColor,
                  border: selectedSummary.reviewStatusMeta.borderColor,
                  text: selectedSummary.reviewStatusMeta.textColor,
                }}
              />
              <Chip label={selectedSummary.verificationMeta.label} meta={selectedSummary.verificationMeta} />
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>Kontak</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, marginTop: 4 }}>{detail.user.phone || '-'}</Text>
                  <Text style={{ color: BRAND_COLORS.textDark }}>{detail.user.email || '-'}</Text>
                  <Text style={{ color: BRAND_COLORS.textDark }}>{detail.user.address || '-'}</Text>
                </View>
                <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>PPDB</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, marginTop: 4 }}>
                    Asal sekolah: {detail.previousSchool || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textDark }}>
                    Jurusan: {detail.desiredMajor ? `${detail.desiredMajor.code} - ${detail.desiredMajor.name}` : '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textDark }}>
                    Dokumen wajib: {detail.documentChecklist.summary.requiredUploaded}/{detail.documentChecklist.summary.requiredTotal}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selectedSummary.financeMeta.border,
                  backgroundColor: selectedSummary.financeMeta.bg,
                  padding: 12,
                }}
              >
                <Chip label={selectedSummary.financeMeta.label} meta={selectedSummary.financeMeta} />
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleWithAppTextScale(20), fontWeight: '800', marginTop: 8 }}>
                  {formatCurrency(selectedSummary.financeSummary?.outstandingAmount || 0)}
                </Text>
                <Text style={{ color: '#475569', marginTop: 6 }}>
                  {selectedSummary.financeSummary?.state === 'NO_BILLING'
                    ? 'Belum ada tagihan administrasi untuk calon siswa ini.'
                    : selectedSummary.financeSummary?.hasOverdue
                      ? `${selectedSummary.financeSummary.overdueInvoices} tagihan sudah lewat jatuh tempo.`
                      : selectedSummary.financeSummary?.hasOutstanding
                        ? `${selectedSummary.financeSummary.activeInvoices} tagihan masih aktif.`
                        : 'Tagihan administrasi untuk akun ini sudah clear.'}
                </Text>
                <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleWithAppTextScale(12) }}>
                  Jatuh tempo terdekat: {formatDateTime(selectedSummary.financeSummary?.nextDueDate)}
                </Text>
                <Text style={{ color: '#64748b', marginTop: 2, fontSize: scaleWithAppTextScale(12) }}>
                  Pembayaran terakhir: {formatDateTime(selectedSummary.financeSummary?.lastPaymentAt)}
                </Text>
              </View>
            </View>
          </SectionCard>

          <SectionCard title="Kelengkapan Formulir">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: scaleWithAppTextScale(20) }}>
              {detail.completeness.completedCount}/{detail.completeness.totalFields}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {detail.completeness.isReady
                ? 'Formulir inti sudah lengkap.'
                : `Masih kurang: ${detail.completeness.missingFields.join(', ')}.`}
            </Text>
          </SectionCard>

          <SectionCard title="Checklist Dokumen PPDB">
            <View style={{ gap: 10 }}>
              {detail.documentChecklist.required.map((item) => (
                <View
                  key={item.code}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: item.isComplete ? '#bbf7d0' : '#fde68a',
                    backgroundColor: item.isComplete ? '#f0fdf4' : '#fffbeb',
                    padding: 12,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.label}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    {item.isComplete ? `${item.validUploadedCount} file valid terunggah` : 'Belum ada file valid'}
                  </Text>
                  {item.invalidCount > 0 ? (
                    <Text style={{ color: '#b91c1c', marginTop: 4, fontSize: scaleWithAppTextScale(12) }}>
                      {item.invalidCount} file salah format. Gunakan {item.acceptedFormats.join(', ')}.
                    </Text>
                  ) : null}
                </View>
              ))}
              {detail.documentChecklist.summary.uncategorizedCount ? (
                <Text style={{ color: '#b45309', fontSize: scaleWithAppTextScale(12) }}>
                  Ada {detail.documentChecklist.summary.uncategorizedCount} dokumen tanpa kategori PPDB yang tepat.
                </Text>
              ) : null}
            </View>
          </SectionCard>

          {detail.user.documents.length > 0 ? (
            <SectionCard title="Dokumen Terunggah">
              <View style={{ gap: 10 }}>
                {detail.user.documents.map((document) => (
                  <View
                    key={document.id}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      backgroundColor: '#fff',
                      padding: 12,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{document.title}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                      {document.category || 'Dokumen pendukung'} • {formatDateTime(document.createdAt)}
                    </Text>
                    <Pressable
                      onPress={() => {
                        const url = resolvePublicUrl(document.fileUrl);
                        if (!url) return;
                        openWebModuleRoute(router, {
                          moduleKey: `candidate-document-${document.id}`,
                          webPath: url,
                          label: document.title,
                        });
                      }}
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: '#eff6ff',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.blue, fontWeight: '700' }}>Buka Dokumen</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </SectionCard>
          ) : null}

          <SectionCard title="Ringkasan Tes Seleksi">
            <View style={{ gap: 6 }}>
              <Text style={{ color: BRAND_COLORS.textDark }}>Total sesi: {detail.selectionResults?.summary.total || 0}</Text>
              <Text style={{ color: BRAND_COLORS.textDark }}>
                Selesai: {detail.selectionResults?.summary.completed || 0}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark }}>Lulus: {detail.selectionResults?.summary.passed || 0}</Text>
              <Text style={{ color: BRAND_COLORS.textDark }}>
                Belum lulus: {detail.selectionResults?.summary.failed || 0}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark }}>
                Rata-rata skor: {detail.selectionResults?.summary.averageScore ?? '-'}
              </Text>
            </View>
          </SectionCard>

          <SectionCard title="Riwayat Tes Seleksi">
            {detail.selectionResults?.results.length ? (
              <View style={{ gap: 10 }}>
                {detail.selectionResults.results.map((item) => {
                  const meta = getSelectionStatusMeta(item.status, item.passed);
                  return (
                    <View
                      key={item.sessionId}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: '#d6e0f2',
                        backgroundColor: '#fff',
                        padding: 12,
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                            {item.subject?.name || item.programCode || 'Tes Seleksi'} • {formatDateTime(item.scheduleStartTime)}
                          </Text>
                        </View>
                        <Chip label={meta.label} meta={meta} />
                      </View>
                      <Text style={{ color: '#475569' }}>Skor: {item.score ?? '-'} • KKM: {item.kkm ?? '-'}</Text>
                      <Text style={{ color: '#475569' }}>Mulai: {formatDateTime(item.startedAt)}</Text>
                      <Text style={{ color: '#475569' }}>Submit: {formatDateTime(item.submittedAt)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState message="Belum ada hasil tes seleksi untuk calon siswa ini." />
            )}
          </SectionCard>

          <SectionCard title="Board Penilaian PPDB" helper="Komponen CBT/TKD diambil otomatis dari hasil ujian. Komponen manual dapat Anda edit langsung dari mobile.">
            <View style={{ gap: 10 }}>
              {(detail.assessmentBoard?.items || []).map((item) => {
                const meta = getAssessmentMeta(item.completed, item.passed);
                return (
                  <View
                    key={item.code}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      backgroundColor: '#fff',
                      padding: 12,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                          Sumber: {item.sourceType} • Bobot: {item.weight ?? '-'}
                        </Text>
                      </View>
                      <Chip label={meta.label} meta={meta} />
                    </View>
                    <Text style={{ color: '#475569' }}>Skor: {item.score ?? '-'} / 100</Text>
                    <Text style={{ color: '#475569' }}>Ambang lulus: {item.passingScore ?? '-'}</Text>
                    {item.notes ? <Text style={{ color: '#475569' }}>Catatan: {item.notes}</Text> : null}
                  </View>
                );
              })}

              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#d6e0f2',
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  Nilai akhir berbobot: {detail.assessmentBoard?.summary.weightedAverage ?? '-'}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                  Komponen belum lengkap:{' '}
                  {detail.assessmentBoard?.summary.incompleteComponents.length
                    ? detail.assessmentBoard.summary.incompleteComponents.join(', ')
                    : 'Tidak ada'}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                  Komponen di bawah ambang:{' '}
                  {detail.assessmentBoard?.summary.failedComponents.length
                    ? detail.assessmentBoard.summary.failedComponents.join(', ')
                    : 'Tidak ada'}
                </Text>
              </View>

              {MANUAL_ASSESSMENT_META.map((meta) => (
                <View
                  key={meta.code}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#d6e0f2',
                    backgroundColor: '#fff',
                    padding: 12,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{meta.title}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{meta.description}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                    <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                      <Field
                        label="Skor"
                        value={assessmentForm[meta.code].score}
                        onChangeText={(value) =>
                          setAssessmentForm((prev) => ({
                            ...prev,
                            [meta.code]: { ...prev[meta.code], score: value },
                          }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                      <Field
                        label="Maksimum"
                        value={assessmentForm[meta.code].maxScore}
                        onChangeText={(value) =>
                          setAssessmentForm((prev) => ({
                            ...prev,
                            [meta.code]: { ...prev[meta.code], maxScore: value },
                          }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                      <Field
                        label="Bobot"
                        value={assessmentForm[meta.code].weight}
                        onChangeText={(value) =>
                          setAssessmentForm((prev) => ({
                            ...prev,
                            [meta.code]: { ...prev[meta.code], weight: value },
                          }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                      <Field
                        label="Ambang Lulus"
                        value={assessmentForm[meta.code].passingScore}
                        onChangeText={(value) =>
                          setAssessmentForm((prev) => ({
                            ...prev,
                            [meta.code]: { ...prev[meta.code], passingScore: value },
                          }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <Field
                    label="Tanggal Penilaian (YYYY-MM-DD)"
                    value={assessmentForm[meta.code].assessedAt}
                    onChangeText={(value) =>
                      setAssessmentForm((prev) => ({
                        ...prev,
                        [meta.code]: { ...prev[meta.code], assessedAt: value },
                      }))
                    }
                    placeholder="2026-03-31"
                  />
                  <Field
                    label="Catatan"
                    value={assessmentForm[meta.code].notes}
                    onChangeText={(value) =>
                      setAssessmentForm((prev) => ({
                        ...prev,
                        [meta.code]: { ...prev[meta.code], notes: value },
                      }))
                    }
                    multiline
                    placeholder="Catatan panitia atau evaluator"
                  />
                </View>
              ))}

              <Pressable
                onPress={() => assessmentMutation.mutate()}
                disabled={assessmentMutation.isPending}
                style={{
                  backgroundColor: BRAND_COLORS.navy,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: assessmentMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {assessmentMutation.isPending ? 'Menyimpan Nilai...' : 'Simpan Nilai Manual'}
                </Text>
              </Pressable>
            </View>
          </SectionCard>

          <SectionCard title="Pengumuman & Surat Hasil Seleksi">
            {detail.decisionAnnouncement.isPublished ? (
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#bbf7d0',
                  backgroundColor: '#f0fdf4',
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                  {detail.decisionAnnouncement.title || 'Pengumuman Hasil Seleksi'}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  {detail.decisionAnnouncement.summary || '-'}
                </Text>
                {detail.decisionAnnouncement.nextSteps ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                    Langkah berikutnya: {detail.decisionAnnouncement.nextSteps}
                  </Text>
                ) : null}
                <Text style={{ color: '#15803d', marginTop: 6, fontSize: scaleWithAppTextScale(12) }}>
                  Dipublikasikan {formatDateTime(detail.decisionAnnouncement.publishedAt)}
                </Text>
              </View>
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
                Pengumuman hasil seleksi belum dipublikasikan. Anda bisa menyimpan draft dulu lalu publikasi jika sudah final.
              </Text>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {detail.decisionLetter.isDraftAvailable ? (
                <Pressable
                  onPress={() =>
                    openWebModuleRoute(router, {
                      moduleKey: `admin-candidate-decision-draft-${detail.id}`,
                      webPath: `/print/candidate-admission/${detail.id}/decision-letter`,
                      label: 'Draft Surat Hasil Seleksi',
                    })
                  }
                  style={{
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Draft Surat</Text>
                </Pressable>
              ) : null}
              {detail.decisionLetter.officialFileUrl ? (
                <Pressable
                  onPress={() => {
                    const url = resolvePublicUrl(detail.decisionLetter.officialFileUrl);
                    if (!url) return;
                    openWebModuleRoute(router, {
                      moduleKey: `admin-candidate-decision-official-${detail.id}`,
                      webPath: url,
                      label: 'Surat Hasil Seleksi Resmi',
                    });
                  }}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#86efac',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#15803d', fontWeight: '700' }}>Buka Surat Resmi</Text>
                </Pressable>
              ) : null}
            </View>
          </SectionCard>

          <SectionCard title="Form Review Admin">
            <MobileSelectField
              label="Status Review"
              value={reviewForm.status}
              options={reviewStatusOptions}
              onChange={(next) =>
                setReviewForm((prev) => ({ ...prev, status: (next as MobileCandidateAdmissionStatus) || 'UNDER_REVIEW' }))
              }
              placeholder="Pilih status review"
            />

            <Field
              label="Catatan Review"
              value={reviewForm.reviewNotes}
              onChangeText={(value) => setReviewForm((prev) => ({ ...prev, reviewNotes: value }))}
              multiline
              placeholder="Catatan untuk calon siswa atau operator sekolah"
            />
            <Field
              label="Judul Pengumuman"
              value={reviewForm.decisionTitle}
              onChangeText={(value) => setReviewForm((prev) => ({ ...prev, decisionTitle: value }))}
              placeholder="Contoh: Pengumuman Kelulusan PPDB"
            />
            <Field
              label="Ringkasan Pengumuman"
              value={reviewForm.decisionSummary}
              onChangeText={(value) => setReviewForm((prev) => ({ ...prev, decisionSummary: value }))}
              multiline
              placeholder="Ringkasan resmi yang akan tampil di dashboard pendaftaran"
            />
            <Field
              label="Langkah Berikutnya"
              value={reviewForm.decisionNextSteps}
              onChangeText={(value) => setReviewForm((prev) => ({ ...prev, decisionNextSteps: value }))}
              multiline
              placeholder="Contoh: siapkan berkas daftar ulang, cek jadwal administrasi, dll."
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <Pressable
                onPress={() => reviewMutation.mutate('save')}
                disabled={reviewMutation.isPending}
                style={{
                  backgroundColor: BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  opacity: reviewMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {reviewMutation.isPending ? 'Menyimpan...' : 'Simpan Review'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => reviewMutation.mutate('publish')}
                disabled={reviewMutation.isPending || !detail.canPublishDecision}
                style={{
                  backgroundColor: !detail.canPublishDecision ? '#cbd5e1' : '#4338ca',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  opacity: reviewMutation.isPending || !detail.canPublishDecision ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {detail.decisionAnnouncement.isPublished ? 'Publikasikan Ulang' : 'Publikasikan Hasil'}
                </Text>
              </Pressable>
              {detail.decisionAnnouncement.isPublished ? (
                <Pressable
                  onPress={() => reviewMutation.mutate('unpublish')}
                  disabled={reviewMutation.isPending}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    opacity: reviewMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>Tarik Publikasi</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Terima Menjadi Siswa',
                    'Calon siswa ini akan diaktifkan menjadi akun siswa resmi. Lanjutkan?',
                    [
                      { text: 'Batal', style: 'cancel' },
                      {
                        text: 'Lanjutkan',
                        style: 'default',
                        onPress: () => acceptMutation.mutate(),
                      },
                    ],
                  )
                }
                disabled={acceptMutation.isPending || !detail.canPromoteToStudent}
                style={{
                  backgroundColor: !detail.canPromoteToStudent ? '#cbd5e1' : '#059669',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  opacity: acceptMutation.isPending || !detail.canPromoteToStudent ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {acceptMutation.isPending
                    ? 'Memproses...'
                    : detail.officialStudentAccount
                      ? 'Sudah Menjadi Siswa Resmi'
                      : 'Aktifkan Akun Siswa Resmi'}
                </Text>
              </Pressable>
            </View>
          </SectionCard>

          <SectionCard title="Timeline Status">
            <Text style={{ color: BRAND_COLORS.textDark }}>Dikirim: {formatDateTime(detail.submittedAt)}</Text>
            <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
              Direview: {formatDateTime(detail.reviewedAt)}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
              Diterima: {formatDateTime(detail.acceptedAt)}
            </Text>
          </SectionCard>

          {detail.officialStudentAccount ? (
            <SectionCard title="Akun Siswa Resmi">
              <Text style={{ color: BRAND_COLORS.textDark }}>
                Calon siswa ini sudah terintegrasi ke akun siswa resmi dan siap mengikuti alur siswa aktif.
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, marginTop: 10 }}>
                Username: {detail.officialStudentAccount.username || '-'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
                NIS: {detail.officialStudentAccount.nis || '-'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
                NISN: {detail.officialStudentAccount.nisn || '-'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
                Status Siswa: {detail.officialStudentAccount.studentStatus || '-'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
                Tahun Akademik Aktif: {detail.officialStudentAccount.currentAcademicYear?.name || 'Belum ada'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, marginTop: 6 }}>
                Kelas Aktif: {detail.officialStudentAccount.currentClass?.name || 'Belum ditempatkan'}
              </Text>
              <View
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#a7f3d0',
                  backgroundColor: '#ffffffdd',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark }}>
                  {getOfficialStudentPlacementMessage(detail)}
                </Text>
              </View>
            </SectionCard>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
