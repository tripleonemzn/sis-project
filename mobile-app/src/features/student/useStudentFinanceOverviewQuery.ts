import { useQuery } from '@tanstack/react-query';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { offlineCache } from '../../lib/storage/offlineCache';
import { AuthUser } from '../auth/types';
import { studentFinanceApi, StudentFinanceOverview } from './studentFinanceApi';

type StudentFinanceOverviewQueryData = {
  overview: StudentFinanceOverview;
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  limit?: number;
};

export function useStudentFinanceOverviewQuery(params: Params) {
  const { enabled, user, limit = 50 } = params;
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-student-finance-overview', user?.id, limit],
    enabled: enabled && !!user && isStudent,
    queryFn: async (): Promise<StudentFinanceOverviewQueryData> => {
      const cacheKey = `mobile_cache_student_finance_${user!.id}_${limit}`;
      try {
        const overview = await studentFinanceApi.getStudentFinanceOverview({ limit });
        const payload = { overview };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_student_finance_${user!.id}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ overview: StudentFinanceOverview }>(cacheKey, {
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

