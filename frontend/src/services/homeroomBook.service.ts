import api from './api';

export type HomeroomBookEntryType = 'EXAM_FINANCE_EXCEPTION' | 'STUDENT_CASE_REPORT';
export type HomeroomBookStatus = 'ACTIVE' | 'RESOLVED' | 'CANCELLED';
export type HomeroomBookSemester = 'ODD' | 'EVEN';

export type HomeroomBookAttachmentPayload = {
  fileUrl: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
};

export interface HomeroomBookAttachment extends HomeroomBookAttachmentPayload {
  id: number;
  createdAt: string;
}

export interface HomeroomBookEntry {
  id: number;
  entryType: HomeroomBookEntryType;
  status: HomeroomBookStatus;
  title: string;
  summary: string;
  notes: string | null;
  incidentDate: string;
  relatedSemester: HomeroomBookSemester | null;
  relatedProgramCode: string | null;
  visibilityToPrincipal: boolean;
  visibilityToStudentAffairs: boolean;
  allowsExamAccess: boolean;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
  class: {
    id: number;
    name: string;
    level: string;
  };
  academicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  createdBy: {
    id: number;
    name: string;
  };
  updatedBy: {
    id: number;
    name: string;
  };
  attachments: HomeroomBookAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface HomeroomBookListResponse {
  entries: HomeroomBookEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HomeroomBookListParams {
  academicYearId?: number;
  classId?: number;
  studentId?: number;
  entryType?: HomeroomBookEntryType;
  status?: HomeroomBookStatus;
  semester?: HomeroomBookSemester;
  programCode?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface HomeroomBookWritePayload {
  studentId: number;
  classId: number;
  academicYearId: number;
  entryType: HomeroomBookEntryType;
  title: string;
  summary: string;
  notes?: string | null;
  incidentDate: string;
  relatedSemester?: HomeroomBookSemester | null;
  relatedProgramCode?: string | null;
  visibilityToPrincipal?: boolean;
  visibilityToStudentAffairs?: boolean;
  attachments?: HomeroomBookAttachmentPayload[];
}

export interface HomeroomBookStatusPayload {
  status: HomeroomBookStatus;
  notes?: string | null;
}

type HomeroomBookEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const homeroomBookService = {
  list: async (params: HomeroomBookListParams) => {
    const response = await api.get<HomeroomBookEnvelope<HomeroomBookListResponse>>('/homeroom-book', { params });
    return response.data.data;
  },

  getById: async (id: number) => {
    const response = await api.get<HomeroomBookEnvelope<HomeroomBookEntry>>(`/homeroom-book/${id}`);
    return response.data.data;
  },

  create: async (payload: HomeroomBookWritePayload) => {
    const response = await api.post<HomeroomBookEnvelope<HomeroomBookEntry>>('/homeroom-book', payload);
    return response.data.data;
  },

  update: async (id: number, payload: Partial<HomeroomBookWritePayload>) => {
    const response = await api.put<HomeroomBookEnvelope<HomeroomBookEntry>>(`/homeroom-book/${id}`, payload);
    return response.data.data;
  },

  updateStatus: async (id: number, payload: HomeroomBookStatusPayload) => {
    const response = await api.patch<HomeroomBookEnvelope<HomeroomBookEntry>>(`/homeroom-book/${id}/status`, payload);
    return response.data.data;
  },
};
