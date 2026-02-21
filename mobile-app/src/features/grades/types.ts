export type GradeComponent = {
  id: number;
  name: string;
  type: string;
  weight: number;
};

export type GradeSubject = {
  id: number;
  code: string;
  name: string;
};

export type StudentGrade = {
  id: number;
  score: number;
  semester: 'ODD' | 'EVEN';
  kkm?: number;
  subject: GradeSubject;
  component: GradeComponent;
};

