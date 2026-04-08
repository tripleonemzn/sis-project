import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import {
  MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY,
  MOBILE_NOTIFICATIONS_QUERY_KEY,
  MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
} from './notificationApi';
import { isAppUpdatePushNotificationData } from '../pushNotifications/pushNotificationService';
import { resolveMobileNotificationTarget } from './notificationTargetResolver';

const INVALIDATE_DEBOUNCE_MS = 120;

export function NotificationRealtimeBridge() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;

    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateNotifications = () => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        void queryClient.invalidateQueries({
          queryKey: MOBILE_NOTIFICATIONS_QUERY_KEY,
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({
          queryKey: MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY,
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({
          queryKey: MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
          refetchType: 'active',
        });
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      invalidateNotifications();
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      invalidateNotifications();
      const rawData = response.notification.request.content.data;
      if (isAppUpdatePushNotificationData(rawData)) return;
      const route = rawData && typeof rawData === 'object' ? (rawData as Record<string, unknown>).route : null;
      router.push(resolveMobileNotificationTarget(route) as never);
    });

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [isAuthenticated, queryClient, router]);

  return null;
}
