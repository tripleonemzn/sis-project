export type StudentGradeOverviewComponent = {
  code: string;
  label: string;
  type: string;
  reportSlotCode: string;
  entryMode: string;
  includeInFinalScore: boolean;
  displayOrder: number;
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
};
