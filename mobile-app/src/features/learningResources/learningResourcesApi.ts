import { apiClient } from '../../lib/api/client';
import { CpTpAnalysisItem, CpTpAnalysisRecord } from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const learningResourcesApi = {
  async getCpTpAnalysis(params: {
    teacherId: number;
    subjectId: number;
    level: string;
    academicYearId: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<CpTpAnalysisRecord | null>>('/cp-tp-analyses', {
      params: {
        teacherId: params.teacherId,
        subjectId: params.subjectId,
        level: params.level,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data || null;
  },

  async saveCpTpAnalysis(payload: {
    teacherId: number;
    subjectId: number;
    level: string;
    academicYearId: number;
    content: CpTpAnalysisItem[];
    principalName?: string;
    titimangsa?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<CpTpAnalysisRecord>>('/cp-tp-analyses', payload);
    return response.data?.data;
  },
};
