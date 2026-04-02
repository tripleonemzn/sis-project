import { PrismaClient } from '@prisma/client';

const DEFAULT_PRISMA_CONNECTION_LIMIT = '5';
const DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS = '20';

const globalForPrisma = globalThis as typeof globalThis & {
  __sisPrisma?: PrismaClient;
};

function appendQueryParam(url: string, key: string, value: string): string {
  if (!value || new RegExp(`[?&]${key}=`).test(url)) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function buildPrismaDatabaseUrl(): string | undefined {
  const rawUrl = String(process.env.DATABASE_URL || '').trim();
  if (!rawUrl) {
    return undefined;
  }

  let tunedUrl = rawUrl;
  tunedUrl = appendQueryParam(
    tunedUrl,
    'connection_limit',
    String(process.env.PRISMA_CONNECTION_LIMIT || DEFAULT_PRISMA_CONNECTION_LIMIT).trim(),
  );
  tunedUrl = appendQueryParam(
    tunedUrl,
    'pool_timeout',
    String(process.env.PRISMA_POOL_TIMEOUT || DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS).trim(),
  );

  return tunedUrl;
}

function createPrismaClient() {
  const databaseUrl = buildPrismaDatabaseUrl();

  return new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : undefined,
  );
}

const prisma = globalForPrisma.__sisPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__sisPrisma = prisma;
}

export default prisma;
