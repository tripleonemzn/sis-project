import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type FinalLedgerPreviewPayload = {
  academicYearIds?: number[];
  semesters?: Array<'ODD' | 'EVEN'>;
  classId?: number;
  majorId?: number;
  studentId?: number;
  limitStudents?: number;
};

export type FinalLedgerPreviewRow = {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
    class: {
      id: number;
      name: string;
      level: string;
    } | null;
    major: {
      id: number;
      name: string;
      code: string;
    } | null;
  };
  portfolioAverage: number | null;
  usAverage: number | null;
  pklScore: number | null;
  finalScore: number | null;
};

export type FinalLedgerPreviewResult = {
  summary: {
    totalStudents: number;
    totalSubjects: number;
    studentsWithResult: number;
    averagePortfolio: number | null;
    averageUs: number | null;
    averagePkl: number | null;
    averageFinal: number | null;
  };
  rows: FinalLedgerPreviewRow[];
};

export const finalLedgerApi = {
  async getPreview(payload: FinalLedgerPreviewPayload) {
    const response = await apiClient.post<ApiEnvelope<FinalLedgerPreviewResult>>('/reports/final-ledger/preview', payload);
    return response.data?.data || {
      summary: {
        totalStudents: 0,
        totalSubjects: 0,
        studentsWithResult: 0,
        averagePortfolio: null,
        averageUs: null,
        averagePkl: null,
        averageFinal: null,
      },
      rows: [],
    };
  },
};
