import { apiClient } from '../../lib/api/client';
import { LoginPayload, LoginResponse } from './types';

export const authApi = {
  login(payload: LoginPayload) {
    return apiClient.post<LoginResponse>('/auth/login', payload);
  },
};

