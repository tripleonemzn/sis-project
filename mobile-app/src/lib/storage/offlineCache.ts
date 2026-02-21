import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEnvelope<T> = {
  updatedAt: string;
  data: T;
};

type GetCacheOptions = {
  maxAgeMs?: number;
};

const MOBILE_CACHE_PREFIX = 'mobile_cache_';
type CacheMetaSummary = {
  count: number;
  latestUpdatedAt: string | null;
};

export const offlineCache = {
  async get<T>(key: string, options?: GetCacheOptions): Promise<CacheEnvelope<T> | null> {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CacheEnvelope<T>;
      if (!parsed || typeof parsed !== 'object' || !parsed.updatedAt) return null;

      if (options?.maxAgeMs && Number.isFinite(options.maxAgeMs) && options.maxAgeMs > 0) {
        const ts = new Date(parsed.updatedAt).getTime();
        if (!Number.isFinite(ts)) return null;
        const age = Date.now() - ts;
        if (age > options.maxAgeMs) {
          await AsyncStorage.removeItem(key);
          return null;
        }
      }

      return parsed;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, data: T) {
    const payload: CacheEnvelope<T> = {
      updatedAt: new Date().toISOString(),
      data,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    return payload;
  },
  async clearAllMobileCaches() {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(MOBILE_CACHE_PREFIX));
    if (cacheKeys.length === 0) return 0;
    await AsyncStorage.multiRemove(cacheKeys);
    return cacheKeys.length;
  },
  async prunePrefix(prefix: string, maxEntries: number) {
    if (!Number.isFinite(maxEntries) || maxEntries < 1) return 0;
    const keys = await AsyncStorage.getAllKeys();
    const matchedKeys = keys.filter((key) => key.startsWith(prefix));
    if (matchedKeys.length <= maxEntries) return 0;

    const items: Array<{ key: string; ts: number }> = [];
    for (const key of matchedKeys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CacheEnvelope<unknown>;
        const ts = new Date(parsed?.updatedAt || '').getTime();
        items.push({ key, ts: Number.isFinite(ts) ? ts : 0 });
      } catch {
        items.push({ key, ts: 0 });
      }
    }

    items.sort((a, b) => b.ts - a.ts);
    const toDelete = items.slice(maxEntries).map((item) => item.key);
    if (toDelete.length === 0) return 0;
    await AsyncStorage.multiRemove(toDelete);
    return toDelete.length;
  },
  async cleanupExpiredByPrefix(prefix: string, maxAgeMs: number) {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 1) return 0;
    const keys = await AsyncStorage.getAllKeys();
    const matchedKeys = keys.filter((key) => key.startsWith(prefix));
    if (matchedKeys.length === 0) return 0;

    const now = Date.now();
    const toDelete: string[] = [];
    for (const key of matchedKeys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CacheEnvelope<unknown>;
        const ts = new Date(parsed?.updatedAt || '').getTime();
        if (!Number.isFinite(ts) || now - ts > maxAgeMs) {
          toDelete.push(key);
        }
      } catch {
        toDelete.push(key);
      }
    }

    if (toDelete.length === 0) return 0;
    await AsyncStorage.multiRemove(toDelete);
    return toDelete.length;
  },
  async maintenanceSweep(params: { prefixes: readonly string[]; maxAgeMs: number; maxEntriesPerPrefix: number }) {
    const { prefixes, maxAgeMs, maxEntriesPerPrefix } = params;
    let removed = 0;
    for (const prefix of prefixes) {
      removed += await offlineCache.cleanupExpiredByPrefix(prefix, maxAgeMs);
      removed += await offlineCache.prunePrefix(prefix, maxEntriesPerPrefix);
    }
    return removed;
  },
  async summarizeByPrefix(prefix: string): Promise<CacheMetaSummary> {
    const keys = await AsyncStorage.getAllKeys();
    const matchedKeys = keys.filter((key) => key.startsWith(prefix));
    if (matchedKeys.length === 0) {
      return { count: 0, latestUpdatedAt: null };
    }

    let latestTs = 0;
    for (const key of matchedKeys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CacheEnvelope<unknown>;
        const ts = new Date(parsed?.updatedAt || '').getTime();
        if (Number.isFinite(ts) && ts > latestTs) latestTs = ts;
      } catch {
        // Ignore invalid cache payload.
      }
    }

    return {
      count: matchedKeys.length,
      latestUpdatedAt: latestTs > 0 ? new Date(latestTs).toISOString() : null,
    };
  },
};
