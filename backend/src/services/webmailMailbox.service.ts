import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify, TextDecoder } from 'util';
import prisma from '../utils/prisma';

const execFileAsync = promisify(execFile);

const DEFAULT_MAILDIR_ROOT = '/mnt/mail_storage/docker-data/volumes/mailcowdockerized_vmail-vol-1/_data';
const DEFAULT_DOVECOT_CONTAINER = 'mailcowdockerized-dovecot-mailcow-1';
const DOVEADM_TIMEOUT_MS = 15000;
const DOVEADM_MAX_BUFFER = 8 * 1024 * 1024;
const MAX_MESSAGE_LIMIT = 50;
const EMAIL_NOTIFICATION_TYPE = 'EMAIL_RECEIVED';

export type WebmailMessageSummary = {
  uid: number;
  guid: string;
  messageId: string | null;
  subject: string;
  from: string;
  fromLabel: string;
  date: string | null;
  snippet: string;
  isRead: boolean;
};

export type WebmailMessageDetail = WebmailMessageSummary & {
  to: string | null;
  cc: string | null;
  plainText: string | null;
  html: string | null;
  previewText: string;
};

export type WebmailMessageListResult = {
  mailboxIdentity: string;
  mailboxAvailable: boolean;
  messages: WebmailMessageSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export class MailboxUnavailableError extends Error {}
export class MailboxMessageNotFoundError extends Error {}

type DoveadmRecord = Record<string, string>;

type ParsedMimeEntity = {
  headers: Record<string, string>;
  body: string;
  plainTextParts: string[];
  htmlParts: string[];
};

function normalizeMailboxIdentity(value: string) {
  return String(value || '').trim().toLowerCase();
}

function parsePositiveInt(rawValue: unknown, fallbackValue: number, minValue: number, maxValue: number) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallbackValue;
  if (parsed < minValue) return minValue;
  if (parsed > maxValue) return maxValue;
  return parsed;
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

function decodeQuotedPrintableBody(value: string, charset: string) {
  const normalized = String(value || '')
    .replace(/=\r?\n/g, '')
    .replace(/=\s+\r?\n/g, '');
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === '=') {
      const hex = normalized.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }
    bytes.push(current.charCodeAt(0));
  }

  return decodeBufferWithCharset(Buffer.from(bytes), charset);
}

