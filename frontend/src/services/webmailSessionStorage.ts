const WEBMAIL_SESSION_ACCESS_TOKEN_KEY = 'sis_webmail_access_token';

export const webmailSessionStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
  },
  setAccessToken(token: string) {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY, token);
  },
  clearAccessToken() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
  },
};

export default webmailSessionStorage;
