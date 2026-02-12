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
    const response = await api.get<{ success: boolean; data: any[]; message: string }>('/attendances/student-history', {
      params,
    });
    return response.data;
  }
};
