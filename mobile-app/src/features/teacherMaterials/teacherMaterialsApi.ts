import { apiClient } from '../../lib/api/client';
import { TeacherAssignmentItem, TeacherAssignmentSubmission, TeacherMaterial } from './types';

type MaterialsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    materials: TeacherMaterial[];
  };
};

type AssignmentsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    assignments: TeacherAssignmentItem[];
  };
};

type MaterialMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherMaterial;
};

type AssignmentMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherAssignmentItem;
};

type SubmissionsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    submissions: TeacherAssignmentSubmission[];
  };
};

type SubmissionMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherAssignmentSubmission;
};

type ReactNativeUploadPart = {
  uri: string;
  name: string;
  type: string;
};

function appendUploadFile(
  formData: FormData,
  file: { uri: string; name?: string; mimeType?: string },
  fallbackName: string,
) {
  const uploadPart: ReactNativeUploadPart = {
    uri: file.uri,
    name: file.name || fallbackName,
    type: file.mimeType || 'application/octet-stream',
  };
  formData.append('file', uploadPart as unknown as Blob);
}

export const teacherMaterialsApi = {
  async listMaterials() {
    const response = await apiClient.get<MaterialsResponse>('/materials', {
      params: { limit: 200 },
    });
    return response.data.data.materials || [];
  },
  async listAssignments() {
    const response = await apiClient.get<AssignmentsResponse>('/assignments', {
      params: { limit: 200 },
    });
    return response.data.data.assignments || [];
  },
  async createMaterial(payload: {
    title: string;
    description?: string;
    classId?: number;
    subjectId: number;
    academicYearId?: number;
    youtubeUrl?: string;
    isPublished: boolean;
    file?: { uri: string; name?: string; mimeType?: string } | null;
  }) {
    const formData = new FormData();
    formData.append('title', payload.title);
    if (payload.description?.trim()) formData.append('description', payload.description.trim());
    if (payload.classId) formData.append('classId', String(payload.classId));
    formData.append('subjectId', String(payload.subjectId));
    if (payload.academicYearId) formData.append('academicYearId', String(payload.academicYearId));
    if (payload.youtubeUrl?.trim()) formData.append('youtubeUrl', payload.youtubeUrl.trim());
    formData.append('isPublished', String(payload.isPublished));
    if (payload.file?.uri) {
      appendUploadFile(formData, payload.file, 'material-file');
    }

    const response = await apiClient.post<MaterialMutationResponse>('/materials', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
  async createAssignment(payload: {
    title: string;
    description?: string;
    classId: number;
    subjectId: number;
    academicYearId: number;
    dueDateIso: string;
    allowResubmit: boolean;
    maxScore: number;
    isPublished: boolean;
    file?: { uri: string; name?: string; mimeType?: string } | null;
  }) {
    const formData = new FormData();
    formData.append('title', payload.title);
    if (payload.description?.trim()) formData.append('description', payload.description.trim());
    formData.append('classId', String(payload.classId));
    formData.append('subjectId', String(payload.subjectId));
    formData.append('academicYearId', String(payload.academicYearId));
    formData.append('dueDate', payload.dueDateIso);
    formData.append('allowResubmit', String(payload.allowResubmit));
    formData.append('maxScore', String(payload.maxScore));
    formData.append('isPublished', String(payload.isPublished));
    if (payload.file?.uri) {
      appendUploadFile(formData, payload.file, 'assignment-file');
    }

    const response = await apiClient.post<AssignmentMutationResponse>('/assignments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
  async updateMaterialPublish(id: number, isPublished: boolean) {
    const response = await apiClient.put<MaterialMutationResponse>(`/materials/${id}`, {
      isPublished,
    });
    return response.data.data;
  },
  async updateMaterial(payload: {
    id: number;
    title: string;
    description?: string;
    classId?: number;
    subjectId?: number;
    youtubeUrl?: string;
    isPublished: boolean;
    file?: { uri: string; name?: string; mimeType?: string } | null;
  }) {
    const formData = new FormData();
    formData.append('title', payload.title);
    if (payload.description !== undefined) formData.append('description', payload.description);
    if (payload.classId) formData.append('classId', String(payload.classId));
    if (payload.subjectId) formData.append('subjectId', String(payload.subjectId));
    formData.append('isPublished', String(payload.isPublished));
    if (payload.youtubeUrl !== undefined) formData.append('youtubeUrl', payload.youtubeUrl);
    if (payload.file?.uri) {
      appendUploadFile(formData, payload.file, 'material-file');
    }

    const response = await apiClient.put<MaterialMutationResponse>(`/materials/${payload.id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
  async updateAssignmentPublish(id: number, isPublished: boolean) {
    const response = await apiClient.put<AssignmentMutationResponse>(`/assignments/${id}`, {
      isPublished,
    });
    return response.data.data;
  },
  async updateAssignment(payload: {
    id: number;
    title: string;
    description?: string;
    classId?: number;
    subjectId?: number;
    dueDateIso: string;
    allowResubmit: boolean;
    maxScore: number;
    isPublished: boolean;
    file?: { uri: string; name?: string; mimeType?: string } | null;
  }) {
    const formData = new FormData();
    formData.append('title', payload.title);
    if (payload.description !== undefined) formData.append('description', payload.description);
    if (payload.classId) formData.append('classId', String(payload.classId));
    if (payload.subjectId) formData.append('subjectId', String(payload.subjectId));
    formData.append('dueDate', payload.dueDateIso);
    formData.append('allowResubmit', String(payload.allowResubmit));
    formData.append('maxScore', String(payload.maxScore));
    formData.append('isPublished', String(payload.isPublished));
    if (payload.file?.uri) {
      appendUploadFile(formData, payload.file, 'assignment-file');
    }

    const response = await apiClient.put<AssignmentMutationResponse>(`/assignments/${payload.id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
  async copyMaterial(id: number, targetClassIds: number[]) {
    await apiClient.post(`/materials/${id}/copy`, { targetClassIds });
  },
  async copyAssignment(id: number, targetClassIds: number[]) {
    await apiClient.post(`/assignments/${id}/copy`, { targetClassIds });
  },
  async listAssignmentSubmissions(assignmentId: number) {
    const response = await apiClient.get<SubmissionsResponse>('/submissions', {
      params: { assignmentId, limit: 300 },
    });
    return response.data.data.submissions || [];
  },
  async gradeSubmission(payload: { submissionId: number; score: number; feedback?: string }) {
    const response = await apiClient.put<SubmissionMutationResponse>(
      `/submissions/${payload.submissionId}/grade`,
      {
        score: payload.score,
        feedback: payload.feedback || null,
      },
    );
    return response.data.data;
  },
  async deleteMaterial(id: number) {
    await apiClient.delete(`/materials/${id}`);
  },
  async deleteAssignment(id: number) {
    await apiClient.delete(`/assignments/${id}`);
  },
};
