import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Inbox, Mail, RefreshCw, Reply, SquarePen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { webmailService, type WebmailMessageSummary } from '../../services/webmail.service';

const WEBMAIL_URL = 'https://mail.siskgb2.id/';
const DEFAULT_WEBMAIL_INBOX_URL = 'https://mail.siskgb2.id/?_task=mail&_mbox=INBOX&_layout=list&_skin=elastic';
const WEBMAIL_FRAME_NAME = 'sis-webmail-frame';
const DEFAULT_WEBMAIL_DOMAIN = 'siskgb2.id';
const MAILBOX_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,62}$/;
const BRIDGE_REAUTH_IDLE_MS = 1000 * 60 * 15;

const getWebmailModeStorageKey = (scopeKey: string) => `sis-webmail-mode:${scopeKey}`;
const getWebmailBridgeStorageKey = (scopeKey: string) => `sis-webmail-bridge:${scopeKey}`;

type WebmailBridgeCredentials = {
  email: string;
  password: string;
};

type ComposeModeKind = 'new' | 'reply';

const parseBridgeCredentials = (rawValue: string | null): WebmailBridgeCredentials | null => {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue) as { email?: unknown; password?: unknown };
    const email = String(parsed?.email || '').trim().toLowerCase();
    const password = String(parsed?.password || '');
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
};

