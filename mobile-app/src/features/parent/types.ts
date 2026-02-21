import { StudentAttendanceHistory } from '../attendance/types';

export type ParentChildDetail = {
  id: number;
  name: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  studentStatus?: string | null;
  verificationStatus?: string | null;
  studentClass?: {
    id: number;
    name: string;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
};

export type ParentAttendanceRecord = StudentAttendanceHistory;

export type ParentChildReportCard = {
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
      major?: {
        id: number;
        name: string;
        code?: string | null;
      } | null;
    } | null;
  };
  reportGrades: Array<{
    id: number;
    finalScore: number;
    formatifScore?: number | null;
    sbtsScore?: number | null;
    sasScore?: number | null;
    subject?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  }>;
  reportNotes?: {
    id: number;
    note?: string | null;
    behaviorNote?: string | null;
    achievementNote?: string | null;
  } | null;
  attendanceSummary: {
    hadir: number;
    sakit: number;
    izin: number;
    alpha: number;
  };
  average: number;
};

export type ParentPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
export type ParentPaymentType = 'MONTHLY' | 'ONE_TIME';

export type ParentPaymentRecord = {
  id: number;
  amount: number;
  status: ParentPaymentStatus;
  type: ParentPaymentType;
  createdAt: string;
  updatedAt: string;
};

export type ParentChildFinanceSummary = {
  totalRecords: number;
  totalAmount: number;
  status: {
    pendingCount: number;
    pendingAmount: number;
    paidCount: number;
    paidAmount: number;
    partialCount: number;
    partialAmount: number;
    cancelledCount: number;
    cancelledAmount: number;
  };
  type: {
    monthlyCount: number;
    monthlyAmount: number;
    oneTimeCount: number;
    oneTimeAmount: number;
  };
};

export type ParentChildFinanceOverview = {
  student: ParentChildDetail;
  summary: ParentChildFinanceSummary;
  payments: ParentPaymentRecord[];
};

export type ParentFinanceOverview = {
  parent: {
    id: number;
    name: string;
    username: string;
  };
  summary: {
    childCount: number;
    totalRecords: number;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    partialAmount: number;
    cancelledAmount: number;
    monthlyAmount: number;
    oneTimeAmount: number;
  };
  children: ParentChildFinanceOverview[];
};
