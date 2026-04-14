import axios from 'axios';
import { ENV } from '../../config/env';
import { tokenStorage } from '../storage/tokenStorage';
import { webmailSessionStorage } from '../storage/webmailSessionStorage';
import { isJwtExpired } from '../auth/tokenUtils';
import { authSession } from '../auth/authSession';
import { authEventLogger } from '../auth/authEventLogger';

export const apiClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: 15000,
});

const BACKOFF_WINDOW_MS = 3000;
const readEndpointBackoffUntil = new Map<string, number>();
type BackoffError = Error & {
  config: unknown;
  response: {
    status: number;
    data: {
      message: string;
    };
  };
};

function normalizeBackoffKey(url: unknown): string {
  return String(url || '').split('?')[0] || '';
}

apiClient.interceptors.request.use(async (config) => {
  const method = String(config.method || 'get').toUpperCase();
  if (method === 'GET') {
    const key = normalizeBackoffKey(config.url);
    if (key) {
      const until = readEndpointBackoffUntil.get(key) || 0;
      if (until > Date.now()) {
        const error = new Error(`REQUEST_BACKOFF:${key}`) as BackoffError;
        error.config = config;
        error.response = { status: 503, data: { message: 'Endpoint sementara ditunda (backoff).' } };
        return Promise.reject(error);
      }
    }
  }

  const token = await tokenStorage.getAccessToken();
  if (token) {
    if (isJwtExpired(token)) {
      await tokenStorage.clearAll();
      await authEventLogger.log('TOKEN_EXPIRED', 'Token kadaluarsa sebelum request dikirim.');
      await authSession.notifyUnauthorized('SESSION_EXPIRED');
      return Promise.reject(new Error('Sesi login telah kadaluarsa.'));
    }
    config.headers.Authorization = `Bearer ${token}`;
  }
  const webmailSessionToken = await webmailSessionStorage.getAccessToken();
  if (webmailSessionToken) {
    config.headers['X-Webmail-Session'] = webmailSessionToken;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 503) {
      const method = String(error?.config?.method || 'get').toUpperCase();
      if (method === 'GET') {
        const key = normalizeBackoffKey(error?.config?.url);
        if (key) {
          readEndpointBackoffUntil.set(key, Date.now() + BACKOFF_WINDOW_MS);
        }
      }
    }
    if (status === 401) {
      await authEventLogger.log('UNAUTHORIZED_401', 'Server mengembalikan status 401.');
      await tokenStorage.clearAll();
      await authSession.notifyUnauthorized('UNAUTHORIZED_401');
    }
    return Promise.reject(error);
  },
);
