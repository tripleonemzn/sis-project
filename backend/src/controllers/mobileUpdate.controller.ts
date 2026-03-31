import { Request, Response } from 'express';
import axios from 'axios';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const LOCALHOST_IPS = new Set(['127.0.0.1', '::1']);
const mobilePlatformSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return value.trim().toUpperCase();
}, z.enum(['ANDROID', 'IOS', 'UNKNOWN']));

const registerDeviceSchema = z.object({
  expoPushToken: z.string().trim().min(10),
  platform: mobilePlatformSchema.optional().default('UNKNOWN'),
  deviceId: z.string().trim().max(120).optional().nullable(),
  deviceName: z.string().trim().max(120).optional().nullable(),
  appVersion: z.string().trim().max(60).optional().nullable(),
});

const unregisterDeviceSchema = z.object({
  expoPushToken: z.string().trim().min(10).optional(),
});

const broadcastUpdateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  message: z.string().trim().max(500).optional(),
  channel: z.string().trim().max(80).optional(),
  platform: mobilePlatformSchema.optional(),
});

const testDevicePushSchema = z.object({
  title: z.string().trim().max(120).optional(),
  message: z.string().trim().max(500).optional(),
  expoPushToken: z.string().trim().min(10).optional(),
});

function normalizeRemoteAddress(raw: string | undefined | null) {
  if (!raw) return '';
  const cleaned = raw.replace('::ffff:', '');
  if (cleaned.includes(',')) {
    return cleaned.split(',')[0].trim();
  }
  return cleaned.trim();
}

function isValidExpoPushToken(token: string) {
  return /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

function getAuthUserId(req: Request) {
  const idRaw = (req as any).user?.id;
  const userId = Number(idRaw);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new ApiError(401, 'Permintaan tidak diizinkan');
  }
  return userId;
}

function assertBroadcastAuthorized(req: Request) {
  const expectedSecret = (process.env.MOBILE_UPDATE_PUSH_SECRET || '').trim();
  const providedSecret = (req.header('x-mobile-update-secret') || '').trim();

  if (expectedSecret) {
    if (providedSecret !== expectedSecret) {
      throw new ApiError(401, 'Secret broadcast update tidak valid');
    }
    return;
  }

  const remoteAddress = normalizeRemoteAddress(req.socket.remoteAddress || req.ip);
  if (!LOCALHOST_IPS.has(remoteAddress)) {
    throw new ApiError(
      403,
      'Broadcast update hanya diizinkan dari localhost saat MOBILE_UPDATE_PUSH_SECRET belum diset',
    );
  }
}

function chunkArray<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function maskExpoPushToken(token: string) {
  if (token.length <= 20) return token;
  return `${token.slice(0, 18)}...${token.slice(-6)}`;
}

function getExpoPushTokenFingerprint(token: string) {
  return token.slice(-10);
}

function dedupeRecipients<T extends { expoPushToken: string }>(devices: T[]) {
  const uniqueByToken = new Map<string, T>();
  for (const device of devices) {
    if (!uniqueByToken.has(device.expoPushToken)) {
      uniqueByToken.set(device.expoPushToken, device);
    }
  }
  return Array.from(uniqueByToken.values());
}

async function dispatchExpoPushMessages(
  pushMessages: Array<{
    to: string;
    title: string;
    body: string;
    sound: string;
    channelId: string;
    priority: 'high';
    data: Record<string, unknown>;
  }>,
) {
  let sent = 0;
  let failed = 0;
  const staleTokens = new Set<string>();
  const chunks = chunkArray(pushMessages, 100);

  for (const chunk of chunks) {
    try {
      const response = await axios.post(
        EXPO_PUSH_API_URL,
        chunk,
        {
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const tickets = Array.isArray(response.data?.data) ? response.data.data : [];
      if (tickets.length === 0) {
        failed += chunk.length;
        continue;
      }

      tickets.forEach((ticket: any, index: number) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }
        failed += 1;
        const token = chunk[index]?.to;
        const errorCode = String(ticket?.details?.error || '');
        if (token && errorCode === 'DeviceNotRegistered') {
          staleTokens.add(token);
        }
      });
    } catch {
      failed += chunk.length;
    }
  }

  return {
    sent,
    failed,
    staleTokens,
  };
}

async function disableStaleTokens(staleTokens: Set<string>) {
  if (staleTokens.size === 0) return 0;

  const result = await prisma.mobilePushDevice.updateMany({
    where: {
      expoPushToken: { in: Array.from(staleTokens) },
    },
    data: {
      isEnabled: false,
      lastSeenAt: new Date(),
    },
  });

  return result.count;
}

export const registerMobilePushDevice = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const payload = registerDeviceSchema.parse(req.body);

  if (!isValidExpoPushToken(payload.expoPushToken)) {
    throw new ApiError(400, 'Format Expo push token tidak valid');
  }

  const device = await prisma.mobilePushDevice.upsert({
    where: { expoPushToken: payload.expoPushToken },
    update: {
      userId,
      platform: payload.platform,
      deviceId: payload.deviceId || null,
      deviceName: payload.deviceName || null,
      appVersion: payload.appVersion || null,
      isEnabled: true,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      expoPushToken: payload.expoPushToken,
      platform: payload.platform,
      deviceId: payload.deviceId || null,
      deviceName: payload.deviceName || null,
      appVersion: payload.appVersion || null,
      isEnabled: true,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      expoPushToken: true,
      platform: true,
      isEnabled: true,
      lastSeenAt: true,
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, device, 'Token push perangkat berhasil disimpan'));
});

