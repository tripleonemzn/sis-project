import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { candidateAdmissionApi } from '../../../src/features/candidateAdmission/candidateAdmissionApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

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

function StatusChip({ status }: { status: string }) {
  const meta = candidateAdmissionApi.getStatusMeta(status as never);
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

function QuickAction({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: primary ? BRAND_COLORS.blue : BRAND_COLORS.white,
        borderWidth: primary ? 0 : 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: primary ? '#fff' : BRAND_COLORS.textDark, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export default function CandidateDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets);
  const admissionQuery = useQuery({
    queryKey: ['mobile-candidate-admission-dashboard'],
    enabled: isAuthenticated && user?.role === 'CALON_SISWA',
    queryFn: async () => candidateAdmissionApi.getMyAdmission(),
    staleTime: 60_000,
  });

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard pendaftaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'CALON_SISWA') return <Redirect href="/home" />;

  const admission = admissionQuery.data;
  const selectionSummary = admission?.selectionResults?.summary;
  const assessmentSummary = admission?.assessmentBoard?.summary;
  const financeSummary = admission?.financeSummary;
  const financeMeta = getFinanceSummaryMeta(financeSummary?.state);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...pagePadding, paddingHorizontal: 16, paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={admissionQuery.isFetching && !admissionQuery.isLoading}
          onRefresh={() => admissionQuery.refetch()}
        />
      }
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
        Dashboard Pendaftaran
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau status PPDB, kesiapan berkas, nilai seleksi, dan hasil keputusan dari akun ini.
      </Text>

      {admissionQuery.isLoading ? <QueryStateView type="loading" message="Memuat ringkasan PPDB..." /> : null}
      {admissionQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat dashboard pendaftaran." onRetry={() => admissionQuery.refetch()} />
      ) : null}

      {admission ? (
        <>
          <InfoCard title="Ringkasan Pendaftaran">
            <StatusChip status={admission.status} />
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18, marginTop: 10 }}>
              {admission.user.name}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              No. pendaftaran: {admission.registrationNumber}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Jurusan tujuan: {admission.desiredMajor?.name || 'Belum dipilih'}
            </Text>
          </InfoCard>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <View style={{ width: '47%' }}>
              <InfoCard title="Kelengkapan">
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 20 }}>
                  {admission.completeness.percent}%
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  {admission.completeness.completedCount}/{admission.completeness.totalFields} bagian selesai
                </Text>
              </InfoCard>
            </View>
            <View style={{ width: '47%' }}>
              <InfoCard title="Dokumen Wajib">
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 20 }}>
                  {admission.documentChecklist.summary.requiredUploaded}/{admission.documentChecklist.summary.requiredTotal}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  {admission.documentChecklist.requiredComplete ? 'Sudah lengkap' : 'Masih perlu dilengkapi'}
                </Text>
              </InfoCard>
            </View>
          </View>

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
                marginBottom: 8,
              }}
            >
              <Text style={{ color: financeMeta.textColor, fontWeight: '700', fontSize: 12 }}>{financeMeta.label}</Text>
            </View>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 20 }}>
              {formatCandidateCurrency(financeSummary?.outstandingAmount || 0)}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {financeSummary?.state === 'NO_BILLING'
                ? 'Belum ada tagihan administrasi yang diterbitkan untuk akun ini.'
                : financeSummary?.hasOverdue
                  ? `${financeSummary.overdueInvoices} tagihan sudah lewat jatuh tempo.`
                  : financeSummary?.hasOutstanding
                    ? `${financeSummary.activeInvoices} tagihan masih aktif dan menunggu penyelesaian.`
                    : 'Administrasi keuangan saat ini sudah clear.'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Jatuh tempo terdekat: {financeSummary?.nextDueDate ? new Date(financeSummary.nextDueDate).toLocaleDateString('id-ID') : '-'}
            </Text>
          </InfoCard>

          <InfoCard title="Tes & Penilaian">
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              CBT selesai: {selectionSummary?.completed || 0}/{selectionSummary?.total || 0}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Nilai rata-rata CBT: {selectionSummary?.averageScore ?? '-'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Board seleksi: {assessmentSummary?.recommendation || 'INCOMPLETE'} • Nilai akhir {assessmentSummary?.weightedAverage ?? '-'}
            </Text>
          </InfoCard>

          {admission.decisionAnnouncement?.isPublished ? (
            <InfoCard title="Pengumuman Hasil">
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                {admission.decisionAnnouncement.title || 'Hasil seleksi sudah dipublikasikan'}
              </Text>
              {admission.decisionAnnouncement.summary ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  {admission.decisionAnnouncement.summary}
                </Text>
              ) : null}
              {admission.decisionAnnouncement.nextSteps ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                  Langkah berikutnya: {admission.decisionAnnouncement.nextSteps}
                </Text>
              ) : null}
            </InfoCard>
          ) : null}

          <InfoCard title="Aksi Cepat">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <QuickAction label="Formulir PPDB" primary onPress={() => router.push('/candidate/application' as never)} />
              <QuickAction label="Informasi PPDB" onPress={() => router.push('/candidate/information' as never)} />
              <QuickAction label="Tes Seleksi" onPress={() => router.push('/candidate/exams' as never)} />
              <QuickAction label="Profil" onPress={() => router.push('/candidate/profile' as never)} />
            </View>
          </InfoCard>
        </>
      ) : null}
    </ScrollView>
  );
}
