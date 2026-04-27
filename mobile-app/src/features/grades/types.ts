export type StudentGradeOverviewComponent = {
  code: string;
  label: string;
  type: string;
  reportSlotCode: string;
  entryMode: string;
  includeInFinalScore: boolean;
  displayOrder: number;
  release: {
    mode: 'DIRECT' | 'SCHEDULED' | 'REPORT_DATE';
    modeLabel: string;
    code: 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'HOMEROOM_BLOCKED';
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
    canViewDetails: boolean;
    effectiveDate: string | null;
    source: 'DIRECT' | 'PROGRAM_DATE' | 'REPORT_DATE' | 'HOMEROOM';
  };
};

export type StudentGradeOverviewSubjectComponent = StudentGradeOverviewComponent & {
  score: number | null;
  series: number[];
  status: 'AVAILABLE' | 'PENDING';
  source: 'REPORT_GRADE' | 'STUDENT_GRADE' | 'NONE';
};

export type StudentGradeOverviewSubjectRow = {
  subject: {
    id: number;
    code: string;
    name: string;
  };
  teacher: {
    id: number;
    name: string;
  } | null;
  kkm: number;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
  status: 'AVAILABLE' | 'PENDING';
  componentSummary: {
    totalCount: number;
    availableCount: number;
    pendingCount: number;
  };
  components: StudentGradeOverviewSubjectComponent[];
};

export type StudentSemesterReportSubjectRow = {
  subject: {
    id: number;
    code: string;
    name: string;
  };
  teacher: {
    id: number;
    name: string;
  } | null;
  kkm: number;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
  status: 'AVAILABLE' | 'PENDING' | 'LOCKED';
};

export type StudentSemesterReportData = {
  semester: 'ODD' | 'EVEN';
  semesterLabel: string;
  semesterType: 'SAS' | 'SAT';
  reportDate: {
    place: string;
    date: string;
    reportType: string;
  } | null;
  release: {
    code: 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'HOMEROOM_BLOCKED';
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
    canViewDetails: boolean;
    source: 'REPORT_DATE' | 'HOMEROOM';
    effectiveDate: string | null;
  };
  status: {
    code: 'NOT_READY' | 'PARTIAL' | 'READY';
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
  };
  summary: {
    expectedSubjects: number;
    availableSubjects: number;
    missingSubjects: number;
    averageFinalScore: number | null;
  };
  attendance: {
    hadir: number;
    sakit: number;
    izin: number;
    alpha: number;
  };
  presenceSummary: {
    checkInRecorded: number;
    checkOutRecorded: number;
    openPresence: number;
    averageCheckInTime: string | null;
    averageCheckOutTime: string | null;
  };
  homeroomNote: string | null;
  subjects: StudentSemesterReportSubjectRow[];
};

export type StudentGradeOverviewData = {
  meta: {
    academicYearId: number;
    academicYearName: string;
    semester: 'ODD' | 'EVEN';
    semesterLabel: string;
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    class: {
      id: number;
      name: string;
      level: string;
      major: {
        id: number;
        name: string;
        code: string;
      } | null;
    } | null;
  };
  summary: {
    totalSubjects: number;
    subjectsWithAnyScore: number;
    availableComponents: number;
    pendingComponents: number;
    averageFinalScore: number | null;
  };
  components: StudentGradeOverviewComponent[];
  subjects: StudentGradeOverviewSubjectRow[];
  reportCard: StudentSemesterReportData;
};

export type HomeroomResultPublicationProgramOption = {
  publicationCode: string;
  label: string;
  shortLabel: string;
  baseTypeCode: string;
  fixedSemester: 'ODD' | 'EVEN' | null;
  globalRelease: StudentGradeOverviewComponent['release'];
  homeroomPublication: {
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    label: string;
    description: string;
    updatedAt: string | null;
  };
};

export type HomeroomResultPublicationStudentRow = {
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    photo?: string | null;
  };
  homeroomPublication: {
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    label: string;
    description: string;
    updatedAt: string | null;
  };
  effectiveVisibility: {
    canViewDetails: boolean;
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
  };
};

export type HomeroomResultPublicationsData = {
  academicYear: {
    id: number;
    name: string;
  };
  class: {
    id: number;
    name: string;
    level: string;
    major: {
      id: number;
      name: string;
      code: string;
    } | null;
  };
  programs: HomeroomResultPublicationProgramOption[];
  selectedProgram: HomeroomResultPublicationProgramOption | null;
  summary: {
    totalStudents: number;
    blockedStudents: number;
    visibleStudents: number;
    waitingWakakurStudents: number;
  };
  rows: HomeroomResultPublicationStudentRow[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