function decodeHtmlEntities(value: string) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function stripHtml(value: string) {
  return decodeHtmlEntities(String(value || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeSnippet(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractMultipartBoundary(contentTypeHeader: string) {
  const match = String(contentTypeHeader || '').match(/boundary="?([^";]+)"?/i);
  return match ? match[1] : '';
}

function splitHeaderAndBody(rawMessage: string) {
  const normalized = String(rawMessage || '').replace(/\r\n/g, '\n');
  const separatorIndex = normalized.indexOf('\n\n');
  if (separatorIndex < 0) {
    return {
      rawHeaders: normalized,
      rawBody: '',
    };
  }
  return {
    rawHeaders: normalized.slice(0, separatorIndex),
    rawBody: normalized.slice(separatorIndex + 2),
  };
}

function parseHeaderLines(rawHeaders: string) {
  const headerMap = new Map<string, string>();
  const lines = String(rawHeaders || '').split('\n');
  let activeKey = '';

  for (const line of lines) {
    if (/^[ \t]/.test(line) && activeKey) {
      headerMap.set(activeKey, `${headerMap.get(activeKey) || ''} ${line.trim()}`.trim());
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;
    activeKey = line.slice(0, separatorIndex).trim().toLowerCase();
    headerMap.set(activeKey, line.slice(separatorIndex + 1).trim());
  }

  return Object.fromEntries(headerMap.entries());
}

function decodeBodyValue(rawBody: string, encoding: string, charset: string) {
  const normalizedEncoding = String(encoding || '').trim().toLowerCase();
  if (normalizedEncoding === 'base64') {
    try {
      return decodeBufferWithCharset(Buffer.from(String(rawBody || '').replace(/\s+/g, ''), 'base64'), charset);
    } catch {
      return String(rawBody || '');
    }
  }
  if (normalizedEncoding === 'quoted-printable') {
    return decodeQuotedPrintableBody(rawBody, charset);
  }
  return String(rawBody || '').replace(/\r\n/g, '\n').trim();
}

function splitMultipartSections(rawBody: string, boundary: string) {
  const normalizedBody = String(rawBody || '').replace(/\r\n/g, '\n');
  const marker = `--${boundary}`;
  return normalizedBody
    .split(marker)
    .slice(1)
    .map((section) => section.replace(/^\n+/, '').replace(/\n+$/, ''))
    .filter((section) => section.length > 0 && section !== '--' && !section.startsWith('--'));
}

function parseMimeEntity(rawMessage: string): ParsedMimeEntity {
  const { rawHeaders, rawBody } = splitHeaderAndBody(rawMessage);
  const headers = parseHeaderLines(rawHeaders);
  const contentType = String(headers['content-type'] || 'text/plain; charset=utf-8');
  const normalizedType = contentType.split(';')[0]?.trim().toLowerCase() || 'text/plain';
  const transferEncoding = String(headers['content-transfer-encoding'] || '').trim();
  const charsetMatch = contentType.match(/charset="?([^";]+)"?/i);
  const charset = charsetMatch ? charsetMatch[1] : 'utf-8';

  if (normalizedType.startsWith('multipart/')) {
    const boundary = extractMultipartBoundary(contentType);
    const sections = boundary ? splitMultipartSections(rawBody, boundary) : [];
    const parsedParts = sections.map((section) => parseMimeEntity(section));
    return {
      headers,
      body: rawBody,
      plainTextParts: parsedParts.flatMap((part) => part.plainTextParts),
      htmlParts: parsedParts.flatMap((part) => part.htmlParts),
    };
  }

  if (normalizedType === 'message/rfc822') {
    const nested = parseMimeEntity(rawBody);
    return {
      headers,
      body: rawBody,
      plainTextParts: nested.plainTextParts,
      htmlParts: nested.htmlParts,
    };
  }

  const decodedBody = decodeBodyValue(rawBody, transferEncoding, charset);

  return {
    headers,
    body: decodedBody,
    plainTextParts: normalizedType.startsWith('text/plain') ? [decodedBody] : [],
    htmlParts: normalizedType.startsWith('text/html') ? [decodedBody] : [],
  };
}

function parseDoveadmRecords(stdout: string) {
  return String(stdout || '')
    .split('\f')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const record: DoveadmRecord = {};
      let currentKey = '';

      chunk.split(/\r?\n/).forEach((line) => {
        if (currentKey === 'text' || currentKey === 'body' || currentKey === 'body.text') {
          record[currentKey] = `${record[currentKey] || ''}\n${line}`;
          return;
        }

        const keyMatch = line.match(/^([A-Za-z0-9._-]+):\s?(.*)$/);
        if (keyMatch) {
          currentKey = keyMatch[1].trim().toLowerCase();
          record[currentKey] = keyMatch[2] || '';
          return;
        }

        if (!currentKey) return;
        record[currentKey] = `${record[currentKey] || ''}\n${line}`;
      });

      return record;
    });
}

function extractExecErrorMessage(error: unknown) {
  if (typeof error === 'object' && error) {
    const stderr = 'stderr' in error ? String((error as { stderr?: unknown }).stderr || '') : '';
    const stdout = 'stdout' in error ? String((error as { stdout?: unknown }).stdout || '') : '';
    const combined = `${stderr}\n${stdout}`.trim();
    if (combined) return combined;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'unknown error';
}

async function ensureMailboxAvailable(mailboxIdentity: string) {
  const normalizedMailbox = normalizeMailboxIdentity(mailboxIdentity);
  const [localPart, domain] = normalizedMailbox.split('@');
  if (!localPart || !domain) {
    throw new MailboxUnavailableError(`Mailbox ${mailboxIdentity} tidak valid`);
  }

  const maildirRoot = String(process.env.MAILBOX_NOTIFICATION_MAILDIR_ROOT || DEFAULT_MAILDIR_ROOT).trim() || DEFAULT_MAILDIR_ROOT;
  const mailboxPath = path.join(maildirRoot, domain, localPart, 'Maildir');
  const stat = await fs.stat(mailboxPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new MailboxUnavailableError(`Mailbox ${mailboxIdentity} belum tersedia di server`);
  }

  return mailboxPath;
}

function getDovecotContainerName() {
  return String(process.env.MAILBOX_NOTIFICATION_DOVECOT_CONTAINER || DEFAULT_DOVECOT_CONTAINER).trim() || DEFAULT_DOVECOT_CONTAINER;
}

async function runDoveadmFetch(mailboxIdentity: string, fields: string, searchArgs: string[]) {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'fetch', '-u', mailboxIdentity, fields, ...searchArgs],
      {
        timeout: DOVEADM_TIMEOUT_MS,
        maxBuffer: DOVEADM_MAX_BUFFER,
      },
    );

    return parseDoveadmRecords(String(stdout || ''));
  } catch (error: unknown) {
    const message = extractExecErrorMessage(error);
    if (message.toLowerCase().includes("user doesn't exist")) {
      throw new MailboxUnavailableError(`Mailbox ${mailboxIdentity} belum tersedia di Dovecot`);
    }
    throw new Error(`Gagal mengambil data mailbox ${mailboxIdentity}: ${message}`);
  }
}

