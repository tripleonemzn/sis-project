import type { IncomingMessage, Server as HttpServer } from 'http';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';

type JwtRealtimePayload = {
  id?: number | string;
  role?: string;
  source?: string;
  additionalDuties?: string[];
};

export type RealtimePresencePlatform = 'WEB' | 'ANDROID' | 'IOS' | 'UNKNOWN';

type ClientContext = {
  userId: number | null;
  role: string | null;
  additionalDuties: string[];
  platform: RealtimePresencePlatform;
};

type RealtimeSocket = WebSocket & {
  isAlive?: boolean;
  context?: ClientContext;
};

type LocalPresenceEntry = {
  userId: number;
  role: string | null;
  platform: RealtimePresencePlatform;
  activeConnections: number;
  lastSeenAtMs: number;
};

type WorkerPresenceEntrySnapshot = {
  userId: number;
  role: string | null;
  platform: RealtimePresencePlatform;
  activeConnections: number;
  lastSeenAt: string;
};

type WorkerPresenceSnapshotFile = {
  pid: number;
  hostname: string;
  updatedAt: string;
  graceWindowMs: number;
  totalConnections: number;
  entries: WorkerPresenceEntrySnapshot[];
};

export type RealtimePresenceRoleCount = {
  role: string;
  count: number;
};

export type RealtimePresencePlatformCount = {
  platform: RealtimePresencePlatform;
  count: number;
};

export type RealtimePresenceUserSnapshot = {
  userId: number;
  role: string;
  platforms: RealtimePresencePlatform[];
  totalConnections: number;
  lastSeenAt: string;
};

export type RealtimePresenceSnapshot = {
  totalUsers: number;
  totalConnections: number;
  byRole: RealtimePresenceRoleCount[];
  byPlatform: RealtimePresencePlatformCount[];
  users: RealtimePresenceUserSnapshot[];
  sampledAt: string;
  graceWindowSeconds: number;
};

export type RealtimeMutationEventPayload = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

type RealtimeDomainEventScopeValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export type RealtimeDomainEventPayload = {
  domain: 'GRADES' | 'REPORTS' | 'ATTENDANCE' | 'PROCTORING';
  action: 'UPDATED' | 'STALE';
  scope?: Record<string, RealtimeDomainEventScopeValue>;
};

type RealtimeMutationEvent = {
  type: 'MUTATION';
  eventId: string;
  at: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

type RealtimeDomainEvent = {
  type: 'DOMAIN_EVENT';
  eventId: string;
  at: string;
  domain: RealtimeDomainEventPayload['domain'];
  action: RealtimeDomainEventPayload['action'];
  scope?: Record<string, RealtimeDomainEventScopeValue>;
};

type RealtimePresenceEvent = {
  type: 'PRESENCE';
  at: string;
  sampledAt: string;
  totalUsers: number;
  totalConnections: number;
  byPlatform: RealtimePresencePlatformCount[];
};

const PRESENCE_SNAPSHOT_DIR = path.join(os.tmpdir(), 'sis-realtime-presence');
const PRESENCE_SNAPSHOT_FILE = path.join(PRESENCE_SNAPSHOT_DIR, `worker-${process.pid}.json`);
const PRESENCE_WRITE_DEBOUNCE_MS = 250;
const PRESENCE_CACHE_TTL_MS = 1500;
const PRESENCE_BROADCAST_INTERVAL_MS = 5000;
const PRESENCE_GRACE_MS = Math.max(
  15000,
  Number.parseInt(String(process.env.REALTIME_PRESENCE_GRACE_MS || '').trim(), 10) || 45000,
);
const PRESENCE_STALE_WORKER_MS = Math.max(
  PRESENCE_GRACE_MS + 60000,
  Number.parseInt(String(process.env.REALTIME_PRESENCE_STALE_WORKER_MS || '').trim(), 10) ||
    PRESENCE_GRACE_MS + 60000,
);

let wsServer: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let presenceBroadcastInterval: NodeJS.Timeout | null = null;
let snapshotWriteTimer: NodeJS.Timeout | null = null;
let aggregatedPresenceCache: { atMs: number; data: RealtimePresenceSnapshot } | null = null;
let aggregatedPresencePromise: Promise<RealtimePresenceSnapshot> | null = null;
let lastPresenceBroadcastSignature = '';

const localPresenceEntries = new Map<string, LocalPresenceEntry>();

function nextEventId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNormalizedDutyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => item.length > 0);
}

