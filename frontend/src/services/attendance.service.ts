import api from './api';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'SICK' | 'PERMISSION' | 'LATE';

export interface AttendanceRecord {
  studentId: number;
  status: AttendanceStatus;
  note?: string | null;
}

export interface SubjectAttendance {
  id: number;
  date: string;
  classId: number;
  subjectId: number;
  academicYearId: number;
  records: AttendanceRecord[];
}

export type SemesterFilter = 'ALL' | 'ODD' | 'EVEN';

export interface DailyAttendanceRecapStudent {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  present: number;
  late: number;
  sick: number;
  permission: number;
  absent: number;
  total: number;
  percentage: number;
}

export interface LateSummaryStudent {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  semester1Late: number;
  semester2Late: number;
  totalLate: number;
}

export interface DailyAttendanceRecapResponse {
  recap: DailyAttendanceRecapStudent[];
  meta: {
    classId: number;
    academicYearId: number;
    semester: string | null;
    dateRange: {
      start: string;
      end: string;
    };
  };
}

export interface LateSummaryResponse {
  recap: LateSummaryStudent[];
  meta: {
    classId: number;
    academicYearId: number;
  };
}

export interface DailyAttendanceStudent {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  status: AttendanceStatus | null;
  note: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

export interface StudentAttendanceHistory {
  id: number;
  date: string;
  status: AttendanceStatus | 'ALPHA';
  note?: string | null;
  notes?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

export type DailyPresenceCaptureSource =
  | 'SELF_SCAN'
  | 'ASSISTED_SCAN'
  | 'MANUAL_ADJUSTMENT'
  | 'LEGACY_DAILY';

export type DailyPresenceEventType = 'CHECK_IN' | 'CHECK_OUT';

export interface DailyPresenceEventItem {
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
}

export interface DailyPresenceOverview {
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
}

export interface DailyPresenceStudentState {
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
    status: AttendanceStatus | null;
    note?: string | null;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    checkInSource?: DailyPresenceCaptureSource | null;
    checkOutSource?: DailyPresenceCaptureSource | null;
    checkInReason?: string | null;
    checkOutReason?: string | null;
  };
  recentEvents: DailyPresenceEventItem[];
}

export const attendanceService = {
  // Get subject attendance by date
  getSubjectAttendance: async (params: {
    date: string;
    classId: number;
    subjectId: number;
    academicYearId: number;
  }) => {
    const response = await api.get<{ data: SubjectAttendance | null }>('/attendances/subject', {
      params,
    });
    return response.data;
  },

  // Save subject attendance
  saveSubjectAttendance: async (data: {
    date: string;
    classId: number;
    subjectId: number;
    academicYearId: number;
    records: AttendanceRecord[];
  }) => {
    const response = await api.post<{ data: SubjectAttendance }>('/attendances/subject', data);
    return response.data;
  },

  // Daily attendance recap (existing)
  getDailyRecap: async (params: {
    classId: number;
    academicYearId?: number;
    semester?: SemesterFilter;
  }) => {
    const response = await api.get<{ data: DailyAttendanceRecapResponse }>('/attendances/daily/recap', { params });
    return response.data;
  },

  getLateSummaryByClass: async (params: {
    classId: number;
    academicYearId?: number;
  }) => {
    const response = await api.get<{ data: LateSummaryResponse }>('/attendances/daily/late-summary', { params });
    return response.data;
  },

  // Daily attendance input (by Student President / Teacher)
  getDailyAttendance: async (params: {
    date: string;
    classId: number;
    academicYearId: number;
  }) => {
    const response = await api.get<{ data: DailyAttendanceStudent[] }>('/attendances/daily', { params });
    return response.data;
  },

  saveDailyAttendance: async (data: {
    date: string;
    classId: number;
    academicYearId: number;
    records: AttendanceRecord[];
  }) => {
    const response = await api.post<{ data: null }>('/attendances/daily', data);
    return response.data;
  },

  getStudentHistory: async (params: { month?: number; year?: number; startDate?: string; endDate?: string }) => {
    const response = await api.get<{
      success: boolean;
      data: StudentAttendanceHistory[];
      message: string;
    }>('/attendances/student-history', {
      params,
    });
    return response.data;
  },

  getDailyPresenceOverview: async (params?: { date?: string; limit?: number }) => {
    const response = await api.get<{ data: DailyPresenceOverview }>('/attendances/daily-presence/overview', {
      params,
    });
    return response.data.data;
  },

  getStudentDailyPresence: async (params: { studentId: number; date?: string }) => {
    const response = await api.get<{ data: DailyPresenceStudentState }>('/attendances/daily-presence/student', {
      params,
    });
    return response.data.data;
  },

  saveAssistedDailyPresence: async (payload: {
    studentId: number;
    checkpoint: DailyPresenceEventType;
    reason: string;
    gateLabel?: string | null;
  }) => {
    const response = await api.post<{ data: DailyPresenceStudentState }>('/attendances/daily-presence/assisted', payload);
    return response.data.data;
  }
};
