import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { offlineCache } from '../../lib/storage/offlineCache';
import { permissionApi } from './permissionApi';
import { StudentPermission } from './types';

type PermissionsQueryData = {
  permissions: StudentPermission[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useStudentPermissionsQuery({ enabled, user }: Params) {
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-student-permissions', user?.id],
    enabled: enabled && !!user && isStudent,
    queryFn: async (): Promise<PermissionsQueryData> => {
      const cacheKey = `mobile_cache_permissions_${user!.id}`;
      try {
        const permissions = await permissionApi.list();
        const cache = await offlineCache.set(cacheKey, permissions);
        await offlineCache.prunePrefix(
          `mobile_cache_permissions_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { permissions, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<StudentPermission[]>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { permissions: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });
}
