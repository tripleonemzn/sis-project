import { apiClient } from '../../lib/api/client';

export type TeacherSubjectReportItem = {
  id: number;
  studentId: number;
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  slotScores?: Record<string, number | null> | null;
  predicate: string | null;
  description: string | null;
  student?: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  } | null;
};

export type TeacherSubjectReportMeta = {
  primarySlots: {
    formative: string;
    midterm: string;
    final: string;
  };
  includeSlots: string[];
  slotLabels: Record<string, { label: string; componentType: string }>;
};

type TeacherSubjectReportResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    rows: TeacherSubjectReportItem[];
    meta: TeacherSubjectReportMeta | null;
  };
};

type TeacherSubjectReportMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherSubjectReportItem;
};

export const teacherReportApi = {
  async getSubjectReport(params: {
    classId: number;
    subjectId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<TeacherSubjectReportResponse>('/grades/report-grades', {
      params: {
        class_id: params.classId,
        subject_id: params.subjectId,
        academic_year_id: params.academicYearId,
        semester: params.semester,
        include_meta: 1,
      },
    });
    return response.data.data || { rows: [], meta: null };
  },
  async updateReportGrade(
    id: number,
    payload: {
      formatifScore?: number | null;
      sbtsScore?: number | null;
      sasScore?: number | null;
      slotScores?: Record<string, number | null>;
      description?: string;
    },
  ) {
    const response = await apiClient.put<TeacherSubjectReportMutationResponse>(`/grades/report-grades/${id}`, {
      formatif_score: payload.formatifScore,
      sbts_score: payload.sbtsScore,
      sas_score: payload.sasScore,
      slot_scores: payload.slotScores,
      competency_desc: payload.description,
    });
    return response.data.data;
  },
};
