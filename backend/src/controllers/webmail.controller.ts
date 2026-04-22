import { randomInt, randomUUID } from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { writeAuditLog } from '../utils/auditLog';
import {
  deleteWebmailMessage,
  getWebmailMessageDetail,
  isWebmailMailboxAvailable,
  listWebmailMessages,
  markWebmailMessageAsRead,
  markWebmailMessageAsUnread,
  MailboxMessageNotFoundError,
  MailboxUnavailableError,
  moveWebmailMessage,
  normalizeWebmailFolderKey,
  sendWebmailMessage,
  validateWebmailMailboxPassword,
  type WebmailFolderKey,
  type WebmailMailboxFolderKey,
} from '../services/webmailMailbox.service';
import {
  clearAuthSessionWebmailAuthentication,
  hasAuthenticatedWebmailOnAuthSession,
  markAuthSessionWebmailAuthenticated,
} from '../services/authSession.service';

type WebmailMode = 'BRIDGE' | 'SSO';
type WebmailMailboxIdentitySource = 'stored' | 'legacy' | 'none';

const DEFAULT_WEBMAIL_URL = 'https://mail.siskgb2.id/';
const DEFAULT_WEBMAIL_DOMAIN = 'siskgb2.id';
const DEFAULT_SSO_AUDIENCE = 'siskgb2-webmail';
const DEFAULT_SSO_ISSUER = 'sis-kgb2-app';
const DEFAULT_SSO_TOKEN_PARAM = 'sso_token';
const DEFAULT_SSO_TTL_SECONDS = 45;
const DEFAULT_MAIL_SESSION_TTL_SECONDS = 60 * 60 * 12;
const MIN_SSO_TTL_SECONDS = 10;
const MAX_SSO_TTL_SECONDS = 300;
const MIN_MAIL_SESSION_TTL_SECONDS = 60 * 15;
const MAX_MAIL_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAILCOW_API_TIMEOUT_MS = 15000;
const MAILBOX_DEFAULT_QUOTA_MB = 5120;
const MIN_WEBMAIL_PASSWORD_LENGTH = 8;
const MAX_WEBMAIL_PASSWORD_LENGTH = 128;
const GENERATED_WEBMAIL_PASSWORD_LENGTH = 18;
const MAILBOX_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,62}$/;
const WEBMAIL_PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const WEBMAIL_PASSWORD_LOWERCASE = 'abcdefghijkmnpqrstuvwxyz';
const WEBMAIL_PASSWORD_NUMBERS = '23456789';
const WEBMAIL_PASSWORD_SYMBOLS = '!@#$%^&*()-_=+';
const WEBMAIL_RESET_AUDIT_ENTITY = 'WEBMAIL_MAILBOX';
const WEBMAIL_SELF_RESET_AUDIT_ACTION = 'SELF_RESET_PASSWORD';
const WEBMAIL_SELF_CHANGE_AUDIT_ACTION = 'SELF_CHANGE_PASSWORD';
const WEBMAIL_SESSION_HEADER = 'x-webmail-session';
const WEBMAIL_SESSION_TYPE = 'webmail-session';
const RESERVED_MAILBOX_LOCAL_PARTS = new Set([
  'admin',
  'administrator',
  'postmaster',
  'abuse',
  'support',
  'helpdesk',
  'noreply',
  'no-reply',
  'info',
  'security',
  'webmaster',
]);

type MailcowApiEntry = {
  type?: string;
  msg?: unknown;
  log?: unknown;
};

type RegisterMailboxBody = {
  username?: unknown;
  verificationUsername?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
};

type LoginMailboxSessionBody = {
  password?: unknown;
};

type ChangeMailboxPasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

type SendWebmailBody = {
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  plainText?: unknown;
  html?: unknown;
  inReplyToMessageId?: unknown;
  references?: unknown;
};

type MoveWebmailBody = {
  sourceFolder?: unknown;
  sourceFolderKey?: unknown;
  targetFolder?: unknown;
  targetFolderKey?: unknown;
};

const resolveFolderLabel = (folderKey: WebmailMailboxFolderKey): string => {
  return folderKey === 'INBOX'
    ? 'Inbox'
    : folderKey === 'Drafts'
      ? 'Draft'
      : folderKey === 'Sent'
        ? 'Terkirim'
        : folderKey === 'Junk'
          ? 'Spam'
          : folderKey === 'Archive'
            ? 'Arsip'
            : 'Sampah';
};

const resolveRequestedFolderKey = (value: unknown): WebmailFolderKey => normalizeWebmailFolderKey(value, 'INBOX');

const WEBMAIL_ALLOWED_ROLES: Role[] = [
  'ADMIN',
  'TEACHER',
  'PRINCIPAL',
  'STAFF',
  'EXTRACURRICULAR_TUTOR',
];

