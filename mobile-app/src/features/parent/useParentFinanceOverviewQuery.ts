import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { parentApi } from './parentApi';
import { ParentFinanceOverview } from './types';

type ParentFinanceOverviewQueryData = {
  overview: ParentFinanceOverview;
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  childId: number | null;
  limit?: number;
};

export function useParentFinanceOverviewQuery(params: Params) {
  const { enabled, user, childId, limit = 20 } = params;
  const isParent = user?.role === 'PARENT';

  return useQuery({
    queryKey: ['mobile-parent-finance-overview', user?.id, childId, limit],
    enabled: enabled && !!user && isParent,
    queryFn: async (): Promise<ParentFinanceOverviewQueryData> => {
      const cacheKey = `mobile_cache_parent_finance_${user!.id}_${childId ?? 'all'}_${limit}`;
      try {
        const overview = await parentApi.getParentFinanceOverview({
          childId,
          limit,
        });
        const payload = { overview };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_parent_finance_${user!.id}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ overview: ParentFinanceOverview }>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
