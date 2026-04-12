import api from './api';
import type { ApiResponse } from '../types/api.types';

export type WebmailAuthMode = 'BRIDGE' | 'SSO';

export interface WebmailConfig {
  mode: WebmailAuthMode;
  webmailUrl: string;
  defaultDomain: string;
  ssoEnabled: boolean;
  ssoEntryUrl: string | null;
  tokenTtlSeconds: number;
  mailboxIdentity?: string | null;
  selfRegistrationEnabled?: boolean;
  mailboxQuotaMb?: number;
  user: {
    id: number;
    username: string;
    role: string;
  };
}

export interface WebmailSsoLaunch {
  launchUrl: string;
  expiresInSeconds: number;
  mailboxIdentity?: string;
}

export interface WebmailRegisterPayload {
  username: string;
  password: string;
  confirmPassword: string;
}

export interface WebmailRegisterResult {
  mailboxIdentity: string;
  quotaMb: number;
  createdAt: string;
}

export interface WebmailPasswordResetResult {
  mailboxIdentity: string;
  password: string;
  generatedBySystem: boolean;
  resetAt: string;
}

export const webmailService = {
  getConfig: async (): Promise<ApiResponse<WebmailConfig>> => {
    const response = await api.get<ApiResponse<WebmailConfig>>('/webmail/config');
    return response.data;
  },

  register: async (payload: WebmailRegisterPayload): Promise<ApiResponse<WebmailRegisterResult>> => {
    const response = await api.post<ApiResponse<WebmailRegisterResult>>('/webmail/register', payload);
    return response.data;
  },

  resetPassword: async (): Promise<ApiResponse<WebmailPasswordResetResult>> => {
    const response = await api.post<ApiResponse<WebmailPasswordResetResult>>('/webmail/reset-password');
    return response.data;
  },

  startSso: async (): Promise<ApiResponse<WebmailSsoLaunch>> => {
    const response = await api.post<ApiResponse<WebmailSsoLaunch>>('/webmail/sso/start');
    return response.data;
  },
};
