import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, UIManager, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../src/config/brand';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { MOBILE_NOTIFICATIONS_QUERY_KEY } from '../../src/features/notifications/notificationApi';
import { MobileWebmailMessageSummary, webmailApi } from '../../src/features/webmail/webmailApi';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError } from '../../src/lib/ui/feedback';

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

function formatDateTime(value?: string | null) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractSenderLabel(item: { fromLabel?: string | null; from?: string | null }) {
  return String(item.fromLabel || item.from || 'pengirim tidak dikenal').trim() || 'pengirim tidak dikenal';
}

function extractSubjectLabel(item: { subject?: string | null }) {
  return String(item.subject || '').trim() || '(Tanpa subjek)';
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#dbe4f4',
        backgroundColor: '#ffffff',
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 12,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function EmailInboxItem({
  item,
  selected,
  onPress,
}: {
  item: MobileWebmailMessageSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const senderLabel = extractSenderLabel(item);
  const subjectLabel = extractSubjectLabel(item);

  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? '#93c5fd' : item.isRead ? '#e2e8f0' : '#bfdbfe',
        backgroundColor: selected ? '#eff6ff' : item.isRead ? '#ffffff' : '#f8fbff',
        paddingHorizontal: 12,
        paddingVertical: 11,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: item.isRead ? '#dbe4f4' : '#bfdbfe',
            backgroundColor: item.isRead ? '#f8fafc' : '#eff6ff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="mail" size={16} color={item.isRead ? '#64748b' : '#2563eb'} />
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: '#0f172a', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              {senderLabel}
            </Text>
            {!item.isRead ? (
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  backgroundColor: '#dbeafe',
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontSize: 10, color: '#1d4ed8', fontWeight: '800' }}>BARU</Text>
              </View>
            ) : null}
          </View>

          <Text style={{ color: '#334155', fontWeight: item.isRead ? '600' : '700', fontSize: 13 }} numberOfLines={2}>
            {subjectLabel}
          </Text>

          <Text style={{ color: '#64748b', fontSize: 11 }}>{formatDateTime(item.date)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function MobileEmailScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
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
  const [hasEditedLoginUser, setHasEditedLoginUser] = useState(false);
  const [loginPass, setLoginPass] = useState('');
  const [registerUser, setRegisterUser] = useState('');
  const [registerPass, setRegisterPass] = useState('');
  const [registerPassConfirm, setRegisterPassConfirm] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [bridgeCredentials, setBridgeCredentials] = useState<BridgeCredentials | null>(null);
  const [selectedEmailGuid, setSelectedEmailGuid] = useState<string | null>(null);

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

  const emailFeedQuery = useQuery({
    queryKey: ['mobile-email-inbox-feed', configQuery.data?.mailboxIdentity || 'all'],
    queryFn: () => webmailApi.getMessages({ page: 1, limit: 20 }),
    enabled: isAuthenticated && isAllowedRole,
    staleTime: 15_000,
    refetchInterval: isAuthenticated && isAllowedRole ? 20_000 : false,
    refetchOnReconnect: true,
  });

  const config = configQuery.data;
  const webmailBaseUrl = String(config?.webmailUrl || '').trim();
  const bridgeLoginUrl = useMemo(() => getBridgeLoginUrl(webmailBaseUrl), [webmailBaseUrl]);
  const inboxUrl = useMemo(() => getInboxUrl(bridgeLoginUrl), [bridgeLoginUrl]);
  const isSsoMode = config?.mode === 'SSO' && Boolean(config?.ssoEnabled);
  const mailboxDomain = String(config?.defaultDomain || 'siskgb2.id').trim().toLowerCase() || 'siskgb2.id';
  const selfRegistrationEnabled = !isSsoMode && Boolean(config?.selfRegistrationEnabled);
  const quotaLabel = asQuotaLabel(config?.mailboxQuotaMb);
  const mailboxIdentity = String(config?.mailboxIdentity || '').trim().toLowerCase();
  const loginIdentityValue = hasEditedLoginUser ? loginUser : mailboxIdentity;

  const mailboxMessages = useMemo(() => emailFeedQuery.data?.messages ?? [], [emailFeedQuery.data?.messages]);

  const markAsReadMutation = useMutation({
    mutationFn: (guid: string) => webmailApi.markMessageRead(guid),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-email-inbox-feed'],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-email-message-detail'],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: MOBILE_NOTIFICATIONS_QUERY_KEY,
        refetchType: 'active',
      });
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menandai email sebagai dibaca.');
    },
  });

  const unreadEmailCount = useMemo(
    () => mailboxMessages.filter((item) => !item.isRead).length,
    [mailboxMessages],
  );

  const effectiveSelectedEmailGuid = useMemo(() => {
    if (selectedEmailGuid && mailboxMessages.some((item) => item.guid === selectedEmailGuid)) {
      return selectedEmailGuid;
    }
    return mailboxMessages.find((item) => !item.isRead)?.guid ?? mailboxMessages[0]?.guid ?? null;
  }, [mailboxMessages, selectedEmailGuid]);

  const selectedEmail = useMemo(
    () => mailboxMessages.find((item) => item.guid === effectiveSelectedEmailGuid) ?? null,
    [effectiveSelectedEmailGuid, mailboxMessages],
  );

  const selectedEmailDetailQuery = useQuery({
    queryKey: ['mobile-email-message-detail', effectiveSelectedEmailGuid || 'empty'],
    queryFn: () => webmailApi.getMessageDetail(String(effectiveSelectedEmailGuid)),
    enabled: Boolean(effectiveSelectedEmailGuid) && isAuthenticated && isAllowedRole && emailFeedQuery.data?.mailboxAvailable !== false,
    staleTime: 15_000,
  });

  const startSsoMutation = useMutation({
    mutationFn: () => webmailApi.startSso(),
    onSuccess: (data) => {
      setPanelError(null);
      setWebmailUrl(data.launchUrl);
      setIsWebmailMode(true);
      setWebviewKey((value) => value + 1);
    },
    onError: (error) => {
      setPanelError(resolveErrorMessage(error, 'Gagal menyiapkan sesi SSO webmail.'));
    },
  });

  const registerMutation = useMutation({
    mutationFn: webmailApi.register,
    onSuccess: (result, variables) => {
      const createdMailboxIdentity = String(result.mailboxIdentity || '').trim().toLowerCase();
      if (!createdMailboxIdentity) {
        setRegisterError('Mailbox berhasil dibuat, tetapi identitas mailbox tidak ditemukan.');
        return;
      }

      setRegisterError(null);
      setIsRegisterMode(false);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setLoginUser(createdMailboxIdentity);
      setHasEditedLoginUser(true);
      setLoginPass(variables.password);
      setBridgeCredentials({ email: createdMailboxIdentity, password: variables.password });
      setWebmailUrl(bridgeLoginUrl);
      setIsWebmailMode(true);
      setWebviewKey((value) => value + 1);
    },
    onError: (error) => {
      setRegisterError(resolveErrorMessage(error, 'Gagal membuat akun webmail.'));
    },
  });

  const openBridgePanel = async (email: string, password: string) => {
    setPanelError(null);
    setBridgeCredentials({ email, password });
    setWebmailUrl(bridgeLoginUrl);
    setIsWebmailMode(true);
    setWebviewKey((value) => value + 1);
  };

  const leavePanelMode = () => {
    setIsWebmailMode(false);
    setBridgeCredentials(null);
    setPanelError(null);
    setWebmailUrl(null);
    setWebviewKey((value) => value + 1);
  };

  const handleLogin = async () => {
    if (!config) return;
    if (isSsoMode) {
      startSsoMutation.mutate();
      return;
    }

    const normalizedEmail = loginIdentityValue.trim().toLowerCase();
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

  const handleSelectEmail = async (item: MobileWebmailMessageSummary) => {
    setSelectedEmailGuid(item.guid);
    if (item.isRead) return;
    try {
      await markAsReadMutation.mutateAsync(item.guid);
    } catch {
      // Error is surfaced by mutation handler.
    }
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
    return <AppLoadingScreen message="Memuat konfigurasi email..." />;
  }

  if (configQuery.isError || !config) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={pagePadding}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Email</Text>
          <QueryStateView
            type="error"
            message={resolveErrorMessage(configQuery.error, 'Gagal memuat konfigurasi email.')}
            onRetry={() => configQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  const modeLabel = isSsoMode ? 'SSO Aktif' : 'Bridge Login';
  const selectedSenderLabel = selectedEmail ? extractSenderLabel(selectedEmail) : '-';
  const selectedSubjectLabel = selectedEmail ? extractSubjectLabel(selectedEmail) : '-';
  const latestEmailAt = mailboxMessages[0] ? formatDateTime(mailboxMessages[0].date) : '-';
  const selectedBodyText =
    selectedEmailDetailQuery.data?.plainText ||
    selectedEmailDetailQuery.data?.previewText ||
    selectedEmail?.snippet ||
    '';
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
          <SectionCard
            title="Email"
            subtitle="Kotak masuk utama sekarang ditampilkan langsung di mobile. Panel webmail lengkap tetap tersedia untuk pencarian lanjutan, arsip, dan compose."
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  backgroundColor: '#eff6ff',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#1d4ed8' }}>{modeLabel}</Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: unreadEmailCount > 0 ? '#fecaca' : '#dbeafe',
                  backgroundColor: unreadEmailCount > 0 ? '#fef2f2' : '#f8fafc',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: unreadEmailCount > 0 ? '#b91c1c' : '#334155' }}>
                  {unreadEmailCount} belum dibaca
                </Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>
                Mailbox: {mailboxIdentity || 'Belum terhubung'}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                Email terbaru: {latestEmailAt} • Kuota: {quotaLabel}
              </Text>
            </View>
          </SectionCard>

          <SectionCard
            title="Kotak Masuk"
            subtitle="Daftar ini sekarang membaca mailbox sungguhan dari server, jadi isi inbox mobile dan panel email bisa tetap searah."
          >
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => emailFeedQuery.refetch()}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  backgroundColor: '#ffffff',
                }}
              >
                {emailFeedQuery.isFetching && !emailFeedQuery.isLoading ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Feather name="refresh-cw" size={14} color="#1e293b" />
                )}
                <Text style={{ color: '#1e293b', fontSize: 12, fontWeight: '700' }}>Sinkronkan Inbox</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPanelError(null);
                  setIsRegisterMode(false);
                  setIsWebmailMode(false);
                  if (isSsoMode) {
                    startSsoMutation.mutate();
                  }
                }}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor: '#3250b9',
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                <Feather name="inbox" size={14} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                  {isSsoMode ? 'Buka Panel Lengkap' : 'Akses Panel Lengkap'}
                </Text>
              </Pressable>
            </View>

            {emailFeedQuery.isLoading ? (
              <View style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={{ color: '#64748b', fontSize: 12 }}>Memuat kotak masuk...</Text>
              </View>
            ) : emailFeedQuery.isError ? (
              <QueryStateView
                type="error"
                message={resolveErrorMessage(emailFeedQuery.error, 'Gagal memuat kotak masuk email.')}
                onRetry={() => emailFeedQuery.refetch()}
              />
            ) : emailFeedQuery.data?.mailboxAvailable === false ? (
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#fde68a',
                  backgroundColor: '#fffbeb',
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                  gap: 6,
                }}
              >
                <Text style={{ color: '#92400e', fontWeight: '700' }}>Mailbox belum tersedia</Text>
                <Text style={{ color: '#78350f', fontSize: 12, lineHeight: 18 }}>
                  Akun ini sudah dikenali, tetapi mailbox di server mail belum aktif. Jika role Anda mendukung pendaftaran mandiri, buat mailbox dulu di bagian panel bawah.
                </Text>
              </View>
            ) : mailboxMessages.length === 0 ? (
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  backgroundColor: '#f8fafc',
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                  gap: 6,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>Inbox masih kosong</Text>
                <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                  Begitu email baru masuk ke mailbox sekolah, daftar inbox di sini akan langsung ikut terisi dan notifikasinya juga tetap masuk ke HP.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {mailboxMessages.map((item) => (
                  <EmailInboxItem
                    key={item.guid}
                    item={item}
                    selected={item.guid === effectiveSelectedEmailGuid}
                    onPress={() => {
                      void handleSelectEmail(item);
                    }}
                  />
                ))}
              </View>
            )}

            {selectedEmail ? (
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                  backgroundColor: '#f8fbff',
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  gap: 8,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 14 }}>Detail Email Terpilih</Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>
                  Dari: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{selectedSenderLabel}</Text>
                </Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>
                  Subjek: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{selectedSubjectLabel}</Text>
                </Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>
                  Waktu: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{formatDateTime(selectedEmail.date)}</Text>
                </Text>
                {selectedEmailDetailQuery.isLoading ? (
                  <View style={{ paddingVertical: 8, alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Memuat isi email...</Text>
                  </View>
                ) : selectedEmailDetailQuery.isError ? (
                  <QueryStateView
                    type="error"
                    message={resolveErrorMessage(selectedEmailDetailQuery.error, 'Gagal memuat isi email.')}
                    onRetry={() => selectedEmailDetailQuery.refetch()}
                  />
                ) : (
                  <View
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#dbe4f4',
                      backgroundColor: '#ffffff',
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      gap: 8,
                    }}
                  >
                    {selectedEmailDetailQuery.data?.to ? (
                      <Text style={{ color: '#334155', fontSize: 12 }}>
                        Ke: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{selectedEmailDetailQuery.data.to}</Text>
                      </Text>
                    ) : null}
                    {selectedEmailDetailQuery.data?.cc ? (
                      <Text style={{ color: '#334155', fontSize: 12 }}>
                        CC: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{selectedEmailDetailQuery.data.cc}</Text>
                      </Text>
                    ) : null}
                    <Text style={{ color: '#334155', fontSize: 12, lineHeight: 20 }}>
                      {selectedBodyText || 'Isi email tidak tersedia.'}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                      Isi email utama sekarang sudah bisa dibaca langsung dari mobile. Panel lengkap tetap dipakai untuk compose, balas email, pencarian lanjutan, atau folder arsip lain.
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => {
                    setPanelError(null);
                    if (isSsoMode) {
                      startSsoMutation.mutate();
                      return;
                    }
                    setIsWebmailMode(false);
                  }}
                  style={{
                    borderRadius: 10,
                    backgroundColor: '#0f172a',
                    paddingVertical: 11,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                    {isSsoMode ? 'Buka Inbox Lengkap' : 'Lanjut ke Panel Lengkap'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </SectionCard>

          {!isWebmailMode ? (
            <SectionCard
              title={isRegisterMode ? 'Daftar Mailbox' : 'Panel Lengkap Webmail'}
              subtitle={
                isRegisterMode
                  ? `Buat mailbox sekolah baru dengan domain @${mailboxDomain}.`
                  : 'Bagian ini dipakai hanya saat Anda perlu akses penuh seperti balas email, pencarian lanjut, atau pengelolaan folder.'
              }
            >
              {!isRegisterMode ? (
                <>
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
                      <Text style={{ color: '#1e3a8a', fontSize: 12, lineHeight: 18 }}>
                        Mode keamanan SSO aktif. Tekan tombol di bawah untuk masuk ke panel email lengkap.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        value={loginIdentityValue}
                        onChangeText={(value) => {
                          setHasEditedLoginUser(true);
                          setLoginUser(value);
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        placeholder={`username@${mailboxDomain}`}
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
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
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
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
                      borderRadius: 12,
                      backgroundColor: '#f59e0b',
                      paddingVertical: 11,
                      alignItems: 'center',
                      opacity: startSsoMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#111827', fontWeight: '700' }}>
                      {startSsoMutation.isPending ? 'Menyiapkan...' : isSsoMode ? 'Masuk Panel Lengkap' : 'Login ke Panel Lengkap'}
                    </Text>
                  </Pressable>

                  {selfRegistrationEnabled ? (
                    <Pressable
                      onPress={() => {
                        setRegisterError(null);
                        setIsRegisterMode(true);
                      }}
                      style={{
                        borderRadius: 12,
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
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
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
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
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
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      color: BRAND_COLORS.textDark,
                    }}
                  />

                  <Text style={{ color: '#64748b', fontSize: 12 }}>Kapasitas mailbox: {quotaLabel} per user.</Text>
                  {registerError ? <Text style={{ color: '#b91c1c', fontSize: 12 }}>{registerError}</Text> : null}

                  <Pressable
                    onPress={() => handleRegister()}
                    disabled={registerMutation.isPending}
                    style={{
                      borderRadius: 12,
                      backgroundColor: '#3250b9',
                      paddingVertical: 11,
                      alignItems: 'center',
                      opacity: registerMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {registerMutation.isPending ? 'Memproses...' : 'Daftar Mailbox'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setIsRegisterMode(false)}
                    style={{
                      borderRadius: 12,
                      backgroundColor: '#f59e0b',
                      paddingVertical: 11,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#111827', fontWeight: '700' }}>Kembali ke Panel</Text>
                  </Pressable>
                </>
              )}
            </SectionCard>
          ) : (
            <SectionCard
              title="Panel Lengkap Aktif"
              subtitle="Panel ini dipertahankan untuk aksi lanjutan seperti baca isi lengkap, pencarian mailbox, compose, dan pengelolaan folder."
            >
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={handleReload}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: '#ffffff',
                  }}
                >
                  <Feather name="refresh-cw" size={14} color="#1e293b" />
                  <Text style={{ color: '#1e293b', fontSize: 12, fontWeight: '700' }}>Muat Ulang</Text>
                </Pressable>

                <Pressable
                  onPress={leavePanelMode}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#fed7aa',
                    backgroundColor: '#fff7ed',
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                >
                  <Feather name="arrow-left" size={14} color="#c2410c" />
                  <Text style={{ color: '#c2410c', fontSize: 12, fontWeight: '700' }}>Kembali ke Inbox Native</Text>
                </Pressable>
              </View>
            </SectionCard>
          )}
        </View>

        {isWebmailMode ? (
          <View style={{ flex: 1, minHeight: 520, marginHorizontal: 12, marginTop: 10, marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                borderRadius: 16,
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
