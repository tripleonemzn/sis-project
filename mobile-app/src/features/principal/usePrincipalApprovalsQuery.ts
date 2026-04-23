import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { principalApi } from './principalApi';
import { PrincipalBudgetRequest } from './types';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';

type PrincipalApprovalsQueryData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  approvals: PrincipalBudgetRequest[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function usePrincipalApprovalsQuery({ enabled, user }: Params) {
  const isPrincipal = user?.role === 'PRINCIPAL';

  return useQuery({
    queryKey: ['mobile-principal-approvals', user?.id],
    enabled: enabled && !!user && isPrincipal,
    queryFn: async (): Promise<PrincipalApprovalsQueryData> => {
      try {
        let activeYear: { id: number; name: string; isActive: boolean } | null = null;
        try {
          activeYear = await academicYearApi.getActive();
        } catch {
          activeYear = null;
        }
        const cacheKey = `mobile_cache_principal_approvals_${user!.id}_${activeYear?.id || 0}`;

        const approvals = await principalApi.listBudgetApprovals({
          academicYearId: activeYear?.id,
        });

        const payload = { activeYear, approvals };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_principal_approvals_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        let activeYearId = 0;
        try {
          const activeYear = await academicYearApi.getActive({ allowStaleOnError: true });
          activeYearId = activeYear?.id || 0;
        } catch {
          activeYearId = 0;
        }
        const cacheKey = `mobile_cache_principal_approvals_${user!.id}_${activeYearId}`;
        const cache = await offlineCache.get<{ activeYear: { id: number; name: string; isActive: boolean } | null; approvals: PrincipalBudgetRequest[] }>(
          cacheKey,
          { maxAgeMs: CACHE_TTL_MS },
        );
        if (cache) {
          return { ...cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
    ...mobileLiveQueryOptions,
  });
}
