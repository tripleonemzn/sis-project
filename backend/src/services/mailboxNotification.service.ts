import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify, TextDecoder } from 'util';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { createInAppNotification } from './mobilePushNotification.service';

const execFileAsync = promisify(execFile);

const DEFAULT_MAILDIR_ROOT = '/mnt/mail_storage/docker-data/volumes/mailcowdockerized_vmail-vol-1/_data';
const DEFAULT_STATE_FILE = path.resolve(process.cwd(), '.runtime', 'mailbox-notification-state.json');
const DEFAULT_DOVECOT_CONTAINER = 'mailcowdockerized-dovecot-mailcow-1';
const DEFAULT_INTERVAL_SECONDS = 30;
const MIN_INTERVAL_SECONDS = 10;
const MAX_INTERVAL_SECONDS = 300;
const PROCESSED_GUID_RETENTION_DAYS = 30;
const MAX_PROCESSED_GUIDS_PER_MAILBOX = 500;
const EMAIL_NOTIFICATION_TYPE = 'EMAIL_RECEIVED';
const EMAIL_ROUTE = '/email';

const WEBMAIL_ALLOWED_ROLES: Role[] = [
  'ADMIN',
  'TEACHER',
  'PRINCIPAL',
  'STAFF',
  'EXTRACURRICULAR_TUTOR',
];

type MailboxWorkerState = {
  version: 1;
  baselineMailboxes: Record<string, string>;
  processedGuids: Record<string, Record<string, string>>;
};

type MailboxDirectoryEntry = {
  mailboxIdentity: string;
  newDirPath: string;
};

type MailboxTarget = MailboxDirectoryEntry & {
  userId: number;
  userName: string;
  userRole: Role;
};

type MailHeaderSummary = {
  guid: string;
  subject: string;
  from: string;
  date: string;
  messageId: string;
};

let workerTimer: NodeJS.Timeout | null = null;
let scanInProgress = false;

function parseBooleanEnv(rawValue: string | undefined, fallbackValue: boolean) {
  if (rawValue == null) return fallbackValue;
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallbackValue;
}

function parseNumberEnv(rawValue: string | undefined, fallbackValue: number, minValue: number, maxValue: number) {
  const parsed = Number.parseInt(String(rawValue || '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallbackValue;
  if (parsed < minValue) return minValue;
  if (parsed > maxValue) return maxValue;
  return parsed;
}

function normalizeMailboxIdentity(value: string) {
  return String(value || '').trim().toLowerCase();
}

function extractGuidFromMaildirFile(fileName: string) {
  const normalized = String(fileName || '').trim();
  if (!normalized) return '';
  const withoutFlags = normalized.split(':')[0] || normalized;
  const withoutMaildirMetadata = withoutFlags.split(',')[0] || withoutFlags;
  return withoutMaildirMetadata.trim();
}

function truncateText(value: string, maxLength: number) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function mapCharsetName(rawCharset: string) {
  const normalized = String(rawCharset || '').trim().toLowerCase();
  if (!normalized) return 'utf-8';
  if (normalized === 'utf8') return 'utf-8';
  if (normalized === 'latin1' || normalized === 'latin-1') return 'iso-8859-1';
  return normalized;
}

function decodeBufferWithCharset(buffer: Buffer, rawCharset: string) {
  const preferredCharsets = [mapCharsetName(rawCharset), 'utf-8', 'iso-8859-1'];
  for (const charset of preferredCharsets) {
    try {
      return new TextDecoder(charset, { fatal: false }).decode(buffer);
    } catch {
      continue;
    }
  }
  return buffer.toString('utf8');
}

function decodeQuotedPrintableWord(value: string) {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (current === '=') {
      const hex = value.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }

    const char = current === '_' ? ' ' : current;
    bytes.push(char.charCodeAt(0));
  }

  return Buffer.from(bytes);
}

function decodeMimeEncodedWord(charset: string, encoding: string, encodedText: string) {
  const normalizedEncoding = String(encoding || '').trim().toUpperCase();
  try {
    if (normalizedEncoding === 'B') {
      return decodeBufferWithCharset(Buffer.from(encodedText, 'base64'), charset);
    }
    if (normalizedEncoding === 'Q') {
      return decodeBufferWithCharset(decodeQuotedPrintableWord(encodedText), charset);
    }
  } catch {
    return encodedText;
  }
  return encodedText;
}

function decodeMimeHeaderValue(value: string) {
  const unfolded = String(value || '')
    .replace(/\r?\n[ \t]+/g, ' ')
    .trim();

  if (!unfolded.includes('=?')) {
    return unfolded;
  }

  const decoded = unfolded.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset, encoding, text) =>
    decodeMimeEncodedWord(charset, encoding, text),
  );

  return decoded.replace(/\s{2,}/g, ' ').trim();
}

