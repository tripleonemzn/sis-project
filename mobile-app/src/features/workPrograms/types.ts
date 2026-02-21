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

export type WorkProgramBudgetStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type WorkProgramBudgetLpjInvoiceStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_SARPRAS'
  | 'RETURNED'
  | 'APPROVED_BY_SARPRAS'
  | 'SENT_TO_FINANCE';

export type WorkProgramBudgetLpjItem = {
  id: number;
  lpjInvoiceId: number;
  description: string;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  isMatched?: boolean | null;
  auditNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkProgramBudgetLpjInvoice = {
  id: number;
  budgetRequestId: number;
  title?: string | null;
  status: WorkProgramBudgetLpjInvoiceStatus;
  invoiceFileUrl?: string | null;
  invoiceFileName?: string | null;
  invoiceFileSize?: number | null;
  invoiceMimeType?: string | null;
  proofFileUrl?: string | null;
  proofFileName?: string | null;
  proofFileSize?: number | null;
  proofMimeType?: string | null;
  auditReport?: string | null;
  auditReportAt?: string | null;
  submittedAt?: string | null;
  returnedAt?: string | null;
  approvedBySarprasAt?: string | null;
  sentToFinanceAt?: string | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  items: WorkProgramBudgetLpjItem[];
};

export type WorkProgramBudgetLpjBundle = {
  budget: {
    id: number;
    requesterId: number;
    approvalStatus: WorkProgramBudgetStatus;
    realizationConfirmedAt?: string | null;
  };
  invoices: WorkProgramBudgetLpjInvoice[];
};

export type WorkProgramBudgetRequest = {
  id: number;
  title: string;
  description: string;
  executionTime?: string | null;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: WorkProgramBudgetStatus;
  approvalStatus?: WorkProgramBudgetStatus;
  requesterId: number;
  approverId?: number | null;
  academicYearId: number;
  additionalDuty: string;
  workProgramId?: number | null;
  requester?: {
    name?: string | null;
    managedMajors?: Array<{
      name?: string | null;
    }>;
  } | null;
  approver?: {
    id?: number;
    name?: string | null;
    role?: string;
    additionalDuties?: string[] | null;
  } | null;
  workProgram?: {
    id?: number;
    major?: {
      name?: string | null;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string | null;
  realizationConfirmedAt?: string | null;
  lpjSubmittedAt?: string | null;
  lpjFileUrl?: string | null;
  lpjFileName?: string | null;
  lpjFileSize?: number | null;
  lpjMimeType?: string | null;
};

export type WorkProgramBudgetCreatePayload = {
  title: string;
  description: string;
  executionTime?: string;
  brand?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  academicYearId: number;
  additionalDuty: string;
  workProgramId?: number;
};

export type WorkProgramUploadFile = {
  uri: string;
  name?: string;
  mimeType?: string;
};
