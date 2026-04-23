import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { principalApi } from './principalApi';
import { PrincipalBehaviorSummary, PrincipalDashboardSummary } from './types';

type PrincipalOverviewQueryData = {
  summary: PrincipalDashboardSummary;
  overview: PrincipalDashboardSummary['academicOverview'];
  behaviorSummary: PrincipalBehaviorSummary | null;
  activeYearId: number | null;
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
      let activeYearId: number | null = null;
      try {
        const activeYear = await academicYearApi.getActive({ allowStaleOnError: true });
        activeYearId = activeYear?.id || null;
      } catch {
        activeYearId = null;
      }

      const cacheKey = `mobile_cache_principal_overview_${user!.id}_${activeYearId || 0}_${semester}`;
      try {
        const [summary, behaviorSummary] = await Promise.all([
          principalApi.getDashboardSummary({
            academicYearId: activeYearId || undefined,
            semester,
          }),
          principalApi.getBehaviorSummary({
            academicYearId: activeYearId || undefined,
          }).catch(() => null),
        ]);

        const payload = { summary, overview: summary.academicOverview, behaviorSummary, activeYearId };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_principal_overview_${user!.id}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{
          summary: PrincipalDashboardSummary;
          overview: PrincipalDashboardSummary['academicOverview'];
          behaviorSummary: PrincipalBehaviorSummary | null;
          activeYearId: number | null;
        }>(
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
