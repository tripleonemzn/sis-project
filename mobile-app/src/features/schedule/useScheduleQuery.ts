import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { scheduleApi } from './scheduleApi';
import { ScheduleEntry } from './types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

type ScheduleQueryPayload = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester?: 'ODD' | 'EVEN';
  };
  entries: ScheduleEntry[];
};

export function useScheduleQuery({ enabled, user }: Params) {
  return useQuery({
    queryKey: ['mobile-schedule', user?.id, user?.role],
    enabled: enabled && !!user,
    queryFn: async () => {
      const cacheKey = `mobile_cache_schedule_${user?.id || 'unknown'}_${user?.role || 'unknown'}`;
      try {
        const activeYear = await academicYearApi.getActive();
        const isTeacherRole = user?.role === 'TEACHER' || user?.role === 'EXAMINER';

        const entries = await scheduleApi.list({
          academicYearId: activeYear.id,
          teacherId: isTeacherRole ? user?.id : undefined,
          classId: user?.role === 'STUDENT' ? user?.studentClass?.id ?? undefined : undefined,
        });

        const payload: ScheduleQueryPayload = {
          activeYear,
          entries,
        };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_schedule_${user?.id || 'unknown'}_`,
          CACHE_MAX_SNAPSHOTS_PER_FEATURE,
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<ScheduleQueryPayload>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