const WEBMAIL_SELF_REGISTER_ROLES: Role[] = [
  'ADMIN',
  'TEACHER',
  'PRINCIPAL',
  'STAFF',
  'EXTRACURRICULAR_TUTOR',
];

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toMaybeString(item))
      .filter((item) => item.length > 0);
  }

  const single = toMaybeString(value);
  if (!single) return [];
  return single
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const toMaybeString = (value: unknown): string => String(value ?? '').trim();

const parseWebmailMode = (): WebmailMode => {
  const raw = String(process.env.WEBMAIL_AUTH_MODE || 'BRIDGE')
    .trim()
    .toUpperCase();
  return raw === 'SSO' ? 'SSO' : 'BRIDGE';
};

const parsePositiveInt = (raw: string | undefined, fallbackValue: number): number => {
  const parsed = Number.parseInt(String(raw || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

type WebmailSessionClaims = {
  sub: string;
  mailbox: string;
  type: string;
  jti: string;
};

const getWebmailSessionSecret = (): string => {
  const configured = toMaybeString(process.env.WEBMAIL_SESSION_SECRET);
  if (configured) return configured;
  const jwtSecret = toMaybeString(process.env.JWT_SECRET);
  if (jwtSecret) return `${jwtSecret}:webmail-session`;
  throw new ApiError(500, 'Konfigurasi WEBMAIL_SESSION_SECRET belum diatur di server');
};

const getWebmailSessionTtlSeconds = (): number => {
  return clamp(
    parsePositiveInt(process.env.WEBMAIL_SESSION_TTL_SECONDS, DEFAULT_MAIL_SESSION_TTL_SECONDS),
    MIN_MAIL_SESSION_TTL_SECONDS,
    MAX_MAIL_SESSION_TTL_SECONDS,
  );
};

const readWebmailSessionToken = (req: AuthRequest): string => {
  const headerValue = req.header(WEBMAIL_SESSION_HEADER);
  return toMaybeString(Array.isArray(headerValue) ? headerValue[0] : headerValue);
};

const signWebmailSessionToken = (userId: number, mailboxIdentity: string) => {
  const expiresInSeconds = getWebmailSessionTtlSeconds();
  const token = jwt.sign(
    {
      sub: String(userId),
      mailbox: mailboxIdentity,
      type: WEBMAIL_SESSION_TYPE,
      jti: randomUUID(),
    },
    getWebmailSessionSecret(),
    {
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
      issuer: DEFAULT_SSO_ISSUER,
      audience: DEFAULT_SSO_AUDIENCE,
    },
  );

  return {
    accessToken: token,
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
};

const parseWebmailSessionToken = (token: string): WebmailSessionClaims | null => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getWebmailSessionSecret(), {
      algorithms: ['HS256'],
      issuer: DEFAULT_SSO_ISSUER,
      audience: DEFAULT_SSO_AUDIENCE,
    });
    if (!payload || typeof payload !== 'object') return null;
    const claims = payload as Partial<WebmailSessionClaims>;
    if (claims.type !== WEBMAIL_SESSION_TYPE) return null;
    return {
      sub: String(claims.sub || ''),
      mailbox: toMaybeString(claims.mailbox).toLowerCase(),
      type: String(claims.type || ''),
      jti: String(claims.jti || ''),
    };
  } catch {
    return null;
  }
};

const getWebmailBaseUrl = (): string => {
  const raw = String(process.env.WEBMAIL_URL || DEFAULT_WEBMAIL_URL).trim();
  return raw || DEFAULT_WEBMAIL_URL;
};

const getWebmailDefaultDomain = (): string => {
  const raw = String(process.env.WEBMAIL_DEFAULT_DOMAIN || DEFAULT_WEBMAIL_DOMAIN)
    .trim()
    .toLowerCase();
  return raw || DEFAULT_WEBMAIL_DOMAIN;
};

const getSsoEntryUrl = (webmailBaseUrl: string): string => {
  const raw = String(process.env.WEBMAIL_SSO_ENTRY_URL || webmailBaseUrl).trim();
  return raw || webmailBaseUrl;
};

const parseMailcowMessage = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => parseMailcowMessage(item))
      .filter((item) => item.length > 0)
      .join(' ')
      .trim();
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => parseMailcowMessage(item))
      .filter((item) => item.length > 0)
      .join(' ')
      .trim();
  }
  return String(value);
};

const resolveMailcowAddMailboxEndpoint = (): string => {
  const configuredBase = toMaybeString(process.env.MAILCOW_API_BASE_URL || process.env.WEBMAIL_URL);
  if (!configuredBase) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_BASE_URL belum diatur di server');
  }
  const normalizedBase = /^https?:\/\//i.test(configuredBase) ? configuredBase : `https://${configuredBase}`;
  return new URL('/api/v1/add/mailbox', normalizedBase).toString();
};

const resolveMailcowEditMailboxEndpoint = (): string => {
  const configuredBase = toMaybeString(process.env.MAILCOW_API_BASE_URL || process.env.WEBMAIL_URL);
  if (!configuredBase) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_BASE_URL belum diatur di server');
  }
  const normalizedBase = /^https?:\/\//i.test(configuredBase) ? configuredBase : `https://${configuredBase}`;
  return new URL('/api/v1/edit/mailbox', normalizedBase).toString();
};

