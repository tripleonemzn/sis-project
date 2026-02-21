import { apiClient } from '../../lib/api/client';
import {
  HomeroomExtracurricularStudent,
  HomeroomLedgerData,
  HomeroomRankingData,
  HomeroomReportType,
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
    semester: HomeroomSemester;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomLedgerData>>('/reports/ledger', {
      params: {
        classId: params.classId,
        semester: params.semester,
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
    semester: HomeroomSemester;
    reportType: HomeroomReportType;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomExtracurricularStudent[]>>('/reports/extracurricular', {
      params: {
        classId: params.classId,
        semester: params.semester,
        reportType: params.reportType,
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
    semester: HomeroomSemester;
    type: HomeroomReportType;
  }) {
    const response = await apiClient.get<ApiEnvelope<HomeroomStudentReportData>>('/reports/student/sbts', {
      params: {
        studentId: params.studentId,
        semester: params.semester,
        type: params.type,
      },
    });

    return response.data?.data;
  },
};
