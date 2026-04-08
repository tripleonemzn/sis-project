import { useMemo } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import {
  MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY,
  MOBILE_NOTIFICATIONS_QUERY_KEY,
  MobileNotificationItem,
  notificationApi,
} from '../../src/features/notifications/notificationApi';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../src/lib/ui/feedback';
import { BRAND_COLORS } from '../../src/config/brand';
import { getStaffFinanceNotificationTarget } from '../../src/features/staff/staffRole';
import { useIsScreenActive } from '../../src/hooks/useIsScreenActive';
import { resolveMobileNotificationTarget } from '../../src/features/notifications/notificationTargetResolver';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function NotificationCard({
  item,
  onOpen,
  loading,
}: {
  item: MobileNotificationItem;
  onOpen: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={onOpen}
      style={{
        borderWidth: 1,
        borderColor: item.isRead ? '#e2e8f0' : '#bfdbfe',
        backgroundColor: item.isRead ? '#ffffff' : '#eff6ff',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 11,
        marginBottom: 10,
        opacity: loading ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            backgroundColor: item.isRead ? '#f1f5f9' : '#dbeafe',
            borderWidth: 1,
            borderColor: item.isRead ? '#e2e8f0' : '#93c5fd',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Feather name="bell" size={15} color={item.isRead ? '#64748b' : '#1d4ed8'} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={{
                color: '#0f172a',
                fontWeight: item.isRead ? '600' : '700',
                fontSize: 13,
                flex: 1,
              }}
              numberOfLines={2}
            >
              {item.title || 'Notifikasi'}
            </Text>
            {!item.isRead ? (
              <View
                style={{
                  backgroundColor: '#dbeafe',
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 999,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  marginLeft: 8,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontSize: 10, fontWeight: '700' }}>BARU</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: '#475569', fontSize: 12, marginTop: 4 }} numberOfLines={3}>
            {item.message || '-'}
          </Text>
          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 7 }}>{formatDateTime(item.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const pageContentPadding = getStandardPagePadding(insets);
  const isScreenActive = useIsScreenActive();

  const notificationsQuery = useQuery({
    queryKey: MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY,
    queryFn: () => notificationApi.getNotifications({ page: 1, limit: 50 }),
    enabled: isAuthenticated && isScreenActive,
    refetchInterval: isAuthenticated && isScreenActive ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
  });

  const invalidateNotificationQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: MOBILE_NOTIFICATIONS_QUERY_KEY,
      refetchType: 'active',
    });
  };

  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: number) => notificationApi.markAsRead(notificationId),
    onSuccess: async () => {
      await invalidateNotificationQueries();
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menandai notifikasi sebagai dibaca.');
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: async () => {
      await invalidateNotificationQueries();
      notifySuccess('Semua notifikasi berhasil ditandai sudah dibaca.', {
        title: 'Notifikasi',
      });
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menandai semua notifikasi.');
    },
  });

  const notifications = useMemo(
    () => notificationsQuery.data?.notifications ?? [],
    [notificationsQuery.data?.notifications],
  );
  const unreadCount = useMemo(
    () => notificationsQuery.data?.unreadCount ?? notifications.filter((item) => !item.isRead).length,
    [notifications, notificationsQuery.data?.unreadCount],
  );

  const resolveNotificationTarget = (item: MobileNotificationItem): string | null => {
    const payload =
      item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : null;
    const routeValue = payload?.route;
    const payloadRoute =
      typeof routeValue === 'string' && routeValue.trim().startsWith('/')
        ? resolveMobileNotificationTarget(routeValue)
        : null;
    if (payloadRoute) return payloadRoute;

    if (item.type.startsWith('FINANCE_')) {
      if (user?.role === 'PARENT') return '/parent/finance';
      if (user?.role === 'STUDENT') return '/student/finance';
      if (user?.role === 'STAFF') return getStaffFinanceNotificationTarget(user);
    }
    return null;
  };

  const handleOpenNotification = async (item: MobileNotificationItem) => {
    if (!item.isRead) {
      try {
        await markAsReadMutation.mutateAsync(item.id);
      } catch {
        return;
      }
    }

    const target = resolveNotificationTarget(item);
    if (target) {
      router.push(target as never);
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memuat notifikasi..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={notificationsQuery.isFetching && !notificationsQuery.isLoading}
          onRefresh={() => notificationsQuery.refetch()}
        />
      }
    >
      <View
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#dbeafe',
          padding: 14,
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                backgroundColor: '#eff6ff',
                borderWidth: 1,
                borderColor: '#bfdbfe',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Feather name="bell" size={16} color={BRAND_COLORS.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>Notifikasi</Text>
              <Text style={{ color: '#64748b', marginTop: 1, fontSize: 12 }}>
                {unreadCount > 0
                  ? `${unreadCount} notifikasi belum dibaca`
                  : 'Semua notifikasi sudah dibaca'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => void notificationsQuery.refetch()}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {notificationsQuery.isFetching ? (
              <ActivityIndicator size="small" color={BRAND_COLORS.blue} />
            ) : (
              <Feather name="refresh-cw" size={14} color={BRAND_COLORS.textMuted} />
            )}
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
          <Pressable
            onPress={() => router.replace('/home')}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#475569', fontWeight: '600', fontSize: 12 }}>Kembali</Text>
          </Pressable>

          <Pressable
            disabled={markAllAsReadMutation.isPending || unreadCount <= 0}
            onPress={() => void markAllAsReadMutation.mutateAsync()}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: unreadCount > 0 ? '#1d4ed8' : '#cbd5e1',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: unreadCount > 0 ? '#1d4ed8' : '#f1f5f9',
              opacity: markAllAsReadMutation.isPending ? 0.75 : 1,
            }}
          >
            <Text
              style={{
                color: unreadCount > 0 ? '#fff' : '#94a3b8',
                fontWeight: '700',
                fontSize: 12,
              }}
            >
              {markAllAsReadMutation.isPending ? 'Memproses...' : 'Tandai Semua Dibaca'}
            </Text>
          </Pressable>
        </View>
      </View>

      {notificationsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil notifikasi..." /> : null}

      {notificationsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat notifikasi."
          onRetry={() => notificationsQuery.refetch()}
        />
      ) : null}

      {!notificationsQuery.isLoading && !notificationsQuery.isError ? (
        notifications.length > 0 ? (
          <View>
            {notifications.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                loading={markAsReadMutation.isPending && markAsReadMutation.variables === item.id}
                onOpen={() => {
                  void handleOpenNotification(item);
                }}
              />
            ))}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#cbd5e1',
              borderRadius: 12,
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
              Belum ada notifikasi
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>
              Notifikasi terbaru akan muncul otomatis di halaman ini.
            </Text>
          </View>
        )
      ) : null}
    </ScrollView>
  );
}