const isMailboxUsernameValid = (value: string): boolean => MAILBOX_USERNAME_PATTERN.test(value);

const isMailboxUsernameReserved = (value: string): boolean => RESERVED_MAILBOX_LOCAL_PARTS.has(value);

const resolveStoredMailboxIdentity = (user: { webmailMailboxIdentity?: string | null }): string | null => {
  const storedMailbox = String(user.webmailMailboxIdentity || '').trim().toLowerCase();
  if (storedMailbox && isValidEmail(storedMailbox)) return storedMailbox;
  return null;
};

const resolveLegacyMailboxIdentity = (user: { username: string; email: string | null }): string | null => {
  const forcedMailbox = String(process.env.WEBMAIL_FORCE_MAILBOX || '').trim().toLowerCase();
  if (forcedMailbox && isValidEmail(forcedMailbox)) return forcedMailbox;

  const preferredEmail = String(user.email || '').trim().toLowerCase();
  if (preferredEmail && isValidEmail(preferredEmail)) return preferredEmail;

  const username = String(user.username || '').trim().toLowerCase();
  if (username && isValidEmail(username)) return username;

  const defaultDomain = getWebmailDefaultDomain();
  if (!defaultDomain || !username) return null;

  const inferred = `${username}@${defaultDomain}`;
  if (!isValidEmail(inferred)) return null;
  return inferred;
};

const resolveMailboxIdentity = (
  user: { username: string; email: string | null; webmailMailboxIdentity?: string | null },
): string | null => {
  return resolveStoredMailboxIdentity(user) || resolveLegacyMailboxIdentity(user);
};

const resolveMailboxIdentityDescriptor = (
  user: { username: string; email: string | null; webmailMailboxIdentity?: string | null },
): {
  mailboxIdentity: string | null;
  mailboxIdentitySource: WebmailMailboxIdentitySource;
} => {
  const storedMailboxIdentity = resolveStoredMailboxIdentity(user);
  if (storedMailboxIdentity) {
    return {
      mailboxIdentity: storedMailboxIdentity,
      mailboxIdentitySource: 'stored',
    };
  }

  const legacyMailboxIdentity = resolveLegacyMailboxIdentity(user);
  if (legacyMailboxIdentity) {
    return {
      mailboxIdentity: legacyMailboxIdentity,
      mailboxIdentitySource: 'legacy',
    };
  }

  return {
    mailboxIdentity: null,
    mailboxIdentitySource: 'none',
  };
};

const createRandomString = (length: number, charset: string): string => {
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += charset[randomInt(0, charset.length)];
  }
  return output;
};

const shuffleString = (value: string): string => {
  const chars = value.split('');
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join('');
};

const generateWebmailPassword = (length = GENERATED_WEBMAIL_PASSWORD_LENGTH): string => {
  const minimumLength = Math.max(length, 14);
  const allChars =
    WEBMAIL_PASSWORD_UPPERCASE +
    WEBMAIL_PASSWORD_LOWERCASE +
    WEBMAIL_PASSWORD_NUMBERS +
    WEBMAIL_PASSWORD_SYMBOLS;
  const seeded =
    createRandomString(1, WEBMAIL_PASSWORD_UPPERCASE) +
    createRandomString(1, WEBMAIL_PASSWORD_LOWERCASE) +
    createRandomString(1, WEBMAIL_PASSWORD_NUMBERS) +
    createRandomString(1, WEBMAIL_PASSWORD_SYMBOLS);
  const remaining = createRandomString(minimumLength - seeded.length, allChars);
  return shuffleString(seeded + remaining);
};

