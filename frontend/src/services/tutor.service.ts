import api from './api';

export type ExtracurricularPredicate = 'SB' | 'B' | 'C' | 'K';
export type ExtracurricularGradeTemplate = Record<
  ExtracurricularPredicate,
  { label: string; description: string }
>;
export type ExtracurricularAttendanceStatus = 'PRESENT' | 'PERMIT' | 'SICK' | 'ABSENT';
export type TutorAssignmentSummary = {
  id: number;
  tutorId: number;
  ekskulId: number;
  academicYearId: number;
  isActive: boolean;
  ekskul?: {
    id: number;
    name: string;
    description?: string | null;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
};

export const tutorService = {
  getAssignments: async (academicYearId?: number) => {
    const params = academicYearId ? { academicYearId } : {};
    const response = await api.get('/tutor/assignments', { params });
    return response.data;
  },

  getMembers: async (ekskulId: number, academicYearId: number) => {
    const response = await api.get('/tutor/members', { 
      params: { ekskulId, academicYearId } 
    });
    return response.data;
  },

  inputGrade: async (data: { 
    enrollmentId: number, 
    grade: string, 
    description: string,
    semester?: 'ODD' | 'EVEN',
    reportType?: string,
    programCode?: string
  }) => {
    const response = await api.post('/tutor/grades', data);
    return response.data;
  },

  getGradeTemplates: async (params: {
    ekskulId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) => {
    const response = await api.get('/tutor/grade-templates', { params });
    return response.data;
  },

  saveGradeTemplates: async (data: {
    ekskulId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
    templates: Partial<Record<ExtracurricularPredicate, { label?: string; description?: string }>>;
  }) => {
    const response = await api.put('/tutor/grade-templates', data);
    return response.data;
  },

  getAttendanceOverview: async (params: {
    ekskulId: number;
    academicYearId: number;
    weekKey?: string;
  }) => {
    const response = await api.get('/tutor/attendance', { params });
    return response.data;
  },

  saveAttendanceConfig: async (data: {
    ekskulId: number;
    academicYearId: number;
    sessionsPerWeek: number;
  }) => {
    const response = await api.put('/tutor/attendance/config', data);
    return response.data;
  },

  saveAttendanceRecords: async (data: {
    ekskulId: number;
    academicYearId: number;
    weekKey: string;
    records: Array<{
      enrollmentId: number;
      sessionIndex: number;
      status: ExtracurricularAttendanceStatus;
      note?: string;
    }>;
  }) => {
    const response = await api.put('/tutor/attendance/records', data);
    return response.data;
  },

  getInventoryOverview: async (academicYearId?: number) => {
    const response = await api.get('/tutor/inventory-overview', {
      params: academicYearId ? { academicYearId } : {},
    });
    return response.data;
  },

  createInventoryItem: async (data: {
    assignmentId: number;
    name: string;
    code?: string;
    brand?: string;
    source?: string;
    description?: string;
    goodQty?: number;
    minorDamageQty?: number;
    majorDamageQty?: number;
  }) => {
    const response = await api.post('/tutor/inventory-items', data);
    return response.data;
  },

  hasOsisAssignment: async (academicYearId?: number) => {
    const response = await api.get('/tutor/assignments', {
      params: academicYearId ? { academicYearId } : {},
    });
    const assignments = Array.isArray(response.data?.data)
      ? (response.data.data as TutorAssignmentSummary[])
      : [];
    return assignments.some((assignment) =>
      String(assignment?.ekskul?.name || '')
        .trim()
        .toUpperCase()
        .includes('OSIS'),
    );
  },
};
