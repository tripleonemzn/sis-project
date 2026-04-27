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
  async getHomeroomResultPublications(params: {
    classId: number;
    semester?: 'ODD' | 'EVEN';
    publicationCode?: string;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<HomeroomResultPublicationsData> {
    const response = await apiClient.get<HomeroomResultPublicationsResponse>('/grades/homeroom-result-publications', {
      params: {
        classId: params.classId,
        semester: params.semester,
        publicationCode: params.publicationCode,
        page: params.page,
        limit: params.limit,
        search: params.search,
      },
    });
    if (!response.data?.data) {
      throw new Error('Data kontrol publikasi nilai wali kelas tidak tersedia.');
    }
    return response.data.data;
  },
  async updateHomeroomResultPublication(payload: {
    classId: number;
    studentId: number;
    publicationCode: string;
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
  }) {
    const response = await apiClient.put('/grades/homeroom-result-publications', payload);
    return response.data;
  },
};
