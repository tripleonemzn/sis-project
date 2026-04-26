import { apiClient } from '../../lib/api/client';

export type TeachingResourceProgramItem = {
  id?: number;
  code: string;
  label: string;
  shortLabel?: string;
  description?: string;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  targetClassLevels?: string[];
  source: 'default' | 'custom';
  schema?: TeachingResourceProgramSchema;
};

export type TeachingResourceColumnDataType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'SEMESTER'
  | 'MONTH'
  | 'WEEK'
  | 'WEEK_GRID'
  | 'READONLY_BOUND';

export type TeachingResourceColumnValueSource =
  | 'MANUAL'
  | 'SYSTEM_ACTIVE_YEAR'
  | 'SYSTEM_SEMESTER'
  | 'SYSTEM_SUBJECT'
  | 'SYSTEM_CLASS_LEVEL'
  | 'SYSTEM_CLASS_NAME'
  | 'SYSTEM_SKILL_PROGRAM'
  | 'SYSTEM_TEACHER_NAME'
  | 'SYSTEM_PLACE_DATE'
  | 'BOUND';

export type TeachingResourceProgramColumnSchema = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  dataType?: TeachingResourceColumnDataType;
  semanticKey?: string;
  bindingKey?: string;
  valueSource?: TeachingResourceColumnValueSource;
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
};

export type TeachingResourceProgramSectionSchema = {
  key: string;
  label: string;
  description?: string;
  repeatable: boolean;
  defaultRows: number;
  editorType?: 'TEXT' | 'TABLE';
  columns?: TeachingResourceProgramColumnSchema[];
  prefillRows?: Array<Record<string, string>>;
  sectionTitleEditable?: boolean;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
};

export type TeachingResourceProgramSchema = {
  version: number;
  sourceSheet?: string;
  intro: string;
  titleHint?: string;
  summaryHint?: string;
  sections: TeachingResourceProgramSectionSchema[];
};

export type TeachingResourceEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type TeachingResourceEntryItem = {
  id: number;
  academicYearId: number;
  teacherId: number;
  reviewerId?: number | null;
  programCode: string;
  subjectId?: number | null;
  classLevel?: string | null;
  className?: string | null;
  title: string;
  summary?: string | null;
  content: {
    contextScope?: {
      assignmentIds?: number[];
      coveredClasses?: string[];
      aggregatedClassName?: string;
    };
    sections?: Array<{
      schemaKey?: string;
      title?: string;
      body?: string;
      rows?: Array<Record<string, string>>;
    }>;
    references?: string[];
    notes?: string;
    [key: string]: unknown;
  };
  tags: string[];
  status: TeachingResourceEntryStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
  teacher?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  reviewer?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
};

export type TeachingResourceEntrySummaryItem = {
  id: number;
  programCode: string;
  title: string;
  status: TeachingResourceEntryStatus;
  teacher?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

type TeachingResourceProgramsPayload = {
  academicYearId: number;
  roleContext: 'teacher' | 'all';
  programs: TeachingResourceProgramItem[];
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type TeachingResourceEntriesSummaryPayload = {
  academicYearId: number;
  total: number;
  canReview: boolean;
  byStatus: Array<{ status: TeachingResourceEntryStatus; total: number }>;
  byProgram: Array<{ programCode: string; total: number }>;
  latest: TeachingResourceEntrySummaryItem[];
};

type TeachingResourceEntriesPayload = {
  academicYearId: number;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  canReview: boolean;
  rows: TeachingResourceEntryItem[];
  summary: {
    byStatus: Array<{ status: TeachingResourceEntryStatus; total: number }>;
    byProgram: Array<{ programCode: string; total: number }>;
  };
};

export const teachingResourceProgramApi = {
  async getTeachingResourcePrograms(params?: {
    academicYearId?: number;
    roleContext?: 'teacher' | 'all';
    includeInactive?: boolean;
  }) {
    const response = await apiClient.get<ApiEnvelope<TeachingResourceProgramsPayload>>(
      '/teaching-resources/programs',
      {
        params: {
          academicYearId: params?.academicYearId,
          roleContext: params?.roleContext,
          includeInactive: params?.includeInactive,
        },
      },
    );

    return response.data.data;
  },
  async getEntriesSummary(params?: {
    academicYearId?: number;
    programCode?: string;
  }) {
    const response = await apiClient.get<ApiEnvelope<TeachingResourceEntriesSummaryPayload>>(
      '/teaching-resources/entries-summary',
      {
        params: {
          academicYearId: params?.academicYearId,
          programCode: params?.programCode,
        },
      },
    );

    return response.data.data;
  },
  async getEntries(params?: {
    academicYearId?: number;
    programCode?: string;
    status?: TeachingResourceEntryStatus | 'ALL';
    search?: string;
    view?: 'mine' | 'review';
    teacherId?: number;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<TeachingResourceEntriesPayload>>(
      '/teaching-resources/entries',
      {
        params: {
          academicYearId: params?.academicYearId,
          programCode: params?.programCode,
          status: params?.status,
          search: params?.search,
          view: params?.view,
          teacherId: params?.teacherId,
          page: params?.page,
          limit: params?.limit,
        },
      },
    );

    return response.data.data;
  },
  async createEntry(payload: {
    academicYearId?: number;
    programCode: string;
    title: string;
    summary?: string;
    subjectId?: number;
    classLevel?: string;
    className?: string;
    tags?: string[];
    content: Record<string, unknown>;
  }) {
    const response = await apiClient.post<ApiEnvelope<TeachingResourceEntryItem>>(
      '/teaching-resources/entries',
      payload,
    );
    return response.data.data;
  },
  async updateEntry(
    id: number,
    payload: Partial<{
      title: string;
      summary: string;
      content: Record<string, unknown>;
      tags: string[];
      subjectId: number | null;
      classLevel: string | null;
      className: string | null;
    }>,
  ) {
    const response = await apiClient.patch<ApiEnvelope<TeachingResourceEntryItem>>(
      `/teaching-resources/entries/${id}`,
      payload,
    );
    return response.data.data;
  },
  async deleteEntry(id: number) {
    const response = await apiClient.delete<ApiEnvelope<{ id: number }>>(`/teaching-resources/entries/${id}`);
    return response.data.data;
  },
  async submitEntry(id: number) {
    const response = await apiClient.post<ApiEnvelope<TeachingResourceEntryItem>>(
      `/teaching-resources/entries/${id}/submit`,
    );
    return response.data.data;
  },
};
