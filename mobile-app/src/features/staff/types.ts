export type StaffBudgetStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type StaffBudgetRequest = {
  id: number;
  title: string;
  description: string;
  executionTime?: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: StaffBudgetStatus;
  additionalDuty: string;
  requester?: {
    name?: string;
  } | null;
  approverId?: number | null;
  createdAt: string;
  realizationConfirmedAt?: string | null;
  lpjSubmittedAt?: string | null;
};

export type StaffStudent = {
  id: number;
  username: string;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  studentStatus?: string | null;
  verificationStatus?: string | null;
  studentClass?: {
    id: number;
    name: string;
    level?: string | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
};

export type StaffPersonnel = {
  id: number;
  username: string;
  name: string;
  nip?: string | null;
  nuptk?: string | null;
  ptkType?: string | null;
  verificationStatus?: string | null;
  additionalDuties?: string[] | null;
};
