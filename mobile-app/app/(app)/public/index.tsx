import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { publicBkkApi } from '../../../src/features/publicBkk/bkkApi';
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

export default function PublicBkkDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets);
  const profileQuery = useQuery({
    queryKey: ['mobile-public-bkk-dashboard-profile'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.getApplicantProfile(),
    staleTime: 60_000,
  });
  const applicationsQuery = useQuery({
    queryKey: ['mobile-public-bkk-dashboard-applications'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.listMyApplications(),
    staleTime: 60_000,
  });
  const vacanciesQuery = useQuery({
    queryKey: ['mobile-public-bkk-dashboard-vacancies'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.listOpenVacancies(6),
    staleTime: 60_000,
  });

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard BKK..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'UMUM') return <Redirect href="/home" />;

  const summary =
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
    };
  const applicantVerified =
    String(profileQuery.data?.verificationStatus || user?.verificationStatus || 'PENDING').toUpperCase() === 'VERIFIED';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...pagePadding, paddingHorizontal: 16, paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={
            (profileQuery.isFetching && !profileQuery.isLoading) ||
            (applicationsQuery.isFetching && !applicationsQuery.isLoading) ||
            (vacanciesQuery.isFetching && !vacanciesQuery.isLoading)
          }
          onRefresh={() => {
            void profileQuery.refetch();
            void applicationsQuery.refetch();
            void vacanciesQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 24, fontWeight: '700', marginBottom: 6 }}>
        Dashboard BKK
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau profil pelamar, lowongan aktif, status lamaran, dan akses Tes BKK dari satu tempat.
      </Text>

      {profileQuery.isLoading ? <QueryStateView type="loading" message="Memuat ringkasan BKK..." /> : null}
      {profileQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat dashboard BKK." onRetry={() => profileQuery.refetch()} />
      ) : null}

      <InfoCard title="Ringkasan Akun">
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>{user.name}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>Username: {user.username}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
          Status verifikasi: {String(profileQuery.data?.verificationStatus || user.verificationStatus || 'PENDING').toUpperCase()}
        </Text>
      </InfoCard>

      {!applicantVerified ? (
        <InfoCard title="Akun Pelamar Menunggu Verifikasi">
          <Text style={{ color: BRAND_COLORS.textMuted }}>
            Lengkapi profil pelamar terlebih dahulu. Fitur melamar lowongan dan mengikuti Tes BKK akan aktif setelah admin memverifikasi akun ini.
          </Text>
        </InfoCard>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <View style={{ width: '47%' }}>
          <InfoCard title="Profil Pelamar">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 28 }}>
              {profileQuery.data?.completeness.isReady ? 'Siap' : 'Belum'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {profileQuery.data?.completeness.isReady ? 'Siap melamar' : 'Masih perlu dilengkapi'}
            </Text>
          </InfoCard>
        </View>
        <View style={{ width: '47%' }}>
          <InfoCard title="Lamaran Aktif">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 28 }}>
              {publicBkkApi.getActiveProcessingCount(summary)}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>Sedang diproses BKK</Text>
          </InfoCard>
        </View>
      </View>

      <InfoCard title="Statistik BKK">
        <Text style={{ color: BRAND_COLORS.textMuted }}>Total lamaran: {summary.total}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
          Diterima mitra: {publicBkkApi.getSuccessfulPlacementCount(summary)}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
          Lowongan aktif: {vacanciesQuery.data?.length || 0}
        </Text>
      </InfoCard>

      <InfoCard title="Lowongan Terbaru">
        {(vacanciesQuery.data || []).slice(0, 3).map((vacancy) => (
          <View
            key={vacancy.id}
            style={{
              borderWidth: 1,
              borderColor: '#d6e0f2',
              borderRadius: 12,
              backgroundColor: '#f8fafc',
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{vacancy.title}</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              {publicBkkApi.resolveCompanyName(vacancy)}
            </Text>
          </View>
        ))}
        {(vacanciesQuery.data || []).length === 0 ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada lowongan aktif yang tampil saat ini.</Text>
        ) : null}
      </InfoCard>

      <InfoCard title="Aksi Cepat">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <QuickAction label="Lowongan BKK" primary onPress={() => router.push('/public/vacancies' as never)} />
          <QuickAction label="Lamaran Saya" onPress={() => router.push('/public/applications' as never)} />
          <QuickAction label="Tes BKK" onPress={() => router.push('/exams' as never)} />
          <QuickAction label="Profil Pelamar" onPress={() => router.push('/public/profile' as never)} />
        </View>
      </InfoCard>
    </ScrollView>
  );
}
