import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { staffApi } from './staffApi';
import { StaffStudent } from './types';

type StaffStudentsQueryData = {
  students: StaffStudent[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useStaffStudentsQuery({ enabled, user }: Params) {
  const isStaff = user?.role === 'STAFF';

  return useQuery({
    queryKey: ['mobile-staff-students', user?.id],
    enabled: enabled && !!user && isStaff,
    queryFn: async (): Promise<StaffStudentsQueryData> => {
      const cacheKey = `mobile_cache_staff_students_${user!.id}`;
      try {
        const students = await staffApi.listStudents();
        const payload = { students };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_staff_students_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ students: StaffStudent[] }>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
