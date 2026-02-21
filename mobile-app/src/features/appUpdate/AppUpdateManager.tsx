import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import { AppState, AppStateStatus, Modal, Platform, Pressable, Text, View } from 'react-native';
import { applyAppUpdate, checkAppUpdate, isAppUpdateSupported } from './updateService';
import * as Notifications from 'expo-notifications';
import { notifyInfo } from '../../lib/ui/feedback';
import {
  APP_UPDATE_NOTIFICATION_CHANNEL_ID,
  ensureNotificationHandler,
  isAppUpdatePushNotificationData,
} from '../pushNotifications/pushNotificationService';

const CHECK_INTERVAL_MS = 60 * 1000;
const FOREGROUND_CHECK_THROTTLE_MS = 15 * 1000;

function formatDateTime(value: string | null) {
  if (!value) return '-';
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

export function AppUpdateManager() {
  const supported = isAppUpdateSupported();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastCheckTsRef = useRef(0);
  const localNoticeSentRef = useRef(false);

  const pushSystemUpdateNotification = useCallback(async () => {
    try {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Update Aplikasi Tersedia',
          body: `Versi terbaru siap dipasang untuk channel ${Updates.channel || 'default'}.`,
          data: {
            type: 'APP_UPDATE',
            channel: Updates.channel || 'default',
          },
          ...(Platform.OS === 'android'
            ? { channelId: APP_UPDATE_NOTIFICATION_CHANNEL_ID }
            : {}),
        },
        trigger: null,
      });
    } catch {
      // noop - fallback modal in-app tetap berjalan.
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!supported) return;
    if (checkingRef.current || isInstalling) return;

    checkingRef.current = true;
    try {
      const result = await checkAppUpdate();
      setLastCheckedAt(new Date().toISOString());
      lastCheckTsRef.current = Date.now();
      setErrorMessage(result.errorMessage || null);
      setUpdateAvailable(result.available);
      if (!result.available) {
        localNoticeSentRef.current = false;
        setIsModalVisible(false);
        setDismissed(false);
      }
    } catch (error: any) {
      setLastCheckedAt(new Date().toISOString());
      lastCheckTsRef.current = Date.now();
      setErrorMessage(error?.message || 'Gagal memeriksa update.');
    } finally {
      checkingRef.current = false;
    }
  }, [supported, isInstalling]);

  const installUpdate = useCallback(async () => {
    if (!supported) return;
    if (isInstalling) return;

    setIsInstalling(true);
    setErrorMessage(null);
    try {
      await applyAppUpdate();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Gagal memasang update.');
      setIsInstalling(false);
    }
  }, [supported, isInstalling]);

  useEffect(() => {
    if (updateAvailable && !dismissed) {
      setIsModalVisible(true);
    }
  }, [updateAvailable, dismissed]);

  useEffect(() => {
    if (!supported || !updateAvailable) return;
    if (localNoticeSentRef.current) return;
    localNoticeSentRef.current = true;
    void pushSystemUpdateNotification();
  }, [supported, updateAvailable, pushSystemUpdateNotification]);

  useEffect(() => {
    if (!supported) return;

    ensureNotificationHandler();
    void checkForUpdates();

    const stateSub = AppState.addEventListener('change', (nextState) => {
      const wasBackground =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';
      const nowActive = nextState === 'active';
      appStateRef.current = nextState;

      if (!wasBackground || !nowActive) return;

      const elapsed = Date.now() - lastCheckTsRef.current;
      if (elapsed < FOREGROUND_CHECK_THROTTLE_MS) return;
      void checkForUpdates();
    });

    const intervalId = setInterval(() => {
      void checkForUpdates();
    }, CHECK_INTERVAL_MS);

    return () => {
      stateSub.remove();
      clearInterval(intervalId);
    };
  }, [supported, checkForUpdates]);

  useEffect(() => {
    if (!supported) return;

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (!isAppUpdatePushNotificationData(notification.request.content.data)) return;
      setDismissed(false);
      notifyInfo('Update terbaru tersedia. Sedang memeriksa versi aplikasi...', {
        title: 'Update Aplikasi',
        durationMs: 1800,
      });
      void checkForUpdates();
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!isAppUpdatePushNotificationData(response.notification.request.content.data)) return;
      setDismissed(false);
      void checkForUpdates();
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [supported, checkForUpdates]);

  if (!supported) return null;
  if (!updateAvailable) return null;

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setIsModalVisible(false);
        setDismissed(true);
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          justifyContent: 'center',
          paddingHorizontal: 18,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#bfdbfe',
            padding: 16,
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.2,
            shadowRadius: 16,
            elevation: 10,
          }}
        >
          <View
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#bfdbfe',
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Update Baru</Text>
          </View>
          <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 19, marginBottom: 6 }}>
            Update Aplikasi Tersedia
          </Text>
          <Text style={{ color: '#334155', fontSize: 13, marginBottom: 10 }}>
            Versi terbaru siap dipasang dan bisa langsung Anda gunakan.
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbeafe',
              borderRadius: 10,
              padding: 10,
              backgroundColor: '#f8fbff',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#1e3a8a', fontSize: 12, marginBottom: 2 }}>
              Channel: {Updates.channel || 'default'}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>
              Cek terakhir: {formatDateTime(lastCheckedAt)}
            </Text>
          </View>
          {errorMessage ? (
            <Text style={{ color: '#b45309', fontSize: 12, marginBottom: 12 }}>{errorMessage}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable
              onPress={() => {
                setIsModalVisible(false);
                setDismissed(true);
              }}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 12,
                backgroundColor: '#fff',
                marginRight: 8,
              }}
            >
              <Text style={{ color: '#334155', fontSize: 12, fontWeight: '700' }}>Nanti</Text>
            </Pressable>
            <Pressable
              onPress={() => void checkForUpdates()}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 12,
                backgroundColor: '#fff',
                marginRight: 8,
              }}
            >
              <Text style={{ color: '#334155', fontSize: 12, fontWeight: '700' }}>Cek Ulang</Text>
            </Pressable>
            <Pressable
              onPress={() => void installUpdate()}
              disabled={isInstalling}
              style={{
                borderWidth: 1,
                borderColor: '#1d4ed8',
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 12,
                backgroundColor: '#1d4ed8',
                opacity: isInstalling ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {isInstalling ? 'Mengunduh...' : 'Update Sekarang'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
