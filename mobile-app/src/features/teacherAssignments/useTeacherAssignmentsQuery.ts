import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { academicYearApi } from '../academicYear/academicYearApi';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../config/cache';
import { teacherAssignmentApi } from './teacherAssignmentApi';
import { TeacherAssignment } from './types';
import { sortTeacherAssignments } from './utils';

type TeacherAssignmentsQueryData = {
  activeYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  assignments: TeacherAssignment[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useTeacherAssignmentsQuery({ enabled, user }: Params) {
  const isTeacher = user?.role === 'TEACHER';

  return useQuery({
    queryKey: ['mobile-teacher-assignments', user?.id],
    enabled: enabled && !!user && isTeacher,
    queryFn: async (): Promise<TeacherAssignmentsQueryData> => {
      const cacheKey = `mobile_cache_teacher_assignments_${user!.id}`;
      try {
        const activeYear = await academicYearApi.getActive();
        const assignments = await teacherAssignmentApi.list({
          academicYearId: activeYear.id,
          teacherId: user!.id,
        });
        const payload = { activeYear, assignments: sortTeacherAssignments(assignments) };
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_teacher_assignments_${user!.id}`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { ...payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<{ activeYear: { id: number; name: string; isActive: boolean }; assignments: TeacherAssignment[] }>(
          cacheKey,
          { maxAgeMs: CACHE_TTL_MS },
        );
        if (cache) {
          return {
            ...cache.data,
            assignments: sortTeacherAssignments(cache.data.assignments || []),
            fromCache: true,
            cachedAt: cache.updatedAt,
          };
        }
        throw error;
      }
    },
  });
}
