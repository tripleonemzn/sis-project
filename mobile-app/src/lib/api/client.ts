import axios from 'axios';
import { ENV } from '../../config/env';
import { tokenStorage } from '../storage/tokenStorage';
import { isJwtExpired } from '../auth/tokenUtils';
import { authSession } from '../auth/authSession';
import { authEventLogger } from '../auth/authEventLogger';

export const apiClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use(async (config) => {
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
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      await authEventLogger.log('UNAUTHORIZED_401', 'Server mengembalikan status 401.');
      await tokenStorage.clearAll();
      await authSession.notifyUnauthorized('UNAUTHORIZED_401');
    }
    return Promise.reject(error);
  },
);
