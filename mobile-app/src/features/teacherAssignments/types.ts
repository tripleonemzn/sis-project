export type TeacherAssignment = {
  id: number;
  teacherId: number;
  subjectId: number;
  academicYearId: number;
  classId: number;
  kkm: number;
  competencyThresholds?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  } | null;
  teacher: {
    id: number;
    name: string;
    username: string;
  };
  subject: {
    id: number;
    name: string;
    code: string;
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
    _count?: {
      students: number;
    };
  };
  academicYear: {
    id: number;
    name: string;
    semester?: string;
  };
  _count?: {
    scheduleEntries: number;
  };
};

export type TeacherAssignmentDetail = {
  id: number;
  teacherId: number;
  subjectId: number;
  academicYearId: number;
  classId: number;
  kkm: number;
  competencyThresholds?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  } | null;
  teacher: {
    id: number;
    name: string;
  };
  subject: {
    id: number;
    name: string;
    code: string;
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
    students: Array<{
      id: number;
      name: string;
      nis: string | null;
      nisn: string | null;
      gender: 'MALE' | 'FEMALE';
    }>;
  };
  academicYear: {
    id: number;
    name: string;
    semester?: string;
  };
};
