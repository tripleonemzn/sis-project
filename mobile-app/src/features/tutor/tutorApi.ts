import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type TutorAssignment = {
  id: number;
  tutorId: number;
  ekskulId: number;
  academicYearId: number;
  isActive: boolean;
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

export type TutorMember = {
  id: number;
  studentId: number;
  ekskulId: number;
  academicYearId: number;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      name: string;
    } | null;
  } | null;
  grade?: string | null;
  description?: string | null;
  gradeSbtsOdd?: string | null;
  descSbtsOdd?: string | null;
  gradeSas?: string | null;
  descSas?: string | null;
  gradeSbtsEven?: string | null;
  descSbtsEven?: string | null;
  gradeSat?: string | null;
  descSat?: string | null;
};

export type TutorInventoryItem = {
  id: number;
  name: string;
  brand?: string | null;
  quantity?: number | null;
  goodQty?: number | null;
  minorDamageQty?: number | null;
  majorDamageQty?: number | null;
};

export type TutorInventoryOverviewRow = {
  assignmentId: number;
  ekskulId: number;
  ekskulName: string;
  academicYearId: number;
  academicYearName: string;
  room: {
    id: number;
    name: string;
    location?: string | null;
    categoryName?: string | null;
    inventoryTemplateKey?: string | null;
  } | null;
  items: TutorInventoryItem[];
};

export const tutorApi = {
  async listAssignments(academicYearId?: number) {
    const response = await apiClient.get<ApiEnvelope<TutorAssignment[]>>('/tutor/assignments', {
      params: {
        academicYearId,
      },
    });
    return response.data?.data || [];
  },
  async listMembers(params: { ekskulId: number; academicYearId: number }) {
    const response = await apiClient.get<ApiEnvelope<TutorMember[]>>('/tutor/members', {
      params: {
        ekskulId: params.ekskulId,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data || [];
  },
  async inputGrade(payload: {
    enrollmentId: number;
    grade: string;
    description: string;
    semester?: 'ODD' | 'EVEN';
    reportType?: string;
    programCode?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<TutorMember>>('/tutor/grades', payload);
    return response.data?.data;
  },
  async getInventoryOverview(academicYearId?: number) {
    const response = await apiClient.get<ApiEnvelope<TutorInventoryOverviewRow[]>>('/tutor/inventory-overview', {
      params: {
        academicYearId,
      },
    });
    return response.data?.data || [];
  },
  async createInventoryItem(payload: {
    assignmentId: number;
    name: string;
    code?: string;
    brand?: string;
    source?: string;
    description?: string;
    goodQty?: number;
    minorDamageQty?: number;
    majorDamageQty?: number;
  }) {
    const response = await apiClient.post<ApiEnvelope<TutorInventoryItem>>('/tutor/inventory-items', payload);
    return response.data?.data;
  },
};
