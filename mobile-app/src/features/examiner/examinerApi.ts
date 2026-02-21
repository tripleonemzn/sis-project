import { apiClient } from '../../lib/api/client';
import {
  CreateExaminerSchemePayload,
  ExaminerAssessment,
  ExaminerScheme,
  UpdateExaminerSchemePayload,
  UpsertExaminerAssessmentPayload,
} from './types';

type ApiListResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T[];
};

export const examinerApi = {
  async listSchemes(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiListResponse<ExaminerScheme>>('/ukk-schemes', {
      params: {
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data || [];
  },
  async listAssessments(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiListResponse<ExaminerAssessment>>('/ukk-assessments/examiner', {
      params: {
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data || [];
  },
  async getSchemeDetail(id: number) {
    const response = await apiClient.get<{
      statusCode: number;
      success: boolean;
      message: string;
      data: ExaminerScheme;
    }>(`/ukk-schemes/${id}`);
    return response.data?.data;
  },
  async createScheme(payload: CreateExaminerSchemePayload) {
    const response = await apiClient.post<{
      statusCode: number;
      success: boolean;
      message: string;
      data: ExaminerScheme;
    }>('/ukk-schemes', payload);
    return response.data?.data;
  },
  async updateScheme(id: number, payload: UpdateExaminerSchemePayload) {
    const response = await apiClient.put<{
      statusCode: number;
      success: boolean;
      message: string;
      data: ExaminerScheme;
    }>(`/ukk-schemes/${id}`, payload);
    return response.data?.data;
  },
  async deleteScheme(id: number) {
    const response = await apiClient.delete<{
      statusCode: number;
      success: boolean;
      message: string;
      data: null;
    }>(`/ukk-schemes/${id}`);
    return response.data?.success;
  },
  async upsertAssessment(payload: UpsertExaminerAssessmentPayload) {
    const response = await apiClient.post<{
      statusCode: number;
      success: boolean;
      message: string;
      data: ExaminerAssessment;
    }>('/ukk-assessments', payload);
    return response.data?.data;
  },
};
