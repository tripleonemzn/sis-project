export type ExamDisplayType = string;

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

export type ExamQuestionBlueprint = {
  competency?: string | null;
  learningObjective?: string | null;
  indicator?: string | null;
  materialScope?: string | null;
  cognitiveLevel?: string | null;
};

export type ExamQuestionCard = {
  stimulus?: string | null;
  answerRationale?: string | null;
  scoringGuideline?: string | null;
  distractorNotes?: string | null;
};

export type ExamQuestionItemAnalysis = {
  difficultyIndex?: number | null;
  discriminationIndex?: number | null;
  unansweredRate?: number | null;
  sampleSize?: number | null;
  generatedAt?: string | null;
  optionDistribution?: Record<string, number> | null;
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
  blueprint?: ExamQuestionBlueprint | null;
  questionCard?: ExamQuestionCard | null;
  itemAnalysis?: ExamQuestionItemAnalysis | null;
  metadata?: {
    blueprint?: ExamQuestionBlueprint | null;
    questionCard?: ExamQuestionCard | null;
    itemAnalysis?: ExamQuestionItemAnalysis | null;
  } | null;
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
  blueprint?: ExamQuestionBlueprint;
  questionCard?: ExamQuestionCard;
  itemAnalysis?: ExamQuestionItemAnalysis;
  question_image_url?: string;
  question_video_url?: string;
  question_video_type?: 'upload' | 'youtube';
};

export type StudentExamPacket = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  programCode?: string | null;
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
  classId: number | null;
  jobVacancyId?: number | null;
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
  financeClearance?: {
    blocksExam: boolean;
    hasOutstanding: boolean;
    hasOverdue: boolean;
    outstandingAmount: number;
    outstandingInvoices: number;
    overdueInvoices: number;
    mode?: string;
    thresholdAmount?: number;
    minOverdueInvoices?: number;
    notes?: string | null;
    warningOnly?: boolean;
    reason?: string | null;
  } | null;
  makeupAvailable?: boolean;
  makeupMode?: 'AUTO' | 'FORMAL' | null;
  makeupScheduled?: boolean;
  makeupStartTime?: string | null;
  makeupDeadline?: string | null;
  makeupReason?: string | null;
  subject?: {
    id: number;
    name: string;
    code: string;
  };
  jobVacancy?: {
    id: number;
    title: string;
    companyName?: string | null;
    industryPartner?: {
      id: number;
      name: string;
      city?: string | null;
      sector?: string | null;
    } | null;
  } | null;
  packet: {
    id: number;
    title: string;
    description?: string | null;
    type: string;
    programCode?: string | null;
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
  isCurriculumManaged?: boolean;
  type: string;
  programCode?: string | null;
  semester?: string | null;
  duration: number;
  publishedQuestionCount?: number | null;
  kkm?: number | null;
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
    classId: number | null;
    startTime: string;
    endTime: string;
    isActive: boolean;
    room?: string | null;
    sessionLabel?: string | null;
    class?: {
      id: number;
      name: string;
    } | null;
  }>;
};

