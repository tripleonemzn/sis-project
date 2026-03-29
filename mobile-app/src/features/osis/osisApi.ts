import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type MobileOsisElectionPeriod = {
  id: number;
  status?: string | null;
};

export const osisApi = {
  async getActiveElection() {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionPeriod | null>>('/osis/active');
    return response.data?.data || null;
  },
};
