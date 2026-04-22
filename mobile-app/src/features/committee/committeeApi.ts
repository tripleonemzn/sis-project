import { apiClient } from '../../lib/api/client';

export type CommitteeFeatureCode =
  | 'EXAM_PROGRAM'
  | 'EXAM_SCHEDULE'
  | 'EXAM_ROOMS'
  | 'EXAM_PROCTOR'
  | 'EXAM_LAYOUT'
  | 'EXAM_CARD';

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

type CommitteeSidebarResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    groups: CommitteeSidebarGroup[];
  };
};

export const committeeApi = {
  async getMySidebar() {
    const response = await apiClient.get<CommitteeSidebarResponse>('/committees/my-sidebar');
    return response.data?.data || { groups: [] };
  },
};
