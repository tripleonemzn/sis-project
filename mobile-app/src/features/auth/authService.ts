import { apiClient } from '../../lib/api/client';
import { ENV } from '../../config/env';
import { tokenStorage } from '../../lib/storage/tokenStorage';
import {
  LoginPayload,
  LoginResponse,
  MeResponse,
  RegisterBkkPayload,
  RegisterBkkResponse,
  RegisterCalonSiswaPayload,
  RegisterCalonSiswaResponse,
  RegisterParentPayload,
  RegisterParentResponse,
  RegisterUmumPayload,
  RegisterUmumResponse,
} from './types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { webmailSessionStorage } from '../../lib/storage/webmailSessionStorage';

const ME_CACHE_TTL_MS = 60_000;
const ACCESS_TOKEN_HEADER = 'x-sis-access-token';
const REFRESH_TOKEN_HEADER = 'x-sis-refresh-token';
let meCache: { token: string; user: LoginResponse['data']['user']; cachedAt: number } | null = null;
let meInFlight: Promise<LoginResponse['data']['user']> | null = null;

const clearMeCache = () => {
  meCache = null;
  meInFlight = null;
};

async function persistTokensFromHeaders(headers: Headers) {
  const nextAccessToken = String(headers.get(ACCESS_TOKEN_HEADER) || '').trim();
  const nextRefreshToken = String(headers.get(REFRESH_TOKEN_HEADER) || '').trim();

  if (nextAccessToken) {
    await tokenStorage.setAccessToken(nextAccessToken);
  }
  if (nextRefreshToken) {
    await tokenStorage.setRefreshToken(nextRefreshToken);
  }
}

function resolveApiUrl(pathname: string) {
  return `${ENV.API_BASE_URL.replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

async function verifySessionDirect() {
  const accessToken = String((await tokenStorage.getAccessToken()) || '').trim();
  const refreshToken = String((await tokenStorage.getRefreshToken()) || '').trim();

  if (!accessToken && !refreshToken) {
    return null;
  }

  const response = await fetch(resolveApiUrl('/auth/me'), {
    method: 'GET',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'X-Client-Platform': 'mobile',
    },
  });

  await persistTokensFromHeaders(response.headers);

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Verifikasi sesi gagal (${response.status}).`);
  }

  const payload = (await response.json().catch(() => null)) as MeResponse | null;
  const user = payload?.data;
  if (!user) {
    throw new Error('Profil pengguna tidak ditemukan saat verifikasi sesi.');
  }

  const resolvedToken = String(response.headers.get(ACCESS_TOKEN_HEADER) || '').trim() || accessToken;
  meCache = {
    token: resolvedToken,
    user,
    cachedAt: Date.now(),
  };
  return user;
}

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
    const refreshToken = await tokenStorage.getRefreshToken();

    if (!token && !refreshToken) {
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
        const resolvedToken =
          String(response.headers?.['x-sis-access-token'] || '').trim() || (token ? String(token).trim() : '');
        meCache = { token: resolvedToken, user, cachedAt: Date.now() };
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
  async registerCalonSiswa(payload: RegisterCalonSiswaPayload) {
    const response = await apiClient.post<RegisterCalonSiswaResponse>('/auth/register-calon-siswa', payload);
    return response.data;
  },
  async registerParent(payload: RegisterParentPayload) {
    const response = await apiClient.post<RegisterParentResponse>('/auth/register-parent', payload);
    return response.data;
  },
  async registerBkk(payload: RegisterBkkPayload) {
    const response = await apiClient.post<RegisterBkkResponse>('/auth/register-bkk', payload);
    return response.data;
  },
  async logout() {
    clearMeCache();
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {});
    } catch {
      // Ignore revoke failures and clear local session defensively.
    }
    await tokenStorage.clearAll();
    await webmailSessionStorage.clearAll();
    await offlineCache.clearAllMobileCaches();
  },
  async recoverSessionAfterUnauthorized() {
    try {
      const user = await verifySessionDirect();
      if (user) {
        return user;
      }
    } catch {
      // Abaikan error verifikasi langsung non-terminal, lalu jatuhkan ke cleanup defensif di bawah.
    }

    clearMeCache();
    await tokenStorage.clearAll();
    await webmailSessionStorage.clearAll();
    return null;
  },
  clearMeCache,
};
