import api from './api';

export interface SubjectCategory {
  id: number;
  code: string;
  name: string;
  description?: string;
  _count?: {
    subjects: number;
  };
}

interface SubjectCategoryPayload {
  code: string;
  name: string;
  description?: string;
}

interface ApiResponse<T> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

export const getSubjectCategories = async () => {
  const response = await api.get<ApiResponse<SubjectCategory[]>>('/subject-categories');
  return response.data.data;
};

export const createSubjectCategory = async (data: SubjectCategoryPayload) => {
  const response = await api.post<ApiResponse<SubjectCategory>>('/subject-categories', data);
  return response.data.data;
};

export const updateSubjectCategory = async (id: number, data: Partial<SubjectCategoryPayload>) => {
  const response = await api.patch<ApiResponse<SubjectCategory>>(`/subject-categories/${id}`, data);
  return response.data.data;
};

export const deleteSubjectCategory = async (id: number) => {
  const response = await api.delete<ApiResponse<null>>(`/subject-categories/${id}`);
  return response.data.data;
};
