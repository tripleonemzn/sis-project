import { Request, Response } from 'express';
import axios from 'axios';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

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

  const uniqueByToken = new Map<string, { userId: number; expoPushToken: string }>();
  for (const device of devices) {
    if (!uniqueByToken.has(device.expoPushToken)) {
      uniqueByToken.set(device.expoPushToken, { userId: device.userId, expoPushToken: device.expoPushToken });
    }
  }
  const recipients = Array.from(uniqueByToken.values());

  const pushMessages = recipients.map((device) => ({
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
  }));

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

  if (staleTokens.size > 0) {
    await prisma.mobilePushDevice.updateMany({
      where: {
        expoPushToken: { in: Array.from(staleTokens) },
      },
      data: {
        isEnabled: false,
        lastSeenAt: new Date(),
      },
    });
  }

  const uniqueUserIds = Array.from(new Set(recipients.map((item) => item.userId)));
  if (uniqueUserIds.length > 0) {
    await prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        title,
        message,
        type: 'APP_UPDATE',
        data: { channel },
      })),
    });
  }

  res.status(200).json(
    new ApiResponse(200, {
      sent,
      failed,
      recipients: recipients.length,
      staleTokensDisabled: staleTokens.size,
      channel,
    }, 'Broadcast notifikasi update selesai'),
  );
});
