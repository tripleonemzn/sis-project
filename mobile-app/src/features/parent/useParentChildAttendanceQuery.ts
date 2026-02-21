import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { parentApi } from './parentApi';
import { ParentAttendanceRecord } from './types';

type ParentChildAttendanceQueryData = {
  records: ParentAttendanceRecord[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  childId: number | null;
  month: number;
  year: number;
};

export function useParentChildAttendanceQuery(params: Params) {
  const { enabled, user, childId, month, year } = params;
  const isParent = user?.role === 'PARENT';

  return useQuery({
    queryKey: ['mobile-parent-child-attendance', user?.id, childId, year, month],
    enabled: enabled && !!user && isParent && !!childId,
    queryFn: async (): Promise<ParentChildAttendanceQueryData> => {
      const cacheKey = `mobile_cache_parent_attendance_${user!.id}_${childId}_${year}_${month}`;
      try {
        const records = await parentApi.getChildAttendanceHistory({
          childId: Number(childId),
          month,
          year,
        });
        const payload = { records };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_parent_attendance_${user!.id}_${childId}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ records: ParentAttendanceRecord[] }>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
