import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { parentApi } from './parentApi';
import { ParentChildReportCard } from './types';

type ParentChildReportCardQueryData = {
  reportCard: ParentChildReportCard;
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  childId: number | null;
  academicYearId: number | null;
  semester: 'ODD' | 'EVEN';
};

export function useParentChildReportCardQuery(params: Params) {
  const { enabled, user, childId, academicYearId, semester } = params;
  const isParent = user?.role === 'PARENT';

  return useQuery({
    queryKey: ['mobile-parent-child-report-card', user?.id, childId, academicYearId, semester],
    enabled: enabled && !!user && isParent && !!childId && !!academicYearId,
    queryFn: async (): Promise<ParentChildReportCardQueryData> => {
      const cacheKey = `mobile_cache_parent_report_${user!.id}_${childId}_${academicYearId}_${semester}`;
      try {
        const reportCard = await parentApi.getChildReportCard({
          childId: Number(childId),
          academicYearId: Number(academicYearId),
          semester,
        });
        const payload = { reportCard };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_parent_report_${user!.id}_${childId}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ reportCard: ParentChildReportCard }>(cacheKey, {
          maxAgeMs: CACHE_TTL_MS,
        });
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
