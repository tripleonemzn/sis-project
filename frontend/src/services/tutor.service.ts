import api from './api';

export type ExtracurricularPredicate = 'SB' | 'B' | 'C' | 'K';

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
    templates: Partial<Record<ExtracurricularPredicate, string>>;
  }) => {
    const response = await api.put('/tutor/grade-templates', data);
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
};
