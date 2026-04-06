import { useQuery } from '@tanstack/react-query';
import { AuthUser } from '../auth/types';
import { examApi } from './examApi';
import { StudentExamItem } from './types';

type StudentExamsQueryData = {
  exams: StudentExamItem[];
  fromCache: boolean;
  cachedAt: string | null;
};

type Params = {
  enabled: boolean;
  user: AuthUser | null;
};

export function useStudentExamsQuery({ enabled, user }: Params) {
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';

  return useQuery({
    queryKey: ['mobile-student-exams', user?.id],
    enabled: enabled && !!user && canAccessExams,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<StudentExamsQueryData> => {
      const exams = await examApi.getStudentAvailableExams();
      return { exams, fromCache: false, cachedAt: null };
    },
  });
}
