import { useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, UIManager, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import MobileDetailModal from '../../src/components/MobileDetailModal';
import MobileMenuTabBar from '../../src/components/MobileMenuTabBar';
import { QueryStateView } from '../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../src/config/brand';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { MOBILE_NOTIFICATIONS_QUERY_KEY } from '../../src/features/notifications/notificationApi';
import { MobileWebmailFolderKey, MobileWebmailMessageSummary, webmailApi } from '../../src/features/webmail/webmailApi';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../src/lib/ui/feedback';
import { useIsScreenActive } from '../../src/hooks/useIsScreenActive';

const ALLOWED_WEBMAIL_ROLES = new Set(['ADMIN', 'TEACHER', 'PRINCIPAL', 'STAFF', 'EXTRACURRICULAR_TUTOR']);
const MAILBOX_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,62}$/;
const DEFAULT_EMAIL_PAGE_LIMIT = 20;
type FeatherIconName = ComponentProps<typeof Feather>['name'];
type WebmailFolderKey = MobileWebmailFolderKey;
type FolderMoveActionTone = 'primary' | 'neutral' | 'warning';

type FolderMoveAction = {
  key: string;
  label: string;
  targetFolderKey: WebmailFolderKey;
  tone: FolderMoveActionTone;
};

const WEBMAIL_FOLDER_SHORTCUTS: Array<{
  key: WebmailFolderKey;
  label: string;
  iconName: FeatherIconName;
}> = [
  { key: 'INBOX', label: 'Inbox', iconName: 'inbox' },
  { key: 'Drafts', label: 'Draft', iconName: 'edit-2' },
  { key: 'Sent', label: 'Terkirim', iconName: 'send' },
  { key: 'Junk', label: 'Spam', iconName: 'alert-circle' },
  { key: 'Archive', label: 'Arsip', iconName: 'archive' },
];

function getFolderLabel(folderKey: WebmailFolderKey) {
  return WEBMAIL_FOLDER_SHORTCUTS.find((item) => item.key === folderKey)?.label || 'Inbox';
}

function getFolderMoveActions(folderKey: WebmailFolderKey): FolderMoveAction[] {
  if (folderKey === 'INBOX') {
    return [
      { key: 'archive', label: 'Arsipkan', targetFolderKey: 'Archive', tone: 'neutral' },
      { key: 'spam', label: 'Pindah ke Spam', targetFolderKey: 'Junk', tone: 'warning' },
    ];
  }
  if (folderKey === 'Junk') {
    return [
      { key: 'restore-inbox', label: 'Bukan Spam', targetFolderKey: 'INBOX', tone: 'primary' },
      { key: 'archive', label: 'Arsipkan', targetFolderKey: 'Archive', tone: 'neutral' },
    ];
  }
  if (folderKey === 'Archive') {
    return [
      { key: 'restore-inbox', label: 'Kembalikan ke Inbox', targetFolderKey: 'INBOX', tone: 'primary' },
      { key: 'spam', label: 'Pindah ke Spam', targetFolderKey: 'Junk', tone: 'warning' },
    ];
  }
  if (folderKey === 'Sent') {
    return [{ key: 'archive', label: 'Arsipkan', targetFolderKey: 'Archive', tone: 'neutral' }];
  }
  return [];
}

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

