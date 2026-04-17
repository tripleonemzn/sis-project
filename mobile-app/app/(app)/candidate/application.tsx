import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { authService } from '../../../src/features/auth/authService';
import { candidateAdmissionApi } from '../../../src/features/candidateAdmission/candidateAdmissionApi';
import type { MobileCandidateAdmissionDetail } from '../../../src/features/candidateAdmission/types';
import { MOBILE_PROFILE_QUERY_KEY } from '../../../src/features/profile/useProfileQuery';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type CandidateFormState = {
  name: string;
  phone: string;
  email: string;
  gender: '' | 'MALE' | 'FEMALE';
  birthPlace: string;
  birthDate: string;
  address: string;
  religion: string;
  previousSchool: string;
  lastEducation: string;
  desiredMajorId: string;
  fatherName: string;
  motherName: string;
  guardianName: string;
  guardianPhone: string;
  parentName: string;
  parentPhone: string;
  domicileCity: string;
  motivation: string;
  submissionNotes: string;
};

type CandidateSummaryId =
  | 'status'
  | 'completeness'
  | 'documents'
  | 'selection'
  | 'finance'
  | 'assessment';

const emptyForm: CandidateFormState = {
  name: '',
  phone: '',
  email: '',
  gender: '',
  birthPlace: '',
  birthDate: '',
  address: '',
  religion: '',
  previousSchool: '',
  lastEducation: '',
  desiredMajorId: '',
  fatherName: '',
  motherName: '',
  guardianName: '',
  guardianPhone: '',
  parentName: '',
  parentPhone: '',
  domicileCity: '',
  motivation: '',
  submissionNotes: '',
};

