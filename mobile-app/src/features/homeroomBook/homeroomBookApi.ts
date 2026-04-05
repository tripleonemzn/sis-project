import { apiClient } from '../../lib/api/client';

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

export type HomeroomBookAttachment = HomeroomBookAttachmentPayload & {
  id: number;
  createdAt: string;
};

export type HomeroomBookEntry = {
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
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

type HomeroomBookListResponse = {
  entries: HomeroomBookEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type UploadHomeroomBookResponse = {
  url: string;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
};

export const homeroomBookApi = {
  async list(params: {
    academicYearId?: number;
    classId?: number;
    entryType?: HomeroomBookEntryType;
    status?: HomeroomBookStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomBookListResponse>>('/homeroom-book', {
      params: {
        academicYearId: params.academicYearId,
        classId: params.classId,
        entryType: params.entryType,
        status: params.status,
        search: params.search,
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
    });
    return response.data.data;
  },

  async create(payload: {
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
  }) {
    const response = await apiClient.post<ApiEnvelope<HomeroomBookEntry>>('/homeroom-book', payload);
    return response.data.data;
  },

  async update(
    id: number,
    payload: Partial<{
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
    }>,
  ) {
    const response = await apiClient.put<ApiEnvelope<HomeroomBookEntry>>(`/homeroom-book/${id}`, payload);
    return response.data.data;
  },

  async updateStatus(id: number, payload: { status: HomeroomBookStatus; notes?: string | null }) {
    const response = await apiClient.patch<ApiEnvelope<HomeroomBookEntry>>(`/homeroom-book/${id}/status`, payload);
    return response.data.data;
  },

  async listStudentsByClass(classId: number) {
    const response = await apiClient.get<ApiEnvelope<Array<{
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
      studentClass?: {
        id?: number | null;
        name?: string | null;
      } | null;
    }>>>('/users', {
      params: {
        role: 'STUDENT',
        class_id: classId,
        limit: 500,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async uploadAttachment(file: { uri: string; name?: string; type?: string }) {
    const formData = new FormData();
    const filePart: ReactNativeFilePart = {
      uri: file.uri,
      name: file.name || 'homeroom-book-file.pdf',
      type: file.type || 'application/octet-stream',
    };
    formData.append('file', filePart as unknown as Blob);

    const response = await apiClient.post<ApiEnvelope<UploadHomeroomBookResponse>>('/upload/homeroom-book', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return {
      fileUrl: response.data.data.url,
      fileName: response.data.data.filename,
      originalName: response.data.data.originalname,
      mimeType: response.data.data.mimetype,
      fileSize: response.data.data.size,
    } satisfies HomeroomBookAttachmentPayload;
  },
};
