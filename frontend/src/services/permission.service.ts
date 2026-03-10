import api from './api';
import type { ApiResponse } from '../types/api.types';

export const PermissionType = {
  SICK: 'SICK',
  PERMISSION: 'PERMISSION',
  OTHER: 'OTHER',
} as const;

export type PermissionType = typeof PermissionType[keyof typeof PermissionType];

export const PermissionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type PermissionStatus = typeof PermissionStatus[keyof typeof PermissionStatus];

export interface StudentPermission {
  id: number;
  studentId: number;
  academicYearId: number;
  type: PermissionType;
  startDate: string;
  endDate: string;
  reason: string | null;
  fileUrl: string | null;
  status: PermissionStatus;
  approvalNote: string | null;
  createdAt: string;
  student?: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
    photo: string | null;
  };
}

interface PermissionMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const permissionService = {
  getPermissions: async (params?: {
    classId?: number;
    academicYearId?: number;
    type?: PermissionType;
    status?: PermissionStatus;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<ApiResponse<{ permissions: StudentPermission[]; meta: PermissionMeta }>> => {
    const response = await api.get('/permissions', { params });
    return response.data;
  },

  updateStatus: async (
    id: number,
    status: PermissionStatus,
    approvalNote?: string
  ): Promise<ApiResponse<StudentPermission>> => {
    const response = await api.patch(`/permissions/${id}/status`, {
      status,
      approvalNote,
    });
    return response.data;
  },

  requestPermission: async (data: {
    type: PermissionType;
    startDate: string;
    endDate: string;
    reason?: string;
    fileUrl?: string;
    academicYearId: number;
  }): Promise<ApiResponse<StudentPermission>> => {
    const response = await api.post('/permissions', data);
    return response.data;
  },

  uploadFile: async (file: File): Promise<ApiResponse<{ url: string }>> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload/permission', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
