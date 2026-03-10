import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { webmailService } from '../../services/webmail.service';

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

export const EmailPage = () => {
  const { data: meResponse } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5,
  });
  const currentUser = meResponse?.data;
  const userScopeKey = currentUser?.id && currentUser?.username
    ? `${currentUser.id}:${currentUser.username}`
    : '';
  const { data: webmailConfigResponse } = useQuery({
    queryKey: ['webmail-config', userScopeKey],
    queryFn: webmailService.getConfig,
    enabled: Boolean(userScopeKey),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const webmailConfig = webmailConfigResponse?.data;
  const isSsoMode = webmailConfig?.mode === 'SSO' && Boolean(webmailConfig?.ssoEnabled);
  const useSsoMode = isSsoMode;
  const resolvedWebmailUrl = String(webmailConfig?.webmailUrl || WEBMAIL_URL).trim() || WEBMAIL_URL;
  const bridgeLoginUrl = getBridgeLoginUrl(resolvedWebmailUrl);
  const webmailInboxUrl = getInboxUrl(bridgeLoginUrl);
  const isPortalReady = Boolean(userScopeKey);
  const mailboxDomain = String(webmailConfig?.defaultDomain || DEFAULT_WEBMAIL_DOMAIN)
    .trim()
    .toLowerCase() || DEFAULT_WEBMAIL_DOMAIN;
  const isSelfRegistrationEnabled = !useSsoMode && Boolean(webmailConfig?.selfRegistrationEnabled);
  const mailboxQuotaGb = (webmailConfig?.mailboxQuotaMb || 5120) / 1024;
  const mailboxQuotaLabel = Number.isInteger(mailboxQuotaGb) ? `${mailboxQuotaGb.toFixed(0)} GB` : `${mailboxQuotaGb.toFixed(1)} GB`;

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerUser, setRegisterUser] = useState('');
  const [registerPass, setRegisterPass] = useState('');
  const [registerPassConfirm, setRegisterPassConfirm] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isWebmailMode, setIsWebmailMode] = useState(false);
  const [shouldSubmitBridgeLogin, setShouldSubmitBridgeLogin] = useState(false);
  const [pendingAutoBridgeCredentials, setPendingAutoBridgeCredentials] = useState<WebmailBridgeCredentials | null>(null);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(DEFAULT_WEBMAIL_INBOX_URL);
  const webmailBridgeFormRef = useRef<HTMLFormElement | null>(null);
  const webmailLogoutFormRef = useRef<HTMLFormElement | null>(null);
  const lastHydratedScopeRef = useRef<string>('');
  const bridgeLoginInFlightRef = useRef(false);
  const lastBridgeAuthAtRef = useRef(0);

  const persistWebmailMode = useCallback((enabled: boolean) => {
    if (typeof window === 'undefined' || !userScopeKey) return;
    const storageKey = getWebmailModeStorageKey(userScopeKey);
    if (enabled) {
      window.sessionStorage.setItem(storageKey, '1');
      return;
    }
    window.sessionStorage.removeItem(storageKey);
  }, [userScopeKey]);

  const persistBridgeCredentials = useCallback((email: string, password: string) => {
    if (typeof window === 'undefined' || !userScopeKey) return;
    const storageKey = getWebmailBridgeStorageKey(userScopeKey);
    const payload = JSON.stringify({
      email: String(email || '').trim().toLowerCase(),
      password: String(password || ''),
      updatedAt: Date.now(),
    });
    window.sessionStorage.setItem(storageKey, payload);
  }, [userScopeKey]);

  const clearBridgeCredentials = useCallback(() => {
    if (typeof window === 'undefined' || !userScopeKey) return;
    window.sessionStorage.removeItem(getWebmailBridgeStorageKey(userScopeKey));
  }, [userScopeKey]);

  const startSsoMutation = useMutation({
    mutationFn: webmailService.startSso,
    onSuccess: (response) => {
      const launchUrl = String(response?.data?.launchUrl || resolvedWebmailUrl).trim() || resolvedWebmailUrl;
      setIframeSrc(launchUrl);
      setShouldSubmitBridgeLogin(false);
      setIsWebmailMode(true);
      persistWebmailMode(true);
      setIframeNonce((previous) => previous + 1);
    },
  });

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

  const openWebmailWithBridgeLogin = (email: string, password: string) => {
    if (!userScopeKey) return;

    const normalizedEmail = String(email || '').trim().toLowerCase();
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

  const registerMutation = useMutation({
    mutationFn: webmailService.register,
    onSuccess: (response, variables) => {
      const mailboxIdentity = String(response?.data?.mailboxIdentity || '').trim().toLowerCase();
      if (!mailboxIdentity) {
        setRegisterError('Mailbox berhasil dibuat, tetapi identitas mailbox tidak ditemukan.');
        return;
      }

      setIsRegisterMode(false);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setRegisterError(null);
      openWebmailWithBridgeLogin(mailboxIdentity, variables.password);
    },
    onError: (error) => {
      setRegisterError(getErrorMessage(error, 'Gagal membuat akun webmail.'));
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
      setLoginPass('');
      setIsRegisterMode(false);
      setRegisterUser('');
      setRegisterPass('');
      setRegisterPassConfirm('');
      setRegisterError(null);
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

    const email = loginUser.trim();
    if (!email || !loginPass.trim()) return;
    openWebmailWithBridgeLogin(email, loginPass);
  };

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSelfRegistrationEnabled) return;

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

  const handleDisconnectClick = () => {
    webmailLogoutFormRef.current?.submit();
    persistWebmailMode(false);
    clearBridgeCredentials();
    bridgeLoginInFlightRef.current = false;
    lastBridgeAuthAtRef.current = 0;
    setLoginUser('');
    setLoginPass('');
    setShouldSubmitBridgeLogin(false);
    setPendingAutoBridgeCredentials(null);

    window.setTimeout(() => {
      setIsWebmailMode(false);
      setIframeSrc(useSsoMode ? bridgeLoginUrl : webmailInboxUrl);
      setIframeNonce((previous) => previous + 1);
    }, 120);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-[#eaedf1]">
      {!useSsoMode ? (
        <form ref={webmailBridgeFormRef} action={bridgeLoginUrl} method="post" target={WEBMAIL_FRAME_NAME} className="hidden">
          <input type="hidden" name="login_user" value={loginUser} readOnly />
          <input type="hidden" name="pass_user" value={loginPass} readOnly />
        </form>
      ) : null}
      <form ref={webmailLogoutFormRef} action={bridgeLoginUrl} method="post" target={WEBMAIL_FRAME_NAME} className="hidden">
        <input type="hidden" name="logout" value="1" readOnly />
      </form>

      {isWebmailMode ? (
        <div className="relative h-[calc(100vh-7rem)] w-full">
          <button
            type="button"
            onClick={handleDisconnectClick}
            aria-label="Disconnect webmail"
            title="Disconnect webmail"
            className="absolute right-0 top-0 z-20 h-16 w-16 bg-transparent"
          />
          <iframe
            key={iframeNonce}
            name={WEBMAIL_FRAME_NAME}
            title="Webmail SIS KGB2"
            allow="clipboard-write"
            src={iframeSrc}
            className="h-full w-full border-0 bg-white"
          />
        </div>
      ) : (
        <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center p-5 md:p-10">
          <div className="w-full max-w-5xl overflow-hidden rounded-[28px] bg-[#fbfbfc] shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <section className="flex flex-col justify-between px-8 py-10 md:px-10 md:py-12">
                <div className="mx-auto w-full max-w-[560px]">
                  <div className="mx-auto flex h-[520px] w-full max-w-[520px] items-center justify-center overflow-hidden">
                    <img
                      src="/webmail.png"
                      alt="Ilustrasi Webmail"
                      className="max-h-full w-full scale-[1.85] object-contain object-center"
                    />
                  </div>
                </div>

                <div className="mt-8 space-y-2 text-center text-sm text-slate-700">
                  <div className="flex items-center justify-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-violet-700" />
                    <span>Jaga kerahasiaan password akun webmail Anda.</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-violet-700" />
                    <span>Selalu logout setelah selesai menggunakan perangkat bersama.</span>
                  </div>
                </div>
              </section>

              <section className="border-t border-slate-200 px-8 py-8 md:flex md:items-center md:border-t-0 md:border-l md:px-12 md:py-10">
                <div className="mx-auto w-full max-w-[280px]">
                  <img src="/logo_sis_kgb2.png" alt="Logo SIS KGB2" className="mx-auto h-24 w-24 object-contain" />

                  <h2 className="mt-4 text-center text-2xl font-semibold leading-tight text-slate-800 md:text-[22px]">
                    Portal Webmail Sekolah
                  </h2>
                  <p className="mt-1 text-center text-sm italic text-slate-500">
                    {useSsoMode
                      ? 'akses akun webmail sekolah dengan sekali klik.'
                      : isRegisterMode
                        ? 'buat akun webmail Anda dengan domain sekolah resmi.'
                        : 'masuk menggunakan akun webmail Anda.'}
                  </p>

                  {useSsoMode ? (
                    <div className="mt-5 space-y-3">
                      <p className="text-center text-sm text-slate-500">
                        Mode keamanan SSO aktif. Akses webmail menggunakan token sekali pakai.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenSso}
                        disabled={startSsoMutation.isPending}
                        className="w-full rounded-full bg-[#f89b1f] px-5 py-2.5 text-base font-semibold text-slate-900 transition hover:bg-[#eb8f14] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {startSsoMutation.isPending ? 'Menyiapkan SSO...' : 'Masuk Webmail'}
                      </button>
                      {startSsoMutation.isError ? (
                        <p className="text-center text-xs text-red-600">
                          Gagal menyiapkan sesi SSO webmail. Silakan coba lagi.
                        </p>
                      ) : null}
                    </div>
                  ) : isRegisterMode ? (
                    <form className="mt-5 space-y-4" onSubmit={handleRegisterSubmit}>
                      <div>
                        <label className="mb-2 block text-lg font-medium text-slate-800 md:text-[18px]">Username Email</label>
                        <div className="flex items-end border-b border-slate-500 pb-2">
                          <input
                            type="text"
                            value={registerUser}
                            onChange={(event) => setRegisterUser(event.target.value.toLowerCase())}
                            placeholder="username"
                            required
                            autoComplete="off"
                            className="w-full border-0 bg-transparent text-base text-slate-700 placeholder:italic placeholder:text-slate-400 focus:outline-none"
                          />
                          <span className="whitespace-nowrap pl-2 text-sm text-slate-500">@{mailboxDomain}</span>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-lg font-medium text-slate-800 md:text-[18px]">Password</label>
                        <input
                          type="password"
                          value={registerPass}
                          onChange={(event) => setRegisterPass(event.target.value)}
                          placeholder="buat password webmail"
                          required
                          autoComplete="new-password"
                          className="w-full border-0 border-b border-slate-500 bg-transparent pb-2 text-base text-slate-700 placeholder:italic placeholder:text-slate-400 focus:border-slate-700 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-lg font-medium text-slate-800 md:text-[18px]">Konfirmasi Password</label>
                        <input
                          type="password"
                          value={registerPassConfirm}
                          onChange={(event) => setRegisterPassConfirm(event.target.value)}
                          placeholder="ulangi password webmail"
                          required
                          autoComplete="new-password"
                          className="w-full border-0 border-b border-slate-500 bg-transparent pb-2 text-base text-slate-700 placeholder:italic placeholder:text-slate-400 focus:border-slate-700 focus:outline-none"
                        />
                      </div>

                      <p className="text-xs text-slate-500">Kapasitas mailbox: {mailboxQuotaLabel} per user.</p>

                      {registerError ? <p className="text-xs text-red-600">{registerError}</p> : null}

                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={registerMutation.isPending || !isPortalReady}
                          className="w-full rounded-full bg-[#2c4cb7] px-5 py-2.5 text-base font-semibold text-white transition hover:bg-[#243f9b] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {registerMutation.isPending ? 'Memproses...' : 'Daftar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsRegisterMode(false);
                            setRegisterError(null);
                          }}
                          className="mt-2.5 w-full rounded-full bg-[#f89b1f] px-5 py-2.5 text-base font-semibold text-slate-900 transition hover:bg-[#eb8f14]"
                        >
                          Kembali ke Login
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form className="mt-5 space-y-5" onSubmit={handleLoginSubmit}>
                      <div>
                        <label className="mb-2 block text-lg font-medium text-slate-800 md:text-[18px]">Email</label>
                        <input
                          type="email"
                          value={loginUser}
                          onChange={(event) => setLoginUser(event.target.value)}
                          placeholder="nama@siskgb2.id"
                          required
                          autoComplete="username"
                          className="w-full border-0 border-b border-slate-500 bg-transparent pb-2 text-base text-slate-700 placeholder:italic placeholder:text-slate-400 focus:border-slate-700 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-lg font-medium text-slate-800 md:text-[18px]">Password</label>
                        <input
                          type="password"
                          value={loginPass}
                          onChange={(event) => setLoginPass(event.target.value)}
                          placeholder="masukkan password anda"
                          required
                          autoComplete="current-password"
                          className="w-full border-0 border-b border-slate-500 bg-transparent pb-2 text-base text-slate-700 placeholder:italic placeholder:text-slate-400 focus:border-slate-700 focus:outline-none"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={!isPortalReady}
                          className="w-full rounded-full bg-[#f89b1f] px-5 py-2.5 text-base font-semibold text-slate-900 transition hover:bg-[#eb8f14] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Login
                        </button>
                        {isSelfRegistrationEnabled ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsRegisterMode(true);
                              setRegisterError(null);
                            }}
                            className="mt-2.5 w-full rounded-full bg-[#2c4cb7] px-5 py-2.5 text-base font-semibold text-white transition hover:bg-[#243f9b]"
                          >
                            Daftar
                          </button>
                        ) : null}
                      </div>
                    </form>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
