import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { getRoleMenu } from '../../../src/features/dashboard/roleMenu';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';

function resolveWebUrl(path: string) {
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${webBaseUrl}${normalizedPath}`;
}

export default function GenericWebModuleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ moduleKey?: string; path?: string; url?: string; label?: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [isOpening, setIsOpening] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const moduleKey = typeof params.moduleKey === 'string' ? params.moduleKey : '';
  const pathOverride = typeof params.path === 'string' ? params.path.trim() : '';
  const urlOverride = typeof params.url === 'string' ? params.url.trim() : '';
  const labelOverride = typeof params.label === 'string' ? params.label.trim() : '';
  const menuItem = user ? getRoleMenu(user).find((item) => item.key === moduleKey) : null;
  const effectiveWebPath = pathOverride || menuItem?.webPath || '';
  const effectiveLabel = labelOverride || menuItem?.label || 'Modul Web';
  const moduleUrl = useMemo(
    () => (urlOverride || (effectiveWebPath ? resolveWebUrl(effectiveWebPath) : null)),
    [effectiveWebPath, urlOverride],
  );
  const openModuleUrl = useCallback(async () => {
    if (!moduleUrl || isOpening) return;

    setIsOpening(true);
    try {
      await Linking.openURL(moduleUrl);
    } catch {
      Alert.alert('Gagal Membuka Modul', 'Tidak bisa membuka modul web di browser perangkat.');
    } finally {
      setIsOpening(false);
    }
  }, [isOpening, moduleUrl]);

  useEffect(() => {
    if (!moduleUrl || hasAutoOpened) return;
    setHasAutoOpened(true);
    void openModuleUrl();
  }, [hasAutoOpened, moduleUrl, openModuleUrl]);

  if (isLoading) return <AppLoadingScreen message="Memuat modul..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!user) return <Redirect href="/welcome" />;

  if (!moduleKey || !moduleUrl) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Modul Tidak Tersedia
        </Text>
        <QueryStateView type="error" message="Menu ini tidak tersedia untuk akun Anda saat ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        {effectiveLabel}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Modul ini belum tersedia penuh secara native. Versi web akan dibuka di browser perangkat.
      </Text>

      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#dbe7fb',
          backgroundColor: '#fff',
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Status Modul</Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>
          Akses web eksternal aktif. Gunakan tombol di bawah jika browser tidak terbuka otomatis.
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
          Modul web: {effectiveWebPath || '-'}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
          URL referensi: {moduleUrl || '-'}
        </Text>
      </View>

      <Pressable
        onPress={() => void openModuleUrl()}
        disabled={isOpening}
        style={{
          marginTop: 6,
          backgroundColor: BRAND_COLORS.blue,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: isOpening ? 0.7 : 1,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{isOpening ? 'Membuka...' : 'Buka Modul Web'}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 10,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#c7d6f5',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
