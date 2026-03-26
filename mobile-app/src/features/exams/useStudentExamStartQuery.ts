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
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';

  return useQuery({
    queryKey: ['mobile-student-exam-start', user?.id, scheduleId],
    enabled: enabled && !!user && canAccessExams && !!scheduleId,
    queryFn: async (): Promise<StudentExamStartPayload> => examApi.startStudentExam(scheduleId!),
    retry: 1,
  });
}
