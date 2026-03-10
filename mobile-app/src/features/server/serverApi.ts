import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type ServerInfoResponse = {
  os: {
    platform: string;
    type: string;
    release: string;
    arch: string;
    hostname: string;
    uptimeSeconds: number;
    distro: string | null;
    kernelVersion: string | null;
  };
  cpu: {
    model: string | null;
    cores: number;
    speedMHz: number | null;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
  storage: {
    filesystem: string;
    sizeBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
    mountpoint: string;
    status: 'OK' | 'WARNING' | 'DANGER';
  }[];
  gpu: {
    summary: string | null;
  };
};

export type StorageDiskInfo = {
  name: string;
  sizeBytes: number;
  model: string | null;
  mediaType: string | null;
};

export type StorageOverviewResponse = {
  volumes: {
    filesystem: string;
    sizeBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
    mountpoint: string;
    status: 'OK' | 'WARNING' | 'DANGER';
  }[];
  summary: {
    worstStatus: 'OK' | 'WARNING' | 'DANGER';
    maxUsagePercent: number;
    thresholdDangerPercent: number;
    thresholdWarningPercent: number;
  };
  unmountedDevices: {
    name: string;
    sizeBytes: number;
    model: string | null;
    fstype: string | null;
    state: string | null;
  }[];
  suggestedActions: {
    device: {
      name: string;
      sizeBytes: number;
      model: string | null;
      fstype: string | null;
      state: string | null;
    };
    formatCommand: string;
    note: string;
  }[];
  diskSummary: {
    totalDisks: number;
    totalCapacityBytes: number;
    disks: StorageDiskInfo[];
  };
};

export type ServerMonitoringResponse = {
  cpu: {
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
    coreCount: number;
    loadPerCore: number;
    status: 'OK' | 'WARNING' | 'DANGER';
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
    status: 'OK' | 'WARNING' | 'DANGER';
  };
  storage: {
    root: {
      filesystem: string;
      sizeBytes: number;
      usedBytes: number;
      availableBytes: number;
      usedPercent: number;
      mountpoint: string;
      status: 'OK' | 'WARNING' | 'DANGER';
    } | null;
    status: 'OK' | 'WARNING' | 'DANGER';
  };
  bandwidth: {
    interface: string;
    rxMbps: number;
    txMbps: number;
    status: 'OK' | 'WARNING' | 'DANGER';
  } | null;
};

export type WebmailResetResponse = {
  user: {
    id: number;
    username: string;
    name: string;
    role: string;
    email: string | null;
  };
  mailboxIdentity: string;
  password: string;
  generatedBySystem: boolean;
  resetAt: string;
};

export type WebmailResetHistoryItem = {
  id: number;
  createdAt: string;
  actor: {
    id: number;
    username: string;
    name: string;
    role: string | null;
  };
  targetUser: {
    id: number | null;
    username: string | null;
    name: string | null;
    role: string | null;
    email: string | null;
  };
  mailboxIdentity: string | null;
  generatedBySystem: boolean;
  passwordLength: number;
  reason: string | null;
};

export type WebmailResetHistoryResponse = {
  logs: WebmailResetHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const serverApi = {
  async getInfo() {
    const response = await apiClient.get<ApiEnvelope<ServerInfoResponse>>('/server/info');
    return response.data.data;
  },

  async getStorageOverview() {
    const response = await apiClient.get<ApiEnvelope<StorageOverviewResponse>>('/server/storage');
    return response.data.data;
  },

  async getMonitoring() {
    const response = await apiClient.get<ApiEnvelope<ServerMonitoringResponse>>('/server/monitoring');
    return response.data.data;
  },

  async getWebmailResetHistory(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<ApiEnvelope<WebmailResetHistoryResponse>>(
      '/server/webmail/reset-history',
      {
        params,
      },
    );
    return response.data.data;
  },

  async resetWebmailMailboxPassword(payload: { identifier: string; password?: string; reason?: string }) {
    const response = await apiClient.post<ApiEnvelope<WebmailResetResponse>>(
      '/server/webmail/reset-mailbox-password',
      payload,
    );
    return response.data.data;
  },
};
