import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { Role, VerificationStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';
import { generateToken } from '../middleware/auth';

type SessionUser = {
  id: number;
  role: Role;
  username?: string | null;
  verificationStatus?: VerificationStatus | null;
};

const SELF_SERVICE_PUBLIC_ROLES = new Set<Role>([Role.PARENT, Role.CALON_SISWA, Role.UMUM]);
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_ABSOLUTE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;
const MIN_ACCESS_TOKEN_TTL_SECONDS = 60 * 5;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const MIN_REFRESH_TOKEN_TTL_SECONDS = 60 * 60;
const MAX_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const MIN_ABSOLUTE_SESSION_TTL_SECONDS = 60 * 60 * 24;
const MAX_ABSOLUTE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const LEGACY_ACCESS_TOKEN_RESTORE_GRACE_SECONDS = 60 * 60 * 48;
const MAX_CLIENT_PLATFORM_LENGTH = 32;
const MAX_USER_AGENT_LENGTH = 255;
const MAX_IP_ADDRESS_LENGTH = 128;

type IssuedAuthSession = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  absoluteExpiresAt: Date;
};

function parsePositiveInt(raw: unknown, fallbackValue: number): number {
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getAccessTokenTtlSeconds(): number {
  return clamp(
    parsePositiveInt(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS, DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
    MIN_ACCESS_TOKEN_TTL_SECONDS,
    MAX_ACCESS_TOKEN_TTL_SECONDS,
  );
}

function getRefreshTokenTtlSeconds(): number {
  return clamp(
    parsePositiveInt(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS, DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
    MIN_REFRESH_TOKEN_TTL_SECONDS,
    MAX_REFRESH_TOKEN_TTL_SECONDS,
  );
}

function getAbsoluteSessionTtlSeconds(): number {
  const refreshTtlSeconds = getRefreshTokenTtlSeconds();
  return clamp(
    parsePositiveInt(process.env.AUTH_SESSION_ABSOLUTE_TTL_SECONDS, DEFAULT_ABSOLUTE_SESSION_TTL_SECONDS),
    Math.max(MIN_ABSOLUTE_SESSION_TTL_SECONDS, refreshTtlSeconds),
    MAX_ABSOLUTE_SESSION_TTL_SECONDS,
  );
}

function getFirstHeaderValue(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.length > 0) || '';
}

function resolveRequestIp(request: Request): string | null {
  const forwardedFor = getFirstHeaderValue(request.headers['x-forwarded-for']);
  const rawIp = forwardedFor || String(request.ip || '').trim();
  if (!rawIp) return null;
  return rawIp.slice(0, MAX_IP_ADDRESS_LENGTH);
}

function resolveClientPlatform(request: Request): string | null {
  const normalized = String(request.header('x-client-platform') || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return normalized.slice(0, MAX_CLIENT_PLATFORM_LENGTH);
}

function resolveUserAgent(request: Request): string | null {
  const normalized = String(request.header('user-agent') || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_USER_AGENT_LENGTH);
}

function hashRefreshSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function secureHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  if (leftBuffer.length === 0 || rightBuffer.length === 0) return false;
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildRefreshToken(sessionId: string): { refreshToken: string; refreshTokenHash: string } {
  const secret = crypto.randomBytes(48).toString('base64url');
  return {
    refreshToken: `${sessionId}.${secret}`,
    refreshTokenHash: hashRefreshSecret(secret),
  };
}

function parseRefreshToken(rawToken: string): { sessionId: string; secret: string } {
  const normalized = String(rawToken || '').trim();
  const separatorIndex = normalized.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const sessionId = normalized.slice(0, separatorIndex).trim();
  const secret = normalized.slice(separatorIndex + 1).trim();
  if (!sessionId || !secret) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  return { sessionId, secret };
}

function ensureUserCanUseSession(user: SessionUser | null | undefined) {
  if (!user) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  if (
    user.verificationStatus &&
    user.verificationStatus !== VerificationStatus.VERIFIED &&
    !SELF_SERVICE_PUBLIC_ROLES.has(user.role)
  ) {
    throw new ApiError(403, 'Akun belum diverifikasi oleh admin');
  }
}

function buildRefreshExpiry(now: Date, absoluteExpiresAt: Date): Date {
  const target = new Date(now.getTime() + getRefreshTokenTtlSeconds() * 1000);
  if (target.getTime() > absoluteExpiresAt.getTime()) {
    return absoluteExpiresAt;
  }
  return target;
}

function issueAccessToken(user: SessionUser, options?: { isDemo?: boolean; sessionId?: string | null }) {
  return generateToken({
    id: user.id,
    role: user.role,
    isDemo: Boolean(options?.isDemo),
    sessionId: options?.sessionId || undefined,
  });
}

function decodeAccessTokenIgnoringExpiration(accessToken: string): {
  id?: number;
  role?: Role | string;
  isDemo?: boolean;
  sessionId?: string;
  tokenType?: string;
  exp?: number;
} {
  try {
    return jwt.verify(accessToken, process.env.JWT_SECRET || 'secret', {
      ignoreExpiration: true,
    }) as {
      id?: number;
      role?: Role | string;
      isDemo?: boolean;
      sessionId?: string;
      tokenType?: string;
      exp?: number;
    };
  } catch {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }
}

export async function issueAuthSession(params: {
  request: Request;
  user: SessionUser;
  isDemo?: boolean;
}): Promise<IssuedAuthSession> {
  ensureUserCanUseSession(params.user);

  const now = new Date();
  const sessionId = crypto.randomUUID();
  const absoluteExpiresAt = new Date(now.getTime() + getAbsoluteSessionTtlSeconds() * 1000);
  const refreshTokenExpiresAt = buildRefreshExpiry(now, absoluteExpiresAt);
  const { refreshToken, refreshTokenHash } = buildRefreshToken(sessionId);

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: params.user.id,
      refreshTokenHash,
      refreshTokenExpiresAt,
      absoluteExpiresAt,
      lastSeenAt: now,
      clientPlatform: resolveClientPlatform(params.request),
      userAgent: resolveUserAgent(params.request),
      ipAddress: resolveRequestIp(params.request),
    },
  });

  return {
    sessionId,
    accessToken: issueAccessToken(params.user, { isDemo: params.isDemo, sessionId }),
    refreshToken,
    refreshTokenExpiresAt,
    absoluteExpiresAt,
  };
}

