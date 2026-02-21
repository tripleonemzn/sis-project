import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { offlineCache } from '../../lib/storage/offlineCache';
import { learningApi } from './learningApi';
import { AssignmentWithSubmission, LearningAssignment, LearningMaterial, LearningSubmission } from './types';

type LearningQueryData = {
  materials: LearningMaterial[];
  assignments: AssignmentWithSubmission[];
  fromCache: boolean;
  cachedAt: string | null;
};

type LearningPayload = {
  materials: LearningMaterial[];
  assignments: LearningAssignment[];
  submissions: LearningSubmission[];
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

function mapAssignmentWithSubmission(
  assignments: LearningAssignment[],
  submissions: LearningSubmission[],
): AssignmentWithSubmission[] {
  const submissionMap = new Map<number, LearningSubmission>();
  for (const item of submissions) {
    submissionMap.set(item.assignmentId, item);
  }
  return assignments.map((item) => ({
    ...item,
    submission: submissionMap.get(item.id) || null,
  }));
}

export function useLearningQuery({ enabled, user }: Params) {
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-learning', user?.id],
    enabled: enabled && !!user && isStudent,
    queryFn: async (): Promise<LearningQueryData> => {
      const cacheKey = `mobile_cache_learning_${user!.id}`;
      try {
        const [materials, assignments, submissions] = await Promise.all([
          learningApi.getMaterials(),
          learningApi.getAssignments(),
          learningApi.getMySubmissions(user!.id),
        ]);
        const payload: LearningPayload = { materials, assignments, submissions };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_learning_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return {
          materials,
          assignments: mapAssignmentWithSubmission(assignments, submissions),
          fromCache: false,
          cachedAt: cache.updatedAt,
        };
      } catch (error) {
        const cache = await offlineCache.get<LearningPayload>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return {
            materials: cache.data.materials || [],
            assignments: mapAssignmentWithSubmission(
              cache.data.assignments || [],
              cache.data.submissions || [],
            ),
            fromCache: true,
            cachedAt: cache.updatedAt,
          };
        }
        throw error;
      }
    },
  });
}
