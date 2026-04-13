import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ExternalLink,
  Inbox,
  MailOpen,
  RefreshCw,
  Reply,
  Send,
  SquarePen,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { webmailService, type WebmailFolderKey, type WebmailMessageSummary } from '../../services/webmail.service';

const WEBMAIL_URL = 'https://mail.siskgb2.id/';
const DEFAULT_WEBMAIL_INBOX_URL = 'https://mail.siskgb2.id/?_task=mail&_mbox=INBOX&_layout=list&_skin=elastic';
const WEBMAIL_FRAME_NAME = 'sis-webmail-frame';
const DEFAULT_WEBMAIL_DOMAIN = 'siskgb2.id';
const MAILBOX_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,62}$/;
const BRIDGE_REAUTH_IDLE_MS = 1000 * 60 * 15;
const DEFAULT_EMAIL_PAGE_LIMIT = 20;
const AUTO_APPLY_SEARCH_DELAY_MS = 350;

const getWebmailModeStorageKey = (scopeKey: string) => `sis-webmail-mode:${scopeKey}`;
const getWebmailBridgeStorageKey = (scopeKey: string) => `sis-webmail-bridge:${scopeKey}`;

type WebmailBridgeCredentials = {
  email: string;
  password: string;
};

type ComposeModeKind = 'new' | 'reply';
type FolderMoveActionTone = 'primary' | 'neutral' | 'warning' | 'danger';
type FolderMoveAction = {
  key: string;
  label: string;
  targetFolderKey: WebmailFolderKey;
  tone: FolderMoveActionTone;
};

const WEBMAIL_FOLDER_SHORTCUTS: Array<{
  key: WebmailFolderKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'INBOX', label: 'Inbox', icon: Inbox },
  { key: 'Drafts', label: 'Draft', icon: SquarePen },
  { key: 'Sent', label: 'Terkirim', icon: Send },
  { key: 'Junk', label: 'Spam', icon: AlertCircle },
  { key: 'Archive', label: 'Arsip', icon: Archive },
];

const getFolderLabel = (folderKey: WebmailFolderKey | 'Trash'): string => {
  if (folderKey === 'Trash') return 'Sampah';
  return WEBMAIL_FOLDER_SHORTCUTS.find((item) => item.key === folderKey)?.label || 'Inbox';
};

const getFolderMoveActions = (folderKey: WebmailFolderKey): FolderMoveAction[] => {
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
};

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

