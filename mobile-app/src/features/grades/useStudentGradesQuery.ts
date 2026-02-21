import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { gradeApi } from './gradeApi';
import { StudentGrade } from './types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';

type StudentGradesQueryData = {
  records: StudentGrade[];
  fromCache: boolean;
  cachedAt: string | null;
};

export function useStudentGradesQuery(params: {
  enabled: boolean;
  user: AuthUser | null;
  semester: 'ALL' | 'ODD' | 'EVEN';
}) {
  const { enabled, user, semester } = params;
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-student-grades', user?.id, semester],
    enabled: enabled && !!user && isStudent,
    queryFn: async (): Promise<StudentGradesQueryData> => {
      const cacheKey = `mobile_cache_grades_${user!.id}_${semester}`;
      try {
        const records = await gradeApi.getStudentGrades({
          studentId: user!.id,
          semester,
        });
        const cache = await offlineCache.set(cacheKey, records);
        await offlineCache.prunePrefix(`mobile_cache_grades_${user!.id}_`, CACHE_MAX_SNAPSHOTS_PER_FEATURE);
        return { records, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<StudentGrade[]>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { records: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
