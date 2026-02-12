import axios from 'axios';

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

// Request interceptor untuk inject token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      } else {
        console.warn(`[API] 401 Error on ${url} - Ignored for auto-logout whitelist`);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