export async function rotateAuthSession(params: {
  request: Request;
  refreshToken: string;
}): Promise<IssuedAuthSession & { user: SessionUser }> {
  const parsedToken = parseRefreshToken(params.refreshToken);
  const now = new Date();
  const session = await prisma.authSession.findUnique({
    where: { id: parsedToken.sessionId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          username: true,
          verificationStatus: true,
        },
      },
    },
  });

  if (!session) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const user = session.user;
  ensureUserCanUseSession(user);

  if (session.revokedAt) {
    throw new ApiError(401, 'Sesi login sudah diakhiri.');
  }

  if (
    session.absoluteExpiresAt.getTime() <= now.getTime() ||
    session.refreshTokenExpiresAt.getTime() <= now.getTime()
  ) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        revokedAt: session.revokedAt || now,
        revokeReason: session.revokeReason || 'expired',
      },
    });
    throw new ApiError(401, 'Sesi login sudah berakhir.');
  }

  const incomingHash = hashRefreshSecret(parsedToken.secret);
  if (!secureHashEquals(incomingHash, session.refreshTokenHash)) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  // Jangan rotasi refresh token per refresh agar sesi mobile tidak mudah rusak
  // saat request refresh dobel / retry jaringan datang berdekatan.
  const refreshToken = String(params.refreshToken || '').trim();
  const refreshTokenExpiresAt = buildRefreshExpiry(now, session.absoluteExpiresAt);

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshTokenExpiresAt,
      lastSeenAt: now,
      clientPlatform: resolveClientPlatform(params.request),
      userAgent: resolveUserAgent(params.request),
      ipAddress: resolveRequestIp(params.request),
      revokedAt: null,
      revokeReason: null,
    },
  });

  return {
    sessionId: session.id,
    accessToken: issueAccessToken(user, { sessionId: session.id }),
    refreshToken,
    refreshTokenExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    user,
  };
}