const getBridgeLoginUrl = (rawUrl: string): string => {
  try {
    const parsedUrl = new URL(String(rawUrl || WEBMAIL_URL).trim() || WEBMAIL_URL);
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch {
    return WEBMAIL_URL;
  }
};

const getInboxUrl = (bridgeLoginUrl: string): string => {
  try {
    const parsedUrl = new URL(bridgeLoginUrl);
    parsedUrl.search = '';
    parsedUrl.hash = '';
    parsedUrl.searchParams.set('_task', 'mail');
    parsedUrl.searchParams.set('_mbox', 'INBOX');
    parsedUrl.searchParams.set('_layout', 'list');
    parsedUrl.searchParams.set('_skin', 'elastic');
    return parsedUrl.toString();
  } catch {
    return DEFAULT_WEBMAIL_INBOX_URL;
  }
};

const asQuotaLabel = (quotaMb?: number | null): string => {
  const mb = Number(quotaMb || 0);
  if (!Number.isFinite(mb) || mb <= 0) return '5 GB';
  const gb = mb / 1024;
  return Number.isInteger(gb) ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
};

const formatDateTime = (value?: string | null): string => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const extractSenderLabel = (item: { fromLabel?: string | null; from?: string | null }): string => {
  return String(item.fromLabel || item.from || 'pengirim tidak dikenal').trim() || 'pengirim tidak dikenal';
};

const extractSubjectLabel = (item: { subject?: string | null }): string => {
  return String(item.subject || '').trim() || '(Tanpa subjek)';
};

const normalizeReplySubject = (subject?: string | null): string => {
  const normalized = String(subject || '').trim();
  if (!normalized) return 'Re: (Tanpa subjek)';
  if (/^re:/i.test(normalized)) return normalized;
  return `Re: ${normalized}`;
};

const splitRecipientInput = (value: string): string[] => {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const getErrorMessage = (error: unknown, fallbackText: string): string => {
  if (!error || typeof error !== 'object') return fallbackText;
  const candidate = error as {
    response?: {
      data?: {
        message?: string;
      };
    };
    message?: string;
  };
  return candidate.response?.data?.message || candidate.message || fallbackText;
};

const SectionCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) => {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="mb-4 space-y-1">
        <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
        {subtitle ? <p className="text-sm leading-6 text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
};

const StatusChip = ({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'danger';
}) => {
  const toneClassName =
    tone === 'accent'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold tracking-wide ${toneClassName}`}>
      {children}
    </span>
  );
};

const EmailInboxItem = ({
  item,
  selected,
  onPress,
}: {
  item: WebmailMessageSummary;
  selected: boolean;
  onPress: () => void;
}) => {
  const senderLabel = extractSenderLabel(item);
  const subjectLabel = extractSubjectLabel(item);
  const wrapperClassName = selected
    ? 'border-blue-300 bg-blue-50'
    : item.isRead
      ? 'border-slate-200 bg-white'
      : 'border-blue-200 bg-blue-50/40';
  const iconClassName = item.isRead
    ? 'border-slate-200 bg-slate-50 text-slate-500'
    : 'border-blue-200 bg-blue-50 text-blue-600';

  return (
    <button
      type="button"
      onClick={onPress}
      className={`w-full rounded-2xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/60 ${wrapperClassName}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${iconClassName}`}>
          <Mail className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{senderLabel}</p>
            {!item.isRead ? (
              <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">
                BARU
              </span>
            ) : null}
          </div>

          <p className={`line-clamp-2 text-sm ${item.isRead ? 'font-semibold text-slate-700' : 'font-bold text-slate-800'}`}>
            {subjectLabel}
          </p>
          <p className="text-xs text-slate-500">{formatDateTime(item.date)}</p>
        </div>
      </div>
    </button>
  );
};

export const EmailPage = () => {
  const queryClient = useQueryClient();
  const panelSectionRef = useRef<HTMLDivElement | null>(null);
  const webmailBridgeFormRef = useRef<HTMLFormElement | null>(null);
  const webmailLogoutFormRef = useRef<HTMLFormElement | null>(null);
  const lastHydratedScopeRef = useRef<string>('');
  const bridgeLoginInFlightRef = useRef(false);
  const lastBridgeAuthAtRef = useRef(0);

  const { data: meResponse, isLoading: isMeLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5,
  });

  const currentUser = meResponse?.data;
  const userScopeKey = currentUser?.id && currentUser?.username ? `${currentUser.id}:${currentUser.username}` : '';

  const configQuery = useQuery({
    queryKey: ['webmail-config', userScopeKey],
    queryFn: webmailService.getConfig,
    enabled: Boolean(userScopeKey),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const webmailConfig = configQuery.data?.data;
  const isSsoMode = webmailConfig?.mode === 'SSO' && Boolean(webmailConfig?.ssoEnabled);
  const useSsoMode = isSsoMode;
  const resolvedWebmailUrl = String(webmailConfig?.webmailUrl || WEBMAIL_URL).trim() || WEBMAIL_URL;
  const bridgeLoginUrl = getBridgeLoginUrl(resolvedWebmailUrl);
  const webmailInboxUrl = getInboxUrl(bridgeLoginUrl);
  const isPortalReady = Boolean(userScopeKey) && Boolean(webmailConfig);
  const mailboxDomain = String(webmailConfig?.defaultDomain || DEFAULT_WEBMAIL_DOMAIN)
    .trim()
    .toLowerCase() || DEFAULT_WEBMAIL_DOMAIN;
  const isSelfRegistrationEnabled = !useSsoMode && Boolean(webmailConfig?.selfRegistrationEnabled);
  const mailboxQuotaLabel = asQuotaLabel(webmailConfig?.mailboxQuotaMb);
  const mailboxIdentity = String(webmailConfig?.mailboxIdentity || '').trim().toLowerCase();
  const suggestedMailboxUsername = String(webmailConfig?.user?.username || '').trim().toLowerCase();
  const mailboxPreview =
    mailboxIdentity || `${suggestedMailboxUsername || 'username'}@${mailboxDomain}`.trim().toLowerCase();

  const [loginUser, setLoginUser] = useState('');
  const [hasEditedLoginUser, setHasEditedLoginUser] = useState(false);
  const [loginPass, setLoginPass] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerUser, setRegisterUser] = useState('');
  const [registerPass, setRegisterPass] = useState('');
  const [registerPassConfirm, setRegisterPassConfirm] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ mailboxIdentity: string; password: string; resetAt: string } | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isWebmailMode, setIsWebmailMode] = useState(false);
  const [shouldSubmitBridgeLogin, setShouldSubmitBridgeLogin] = useState(false);
  const [pendingAutoBridgeCredentials, setPendingAutoBridgeCredentials] = useState<WebmailBridgeCredentials | null>(null);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(DEFAULT_WEBMAIL_INBOX_URL);
  const [selectedEmailGuid, setSelectedEmailGuid] = useState<string | null>(null);
  const [isComposeMode, setIsComposeMode] = useState(false);
  const [composeModeKind, setComposeModeKind] = useState<ComposeModeKind>('new');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const loginIdentityValue = hasEditedLoginUser ? loginUser : mailboxPreview;

  const emailFeedQuery = useQuery({
    queryKey: ['webmail-inbox-feed', mailboxIdentity || 'all'],
    queryFn: () => webmailService.getMessages({ page: 1, limit: 20 }),
    enabled: isPortalReady && !isWebmailMode,
    staleTime: 30_000,
    refetchInterval: isPortalReady && !isWebmailMode ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    retry: false,
  });

  const mailboxFeed = emailFeedQuery.data?.data;
  const mailboxMessages = mailboxFeed?.messages ?? [];
  const unreadEmailCount = mailboxMessages.filter((item) => !item.isRead).length;
  const latestEmailAt = mailboxMessages[0] ? formatDateTime(mailboxMessages[0].date) : '-';

  let effectiveSelectedEmailGuid = selectedEmailGuid;
  if (!effectiveSelectedEmailGuid || !mailboxMessages.some((item) => item.guid === effectiveSelectedEmailGuid)) {
    effectiveSelectedEmailGuid = mailboxMessages.find((item) => !item.isRead)?.guid ?? mailboxMessages[0]?.guid ?? null;
  }

  const selectedEmail = mailboxMessages.find((item) => item.guid === effectiveSelectedEmailGuid) ?? null;

  const selectedEmailDetailQuery = useQuery({
    queryKey: ['webmail-message-detail', effectiveSelectedEmailGuid || 'empty'],
    queryFn: () => webmailService.getMessageDetail(String(effectiveSelectedEmailGuid)),
    enabled: Boolean(effectiveSelectedEmailGuid) && isPortalReady && !isWebmailMode && mailboxFeed?.mailboxAvailable !== false,
    staleTime: 30_000,
    retry: false,
  });

  const selectedEmailDetail = selectedEmailDetailQuery.data?.data;
  const selectedSenderLabel = selectedEmail ? extractSenderLabel(selectedEmail) : '-';
  const selectedSubjectLabel = selectedEmail ? extractSubjectLabel(selectedEmail) : '-';
  const selectedBodyText = selectedEmailDetail?.plainText || selectedEmailDetail?.previewText || selectedEmail?.snippet || '';

  const persistWebmailMode = useCallback(
    (enabled: boolean) => {
      if (typeof window === 'undefined' || !userScopeKey) return;
      const storageKey = getWebmailModeStorageKey(userScopeKey);
      if (enabled) {
        window.sessionStorage.setItem(storageKey, '1');
        return;
      }
      window.sessionStorage.removeItem(storageKey);
    },
    [userScopeKey],
  );

  const persistBridgeCredentials = useCallback(
    (email: string, password: string) => {
      if (typeof window === 'undefined' || !userScopeKey) return;
      const storageKey = getWebmailBridgeStorageKey(userScopeKey);
      const payload = JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        password: String(password || ''),
        updatedAt: Date.now(),
      });
      window.sessionStorage.setItem(storageKey, payload);
    },
    [userScopeKey],
  );

  const clearBridgeCredentials = useCallback(() => {
    if (typeof window === 'undefined' || !userScopeKey) return;
    window.sessionStorage.removeItem(getWebmailBridgeStorageKey(userScopeKey));
  }, [userScopeKey]);

  const openPanelSection = (openImmediatelyWhenSso = false) => {
    setPanelError(null);
    setRegisterError(null);
    setResetError(null);
    setResetResult(null);
    setIsRegisterMode(false);

    if (openImmediatelyWhenSso && useSsoMode) {
      handleOpenSso();
    }

    panelSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const openWebmailWithBridgeLogin = (email: string, password: string) => {
    if (!userScopeKey) return;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    setPanelError(null);
    setLoginUser(normalizedEmail);
    setLoginPass(password);
    setShouldSubmitBridgeLogin(true);
    setPendingAutoBridgeCredentials(null);
    persistWebmailMode(true);
    persistBridgeCredentials(normalizedEmail, password);

    if (!isWebmailMode) {
      setIsWebmailMode(true);
      return;
    }

    setIframeNonce((previous) => previous + 1);
  };

  const startSsoMutation = useMutation({
    mutationFn: webmailService.startSso,
    onSuccess: (response) => {
      const launchUrl = String(response?.data?.launchUrl || resolvedWebmailUrl).trim() || resolvedWebmailUrl;
      setPanelError(null);
      setIframeSrc(launchUrl);
      setShouldSubmitBridgeLogin(false);
      setIsRegisterMode(false);
      setIsWebmailMode(true);
      persistWebmailMode(true);
      setIframeNonce((previous) => previous + 1);
    },
    onError: (error) => {
      setPanelError(getErrorMessage(error, 'Gagal menyiapkan sesi SSO webmail.'));
    },
  });

  const registerMutation = useMutation({
    mutationFn: webmailService.register,
    onSuccess: (response, variables) => {
      const nextMailboxIdentity = String(response?.data?.mailboxIdentity || '').trim().toLowerCase();
      if (!nextMailboxIdentity) {
        setRegisterError('Mailbox berhasil dibuat, tetapi identitas mailbox tidak ditemukan.');
        return;
      }

      setRegisterError(null);
      setResetError(null);
      setResetResult(null);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setIsRegisterMode(false);
      openWebmailWithBridgeLogin(nextMailboxIdentity, variables.password);
    },
    onError: (error) => {
      setRegisterError(getErrorMessage(error, 'Gagal membuat akun webmail.'));
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: webmailService.resetPassword,
    onSuccess: (response) => {
      const nextMailboxIdentity = String(response?.data?.mailboxIdentity || mailboxPreview).trim().toLowerCase();
      setResetError(null);
      setResetResult({
        mailboxIdentity: nextMailboxIdentity,
        password: String(response?.data?.password || ''),
        resetAt: String(response?.data?.resetAt || new Date().toISOString()),
      });
      setHasEditedLoginUser(false);
      setLoginUser(nextMailboxIdentity);
      setLoginPass('');
      toast.success('Password webmail berhasil direset.');
    },
    onError: (error) => {
      setResetResult(null);
      setResetError(getErrorMessage(error, 'Gagal mereset password webmail.'));
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (guid: string) => webmailService.markMessageRead(guid),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['webmail-inbox-feed'],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: ['webmail-message-detail'],
        refetchType: 'active',
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal menandai email sebagai dibaca.'));
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: () =>
      webmailService.sendMessage({
        to: splitRecipientInput(composeTo),
        cc: splitRecipientInput(composeCc),
        subject: composeSubject,
        plainText: composeBody,
        inReplyToMessageId: composeModeKind === 'reply' ? selectedEmailDetail?.messageId || null : null,
        references:
          composeModeKind === 'reply' && selectedEmailDetail?.messageId
            ? [selectedEmailDetail.messageId]
            : [],
      }),
    onSuccess: async () => {
      toast.success('Email berhasil dikirim.');
      setComposeTo('');
      setComposeCc('');
      setComposeSubject('');
      setComposeBody('');
      setIsComposeMode(false);
      await queryClient.invalidateQueries({
        queryKey: ['webmail-inbox-feed'],
        refetchType: 'active',
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal mengirim email.'));
    },
  });

  useEffect(() => {
    if (!userScopeKey || lastHydratedScopeRef.current === userScopeKey) return;

    lastHydratedScopeRef.current = userScopeKey;
    let timerId: number | null = null;
    let shouldRestoreWebmailMode = false;
    let restoredCredentials: WebmailBridgeCredentials | null = null;

    if (typeof window !== 'undefined') {
      const activeModeKey = getWebmailModeStorageKey(userScopeKey);
      const activeBridgeKey = getWebmailBridgeStorageKey(userScopeKey);
      const keysToPurge: string[] = [];

      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (!key) continue;

        const isModeKey = key.startsWith('sis-webmail-mode:');
        const isBridgeKey = key.startsWith('sis-webmail-bridge:');

        if (isModeKey && key !== activeModeKey) {
          keysToPurge.push(key);
          continue;
        }
        if (isBridgeKey && key !== activeBridgeKey) {
          keysToPurge.push(key);
        }
      }

      keysToPurge.forEach((key) => window.sessionStorage.removeItem(key));

      const persistedMode = window.sessionStorage.getItem(activeModeKey) === '1';
      const persistedBridge = parseBridgeCredentials(window.sessionStorage.getItem(activeBridgeKey));
      shouldRestoreWebmailMode = persistedMode && Boolean(persistedBridge);
      restoredCredentials = persistedBridge;

      if (persistedMode && !shouldRestoreWebmailMode) {
        window.sessionStorage.removeItem(activeModeKey);
      }
    }

    timerId = window.setTimeout(() => {
      setIsWebmailMode(shouldRestoreWebmailMode);
      setPendingAutoBridgeCredentials(shouldRestoreWebmailMode ? restoredCredentials : null);
      setLoginUser('');
      setHasEditedLoginUser(false);
      setLoginPass('');
      setIsRegisterMode(false);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setRegisterError(null);
      setResetError(null);
      setResetResult(null);
      setPanelError(null);
      setShouldSubmitBridgeLogin(false);
      setIframeSrc(webmailInboxUrl);
      setIframeNonce((previous) => previous + 1);
    }, 0);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [userScopeKey, webmailInboxUrl]);

  useEffect(() => {
    if (useSsoMode || !isWebmailMode || !pendingAutoBridgeCredentials || shouldSubmitBridgeLogin) return;
    const timerId = window.setTimeout(() => {
      setLoginUser(pendingAutoBridgeCredentials.email);
      setLoginPass(pendingAutoBridgeCredentials.password);
      setShouldSubmitBridgeLogin(true);
      setPendingAutoBridgeCredentials(null);
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [useSsoMode, isWebmailMode, pendingAutoBridgeCredentials, shouldSubmitBridgeLogin]);

  useEffect(() => {
    if (isWebmailMode) return;
    const timerId = window.setTimeout(() => {
      setIframeSrc(useSsoMode ? bridgeLoginUrl : webmailInboxUrl);
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [useSsoMode, isWebmailMode, bridgeLoginUrl, webmailInboxUrl]);

  useEffect(() => {
    if (useSsoMode || !isWebmailMode || !shouldSubmitBridgeLogin || bridgeLoginInFlightRef.current) return;

    let isCancelled = false;
    let loginTimerId: number | null = null;
    bridgeLoginInFlightRef.current = true;

    const logoutTimerId = window.setTimeout(() => {
      if (isCancelled) return;
      webmailLogoutFormRef.current?.submit();
      loginTimerId = window.setTimeout(() => {
        if (isCancelled) return;
        webmailBridgeFormRef.current?.submit();
        lastBridgeAuthAtRef.current = Date.now();
        setShouldSubmitBridgeLogin(false);
        setLoginPass('');
        bridgeLoginInFlightRef.current = false;
      }, 280);
    }, 40);

    return () => {
      isCancelled = true;
      window.clearTimeout(logoutTimerId);
      if (loginTimerId !== null) window.clearTimeout(loginTimerId);
      bridgeLoginInFlightRef.current = false;
    };
  }, [useSsoMode, isWebmailMode, shouldSubmitBridgeLogin, iframeNonce]);

  useEffect(() => {
    if (useSsoMode || !isWebmailMode || !userScopeKey || typeof window === 'undefined') return;

    const bridgeStorageKey = getWebmailBridgeStorageKey(userScopeKey);
    const maybeReauthenticateBridge = () => {
      if (document.hidden || bridgeLoginInFlightRef.current || shouldSubmitBridgeLogin) return;
      if (Date.now() - lastBridgeAuthAtRef.current < BRIDGE_REAUTH_IDLE_MS) return;

      const credentials = parseBridgeCredentials(window.sessionStorage.getItem(bridgeStorageKey));
      if (!credentials) {
        persistWebmailMode(false);
        setIsWebmailMode(false);
        return;
      }

      setLoginUser(credentials.email);
      setLoginPass(credentials.password);
      setShouldSubmitBridgeLogin(true);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      maybeReauthenticateBridge();
    };

    window.addEventListener('focus', maybeReauthenticateBridge);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', maybeReauthenticateBridge);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [useSsoMode, isWebmailMode, userScopeKey, shouldSubmitBridgeLogin, persistWebmailMode]);

  const handleOpenSso = () => {
    if (startSsoMutation.isPending) return;
    startSsoMutation.mutate();
  };

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (useSsoMode) {
      handleOpenSso();
      return;
    }

    if (!isPortalReady) return;

    const email = loginIdentityValue.trim().toLowerCase();
    if (!email || !loginPass.trim()) {
      setPanelError('Email dan password webmail wajib diisi.');
      return;
    }

    openWebmailWithBridgeLogin(email, loginPass);
  };

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSelfRegistrationEnabled) return;

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
    setResetError(null);
    setResetResult(null);
    registerMutation.mutate({ username, password, confirmPassword });
  };

  const handleResetPassword = () => {
    setRegisterError(null);
    setResetError(null);
    setResetResult(null);
    resetPasswordMutation.mutate();
  };

  const handleDisconnectClick = () => {
    webmailLogoutFormRef.current?.submit();
    persistWebmailMode(false);
    clearBridgeCredentials();
    bridgeLoginInFlightRef.current = false;
    lastBridgeAuthAtRef.current = 0;
    setPanelError(null);
    setLoginUser('');
    setHasEditedLoginUser(false);
    setLoginPass('');
    setShouldSubmitBridgeLogin(false);
    setPendingAutoBridgeCredentials(null);

    window.setTimeout(() => {
      setIsWebmailMode(false);
      setIframeSrc(useSsoMode ? bridgeLoginUrl : webmailInboxUrl);
      setIframeNonce((previous) => previous + 1);
    }, 120);
  };

  const handleReloadPanel = () => {
    setPanelError(null);

    if (useSsoMode) {
      handleOpenSso();
      return;
    }

    if (typeof window !== 'undefined' && userScopeKey) {
      const credentials = parseBridgeCredentials(window.sessionStorage.getItem(getWebmailBridgeStorageKey(userScopeKey)));
      if (credentials) {
        setLoginUser(credentials.email);
        setLoginPass(credentials.password);
        setShouldSubmitBridgeLogin(true);
      }
    }

    setIframeSrc(webmailInboxUrl);
    setIframeNonce((previous) => previous + 1);
  };

  const openNewCompose = () => {
    setIsComposeMode(true);
    setComposeModeKind('new');
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
  };

  const openReplyCompose = () => {
    const replyTarget = String(selectedEmailDetail?.from || selectedEmail?.from || '').trim();
    setIsComposeMode(true);
    setComposeModeKind('reply');
    setComposeTo(replyTarget);
    setComposeCc('');
    setComposeSubject(normalizeReplySubject(selectedEmail?.subject));
    setComposeBody('');
  };

  const handleSelectEmail = async (item: WebmailMessageSummary) => {
    setSelectedEmailGuid(item.guid);
    if (item.isRead) return;

    try {
      await markAsReadMutation.mutateAsync(item.guid);
    } catch {
      return;
    }
  };

  const handleSendCompose = async () => {
    if (!composeTo.trim()) {
      toast.error('Penerima email wajib diisi.');
      return;
    }
    if (!composeBody.trim()) {
      toast.error('Isi email wajib diisi.');
      return;
    }
    await sendMessageMutation.mutateAsync();
  };

  if (isMeLoading && !currentUser) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
        Memuat Email...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-6 py-10 text-center text-sm text-rose-700">
        Sesi pengguna tidak ditemukan. Silakan muat ulang halaman.
      </div>
    );
  }

  if (configQuery.isLoading && !webmailConfig) {
    return (
      <SectionCard title="Email" subtitle="Menyiapkan konfigurasi mailbox sekolah Anda.">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Memuat konfigurasi email...
        </div>
      </SectionCard>
    );
  }

  if (configQuery.isError || !webmailConfig) {
    return (
      <SectionCard title="Email" subtitle="Konfigurasi mailbox sekolah belum bisa dipakai saat ini.">
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5">
          <p className="text-sm font-semibold text-rose-700">
            {getErrorMessage(configQuery.error, 'Gagal memuat konfigurasi email.')}
          </p>
          <button
            type="button"
            onClick={() => {
              void configQuery.refetch();
            }}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            Coba Lagi
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {!useSsoMode ? (
        <form ref={webmailBridgeFormRef} action={bridgeLoginUrl} method="post" target={WEBMAIL_FRAME_NAME} className="hidden">
          <input type="hidden" name="login_user" value={loginUser} readOnly />
          <input type="hidden" name="pass_user" value={loginPass} readOnly />
        </form>
      ) : null}
      <form ref={webmailLogoutFormRef} action={bridgeLoginUrl} method="post" target={WEBMAIL_FRAME_NAME} className="hidden">
        <input type="hidden" name="logout" value="1" readOnly />
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-6">
          <SectionCard
            title="Email"
            subtitle="Kotak masuk utama sekarang ditampilkan langsung di halaman ini. Panel webmail lengkap tetap tersedia untuk pencarian lanjutan, arsip, dan compose."
          >
            <div className="flex flex-wrap gap-2">
              <StatusChip tone="accent">{isSsoMode ? 'SSO Aktif' : 'Bridge Login'}</StatusChip>
              <StatusChip tone={unreadEmailCount > 0 ? 'danger' : 'default'}>{unreadEmailCount} belum dibaca</StatusChip>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900">Mailbox: {mailboxIdentity || 'Belum terhubung'}</p>
              <p className="text-sm text-slate-500">Email terbaru: {latestEmailAt} • Kuota: {mailboxQuotaLabel}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={openNewCompose}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <SquarePen className="h-4 w-4" />
                Tulis Email Baru
              </button>
              <button
                type="button"
                onClick={openReplyCompose}
                disabled={!selectedEmail}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                <Reply className="h-4 w-4" />
                Balas Email
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Kotak Masuk"
            subtitle="Daftar ini membaca mailbox sungguhan dari server, jadi isi inbox dan panel email tetap searah."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  void emailFeedQuery.refetch();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
              >
                <RefreshCw className={`h-4 w-4 ${emailFeedQuery.isFetching && !emailFeedQuery.isLoading ? 'animate-spin' : ''}`} />
                Sinkronkan Inbox
              </button>
              <button
                type="button"
                onClick={() => openPanelSection(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2a44a0]"
              >
                <Inbox className="h-4 w-4" />
                {isSsoMode ? 'Buka Panel Lengkap' : 'Akses Panel Lengkap'}
              </button>
            </div>

            {emailFeedQuery.isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Memuat kotak masuk...</div>
            ) : emailFeedQuery.isError ? (
              <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5">
                <p className="text-sm font-semibold text-rose-700">
                  {getErrorMessage(emailFeedQuery.error, 'Gagal memuat kotak masuk email.')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void emailFeedQuery.refetch();
                  }}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Coba Lagi
                </button>
              </div>
            ) : mailboxFeed?.mailboxAvailable === false ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5">
                <p className="text-sm font-bold text-amber-900">Mailbox belum tersedia</p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Akun ini sudah dikenali, tetapi mailbox di server mail belum aktif. Jika role Anda mendukung pendaftaran mandiri,
                  buat mailbox dulu di bagian panel bawah.
                </p>
              </div>
            ) : mailboxMessages.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
                <p className="text-sm font-bold text-slate-900">Inbox masih kosong</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Begitu email baru masuk ke mailbox sekolah, daftar inbox di sini akan langsung ikut terisi.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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
              </div>
            )}

            {selectedEmail ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-extrabold text-slate-900">Detail Email Terpilih</h3>
                  <p className="text-sm text-slate-600">
                    Dari: <span className="font-bold text-slate-900">{selectedSenderLabel}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    Subjek: <span className="font-bold text-slate-900">{selectedSubjectLabel}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    Waktu: <span className="font-bold text-slate-900">{formatDateTime(selectedEmail.date)}</span>
                  </p>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  {selectedEmailDetailQuery.isLoading ? (
                    <p className="text-sm text-slate-500">Memuat isi email...</p>
                  ) : selectedEmailDetailQuery.isError ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-rose-700">
                        {getErrorMessage(selectedEmailDetailQuery.error, 'Gagal memuat isi email.')}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void selectedEmailDetailQuery.refetch();
                        }}
                        className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                      >
                        Coba Lagi
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedEmailDetail?.to ? (
                        <p className="text-sm text-slate-600">
                          Ke: <span className="font-bold text-slate-900">{selectedEmailDetail.to}</span>
                        </p>
                      ) : null}
                      {selectedEmailDetail?.cc ? (
                        <p className="text-sm text-slate-600">
                          CC: <span className="font-bold text-slate-900">{selectedEmailDetail.cc}</span>
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedBodyText || 'Isi email tidak tersedia.'}</p>
                      <p className="text-sm leading-6 text-slate-500">
                        Isi email utama sekarang sudah bisa dibaca langsung di sini. Panel lengkap tetap dipakai untuk compose,
                        balas email, pencarian lanjutan, atau folder arsip lain.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openPanelSection(true)}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  {isSsoMode ? 'Buka Panel Lengkap' : 'Lanjut ke Panel Lengkap'}
                </button>
              </div>
            ) : null}
          </SectionCard>

          {isComposeMode ? (
            <SectionCard
              title={composeModeKind === 'reply' ? 'Balas Email' : 'Tulis Email Baru'}
              subtitle={
                composeModeKind === 'reply'
                  ? 'Balasan akan dikirim dari mailbox sekolah Anda dan salinannya otomatis disimpan ke folder Sent.'
                  : 'Email akan dikirim dari mailbox sekolah Anda dan salinannya otomatis disimpan ke folder Sent.'
              }
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Kepada</label>
                  <input
                    type="text"
                    value={composeTo}
                    onChange={(event) => setComposeTo(event.target.value)}
                    placeholder="email@tujuan.com"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">CC</label>
                  <input
                    type="text"
                    value={composeCc}
                    onChange={(event) => setComposeCc(event.target.value)}
                    placeholder="opsional"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Subjek</label>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(event) => setComposeSubject(event.target.value)}
                    placeholder="Subjek email"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Isi Email</label>
                  <textarea
                    value={composeBody}
                    onChange={(event) => setComposeBody(event.target.value)}
                    placeholder="Tulis isi email di sini..."
                    className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSendCompose();
                    }}
                    disabled={sendMessageMutation.isPending}
                    className="rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2a44a0] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {sendMessageMutation.isPending ? 'Mengirim...' : 'Kirim Email'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsComposeMode(false)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div ref={panelSectionRef} className="space-y-6">
          {!isWebmailMode ? (
            <SectionCard
              title={isRegisterMode ? 'Daftar Mailbox' : 'Panel Lengkap Webmail'}
              subtitle={
                isRegisterMode
                  ? 'Buat mailbox sekolah baru dengan username email pilihan Anda. Domain sekolah tetap mengikuti server.'
                  : 'Bagian ini dipakai hanya saat Anda perlu akses penuh seperti balas email, pencarian lanjut, atau pengelolaan folder.'
              }
            >
              {isRegisterMode ? (
                <form className="space-y-4" onSubmit={handleRegisterSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Username Email</label>
                    <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <input
                        type="text"
                        value={registerUser}
                        onChange={(event) => setRegisterUser(event.target.value.toLowerCase())}
                        placeholder={suggestedMailboxUsername || 'username email'}
                        autoComplete="off"
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                      />
                      <span className="pl-2 text-sm text-slate-500">@{mailboxDomain}</span>
                    </div>
                    <p className="text-sm leading-6 text-slate-500">
                      Isi username email sesuai keinginan Anda. Domain sekolah akan otomatis memakai @{mailboxDomain}, dan setiap akun hanya boleh memiliki satu mailbox.
                    </p>
                    <p className="text-sm text-slate-500">Gunakan huruf kecil, angka, titik, underscore, atau dash.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Password</label>
                    <input
                      type="password"
                      value={registerPass}
                      onChange={(event) => setRegisterPass(event.target.value)}
                      placeholder="Buat password webmail"
                      autoComplete="new-password"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Konfirmasi Password</label>
                    <input
                      type="password"
                      value={registerPassConfirm}
                      onChange={(event) => setRegisterPassConfirm(event.target.value)}
                      placeholder="Konfirmasi password"
                      autoComplete="new-password"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  <p className="text-sm leading-6 text-slate-500">
                    Kapasitas mailbox: {mailboxQuotaLabel} per user. Mailbox mengikuti identitas email sekolah yang sudah ditetapkan server.
                  </p>

                  {registerError ? <p className="text-sm font-semibold text-rose-700">{registerError}</p> : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="submit"
                      disabled={registerMutation.isPending || !isPortalReady}
                      className="rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2a44a0] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {registerMutation.isPending ? 'Memproses...' : 'Daftar Mailbox'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(false);
                        setRegisterError(null);
                        setResetError(null);
                      }}
                      className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-amber-400"
                    >
                      Kembali ke Panel
                    </button>
                  </div>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={handleLoginSubmit}>
                  {useSsoMode ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-700">
                      Mode keamanan SSO aktif. Tekan tombol di bawah untuk masuk ke panel email lengkap.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">Email</label>
                        <input
                          type="email"
                          value={loginIdentityValue}
                          onChange={(event) => {
                            setHasEditedLoginUser(true);
                            setLoginUser(event.target.value);
                          }}
                          placeholder={mailboxPreview || `username@${mailboxDomain}`}
                          autoComplete="username"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-800">Password</label>
                        <input
                          type="password"
                          value={loginPass}
                          onChange={(event) => setLoginPass(event.target.value)}
                          placeholder="Masukkan password webmail"
                          autoComplete="current-password"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  {panelError ? <p className="text-sm font-semibold text-rose-700">{panelError}</p> : null}
                  {resetError ? <p className="text-sm font-semibold text-rose-700">{resetError}</p> : null}
                  {resetResult ? (
                    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                      <p className="text-sm font-extrabold text-amber-900">Password baru berhasil dibuat.</p>
                      <p className="text-sm text-amber-800">Mailbox: {resetResult.mailboxIdentity}</p>
                      <p className="break-all text-sm font-extrabold text-slate-900">{resetResult.password}</p>
                      <p className="text-xs leading-5 text-amber-800">
                        Simpan password ini sekarang. Reset dilakukan pada {formatDateTime(resetResult.resetAt)}.
                      </p>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={startSsoMutation.isPending || !isPortalReady}
                    className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {startSsoMutation.isPending ? 'Menyiapkan...' : useSsoMode ? 'Masuk Panel Lengkap' : 'Login ke Panel Lengkap'}
                  </button>

                  {isSelfRegistrationEnabled ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(true);
                        setRegisterError(null);
                        setResetError(null);
                        setResetResult(null);
                      }}
                      className="w-full rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2a44a0]"
                    >
                      Daftar Mailbox
                    </button>
                  ) : null}

                  {!useSsoMode ? (
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetPasswordMutation.isPending || !isPortalReady}
                      className="w-full py-1 text-center text-sm font-bold text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {resetPasswordMutation.isPending ? 'Mereset Password...' : 'Lupa Password?'}
                    </button>
                  ) : null}
                </form>
              )}
            </SectionCard>
          ) : (
            <SectionCard
              title="Panel Lengkap Aktif"
              subtitle="Panel ini dipertahankan untuk aksi lanjutan seperti baca isi lengkap, pencarian mailbox, compose, dan pengelolaan folder."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleReloadPanel}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Muat Ulang
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectClick}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 transition hover:bg-amber-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Tutup Panel Lengkap
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {isWebmailMode ? (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
          {panelError ? (
            <div className="space-y-3 border-b border-rose-200 bg-rose-50 px-6 py-5">
              <p className="text-sm font-semibold text-rose-700">{panelError}</p>
              <button
                type="button"
                onClick={handleReloadPanel}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Coba Muat Ulang
              </button>
            </div>
          ) : null}
          <iframe
            key={iframeNonce}
            name={WEBMAIL_FRAME_NAME}
            title="Webmail SIS KGB2"
            allow="clipboard-write"
            src={iframeSrc}
            className="h-[calc(100vh-12rem)] min-h-[620px] w-full border-0 bg-white"
          />
        </div>
      ) : null}
    </div>
  );
};
