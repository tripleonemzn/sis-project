import { apiClient } from '../../lib/api/client';
import {
  HomeroomExtracurricularStudent,
  HomeroomLedgerData,
  HomeroomRankingData,
  HomeroomSemester,
  HomeroomStudentReportData,
} from './types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export const homeroomReportApi = {
  async getClassLedger(params: {
    classId: number;
    academicYearId?: number;
    semester: HomeroomSemester;
    reportType?: string;
    programCode?: string;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomLedgerData>>('/reports/ledger', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        programCode: params.programCode,
        ...(params.reportType ? { reportType: params.reportType } : {}),
      },
    });

    return (
      response.data?.data || {
        subjects: [],
        students: [],
      }
    );
  },

  async getClassExtracurricular(params: {
    classId: number;
    academicYearId?: number;
    semester: HomeroomSemester;
    reportType?: string;
    programCode?: string;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomExtracurricularStudent[]>>('/reports/extracurricular', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        programCode: params.programCode,
        ...(params.reportType ? { reportType: params.reportType } : {}),
      },
    });

    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async getClassRankings(params: {
    classId: number;
    semester: HomeroomSemester;
    academicYearId?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomRankingData>>('/reports/rankings', {
      params: {
        classId: params.classId,
        semester: params.semester,
        academicYearId: params.academicYearId,
      },
    });

    return response.data?.data;
  },

  async getStudentReport(params: {
    studentId: number;
    academicYearId?: number;
    semester: HomeroomSemester;
    type?: string;
    programCode?: string;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomStudentReportData>>('/reports/student', {
      params: {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        programCode: params.programCode,
        ...(params.type ? { type: params.type } : {}),
      },
    });

    return response.data?.data;
  },
};
