import { execFile, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { promisify, TextDecoder } from 'util';
import prisma from '../utils/prisma';

const execFileAsync = promisify(execFile);

const DEFAULT_MAILDIR_ROOT = '/mnt/mail_storage/docker-data/volumes/mailcowdockerized_vmail-vol-1/_data';
const DEFAULT_DOVECOT_CONTAINER = 'mailcowdockerized-dovecot-mailcow-1';
const DOVEADM_TIMEOUT_MS = 15000;
const DOVEADM_MAX_BUFFER = 8 * 1024 * 1024;
const MAX_MESSAGE_LIMIT = 100;
const EMAIL_NOTIFICATION_TYPE = 'EMAIL_RECEIVED';
const WEBMAIL_FOLDER_KEY_SET = new Set(['INBOX', 'Drafts', 'Sent', 'Junk', 'Archive']);
const WEBMAIL_MAILBOX_FOLDER_KEY_SET = new Set(['INBOX', 'Drafts', 'Sent', 'Junk', 'Archive', 'Trash']);

export type WebmailFolderKey = 'INBOX' | 'Drafts' | 'Sent' | 'Junk' | 'Archive';
export type WebmailMailboxFolderKey = WebmailFolderKey | 'Trash';

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
  folderKey: WebmailFolderKey;
  query: string | null;
  messages: WebmailMessageSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type MoveWebmailMessageResult = {
  mailboxIdentity: string;
  guid: string;
  sourceFolderKey: WebmailMailboxFolderKey;
  targetFolderKey: WebmailMailboxFolderKey;
  movedAt: string;
};

export type UpdateWebmailMessageReadStateResult = {
  mailboxIdentity: string;
  guid: string;
  folderKey: WebmailFolderKey;
  isRead: boolean;
  updatedAt: string;
};

export type DeleteWebmailMessageResult = {
  mailboxIdentity: string;
  guid: string;
  sourceFolderKey: WebmailFolderKey;
  targetFolderKey: 'Trash';
  movedAt: string;
};

export type SendWebmailMessageInput = {
  mailboxIdentity: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  subject: string;
  plainText: string;
  html?: string | null;
  inReplyToMessageId?: string | null;
  references?: string[] | null;
};

export class MailboxUnavailableError extends Error {}
export class MailboxMessageNotFoundError extends Error {}

type DoveadmRecord = Record<string, string>;

type ParsedInlineResource = {
  references: string[];
  dataUrl: string;
};

type ParsedMimeEntity = {
  headers: Record<string, string>;
  body: string;
  plainTextParts: string[];
  htmlParts: string[];
  inlineResources: ParsedInlineResource[];
};

function normalizeMailboxIdentity(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeWebmailFolderKey(value: unknown, fallbackValue: WebmailFolderKey = 'INBOX'): WebmailFolderKey {
  const rawValue = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!rawValue) return fallbackValue;

  const mappedValue =
    rawValue === 'inbox'
      ? 'INBOX'
      : rawValue === 'draft' || rawValue === 'drafts'
        ? 'Drafts'
        : rawValue === 'sent' || rawValue === 'terkirim'
          ? 'Sent'
          : rawValue === 'junk' || rawValue === 'spam'
            ? 'Junk'
            : rawValue === 'archive' || rawValue === 'arsip'
              ? 'Archive'
              : null;

  if (mappedValue && WEBMAIL_FOLDER_KEY_SET.has(mappedValue)) {
    return mappedValue as WebmailFolderKey;
  }

  return fallbackValue;
}

export function normalizeWebmailMailboxFolderKey(
  value: unknown,
  fallbackValue: WebmailMailboxFolderKey = 'INBOX',
): WebmailMailboxFolderKey {
  const rawValue = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!rawValue) return fallbackValue;

  const mappedValue =
    rawValue === 'trash' || rawValue === 'deleted' || rawValue === 'sampah' || rawValue === 'hapus'
      ? 'Trash'
      : normalizeWebmailFolderKey(rawValue, fallbackValue === 'Trash' ? 'INBOX' : fallbackValue);

  if (mappedValue && WEBMAIL_MAILBOX_FOLDER_KEY_SET.has(mappedValue)) {
    return mappedValue as WebmailMailboxFolderKey;
  }

  return fallbackValue;
}

