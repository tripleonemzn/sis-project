import { useQuery } from '@tanstack/react-query';
import {
  MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
  notificationApi,
} from './notificationApi';

const DEFAULT_UNREAD_REFETCH_INTERVAL_MS = 90_000;

export function useUnreadNotificationsQuery(enabled: boolean, pollingEnabled = enabled) {
  return useQuery({
    queryKey: MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
    queryFn: notificationApi.getUnreadCount,
    enabled,
    refetchInterval: enabled && pollingEnabled ? DEFAULT_UNREAD_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    refetchOnReconnect: true,
  });
}
