import api from './api';

export interface CpTpAnalysisData {
  id?: number;
  teacherId: number;
  subjectId: number;
  academicYearId: number;
  level: string;
  phase?: string;
  content: any; // Json
  principalName?: string;
  titimangsa?: string;
  updatedAt?: string;
}

export const cpTpAnalysisService = {
  // Get analysis by context
  getAnalysis: async (params: { teacherId: number; subjectId: number; level: string; academicYearId: number }) => {
    return api.get('/cp-tp-analyses', { params });
  },

  // Save (Upsert) analysis
  saveAnalysis: async (data: CpTpAnalysisData) => {
    return api.post('/cp-tp-analyses', data);
  }
};
