import api from './api';
import type { ApiResponse } from '../types/api.types';

export interface OsisElectionCandidateStudent {
  id: number;
  name: string;
  nis?: string | null;
  photo?: string | null;
  studentClass?: { id?: number; name: string } | null;
}

export interface OsisElectionCandidate {
  id: number;
  electionId: number;
  studentId: number;
  candidateNumber: number;
  vision?: string | null;
  mission?: string | null;
  youtubeUrl?: string | null;
  isActive: boolean;
  student: OsisElectionCandidateStudent;
  _count?: { votes: number };
}

export interface OsisElectionPeriod {
  id: number;
  academicYearId: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  allowQuickCount: boolean;
  academicYear?: { id: number; name: string; isActive: boolean } | null;
  createdBy?: { id: number; name: string; username: string } | null;
  candidates: OsisElectionCandidate[];
  votes?: { id: number; candidateId: number; createdAt: string }[];
  myVote?: { id: number; candidateId: number; createdAt: string } | null;
  quickCount?: OsisElectionQuickCount | null;
  _count?: { votes: number };
}

export interface OsisEligibleStudent {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  studentClass?: { id: number; name: string } | null;
}

export interface OsisElectionQuickCountCandidate {
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
}

export interface OsisElectionQuickCount {
  totalVotes: number;
  totalEligibleVoters: number;
  remainingVoters: number;
  turnoutPercentage: number;
  candidates: OsisElectionQuickCountCandidate[];
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
}

export interface CreateOsisElectionPeriodPayload {
  academicYearId: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  allowQuickCount: boolean;
}

export interface CreateOsisElectionCandidatePayload {
  studentId: number;
  candidateNumber: number;
  vision?: string | null;
  mission?: string | null;
  youtubeUrl?: string | null;
  isActive?: boolean;
}

export interface OsisManagementPeriod {
  id: number;
  academicYearId: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  createdById?: number;
  academicYear?: { id: number; name: string; isActive?: boolean } | null;
  createdBy?: { id: number; name: string; username?: string | null } | null;
  _count?: {
    divisions: number;
    positions: number;
    memberships: number;
  };
}

export interface OsisDivision {
  id: number;
  periodId: number;
  name: string;
  code: string;
  description?: string | null;
  displayOrder: number;
  _count?: {
    positions: number;
    memberships: number;
  };
}

export interface OsisPosition {
  id: number;
  periodId: number;
  divisionId?: number | null;
  name: string;
  code: string;
  description?: string | null;
  displayOrder: number;
  division?: {
    id: number;
    name: string;
    code: string;
    displayOrder?: number | null;
  } | null;
  _count?: {
    memberships: number;
  };
}

export interface OsisMembershipAssessment {
  id: number;
  membershipId: number;
  academicYearId: number;
  semester: 'ODD' | 'EVEN';
  reportSlot: string;
  grade: string;
  description?: string | null;
  gradedAt: string;
  gradedBy?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
}

export interface OsisMembership {
  id: number;
  periodId: number;
  studentId: number;
  divisionId?: number | null;
  positionId: number;
  joinedAt: string;
  endedAt?: string | null;
  isActive: boolean;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id?: number;
      name: string;
    } | null;
  };
  division?: {
    id: number;
    name: string;
    code: string;
    displayOrder?: number | null;
  } | null;
  position?: {
    id: number;
    name: string;
    code: string;
    displayOrder?: number | null;
    divisionId?: number | null;
    division?: {
      id: number;
      name: string;
      code: string;
      displayOrder?: number | null;
    } | null;
  } | null;
  period?: OsisManagementPeriod | null;
  assessments?: OsisMembershipAssessment[];
  currentAssessment?: OsisMembershipAssessment | null;
}

export interface OsisMembershipListPayload {
  period: OsisManagementPeriod;
  reportSlot?: string | null;
  memberships: OsisMembership[];
}

export interface OsisGradeTemplatesPayload {
  academicYearId: number;
  semester: 'ODD' | 'EVEN';
  reportSlot: string;
  templates: {
    SB: { label: string; description: string };
    B: { label: string; description: string };
    C: { label: string; description: string };
    K: { label: string; description: string };
  };
}

