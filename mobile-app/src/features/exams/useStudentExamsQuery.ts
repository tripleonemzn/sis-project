import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { offlineCache } from '../../lib/storage/offlineCache';
import { examApi } from './examApi';
import { StudentExamItem } from './types';

type StudentExamsQueryData = {
  exams: StudentExamItem[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useStudentExamsQuery({ enabled, user }: Params) {
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';

  return useQuery({
    queryKey: ['mobile-student-exams', user?.id],
    enabled: enabled && !!user && canAccessExams,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<StudentExamsQueryData> => {
      const cacheKey = `mobile_cache_student_exams_${user!.id}`;
      try {
        const exams = await examApi.getStudentAvailableExams();
        const cache = await offlineCache.set(cacheKey, exams);
        await offlineCache.prunePrefix(
          `mobile_cache_student_exams_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { exams, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<StudentExamItem[]>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { exams: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
