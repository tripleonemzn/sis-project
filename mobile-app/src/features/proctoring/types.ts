export type ProctorScheduleStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';

export type ProctorScheduleSummary = {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  proctorId: number | null;
  packet: {
    title: string;
    subject: {
      name: string;
    };
    duration: number;
    type?: string;
  } | null;
  class: {
    name: string;
  } | null;
  _count?: {
    sessions: number;
  };
};

export type ProctorStudentRow = {
  id: number;
  name: string;
  nis: string | null;
  status: ProctorScheduleStatus;
  startTime: string | null;
  submitTime: string | null;
  score?: number | null;
};

export type ProctorScheduleDetail = {
  schedule: {
    id: number;
    startTime: string;
    endTime: string;
    room: string | null;
    token?: string | null;
    packet: {
      title: string;
      subject: {
        name: string;
      };
      duration: number;
    } | null;
    class: {
      id: number;
      name: string;
    } | null;
  };
  students: ProctorStudentRow[];
  isProctor?: boolean;
  isAuthor?: boolean;
  isSubjectTeacher?: boolean;
};

export type ProctorReportPayload = {
  notes: string;
  incident: string;
  studentCountPresent: number;
  studentCountAbsent: number;
};
