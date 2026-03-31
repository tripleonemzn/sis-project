import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { principalApi } from './principalApi';
import { PrincipalDashboardSummary } from './types';

type PrincipalOverviewQueryData = {
  summary: PrincipalDashboardSummary;
  overview: PrincipalDashboardSummary['academicOverview'];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  semester: 'ODD' | 'EVEN';
};

export function usePrincipalOverviewQuery({ enabled, user, semester }: Params) {
  const isPrincipal = user?.role === 'PRINCIPAL';

  return useQuery({
    queryKey: ['mobile-principal-overview', user?.id, semester],
    enabled: enabled && !!user && isPrincipal,
    queryFn: async (): Promise<PrincipalOverviewQueryData> => {
      const cacheKey = `mobile_cache_principal_overview_${user!.id}_${semester}`;
      try {
        const summary = await principalApi.getDashboardSummary({
          semester,
        });

        const payload = { summary, overview: summary.academicOverview };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_principal_overview_${user!.id}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ summary: PrincipalDashboardSummary; overview: PrincipalDashboardSummary['academicOverview'] }>(
          cacheKey,
          { maxAgeMs: CACHE_TTL_MS },
        );
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
