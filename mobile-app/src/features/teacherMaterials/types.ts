export type TeacherMaterial = {
  id: number;
  title: string;
  description: string | null;
  content?: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  youtubeUrl?: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  class: {
    id: number;
    name: string;
    level: string;
  } | null;
  subject: {
    id: number;
    name: string;
    code: string;
  };
};

export type TeacherAssignmentItem = {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  dueDate: string;
  allowResubmit: boolean;
  maxScore: number;
  isPublished: boolean;
  createdAt: string;
  class: {
    id: number;
    name: string;
    level: string;
  } | null;
  subject: {
    id: number;
    name: string;
    code: string;
  };
  _count?: {
    submissions: number;
  };
};

export type TeacherAssignmentSubmission = {
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
  assignment: {
    id: number;
    title: string;
    dueDate: string;
    maxScore: number;
    class: {
      id: number;
      name: string;
    } | null;
    subject: {
      id: number;
      name: string;
    } | null;
  };
  student: {
    id: number;
    name: string;
    nis: string | null;
  };
};
