import axios from 'axios';
import { webmailSessionStorage } from './webmailSessionStorage';
import type { AuthRefreshResponse } from '../types/auth';

const port = typeof window !== 'undefined' ? window.location.port : '';
const isViteDev = port === '5173';
const isVitePreview = port === '4173';
const baseURL = (isViteDev || isVitePreview) ? '/api' : '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'web',
  },
});
const refreshClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'web',
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

function normalizeBackoffKey(url: unknown): string {
  return String(url || '').split('?')[0] || '';
}

function shouldSkipReadBackoff(url: unknown): boolean {
  const key = normalizeBackoffKey(url);
  if (!key) return false;
  return /^\/?exams\/available(?:\/)?$/.test(key) || /^\/?exams\/\d+\/start(?:\/)?$/.test(key);
}

function isAuthLifecycleUrl(url: unknown): boolean {
  const key = normalizeBackoffKey(url);
  return /^\/?auth\/(?:login|refresh|logout)(?:\/)?$/.test(key);
}

function persistAccessToken(token: string | null | undefined) {
  if (typeof window === 'undefined') return;
  const normalized = String(token || '').trim();
  if (!normalized) return;
  window.localStorage.setItem('token', normalized);
}

function clearLocalSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('token');
  webmailSessionStorage.clearAccessToken();
}

let refreshInFlight: Promise<RefreshResult> | null = null;

async function requestSessionRefresh(): Promise<RefreshResult> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = refreshClient
    .post<AuthRefreshResponse>('/auth/refresh', {})
    .then((response) => {
      const accessToken = String(response.data?.data?.token || response.headers?.['x-sis-access-token'] || '').trim();
      if (!accessToken) {
        return {
          accessToken: null,
          terminal: false,
        };
      }

      persistAccessToken(accessToken);
      return {
        accessToken,
        terminal: false,
      };
    })
    .catch((error) => {
      const status = Number(error?.response?.status || 0);
      const terminal = status === 401 || status === 403;
      if (terminal) {
        clearLocalSession();
      }
      return {
        accessToken: null,
        terminal,
      };
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

// Request interceptor untuk inject token
api.interceptors.request.use(
  (config) => {
    const method = String(config.method || 'get').toUpperCase();
    if (method === 'GET' && !shouldSkipReadBackoff(config.url)) {
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

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Client-Platform'] = 'web';
    const webmailSessionToken = webmailSessionStorage.getAccessToken();
    if (webmailSessionToken) {
      config.headers['X-Webmail-Session'] = webmailSessionToken;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 503) {
      const method = String(error.config?.method || 'get').toUpperCase();
      if (method === 'GET' && !shouldSkipReadBackoff(error.config?.url)) {
        const key = normalizeBackoffKey(error.config?.url);
        if (key) {
          readEndpointBackoffUntil.set(key, Date.now() + BACKOFF_WINDOW_MS);
        }
      }
    }

    if (error.response && error.response.status === 401) {
      const originalRequest = (error.config || {}) as {
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
          originalRequest.headers['X-Client-Platform'] = 'web';
          return api.request(originalRequest);
        }
        if (refreshed.terminal && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
