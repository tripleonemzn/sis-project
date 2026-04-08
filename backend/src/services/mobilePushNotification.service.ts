import axios from 'axios';
import type { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { broadcastMutationEvent } from '../realtime/realtimeGateway';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const DEFAULT_ACTIVITY_CHANNEL_ID = 'default';
const APP_UPDATE_CHANNEL_ID = 'updates';

type NotificationRowInput = {
  id?: number;
  userId: number;
  title: string;
  message: string;
  type?: string | null;
  data?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
};

type CreateNotificationOptions = {
  skipPush?: boolean;
};

function isValidExpoPushToken(token: string) {
  return /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

function chunkArray<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function normalizeNotificationType(type?: string | null) {
  const normalized = String(type || 'INFO').trim().toUpperCase();
  return normalized.length > 0 ? normalized : 'INFO';
}

function resolveNotificationChannelId(type?: string | null) {
  const normalizedType = normalizeNotificationType(type);
  return normalizedType === 'APP_UPDATE' || normalizedType === 'APP_UPDATE_TEST'
    ? APP_UPDATE_CHANNEL_ID
    : DEFAULT_ACTIVITY_CHANNEL_ID;
}

function normalizeNotificationData(
  rawData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null,
): Record<string, unknown> {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return {};
  }
  return rawData as Record<string, unknown>;
}

function buildPushData(row: NotificationRowInput) {
  const notificationData = normalizeNotificationData(row.data);
  const route =
    typeof notificationData.route === 'string' && notificationData.route.trim().startsWith('/')
      ? notificationData.route.trim()
      : '/notifications';

  return {
    ...notificationData,
    route,
    notificationId: row.id ?? null,
    type: normalizeNotificationType(row.type),
    source: 'backend-notification',
  };
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
      const response = await axios.post(EXPO_PUSH_API_URL, chunk, {
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

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

async function pushNotificationRows(rows: NotificationRowInput[]) {
  const normalizedRows = rows.filter(
    (row) =>
      Number.isFinite(Number(row.userId)) &&
      Number(row.userId) > 0 &&
      String(row.title || '').trim().length > 0 &&
      String(row.message || '').trim().length > 0,
  );
  if (normalizedRows.length === 0) {
    return { recipients: 0, sent: 0, failed: 0, staleTokensDisabled: 0 };
  }

  const userIds = Array.from(new Set(normalizedRows.map((row) => Number(row.userId))));
  const devices = await prisma.mobilePushDevice.findMany({
    where: {
      userId: { in: userIds },
      isEnabled: true,
    },
    select: {
      userId: true,
      expoPushToken: true,
    },
  });

  if (devices.length === 0) {
    return { recipients: 0, sent: 0, failed: 0, staleTokensDisabled: 0 };
  }

  const tokensByUserId = new Map<number, string[]>();
  devices.forEach((device) => {
    if (!isValidExpoPushToken(device.expoPushToken)) return;
    const userId = Number(device.userId);
    const existingTokens = tokensByUserId.get(userId) || [];
    if (!existingTokens.includes(device.expoPushToken)) {
      existingTokens.push(device.expoPushToken);
      tokensByUserId.set(userId, existingTokens);
    }
  });

  const pushMessages = normalizedRows.flatMap((row) => {
    const tokens = tokensByUserId.get(Number(row.userId)) || [];
    if (tokens.length === 0) return [];
    return tokens.map((token) => ({
      to: token,
      title: row.title,
      body: row.message,
      sound: 'default',
      channelId: resolveNotificationChannelId(row.type),
      priority: 'high' as const,
      data: buildPushData(row),
    }));
  });

  if (pushMessages.length === 0) {
    return { recipients: 0, sent: 0, failed: 0, staleTokensDisabled: 0 };
  }

  const dispatchResult = await dispatchExpoPushMessages(pushMessages);
  const staleTokensDisabled = await disableStaleTokens(dispatchResult.staleTokens);

  return {
    recipients: pushMessages.length,
    sent: dispatchResult.sent,
    failed: dispatchResult.failed,
    staleTokensDisabled,
  };
}

async function safePushNotificationRows(rows: NotificationRowInput[]) {
  try {
    return await pushNotificationRows(rows);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[mobile-push] gagal mengirim push notifikasi aktivitas: ${message}`);
    return { recipients: 0, sent: 0, failed: 0, staleTokensDisabled: 0 };
  }
}

export async function createInAppNotification(
  args: { data: Prisma.NotificationUncheckedCreateInput },
  options: CreateNotificationOptions = {},
) {
  const notification = await prisma.notification.create(args);
  broadcastMutationEvent({
    method: 'POST',
    path: '/api/notifications/internal',
    statusCode: 201,
    durationMs: 0,
  });
  if (!options.skipPush) {
    await safePushNotificationRows([
      {
        id: notification.id,
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: (notification.data as Prisma.InputJsonValue | null) || null,
      },
    ]);
  }
  return notification;
}

export async function createManyInAppNotifications(
  args: { data: Prisma.NotificationCreateManyInput[]; skipDuplicates?: boolean },
  options: CreateNotificationOptions = {},
) {
  const result = await prisma.notification.createMany(args);
  broadcastMutationEvent({
    method: 'POST',
    path: '/api/notifications/internal',
    statusCode: 201,
    durationMs: 0,
  });
  if (!options.skipPush) {
    await safePushNotificationRows(
      args.data.map((row) => ({
        userId: Number(row.userId),
        title: row.title,
        message: row.message,
        type: row.type,
        data: row.data || null,
      })),
    );
  }
  return result;
}
