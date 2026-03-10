import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type MobileWebmailAuthMode = 'BRIDGE' | 'SSO';

export type MobileWebmailConfig = {
  mode: MobileWebmailAuthMode;
  webmailUrl: string;
  defaultDomain: string;
  ssoEnabled: boolean;
  ssoEntryUrl: string | null;
  tokenTtlSeconds: number;
  mailboxIdentity: string | null;
  selfRegistrationEnabled?: boolean;
  mailboxQuotaMb?: number;
  user: {
    id: number;
    username: string;
    role: string;
  };
};

export type MobileWebmailSsoLaunch = {
  launchUrl: string;
  expiresInSeconds: number;
  mailboxIdentity?: string | null;
};

export type MobileWebmailRegisterPayload = {
  username: string;
  password: string;
  confirmPassword: string;
};

export type MobileWebmailRegisterResult = {
  mailboxIdentity: string;
  quotaMb: number;
  createdAt: string;
};

export const webmailApi = {
  async getConfig() {
    const response = await apiClient.get<ApiEnvelope<MobileWebmailConfig>>('/webmail/config');
    return response.data.data;
  },

  async startSso() {
    const response = await apiClient.post<ApiEnvelope<MobileWebmailSsoLaunch>>('/webmail/sso/start');
    return response.data.data;
  },

  async register(payload: MobileWebmailRegisterPayload) {
    const response = await apiClient.post<ApiEnvelope<MobileWebmailRegisterResult>>('/webmail/register', payload);
    return response.data.data;
  },
};
