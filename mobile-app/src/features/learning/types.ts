export type LearningMaterial = {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  youtubeUrl?: string | null;
  createdAt: string;
  subject: {
    id: number;
    name: string;
    code: string;
  };
  teacher: {
    id: number;
    name: string;
  };
};

export type LearningAssignment = {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  dueDate: string;
  maxScore: number;
  allowResubmit: boolean;
  createdAt: string;
  subject: {
    id: number;
    name: string;
    code: string;
  };
  teacher: {
    id: number;
    name: string;
  };
};

export type LearningSubmission = {
  id: number;
  assignmentId: number;
  studentId: number;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize?: number | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
};

export type AssignmentWithSubmission = LearningAssignment & {
  submission?: LearningSubmission | null;
};

export type LearningRemedialActivity = {
  id: number;
  scoreEntryId: number;
  attemptNumber: number;
  method: 'MANUAL_SCORE' | 'ASSIGNMENT' | 'QUESTION_SET' | string;
  methodLabel: string;
  activityTitle?: string | null;
  activityInstructions?: string | null;
  activityDueAt?: string | null;
  activityReferenceUrl?: string | null;
  activityExamPacketId?: number | null;
  activitySourceExamPacketId?: number | null;
  activityExamPacket?: {
    id: number;
    title: string;
    type?: string | null;
    programCode?: string | null;
    duration?: number | null;
    publishedQuestionCount?: number | null;
  } | null;
  activitySourceExamPacket?: {
    id: number;
    title: string;
    type?: string | null;
    programCode?: string | null;
    duration?: number | null;
    publishedQuestionCount?: number | null;
  } | null;
  activityStartedAt?: string | null;
  activitySubmittedAt?: string | null;
  sourceLabel: string;
  originalScore: number;
  remedialScore: number;
  effectiveScore: number;
  kkm: number;
  status: string;
  statusLabel: string;
  recordedAt: string;
  semester: 'ODD' | 'EVEN';
  subject: {
    id: number;
    name: string;
    code: string;
  };
  teacher: {
    id: number;
    name: string;
  } | null;
  academicYear: {
    id: number;
    name: string;
  };
};