export type TeacherExamPacketMutationPayload = {
  title: string;
  subjectId: number;
  academicYearId: number;
  type: ExamDisplayType;
  programCode?: string;
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
  classId: number | null;
  subjectId?: number | null;
  packetId?: number | null;
  academicYearId?: number | null;
  examType?: string | null;
  semester?: 'ODD' | 'EVEN' | null;
  sessionId?: number | null;
  sessionLabel?: string | null;
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

export type ExamScheduleMakeupAccessSummary = {
  id: number;
  startTime: string;
  endTime: string;
  reason: string | null;
  isActive: boolean;
  grantedAt: string;
  revokedAt: string | null;
  state: 'NONE' | 'UPCOMING' | 'OPEN' | 'EXPIRED' | 'REVOKED';
  grantedBy?: {
    id: number;
    name: string;
  } | null;
  revokedBy?: {
    id: number;
    name: string;
  } | null;
};

export type ExamScheduleMakeupStudentRow = {
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  session: {
    id: number;
    status: string;
    startTime: string;
    endTime: string | null;
    submitTime: string | null;
    score: number | null;
  } | null;
  hasAttempt: boolean;
  canManageMakeup: boolean;
  makeupAccess: ExamScheduleMakeupAccessSummary | null;
};

export type ExamScheduleMakeupOverview = {
  schedule: {
    id: number;
    classId: number;
    className: string;
    startTime: string;
    endTime: string;
    examType: string;
    subject: {
      id: number;
      name: string;
      code: string;
    };
    packet: {
      id: number;
      title: string;
    };
  };
  students: ExamScheduleMakeupStudentRow[];
};

export type ExamSittingListItem = {
  id: number;
  roomName: string;
  academicYearId: number;
  examType: string;
  semester?: 'ODD' | 'EVEN' | null;
  sessionId?: number | null;
  sessionLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  proctorId?: number | null;
  proctor?: {
    id: number;
    name: string;
  } | null;
  layout?: {
    id: number;
    rows: number;
    columns: number;
    generatedAt?: string | null;
    updatedAt?: string | null;
  } | null;
  _count?: {
    students: number;
  };
};

export type ExamSittingStudent = {
  id: number;
  name: string;
  username?: string | null;
  studentClass?: {
    name?: string | null;
  } | null;
  class?: {
    name?: string | null;
  } | null;
  class_name?: string | null;
};

export type ExamSittingDetail = ExamSittingListItem & {
  students?: ExamSittingStudent[];
};

export type ExamSittingAssignedStudentRow = {
  studentId: number;
};

export type ExamSittingRoom = {
  id: number;
  name: string;
  location?: string | null;
  category?: {
    id: number;
    name: string;
  } | null;
};

export type ExamSittingUpsertPayload = {
  roomName: string;
  academicYearId?: number;
  examType: string;
  programCode?: string;
  semester?: 'ODD' | 'EVEN';
  sessionId?: number | null;
  sessionLabel?: string | null;
  startTime?: string;
  endTime?: string;
  proctorId?: number | null;
};

export type PacketItemAnalysisOptionRow = {
  optionId: string;
  label: string;
  isCorrect: boolean;
  selectedCount: number;
  selectedRate: number;
};

export type PacketItemAnalysisQuestionRow = {
  questionId: string;
  orderNumber: number;
  type: string;
  contentPreview: string;
  scoreWeight: number;
  answeredCount: number;
  unansweredCount: number;
  unansweredRate: number;
  correctCount: number | null;
  incorrectCount: number | null;
  difficultyIndex: number | null;
  difficultyCategory: 'Mudah' | 'Sedang' | 'Sulit' | null;
  discriminationIndex: number | null;
  discriminationCategory: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang' | 'Sangat Kurang' | null;
  optionDistribution: PacketItemAnalysisOptionRow[];
};

export type PacketItemAnalysisSummary = {
  generatedAt: string;
  classFilterId: number | null;
  scheduleCount: number;
  participantCount: number;
  inProgressCount: number;
  totalQuestions: number;
  objectiveQuestions: number;
  essayQuestions: number;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
};

export type PacketItemAnalysisResponse = {
  packet: {
    id: number;
    title: string;
    type: string;
    semester: string;
    subject: { id: number; name: string; code: string };
    academicYear: { id: number; name: string };
    author: { id: number; name: string };
  };
  summary: PacketItemAnalysisSummary;
  items: PacketItemAnalysisQuestionRow[];
};

export type PacketSubmissionSessionRow = {
  sessionId: number;
  scheduleId: number;
  class: { id: number; name: string } | null;
  student: { id: number; name: string; nis: string | null };
  status: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' | string;
  score: number | null;
  startTime: string;
  endTime: string | null;
  submitTime: string | null;
  answeredCount: number;
  unansweredCount: number;
  totalQuestions: number;
  completionRate: number;
  objectiveTotal: number;
  objectiveCorrect: number;
  objectiveIncorrect: number;
};

export type PacketSubmissionsSummary = {
  generatedAt: string;
  classFilterId: number | null;
  statusFilter: string | null;
  scheduleCount: number;
  sessionCount: number;
  page: number;
  limit: number;
  totalPages: number;
  pageSessionCount: number;
  participantCount: number;
  submittedCount: number;
  inProgressCount: number;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
};

export type PacketSubmissionsResponse = {
  packet: {
    id: number;
    title: string;
    type: string;
    semester: string;
    subject: { id: number; name: string; code: string };
    academicYear: { id: number; name: string };
    author: { id: number; name: string };
  };
  summary: PacketSubmissionsSummary;
  sessions: PacketSubmissionSessionRow[];
};

export type SessionQuestionDetailRow = {
  questionId: string;
  orderNumber: number;
  type: string;
  contentPreview: string;
  scoreWeight: number;
  answered: boolean;
  answerText: string | null;
  selectedOptionIds: string[];
  selectedOptionLabels: string[];
  correctOptionIds: string[];
  correctOptionLabels: string[];
  isCorrect: boolean | null;
  explanation: string | null;
};

export type SessionDetailResponse = {
  packet: {
    id: number;
    title: string;
    type: string;
    semester: string;
    subject: { id: number; name: string; code: string };
    academicYear: { id: number; name: string };
  };
  session: {
    id: number;
    status: string;
    score: number | null;
    startTime: string;
    submitTime: string | null;
    schedule: {
      id: number;
      startTime: string;
      endTime: string;
      class: { id: number; name: string } | null;
    };
    student: {
      id: number;
      name: string;
      nis: string | null;
      class: { id: number; name: string } | null;
    };
  };
  summary: {
    totalQuestions: number;
    answeredCount: number;
    unansweredCount: number;
    completionRate: number;
    objectiveEvaluableCount: number;
    objectiveCorrectCount: number;
    objectiveIncorrectCount: number;
    essayCount: number;
  };
  questions: SessionQuestionDetailRow[];
};
