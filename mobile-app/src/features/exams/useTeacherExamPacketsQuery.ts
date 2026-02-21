import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { examApi } from './examApi';
import { TeacherExamPacket } from './types';

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  subjectId?: number;
  academicYearId?: number;
  semester?: 'ODD' | 'EVEN';
};

export function useTeacherExamPacketsQuery(params: Params) {
  const { enabled, user, subjectId, academicYearId, semester } = params;
  const isTeacher = user?.role === 'TEACHER';

  return useQuery({
    queryKey: ['mobile-teacher-exam-packets', user?.id, subjectId, academicYearId, semester],
    enabled: enabled && !!user && isTeacher,
    queryFn: async (): Promise<TeacherExamPacket[]> =>
      examApi.getTeacherPackets({
        subjectId,
        academicYearId,
        semester,
      }),
  });
}
