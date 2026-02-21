import { apiClient } from '../../lib/api/client';
import {
  StudentPermission,
  PermissionType,
  PermissionStatus,
  PermissionListMeta,
} from './types';

type PermissionsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    permissions: StudentPermission[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type PermissionMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: StudentPermission;
};

type UploadPermissionResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    url: string;
    filename: string;
    originalname: string;
    mimetype: string;
  };
};

export const permissionApi = {
  async list() {
    const response = await apiClient.get<PermissionsResponse>('/permissions', {
      params: {
        limit: 50,
      },
    });
    return response.data.data.permissions || [];
  },
  async listForHomeroom(params: {
    classId: number;
    academicYearId: number;
    status?: PermissionStatus;
    type?: PermissionType;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ permissions: StudentPermission[]; meta: PermissionListMeta }> {
    const response = await apiClient.get<PermissionsResponse>('/permissions', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        status: params.status,
        type: params.type,
        search: params.search,
        page: params.page ?? 1,
        limit: params.limit ?? 100,
      },
    });
    const permissions = response.data?.data?.permissions || [];
    const meta = response.data?.data?.meta || {
      page: params.page ?? 1,
      limit: params.limit ?? 100,
      total: permissions.length,
      totalPages: 1,
    };
    return { permissions, meta };
  },
  async updateStatus(params: {
    id: number;
    status: PermissionStatus;
    approvalNote?: string;
  }) {
    const response = await apiClient.patch<PermissionMutationResponse>(`/permissions/${params.id}/status`, {
      status: params.status,
      approvalNote: params.approvalNote,
    });
    return response.data.data;
  },
  async requestPermission(payload: {
    type: PermissionType;
    startDate: string;
    endDate: string;
    reason?: string;
    fileUrl?: string;
  }) {
    const response = await apiClient.post<PermissionMutationResponse>('/permissions', payload);
    return response.data.data;
  },
  async uploadFile(file: { uri: string; name?: string; type?: string }) {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'permission-file.jpg',
      type: file.type || 'application/octet-stream',
    } as any);

    const response = await apiClient.post<UploadPermissionResponse>('/upload/permission', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data.url;
  },
};
