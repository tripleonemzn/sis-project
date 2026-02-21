import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
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

export default function CandidateApplicationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);

  if (isLoading) return <AppLoadingScreen message="Memuat status pendaftaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'CALON_SISWA' && user?.role !== 'UMUM') return <Redirect href="/home" />;

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
          Status Pendaftaran
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Monitoring status akun pendaftar langsung dari mobile.
      </Text>

      <InfoCard title="Status Akun">
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{user?.name || '-'}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>Username: @{user?.username || '-'}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
          Role: {user?.role === 'CALON_SISWA' ? 'Calon Siswa' : 'Umum'}
        </Text>
      </InfoCard>

      <InfoCard title="Tahap Verifikasi">
        <Text style={{ color: BRAND_COLORS.textMuted }}>
          Akun Anda sedang menunggu verifikasi admin. Jika ada koreksi data, admin akan menghubungi melalui kanal resmi
          sekolah.
        </Text>
      </InfoCard>

      <InfoCard title="Langkah Selanjutnya">
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>1. Pastikan data profil sudah lengkap.</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>2. Pantau notifikasi dari admin sekolah.</Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>3. Hubungi operator bila proses verifikasi terlalu lama.</Text>
        <Pressable
          onPress={() => router.push('/profile' as never)}
          style={{
            marginTop: 10,
            alignSelf: 'flex-start',
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Profil</Text>
        </Pressable>
      </InfoCard>
    </ScrollView>
  );
}
