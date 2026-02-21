export type AttendanceRecapStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
};

export type AttendanceRecapRow = {
  student: AttendanceRecapStudent;
  present: number;
  late: number;
  sick: number;
  permission: number;
  absent: number;
  total: number;
  percentage: number;
};

export type AttendanceRecapMeta = {
  classId: number;
  academicYearId: number;
  semester?: 'ODD' | 'EVEN' | null;
  dateRange?: {
    start: string;
    end: string;
  } | null;
};

export type AttendanceRecapPayload = {
  recap: AttendanceRecapRow[];
  meta: AttendanceRecapMeta;
};
