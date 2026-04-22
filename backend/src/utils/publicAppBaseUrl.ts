import type { Request } from 'express';

const DEFAULT_PUBLIC_APP_BASE_URL = 'https://siskgb2.id';

function getFirstHeaderValue(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.length > 0) || '';
}

function normalizeUrlCandidate(rawValue: string, protocolFallback = 'https'): URL | null {
  const normalizedValue = String(rawValue || '').trim();
  if (!normalizedValue) return null;

  const withProtocol = /^[a-z]+:\/\//i.test(normalizedValue)
    ? normalizedValue
    : `${protocolFallback}://${normalizedValue}`;

  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === 'localhost' || normalized === '0.0.0.0' || normalized === '::1') {
    return true;
  }

  if (normalized.startsWith('127.')) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }

  const match172 = normalized.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function normalizePublicUrl(rawValue: string, protocolFallback = 'https'): string | null {
  const candidate = normalizeUrlCandidate(rawValue, protocolFallback);
  if (!candidate) return null;
  if (isPrivateOrLoopbackHostname(candidate.hostname)) return null;
  return candidate.toString().replace(/\/+$/, '');
}

export function resolvePublicAppBaseUrl(req: Request): string {
  const configuredBaseUrl = String(
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_BASE_URL || '',
  ).trim();

  const configuredPublicUrl = normalizePublicUrl(configuredBaseUrl, 'https');
  if (configuredPublicUrl) {
    return configuredPublicUrl;
  }

  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']) || 'https';
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || getFirstHeaderValue(req.headers.host);
  const headerPublicUrl = normalizePublicUrl(host, forwardedProto || req.protocol || 'https');
  if (headerPublicUrl) {
    return headerPublicUrl;
  }

  return DEFAULT_PUBLIC_APP_BASE_URL;
}