const ensureWebmailAccess = async (req: AuthRequest) => {
  const authUser = req.user;

  if (!authUser?.id || !authUser?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const normalizedRole = String(authUser.role).trim().toUpperCase() as Role;
  if (!WEBMAIL_ALLOWED_ROLES.includes(normalizedRole)) {
    throw new ApiError(403, 'Role Anda tidak memiliki akses webmail');
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      webmailMailboxIdentity: true,
      role: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  return user;
};

const hasAuthenticatedMailboxSession = async (
  req: AuthRequest,
  userId: number,
  mailboxIdentity: string | null,
): Promise<boolean> => {
  if (!mailboxIdentity) return false;
  const claims = parseWebmailSessionToken(readWebmailSessionToken(req));
  if (claims) {
    return claims.sub === String(userId) && claims.mailbox === String(mailboxIdentity || '').trim().toLowerCase();
  }

  return hasAuthenticatedWebmailOnAuthSession({
    sessionId: req.user?.sessionId,
    userId,
    mailboxIdentity,
  });
};

const ensureAuthenticatedMailboxSession = async (
  req: AuthRequest,
  userId: number,
  mailboxIdentity: string | null,
) => {
  if (!(await hasAuthenticatedMailboxSession(req, userId, mailboxIdentity))) {
    throw new ApiError(428, 'Silakan masuk ke mailbox sekolah terlebih dahulu');
  }
};

export const getWebmailConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mode = parseWebmailMode();
  const webmailUrl = getWebmailBaseUrl();
  const defaultDomain = getWebmailDefaultDomain();
  const ssoEntryUrl = getSsoEntryUrl(webmailUrl);
  const ssoSecret = String(process.env.WEBMAIL_SSO_SHARED_SECRET || '').trim();
  const { mailboxIdentity, mailboxIdentitySource } = resolveMailboxIdentityDescriptor(user);
  const mailboxAvailable = mailboxIdentity ? await isWebmailMailboxAvailable(mailboxIdentity) : false;
  const mailSessionAuthenticated = await hasAuthenticatedMailboxSession(req, user.id, mailboxIdentity);
  const ssoEnabled = mode === 'SSO' && Boolean(ssoSecret);
  const selfRegistrationEnabled = mode === 'BRIDGE' && WEBMAIL_SELF_REGISTER_ROLES.includes(user.role);
  const tokenTtlSeconds = clamp(
    parsePositiveInt(process.env.WEBMAIL_SSO_TOKEN_TTL_SECONDS, DEFAULT_SSO_TTL_SECONDS),
    MIN_SSO_TTL_SECONDS,
    MAX_SSO_TTL_SECONDS,
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        mode,
        webmailUrl,
        defaultDomain,
        ssoEnabled,
        ssoEntryUrl: ssoEnabled ? ssoEntryUrl : null,
        tokenTtlSeconds,
        mailboxIdentity,
        mailboxIdentitySource,
        mailboxAvailable,
        mailSessionAuthenticated,
        selfRegistrationEnabled,
        mailboxQuotaMb: MAILBOX_DEFAULT_QUOTA_MB,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
      'Konfigurasi webmail berhasil diambil',
    ),
  );
});

export const registerWebmailMailbox = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);

  if (!WEBMAIL_SELF_REGISTER_ROLES.includes(user.role)) {
    throw new ApiError(403, 'Role Anda tidak diizinkan menggunakan fitur daftar webmail mandiri');
  }

  const body = (req.body || {}) as RegisterMailboxBody;
  const requestedMailboxUsername = toMaybeString(body.username ?? body.verificationUsername).toLowerCase();
  const password = String(body.password ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');

  if (!requestedMailboxUsername) {
    throw new ApiError(400, 'Username email wajib diisi');
  }

  if (!isMailboxUsernameValid(requestedMailboxUsername)) {
    throw new ApiError(400, 'Username email hanya boleh huruf kecil, angka, titik, underscore, atau dash (3-63 karakter)');
  }
  const defaultDomain = getWebmailDefaultDomain();
  const mailboxIdentity = `${requestedMailboxUsername}@${defaultDomain}`;

  if (isMailboxUsernameReserved(requestedMailboxUsername)) {
    throw new ApiError(400, `Username email "${requestedMailboxUsername}" tidak diperbolehkan`);
  }

  const registeredMailboxIdentity = resolveStoredMailboxIdentity(user);
  if (registeredMailboxIdentity) {
    throw new ApiError(409, `Mailbox ${registeredMailboxIdentity} sudah terdaftar untuk akun ini`);
  }

  const legacyMailboxIdentity = resolveLegacyMailboxIdentity(user);
  if (legacyMailboxIdentity) {
    const legacyMailboxExists = await isWebmailMailboxAvailable(legacyMailboxIdentity);
    if (legacyMailboxExists) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          webmailMailboxIdentity: legacyMailboxIdentity,
        },
      });
      throw new ApiError(409, `Mailbox ${legacyMailboxIdentity} sudah terdaftar untuk akun ini`);
    }
  }

  if (!password || !confirmPassword) {
    throw new ApiError(400, 'Password dan konfirmasi password wajib diisi');
  }

  if (password.length < MIN_WEBMAIL_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password minimal ${MIN_WEBMAIL_PASSWORD_LENGTH} karakter`);
  }

  if (password.length > MAX_WEBMAIL_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password maksimal ${MAX_WEBMAIL_PASSWORD_LENGTH} karakter`);
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, 'Konfirmasi password tidak cocok');
  }

  const mailcowApiKey = toMaybeString(process.env.MAILCOW_API_KEY);
  if (!mailcowApiKey) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_KEY belum diatur di server');
  }

  const endpoint = resolveMailcowAddMailboxEndpoint();

  const mailboxPayload = {
    local_part: requestedMailboxUsername,
    domain: defaultDomain,
    name: toMaybeString(user.name) || requestedMailboxUsername,
    password,
    password2: confirmPassword,
    quota: MAILBOX_DEFAULT_QUOTA_MB,
    active: '1',
    force_pw_update: '0',
    tls_enforce_in: '0',
    tls_enforce_out: '0',
  };

  let success = false;
  let detailMessage = '';

  for (const payload of [mailboxPayload, [mailboxPayload]]) {
    const response = await axios.post<MailcowApiEntry[] | MailcowApiEntry>(endpoint, payload, {
      timeout: MAILCOW_API_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': mailcowApiKey,
      },
      validateStatus: () => true,
    });

    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, 'Autentikasi Mailcow API gagal. Periksa API key dan allowlist IP API Mailcow.');
    }

    const payloadEntries = Array.isArray(response.data) ? response.data : [response.data];
    const successEntry = payloadEntries.find((entry) => toMaybeString(entry?.type).toLowerCase() === 'success');
    if (successEntry) {
      success = true;
      break;
    }

    const firstEntry = payloadEntries[0];
    const parsedMessage = parseMailcowMessage(firstEntry?.msg) || parseMailcowMessage(firstEntry);
    detailMessage = parsedMessage || `Mailcow API HTTP ${response.status}`;

    if (response.status >= 400 && response.status < 500) {
      break;
    }

    const normalizedDetail = detailMessage.toLowerCase();
    const shouldRetryPayloadShape =
      normalizedDetail.includes('json') ||
      normalizedDetail.includes('array') ||
      normalizedDetail.includes('object') ||
      normalizedDetail.includes('payload');
    if (!shouldRetryPayloadShape) {
      break;
    }
  }

  if (!success) {
    const normalizedDetail = detailMessage.toLowerCase();
    if (normalizedDetail.includes('exists') || normalizedDetail.includes('already')) {
      throw new ApiError(409, `Username email "${requestedMailboxUsername}" sudah digunakan. Silakan pilih username lain.`);
    }

    throw new ApiError(
      400,
      detailMessage ? `Gagal membuat mailbox webmail: ${detailMessage}` : 'Gagal membuat mailbox webmail di Mailcow',
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      webmailMailboxIdentity: mailboxIdentity,
    },
  });

  await markAuthSessionWebmailAuthenticated({
    sessionId: req.user?.sessionId,
    userId: user.id,
    mailboxIdentity,
    mode: 'BRIDGE',
  });
  const mailSession = signWebmailSessionToken(user.id, mailboxIdentity);

  res.status(201).json(
    new ApiResponse(
      201,
      {
        mailboxIdentity,
        quotaMb: MAILBOX_DEFAULT_QUOTA_MB,
        createdAt: new Date().toISOString(),
        mailSessionAuthenticated: true,
        mailSession,
      },
      'Mailbox webmail berhasil dibuat',
    ),
  );
});

