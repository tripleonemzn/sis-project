import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_EVENT_KEY = 'sis_auth_events';
const MAX_EVENTS = 100;

type AuthEvent = {
  type:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'SESSION_RESTORED'
    | 'SESSION_RESTORE_FAILED'
    | 'TOKEN_EXPIRED'
    | 'UNAUTHORIZED_401'
    | 'LOGOUT'
    | 'API_CHECK_OK'
    | 'API_CHECK_FAILED'
    | 'CACHE_CLEARED'
    | 'REPORT_EXPORTED';
  ts: string;
  message?: string;
};

async function readEvents(): Promise<AuthEvent[]> {
  const raw = await AsyncStorage.getItem(AUTH_EVENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AuthEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const authEventLogger = {
  async log(type: AuthEvent['type'], message?: string) {
    const event: AuthEvent = {
      type,
      ts: new Date().toISOString(),
      message,
    };
    const existing = await readEvents();
    const next = [event, ...existing].slice(0, MAX_EVENTS);
    await AsyncStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(next));
    // Keep console output for dev troubleshooting.
    console.info('[AUTH_EVENT]', event.type, event.message || '');
  },
  async getAll() {
    return readEvents();
  },
  async clear() {
    await AsyncStorage.removeItem(AUTH_EVENT_KEY);
  },
};
