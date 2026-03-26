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
};
