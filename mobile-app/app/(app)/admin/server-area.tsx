import { useMemo, useState } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  serverApi,
  type ServerInfoResponse,
  type ServerMonitoringResponse,
  type StorageOverviewResponse,
} from '../../../src/features/server/serverApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type TabKey = 'info' | 'storage' | 'monitoring';

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const fixed = size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2);
  return `${fixed} ${units[unitIndex]}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 detik';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days} hari ${hours} jam`;
  }
  if (hours > 0) {
    return `${hours} jam ${minutes} menit`;
  }
  if (minutes > 0) {
    return `${minutes} menit`;
  }
  return `${Math.floor(seconds)} detik`;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function pickOverallStatus(storage: StorageOverviewResponse, monitoring: ServerMonitoringResponse | undefined) {
  const usedRoot = storage.summary.maxUsagePercent;
  const highRoot = usedRoot >= storage.summary.thresholdDangerPercent;
  const warnRoot = usedRoot >= storage.summary.thresholdWarningPercent;
  const cpuLoadPerCore = monitoring?.cpu.loadPerCore ?? 0;
  const mem = monitoring?.memory.usedPercent ?? 0;
  const highLoad = cpuLoadPerCore >= 1.2 || mem >= 90;
  const warnLoad = cpuLoadPerCore >= 0.8 || mem >= 75;

  if (highRoot || highLoad) {
    return { label: 'Perlu Perhatian', tone: 'danger' as const };
  }
  if (warnRoot || warnLoad) {
    return { label: 'Perlu Dipantau', tone: 'warning' as const };
  }
  return { label: 'Sehat', tone: 'success' as const };
}

function StatusPill(props: { tone: 'success' | 'warning' | 'danger'; label: string }) {
  const backgroundColor =
    props.tone === 'success' ? '#dcfce7' : props.tone === 'warning' ? '#fef3c7' : '#fee2e2';
  const borderColor =
    props.tone === 'success' ? '#22c55e' : props.tone === 'warning' ? '#f97316' : '#ef4444';
  const textColor =
    props.tone === 'success' ? '#166534' : props.tone === 'warning' ? '#9a3412' : '#991b1b';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '600' }}>{props.label}</Text>
    </View>
  );
}

