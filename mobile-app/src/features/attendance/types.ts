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
