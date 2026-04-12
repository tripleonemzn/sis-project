import { apiClient } from '../../lib/api/client';
import { StudentGradeOverviewData } from './types';

type StudentGradeOverviewResponse = {
  success: boolean;
  message: string;
  data: StudentGradeOverviewData;
};

export const gradeApi = {
  async getStudentOverview(): Promise<StudentGradeOverviewData> {
    const response = await apiClient.get<StudentGradeOverviewResponse>('/grades/student-overview');
    if (!response.data?.data) {
      throw new Error('Data nilai siswa tidak tersedia.');
    }
    return response.data.data;
  },
};