function toMaybeString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : '';
}

function parsePositiveInt(rawValue: unknown, fallbackValue: number, minValue: number, maxValue: number) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallbackValue;
  if (parsed < minValue) return minValue;
  if (parsed > maxValue) return maxValue;
  return parsed;
}

function escapeRegExp(value: string) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function decodeQuotedPrintableBuffer(value: string) {
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

  return Buffer.from(bytes);
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

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value: string) {
  return decodeHtmlEntities(String(value || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeSnippet(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function encodeHeaderIfNeeded(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^[\x20-\x7E]*$/.test(normalized)) return normalized;
  return `=?UTF-8?B?${Buffer.from(normalized, 'utf8').toString('base64')}?=`;
}

function ensureValidEmailAddress(value: string) {
  const normalized = String(value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`Alamat email tidak valid: ${normalized || '-'}`);
  }
  return normalized;
}

function buildHtmlFromPlainText(value: string) {
  const escaped = escapeHtml(String(value || '').trim());
  if (!escaped) return '<div></div>';
  return `<div>${escaped.replace(/\r?\n/g, '<br/>')}</div>`;
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

function decodeBodyBuffer(rawBody: string, encoding: string) {
  const normalizedEncoding = String(encoding || '').trim().toLowerCase();
  if (normalizedEncoding === 'base64') {
    try {
      return Buffer.from(String(rawBody || '').replace(/\s+/g, ''), 'base64');
    } catch {
      return Buffer.from(String(rawBody || ''), 'utf8');
    }
  }
  if (normalizedEncoding === 'quoted-printable') {
    return decodeQuotedPrintableBuffer(rawBody);
  }
  return Buffer.from(String(rawBody || '').replace(/\r\n/g, '\n'), 'utf8');
}

function extractHeaderParameter(headerValue: string, parameterName: string) {
  const pattern = new RegExp(`(?:^|;)\\s*${escapeRegExp(parameterName)}\\*?=(?:"([^"]*)"|([^;]+))`, 'i');
  const match = String(headerValue || '').match(pattern);
  const rawValue = match ? match[1] || match[2] || '' : '';
  return decodeMimeHeaderValue(String(rawValue || '').trim());
}

function normalizeInlineReference(value: string) {
  let normalized = decodeMimeHeaderValue(String(value || ''))
    .trim()
    .replace(/^cid:/i, '')
    .replace(/^<+|>+$/g, '')
    .replace(/^['"]+|['"]+$/g, '');

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // ignore malformed URI-style identifiers
  }

  return normalized.trim().toLowerCase();
}

function collectInlineResourceReferences(headers: Record<string, string>) {
  const references = new Set<string>();
  const contentId = normalizeInlineReference(String(headers['content-id'] || ''));
  const contentLocation = normalizeInlineReference(String(headers['content-location'] || ''));
  const contentTypeName = normalizeInlineReference(extractHeaderParameter(String(headers['content-type'] || ''), 'name'));
  const contentDispositionFilename = normalizeInlineReference(
    extractHeaderParameter(String(headers['content-disposition'] || ''), 'filename'),
  );

  if (contentId) references.add(contentId);
  if (contentLocation) {
    references.add(contentLocation);
    const pathParts = contentLocation.split('/').filter((part) => part.length > 0);
    const basename = pathParts[pathParts.length - 1] || '';
    if (basename) references.add(basename);
  }
  if (contentTypeName) references.add(contentTypeName);
  if (contentDispositionFilename) references.add(contentDispositionFilename);

  return Array.from(references);
}

const MAX_INLINE_RESOURCE_COUNT = 12;
const MAX_INLINE_RESOURCE_BYTES = 6 * 1024 * 1024;

function buildInlineResource(headers: Record<string, string>, normalizedType: string, rawBody: string, transferEncoding: string) {
  const references = collectInlineResourceReferences(headers);
  if (references.length === 0) return null;
  if (normalizedType.startsWith('text/plain') || normalizedType.startsWith('text/html')) return null;

  const contentBuffer = decodeBodyBuffer(rawBody, transferEncoding);
  if (!contentBuffer.length || contentBuffer.length > MAX_INLINE_RESOURCE_BYTES) {
    return null;
  }

  const contentType = normalizedType || 'application/octet-stream';
  return {
    references,
    dataUrl: `data:${contentType};base64,${contentBuffer.toString('base64')}`,
  } satisfies ParsedInlineResource;
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
      inlineResources: parsedParts.flatMap((part) => part.inlineResources).slice(0, MAX_INLINE_RESOURCE_COUNT),
    };
  }

  if (normalizedType === 'message/rfc822') {
    const nested = parseMimeEntity(rawBody);
    return {
      headers,
      body: rawBody,
      plainTextParts: nested.plainTextParts,
      htmlParts: nested.htmlParts,
      inlineResources: nested.inlineResources.slice(0, MAX_INLINE_RESOURCE_COUNT),
    };
  }

  const decodedBody = decodeBodyValue(rawBody, transferEncoding, charset);
  const inlineResource = buildInlineResource(headers, normalizedType, rawBody, transferEncoding);

  return {
    headers,
    body: decodedBody,
    plainTextParts: normalizedType.startsWith('text/plain') ? [decodedBody] : [],
    htmlParts: normalizedType.startsWith('text/html') ? [decodedBody] : [],
    inlineResources: inlineResource ? [inlineResource] : [],
  };
}

function resolveInlineHtmlResource(reference: string, resourceMap: Map<string, string>) {
  const normalizedReference = normalizeInlineReference(reference);
  return normalizedReference ? resourceMap.get(normalizedReference) || null : null;
}

function replaceHtmlInlineAttribute(value: string, resourceMap: Map<string, string>) {
  return String(value || '')
    .replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi, (match, attr, quote, rawReference) => {
      const resolved = resolveInlineHtmlResource(rawReference, resourceMap);
      return resolved ? `${attr}=${quote}${resolved}${quote}` : match;
    })
    .replace(/\b(src|href|poster)\s*=\s*([^\s>]+)/gi, (match, attr, rawReference) => {
      const resolved = resolveInlineHtmlResource(rawReference, resourceMap);
      return resolved ? `${attr}="${resolved}"` : match;
    })
    .replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, rawReference) => {
      const resolved = resolveInlineHtmlResource(rawReference, resourceMap);
      return resolved ? `url(${quote || '"'}${resolved}${quote || '"'})` : match;
    });
}

