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

export interface DailyPresenceEventItem {
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

export interface DailyPresenceUserState {
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
  recentEvents: DailyPresenceEventItem[];
}

export type DailyPresenceOwnState = DailyPresenceStudentState | DailyPresenceUserState;

export interface DailyPresenceOwnHistoryItem {
  id: number;
  date: string;
  status: AttendanceStatus | 'ALPHA';
  note?: string | null;
  notes?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

export interface DailyPresenceSelfScanSession {
  sessionId: string;
  checkpoint: DailyPresenceEventType;
  gateLabel?: string | null;
  date: string;
  challengeWindowSeconds: number;
  challengeWindowExpiresAt: string;
  sessionExpiresAt: string;
}

export interface DailyPresenceSelfScanMonitor {
  qrToken: string;
  qrCodeDataUrl: string;
  qrExpiresAt: string;
  refreshSeconds: number;
  challengeCode: string;
  generatedAt: string;
}

export interface DailyPresenceSelfScanManagerSession extends DailyPresenceSelfScanSession {
  actor: {
    id: number;
    name: string;
  };
  challengeSecret: string;
  challengeCode: string;
  monitor?: DailyPresenceSelfScanMonitor | null;
}

export interface DailyPresenceSelfScanPass {
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
}

export interface DailyPresenceSelfScanPreview {
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
}

export interface DailyPresenceOperationalStudent {
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
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
}

export interface DailyPresenceOperationalParticipant {
  id: number;
  username?: string | null;
  name: string;
  photo?: string | null;
  nip?: string | null;
  role: 'TEACHER' | 'STAFF' | 'PRINCIPAL' | 'EXTRACURRICULAR_TUTOR';
  ptkType?: string | null;
  additionalDuties?: string[];
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

  getDailyPresencePolicy: async () => {
    const response = await api.get<{ data: DailyPresencePolicyPayload }>('/attendances/daily-presence/policy');
    return response.data.data;
  },

  saveDailyPresencePolicy: async (policy: DailyPresencePolicy) => {
    const response = await api.put<{ data: DailyPresencePolicyPayload }>('/attendances/daily-presence/policy', {
      policy,
    });
    return response.data.data;
  },

  getDailyPresenceStudents: async (params?: { query?: string; limit?: number }) => {
    const response = await api.get<{ data: DailyPresenceOperationalStudent[] }>('/attendances/daily-presence/students', {
      params: {
        q: params?.query,
        limit: params?.limit,
      },
    });
    return response.data.data;
  },

  getDailyPresenceParticipants: async (params?: { query?: string; limit?: number }) => {
    const response = await api.get<{ data: DailyPresenceOperationalParticipant[] }>(
      '/attendances/daily-presence/participants',
      {
        params: {
          q: params?.query,
          limit: params?.limit,
        },
      },
    );
    return response.data.data;
  },

  getStudentDailyPresence: async (params: { studentId: number; date?: string }) => {
    const response = await api.get<{ data: DailyPresenceStudentState }>('/attendances/daily-presence/student', {
      params,
    });
    return response.data.data;
  },

  getParticipantDailyPresence: async (params: { userId: number; date?: string }) => {
    const response = await api.get<{ data: DailyPresenceUserState }>('/attendances/daily-presence/participant', {
      params,
    });
    return response.data.data;
  },

  getOwnDailyPresence: async (params?: { date?: string }) => {
    const response = await api.get<{ data: DailyPresenceOwnState }>('/attendances/daily-presence/me', {
      params,
    });
    return response.data.data;
  },

  getOwnDailyPresenceHistory: async (params?: { month?: number; year?: number }) => {
    const response = await api.get<{ data: DailyPresenceOwnHistoryItem[] }>('/attendances/daily-presence/me/history', {
      params,
    });
    return response.data.data;
  },

  getActiveSelfScanSession: async (params: { checkpoint: DailyPresenceEventType }) => {
    const response = await api.get<{
      data: {
        academicYear: {
          id: number;
          name: string;
        };
        session: DailyPresenceSelfScanSession | DailyPresenceSelfScanManagerSession | null;
      };
    }>('/attendances/daily-presence/self-scan/session', {
      params,
    });
    return response.data.data.session || null;
  },

  getActiveManagerSelfScanSession: async (params: { checkpoint: DailyPresenceEventType }) => {
    const response = await api.get<{
      data: {
        academicYear: {
          id: number;
          name: string;
        };
        session: DailyPresenceSelfScanManagerSession | null;
      };
    }>('/attendances/daily-presence/self-scan/session', {
      params,
    });
    return response.data.data.session || null;
  },

  startSelfScanSession: async (payload: {
    checkpoint: DailyPresenceEventType;
    gateLabel?: string | null;
  }) => {
    const response = await api.post<{
      data: {
        academicYear: {
          id: number;
          name: string;
        };
        session: DailyPresenceSelfScanManagerSession;
      };
    }>('/attendances/daily-presence/self-scan/session', payload);
    return response.data.data.session;
  },

  closeSelfScanSession: async (payload: { checkpoint: DailyPresenceEventType }) => {
    await api.post('/attendances/daily-presence/self-scan/session/close', payload);
  },

  createSelfScanPass: async (payload: {
    checkpoint: DailyPresenceEventType;
    challengeCode: string;
  }) => {
    const response = await api.post<{ data: DailyPresenceSelfScanPass }>(
      '/attendances/daily-presence/self-scan/pass',
      payload,
    );
    return response.data.data;
  },

  previewSelfScanPass: async (payload: { qrToken: string }) => {
    const response = await api.post<{ data: DailyPresenceSelfScanPreview }>(
      '/attendances/daily-presence/self-scan/preview',
      payload,
    );
    return response.data.data;
  },

  confirmSelfScanPass: async (payload: { qrToken: string }) => {
    const response = await api.post<{ data: DailyPresenceStudentState }>(
      '/attendances/daily-presence/self-scan/confirm',
      payload,
    );
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
  },

  saveAssistedUserDailyPresence: async (payload: {
    userId: number;
    checkpoint: DailyPresenceEventType;
    reason: string;
    gateLabel?: string | null;
  }) => {
    const response = await api.post<{ data: DailyPresenceUserState }>('/attendances/daily-presence/assisted-user', payload);
    return response.data.data;
  },
};