function parseSenderLabel(fromHeader: string) {
  const decoded = decodeMimeHeaderValue(fromHeader);
  const angleMatch = decoded.match(/^(?:"?([^"]*?)"?\s*)?<([^>]+)>$/);
  if (angleMatch) {
    const displayName = String(angleMatch[1] || '').trim().replace(/^"|"$/g, '');
    const email = String(angleMatch[2] || '').trim().toLowerCase();
    return displayName || email || decoded;
  }

  const emailMatch = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    return emailMatch[0].trim().toLowerCase();
  }

  return decoded || 'pengirim tidak dikenal';
}

function normalizeSubject(subjectHeader: string) {
  const decoded = decodeMimeHeaderValue(subjectHeader);
  return decoded || '(Tanpa subjek)';
}

function buildEmailNotificationMessage(summary: MailHeaderSummary) {
  const senderLabel = truncateText(parseSenderLabel(summary.from), 80) || 'pengirim tidak dikenal';
  const subject = truncateText(normalizeSubject(summary.subject), 180) || '(Tanpa subjek)';

  return {
    title: `Email baru dari ${senderLabel}`,
    message: subject,
  };
}

function createEmptyState(): MailboxWorkerState {
  return {
    version: 1,
    baselineMailboxes: {},
    processedGuids: {},
  };
}

async function ensureDirectoryExists(targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function loadWorkerState(stateFilePath: string) {
  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MailboxWorkerState>;
    return {
      version: 1,
      baselineMailboxes:
        parsed?.baselineMailboxes && typeof parsed.baselineMailboxes === 'object' ? parsed.baselineMailboxes : {},
      processedGuids:
        parsed?.processedGuids && typeof parsed.processedGuids === 'object' ? parsed.processedGuids : {},
    } satisfies MailboxWorkerState;
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code !== 'ENOENT') {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn(`[MAILBOX_NOTIFICATION] Gagal membaca state worker: ${message}`);
    }
    return createEmptyState();
  }
}