async function runDoveadmFlagsAddSeen(mailboxIdentity: string, guid: string) {
  try {
    await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'flags', 'add', '-u', mailboxIdentity, '\\Seen', 'mailbox', 'INBOX', 'guid', guid],
      {
        timeout: DOVEADM_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error: unknown) {
    const message = extractExecErrorMessage(error);
    throw new Error(`Gagal menandai email sebagai dibaca: ${message}`);
  }
}

function mapSummaryRecord(record: DoveadmRecord): WebmailMessageSummary {
  const flags = String(record['flags'] || '')
    .split(/\s+/)
    .filter((item) => item.length > 0);

  return {
    uid: Number.parseInt(String(record['uid'] || '0').trim(), 10) || 0,
    guid: String(record['guid'] || '').trim(),
    messageId: String(record['hdr.message-id'] || '').trim() || null,
    subject: normalizeSubject(String(record['hdr.subject'] || '')),
    from: decodeMimeHeaderValue(String(record['hdr.from'] || '')),
    fromLabel: parseSenderLabel(String(record['hdr.from'] || '')),
    date: String(record['hdr.date'] || '').trim() || null,
    snippet: normalizeSnippet(String(record['body.snippet'] || '')),
    isRead: flags.includes('\\Seen'),
  };
}

export async function listWebmailMessages(options: {
  mailboxIdentity: string;
  page?: number;
  limit?: number;
}): Promise<WebmailMessageListResult> {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const page = parsePositiveInt(options.page, 1, 1, 9999);
  const limit = parsePositiveInt(options.limit, 20, 1, MAX_MESSAGE_LIMIT);

  try {
    await ensureMailboxAvailable(mailboxIdentity);
  } catch (error) {
    if (error instanceof MailboxUnavailableError) {
      return {
        mailboxIdentity,
        mailboxAvailable: false,
        messages: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
    throw error;
  }

  const records = await runDoveadmFetch(
    mailboxIdentity,
    'uid guid flags hdr.message-id hdr.subject hdr.from hdr.date body.snippet',
    ['mailbox', 'INBOX', 'all'],
  );

  const messages = records
    .map((record) => mapSummaryRecord(record))
    .filter((record) => record.guid.length > 0)
    .sort((left, right) => right.uid - left.uid);

  const total = messages.length;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const offset = (page - 1) * limit;

  return {
    mailboxIdentity,
    mailboxAvailable: true,
    messages: messages.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function getWebmailMessageDetail(options: {
  mailboxIdentity: string;
  guid: string;
}): Promise<WebmailMessageDetail> {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const guid = String(options.guid || '').trim();
  if (!guid) {
    throw new MailboxMessageNotFoundError('Guid email tidak valid');
  }

  await ensureMailboxAvailable(mailboxIdentity);

  const records = await runDoveadmFetch(
    mailboxIdentity,
    'uid guid flags hdr.message-id hdr.subject hdr.from hdr.to hdr.cc hdr.date body.snippet text',
    ['mailbox', 'INBOX', 'guid', guid],
  );
  const record = records.find((item) => String(item['guid'] || '').trim() === guid);

  if (!record) {
    throw new MailboxMessageNotFoundError(`Email ${guid} tidak ditemukan`);
  }

  const summary = mapSummaryRecord(record);
  const rawMessage = String(record['text'] || '').trim();
  const parsedMessage = parseMimeEntity(rawMessage);
  const plainText = parsedMessage.plainTextParts.map((item) => item.trim()).filter((item) => item.length > 0).join('\n\n') || null;
  const html = parsedMessage.htmlParts.map((item) => item.trim()).filter((item) => item.length > 0).join('\n\n') || null;
  const previewText = normalizeSnippet(plainText || stripHtml(html || '') || summary.snippet);

  return {
    ...summary,
    to: decodeMimeHeaderValue(String(record['hdr.to'] || '')) || null,
    cc: decodeMimeHeaderValue(String(record['hdr.cc'] || '')) || null,
    plainText,
    html,
    previewText,
  };
}

export async function markWebmailMessageAsRead(options: {
  userId: number;
  mailboxIdentity: string;
  guid: string;
}) {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const guid = String(options.guid || '').trim();
  if (!guid) {
    throw new MailboxMessageNotFoundError('Guid email tidak valid');
  }

  await ensureMailboxAvailable(mailboxIdentity);
  await runDoveadmFlagsAddSeen(mailboxIdentity, guid);

  await prisma.notification.updateMany({
    where: {
      userId: options.userId,
      type: EMAIL_NOTIFICATION_TYPE,
      isRead: false,
      AND: [
        { data: { path: ['mailboxIdentity'], equals: mailboxIdentity } },
        { data: { path: ['emailGuid'], equals: guid } },
      ],
    },
    data: {
      isRead: true,
    },
  });
}
