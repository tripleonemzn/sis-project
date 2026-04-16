import api from './api';
import { authService } from './auth.service';
import type {
  ParentChildLinkPayload,
  ParentChildLookupResult,
  ParentLinkedChild,
  User,
  UserWrite,
} from '../types/auth';
import type { ApiResponse } from '../types/api.types';

export const userService = {
  getUsers: async (params?: { role?: string; verificationStatus?: string; class_id?: number; limit?: number }) => {
    const response = await api.get<{ data: User[] }>('/users', { params });
    return response.data;
  },

  getAll: async (params?: { role?: string; verificationStatus?: string; class_id?: number; limit?: number }) => {
    const response = await api.get<{ data: User[] }>('/users', { params });
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get<{ data: User }>(`/users/${id}`);
    return response.data;
  },

  create: async (data: Partial<UserWrite> & { password?: string }) => {
    const response = await api.post<{ data: User }>('/users', data);
    return response.data;
  },

  update: async (
    id: number,
    data: Partial<UserWrite> & { password?: string; profileSnapshotUpdatedAt?: string | null },
  ) => {
    const response = await api.put<{ data: User }>(`/users/${id}`, data);
    authService.clearMeCache();
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  verifyBulk: async (userIds: number[]) => {
    const response = await api.post<{ data: { updatedCount: number } }>(
      '/users/verify-bulk',
      { userIds },
    );
    return response.data;
  },

  getMyChildren: async () => {
    const response = await api.get<ApiResponse<ParentLinkedChild[]>>('/users/me/children');
    return response.data;
  },

  lookupMyChild: async (nisn: string) => {
    const response = await api.get<ApiResponse<ParentChildLookupResult>>('/users/me/children/lookup', {
      params: { nisn },
    });
    return response.data;
  },

  linkMyChild: async (payload: ParentChildLinkPayload) => {
    const response = await api.post<ApiResponse<ParentLinkedChild[]>>('/users/me/children/link', payload);
    return response.data;
  },

  unlinkMyChild: async (childId: number) => {
    const response = await api.delete<ApiResponse<ParentLinkedChild[]>>(`/users/me/children/${childId}`);
    return response.data;
  },
};
