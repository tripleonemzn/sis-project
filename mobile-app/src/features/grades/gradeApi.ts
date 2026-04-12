import { apiClient } from '../../lib/api/client';
import { StudentGradeOverviewData } from './types';

type StudentGradeOverviewResponse = {
  success: boolean;
  message: string;
  data: StudentGradeOverviewData;
};

export const gradeApi = {
  async getStudentOverview(params?: { reportSemester?: 'ODD' | 'EVEN' }): Promise<StudentGradeOverviewData> {
    const response = await apiClient.get<StudentGradeOverviewResponse>('/grades/student-overview', {
      params: params?.reportSemester
        ? {
            report_semester: params.reportSemester,
          }
        : undefined,
    });
    if (!response.data?.data) {
      throw new Error('Data nilai siswa tidak tersedia.');
    }
    return response.data.data;
  },
};
