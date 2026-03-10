import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Clock } from 'lucide-react';
import api from '../../services/api';
import clsx from 'clsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data: {
    scheduleId?: number | string;
  } | null;
  createdAt: string;
}

const UNREAD_POLL_INTERVAL_MS = 120000;

export const NotificationDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isExamTakePage = /^\/student\/exams\/\d+\/take$/.test(location.pathname);

  const fetchNotifications = async (limit = 10) => {
    try {
      setLoading(true);
      const response = await api.get('/notifications', { params: { limit } });
      if (response.data?.data?.notifications) {
        setNotifications(response.data.data.notifications || []);
        setUnreadCount(response.data.data.unreadCount || 0);
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      const nextUnreadCount = Number(response.data?.data?.unreadCount || 0);
      setUnreadCount(Number.isFinite(nextUnreadCount) ? nextUnreadCount : 0);
    } catch (error) {
      console.error('Failed to fetch unread notification count:', error);
    }
  };

  useEffect(() => {
    if (isExamTakePage) return;

    let intervalId: number | null = null;
    const startPolling = () => {
      if (document.visibilityState !== 'visible') return;
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        void fetchUnreadCount();
      }, UNREAD_POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
        startPolling();
        return;
      }
      stopPolling();
    };

    void fetchUnreadCount();
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isExamTakePage]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchNotifications(10);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await api.patch(`/notifications/${notification.id}/read`);
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }

    // Navigate based on type/data
    if (notification.type === 'EXAM_PROCTOR' && notification.data?.scheduleId) {
      navigate(`/teacher/proctoring/${notification.data.scheduleId}`);
    } else if (notification.type === 'EXAM_SCHEDULE' && notification.data?.scheduleId) {
      // Navigate to subject teacher monitoring view (ProctorSchedulePage with activeTab='author')
      // Since ProctorSchedulePage uses internal state for tab, we might need to handle this.
      // For now, just go to the schedule page, and user can switch tab.
      navigate('/teacher/proctoring');
    }
    
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    try {
        await api.patch('/notifications/all/read');
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
    } catch (error) {
        console.error('Failed to mark all notifications as read:', error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none"
      >
        <Bell className={clsx("w-6 h-6", unreadCount > 0 ? "text-blue-600" : "text-gray-500")} />
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
                        onClick={handleMarkAllRead}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                        Tandai semua dibaca
                    </button>
                )}
                <button 
                    onClick={() => {
                      void fetchNotifications(10);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                >
                    Refresh
                </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {loading && notifications.length === 0 ? (
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
                    onClick={() => handleMarkAsRead(notification)}
                    className={clsx(
                      "px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors",
                      !notification.isRead && "bg-blue-50/30"
                    )}
                  >
                    <div className="flex gap-3">
                      <div className={clsx(
                        "flex-shrink-0 w-2 h-2 mt-2 rounded-full",
                        !notification.isRead ? "bg-blue-600" : "bg-transparent"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={clsx("text-sm font-medium mb-1", !notification.isRead ? "text-gray-900" : "text-gray-600")}>
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