function buildForm(admission: MobileCandidateAdmissionDetail | undefined): CandidateFormState {
  if (!admission) return emptyForm;
  return {
    name: admission.user.name || '',
    phone: admission.user.phone || '',
    email: admission.user.email || '',
    gender: admission.user.gender || '',
    birthPlace: admission.user.birthPlace || '',
    birthDate: admission.user.birthDate ? String(admission.user.birthDate).slice(0, 10) : '',
    address: admission.user.address || '',
    religion: admission.user.religion || '',
    previousSchool: admission.previousSchool || '',
    lastEducation: admission.lastEducation || '',
    desiredMajorId: admission.desiredMajorId ? String(admission.desiredMajorId) : '',
    fatherName: admission.user.fatherName || '',
    motherName: admission.user.motherName || '',
    guardianName: admission.user.guardianName || '',
    guardianPhone: admission.user.guardianPhone || '',
    parentName: admission.parentName || admission.resolvedParentName || '',
    parentPhone: admission.parentPhone || admission.resolvedParentPhone || '',
    domicileCity: admission.domicileCity || '',
    motivation: admission.motivation || '',
    submissionNotes: admission.submissionNotes || '',
  };
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  return (
    <View
      style={{
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          color: BRAND_COLORS.textDark,
          fontSize: scaleFont(15),
          lineHeight: scaleLineHeight(22),
          fontWeight: '700',
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function StatusChip({ status }: { status: MobileCandidateAdmissionDetail['status'] }) {
  const { scaleFont } = useAppTextScale();
  const meta = candidateAdmissionApi.getStatusMeta(status);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: meta.borderColor,
        backgroundColor: meta.backgroundColor,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: meta.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>{meta.label}</Text>
    </View>
  );
}

function VerificationChip({ status }: { status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null }) {
  const { scaleFont } = useAppTextScale();
  const normalized = String(status || 'PENDING').toUpperCase();
  const config =
    normalized === 'VERIFIED'
      ? { borderColor: '#bbf7d0', backgroundColor: '#dcfce7', textColor: '#15803d' }
      : normalized === 'REJECTED'
        ? { borderColor: '#fecdd3', backgroundColor: '#ffe4e6', textColor: '#be123c' }
        : { borderColor: '#fde68a', backgroundColor: '#fef3c7', textColor: '#b45309' };
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: config.borderColor,
        backgroundColor: config.backgroundColor,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: config.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>{normalized}</Text>
    </View>
  );
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

function resolvePublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return fileUrl.startsWith('/') ? `${webBaseUrl}${fileUrl}` : `${webBaseUrl}/${fileUrl}`;
}

function getSelectionStatusMeta(status: string, passed?: boolean | null) {
  const normalized = String(status || '').toUpperCase();
  if (passed === true) {
    return { label: 'Lulus', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
  }
  if (passed === false) {
    return { label: 'Belum Lulus', backgroundColor: '#ffe4e6', textColor: '#be123c', borderColor: '#fecdd3' };
  }
  switch (normalized) {
    case 'COMPLETED':
      return { label: 'Selesai', backgroundColor: '#e0f2fe', textColor: '#0369a1', borderColor: '#bae6fd' };
    case 'TIMEOUT':
      return { label: 'Waktu Habis', backgroundColor: '#ffedd5', textColor: '#c2410c', borderColor: '#fdba74' };
    case 'IN_PROGRESS':
      return { label: 'Berlangsung', backgroundColor: '#fef3c7', textColor: '#b45309', borderColor: '#fde68a' };
    default:
      return { label: normalized || 'Tes', backgroundColor: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1' };
  }
}

function getAssessmentStateMeta(completed: boolean, passed?: boolean | null) {
  if (!completed) {
    return { label: 'Menunggu', backgroundColor: '#fef3c7', textColor: '#b45309', borderColor: '#fde68a' };
  }
  if (passed === false) {
    return { label: 'Perlu perhatian', backgroundColor: '#ffe4e6', textColor: '#be123c', borderColor: '#fecdd3' };
  }
  return { label: 'Selesai', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
}

function formatCandidateCurrency(value?: number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getFinanceSummaryMeta(state?: string | null) {
  if (state === 'CLEAR') {
    return { label: 'Clear', backgroundColor: '#dcfce7', textColor: '#15803d', borderColor: '#bbf7d0' };
  }
  if (state === 'PENDING') {
    return { label: 'Ada Tagihan', backgroundColor: '#fef3c7', textColor: '#b45309', borderColor: '#fde68a' };
  }
  if (state === 'OVERDUE') {
    return { label: 'Terlambat', backgroundColor: '#ffe4e6', textColor: '#be123c', borderColor: '#fecdd3' };
  }
  return { label: 'Belum Terbit', backgroundColor: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1' };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
}) {
  const { scaleFont, fontSizes } = useAppTextScale();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: scaleFont(12), color: '#64748b', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 9,
          fontSize: fontSizes.body,
          color: '#0f172a',
          backgroundColor: editable ? '#fff' : '#f8fafc',
          minHeight: multiline ? 96 : undefined,
        }}
      />
    </View>
  );
}

function SummaryTabCard({
  iconName,
  title,
  value,
  subtitle,
  accentColor,
  onPress,
}: {
  iconName: React.ComponentProps<typeof Feather>['name'];
  title: string;
  value: string;
  subtitle: string;
  accentColor: string;
  onPress: () => void;
}) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 16,
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        paddingVertical: 11,
        minHeight: 112,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 12,
          backgroundColor: `${accentColor}18`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <Feather name={iconName} size={16} color={accentColor} />
      </View>
      <Text style={{ color: '#64748b', fontSize: scaleFont(11), fontWeight: '700' }} numberOfLines={2}>
        {title}
      </Text>
      <Text style={{ color: '#0f172a', fontSize: scaleFont(16), fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
        {value}
      </Text>
      <Text
        style={{ color: '#475569', fontSize: scaleFont(11), lineHeight: scaleLineHeight(14), marginTop: 4 }}
        numberOfLines={2}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}

function formatCandidateCompactValue(value?: number | null) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  if (Math.abs(amount) >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')} Jt`;
  if (Math.abs(amount) >= 1_000) return `Rp ${(amount / 1_000).toFixed(1).replace(/\.0$/, '')} Rb`;
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

export default function CandidateApplicationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isLoading, isAuthenticated, user } = useAuth();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets);
  const [activeSummaryId, setActiveSummaryId] = useState<CandidateSummaryId | null>(null);
  const [formDraft, setFormDraft] = useState<CandidateFormState | null>(null);

  const admissionQuery = useQuery({
    queryKey: ['mobile-candidate-admission'],
    enabled: isAuthenticated && user?.role === 'CALON_SISWA',
    queryFn: async () => candidateAdmissionApi.getMyAdmission(),
    staleTime: 60_000,
  });
  const majorsQuery = useQuery({
    queryKey: ['mobile-candidate-admission-majors'],
    enabled: isAuthenticated && user?.role === 'CALON_SISWA',
    queryFn: async () => candidateAdmissionApi.listMajors(),
    staleTime: 5 * 60 * 1000,
  });

  const baselineForm = useMemo(() => buildForm(admissionQuery.data), [admissionQuery.data]);
  const form = formDraft ?? baselineForm;
  const setForm = (updater: (prev: CandidateFormState) => CandidateFormState) => {
    setFormDraft((prev) => updater(prev ?? baselineForm));
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      candidateAdmissionApi.saveMyAdmission({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        gender: form.gender || undefined,
        birthPlace: form.birthPlace.trim() || undefined,
        birthDate: form.birthDate || undefined,
        address: form.address.trim() || undefined,
        religion: form.religion.trim() || undefined,
        fatherName: form.fatherName.trim() || undefined,
        motherName: form.motherName.trim() || undefined,
        guardianName: form.guardianName.trim() || undefined,
        guardianPhone: form.guardianPhone.trim() || undefined,
        previousSchool: form.previousSchool.trim() || undefined,
        lastEducation: form.lastEducation.trim() || undefined,
        desiredMajorId: form.desiredMajorId ? Number(form.desiredMajorId) : undefined,
        parentName: form.parentName.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
        domicileCity: form.domicileCity.trim() || undefined,
        motivation: form.motivation.trim() || undefined,
        submissionNotes: form.submissionNotes.trim() || undefined,
      }),
    onSuccess: async () => {
      setFormDraft(null);
      notifySuccess('Data pendaftaran berhasil disimpan.');
      try {
        await authService.me({ force: true });
      } catch {
        // Ignore cache refresh failures.
      }
      void queryClient.invalidateQueries({ queryKey: ['mobile-candidate-admission'] });
      void queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan data pendaftaran.'),
  });

  const submitMutation = useMutation({
    mutationFn: async () => candidateAdmissionApi.submitMyAdmission(),
    onSuccess: async () => {
      notifySuccess('Pendaftaran berhasil dikirim untuk direview admin.');
      void queryClient.invalidateQueries({ queryKey: ['mobile-candidate-admission'] });
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mengirim pendaftaran.'),
  });

  const handleSubmit = async () => {
    try {
      await saveMutation.mutateAsync();
      await submitMutation.mutateAsync();
    } catch {
      // Error already handled by mutation callbacks.
    }
  };

  const admission = admissionQuery.data ?? null;
  const financeSummary = admission?.financeSummary ?? null;
  const financeMeta = getFinanceSummaryMeta(financeSummary?.state);
  const requiredDocuments = admission?.documentChecklist.required || [];
  const optionalDocuments = admission?.documentChecklist.optional || [];
  const missingDocuments = requiredDocuments.filter((item) => !item.isComplete);
  const invalidDocuments = admission?.documentChecklist.invalidDocuments || [];
  const selectionSummary = admission?.selectionResults?.summary || null;
  const selectionResults = admission?.selectionResults?.results || [];
  const assessmentBoard = admission?.assessmentBoard || null;
  const decisionLetter = admission?.decisionLetter || null;
  const genderOptions = useMemo(
    () => [
      { label: 'Laki-laki', value: 'MALE' },
      { label: 'Perempuan', value: 'FEMALE' },
    ],
    [],
  );
  const majorOptions = useMemo(
    () => (majorsQuery.data || []).map((major) => ({ value: String(major.id), label: `${major.code} - ${major.name}` })),
    [majorsQuery.data],
  );
  const summaryCards = useMemo<
    Array<{
      id: CandidateSummaryId;
      iconName: React.ComponentProps<typeof Feather>['name'];
      title: string;
      value: string;
      subtitle: string;
      accentColor: string;
    }>
  >(
    () =>
      admission
        ? [
            {
              id: 'status' as const,
              iconName: 'clipboard',
              title: 'Status PPDB',
              value: candidateAdmissionApi.getStatusMeta(admission.status).label,
              subtitle: admission.registrationNumber,
              accentColor: '#2563eb',
            },
            {
              id: 'completeness' as const,
              iconName: 'pie-chart',
              title: 'Kelengkapan',
              value: `${admission.completeness.percent}%`,
              subtitle: admission.completeness.isReady ? 'Siap dikirim' : 'Masih perlu dilengkapi',
              accentColor: '#0f766e',
            },
            {
              id: 'documents' as const,
              iconName: 'file-text',
              title: 'Dokumen',
              value: `${admission.documentChecklist.summary.requiredUploaded}/${admission.documentChecklist.summary.requiredTotal}`,
              subtitle:
                missingDocuments.length === 0 && invalidDocuments.length === 0
                  ? 'Dokumen inti lengkap'
                  : `${missingDocuments.length} kurang • ${invalidDocuments.length} perlu revisi`,
              accentColor: '#c2410c',
            },
            {
              id: 'selection' as const,
              iconName: 'edit-3',
              title: 'Tes Seleksi',
              value: selectionSummary?.averageScore != null ? String(selectionSummary.averageScore) : '-',
              subtitle: selectionSummary?.total ? `${selectionSummary.completed} sesi selesai` : 'Belum ada hasil',
              accentColor: '#7c3aed',
            },
            {
              id: 'finance' as const,
              iconName: 'credit-card',
              title: 'Administrasi',
              value: formatCandidateCompactValue(financeSummary?.outstandingAmount || 0),
              subtitle: financeMeta.label,
              accentColor: '#0ea5e9',
            },
            {
              id: 'assessment' as const,
              iconName: 'bar-chart-2',
              title: 'Penilaian',
              value: assessmentBoard?.summary.recommendation || 'INCOMPLETE',
              subtitle:
                assessmentBoard?.summary.totalComponents
                  ? `${assessmentBoard.summary.completedComponents}/${assessmentBoard.summary.totalComponents} komponen`
                  : 'Board belum lengkap',
              accentColor: '#ec4899',
            },
          ]
        : [],
    [admission, assessmentBoard, financeMeta.label, financeSummary?.outstandingAmount, invalidDocuments.length, missingDocuments.length, selectionSummary],
  );

  if (isLoading) return <AppLoadingScreen message="Memuat status pendaftaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'CALON_SISWA') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...pageContentPadding, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: scaleFont(20), fontWeight: '700' }}>
          Formulir PPDB
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Lengkapi data inti PPDB, simpan draft, lalu kirim pendaftaran untuk direview admin sekolah.
      </Text>

      {admissionQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat formulir PPDB..." />
      ) : admissionQuery.isError || !admission ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data pendaftaran calon siswa."
          onRetry={() => void admissionQuery.refetch()}
        />
      ) : (
        <>
          {admission.decisionAnnouncement.isPublished ? (
            <InfoCard title="Pengumuman Hasil Seleksi">
              <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(18), fontWeight: '700' }}>
                {admission.decisionAnnouncement.title || 'Hasil Seleksi PPDB'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: scaleLineHeight(20) }}>
                {admission.decisionAnnouncement.summary ||
                  'Hasil resmi seleksi sudah dipublikasikan oleh admin sekolah.'}
              </Text>
              {admission.decisionAnnouncement.nextSteps ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: scaleLineHeight(20) }}>
                  Langkah berikutnya: {admission.decisionAnnouncement.nextSteps}
                </Text>
              ) : null}
              <Text style={{ color: '#475569', marginTop: 10, fontSize: scaleFont(12) }}>
                Dipublikasikan {formatDateTime(admission.decisionAnnouncement.publishedAt)}
              </Text>
            </InfoCard>
          ) : null}
          <InfoCard title="Ringkasan PPDB">
            <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
              Ringkasan ini mengikuti data utama yang tampil di web. Ketuk tiap tab untuk melihat detailnya.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
              {summaryCards.map((item) => (
                <View key={item.id} style={{ width: '33.3333%', paddingHorizontal: 5, marginBottom: 10 }}>
                  <SummaryTabCard
                    iconName={item.iconName}
                    title={item.title}
                    value={item.value}
                    subtitle={item.subtitle}
                    accentColor={item.accentColor}
                    onPress={() => setActiveSummaryId(item.id)}
                  />
                </View>
              ))}
            </View>
          </InfoCard>

          <InfoCard title="Data Utama">
            <Field label="Nama Lengkap" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Field label="NISN" value={admission.user.nisn || admission.user.username} editable={false} />
            <Field label="Nomor HP" value={form.phone} onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
            <Field label="Email" value={form.email} onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))} />
            <MobileSelectField
              label="Jenis Kelamin"
              value={form.gender}
              options={genderOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, gender: value as CandidateFormState['gender'] }))}
              placeholder="Pilih jenis kelamin"
            />
            <Field
              label="Tempat Lahir"
              value={form.birthPlace}
              onChangeText={(value) => setForm((prev) => ({ ...prev, birthPlace: value }))}
            />
            <Field
              label="Tanggal Lahir (YYYY-MM-DD)"
              value={form.birthDate}
              onChangeText={(value) => setForm((prev) => ({ ...prev, birthDate: value }))}
              placeholder="2009-07-18"
            />
            <Field
              label="Agama"
              value={form.religion}
              onChangeText={(value) => setForm((prev) => ({ ...prev, religion: value }))}
            />
            <Field
              label="Alamat Domisili"
              value={form.address}
              onChangeText={(value) => setForm((prev) => ({ ...prev, address: value }))}
              multiline
            />
          </InfoCard>

          <InfoCard title="Data PPDB">
            <Field
              label="Asal Sekolah"
              value={form.previousSchool}
              onChangeText={(value) => setForm((prev) => ({ ...prev, previousSchool: value }))}
            />
            <Field
              label="Jenjang Pendidikan Terakhir"
              value={form.lastEducation}
              onChangeText={(value) => setForm((prev) => ({ ...prev, lastEducation: value }))}
              placeholder="Contoh: SMP / MTs"
            />
            <MobileSelectField
              label="Jurusan Tujuan"
              value={form.desiredMajorId}
              options={majorOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, desiredMajorId: value }))}
              placeholder="Pilih jurusan tujuan"
              helperText={majorOptions.length ? undefined : 'Daftar jurusan sedang dimuat.'}
              disabled={majorsQuery.isLoading || majorOptions.length === 0}
            />
            <Field
              label="Kota / Domisili"
              value={form.domicileCity}
              onChangeText={(value) => setForm((prev) => ({ ...prev, domicileCity: value }))}
            />
          </InfoCard>

          <InfoCard title="Data Keluarga & Kontak Utama">
            <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
              Data ayah, ibu, dan wali dipakai untuk identitas keluarga. Kontak utama dipakai panitia untuk komunikasi
              PPDB yang paling aktif.
            </Text>
            <Field
              label="Nama Ayah"
              value={form.fatherName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, fatherName: value }))}
              placeholder="Sesuai dokumen keluarga"
            />
            <Field
              label="Nama Ibu"
              value={form.motherName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
              placeholder="Sesuai dokumen keluarga"
            />
            <Field
              label="Nama Wali (Opsional)"
              value={form.guardianName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, guardianName: value }))}
              placeholder="Diisi jika ada wali selain orang tua"
            />
            <Field
              label="No. HP Wali (Opsional)"
              value={form.guardianPhone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, guardianPhone: value }))}
              placeholder="Nomor aktif wali"
            />
            <Field
              label="Nama Kontak Utama Orang Tua / Wali"
              value={form.parentName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, parentName: value }))}
              placeholder="Pihak yang paling aktif dihubungi panitia"
            />
            <Field
              label="No. HP Kontak Utama Orang Tua / Wali"
              value={form.parentPhone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, parentPhone: value }))}
              placeholder="Nomor aktif WhatsApp / telepon"
            />
          </InfoCard>

          <InfoCard title="Motivasi & Catatan">
            <Field
              label="Motivasi / Catatan Singkat"
              value={form.motivation}
              onChangeText={(value) => setForm((prev) => ({ ...prev, motivation: value }))}
              multiline
            />
            <Field
              label="Catatan Pengajuan"
              value={form.submissionNotes}
              onChangeText={(value) => setForm((prev) => ({ ...prev, submissionNotes: value }))}
              multiline
            />
          </InfoCard>

          <InfoCard title="Aksi Cepat">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Pressable
                onPress={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || submitMutation.isPending}
                style={{
                  backgroundColor: saveMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Draft'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={!admission.canSubmit || saveMutation.isPending || submitMutation.isPending}
                style={{
                  backgroundColor:
                    !admission.canSubmit || submitMutation.isPending ? '#86efac' : '#16a34a',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {submitMutation.isPending ? 'Mengirim...' : 'Kirim Pendaftaran'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/profile' as never)}
                style={{
                  backgroundColor: BRAND_COLORS.navy,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Profil</Text>
              </Pressable>
            </View>
          </InfoCard>

          <Modal
            visible={Boolean(activeSummaryId)}
            transparent
            animationType="fade"
            onRequestClose={() => setActiveSummaryId(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
                justifyContent: 'center',
                paddingHorizontal: 18,
              }}
            >
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: '#d6e0f2',
                  maxHeight: '82%',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: '#e2e8f0',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(18), fontWeight: '700' }}>
                    {summaryCards.find((item) => item.id === activeSummaryId)?.title || 'Ringkasan PPDB'}
                  </Text>
                  <Pressable
                    onPress={() => setActiveSummaryId(null)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      backgroundColor: '#f8fafc',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="x" size={18} color="#475569" />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  {activeSummaryId === 'status' ? (
                    <>
                      <StatusChip status={admission.status} />
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 10 }}>
                        Nomor pendaftaran: {admission.registrationNumber}
                      </Text>
                      <View style={{ marginTop: 10 }}>
                        <VerificationChip status={admission.accountVerificationStatus} />
                      </View>
                      <View style={{ marginTop: 10 }}>
                        <View
                          style={{
                            alignSelf: 'flex-start',
                            borderWidth: 1,
                            borderColor: financeMeta.borderColor,
                            backgroundColor: financeMeta.backgroundColor,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                          }}
                        >
                          <Text style={{ color: financeMeta.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>{financeMeta.label}</Text>
                        </View>
                      </View>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 10, lineHeight: scaleLineHeight(20) }}>
                        {admission.reviewNotes
                          ? `Catatan admin: ${admission.reviewNotes}`
                          : 'Belum ada catatan review dari admin sekolah.'}
                      </Text>
                      {decisionLetter?.isDraftAvailable ? (
                        <View style={{ marginTop: 14 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                            {decisionLetter.title || 'Surat Hasil Seleksi PPDB'}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6, lineHeight: scaleLineHeight(20) }}>
                            {decisionLetter.isFinalized
                              ? `Draft surat sudah difinalkan dengan nomor ${decisionLetter.letterNumber || '-'}`
                              : 'Draft surat otomatis sudah tersedia dari portal web sekolah.'}
                          </Text>
                          {decisionLetter.officialUploadedAt ? (
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                              Surat resmi diunggah {formatDateTime(decisionLetter.officialUploadedAt)}
                            </Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                            <Pressable
                              onPress={() =>
                                openWebModuleRoute(router, {
                                  moduleKey: 'candidate-decision-letter',
                                  webPath: `/print/candidate-admission/${admission.id}/decision-letter`,
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
                              <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Draft Web</Text>
                            </Pressable>
                            {decisionLetter.officialFileUrl ? (
                              <Pressable
                                onPress={() => {
                                  const url = resolvePublicUrl(decisionLetter.officialFileUrl);
                                  if (url) {
                                    openWebModuleRoute(router, {
                                      moduleKey: 'candidate-decision-letter-official',
                                      webPath: url,
                                      label: 'Surat Hasil Seleksi Resmi',
                                    });
                                  }
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
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {activeSummaryId === 'completeness' ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(20) }}>
                        {admission.completeness.percent}%
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: scaleLineHeight(20) }}>
                        {admission.completeness.isReady
                          ? 'Data inti sudah siap untuk dikirim.'
                          : `Masih perlu: ${admission.completeness.missingFields.join(', ') || 'lengkapi formulir'}.`}
                      </Text>
                      <View style={{ marginTop: 12 }}>
                        <VerificationChip status={admission.accountVerificationStatus} />
                      </View>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                        Dokumen pendukung saat ini: {admission.documentCount}
                      </Text>
                    </>
                  ) : null}

                  {activeSummaryId === 'documents' ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(20) }}>
                        {admission.documentChecklist.summary.requiredUploaded}/{admission.documentChecklist.summary.requiredTotal}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: scaleLineHeight(20) }}>
                        Upload dokumen wajib dari menu Profil agar checklist ini ikut terisi otomatis.
                      </Text>
                      <View style={{ marginTop: 12 }}>
                        {requiredDocuments.map((item) => (
                          <View
                            key={item.code}
                            style={{
                              borderWidth: 1,
                              borderColor: item.isComplete ? '#bbf7d0' : '#fde68a',
                              backgroundColor: item.isComplete ? '#f0fdf4' : '#fffbeb',
                              borderRadius: 12,
                              padding: 12,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.label}</Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: scaleFont(12) }}>
                              {item.isComplete ? `${item.validUploadedCount} file valid terunggah` : 'Belum ada file valid'}
                            </Text>
                            {item.invalidCount > 0 ? (
                              <Text style={{ color: '#be123c', marginTop: 4, fontSize: scaleFont(12) }}>
                                {item.invalidCount} file salah format. Gunakan {item.acceptedFormats.join(', ')}.
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                      {optionalDocuments.length > 0 ? (
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>
                          Opsional: {optionalDocuments.map((item) => item.label).join(', ')}.
                        </Text>
                      ) : null}
                      {admission.documentChecklist.summary.uncategorizedCount ? (
                        <Text style={{ color: '#b45309', fontSize: scaleFont(12), marginTop: 6 }}>
                          Ada {admission.documentChecklist.summary.uncategorizedCount} dokumen tanpa kategori PPDB yang tepat.
                        </Text>
                      ) : null}
                      {admission.documentChecklist.summary.invalidCount ? (
                        <Text style={{ color: '#be123c', fontSize: scaleFont(12), marginTop: 6 }}>
                          Ada {admission.documentChecklist.summary.invalidCount} dokumen PPDB dengan format file yang belum sesuai.
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  {activeSummaryId === 'selection' ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(20) }}>
                        {selectionSummary?.averageScore ?? '-'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                        {selectionSummary?.total
                          ? `${selectionSummary.completed} sesi selesai, ${selectionSummary.passed} lulus.`
                          : 'Belum ada hasil tes seleksi yang terekam.'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                        Submit terakhir: {formatDateTime(selectionSummary?.latestSubmittedAt)}
                      </Text>
                      <View style={{ marginTop: 12 }}>
                        {!selectionResults.length ? (
                          <Text style={{ color: BRAND_COLORS.textMuted }}>
                            Belum ada hasil tes seleksi yang bisa ditampilkan.
                          </Text>
                        ) : (
                          selectionResults.map((item) => {
                            const statusMeta = getSelectionStatusMeta(item.status, item.passed);
                            return (
                              <View
                                key={item.sessionId}
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#d6e0f2',
                                  backgroundColor: '#f8fbff',
                                  borderRadius: 12,
                                  padding: 12,
                                  marginBottom: 10,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: scaleFont(12) }}>
                                      {item.subject?.name || item.programCode || 'Tes Seleksi'} • {formatDateTime(item.scheduleStartTime)}
                                    </Text>
                                  </View>
                                  <View
                                    style={{
                                      alignSelf: 'flex-start',
                                      borderWidth: 1,
                                      borderColor: statusMeta.borderColor,
                                      backgroundColor: statusMeta.backgroundColor,
                                      borderRadius: 999,
                                      paddingHorizontal: 10,
                                      paddingVertical: 4,
                                    }}
                                  >
                                    <Text style={{ color: statusMeta.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>
                                      {statusMeta.label}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                                  Skor: {item.score ?? '-'} | KKM: {item.kkm ?? '-'}
                                </Text>
                                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                                  Mulai: {formatDateTime(item.startedAt)}
                                </Text>
                                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                                  Submit: {formatDateTime(item.submittedAt)}
                                </Text>
                              </View>
                            );
                          })
                        )}
                      </View>
                    </>
                  ) : null}

                  {activeSummaryId === 'finance' ? (
                    <>
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: financeMeta.borderColor,
                          backgroundColor: financeMeta.backgroundColor,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: financeMeta.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>{financeMeta.label}</Text>
                      </View>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(20), marginTop: 12 }}>
                        {formatCandidateCurrency(financeSummary?.outstandingAmount || 0)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: scaleLineHeight(20) }}>
                        {financeSummary?.state === 'NO_BILLING'
                          ? 'Tagihan administrasi akan tampil di sini setelah diterbitkan sekolah.'
                          : financeSummary?.hasOverdue
                            ? `${financeSummary.overdueInvoices} tagihan administrasi sudah lewat jatuh tempo.`
                            : financeSummary?.hasOutstanding
                              ? `${financeSummary.activeInvoices} tagihan administrasi masih aktif.`
                              : 'Tagihan administrasi saat ini sudah clear.'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                        Jatuh tempo terdekat: {formatDateTime(financeSummary?.nextDueDate)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                        Pembayaran terakhir: {formatDateTime(financeSummary?.lastPaymentAt)}
                      </Text>
                      {financeSummary?.invoices?.length ? (
                        <View style={{ marginTop: 12 }}>
                          {financeSummary.invoices.map((invoice) => (
                            <View
                              key={invoice.id}
                              style={{
                                borderWidth: 1,
                                borderColor: '#d6e0f2',
                                backgroundColor: '#f8fbff',
                                borderRadius: 12,
                                padding: 12,
                                marginBottom: 8,
                              }}
                            >
                              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{invoice.label}</Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: scaleFont(12) }}>
                                {invoice.invoiceNo} • {invoice.periodKey}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                                Sisa {formatCandidateCurrency(invoice.balanceAmount)} • jatuh tempo {formatDateTime(invoice.dueDate)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {activeSummaryId === 'assessment' ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textMuted }}>
                        Nilai akhir menggabungkan TKD dari tes online dan penilaian manual dari panitia PPDB.
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#d6e0f2',
                            backgroundColor: '#f8fafc',
                            borderRadius: 12,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>Rekomendasi</Text>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                            {assessmentBoard?.summary.recommendation || 'INCOMPLETE'}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#d6e0f2',
                            backgroundColor: '#f8fafc',
                            borderRadius: 12,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>Nilai Akhir</Text>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                            {assessmentBoard?.summary.weightedAverage ?? '-'}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#d6e0f2',
                            backgroundColor: '#f8fafc',
                            borderRadius: 12,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>Komponen</Text>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                            {assessmentBoard?.summary.completedComponents || 0}/{assessmentBoard?.summary.totalComponents || 0}
                          </Text>
                        </View>
                      </View>
                      {assessmentBoard?.summary.incompleteComponents.length ? (
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 10 }}>
                          Menunggu: {assessmentBoard.summary.incompleteComponents.join(', ')}
                        </Text>
                      ) : null}
                      {assessmentBoard?.summary.failedComponents.length ? (
                        <Text style={{ color: '#be123c', marginTop: 6 }}>
                          Di bawah ambang: {assessmentBoard.summary.failedComponents.join(', ')}
                        </Text>
                      ) : null}
                      {(assessmentBoard?.items || []).map((item) => {
                        const meta = getAssessmentStateMeta(item.completed, item.passed);
                        return (
                          <View
                            key={item.code}
                            style={{
                              marginTop: 10,
                              borderWidth: 1,
                              borderColor: '#d6e0f2',
                              backgroundColor: '#f8fbff',
                              borderRadius: 12,
                              padding: 12,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: scaleFont(12) }}>
                                  {item.sourceType} • Dinilai {formatDateTime(item.assessedAt)}
                                </Text>
                              </View>
                              <View
                                style={{
                                  alignSelf: 'flex-start',
                                  borderWidth: 1,
                                  borderColor: meta.borderColor,
                                  backgroundColor: meta.backgroundColor,
                                  borderRadius: 999,
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                }}
                              >
                                <Text style={{ color: meta.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>{meta.label}</Text>
                              </View>
                            </View>
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                              Nilai: {item.score ?? '-'} | Bobot: {item.weight ?? '-'} | Ambang: {item.passingScore ?? '-'}
                            </Text>
                            {item.notes ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>{item.notes}</Text> : null}
                          </View>
                        );
                      })}
                    </>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      )}
    </ScrollView>
  );
}
