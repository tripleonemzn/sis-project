import api from './api';

export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export interface ScheduleEntry {
  id: number;
  academicYearId: number;
  classId: number;
  teacherAssignmentId: number;
  dayOfWeek: DayOfWeek;
  period: number;
  teachingHour?: number | null;
  room: string | null;
  createdAt: string;
  updatedAt: string;
  teacherAssignment: {
    id: number;
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
    };
    academicYear: {
      id: number;
      name: string;
    };
  };
}

export interface ScheduleListResponse {
  entries: ScheduleEntry[];
}

export interface TeachingLoadDetail {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  classCount: number;
  sessionCount: number;
  hours: number;
}

export interface TeachingLoadTeacherSummary {
  teacherId: number;
  teacherName: string;
  teacherUsername: string;
  totalClasses: number;
  totalSubjects: number;
  totalSessions: number;
  totalHours: number;
  details: TeachingLoadDetail[];
}

export interface TeachingLoadSummaryResponse {
  teachers: TeachingLoadTeacherSummary[];
}

export const scheduleService = {
  list: async (params: { academicYearId: number; classId?: number; teacherId?: number; limit?: number }) => {
    const response = await api.get<{ data: ScheduleListResponse }>('/schedules', { params });
    return response.data;
  },
  create: async (data: {
    academicYearId: number;
    classId: number;
    teacherAssignmentId: number;
    dayOfWeek: DayOfWeek;
    period: number;
    room?: string | null;
  }) => {
    const response = await api.post<{ data: ScheduleEntry }>('/schedules', data);
    return response.data;
  },
  update: async (
    id: number,
    data: {
      teacherAssignmentId?: number;
      room?: string | null;
    },
  ) => {
    const response = await api.put<{ data: ScheduleEntry }>(`/schedules/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    await api.delete(`/schedules/${id}`);
  },
  teachingSummary: async (params: { academicYearId: number; teacherId?: number }) => {
    const response = await api.get<{ data: TeachingLoadSummaryResponse }>('/schedules/teaching-summary', {
      params,
    });
    return response.data;
  },
};
