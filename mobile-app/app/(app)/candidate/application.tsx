import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
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
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

function StatusChip({ status }: { status: MobileCandidateAdmissionDetail['status'] }) {
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
      <Text style={{ color: meta.textColor, fontWeight: '700', fontSize: 12 }}>{meta.label}</Text>
    </View>
  );
}

function VerificationChip({ status }: { status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null }) {
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
      <Text style={{ color: config.textColor, fontWeight: '700', fontSize: 12 }}>{normalized}</Text>
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
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</Text>
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
          color: '#0f172a',
          backgroundColor: editable ? '#fff' : '#f8fafc',
          minHeight: multiline ? 96 : undefined,
        }}
      />
    </View>
  );
}

export default function CandidateApplicationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isLoading, isAuthenticated, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
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

  if (isLoading) return <AppLoadingScreen message="Memuat status pendaftaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'CALON_SISWA') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...pageContentPadding, paddingHorizontal: 16, paddingBottom: 24 }}
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
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Formulir PPDB
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Lengkapi data inti PPDB, simpan draft, lalu kirim pendaftaran untuk direview admin sekolah.
      </Text>

      {admissionQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat formulir PPDB..." />
      ) : admissionQuery.isError || !admissionQuery.data ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data pendaftaran calon siswa."
          onRetry={() => void admissionQuery.refetch()}
        />
      ) : (
        <>
          {(() => {
            const financeSummary = admissionQuery.data.financeSummary;
            const financeMeta = getFinanceSummaryMeta(financeSummary?.state);
            return (
              <>
          {admissionQuery.data.decisionAnnouncement.isPublished ? (
            <InfoCard title="Pengumuman Hasil Seleksi">
              <Text style={{ color: BRAND_COLORS.textDark, fontSize: 18, fontWeight: '700' }}>
                {admissionQuery.data.decisionAnnouncement.title || 'Hasil Seleksi PPDB'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: 20 }}>
                {admissionQuery.data.decisionAnnouncement.summary ||
                  'Hasil resmi seleksi sudah dipublikasikan oleh admin sekolah.'}
              </Text>
              {admissionQuery.data.decisionAnnouncement.nextSteps ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, lineHeight: 20 }}>
                  Langkah berikutnya: {admissionQuery.data.decisionAnnouncement.nextSteps}
                </Text>
              ) : null}
              <Text style={{ color: '#475569', marginTop: 10, fontSize: 12 }}>
                Dipublikasikan {formatDateTime(admissionQuery.data.decisionAnnouncement.publishedAt)}
              </Text>
            </InfoCard>
          ) : null}

          {admissionQuery.data.decisionLetter?.isDraftAvailable ? (
            <InfoCard title="Surat Hasil Seleksi">
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                {admissionQuery.data.decisionLetter.title || 'Surat Hasil Seleksi PPDB'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                {admissionQuery.data.decisionLetter.isFinalized
                  ? `Draft surat sudah difinalkan dengan nomor ${admissionQuery.data.decisionLetter.letterNumber || '-'}`
                  : 'Draft surat otomatis sudah tersedia dari portal web sekolah.'}
              </Text>
              {admissionQuery.data.decisionLetter.officialUploadedAt ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  Surat resmi diunggah {formatDateTime(admissionQuery.data.decisionLetter.officialUploadedAt)}
                </Text>
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  Surat resmi bertanda tangan masih disiapkan oleh Tata Usaha.
                </Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() =>
                    openWebModuleRoute(router, {
                      moduleKey: 'candidate-decision-letter',
                      webPath: `/print/candidate-admission/${admissionQuery.data?.id}/decision-letter`,
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
                {admissionQuery.data.decisionLetter.officialFileUrl ? (
                  <Pressable
                    onPress={() => {
                      const url = resolvePublicUrl(admissionQuery.data?.decisionLetter?.officialFileUrl);
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
            </InfoCard>
          ) : null}

          <InfoCard title="Checklist Dokumen">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 24 }}>
              {admissionQuery.data.documentChecklist.summary.requiredUploaded}/
              {admissionQuery.data.documentChecklist.summary.requiredTotal}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {admissionQuery.data.documentChecklist.requiredComplete &&
              admissionQuery.data.documentChecklist.summary.invalidCount === 0
                ? 'Dokumen wajib PPDB sudah lengkap.'
                : [
                    admissionQuery.data.documentChecklist.required
                      .filter((item) => !item.isComplete)
                      .map((item) => item.label)
                      .join(', '),
                    admissionQuery.data.documentChecklist.summary.invalidCount > 0
                      ? `${admissionQuery.data.documentChecklist.summary.invalidCount} dokumen perlu diperbaiki formatnya`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' | ')}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
              Upload dokumen wajib dari menu Profil agar checklist ini ikut terisi otomatis.
            </Text>
          </InfoCard>

          <InfoCard title="Status PPDB">
            <StatusChip status={admissionQuery.data.status} />
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
              Nomor pendaftaran: {admissionQuery.data.registrationNumber}
            </Text>
            <View style={{ marginTop: 8 }}>
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
                <Text style={{ color: financeMeta.textColor, fontWeight: '700', fontSize: 12 }}>{financeMeta.label}</Text>
              </View>
            </View>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {admissionQuery.data.reviewNotes
                ? `Catatan admin: ${admissionQuery.data.reviewNotes}`
                : 'Belum ada catatan review dari admin sekolah.'}
            </Text>
          </InfoCard>

          <InfoCard title="Kelengkapan & Akun">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 24 }}>
              {admissionQuery.data.completeness.percent}%
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {admissionQuery.data.completeness.isReady
                ? 'Data inti sudah siap untuk dikirim.'
                : `Masih perlu: ${admissionQuery.data.completeness.missingFields.join(', ') || 'lengkapi formulir'}.`}
            </Text>
            <View style={{ marginTop: 10 }}>
              <VerificationChip status={admissionQuery.data.accountVerificationStatus} />
            </View>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              Dokumen pendukung saat ini: {admissionQuery.data.documentCount}
            </Text>
          </InfoCard>

          <InfoCard title="Ringkasan Tes Seleksi">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 24 }}>
              {admissionQuery.data.selectionResults?.summary.averageScore ?? '-'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {admissionQuery.data.selectionResults?.summary.total
                ? `${admissionQuery.data.selectionResults.summary.completed} sesi selesai, ${admissionQuery.data.selectionResults.summary.passed} lulus.`
                : 'Belum ada hasil tes seleksi yang terekam.'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
              Submit terakhir: {formatDateTime(admissionQuery.data.selectionResults?.summary.latestSubmittedAt)}
            </Text>
          </InfoCard>

          <InfoCard title="Administrasi Keuangan">
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
              <Text style={{ color: financeMeta.textColor, fontWeight: '700', fontSize: 12 }}>{financeMeta.label}</Text>
            </View>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 24, marginTop: 10 }}>
              {formatCandidateCurrency(financeSummary?.outstandingAmount || 0)}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
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
              <View style={{ marginTop: 10 }}>
                {financeSummary.invoices.slice(0, 3).map((invoice) => (
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
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                      {invoice.invoiceNo} • {invoice.periodKey}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                      Sisa {formatCandidateCurrency(invoice.balanceAmount)} • jatuh tempo {formatDateTime(invoice.dueDate)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </InfoCard>

          <InfoCard title="Board Penilaian PPDB">
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
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Rekomendasi</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                  {admissionQuery.data.assessmentBoard?.summary.recommendation || 'INCOMPLETE'}
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
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Nilai Akhir</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                  {admissionQuery.data.assessmentBoard?.summary.weightedAverage ?? '-'}
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
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Komponen</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                  {admissionQuery.data.assessmentBoard?.summary.completedComponents || 0}/
                  {admissionQuery.data.assessmentBoard?.summary.totalComponents || 0}
                </Text>
              </View>
            </View>
            {admissionQuery.data.assessmentBoard?.summary.incompleteComponents.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 10 }}>
                Menunggu: {admissionQuery.data.assessmentBoard.summary.incompleteComponents.join(', ')}
              </Text>
            ) : null}
            {admissionQuery.data.assessmentBoard?.summary.failedComponents.length ? (
              <Text style={{ color: '#be123c', marginTop: 6 }}>
                Di bawah ambang: {admissionQuery.data.assessmentBoard.summary.failedComponents.join(', ')}
              </Text>
            ) : null}

            {(admissionQuery.data.assessmentBoard?.items || []).map((item) => {
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
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
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
                      <Text style={{ color: meta.textColor, fontWeight: '700', fontSize: 12 }}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                    Nilai: {item.score ?? '-'} | Bobot: {item.weight ?? '-'} | Ambang: {item.passingScore ?? '-'}
                  </Text>
                  {item.notes ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>{item.notes}</Text> : null}
                </View>
              );
            })}
          </InfoCard>

          <InfoCard title="Dokumen yang Diperlukan">
            {admissionQuery.data.documentChecklist.required.map((item) => (
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
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                  {item.isComplete ? `${item.validUploadedCount} file valid terunggah` : 'Belum ada file valid'}
                </Text>
                {item.invalidCount > 0 ? (
                  <Text style={{ color: '#be123c', marginTop: 4, fontSize: 12 }}>
                    {item.invalidCount} file salah format. Gunakan {item.acceptedFormats.join(', ')}.
                  </Text>
                ) : null}
              </View>
            ))}
            {admissionQuery.data.documentChecklist.summary.uncategorizedCount ? (
              <Text style={{ color: '#b45309', fontSize: 12 }}>
                Ada {admissionQuery.data.documentChecklist.summary.uncategorizedCount} dokumen tanpa kategori PPDB yang tepat.
              </Text>
            ) : null}
            {admissionQuery.data.documentChecklist.summary.invalidCount ? (
              <Text style={{ color: '#be123c', fontSize: 12, marginTop: 6 }}>
                Ada {admissionQuery.data.documentChecklist.summary.invalidCount} dokumen PPDB dengan format file yang belum sesuai.
              </Text>
            ) : null}
          </InfoCard>

          <InfoCard title="Hasil Tes Seleksi">
            {!admissionQuery.data.selectionResults?.results.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Belum ada hasil tes seleksi yang bisa ditampilkan.
              </Text>
            ) : (
              admissionQuery.data.selectionResults.results.map((item) => {
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
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                          {item.subject?.name || item.programCode || 'Tes Seleksi'} •{' '}
                          {formatDateTime(item.scheduleStartTime)}
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
                        <Text style={{ color: statusMeta.textColor, fontWeight: '700', fontSize: 12 }}>
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
          </InfoCard>
              </>
            );
          })()}

          <InfoCard title="Data Utama">
            <Field label="Nama Lengkap" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Field label="NISN" value={admissionQuery.data.user.nisn || admissionQuery.data.user.username} editable={false} />
            <Field label="Nomor HP" value={form.phone} onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
            <Field label="Email" value={form.email} onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))} />
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
              label="Jenis Kelamin"
              value={form.gender === 'MALE' ? 'Laki-laki' : form.gender === 'FEMALE' ? 'Perempuan' : ''}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  gender:
                    value.toLowerCase().startsWith('l')
                      ? 'MALE'
                      : value.toLowerCase().startsWith('p')
                        ? 'FEMALE'
                        : '',
                }))
              }
              placeholder="Ketik Laki-laki atau Perempuan"
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
            <Field
              label="Jurusan Tujuan"
              value={
                majorsQuery.data?.find((major) => String(major.id) === form.desiredMajorId)
                  ? `${majorsQuery.data.find((major) => String(major.id) === form.desiredMajorId)?.code} - ${majorsQuery.data.find((major) => String(major.id) === form.desiredMajorId)?.name}`
                  : form.desiredMajorId
              }
              onChangeText={(value) => {
                const matched = majorsQuery.data?.find(
                  (major) =>
                    major.code.toLowerCase() === value.trim().toLowerCase() ||
                    major.name.toLowerCase() === value.trim().toLowerCase() ||
                    `${major.code} - ${major.name}`.toLowerCase() === value.trim().toLowerCase(),
                );
                setForm((prev) => ({
                  ...prev,
                  desiredMajorId: matched ? String(matched.id) : value.replace(/[^0-9]/g, ''),
                }));
              }}
              placeholder={
                majorsQuery.data?.length
                  ? `Contoh: ${majorsQuery.data[0].code} - ${majorsQuery.data[0].name}`
                  : 'Ketik kode atau nama jurusan'
              }
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
                disabled={!admissionQuery.data.canSubmit || saveMutation.isPending || submitMutation.isPending}
                style={{
                  backgroundColor:
                    !admissionQuery.data.canSubmit || submitMutation.isPending ? '#86efac' : '#16a34a',
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
        </>
      )}
    </ScrollView>
  );
}