async function saveWorkerState(stateFilePath: string, state: MailboxWorkerState) {
  await ensureDirectoryExists(path.dirname(stateFilePath));
  const tempFilePath = `${stateFilePath}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tempFilePath, stateFilePath);
}

function pruneProcessedGuids(state: MailboxWorkerState) {
  const cutoffTimeMs = Date.now() - PROCESSED_GUID_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  Object.entries(state.processedGuids).forEach(([mailboxIdentity, guidMap]) => {
    const entries = Object.entries(guidMap)
      .map(([guid, timestamp]) => ({
        guid,
        timestamp,
        timeMs: Number.parseInt(String(timestamp || ''), 10),
      }))
      .filter((entry) => Number.isFinite(entry.timeMs) && entry.timeMs >= cutoffTimeMs)
      .sort((left, right) => right.timeMs - left.timeMs)
      .slice(0, MAX_PROCESSED_GUIDS_PER_MAILBOX);

    state.processedGuids[mailboxIdentity] = Object.fromEntries(
      entries.map((entry) => [entry.guid, String(entry.timeMs)]),
    );
  });
}

async function listMailboxDirectories(maildirRoot: string): Promise<MailboxDirectoryEntry[]> {
  const domainEntries = await fs.readdir(maildirRoot, { withFileTypes: true }).catch(() => []);
  const results: MailboxDirectoryEntry[] = [];

  for (const domainEntry of domainEntries) {
    if (!domainEntry.isDirectory() || domainEntry.name.startsWith('.')) continue;

    const domainName = String(domainEntry.name || '').trim().toLowerCase();
    const domainPath = path.join(maildirRoot, domainEntry.name);
    const mailboxEntries = await fs.readdir(domainPath, { withFileTypes: true }).catch(() => []);

    for (const mailboxEntry of mailboxEntries) {
      if (!mailboxEntry.isDirectory() || mailboxEntry.name.startsWith('.')) continue;

      const mailboxLocalPart = String(mailboxEntry.name || '').trim().toLowerCase();
      const newDirPath = path.join(domainPath, mailboxEntry.name, 'Maildir', 'new');
      const stat = await fs.stat(newDirPath).catch(() => null);
      if (!stat?.isDirectory()) continue;

      results.push({
        mailboxIdentity: `${mailboxLocalPart}@${domainName}`,
        newDirPath,
      });
    }
  }

  return results;
}

async function resolveMailboxTargets(maildirRoot: string): Promise<MailboxTarget[]> {
  const mailboxDirectories = await listMailboxDirectories(maildirRoot);
  if (mailboxDirectories.length === 0) return [];

  const mailboxIdentities = mailboxDirectories.map((entry) => entry.mailboxIdentity);
  const users = await prisma.user.findMany({
    where: {
      email: { in: mailboxIdentities },
      role: { in: WEBMAIL_ALLOWED_ROLES },
    },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
    },
  });

  const usersByEmail = new Map(
    users
      .map((user) => [normalizeMailboxIdentity(user.email || ''), user] as const)
      .filter(([email]) => email.length > 0),
  );

  return mailboxDirectories
    .map((entry) => {
      const user = usersByEmail.get(entry.mailboxIdentity);
      if (!user) return null;
      return {
        ...entry,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
      } satisfies MailboxTarget;
    })
    .filter((entry): entry is MailboxTarget => Boolean(entry));
}

async function listNewMessageGuids(newDirPath: string) {
  const files = await fs.readdir(newDirPath, { withFileTypes: true }).catch(() => []);
  return files
    .filter((entry) => entry.isFile())
    .map((entry) => extractGuidFromMaildirFile(entry.name))
    .filter((guid) => guid.length > 0);
}

async function fetchMessageHeadersFromDovecot(containerName: string, mailboxIdentity: string, guid: string) {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'exec',
      containerName,
      'doveadm',
      'fetch',
      '-u',
      mailboxIdentity,
      'guid hdr.message-id hdr.subject hdr.from hdr.date',
      'mailbox',
      'INBOX',
      'guid',
      guid,
    ],
    {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    },
  );

  const headers: MailHeaderSummary = {
    guid: '',
    messageId: '',
    subject: '',
    from: '',
    date: '',
  };

  String(stdout || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) return;

      const rawKey = line.slice(0, separatorIndex).trim().toLowerCase();
      const rawValue = line.slice(separatorIndex + 1).trim();
      if (rawKey === 'guid') headers.guid = rawValue;
      if (rawKey === 'hdr.message-id') headers.messageId = rawValue;
      if (rawKey === 'hdr.subject') headers.subject = rawValue;
      if (rawKey === 'hdr.from') headers.from = rawValue;
      if (rawKey === 'hdr.date') headers.date = rawValue;
    });

  if (!headers.guid && !headers.subject && !headers.from && !headers.messageId && !headers.date) {
    throw new Error(`Header email untuk guid ${guid} tidak ditemukan di mailbox ${mailboxIdentity}`);
  }

  return headers;
}

async function hasEmailNotificationBeenCreated(userId: number, mailboxIdentity: string, guid: string) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: EMAIL_NOTIFICATION_TYPE,
      AND: [
        { data: { path: ['mailboxIdentity'], equals: mailboxIdentity } },
        { data: { path: ['emailGuid'], equals: guid } },
      ],
    },
    select: { id: true },
  });

  return Boolean(existing?.id);
}

async function createEmailNotification(target: MailboxTarget, summary: MailHeaderSummary) {
  const notificationText = buildEmailNotificationMessage(summary);

  await createInAppNotification({
    data: {
      userId: target.userId,
      title: notificationText.title,
      message: notificationText.message,
      type: EMAIL_NOTIFICATION_TYPE,
      data: {
        route: EMAIL_ROUTE,
        mailboxIdentity: target.mailboxIdentity,
        emailGuid: summary.guid,
        emailMessageId: summary.messageId || null,
        emailFrom: decodeMimeHeaderValue(summary.from),
        emailSubject: normalizeSubject(summary.subject),
        emailDate: summary.date || null,
        source: 'webmail-maildir-worker',
      },
    },
  });
}

async function runMailboxNotificationScan(options: {
  maildirRoot: string;
  stateFilePath: string;
  dovecotContainerName: string;
}) {
  const state = await loadWorkerState(options.stateFilePath);
  const targets = await resolveMailboxTargets(options.maildirRoot);
  let notificationsSent = 0;
  let baselineMailboxCount = 0;

  for (const target of targets) {
    const currentGuids = await listNewMessageGuids(target.newDirPath);
    const currentTimestamp = Date.now();

    if (!state.baselineMailboxes[target.mailboxIdentity]) {
      state.baselineMailboxes[target.mailboxIdentity] = String(currentTimestamp);
      state.processedGuids[target.mailboxIdentity] = Object.fromEntries(
        currentGuids.map((guid) => [guid, String(currentTimestamp)]),
      );
      baselineMailboxCount += 1;
      continue;
    }

    const processedGuidMap = state.processedGuids[target.mailboxIdentity] || {};

    for (const guid of currentGuids) {
      if (processedGuidMap[guid]) continue;

      if (await hasEmailNotificationBeenCreated(target.userId, target.mailboxIdentity, guid)) {
        processedGuidMap[guid] = String(currentTimestamp);
        continue;
      }

      try {
        const headers = await fetchMessageHeadersFromDovecot(options.dovecotContainerName, target.mailboxIdentity, guid);
        headers.guid = headers.guid || guid;
        await createEmailNotification(target, headers);
        notificationsSent += 1;
        processedGuidMap[guid] = String(Date.now());
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.warn(
          `[MAILBOX_NOTIFICATION] Gagal memproses email baru ${guid} untuk ${target.mailboxIdentity}: ${message}`,
        );
      }
    }

    state.processedGuids[target.mailboxIdentity] = processedGuidMap;
  }

  pruneProcessedGuids(state);
  await saveWorkerState(options.stateFilePath, state);

  return {
    targetMailboxCount: targets.length,
    baselineMailboxCount,
    notificationsSent,
  };
}

export function startMailboxNotificationWorker() {
  const workerEnabled = parseBooleanEnv(process.env.MAILBOX_NOTIFICATION_ENABLED, true);
  if (!workerEnabled) {
    console.log('[MAILBOX_NOTIFICATION] Worker nonaktif melalui konfigurasi');
    return;
  }

  const intervalSeconds = parseNumberEnv(
    process.env.MAILBOX_NOTIFICATION_INTERVAL_SECONDS,
    DEFAULT_INTERVAL_SECONDS,
    MIN_INTERVAL_SECONDS,
    MAX_INTERVAL_SECONDS,
  );
  const maildirRoot = String(process.env.MAILBOX_NOTIFICATION_MAILDIR_ROOT || DEFAULT_MAILDIR_ROOT).trim();
  const stateFilePath = String(process.env.MAILBOX_NOTIFICATION_STATE_FILE || DEFAULT_STATE_FILE).trim();
  const dovecotContainerName = String(
    process.env.MAILBOX_NOTIFICATION_DOVECOT_CONTAINER || DEFAULT_DOVECOT_CONTAINER,
  ).trim();

  const runScan = async () => {
    if (scanInProgress) return;
    scanInProgress = true;

    try {
      const result = await runMailboxNotificationScan({
        maildirRoot,
        stateFilePath,
        dovecotContainerName,
      });

      if (result.notificationsSent > 0 || result.baselineMailboxCount > 0) {
        console.log(
          `[MAILBOX_NOTIFICATION] mailbox=${result.targetMailboxCount} baseline=${result.baselineMailboxCount} sent=${result.notificationsSent}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`[MAILBOX_NOTIFICATION_ERROR] ${message}`);
    } finally {
      scanInProgress = false;
    }
  };

  void runScan();
  workerTimer = setInterval(() => {
    void runScan();
  }, intervalSeconds * 1000);

  console.log(
    `[MAILBOX_NOTIFICATION] Worker aktif setiap ${intervalSeconds} detik, root=${maildirRoot}, state=${stateFilePath}`,
  );
}

export function stopMailboxNotificationWorker() {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}
