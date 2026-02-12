import api from './api';

export const tutorService = {
  getAssignments: async (academicYearId?: number) => {
    const params = academicYearId ? { academicYearId } : {};
    const response = await api.get('/tutor/assignments', { params });
    return response.data;
  },

  getMembers: async (ekskulId: number, academicYearId: number) => {
    const response = await api.get('/tutor/members', { 
      params: { ekskulId, academicYearId } 
    });
    return response.data;
  },

  inputGrade: async (data: { 
    enrollmentId: number, 
    grade: string, 
    description: string,
    semester?: 'ODD' | 'EVEN',
    reportType?: 'SBTS' | 'SAS' | 'SAT'
  }) => {
    const response = await api.post('/tutor/grades', data);
    return response.data;
  }
};
