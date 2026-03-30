import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '../../lib/api/client';

const PUSH_TOKEN_STORAGE_KEY = 'mobile_device_expo_push_token';
const PUSH_SYNC_STATUS_STORAGE_KEY = 'mobile_push_sync_status_v1';
const APP_UPDATE_PUSH_TYPE = 'APP_UPDATE';
const NOTIFICATION_PERMISSION_REQUESTED_KEY = 'mobile_notification_permission_requested_v1';
const NOTIFICATION_SETTINGS_PROMPT_AT_KEY = 'mobile_notification_settings_prompt_at_v1';
const NOTIFICATION_SETTINGS_PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const DEFAULT_NOTIFICATION_CHANNEL_ID = 'default';
export const APP_UPDATE_NOTIFICATION_CHANNEL_ID = 'updates';
const FALLBACK_EAS_PROJECT_ID = 'cc9265c5-45b0-4964-8ed2-3e7a996b8c5a';

let notificationHandlerConfigured = false;

export type PushPermissionSnapshot = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
};

export type PushSyncResult = {
  registered: boolean;
  reason?: 'permission_or_token_unavailable' | 'registration_failed';
  token?: string;
  errorMessage?: string;
  permission: PushPermissionSnapshot;
  projectId: string | null;
  deviceName: string | null;
  appVersion: string | null;
  syncedAt: string;
};

export type LocalPushDebugSnapshot = {
  permission: PushPermissionSnapshot;
  storedToken: string | null;
  tokenPreview: string | null;
  tokenFingerprint: string | null;
  projectId: string | null;
  deviceName: string | null;
  appVersion: string | null;
  androidPushNativeConfigStatus: 'configured' | 'missing' | 'not_applicable';
  androidGoogleServicesFile: string | null;
  lastSync: PushSyncResult | null;
};

export type MobilePushDeviceSummary = {
  id: number;
  platform: 'ANDROID' | 'IOS' | 'UNKNOWN';
  deviceName: string | null;
  appVersion: string | null;
  isEnabled: boolean;
  lastSeenAt: string;
  updatedAt: string;
  createdAt: string;
  tokenPreview: string;
  tokenFingerprint: string;
};

export type MobilePushDevicesStatus = {
  totalDevices: number;
  enabledDevices: number;
  devices: MobilePushDeviceSummary[];
};

export type PushSelfTestResult = {
  recipients: number;
  sent: number;
  failed: number;
  staleTokensDisabled: number;
};

