import api from './api';

export type AuditLog = {
  id: number;
  actorId: number;
  actorRole: string;
  actorDuties?: string[] | null;
  action: string;
  entity: string;
  entityId?: number | null;
  reason?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  createdAt: string;
  actor: {
    id: number;
    name: string;
    username: string;
    role: string;
  };
};

export const auditService = {
  list: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    entity?: string;
    actorId?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await api.get('/audit/logs', { params });
    return response.data.data as { logs: AuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
  },
};
