import { useQuery } from '@tanstack/react-query';
import { authService } from '../auth/authService';
import { AuthUser } from '../auth/types';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';

const PROFILE_CACHE_KEY = 'mobile_cache_profile';
export const MOBILE_PROFILE_QUERY_KEY = ['mobile-me'] as const;

type ProfileQueryData = {
  profile: AuthUser;
  fromCache: boolean;
  cachedAt: string | null;
};

export function useProfileQuery(enabled: boolean) {
  return useQuery({
    queryKey: MOBILE_PROFILE_QUERY_KEY,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    queryFn: async (): Promise<ProfileQueryData> => {
      try {
        const profile = await authService.me();
        const cache = await offlineCache.set(PROFILE_CACHE_KEY, profile);
        await offlineCache.prunePrefix('mobile_cache_profile', Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE));
        return { profile, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<AuthUser>(PROFILE_CACHE_KEY, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { profile: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
    enabled,
  });
}
