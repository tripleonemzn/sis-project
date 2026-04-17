import { Redirect } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useProfileQuery } from '../../src/features/profile/useProfileQuery';
import { MobileTextScalePreferenceCard } from '../../src/features/theme/MobileTextScalePreferenceCard';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { useAppTheme } from '../../src/theme/AppThemeProvider';
import { useAppTextScale } from '../../src/theme/AppTextScaleProvider';

export default function AccessibilityScreen() {
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated } = useAuth();
  const { colors } = useAppTheme();
  const { typography } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 40 });
  const profileQuery = useProfileQuery(isAuthenticated);
  const profile = profileQuery.data?.profile;

  if (isLoading) {
    return <AppLoadingScreen message="Menyiapkan pengaturan aksesibilitas..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={pageContentPadding}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 1.2 }}>PENGATURAN</Text>
        <Text style={{ color: colors.text, ...typography.pageTitle, marginTop: 6 }}>Aksesibilitas</Text>
        <Text style={{ color: colors.textMuted, ...typography.body, marginTop: 8 }}>
          Atur ukuran teks aplikasi agar tetap nyaman dibaca sesuai kebutuhan penglihatan Anda, tanpa mengubah alur
          utama penggunaan aplikasi.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: colors.text, ...typography.cardTitle }}>Tampilan yang lebih nyaman</Text>
        <Text style={{ color: colors.textMuted, ...typography.bodyCompact, marginTop: 8 }}>
          Gunakan menu ini jika teks di layar terasa terlalu kecil saat membuka beranda, profil, materi, nilai, atau
          ketika mengikuti ujian dari perangkat mobile.
        </Text>
      </View>

      {profileQuery.isLoading ? <QueryStateView type="loading" message="Memuat preferensi aksesibilitas..." /> : null}

      {profileQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat pengaturan aksesibilitas."
          onRetry={() => profileQuery.refetch()}
        />
      ) : null}

      {profileQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={profileQuery.data.cachedAt} /> : null}

      {profile ? (
        <MobileTextScalePreferenceCard userId={profile.id} currentPreferences={profile.preferences} />
      ) : null}
    </ScrollView>
  );
}
