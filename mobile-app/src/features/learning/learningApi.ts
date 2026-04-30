import { apiClient } from '../../lib/api/client';
import { LearningAssignment, LearningMaterial, LearningRemedialActivity, LearningSubmission } from './types';

type MaterialsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    materials: LearningMaterial[];
  };
};

type AssignmentsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    assignments: LearningAssignment[];
  };
};

type SubmissionsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    submissions: Array<{
      id: number;
      assignmentId: number;
      studentId: number;
      content: string | null;
      fileUrl: string | null;
      fileName: string | null;
      fileSize?: number | null;
      score: number | null;
      feedback: string | null;
      submittedAt: string;
      assignment: {
        id: number;
      };
    }>;
  };
};

type SubmissionMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: LearningSubmission;
};

type RemedialActivitiesResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: LearningRemedialActivity[];
};

type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

export const learningApi = {
  async getMaterials() {
    const response = await apiClient.get<MaterialsResponse>('/materials', {
      params: {
        isPublished: true,
        limit: 100,
      },
    });
    return response.data.data.materials || [];
  },
  async getAssignments() {
    const response = await apiClient.get<AssignmentsResponse>('/assignments', {
      params: {
        isPublished: true,
        limit: 100,
      },
    });
    return response.data.data.assignments || [];
  },
  async getRemedialActivities() {
    const response = await apiClient.get<RemedialActivitiesResponse>('/grades/remedials/student-activities', {
      params: {
        limit: 100,
      },
    });
    return response.data.data || [];
  },
  async getMySubmissions(studentId: number) {
    const response = await apiClient.get<SubmissionsResponse>('/submissions', {
      params: {
        studentId,
        limit: 1000,
      },
    });
    return (response.data.data.submissions || []).map((item) => ({
      id: item.id,
      assignmentId: item.assignment?.id ?? item.assignmentId,
      studentId: item.studentId,
      content: item.content,
      fileUrl: item.fileUrl,
      fileName: item.fileName,
      fileSize: item.fileSize,
      score: item.score,
      feedback: item.feedback,
      submittedAt: item.submittedAt,
    }));
  },
  async submitAssignment(payload: {
    assignmentId: number;
    content?: string;
    file?: { uri: string; name?: string; mimeType?: string } | null;
  }) {
    const formData = new FormData();
    formData.append('assignmentId', String(payload.assignmentId));
    if (payload.content?.trim()) {
      formData.append('content', payload.content.trim());
    }
    if (payload.file?.uri) {
      const filePart: ReactNativeFilePart = {
        uri: payload.file.uri,
        name: payload.file.name || 'submission-file',
        type: payload.file.mimeType || 'application/octet-stream',
      };
      formData.append('file', filePart as unknown as Blob);
    }
    const response = await apiClient.post<SubmissionMutationResponse>('/submissions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },
};
