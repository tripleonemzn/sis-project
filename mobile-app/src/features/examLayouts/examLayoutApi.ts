import { apiClient } from '../../lib/api/client';

export type ExamLayoutCellType = 'SEAT' | 'AISLE';

export type ExamLayoutStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  className?: string | null;
  seatLabel?: string | null;
  participantNumber?: string | null;
};

export type ExamLayoutCell = {
  id?: number;
  rowIndex: number;
  columnIndex: number;
  cellType: ExamLayoutCellType;
  seatLabel?: string | null;
  studentId?: number | null;
  notes?: string | null;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    className?: string | null;
    participantNumber?: string | null;
  } | null;
};

export type ExamLayoutDetail = {
  sitting: {
    id: number;
    roomName: string;
    examType: string;
    academicYearId: number;
    semester?: 'ODD' | 'EVEN' | null;
    startTime?: string | null;
    endTime?: string | null;
    sessionId?: number | null;
    sessionLabel?: string | null;
    programSession?: {
      id: number;
      label: string;
      displayOrder?: number | null;
    } | null;
  };
  layout: {
    id: number;
    rows: number;
    columns: number;
    notes?: string | null;
    generatedAt?: string | null;
    updatedAt?: string | null;
    generatedById?: number | null;
    cells: ExamLayoutCell[];
  } | null;
  students: ExamLayoutStudent[];
  meta: {
    studentCount: number;
    suggestedDimensions: {
      rows: number;
      columns: number;
    };
    hasGeneratedLayout: boolean;
  };
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const examLayoutApi = {
  async getLayout(sittingId: number) {
    const response = await apiClient.get<ApiEnvelope<ExamLayoutDetail>>(`/exam-sittings/${sittingId}/layout`);
    return response.data.data;
  },
  async generateLayout(
    sittingId: number,
    payload: {
      rows?: number;
      columns?: number;
      notes?: string | null;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<ExamLayoutDetail>>(
      `/exam-sittings/${sittingId}/layout/generate`,
      payload,
    );
    return response.data.data;
  },
  async updateLayout(
    sittingId: number,
    payload: {
      rows: number;
      columns: number;
      notes?: string | null;
      cells: Array<{
        rowIndex: number;
        columnIndex: number;
        cellType: ExamLayoutCellType;
        seatLabel?: string | null;
        studentId?: number | null;
        notes?: string | null;
      }>;
    },
  ) {
    const response = await apiClient.put<ApiEnvelope<ExamLayoutDetail>>(
      `/exam-sittings/${sittingId}/layout`,
      payload,
    );
    return response.data.data;
  },
};
