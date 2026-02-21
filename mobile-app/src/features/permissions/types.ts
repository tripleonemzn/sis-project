export type PermissionType = 'SICK' | 'PERMISSION' | 'OTHER';
export type PermissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PermissionStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  photo?: string | null;
};

export type PermissionApprover = {
  id: number;
  name: string;
};

export type StudentPermission = {
  id: number;
  studentId: number;
  academicYearId: number;
  type: PermissionType;
  startDate: string;
  endDate: string;
  reason: string | null;
  fileUrl: string | null;
  status: PermissionStatus;
  approvalNote: string | null;
  createdAt: string;
  student?: PermissionStudent | null;
  approvedBy?: PermissionApprover | null;
};

export type PermissionListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
