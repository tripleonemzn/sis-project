export type KesiswaanPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type KesiswaanTutor = {
  id: number;
  name: string;
  username?: string | null;
};

export type KesiswaanExtracurricular = {
  id: number;
  name: string;
  description?: string | null;
  tutorAssignments?: Array<{
    id: number;
    tutor?: {
      name?: string | null;
    } | null;
  }>;
};

export type KesiswaanTutorAssignment = {
  id: number;
  tutorId: number;
  ekskulId: number;
  academicYearId: number;
  isActive: boolean;
  tutor?: KesiswaanTutor | null;
  ekskul?: {
    id: number;
    name: string;
    description?: string | null;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
};

export type KesiswaanBehaviorType = 'POSITIVE' | 'NEGATIVE';

export type KesiswaanBehaviorMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type KesiswaanBehavior = {
  id: number;
  studentId: number;
  classId: number;
  academicYearId: number;
  date: string;
  type: KesiswaanBehaviorType;
  category?: string | null;
  description: string;
  point: number;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
};

export type KesiswaanBehaviorListPayload = {
  behaviors: KesiswaanBehavior[];
  meta: KesiswaanBehaviorMeta;
};

export type KesiswaanCreateBehaviorPayload = {
  studentId: number;
  classId: number;
  academicYearId: number;
  date: string;
  type: KesiswaanBehaviorType;
  category?: string;
  description: string;
  point: number;
};

export type KesiswaanUpdateBehaviorPayload = {
  date?: string;
  type?: KesiswaanBehaviorType;
  category?: string;
  description?: string;
  point?: number;
};

export type KesiswaanPermissionType = 'SICK' | 'PERMISSION' | 'OTHER';
export type KesiswaanPermissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type KesiswaanPermissionStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  photo?: string | null;
};

export type KesiswaanPermissionApprover = {
  id: number;
  name: string;
};

export type KesiswaanPermission = {
  id: number;
  studentId: number;
  academicYearId: number;
  type: KesiswaanPermissionType;
  startDate: string;
  endDate: string;
  reason?: string | null;
  fileUrl?: string | null;
  status: KesiswaanPermissionStatus;
  approvalNote?: string | null;
  createdAt: string;
  student?: KesiswaanPermissionStudent | null;
  approvedBy?: KesiswaanPermissionApprover | null;
};

export type KesiswaanPermissionListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type KesiswaanPermissionListPayload = {
  permissions: KesiswaanPermission[];
  meta: KesiswaanPermissionListMeta;
};
