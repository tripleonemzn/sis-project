import api from './api';
import type { AuthResponse, User } from '../types/auth';
import type { ApiResponse } from '../types/api.types';

export const authService = {
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', { username, password });
    return response.data;
  },

  getMe: async (): Promise<ApiResponse<User>> => {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
  },
};
