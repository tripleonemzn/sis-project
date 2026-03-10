import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type MobileNotificationItem = {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MobileNotificationsResponse = {
  notifications: MobileNotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const MOBILE_NOTIFICATIONS_QUERY_KEY = ['mobile-notifications'] as const;
export const MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY = [...MOBILE_NOTIFICATIONS_QUERY_KEY, 'inbox'] as const;
export const MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY = [...MOBILE_NOTIFICATIONS_QUERY_KEY, 'unread'] as const;

export const notificationApi = {
  async getNotifications(params?: { page?: number; limit?: number }) {
    const response = await apiClient.get<ApiEnvelope<MobileNotificationsResponse>>('/notifications', {
      params,
    });
    return response.data.data;
  },

  async getUnreadCount() {
    const response = await apiClient.get<ApiEnvelope<{ unreadCount: number }>>('/notifications/unread-count');
    const unreadCount = Number(response.data?.data?.unreadCount || 0);
    return Number.isFinite(unreadCount) ? unreadCount : 0;
  },

  async markAsRead(notificationId: number) {
    await apiClient.patch(`/notifications/${notificationId}/read`);
  },

  async markAllAsRead() {
    await apiClient.patch('/notifications/all/read');
  },
};