function resolveInlineResourcesInHtml(html: string | null, inlineResources: ParsedInlineResource[]) {
  if (!html || inlineResources.length === 0) return html;

  const resourceMap = new Map<string, string>();
  for (const resource of inlineResources.slice(0, MAX_INLINE_RESOURCE_COUNT)) {
    for (const reference of resource.references) {
      if (reference && !resourceMap.has(reference)) {
        resourceMap.set(reference, resource.dataUrl);
      }
    }
  }

  if (resourceMap.size === 0) return html;
  return replaceHtmlInlineAttribute(html, resourceMap);
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

export async function isWebmailMailboxAvailable(mailboxIdentity: string) {
  try {
    await ensureMailboxAvailable(mailboxIdentity);
    return true;
  } catch (error: unknown) {
    if (error instanceof MailboxUnavailableError) return false;
    throw error;
  }
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

function parseUidValue(record: DoveadmRecord) {
  const parsedUid = Number.parseInt(String(record['uid'] || '0').trim(), 10);
  return Number.isFinite(parsedUid) && parsedUid > 0 ? parsedUid : 0;
}

type MailboxSearchPlan = {
  args: string[];
  score: number;
};

function buildMailboxSearchArgs(folderKey: WebmailFolderKey, query?: string) {
  const normalizedQuery = toMaybeString(query);
  if (!normalizedQuery) {
    return ['mailbox', folderKey, 'all'];
  }
  return ['mailbox', folderKey, 'text', normalizedQuery];
}

function buildMailboxSearchPlans(folderKey: WebmailFolderKey, query: string) {
  const normalizedQuery = toMaybeString(query);
  const normalizedTerms = Array.from(
    new Set(
      normalizedQuery
        .split(/\s+/)
        .map((term) => toMaybeString(term))
        .filter((term) => term.length >= 2 && term !== normalizedQuery),
    ),
  ).slice(0, 3);

  const primary: MailboxSearchPlan[] = [
    { args: ['mailbox', folderKey, 'from', normalizedQuery], score: 320 },
    { args: ['mailbox', folderKey, 'subject', normalizedQuery], score: 220 },
    { args: ['mailbox', folderKey, 'text', normalizedQuery], score: 140 },
  ];

  const fallback = normalizedTerms.flatMap<MailboxSearchPlan>((term) => [
    { args: ['mailbox', folderKey, 'from', term], score: 240 },
    { args: ['mailbox', folderKey, 'subject', term], score: 160 },
  ]);

  return {
    primary,
    fallback,
  };
}

async function runDoveadmUidSearch(mailboxIdentity: string, searchArgs: string[]) {
  return (await runDoveadmFetch(mailboxIdentity, 'uid', searchArgs))
    .map((record) => parseUidValue(record))
    .filter((uid) => uid > 0);
}

async function collectMailboxSearchUids(mailboxIdentity: string, folderKey: WebmailFolderKey, query?: string) {
  const normalizedQuery = toMaybeString(query);
  if (!normalizedQuery) {
    return (await runDoveadmUidSearch(mailboxIdentity, buildMailboxSearchArgs(folderKey))).sort((left, right) => right - left);
  }

  const { primary, fallback } = buildMailboxSearchPlans(folderKey, normalizedQuery);
  const scoreByUid = new Map<number, number>();

  const mergePlanResults = async (plans: MailboxSearchPlan[]) => {
    for (const plan of plans) {
      const matchedUids = await runDoveadmUidSearch(mailboxIdentity, plan.args);
      for (const uid of matchedUids) {
        const currentScore = scoreByUid.get(uid) || 0;
        if (plan.score > currentScore) {
          scoreByUid.set(uid, plan.score);
        }
      }
    }
  };

  await mergePlanResults(primary);
  if (scoreByUid.size === 0 && fallback.length > 0) {
    await mergePlanResults(fallback);
  }

  return Array.from(scoreByUid.entries())
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])
    .map(([uid]) => uid);
}

