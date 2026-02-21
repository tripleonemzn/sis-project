import { apiClient } from '../../lib/api/client';
import { StudentGrade } from './types';

type StudentGradeResponse = {
  success: boolean;
  message: string;
  data: StudentGrade[];
};

export const gradeApi = {
  async getStudentGrades(params: { studentId: number; semester?: 'ALL' | 'ODD' | 'EVEN' }) {
    const query: Record<string, string | number> = {
      student_id: params.studentId,
    };
    if (params.semester && params.semester !== 'ALL') {
      query.semester = params.semester;
    }

    const response = await apiClient.get<StudentGradeResponse>('/grades/student-grades', {
      params: query,
    });
    return response.data?.data || [];
  },
};