type ExpoConstantsSnapshot = {
  expoConfig?: {
    version?: string;
    android?: {
      googleServicesFile?: string;
    };
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

function toPermissionSnapshot(permission: {
  status?: string;
  granted?: boolean;
  canAskAgain?: boolean;
}): PushPermissionSnapshot {
  return {
    status: String(permission.status || 'undetermined'),
    granted: Boolean(permission.granted),
    canAskAgain: Boolean(permission.canAskAgain),
  };
}

function maskExpoPushToken(token: string | null) {
  if (!token) return null;
  if (token.length <= 20) return token;
  return `${token.slice(0, 18)}...${token.slice(-6)}`;
}

function getExpoPushTokenFingerprint(token: string | null) {
  if (!token) return null;
  return token.slice(-10);
}

function resolvePushSyncErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
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

function resolveAndroidGoogleServicesFile() {
  const constants = getExpoConstantsSnapshot();
  const googleServicesFile = constants.expoConfig?.android?.googleServicesFile || null;
  return typeof googleServicesFile === 'string' && googleServicesFile.trim().length > 0
    ? googleServicesFile.trim()
    : null;
}

function resolveAndroidPushNativeConfigStatus() {
  if (Platform.OS !== 'android') return 'not_applicable' as const;
  return resolveAndroidGoogleServicesFile() ? ('configured' as const) : ('missing' as const);
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
  return toPermissionSnapshot(permission);
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
  let permissionSnapshot = toPermissionSnapshot(permission);

  if (!permissionSnapshot.granted) {
    const requestPermission = await Notifications.requestPermissionsAsync();
    permissionSnapshot = toPermissionSnapshot(requestPermission);
  }

  const projectId = resolveExpoProjectId();

  if (!permissionSnapshot.granted) {
    return {
      token: null,
      permission: permissionSnapshot,
      projectId,
      errorMessage: 'Izin notifikasi belum aktif di perangkat.',
    };
  }

  if (!projectId) {
    return {
      token: null,
      permission: permissionSnapshot,
      projectId: null,
      errorMessage: 'Project ID Expo tidak ditemukan.',
    };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token || !isValidExpoPushToken(token)) {
      return {
        token: null,
        permission: permissionSnapshot,
        projectId,
        errorMessage: 'Token Expo belum tersedia atau format token tidak valid.',
      };
    }

    return {
      token,
      permission: permissionSnapshot,
      projectId,
      errorMessage: null,
    };
  } catch (error: unknown) {
    const baseErrorMessage = resolvePushSyncErrorMessage(error, 'Gagal mengambil Expo push token.');
    const errorMessage =
      Platform.OS === 'android' && resolveAndroidPushNativeConfigStatus() === 'missing'
        ? `${baseErrorMessage} Build Android ini belum mendeklarasikan google-services.json sehingga push Android saat app tertutup bisa gagal.`
        : baseErrorMessage;
    return {
      token: null,
      permission: permissionSnapshot,
      projectId,
      errorMessage,
    };
  }
}

async function persistPushSyncResult(result: PushSyncResult) {
  await AsyncStorage.setItem(PUSH_SYNC_STATUS_STORAGE_KEY, JSON.stringify(result));
}

async function readLastPushSyncResult() {
  const raw = await AsyncStorage.getItem(PUSH_SYNC_STATUS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushSyncResult;
  } catch {
    return null;
  }
}

export async function syncPushDeviceRegistration() {
  const syncedAt = new Date().toISOString();
  const deviceName = resolveDeviceName();
  const appVersion = resolveAppVersion();
  try {
    const tokenRequest = await requestExpoPushToken();
    const nextToken = tokenRequest.token;
    if (!nextToken) {
      const result: PushSyncResult = {
        registered: false,
        reason: 'permission_or_token_unavailable',
        errorMessage: tokenRequest.errorMessage || 'Izin notifikasi belum aktif atau token Expo belum tersedia.',
        permission: tokenRequest.permission,
        projectId: tokenRequest.projectId,
        deviceName,
        appVersion,
        syncedAt,
      };
      await persistPushSyncResult(result);
      return result;
    }

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
      appVersion,
      deviceName,
    });

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, nextToken);
    const result: PushSyncResult = {
      registered: true,
      token: nextToken,
      permission: tokenRequest.permission,
      projectId: tokenRequest.projectId,
      deviceName,
      appVersion,
      syncedAt,
    };
    await persistPushSyncResult(result);
    return result;
  } catch (error: unknown) {
    const permission = await getCurrentNotificationPermissionState().catch(() => ({
      status: 'unknown',
      granted: false,
      canAskAgain: false,
    }));
    const result: PushSyncResult = {
      registered: false,
      reason: 'registration_failed',
      errorMessage: resolvePushSyncErrorMessage(error, 'Request registrasi token push ke server gagal.'),
      permission,
      projectId: resolveExpoProjectId(),
      deviceName,
      appVersion,
      syncedAt,
    };
    await persistPushSyncResult(result);
    return result;
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

export async function getLocalPushDebugSnapshot(): Promise<LocalPushDebugSnapshot> {
  const permission = await getCurrentNotificationPermissionState().catch(() => ({
    status: 'unknown',
    granted: false,
    canAskAgain: false,
  }));
  const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  const lastSync = await readLastPushSyncResult();

  return {
    permission,
    storedToken,
    tokenPreview: maskExpoPushToken(storedToken),
    tokenFingerprint: getExpoPushTokenFingerprint(storedToken),
    projectId: resolveExpoProjectId(),
    deviceName: resolveDeviceName(),
    appVersion: resolveAppVersion(),
    androidPushNativeConfigStatus: resolveAndroidPushNativeConfigStatus(),
    androidGoogleServicesFile: resolveAndroidGoogleServicesFile(),
    lastSync,
  };
}

export async function fetchMyPushDevicesStatus(): Promise<MobilePushDevicesStatus> {
  const response = await apiClient.get<{
    data: MobilePushDevicesStatus;
  }>('/mobile-updates/devices/me');
  return response.data.data;
}

export async function sendSelfTestPushNotification(expoPushToken?: string | null): Promise<PushSelfTestResult> {
  const response = await apiClient.post<{
    data: PushSelfTestResult;
  }>('/mobile-updates/devices/test-self', {
    ...(expoPushToken ? { expoPushToken } : {}),
  });
  return response.data.data;
}
