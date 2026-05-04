import { apiClient } from '../../lib/api/client';
import type {
  TeachingJournalEntry,
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
};
