import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
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

export default function PublicRegistrationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user } = useAuth();
  const { scaleFont } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets);

  if (isLoading) return <AppLoadingScreen message="Memuat modul pendaftaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

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
          Pendaftaran Umum
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Akses pendaftaran umum kini tersedia dari mobile native.
      </Text>

      <InfoCard title="Status Akun Saat Ini">
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{user?.name || '-'}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>Username: @{user?.username || '-'}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
          Role saat ini: {user?.role || '-'}
        </Text>
      </InfoCard>

      <InfoCard title="Aksi Lanjutan">
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>
          Jika Anda sudah memiliki akun, silakan lengkapi data profil dan pantau status verifikasi dari admin.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.push('/profile' as never)}
            style={{
              backgroundColor: BRAND_COLORS.blue,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Profil</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push((user?.role === 'CALON_SISWA' ? '/candidate/application' : '/profile') as never)
            }
            style={{
              backgroundColor: '#0f766e',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {user?.role === 'CALON_SISWA' ? 'Cek Status' : 'Lengkapi Profil'}
            </Text>
          </Pressable>
        </View>
      </InfoCard>
    </ScrollView>
  );
}
