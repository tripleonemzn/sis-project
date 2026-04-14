const WEBMAIL_SESSION_ACCESS_TOKEN_KEY = 'sis_webmail_access_token';

export const webmailSessionStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    const sessionToken = window.sessionStorage.getItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
    const localToken = window.localStorage.getItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
    const resolvedToken = sessionToken || localToken;
    if (!resolvedToken) return null;
    if (!sessionToken) {
      window.sessionStorage.setItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY, resolvedToken);
    }
    if (!localToken) {
      window.localStorage.setItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY, resolvedToken);
    }
    return resolvedToken;
  },
  setAccessToken(token: string) {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY, token);
    window.localStorage.setItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY, token);
  },
  clearAccessToken() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
  },
};

export default webmailSessionStorage;