export async function restoreAuthSessionFromLegacyAccessToken(params: {
  request: Request;
  accessToken: string;
}): Promise<IssuedAuthSession & { user: SessionUser }> {
  const normalizedAccessToken = String(params.accessToken || '').trim();
  if (!normalizedAccessToken) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const decoded = decodeAccessTokenIgnoringExpiration(normalizedAccessToken);
  if (String(decoded.tokenType || '').trim() === 'exam-browser-session') {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const legacySessionId = String(decoded.sessionId || '').trim();
  if (legacySessionId) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const userId = Number(decoded.id || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const expSeconds = Number(decoded.exp || 0);
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const now = Date.now();
  const expiryMs = expSeconds * 1000;
  if (expiryMs + LEGACY_ACCESS_TOKEN_RESTORE_GRACE_SECONDS * 1000 <= now) {
    throw new ApiError(401, 'Sesi login sudah berakhir.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      username: true,
      verificationStatus: true,
    },
  });
  ensureUserCanUseSession(user);
  if (!user) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  const restoredSession = await issueAuthSession({
    request: params.request,
    user,
    isDemo: Boolean(decoded.isDemo),
  });

  return {
    ...restoredSession,
    user,
  };
}

export async function revokeAuthSessionById(sessionId: string | null | undefined, reason = 'manual_logout') {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return;

  await prisma.authSession.updateMany({
    where: {
      id: normalizedSessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokeReason: reason,
    },
  });
}

export async function revokeAuthSessionByRefreshToken(refreshToken: string | null | undefined, reason = 'manual_logout') {
  const normalizedToken = String(refreshToken || '').trim();
  if (!normalizedToken) return;

  try {
    const parsedToken = parseRefreshToken(normalizedToken);
    await revokeAuthSessionById(parsedToken.sessionId, reason);
  } catch {
    // Ignore malformed refresh tokens during logout.
  }
}

export async function revokeAllAuthSessionsForUser(userId: number, reason = 'user_password_reset') {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) return;

  await prisma.authSession.updateMany({
    where: {
      userId: normalizedUserId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokeReason: reason,
    },
  });
}

export async function getActiveAuthSessionForRequest(params: {
  sessionId?: string | null;
  userId: number;
}) {
  const normalizedSessionId = String(params.sessionId || '').trim();
  const normalizedUserId = Number(params.userId || 0);
  if (!normalizedSessionId || !Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
    return null;
  }

  const session = await prisma.authSession.findFirst({
    where: {
      id: normalizedSessionId,
      userId: normalizedUserId,
      revokedAt: null,
      absoluteExpiresAt: {
        gt: new Date(),
      },
    },
  });

  return session;
}

export async function markAuthSessionWebmailAuthenticated(params: {
  sessionId?: string | null;
  userId: number;
  mailboxIdentity: string;
  mode: string;
}) {
  const session = await getActiveAuthSessionForRequest({
    sessionId: params.sessionId,
    userId: params.userId,
  });
  if (!session) return;

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      webmailAuthenticatedAt: new Date(),
      webmailMailboxIdentity: String(params.mailboxIdentity || '').trim().toLowerCase() || null,
      webmailMode: String(params.mode || '').trim().toUpperCase() || null,
    },
  });
}

export async function clearAuthSessionWebmailAuthentication(params: {
  sessionId?: string | null;
  userId: number;
}) {
  const session = await getActiveAuthSessionForRequest({
    sessionId: params.sessionId,
    userId: params.userId,
  });
  if (!session) return;

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      webmailAuthenticatedAt: null,
      webmailMailboxIdentity: null,
      webmailMode: null,
    },
  });
}

export async function hasAuthenticatedWebmailOnAuthSession(params: {
  sessionId?: string | null;
  userId: number;
  mailboxIdentity: string | null;
}) {
  const normalizedMailboxIdentity = String(params.mailboxIdentity || '').trim().toLowerCase();
  if (!normalizedMailboxIdentity) return false;

  const session = await getActiveAuthSessionForRequest({
    sessionId: params.sessionId,
    userId: params.userId,
  });
  if (!session) return false;

  return String(session.webmailMailboxIdentity || '').trim().toLowerCase() === normalizedMailboxIdentity;
}
