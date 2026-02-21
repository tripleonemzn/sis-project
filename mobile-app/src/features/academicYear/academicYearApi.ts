import { apiClient } from '../../lib/api/client';

type ActiveAcademicYearResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    id: number;
    name: string;
    isActive: boolean;
  };
};

export const academicYearApi = {
  async getActive() {
    const response = await apiClient.get<ActiveAcademicYearResponse>('/academic-years/active');
    return response.data.data;
  },
};

