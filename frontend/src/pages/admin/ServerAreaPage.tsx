import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Database, HardDrive, Network, Server as ServerIcon } from 'lucide-react';
import api from '../../services/api';
import React, { useState } from 'react';

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

const statusBadgeClass = (status: 'OK' | 'WARNING' | 'DANGER') => {
  if (status === 'DANGER') {
    return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700';
  }
  if (status === 'WARNING') {
    return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700';
  }
  return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700';
};

const statusText = (status: 'OK' | 'WARNING' | 'DANGER') => {
  if (status === 'DANGER') return 'Bahaya';
  if (status === 'WARNING') return 'Perlu diperhatikan';
  return 'Aman';
};

const statusLightClass = (status: 'OK' | 'WARNING' | 'DANGER') => {
  if (status === 'DANGER') return 'bg-red-500 shadow-[0_0_0_4px_rgba(248,113,113,0.4)] animate-pulse';
  if (status === 'WARNING') return 'bg-yellow-400 shadow-[0_0_0_4px_rgba(250,204,21,0.4)]';
  return 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.4)]';
};

const ServerAreaPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'info' | 'storage' | 'monitoring'>('info');

  const infoQuery = useQuery({
    queryKey: ['admin-server-info'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ServerInfoResponse>>('/server/info');
      return response.data.data;
    },
  });

  const storageQuery = useQuery({
    queryKey: ['admin-server-storage'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<StorageOverviewResponse>>('/server/storage');
      return response.data.data;
    },
  });

  const monitoringQuery = useQuery({
    queryKey: ['admin-server-monitoring'],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<MonitoringResponse>>('/server/monitoring');
      return response.data.data;
    },
    refetchInterval: 5000,
  });

  const tabs = [
    { id: 'info', label: 'Info Server', icon: ServerIcon },
    { id: 'storage', label: 'Manajemen Storage', icon: HardDrive },
    { id: 'monitoring', label: 'Monitoring Server', icon: Activity },
  ] as const;

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
                    <span className={statusBadgeClass(vol.status as any)}>
                      {statusText(vol.status as any)}
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
                      <span className={statusBadgeClass(vol.status as any)}>
                        {statusText(vol.status as any)}
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
              Aman jika load per core berada di bawah 0.8 secara konsisten.
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
              Idealnya penggunaan RAM di bawah 75% untuk menjaga performa stabil.
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
              <p className="text-sm text-gray-500">
                Tidak dapat membaca statistik bandwidth saat ini. Pastikan server Linux memiliki akses ke /proc/net/dev.
              </p>
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
                  onClick={() => setActiveTab(tab.id)}
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
        </div>
      </div>
    </div>
  );
};

export default ServerAreaPage;
