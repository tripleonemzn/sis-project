import { Feather } from '@expo/vector-icons';
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

function isInternalDashboardUrl(rawUrl: string) {
  if (!rawUrl || isPdfUrl(rawUrl)) return false;

  try {
    const parsed = new URL(rawUrl);
    const webBaseUrl = new URL(ENV.API_BASE_URL.replace(/\/api\/?$/, ''));
    return parsed.origin === webBaseUrl.origin;
  } catch {
    return false;
  }
}

export default function GenericWebModuleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ moduleKey?: string; path?: string; url?: string; label?: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 18, topMin: 18, topOffset: 6 });
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
  const shouldHideWebChrome = useMemo(() => Boolean(moduleUrl && isInternalDashboardUrl(moduleUrl)), [moduleUrl]);
  const injectedBeforeLoad = useMemo(() => {
    const serializedToken = JSON.stringify(accessToken || '');
    const serializedHideChrome = shouldHideWebChrome ? 'true' : 'false';
    return `
      (function() {
        try {
          var token = ${serializedToken};
          if (token) {
            window.localStorage.setItem('token', token);
            window.sessionStorage.setItem('mobileEmbeddedTokenReady', '1');
          }
          window.sessionStorage.setItem('mobileEmbeddedShell', '1');

          var shouldHideChrome = ${serializedHideChrome};
          if (shouldHideChrome) {
            var applyEmbeddedLayout = function() {
              try {
                var styleId = 'mobile-embedded-shell-style';
                var style = document.getElementById(styleId);
                if (!style) {
                  style = document.createElement('style');
                  style.id = styleId;
                  document.head.appendChild(style);
                }

                style.innerHTML = [
                  'html, body { background: #f8fafc !important; overflow-x: hidden !important; }',
                  'body { overscroll-behavior-x: none !important; }',
                  '.mobile-embedded-hidden { display: none !important; }',
                  '.mobile-embedded-main { width: 100% !important; max-width: 100% !important; overflow: visible !important; padding: 12px !important; padding-bottom: 20px !important; }',
                ].join('\\n');

                var root = document.body ? document.body.firstElementChild : null;
                if (root && root.tagName === 'DIV') {
                  root.style.minHeight = '100vh';
                  root.style.height = 'auto';
                  root.style.background = '#f8fafc';
                  root.style.overflow = 'visible';

                  var rootChildren = Array.prototype.slice.call(root.children || []);
                  rootChildren.forEach(function(child) {
                    if (child && child.tagName === 'ASIDE') {
                      child.classList.add('mobile-embedded-hidden');
                    }
                  });

                  var shell = null;
                  for (var i = 0; i < rootChildren.length; i += 1) {
                    if (rootChildren[i] && rootChildren[i].tagName === 'DIV') {
                      shell = rootChildren[i];
                      break;
                    }
                  }

                  if (shell) {
                    shell.style.width = '100%';
                    shell.style.maxWidth = '100%';
                    shell.style.flex = '1 1 auto';
                    shell.style.overflow = 'visible';

                    var shellChildren = Array.prototype.slice.call(shell.children || []);
                    shellChildren.forEach(function(child) {
                      if (!child || !child.tagName) return;
                      if (child.tagName === 'HEADER') {
                        child.classList.add('mobile-embedded-hidden');
                        return;
                      }
                      if (child.tagName === 'MAIN') {
                        child.classList.add('mobile-embedded-main');
                      }
                    });
                  }
                }

                Array.prototype.slice.call(document.querySelectorAll('body > div.fixed')).forEach(function(node) {
                  node.classList.add('mobile-embedded-hidden');
                });
              } catch (error) {}
            };

            applyEmbeddedLayout();
            window.addEventListener('load', applyEmbeddedLayout);
            setTimeout(applyEmbeddedLayout, 120);
            setTimeout(applyEmbeddedLayout, 700);

            if (typeof MutationObserver !== 'undefined') {
              var observer = new MutationObserver(function() {
                applyEmbeddedLayout();
              });
              observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
            }
          }
        } catch (error) {}
        true;
      })();
    `;
  }, [accessToken, shouldHideWebChrome]);

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
          <Pressable
            onPress={() => router.replace('/home')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#d6e0f2',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark }}>
              {effectiveLabel}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => {
            setPanelError(null);
            setWebviewKey((value) => value + 1);
          }}
          style={{
            minWidth: 44,
            height: 38,
            borderRadius: 11,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 12,
          }}
        >
          <Feather name="refresh-cw" size={16} color={BRAND_COLORS.navy} />
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 420,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#dbe7fb',
          backgroundColor: '#fff',
          overflow: 'hidden',
          shadowColor: '#1f3f8f',
          shadowOpacity: 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
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
              setPanelError('Konten gagal dimuat. Coba muat ulang dari tombol kanan atas.');
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
    </View>
  );
}
