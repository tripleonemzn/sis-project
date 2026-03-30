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

export type MobileOsisWorkProgramReadiness = {
  academicYearId: number | null;
  canCreatePrograms: boolean;
  stage:
    | 'NO_ACADEMIC_YEAR'
    | 'NEEDS_ELECTION'
    | 'NEEDS_MANAGEMENT_PERIOD'
    | 'NEEDS_ELECTION_LINK'
    | 'NEEDS_TRANSITION'
    | 'NEEDS_ACTIVE_PERIOD'
    | 'READY';
  message: string;
  latestClosedElection?: {
    id: number;
    title: string;
    status: 'CLOSED';
    startAt: string;
    endAt: string;
  } | null;
  activeManagementPeriod?: {
    id: number;
    title: string;
    transitionLabel?: string | null;
    transitionAt?: string | null;
    status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  } | null;
  latestManagementPeriod?: {
    id: number;
    title: string;
    transitionLabel?: string | null;
    transitionAt?: string | null;
    status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  } | null;
};

export const osisApi = {
  async getActiveElection() {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionPeriod | null>>('/osis/active');
    return response.data?.data || null;
  },
  async getWorkProgramReadiness(academicYearId?: number | null) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisWorkProgramReadiness>>(
      '/osis/work-program-readiness',
      {
        params: academicYearId ? { academicYearId } : undefined,
      },
    );
    return response.data?.data || null;
  },
};
