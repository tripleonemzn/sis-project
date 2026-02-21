import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { parentApi } from './parentApi';
import { ParentChildDetail } from './types';

type ParentChildrenQueryData = {
  children: ParentChildDetail[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useParentChildrenQuery({ enabled, user }: Params) {
  const isParent = user?.role === 'PARENT';

  return useQuery({
    queryKey: ['mobile-parent-children', user?.id],
    enabled: enabled && !!user && isParent,
    queryFn: async (): Promise<ParentChildrenQueryData> => {
      const cacheKey = `mobile_cache_parent_children_${user!.id}`;
      try {
        const childIds = (user?.children || []).map((child) => child.id).filter(Boolean);
        const children = await parentApi.getChildrenByIds(childIds);
        const payload = { children };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_parent_children_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ children: ParentChildDetail[] }>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
