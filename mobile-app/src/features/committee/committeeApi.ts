import { apiClient } from '../../lib/api/client';

type ApiResponse<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type CommitteeFeatureCode =
  | 'EXAM_PROGRAM'
  | 'EXAM_SCHEDULE'
  | 'EXAM_ROOMS'
  | 'EXAM_PROCTOR'
  | 'EXAM_LAYOUT'
  | 'EXAM_CARD';

export type CommitteeEventStatus =
  | 'DRAFT'
  | 'MENUNGGU_PERSETUJUAN_KEPSEK'
  | 'DITOLAK_KEPSEK'
  | 'MENUNGGU_SK_TU'
  | 'AKTIF'
  | 'SELESAI'
  | 'ARSIP';

export type CommitteeAssignmentMemberType = 'INTERNAL_USER' | 'EXTERNAL_MEMBER';

export type CommitteeEventSummary = {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  requesterDutyCode?: string | null;
  programCode?: string | null;
  programLabel?: string | null;
  status: CommitteeEventStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  academicYear: {
    id: number;
    name: string;
    isActive?: boolean;
  };
  requestedBy: {
    id: number;
    name: string;
    username: string;
    role: string;
    additionalDuties?: string[] | null;
  };
  principalDecision: {
    by?: {
      id: number;
      name: string;
      username: string;
      role: string;
    } | null;
    at?: string | null;
    feedback?: string | null;
  };
  sk: {
    number?: string | null;
    issuedAt?: string | null;
    notes?: string | null;
    issuedBy?: {
      id: number;
      name: string;
      username: string;
      role: string;
      ptkType?: string | null;
    } | null;
  };
  counts: {
    members: number;
    grantedFeatures: number;
  };
  isRequester: boolean;
  isAssigned: boolean;
  myAssignment?: {
    id: number;
    memberType: CommitteeAssignmentMemberType;
    assignmentRole: string;
    notes?: string | null;
    featureCodes: CommitteeFeatureCode[];
  } | null;
  membersPreview: Array<{
    id: number;
    memberType: CommitteeAssignmentMemberType;
    memberLabel: string;
    memberTypeLabel: string;
    memberDetail?: string | null;
    assignmentRole: string;
    featureCodes: CommitteeFeatureCode[];
  }>;
};

export type CommitteeSidebarGroup = {
  eventId: number;
  eventCode: string;
  label: string;
  title: string;
  programCode?: string | null;
  programLabel?: string | null;
  items: Array<{
      key: string;
      featureCode: CommitteeFeatureCode;
      label: string;
      webPath: string;
    }>;
};

export const committeeApi = {
  async getMySidebar() {
    const response = await apiClient.get<ApiResponse<{ groups: CommitteeSidebarGroup[] }>>('/committees/my-sidebar');
    return response.data?.data || { groups: [] };
  },
  async list(params?: {
    scope?: 'MINE' | 'REQUESTS' | 'ASSIGNMENTS' | 'PENDING_PRINCIPAL' | 'HEAD_TU';
    status?: CommitteeEventStatus;
    search?: string;
  }) {
    const response = await apiClient.get<ApiResponse<{ academicYear: { id: number; name: string }; items: CommitteeEventSummary[] }>>(
      '/committees',
      {
        params: {
          scope: params?.scope,
          status: params?.status,
          search: params?.search,
        },
      },
    );
    return response.data.data;
  },
  async reviewAsPrincipal(id: number, payload: { approved: boolean; feedback?: string | null }) {
    const response = await apiClient.post<ApiResponse<{ item: CommitteeEventSummary }>>(
      `/committees/${id}/principal-decision`,
      payload,
    );
    return response.data.data.item;
  },
};
