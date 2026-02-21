export type SarprasRoomCondition = 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT';

export type SarprasRoomCategory = {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    rooms?: number;
  };
};

export type SarprasRoom = {
  id: number;
  categoryId: number;
  name: string;
  capacity?: number | null;
  location?: string | null;
  condition?: SarprasRoomCondition | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: number;
    name: string;
  } | null;
  _count?: {
    items?: number;
  };
};

export type SarprasInventoryItem = {
  id: number;
  roomId: number;
  name: string;
  code?: string | null;
  brand?: string | null;
  quantity: number;
  goodQty: number;
  minorDamageQty: number;
  majorDamageQty: number;
  purchaseDate?: string | null;
  price?: number | null;
  source?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SarprasBudgetStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type SarprasLpjInvoiceStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_SARPRAS'
  | 'RETURNED'
  | 'APPROVED_BY_SARPRAS'
  | 'SENT_TO_FINANCE';

export type SarprasLpjItem = {
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

export type SarprasLpjInvoice = {
  id: number;
  budgetRequestId: number;
  title?: string | null;
  status: SarprasLpjInvoiceStatus;
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
  items: SarprasLpjItem[];
};

export type SarprasBudgetLpjBundle = {
  budget: {
    id: number;
    requesterId: number;
    approvalStatus: SarprasBudgetStatus;
    realizationConfirmedAt?: string | null;
  };
  invoices: SarprasLpjInvoice[];
};

export type SarprasBudgetRequest = {
  id: number;
  title: string;
  description: string;
  executionTime?: string | null;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: SarprasBudgetStatus;
  approvalStatus?: SarprasBudgetStatus;
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
};
