import api from './api';
import type { User, UserWrite } from '../types/auth';

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

  update: async (id: number, data: Partial<UserWrite> & { password?: string }) => {
    const response = await api.put<{ data: User }>(`/users/${id}`, data);
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
};
