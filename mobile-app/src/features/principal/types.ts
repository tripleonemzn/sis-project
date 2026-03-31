export type PrincipalTopStudent = {
  studentId: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  averageScore: number;
  class?: {
    id: number;
    name: string;
    level?: string | null;
  } | null;
  major?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
};

export type PrincipalMajorSummary = {
  majorId: number;
  name: string;
  code?: string | null;
  totalStudents: number;
  averageScore: number;
};

export type PrincipalAcademicOverview = {
  academicYear: {
    id: number;
    name: string;
  };
  semester?: 'ODD' | 'EVEN' | null;
  topStudents: PrincipalTopStudent[];
  majors: PrincipalMajorSummary[];
};

export type PrincipalStudentByMajorStat = {
  majorId: number;
  name: string;
  code: string;
  totalStudents: number;
  totalClasses: number;
};

export type PrincipalTeacherAssignmentSummary = {
  totalAssignments: number;
  totalTeachersWithAssignments: number;
};

export type PrincipalDashboardSummary = {
  activeAcademicYear: {
    id: number;
    name: string;
  };
  totals: {
    students: number;
    teachers: number;
    pendingBudgetRequests: number;
    totalPendingBudgetAmount: number;
    totalPresentToday: number;
    totalAbsentToday: number;
  };
  studentByMajor: PrincipalStudentByMajorStat[];
  teacherAssignmentSummary: PrincipalTeacherAssignmentSummary | null;
  academicOverview: PrincipalAcademicOverview;
};

export type PrincipalBudgetRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PrincipalBudgetRequest = {
  id: number;
  title: string;
  description: string;
  totalAmount: number;
  quantity: number;
  unitPrice: number;
  additionalDuty: string;
  status: PrincipalBudgetRequestStatus;
  requester?: {
    name?: string;
  } | null;
  approvalStatus?: PrincipalBudgetRequestStatus;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrincipalProctorReportRow = {
  room: string | null;
  startTime: string;
  endTime: string;
  sessionLabel: string | null;
  examType: string | null;
  classNames: string[];
  expectedParticipants: number;
  presentParticipants: number;
  absentParticipants: number;
  totalParticipants: number;
  absentStudents?: Array<{
    id: number;
    name: string;
    nis?: string | null;
    className?: string | null;
    absentReason?: string | null;
    permissionStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  }>;
  report: {
    id: number;
    signedAt: string;
    notes: string | null;
    incident: string | null;
    proctor: {
      id: number;
      name: string;
    } | null;
  } | null;
};

export type PrincipalProctorReportSummary = {
  totalRooms: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  reportedRooms: number;
};

export type PrincipalProctorReportsResponse = {
  rows: PrincipalProctorReportRow[];
  summary: PrincipalProctorReportSummary;
};

export type PrincipalBpBkSummaryResponse = {
  academicYear: {
    id: number;
    name: string;
  } | null;
  summary: {
    totalCases: number;
    negativeCases: number;
    highRiskStudents: number;
    openCounselings: number;
    inProgressCounselings: number;
    closedCounselings: number;
    summonPendingCounselings: number;
    overdueCounselings: number;
  };
  highRiskStudents: Array<{
    studentId: number;
    studentName: string;
    nis: string | null;
    nisn: string | null;
    className: string | null;
    negativeCaseCount: number;
    totalNegativePoint: number;
  }>;
  overdueCounselings: Array<{
    id: number;
    sessionDate: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
    issueSummary: string;
    summonParent: boolean;
    summonDate: string | null;
    student: {
      id: number;
      name: string;
      nis: string | null;
      nisn: string | null;
      className: string | null;
    };
    counselor?: {
      id: number;
      name: string;
      username: string;
    } | null;
  }>;
};

export type PrincipalOfficeSummary = {
  totalLetters: number;
  monthlyLetters: number;
  byType: Array<{ type: string; _count: { _all: number } }>;
  latest: Array<{
    id: number;
    type: string;
    letterNumber: string;
    title?: string | null;
    recipientName: string;
    purpose?: string | null;
    printedAt?: string | null;
    createdAt: string;
  }>;
};
