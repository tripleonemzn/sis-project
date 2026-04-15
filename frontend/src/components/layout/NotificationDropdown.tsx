import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Clock } from 'lucide-react';
import api from '../../services/api';
import clsx from 'clsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { authService } from '../../services/auth.service';
import { getStaffFinanceNotificationPath } from '../../utils/staffRole';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data:
    | {
        scheduleId?: number | string;
        route?: string;
        studentId?: number | string;
        childId?: number | string;
        module?: string;
      }
    | null;
  createdAt: string;
}

type NotificationInboxResult = {
  notifications: Notification[];
  unreadCount: number;
};

const UNREAD_POLL_INTERVAL_MS = 180_000;
const NOTIFICATION_REFRESH_EVENT = 'sis:notifications:refresh';
const WEB_NOTIFICATIONS_QUERY_KEY = ['web-notifications'] as const;
const WEB_NOTIFICATIONS_INBOX_QUERY_KEY = [...WEB_NOTIFICATIONS_QUERY_KEY, 'inbox'] as const;
const WEB_NOTIFICATIONS_UNREAD_QUERY_KEY = [...WEB_NOTIFICATIONS_QUERY_KEY, 'unread'] as const;

async function fetchNotificationInbox(limit = 10): Promise<NotificationInboxResult> {
  const response = await api.get('/notifications', { params: { limit } });
  return {
    notifications: response.data?.data?.notifications || [],
    unreadCount: Number(response.data?.data?.unreadCount || 0) || 0,
  };
}

async function fetchUnreadCount(): Promise<number> {
  const response = await api.get('/notifications/unread-count');
  const nextUnreadCount = Number(response.data?.data?.unreadCount || 0);
  return Number.isFinite(nextUnreadCount) ? nextUnreadCount : 0;
}

export const NotificationDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const isExamTakePage = /^\/student\/exams\/\d+\/take$/.test(location.pathname);
  const { data: meResponse } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMeSafe,
    staleTime: 60_000,
  });
  const currentUser = meResponse?.data;

  const unreadCountQuery = useQuery({
    queryKey: WEB_NOTIFICATIONS_UNREAD_QUERY_KEY,
    queryFn: fetchUnreadCount,
    enabled: !isExamTakePage,
    refetchInterval: !isExamTakePage ? UNREAD_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    refetchOnReconnect: true,
  });

  const notificationsQuery = useQuery({
    queryKey: WEB_NOTIFICATIONS_INBOX_QUERY_KEY,
    queryFn: () => fetchNotificationInbox(10),
    enabled: isOpen && !isExamTakePage,
    staleTime: 30_000,
    refetchOnReconnect: true,
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = useMemo(
    () => notificationsQuery.data?.unreadCount ?? unreadCountQuery.data ?? 0,
    [notificationsQuery.data?.unreadCount, unreadCountQuery.data],
  );

  const invalidateNotificationQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: WEB_NOTIFICATIONS_QUERY_KEY,
      refetchType: 'active',
    });
  };

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      await api.patch(`/notifications/${notificationId}/read`);
      return notificationId;
    },
    onSuccess: async (notificationId) => {
      queryClient.setQueryData<NotificationInboxResult | undefined>(
        WEB_NOTIFICATIONS_INBOX_QUERY_KEY,
        (current) => {
          if (!current) return current;
          return {
            notifications: current.notifications.map((notification) =>
              notification.id === notificationId
                ? { ...notification, isRead: true }
                : notification,
            ),
            unreadCount: Math.max(0, current.unreadCount - 1),
          };
        },
      );
      queryClient.setQueryData<number | undefined>(WEB_NOTIFICATIONS_UNREAD_QUERY_KEY, (current) =>
        Math.max(0, Number(current || 0) - 1),
      );
      await invalidateNotificationQueries();
    },
    onError: (error) => {
      console.error('Failed to mark notification as read:', error);
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/all/read');
    },
    onSuccess: async () => {
      queryClient.setQueryData<NotificationInboxResult | undefined>(
        WEB_NOTIFICATIONS_INBOX_QUERY_KEY,
        (current) => {
          if (!current) return current;
          return {
            notifications: current.notifications.map((notification) => ({
              ...notification,
              isRead: true,
            })),
            unreadCount: 0,
          };
        },
      );
      queryClient.setQueryData(WEB_NOTIFICATIONS_UNREAD_QUERY_KEY, 0);
      await invalidateNotificationQueries();
    },
    onError: (error) => {
      console.error('Failed to mark all notifications as read:', error);
    },
  });

  useEffect(() => {
    if (isExamTakePage) return;

    let refreshTimer: number | null = null;
    const handleNotificationRefresh = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void invalidateNotificationQueries();
      }, 150);
    };

    window.addEventListener(NOTIFICATION_REFRESH_EVENT, handleNotificationRefresh);
    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      window.removeEventListener(NOTIFICATION_REFRESH_EVENT, handleNotificationRefresh);
    };
  }, [isExamTakePage, queryClient]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await markAsReadMutation.mutateAsync(notification.id);
      } catch {
        return;
      }
    }

    const routeFromPayload =
      typeof notification.data?.route === 'string' && notification.data.route.trim().startsWith('/')
        ? notification.data.route.trim()
        : null;

    if (notification.type === 'EXAM_PROCTOR' && notification.data?.scheduleId) {
      navigate(`/teacher/proctoring/${notification.data.scheduleId}`);
    } else if (notification.type === 'EXAM_SCHEDULE' && notification.data?.scheduleId) {
      navigate('/teacher/proctoring');
    } else if (routeFromPayload) {
      navigate(routeFromPayload);
    } else if (notification.type.startsWith('FINANCE_')) {
      if (location.pathname.startsWith('/parent')) {
        navigate('/parent/finance');
      } else if (location.pathname.startsWith('/student')) {
        navigate('/student/finance');
      } else if (location.pathname.startsWith('/staff')) {
        navigate(getStaffFinanceNotificationPath(currentUser));
      }
    }

    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((current) => !current)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none"
      >
        <Bell className={clsx('w-6 h-6', unreadCount > 0 ? 'text-blue-600' : 'text-gray-500')} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 bg-gray-50/50">
            <h3 className="font-semibold text-gray-900 text-sm">Notifikasi</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsReadMutation.mutate()}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Tandai semua dibaca
                </button>
              )}
              <button
                onClick={() => {
                  void unreadCountQuery.refetch();
                  void notificationsQuery.refetch();
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {notificationsQuery.isFetching && notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Memuat...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Belum ada notifikasi</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    onClick={() => handleOpenNotification(notification)}
                    className={clsx(
                      'px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors',
                      !notification.isRead && 'bg-blue-50/30',
                    )}
                  >
                    <div className="flex gap-3">
                      <div
                        className={clsx(
                          'flex-shrink-0 w-2 h-2 mt-2 rounded-full',
                          !notification.isRead ? 'bg-blue-600' : 'bg-transparent',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={clsx(
                            'text-sm font-medium mb-1',
                            !notification.isRead ? 'text-gray-900' : 'text-gray-600',
                          )}
                        >
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">
                          {notification.message}
                        </p>
                        <div className="flex items-center text-[10px] text-gray-400">
                          <Clock className="w-3 h-3 mr-1" />
                          {format(new Date(notification.createdAt), 'd MMM yyyy HH:mm', { locale: id })}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
