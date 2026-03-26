export type LearningResourceSection = 'CP' | 'ATP' | 'PROTA' | 'PROMES' | 'MODULES' | 'KKTP' | 'MATRIKS_SEBARAN';

export type CpTpAnalysisItem = {
  id?: string;
  element?: string;
  cpText?: string;
  items?: Array<{
    id?: string;
    competency?: string;
    material?: string;
    tp?: string;
    profiles?: string[];
  }>;
};

export type CpTpAnalysisRecord = {
  id: number;
  teacherId: number;
  subjectId: number;
  academicYearId: number;
  level: string;
  phase?: string | null;
  content: CpTpAnalysisItem[] | null;
  principalName?: string | null;
  titimangsa?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
