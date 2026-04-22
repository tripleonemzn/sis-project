export type ProctorScheduleStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';

export type ProctorScheduleSummary = {
  id: number;
  slotKey?: string | null;
  startTime: string;
  endTime: string;
  periodNumber?: number | null;
  sessionLabel?: string | null;
  room: string | null;
  proctorId: number | null;
  subjectName?: string | null;
  classNames?: string[];
  participantCount?: number;
  packet: {
    title: string;
    subject: {
      name: string;
    };
    duration: number;
    type?: string;
  } | null;
  class: {
    name: string;
  } | null;
  _count?: {
    sessions: number;
  };
};

export type ProctorStudentRow = {
  id: number;
  name: string;
  nis: string | null;
  status: ProctorScheduleStatus;
  startTime: string | null;
  submitTime: string | null;
  score?: number | null;
  answeredCount?: number;
  totalQuestions?: number;
  className?: string | null;
  monitoring?: {
    totalViolations?: number;
    tabSwitchCount?: number;
    fullscreenExitCount?: number;
    appSwitchCount?: number;
    lastViolationType?: string | null;
    lastViolationAt?: string | null;
    currentQuestionIndex?: number;
    currentQuestionNumber?: number;
    currentQuestionId?: string | null;
    lastSyncAt?: string | null;
  };
  proctorWarning?: {
    count: number;
    latestTitle?: string | null;
    latestMessage?: string | null;
    warnedAt?: string | null;
    warnedByName?: string | null;
  } | null;
  proctorTermination?: {
    latestTitle?: string | null;
    latestMessage?: string | null;
    terminatedAt?: string | null;
    terminatedByName?: string | null;
  } | null;
  restriction?: {
    isBlocked: boolean;
    reason?: string | null;
    manualBlocked?: boolean;
    autoBlocked?: boolean;
    statusLabel?: string | null;
  };
};

export type ProctorReportSummary = {
  id: number;
  proctorId: number;
  signedAt?: string;
  updatedAt?: string;
  notes?: string | null;
  incident?: string | null;
  documentNumber?: string | null;
  proctor?: {
    id: number;
    name: string;
  } | null;
};

export type ProctorScheduleDetail = {
  schedule: {
    id: number;
    startTime: string;
    endTime: string;
    serverNow?: string;
    room: string | null;
    token?: string | null;
    displayTitle?: string;
    examLabel?: string;
    academicYearName?: string | null;
    subjectName?: string;
    classNames?: string[];
    teacherNames?: string[];
    monitoredScheduleIds?: number[];
    attendanceSummary?: {
      expectedParticipants?: number;
      presentParticipants?: number;
      absentParticipants?: number;
    };
    packet: {
      title: string;
      subject: {
        name: string;
      };
      duration: number;
    } | null;
    class: {
      id: number;
      name: string;
    } | null;
    proctoringReports?: ProctorReportSummary[];
  };
  students: ProctorStudentRow[];
  isProctor?: boolean;
  isAuthor?: boolean;
  isSubjectTeacher?: boolean;
  canSubmitReport?: boolean;
  currentUserProctoringReport?: ProctorReportSummary | null;
  latestProctoringReport?: ProctorReportSummary | null;
};

export type ProctorReportPayload = {
  notes: string;
  incident?: string;
  studentCountPresent: number;
  studentCountAbsent: number;
};

export type ProctorWarningPayload = {
  studentId: number;
  message: string;
  category?: string | null;
};

export type ProctorWarningResponse = {
  id: number;
  studentId: number;
  scheduleId: number;
  title: string;
  message: string;
  warnedAt: string;
  proctorName?: string | null;
  category?: string | null;
};

export type ProctorEndSessionPayload = {
  studentId: number;
  message: string;
  category?: string | null;
};

export type ProctorEndSessionResponse = {
  id: number;
  studentId: number;
  scheduleId: number;
  sessionId: number;
  title: string;
  message: string;
  terminatedAt: string;
  proctorName?: string | null;
  category?: string | null;
};