function normalizePlatform(value: unknown): RealtimePresencePlatform {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'WEB' || normalized === 'BROWSER') return 'WEB';
  if (normalized === 'ANDROID') return 'ANDROID';
  if (normalized === 'IOS' || normalized === 'IPHONE' || normalized === 'IPAD') return 'IOS';
  return 'UNKNOWN';
}

function getTokenFromRequest(req: IncomingMessage): string | null {
  try {
    const rawUrl = req.url || '/';
    const url = new URL(rawUrl, 'http://localhost');
    const tokenFromQuery = url.searchParams.get('token');
    if (tokenFromQuery && tokenFromQuery.trim().length > 0) {
      return tokenFromQuery.trim();
    }
  } catch {
    // noop
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }

  return null;
}

function getRealtimeClientPlatform(req: IncomingMessage, decoded?: JwtRealtimePayload): RealtimePresencePlatform {
  try {
    const rawUrl = req.url || '/';
    const url = new URL(rawUrl, 'http://localhost');
    const client = url.searchParams.get('client');
    if (client) return normalizePlatform(client);
  } catch {
    // noop
  }
  return normalizePlatform(decoded?.source);
}

function resolveClientContext(req: IncomingMessage): ClientContext | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtRealtimePayload;
    const rawUserId = decoded?.id;
    const parsedUserId =
      typeof rawUserId === 'number'
        ? rawUserId
        : typeof rawUserId === 'string' && rawUserId.trim().length > 0
          ? Number(rawUserId)
          : null;

    return {
      userId: Number.isFinite(parsedUserId as number) ? Number(parsedUserId) : null,
      role: typeof decoded?.role === 'string' ? decoded.role : null,
      additionalDuties: toNormalizedDutyList(decoded?.additionalDuties),
      platform: getRealtimeClientPlatform(req, decoded),
    };
  } catch {
    return null;
  }
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // ignore broken socket send
  }
}

function normalizeRole(value: string | null | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized || 'UNKNOWN';
}

function buildPresenceEntryKey(userId: number, platform: RealtimePresencePlatform) {
  return `${userId}:${platform}`;
}

function invalidatePresenceCache() {
  aggregatedPresenceCache = null;
}

function pruneLocalPresenceEntries(nowMs = Date.now()) {
  for (const [key, entry] of localPresenceEntries.entries()) {
    if (entry.activeConnections > 0) continue;
    if (nowMs - entry.lastSeenAtMs <= PRESENCE_GRACE_MS) continue;
    localPresenceEntries.delete(key);
  }
}

function upsertLocalPresence(context: ClientContext, activeDelta: number) {
  if (!Number.isInteger(context.userId) || (context.userId ?? 0) <= 0) return;
  const userId = Number(context.userId);
  const entryKey = buildPresenceEntryKey(userId, context.platform);
  const nowMs = Date.now();
  const existing = localPresenceEntries.get(entryKey);
  const nextActiveConnections = Math.max(0, (existing?.activeConnections || 0) + activeDelta);

  localPresenceEntries.set(entryKey, {
    userId,
    role: context.role,
    platform: context.platform,
    activeConnections: nextActiveConnections,
    lastSeenAtMs: nowMs,
  });

  pruneLocalPresenceEntries(nowMs);
  invalidatePresenceCache();
}

function touchLocalPresence(context: ClientContext) {
  if (!Number.isInteger(context.userId) || (context.userId ?? 0) <= 0) return;
  const entryKey = buildPresenceEntryKey(Number(context.userId), context.platform);
  const existing = localPresenceEntries.get(entryKey);
  if (!existing) return;
  existing.lastSeenAtMs = Date.now();
  invalidatePresenceCache();
}

function buildLocalWorkerPresenceSnapshot(nowMs = Date.now()): WorkerPresenceSnapshotFile {
  pruneLocalPresenceEntries(nowMs);
  const entries = Array.from(localPresenceEntries.values()).map((entry) => ({
    userId: entry.userId,
    role: entry.role,
    platform: entry.platform,
    activeConnections: entry.activeConnections,
    lastSeenAt: new Date(entry.lastSeenAtMs).toISOString(),
  }));
  const totalConnections = entries.reduce((sum, entry) => sum + Math.max(0, entry.activeConnections), 0);
  return {
    pid: process.pid,
    hostname: os.hostname(),
    updatedAt: new Date(nowMs).toISOString(),
    graceWindowMs: PRESENCE_GRACE_MS,
    totalConnections,
    entries,
  };
}

