import { apiClient } from '../../lib/api/client';
import { tokenStorage } from '../../lib/storage/tokenStorage';
import { LoginPayload, LoginResponse, MeResponse, RegisterUmumPayload, RegisterUmumResponse } from './types';
import { offlineCache } from '../../lib/storage/offlineCache';

export const authService = {
  async login(payload: LoginPayload) {
    const response = await apiClient.post<LoginResponse>('/auth/login', payload);
    const token = response.data?.data?.token;
    const refreshToken = response.data?.data?.refreshToken;

    if (!token) {
      throw new Error('Token tidak ditemukan pada response login.');
    }

    await tokenStorage.setAccessToken(token);
    if (refreshToken) {
      await tokenStorage.setRefreshToken(refreshToken);
    }

    return response.data.data.user;
  },
  async me() {
    const response = await apiClient.get<MeResponse>('/auth/me');
    return response.data.data;
  },
  async registerUmum(payload: RegisterUmumPayload) {
    const response = await apiClient.post<RegisterUmumResponse>('/auth/register-umum', payload);
    return response.data;
  },
  async logout() {
    await tokenStorage.clearAll();
    await offlineCache.clearAllMobileCaches();
  },
};
