export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export type ScheduleEntry = {
  id: number;
  dayOfWeek: DayOfWeek;
  period: number;
  teachingHour?: number | null;
  room: string | null;
  teacherAssignment: {
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
    };
  };
};

export type ScheduleListResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    entries: ScheduleEntry[];
  };
};
