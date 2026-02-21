export type ExamDisplayType = 'FORMATIF' | 'SBTS' | 'SAS' | 'SAT';

export type ExamQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'COMPLEX_MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'ESSAY'
  | 'MATCHING';

export type ExamQuestionOption = {
  id: string;
  content?: string | null;
  option_text?: string | null;
  isCorrect?: boolean;
  option_image_url?: string | null;
  image_url?: string | null;
};

export type ExamQuestion = {
  id: string;
  type?: ExamQuestionType;
  question_type?: ExamQuestionType;
  content?: string | null;
  question_text?: string | null;
  score?: number;
  options?: ExamQuestionOption[];
  question_image_url?: string | null;
  image_url?: string | null;
  question_video_url?: string | null;
  video_url?: string | null;
  question_video_type?: 'upload' | 'youtube';
  question_media_position?: 'top' | 'bottom' | 'left' | 'right';
};

export type TeacherExamQuestionPayload = {
  id: string;
  type: ExamQuestionType;
  content: string;
  score: number;
  options?: Array<{
    id: string;
    content: string;
    isCorrect: boolean;
  }>;
  question_image_url?: string;
  question_video_url?: string;
  question_video_type?: 'upload' | 'youtube';
};

export type StudentExamPacket = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  semester?: string | null;
  duration: number;
  instructions?: string | null;
  questions?: ExamQuestion[] | string | null;
  subject: {
    id: number;
    name: string;
    code: string;
  };
};

export type StudentExamSession = {
  id: number;
  scheduleId: number;
  studentId: number;
  startTime: string;
  endTime?: string | null;
  submitTime?: string | null;
  status: string;
  score?: number | null;
  answers?: Record<string, unknown> | null;
};

export type StudentExamStartPayload = {
  session: StudentExamSession;
  packet: StudentExamPacket;
};

export type StudentExamItem = {
  id: number;
  classId: number;
  subjectId: number;
  packetId: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  room?: string | null;
  status: string;
  has_submitted: boolean;
  isBlocked?: boolean;
  blockReason?: string;
  packet: {
    id: number;
    title: string;
    description?: string | null;
    type: string;
    semester?: string | null;
    duration: number;
    instructions?: string | null;
    subject: {
      id: number;
      name: string;
      code: string;
    };
  };
};

export type TeacherExamPacket = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  semester?: string | null;
  duration: number;
  instructions?: string | null;
  questions?: unknown[] | string | null;
  createdAt?: string;
  subject: {
    id: number;
    name: string;
    code: string;
  };
  academicYear?: {
    id: number;
    name: string;
  } | null;
  author?: {
    name?: string;
  } | null;
};

export type TeacherExamPacketDetail = TeacherExamPacket & {
  subjectId?: number;
  academicYearId?: number;
  schedules?: Array<{
    id: number;
    classId: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>;
};

export type TeacherExamPacketMutationPayload = {
  title: string;
  subjectId: number;
  academicYearId: number;
  type: ExamDisplayType;
  semester: 'ODD' | 'EVEN';
  duration: number;
  description?: string;
  instructions?: string;
  kkm?: number;
  saveToBank?: boolean;
  questions: TeacherExamQuestionPayload[];
};

export type TeacherExamSchedule = {
  id: number;
  classId: number;
  subjectId?: number | null;
  packetId?: number | null;
  academicYearId?: number | null;
  examType?: string | null;
  semester?: 'ODD' | 'EVEN' | null;
  startTime: string;
  endTime: string;
  room?: string | null;
  isActive: boolean;
  proctorId?: number | null;
  class: {
    id: number;
    name: string;
    level?: string;
  };
  subject?: {
    id: number;
    name: string;
    code: string;
  } | null;
  packet?: {
    id?: number;
    title?: string;
    type?: string;
    duration?: number;
    subject?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
  proctor?: {
    id: number;
    name: string;
    username?: string | null;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
};
