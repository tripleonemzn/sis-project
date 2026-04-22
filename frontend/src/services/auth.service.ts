import api from './api';
import type {
  AuthResponse,
  AuthRefreshResponse,
  ForgotPasswordRequestPayload,
  ForgotPasswordRequestResult,
  ForgotPasswordResetPayload,
  ForgotPasswordValidateResult,
  RegisterBkkPayload,
  RegisterCalonSiswaPayload,
  RegisterParentPayload,
  User,
} from '../types/auth';
import type { ApiResponse } from '../types/api.types';
import { webmailSessionStorage } from './webmailSessionStorage';

const ME_CACHE_TTL_MS = 60_000;
let meCache: { value: ApiResponse<User>; cachedAt: number } | null = null;
let meInFlight: Promise<ApiResponse<User>> | null = null;
const ACCESS_TOKEN_HEADER = 'x-sis-access-token';

function persistAccessTokenFromHeaders(headers: Record<string, unknown> | undefined) {
  if (typeof window === 'undefined') return;
  const accessToken = String(headers?.[ACCESS_TOKEN_HEADER] || '').trim();
  if (!accessToken) return;
  window.localStorage.setItem('token', accessToken);
}

const isMeCacheFresh = () => {
  if (!meCache) return false;
  return Date.now() - meCache.cachedAt < ME_CACHE_TTL_MS;
};

const getMeInternal = async (options?: { force?: boolean; allowStaleOnError?: boolean }) => {
  const force = Boolean(options?.force);
  const allowStaleOnError = Boolean(options?.allowStaleOnError);

  if (!force && isMeCacheFresh()) {
    return meCache!.value;
  }

  if (!force && meInFlight) {
    return meInFlight;
  }

  meInFlight = api
    .get<ApiResponse<User>>('/auth/me')
    .then((response) => {
      persistAccessTokenFromHeaders(response.headers as Record<string, unknown> | undefined);
      meCache = { value: response.data, cachedAt: Date.now() };
      return response.data;
    })
    .catch((error) => {
      if (allowStaleOnError && meCache) {
        return meCache.value;
      }
      throw error;
    })
    .finally(() => {
      meInFlight = null;
    });

  return meInFlight;
};

export const authService = {
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', { username, password });
    persistAccessTokenFromHeaders(response.headers as Record<string, unknown> | undefined);
    meCache = null;
    meInFlight = null;
    return response.data;
  },

  refreshSession: async (): Promise<AuthRefreshResponse> => {
    const response = await api.post<AuthRefreshResponse>('/auth/refresh', {});
    persistAccessTokenFromHeaders(response.headers as Record<string, unknown> | undefined);
    return response.data;
  },

  registerCalonSiswa: async (payload: RegisterCalonSiswaPayload): Promise<ApiResponse<User>> => {
    const response = await api.post<ApiResponse<User>>('/auth/register-calon-siswa', payload);
    return response.data;
  },

  registerParent: async (payload: RegisterParentPayload): Promise<ApiResponse<User>> => {
    const response = await api.post<ApiResponse<User>>('/auth/register-parent', payload);
    return response.data;
  },

  registerBkk: async (payload: RegisterBkkPayload): Promise<ApiResponse<User>> => {
    const response = await api.post<ApiResponse<User>>('/auth/register-bkk', payload);
    return response.data;
  },

  requestForgotPassword: async (
    payload: ForgotPasswordRequestPayload,
  ): Promise<ApiResponse<ForgotPasswordRequestResult>> => {
    const response = await api.post<ApiResponse<ForgotPasswordRequestResult>>(
      '/auth/forgot-password/request',
      payload,
    );
    return response.data;
  },

  validateForgotPasswordToken: async (
    token: string,
  ): Promise<ApiResponse<ForgotPasswordValidateResult>> => {
    const response = await api.get<ApiResponse<ForgotPasswordValidateResult>>(
      '/auth/forgot-password/validate',
      {
        params: { token },
      },
    );
    return response.data;
  },

  resetForgotPassword: async (
    payload: ForgotPasswordResetPayload,
  ): Promise<ApiResponse<null>> => {
    const response = await api.post<ApiResponse<null>>('/auth/forgot-password/reset', payload);
    return response.data;
  },

  getMe: async (): Promise<ApiResponse<User>> => getMeInternal(),

  getMeSafe: async (): Promise<ApiResponse<User>> => getMeInternal({ allowStaleOnError: true }),

  getMeFresh: async (): Promise<ApiResponse<User>> => getMeInternal({ force: true }),

  logout: async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Ignore logout revoke failures and clear local session defensively.
    }
    meCache = null;
    meInFlight = null;
    localStorage.removeItem('token');
    webmailSessionStorage.clearAccessToken();
  },

  clearMeCache: () => {
    meCache = null;
    meInFlight = null;
  },
};
