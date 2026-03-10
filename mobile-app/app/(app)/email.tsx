import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, UIManager, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../src/config/brand';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { webmailApi } from '../../src/features/webmail/webmailApi';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';

const ALLOWED_WEBMAIL_ROLES = new Set(['ADMIN', 'TEACHER', 'PRINCIPAL', 'STAFF', 'EXTRACURRICULAR_TUTOR']);
const MAILBOX_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,62}$/;

type BridgeCredentials = {
  email: string;
  password: string;
};

function resolveErrorMessage(error: unknown, fallback: string) {
  const messageFromResponse =
    typeof error === 'object' && error && 'response' in error
      ? (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
      : null;
  if (typeof messageFromResponse === 'string' && messageFromResponse.trim().length > 0) {
    return messageFromResponse.trim();
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return fallback;
}

function buildStorageKey(userId?: number | null) {
  if (!userId) return '';
  return `sis-mobile-webmail-mode:${userId}`;
}

function getBridgeLoginUrl(rawUrl: string) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(rawUrl || '').trim();
  }
}

function getInboxUrl(rawLoginUrl: string) {
  try {
    const parsed = new URL(rawLoginUrl);
    parsed.search = '';
    parsed.hash = '';
    parsed.searchParams.set('_task', 'mail');
    parsed.searchParams.set('_mbox', 'INBOX');
    parsed.searchParams.set('_layout', 'list');
    parsed.searchParams.set('_skin', 'elastic');
    return parsed.toString();
  } catch {
    return rawLoginUrl;
  }
}

function asQuotaLabel(quotaMb?: number | null) {
  const mb = Number(quotaMb || 0);
  if (!Number.isFinite(mb) || mb <= 0) return '5 GB';
  const gb = mb / 1024;
  return Number.isInteger(gb) ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}

