import api from './api';

export type CommitteeEventStatus =
  | 'DRAFT'
  | 'MENUNGGU_PERSETUJUAN_KEPSEK'
  | 'DITOLAK_KEPSEK'
  | 'MENUNGGU_SK_TU'
  | 'AKTIF'
  | 'SELESAI'
  | 'ARSIP';

export type CommitteeFeatureCode =
  | 'EXAM_PROGRAM'
  | 'EXAM_SCHEDULE'
  | 'EXAM_ROOMS'
  | 'EXAM_PROCTOR'
  | 'EXAM_LAYOUT'
  | 'EXAM_CARD';

export interface CommitteeFeatureDefinition {
  code: CommitteeFeatureCode;
  label: string;
  description: string;
  section: 'program' | 'jadwal' | 'ruang' | 'mengawas' | 'denah' | 'kartu';
}

export interface CommitteeAssignmentSummary {
  id: number;
  assignmentRole: string;
  notes?: string | null;
  featureCodes: CommitteeFeatureCode[];
}

export interface CommitteeEventSummary {
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
  myAssignment?: CommitteeAssignmentSummary | null;
  membersPreview: Array<{
    id: number;
    assignmentRole: string;
    user: {
      id: number;
      name: string;
      username: string;
      role: string;
    };
    featureCodes: CommitteeFeatureCode[];
  }>;
}

export interface CommitteeEventDetail extends CommitteeEventSummary {
  assignments: Array<{
    id: number;
    userId: number;
    assignmentRole: string;
    notes?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    user: {
      id: number;
      name: string;
      username: string;
      role: string;
    };
    featureGrants: Array<{
      id: number;
      featureCode: CommitteeFeatureCode;
      label: string;
    }>;
  }>;
  availableFeatures: CommitteeFeatureDefinition[];
  access: {
    canEditRequest: boolean;
    canPrincipalReview: boolean;
    canIssueSk: boolean;
    canManageAssignments: boolean;
  };
}

export interface CommitteeSidebarGroup {
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
}

export interface CommitteeWorkspacePayload {
  eventId: number;
  eventCode: string;
  title: string;
  label: string;
  status: CommitteeEventStatus;
  programCode?: string | null;
  programLabel?: string | null;
  assignmentRole: string;
  allowedFeatures: CommitteeFeatureDefinition[];
}

export const committeeService = {
  getMeta: async () => {
    const response = await api.get('/committees/meta');
    return response.data as { data: { featureDefinitions: CommitteeFeatureDefinition[] } };
  },
  list: async (params?: {
    scope?: 'MINE' | 'REQUESTS' | 'ASSIGNMENTS' | 'PENDING_PRINCIPAL' | 'HEAD_TU';
    status?: CommitteeEventStatus;
    search?: string;
  }) => {
    const response = await api.get('/committees', {
      params: {
        scope: params?.scope,
        status: params?.status,
        search: params?.search,
      },
    });
    return response.data as {
      data: {
        academicYear: { id: number; name: string };
        items: CommitteeEventSummary[];
      };
    };
  },
  getDetail: async (id: number) => {
    const response = await api.get(`/committees/${id}`);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  create: async (payload: {
    code: string;
    title: string;
    description?: string | null;
    requesterDutyCode?: string | null;
    programCode?: string | null;
  }) => {
    const response = await api.post('/committees', payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  update: async (
    id: number,
    payload: Partial<{
      code: string;
      title: string;
      description?: string | null;
      requesterDutyCode?: string | null;
      programCode?: string | null;
    }>,
  ) => {
    const response = await api.put(`/committees/${id}`, payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  submit: async (id: number) => {
    const response = await api.post(`/committees/${id}/submit`);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  reviewAsPrincipal: async (id: number, payload: { approved: boolean; feedback?: string | null }) => {
    const response = await api.post(`/committees/${id}/principal-decision`, payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  issueSk: async (
    id: number,
    payload: { skNumber: string; skIssuedAt: string; skNotes?: string | null },
  ) => {
    const response = await api.post(`/committees/${id}/issue-sk`, payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  updateLifecycle: async (id: number, payload: { status: 'SELESAI' | 'ARSIP' }) => {
    const response = await api.post(`/committees/${id}/lifecycle`, payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  createAssignment: async (
    id: number,
    payload: {
      userId: number;
      assignmentRole: string;
      notes?: string | null;
      featureCodes?: CommitteeFeatureCode[];
    },
  ) => {
    const response = await api.post(`/committees/${id}/assignments`, payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  updateAssignment: async (
    id: number,
    assignmentId: number,
    payload: {
      userId: number;
      assignmentRole: string;
      notes?: string | null;
      featureCodes?: CommitteeFeatureCode[];
    },
  ) => {
    const response = await api.put(`/committees/${id}/assignments/${assignmentId}`, payload);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  deleteAssignment: async (id: number, assignmentId: number) => {
    const response = await api.delete(`/committees/${id}/assignments/${assignmentId}`);
    return response.data as { data: { item: CommitteeEventDetail } };
  },
  getMySidebar: async () => {
    const response = await api.get('/committees/my-sidebar');
    return response.data as {
      data: {
        academicYear?: { id: number; name: string } | null;
        groups: CommitteeSidebarGroup[];
      };
    };
  },
  getWorkspace: async (id: number) => {
    const response = await api.get(`/committees/${id}/workspace`);
    return response.data as { data: CommitteeWorkspacePayload };
  },
};
