import { apiClient } from '../../lib/api/client';
import { tokenStorage } from '../../lib/storage/tokenStorage';
import { LoginPayload, LoginResponse, MeResponse, RegisterUmumPayload, RegisterUmumResponse } from './types';
import { offlineCache } from '../../lib/storage/offlineCache';

const ME_CACHE_TTL_MS = 60_000;
let meCache: { token: string; user: LoginResponse['data']['user']; cachedAt: number } | null = null;
let meInFlight: Promise<LoginResponse['data']['user']> | null = null;

const clearMeCache = () => {
  meCache = null;
  meInFlight = null;
};

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

    clearMeCache();
    return response.data.data.user;
  },
  async me(options?: { force?: boolean; allowStaleOnError?: boolean }) {
    const force = Boolean(options?.force);
    const allowStaleOnError = Boolean(options?.allowStaleOnError);
    const token = await tokenStorage.getAccessToken();

    if (!token) {
      clearMeCache();
      throw new Error('Token tidak ditemukan.');
    }

    if (!force && meCache && meCache.token === token && Date.now() - meCache.cachedAt < ME_CACHE_TTL_MS) {
      return meCache.user;
    }

    if (!force && meInFlight) {
      return meInFlight;
    }

    meInFlight = apiClient
      .get<MeResponse>('/auth/me')
      .then((response) => {
        const user = response.data.data;
        meCache = { token, user, cachedAt: Date.now() };
        return user;
      })
      .catch((error) => {
        if (allowStaleOnError && meCache && meCache.token === token) {
          return meCache.user;
        }
        throw error;
      })
      .finally(() => {
        meInFlight = null;
      });

    return meInFlight;
  },
  async registerUmum(payload: RegisterUmumPayload) {
    const response = await apiClient.post<RegisterUmumResponse>('/auth/register-umum', payload);
    return response.data;
  },
  async logout() {
    clearMeCache();
    await tokenStorage.clearAll();
    await offlineCache.clearAllMobileCaches();
  },
};
