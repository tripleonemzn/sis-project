import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { attendanceApi } from './attendanceApi';
import { StudentAttendanceHistory } from './types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';

type StudentAttendanceQueryData = {
  records: StudentAttendanceHistory[];
  fromCache: boolean;
  cachedAt: string | null;
};

export function useStudentAttendanceQuery(params: {
  enabled: boolean;
  user: AuthUser | null;
  month: number;
  year: number;
}) {
  const { enabled, user, month, year } = params;
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-student-attendance', user?.id, month, year],
    enabled: enabled && !!user && isStudent,
    queryFn: async (): Promise<StudentAttendanceQueryData> => {
      const cacheKey = `mobile_cache_attendance_${user!.id}_${year}_${month}`;
      try {
        const records = await attendanceApi.getStudentHistory({ month, year });
        const cache = await offlineCache.set(cacheKey, records);
        await offlineCache.prunePrefix(`mobile_cache_attendance_${user!.id}_`, CACHE_MAX_SNAPSHOTS_PER_FEATURE);
        return { records, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<StudentAttendanceHistory[]>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { records: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
