import api from './api';

export const GradeComponentType = {
  FORMATIVE: 'FORMATIVE',
  MIDTERM: 'MIDTERM',
  FINAL: 'FINAL',
  SKILL: 'SKILL',
  US_PRACTICE: 'US_PRACTICE',
  US_THEORY: 'US_THEORY'
} as const;

export type GradeComponentType = typeof GradeComponentType[keyof typeof GradeComponentType];

export interface GradeComponent {
  id: number;
  code?: string | null;
  typeCode?: string | null;
  subjectId: number;
  name: string;
  weight: number;
  type: GradeComponentType;
  entryMode?: 'NF_SERIES' | 'SINGLE_SCORE';
  entryModeCode?: string | null;
  reportSlot?: string | null;
  reportSlotCode?: string | null;
  includeInFinalScore?: boolean;
  displayOrder?: number;
  academicYearId?: number | null;
  isActive: boolean;
}

export interface StudentGradeData {
  id: number; // user id
  username: string;
  name: string;
  nisn: string;
  grades: Record<number, {
    score?: number;
    nf1?: number;
    nf2?: number;
    nf3?: number;
    nf4?: number;
    nf5?: number;
    nf6?: number;
    formativeSeries?: number[];
  }>; // componentId -> score object
}

export interface InputGradePayload {
  grades: {
    student_id: number;
    subject_id: number;
    academic_year_id: number;
    grade_component_id: number;
    semester: string;
    score?: number | null;
    nf1?: number | null;
    nf2?: number | null;
    nf3?: number | null;
    nf4?: number | null;
    nf5?: number | null;
    nf6?: number | null;
    formative_series?: number[] | null;
    description?: string;
  }[];
}

export const gradeService = {
  getComponents: async (params?: { subject_id?: number; academic_year_id?: number }) => {
    const response = await api.get('/grades/components', { params });
    return response.data;
  },

  upsertComponent: async (data: Partial<GradeComponent>) => {
    const response = await api.post('/grades/components', data);
    return response.data;
  },

  getGradesByClassSubject: async (classId: number, subjectId: number, academicYearId: number, semester?: string) => {
    const params: Record<string, string | number> = { 
      class_id: classId, 
      subject_id: subjectId, 
      academic_year_id: academicYearId 
    };
    if (semester) params.semester = semester;
    const response = await api.get('/grades/student-grades', {
      params
    });
    return response.data;
  },

  getGrades: async (params: {
    academicYearId: number;
    subjectId: number;
    classId?: number; // Optional now
    studentId?: number;
    teacherId?: number;
    type?: string;
  }) => {
    const response = await api.get('/grades', { params });
    return response.data;
  },

  saveGradesBulk: async (data: {
    academicYearId: number;
    subjectId: number;
    classId?: number; // Optional now
    grades: Array<{
      studentId: number;
      type: string;
      score: number;
      feedback?: string;
    }>
  }) => {
    const response = await api.post('/grades/bulk', data);
    return response.data;
  },

  bulkInputGrades: async (payload: { grades: InputGradePayload['grades'] }) => {
    const response = await api.post('/grades/student-grades/bulk', payload);
    return response.data;
  },

  calculateGrades: async (payload: { classId: number; subjectId: number; academicYearId: number }) => {
    const response = await api.post('/grades/calculate', payload);
    return response.data;
  },

  getLeger: async (classId: number, academicYearId: number) => {
    const response = await api.get('/grades/leger', {
      params: { classId, academicYearId }
    });
    return response.data;
  },

  getReportGrades: async (params: {
    student_id?: number;
    class_id?: number;
    academic_year_id: number;
    semester: string;
    subject_id?: number;
    include_meta?: boolean | number;
  }) => {
    const response = await api.get('/grades/report-grades', { params });
    return response.data;
  }
};