export const loginWebmailMailboxSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);

  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox sekolah yang valid');
  }

  const mailboxAvailable = await isWebmailMailboxAvailable(mailboxIdentity);
  if (!mailboxAvailable) {
    throw new ApiError(404, 'Mailbox sekolah Anda belum tersedia di server');
  }

  const mode = parseWebmailMode();
  if (mode === 'BRIDGE') {
    const body = (req.body || {}) as LoginMailboxSessionBody;
    const password = String(body.password ?? '');
    if (!password) {
      throw new ApiError(400, 'Password mailbox wajib diisi');
    }

    const passwordValid = await validateWebmailMailboxPassword(mailboxIdentity, password);
    if (!passwordValid) {
      throw new ApiError(400, 'Password mailbox salah');
    }
  }

  await markAuthSessionWebmailAuthenticated({
    sessionId: req.user?.sessionId,
    userId: user.id,
    mailboxIdentity,
    mode,
  });
  const mailSession = signWebmailSessionToken(user.id, mailboxIdentity);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        mailboxIdentity,
        mailSessionAuthenticated: true,
        mailSession,
      },
      'Berhasil masuk ke mailbox sekolah',
    ),
  );
});

export const logoutWebmailMailboxSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  await clearAuthSessionWebmailAuthentication({
    sessionId: req.user?.sessionId,
    userId: user.id,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        mailSessionAuthenticated: false,
      },
      'Sesi mailbox sekolah berhasil diakhiri',
    ),
  );
});

