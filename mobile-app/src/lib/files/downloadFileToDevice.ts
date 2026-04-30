import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const DOWNLOAD_DIRECTORY_KEY = 'sis_mobile_download_directory_uri';

type DownloadResult =
  | { status: 'saved'; fileName: string }
  | { status: 'cancelled'; fileName: string };

function sanitizeFileName(value?: string | null) {
  const normalized = String(value || '').trim();
  const fallback = `lampiran-${Date.now()}`;
  return (normalized || fallback)
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function getFileNameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : '';
  } catch {
    const last = url.split('?')[0]?.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : '';
  }
}

function inferMimeType(fileName: string, fallback?: string | null) {
  const cleanFallback = String(fallback || '').split(';')[0]?.trim();
  if (cleanFallback && cleanFallback !== 'application/octet-stream') return cleanFallback;
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'doc') return 'application/msword';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'xls') return 'application/vnd.ms-excel';
  if (extension === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (extension === 'ppt') return 'application/vnd.ms-powerpoint';
  if (extension === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'zip') return 'application/zip';
  return 'application/octet-stream';
}

async function ensureCacheDirectory() {
  const baseDirectory = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}downloads/`;
  if (!baseDirectory) throw new Error('Penyimpanan aplikasi tidak tersedia.');
  const info = await FileSystem.getInfoAsync(baseDirectory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(baseDirectory, { intermediates: true });
  }
  return baseDirectory;
}

async function writeToAndroidDirectory(params: { localUri: string; fileName: string; mimeType: string; directoryUri: string }) {
  const safUri = await FileSystem.StorageAccessFramework.createFileAsync(
    params.directoryUri,
    params.fileName,
    params.mimeType,
  );
  const base64 = await FileSystem.readAsStringAsync(params.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.StorageAccessFramework.writeAsStringAsync(safUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function requestAndroidDirectory() {
  const downloadsUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(downloadsUri);
  if (!permission.granted) return null;
  await AsyncStorage.setItem(DOWNLOAD_DIRECTORY_KEY, permission.directoryUri);
  return permission.directoryUri;
}

async function saveOnAndroid(localUri: string, fileName: string, mimeType: string): Promise<DownloadResult> {
  const storedDirectoryUri = await AsyncStorage.getItem(DOWNLOAD_DIRECTORY_KEY);
  if (storedDirectoryUri) {
    try {
      await writeToAndroidDirectory({ localUri, fileName, mimeType, directoryUri: storedDirectoryUri });
      return { status: 'saved', fileName };
    } catch {
      await AsyncStorage.removeItem(DOWNLOAD_DIRECTORY_KEY);
    }
  }

  const directoryUri = await requestAndroidDirectory();
  if (!directoryUri) return { status: 'cancelled', fileName };
  await writeToAndroidDirectory({ localUri, fileName, mimeType, directoryUri });
  return { status: 'saved', fileName };
}

export async function downloadFileToDevice(params: {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<DownloadResult> {
  const fileName = sanitizeFileName(params.fileName || getFileNameFromUrl(params.url));
  const cacheDirectory = await ensureCacheDirectory();
  const localUri = `${cacheDirectory}${Date.now()}-${fileName}`;
  const downloaded = await FileSystem.downloadAsync(params.url, localUri);

  try {
    if (downloaded.status < 200 || downloaded.status >= 300) {
      throw new Error(`Download gagal dengan status ${downloaded.status}.`);
    }

    const mimeType = inferMimeType(fileName, params.mimeType || downloaded.mimeType);
    if (Platform.OS === 'android') {
      return await saveOnAndroid(downloaded.uri, fileName, mimeType);
    }

    return { status: 'saved', fileName };
  } finally {
    if (Platform.OS === 'android') {
      await FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
    }
  }
}
