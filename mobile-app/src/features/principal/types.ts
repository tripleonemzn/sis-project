export type PrincipalTopStudent = {
  studentId: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  averageScore: number;
  class?: {
    id: number;
    name: string;
    level?: string | null;
  } | null;
  major?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
};

export type PrincipalMajorSummary = {
  majorId: number;
  name: string;
  code?: string | null;
  totalStudents: number;
  averageScore: number;
};

export type PrincipalAcademicOverview = {
  academicYear: {
    id: number;
    name: string;
  };
  semester?: 'ODD' | 'EVEN' | null;
  topStudents: PrincipalTopStudent[];
  majors: PrincipalMajorSummary[];
};

export type PrincipalBudgetRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PrincipalBudgetRequest = {
  id: number;
  title: string;
  description: string;
  totalAmount: number;
  quantity: number;
  unitPrice: number;
  additionalDuty: string;
  status: PrincipalBudgetRequestStatus;
  requester?: {
    name?: string;
  } | null;
  approvalStatus?: PrincipalBudgetRequestStatus;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};
