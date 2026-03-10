import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '../../lib/api/client';

const PUSH_TOKEN_STORAGE_KEY = 'mobile_device_expo_push_token';
const APP_UPDATE_PUSH_TYPE = 'APP_UPDATE';
const NOTIFICATION_PERMISSION_REQUESTED_KEY = 'mobile_notification_permission_requested_v1';
const NOTIFICATION_SETTINGS_PROMPT_AT_KEY = 'mobile_notification_settings_prompt_at_v1';
const NOTIFICATION_SETTINGS_PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const DEFAULT_NOTIFICATION_CHANNEL_ID = 'default';
export const APP_UPDATE_NOTIFICATION_CHANNEL_ID = 'updates';
const FALLBACK_EAS_PROJECT_ID = 'cc9265c5-45b0-4964-8ed2-3e7a996b8c5a';

let notificationHandlerConfigured = false;

type ExpoConstantsSnapshot = {
  expoConfig?: {
    version?: string;
    extra?: {
      eas?: {
        projectId?: string;
      };
    };
  };
  easConfig?: {
    projectId?: string;
  };
  deviceName?: string;
};

function getExpoConstantsSnapshot(): ExpoConstantsSnapshot {
  return (Constants as unknown as ExpoConstantsSnapshot) || {};
}

async function ensureAndroidNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
    }),
    Notifications.setNotificationChannelAsync(APP_UPDATE_NOTIFICATION_CHANNEL_ID, {
      name: 'Update Aplikasi',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1d4ed8',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
  ]);
}

function resolveExpoProjectId() {
  const constants = getExpoConstantsSnapshot();
  const easProjectId =
    constants.expoConfig?.extra?.eas?.projectId || constants.easConfig?.projectId || null;
  if (typeof easProjectId === 'string' && easProjectId.trim().length > 0) {
    return easProjectId.trim();
  }
  return FALLBACK_EAS_PROJECT_ID;
}

function resolvePlatform() {
  if (Platform.OS === 'android') return 'ANDROID';
  if (Platform.OS === 'ios') return 'IOS';
  return 'UNKNOWN';
}

function resolveAppVersion() {
  const constants = getExpoConstantsSnapshot();
  const version = constants.expoConfig?.version || null;
  return typeof version === 'string' && version.trim().length > 0 ? version.trim() : null;
}

function resolveDeviceName() {
  const constants = getExpoConstantsSnapshot();
  const deviceName = constants.deviceName || null;
  return typeof deviceName === 'string' && deviceName.trim().length > 0 ? deviceName.trim() : null;
}

function isValidExpoPushToken(token: string) {
  return /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

export function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  notificationHandlerConfigured = true;
}

async function getCurrentNotificationPermissionState() {
  const permission = await Notifications.getPermissionsAsync();
  return {
    status: permission.status,
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
  };
}

export async function ensureNotificationPermissionOnStartup() {
  ensureNotificationHandler();
  await ensureAndroidNotificationChannels();

  const askedBefore = (await AsyncStorage.getItem(NOTIFICATION_PERMISSION_REQUESTED_KEY)) === '1';
  let permissionState = await getCurrentNotificationPermissionState();
  let prompted = false;

  if (!permissionState.granted && permissionState.canAskAgain && !askedBefore) {
    const requested = await Notifications.requestPermissionsAsync();
    permissionState = {
      status: requested.status,
      granted: requested.granted,
      canAskAgain: requested.canAskAgain,
    };
    prompted = true;
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_REQUESTED_KEY, '1');
  } else if (!askedBefore && permissionState.status !== 'undetermined') {
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_REQUESTED_KEY, '1');
  }

  return {
    ...permissionState,
    prompted,
  };
}

export async function consumeNotificationSettingsPromptEligibility() {
  const permissionState = await getCurrentNotificationPermissionState();
  if (permissionState.granted || permissionState.canAskAgain) {
    return false;
  }

  const nowTs = Date.now();
  const lastPromptTsRaw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_PROMPT_AT_KEY);
  const lastPromptTs = Number(lastPromptTsRaw || '0');
  if (Number.isFinite(lastPromptTs) && nowTs - lastPromptTs < NOTIFICATION_SETTINGS_PROMPT_COOLDOWN_MS) {
    return false;
  }

  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_PROMPT_AT_KEY, String(nowTs));
  return true;
}

async function requestExpoPushToken() {
  ensureNotificationHandler();
  await ensureAndroidNotificationChannels();

  const permission = await Notifications.getPermissionsAsync();
  let finalStatus = permission.status;

  if (finalStatus !== 'granted') {
    const requestPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestPermission.status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = resolveExpoProjectId();
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token || !isValidExpoPushToken(token)) return null;
  return token;
}

export async function syncPushDeviceRegistration() {
  try {
    const nextToken = await requestExpoPushToken();
    if (!nextToken) return { registered: false as const, reason: 'permission_or_token_unavailable' };

    const previousToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

    if (previousToken && previousToken !== nextToken) {
      try {
        await apiClient.post('/mobile-updates/devices/unregister', {
          expoPushToken: previousToken,
        });
      } catch {
        // noop - token lama bisa dibersihkan nanti oleh backend jika invalid.
      }
    }

    await apiClient.post('/mobile-updates/devices/register', {
      expoPushToken: nextToken,
      platform: resolvePlatform(),
      appVersion: resolveAppVersion(),
      deviceName: resolveDeviceName(),
    });

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, nextToken);
    return { registered: true as const, token: nextToken };
  } catch {
    return { registered: false as const, reason: 'registration_failed' };
  }
}

export async function unregisterPushDeviceOnLogout() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!token) return;

  try {
    await apiClient.post('/mobile-updates/devices/unregister', { expoPushToken: token });
  } catch {
    // noop
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  }
}

export function isAppUpdatePushNotificationData(rawData: unknown) {
  if (!rawData || typeof rawData !== 'object') return false;
  const data = rawData as Record<string, unknown>;
  const type = typeof data.type === 'string' ? data.type : '';
  return type.toUpperCase() === APP_UPDATE_PUSH_TYPE;
}
