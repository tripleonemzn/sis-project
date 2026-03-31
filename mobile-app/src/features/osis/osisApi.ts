import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type MobileOsisElectionCandidateStudent = {
  id: number;
  name: string;
  nis?: string | null;
  photo?: string | null;
  studentClass?: { id?: number; name: string } | null;
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
  student: MobileOsisElectionCandidateStudent;
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

export type MobileOsisElectionPeriod = {
  id: number;
  academicYearId: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  allowQuickCount: boolean;
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
  candidates: MobileOsisElectionCandidate[];
  myVote?: {
    id: number;
    candidateId: number;
    createdAt: string;
  } | null;
  quickCount?: MobileOsisElectionQuickCount | null;
  _count?: {
    votes?: number;
  };
};

export type MobileOsisEligibleStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  studentClass?: { id: number; name: string } | null;
};

export type MobileOsisCreateElectionPeriodPayload = {
  academicYearId: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  allowQuickCount: boolean;
};

export type MobileOsisCreateElectionCandidatePayload = {
  studentId: number;
  candidateNumber: number;
  vision?: string | null;
  mission?: string | null;
  youtubeUrl?: string | null;
  isActive?: boolean;
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
  transitionNotes?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  academicYear?: { id: number; name: string; isActive?: boolean } | null;
  electionPeriod?: {
    id: number;
    title: string;
    status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    startAt: string;
    endAt: string;
  } | null;
  createdBy?: { id: number; name: string; username?: string | null } | null;
  _count?: {
    divisions?: number;
    positions?: number;
    memberships?: number;
  };
};

export type MobileOsisDivision = {
  id: number;
  periodId: number;
  name: string;
  code: string;
  description?: string | null;
  displayOrder: number;
  _count?: {
    positions?: number;
    memberships?: number;
  };
};

export type MobileOsisPosition = {
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
    memberships?: number;
  };
};

export type MobileOsisMembershipAssessment = {
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
};

export type MobileOsisMembership = {
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
  period?: MobileOsisManagementPeriod | null;
  assessments?: MobileOsisMembershipAssessment[];
  currentAssessment?: MobileOsisMembershipAssessment | null;
};

export type MobileOsisJoinRequest = {
  id: number;
  academicYearId: number;
  ekskulId: number;
  studentId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  note?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  academicYear?: { id: number; name: string; isActive?: boolean } | null;
  ekskul?: {
    id: number;
    name: string;
    category?: 'EXTRACURRICULAR' | 'OSIS';
  } | null;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id?: number;
      name: string;
    } | null;
  } | null;
  processedBy?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  membership?: MobileOsisMembership | null;
};

export type MobileOsisMembershipListPayload = {
  period: MobileOsisManagementPeriod;
  reportSlot?: string | null;
  memberships: MobileOsisMembership[];
};

