export type StudentAttendanceStatus = 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT' | 'ALPHA' | 'LATE';

export type StudentAttendanceHistory = {
  id: number;
  date: string;
  status: StudentAttendanceStatus;
  note?: string | null;
  notes?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

export type DailyPresenceCaptureSource =
  | 'SELF_SCAN'
  | 'ASSISTED_SCAN'
  | 'MANUAL_ADJUSTMENT'
  | 'LEGACY_DAILY';

export type DailyPresenceEventType = 'CHECK_IN' | 'CHECK_OUT';

export type DailyPresencePolicyDayKey =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export type DailyPresencePolicyWindow = {
  openAt: string;
  closeAt: string;
};

export type DailyPresencePolicyDay = {
  enabled: boolean;
  checkIn: DailyPresencePolicyWindow & {
    onTimeUntil: string;
  };
  checkOut: DailyPresencePolicyWindow & {
    validFrom: string;
  };
  teacherDutySaturdayMode?: 'DISABLED' | 'MANUAL' | 'QR';
  notes?: string | null;
};

export type DailyPresencePolicy = {
  version: 1;
  timezone: 'Asia/Jakarta';
  qrRefreshSeconds: number;
  days: Record<DailyPresencePolicyDayKey, DailyPresencePolicyDay>;
};

export type DailyPresencePolicyPayload = {
  academicYear: {
    id: number;
    name: string;
  };
  policy: DailyPresencePolicy;
  source?: 'SAVED' | 'DEFAULT';
  updatedAt?: string | null;
};

export type DailyPresenceEventItem = {
  id: number;
  eventType: DailyPresenceEventType;
  source: DailyPresenceCaptureSource;
  reason?: string | null;
  gateLabel?: string | null;
  recordedAt: string;
  recordedTime?: string | null;
  lateMinutes?: number | null;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
  participant?: {
    id: number;
    name: string;
    username?: string | null;
    nip?: string | null;
    role: 'TEACHER' | 'STAFF' | 'PRINCIPAL' | 'EXTRACURRICULAR_TUTOR';
    ptkType?: string | null;
  };
  class?: {
    id: number;
    name: string;
  };
  actor?: {
    id: number;
    name: string;
  } | null;
};

export type DailyPresenceOverview = {
  date: string;
  academicYear: {
    id: number;
    name: string;
  };
  summary: {
    checkInCount: number;
    checkOutCount: number;
    openDayCount: number;
    assistedEventCount: number;
    studentCheckInCount: number;
    studentCheckOutCount: number;
    studentOpenDayCount: number;
    assistedStudentEventCount: number;
    userCheckInCount: number;
    userCheckOutCount: number;
    userOpenDayCount: number;
    assistedUserEventCount: number;
  };
  recentEvents: DailyPresenceEventItem[];
};

export type DailyPresenceStudentState = {
  date: string;
  academicYear: {
    id: number;
    name: string;
  };
  student: {
    id: number;
    name: string;
    photo?: string | null;
    nis?: string | null;
    nisn?: string | null;
    class?: {
      id: number;
      name: string;
    } | null;
  };
  presence: {
    id: number | null;
    date: string | null;
    status: StudentAttendanceStatus | null;
    note?: string | null;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    checkInSource?: DailyPresenceCaptureSource | null;
    checkOutSource?: DailyPresenceCaptureSource | null;
    checkInReason?: string | null;
    checkOutReason?: string | null;
  };
  recentEvents: DailyPresenceEventItem[];
};

export type DailyPresenceUserState = {
  date: string;
  academicYear: {
    id: number;
    name: string;
  };
  participant: {
    id: number;
    name: string;
    username?: string | null;
    photo?: string | null;
    nip?: string | null;
    role: 'TEACHER' | 'STAFF' | 'PRINCIPAL' | 'EXTRACURRICULAR_TUTOR';
    ptkType?: string | null;
    additionalDuties?: string[];
  };
  presence: DailyPresenceStudentState['presence'] & {
    checkInLateMinutes?: number | null;
    checkOutEarlyMinutes?: number | null;
    scheduleBasis?: unknown;
  };
  recentEvents: Array<
    DailyPresenceEventItem & {
      lateMinutes?: number | null;
    }
  >;
};

export type DailyPresenceOwnState = DailyPresenceStudentState | DailyPresenceUserState;

export type DailyPresenceMonitorScanResult = DailyPresenceOwnState & {
  checkpoint: DailyPresenceEventType;
  gateLabel?: string | null;
  recordedAt: string;
  recordedTime?: string | null;
  lateMinutes?: number | null;
};

export type DailyPresenceSelfScanSession = {
  sessionId: string;
  checkpoint: DailyPresenceEventType;
  gateLabel?: string | null;
  date: string;
  challengeWindowSeconds: number;
  challengeWindowExpiresAt: string;
  sessionExpiresAt: string;
};

export type DailyPresenceSelfScanMonitor = {
  qrToken: string;
  qrCodeDataUrl: string;
  qrExpiresAt: string;
  refreshSeconds: number;
  challengeCode: string;
  generatedAt: string;
};

export type DailyPresenceSelfScanManagerSession = DailyPresenceSelfScanSession & {
  actor: {
    id: number;
    name: string;
  };
  challengeSecret: string;
  challengeCode: string;
  monitor?: DailyPresenceSelfScanMonitor | null;
};

export type DailyPresenceSelfScanPass = {
  date: string;
  academicYear: {
    id: number;
    name: string;
  };
  student: {
    id: number;
    name: string;
    photo?: string | null;
    nis?: string | null;
    nisn?: string | null;
    class?: {
      id: number;
      name: string;
    } | null;
  };
  session: DailyPresenceSelfScanSession;
  checkpoint: DailyPresenceEventType;
  qrToken: string;
  qrCodeDataUrl: string;
  qrExpiresAt: string;
};

export type DailyPresenceSelfScanPreview = {
  date: string;
  academicYear: {
    id: number;
    name: string;
  };
  checkpoint: DailyPresenceEventType;
  gateLabel?: string | null;
  student: {
    id: number;
    name: string;
    photo?: string | null;
    nis?: string | null;
    nisn?: string | null;
    class: {
      id: number;
      name: string;
    };
  };
  alreadyRecorded: boolean;
};

export type DailyPresenceOperationalStudent = {
  id: number;
  username: string;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  photo?: string | null;
  studentStatus?: string | null;
  verificationStatus?: string | null;
  studentClass?: {
    id: number;
    name: string;
    level?: string | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
};

export type DailyPresenceOperationalParticipant = {
  id: number;
  username?: string | null;
  name: string;
  photo?: string | null;
  nip?: string | null;
  role: 'TEACHER' | 'STAFF' | 'PRINCIPAL' | 'EXTRACURRICULAR_TUTOR';
  ptkType?: string | null;
  additionalDuties?: string[];
};

export type TeacherAttendanceStatus = 'PRESENT' | 'ABSENT' | 'SICK' | 'PERMISSION' | 'LATE';
export type AttendanceRecapPeriod = 'YEAR' | 'SEMESTER' | 'MONTH' | 'WEEK';
export type TeacherAttendanceMonitorStatus = 'SUBMITTED' | 'MISSING' | 'LATE_INPUT' | 'EDITED';

export type TeacherSubjectAttendanceRecord = {
  studentId: number;
  status: TeacherAttendanceStatus;
  note?: string | null;
};

export type TeacherSubjectAttendance = {
  id: number;
  date: string;
  classId: number;
  subjectId: number;
  academicYearId: number;
  records: TeacherSubjectAttendanceRecord[];
};

export type DailyAttendanceStudent = {
  id: number;
  name: string;
  nis: string | null;
  nisn: string | null;
};

export type DailyAttendanceEntry = {
  student: DailyAttendanceStudent;
  status: TeacherAttendanceStatus | null;
  note?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

export type DailyLateSummaryRow = {
  student: DailyAttendanceStudent;
  semester1Late: number;
  semester2Late: number;
  totalLate: number;
};

export type DailyLateSummaryPayload = {
  recap: DailyLateSummaryRow[];
  meta: {
    classId: number;
    academicYearId: number;
  };
};

export type AttendanceSummaryCounts = {
  present: number;
  late: number;
  sick: number;
  permission: number;
  absent: number;
  total: number;
  percentage: number;
};

export type AttendanceDetailRecord = {
  id?: number;
  attendanceId?: number;
  date: string;
  status: TeacherAttendanceStatus;
  note?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  recordedAt?: string | null;
  editedAt?: string | null;
  recordedByName?: string | null;
  editedByName?: string | null;
};

export type AttendanceDetailStudent = {
  student: DailyAttendanceStudent;
  summary: AttendanceSummaryCounts;
  details: AttendanceDetailRecord[];
};

export type AttendanceDetailPayload = {
  students: AttendanceDetailStudent[];
  meta: {
    classId: number;
    subjectId?: number | null;
    academicYearId: number;
    period: AttendanceRecapPeriod;
    semester?: 'ODD' | 'EVEN' | null;
    status?: TeacherAttendanceStatus | null;
    dateRange?: {
      start: string;
      end: string;
    };
  };
};

export type TeacherClassAttendanceSession = {
  date: string;
  dayOfWeek: string;
  period: number;
  room?: string | null;
  teacher: {
    id: number;
    name: string;
  };
  class: {
    id: number;
    name: string;
    level?: string | null;
  };
  subject: {
    id: number;
    name: string;
    code?: string | null;
  };
  status: 'SUBMITTED' | 'MISSING';
  isLateInput: boolean;
  isEdited: boolean;
  attendance?: {
    id: number;
    recordedAt: string;
    editedAt: string;
    recordedById?: number | null;
    editedById?: number | null;
  } | null;
};

export type TeacherClassAttendanceRecapPayload = {
  summary: {
    expected: number;
    submitted: number;
    missing: number;
    lateInput: number;
    edited: number;
  };
  sessions: TeacherClassAttendanceSession[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  meta: {
    academicYearId: number;
    classId?: number | null;
    subjectId?: number | null;
    teacherId?: number | null;
    period: AttendanceRecapPeriod;
    semester?: 'ODD' | 'EVEN' | null;
    monitorStatus?: TeacherAttendanceMonitorStatus | null;
    dateRange?: {
      start: string;
      end: string;
    };
  };
};