function getMailboxFolderUrl(rawLoginUrl: string, folderKey: WebmailFolderKey) {
  try {
    const parsed = new URL(rawLoginUrl);
    parsed.search = '';
    parsed.hash = '';
    parsed.searchParams.set('_task', 'mail');
    parsed.searchParams.set('_mbox', folderKey);
    parsed.searchParams.set('_layout', 'list');
    parsed.searchParams.set('_skin', 'elastic');
    return parsed.toString();
  } catch {
    return getInboxUrl(rawLoginUrl);
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

function normalizeReplySubject(subject?: string | null) {
  const normalized = String(subject || '').trim();
  if (!normalized) return 'Re: (Tanpa subjek)';
  if (/^re:/i.test(normalized)) return normalized;
  return `Re: ${normalized}`;
}

function getFolderDescription(folderKey: WebmailFolderKey) {
  return folderKey === 'INBOX'
    ? 'Email masuk terbaru dari mailbox sekolah Anda tampil langsung di aplikasi.'
    : folderKey === 'Drafts'
      ? 'Draft email yang tersimpan di mailbox sekolah Anda tampil langsung di aplikasi.'
      : folderKey === 'Sent'
        ? 'Riwayat email yang sudah dikirim dari mailbox sekolah Anda tampil langsung di aplikasi.'
        : folderKey === 'Junk'
          ? 'Email yang masuk ke folder Spam tampil langsung di aplikasi.'
          : 'Email yang sudah Anda arsipkan tampil langsung di aplikasi.';
}

function getFolderEmptyState(folderKey: WebmailFolderKey, folderLabel: string) {
  return folderKey === 'INBOX'
    ? 'Begitu email baru masuk ke mailbox sekolah, daftar inbox di sini akan langsung ikut terisi dan notifikasinya juga tetap masuk ke HP.'
    : folderKey === 'Drafts'
      ? 'Belum ada draft email yang tersimpan di mailbox sekolah Anda.'
      : folderKey === 'Sent'
        ? 'Belum ada email terkirim yang tercatat di mailbox sekolah Anda.'
        : folderKey === 'Junk'
          ? 'Belum ada email yang masuk ke folder Spam.'
          : `Belum ada email di folder ${folderLabel}.`;
}

function getFolderMoveActionPalette(tone: FolderMoveActionTone) {
  if (tone === 'warning') {
    return {
      borderColor: '#fdba74',
      backgroundColor: '#fff7ed',
      iconColor: '#c2410c',
      textColor: '#9a3412',
    };
  }
  if (tone === 'primary') {
    return {
      borderColor: '#93c5fd',
      backgroundColor: '#eff6ff',
      iconColor: '#2563eb',
      textColor: '#1d4ed8',
    };
  }
  return {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    iconColor: '#475569',
    textColor: '#334155',
  };
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
  const isScreenActive = useIsScreenActive();
  const pagePadding = getStandardPagePadding(insets, { bottom: 16 });
  const scrollViewRef = useRef<ScrollView | null>(null);
  const webviewRef = useRef<WebView | null>(null);
  const hasNativeWebView = useMemo(() => Boolean(UIManager.getViewManagerConfig?.('RNCWebView')), []);
  const [webmailUrl, setWebmailUrl] = useState<string | null>(null);
  const [webviewKey, setWebviewKey] = useState(0);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isWebmailMode, setIsWebmailMode] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerUser, setRegisterUser] = useState('');
  const [registerPass, setRegisterPass] = useState('');
  const [registerPassConfirm, setRegisterPassConfirm] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isEmailDetailVisible, setIsEmailDetailVisible] = useState(false);
  const [activeFolderKey, setActiveFolderKey] = useState<WebmailFolderKey>('INBOX');
  const [inboxSectionY, setInboxSectionY] = useState(0);
  const [bridgeCredentials, setBridgeCredentials] = useState<BridgeCredentials | null>(null);
  const [selectedEmailGuid, setSelectedEmailGuid] = useState<string | null>(null);
  const [isComposeMode, setIsComposeMode] = useState(false);
  const [composeModeKind, setComposeModeKind] = useState<'new' | 'reply'>('new');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(DEFAULT_EMAIL_PAGE_LIMIT);

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
    queryKey: ['mobile-email-folder-feed', configQuery.data?.mailboxIdentity || 'all', activeFolderKey, visibleLimit, appliedSearch],
    queryFn: () => webmailApi.getMessages({ page: 1, limit: visibleLimit, folderKey: activeFolderKey, query: appliedSearch }),
    enabled: isAuthenticated && isAllowedRole && isScreenActive && !isWebmailMode,
    staleTime: 30_000,
    refetchInterval:
      isAuthenticated &&
      isAllowedRole &&
      isScreenActive &&
      !isWebmailMode &&
      visibleLimit === DEFAULT_EMAIL_PAGE_LIMIT &&
      !appliedSearch
        ? 60_000
        : false,
    refetchIntervalInBackground: false,
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
  const suggestedMailboxUsername = String(config?.user?.username || '').trim().toLowerCase();
  const mailboxFeed = emailFeedQuery.data;
  const mailboxAvailable = mailboxFeed?.mailboxAvailable !== false;

  const mailboxMessages = useMemo(() => mailboxFeed?.messages ?? [], [mailboxFeed?.messages]);
  const totalMessageCount = Number(mailboxFeed?.pagination.total || 0);
  const hasAppliedSearch = appliedSearch.trim().length > 0;
  const canLoadMore = mailboxMessages.length < totalMessageCount;

  const markAsReadMutation = useMutation({
    mutationFn: ({ guid, folderKey }: { guid: string; folderKey: WebmailFolderKey }) =>
      webmailApi.markMessageRead(guid, { folderKey }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-email-folder-feed'],
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
    queryKey: ['mobile-email-message-detail', activeFolderKey, effectiveSelectedEmailGuid || 'empty'],
    queryFn: () => webmailApi.getMessageDetail(String(effectiveSelectedEmailGuid), { folderKey: activeFolderKey }),
    enabled:
      Boolean(effectiveSelectedEmailGuid) &&
      isAuthenticated &&
      isAllowedRole &&
      isScreenActive &&
      !isWebmailMode &&
      mailboxFeed?.mailboxAvailable !== false &&
      (isEmailDetailVisible || (isComposeMode && composeModeKind === 'reply')),
    staleTime: 30_000,
  });

  const activeFolderLabel =
    WEBMAIL_FOLDER_SHORTCUTS.find((item) => item.key === activeFolderKey)?.label || 'Inbox';

  const startSsoMutation = useMutation({
    mutationFn: (folderKey?: WebmailFolderKey) => webmailApi.startSso().then((data) => ({ data, folderKey })),
    onSuccess: ({ data, folderKey }) => {
      const nextFolderKey = folderKey || activeFolderKey;
      setActiveFolderKey(nextFolderKey);
      setPanelError(null);
      setWebmailUrl(getMailboxFolderUrl(data.launchUrl, nextFolderKey));
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
      setActiveFolderKey('INBOX');
      setBridgeCredentials({ email: createdMailboxIdentity, password: variables.password });
      setWebmailUrl(getMailboxFolderUrl(bridgeLoginUrl, 'INBOX'));
      setIsWebmailMode(true);
      setWebviewKey((value) => value + 1);
    },
    onError: (error) => {
      setRegisterError(resolveErrorMessage(error, 'Gagal membuat akun webmail.'));
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: () =>
      webmailApi.sendMessage({
        to: composeTo
          .split(/[,\n;]/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
        cc: composeCc
          .split(/[,\n;]/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
        subject: composeSubject,
        plainText: composeBody,
        inReplyToMessageId:
          composeModeKind === 'reply' ? selectedEmailDetailQuery.data?.messageId || null : null,
        references:
          composeModeKind === 'reply' && selectedEmailDetailQuery.data?.messageId
            ? [selectedEmailDetailQuery.data.messageId]
            : [],
      }),
    onSuccess: async () => {
      notifySuccess('Email berhasil dikirim.', {
        title: 'Email',
      });
      setComposeTo('');
      setComposeCc('');
      setComposeSubject('');
      setComposeBody('');
      setIsComposeMode(false);
      await queryClient.invalidateQueries({
        queryKey: ['mobile-email-folder-feed'],
        refetchType: 'active',
      });
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mengirim email.');
    },
  });

  const moveMessageMutation = useMutation({
    mutationFn: ({
      guid,
      sourceFolderKey,
      targetFolderKey,
    }: {
      guid: string;
      sourceFolderKey: WebmailFolderKey;
      targetFolderKey: WebmailFolderKey;
    }) => webmailApi.moveMessage(guid, { sourceFolderKey, targetFolderKey }),
    onSuccess: async (result) => {
      notifySuccess(`Email berhasil dipindahkan ke folder ${getFolderLabel(result.targetFolderKey)}.`, {
        title: 'Email',
      });
      setIsEmailDetailVisible(false);
      setSelectedEmailGuid(null);
      await queryClient.invalidateQueries({
        queryKey: ['mobile-email-folder-feed'],
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
      notifyApiError(error, 'Gagal memindahkan email.');
    },
  });

  const leavePanelMode = () => {
    setIsWebmailMode(false);
    setIsRegisterMode(false);
    setBridgeCredentials(null);
    setPanelError(null);
    setWebmailUrl(null);
    setWebviewKey((value) => value + 1);
  };

  const openNewCompose = () => {
    setIsEmailDetailVisible(false);
    setIsRegisterMode(false);
    setIsComposeMode(true);
    setComposeModeKind('new');
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
  };

  const openReplyCompose = () => {
    const replyTarget = String(selectedEmailDetailQuery.data?.from || selectedEmail?.from || '').trim();
    setIsEmailDetailVisible(false);
    setIsRegisterMode(false);
    setIsComposeMode(true);
    setComposeModeKind('reply');
    setComposeTo(replyTarget);
    setComposeCc('');
    setComposeSubject(normalizeReplySubject(selectedEmail?.subject));
    setComposeBody('');
  };

  const openPanelAccess = (targetFolderKey?: WebmailFolderKey) => {
    const nextFolderKey = targetFolderKey || activeFolderKey;
    setPanelError(null);
    setRegisterError(null);
    setIsRegisterMode(false);
    setIsEmailDetailVisible(false);
    setIsComposeMode(false);
    setActiveFolderKey(nextFolderKey);

    if (!mailboxAvailable && selfRegistrationEnabled) {
      setRegisterError(null);
      setIsRegisterMode(true);
      return;
    }

    if (isSsoMode) {
      setWebmailUrl(null);
      setIsWebmailMode(true);
      startSsoMutation.mutate(nextFolderKey);
      return;
    }

    setBridgeCredentials(null);
    setWebmailUrl(getMailboxFolderUrl(bridgeLoginUrl, nextFolderKey));
    setIsWebmailMode(true);
    setWebviewKey((value) => value + 1);
  };

  const handleFolderShortcutPress = (folderKey: WebmailFolderKey) => {
    setIsEmailDetailVisible(false);
    setIsComposeMode(false);
    setPanelError(null);
    setIsRegisterMode(false);
    setSelectedEmailGuid(null);
    setSearchDraft('');
    setAppliedSearch('');
    setVisibleLimit(DEFAULT_EMAIL_PAGE_LIMIT);
    setActiveFolderKey(folderKey);
    scrollViewRef.current?.scrollTo({
      y: Math.max(inboxSectionY - 12, 0),
      animated: true,
    });
  };

  const handleApplySearch = () => {
    const nextSearch = searchDraft.trim();
    setIsEmailDetailVisible(false);
    setSelectedEmailGuid(null);
    setVisibleLimit(DEFAULT_EMAIL_PAGE_LIMIT);
    if (nextSearch === appliedSearch) {
      void emailFeedQuery.refetch();
      return;
    }
    setAppliedSearch(nextSearch);
  };

  const handleResetSearch = () => {
    setSearchDraft('');
    setAppliedSearch('');
    setSelectedEmailGuid(null);
    setVisibleLimit(DEFAULT_EMAIL_PAGE_LIMIT);
  };

  const handleRegister = () => {
    if (!selfRegistrationEnabled) return;

    const username = registerUser.trim().toLowerCase();
    const password = registerPass;
    const confirmPassword = registerPassConfirm;

    if (!username) {
      setRegisterError('Username email wajib diisi.');
      return;
    }
    if (!MAILBOX_USERNAME_PATTERN.test(username)) {
      setRegisterError('Username email hanya boleh huruf kecil, angka, titik, underscore, atau dash (3-63 karakter).');
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
      startSsoMutation.mutate(activeFolderKey);
      return;
    }
    setPanelError(null);
    webviewRef.current?.reload();
  };

  const handleSelectEmail = async (item: MobileWebmailMessageSummary) => {
    setSelectedEmailGuid(item.guid);
    setIsEmailDetailVisible(true);
    if (item.isRead) return;
    try {
      await markAsReadMutation.mutateAsync({ guid: item.guid, folderKey: activeFolderKey });
    } catch {
      // Error is surfaced by mutation handler.
    }
  };

  const handleSendCompose = async () => {
    if (!composeTo.trim()) {
      notifyApiError(new Error('Penerima email wajib diisi.'), 'Penerima email wajib diisi.');
      return;
    }
    if (!composeBody.trim()) {
      notifyApiError(new Error('Isi email wajib diisi.'), 'Isi email wajib diisi.');
      return;
    }
    await sendMessageMutation.mutateAsync();
  };

  const handleMoveSelectedEmail = async (targetFolderKey: WebmailFolderKey) => {
    if (!selectedEmail) return;
    await moveMessageMutation.mutateAsync({
      guid: selectedEmail.guid,
      sourceFolderKey: activeFolderKey,
      targetFolderKey,
    });
  };

  const closeRegisterModal = () => {
    setIsRegisterMode(false);
    setPanelError(null);
    setRegisterError(null);
    setRegisterUser('');
    setRegisterPass('');
    setRegisterPassConfirm('');
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

  const selectedSenderLabel = selectedEmail ? extractSenderLabel(selectedEmail) : '-';
  const selectedSubjectLabel = selectedEmail ? extractSubjectLabel(selectedEmail) : '-';
  const selectedBodyText =
    selectedEmailDetailQuery.data?.plainText ||
    selectedEmailDetailQuery.data?.previewText ||
    selectedEmail?.snippet ||
    '';
  const activeFolderDescription = getFolderDescription(activeFolderKey);
  const activeFolderEmptyState = hasAppliedSearch
    ? `Belum ada email yang cocok dengan kata kunci "${appliedSearch}" di folder ${activeFolderLabel}.`
    : getFolderEmptyState(activeFolderKey, activeFolderLabel);
  const activeFolderTitle = activeFolderKey === 'INBOX' ? 'Kotak Masuk' : activeFolderLabel;
  const canReplyFromSelectedFolder = activeFolderKey !== 'Drafts';
  const availableMoveActions = getFolderMoveActions(activeFolderKey);
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
  const accessModalTitle = activeFolderKey === 'INBOX' ? 'Panel Lengkap Webmail' : activeFolderLabel;

  return (
    <View style={{ flex: 1, backgroundColor: '#e9eefb' }}>
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, 10), paddingBottom: 96 }}
      >
        <View style={{ paddingHorizontal: 12, gap: 10 }}>
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#dbe4f4',
              backgroundColor: '#ffffff',
              paddingHorizontal: 8,
              paddingVertical: 10,
            }}
          >
            <MobileMenuTabBar
              items={WEBMAIL_FOLDER_SHORTCUTS.map((item) => ({
                key: item.key,
                label: item.label,
                iconName: item.iconName,
              }))}
              activeKey={activeFolderKey}
              onChange={(key) => {
                const targetFolder = WEBMAIL_FOLDER_SHORTCUTS.find((item) => item.key === key);
                if (!targetFolder) return;
                handleFolderShortcutPress(targetFolder.key);
              }}
              minTabWidth={52}
              maxTabWidth={52}
              compact
            />
          </View>

          <View
            onLayout={(event) => {
              setInboxSectionY(event.nativeEvent.layout.y);
            }}
          >
            <SectionCard
              title={activeFolderTitle}
              subtitle={activeFolderDescription}
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
                  <Text style={{ color: '#1e293b', fontSize: 12, fontWeight: '700' }}>Sinkronkan</Text>
                </Pressable>

                {mailboxAvailable ? (
                  <Pressable
                    onPress={() => openPanelAccess(activeFolderKey)}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#c7d2fe',
                      backgroundColor: '#eef2ff',
                      paddingVertical: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                    }}
                  >
                    <Feather name="external-link" size={14} color="#3250b9" />
                    <Text style={{ color: '#3250b9', fontSize: 12, fontWeight: '700' }}>Panel Lengkap</Text>
                  </Pressable>
                ) : null}
              </View>

              {mailboxAvailable ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700' }}>Cari Email</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: '#ffffff',
                        paddingHorizontal: 12,
                      }}
                    >
                      <Feather name="search" size={14} color="#64748b" />
                      <TextInput
                        value={searchDraft}
                        onChangeText={setSearchDraft}
                        onSubmitEditing={handleApplySearch}
                        placeholder="Cari pengirim, subjek, atau isi email"
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="search"
                        style={{
                          flex: 1,
                          minHeight: 42,
                          color: '#0f172a',
                          fontSize: 13,
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={handleApplySearch}
                      style={{
                        borderRadius: 12,
                        backgroundColor: '#3250b9',
                        paddingHorizontal: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Cari</Text>
                    </Pressable>
                  </View>
                  {hasAppliedSearch || searchDraft.trim().length > 0 ? (
                    <Pressable
                      onPress={handleResetSearch}
                      style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
                    >
                      <Text style={{ color: '#3250b9', fontSize: 12, fontWeight: '700' }}>Reset Pencarian</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {emailFeedQuery.isLoading ? (
                <View style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={{ color: '#64748b', fontSize: 12 }}>Memuat {activeFolderLabel.toLowerCase()}...</Text>
                </View>
              ) : emailFeedQuery.isError ? (
                <QueryStateView
                  type="error"
                  message={resolveErrorMessage(emailFeedQuery.error, `Gagal memuat folder ${activeFolderLabel}.`)}
                  onRetry={() => emailFeedQuery.refetch()}
                />
              ) : !mailboxAvailable ? (
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
                    Akun ini sudah dikenali, tetapi mailbox di server mail belum aktif.
                  </Text>
                  {selfRegistrationEnabled ? (
                    <Pressable
                      onPress={() => {
                        setRegisterError(null);
                        setPanelError(null);
                        setIsRegisterMode(true);
                      }}
                      style={{
                        marginTop: 6,
                        borderRadius: 12,
                        backgroundColor: '#3250b9',
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '700' }}>Daftar Mailbox</Text>
                    </Pressable>
                  ) : null}
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
                  <Text style={{ color: '#0f172a', fontWeight: '700' }}>{activeFolderLabel} masih kosong</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>{activeFolderEmptyState}</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                    {hasAppliedSearch
                      ? `Menampilkan ${mailboxMessages.length} dari ${totalMessageCount} email yang cocok dengan "${appliedSearch}".`
                      : `Menampilkan ${mailboxMessages.length} dari ${totalMessageCount} email di folder ${activeFolderLabel}.`}
                  </Text>
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
                  {canLoadMore ? (
                    <Pressable
                      disabled={emailFeedQuery.isFetching}
                      onPress={() => {
                        setVisibleLimit((current) => current + DEFAULT_EMAIL_PAGE_LIMIT);
                      }}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: '#ffffff',
                        paddingVertical: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                        opacity: emailFeedQuery.isFetching ? 0.7 : 1,
                      }}
                    >
                      {emailFeedQuery.isFetching && !emailFeedQuery.isLoading ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <Feather name="chevrons-down" size={14} color="#1e293b" />
                      )}
                      <Text style={{ color: '#1e293b', fontSize: 12, fontWeight: '700' }}>Muat Lebih Banyak</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </SectionCard>
          </View>

        </View>
      </ScrollView>

      {mailboxAvailable && !isComposeMode && !isRegisterMode && !isWebmailMode ? (
        <View
          style={{
            position: 'absolute',
            right: 16,
            bottom: Math.max(insets.bottom, 14) + 10,
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Pressable
            onPress={openNewCompose}
            style={({ pressed }) => ({
              width: 58,
              height: 58,
              borderRadius: 999,
              backgroundColor: '#0f172a',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#0f172a',
              shadowOpacity: 0.22,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 10,
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Feather name="edit-3" size={20} color="#ffffff" />
          </Pressable>
          <Text style={{ color: '#0f172a', fontSize: 11, fontWeight: '700' }}>Tulis</Text>
        </View>
      ) : null}

      <MobileDetailModal
        visible={isComposeMode}
        title={composeModeKind === 'reply' ? 'Balas Email' : 'Tulis Email Baru'}
        subtitle={
          composeModeKind === 'reply'
            ? 'Balasan akan dikirim dari mailbox sekolah Anda dan salinannya otomatis disimpan ke folder Sent.'
            : 'Email akan dikirim dari mailbox sekolah Anda dan salinannya otomatis disimpan ke folder Sent.'
        }
        iconName="edit-3"
        accentColor="#0f172a"
        onClose={() => setIsComposeMode(false)}
      >
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>Kepada</Text>
          <TextInput
            value={composeTo}
            onChangeText={setComposeTo}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email@tujuan.com"
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

          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>CC</Text>
          <TextInput
            value={composeCc}
            onChangeText={setComposeCc}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="opsional"
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

          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>Subjek</Text>
          <TextInput
            value={composeSubject}
            onChangeText={setComposeSubject}
            placeholder="Subjek email"
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

          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>Isi Email</Text>
          <TextInput
            value={composeBody}
            onChangeText={setComposeBody}
            multiline
            textAlignVertical="top"
            placeholder="Tulis isi email di sini..."
            placeholderTextColor="#94a3b8"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              minHeight: 160,
              color: BRAND_COLORS.textDark,
            }}
          />

          <Pressable
            onPress={() => {
              void handleSendCompose();
            }}
            disabled={sendMessageMutation.isPending}
            style={{
              borderRadius: 12,
              backgroundColor: '#3250b9',
              paddingVertical: 11,
              alignItems: 'center',
              opacity: sendMessageMutation.isPending ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>
              {sendMessageMutation.isPending ? 'Mengirim...' : 'Kirim Email'}
            </Text>
          </Pressable>
        </View>
      </MobileDetailModal>

      <MobileDetailModal
        visible={isRegisterMode}
        title="Daftar Mailbox"
        subtitle="Buat mailbox sekolah baru dengan username email pilihan Anda. Domain sekolah tetap mengikuti server."
        iconName="user-plus"
        accentColor="#3250b9"
        onClose={closeRegisterModal}
      >
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>Username Email</Text>
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
              onChangeText={(value) => setRegisterUser(value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={suggestedMailboxUsername || 'username email'}
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, minWidth: 0, color: BRAND_COLORS.textDark, padding: 0 }}
            />
            <Text style={{ color: '#64748b' }}>@{mailboxDomain}</Text>
          </View>

          <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
            Isi username email sesuai keinginan Anda. Domain sekolah akan otomatis memakai @{mailboxDomain}, dan setiap akun hanya boleh memiliki satu mailbox.
          </Text>

          <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
            Gunakan huruf kecil, angka, titik, underscore, atau dash.
          </Text>

          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>Password</Text>
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

          <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>Konfirmasi Password</Text>
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

          <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
            Kapasitas mailbox: {quotaLabel} per user. Mailbox mengikuti identitas email sekolah yang sudah ditetapkan server.
          </Text>
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
        </View>
      </MobileDetailModal>

      <Modal visible={isWebmailMode} transparent animationType="fade" onRequestClose={leavePanelMode}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.18)',
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
            paddingHorizontal: 12,
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#dbe4f4',
              backgroundColor: '#ffffff',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#e2e8f0',
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '800' }}>{accessModalTitle}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>Panel webmail penuh</Text>
                </View>
                <Pressable
                  onPress={leavePanelMode}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#dbe4f4',
                    backgroundColor: '#f8fbff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="x" size={18} color="#64748b" />
                </Pressable>
              </View>

              <Pressable
                onPress={handleReload}
                style={{
                  alignSelf: 'flex-start',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: '#ffffff',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Feather name="refresh-cw" size={13} color="#1e293b" />
                <Text style={{ color: '#1e293b', fontSize: 12, fontWeight: '700' }}>Muat Ulang</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
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
                      setWebmailUrl(getMailboxFolderUrl(bridgeLoginUrl, activeFolderKey));
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
        </View>
      </Modal>

        <MobileDetailModal
          visible={isEmailDetailVisible && Boolean(selectedEmail)}
          title={`Detail ${activeFolderLabel}`}
          subtitle={`Baca isi email tanpa keluar dari daftar ${activeFolderLabel.toLowerCase()}.`}
          iconName="mail"
          accentColor="#2563eb"
          onClose={() => setIsEmailDetailVisible(false)}
        >
          {selectedEmail ? (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#f8fbff',
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  gap: 6,
                }}
              >
                <Text style={{ color: '#334155', fontSize: 12 }}>
                  Dari: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{selectedSenderLabel}</Text>
                </Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>
                  Subjek: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{selectedSubjectLabel}</Text>
                </Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>
                  Waktu: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{formatDateTime(selectedEmail.date)}</Text>
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {canReplyFromSelectedFolder ? (
                  <Pressable
                    onPress={() => {
                      openReplyCompose();
                    }}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      backgroundColor: '#3250b9',
                      paddingVertical: 11,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '700' }}>Balas Email</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    openPanelAccess(activeFolderKey);
                  }}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#ffffff',
                    paddingVertical: 11,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#1e293b', fontWeight: '700' }}>
                    {isSsoMode ? 'Buka Panel Lengkap' : 'Panel Lengkap'}
                  </Text>
                </Pressable>
              </View>

              {availableMoveActions.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700' }}>Aksi Folder</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {availableMoveActions.map((action) => {
                      const palette = getFolderMoveActionPalette(action.tone);
                      return (
                        <Pressable
                          key={action.key}
                          disabled={moveMessageMutation.isPending}
                          onPress={() => {
                            void handleMoveSelectedEmail(action.targetFolderKey);
                          }}
                          style={{
                            minWidth: 132,
                            flexGrow: 1,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: palette.borderColor,
                            backgroundColor: palette.backgroundColor,
                            paddingHorizontal: 12,
                            paddingVertical: 11,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            opacity: moveMessageMutation.isPending ? 0.7 : 1,
                          }}
                        >
                          {moveMessageMutation.isPending ? (
                            <ActivityIndicator size="small" color={palette.iconColor} />
                          ) : (
                            <Feather
                              name={action.targetFolderKey === 'Archive' ? 'archive' : action.targetFolderKey === 'Junk' ? 'alert-circle' : 'corner-up-left'}
                              size={14}
                              color={palette.iconColor}
                            />
                          )}
                          <Text style={{ color: palette.textColor, fontWeight: '700', fontSize: 12 }}>{action.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

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
                    Detail email dibuka terpisah agar daftar {activeFolderLabel.toLowerCase()} tetap ringkas dan nyaman dipakai walau email banyak.
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </MobileDetailModal>
    </View>
  );
}
