import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { examinerApi } from './examinerApi';
import { ExaminerAssessment } from './types';

type ExaminerAssessmentsQueryData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  assessments: ExaminerAssessment[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useExaminerAssessmentsQuery({ enabled, user }: Params) {
  const isExaminer = user?.role === 'EXAMINER';

  return useQuery({
    queryKey: ['mobile-examiner-assessments', user?.id],
    enabled: enabled && !!user && isExaminer,
    queryFn: async (): Promise<ExaminerAssessmentsQueryData> => {
      const cacheKey = `mobile_cache_examiner_assessments_${user!.id}`;
      try {
        let activeYear: { id: number; name: string; isActive: boolean } | null = null;
        try {
          activeYear = await academicYearApi.getActive();
        } catch {
          activeYear = null;
        }

        const assessments = await examinerApi.listAssessments(
          activeYear
            ? {
                academicYearId: activeYear.id,
              }
            : undefined,
        );

        const payload = { activeYear, assessments };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_examiner_assessments_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ activeYear: { id: number; name: string; isActive: boolean } | null; assessments: ExaminerAssessment[] }>(
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
