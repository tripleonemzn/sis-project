import { apiClient } from '../../lib/api/client';
import {
  KesiswaanBehaviorListPayload,
  KesiswaanCreateBehaviorPayload,
  KesiswaanUpdateBehaviorPayload,
  KesiswaanBehavior,
  KesiswaanPermission,
  KesiswaanPermissionListPayload,
  KesiswaanPermissionStatus,
  KesiswaanBehaviorType,
  KesiswaanExtracurricular,
  KesiswaanPagination,
  KesiswaanTutorAssignment,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type ExtracurricularListPayload = {
  extracurriculars: KesiswaanExtracurricular[];
  pagination: KesiswaanPagination;
};

export const kesiswaanApi = {
  async listExtracurriculars(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<ApiEnvelope<ExtracurricularListPayload>>('/extracurriculars', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
      },
    });
    return response.data?.data || {
      extracurriculars: [],
      pagination: {
        page: 1,
        limit: params?.limit ?? 100,
        total: 0,
        totalPages: 1,
      },
    };
  },

  async listTutorAssignments(params?: { academicYearId?: number; ekskulId?: number }) {
    const response = await apiClient.get<ApiEnvelope<KesiswaanTutorAssignment[]>>('/extracurriculars/assignments', {
      params: {
        academicYearId: params?.academicYearId,
        ekskulId: params?.ekskulId,
      },
    });
    return response.data?.data || [];
  },

  async getBehaviors(params: {
    classId: number;
    academicYearId: number;
    type?: KesiswaanBehaviorType;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<KesiswaanBehaviorListPayload>>('/behaviors', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        type: params.type,
        search: params.search,
        page: params.page ?? 1,
        limit: params.limit ?? 10,
      },
    });
    return response.data?.data || {
      behaviors: [],
      meta: {
        page: params.page ?? 1,
        limit: params.limit ?? 10,
        total: 0,
        totalPages: 1,
      },
    };
  },

  async createBehavior(payload: KesiswaanCreateBehaviorPayload) {
    const response = await apiClient.post<ApiEnvelope<KesiswaanBehavior>>('/behaviors', payload);
    return response.data?.data;
  },

  async updateBehavior(behaviorId: number, payload: KesiswaanUpdateBehaviorPayload) {
    const response = await apiClient.put<ApiEnvelope<KesiswaanBehavior>>(`/behaviors/${behaviorId}`, payload);
    return response.data?.data;
  },

  async deleteBehavior(behaviorId: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/behaviors/${behaviorId}`);
    return response.data?.success ?? true;
  },

  async listPermissionApprovals(params?: {
    classId?: number;
    academicYearId?: number;
    status?: KesiswaanPermissionStatus;
    type?: 'SICK' | 'PERMISSION' | 'OTHER';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<KesiswaanPermissionListPayload>>('/permissions', {
      params: {
        classId: params?.classId,
        academicYearId: params?.academicYearId,
        status: params?.status,
        type: params?.type,
        search: params?.search,
        page: params?.page ?? 1,
        limit: params?.limit ?? 200,
      },
    });
    return response.data?.data || {
      permissions: [],
      meta: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 200,
        total: 0,
        totalPages: 1,
      },
    };
  },

  async updatePermissionApprovalStatus(
    permissionId: number,
    payload: { status: 'APPROVED' | 'REJECTED'; approvalNote?: string },
  ) {
    const response = await apiClient.patch<ApiEnvelope<KesiswaanPermission>>(
      `/permissions/${permissionId}/status`,
      payload,
    );
    return response.data?.data;
  },
};
