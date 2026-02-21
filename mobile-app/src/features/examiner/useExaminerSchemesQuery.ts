import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { examinerApi } from './examinerApi';
import { ExaminerScheme } from './types';

type ExaminerSchemesQueryData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  schemes: ExaminerScheme[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useExaminerSchemesQuery({ enabled, user }: Params) {
  const isExaminer = user?.role === 'EXAMINER';

  return useQuery({
    queryKey: ['mobile-examiner-schemes', user?.id],
    enabled: enabled && !!user && isExaminer,
    queryFn: async (): Promise<ExaminerSchemesQueryData> => {
      const cacheKey = `mobile_cache_examiner_schemes_${user!.id}`;
      try {
        let activeYear: { id: number; name: string; isActive: boolean } | null = null;
        try {
          activeYear = await academicYearApi.getActive();
        } catch {
          activeYear = null;
        }

        const schemes = await examinerApi.listSchemes(
          activeYear
            ? {
                academicYearId: activeYear.id,
              }
            : undefined,
        );

        const payload = { activeYear, schemes };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_examiner_schemes_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ activeYear: { id: number; name: string; isActive: boolean } | null; schemes: ExaminerScheme[] }>(
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
