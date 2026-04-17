import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { publicBkkApi } from '../../../src/features/publicBkk/bkkApi';
import type { PublicBkkVacancy } from '../../../src/features/publicBkk/types';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

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
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(15), lineHeight: scaleLineHeight(22), fontWeight: '700', marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

function StatusChip({ vacancy }: { vacancy: PublicBkkVacancy }) {
  const { scaleFont } = useAppTextScale();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: vacancy.isOpen ? '#bbf7d0' : '#cbd5e1',
        backgroundColor: vacancy.isOpen ? '#dcfce7' : '#f1f5f9',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: vacancy.isOpen ? '#166534' : '#475569', fontWeight: '700', fontSize: scaleFont(12) }}>
        {vacancy.isOpen ? 'Aktif' : 'Tutup'}
      </Text>
    </View>
  );
}

function ApplicationStatusChip({ status }: { status: NonNullable<PublicBkkVacancy['myApplication']>['status'] }) {
  const { scaleFont } = useAppTextScale();
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
      <Text style={{ color: meta.textColor, fontWeight: '700', fontSize: scaleFont(12) }}>{meta.label}</Text>
    </View>
  );
}

export default function PublicBkkVacanciesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isLoading, isAuthenticated, user } = useAuth();
  const { scaleFont, fontSizes } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets);
  const [selectedVacancyId, setSelectedVacancyId] = useState<number | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');

  const vacanciesQuery = useQuery({
    queryKey: ['mobile-public-bkk-vacancies'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.listOpenVacancies(24),
    staleTime: 60_000,
  });
  const profileQuery = useQuery({
    queryKey: ['mobile-public-bkk-profile'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.getApplicantProfile(),
    staleTime: 60_000,
  });

  const selectedVacancy = useMemo(
    () => (vacanciesQuery.data || []).find((item) => item.id === selectedVacancyId) || null,
    [selectedVacancyId, vacanciesQuery.data],
  );
  const applicantVerified =
    String(profileQuery.data?.verificationStatus || user?.verificationStatus || 'PENDING').toUpperCase() === 'VERIFIED';

  const applyMutation = useMutation({
    mutationFn: async (vacancyId: number) =>
      publicBkkApi.applyToVacancy(vacancyId, {
        coverLetter: coverLetter.trim() || undefined,
        expectedSalary: expectedSalary.trim() || undefined,
      }),
    onSuccess: () => {
      notifySuccess('Lamaran berhasil dikirim.');
      setSelectedVacancyId(null);
      setCoverLetter('');
      setExpectedSalary('');
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-vacancies'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-applications'] });
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal mengirim lamaran.'),
  });

  if (isLoading) return <AppLoadingScreen message="Memuat lowongan BKK..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'UMUM') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...pageContentPadding, paddingHorizontal: 16 }}
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
          Lowongan BKK
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pilih lowongan aktif dan kirim lamaran langsung dari mobile.
      </Text>

      {!applicantVerified ? (
        <InfoCard title="Akun Pelamar Menunggu Verifikasi">
          <Text style={{ color: BRAND_COLORS.textMuted }}>
            Lengkapi profil pelamar terlebih dahulu. Fitur melamar lowongan dan mengikuti Tes BKK akan aktif setelah admin memverifikasi akun ini.
          </Text>
          <Pressable
            onPress={() => router.push('/public/profile' as never)}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              backgroundColor: '#d97706',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lengkapi Profil Pelamar</Text>
          </Pressable>
        </InfoCard>
      ) : null}

      {!profileQuery.data?.completeness.isReady ? (
        <InfoCard title="Profil Pelamar Belum Lengkap">
          <Text style={{ color: BRAND_COLORS.textMuted }}>
            Lengkapi dulu: {profileQuery.data?.completeness.missingFields.join(', ') || 'profil pelamar'}.
          </Text>
          <Pressable
            onPress={() => router.push('/public/profile' as never)}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              backgroundColor: '#d97706',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lengkapi Profil</Text>
          </Pressable>
        </InfoCard>
      ) : null}

      {vacanciesQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat daftar lowongan..." />
      ) : vacanciesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat lowongan BKK." onRetry={() => void vacanciesQuery.refetch()} />
      ) : (vacanciesQuery.data || []).length > 0 ? (
        (vacanciesQuery.data || []).map((vacancy) => (
          <InfoCard key={vacancy.id} title={vacancy.title}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {publicBkkApi.resolveCompanyName(vacancy)}
                </Text>
                {vacancy.deadline ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    Deadline: {new Date(vacancy.deadline).toLocaleDateString('id-ID')}
                  </Text>
                ) : null}
                {typeof vacancy.applicationCount === 'number' ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    Pelamar tercatat: {vacancy.applicationCount}
                  </Text>
                ) : null}
              </View>
              <StatusChip vacancy={vacancy} />
            </View>

            {vacancy.description ? (
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 10 }}>{vacancy.description}</Text>
            ) : null}
            {vacancy.requirements ? (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Kebutuhan</Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>{vacancy.requirements}</Text>
              </View>
            ) : null}

            {vacancy.myApplication ? (
              <View
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: '#fdba74',
                  backgroundColor: '#fff7ed',
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <ApplicationStatusChip status={vacancy.myApplication.status} />
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                  Lamaran sudah dikirim pada {new Date(vacancy.myApplication.appliedAt).toLocaleString('id-ID')}.
                </Text>
                <Pressable
                  onPress={() => router.push('/public/applications' as never)}
                  style={{
                    marginTop: 10,
                    alignSelf: 'flex-start',
                    backgroundColor: BRAND_COLORS.navy,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Lihat Status</Text>
                </Pressable>
              </View>
            ) : null}

            {selectedVacancy?.id === vacancy.id ? (
              <View
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: '#fdba74',
                  borderRadius: 12,
                  backgroundColor: '#fff7ed',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Kirim Lamaran</Text>
                <TextInput
                  value={coverLetter}
                  onChangeText={setCoverLetter}
                  placeholder="Pesan singkat / cover letter"
                  multiline
                  textAlignVertical="top"
                  style={{
                    borderWidth: 1,
                    borderColor: '#fdba74',
                    borderRadius: 10,
                    backgroundColor: '#fff',
                    minHeight: 96,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: fontSizes.body,
                    color: BRAND_COLORS.textDark,
                  }}
                />
                <TextInput
                  value={expectedSalary}
                  onChangeText={setExpectedSalary}
                  placeholder="Ekspektasi gaji (opsional)"
                  style={{
                    borderWidth: 1,
                    borderColor: '#fdba74',
                    borderRadius: 10,
                    backgroundColor: '#fff',
                    marginTop: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: fontSizes.body,
                    color: BRAND_COLORS.textDark,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={() => {
                      setSelectedVacancyId(null);
                      setCoverLetter('');
                      setExpectedSalary('');
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Batal</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => applyMutation.mutate(vacancy.id)}
                    disabled={applyMutation.isPending}
                    style={{
                      backgroundColor: BRAND_COLORS.blue,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: applyMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {applyMutation.isPending ? 'Mengirim...' : 'Kirim Lamaran'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {!vacancy.myApplication && vacancy.canApplyInApp && profileQuery.data?.completeness.isReady && applicantVerified ? (
                <Pressable
                  onPress={() => setSelectedVacancyId(vacancy.id)}
                  style={{
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Lamar di Aplikasi</Text>
                </Pressable>
              ) : null}

              {!vacancy.myApplication && (!profileQuery.data?.completeness.isReady || !applicantVerified) ? (
                <Pressable
                  onPress={() => router.push('/public/profile' as never)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>
                    {profileQuery.data?.completeness.isReady ? 'Tunggu Verifikasi Admin' : 'Lengkapi Profil Dulu'}
                  </Text>
                </Pressable>
              ) : null}

              {vacancy.registrationLink ? (
                <Pressable
                  onPress={() => {
                    openWebModuleRoute(router, {
                      moduleKey: `public-vacancy-${vacancy.id}`,
                      webPath: vacancy.registrationLink!,
                      label: vacancy.companyName ? `Pendaftaran ${vacancy.companyName}` : 'Tautan Pendaftaran',
                    });
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Tautan Eksternal</Text>
                </Pressable>
              ) : null}
            </View>
          </InfoCard>
        ))
      ) : (
        <InfoCard title="Belum Ada Lowongan">
          <Text style={{ color: BRAND_COLORS.textMuted }}>Saat ini belum ada lowongan BKK aktif yang tersedia.</Text>
        </InfoCard>
      )}
    </ScrollView>
  );
}
