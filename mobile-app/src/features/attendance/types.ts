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

export type DailyPresenceEventItem = {
  id: number;
  eventType: DailyPresenceEventType;
  source: DailyPresenceCaptureSource;
  reason?: string | null;
  gateLabel?: string | null;
  recordedAt: string;
  recordedTime?: string | null;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
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

export type TeacherAttendanceStatus = 'PRESENT' | 'ABSENT' | 'SICK' | 'PERMISSION' | 'LATE';

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