export const unregisterMobilePushDevice = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const payload = unregisterDeviceSchema.parse(req.body || {});

  if (payload.expoPushToken && !isValidExpoPushToken(payload.expoPushToken)) {
    throw new ApiError(400, 'Format Expo push token tidak valid');
  }

  const where = payload.expoPushToken
    ? { userId, expoPushToken: payload.expoPushToken }
    : { userId };

  const result = await prisma.mobilePushDevice.updateMany({
    where,
    data: {
      isEnabled: false,
      lastSeenAt: new Date(),
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, { updated: result.count }, 'Token push perangkat berhasil dinonaktifkan'));
});

export const getMyMobilePushDevices = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);

  const devices = await prisma.mobilePushDevice.findMany({
    where: { userId },
    orderBy: [
      { isEnabled: 'desc' },
      { lastSeenAt: 'desc' },
      { updatedAt: 'desc' },
    ],
    select: {
      id: true,
      platform: true,
      deviceName: true,
      appVersion: true,
      isEnabled: true,
      lastSeenAt: true,
      updatedAt: true,
      createdAt: true,
      expoPushToken: true,
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        totalDevices: devices.length,
        enabledDevices: devices.filter((device) => device.isEnabled).length,
        devices: devices.map((device) => ({
          id: device.id,
          platform: device.platform,
          deviceName: device.deviceName,
          appVersion: device.appVersion,
          isEnabled: device.isEnabled,
          lastSeenAt: device.lastSeenAt,
          updatedAt: device.updatedAt,
          createdAt: device.createdAt,
          tokenPreview: maskExpoPushToken(device.expoPushToken),
          tokenFingerprint: getExpoPushTokenFingerprint(device.expoPushToken),
        })),
      },
      'Status perangkat mobile berhasil diambil',
    ),
  );
});

export const testMyMobilePushDevice = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const payload = testDevicePushSchema.parse(req.body || {});

  if (payload.expoPushToken && !isValidExpoPushToken(payload.expoPushToken)) {
    throw new ApiError(400, 'Format Expo push token tidak valid');
  }

  const title = payload.title || 'Tes Notifikasi SIS KGB2';
  const message =
    payload.message || 'Tes notifikasi berhasil dikirim ke perangkat ini. Jika notifikasi muncul, push sudah siap dipakai.';

  const devices = await prisma.mobilePushDevice.findMany({
    where: {
      userId,
      isEnabled: true,
      ...(payload.expoPushToken ? { expoPushToken: payload.expoPushToken } : {}),
    },
    select: {
      id: true,
      expoPushToken: true,
      deviceName: true,
      platform: true,
    },
  });

  if (devices.length === 0) {
    throw new ApiError(
      404,
      'Perangkat push aktif tidak ditemukan. Sinkronkan token push dari aplikasi lalu coba lagi.',
    );
  }

  const recipients = dedupeRecipients(devices);
  const dispatchResult = await dispatchExpoPushMessages(
    recipients.map((device) => ({
      to: device.expoPushToken,
      title,
      body: message,
      sound: 'default',
      channelId: 'updates',
      priority: 'high' as const,
      data: {
        type: 'APP_UPDATE_TEST',
        source: 'mobile-diagnostics',
      },
    })),
  );

  const staleTokensDisabled = await disableStaleTokens(dispatchResult.staleTokens);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        recipients: recipients.length,
        sent: dispatchResult.sent,
        failed: dispatchResult.failed,
        staleTokensDisabled,
      },
      'Tes notifikasi perangkat selesai',
    ),
  );
});

export const broadcastMobileUpdateNotification = asyncHandler(async (req: Request, res: Response) => {
  assertBroadcastAuthorized(req);
  const payload = broadcastUpdateSchema.parse(req.body || {});

  const title = payload.title || 'SIS KGB2 : Update Tersedia';
  const channel = payload.channel || 'pilot';
  const message =
    payload.message ||
    'Versi terbaru SIS KGB2 tersedia. Silakan perbarui untuk menikmati fitur terbaru.';

  const where: any = { isEnabled: true };
  if (payload.platform) {
    where.platform = payload.platform;
  }

  const devices = await prisma.mobilePushDevice.findMany({
    where,
    select: {
      id: true,
      userId: true,
      expoPushToken: true,
    },
  });

  if (devices.length === 0) {
    res.status(200).json(
      new ApiResponse(
        200,
        {
          sent: 0,
          failed: 0,
          recipients: 0,
          staleTokensDisabled: 0,
        },
        'Tidak ada perangkat aktif untuk menerima notifikasi update',
      ),
    );
    return;
  }

  const recipients = dedupeRecipients(devices);

  const dispatchResult = await dispatchExpoPushMessages(recipients.map((device) => ({
    to: device.expoPushToken,
    title,
    body: message,
    sound: 'default',
    channelId: 'updates',
    priority: 'high',
    data: {
      type: 'APP_UPDATE',
      channel,
    },
  })));

  const staleTokensDisabled = await disableStaleTokens(dispatchResult.staleTokens);

  const uniqueUserIds = Array.from(new Set(recipients.map((item) => item.userId)));
  if (uniqueUserIds.length > 0) {
    await createManyInAppNotifications({
      data: uniqueUserIds.map((userId) => ({
        userId,
        title,
        message,
        type: 'APP_UPDATE',
        data: { channel },
      })),
    }, { skipPush: true });
  }

  res.status(200).json(
    new ApiResponse(200, {
      sent: dispatchResult.sent,
      failed: dispatchResult.failed,
      recipients: recipients.length,
      staleTokensDisabled,
      channel,
    }, 'Broadcast notifikasi update selesai'),
  );
});
