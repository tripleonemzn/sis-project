export type HomeroomReportType = string;
export type HomeroomReportBaseType = string;
export type HomeroomSemester = 'ODD' | 'EVEN';

export type HomeroomStudentSummary = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
};

export type HomeroomLedgerSubject = {
  id: number;
  name: string;
  code: string;
};

export type HomeroomLedgerGrade = {
  nf1: number | null;
  nf2: number | null;
  nf3: number | null;
  formatif: number | null;
  sbts: number | null;
  finalComponent?: number | null;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
};

export type HomeroomLedgerStudent = HomeroomStudentSummary & {
  grades: Record<number, HomeroomLedgerGrade>;
};

export type HomeroomLedgerData = {
  subjects: HomeroomLedgerSubject[];
  students: HomeroomLedgerStudent[];
  meta?: {
    reportType?: string;
    reportComponentType?: string;
    reportComponentMode?: string;
    reportProgramCode?: string | null;
    reportProgramLabel?: string | null;
    col1Label?: string;
    col2Label?: string;
    formativeSlotCode?: string;
    midtermSlotCode?: string;
    finalSlotCode?: string;
  };
};

export type HomeroomExtracurricularGrade = {
  id: number;
  ekskulName: string;
  grade: string;
  description: string;
};

export type HomeroomOrganizationGrade = {
  sourceType: 'OSIS';
  name: string;
  positionName?: string | null;
  divisionName?: string | null;
  grade: string;
  description: string;
};

export type HomeroomAchievement = {
  id: number;
  name: string;
  rank: string;
  level: string;
};

export type HomeroomExtracurricularStudent = HomeroomStudentSummary & {
  attendance: {
    s: number;
    i: number;
    a: number;
  };
  catatan: string;
  extracurriculars: HomeroomExtracurricularGrade[];
  organizations: HomeroomOrganizationGrade[];
  achievements: HomeroomAchievement[];
};

export type HomeroomRankingRow = {
  rank: number;
  totalScore: number;
  averageScore: number;
  subjectCount: number;
  student: HomeroomStudentSummary;
};

export type HomeroomRankingData = {
  className: string;
  academicYear: string;
  semester: HomeroomSemester;
  homeroomTeacher?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  principalName: string;
  principalNip: string;
  rankings: HomeroomRankingRow[];
};

export type HomeroomStudentReportSubjectCell = {
  score: number | null;
  predicate: string | null;
  description?: string | null;
};

export type HomeroomStudentReportSubjectRow = {
  id?: number;
  no?: number | string;
  name: string;
  kkm?: number | null;
  isHeader?: boolean;
  rowCount?: number;
  skipNoColumn?: boolean;
  teacherName?: string | null;
  col1?: HomeroomStudentReportSubjectCell | null;
  col2?: HomeroomStudentReportSubjectCell | null;
  final?: HomeroomStudentReportSubjectCell | null;
  formatif?: HomeroomStudentReportSubjectCell | null;
  sbts?: HomeroomStudentReportSubjectCell | null;
  description?: string | null;
};

export type HomeroomStudentReportData = {
  header: {
    schoolName: string;
    semester: string;
    academicYear: string;
    studentName: string;
    nis: string;
    nisn: string;
    class: string;
    major: string;
    fase?: string;
  };
  body: {
    groups: Record<'A' | 'B' | 'C', HomeroomStudentReportSubjectRow[]>;
    meta?: {
      reportType?: string;
      reportComponentType?: string;
      reportComponentMode?: string;
      reportProgramCode?: string | null;
      reportProgramLabel?: string | null;
      col1Label?: string;
      col2Label?: string;
      formativeSlotCode?: string;
      midtermSlotCode?: string;
      finalSlotCode?: string;
    };
    extracurriculars?: Array<{
      name: string;
      grade: string;
      description: string;
    }>;
    organizations?: Array<{
      sourceType: 'OSIS';
      name: string;
      positionName?: string | null;
      divisionName?: string | null;
      grade: string;
      description: string;
    }>;
    achievements?: Array<{
      name: string;
      description: string;
    }>;
    attendance?: {
      sick: number;
      permission: number;
      absent: number;
    };
    presenceSummary?: {
      checkInRecorded: number;
      checkOutRecorded: number;
      openPresence: number;
      averageCheckInTime: string | null;
      averageCheckOutTime: string | null;
    };
    homeroomNote?: string;
  };
  footer: {
    date?: string;
    place?: string;
    signatures?: {
      parent?: {
        title?: string;
        name?: string;
      };
      homeroom?: {
        title?: string;
        name?: string;
        nip?: string;
      };
      principal?: {
        title?: string;
        name?: string;
        nip?: string;
      };
    };
  };
};
