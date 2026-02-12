import api from './api';

export interface ReportSubject {
  id: number;
  name: string;
  code: string;
  kkm: number;
}

export interface ReportStudentSubject {
  subject: ReportSubject;
  kkm: number;
  finalScore: number | null;
  predicate: string | null;
}

export interface ReportStudentSummary {
  averageScore: number | null;
  passedCount: number;
  failedCount: number;
}

export interface ReportStudentRow {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  subjects: ReportStudentSubject[];
  summary: ReportStudentSummary;
}

export interface ClassReportSummary {
  class: {
    id: number;
    name: string;
    level: string;
    academicYear: {
      id: number;
      name: string;
    };
    major: {
      id: number;
      name: string;
      code: string;
    };
    teacher: {
      id: number;
      name: string;
      username: string;
    } | null;
  };
  subjects: ReportSubject[];
  students: ReportStudentRow[];
  meta: {
    academicYearId: number;
  };
}

export interface SbtsReportData {
  header: {
    title: string;
    schoolName: string;
    academicYear: string;
    semester: string;
    studentName: string;
    nis: string;
    nisn: string;
    class: string;
    major: string;
  };
  body: {
    groups: Record<string, {
      subjectId: number;
      name: string;
      teacherName: string;
      kkm: number;
      formatif: { score: number; predicate: string };
      sbts: { score: number; predicate: string };
      final: { score: number; predicate: string };
      description: string;
    }[]>;
    extracurriculars?: { name: string; grade: string; description: string }[];
    achievements?: { name: string; description: string }[];
    attendance?: { sick: number; permission: number; absent: number };
    homeroomNote?: string;
  };
  footer: {
    place: string;
    date: string;
    signatures: {
      parent: { title: string; name: string };
      homeroom: { title: string; name: string; nip: string };
      principal: { title: string; name: string };
    };
  };
}

export const reportService = {
  getClassReportSummary: async (params: { classId: number; academicYearId?: number }) => {
    const response = await api.get('/reports/report-cards', { params });
    return response.data.data as ClassReportSummary;
  },

  getStudentSbtsReport: async (params: { studentId: number; academicYearId: number; semester: 'ODD' | 'EVEN'; type: 'SBTS' | 'SAS' | 'SAT' }) => {
    const response = await api.get('/reports/student/sbts', { params });
    return response.data.data;
  },

  getClassRankings: async (params: { classId: number; academicYearId?: number; semester: 'ODD' | 'EVEN' }) => {
    const response = await api.get('/reports/rankings', { params });
    return response.data.data;
  },
};
