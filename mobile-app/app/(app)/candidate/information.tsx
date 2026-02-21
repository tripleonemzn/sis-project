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

export default function CandidateInformationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);

  if (isLoading) return <AppLoadingScreen message="Memuat informasi PPDB..." />;
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
          Informasi PPDB
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan alur pendaftaran peserta didik baru yang bisa diakses langsung dari mobile.
      </Text>

      <InfoCard title="Alur Pendaftaran">
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>1. Buat akun pendaftar.</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>2. Lengkapi data profil dan dokumen.</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>3. Tunggu verifikasi admin/operator.</Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>4. Ikuti arahan lanjutan dari sekolah.</Text>
      </InfoCard>

      <InfoCard title="Dokumen Umum">
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>- Identitas diri (NISN/NIK).</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>- Data orang tua/wali.</Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>- Dokumen pendukung sesuai kebijakan sekolah.</Text>
      </InfoCard>

      <InfoCard title="Aksi Cepat">
        <Pressable
          onPress={() => router.push('/candidate/application' as never)}
          style={{
            alignSelf: 'flex-start',
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Cek Status Pendaftaran</Text>
        </Pressable>
      </InfoCard>
    </ScrollView>
  );
}
