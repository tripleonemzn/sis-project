import api from './api';

export interface TeachingResourceProgram {
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
}

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

export interface TeachingResourceProgramColumnSchema {
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
}

export interface TeachingResourceProgramSectionSchema {
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
}

export interface TeachingResourceProgramSchema {
  version: number;
  sourceSheet?: string;
  intro: string;
  titleHint?: string;
  summaryHint?: string;
  sections: TeachingResourceProgramSectionSchema[];
}

export type TeachingResourceEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TeachingResourceEntry {
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
      columns?: Array<Partial<TeachingResourceProgramColumnSchema>>;
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
  };
  reviewer?: {
    id: number;
    name: string;
    role?: string | null;
  } | null;
}

export interface TeachingResourceSignatureOfficial {
  id: number | null;
  roleTitle: string;
  name: string;
  identityNumber?: string;
}

export interface TeachingResourceSignatureDefaults {
  academicYearId: number;
  curriculum: TeachingResourceSignatureOfficial;
  principal: TeachingResourceSignatureOfficial;
  teacher: {
    roleTitle: string;
  };
}

export const normalizeTeachingResourceProgramCode = (raw: unknown): string => {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

export const teachingResourceProgramCodeToSlug = (rawCode: unknown): string => {
  const normalized = normalizeTeachingResourceProgramCode(rawCode);
  return normalized.toLowerCase().replace(/_/g, '-');
};

export const teachingResourceProgramService = {
  getPrograms: async (params?: {
    academicYearId?: number;
    roleContext?: 'teacher' | 'all';
    includeInactive?: boolean;
  }) => {
    const response = await api.get('/teaching-resources/programs', { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        academicYearId: number;
        roleContext: 'teacher' | 'all';
        programs: TeachingResourceProgram[];
      };
    };
  },
  updatePrograms: async (payload: {
    academicYearId?: number;
    programs: Array<{
      id?: number;
      code: string;
      label?: string;
      shortLabel?: string;
      description?: string;
      order?: number;
      isActive?: boolean;
      showOnTeacherMenu?: boolean;
      targetClassLevels?: string[];
      schema?: TeachingResourceProgramSchema;
    }>;
  }) => {
    const response = await api.put('/teaching-resources/programs', payload);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        academicYearId: number;
        programs: TeachingResourceProgram[];
      };
    };
  },
  deleteProgram: async (id: number, params?: { academicYearId?: number }) => {
    const response = await api.delete(`/teaching-resources/programs/${id}`, { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        id: number;
        code: string;
        academicYearId: number;
      };
    };
  },
  getEntries: async (params?: {
    academicYearId?: number;
    programCode?: string;
    status?: TeachingResourceEntryStatus | 'ALL';
    search?: string;
    view?: 'mine' | 'review';
    teacherId?: number;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/teaching-resources/entries', { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        academicYearId: number;
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        canReview: boolean;
        rows: TeachingResourceEntry[];
        summary: {
          byStatus: Array<{ status: TeachingResourceEntryStatus; total: number }>;
          byProgram: Array<{ programCode: string; total: number }>;
        };
      };
    };
  },
  createEntry: async (payload: {
    academicYearId?: number;
    programCode: string;
    subjectId?: number;
    classLevel?: string;
    className?: string;
    title: string;
    summary?: string;
    content: Record<string, unknown>;
    tags?: string[];
  }) => {
    const response = await api.post('/teaching-resources/entries', payload);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: TeachingResourceEntry;
    };
  },
  updateEntry: async (
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
  ) => {
    const response = await api.patch(`/teaching-resources/entries/${id}`, payload);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: TeachingResourceEntry;
    };
  },
  deleteEntry: async (id: number) => {
    const response = await api.delete(`/teaching-resources/entries/${id}`);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: { id: number };
    };
  },
  submitEntry: async (id: number) => {
    const response = await api.post(`/teaching-resources/entries/${id}/submit`);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: TeachingResourceEntry;
    };
  },
  reviewEntry: async (id: number, payload: { action: 'APPROVE' | 'REJECT'; reviewNote?: string }) => {
    const response = await api.post(`/teaching-resources/entries/${id}/review`, payload);
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: TeachingResourceEntry;
    };
  },
  getEntriesSummary: async (params?: {
    academicYearId?: number;
    programCode?: string;
  }) => {
    const response = await api.get('/teaching-resources/entries-summary', { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        academicYearId: number;
        total: number;
        canReview: boolean;
        byStatus: Array<{ status: TeachingResourceEntryStatus; total: number }>;
        byProgram: Array<{ programCode: string; total: number }>;
        latest: TeachingResourceEntry[];
      };
    };
  },
  getSignatureDefaults: async (params?: { academicYearId?: number }) => {
    const response = await api.get('/teaching-resources/signatures/defaults', { params });
    return response.data as {
      statusCode: number;
      success: boolean;
      message: string;
      data: TeachingResourceSignatureDefaults;
    };
  },
};
