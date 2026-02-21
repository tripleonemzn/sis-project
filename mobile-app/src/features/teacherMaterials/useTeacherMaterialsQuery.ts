import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { teacherMaterialsApi } from './teacherMaterialsApi';
import { TeacherAssignmentItem, TeacherMaterial } from './types';

type TeacherMaterialsQueryData = {
  materials: TeacherMaterial[];
  assignments: TeacherAssignmentItem[];
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useTeacherMaterialsQuery({ enabled, user }: Params) {
  const isTeacher = user?.role === 'TEACHER';

  return useQuery({
    queryKey: ['mobile-teacher-materials', user?.id],
    enabled: enabled && !!user && isTeacher,
    queryFn: async (): Promise<TeacherMaterialsQueryData> => {
      const [materials, assignments] = await Promise.all([
        teacherMaterialsApi.listMaterials(),
        teacherMaterialsApi.listAssignments(),
      ]);
      return { materials, assignments };
    },
  });
}
