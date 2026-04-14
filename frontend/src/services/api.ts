import axios from 'axios';
import { webmailSessionStorage } from './webmailSessionStorage';

const port = typeof window !== 'undefined' ? window.location.port : '';
const isViteDev = port === '5173';
const isVitePreview = port === '4173';
const baseURL = (isViteDev || isVitePreview) ? '/api' : '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
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

function normalizeBackoffKey(url: unknown): string {
  return String(url || '').split('?')[0] || '';
}

// Request interceptor untuk inject token
api.interceptors.request.use(
  (config) => {
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

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
  (error) => {
    if (error.response && error.response.status === 503) {
      const method = String(error.config?.method || 'get').toUpperCase();
      if (method === 'GET') {
        const key = normalizeBackoffKey(error.config?.url);
        if (key) {
          readEndpointBackoffUntil.set(key, Date.now() + BACKOFF_WINDOW_MS);
        }
      }
    }

    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      // Whitelist endpoints that shouldn't trigger logout on 401 immediately
      const isWhitelisted = 
        url.includes('/academic-years/active') || 
        url.includes('/auth/me');

      if (!isWhitelisted && typeof window !== 'undefined') {
        localStorage.removeItem('token');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
