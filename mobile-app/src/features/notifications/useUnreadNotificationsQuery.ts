import { useQuery } from '@tanstack/react-query';
import {
  MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
  notificationApi,
} from './notificationApi';

const DEFAULT_UNREAD_REFETCH_INTERVAL_MS = 300_000;
const DEFAULT_UNREAD_STALE_TIME_MS = 300_000;

export function useUnreadNotificationsQuery(enabled: boolean, pollingEnabled = enabled) {
  return useQuery({
    queryKey: MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
    queryFn: notificationApi.getUnreadCount,
    enabled,
    refetchInterval: enabled && pollingEnabled ? DEFAULT_UNREAD_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: DEFAULT_UNREAD_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}
