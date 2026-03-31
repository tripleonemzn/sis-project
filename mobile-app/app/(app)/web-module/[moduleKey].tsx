import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { getRoleMenu } from '../../../src/features/dashboard/roleMenu';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { tokenStorage } from '../../../src/lib/storage/tokenStorage';

function resolveWebUrl(path: string) {
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${webBaseUrl}${normalizedPath}`;
}

function isPdfUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return rawUrl.toLowerCase().includes('.pdf');
  }
}

function buildEmbeddedUrl(rawUrl: string) {
  return isPdfUrl(rawUrl)
    ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(rawUrl)}`
    : rawUrl;
}

export default function GenericWebModuleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ moduleKey?: string; path?: string; url?: string; label?: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const hasNativeWebView = useMemo(() => Boolean(UIManager.getViewManagerConfig?.('RNCWebView')), []);
  const [webviewKey, setWebviewKey] = useState(0);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);

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
  const embeddedUrl = useMemo(() => (moduleUrl ? buildEmbeddedUrl(moduleUrl) : null), [moduleUrl]);
  const injectedBeforeLoad = useMemo(() => {
    const serializedToken = JSON.stringify(accessToken || '');
    return `
      (function() {
        try {
          var token = ${serializedToken};
          if (token) {
            window.localStorage.setItem('token', token);
            window.sessionStorage.setItem('mobileEmbeddedTokenReady', '1');
          }
        } catch (error) {}
        true;
      })();
    `;
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;

    tokenStorage
      .getAccessToken()
      .then((token) => {
        if (cancelled) return;
        setAccessToken(token || '');
      })
      .catch(() => {
        if (cancelled) return;
        setAccessToken('');
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!hasNativeWebView) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          {effectiveLabel}
        </Text>
        <QueryStateView
          type="error"
          message="Viewer internal belum tersedia di build ini. Silakan update aplikasi tester terbaru."
        />
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

  if (accessToken === undefined) {
    return <AppLoadingScreen message="Menyiapkan akses modul..." />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', ...pagePadding }}>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        {effectiveLabel}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Konten ini ditampilkan di dalam aplikasi agar alur mobile tetap konsisten sambil versi native penuh disiapkan.
      </Text>
      <View
        style={{
          flex: 1,
          minHeight: 420,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#dbe7fb',
          backgroundColor: '#fff',
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        {panelError ? (
          <View style={{ padding: 16 }}>
            <QueryStateView
              type="error"
              message={panelError}
              onRetry={() => {
                setPanelError(null);
                setWebviewKey((value) => value + 1);
              }}
            />
          </View>
        ) : embeddedUrl ? (
          <WebView
            key={`mobile-web-module-${moduleKey || 'generic'}-${webviewKey}`}
            source={{
              uri: embeddedUrl,
              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            }}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={BRAND_COLORS.blue} />
                <Text style={{ color: BRAND_COLORS.textMuted }}>Memuat konten...</Text>
              </View>
            )}
            onHttpError={() => {
              setPanelError('Konten gagal dimuat. Coba muat ulang dari tombol di bawah.');
            }}
            onError={() => {
              setPanelError('Koneksi ke konten gagal. Periksa jaringan Anda lalu coba lagi.');
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center' }}>
              URL konten belum tersedia untuk modul ini.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => {
          setPanelError(null);
          setWebviewKey((value) => value + 1);
        }}
        style={{
          marginTop: 6,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#c7d6f5',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Muat Ulang Konten</Text>
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
    </View>
  );
}
