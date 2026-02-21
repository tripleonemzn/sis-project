import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { staffApi } from './staffApi';
import { StaffBudgetRequest } from './types';

type StaffPaymentsQueryData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  budgets: StaffBudgetRequest[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useStaffPaymentsQuery({ enabled, user }: Params) {
  const isStaff = user?.role === 'STAFF';

  return useQuery({
    queryKey: ['mobile-staff-payments', user?.id],
    enabled: enabled && !!user && isStaff,
    queryFn: async (): Promise<StaffPaymentsQueryData> => {
      const cacheKey = `mobile_cache_staff_payments_${user!.id}`;
      try {
        let activeYear: { id: number; name: string; isActive: boolean } | null = null;
        try {
          activeYear = await academicYearApi.getActive();
        } catch {
          activeYear = null;
        }

        const budgets = await staffApi.listBudgetRequests(
          activeYear
            ? {
                academicYearId: activeYear.id,
              }
            : undefined,
        );

        const payload = { activeYear, budgets };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_staff_payments_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ activeYear: { id: number; name: string; isActive: boolean } | null; budgets: StaffBudgetRequest[] }>(
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
