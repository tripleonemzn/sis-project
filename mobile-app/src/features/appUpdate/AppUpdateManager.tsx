import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import { AppState, AppStateStatus, Modal, Platform, Pressable, Text, View } from 'react-native';
import { applyAppUpdate, checkAppUpdate, isAppUpdateSupported } from './updateService';
import * as Notifications from 'expo-notifications';
import { notifyInfo } from '../../lib/ui/feedback';
import {
  APP_UPDATE_NOTIFICATION_CHANNEL_ID,
  ensureNotificationHandler,
  extractAppUpdatePushMeta,
} from '../pushNotifications/pushNotificationService';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const FOREGROUND_CHECK_THROTTLE_MS = 15 * 60 * 1000;
const UPDATE_NOTIFICATION_BADGE = 'Update Aplikasi';
const UPDATE_NOTIFICATION_TITLE = 'SIS KGB2 : Update Tersedia';
const UPDATE_NOTIFICATION_BODY =
  'Versi terbaru SIS KGB2 tersedia. Silakan perbarui untuk menikmati fitur terbaru.';
const UPDATE_NOTIFICATION_PENDING_HELPER =
  'Notifikasi update sudah diterima. Sistem sedang memeriksa paket terbaru untuk aplikasi Anda.';
const OTA_MARKER = 'ota-2026-03-10-hotfix-01';
const CURRENT_UPDATE_CHANNEL = Updates.channel || 'default';
const CURRENT_RUNTIME_VERSION =
  typeof Updates.runtimeVersion === 'string' ? Updates.runtimeVersion : String(Updates.runtimeVersion || 'unknown');

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

function buildChannelMismatchMessage(targetChannel: string | null) {
  if (!targetChannel) {
    return `Notifikasi update diterima, tetapi channel target tidak terbaca. Aplikasi ini berjalan di channel ${CURRENT_UPDATE_CHANNEL}.`;
  }

  return `Notifikasi update ini ditujukan untuk channel ${targetChannel}, sedangkan aplikasi ini berjalan di channel ${CURRENT_UPDATE_CHANNEL}. Karena itu popup update tidak bisa memasang OTA dari notifikasi ini. Publish OTA ke channel ${CURRENT_UPDATE_CHANNEL} atau gunakan build dengan channel ${targetChannel}.`;
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
          title: UPDATE_NOTIFICATION_TITLE,
          body: UPDATE_NOTIFICATION_BODY,
          data: {
            type: 'APP_UPDATE',
            channel: CURRENT_UPDATE_CHANNEL,
            runtimeVersion: CURRENT_RUNTIME_VERSION,
            marker: OTA_MARKER,
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

  const checkForUpdates = useCallback(async (options?: { forceModal?: boolean; requestedChannel?: string | null }) => {
    if (!supported) return;
    if (checkingRef.current || isInstalling) return;

    const requestedChannel = options?.requestedChannel?.trim() || null;
    if (requestedChannel && requestedChannel !== CURRENT_UPDATE_CHANNEL) {
      const checkedAt = new Date().toISOString();
      setLastCheckedAt(checkedAt);
      lastCheckTsRef.current = Date.now();
      setUpdateAvailable(false);
      setDismissed(false);
      setErrorMessage(buildChannelMismatchMessage(requestedChannel));
      setIsModalVisible(true);
      return;
    }

    checkingRef.current = true;
    try {
      const result = await checkAppUpdate();
      setLastCheckedAt(new Date().toISOString());
      lastCheckTsRef.current = Date.now();
      setErrorMessage(result.errorMessage || null);
      setUpdateAvailable(result.available);
      if (!result.available) {
        localNoticeSentRef.current = false;
        if (options?.forceModal) {
          setDismissed(false);
          setIsModalVisible(true);
          setErrorMessage(
            result.errorMessage ||
              `Notifikasi update sudah diterima, tetapi paket OTA baru belum terbaca di channel ${CURRENT_UPDATE_CHANNEL}. Coba tekan "Cek Ulang" beberapa detik lagi.`,
          );
        } else {
          setIsModalVisible(false);
          setDismissed(false);
        }
        return;
      }
      setDismissed(false);
      setIsModalVisible(true);
    } catch (error: unknown) {
      setLastCheckedAt(new Date().toISOString());
      lastCheckTsRef.current = Date.now();
      const message = error instanceof Error ? error.message : 'Gagal memeriksa update.';
      setErrorMessage(message);
      if (options?.forceModal) {
        setDismissed(false);
        setIsModalVisible(true);
      }
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Gagal memasang update.';
      setErrorMessage(message);
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

    let isCancelled = false;
    const hydrateLastNotificationResponse = async () => {
      const lastResponse = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (isCancelled || !lastResponse) return;
      const meta = extractAppUpdatePushMeta(lastResponse.notification.request.content.data);
      if (!meta) return;
      setDismissed(false);
      await checkForUpdates({ forceModal: true, requestedChannel: meta.channel });
      if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
        await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    };
    void hydrateLastNotificationResponse();

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
      if (appStateRef.current !== 'active') return;
      const elapsed = Date.now() - lastCheckTsRef.current;
      if (elapsed < FOREGROUND_CHECK_THROTTLE_MS) return;
      void checkForUpdates();
    }, CHECK_INTERVAL_MS);

    return () => {
      isCancelled = true;
      stateSub.remove();
      clearInterval(intervalId);
    };
  }, [supported, checkForUpdates]);

  useEffect(() => {
    if (!supported) return;

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const meta = extractAppUpdatePushMeta(notification.request.content.data);
      if (!meta) return;
      setDismissed(false);
      notifyInfo(UPDATE_NOTIFICATION_BODY, {
        title: UPDATE_NOTIFICATION_TITLE,
        durationMs: 1800,
      });
      void checkForUpdates({ requestedChannel: meta.channel });
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const meta = extractAppUpdatePushMeta(response.notification.request.content.data);
      if (!meta) return;
      setDismissed(false);
      void checkForUpdates({ forceModal: true, requestedChannel: meta.channel });
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [supported, checkForUpdates]);

  if (!supported) return null;
  if (!updateAvailable && !isModalVisible) return null;

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
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
              {UPDATE_NOTIFICATION_BADGE}
            </Text>
          </View>
          <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 19, marginBottom: 6 }}>
            {UPDATE_NOTIFICATION_TITLE}
          </Text>
          <Text style={{ color: '#334155', fontSize: 13, marginBottom: 10 }}>
            {UPDATE_NOTIFICATION_BODY}
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
              Channel: {CURRENT_UPDATE_CHANNEL}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>
              Runtime: {CURRENT_RUNTIME_VERSION}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>
              Cek terakhir: {formatDateTime(lastCheckedAt)}
            </Text>
          </View>
          {!updateAvailable && !errorMessage ? (
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
              {UPDATE_NOTIFICATION_PENDING_HELPER}
            </Text>
          ) : null}
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
                marginRight: updateAvailable ? 8 : 0,
              }}
            >
              <Text style={{ color: '#334155', fontSize: 12, fontWeight: '700' }}>
                {updateAvailable ? 'Nanti' : 'Tutup'}
              </Text>
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
            {updateAvailable ? (
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
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
