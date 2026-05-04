import { apiClient } from '../../lib/api/client';
import type {
  TeachingJournalEntry,
  TeachingJournalReferenceEntriesPayload,
  TeachingJournalReferenceProjectionRequest,
  TeachingJournalSessionQuery,
  TeachingJournalSessionsPayload,
  UpsertTeachingJournalPayload,
} from './types';

type SessionsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeachingJournalSessionsPayload;
};

type EntryResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeachingJournalEntry;
};

type ReferenceEntriesResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeachingJournalReferenceEntriesPayload;
};

export const teachingJournalApi = {
  async listSessions(params: TeachingJournalSessionQuery = {}) {
    const response = await apiClient.get<SessionsResponse>('/teaching-journals/sessions', {
      params,
    });
    return response.data.data;
  },

  async upsertEntry(payload: UpsertTeachingJournalPayload) {
    const response = await apiClient.post<EntryResponse>('/teaching-journals/entries', payload);
    return response.data.data;
  },

  async getReferenceEntries(params: {
    academicYearId?: number;
    programCodes: string[];
    limitPerProgram?: number;
    includeRows?: boolean;
    referenceRequests: TeachingJournalReferenceProjectionRequest[];
  }) {
    const response = await apiClient.get<ReferenceEntriesResponse>('/teaching-resources/entries/references', {
      params: {
        academicYearId: params.academicYearId,
        programCodes: params.programCodes.join(','),
        limitPerProgram: params.limitPerProgram,
        includeRows: params.includeRows,
        referenceRequests: params.referenceRequests.length ? JSON.stringify(params.referenceRequests) : undefined,
      },
    });
    return response.data.data;
  },
};
