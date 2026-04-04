import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Copy, Database, HardDrive, KeyRound, Network, Server as ServerIcon } from 'lucide-react';
import api from '../../services/api';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type ServerInfoResponse = {
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
    availableBytes?: number;
    cachedBytes?: number;
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

type StorageOverviewResponse = {
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
  diskSummary: {
    totalDisks: number;
    totalCapacityBytes: number;
    disks: {
      name: string;
      sizeBytes: number;
      model: string | null;
      mediaType: string | null;
    }[];
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
};

type MonitoringResponse = {
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
    availableBytes?: number;
    cachedBytes?: number;
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

type WebmailResetResponse = {
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

type WebmailResetHistoryItem = {
  id: number;
  createdAt: string;
  actor: {
    id: number;
    username: string;
    name: string;
    role: string;
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

type WebmailResetHistoryResponse = {
  logs: WebmailResetHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ServerAreaTab = 'info' | 'storage' | 'monitoring' | 'webmail';

const isServerAreaTab = (value: string | null): value is ServerAreaTab => {
  return value === 'info' || value === 'storage' || value === 'monitoring' || value === 'webmail';
};

const REFRESH_INTERVAL = {
  info: 20000,
  storage: 20000,
  monitoring: 5000,
  webmail: 15000,
} as const;

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
type HealthStatus = 'OK' | 'WARNING' | 'DANGER';

const normalizeHealthStatus = (status: unknown): HealthStatus => {
  if (status === 'WARNING') return 'WARNING';
  if (status === 'DANGER') return 'DANGER';
  return 'OK';
};

const statusBadgeClass = (status: HealthStatus) => {
  if (status === 'DANGER') {
    return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700';
  }
  if (status === 'WARNING') {
    return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700';
  }
  return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700';
};

const statusText = (status: HealthStatus) => {
  if (status === 'DANGER') return 'Bahaya';
  if (status === 'WARNING') return 'Perlu diperhatikan';
  return 'Aman';
};

const statusLightClass = (status: HealthStatus) => {
  if (status === 'DANGER') return 'bg-red-500 shadow-[0_0_0_4px_rgba(248,113,113,0.4)] animate-pulse';
  if (status === 'WARNING') return 'bg-yellow-400 shadow-[0_0_0_4px_rgba(250,204,21,0.4)]';
  return 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.4)]';
};

const ServerAreaPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTabFromUrl: ServerAreaTab = isServerAreaTab(tabParam) ? tabParam : 'info';
  const [activeTab, setActiveTab] = useState<ServerAreaTab>(activeTabFromUrl);
  const [mailboxIdentifier, setMailboxIdentifier] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [webmailResetResult, setWebmailResetResult] = useState<WebmailResetResponse | null>(null);
  const [webmailResetError, setWebmailResetError] = useState<string | null>(null);
  const [isSubmittingWebmailReset, setIsSubmittingWebmailReset] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const infoQuery = useQuery({
    queryKey: ['admin-server-info'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ServerInfoResponse>>('/server/info');
      return response.data.data;
    },
    enabled: activeTab === 'info',
    refetchInterval: activeTab === 'info' ? REFRESH_INTERVAL.info : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const storageQuery = useQuery({
    queryKey: ['admin-server-storage'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<StorageOverviewResponse>>('/server/storage');
      return response.data.data;
    },
    enabled: activeTab === 'storage',
    refetchInterval: activeTab === 'storage' ? REFRESH_INTERVAL.storage : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const monitoringQuery = useQuery({
    queryKey: ['admin-server-monitoring'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<MonitoringResponse>>('/server/monitoring');
      return response.data.data;
    },
    enabled: activeTab === 'monitoring',
    refetchInterval: activeTab === 'monitoring' ? REFRESH_INTERVAL.monitoring : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const webmailResetHistoryQuery = useQuery({
    queryKey: ['admin-webmail-reset-history'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<WebmailResetHistoryResponse>>('/server/webmail/reset-history', {
        params: { limit: 30 },
      });
      return response.data.data;
    },
    enabled: activeTab === 'webmail',
    refetchInterval: activeTab === 'webmail' ? REFRESH_INTERVAL.webmail : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const tabs = [
    { id: 'info', label: 'Info Server', icon: ServerIcon },
    { id: 'storage', label: 'Manajemen Storage', icon: HardDrive },
    { id: 'monitoring', label: 'Monitoring Server', icon: Activity },
  ] as const satisfies ReadonlyArray<{ id: ServerAreaTab; label: string; icon: React.ElementType }>;

  React.useEffect(() => {
    if (activeTab !== activeTabFromUrl) {
      setActiveTab(activeTabFromUrl);
    }
    if (!isServerAreaTab(tabParam)) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTabFromUrl);
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, activeTabFromUrl, searchParams, setSearchParams, tabParam]);

  const handleTabChange = (nextTab: ServerAreaTab) => {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  };

  const getApiErrorMessage = (error: unknown): string => {
    if (typeof error !== 'object' || error === null) return 'Gagal memproses reset password mailbox.';
    const candidate = error as {
      response?: {
        data?: {
          message?: string;
        };
      };
      message?: string;
    };
    return (
      candidate.response?.data?.message ||
      candidate.message ||
      'Gagal memproses reset password mailbox.'
    );
  };

  const handleResetWebmailPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = mailboxIdentifier.trim();
    const password = manualPassword.trim();

    if (!identifier) {
      setWebmailResetError('Identifier wajib diisi (username, email, atau userId).');
      setWebmailResetResult(null);
      return;
    }

    setIsSubmittingWebmailReset(true);
    setCopySuccess(false);
    setWebmailResetError(null);

    try {
      const response = await api.post<ApiEnvelope<WebmailResetResponse>>(
        '/server/webmail/reset-mailbox-password',
        {
          identifier,
          ...(password ? { password } : {}),
        },
      );

      setWebmailResetResult(response.data.data);
      setManualPassword('');
      webmailResetHistoryQuery.refetch();
    } catch (error) {
      setWebmailResetResult(null);
      setWebmailResetError(getApiErrorMessage(error));
    } finally {
      setIsSubmittingWebmailReset(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!webmailResetResult?.password) return;
    try {
      await navigator.clipboard.writeText(webmailResetResult.password);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1600);
    } catch {
      setCopySuccess(false);
    }
  };

  const renderInfoTab = () => {
    if (infoQuery.isLoading) {
      return <p className="text-sm text-gray-500">Memuat info server...</p>;
    }
    if (infoQuery.error) {
      return <p className="text-sm text-red-600">Gagal memuat info server.</p>;
    }
    if (!infoQuery.data) return null;
    const data = infoQuery.data;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Sistem Operasi</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {data.os.distro || `${data.os.type} ${data.os.release}`}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ServerIcon size={20} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs text-gray-600">
              <div>
                <dt className="text-gray-500">Hostname</dt>
                <dd className="font-medium text-gray-800 break-all">{data.os.hostname}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Platform</dt>
                <dd className="font-medium text-gray-800">
                  {data.os.platform} ({data.os.arch})
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Kernel</dt>
                <dd className="font-medium text-gray-800">
                  {data.os.kernelVersion || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Uptime</dt>
                <dd className="font-medium text-gray-800">
                  {Math.floor(data.os.uptimeSeconds / 3600)} jam
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">CPU</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {data.cpu.model || '-'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Activity size={20} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs text-gray-600">
              <div>
                <dt className="text-gray-500">Core</dt>
                <dd className="font-medium text-gray-800">{data.cpu.cores}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Kecepatan</dt>
                <dd className="font-medium text-gray-800">
                  {data.cpu.speedMHz ? `${data.cpu.speedMHz} MHz` : '-'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Memori</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">RAM</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Database size={18} />
              </div>
            </div>
            <dl className="space-y-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <dt>Total</dt>
                <dd className="font-medium text-gray-800">{formatBytes(data.memory.totalBytes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Terpakai</dt>
                <dd className="font-medium text-gray-800">
                  {formatBytes(data.memory.usedBytes)} ({formatPercent(data.memory.usedPercent)})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Tersisa</dt>
                <dd className="font-medium text-gray-800">{formatBytes(data.memory.freeBytes)}</dd>
              </div>
              {typeof data.memory.availableBytes === 'number' && (
                <div className="flex justify-between">
                  <dt>Tersedia Efektif</dt>
                  <dd className="font-medium text-gray-800">{formatBytes(data.memory.availableBytes)}</dd>
                </div>
              )}
              {typeof data.memory.cachedBytes === 'number' && (
                <div className="flex justify-between">
                  <dt>Cache/Buffers</dt>
                  <dd className="font-medium text-gray-800">{formatBytes(data.memory.cachedBytes)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Storage</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">Partisi Terpasang</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
                <HardDrive size={18} />
              </div>
            </div>
            <div className="space-y-2">
              {data.storage.map((vol) => (
                <div key={`${vol.filesystem}-${vol.mountpoint}`} className="border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{vol.mountpoint}</span>
                      <span className="text-[11px] text-gray-500">{vol.filesystem}</span>
                    </div>
                    <span className={statusBadgeClass(normalizeHealthStatus(vol.status))}>
                      {statusText(normalizeHealthStatus(vol.status))}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={
                        vol.status === 'DANGER'
                          ? 'h-2 bg-red-500'
                          : vol.status === 'WARNING'
                          ? 'h-2 bg-yellow-400'
                          : 'h-2 bg-emerald-500'
                      }
                      style={{ width: `${Math.min(100, vol.usedPercent)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-600 mt-1.5">
                    <span>
                      Terpakai {formatBytes(vol.usedBytes)} ({formatPercent(vol.usedPercent)})
                    </span>
                    <span>Tersisa {formatBytes(vol.availableBytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase mb-1">GPU / Display</p>
          <p className="text-sm font-medium text-gray-900">
            {data.gpu.summary || 'Tidak ada informasi GPU spesifik yang terdeteksi.'}
          </p>
        </div>
      </div>
    );
  };

  const renderStorageTab = () => {
    if (storageQuery.isLoading) {
      return <p className="text-sm text-gray-500">Memuat data storage...</p>;
    }
    if (storageQuery.error) {
      return <p className="text-sm text-red-600">Gagal memuat data storage.</p>;
    }
    if (!storageQuery.data) return null;
    const data = storageQuery.data;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Status Storage</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">Penggunaan Storage Server</p>
              <p className="text-xs text-gray-500 mt-1">
                Indikator berubah menjadi merah berkedip jika penggunaan melewati {data.summary.thresholdDangerPercent}%.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Terdeteksi {data.diskSummary.totalDisks} disk fisik dengan total kapasitas{' '}
                {formatBytes(data.diskSummary.totalCapacityBytes)}.
              </p>
              {data.diskSummary.disks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {data.diskSummary.disks.map((disk) => (
                    <div
                      key={disk.name}
                      className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <HardDrive size={18} />
                      </div>
                      <div className="text-xs">
                        <p className="font-semibold text-gray-900">
                          {disk.model || disk.name}
                        </p>
                        <p className="text-gray-500">
                          {formatBytes(disk.sizeBytes)} • {disk.mediaType || 'Tipe disk tidak diketahui'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full ${statusLightClass(data.summary.worstStatus)}`} />
              <div className="text-right">
                <p className="text-xs text-gray-500">Penggunaan Tertinggi</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatPercent(data.summary.maxUsagePercent)}
                </p>
                <p className="text-[11px] text-gray-500">{statusText(data.summary.worstStatus)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Volume Terpasang</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">Detail Partisi</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-4">Mountpoint</th>
                  <th className="py-2 pr-4">Filesystem</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4 text-right">Terpakai</th>
                  <th className="py-2 pr-4 text-right">Tersisa</th>
                  <th className="py-2 pr-4 text-right">% Terpakai</th>
                  <th className="py-2 pr-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.volumes.map((vol) => (
                  <tr key={`${vol.filesystem}-${vol.mountpoint}`} className="border-b border-gray-50">
                    <td className="py-2 pr-4 text-gray-900">{vol.mountpoint}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{vol.filesystem}</td>
                    <td className="py-2 pr-4 text-right">{formatBytes(vol.sizeBytes)}</td>
                    <td className="py-2 pr-4 text-right">{formatBytes(vol.usedBytes)}</td>
                    <td className="py-2 pr-4 text-right">{formatBytes(vol.availableBytes)}</td>
                    <td className="py-2 pr-4 text-right">{formatPercent(vol.usedPercent)}</td>
                    <td className="py-2 pr-4 text-right">
                      <span className={statusBadgeClass(normalizeHealthStatus(vol.status))}>
                        {statusText(normalizeHealthStatus(vol.status))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Storage Baru</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">Device Belum Terformat/Ter-mount</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
              <AlertTriangle size={14} />
              <span>Eksekusi format tetap dilakukan manual via terminal.</span>
            </div>
          </div>

          {data.unmountedDevices.length === 0 && (
            <p className="text-sm text-gray-500">
              Tidak ada device baru yang terdeteksi. Tambahkan storage fisik baru di server untuk melihatnya di sini.
            </p>
          )}

          {data.unmountedDevices.length > 0 && (
            <div className="space-y-3">
              {data.suggestedActions.map((item) => (
                <div
                  key={item.device.name}
                  className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        /dev/{item.device.name}{' '}
                        <span className="text-xs font-normal text-gray-500">
                          ({formatBytes(item.device.sizeBytes)})
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Model: {item.device.model || '-'} | Filesystem: {item.device.fstype || 'Belum ada'} | Status:{' '}
                        {item.device.state || '-'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-[11px] text-gray-500 mb-1">Perintah format yang direkomendasikan (jalankan di terminal):</p>
                    <pre className="text-xs bg-gray-900 text-gray-100 rounded-md px-3 py-2 overflow-x-auto">
                      {item.formatCommand}
                    </pre>
                    <p className="mt-1 text-[11px] text-red-600">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMonitoringTab = () => {
    if (monitoringQuery.isLoading) {
      return <p className="text-sm text-gray-500">Memuat data monitoring...</p>;
    }
    if (monitoringQuery.error) {
      return <p className="text-sm text-red-600">Gagal memuat data monitoring.</p>;
    }
    if (!monitoringQuery.data) return null;
    const data = monitoringQuery.data;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">CPU</p>
              <span className={statusBadgeClass(data.cpu.status)}>
                {statusText(data.cpu.status)}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Load 1m: {data.cpu.loadAvg1.toFixed(2)} ({data.cpu.coreCount} core)
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Load/core: {data.cpu.loadPerCore.toFixed(2)}
            </p>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={
                  data.cpu.status === 'DANGER'
                    ? 'h-2 bg-red-500'
                    : data.cpu.status === 'WARNING'
                    ? 'h-2 bg-yellow-400'
                    : 'h-2 bg-emerald-500'
                }
                style={{ width: `${Math.min(100, data.cpu.loadPerCore * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Aman jika load per core berada di bawah 1.2 secara konsisten.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Memori</p>
              <span className={statusBadgeClass(data.memory.status)}>
                {statusText(data.memory.status)}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Terpakai {formatPercent(data.memory.usedPercent)}
            </p>
            <p className="text-xs text-gray-500 mb-2">
              {formatBytes(data.memory.usedBytes)} dari {formatBytes(data.memory.totalBytes)}
            </p>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={
                  data.memory.status === 'DANGER'
                    ? 'h-2 bg-red-500'
                    : data.memory.status === 'WARNING'
                    ? 'h-2 bg-yellow-400'
                    : 'h-2 bg-emerald-500'
                }
                style={{ width: `${Math.min(100, data.memory.usedPercent)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Perhitungan memakai MemAvailable (lebih akurat di Linux, tidak salah baca cache sebagai beban murni).
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Storage Root</p>
              {data.storage.root && (
                <span className={statusBadgeClass(data.storage.status)}>
                  {statusText(data.storage.status)}
                </span>
              )}
            </div>
            {data.storage.root ? (
              <>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {data.storage.root.mountpoint} ({formatPercent(data.storage.root.usedPercent)})
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  {formatBytes(data.storage.root.usedBytes)} dari {formatBytes(data.storage.root.sizeBytes)}
                </p>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={
                      data.storage.status === 'DANGER'
                        ? 'h-2 bg-red-500'
                        : data.storage.status === 'WARNING'
                        ? 'h-2 bg-yellow-400'
                        : 'h-2 bg-emerald-500'
                    }
                    style={{ width: `${Math.min(100, data.storage.root.usedPercent)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  Jika mendekati 90%, segera bersihkan data log/backup lama atau tambah storage baru.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Tidak dapat membaca penggunaan storage root.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Bandwidth</p>
              {data.bandwidth && (
                <span className={statusBadgeClass(data.bandwidth.status)}>
                  {statusText(data.bandwidth.status)}
                </span>
              )}
            </div>
            {data.bandwidth ? (
              <>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {data.bandwidth.interface.toUpperCase()}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Download {data.bandwidth.rxMbps.toFixed(2)} Mbps • Upload {data.bandwidth.txMbps.toFixed(2)} Mbps
                </p>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={
                      data.bandwidth.status === 'DANGER'
                        ? 'h-2 bg-red-500'
                        : data.bandwidth.status === 'WARNING'
                        ? 'h-2 bg-yellow-400'
                        : 'h-2 bg-emerald-500'
                    }
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(data.bandwidth.rxMbps, data.bandwidth.txMbps),
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  Nilai di atas 80 Mbps menandakan trafik tinggi. Sesuaikan dengan kapasitas paket internet yang dimiliki.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900 mb-1">-</p>
                <p className="text-xs text-gray-500 mb-2">Download 0.00 Mbps • Upload 0.00 Mbps</p>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-2 bg-gray-300" style={{ width: '0%' }} />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">Menunggu sampling bandwidth pertama...</p>
              </>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 text-xs text-blue-800 rounded-xl p-4 flex gap-3">
          <Network size={18} className="flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">Catatan Interpretasi</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <span className="font-medium">Aman</span> berarti kondisi wajar untuk operasional harian.
              </li>
              <li>
                <span className="font-medium">Perlu diperhatikan</span> artinya mulai mendekati batas nyaman, perlu
                pemantauan berkala.
              </li>
              <li>
                <span className="font-medium">Bahaya</span> berarti perlu tindakan segera (scale up, tambah storage,
                bersihkan data, atau jadwalkan maintenance).
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderWebmailTab = () => {
    const historyItems = webmailResetHistoryQuery.data?.logs || [];
    const normalizedSearch = historySearch.trim().toLowerCase();
    const filteredHistory = normalizedSearch
      ? historyItems.filter((item) => {
          const haystack = [
            item.targetUser.username || '',
            item.targetUser.name || '',
            item.targetUser.email || '',
            item.mailboxIdentity || '',
            item.actor.username || '',
            item.actor.name || '',
            item.reason || '',
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : historyItems;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Reset Password Webmail</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              Reset cepat password mailbox user (role: Guru, Principal, Staff, Pembina Ekskul)
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Password hasil reset hanya ditampilkan sekali di halaman ini. Segera salin dan kirim ke user terkait.
            </p>
          </div>

          <form onSubmit={handleResetWebmailPassword} className="space-y-3">
            <div>
              <label htmlFor="mailbox-identifier" className="block text-xs font-medium text-gray-700 mb-1">
                Identifier User
              </label>
              <input
                id="mailbox-identifier"
                type="text"
                value={mailboxIdentifier}
                onChange={(event) => setMailboxIdentifier(event.target.value)}
                placeholder="Contoh: KGB2G071 / kgb2g071@siskgb2.id / 926"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="manual-password" className="block text-xs font-medium text-gray-700 mb-1">
                Password Manual (Opsional)
              </label>
              <input
                id="manual-password"
                type="text"
                value={manualPassword}
                onChange={(event) => setManualPassword(event.target.value)}
                placeholder="Kosongkan untuk auto-generate password aman"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-gray-500">Minimal 10 karakter jika diisi manual.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmittingWebmailReset}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <KeyRound size={16} />
                {isSubmittingWebmailReset ? 'Memproses...' : 'Reset Password Mailbox'}
              </button>
            </div>
          </form>

          {webmailResetError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {webmailResetError}
            </div>
          )}
        </div>

        {webmailResetResult && (
          <div className="bg-white rounded-xl border border-emerald-200 p-5">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700 tracking-wide uppercase">Reset Berhasil</p>
                <p className="text-sm text-gray-700 mt-1">
                  User <span className="font-semibold text-gray-900">{webmailResetResult.user.username}</span> (
                  {webmailResetResult.user.name})
                </p>
                <p className="text-sm text-gray-700">
                  Mailbox: <span className="font-semibold text-gray-900">{webmailResetResult.mailboxIdentity}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Waktu reset: {new Date(webmailResetResult.resetAt).toLocaleString('id-ID')}
                </p>
              </div>

              <div className="lg:min-w-[360px]">
                <p className="text-xs font-medium text-gray-600 mb-1">Password Baru</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 break-all">
                    {webmailResetResult.password}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Copy size={14} />
                    Salin
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {webmailResetResult.generatedBySystem
                    ? 'Password dibuat otomatis oleh sistem.'
                    : 'Password mengikuti input manual admin.'}
                </p>
                {copySuccess && <p className="text-[11px] text-emerald-700 mt-1">Password berhasil disalin.</p>}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Riwayat Reset Password</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">
                Log reset mailbox terakhir (audit trail admin)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Cari username / mailbox / admin"
                className="w-64 max-w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => webmailResetHistoryQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Muat Ulang
              </button>
            </div>
          </div>

          {webmailResetHistoryQuery.isLoading ? (
            <p className="text-sm text-gray-500">Memuat riwayat reset...</p>
          ) : webmailResetHistoryQuery.error ? (
            <p className="text-sm text-red-600">Gagal memuat riwayat reset webmail.</p>
          ) : filteredHistory.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada data riwayat reset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4">Waktu</th>
                    <th className="py-2 pr-4">Target User</th>
                    <th className="py-2 pr-4">Mailbox</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4">Panjang Password</th>
                    <th className="py-2 pr-4">Admin Eksekutor</th>
                    <th className="py-2 pr-4">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 pr-4 text-gray-700 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 pr-4 text-gray-800">
                        <div className="font-medium">
                          {item.targetUser.username || '-'}{' '}
                          {item.targetUser.role ? `(${item.targetUser.role})` : ''}
                        </div>
                        <div className="text-[11px] text-gray-500">{item.targetUser.name || '-'}</div>
                      </td>
                      <td className="py-2 pr-4 text-gray-800">{item.mailboxIdentity || '-'}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            item.generatedBySystem ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {item.generatedBySystem ? 'Otomatis' : 'Manual'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{item.passwordLength || '-'}</td>
                      <td className="py-2 pr-4 text-gray-800">
                        <div className="font-medium">{item.actor.username}</div>
                        <div className="text-[11px] text-gray-500">{item.actor.name}</div>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{item.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Area Server</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pantau informasi server, kapasitas storage, dan kondisi performa untuk menjaga stabilitas SIS.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0">
        <div className="border-b border-gray-200 mb-4 px-6 pt-4">
          <nav className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-xl">
          {activeTab === 'info' && renderInfoTab()}
          {activeTab === 'storage' && renderStorageTab()}
          {activeTab === 'monitoring' && renderMonitoringTab()}
          {activeTab === 'webmail' && renderWebmailTab()}
        </div>
      </div>
    </div>
  );
};

export default ServerAreaPage;
