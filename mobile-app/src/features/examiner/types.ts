export type ExaminerSchemeCriteria = {
  id?: string | number;
  name: string;
  maxScore: number;
  aliases?: string[];
  group?: string;
  weight?: number;
};

export type ExaminerScheme = {
  id: number;
  name: string;
  subjectId?: number;
  majorId?: number | null;
  academicYearId?: number;
  criteria?: ExaminerSchemeCriteria[] | null;
  subject?: {
    id: number;
    name: string;
  } | null;
  major?: {
    id: number;
    name: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
};

export type ExaminerAssessment = {
  id: number;
  studentId: number;
  subjectId: number;
  academicYearId: number;
  finalScore: number;
  criteria?: ExaminerSchemeCriteria[] | null;
  scores?: Record<string, number> | null;
  updatedAt: string;
  studentName?: string;
  className?: string;
  subjectName?: string;
};

export type UpsertExaminerAssessmentPayload = {
  studentId: number;
  subjectId: number;
  academicYearId: number;
  criteria: ExaminerSchemeCriteria[];
  scores: Record<string, number>;
  finalScore: number;
};

export type CreateExaminerSchemePayload = {
  name: string;
  subjectId: number;
  majorId?: number | null;
  academicYearId: number;
  criteria: ExaminerSchemeCriteria[];
};

export type UpdateExaminerSchemePayload = {
  name: string;
  criteria: ExaminerSchemeCriteria[];
};