const getMailboxFolderUrl = (bridgeLoginUrl: string, folderKey: WebmailFolderKey): string => {
  try {
    const parsedUrl = new URL(bridgeLoginUrl);
    parsedUrl.search = '';
    parsedUrl.hash = '';
    parsedUrl.searchParams.set('_task', 'mail');
    parsedUrl.searchParams.set('_mbox', folderKey);
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

const normalizeSnippet = (value?: string | null): string => {
  return String(value || '').replace(/\s+/g, ' ').trim();
};

const normalizeReplySubject = (subject?: string | null): string => {
  const normalized = String(subject || '').trim();
  if (!normalized) return 'Re: (Tanpa subjek)';
  if (/^re:/i.test(normalized)) return normalized;
  return `Re: ${normalized}`;
};

const getFolderDescription = (folderKey: WebmailFolderKey): string => {
  return folderKey === 'INBOX'
    ? 'Email masuk terbaru dari mailbox sekolah Anda tampil langsung di halaman ini.'
    : folderKey === 'Drafts'
      ? 'Draft email yang tersimpan di mailbox sekolah Anda tampil langsung di halaman ini.'
      : folderKey === 'Sent'
        ? 'Riwayat email yang sudah dikirim dari mailbox sekolah Anda tampil langsung di halaman ini.'
        : folderKey === 'Junk'
          ? 'Email yang masuk ke folder Spam tampil langsung di halaman ini.'
          : 'Email yang sudah Anda arsipkan tampil langsung di halaman ini.';
};

const getFolderEmptyState = (folderKey: WebmailFolderKey, folderLabel: string): string => {
  return folderKey === 'INBOX'
    ? 'Begitu email baru masuk ke mailbox sekolah, daftar inbox di sini akan langsung ikut terisi.'
    : folderKey === 'Drafts'
      ? 'Belum ada draft email yang tersimpan di mailbox sekolah Anda.'
      : folderKey === 'Sent'
        ? 'Belum ada email terkirim yang tercatat di mailbox sekolah Anda.'
        : folderKey === 'Junk'
          ? 'Belum ada email yang masuk ke folder Spam.'
          : `Belum ada email di folder ${folderLabel}.`;
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
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="mb-4 space-y-1.5">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-[1.15rem]">{title}</h2>
        {subtitle ? <p className="text-sm leading-6 text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
};

const EMAIL_HTML_FRAME_MIN_HEIGHT = 180;

const sanitizeEmailHtml = (value?: string | null): string => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const bodyMatch = normalized.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : normalized;

  return bodyHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(html|head|body|meta|title|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1=$2#$2')
    .trim();
};

const buildEmailHtmlDocument = (value?: string | null): string => {
  const content = sanitizeEmailHtml(value);
  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <base target="_blank" />
        <style>
          :root {
            color-scheme: light;
          }
          * {
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 15px;
            line-height: 1.65;
          }
          body {
            padding: 0;
            overflow-wrap: break-word;
            word-break: normal;
          }
          img, video, iframe, table {
            max-width: 100%;
          }
          img {
            height: auto;
            display: block;
            border-radius: 12px;
            margin: 0 0 12px;
          }
          a {
            color: #1d4ed8;
          }
          p, div, li {
            margin-top: 0;
          }
          blockquote {
            margin: 0 0 12px;
            padding-left: 12px;
            border-left: 3px solid #cbd5e1;
            color: #475569;
          }
          pre {
            white-space: pre-wrap;
            word-break: break-word;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
          }
        </style>
      </head>
      <body>${content || '<p>Isi email tidak tersedia.</p>'}</body>
    </html>`;
};

const EmailHtmlPreview = ({
  html,
  onImagePress,
}: {
  html: string;
  onImagePress?: (src: string) => void;
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(EMAIL_HTML_FRAME_MIN_HEIGHT);
  const srcDoc = useMemo(() => buildEmailHtmlDocument(html), [html]);

  const bindImagePreviewHandlers = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame || typeof onImagePress !== 'function') return;

    try {
      const doc = frame.contentDocument;
      const images = Array.from(doc?.images || []);
      images.forEach((image) => {
        if (image.dataset.sisEmailPreviewBound === '1') return;
        image.dataset.sisEmailPreviewBound = '1';
        image.style.cursor = 'zoom-in';
        image.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const resolvedSrc = String(image.currentSrc || image.src || '').trim();
          if (resolvedSrc) {
            onImagePress(resolvedSrc);
          }
        });
      });
    } catch {
      // Ignore iframe access issues and keep email readable.
    }
  }, [onImagePress]);

  const syncHeight = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;

    try {
      const doc = frame.contentDocument;
      bindImagePreviewHandlers();
      const nextHeight = Math.max(
        doc?.body?.scrollHeight || 0,
        doc?.documentElement?.scrollHeight || 0,
        EMAIL_HTML_FRAME_MIN_HEIGHT,
      );
      setHeight(Math.min(nextHeight, 640));
    } catch {
      setHeight(EMAIL_HTML_FRAME_MIN_HEIGHT);
    }
  }, [bindImagePreviewHandlers]);

  useEffect(() => {
    setHeight(EMAIL_HTML_FRAME_MIN_HEIGHT);
    const timers = [0, 180, 600].map((delay) => window.setTimeout(syncHeight, delay));
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [srcDoc, syncHeight]);

  return (
    <iframe
      ref={iframeRef}
      title="Isi email"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      srcDoc={srcDoc}
      onLoad={syncHeight}
      referrerPolicy="no-referrer"
      className="w-full rounded-2xl border border-slate-200 bg-white"
      style={{ height }}
    />
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
  const snippetLabel = normalizeSnippet(item.snippet || '');
  const wrapperClassName = selected
    ? 'border-blue-300 bg-blue-50/70'
    : item.isRead
      ? 'border-slate-200 bg-white'
      : 'border-blue-200 bg-blue-50/35';

  return (
    <button
      type="button"
      onClick={onPress}
      className={`w-full rounded-xl border px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/60 ${wrapperClassName}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.isRead ? 'bg-slate-200' : 'bg-blue-500'}`} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start lg:gap-3">
            <p className={`min-w-0 truncate text-sm ${item.isRead ? 'font-semibold text-slate-800' : 'font-bold text-slate-900'} lg:w-56 lg:shrink-0`}>
              {senderLabel}
            </p>
            <p className={`min-w-0 flex-1 truncate text-sm ${item.isRead ? 'text-slate-700' : 'text-slate-800'}`}>
              <span className={item.isRead ? 'font-semibold' : 'font-bold'}>{subjectLabel}</span>
              {snippetLabel ? <span className="ml-2 font-normal text-slate-500">{snippetLabel}</span> : null}
            </p>
            <p className="shrink-0 text-xs font-medium text-slate-500">{formatDateTime(item.date)}</p>
          </div>
        </div>
      </div>
    </button>
  );
};

const getActionTileClasses = (tone: FolderMoveActionTone) => {
  if (tone === 'danger') {
    return {
      icon: 'border-rose-200 bg-white text-rose-600',
      text: 'text-rose-700',
    };
  }
  if (tone === 'warning') {
    return {
      icon: 'border-amber-200 bg-white text-amber-700',
      text: 'text-amber-800',
    };
  }
  if (tone === 'primary') {
    return {
      icon: 'border-blue-200 bg-white text-blue-600',
      text: 'text-blue-700',
    };
  }
  return {
    icon: 'border-slate-200 bg-white text-slate-600',
    text: 'text-slate-700',
  };
};

const getFolderActionIcon = (targetFolderKey: WebmailFolderKey): LucideIcon => {
  if (targetFolderKey === 'Archive') return Archive;
  if (targetFolderKey === 'Junk') return AlertCircle;
  return Inbox;
};

const ActionTile = ({
  label,
  icon: Icon,
  tone,
  onClick,
  disabled = false,
  busy = false,
}: {
  label: string;
  icon: LucideIcon;
  tone: FolderMoveActionTone;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) => {
  const classes = getActionTileClasses(tone);
  const Indicator = busy ? RefreshCw : Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-w-[72px] flex-col items-center justify-center gap-2 px-1 py-1 text-center transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${classes.icon}`}>
        <Indicator className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
      </span>
      <span className={`text-[11px] font-semibold leading-4 ${classes.text}`}>{busy ? 'Memproses...' : label}</span>
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

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerUser, setRegisterUser] = useState('');
  const [registerPass, setRegisterPass] = useState('');
  const [registerPassConfirm, setRegisterPassConfirm] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isWebmailMode, setIsWebmailMode] = useState(false);
  const [shouldSubmitBridgeLogin, setShouldSubmitBridgeLogin] = useState(false);
  const [pendingAutoBridgeCredentials, setPendingAutoBridgeCredentials] = useState<WebmailBridgeCredentials | null>(null);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(DEFAULT_WEBMAIL_INBOX_URL);
  const [activeFolderKey, setActiveFolderKey] = useState<WebmailFolderKey>('INBOX');
  const [selectedEmailGuid, setSelectedEmailGuid] = useState<string | null>(null);
  const [isEmailDetailVisible, setIsEmailDetailVisible] = useState(false);
  const [isComposeMode, setIsComposeMode] = useState(false);
  const [composeModeKind, setComposeModeKind] = useState<ComposeModeKind>('new');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(DEFAULT_EMAIL_PAGE_LIMIT);

  const emailFeedQuery = useQuery({
    queryKey: ['webmail-folder-feed', mailboxIdentity || 'all', activeFolderKey, visibleLimit, appliedSearch],
    queryFn: () => webmailService.getMessages({ page: 1, limit: visibleLimit, folderKey: activeFolderKey, query: appliedSearch }),
    enabled: isPortalReady && !isWebmailMode,
    staleTime: 30_000,
    refetchInterval: isPortalReady && !isWebmailMode && visibleLimit === DEFAULT_EMAIL_PAGE_LIMIT && !appliedSearch ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    retry: false,
  });

  const mailboxFeed = emailFeedQuery.data?.data;
  const mailboxMessages = mailboxFeed?.messages ?? [];
  const totalMessageCount = Number(mailboxFeed?.pagination.total || 0);
  const hasAppliedSearch = appliedSearch.trim().length > 0;
  const canLoadMore = mailboxMessages.length < totalMessageCount;
  const activeFolderLabel = WEBMAIL_FOLDER_SHORTCUTS.find((item) => item.key === activeFolderKey)?.label || 'Inbox';
  const activeFolderDescription = getFolderDescription(activeFolderKey);
  const activeFolderEmptyState = hasAppliedSearch
    ? `Belum ada email yang cocok dengan kata kunci "${appliedSearch}" di folder ${activeFolderLabel}.`
    : getFolderEmptyState(activeFolderKey, activeFolderLabel);
  const activeFolderTitle = activeFolderKey === 'INBOX' ? 'Kotak Masuk' : activeFolderLabel;
  const canReplyFromSelectedFolder = activeFolderKey !== 'Drafts';
  const selectedEmail = mailboxMessages.find((item) => item.guid === selectedEmailGuid) ?? null;

  const selectedEmailDetailQuery = useQuery({
    queryKey: ['webmail-message-detail', activeFolderKey, selectedEmailGuid || 'empty'],
    queryFn: () => webmailService.getMessageDetail(String(selectedEmailGuid), { folderKey: activeFolderKey }),
    enabled:
      Boolean(selectedEmailGuid) &&
      isPortalReady &&
      !isWebmailMode &&
      mailboxFeed?.mailboxAvailable !== false &&
      (isEmailDetailVisible || (isComposeMode && composeModeKind === 'reply')),
    staleTime: 30_000,
    retry: false,
  });

  const selectedEmailDetail = selectedEmailDetailQuery.data?.data;
  const selectedSenderLabel = selectedEmail ? extractSenderLabel(selectedEmail) : '-';
  const selectedSubjectLabel = selectedEmail ? extractSubjectLabel(selectedEmail) : '-';
  const selectedBodyHtml = String(selectedEmailDetail?.html || '').trim();
  const selectedBodyText = selectedEmailDetail?.plainText || selectedEmailDetail?.previewText || selectedEmail?.snippet || '';
  const availableMoveActions = getFolderMoveActions(activeFolderKey);
  const closeEmailDetail = () => {
    setIsEmailDetailVisible(false);
    setSelectedEmailGuid(null);
  };

  useEffect(() => {
    if (!isPortalReady || isWebmailMode || mailboxFeed?.mailboxAvailable === false) return;

    const nextSearch = searchDraft.trim();
    if (nextSearch === appliedSearch) return;

    const timeoutId = window.setTimeout(() => {
      setIsEmailDetailVisible(false);
      setSelectedEmailGuid(null);
      setVisibleLimit(DEFAULT_EMAIL_PAGE_LIMIT);
      setAppliedSearch(nextSearch);
    }, AUTO_APPLY_SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [appliedSearch, isPortalReady, isWebmailMode, mailboxFeed?.mailboxAvailable, searchDraft]);

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
    setIsRegisterMode(false);
    setIsEmailDetailVisible(false);

    if (openImmediatelyWhenSso && useSsoMode) {
      handleOpenSso(activeFolderKey);
      window.setTimeout(() => {
        panelSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 80);
      return;
    }

    setShouldSubmitBridgeLogin(false);
    setIframeSrc(getMailboxFolderUrl(bridgeLoginUrl, activeFolderKey));
    setIsWebmailMode(true);
    persistWebmailMode(true);
    setIframeNonce((previous) => previous + 1);

    window.setTimeout(() => {
      panelSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
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
    mutationFn: (folderKey?: WebmailFolderKey) => webmailService.startSso().then((response) => ({ response, folderKey })),
    onSuccess: ({ response, folderKey }) => {
      const nextFolderKey = folderKey || activeFolderKey;
      const launchUrl = String(response?.data?.launchUrl || resolvedWebmailUrl).trim() || resolvedWebmailUrl;
      setPanelError(null);
      setIframeSrc(getMailboxFolderUrl(launchUrl, nextFolderKey));
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
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setActiveFolderKey('INBOX');
      setIsRegisterMode(false);
      openWebmailWithBridgeLogin(nextMailboxIdentity, variables.password);
    },
    onError: (error) => {
      setRegisterError(getErrorMessage(error, 'Gagal membuat akun webmail.'));
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: ({ guid, folderKey }: { guid: string; folderKey: WebmailFolderKey }) =>
      webmailService.markMessageRead(guid, { folderKey }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['webmail-folder-feed'],
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

  const markAsUnreadMutation = useMutation({
    mutationFn: ({ guid, folderKey }: { guid: string; folderKey: WebmailFolderKey }) =>
      webmailService.markMessageUnread(guid, { folderKey }),
    onSuccess: async () => {
      toast.success('Email berhasil ditandai sebagai belum dibaca.');
      setIsEmailDetailVisible(false);
      setSelectedEmailGuid(null);
      await queryClient.invalidateQueries({
        queryKey: ['webmail-folder-feed'],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: ['webmail-message-detail'],
        refetchType: 'active',
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal menandai email sebagai belum dibaca.'));
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
    }) => webmailService.moveMessage(guid, { sourceFolderKey, targetFolderKey }),
    onSuccess: async (response) => {
      toast.success(`Email berhasil dipindahkan ke folder ${getFolderLabel(response.data.targetFolderKey)}.`);
      setIsEmailDetailVisible(false);
      setSelectedEmailGuid(null);
      await queryClient.invalidateQueries({
        queryKey: ['webmail-folder-feed'],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: ['webmail-message-detail'],
        refetchType: 'active',
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal memindahkan email.'));
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: ({ guid, folderKey }: { guid: string; folderKey: WebmailFolderKey }) =>
      webmailService.deleteMessage(guid, { folderKey }),
    onSuccess: async () => {
      toast.success('Email berhasil dipindahkan ke folder Sampah.');
      setIsEmailDetailVisible(false);
      setSelectedEmailGuid(null);
      await queryClient.invalidateQueries({
        queryKey: ['webmail-folder-feed'],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: ['webmail-message-detail'],
        refetchType: 'active',
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus email.'));
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
        queryKey: ['webmail-folder-feed'],
        refetchType: 'active',
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal mengirim email.'));
    },
  });

  const canMarkSelectedEmailUnread = Boolean(selectedEmail?.isRead);
  const isDetailActionPending =
    moveMessageMutation.isPending || markAsUnreadMutation.isPending || deleteMessageMutation.isPending;

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
      setLoginPass('');
      setIsRegisterMode(false);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setRegisterError(null);
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

  const handleOpenSso = (folderKey?: WebmailFolderKey) => {
    if (startSsoMutation.isPending) return;
    startSsoMutation.mutate(folderKey || activeFolderKey);
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
    registerMutation.mutate({ username, password, confirmPassword });
  };

  const handleDisconnectClick = () => {
    webmailLogoutFormRef.current?.submit();
    persistWebmailMode(false);
    clearBridgeCredentials();
    bridgeLoginInFlightRef.current = false;
    lastBridgeAuthAtRef.current = 0;
    setPanelError(null);
    setLoginUser('');
    setLoginPass('');
    setShouldSubmitBridgeLogin(false);
    setPendingAutoBridgeCredentials(null);

    window.setTimeout(() => {
      setIsWebmailMode(false);
      setIframeSrc(getMailboxFolderUrl(bridgeLoginUrl, activeFolderKey));
      setIframeNonce((previous) => previous + 1);
    }, 120);
  };

  const handleReloadPanel = () => {
    setPanelError(null);

    if (useSsoMode) {
      handleOpenSso(activeFolderKey);
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

    setIframeSrc(getMailboxFolderUrl(bridgeLoginUrl, activeFolderKey));
    setIframeNonce((previous) => previous + 1);
  };

  const openNewCompose = () => {
    setIsEmailDetailVisible(false);
    setIsComposeMode(true);
    setComposeModeKind('new');
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
  };

  const openReplyCompose = () => {
    const replyTarget = String(selectedEmailDetail?.from || selectedEmail?.from || '').trim();
    setIsEmailDetailVisible(false);
    setIsComposeMode(true);
    setComposeModeKind('reply');
    setComposeTo(replyTarget);
    setComposeCc('');
    setComposeSubject(normalizeReplySubject(selectedEmail?.subject));
    setComposeBody('');
  };

  const handleSelectEmail = async (item: WebmailMessageSummary) => {
    setSelectedEmailGuid(item.guid);
    setIsEmailDetailVisible(true);
    if (item.isRead) return;

    try {
      await markAsReadMutation.mutateAsync({ guid: item.guid, folderKey: activeFolderKey });
    } catch {
      return;
    }
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
    setIsEmailDetailVisible(false);
    setSelectedEmailGuid(null);
    setVisibleLimit(DEFAULT_EMAIL_PAGE_LIMIT);
  };

  const handleMoveSelectedEmail = async (targetFolderKey: WebmailFolderKey) => {
    if (!selectedEmail) return;
    await moveMessageMutation.mutateAsync({
      guid: selectedEmail.guid,
      sourceFolderKey: activeFolderKey,
      targetFolderKey,
    });
  };

  const handleMarkSelectedEmailUnread = async () => {
    if (!selectedEmail) return;
    await markAsUnreadMutation.mutateAsync({
      guid: selectedEmail.guid,
      folderKey: activeFolderKey,
    });
  };

  const handleDeleteSelectedEmail = async () => {
    if (!selectedEmail) return;
    await deleteMessageMutation.mutateAsync({
      guid: selectedEmail.guid,
      folderKey: activeFolderKey,
    });
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

      <div className="space-y-6">
        <div className="space-y-1 px-1">
          <h1 className="text-lg font-semibold text-slate-900">Email</h1>
          <p className="text-sm leading-6 text-slate-500">
            Mailbox sekolah tampil langsung seperti daftar email harian.
            {mailboxIdentity ? ` Mailbox aktif: ${mailboxIdentity}.` : ''}
          </p>
        </div>

        <SectionCard title={activeFolderTitle} subtitle={activeFolderDescription}>
          <div className="space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-wrap items-start gap-4 xl:flex-nowrap">
                {WEBMAIL_FOLDER_SHORTCUTS.map((folder) => {
                  const isActive = folder.key === activeFolderKey;
                  const Icon = folder.icon;
                  return (
                    <button
                      key={folder.key}
                      type="button"
                      onClick={() => {
                        setActiveFolderKey(folder.key);
                        closeEmailDetail();
                        setSearchDraft('');
                        setAppliedSearch('');
                        setVisibleLimit(DEFAULT_EMAIL_PAGE_LIMIT);
                      }}
                      className="min-w-[68px] shrink-0"
                    >
                      <span className="flex flex-col items-center gap-2">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                            isActive
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className={`text-center text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>
                          {folder.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {mailboxFeed?.mailboxAvailable !== false ? (
                <div className="space-y-2 xl:min-w-0 xl:flex-1">
                  <form
                    className="flex flex-col gap-2 lg:flex-row lg:items-center xl:justify-end"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleApplySearch();
                    }}
                  >
                    <label className="shrink-0 text-sm font-semibold text-slate-700">Cari Email</label>
                    <input
                      type="text"
                      value={searchDraft}
                      onChange={(event) => setSearchDraft(event.target.value)}
                      placeholder="Cari pengirim, subjek, atau isi email"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 xl:max-w-md"
                    />
                    <button
                      type="submit"
                      className="rounded-2xl bg-[#3250b9] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a44a0]"
                    >
                      Cari
                    </button>
                  </form>
                  {hasAppliedSearch || searchDraft.trim().length > 0 ? (
                    <div className="xl:text-right">
                      <button
                        type="button"
                        onClick={handleResetSearch}
                        className="text-sm font-semibold text-[#3250b9] transition hover:text-[#274194]"
                      >
                        Reset Pencarian
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {emailFeedQuery.isLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Memuat {activeFolderLabel.toLowerCase()}...
              </div>
            ) : emailFeedQuery.isError ? (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
                <p className="text-sm font-semibold text-rose-700">
                  {getErrorMessage(emailFeedQuery.error, `Gagal memuat folder ${activeFolderLabel}.`)}
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
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-900">Mailbox belum tersedia</p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Akun ini sudah dikenali, tetapi mailbox di server mail belum aktif.
                </p>
                {isSelfRegistrationEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(true);
                      setRegisterError(null);
                    }}
                    className="mt-4 rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a44a0]"
                  >
                    Daftar Mailbox
                  </button>
                ) : null}
              </div>
            ) : mailboxMessages.length === 0 ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">{activeFolderLabel} masih kosong</p>
                <p className="text-sm leading-6 text-slate-500">{activeFolderEmptyState}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-slate-500">
                  {hasAppliedSearch
                    ? `Menampilkan ${mailboxMessages.length} dari ${totalMessageCount} email yang cocok dengan "${appliedSearch}".`
                    : `Menampilkan ${mailboxMessages.length} dari ${totalMessageCount} email di folder ${activeFolderLabel}.`}
                </p>
                {mailboxMessages.map((item) => (
                  <EmailInboxItem
                    key={item.guid}
                    item={item}
                    selected={isEmailDetailVisible && item.guid === selectedEmailGuid}
                    onPress={() => {
                      void handleSelectEmail(item);
                    }}
                  />
                ))}
                {canLoadMore ? (
                  <button
                    type="button"
                    disabled={emailFeedQuery.isFetching}
                    onClick={() => {
                      setVisibleLimit((current) => current + DEFAULT_EMAIL_PAGE_LIMIT);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${emailFeedQuery.isFetching && !emailFeedQuery.isLoading ? 'animate-spin' : ''}`} />
                    Muat Lebih Banyak
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </SectionCard>

        {selectedEmail && isEmailDetailVisible ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/15 px-4 py-6">
            <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">Detail {activeFolderLabel}</h2>
                  <p className="text-sm leading-6 text-slate-500">Baca isi email tanpa kehilangan posisi daftar {activeFolderLabel.toLowerCase()}.</p>
                </div>
                <button
                  type="button"
                  onClick={closeEmailDetail}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <p className="text-sm text-slate-600">
                        Dari: <span className="font-semibold text-slate-900">{selectedSenderLabel}</span>
                      </p>
                      <p className="text-sm text-slate-600">
                        Waktu: <span className="font-semibold text-slate-900">{formatDateTime(selectedEmail.date)}</span>
                      </p>
                      <p className="text-sm text-slate-600 sm:col-span-2">
                        Subjek: <span className="font-semibold text-slate-900">{selectedSubjectLabel}</span>
                      </p>
                      {selectedEmailDetail?.to ? (
                        <p className="text-sm text-slate-600 sm:col-span-2">
                          Ke: <span className="font-semibold text-slate-900">{selectedEmailDetail.to}</span>
                        </p>
                      ) : null}
                      {selectedEmailDetail?.cc ? (
                        <p className="text-sm text-slate-600 sm:col-span-2">
                          CC: <span className="font-semibold text-slate-900">{selectedEmailDetail.cc}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-700">Aksi Email</p>
                      <div className="flex flex-wrap items-start gap-4">
                        {canReplyFromSelectedFolder ? (
                          <ActionTile label="Balas Email" icon={Reply} tone="primary" onClick={openReplyCompose} disabled={isDetailActionPending} />
                        ) : null}
                        {canMarkSelectedEmailUnread ? (
                          <ActionTile
                            label="Belum Dibaca"
                            icon={MailOpen}
                            tone="primary"
                            onClick={() => {
                              void handleMarkSelectedEmailUnread();
                            }}
                            disabled={isDetailActionPending}
                            busy={markAsUnreadMutation.isPending}
                          />
                        ) : null}
                        <ActionTile
                          label="Hapus"
                          icon={Trash2}
                          tone="danger"
                          onClick={() => {
                            void handleDeleteSelectedEmail();
                          }}
                          disabled={isDetailActionPending}
                          busy={deleteMessageMutation.isPending}
                        />
                        <ActionTile
                          label="Panel Lengkap"
                          icon={ExternalLink}
                          tone="neutral"
                          onClick={() => openPanelSection(true)}
                        />
                      </div>
                    </div>

                    {availableMoveActions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-slate-700">Aksi Folder</p>
                        <div className="flex flex-wrap items-start gap-4">
                          {availableMoveActions.map((action) => (
                            <ActionTile
                              key={action.key}
                              label={action.label}
                              icon={getFolderActionIcon(action.targetFolderKey)}
                              tone={action.tone}
                              onClick={() => {
                                void handleMoveSelectedEmail(action.targetFolderKey);
                              }}
                              disabled={isDetailActionPending}
                              busy={moveMessageMutation.isPending}
                            />
                          ))}
                        </div>
                      </div>
                    ) : <div />}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
                    ) : selectedBodyHtml ? (
                      <EmailHtmlPreview
                        html={selectedBodyHtml}
                        onImagePress={(src) => {
                          setPreviewImageSrc(src);
                        }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedBodyText || 'Isi email tidak tersedia.'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isComposeMode ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/15 px-4 py-6">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">{composeModeKind === 'reply' ? 'Balas Email' : 'Tulis Email Baru'}</h2>
                  <p className="text-sm leading-6 text-slate-500">
                    {composeModeKind === 'reply'
                      ? 'Balasan akan dikirim dari mailbox sekolah Anda dan salinannya otomatis disimpan ke folder Sent.'
                      : 'Email akan dikirim dari mailbox sekolah Anda dan salinannya otomatis disimpan ke folder Sent.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsComposeMode(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">
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
                      className="rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a44a0] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {sendMessageMutation.isPending ? 'Mengirim...' : 'Kirim Email'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsComposeMode(false)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {previewImageSrc ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4 py-6" onClick={() => setPreviewImageSrc(null)}>
            <div
              className="relative flex max-h-[90vh] w-full max-w-5xl items-center justify-center rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.14)]"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewImageSrc(null)}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={previewImageSrc} alt="Pratinjau gambar email" className="max-h-[82vh] max-w-full rounded-2xl object-contain" />
            </div>
          </div>
        ) : null}

        {isWebmailMode ? (
          <div ref={panelSectionRef} className="space-y-4">
            <SectionCard
              title="Panel Lengkap Aktif"
              subtitle="Panel webmail penuh dibuka hanya saat Anda membutuhkan fitur lanjutan."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleReloadPanel}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Muat Ulang
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectClick}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Tutup Panel Lengkap
                </button>
              </div>
            </SectionCard>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
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
          </div>
        ) : null}
      </div>

      {mailboxFeed?.mailboxAvailable !== false && !isComposeMode && !isRegisterMode && !isWebmailMode ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-30 flex flex-col items-center gap-1 sm:right-8">
          <button
            type="button"
            onClick={openNewCompose}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.22)] transition hover:bg-slate-800"
          >
            <SquarePen className="h-5 w-5" />
          </button>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">Tulis</span>
        </div>
      ) : null}

      {isRegisterMode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/15 px-4 py-6">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">Daftar Mailbox</h2>
                <p className="text-sm leading-6 text-slate-500">
                  Buat mailbox sekolah baru dengan username email pilihan Anda. Domain sekolah tetap mengikuti server.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setRegisterError(null);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">
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
                    className="rounded-2xl bg-[#3250b9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a44a0] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {registerMutation.isPending ? 'Memproses...' : 'Daftar Mailbox'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(false);
                      setRegisterError(null);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    Tutup
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
