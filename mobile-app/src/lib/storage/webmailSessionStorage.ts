import * as SecureStore from 'expo-secure-store';

const WEBMAIL_SESSION_ACCESS_TOKEN_KEY = 'sis_webmail_access_token';
const WEBMAIL_SESSION_BRIDGE_CREDENTIALS_KEY = 'sis_webmail_bridge_credentials';

export type StoredWebmailBridgeCredentials = {
  email: string;
  password: string;
};

export const webmailSessionStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
  },
  async setAccessToken(token: string) {
    return SecureStore.setItemAsync(WEBMAIL_SESSION_ACCESS_TOKEN_KEY, token);
  },
  async clearAccessToken() {
    return SecureStore.deleteItemAsync(WEBMAIL_SESSION_ACCESS_TOKEN_KEY);
  },
  async getBridgeCredentials(): Promise<StoredWebmailBridgeCredentials | null> {
    const raw = await SecureStore.getItemAsync(WEBMAIL_SESSION_BRIDGE_CREDENTIALS_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredWebmailBridgeCredentials>;
      const email = String(parsed?.email || '').trim().toLowerCase();
      const password = String(parsed?.password || '');
      if (!email || !password) return null;
      return { email, password };
    } catch {
      return null;
    }
  },
  async setBridgeCredentials(credentials: StoredWebmailBridgeCredentials) {
    return SecureStore.setItemAsync(WEBMAIL_SESSION_BRIDGE_CREDENTIALS_KEY, JSON.stringify(credentials));
  },
  async clearBridgeCredentials() {
    return SecureStore.deleteItemAsync(WEBMAIL_SESSION_BRIDGE_CREDENTIALS_KEY);
  },
  async clearAll() {
    await Promise.all([
      SecureStore.deleteItemAsync(WEBMAIL_SESSION_ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(WEBMAIL_SESSION_BRIDGE_CREDENTIALS_KEY),
    ]);
  },
};

export default webmailSessionStorage;
