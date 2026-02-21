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

export default function PublicInformationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);

  if (isLoading) return <AppLoadingScreen message="Memuat informasi sekolah..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

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
          Informasi Sekolah
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Halaman informasi umum sekolah pada kanal mobile native.
      </Text>

      <InfoCard title="Profil Singkat">
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>SMKS Karya Guna Bhakti 2</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
          Sistem Integrasi Sekolah mendukung operasional akademik dan administrasi berbasis mobile.
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>
          Untuk informasi resmi terbaru, koordinasikan dengan admin/operator sekolah.
        </Text>
      </InfoCard>

      <InfoCard title="Layanan Tersedia">
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>- Dashboard per role</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>- Monitoring akademik dan administrasi</Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>- Status pendaftaran dan verifikasi akun</Text>
      </InfoCard>
    </ScrollView>
  );
}
