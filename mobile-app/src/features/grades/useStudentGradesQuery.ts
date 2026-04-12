import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { gradeApi } from './gradeApi';
import { StudentGradeOverviewData } from './types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';

type StudentGradesQueryData = {
  overview: StudentGradeOverviewData;
  fromCache: boolean;
  cachedAt: string | null;
};

export function useStudentGradesQuery(params: {
  enabled: boolean;
  user: AuthUser | null;
}) {
  const { enabled, user } = params;
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-student-grade-overview', user?.id],
    enabled: enabled && !!user && isStudent,
    queryFn: async (): Promise<StudentGradesQueryData> => {
      const cacheKey = `mobile_cache_grade_overview_${user!.id}`;
      try {
        const overview = await gradeApi.getStudentOverview();
        const cache = await offlineCache.set(cacheKey, overview);
        await offlineCache.prunePrefix('mobile_cache_grade_overview_', CACHE_MAX_SNAPSHOTS_PER_FEATURE);
        return { overview, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<StudentGradeOverviewData>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { overview: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