export const resetOwnWebmailPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);

  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox sekolah yang valid');
  }

  const mailcowApiKey = toMaybeString(process.env.MAILCOW_API_KEY);
  if (!mailcowApiKey) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_KEY belum diatur di server');
  }

  const nextPassword = generateWebmailPassword();
  const endpoint = resolveMailcowEditMailboxEndpoint();

  const response = await axios.post<MailcowApiEntry[] | MailcowApiEntry>(
    endpoint,
    {
      items: [mailboxIdentity],
      attr: {
        password: nextPassword,
        password2: nextPassword,
      },
    },
    {
      timeout: MAILCOW_API_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': mailcowApiKey,
      },
      validateStatus: () => true,
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(502, 'Autentikasi Mailcow API gagal. Periksa API key dan allowlist IP API Mailcow.');
  }

  if (response.status >= 400) {
    throw new ApiError(502, `Mailcow API mengembalikan HTTP ${response.status}`);
  }

  const payloadEntries = Array.isArray(response.data) ? response.data : [response.data];
  const successEntry = payloadEntries.find((entry) => toMaybeString(entry?.type).toLowerCase() === 'success');

  if (!successEntry) {
    const firstEntry = payloadEntries[0];
    const detailMessage = parseMailcowMessage(firstEntry?.msg) || parseMailcowMessage(firstEntry);
    const normalizedDetail = detailMessage.toLowerCase();

    if (
      normalizedDetail.includes('does not exist') ||
      normalizedDetail.includes('not found') ||
      normalizedDetail.includes('unknown mailbox')
    ) {
      throw new ApiError(404, 'Mailbox sekolah Anda belum tersedia di server');
    }

    throw new ApiError(
      400,
      detailMessage ? `Gagal reset password mailbox: ${detailMessage}` : 'Gagal reset password mailbox di Mailcow',
    );
  }

  const passwordReady = await validateWebmailMailboxPassword(mailboxIdentity, nextPassword);
  if (!passwordReady) {
    throw new ApiError(502, 'Password mailbox gagal diverifikasi setelah reset. Silakan coba lagi.');
  }

  await writeAuditLog(
    user.id,
    String(user.role),
    null,
    WEBMAIL_SELF_RESET_AUDIT_ACTION,
    WEBMAIL_RESET_AUDIT_ENTITY,
    user.id,
    null,
    {
      mailboxIdentity,
      generatedBySystem: true,
      passwordLength: nextPassword.length,
    },
    'Reset password mailbox webmail oleh pemilik akun',
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        mailboxIdentity,
        password: nextPassword,
        generatedBySystem: true,
        resetAt: new Date().toISOString(),
      },
      'Password mailbox berhasil direset',
    ),
  );
});

export const changeOwnWebmailPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);

  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox sekolah yang valid');
  }

  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const mailboxAvailable = await isWebmailMailboxAvailable(mailboxIdentity);
  if (!mailboxAvailable) {
    throw new ApiError(404, 'Mailbox sekolah Anda belum tersedia di server');
  }

  const body = (req.body || {}) as ChangeMailboxPasswordBody;
  const currentPassword = String(body.currentPassword ?? '');
  const nextPassword = String(body.newPassword ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');

  if (!currentPassword || !nextPassword || !confirmPassword) {
    throw new ApiError(400, 'Password lama, password baru, dan konfirmasi password wajib diisi');
  }

  if (nextPassword.length < MIN_WEBMAIL_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password baru minimal ${MIN_WEBMAIL_PASSWORD_LENGTH} karakter`);
  }

  if (nextPassword.length > MAX_WEBMAIL_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password baru maksimal ${MAX_WEBMAIL_PASSWORD_LENGTH} karakter`);
  }

  if (nextPassword !== confirmPassword) {
    throw new ApiError(400, 'Konfirmasi password baru tidak cocok');
  }

  const oldPasswordValid = await validateWebmailMailboxPassword(mailboxIdentity, currentPassword);
  if (!oldPasswordValid) {
    throw new ApiError(400, 'Password lama mailbox salah');
  }

  const mailcowApiKey = toMaybeString(process.env.MAILCOW_API_KEY);
  if (!mailcowApiKey) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_KEY belum diatur di server');
  }

  const endpoint = resolveMailcowEditMailboxEndpoint();
  const response = await axios.post<MailcowApiEntry[] | MailcowApiEntry>(
    endpoint,
    {
      items: [mailboxIdentity],
      attr: {
        password: nextPassword,
        password2: confirmPassword,
      },
    },
    {
      timeout: MAILCOW_API_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': mailcowApiKey,
      },
      validateStatus: () => true,
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(502, 'Autentikasi Mailcow API gagal. Periksa API key dan allowlist IP API Mailcow.');
  }

  if (response.status >= 400) {
    throw new ApiError(502, `Mailcow API mengembalikan HTTP ${response.status}`);
  }

  const payloadEntries = Array.isArray(response.data) ? response.data : [response.data];
  const successEntry = payloadEntries.find((entry) => toMaybeString(entry?.type).toLowerCase() === 'success');

  if (!successEntry) {
    const firstEntry = payloadEntries[0];
    const detailMessage = parseMailcowMessage(firstEntry?.msg) || parseMailcowMessage(firstEntry);
    throw new ApiError(
      400,
      detailMessage ? `Gagal mengganti password mailbox: ${detailMessage}` : 'Gagal mengganti password mailbox di Mailcow',
    );
  }

  const passwordReady = await validateWebmailMailboxPassword(mailboxIdentity, nextPassword);
  if (!passwordReady) {
    throw new ApiError(502, 'Password mailbox gagal diverifikasi setelah diganti. Silakan coba lagi.');
  }

  await writeAuditLog(
    user.id,
    String(user.role),
    null,
    WEBMAIL_SELF_CHANGE_AUDIT_ACTION,
    WEBMAIL_RESET_AUDIT_ENTITY,
    user.id,
    null,
    {
      mailboxIdentity,
      passwordLength: nextPassword.length,
    },
    'Ganti password mailbox webmail oleh pemilik akun',
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        mailboxIdentity,
        changedAt: new Date().toISOString(),
      },
      'Password mailbox berhasil diganti',
    ),
  );
});

