export type WorkProgramApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type WorkProgramItem = {
  id: number;
  description: string;
  targetDate?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  note?: string | null;
};

export type WorkProgramRecord = {
  id: number;
  title: string;
  description?: string | null;
  additionalDuty?: string | null;
  semester?: 'ODD' | 'EVEN' | null;
  month?: number | null;
  startMonth?: number | null;
  endMonth?: number | null;
  startWeek?: number | null;
  endWeek?: number | null;
  approvalStatus?: WorkProgramApprovalStatus | null;
  isApproved?: boolean | null;
  feedback?: string | null;
  createdAt?: string;
  updatedAt?: string;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
  major?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
  owner?: {
    id: number;
    name: string;
  } | null;
  assignedApprover?: {
    id: number;
    name: string;
    role?: string;
  } | null;
  items?: WorkProgramItem[];
};

export type WorkProgramPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type WorkProgramListResponse = {
  programs: WorkProgramRecord[];
  pagination: WorkProgramPagination;
};
