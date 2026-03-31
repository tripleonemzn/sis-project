import { apiClient } from '../../lib/api/client';
import type { MobileCandidateAdmissionDetail } from '../candidateAdmission/types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type OfficeLetterType =
  | 'STUDENT_CERTIFICATE'
  | 'TEACHER_CERTIFICATE'
  | 'EXAM_CARD_COVER'
  | 'CANDIDATE_ADMISSION_RESULT';

export type OfficeLetter = {
  id: number;
  academicYearId: number;
  createdById: number;
  recipientId?: number | null;
  type: OfficeLetterType;
  letterNumber: string;
  title: string;
  recipientName: string;
  recipientRole?: string | null;
  recipientClass?: string | null;
  recipientPrimaryId?: string | null;
  purpose?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
  printedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  };
  recipient?: {
    id: number;
    name: string;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    nip?: string | null;
    nuptk?: string | null;
  } | null;
};

type OfficeLettersPayload = {
  letters: OfficeLetter[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type OfficeLetterSummary = {
  totalLetters: number;
  monthlyLetters: number;
  byType: Array<{ type: string; _count: { _all: number } }>;
  latest: OfficeLetter[];
};

export const headTuOfficeApi = {
  async listLetters(params?: {
    academicYearId?: number;
    type?: OfficeLetterType;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<OfficeLettersPayload>>('/office/letters', {
      params: {
        academicYearId: params?.academicYearId,
        type: params?.type,
        search: params?.search,
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
      },
    });
    return response.data?.data;
  },

  async getSummary(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<OfficeLetterSummary>>('/office/summary', {
      params: {
        academicYearId: params?.academicYearId,
      },
    });
    return response.data?.data;
  },

  async createLetter(payload: {
    academicYearId?: number;
    type: OfficeLetterType;
    recipientId?: number | null;
    recipientName: string;
    recipientRole?: string | null;
    recipientClass?: string | null;
    recipientPrimaryId?: string | null;
    purpose?: string | null;
    notes?: string | null;
    payload?: Record<string, unknown> | null;
    printedAt?: string | null;
  }) {
    const response = await apiClient.post<ApiEnvelope<{ letter: OfficeLetter }>>('/office/letters', payload);
    return response.data?.data?.letter;
  },

  async saveCandidateDecisionLetter(
    id: number,
    payload: {
      issueCity?: string;
      issueDate?: string;
      signerName?: string;
      signerPosition?: string;
      officialLetterUrl?: string | null;
      officialLetterOriginalName?: string | null;
      clearOfficialLetter?: boolean;
    },
  ) {
    const response = await apiClient.put<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      `/candidate-admissions/${id}/decision-letter`,
      payload,
    );
    return response.data?.data;
  },
};