function buildUidSequenceSet(uids: number[]) {
  return uids
    .map((uid) => Math.trunc(Number(uid)))
    .filter((uid) => Number.isFinite(uid) && uid > 0)
    .join(',');
}

async function runDoveadmFlagsAddSeen(mailboxIdentity: string, folderKey: WebmailFolderKey, guid: string) {
  try {
    await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'flags', 'add', '-u', mailboxIdentity, '\\Seen', 'mailbox', folderKey, 'guid', guid],
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

async function runDoveadmFlagsRemoveSeen(mailboxIdentity: string, folderKey: WebmailFolderKey, guid: string) {
  try {
    await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'flags', 'remove', '-u', mailboxIdentity, '\\Seen', 'mailbox', folderKey, 'guid', guid],
      {
        timeout: DOVEADM_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error: unknown) {
    const message = extractExecErrorMessage(error);
    throw new Error(`Gagal menandai email sebagai belum dibaca: ${message}`);
  }
}

async function runDoveadmExpunge(mailboxIdentity: string, folderKey: WebmailMailboxFolderKey, guid: string) {
  try {
    await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'expunge', '-u', mailboxIdentity, 'mailbox', folderKey, 'guid', guid],
      {
        timeout: DOVEADM_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error: unknown) {
    const message = extractExecErrorMessage(error);
    throw new Error(`Gagal menghapus email: ${message}`);
  }
}

async function ensureFolderMessageExists(mailboxIdentity: string, folderKey: WebmailMailboxFolderKey, guid: string) {
  const records = await runDoveadmFetch(mailboxIdentity, 'guid', ['mailbox', folderKey, 'guid', guid]);
  const match = records.find((record) => String(record['guid'] || '').trim() === guid);
  if (!match) {
    throw new MailboxMessageNotFoundError(`Email ${guid} tidak ditemukan`);
  }
}

async function ensureDoveadmMailboxExists(mailboxIdentity: string, folderKey: WebmailMailboxFolderKey) {
  if (folderKey === 'INBOX') return;
  try {
    await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'mailbox', 'create', '-u', mailboxIdentity, folderKey],
      {
        timeout: DOVEADM_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error: unknown) {
    const message = extractExecErrorMessage(error).toLowerCase();
    if (message.includes('exists') || message.includes('already')) {
      return;
    }
    throw new Error(`Gagal menyiapkan folder ${folderKey}: ${extractExecErrorMessage(error)}`);
  }
}

async function runDoveadmMove(
  mailboxIdentity: string,
  sourceFolderKey: WebmailMailboxFolderKey,
  targetFolderKey: WebmailMailboxFolderKey,
  guid: string,
) {
  try {
    await execFileAsync(
      'docker',
      ['exec', getDovecotContainerName(), 'doveadm', 'move', '-u', mailboxIdentity, targetFolderKey, 'mailbox', sourceFolderKey, 'guid', guid],
      {
        timeout: DOVEADM_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error: unknown) {
    const message = extractExecErrorMessage(error);
    throw new Error(`Gagal memindahkan email: ${message}`);
  }
}

async function runDockerExecWithInput(containerName: string, command: string, input: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', containerName, 'sh', '-lc', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${stderr || stdout || `Command exited with code ${code}`}`.trim()));
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

function buildMimeMessage(input: SendWebmailMessageInput) {
  const fromMailbox = normalizeMailboxIdentity(input.mailboxIdentity);
  const displayName = toMaybeString(input.fromName);
  const fromHeader = displayName
    ? `${encodeHeaderIfNeeded(displayName)} <${fromMailbox}>`
    : fromMailbox;
  const toList = input.to.map((item) => ensureValidEmailAddress(item));
  const ccList = (input.cc || []).map((item) => ensureValidEmailAddress(item));
  const subject = toMaybeString(input.subject) || '(Tanpa subjek)';
  const plainText = String(input.plainText || '').trim();
  const html = toMaybeString(input.html) || buildHtmlFromPlainText(plainText);
  const boundary = `----=_SISMobile_${randomUUID()}`;
  const messageId = `<sis-mobile-${randomUUID()}@${fromMailbox.split('@')[1] || 'siskgb2.id'}>`;
  const now = new Date().toUTCString();
  const referenceHeader = (input.references || [])
    .map((item) => toMaybeString(item))
    .filter((item) => item.length > 0)
    .join(' ');

  const lines = [
    `From: ${fromHeader}`,
    `To: ${toList.join(', ')}`,
    ...(ccList.length > 0 ? [`Cc: ${ccList.join(', ')}`] : []),
    `Subject: ${encodeHeaderIfNeeded(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${now}`,
    'MIME-Version: 1.0',
    ...(input.inReplyToMessageId ? [`In-Reply-To: ${toMaybeString(input.inReplyToMessageId)}`] : []),
    ...(referenceHeader ? [`References: ${referenceHeader}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ];

  return {
    messageId,
    envelopeRecipients: [...toList, ...ccList],
    rawMessage: lines.join('\n'),
  };
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
  folderKey?: WebmailFolderKey;
  query?: string;
}): Promise<WebmailMessageListResult> {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const page = parsePositiveInt(options.page, 1, 1, 9999);
  const limit = parsePositiveInt(options.limit, 20, 1, MAX_MESSAGE_LIMIT);
  const folderKey = normalizeWebmailFolderKey(options.folderKey, 'INBOX');
  const query = toMaybeString(options.query) || null;

  try {
    await ensureMailboxAvailable(mailboxIdentity);
  } catch (error) {
    if (error instanceof MailboxUnavailableError) {
      return {
        mailboxIdentity,
        mailboxAvailable: false,
        folderKey,
        query,
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

  const matchedUids = await collectMailboxSearchUids(mailboxIdentity, folderKey, query || undefined);

  const total = matchedUids.length;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const offset = (page - 1) * limit;
  const requestedUids = matchedUids.slice(offset, offset + limit);

  let messages: WebmailMessageSummary[] = [];

  if (requestedUids.length > 0) {
    const uidSequenceSet = buildUidSequenceSet(requestedUids);
    const records = await runDoveadmFetch(
      mailboxIdentity,
      'uid guid flags hdr.message-id hdr.subject hdr.from hdr.date body.snippet',
      ['mailbox', folderKey, 'uid', uidSequenceSet],
    );

    messages = records
      .map((record) => mapSummaryRecord(record))
      .filter((record) => record.guid.length > 0)
      .sort((left, right) => right.uid - left.uid);
  }

  return {
    mailboxIdentity,
    mailboxAvailable: true,
    folderKey,
    query,
    messages,
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
  folderKey?: WebmailFolderKey;
}): Promise<WebmailMessageDetail> {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const guid = String(options.guid || '').trim();
  const folderKey = normalizeWebmailFolderKey(options.folderKey, 'INBOX');
  if (!guid) {
    throw new MailboxMessageNotFoundError('Guid email tidak valid');
  }

  await ensureMailboxAvailable(mailboxIdentity);

  const records = await runDoveadmFetch(
    mailboxIdentity,
    'uid guid flags hdr.message-id hdr.subject hdr.from hdr.to hdr.cc hdr.date body.snippet text',
    ['mailbox', folderKey, 'guid', guid],
  );
  const record = records.find((item) => String(item['guid'] || '').trim() === guid);

  if (!record) {
    throw new MailboxMessageNotFoundError(`Email ${guid} tidak ditemukan`);
  }

  const summary = mapSummaryRecord(record);
  const rawMessage = String(record['text'] || '').trim();
  const parsedMessage = parseMimeEntity(rawMessage);
  const plainText = parsedMessage.plainTextParts.map((item) => item.trim()).filter((item) => item.length > 0).join('\n\n') || null;
  const rawHtml = parsedMessage.htmlParts.map((item) => item.trim()).filter((item) => item.length > 0).join('\n\n') || null;
  const html = resolveInlineResourcesInHtml(rawHtml, parsedMessage.inlineResources);
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

async function updateInboxNotificationReadState(
  userId: number,
  mailboxIdentity: string,
  guid: string,
  isRead: boolean,
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      type: EMAIL_NOTIFICATION_TYPE,
      isRead: !isRead,
      AND: [
        { data: { path: ['mailboxIdentity'], equals: mailboxIdentity } },
        { data: { path: ['emailGuid'], equals: guid } },
      ],
    },
    data: {
      isRead,
    },
  });
}

export async function markWebmailMessageAsRead(options: {
  userId: number;
  mailboxIdentity: string;
  guid: string;
  folderKey?: WebmailFolderKey;
}): Promise<UpdateWebmailMessageReadStateResult> {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const guid = String(options.guid || '').trim();
  const folderKey = normalizeWebmailFolderKey(options.folderKey, 'INBOX');
  if (!guid) {
    throw new MailboxMessageNotFoundError('Guid email tidak valid');
  }

  await ensureMailboxAvailable(mailboxIdentity);
  await runDoveadmFlagsAddSeen(mailboxIdentity, folderKey, guid);

  await updateInboxNotificationReadState(options.userId, mailboxIdentity, guid, true);

  return {
    mailboxIdentity,
    guid,
    folderKey,
    isRead: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function markWebmailMessageAsUnread(options: {
  userId: number;
  mailboxIdentity: string;
  guid: string;
  folderKey?: WebmailFolderKey;
}): Promise<UpdateWebmailMessageReadStateResult> {
  const mailboxIdentity = normalizeMailboxIdentity(options.mailboxIdentity);
  const guid = String(options.guid || '').trim();
  const folderKey = normalizeWebmailFolderKey(options.folderKey, 'INBOX');
  if (!guid) {
    throw new MailboxMessageNotFoundError('Guid email tidak valid');
  }

  await ensureMailboxAvailable(mailboxIdentity);
  await ensureFolderMessageExists(mailboxIdentity, folderKey, guid);
  await runDoveadmFlagsRemoveSeen(mailboxIdentity, folderKey, guid);

  if (folderKey === 'INBOX') {
    await updateInboxNotificationReadState(options.userId, mailboxIdentity, guid, false);
  }

  return {
    mailboxIdentity,
    guid,
    folderKey,
    isRead: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function sendWebmailMessage(input: SendWebmailMessageInput) {
  const mailboxIdentity = normalizeMailboxIdentity(input.mailboxIdentity);
  await ensureMailboxAvailable(mailboxIdentity);

  const { messageId, envelopeRecipients, rawMessage } = buildMimeMessage(input);
  if (envelopeRecipients.length === 0) {
    throw new Error('Penerima email wajib diisi');
  }

  const escapedSender = mailboxIdentity.replace(/'/g, `'\\''`);
  const escapedRecipients = envelopeRecipients.map((recipient) => `'${recipient.replace(/'/g, `'\\''`)}'`).join(' ');

  await runDockerExecWithInput(
    'mailcowdockerized-postfix-mailcow-1',
    `/usr/sbin/sendmail -i -f '${escapedSender}' -- ${escapedRecipients}`,
    rawMessage,
  );

  await runDockerExecWithInput(
    getDovecotContainerName(),
    `tmp_file="/tmp/sis-mobile-sent-${randomUUID()}.eml"; cat > "$tmp_file" && doveadm save -u '${escapedSender}' -m Sent "$tmp_file" && rm -f "$tmp_file"`,
    rawMessage,
  );

  return {
    messageId,
    sentAt: new Date().toISOString(),
    to: envelopeRecipients,
  };
}

export async function moveWebmailMessage(input: {
  userId: number;
  mailboxIdentity: string;
  guid: string;
  sourceFolderKey?: WebmailMailboxFolderKey;
  targetFolderKey: WebmailMailboxFolderKey;
}): Promise<MoveWebmailMessageResult> {
  const mailboxIdentity = normalizeMailboxIdentity(input.mailboxIdentity);
  const guid = String(input.guid || '').trim();
  const sourceFolderKey = normalizeWebmailMailboxFolderKey(input.sourceFolderKey, 'INBOX');
  const targetFolderKey = normalizeWebmailMailboxFolderKey(input.targetFolderKey, 'INBOX');

  if (!guid) {
    throw new MailboxMessageNotFoundError('Guid email tidak valid');
  }
  if (sourceFolderKey === targetFolderKey) {
    throw new Error('Folder tujuan harus berbeda dari folder asal');
  }

  await ensureMailboxAvailable(mailboxIdentity);
  await ensureFolderMessageExists(mailboxIdentity, sourceFolderKey, guid);
  if (sourceFolderKey === 'Trash' && targetFolderKey === 'Trash') {
    await runDoveadmExpunge(mailboxIdentity, 'Trash', guid);
  } else {
    await ensureDoveadmMailboxExists(mailboxIdentity, targetFolderKey);
    await runDoveadmMove(mailboxIdentity, sourceFolderKey, targetFolderKey, guid);
  }

  if (targetFolderKey !== 'INBOX') {
    await updateInboxNotificationReadState(input.userId, mailboxIdentity, guid, true);
  }

  return {
    mailboxIdentity,
    guid,
    sourceFolderKey,
    targetFolderKey,
    movedAt: new Date().toISOString(),
  };
}

export async function deleteWebmailMessage(input: {
  userId: number;
  mailboxIdentity: string;
  guid: string;
  sourceFolderKey?: WebmailFolderKey;
}): Promise<DeleteWebmailMessageResult> {
  const result = await moveWebmailMessage({
    userId: input.userId,
    mailboxIdentity: input.mailboxIdentity,
    guid: input.guid,
    sourceFolderKey: input.sourceFolderKey,
    targetFolderKey: 'Trash',
  });

  return {
    mailboxIdentity: result.mailboxIdentity,
    guid: result.guid,
    sourceFolderKey: normalizeWebmailFolderKey(result.sourceFolderKey, 'INBOX'),
    targetFolderKey: 'Trash',
    movedAt: result.movedAt,
  };
}
