import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type MobileOsisElectionPeriod = {
  id: number;
  academicYearId?: number | null;
  title?: string;
  description?: string | null;
  startAt?: string;
  endAt?: string;
  status?: string | null;
  allowQuickCount?: boolean;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
  createdBy?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  candidates?: MobileOsisElectionCandidate[];
  _count?: {
    votes?: number;
  };
};

export type MobileOsisElectionCandidate = {
  id: number;
  electionId: number;
  studentId: number;
  candidateNumber: number;
  vision?: string | null;
  mission?: string | null;
  youtubeUrl?: string | null;
  isActive: boolean;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    photo?: string | null;
    studentClass?: { id?: number; name: string } | null;
  };
  _count?: {
    votes?: number;
  };
};

export type MobileOsisElectionQuickCount = {
  totalVotes: number;
  totalEligibleVoters: number;
  remainingVoters: number;
  turnoutPercentage: number;
  candidates: Array<{
    id: number;
    candidateNumber: number;
    studentId: number;
    studentName: string;
    nis?: string | null;
    className: string;
    votes: number;
    percentage: number;
    rank: number;
    isLeading: boolean;
    isWinner: boolean;
  }>;
  winner?: {
    candidateId: number;
    candidateNumber: number;
    studentId: number;
    studentName: string;
    className: string;
    votes: number;
    percentage: number;
  } | null;
  hasTie?: boolean;
  tiedCandidateIds?: number[];
};

export type MobileOsisManagementPeriod = {
  id: number;
  academicYearId: number;
  electionPeriodId?: number | null;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  transitionLabel?: string | null;
  transitionAt?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  academicYear?: { id: number; name: string; isActive?: boolean } | null;
  electionPeriod?: {
    id: number;
    title: string;
    status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    startAt: string;
    endAt: string;
  } | null;
  _count?: {
    divisions?: number;
    positions?: number;
    memberships?: number;
  };
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
  async getPeriods(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionPeriod[]>>('/osis/periods', {
      params,
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },
  async getQuickCount(periodId: number) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionQuickCount>>(
      `/osis/periods/${periodId}/quick-count`,
    );
    return response.data?.data || null;
  },
  async getManagementPeriods(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisManagementPeriod[]>>(
      '/osis/management-periods',
      {
        params,
      },
    );
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },
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
