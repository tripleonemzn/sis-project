import { apiClient } from '../../lib/api/client';
import { HomeroomResultPublicationsData, StudentGradeOverviewData } from './types';

type StudentGradeOverviewResponse = {
  success: boolean;
  message: string;
  data: StudentGradeOverviewData;
};

type HomeroomResultPublicationsResponse = {
  success: boolean;
  message: string;
  data: HomeroomResultPublicationsData;
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
  async getHomeroomResultPublications(params: { classId: number }): Promise<HomeroomResultPublicationsData> {
    const response = await apiClient.get<HomeroomResultPublicationsResponse>('/grades/homeroom-result-publications', {
      params: {
        classId: params.classId,
      },
    });
    if (!response.data?.data) {
      throw new Error('Data kontrol publikasi nilai wali kelas tidak tersedia.');
    }
    return response.data.data;
  },
  async updateHomeroomResultPublication(payload: {
    classId: number;
    publicationCode: string;
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
  }) {
    const response = await apiClient.put('/grades/homeroom-result-publications', payload);
    return response.data;
  },
};