export const osisService = {
  async getPeriods(params?: { academicYearId?: number }) {
    const response = await api.get<ApiResponse<OsisElectionPeriod[]>>('/osis/periods', { params });
    return response.data;
  },

  async createPeriod(payload: CreateOsisElectionPeriodPayload) {
    const response = await api.post<ApiResponse<OsisElectionPeriod>>('/osis/periods', payload);
    return response.data;
  },

  async updatePeriod(id: number, payload: Partial<CreateOsisElectionPeriodPayload>) {
    const response = await api.put<ApiResponse<OsisElectionPeriod>>(`/osis/periods/${id}`, payload);
    return response.data;
  },

  async getEligibleStudents(params: { academicYearId: number; search?: string }) {
    const response = await api.get<ApiResponse<OsisEligibleStudent[]>>('/osis/eligible-students', { params });
    return response.data;
  },

  async createCandidate(periodId: number, payload: CreateOsisElectionCandidatePayload) {
    const response = await api.post<ApiResponse<OsisElectionCandidate>>(
      `/osis/periods/${periodId}/candidates`,
      payload,
    );
    return response.data;
  },

  async updateCandidate(id: number, payload: Partial<CreateOsisElectionCandidatePayload>) {
    const response = await api.put<ApiResponse<OsisElectionCandidate>>(`/osis/candidates/${id}`, payload);
    return response.data;
  },

  async deleteCandidate(id: number) {
    const response = await api.delete<ApiResponse<null>>(`/osis/candidates/${id}`);
    return response.data;
  },

  async getQuickCount(periodId: number) {
    const response = await api.get<ApiResponse<OsisElectionQuickCount>>(`/osis/periods/${periodId}/quick-count`);
    return response.data;
  },

  async getActiveElection() {
    const response = await api.get<ApiResponse<OsisElectionPeriod | null>>('/osis/active');
    return response.data;
  },

  async getLatestElection() {
    const response = await api.get<ApiResponse<OsisElectionPeriod | null>>('/osis/latest');
    return response.data;
  },

  async submitVote(payload: { electionId: number; candidateId: number }) {
    const response = await api.post<ApiResponse<{ id: number }>>('/osis/vote', payload);
    return response.data;
  },

  async finalizePeriod(id: number) {
    const response = await api.post<ApiResponse<OsisElectionPeriod>>(`/osis/periods/${id}/finalize`);
    return response.data;
  },

  async getManagementPeriods(params?: { academicYearId?: number }) {
    const response = await api.get<ApiResponse<OsisManagementPeriod[]>>('/osis/management-periods', { params });
    return response.data;
  },

  async createManagementPeriod(payload: {
    academicYearId: number;
    title: string;
    description?: string | null;
    startAt: string;
    endAt: string;
    status?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  }) {
    const response = await api.post<ApiResponse<OsisManagementPeriod>>('/osis/management-periods', payload);
    return response.data;
  },

  async updateManagementPeriod(
    id: number,
    payload: Partial<{
      academicYearId: number;
      title: string;
      description?: string | null;
      startAt: string;
      endAt: string;
      status?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
    }>,
  ) {
    const response = await api.put<ApiResponse<OsisManagementPeriod>>(`/osis/management-periods/${id}`, payload);
    return response.data;
  },

  async getDivisions(params: { periodId: number }) {
    const response = await api.get<ApiResponse<OsisDivision[]>>('/osis/divisions', { params });
    return response.data;
  },

  async createDivision(payload: {
    periodId: number;
    name: string;
    code?: string | null;
    description?: string | null;
    displayOrder?: number;
  }) {
    const response = await api.post<ApiResponse<OsisDivision>>('/osis/divisions', payload);
    return response.data;
  },

  async updateDivision(
    id: number,
    payload: Partial<{
      name: string;
      code?: string | null;
      description?: string | null;
      displayOrder?: number;
    }>,
  ) {
    const response = await api.put<ApiResponse<OsisDivision>>(`/osis/divisions/${id}`, payload);
    return response.data;
  },

  async deleteDivision(id: number) {
    const response = await api.delete<ApiResponse<OsisDivision>>(`/osis/divisions/${id}`);
    return response.data;
  },

  async getPositions(params: { periodId: number }) {
    const response = await api.get<ApiResponse<OsisPosition[]>>('/osis/positions', { params });
    return response.data;
  },

  async createPosition(payload: {
    periodId: number;
    divisionId?: number | null;
    name: string;
    code?: string | null;
    description?: string | null;
    displayOrder?: number;
  }) {
    const response = await api.post<ApiResponse<OsisPosition>>('/osis/positions', payload);
    return response.data;
  },

  async updatePosition(
    id: number,
    payload: Partial<{
      divisionId?: number | null;
      name: string;
      code?: string | null;
      description?: string | null;
      displayOrder?: number;
    }>,
  ) {
    const response = await api.put<ApiResponse<OsisPosition>>(`/osis/positions/${id}`, payload);
    return response.data;
  },

  async deletePosition(id: number) {
    const response = await api.delete<ApiResponse<OsisPosition>>(`/osis/positions/${id}`);
    return response.data;
  },

  async getMemberships(params: {
    periodId: number;
    semester?: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await api.get<ApiResponse<OsisMembershipListPayload>>('/osis/memberships', { params });
    return response.data;
  },

  async createMembership(payload: {
    periodId: number;
    studentId: number;
    positionId: number;
    divisionId?: number | null;
    joinedAt?: string | null;
    endedAt?: string | null;
    isActive?: boolean;
  }) {
    const response = await api.post<ApiResponse<OsisMembership>>('/osis/memberships', payload);
    return response.data;
  },

  async updateMembership(
    id: number,
    payload: Partial<{
      studentId: number;
      positionId: number;
      divisionId?: number | null;
      joinedAt?: string | null;
      endedAt?: string | null;
      isActive?: boolean;
    }>,
  ) {
    const response = await api.put<ApiResponse<OsisMembership>>(`/osis/memberships/${id}`, payload);
    return response.data;
  },

  async deleteMembership(id: number) {
    const response = await api.delete<ApiResponse<OsisMembership>>(`/osis/memberships/${id}`);
    return response.data;
  },

  async getGradeTemplates(params: {
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await api.get<ApiResponse<OsisGradeTemplatesPayload>>('/osis/grade-templates', { params });
    return response.data;
  },

  async saveGradeTemplates(payload: {
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
    templates: OsisGradeTemplatesPayload['templates'];
  }) {
    const response = await api.put<ApiResponse<OsisGradeTemplatesPayload>>('/osis/grade-templates', payload);
    return response.data;
  },

  async upsertAssessment(payload: {
    membershipId: number;
    grade: string;
    description: string;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await api.post<ApiResponse<OsisMembershipAssessment & { reportSlot: string }>>('/osis/assessments', payload);
    return response.data;
  },
};
