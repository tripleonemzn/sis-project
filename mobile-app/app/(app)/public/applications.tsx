import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { publicBkkApi } from '../../../src/features/publicBkk/bkkApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

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

function StatusChip({ status }: { status: Parameters<typeof publicBkkApi.getStatusMeta>[0] }) {
  const meta = publicBkkApi.getStatusMeta(status);
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

function AssessmentStateChip({ completed, passed }: { completed: boolean; passed?: boolean | null }) {
  const meta = !completed
    ? { label: 'Menunggu', borderColor: '#fde68a', backgroundColor: '#fef3c7', textColor: '#b45309' }
    : passed === false
      ? { label: 'Perlu perhatian', borderColor: '#fecdd3', backgroundColor: '#ffe4e6', textColor: '#be123c' }
      : { label: 'Selesai', borderColor: '#bbf7d0', backgroundColor: '#dcfce7', textColor: '#15803d' };
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

export default function PublicBkkApplicationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isLoading, isAuthenticated, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const applicantVerified = String(user?.verificationStatus || 'PENDING').toUpperCase() === 'VERIFIED';

  const applicationsQuery = useQuery({
    queryKey: ['mobile-public-bkk-applications'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.listMyApplications(),
    staleTime: 60_000,
  });

  const withdrawMutation = useMutation({
    mutationFn: async (applicationId: number) => publicBkkApi.withdrawApplication(applicationId),
    onSuccess: () => {
      notifySuccess('Lamaran berhasil dibatalkan.');
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-applications'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-vacancies'] });
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal membatalkan lamaran.'),
  });

  if (isLoading) return <AppLoadingScreen message="Memuat status lamaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'UMUM') return <Redirect href="/home" />;

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
          Lamaran Saya
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau proses lamaran BKK yang sudah Anda kirim dari aplikasi.
      </Text>

      {!applicantVerified ? (
        <InfoCard title="Akun Pelamar Menunggu Verifikasi">
          <Text style={{ color: BRAND_COLORS.textMuted }}>
            Fitur melamar lowongan dan mengikuti Tes BKK akan aktif penuh setelah admin memverifikasi akun ini.
          </Text>
        </InfoCard>
      ) : null}

      {applicationsQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat daftar lamaran..." />
      ) : applicationsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat lamaran." onRetry={() => void applicationsQuery.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <View style={{ width: '47%' }}>
              <InfoCard title="Total">
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: 28, fontWeight: '800' }}>
                  {applicationsQuery.data?.summary.total || 0}
                </Text>
              </InfoCard>
            </View>
            <View style={{ width: '47%' }}>
              <InfoCard title="Diterima Mitra">
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: 28, fontWeight: '800' }}>
                  {publicBkkApi.getSuccessfulPlacementCount(
                    applicationsQuery.data?.summary || {
                      total: 0,
                      submitted: 0,
                      reviewing: 0,
                      shortlisted: 0,
                      partnerInterview: 0,
                      interview: 0,
                      hired: 0,
                      accepted: 0,
                      rejected: 0,
                      withdrawn: 0,
                    },
                  )}
                </Text>
              </InfoCard>
            </View>
          </View>

          <InfoCard title="Sedang Diproses">
            <Text style={{ color: BRAND_COLORS.textDark, fontSize: 28, fontWeight: '800' }}>
              {publicBkkApi.getActiveProcessingCount(
                applicationsQuery.data?.summary || {
                  total: 0,
                  submitted: 0,
                  reviewing: 0,
                  shortlisted: 0,
                  partnerInterview: 0,
                  interview: 0,
                  hired: 0,
                  accepted: 0,
                  rejected: 0,
                  withdrawn: 0,
                },
              )}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              Screening internal sampai interview mitra industri.
            </Text>
          </InfoCard>

          {(applicationsQuery.data?.applications || []).length > 0 ? (
            (applicationsQuery.data?.applications || []).map((application) => (
              <InfoCard key={application.id} title={application.vacancy.title}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {publicBkkApi.resolveCompanyName(application.vacancy)}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <StatusChip status={application.status} />
                </View>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                  Dikirim: {new Date(application.appliedAt).toLocaleString('id-ID')}
                </Text>
                <View style={{ marginTop: 10, gap: 8 }}>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      borderRadius: 12,
                      backgroundColor: '#f8fafc',
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Timeline BKK</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                      Shortlist: {application.shortlistedAt ? new Date(application.shortlistedAt).toLocaleString('id-ID') : 'Belum'}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                      Interview Mitra:{' '}
                      {application.partnerInterviewAt
                        ? new Date(application.partnerInterviewAt).toLocaleString('id-ID')
                        : 'Belum'}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                      Keputusan Final: {application.finalizedAt ? new Date(application.finalizedAt).toLocaleString('id-ID') : 'Belum'}
                    </Text>
                  </View>
                </View>
                {application.partnerReferenceCode || application.partnerDecisionNotes ? (
                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      borderRadius: 12,
                      backgroundColor: '#f8fafc',
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Arsip Mitra Industri</Text>
                    {application.partnerReferenceCode ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                        Referensi mitra: {application.partnerReferenceCode}
                      </Text>
                    ) : null}
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                      {application.partnerDecisionNotes?.trim()
                        ? application.partnerDecisionNotes
                        : 'Belum ada catatan keputusan mitra yang dibagikan ke pelamar.'}
                    </Text>
                  </View>
                ) : null}
                {application.expectedSalary?.trim() ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    Ekspektasi gaji: {application.expectedSalary}
                  </Text>
                ) : null}
                {application.reviewerNotes?.trim() ? (
                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      borderRadius: 12,
                      backgroundColor: '#f8fafc',
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Catatan BKK</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted }}>{application.reviewerNotes}</Text>
                  </View>
                ) : null}
                {application.coverLetter?.trim() ? (
                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      borderRadius: 12,
                      backgroundColor: '#fff',
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Cover Letter</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted }}>{application.coverLetter}</Text>
                  </View>
                ) : null}
                <View
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: '#d6e0f2',
                    borderRadius: 12,
                    backgroundColor: '#f8fafc',
                    padding: 10,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Board Seleksi BKK</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                    Rekomendasi: {application.assessmentBoard?.summary.recommendation || 'INCOMPLETE'} | Nilai akhir:{' '}
                    {application.assessmentBoard?.summary.weightedAverage ?? '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    Tahap selesai: {application.assessmentBoard?.summary.completedStages || 0}/
                    {application.assessmentBoard?.summary.totalStages || 0}
                  </Text>
                  {application.assessmentBoard?.summary.incompleteStages.length ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                      Menunggu: {application.assessmentBoard.summary.incompleteStages.join(', ')}
                    </Text>
                  ) : null}
                  {(application.assessmentBoard?.items || []).map((stage) => (
                    <View
                      key={stage.code}
                      style={{
                        marginTop: 10,
                        borderWidth: 1,
                        borderColor: '#d6e0f2',
                        borderRadius: 12,
                        backgroundColor: '#fff',
                        padding: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{stage.title}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                            {stage.sourceType} • Dinilai:{' '}
                            {stage.assessedAt ? new Date(stage.assessedAt).toLocaleString('id-ID') : '-'}
                          </Text>
                        </View>
                        <AssessmentStateChip completed={stage.completed} passed={stage.passed} />
                      </View>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                        Nilai: {stage.score ?? '-'} | Bobot: {stage.weight ?? '-'} | Ambang: {stage.passingScore ?? '-'}
                      </Text>
                      {stage.notes ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>{stage.notes}</Text> : null}
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Pressable
                    onPress={() => router.push('/public/vacancies' as never)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Lihat Lowongan</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push((applicantVerified ? '/exams' : '/public/profile') as never)}
                    style={{
                      borderWidth: 1,
                      borderColor: applicantVerified ? '#bfdbfe' : '#fde68a',
                      backgroundColor: applicantVerified ? '#eff6ff' : '#fffbeb',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: applicantVerified ? '#1d4ed8' : '#92400e', fontWeight: '700' }}>
                      {applicantVerified ? 'Buka Tes BKK' : 'Tunggu Verifikasi'}
                    </Text>
                  </Pressable>
                  {publicBkkApi.isWithdrawable(application.status) ? (
                    <Pressable
                      onPress={() => withdrawMutation.mutate(application.id)}
                      disabled={withdrawMutation.isPending}
                      style={{
                        backgroundColor: '#e11d48',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        opacity: withdrawMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {withdrawMutation.isPending ? 'Memproses...' : 'Batalkan Lamaran'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </InfoCard>
            ))
          ) : (
            <InfoCard title="Belum Ada Lamaran">
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Anda belum mengirim lamaran apa pun. Buka lowongan BKK untuk mulai melamar.
              </Text>
              <Pressable
                onPress={() => router.push('/public/vacancies' as never)}
                style={{
                  marginTop: 10,
                  alignSelf: 'flex-start',
                  backgroundColor: BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Lowongan</Text>
              </Pressable>
            </InfoCard>
          )}
        </>
      )}
    </ScrollView>
  );
}