async function writeLocalPresenceSnapshotNow() {
  const nowMs = Date.now();
  const snapshot = buildLocalWorkerPresenceSnapshot(nowMs);
  try {
    await fs.mkdir(PRESENCE_SNAPSHOT_DIR, { recursive: true });
    const tempPath = `${PRESENCE_SNAPSHOT_FILE}.${process.pid}.${nowMs}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(snapshot), 'utf8');
    await fs.rename(tempPath, PRESENCE_SNAPSHOT_FILE);
  } catch {
    // noop
  } finally {
    invalidatePresenceCache();
  }
}

function scheduleSnapshotWrite() {
  if (snapshotWriteTimer) return;
  snapshotWriteTimer = setTimeout(() => {
    snapshotWriteTimer = null;
    void writeLocalPresenceSnapshotNow();
  }, PRESENCE_WRITE_DEBOUNCE_MS);
  snapshotWriteTimer.unref?.();
}

async function removeLocalPresenceSnapshotFile() {
  try {
    await fs.rm(PRESENCE_SNAPSHOT_FILE, { force: true });
  } catch {
    // noop
  } finally {
    invalidatePresenceCache();
  }
}

async function readPresenceSnapshotFiles(): Promise<WorkerPresenceSnapshotFile[]> {
  try {
    const filenames = await fs.readdir(PRESENCE_SNAPSHOT_DIR);
    const nowMs = Date.now();
    const snapshots = await Promise.all(
      filenames
        .filter((filename) => filename.startsWith('worker-') && filename.endsWith('.json'))
        .map(async (filename) => {
          const filePath = path.join(PRESENCE_SNAPSHOT_DIR, filename);
          try {
            const raw = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw) as WorkerPresenceSnapshotFile;
            const updatedAtMs = Date.parse(String(parsed.updatedAt || ''));
            if (!Number.isFinite(updatedAtMs) || nowMs - updatedAtMs > PRESENCE_STALE_WORKER_MS) {
              void fs.rm(filePath, { force: true });
              return null;
            }
            return parsed;
          } catch {
            return null;
          }
        }),
    );
    return snapshots.filter((item): item is WorkerPresenceSnapshotFile => item !== null);
  } catch {
    return [];
  }
}

function buildPresenceRoleBuckets(users: RealtimePresenceUserSnapshot[]): RealtimePresenceRoleCount[] {
  const buckets = new Map<string, number>();
  users.forEach((user) => {
    const role = normalizeRole(user.role);
    buckets.set(role, (buckets.get(role) || 0) + 1);
  });
  return Array.from(buckets.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.role.localeCompare(right.role);
    });
}

function buildPresencePlatformBuckets(users: RealtimePresenceUserSnapshot[]): RealtimePresencePlatformCount[] {
  const order: RealtimePresencePlatform[] = ['WEB', 'ANDROID', 'IOS', 'UNKNOWN'];
  const buckets = new Map<RealtimePresencePlatform, Set<number>>();
  order.forEach((platform) => {
    buckets.set(platform, new Set<number>());
  });
  users.forEach((user) => {
    user.platforms.forEach((platform) => {
      buckets.get(platform)?.add(user.userId);
    });
  });
  return order
    .map((platform) => ({
      platform,
      count: buckets.get(platform)?.size || 0,
    }))
    .filter((item) => item.count > 0 || item.platform !== 'UNKNOWN');
}

async function computeAggregatedPresenceSnapshot(): Promise<RealtimePresenceSnapshot> {
  const nowMs = Date.now();
  pruneLocalPresenceEntries(nowMs);
  const snapshots = await readPresenceSnapshotFiles();
  const users = new Map<
    number,
    {
      userId: number;
      role: string;
      platforms: Set<RealtimePresencePlatform>;
      totalConnections: number;
      lastSeenAtMs: number;
    }
  >();
  let totalConnections = 0;

  snapshots.forEach((snapshot) => {
    totalConnections += Number.isFinite(snapshot.totalConnections) ? snapshot.totalConnections : 0;
    snapshot.entries.forEach((entry) => {
      const userId = Number(entry.userId);
      if (!Number.isInteger(userId) || userId <= 0) return;

      const lastSeenAtMs = Date.parse(String(entry.lastSeenAt || ''));
      const activeConnections = Math.max(0, Number(entry.activeConnections) || 0);
      const platform = normalizePlatform(entry.platform);
      const role = normalizeRole(entry.role);
      const isFresh = activeConnections > 0 || (Number.isFinite(lastSeenAtMs) && nowMs - lastSeenAtMs <= PRESENCE_GRACE_MS);
      if (!isFresh) return;

      const bucket =
        users.get(userId) ||
        {
          userId,
          role,
          platforms: new Set<RealtimePresencePlatform>(),
          totalConnections: 0,
          lastSeenAtMs: Number.isFinite(lastSeenAtMs) ? lastSeenAtMs : nowMs,
        };

      const nextRole = bucket.role === 'UNKNOWN' ? role : bucket.role;
      users.set(userId, {
        userId,
        role: nextRole,
        platforms: bucket.platforms.add(platform),
        totalConnections: bucket.totalConnections + activeConnections,
        lastSeenAtMs: Math.max(bucket.lastSeenAtMs, Number.isFinite(lastSeenAtMs) ? lastSeenAtMs : nowMs),
      });
    });
  });

  const normalizedUsers: RealtimePresenceUserSnapshot[] = Array.from(users.values())
    .map((user) => ({
      userId: user.userId,
      role: user.role,
      platforms: Array.from(user.platforms.values()).sort(),
      totalConnections: user.totalConnections,
      lastSeenAt: new Date(user.lastSeenAtMs).toISOString(),
    }))
    .sort((left, right) => {
      const rightSeen = Date.parse(right.lastSeenAt);
      const leftSeen = Date.parse(left.lastSeenAt);
      if (Number.isFinite(rightSeen) && Number.isFinite(leftSeen) && rightSeen !== leftSeen) {
        return rightSeen - leftSeen;
      }
      return left.userId - right.userId;
    });

  return {
    totalUsers: normalizedUsers.length,
    totalConnections,
    byRole: buildPresenceRoleBuckets(normalizedUsers),
    byPlatform: buildPresencePlatformBuckets(normalizedUsers),
    users: normalizedUsers,
    sampledAt: new Date(nowMs).toISOString(),
    graceWindowSeconds: Math.round(PRESENCE_GRACE_MS / 1000),
  };
}

function buildPresenceSignature(snapshot: RealtimePresenceSnapshot) {
  return JSON.stringify({
    totalUsers: snapshot.totalUsers,
    totalConnections: snapshot.totalConnections,
    byRole: snapshot.byRole,
    byPlatform: snapshot.byPlatform,
    users: snapshot.users.map((user) => ({
      userId: user.userId,
      role: user.role,
      platforms: user.platforms,
      totalConnections: user.totalConnections,
    })),
  });
}

function buildPresenceEvent(snapshot: RealtimePresenceSnapshot): RealtimePresenceEvent {
  return {
    type: 'PRESENCE',
    at: new Date().toISOString(),
    sampledAt: snapshot.sampledAt,
    totalUsers: snapshot.totalUsers,
    totalConnections: snapshot.totalConnections,
    byPlatform: snapshot.byPlatform,
  };
}

async function emitPresenceSummaryToAdminSockets(targetSockets?: RealtimeSocket[]) {
  const sockets =
    targetSockets?.filter(
      (socket) => socket.readyState === WebSocket.OPEN && normalizeRole(socket.context?.role) === 'ADMIN',
    ) ||
    [];

  const adminSockets =
    sockets.length > 0
      ? sockets
      : wsServer
        ? Array.from(wsServer.clients).filter((socket) => {
            const client = socket as RealtimeSocket;
            return (
              client.readyState === WebSocket.OPEN &&
              normalizeRole(client.context?.role) === 'ADMIN'
            );
          }) as RealtimeSocket[]
        : [];

  if (adminSockets.length === 0) return;

  const snapshot = await getRealtimePresenceSnapshot();
  const signature = buildPresenceSignature(snapshot);
  if (!targetSockets && signature === lastPresenceBroadcastSignature) return;
  lastPresenceBroadcastSignature = signature;

  const payload = buildPresenceEvent(snapshot);
  adminSockets.forEach((socket) => {
    sendJson(socket, payload);
  });
}

function setupPresenceBroadcast() {
  if (presenceBroadcastInterval) return;
  presenceBroadcastInterval = setInterval(() => {
    void emitPresenceSummaryToAdminSockets();
  }, PRESENCE_BROADCAST_INTERVAL_MS);
  presenceBroadcastInterval.unref?.();
}

function setupHeartbeat() {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(() => {
    if (!wsServer) return;

    for (const socket of wsServer.clients) {
      const client = socket as RealtimeSocket;
      if (client.readyState !== WebSocket.OPEN) continue;

      if (!client.isAlive) {
        client.terminate();
        continue;
      }

      client.isAlive = false;
      try {
        client.ping();
      } catch {
        client.terminate();
      }
    }
  }, 30000);

  heartbeatInterval.unref?.();
}

export function initializeRealtimeGateway(server: HttpServer) {
  if (wsServer) return wsServer;

  wsServer = new WebSocketServer({
    server,
    path: '/api/realtime/ws',
  });

  setupHeartbeat();
  setupPresenceBroadcast();
  void writeLocalPresenceSnapshotNow();

  wsServer.on('connection', (socket, req) => {
    const context = resolveClientContext(req);
    if (!context) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    const client = socket as RealtimeSocket;
    client.context = context;
    client.isAlive = true;

    upsertLocalPresence(context, 1);
    const initialSnapshotWrite = writeLocalPresenceSnapshotNow();

    client.on('pong', () => {
      client.isAlive = true;
      if (client.context) {
        touchLocalPresence(client.context);
        scheduleSnapshotWrite();
      }
    });

    client.on('close', () => {
      if (client.context) {
        upsertLocalPresence(client.context, -1);
        void writeLocalPresenceSnapshotNow();
      }
    });

    client.on('error', () => {
      // keep quiet, socket will reconnect from client-side
    });

    sendJson(client, {
      type: 'READY',
      at: new Date().toISOString(),
    });

    if (normalizeRole(context.role) === 'ADMIN') {
      void initialSnapshotWrite.then(() => emitPresenceSummaryToAdminSockets([client]));
    }
  });

  wsServer.on('close', () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (presenceBroadcastInterval) {
      clearInterval(presenceBroadcastInterval);
      presenceBroadcastInterval = null;
    }
    if (snapshotWriteTimer) {
      clearTimeout(snapshotWriteTimer);
      snapshotWriteTimer = null;
    }
    void removeLocalPresenceSnapshotFile();
  });

  return wsServer;
}

function broadcastJsonMessage(message: string) {
  if (!wsServer) return;

  for (const socket of wsServer.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    try {
      socket.send(message);
    } catch {
      // skip dead socket
    }
  }
}

export function broadcastMutationEvent(payload: RealtimeMutationEventPayload) {
  if (!wsServer) return;

  const event: RealtimeMutationEvent = {
    type: 'MUTATION',
    eventId: nextEventId(),
    at: new Date().toISOString(),
    method: payload.method.toUpperCase(),
    path: payload.path,
    statusCode: payload.statusCode,
    durationMs: payload.durationMs,
  };

  broadcastJsonMessage(JSON.stringify(event));
}

export function broadcastDomainEvent(payload: RealtimeDomainEventPayload) {
  if (!wsServer) return;

  const event: RealtimeDomainEvent = {
    type: 'DOMAIN_EVENT',
    eventId: nextEventId(),
    at: new Date().toISOString(),
    domain: payload.domain,
    action: payload.action,
    scope: payload.scope,
  };

  broadcastJsonMessage(JSON.stringify(event));
}

export async function getRealtimePresenceSnapshot(): Promise<RealtimePresenceSnapshot> {
  const nowMs = Date.now();
  if (aggregatedPresenceCache && nowMs - aggregatedPresenceCache.atMs <= PRESENCE_CACHE_TTL_MS) {
    return aggregatedPresenceCache.data;
  }
  if (aggregatedPresencePromise) {
    return aggregatedPresencePromise;
  }

  aggregatedPresencePromise = computeAggregatedPresenceSnapshot()
    .then((data) => {
      aggregatedPresenceCache = { atMs: Date.now(), data };
      return data;
    })
    .finally(() => {
      aggregatedPresencePromise = null;
    });

  return aggregatedPresencePromise;
}
