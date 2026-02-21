import { apiClient } from '../../lib/api/client';

export type TeacherSubjectReportItem = {
  id: number;
  studentId: number;
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
  student?: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  } | null;
};

type TeacherSubjectReportResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherSubjectReportItem[];
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
      },
    });
    return response.data.data || [];
  },
  async updateReportGrade(
    id: number,
    payload: {
      formatifScore?: number | null;
      sbtsScore?: number | null;
      sasScore?: number | null;
      description?: string;
    },
  ) {
    const response = await apiClient.put<TeacherSubjectReportMutationResponse>(`/grades/report-grades/${id}`, {
      formatif_score: payload.formatifScore,
      sbts_score: payload.sbtsScore,
      sas_score: payload.sasScore,
      competency_desc: payload.description,
    });
    return response.data.data;
  },
};
