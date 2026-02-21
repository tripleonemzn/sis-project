import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export type AppUpdateCheckResult = {
  supported: boolean;
  available: boolean;
  channel: string;
  errorMessage?: string;
};

export function isAppUpdateSupported() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  if (__DEV__) return false;
  return Updates.isEnabled;
}

export async function checkAppUpdate(): Promise<AppUpdateCheckResult> {
  const supported = isAppUpdateSupported();
  const channel = Updates.channel || 'default';
  if (!supported) {
    return {
      supported: false,
      available: false,
      channel,
    };
  }

  try {
    const result = await Updates.checkForUpdateAsync();
    return {
      supported: true,
      available: result.isAvailable,
      channel,
    };
  } catch (error: any) {
    return {
      supported: true,
      available: false,
      channel,
      errorMessage: error?.message || 'Gagal memeriksa update.',
    };
  }
}

export async function applyAppUpdate() {
  if (!isAppUpdateSupported()) return;
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}
