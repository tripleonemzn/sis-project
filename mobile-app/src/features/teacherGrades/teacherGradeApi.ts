import { apiClient } from '../../lib/api/client';

export type GradeComponent = {
  id: number;
  subjectId: number;
  code?: string | null;
  name: string;
  weight: number;
  type: 'FORMATIVE' | 'MIDTERM' | 'FINAL' | 'SKILL' | 'US_PRACTICE' | 'US_THEORY';
  typeCode?: string | null;
  entryMode?: 'NF_SERIES' | 'SINGLE_SCORE' | string | null;
  entryModeCode?: string | null;
  reportSlot?: 'NONE' | 'FORMATIF' | 'SBTS' | 'SAS' | 'US_THEORY' | 'US_PRACTICE' | string | null;
  reportSlotCode?: string | null;
  includeInFinalScore?: boolean;
  displayOrder?: number;
  academicYearId?: number | null;
  isActive: boolean;
};

export type StudentGradeRow = {
  id: number;
  studentId: number;
  subjectId: number;
  academicYearId: number;
  componentId: number;
  semester: 'ODD' | 'EVEN';
  score: number;
  nf1?: number | null;
  nf2?: number | null;
  nf3?: number | null;
  nf4?: number | null;
  nf5?: number | null;
  nf6?: number | null;
  formativeSeries?: number[] | null;
  kkm?: number;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
  component: {
    id: number;
    name: string;
    type: string;
    weight: number;
  };
};

type ComponentsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: GradeComponent[];
};

type StudentGradesResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: StudentGradeRow[];
};

export type ReportGradeRow = {
  id: number;
  studentId: number;
  subjectId: number;
  academicYearId: number;
  semester: 'ODD' | 'EVEN';
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  slotScores?: Record<string, number | null> | null;
  description?: string | null;
};

type ReportGradesResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ReportGradeRow[];
};

type BulkSaveResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    success: number;
    failed: number;
    errors: Array<{ student_id: number; error: string }>;
    reportSync?: {
      success: number;
      failed: number;
      errors: Array<{
        student_id: number;
        subject_id: number;
        academic_year_id: number;
        semester: 'ODD' | 'EVEN';
        error: string;
      }>;
    };
  };
};

export const teacherGradeApi = {
  async getComponents(params: {
    subjectId: number;
    academicYearId?: number | null;
    assignmentId?: number | null;
    semester?: 'ODD' | 'EVEN' | string | null;
  }) {
    const response = await apiClient.get<ComponentsResponse>('/grades/components', {
      params: {
        subject_id: params.subjectId,
        academic_year_id: params.academicYearId ?? undefined,
        assignment_id: params.assignmentId ?? undefined,
        semester: params.semester ?? undefined,
      },
    });
    return response.data.data || [];
  },
  async getStudentGrades(params: {
    classId: number;
    subjectId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<StudentGradesResponse>('/grades/student-grades', {
      params: {
        class_id: params.classId,
        subject_id: params.subjectId,
        academic_year_id: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data.data || [];
  },
  async getReportGrades(params: {
    classId: number;
    subjectId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<ReportGradesResponse>('/grades/report-grades', {
      params: {
        class_id: params.classId,
        subject_id: params.subjectId,
        academic_year_id: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data.data || [];
  },
  async saveBulk(payload: {
    grades: Array<{
      student_id: number;
      subject_id: number;
      academic_year_id: number;
      grade_component_id: number;
      semester: 'ODD' | 'EVEN';
      score: number | null;
      nf1?: number | null;
      nf2?: number | null;
      nf3?: number | null;
      nf4?: number | null;
      nf5?: number | null;
      nf6?: number | null;
      formative_series?: number[] | null;
      description?: string;
    }>;
  }) {
    const response = await apiClient.post<BulkSaveResponse>('/grades/student-grades/bulk', payload);
    return response.data.data;
  },
};
