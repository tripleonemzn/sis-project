import { useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
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
  type OnlineUsersResponse,
  type ServerInfoResponse,
  type ServerMonitoringResponse,
  type StorageOverviewResponse,
  type WebmailResetHistoryItem,
  type WebmailResetResponse,
} from '../../../src/features/server/serverApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type TabKey = 'info' | 'storage' | 'monitoring' | 'online' | 'webmail';

const REFRESH_INTERVAL = {
  info: 20000,
  storage: 20000,
  monitoring: 5000,
  online: 15000,
  webmail: 15000,
} as const;

function resolveTabKey(value: string | string[] | undefined): TabKey {
  const normalized = (Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();
  if (normalized === 'storage') return 'storage';
  if (normalized === 'monitoring') return 'monitoring';
  if (normalized === 'online') return 'online';
  if (normalized === 'webmail') return 'webmail';
  return 'info';
}

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

function formatRoleLabel(role: string) {
  const normalized = String(role || '').trim().toUpperCase();
  if (normalized === 'ADMIN') return 'Admin';
  if (normalized === 'TEACHER') return 'Guru';
  if (normalized === 'STUDENT') return 'Siswa';
  if (normalized === 'PRINCIPAL') return 'Kepala Sekolah';
  if (normalized === 'STAFF') return 'Staff';
  if (normalized === 'PARENT') return 'Orang Tua';
  if (normalized === 'CALON_SISWA') return 'Calon Siswa';
  if (normalized === 'UMUM') return 'Umum';
  if (normalized === 'EXAMINER') return 'Penguji';
  if (normalized === 'EXTRACURRICULAR_TUTOR') return 'Tutor Ekstrakurikuler';
  return normalized || 'User';
}

function formatPlatformLabel(platform: string) {
  const normalized = String(platform || '').trim().toUpperCase();
  if (normalized === 'WEB') return 'Web';
  if (normalized === 'ANDROID') return 'Android';
  if (normalized === 'IOS') return 'iOS';
  return 'Lainnya';
}

function getPlatformColors(platform: string) {
  const normalized = String(platform || '').trim().toUpperCase();
  if (normalized === 'WEB') {
    return { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', textColor: '#1d4ed8' };
  }
  if (normalized === 'ANDROID') {
    return { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', textColor: '#047857' };
  }
  if (normalized === 'IOS') {
    return { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', textColor: '#6d28d9' };
  }
  return { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', textColor: '#4b5563' };
}

function pickOverallStatus(storage: StorageOverviewResponse, monitoring: ServerMonitoringResponse | undefined) {
  const usedRoot = storage.summary.maxUsagePercent;
  const highRoot = usedRoot >= storage.summary.thresholdDangerPercent;
  const warnRoot = usedRoot >= storage.summary.thresholdWarningPercent;
  const cpuLoadPerCore = monitoring?.cpu.loadPerCore ?? 0;
  const cpuBusyPercent = monitoring?.cpu.busyPercent ?? 0;
  const mem = monitoring?.memory.usedPercent ?? 0;
  const highLoad = cpuLoadPerCore >= 2 || cpuBusyPercent >= 90 || mem >= 90;
  const warnLoad = cpuLoadPerCore >= 1.2 || cpuBusyPercent >= 75 || mem >= 75;

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
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 80 });
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveTabKey(params.tab));
  const [mailboxIdentifier, setMailboxIdentifier] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [webmailResetResult, setWebmailResetResult] = useState<WebmailResetResponse | null>(null);
  const [webmailResetError, setWebmailResetError] = useState<string | null>(null);
  const [isSubmittingWebmailReset, setIsSubmittingWebmailReset] = useState(false);

  useEffect(() => {
    setActiveTab(resolveTabKey(params.tab));
  }, [params.tab]);

  const infoQuery = useQuery({
    queryKey: ['mobile-admin-server-info'],
    queryFn: () => serverApi.getInfo(),
    enabled: isAuthenticated && user?.role === 'ADMIN',
    refetchInterval: activeTab === 'info' ? REFRESH_INTERVAL.info : false,
    refetchIntervalInBackground: false,
  });

  const storageQuery = useQuery({
    queryKey: ['mobile-admin-server-storage'],
    queryFn: () => serverApi.getStorageOverview(),
    enabled: isAuthenticated && user?.role === 'ADMIN',
    refetchInterval: activeTab === 'storage' ? REFRESH_INTERVAL.storage : false,
    refetchIntervalInBackground: false,
  });

  const monitoringQuery = useQuery({
    queryKey: ['mobile-admin-server-monitoring'],
    queryFn: () => serverApi.getMonitoring(),
    enabled: isAuthenticated && user?.role === 'ADMIN',
    refetchInterval: activeTab === 'monitoring' ? REFRESH_INTERVAL.monitoring : false,
    refetchIntervalInBackground: false,
  });

  const onlineUsersQuery = useQuery({
    queryKey: ['mobile-admin-server-online-users'],
    queryFn: () => serverApi.getOnlineUsers(),
    enabled: isAuthenticated && user?.role === 'ADMIN' && activeTab === 'online',
    refetchInterval: activeTab === 'online' ? REFRESH_INTERVAL.online : false,
    refetchIntervalInBackground: false,
  });

  const webmailResetHistoryQuery = useQuery({
    queryKey: ['mobile-admin-webmail-reset-history', historySearch],
    queryFn: () =>
      serverApi.getWebmailResetHistory({
        limit: 20,
        search: historySearch.trim() || undefined,
      }),
    enabled: isAuthenticated && user?.role === 'ADMIN' && activeTab === 'webmail',
    refetchInterval: activeTab === 'webmail' ? REFRESH_INTERVAL.webmail : false,
    refetchIntervalInBackground: false,
  });

  const isRefreshing =
    (infoQuery.isFetching && !infoQuery.isLoading) ||
    (storageQuery.isFetching && !storageQuery.isLoading) ||
    (monitoringQuery.isFetching && !monitoringQuery.isLoading) ||
    (onlineUsersQuery.isFetching && !onlineUsersQuery.isLoading) ||
    (webmailResetHistoryQuery.isFetching && !webmailResetHistoryQuery.isLoading);

  const status = useMemo(() => {
    if (!storageQuery.data) return null;
    return pickOverallStatus(storageQuery.data, monitoringQuery.data);
  }, [storageQuery.data, monitoringQuery.data]);

  const resolveApiErrorMessage = (error: unknown, fallback: string) => {
    const messageFromResponse =
      typeof error === 'object' && error && 'response' in error
        ? (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
        : null;
    if (typeof messageFromResponse === 'string' && messageFromResponse.trim().length > 0) {
      return messageFromResponse.trim();
    }
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }
    return fallback;
  };

  const handleResetWebmailPassword = async () => {
    const identifier = mailboxIdentifier.trim();
    if (!identifier) {
      setWebmailResetError('Identifier user wajib diisi (username, email, mailbox, atau userId).');
      setWebmailResetResult(null);
      return;
    }

    setIsSubmittingWebmailReset(true);
    setWebmailResetError(null);

    try {
      const payload: { identifier: string; password?: string; reason?: string } = { identifier };
      const normalizedManualPassword = manualPassword.trim();
      const normalizedReason = resetReason.trim();
      if (normalizedManualPassword) payload.password = normalizedManualPassword;
      if (normalizedReason) payload.reason = normalizedReason;

      const result = await serverApi.resetWebmailMailboxPassword(payload);
      setWebmailResetResult(result);
      setManualPassword('');
      await webmailResetHistoryQuery.refetch();
    } catch (error) {
      setWebmailResetResult(null);
      setWebmailResetError(resolveApiErrorMessage(error, 'Gagal reset password webmail.'));
    } finally {
      setIsSubmittingWebmailReset(false);
    }
  };

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
      { key: 'online', label: 'User Online' },
      { key: 'webmail', label: 'Webmail' },
    ];
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ gap: 8, paddingRight: 8, paddingBottom: 4 }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: isActive ? '#2563eb' : '#d6e0f2',
                backgroundColor: isActive ? '#eff6ff' : '#ffffff',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? '#2563eb' : '#6b7280',
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  const renderInfoTab = (info: ServerInfoResponse | undefined) => {
    const expoConfig = (Constants as { expoConfig?: { version?: unknown } })?.expoConfig || {};
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

    const cpuBarWidth = Math.max(Math.min(100, cpu.busyPercent), Math.min(100, (cpu.loadPerCore / 2) * 100));
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
            CPU Busy {formatPercent(cpu.busyPercent)} • Load/core: {cpu.loadPerCore.toFixed(2)}
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
              Menunggu sampling bandwidth pertama atau interface belum terdeteksi.
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderOnlineUsersTab = (onlineUsers: OnlineUsersResponse | undefined) => {
    if (onlineUsersQuery.isLoading && !onlineUsers) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      );
    }

    if (onlineUsersQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat data user online."
          onRetry={() => onlineUsersQuery.refetch()}
        />
      );
    }

    if (!onlineUsers) {
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
          <Text style={{ fontSize: 13, color: '#6b7280' }}>Data user online belum tersedia.</Text>
        </View>
      );
    }

    const roleItems = onlineUsers?.byRole || [];
    const platformItems = (onlineUsers?.byPlatform || []).filter((item) => item.count > 0);
    const userItems = onlineUsers?.users || [];

    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View
            style={{
              flex: 1,
              minWidth: 150,
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>User Online</Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#111827' }}>
              {String(onlineUsers.totalUsers || 0)}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              User unik yang sedang aktif di web, Android, atau iOS.
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              minWidth: 150,
              borderRadius: 12,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Koneksi Aktif</Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#111827' }}>
              {String(onlineUsers.totalConnections || 0)}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Koneksi realtime yang masih tersambung sekarang.
            </Text>
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
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4 }}>
            Snapshot Realtime
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            Diambil {formatDateTime(onlineUsers.sampledAt)} • Grace {onlineUsers.graceWindowSeconds} detik
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
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
            Breakdown Platform
          </Text>
          {platformItems.length > 0 ? (
            <View style={{ gap: 8 }}>
              {platformItems.map((item) => (
                <View
                  key={item.platform}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    backgroundColor: '#f9fafb',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
                      {formatPlatformLabel(item.platform)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>{item.platform}</Text>
                  </View>
                  <View
                    style={{
                      minWidth: 46,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: '#eff6ff',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563eb' }}>{item.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Belum ada platform aktif yang terdeteksi.</Text>
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
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
            Sebaran Role
          </Text>
          {roleItems.length > 0 ? (
            <View style={{ gap: 8 }}>
              {roleItems.map((item) => (
                <View
                  key={item.role}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    backgroundColor: '#f9fafb',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
                      {formatRoleLabel(item.role)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>{item.role}</Text>
                  </View>
                  <View
                    style={{
                      minWidth: 46,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: '#eff6ff',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563eb' }}>{item.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              Belum ada user yang sedang terhubung ke aplikasi saat ini.
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
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
            Daftar User Aktif
          </Text>
          {userItems.length > 0 ? (
            <View style={{ gap: 8 }}>
              {userItems.map((item) => (
                <View
                  key={item.id}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    backgroundColor: '#f9fafb',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    gap: 8,
                  }}
                >
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                      @{item.username} • {formatRoleLabel(item.role)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                      Terlihat {formatDateTime(item.lastSeenAt)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {item.platforms.map((platform) => {
                      const colors = getPlatformColors(platform);
                      return (
                        <View
                          key={`${item.id}-${platform}`}
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            backgroundColor: colors.backgroundColor,
                            borderWidth: 1,
                            borderColor: colors.borderColor,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textColor }}>
                            {formatPlatformLabel(platform)}
                          </Text>
                        </View>
                      );
                    })}
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        backgroundColor: '#ffffff',
                        borderWidth: 1,
                        borderColor: '#d1d5db',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#4b5563' }}>
                        {String(item.totalConnections)} koneksi
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Belum ada user yang sedang aktif saat ini.</Text>
          )}
        </View>

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#eff6ff',
            borderWidth: 1,
            borderColor: '#bfdbfe',
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1d4ed8', marginBottom: 6 }}>Catatan</Text>
          <Text style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 18 }}>
            Total user online dihitung unik per user, walau user yang sama aktif di beberapa platform sekaligus.
            Breakdown platform menunjukkan user tersebut aktif di mana saja: Web, Android, atau iOS.
          </Text>
          <Text style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 18 }}>
            Grace window singkat dipakai agar user tidak langsung hilang saat reconnect kecil atau pindah jaringan.
          </Text>
        </View>
      </View>
    );
  };

  const renderHistoryItem = (item: WebmailResetHistoryItem) => (
    <View
      key={item.id}
      style={{
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingVertical: 10,
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 11, color: '#6b7280' }}>{formatDateTime(item.createdAt)}</Text>
      <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>
        {item.targetUser.username || '-'} {item.targetUser.role ? `(${item.targetUser.role})` : ''}
      </Text>
      <Text style={{ fontSize: 12, color: '#374151' }}>
        Mailbox: {item.mailboxIdentity || '-'} • Admin: {item.actor.username}
      </Text>
      <Text style={{ fontSize: 11, color: '#6b7280' }}>
        Mode: {item.generatedBySystem ? 'Otomatis' : 'Manual'} • Panjang: {item.passwordLength || 0} karakter
      </Text>
      {item.reason ? <Text style={{ fontSize: 11, color: '#6b7280' }}>Catatan: {item.reason}</Text> : null}
    </View>
  );

  const renderWebmailTab = () => {
    const historyItems = webmailResetHistoryQuery.data?.logs || [];

    return (
      <View style={{ gap: 12 }}>
        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 14, color: '#111827', fontWeight: '700' }}>Reset Password Webmail</Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            Reset cepat mailbox untuk Guru, Principal, Staff, dan Pembina Ekskul.
          </Text>

          <View>
            <Text style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>Identifier User</Text>
            <TextInput
              value={mailboxIdentifier}
              onChangeText={setMailboxIdentifier}
              placeholder="KGB2G071 / kgb2g071@siskgb2.id / 926"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                color: '#111827',
              }}
            />
          </View>

          <View>
            <Text style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
              Password Manual (opsional)
            </Text>
            <TextInput
              value={manualPassword}
              onChangeText={setManualPassword}
              placeholder="Kosongkan untuk auto-generate"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                color: '#111827',
              }}
            />
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              Minimal 10 karakter jika diisi manual.
            </Text>
          </View>

          <View>
            <Text style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>Catatan Reset (opsional)</Text>
            <TextInput
              value={resetReason}
              onChangeText={setResetReason}
              placeholder="Catatan audit reset password"
              autoCapitalize="sentences"
              autoCorrect={false}
              style={{
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                color: '#111827',
              }}
            />
          </View>

          <Pressable
            onPress={() => void handleResetWebmailPassword()}
            disabled={isSubmittingWebmailReset}
            style={{
              marginTop: 2,
              borderRadius: 10,
              backgroundColor: '#2563eb',
              paddingVertical: 11,
              alignItems: 'center',
              opacity: isSubmittingWebmailReset ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {isSubmittingWebmailReset ? 'Memproses...' : 'Reset Password Mailbox'}
            </Text>
          </Pressable>

          {webmailResetError ? (
            <View
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#fecaca',
                backgroundColor: '#fef2f2',
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: '#b91c1c' }}>{webmailResetError}</Text>
            </View>
          ) : null}
        </View>

        {webmailResetResult ? (
          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ecfdf5',
              borderWidth: 1,
              borderColor: '#a7f3d0',
              padding: 14,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 12, color: '#047857', fontWeight: '700' }}>Reset Berhasil</Text>
            <Text style={{ fontSize: 12, color: '#065f46' }}>
              User: {webmailResetResult.user.username} ({webmailResetResult.user.name})
            </Text>
            <Text style={{ fontSize: 12, color: '#065f46' }}>
              Mailbox: {webmailResetResult.mailboxIdentity}
            </Text>
            <Text style={{ fontSize: 12, color: '#065f46' }}>
              Password baru: {webmailResetResult.password}
            </Text>
            <Text style={{ fontSize: 11, color: '#065f46' }}>
              Mode: {webmailResetResult.generatedBySystem ? 'Otomatis' : 'Manual'} • {formatDateTime(webmailResetResult.resetAt)}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 14,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#111827', fontWeight: '700' }}>Riwayat Reset Password</Text>
            <Pressable
              onPress={() => webmailResetHistoryQuery.refetch()}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: '#fff',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 12, color: '#1e293b', fontWeight: '600' }}>Muat Ulang</Text>
            </Pressable>
          </View>

          <TextInput
            value={historySearch}
            onChangeText={setHistorySearch}
            placeholder="Cari username / mailbox / admin"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              borderWidth: 1,
              borderColor: '#d1d5db',
              borderRadius: 10,
              backgroundColor: '#fff',
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
              color: '#111827',
            }}
          />

          {webmailResetHistoryQuery.isLoading ? (
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Memuat riwayat reset...</Text>
          ) : webmailResetHistoryQuery.isError ? (
            <Text style={{ fontSize: 12, color: '#b91c1c' }}>Gagal memuat riwayat reset webmail.</Text>
          ) : historyItems.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Belum ada data riwayat reset.</Text>
          ) : (
            <View>{historyItems.map((item) => renderHistoryItem(item))}</View>
          )}
        </View>
      </View>
    );
  };

  const info = infoQuery.data;
  const storage = storageQuery.data;
  const monitoring = monitoringQuery.data;
  const onlineUsers = onlineUsersQuery.data;

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
            onlineUsersQuery.refetch();
            if (activeTab === 'webmail') {
              webmailResetHistoryQuery.refetch();
            }
          }}
        />
      }
    >
      {renderHeader()}
      {renderTabs()}

      {activeTab === 'info' && renderInfoTab(info)}
      {activeTab === 'storage' && renderStorageTab(storage)}
      {activeTab === 'monitoring' && renderMonitoringTab(monitoring)}
      {activeTab === 'online' && renderOnlineUsersTab(onlineUsers)}
      {activeTab === 'webmail' && renderWebmailTab()}
    </ScrollView>
  );
}
