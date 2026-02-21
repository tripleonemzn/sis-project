import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { examApi } from './examApi';
import { StudentExamStartPayload } from './types';

type Params = {
  enabled: boolean;
  user: AuthUser | null;
  scheduleId: number | null;
};

export function useStudentExamStartQuery({ enabled, user, scheduleId }: Params) {
  const isStudent = user?.role === 'STUDENT';

  return useQuery({
    queryKey: ['mobile-student-exam-start', user?.id, scheduleId],
    enabled: enabled && !!user && isStudent && !!scheduleId,
    queryFn: async (): Promise<StudentExamStartPayload> => examApi.startStudentExam(scheduleId!),
    retry: 1,
  });
}