export type MobileOsisGradeTemplatesPayload = {
  academicYearId: number;
  semester: 'ODD' | 'EVEN';
  reportSlot: string;
  templates: {
    SB: { label: string; description: string };
    B: { label: string; description: string };
    C: { label: string; description: string };
    K: { label: string; description: string };
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

  async createPeriod(payload: MobileOsisCreateElectionPeriodPayload) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisElectionPeriod>>('/osis/periods', payload);
    return response.data?.data;
  },

  async updatePeriod(id: number, payload: Partial<MobileOsisCreateElectionPeriodPayload>) {
    const response = await apiClient.put<ApiEnvelope<MobileOsisElectionPeriod>>(`/osis/periods/${id}`, payload);
    return response.data?.data;
  },

  async getEligibleStudents(params: { academicYearId: number; search?: string }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisEligibleStudent[]>>('/osis/eligible-students', {
      params,
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createCandidate(periodId: number, payload: MobileOsisCreateElectionCandidatePayload) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisElectionCandidate>>(
      `/osis/periods/${periodId}/candidates`,
      payload,
    );
    return response.data?.data;
  },

  async updateCandidate(id: number, payload: Partial<MobileOsisCreateElectionCandidatePayload>) {
    const response = await apiClient.put<ApiEnvelope<MobileOsisElectionCandidate>>(`/osis/candidates/${id}`, payload);
    return response.data?.data;
  },

  async deleteCandidate(id: number) {
    await apiClient.delete<ApiEnvelope<null>>(`/osis/candidates/${id}`);
  },

  async getQuickCount(periodId: number) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionQuickCount>>(
      `/osis/periods/${periodId}/quick-count`,
    );
    return response.data?.data || null;
  },

  async getActiveElection() {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionPeriod | null>>('/osis/active');
    return response.data?.data || null;
  },

  async getLatestElection() {
    const response = await apiClient.get<ApiEnvelope<MobileOsisElectionPeriod | null>>('/osis/latest');
    return response.data?.data || null;
  },

  async submitVote(payload: { electionId: number; candidateId: number }) {
    const response = await apiClient.post<ApiEnvelope<{ id: number }>>('/osis/vote', payload);
    return response.data?.data || null;
  },

  async finalizePeriod(id: number) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisElectionPeriod>>(`/osis/periods/${id}/finalize`);
    return response.data?.data;
  },

  async getManagementPeriods(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisManagementPeriod[]>>(
      '/osis/management-periods',
      { params },
    );
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createManagementPeriod(payload: {
    academicYearId: number;
    electionPeriodId?: number | null;
    title: string;
    description?: string | null;
    startAt: string;
    endAt: string;
    transitionLabel?: string | null;
    transitionAt?: string | null;
    transitionNotes?: string | null;
    status?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  }) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisManagementPeriod>>(
      '/osis/management-periods',
      payload,
    );
    return response.data?.data;
  },

  async updateManagementPeriod(
    id: number,
    payload: Partial<{
      academicYearId: number;
      electionPeriodId?: number | null;
      title: string;
      description?: string | null;
      startAt: string;
      endAt: string;
      transitionLabel?: string | null;
      transitionAt?: string | null;
      transitionNotes?: string | null;
      status?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<MobileOsisManagementPeriod>>(
      `/osis/management-periods/${id}`,
      payload,
    );
    return response.data?.data;
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

  async getDivisions(params: { periodId: number }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisDivision[]>>('/osis/divisions', { params });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createDivision(payload: {
    periodId: number;
    name: string;
    code?: string | null;
    description?: string | null;
    displayOrder?: number;
  }) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisDivision>>('/osis/divisions', payload);
    return response.data?.data;
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
    const response = await apiClient.put<ApiEnvelope<MobileOsisDivision>>(`/osis/divisions/${id}`, payload);
    return response.data?.data;
  },

  async deleteDivision(id: number) {
    await apiClient.delete<ApiEnvelope<MobileOsisDivision>>(`/osis/divisions/${id}`);
  },

  async getPositions(params: { periodId: number }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisPosition[]>>('/osis/positions', { params });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createPosition(payload: {
    periodId: number;
    divisionId?: number | null;
    name: string;
    code?: string | null;
    description?: string | null;
    displayOrder?: number;
  }) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisPosition>>('/osis/positions', payload);
    return response.data?.data;
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
    const response = await apiClient.put<ApiEnvelope<MobileOsisPosition>>(`/osis/positions/${id}`, payload);
    return response.data?.data;
  },

  async deletePosition(id: number) {
    await apiClient.delete<ApiEnvelope<MobileOsisPosition>>(`/osis/positions/${id}`);
  },

  async getMemberships(params: {
    periodId: number;
    semester?: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisMembershipListPayload>>('/osis/memberships', {
      params,
    });
    return response.data?.data || null;
  },

  async getJoinRequests(params?: {
    academicYearId?: number;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisJoinRequest[]>>('/osis/join-requests', { params });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createMembership(payload: {
    periodId: number;
    studentId: number;
    positionId: number;
    divisionId?: number | null;
    joinedAt?: string | null;
    endedAt?: string | null;
    isActive?: boolean;
    requestId?: number | null;
  }) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisMembership>>('/osis/memberships', payload);
    return response.data?.data;
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
    const response = await apiClient.put<ApiEnvelope<MobileOsisMembership>>(`/osis/memberships/${id}`, payload);
    return response.data?.data;
  },

  async deleteMembership(id: number) {
    await apiClient.delete<ApiEnvelope<MobileOsisMembership>>(`/osis/memberships/${id}`);
  },

  async rejectJoinRequest(id: number, payload?: { note?: string | null }) {
    const response = await apiClient.put<ApiEnvelope<MobileOsisJoinRequest>>(
      `/osis/join-requests/${id}/reject`,
      payload,
    );
    return response.data?.data;
  },

  async getGradeTemplates(params: {
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await apiClient.get<ApiEnvelope<MobileOsisGradeTemplatesPayload>>('/osis/grade-templates', {
      params,
    });
    return response.data?.data || null;
  },

  async saveGradeTemplates(payload: {
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
    templates: MobileOsisGradeTemplatesPayload['templates'];
  }) {
    const response = await apiClient.put<ApiEnvelope<MobileOsisGradeTemplatesPayload>>(
      '/osis/grade-templates',
      payload,
    );
    return response.data?.data || null;
  },

  async upsertAssessment(payload: {
    membershipId: number;
    grade: string;
    description: string;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<MobileOsisMembershipAssessment & { reportSlot: string }>>(
      '/osis/assessments',
      payload,
    );
    return response.data?.data || null;
  },
};
