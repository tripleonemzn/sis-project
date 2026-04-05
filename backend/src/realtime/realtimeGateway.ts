import type { IncomingMessage, Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';

type JwtRealtimePayload = {
  id?: number | string;
  role?: string;
  additionalDuties?: string[];
};

type ClientContext = {
  userId: number | null;
  role: string | null;
  additionalDuties: string[];
};

type RealtimeSocket = WebSocket & {
  isAlive?: boolean;
  context?: ClientContext;
};

export type RealtimeMutationEventPayload = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
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

let wsServer: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

export type RealtimePresenceRoleCount = {
  role: string;
  count: number;
};

export type RealtimePresenceSnapshot = {
  totalUsers: number;
  totalConnections: number;
  byRole: RealtimePresenceRoleCount[];
  sampledAt: string;
};

function nextEventId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNormalizedDutyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => item.length > 0);
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
  }, 30_000);

  heartbeatInterval.unref?.();
}

export function initializeRealtimeGateway(server: HttpServer) {
  if (wsServer) return wsServer;

  wsServer = new WebSocketServer({
    server,
    path: '/api/realtime/ws',
  });

  setupHeartbeat();

  wsServer.on('connection', (socket, req) => {
    const context = resolveClientContext(req);
    if (!context) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    const client = socket as RealtimeSocket;
    client.context = context;
    client.isAlive = true;

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('error', () => {
      // keep quiet, socket will reconnect from client-side
    });

    sendJson(client, {
      type: 'READY',
      at: new Date().toISOString(),
    });
  });

  wsServer.on('close', () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  });

  return wsServer;
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

  const message = JSON.stringify(event);
  for (const socket of wsServer.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    try {
      socket.send(message);
    } catch {
      // skip dead socket
    }
  }
}

export function getRealtimePresenceSnapshot(): RealtimePresenceSnapshot {
  if (!wsServer) {
    return {
      totalUsers: 0,
      totalConnections: 0,
      byRole: [],
      sampledAt: new Date().toISOString(),
    };
  }

  const uniqueUsers = new Map<number, ClientContext>();
  const roleBuckets = new Map<string, Set<number>>();
  let totalConnections = 0;

  for (const socket of wsServer.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const client = socket as RealtimeSocket;
    const context = client.context;
    if (!context || !Number.isInteger(context.userId) || (context.userId ?? 0) <= 0) continue;
    const userId = Number(context.userId);

    totalConnections += 1;
    uniqueUsers.set(userId, context);

    const normalizedRole = String(context.role || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    if (!roleBuckets.has(normalizedRole)) {
      roleBuckets.set(normalizedRole, new Set<number>());
    }
    roleBuckets.get(normalizedRole)?.add(userId);
  }

  const byRole = Array.from(roleBuckets.entries())
    .map(([role, userIds]) => ({
      role,
      count: userIds.size,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.role.localeCompare(right.role);
    });

  return {
    totalUsers: uniqueUsers.size,
    totalConnections,
    byRole,
    sampledAt: new Date().toISOString(),
  };
}
