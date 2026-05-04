export type TeachingJournalStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
export type TeachingJournalSessionStatus = TeachingJournalStatus | 'MISSING';
export type TeachingJournalDeliveryStatus = 'COMPLETED' | 'PARTIAL' | 'NOT_DELIVERED' | 'RESCHEDULED';
export type TeachingJournalMode = 'REGULAR' | 'SUBSTITUTE' | 'ENRICHMENT' | 'REMEDIAL' | 'ASSESSMENT';

export type TeachingJournalReference = {
  id?: number;
  sourceProgramCode: string;
  sourceEntryId?: number | null;
  sourceFieldIdentity?: string | null;
  selectionToken?: string | null;
  value: string;
  label?: string | null;
  snapshot?: Record<string, unknown> | null;
};

export type TeachingJournalEntry = {
  id: number;
  academicYearId: number;
  teacherId: number;
  reviewerId: number | null;
  teacherAssignmentId: number;
  scheduleEntryId: number;
  classId: number;
  subjectId: number;
  journalDate: string;
  period: number;
  room: string | null;
  teachingMode: TeachingJournalMode;
  deliveryStatus: TeachingJournalDeliveryStatus;
  status: TeachingJournalStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  notes?: string | null;
  obstacles?: string | null;
  followUpPlan?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
  references?: TeachingJournalReference[];
};

export type TeachingJournalSession = {
  sessionKey: string;
  date: string;
  dayOfWeek: string;
  period: number;
  periodStart?: number;
  periodEnd?: number;
  periodLabel?: string | null;
  jpCount?: number;
  timeRange?: string | null;
  room: string | null;
  teacher: {
    id: number;
    name: string;
    username?: string | null;
  };
  class: {
    id: number;
    name: string;
    level?: string | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  };
  subject: {
    id: number;
    name: string;
    code?: string | null;
  };
  teacherAssignmentId: number;
  scheduleEntryId: number;
  scheduleEntryIds?: number[];
  journalStatus: TeachingJournalSessionStatus;
  journal: TeachingJournalEntry | null;
  attendance: {
    id: number | null;
    status: 'RECORDED' | 'MISSING';
    recordedAt: string | null;
    editedAt: string | null;
  };
};

export type TeachingJournalSessionsPayload = {
  sessions: TeachingJournalSession[];
  meta: {
    academicYear: {
      id: number;
      name: string;
    };
    dateRange: {
      start: string;
      end: string;
    };
  };
};

export type TeachingJournalMonitoringAggregate = {
  expectedSessions: number;
  journalFilled: number;
  submittedSessions: number;
  reviewedSessions: number;
  draftSessions: number;
  missingSessions: number;
  attendanceRecorded: number;
  attendanceMismatch: number;
  referenceLinkedSessions: number;
  referenceFields: Record<string, number>;
  latestJournalAt: string | null;
  submittedAndReviewed: number;
  complianceRate: number;
  fillRate: number;
  attendanceRate: number;
  coverageRate: number;
};

export type TeachingJournalMonitoringTeacherRow = TeachingJournalMonitoringAggregate & {
  teacher: {
    id: number;
    name: string;
    username?: string | null;
  };
};

export type TeachingJournalMonitoringClassRow = TeachingJournalMonitoringAggregate & {
  class: {
    id: number;
    name: string;
    level?: string | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  };
};

export type TeachingJournalMonitoringIssueRow = {
  sessionKey: string;
  date: string;
  dayOfWeek: string;
  period: number;
  periodStart?: number;
  periodEnd?: number;
  periodLabel?: string | null;
  jpCount?: number;
  timeRange?: string | null;
  room: string | null;
  teacher: {
    id: number;
    name: string;
    username?: string | null;
  };
  class: {
    id: number;
    name: string;
    level?: string | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  };
  subject: {
    id: number;
    name: string;
    code?: string | null;
  };
  journalStatus: TeachingJournalSessionStatus;
  deliveryStatus?: TeachingJournalDeliveryStatus | null;
  attendanceStatus: 'RECORDED' | 'MISSING';
  referenceCount: number;
  issueLabels: string[];
  submittedAt?: string | null;
  updatedAt?: string | null;
};

