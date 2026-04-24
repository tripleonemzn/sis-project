import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';
import { ApiError } from './api';

export type DailyPresenceCheckpoint = 'CHECK_IN' | 'CHECK_OUT';

export type ActiveDailyPresenceSelfScanSession = {
  sessionId: string;
  checkpoint: DailyPresenceCheckpoint;
  gateLabel: string | null;
  actorId: number;
  actorName: string;
  academicYearId: number;
  dateKey: string;
  createdAt: number;
  expiresAt: number;
  challengeSecret: string;
};

type DailyPresenceSelfScanQrTokenPayload = {
  tokenType: 'daily-presence-self-scan';
  sessionId: string;
  checkpoint: DailyPresenceCheckpoint;
  studentId: number;
  classId: number;
  academicYearId: number;
  dateKey: string;
};

const ACTIVE_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const QR_TOKEN_TTL_SECONDS = 12;
const CHALLENGE_WINDOW_SECONDS = 30;
const CHALLENGE_ALLOWED_DRIFT_WINDOWS = 1;
const CONSUMED_QR_TOKEN_CACHE_TTL_MS = 2 * 60 * 1000;
const JWT_SIGNING_SECRET = process.env.JWT_SECRET || 'secret';
const RUNTIME_ROOT = path.resolve(process.cwd(), '.runtime', 'daily-presence-self-scan');
const ACTIVE_SESSION_DIR = path.join(RUNTIME_ROOT, 'sessions');
const CONSUMED_QR_TOKEN_DIR = path.join(RUNTIME_ROOT, 'consumed');

export const DAILY_PRESENCE_SELF_SCAN_QR_TOKEN_TTL_SECONDS = QR_TOKEN_TTL_SECONDS;
export const DAILY_PRESENCE_SELF_SCAN_CHALLENGE_WINDOW_SECONDS = CHALLENGE_WINDOW_SECONDS;

function normalizeCheckpoint(value: unknown): DailyPresenceCheckpoint {
  return value === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN';
}

function normalizeGateLabel(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized.slice(0, 100) : null;
}

function getActiveSessionFilePath(checkpoint: DailyPresenceCheckpoint) {
  return path.join(ACTIVE_SESSION_DIR, `${normalizeCheckpoint(checkpoint)}.json`);
}

function getConsumedQrTokenFilePath(rawToken: string) {
  const tokenHash = createHash('sha256').update(String(rawToken || '')).digest('hex');
  return {
    tokenHash,
    filePath: path.join(CONSUMED_QR_TOKEN_DIR, `${tokenHash}.json`),
  };
}

function createSessionId() {
  return randomBytes(12).toString('hex');
}

function createChallengeSecret() {
  return randomBytes(18).toString('base64url');
}

async function ensureDirectoryExists(targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

async function atomicWriteJson(filePath: string, payload: unknown) {
  await ensureDirectoryExists(path.dirname(filePath));
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tempFilePath, filePath);
}

function parseActiveSession(rawValue: unknown): ActiveDailyPresenceSelfScanSession | null {
  if (!rawValue || typeof rawValue !== 'object') return null;
  const candidate = rawValue as Partial<ActiveDailyPresenceSelfScanSession>;
  const checkpoint = normalizeCheckpoint(candidate.checkpoint);
  const sessionId = String(candidate.sessionId || '').trim();
  const dateKey = String(candidate.dateKey || '').trim();
  const challengeSecret = String(candidate.challengeSecret || '').trim();
  const actorName = String(candidate.actorName || '').trim() || 'Petugas';
  const actorId = Number(candidate.actorId || 0);
  const academicYearId = Number(candidate.academicYearId || 0);
  const createdAt = Number(candidate.createdAt || 0);
  const expiresAt = Number(candidate.expiresAt || 0);

  if (!sessionId || !dateKey || !challengeSecret) return null;
  if (!Number.isFinite(actorId) || actorId <= 0) return null;
  if (!Number.isFinite(academicYearId) || academicYearId <= 0) return null;
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;

  return {
    sessionId,
    checkpoint,
    gateLabel: normalizeGateLabel(candidate.gateLabel),
    actorId,
    actorName,
    academicYearId,
    dateKey,
    createdAt,
    expiresAt,
    challengeSecret,
  };
}

async function readActiveSession(checkpoint: DailyPresenceCheckpoint, now = Date.now()) {
  const filePath = getActiveSessionFilePath(checkpoint);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseActiveSession(JSON.parse(raw));
    if (!parsed || parsed.expiresAt <= now) {
      await safeUnlink(filePath);
      return null;
    }
    return parsed;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ENOENT') return null;
    throw error;
  }
}

async function cleanupConsumedQrTokens(now = Date.now()) {
  try {
    const entries = await fs.readdir(CONSUMED_QR_TOKEN_DIR, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !entry.name.endsWith('.json')) return;
        const filePath = path.join(CONSUMED_QR_TOKEN_DIR, entry.name);
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          const expiresAt = Number((JSON.parse(raw) as { expiresAt?: unknown })?.expiresAt || 0);
          if (!Number.isFinite(expiresAt) || expiresAt <= now) {
            await safeUnlink(filePath);
          }
        } catch {
          await safeUnlink(filePath);
        }
      }),
    );
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

export function getChallengeWindowIndex(date = new Date()) {
  return Math.floor(date.getTime() / (CHALLENGE_WINDOW_SECONDS * 1000));
}

export function getChallengeWindowExpiresAt(date = new Date()) {
  const currentWindow = getChallengeWindowIndex(date);
  return new Date((currentWindow + 1) * CHALLENGE_WINDOW_SECONDS * 1000);
}

