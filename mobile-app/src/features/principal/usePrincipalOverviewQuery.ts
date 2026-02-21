import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { principalApi } from './principalApi';
import { PrincipalAcademicOverview } from './types';

type PrincipalOverviewQueryData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  overview: PrincipalAcademicOverview;
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
        let activeYear: { id: number; name: string; isActive: boolean } | null = null;
        try {
          activeYear = await academicYearApi.getActive();
        } catch {
          activeYear = null;
        }

        const overview = await principalApi.getAcademicOverview({
          academicYearId: activeYear?.id,
          semester,
        });

        const payload = { activeYear, overview };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_principal_overview_${user!.id}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ activeYear: { id: number; name: string; isActive: boolean } | null; overview: PrincipalAcademicOverview }>(
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