export const listWebmailInboxMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const page = clamp(parsePositiveInt(req.query?.page as string | undefined, 1), 1, 9999);
  const limit = clamp(parsePositiveInt(req.query?.limit as string | undefined, 20), 1, 100);
  const folderKey = resolveRequestedFolderKey(req.query?.folder ?? req.query?.folderKey);
  const query = toMaybeString(req.query?.q ?? req.query?.query ?? req.query?.search);
  const inbox = await listWebmailMessages({
    mailboxIdentity,
    page,
    limit,
    folderKey,
    query,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      inbox,
      inbox.mailboxAvailable ? `Folder ${resolveFolderLabel(folderKey)} berhasil diambil` : 'Mailbox belum tersedia di server',
    ),
  );
});

export const getWebmailInboxMessageDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const guid = toMaybeString(req.params?.guid);
  if (!guid) {
    throw new ApiError(400, 'Guid email wajib diisi');
  }
  const folderKey = resolveRequestedFolderKey(req.query?.folder ?? req.query?.folderKey);

  try {
    const detail = await getWebmailMessageDetail({
      mailboxIdentity,
      guid,
      folderKey,
    });

    res.status(200).json(new ApiResponse(200, detail, `Detail email ${resolveFolderLabel(folderKey)} berhasil diambil`));
  } catch (error: unknown) {
    if (error instanceof MailboxUnavailableError) {
      throw new ApiError(404, 'Mailbox belum tersedia di server');
    }
    if (error instanceof MailboxMessageNotFoundError) {
      throw new ApiError(404, error.message || 'Email tidak ditemukan');
    }
    throw error;
  }
});

export const markWebmailInboxMessageRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const guid = toMaybeString(req.params?.guid);
  if (!guid) {
    throw new ApiError(400, 'Guid email wajib diisi');
  }
  const folderKey = resolveRequestedFolderKey(req.query?.folder ?? req.query?.folderKey);

  try {
    const result = await markWebmailMessageAsRead({
      userId: user.id,
      mailboxIdentity,
      guid,
      folderKey,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        result,
        'Email berhasil ditandai sebagai dibaca',
      ),
    );
  } catch (error: unknown) {
    if (error instanceof MailboxUnavailableError) {
      throw new ApiError(404, 'Mailbox belum tersedia di server');
    }
    if (error instanceof MailboxMessageNotFoundError) {
      throw new ApiError(404, error.message || 'Email tidak ditemukan');
    }
    throw error;
  }
});

export const markWebmailInboxMessageUnread = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const guid = toMaybeString(req.params?.guid);
  if (!guid) {
    throw new ApiError(400, 'Guid email wajib diisi');
  }
  const folderKey = resolveRequestedFolderKey(req.query?.folder ?? req.query?.folderKey);

  try {
    const result = await markWebmailMessageAsUnread({
      userId: user.id,
      mailboxIdentity,
      guid,
      folderKey,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        result,
        'Email berhasil ditandai sebagai belum dibaca',
      ),
    );
  } catch (error: unknown) {
    if (error instanceof MailboxUnavailableError) {
      throw new ApiError(404, 'Mailbox belum tersedia di server');
    }
    if (error instanceof MailboxMessageNotFoundError) {
      throw new ApiError(404, error.message || 'Email tidak ditemukan');
    }
    throw error;
  }
});

export const sendWebmailInboxMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const body = (req.body || {}) as SendWebmailBody;
  const toList = toStringList(body.to);
  const ccList = toStringList(body.cc);
  const subject = toMaybeString(body.subject);
  const plainText = String(body.plainText ?? '').trim();
  const html = toMaybeString(body.html) || null;
  const inReplyToMessageId = toMaybeString(body.inReplyToMessageId) || null;
  const references = toStringList(body.references);

  if (toList.length === 0) {
    throw new ApiError(400, 'Penerima email wajib diisi');
  }
  if (toList.some((item) => !isValidEmail(item))) {
    throw new ApiError(400, 'Daftar penerima email tidak valid');
  }
  if (ccList.some((item) => !isValidEmail(item))) {
    throw new ApiError(400, 'Daftar CC email tidak valid');
  }
  if (!plainText) {
    throw new ApiError(400, 'Isi email wajib diisi');
  }

  const result = await sendWebmailMessage({
    mailboxIdentity,
    fromName: user.name,
    to: toList,
    cc: ccList,
    subject,
    plainText,
    html,
    inReplyToMessageId,
    references,
  });

  res.status(201).json(
    new ApiResponse(
      201,
      {
        mailboxIdentity,
        ...result,
      },
      'Email berhasil dikirim',
    ),
  );
});

