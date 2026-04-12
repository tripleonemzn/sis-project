import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type MobileWebmailAuthMode = 'BRIDGE' | 'SSO';
export type MobileWebmailFolderKey = 'INBOX' | 'Drafts' | 'Sent' | 'Junk' | 'Archive';

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

export type MobileWebmailPasswordResetResult = {
  mailboxIdentity: string;
  password: string;
  generatedBySystem: boolean;
  resetAt: string;
};

export type MobileWebmailMessageSummary = {
  uid: number;
  guid: string;
  messageId: string | null;
  subject: string;
  from: string;
  fromLabel: string;
  date: string | null;
  snippet: string;
  isRead: boolean;
};

export type MobileWebmailMessageDetail = MobileWebmailMessageSummary & {
  to: string | null;
  cc: string | null;
  plainText: string | null;
  html: string | null;
  previewText: string;
};

export type MobileWebmailMessageList = {
  mailboxIdentity: string;
  mailboxAvailable: boolean;
  folderKey: MobileWebmailFolderKey;
  messages: MobileWebmailMessageSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type MobileWebmailSendPayload = {
  to: string[] | string;
  cc?: string[] | string;
  subject?: string;
  plainText: string;
  html?: string | null;
  inReplyToMessageId?: string | null;
  references?: string[];
};

export type MobileWebmailSendResult = {
  mailboxIdentity: string;
  messageId: string;
  sentAt: string;
  to: string[];
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

  async resetPassword() {
    const response = await apiClient.post<ApiEnvelope<MobileWebmailPasswordResetResult>>('/webmail/reset-password');
    return response.data.data;
  },

  async getMessages(params?: { page?: number; limit?: number; folderKey?: MobileWebmailFolderKey }) {
    const response = await apiClient.get<ApiEnvelope<MobileWebmailMessageList>>('/webmail/messages', {
      params: {
        page: params?.page,
        limit: params?.limit,
        folder: params?.folderKey,
      },
    });
    return response.data.data;
  },

  async getMessageDetail(guid: string, params?: { folderKey?: MobileWebmailFolderKey }) {
    const response = await apiClient.get<ApiEnvelope<MobileWebmailMessageDetail>>(`/webmail/messages/${encodeURIComponent(guid)}`, {
      params: {
        folder: params?.folderKey,
      },
    });
    return response.data.data;
  },

  async markMessageRead(guid: string, params?: { folderKey?: MobileWebmailFolderKey }) {
    const response = await apiClient.patch<
      ApiEnvelope<{ guid: string; mailboxIdentity: string; folderKey: MobileWebmailFolderKey; markedAt: string }>
    >(
      `/webmail/messages/${encodeURIComponent(guid)}/read`,
      undefined,
      {
        params: {
          folder: params?.folderKey,
        },
      },
    );
    return response.data.data;
  },

  async sendMessage(payload: MobileWebmailSendPayload) {
    const response = await apiClient.post<ApiEnvelope<MobileWebmailSendResult>>('/webmail/messages/send', payload);
    return response.data.data;
  },
};
