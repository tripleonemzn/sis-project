import { apiClient } from '../../lib/api/client';
import { InternshipAttendanceRow, InternshipDutyRow, InternshipJournalRow } from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const internshipDutyApi = {
  async listAssignedInternships() {
    const response = await apiClient.get<ApiEnvelope<InternshipDutyRow[]>>('/internships/assigned');
    const rows = response.data?.data;
    return Array.isArray(rows) ? rows : [];
  },

  async listExaminerInternships() {
    const response = await apiClient.get<ApiEnvelope<InternshipDutyRow[]>>('/internships/examiner');
    const rows = response.data?.data;
    return Array.isArray(rows) ? rows : [];
  },

  async listJournals(internshipId: number) {
    const response = await apiClient.get<ApiEnvelope<InternshipJournalRow[]>>(`/internships/${internshipId}/journals`);
    const rows = response.data?.data;
    return Array.isArray(rows) ? rows : [];
  },

  async listAttendances(internshipId: number) {
    const response = await apiClient.get<ApiEnvelope<InternshipAttendanceRow[]>>(
      `/internships/${internshipId}/attendances`,
    );
    const rows = response.data?.data;
    return Array.isArray(rows) ? rows : [];
  },

  async approveJournal(
    journalId: number,
    payload: {
      status: 'VERIFIED' | 'REJECTED';
      feedback?: string;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<InternshipJournalRow>>(
      `/internships/journal/${journalId}/approve`,
      payload,
    );
    return response.data?.data;
  },

  async gradeDefense(
    internshipId: number,
    payload: {
      scorePresentation: number;
      scoreUnderstanding: number;
      scoreRelevance: number;
      scoreSystematics: number;
      defenseNotes?: string;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<InternshipDutyRow>>(
      `/internships/${internshipId}/grade-defense`,
      payload,
    );
    return response.data?.data;
  },
};
