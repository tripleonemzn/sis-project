import api from './api';
import type { ApiResponse } from '../types/api.types';

export type WebmailAuthMode = 'BRIDGE' | 'SSO';
export type WebmailFolderKey = 'INBOX' | 'Drafts' | 'Sent' | 'Junk' | 'Archive';
export type WebmailMailboxIdentitySource = 'stored' | 'legacy' | 'none';

export interface WebmailConfig {
  mode: WebmailAuthMode;
  webmailUrl: string;
  defaultDomain: string;
  ssoEnabled: boolean;
  ssoEntryUrl: string | null;
  tokenTtlSeconds: number;
  mailboxIdentity?: string | null;
  mailboxIdentitySource?: WebmailMailboxIdentitySource;
  mailboxAvailable?: boolean;
  mailSessionAuthenticated?: boolean;
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
  mailSessionAuthenticated?: boolean;
  mailSession?: WebmailSessionState;
}

export interface WebmailSessionState {
  accessToken: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface WebmailLoginPayload {
  password?: string;
}

export interface WebmailLoginResult {
  mailboxIdentity: string;
  mailSessionAuthenticated: boolean;
  mailSession: WebmailSessionState;
}

export interface WebmailLogoutResult {
  mailSessionAuthenticated: boolean;
}

export interface WebmailPasswordResetResult {
  mailboxIdentity: string;
  password: string;
  generatedBySystem: boolean;
  resetAt: string;
}

export interface WebmailChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface WebmailChangePasswordResult {
  mailboxIdentity: string;
  changedAt: string;
}

export interface WebmailMessageSummary {
  uid: number;
  guid: string;
  messageId: string | null;
  subject: string;
  from: string;
  fromLabel: string;
  date: string | null;
  snippet: string;
  isRead: boolean;
}

export interface WebmailMessageDetail extends WebmailMessageSummary {
  to: string | null;
  cc: string | null;
  plainText: string | null;
  html: string | null;
  previewText: string;
}

export interface WebmailMessageListResult {
  mailboxIdentity: string;
  mailboxAvailable: boolean;
  folderKey: WebmailFolderKey;
  query: string | null;
  messages: WebmailMessageSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebmailSendPayload {
  to: string[] | string;
  cc?: string[] | string;
  subject?: string;
  plainText: string;
  html?: string | null;
  inReplyToMessageId?: string | null;
  references?: string[];
}

export interface WebmailSendResult {
  mailboxIdentity: string;
  messageId: string;
  sentAt: string;
  to: string[];
}

export interface WebmailMovePayload {
  sourceFolderKey?: WebmailFolderKey;
  targetFolderKey: WebmailFolderKey;
}

export interface WebmailMoveResult {
  mailboxIdentity: string;
  guid: string;
  sourceFolderKey: WebmailFolderKey;
  targetFolderKey: WebmailFolderKey | 'Trash';
  movedAt: string;
}

export interface WebmailReadStateResult {
  guid: string;
  mailboxIdentity: string;
  folderKey: WebmailFolderKey;
  isRead: boolean;
  updatedAt: string;
}

export interface WebmailDeleteResult {
  mailboxIdentity: string;
  guid: string;
  sourceFolderKey: WebmailFolderKey;
  targetFolderKey: 'Trash';
  movedAt: string;
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

  loginSession: async (payload?: WebmailLoginPayload): Promise<ApiResponse<WebmailLoginResult>> => {
    const response = await api.post<ApiResponse<WebmailLoginResult>>('/webmail/session/login', payload || {});
    return response.data;
  },

  logoutSession: async (): Promise<ApiResponse<WebmailLogoutResult>> => {
    const response = await api.post<ApiResponse<WebmailLogoutResult>>('/webmail/session/logout');
    return response.data;
  },

  resetPassword: async (): Promise<ApiResponse<WebmailPasswordResetResult>> => {
    const response = await api.post<ApiResponse<WebmailPasswordResetResult>>('/webmail/reset-password');
    return response.data;
  },

  changePassword: async (payload: WebmailChangePasswordPayload): Promise<ApiResponse<WebmailChangePasswordResult>> => {
    const response = await api.post<ApiResponse<WebmailChangePasswordResult>>('/webmail/change-password', payload);
    return response.data;
  },

  getMessages: async (params?: {
    page?: number;
    limit?: number;
    folderKey?: WebmailFolderKey;
    query?: string;
  }): Promise<ApiResponse<WebmailMessageListResult>> => {
    const response = await api.get<ApiResponse<WebmailMessageListResult>>('/webmail/messages', {
      params: {
        page: params?.page,
        limit: params?.limit,
        folder: params?.folderKey,
        q: params?.query,
      },
    });
    return response.data;
  },

  getMessageDetail: async (
    guid: string,
    params?: { folderKey?: WebmailFolderKey },
  ): Promise<ApiResponse<WebmailMessageDetail>> => {
    const response = await api.get<ApiResponse<WebmailMessageDetail>>(`/webmail/messages/${encodeURIComponent(guid)}`, {
      params: {
        folder: params?.folderKey,
      },
    });
    return response.data;
  },

  markMessageRead: async (
    guid: string,
    params?: { folderKey?: WebmailFolderKey },
  ): Promise<ApiResponse<WebmailReadStateResult>> => {
    const response = await api.patch<ApiResponse<WebmailReadStateResult>>(
      `/webmail/messages/${encodeURIComponent(guid)}/read`,
      undefined,
      {
        params: {
          folder: params?.folderKey,
        },
      },
    );
    return response.data;
  },

  markMessageUnread: async (
    guid: string,
    params?: { folderKey?: WebmailFolderKey },
  ): Promise<ApiResponse<WebmailReadStateResult>> => {
    const response = await api.patch<ApiResponse<WebmailReadStateResult>>(
      `/webmail/messages/${encodeURIComponent(guid)}/unread`,
      undefined,
      {
        params: {
          folder: params?.folderKey,
        },
      },
    );
    return response.data;
  },

  sendMessage: async (payload: WebmailSendPayload): Promise<ApiResponse<WebmailSendResult>> => {
    const response = await api.post<ApiResponse<WebmailSendResult>>('/webmail/messages/send', payload);
    return response.data;
  },

  moveMessage: async (guid: string, payload: WebmailMovePayload): Promise<ApiResponse<WebmailMoveResult>> => {
    const response = await api.post<ApiResponse<WebmailMoveResult>>(`/webmail/messages/${encodeURIComponent(guid)}/move`, {
      sourceFolderKey: payload.sourceFolderKey,
      targetFolderKey: payload.targetFolderKey,
    });
    return response.data;
  },

  deleteMessage: async (guid: string, params?: { folderKey?: WebmailFolderKey }): Promise<ApiResponse<WebmailDeleteResult>> => {
    const response = await api.delete<ApiResponse<WebmailDeleteResult>>(`/webmail/messages/${encodeURIComponent(guid)}`, {
      params: {
        folder: params?.folderKey,
      },
    });
    return response.data;
  },

  startSso: async (): Promise<ApiResponse<WebmailSsoLaunch>> => {
    const response = await api.post<ApiResponse<WebmailSsoLaunch>>('/webmail/sso/start');
    return response.data;
  },
};
