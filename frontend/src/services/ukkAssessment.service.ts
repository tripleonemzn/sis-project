import api from './api';

export interface UKKCriteria {
  id?: string;
  name: string;
  maxScore: number;
  aliases?: string[];
}

export interface UKKAssessmentData {
  id?: number;
  studentId: number;
  subjectId: number;
  academicYearId: number;
  examinerId?: number;
  criteria: UKKCriteria[];
  scores: Record<string, number>;
  finalScore: number;
}

export const ukkAssessmentService = {
  upsertAssessment: async (data: UKKAssessmentData) => {
    const response = await api.post('/ukk-assessments', data);
    return response.data;
  },

  getAssessment: async (studentId: number, subjectId: number, academicYearId: number) => {
    const response = await api.get('/ukk-assessments/detail', {
      params: { studentId, subjectId, academicYearId }
    });
    return response.data;
  },

  getExaminerAssessments: async (academicYearId?: number) => {
    const response = await api.get('/ukk-assessments/examiner', {
      params: { academicYearId }
    });
    return response.data;
  }
};