function encodeFormBody(payload: Record<string, string>) {
  return Object.entries(payload)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export default function MobileEmailScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 16 });
  const webviewRef = useRef<WebView | null>(null);
  const hasNativeWebView = useMemo(() => Boolean(UIManager.getViewManagerConfig?.('RNCWebView')), []);
  const [webmailUrl, setWebmailUrl] = useState<string | null>(null);
  const [webviewKey, setWebviewKey] = useState(0);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isWebmailMode, setIsWebmailMode] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [registerUser, setRegisterUser] = useState('');
  const [registerPass, setRegisterPass] = useState('');
  const [registerPassConfirm, setRegisterPassConfirm] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [bridgeCredentials, setBridgeCredentials] = useState<BridgeCredentials | null>(null);

  const isAllowedRole = useMemo(() => {
    const role = String(user?.role || '').toUpperCase();
    return ALLOWED_WEBMAIL_ROLES.has(role);
  }, [user?.role]);

  const configQuery = useQuery({
    queryKey: ['mobile-webmail-config'],
    queryFn: () => webmailApi.getConfig(),
    enabled: isAuthenticated && isAllowedRole,
    staleTime: 5 * 60 * 1000,
  });

  const config = configQuery.data;
  const userStorageKey = useMemo(() => buildStorageKey(user?.id), [user?.id]);
  const webmailBaseUrl = String(config?.webmailUrl || '').trim();
  const bridgeLoginUrl = useMemo(() => getBridgeLoginUrl(webmailBaseUrl), [webmailBaseUrl]);
  const inboxUrl = useMemo(() => getInboxUrl(bridgeLoginUrl), [bridgeLoginUrl]);
  const isSsoMode = config?.mode === 'SSO' && Boolean(config?.ssoEnabled);
  const mailboxDomain = String(config?.defaultDomain || 'siskgb2.id').trim().toLowerCase() || 'siskgb2.id';
  const selfRegistrationEnabled = !isSsoMode && Boolean(config?.selfRegistrationEnabled);
  const quotaLabel = asQuotaLabel(config?.mailboxQuotaMb);

  const startSsoMutation = useMutation({
    mutationFn: () => webmailApi.startSso(),
    onSuccess: async (data) => {
      setPanelError(null);
      setWebmailUrl(data.launchUrl);
      setIsWebmailMode(true);
      setWebviewKey((value) => value + 1);
      if (userStorageKey) {
        await AsyncStorage.setItem(userStorageKey, '1');
      }
    },
    onError: (error) => {
      setPanelError(resolveErrorMessage(error, 'Gagal menyiapkan sesi SSO webmail.'));
    },
  });

  const registerMutation = useMutation({
    mutationFn: webmailApi.register,
    onSuccess: async (result, variables) => {
      const mailboxIdentity = String(result.mailboxIdentity || '').trim().toLowerCase();
      if (!mailboxIdentity) {
        setRegisterError('Mailbox berhasil dibuat, tetapi identitas mailbox tidak ditemukan.');
        return;
      }
      setRegisterError(null);
      setIsRegisterMode(false);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setLoginUser(mailboxIdentity);
      setLoginPass(variables.password);
      setBridgeCredentials({ email: mailboxIdentity, password: variables.password });
      setWebmailUrl(bridgeLoginUrl);
      setIsWebmailMode(true);
      setWebviewKey((value) => value + 1);
      if (userStorageKey) {
        await AsyncStorage.setItem(userStorageKey, '1');
      }
    },
    onError: (error) => {
      setRegisterError(resolveErrorMessage(error, 'Gagal membuat akun webmail.'));
    },
  });

  useEffect(() => {
    if (!config || !userStorageKey) return;
    let cancelled = false;

    const restoreMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(userStorageKey);
        if (cancelled || stored !== '1') return;

        if (isSsoMode) {
          startSsoMutation.mutate();
          return;
        }

        setPanelError(null);
        setWebmailUrl(inboxUrl);
        setIsWebmailMode(true);
        setWebviewKey((value) => value + 1);
      } catch {
        // Ignore storage read errors.
      }
    };

    void restoreMode();
    return () => {
      cancelled = true;
    };
  }, [config, inboxUrl, isSsoMode, startSsoMutation, userStorageKey]);

  const openBridgePanel = async (email: string, password: string) => {
    setPanelError(null);
    setBridgeCredentials({ email, password });
    setWebmailUrl(bridgeLoginUrl);
    setIsWebmailMode(true);
    setWebviewKey((value) => value + 1);
    if (userStorageKey) {
      await AsyncStorage.setItem(userStorageKey, '1');
    }
  };

  const leavePanelMode = async () => {
    setIsWebmailMode(false);
    setBridgeCredentials(null);
    setPanelError(null);
    setWebmailUrl(null);
    setWebviewKey((value) => value + 1);
    if (userStorageKey) {
      await AsyncStorage.removeItem(userStorageKey);
    }
  };

  const handleLogin = async () => {
    if (!config) return;
    if (isSsoMode) {
      startSsoMutation.mutate();
      return;
    }

    const normalizedEmail = loginUser.trim().toLowerCase();
    if (!normalizedEmail || !loginPass.trim()) {
      setPanelError('Email dan password webmail wajib diisi.');
      return;
    }

    await openBridgePanel(normalizedEmail, loginPass);
  };

  const handleRegister = () => {
    if (!selfRegistrationEnabled) return;

    const username = registerUser.trim().toLowerCase();
    const password = registerPass;
    const confirmPassword = registerPassConfirm;

    if (!username) {
      setRegisterError('Username mailbox wajib diisi.');
      return;
    }
    if (!MAILBOX_USERNAME_PATTERN.test(username)) {
      setRegisterError('Username hanya boleh huruf kecil, angka, titik, underscore, atau dash (3-63 karakter).');
      return;
    }
    if (!password || !confirmPassword) {
      setRegisterError('Password dan konfirmasi password wajib diisi.');
      return;
    }
    if (password.length < 8) {
      setRegisterError('Password minimal 8 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setRegisterError('Konfirmasi password tidak cocok.');
      return;
    }

    setRegisterError(null);
    registerMutation.mutate({ username, password, confirmPassword });
  };

  const handleReload = () => {
    if (isSsoMode) {
      startSsoMutation.mutate();
      return;
    }
    setPanelError(null);
    webviewRef.current?.reload();
  };

  if (isLoading) return <AppLoadingScreen message="Memuat Email..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!isAllowedRole) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={pagePadding}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Email</Text>
          <QueryStateView type="error" message="Fitur email tidak tersedia untuk role Anda." />
        </View>
      </View>
    );
  }

  if (configQuery.isLoading && !config) {
    return <AppLoadingScreen message="Memuat konfigurasi webmail..." />;
  }

  if (configQuery.isError || !config) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={pagePadding}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Email</Text>
          <QueryStateView
            type="error"
            message={resolveErrorMessage(configQuery.error, 'Gagal memuat konfigurasi webmail.')}
            onRetry={() => configQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  const modeLabel = isSsoMode ? 'SSO Aktif' : 'Bridge Login';
  const mailboxIdentity = config.mailboxIdentity || '-';
  const webSource = bridgeCredentials
    ? {
        uri: bridgeLoginUrl,
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormBody({
          login_user: bridgeCredentials.email,
          pass_user: bridgeCredentials.password,
        }),
      }
    : {
        uri: webmailUrl || inboxUrl,
      };

  return (
    <View style={{ flex: 1, backgroundColor: '#e9eefb' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: Math.max(insets.top, 10), paddingBottom: 10 }}>
        <View style={{ paddingHorizontal: 12, gap: 10 }}>
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#dbe4f4',
              backgroundColor: '#ffffff',
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: BRAND_COLORS.textDark }}>Portal Webmail</Text>
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#c7d2fe',
                  backgroundColor: '#eef2ff',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, color: '#1d4ed8', fontWeight: '700' }}>{modeLabel}</Text>
              </View>
            </View>

            <Text style={{ fontSize: 12, color: '#64748b' }}>Mailbox terdeteksi: {mailboxIdentity}</Text>
          </View>

          {!isWebmailMode ? (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#dbe4f4',
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 12,
                gap: 8,
              }}
            >
              {!isRegisterMode ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Login ke akun webmail</Text>

                  {isSsoMode ? (
                    <View
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#c7d2fe',
                        backgroundColor: '#eef2ff',
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#1e3a8a', fontSize: 12 }}>
                        Mode keamanan SSO aktif. Tekan tombol di bawah untuk masuk ke panel email.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        value={loginUser}
                        onChangeText={setLoginUser}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        placeholder={`username@${mailboxDomain}`}
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 10,
                          color: BRAND_COLORS.textDark,
                        }}
                      />
                      <TextInput
                        value={loginPass}
                        onChangeText={setLoginPass}
                        secureTextEntry
                        placeholder="Masukkan password webmail"
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 10,
                          color: BRAND_COLORS.textDark,
                        }}
                      />
                    </>
                  )}

                  {panelError ? <Text style={{ color: '#b91c1c', fontSize: 12 }}>{panelError}</Text> : null}

                  <Pressable
                    onPress={() => {
                      void handleLogin();
                    }}
                    disabled={startSsoMutation.isPending}
                    style={{
                      borderRadius: 10,
                      backgroundColor: '#f59e0b',
                      paddingVertical: 11,
                      alignItems: 'center',
                      opacity: startSsoMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#111827', fontWeight: '700' }}>
                      {startSsoMutation.isPending ? 'Menyiapkan...' : 'Masuk Webmail'}
                    </Text>
                  </Pressable>

                  {selfRegistrationEnabled ? (
                    <Pressable
                      onPress={() => {
                        setRegisterError(null);
                        setIsRegisterMode(true);
                      }}
                      style={{
                        borderRadius: 10,
                        backgroundColor: '#3250b9',
                        paddingVertical: 11,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Daftar Akun Webmail</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Daftar akun webmail</Text>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <TextInput
                      value={registerUser}
                      onChangeText={setRegisterUser}
                      autoCapitalize="none"
                      placeholder="username"
                      placeholderTextColor="#94a3b8"
                      style={{ flex: 1, color: BRAND_COLORS.textDark, padding: 0 }}
                    />
                    <Text style={{ color: '#64748b' }}>@{mailboxDomain}</Text>
                  </View>

                  <TextInput
                    value={registerPass}
                    onChangeText={setRegisterPass}
                    secureTextEntry
                    placeholder="Buat password webmail"
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      color: BRAND_COLORS.textDark,
                    }}
                  />

                  <TextInput
                    value={registerPassConfirm}
                    onChangeText={setRegisterPassConfirm}
                    secureTextEntry
                    placeholder="Konfirmasi password"
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      color: BRAND_COLORS.textDark,
                    }}
                  />

                  <Text style={{ color: '#64748b', fontSize: 12 }}>Kapasitas mailbox: {quotaLabel} per user.</Text>
                  {registerError ? <Text style={{ color: '#b91c1c', fontSize: 12 }}>{registerError}</Text> : null}

                  <Pressable
                    onPress={() => handleRegister()}
                    disabled={registerMutation.isPending}
                    style={{
                      borderRadius: 10,
                      backgroundColor: '#3250b9',
                      paddingVertical: 11,
                      alignItems: 'center',
                      opacity: registerMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {registerMutation.isPending ? 'Memproses...' : 'Daftar'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setIsRegisterMode(false)}
                    style={{
                      borderRadius: 10,
                      backgroundColor: '#f59e0b',
                      paddingVertical: 11,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#111827', fontWeight: '700' }}>Kembali ke Login</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#dbe4f4',
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Pressable
                onPress={handleReload}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 9,
                  paddingVertical: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                <Feather name="refresh-cw" size={14} color="#1e293b" />
                <Text style={{ color: '#1e293b', fontSize: 12, fontWeight: '700' }}>Muat Ulang</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void leavePanelMode();
                }}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#fed7aa',
                  backgroundColor: '#fff7ed',
                  borderRadius: 9,
                  paddingVertical: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                <Feather name="log-out" size={14} color="#c2410c" />
                <Text style={{ color: '#c2410c', fontSize: 12, fontWeight: '700' }}>Kembali ke Form</Text>
              </Pressable>
            </View>
          )}
        </View>

        {isWebmailMode ? (
          <View style={{ flex: 1, minHeight: 520, marginHorizontal: 12, marginTop: 10, marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#dbe4f4',
                overflow: 'hidden',
                backgroundColor: '#fff',
              }}
            >
              {panelError ? (
                <View style={{ padding: 16 }}>
                  <QueryStateView type="error" message={panelError} onRetry={handleReload} />
                </View>
              ) : startSsoMutation.isPending ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={{ fontSize: 13, color: '#64748b' }}>Menyiapkan sesi email...</Text>
                </View>
              ) : webmailUrl || inboxUrl ? (
                hasNativeWebView ? (
                  <WebView
                    key={`mobile-email-webview-${webviewKey}`}
                    ref={webviewRef}
                    source={webSource}
                    startInLoadingState
                    javaScriptEnabled
                    domStorageEnabled
                    sharedCookiesEnabled
                    thirdPartyCookiesEnabled
                    onLoadEnd={() => {
                      if (!bridgeCredentials) return;
                      setBridgeCredentials(null);
                      setWebmailUrl(inboxUrl);
                      setLoginPass('');
                    }}
                    onHttpError={() => {
                      setPanelError('Panel email gagal dimuat. Coba muat ulang sesi.');
                    }}
                    onError={() => {
                      setPanelError('Koneksi ke panel email gagal. Periksa koneksi dan coba lagi.');
                    }}
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                    <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', marginBottom: 6 }}>
                      Modul Email membutuhkan versi aplikasi terbaru.
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                      Silakan update APK/internal build terbaru lalu buka ulang menu Email.
                    </Text>
                  </View>
                )
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
                  <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                    URL email belum tersedia. Coba sinkronisasi konfigurasi.
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
