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

export interface FinalLedgerPreviewPayload {
  academicYearIds?: number[];
  semesters?: Array<'ODD' | 'EVEN'>;
  classId?: number;
  majorId?: number;
  studentId?: number;
  limitStudents?: number;
}

export interface FinalLedgerPreviewSemesterColumn {
  key: string;
  label: string;
  academicYearId: number;
  academicYearName: string;
  semester: 'ODD' | 'EVEN';
  order: number;
}

export interface FinalLedgerPreviewSubjectColumn {
  id: number;
  name: string;
  code: string;
}

export interface FinalLedgerPreviewRow {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
    class: {
      id: number;
      name: string;
      level: string;
    } | null;
    major: {
      id: number;
      name: string;
      code: string;
    } | null;
  };
  portfolioBySemester: Record<string, number | null>;
  portfolioAverage: number | null;
  ledgerBySubject: Record<string, number | null>;
  assignmentScore: number | null;
  usTheory: number | null;
  usPractice: number | null;
  usAverage: number | null;
  pklScore: number | null;
  finalScore: number | null;
}

export interface FinalLedgerPreviewResult {
  filters: {
    academicYears: Array<{ id: number; name: string }>;
    semesters: Array<'ODD' | 'EVEN'>;
    classId: number | null;
    majorId: number | null;
    studentId: number | null;
  };
  columns: {
    semesterColumns: FinalLedgerPreviewSemesterColumn[];
    subjectColumns: FinalLedgerPreviewSubjectColumn[];
  };
  summary: {
    totalStudents: number;
    totalSubjects: number;
    studentsWithResult: number;
    averagePortfolio: number | null;
    averageUs: number | null;
    averagePkl: number | null;
    averageFinal: number | null;
  };
  rows: FinalLedgerPreviewRow[];
}

// Backward aliases for old imports
export type ConsolidationComponentKey = 'semesterReport' | 'usTheory' | 'usPractice' | 'ukk' | 'pkl';
export type ConsolidationPreviewPayload = FinalLedgerPreviewPayload;
export type ConsolidationPreviewRow = FinalLedgerPreviewRow;
export type ConsolidationPreviewResult = FinalLedgerPreviewResult;

export const reportService = {
  getClassReportSummary: async (params: { classId: number; academicYearId?: number }) => {
    const response = await api.get('/reports/report-cards', { params });
    return response.data.data as ClassReportSummary;
  },

  getStudentReport: async (params: {
    studentId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    type?: string;
    programCode?: string;
  }) => {
    const response = await api.get('/reports/student', { params });
    return response.data.data;
  },

  getStudentSbtsReport: async (params: {
    studentId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    type?: string;
    programCode?: string;
  }) => {
    const response = await api.get('/reports/student', { params });
    return response.data.data;
  },

  getClassRankings: async (params: { classId: number; academicYearId?: number; semester: 'ODD' | 'EVEN' }) => {
    const response = await api.get('/reports/rankings', { params });
    return response.data.data;
  },
  getFinalLedgerPreview: async (payload: FinalLedgerPreviewPayload) => {
    const response = await api.post('/reports/final-ledger/preview', payload);
    return response.data.data as FinalLedgerPreviewResult;
  },
  exportFinalLedgerPreview: async (payload: FinalLedgerPreviewPayload) => {
    const response = await api.post<Blob>('/reports/final-ledger/export', payload, {
      responseType: 'blob',
    });
    return response.data;
  },
  getConsolidationPreview: async (payload: ConsolidationPreviewPayload) => {
    const response = await api.post('/reports/consolidation/preview', payload);
    return response.data.data as ConsolidationPreviewResult;
  },
};