export const moveWebmailInboxMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const guid = toMaybeString(req.params?.guid);
  if (!guid) {
    throw new ApiError(400, 'Guid email wajib diisi');
  }

  const body = (req.body || {}) as MoveWebmailBody;
  const sourceFolderKey = resolveRequestedFolderKey(body.sourceFolder ?? body.sourceFolderKey ?? req.query?.folder ?? req.query?.folderKey);
  const targetFolderKey = resolveRequestedFolderKey(body.targetFolder ?? body.targetFolderKey ?? 'INBOX');

  if (sourceFolderKey === targetFolderKey) {
    throw new ApiError(400, 'Folder tujuan harus berbeda dari folder asal');
  }

  try {
    const result = await moveWebmailMessage({
      userId: user.id,
      mailboxIdentity,
      guid,
      sourceFolderKey,
      targetFolderKey,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        result,
        `Email berhasil dipindahkan dari ${resolveFolderLabel(sourceFolderKey)} ke ${resolveFolderLabel(targetFolderKey)}`,
      ),
    );
  } catch (error: unknown) {
    if (error instanceof MailboxUnavailableError) {
      throw new ApiError(404, 'Mailbox belum tersedia di server');
    }
    if (error instanceof MailboxMessageNotFoundError) {
      throw new ApiError(404, error.message || 'Email tidak ditemukan');
    }
    throw error;
  }
});

export const deleteWebmailInboxMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const guid = toMaybeString(req.params?.guid);
  if (!guid) {
    throw new ApiError(400, 'Guid email wajib diisi');
  }

  const sourceFolderKey = resolveRequestedFolderKey(req.query?.folder ?? req.query?.folderKey);

  try {
    const result = await deleteWebmailMessage({
      userId: user.id,
      mailboxIdentity,
      guid,
      sourceFolderKey,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        result,
        `Email berhasil dipindahkan dari ${resolveFolderLabel(sourceFolderKey)} ke ${resolveFolderLabel('Trash')}`,
      ),
    );
  } catch (error: unknown) {
    if (error instanceof MailboxUnavailableError) {
      throw new ApiError(404, 'Mailbox belum tersedia di server');
    }
    if (error instanceof MailboxMessageNotFoundError) {
      throw new ApiError(404, error.message || 'Email tidak ditemukan');
    }
    throw error;
  }
});

export const startWebmailSso = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await ensureWebmailAccess(req);
  const mode = parseWebmailMode();
  if (mode !== 'SSO') {
    throw new ApiError(400, 'Mode SSO webmail belum aktif');
  }

  const ssoSecret = String(process.env.WEBMAIL_SSO_SHARED_SECRET || '').trim();
  if (!ssoSecret) {
    throw new ApiError(500, 'Konfigurasi SSO webmail belum lengkap');
  }

  const tokenTtlSeconds = clamp(
    parsePositiveInt(process.env.WEBMAIL_SSO_TOKEN_TTL_SECONDS, DEFAULT_SSO_TTL_SECONDS),
    MIN_SSO_TTL_SECONDS,
    MAX_SSO_TTL_SECONDS,
  );

  const ssoIssuer = String(process.env.WEBMAIL_SSO_ISSUER || DEFAULT_SSO_ISSUER).trim();
  const ssoAudience = String(process.env.WEBMAIL_SSO_AUDIENCE || DEFAULT_SSO_AUDIENCE).trim();
  const tokenParamName =
    String(process.env.WEBMAIL_SSO_TOKEN_PARAM || DEFAULT_SSO_TOKEN_PARAM).trim() ||
    DEFAULT_SSO_TOKEN_PARAM;

  const webmailUrl = getWebmailBaseUrl();
  const ssoEntryUrl = getSsoEntryUrl(webmailUrl);
  const mailboxIdentity = resolveMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'Akun Anda belum memiliki identitas mailbox (email) yang valid');
  }
  await ensureAuthenticatedMailboxSession(req, user.id, mailboxIdentity);

  const token = jwt.sign(
    {
      sub: String(user.id),
      jti: randomUUID(),
      username: user.username,
      mailbox: mailboxIdentity,
      name: user.name,
      email: user.email || '',
      role: user.role,
      type: 'webmail-sso',
    },
    ssoSecret,
    {
      algorithm: 'HS256',
      expiresIn: tokenTtlSeconds,
      issuer: ssoIssuer,
      audience: ssoAudience,
    },
  );

  const launchUrl = new URL(ssoEntryUrl);
  launchUrl.searchParams.set(tokenParamName, token);
  launchUrl.searchParams.set('source', 'sis-web');

  res.status(200).json(
    new ApiResponse(
      200,
      {
        launchUrl: launchUrl.toString(),
        expiresInSeconds: tokenTtlSeconds,
        mailboxIdentity,
      },
      'Token SSO webmail berhasil dibuat',
    ),
  );
});