export function buildDailyPresenceChallengeCode(secret: string, windowIndex: number) {
  const input = `${secret}:${windowIndex}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) % 1000000;
  return String(normalized).padStart(6, '0');
}

export function verifyDailyPresenceChallengeCode(
  session: ActiveDailyPresenceSelfScanSession,
  challengeCode: string,
  now = new Date(),
) {
  const normalizedChallenge = String(challengeCode || '').replace(/\D+/g, '');
  if (normalizedChallenge.length !== 6) return false;

  const currentWindow = getChallengeWindowIndex(now);
  for (let offset = 0; offset <= CHALLENGE_ALLOWED_DRIFT_WINDOWS; offset += 1) {
    const candidate = buildDailyPresenceChallengeCode(session.challengeSecret, currentWindow - offset);
    if (candidate === normalizedChallenge) {
      return true;
    }
  }

  return false;
}

export async function createActiveDailyPresenceSelfScanSession(params: {
  checkpoint: DailyPresenceCheckpoint;
  gateLabel?: string | null;
  actorId: number;
  actorName: string;
  academicYearId: number;
  dateKey: string;
}) {
  const now = Date.now();
  const checkpoint = normalizeCheckpoint(params.checkpoint);
  const session: ActiveDailyPresenceSelfScanSession = {
    sessionId: createSessionId(),
    checkpoint,
    gateLabel: normalizeGateLabel(params.gateLabel),
    actorId: Number(params.actorId),
    actorName: String(params.actorName || '').trim() || 'Petugas',
    academicYearId: Number(params.academicYearId),
    dateKey: String(params.dateKey || '').trim(),
    createdAt: now,
    expiresAt: now + ACTIVE_SESSION_TTL_MS,
    challengeSecret: createChallengeSecret(),
  };

  await atomicWriteJson(getActiveSessionFilePath(checkpoint), session);
  return session;
}

export async function getActiveDailyPresenceSelfScanSession(checkpoint: DailyPresenceCheckpoint) {
  return readActiveSession(checkpoint);
}

export async function closeActiveDailyPresenceSelfScanSession(checkpoint: DailyPresenceCheckpoint) {
  await safeUnlink(getActiveSessionFilePath(checkpoint));
}

export function buildDailyPresenceSelfScanQrToken(params: {
  session: ActiveDailyPresenceSelfScanSession;
  studentId: number;
  classId: number;
}) {
  const payload: DailyPresenceSelfScanQrTokenPayload = {
    tokenType: 'daily-presence-self-scan',
    sessionId: params.session.sessionId,
    checkpoint: params.session.checkpoint,
    studentId: Number(params.studentId),
    classId: Number(params.classId),
    academicYearId: Number(params.session.academicYearId),
    dateKey: params.session.dateKey,
  };

  return jwt.sign(payload, JWT_SIGNING_SECRET, {
    algorithm: 'HS256',
    expiresIn: QR_TOKEN_TTL_SECONDS,
  });
}

export function verifyDailyPresenceSelfScanQrToken(token: string): DailyPresenceSelfScanQrTokenPayload {
  try {
    const decoded = jwt.verify(String(token || '').trim(), JWT_SIGNING_SECRET) as DailyPresenceSelfScanQrTokenPayload;
    if (decoded?.tokenType !== 'daily-presence-self-scan') {
      throw new ApiError(400, 'Format QR presensi tidak valid.');
    }
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'QR presensi sudah tidak berlaku atau formatnya tidak valid.');
  }
}

export async function consumeDailyPresenceSelfScanQrToken(rawToken: string) {
  await cleanupConsumedQrTokens();
  const now = Date.now();
  const { tokenHash, filePath } = getConsumedQrTokenFilePath(rawToken);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const expiresAt = Number((JSON.parse(raw) as { expiresAt?: unknown })?.expiresAt || 0);
    if (Number.isFinite(expiresAt) && expiresAt > now) {
      return false;
    }
    await safeUnlink(filePath);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  await ensureDirectoryExists(CONSUMED_QR_TOKEN_DIR);
  try {
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          tokenHash,
          expiresAt: now + CONSUMED_QR_TOKEN_CACHE_TTL_MS,
        },
        null,
        2,
      ),
      {
        encoding: 'utf8',
        flag: 'wx',
      },
    );
    return true;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

export function buildDailyPresenceSelfScanSessionManagerPayload(
  session: ActiveDailyPresenceSelfScanSession,
  now = new Date(),
) {
  const challengeWindowExpiresAt = getChallengeWindowExpiresAt(now);
  const challengeCode = buildDailyPresenceChallengeCode(session.challengeSecret, getChallengeWindowIndex(now));
  return {
    sessionId: session.sessionId,
    checkpoint: session.checkpoint,
    gateLabel: session.gateLabel,
    actor: {
      id: session.actorId,
      name: session.actorName,
    },
    date: session.dateKey,
    challengeSecret: session.challengeSecret,
    challengeCode,
    challengeWindowSeconds: CHALLENGE_WINDOW_SECONDS,
    challengeWindowExpiresAt: challengeWindowExpiresAt.toISOString(),
    sessionExpiresAt: new Date(session.expiresAt).toISOString(),
  };
}

export function buildDailyPresenceSelfScanSessionPublicPayload(
  session: ActiveDailyPresenceSelfScanSession,
  now = new Date(),
) {
  const challengeWindowExpiresAt = getChallengeWindowExpiresAt(now);
  return {
    sessionId: session.sessionId,
    checkpoint: session.checkpoint,
    gateLabel: session.gateLabel,
    date: session.dateKey,
    challengeWindowSeconds: CHALLENGE_WINDOW_SECONDS,
    challengeWindowExpiresAt: challengeWindowExpiresAt.toISOString(),
    sessionExpiresAt: new Date(session.expiresAt).toISOString(),
  };
}
