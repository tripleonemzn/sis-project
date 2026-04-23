import axios from 'axios';
import { ENV } from '../../config/env';
import { tokenStorage } from '../storage/tokenStorage';
import { webmailSessionStorage } from '../storage/webmailSessionStorage';
import { isJwtExpired } from '../auth/tokenUtils';
import { authSession } from '../auth/authSession';
import { authEventLogger } from '../auth/authEventLogger';
import type { RefreshSessionResponse } from '../../features/auth/types';

export const apiClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: 15000,
  headers: {
    'X-Client-Platform': 'mobile',
  },
});
const refreshClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: 15000,
  headers: {
    'X-Client-Platform': 'mobile',
  },
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
type RefreshResult = {
  accessToken: string | null;
  terminal: boolean;
};
const ACCESS_TOKEN_HEADER = 'x-sis-access-token';
const REFRESH_TOKEN_HEADER = 'x-sis-refresh-token';

function normalizeBackoffKey(url: unknown): string {
  return String(url || '').split('?')[0] || '';
}

function isAuthLifecycleUrl(url: unknown): boolean {
  const key = normalizeBackoffKey(url);
  return /^\/?auth\/(?:login|refresh|logout)(?:\/)?$/.test(key);
}

async function persistTokens(params: { accessToken?: string | null; refreshToken?: string | null }) {
  const accessToken = String(params.accessToken || '').trim();
  const refreshToken = String(params.refreshToken || '').trim();

  if (accessToken) {
    await tokenStorage.setAccessToken(accessToken);
  }
  if (refreshToken) {
    await tokenStorage.setRefreshToken(refreshToken);
  }
}

async function consumeAuthHeaders(headers: Record<string, unknown> | undefined) {
  await persistTokens({
    accessToken: String(headers?.[ACCESS_TOKEN_HEADER] || '').trim(),
    refreshToken: String(headers?.[REFRESH_TOKEN_HEADER] || '').trim(),
  });
}

async function clearTerminalSession() {
  await Promise.all([tokenStorage.clearAll(), webmailSessionStorage.clearAll()]);
}

let refreshInFlight: Promise<RefreshResult> | null = null;

async function requestSessionRefresh(): Promise<RefreshResult> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const [refreshToken, accessToken] = await Promise.all([
      tokenStorage.getRefreshToken(),
      tokenStorage.getAccessToken(),
    ]);
    if (!refreshToken && !accessToken) {
      return {
        accessToken: null,
        terminal: true,
      };
    }

    try {
      const refreshResponse = await refreshClient.post<RefreshSessionResponse>('/auth/refresh', {
        ...(refreshToken ? { refreshToken } : {}),
        ...(accessToken ? { accessTokenFallback: accessToken } : {}),
      });
      const nextAccessToken = String(
        refreshResponse.data?.data?.token || refreshResponse.headers?.[ACCESS_TOKEN_HEADER] || '',
      ).trim();
      const nextRefreshToken = String(
        refreshResponse.data?.data?.refreshToken || refreshResponse.headers?.[REFRESH_TOKEN_HEADER] || '',
      ).trim();

      await persistTokens({
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken || refreshToken,
      });

      return {
        accessToken: nextAccessToken || null,
        terminal: false,
      };
    } catch (error) {
      const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
      const terminal = status === 401 || status === 403 || status === 400;
      if (terminal) {
        await clearTerminalSession();
      }
      return {
        accessToken: null,
        terminal,
      };
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
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

  let token = await tokenStorage.getAccessToken();
  if (token && isJwtExpired(token)) {
    const refreshed = await requestSessionRefresh();
    if (refreshed.accessToken) {
      token = refreshed.accessToken;
    } else if (refreshed.terminal) {
      await authEventLogger.log('TOKEN_EXPIRED', 'Token kadaluarsa dan refresh token tidak valid.');
      await authSession.notifyUnauthorized('SESSION_EXPIRED');
      return Promise.reject(new Error('Sesi login telah kadaluarsa.'));
    } else {
      await authEventLogger.log('TOKEN_EXPIRED', 'Token kadaluarsa, tetapi refresh sesi sementara gagal.');
      return Promise.reject(new Error('Sesi sementara belum bisa diperbarui. Silakan coba lagi.'));
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Client-Platform'] = 'mobile';
  const webmailSessionToken = await webmailSessionStorage.getAccessToken();
  if (webmailSessionToken) {
    config.headers['X-Webmail-Session'] = webmailSessionToken;
  }
  return config;
});

apiClient.interceptors.response.use(
  async (response) => {
    await consumeAuthHeaders(response.headers as Record<string, unknown> | undefined);
    return response;
  },
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
      const originalRequest = (error?.config || {}) as {
        url?: string;
        headers?: Record<string, string>;
        _retryAuth?: boolean;
      };

      if (!originalRequest._retryAuth && !isAuthLifecycleUrl(originalRequest.url)) {
        const refreshed = await requestSessionRefresh();
        if (refreshed.accessToken) {
          originalRequest._retryAuth = true;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
          originalRequest.headers['X-Client-Platform'] = 'mobile';
          return apiClient.request(originalRequest);
        }

        if (refreshed.terminal) {
          await authEventLogger.log('UNAUTHORIZED_401', 'Server mengembalikan status 401 dan refresh token tidak valid.');
          await authSession.notifyUnauthorized('UNAUTHORIZED_401');
        }
      }
    }
    return Promise.reject(error);
  },
);