export default function AdminServerAreaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 80 });
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  const infoQuery = useQuery({
    queryKey: ['mobile-admin-server-info'],
    queryFn: () => serverApi.getInfo(),
    enabled: isAuthenticated && user?.role === 'ADMIN',
  });

  const storageQuery = useQuery({
    queryKey: ['mobile-admin-server-storage'],
    queryFn: () => serverApi.getStorageOverview(),
    enabled: isAuthenticated && user?.role === 'ADMIN',
  });

  const monitoringQuery = useQuery({
    queryKey: ['mobile-admin-server-monitoring'],
    queryFn: () => serverApi.getMonitoring(),
    enabled: isAuthenticated && user?.role === 'ADMIN',
  });

  const isRefreshing =
    (infoQuery.isFetching && !infoQuery.isLoading) ||
    (storageQuery.isFetching && !storageQuery.isLoading) ||
    (monitoringQuery.isFetching && !monitoringQuery.isLoading);

  const status = useMemo(() => {
    if (!storageQuery.data) return null;
    return pickOverallStatus(storageQuery.data, monitoringQuery.data);
  }, [storageQuery.data, monitoringQuery.data]);

  if (isLoading) return <AppLoadingScreen message="Memuat Area Server..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'ADMIN') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>
          Area Server
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role admin." />
      </ScrollView>
    );
  }

  const renderHeader = () => (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text
          style={{
            marginLeft: 10,
            color: BRAND_COLORS.textDark,
            fontSize: 22,
            fontWeight: '700',
          }}
        >
          Area Server
        </Text>
      </View>

      {status && (
        <View
          style={{
            marginTop: 4,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: '#eef2ff',
            borderWidth: 1,
            borderColor: '#c7d2fe',
          }}
        >
          <Text style={{ fontSize: 12, color: '#4b5563', marginBottom: 4 }}>Status Server</Text>
          <StatusPill tone={status.tone} label={status.label} />
        </View>
      )}
    </View>
  );

  const renderTabs = () => {
    const tabs: { key: TabKey; label: string }[] = [
      { key: 'info', label: 'Info Server' },
      { key: 'storage', label: 'Storage' },
      { key: 'monitoring', label: 'Monitoring' },
    ];
    return (
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
          marginBottom: 12,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderBottomWidth: 2,
                borderBottomColor: isActive ? '#2563eb' : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isActive ? '600' : '500',
                  color: isActive ? '#2563eb' : '#6b7280',
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderInfoTab = (info: ServerInfoResponse | undefined) => {
    const expoConfig = (Constants as any)?.expoConfig || {};
    const rawVersion = typeof expoConfig.version === 'string' ? expoConfig.version.trim() : null;
    const appVersion = rawVersion && rawVersion.length > 0 ? rawVersion : null;
    const updateChannel = Updates.channel || 'default';

    const renderServerSection = () => {
      if (infoQuery.isLoading && !info) {
        return (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#2563eb" />
          </View>
        );
      }

      if (infoQuery.isError) {
        return (
          <QueryStateView
            type="error"
            message="Gagal memuat info server."
            onRetry={() => infoQuery.refetch()}
          />
        );
      }

      if (!info) {
        return (
          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 13, color: '#6b7280' }}>Info server belum tersedia.</Text>
          </View>
        );
      }

      const os = info.os;
      const cpu = info.cpu;
      const memory = info.memory;

      return (
        <>
          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Sistem Operasi</Text>
            <Text style={{ fontSize: 14, color: '#111827', fontWeight: '600', marginBottom: 8 }}>
              {os.distro || `${os.type} ${os.release}`}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Hostname</Text>
            <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>{os.hostname}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Platform</Text>
            <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
              {os.platform} ({os.arch})
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Uptime</Text>
            <Text style={{ fontSize: 13, color: '#111827' }}>{formatDuration(os.uptimeSeconds)}</Text>
          </View>

          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>CPU</Text>
            <Text style={{ fontSize: 14, color: '#111827', fontWeight: '600', marginBottom: 6 }}>
              {cpu.model || '-'}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Core</Text>
            <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>{cpu.cores}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Kecepatan</Text>
            <Text style={{ fontSize: 13, color: '#111827' }}>
              {cpu.speedMHz ? `${cpu.speedMHz} MHz` : '-'}
            </Text>
          </View>

          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Memori</Text>
            <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
              Total {formatBytes(memory.totalBytes)}
            </Text>
            <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
              Terpakai {formatBytes(memory.usedBytes)} ({formatPercent(memory.usedPercent)})
            </Text>
            <Text style={{ fontSize: 13, color: '#111827' }}>
              Tersisa {formatBytes(memory.freeBytes)}
            </Text>
          </View>
        </>
      );
    };

    return (
      <View style={{ gap: 12 }}>
        {renderServerSection()}

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Aplikasi Mobile</Text>
          <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
            Versi aplikasi: {appVersion || '-'}
          </Text>
          <Text style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
            Channel update OTA: {updateChannel}
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            Notifikasi update akan muncul otomatis ketika versi baru tersedia.
          </Text>
        </View>
      </View>
    );
  };

  const renderStorageTab = (storage: StorageOverviewResponse | undefined) => {
    if (storageQuery.isLoading && !storage) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      );
    }

    if (storageQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat informasi storage."
          onRetry={() => storageQuery.refetch()}
        />
      );
    }

    if (!storage) {
      return (
        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 13, color: '#6b7280' }}>Data storage belum tersedia.</Text>
        </View>
      );
    }

    const volumes = storage.volumes;
    const root =
      volumes.find((vol) => vol.mountpoint === '/') || (volumes.length > 0 ? volumes[0] : null);
    const totalDisks = storage.diskSummary.totalDisks;
    const totalCapacity = storage.diskSummary.totalCapacityBytes;

    return (
      <View style={{ gap: 12 }}>
        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Root Filesystem</Text>
          {root ? (
            <>
              <Text
                style={{ fontSize: 14, color: '#111827', fontWeight: '600' }}
              >{root.mountpoint}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                {formatBytes(root.usedBytes)} / {formatBytes(root.sizeBytes)} (
                {formatPercent(root.usedPercent)})
              </Text>
              <View
                style={{
                  marginTop: 6,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: '#e5e7eb',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 8,
                    width: `${Math.max(0, Math.min(100, root.usedPercent))}%`,
                    backgroundColor:
                      root.usedPercent >= 90
                        ? '#ef4444'
                        : root.usedPercent >= 80
                        ? '#f97316'
                        : '#2563eb',
                  }}
                />
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: '#6b7280' }}>
              Tidak ada informasi root filesystem.
            </Text>
          )}
        </View>

        {volumes.length > 0 && (
          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
              Volume Terpasang
            </Text>
            {volumes.map((vol) => (
              <View
                key={`${vol.filesystem}-${vol.mountpoint}`}
                style={{
                  paddingVertical: 6,
                  borderTopWidth: 1,
                  borderTopColor: '#f3f4f6',
                }}
              >
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{vol.mountpoint}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>{vol.filesystem}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {formatBytes(vol.usedBytes)} / {formatBytes(vol.sizeBytes)} (
                  {formatPercent(vol.usedPercent)})
                </Text>
              </View>
            ))}
          </View>
        )}

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4 }}>
            Media Fisik
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            {totalDisks} disk • {formatBytes(totalCapacity)}
          </Text>

          {storage.diskSummary.disks.length === 0 && (
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>Tidak ada disk terdeteksi.</Text>
          )}

          {storage.diskSummary.disks.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {storage.diskSummary.disks.map((disk) => (
                <View
                  key={disk.name}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    backgroundColor: '#f9fafb',
                    minWidth: '47%',
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: '#eff6ff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    <Feather name="hard-drive" size={16} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, fontWeight: '600', color: '#111827' }}
                    >
                      {disk.model || disk.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>
                      {formatBytes(disk.sizeBytes)} • {disk.mediaType || 'Tipe tidak diketahui'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderMonitoringTab = (monitoring: ServerMonitoringResponse | undefined) => {
    if (monitoringQuery.isLoading && !monitoring) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      );
    }

    if (monitoringQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat monitoring server."
          onRetry={() => monitoringQuery.refetch()}
        />
      );
    }

    if (!monitoring) {
      return (
        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 13, color: '#6b7280' }}>Data monitoring belum tersedia.</Text>
        </View>
      );
    }

    const cpu = monitoring.cpu;
    const memory = monitoring.memory;
    const storage = monitoring.storage;
    const bandwidth = monitoring.bandwidth;

    const cpuBarWidth = Math.min(100, cpu.loadPerCore * 100);
    const memoryBarWidth = Math.min(100, memory.usedPercent);
    const storageBarWidth = storage.root ? Math.min(100, storage.root.usedPercent) : 0;
    const bandwidthBarWidth =
      bandwidth != null ? Math.min(100, Math.max(bandwidth.rxMbps, bandwidth.txMbps)) : 0;

    return (
      <View style={{ gap: 12 }}>
        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>CPU</Text>
            <StatusPill
              tone={cpu.status === 'DANGER' ? 'danger' : cpu.status === 'WARNING' ? 'warning' : 'success'}
              label={cpu.status === 'DANGER' ? 'Bahaya' : cpu.status === 'WARNING' ? 'Perlu diperhatikan' : 'Aman'}
            />
          </View>
          <Text style={{ fontSize: 13, color: '#111827', marginBottom: 2 }}>
            Load 1m: {cpu.loadAvg1.toFixed(2)} ({cpu.coreCount} core)
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            Load/core: {cpu.loadPerCore.toFixed(2)}
          </Text>
          <View
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: '#e5e7eb',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: 8,
                width: `${cpuBarWidth}%`,
                backgroundColor:
                  cpu.status === 'DANGER'
                    ? '#ef4444'
                    : cpu.status === 'WARNING'
                    ? '#f97316'
                    : '#22c55e',
              }}
            />
          </View>
        </View>

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Memori</Text>
            <StatusPill
              tone={
                memory.status === 'DANGER'
                  ? 'danger'
                  : memory.status === 'WARNING'
                  ? 'warning'
                  : 'success'
              }
              label={
                memory.status === 'DANGER'
                  ? 'Bahaya'
                  : memory.status === 'WARNING'
                  ? 'Perlu diperhatikan'
                  : 'Aman'
              }
            />
          </View>
          <Text style={{ fontSize: 13, color: '#111827', marginBottom: 2 }}>
            Terpakai {formatPercent(memory.usedPercent)}
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            {formatBytes(memory.usedBytes)} dari {formatBytes(memory.totalBytes)}
          </Text>
          <View
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: '#e5e7eb',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: 8,
                width: `${memoryBarWidth}%`,
                backgroundColor:
                  memory.status === 'DANGER'
                    ? '#ef4444'
                    : memory.status === 'WARNING'
                    ? '#f97316'
                    : '#22c55e',
              }}
            />
          </View>
        </View>

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Storage Root</Text>
            {storage.root && (
              <StatusPill
                tone={
                  storage.status === 'DANGER'
                    ? 'danger'
                    : storage.status === 'WARNING'
                    ? 'warning'
                    : 'success'
                }
                label={
                  storage.status === 'DANGER'
                    ? 'Bahaya'
                    : storage.status === 'WARNING'
                    ? 'Perlu diperhatikan'
                    : 'Aman'
                }
              />
            )}
          </View>
          {storage.root ? (
            <>
              <Text style={{ fontSize: 13, color: '#111827', marginBottom: 2 }}>
                {storage.root.mountpoint} ({formatPercent(storage.root.usedPercent)})
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                {formatBytes(storage.root.usedBytes)} dari {formatBytes(storage.root.sizeBytes)}
              </Text>
              <View
                style={{
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: '#e5e7eb',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 8,
                    width: `${storageBarWidth}%`,
                    backgroundColor:
                      storage.status === 'DANGER'
                        ? '#ef4444'
                        : storage.status === 'WARNING'
                        ? '#f97316'
                        : '#22c55e',
                  }}
                />
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: '#6b7280' }}>
              Tidak dapat membaca penggunaan storage root.
            </Text>
          )}
        </View>

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Bandwidth</Text>
            {bandwidth && (
              <StatusPill
                tone={
                  bandwidth.status === 'DANGER'
                    ? 'danger'
                    : bandwidth.status === 'WARNING'
                    ? 'warning'
                    : 'success'
                }
                label={
                  bandwidth.status === 'DANGER'
                    ? 'Bahaya'
                    : bandwidth.status === 'WARNING'
                    ? 'Perlu diperhatikan'
                    : 'Aman'
                }
              />
            )}
          </View>
          {bandwidth ? (
            <>
              <Text style={{ fontSize: 13, color: '#111827', marginBottom: 2 }}>
                {bandwidth.interface.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                Download {bandwidth.rxMbps.toFixed(2)} Mbps • Upload {bandwidth.txMbps.toFixed(2)} Mbps
              </Text>
              <View
                style={{
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: '#e5e7eb',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 8,
                    width: `${bandwidthBarWidth}%`,
                    backgroundColor:
                      bandwidth.status === 'DANGER'
                        ? '#ef4444'
                        : bandwidth.status === 'WARNING'
                        ? '#f97316'
                        : '#22c55e',
                  }}
                />
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: '#6b7280' }}>
              Tidak dapat membaca statistik bandwidth saat ini.
            </Text>
          )}
        </View>
      </View>
    );
  };

  const info = infoQuery.data;
  const storage = storageQuery.data;
  const monitoring = monitoringQuery.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            infoQuery.refetch();
            storageQuery.refetch();
            monitoringQuery.refetch();
          }}
        />
      }
    >
      {renderHeader()}
      {renderTabs()}

      {activeTab === 'info' && renderInfoTab(info)}
      {activeTab === 'storage' && renderStorageTab(storage)}
      {activeTab === 'monitoring' && renderMonitoringTab(monitoring)}
    </ScrollView>
  );
}