export type TeachingJournalMonitoringPayload = {
  meta: {
    academicYear: {
      id: number;
      name: string;
    };
    dateRange: {
      start: string;
      end: string;
    };
    filters: {
      teacherId?: number | null;
      teacherAssignmentId?: number | null;
      classId?: number | null;
      subjectId?: number | null;
      search?: string | null;
    };
  };
  summary: TeachingJournalMonitoringAggregate;
  teacherRows: TeachingJournalMonitoringTeacherRow[];
  classRows: TeachingJournalMonitoringClassRow[];
  issueRows: TeachingJournalMonitoringIssueRow[];
};

export type TeachingJournalSessionQuery = {
  academicYearId?: number;
  startDate?: string;
  endDate?: string;
  journalStatus?: TeachingJournalSessionStatus;
  deliveryStatus?: TeachingJournalDeliveryStatus;
};

export type TeachingJournalMonitoringQuery = {
  academicYearId?: number;
  teacherId?: number;
  teacherAssignmentId?: number;
  classId?: number;
  subjectId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  issueLimit?: number;
};

export type UpsertTeachingJournalPayload = {
  id?: number;
  academicYearId?: number;
  scheduleEntryId: number;
  journalDate: string;
  teachingMode?: TeachingJournalMode;
  deliveryStatus?: TeachingJournalDeliveryStatus;
  status?: TeachingJournalStatus;
  notes?: string | null;
  obstacles?: string | null;
  followUpPlan?: string | null;
  references?: TeachingJournalReference[];
};

export type TeachingJournalReferenceProjectionRequest = {
  requestKey: string;
  sourceProgramCode: string;
  candidates: string[];
  filterByContext?: boolean;
  matchBySubject?: boolean;
  matchByClassLevel?: boolean;
  matchByMajor?: boolean;
  matchByActiveSemester?: boolean;
  context?: {
    subjectId?: number;
    classLevel?: string;
    programKeahlian?: string;
    semester?: string;
  };
};

export type TeachingJournalProjectedReferenceOption = {
  requestKey: string;
  selectValue: string;
  value: string;
  label: string;
  isAggregate?: boolean;
  lineCount?: number;
  sourceProgramCode: string;
  sourceEntryId: number;
  sourceEntryTitle?: string;
  sourceFieldKey?: string;
  sourceFieldIdentity?: string;
  snapshot: Record<string, string>;
};

export type TeachingJournalReferenceEntriesPayload = {
  academicYearId: number;
  limitPerProgram: number;
  teacherId: number | null;
  programs: Array<{
    programCode: string;
    total: number;
    limit: number;
    loaded?: number;
    options?: TeachingJournalProjectedReferenceOption[];
  }>;
};

export const JOURNAL_STATUS_LABELS: Record<TeachingJournalSessionStatus, string> = {
  MISSING: 'Belum Diisi',
  DRAFT: 'Draft',
  SUBMITTED: 'Terkirim',
  REVIEWED: 'Direview',
};

export const DELIVERY_STATUS_LABELS: Record<TeachingJournalDeliveryStatus, string> = {
  COMPLETED: 'Terlaksana Penuh',
  PARTIAL: 'Terlaksana Sebagian',
  NOT_DELIVERED: 'Tidak Terlaksana',
  RESCHEDULED: 'Dijadwalkan Ulang',
};

export const TEACHING_MODE_LABELS: Record<TeachingJournalMode, string> = {
  REGULAR: 'Reguler',
  SUBSTITUTE: 'Pengganti',
  ENRICHMENT: 'Pengayaan',
  REMEDIAL: 'Remedial',
  ASSESSMENT: 'Asesmen',
};
