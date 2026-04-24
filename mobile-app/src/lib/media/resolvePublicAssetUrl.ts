import { ENV } from '../../config/env';

function getOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
}

export function resolvePublicAssetUrl(fileUrl?: string | null) {
  const normalized = String(fileUrl || '').trim();
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const origin = getOrigin(ENV.API_BASE_URL);
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${origin}${path}`;
}
