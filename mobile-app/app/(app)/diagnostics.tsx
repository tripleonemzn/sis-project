import { Redirect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useAuthEventsQuery } from '../../src/features/diagnostics/useAuthEventsQuery';
import { authEventLogger } from '../../src/lib/auth/authEventLogger';
import { authService } from '../../src/features/auth/authService';
import { getApiErrorMessage } from '../../src/lib/api/errorMessage';
import { ENV } from '../../src/config/env';
import { offlineCache } from '../../src/lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../src/config/cache';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import {
  fetchMyPushDevicesStatus,
  getLocalPushDebugSnapshot,
  sendSelfTestPushNotification,
  syncPushDeviceRegistration,
  type LocalPushDebugSnapshot,
  type MobilePushDevicesStatus,
} from '../../src/features/pushNotifications/pushNotificationService';

type ApiCheckResult = {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  message: string;
};

type Severity = 'BLOCKER' | 'MAJOR' | 'MINOR';
type SyncItem = { count: number; latestUpdatedAt: string | null };
type SyncStatus = {
  profile: SyncItem;
  schedule: SyncItem;
  grades: SyncItem;
  attendance: SyncItem;
};

export default function DiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const eventsQuery = useAuthEventsQuery(isAuthenticated);
  const pageContentPadding = getStandardPagePadding(insets);
  const [apiCheck, setApiCheck] = useState<ApiCheckResult | null>(null);
  const [isCheckingApi, setIsCheckingApi] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [severity, setSeverity] = useState<Severity>('MAJOR');
  const [issueSummary, setIssueSummary] = useState('');
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncStatusLoading, setIsSyncStatusLoading] = useState(false);
  const [isSyncingPushToken, setIsSyncingPushToken] = useState(false);
  const [pushSyncMessage, setPushSyncMessage] = useState<string | null>(null);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [localPushDebug, setLocalPushDebug] = useState<LocalPushDebugSnapshot | null>(null);
  const [serverPushStatus, setServerPushStatus] = useState<MobilePushDevicesStatus | null>(null);
  const [isPushStatusLoading, setIsPushStatusLoading] = useState(false);
  const [isSendingPushTest, setIsSendingPushTest] = useState(false);

  const appVersion = Constants.expoConfig?.version || Constants.nativeApplicationVersion || '-';
  const androidVersionCode =
    Constants.expoConfig?.android?.versionCode || Constants.nativeBuildVersion || '-';
  const cacheTtlHours = Math.round(CACHE_TTL_MS / (60 * 60 * 1000));

  const runApiCheck = async () => {
    const startedAt = Date.now();
    setIsCheckingApi(true);
    try {
      await authService.me();
      const latencyMs = Date.now() - startedAt;
      const checkedAt = new Date().toISOString();
      const message = `Koneksi API normal (${latencyMs} ms).`;
      setApiCheck({ ok: true, latencyMs, checkedAt, message });
      await authEventLogger.log('API_CHECK_OK', message);
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const checkedAt = new Date().toISOString();
      const message = getApiErrorMessage(error, 'Cek API gagal.');
      setApiCheck({ ok: false, latencyMs, checkedAt, message });
      await authEventLogger.log('API_CHECK_FAILED', message);
    } finally {
      setIsCheckingApi(false);
    }
  };

  const loadSyncStatus = useCallback(async () => {
    if (!user) return;
    const [profile, schedule, grades, attendance] = await Promise.all([
      offlineCache.summarizeByPrefix('mobile_cache_profile'),
      offlineCache.summarizeByPrefix(`mobile_cache_schedule_${user.id}_${user.role}`),
      offlineCache.summarizeByPrefix(`mobile_cache_grades_${user.id}_`),
      offlineCache.summarizeByPrefix(`mobile_cache_attendance_${user.id}_`),
    ]);
    return { profile, schedule, grades, attendance } satisfies SyncStatus;
  }, [user]);

  const refreshSyncStatus = useCallback(async () => {
    setIsSyncStatusLoading(true);
    try {
      const nextSyncStatus = await loadSyncStatus();
      if (nextSyncStatus) setSyncStatus(nextSyncStatus);
    } finally {
      setIsSyncStatusLoading(false);
    }
  }, [loadSyncStatus]);

  const refreshPushStatus = useCallback(async () => {
    setIsPushStatusLoading(true);
    try {
      const localSnapshot = await getLocalPushDebugSnapshot();
      setLocalPushDebug(localSnapshot);

      try {
        const nextServerStatus = await fetchMyPushDevicesStatus();
        setServerPushStatus(nextServerStatus);
        setPushStatusMessage(null);
      } catch (error) {
        setServerPushStatus(null);
        setPushStatusMessage(getApiErrorMessage(error, 'Gagal membaca status push di server.'));
      }
    } finally {
      setIsPushStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSyncStatus();
  }, [refreshSyncStatus]);

  useEffect(() => {
    void refreshPushStatus();
  }, [refreshPushStatus]);

  const clearLocalCache = async () => {
    setIsClearingCache(true);
    try {
      const count = await offlineCache.clearAllMobileCaches();
      const msg = `Cache lokal dibersihkan (${count} key).`;
      await authEventLogger.log('CACHE_CLEARED', msg);
      await refreshSyncStatus();
      Alert.alert('Sukses', msg);
    } catch (error) {
      const msg = getApiErrorMessage(error, 'Gagal membersihkan cache lokal.');
      Alert.alert('Gagal', msg);
    } finally {
      setIsClearingCache(false);
    }
  };

  const syncPushTokenNow = async () => {
    setIsSyncingPushToken(true);
    try {
      const result = await syncPushDeviceRegistration();
      if (result.registered) {
        const token = result.token || '';
        const maskedToken = token.length > 18 ? `${token.slice(0, 18)}...` : token;
        const message = `Registrasi token push berhasil (${maskedToken}).`;
        setPushSyncMessage(message);
        await authEventLogger.log('API_CHECK_OK', `[Push] ${message}`);
        await refreshPushStatus();
        return;
      }

      const message = `Registrasi token push belum berhasil: ${
        result.errorMessage || 'izin notifikasi belum aktif atau request ke server gagal.'
      }`;
      setPushSyncMessage(message);
      await authEventLogger.log('API_CHECK_FAILED', `[Push] ${message}`);
      await refreshPushStatus();
    } catch (error) {
      const message = getApiErrorMessage(error, 'Gagal sinkron token push.');
      setPushSyncMessage(message);
      await authEventLogger.log('API_CHECK_FAILED', `[Push] ${message}`);
    } finally {
      setIsSyncingPushToken(false);
    }
  };

  const sendPushTestNow = async () => {
    const currentToken = localPushDebug?.storedToken || null;
    if (!currentToken) {
      const message = 'Token lokal belum ada. Sinkronkan token push dulu sebelum tes notifikasi.';
      setPushSyncMessage(message);
      return;
    }

    setIsSendingPushTest(true);
    try {
      const result = await sendSelfTestPushNotification(currentToken);
      const message =
        result.sent > 0
          ? `Tes notifikasi terkirim ke ${result.sent}/${result.recipients} perangkat. Cek panel notifikasi HP sekarang.`
          : `Tes notifikasi belum terkirim. Recipient ${result.recipients}, gagal ${result.failed}.`;
      setPushSyncMessage(message);
      await authEventLogger.log(
        result.sent > 0 ? 'API_CHECK_OK' : 'API_CHECK_FAILED',
        `[PushTest] ${message}`,
      );
      await refreshPushStatus();
    } catch (error) {
      const message = getApiErrorMessage(error, 'Gagal mengirim tes notifikasi ke perangkat ini.');
      setPushSyncMessage(message);
      await authEventLogger.log('API_CHECK_FAILED', `[PushTest] ${message}`);
    } finally {
      setIsSendingPushTest(false);
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memuat diagnostik..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  const formatSyncTime = (value: string | null) =>
    value ? new Date(value).toLocaleString('id-ID') : 'Belum ada sync';

  const severityHint: Record<Severity, string> = {
    BLOCKER: 'Aplikasi tidak bisa digunakan / crash / login gagal total.',
    MAJOR: 'Fitur inti terganggu, masih ada workaround terbatas.',
    MINOR: 'Gangguan ringan UI/UX, fitur utama tetap berjalan.',
  };

  const currentServerDevice =
    localPushDebug?.tokenFingerprint && serverPushStatus
      ? serverPushStatus.devices.find((device) => device.tokenFingerprint === localPushDebug.tokenFingerprint) || null
      : null;

  const exportDiagnosticsReport = async () => {
    setIsExportingReport(true);
    try {
      const sync = syncStatus || (await loadSyncStatus());
      if (sync && !syncStatus) setSyncStatus(sync);

      const events = eventsQuery.data || (await authEventLogger.getAll());
      const reportDate = new Date().toISOString();
      const header = [
        'SIS Mobile Diagnostics Report',
        `Generated At: ${reportDate}`,
        `User: ${user?.username || '-'} (${user?.role || '-'})`,
      ];
      const buildInfo = [
        'Build Info',
        `- App Version: ${appVersion}`,
        `- Android Version Code: ${androidVersionCode}`,
        `- API Base: ${ENV.API_BASE_URL}`,
        `- Cache TTL: ${cacheTtlHours} jam`,
      ];
      const apiInfo = [
        'API Check',
        `- Status: ${apiCheck ? (apiCheck.ok ? 'OK' : 'FAILED') : 'Belum dites'}`,
        `- Message: ${apiCheck?.message || '-'}`,
        `- Latency: ${apiCheck?.latencyMs ?? '-'} ms`,
        `- Checked At: ${apiCheck?.checkedAt || '-'}`,
      ];
      const pushInfo = [
        'Push Status',
        `- Permission: ${
          localPushDebug
            ? `${localPushDebug.permission.status} | granted=${localPushDebug.permission.granted ? 'yes' : 'no'} | canAskAgain=${localPushDebug.permission.canAskAgain ? 'yes' : 'no'}`
            : '-'
        }`,
        `- Android Native Push Config: ${
          localPushDebug
            ? `${localPushDebug.androidPushNativeConfigStatus}${localPushDebug.androidGoogleServicesFile ? ` (${localPushDebug.androidGoogleServicesFile})` : ''}`
            : '-'
        }`,
        `- Local Token: ${localPushDebug?.tokenPreview || '-'}`,
        `- Project ID: ${localPushDebug?.projectId || '-'}`,
        `- Device Name: ${localPushDebug?.deviceName || '-'}`,
        `- Last Sync: ${localPushDebug?.lastSync?.syncedAt || '-'}`,
        `- Last Sync Result: ${
          localPushDebug?.lastSync
            ? localPushDebug.lastSync.registered
              ? 'REGISTERED'
              : `FAILED (${localPushDebug.lastSync.errorMessage || localPushDebug.lastSync.reason || 'unknown'})`
            : '-'
        }`,
        `- Server Devices: ${serverPushStatus ? `${serverPushStatus.enabledDevices}/${serverPushStatus.totalDevices} enabled` : '-'}`,
        `- Current Device In Server: ${
          currentServerDevice
            ? `${currentServerDevice.platform} ${currentServerDevice.deviceName || '-'} lastSeen=${currentServerDevice.lastSeenAt}`
            : 'Tidak ditemukan'
        }`,
      ];
      const syncInfo = [
        'Sync Status',
        `- Profil: ${formatSyncTime(sync?.profile.latestUpdatedAt || null)} (${sync?.profile.count || 0} key)`,
        `- Jadwal: ${formatSyncTime(sync?.schedule.latestUpdatedAt || null)} (${sync?.schedule.count || 0} key)`,
        `- Nilai: ${formatSyncTime(sync?.grades.latestUpdatedAt || null)} (${sync?.grades.count || 0} key)`,
        `- Absensi: ${formatSyncTime(sync?.attendance.latestUpdatedAt || null)} (${sync?.attendance.count || 0} key)`,
      ];
      const issueInfo = [
        'Issue Template',
        `- Severity: ${severity}`,
        `- Summary: ${issueSummary.trim() || '(isi ringkasan issue)'}`,
        `- Reproduction Steps: ${reproductionSteps.trim() || '(isi langkah reproduksi)'}`,
        '- Actual Result: (isi hasil aktual)',
        '- Expected Result: (isi hasil yang diharapkan)',
        '- Impact: (dampak ke user/proses ujian)',
      ];
      const eventLines = (events || [])
        .slice(0, 20)
        .map((ev, idx) => `${idx + 1}. [${ev.ts}] ${ev.type} - ${ev.message || '-'}`);
      const eventInfo = ['Recent Events (max 20)', ...(eventLines.length > 0 ? eventLines : ['- Tidak ada event'])];

      const report = [
        ...header,
        '',
        ...buildInfo,
        '',
        ...apiInfo,
        '',
        ...pushInfo,
        '',
        ...syncInfo,
        '',
        ...issueInfo,
        '',
        ...eventInfo,
      ].join('\n');
      await Share.share({ message: report });
      await authEventLogger.log('REPORT_EXPORTED', `Diagnostics report diekspor (${events.length} event).`);
    } catch (error) {
      const msg = getApiErrorMessage(error, 'Gagal mengekspor diagnostics report.');
      Alert.alert('Gagal Export', msg);
    } finally {
      setIsExportingReport(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Diagnostics</Text>
      <Text style={{ color: '#64748b', marginBottom: 14 }}>
        Event auth lokal untuk membantu troubleshooting pilot.
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontWeight: '700', color: '#0f172a', marginBottom: 8 }}>Build Info</Text>
        <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>App Version: {appVersion}</Text>
        <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
          Android Version Code: {androidVersionCode}
        </Text>
        <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
          OTA Marker: pilot-live-2026-03-31-01
        </Text>
        <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>Cache TTL: {cacheTtlHours} jam</Text>
        <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>
          Max Snapshot/Fitur: {CACHE_MAX_SNAPSHOTS_PER_FEATURE}
        </Text>
        <Text style={{ color: '#475569', fontSize: 12 }}>API Base: {ENV.API_BASE_URL}</Text>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: '#0f172a' }}>Push & Update Status</Text>
          <Pressable onPress={refreshPushStatus}>
            <Text style={{ color: '#1d4ed8', fontWeight: '600', fontSize: 12 }}>
              {isPushStatusLoading ? 'Memuat...' : 'Refresh'}
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Permission: {localPushDebug ? localPushDebug.permission.status : '-'} | granted:{' '}
            {localPushDebug?.permission.granted ? 'ya' : 'tidak'} | canAskAgain:{' '}
            {localPushDebug?.permission.canAskAgain ? 'ya' : 'tidak'}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Android Native Push:{' '}
            {localPushDebug
              ? `${localPushDebug.androidPushNativeConfigStatus}${
                  localPushDebug.androidGoogleServicesFile ? ` (${localPushDebug.androidGoogleServicesFile})` : ''
                }`
              : '-'}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Token Lokal: {localPushDebug?.tokenPreview || 'Belum tersedia'}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Project ID: {localPushDebug?.projectId || '-'}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Device Name: {localPushDebug?.deviceName || '-'}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Last Sync: {formatSyncTime(localPushDebug?.lastSync?.syncedAt || null)}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Last Sync Result:{' '}
            {localPushDebug?.lastSync
              ? localPushDebug.lastSync.registered
                ? 'REGISTERED'
                : `FAILED (${localPushDebug.lastSync.errorMessage || localPushDebug.lastSync.reason || 'unknown'})`
              : 'Belum pernah'}
          </Text>
          <Text style={{ color: '#475569', fontSize: 12 }}>
            Device Server Aktif: {serverPushStatus ? `${serverPushStatus.enabledDevices}/${serverPushStatus.totalDevices}` : '-'}
          </Text>
          <Text style={{ color: currentServerDevice ? '#166534' : '#b45309', fontSize: 12 }}>
            {currentServerDevice
              ? `Device ini sudah terdaftar di server (${currentServerDevice.platform}, lastSeen ${formatSyncTime(
                  currentServerDevice.lastSeenAt,
                )}).`
              : 'Device ini belum terdeteksi di server.'}
          </Text>
          {localPushDebug?.androidPushNativeConfigStatus === 'missing' ? (
            <Text style={{ color: '#b91c1c', fontSize: 12 }}>
              Build Android ini belum membawa konfigurasi `google-services.json`. Notifikasi update saat aplikasi tertutup
              belum bisa dianggap siap sebelum build native berikutnya menyertakan file tersebut.
            </Text>
          ) : null}
          {pushStatusMessage ? (
            <Text style={{ color: '#b45309', fontSize: 12 }}>{pushStatusMessage}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={() => {
              void syncPushTokenNow();
            }}
            disabled={isSyncingPushToken}
            style={{
              flex: 1,
              backgroundColor: isSyncingPushToken ? '#93c5fd' : '#2563eb',
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>
              {isSyncingPushToken ? 'Sinkronisasi...' : 'Sinkronkan Token Push'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void sendPushTestNow();
            }}
            disabled={isSendingPushTest}
            style={{
              flex: 1,
              backgroundColor: isSendingPushTest ? '#86efac' : '#15803d',
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>
              {isSendingPushTest ? 'Mengirim Tes...' : 'Kirim Tes Notifikasi'}
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>
          {pushSyncMessage ||
            'Gunakan sinkronisasi token lalu kirim tes notifikasi untuk memastikan update otomatis sudah siap di perangkat ini. Untuk Android, pastikan build native sudah menyertakan google-services.json.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={() => eventsQuery.refetch()}
          style={{
            flex: 1,
            backgroundColor: '#1d4ed8',
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Refresh</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await authEventLogger.clear();
            await eventsQuery.refetch();
          }}
          style={{
            flex: 1,
            backgroundColor: '#b91c1c',
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Clear Events</Text>
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontWeight: '700', color: '#0f172a', marginBottom: 8 }}>Report Severity</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {(['BLOCKER', 'MAJOR', 'MINOR'] as Severity[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setSeverity(item)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: severity === item ? '#1d4ed8' : '#cbd5e1',
                backgroundColor: severity === item ? '#1d4ed8' : '#fff',
                borderRadius: 8,
                paddingVertical: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: severity === item ? '#fff' : '#334155', fontWeight: '600', fontSize: 12 }}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>{severityHint[severity]}</Text>
        <TextInput
          value={issueSummary}
          onChangeText={setIssueSummary}
          placeholder="Ringkasan issue (contoh: Jadwal kosong saat offline)"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: '#fff',
            marginBottom: 8,
            fontSize: 12,
          }}
        />
        <TextInput
          value={reproductionSteps}
          onChangeText={setReproductionSteps}
          placeholder="Langkah reproduksi singkat"
          multiline
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: '#fff',
            minHeight: 64,
            textAlignVertical: 'top',
            fontSize: 12,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontWeight: '700', color: '#0f172a' }}>Sync Status</Text>
          <Pressable onPress={refreshSyncStatus}>
            <Text style={{ color: '#1d4ed8', fontWeight: '600', fontSize: 12 }}>Refresh Status</Text>
          </Pressable>
        </View>
        {isSyncStatusLoading ? (
          <Text style={{ color: '#64748b', fontSize: 12 }}>Memuat status sync...</Text>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Profil: {formatSyncTime(syncStatus?.profile.latestUpdatedAt || null)} ({syncStatus?.profile.count || 0} key)
            </Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Jadwal: {formatSyncTime(syncStatus?.schedule.latestUpdatedAt || null)} ({syncStatus?.schedule.count || 0} key)
            </Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Nilai: {formatSyncTime(syncStatus?.grades.latestUpdatedAt || null)} ({syncStatus?.grades.count || 0} key)
            </Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Absensi: {formatSyncTime(syncStatus?.attendance.latestUpdatedAt || null)} ({syncStatus?.attendance.count || 0} key)
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={runApiCheck}
        disabled={isCheckingApi}
        style={{
          marginBottom: 12,
          backgroundColor: isCheckingApi ? '#93c5fd' : '#1d4ed8',
          paddingVertical: 10,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>
          {isCheckingApi ? 'Mengecek API...' : 'Tes Koneksi API'}
        </Text>
      </Pressable>

      <Pressable
        onPress={clearLocalCache}
        disabled={isClearingCache}
        style={{
          marginBottom: 12,
          backgroundColor: isClearingCache ? '#fdba74' : '#ea580c',
          paddingVertical: 10,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>
          {isClearingCache ? 'Membersihkan cache...' : 'Clear Local Cache'}
        </Text>
      </Pressable>

      <Pressable
        onPress={exportDiagnosticsReport}
        disabled={isExportingReport}
        style={{
          marginBottom: 12,
          backgroundColor: isExportingReport ? '#86efac' : '#15803d',
          paddingVertical: 10,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>
          {isExportingReport ? 'Menyiapkan report...' : 'Export Diagnostics Report'}
        </Text>
      </Pressable>

      {apiCheck ? (
        <View
          style={{
            marginBottom: 12,
            backgroundColor: apiCheck.ok ? '#dcfce7' : '#fee2e2',
            borderColor: apiCheck.ok ? '#86efac' : '#fca5a5',
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Text style={{ fontWeight: '700', color: apiCheck.ok ? '#166534' : '#991b1b', marginBottom: 4 }}>
            {apiCheck.ok ? 'API Reachable' : 'API Error'}
          </Text>
          <Text style={{ color: apiCheck.ok ? '#166534' : '#991b1b', fontSize: 12, marginBottom: 2 }}>
            {apiCheck.message}
          </Text>
          <Text style={{ color: apiCheck.ok ? '#166534' : '#991b1b', fontSize: 12 }}>
            Checked: {apiCheck.checkedAt} | Latency: {apiCheck.latencyMs} ms
          </Text>
        </View>
      ) : null}

      {eventsQuery.isLoading ? <QueryStateView type="loading" message="Memuat event..." /> : null}
      {eventsQuery.isError ? (
        <QueryStateView type="error" message="Gagal membaca event diagnostik." onRetry={() => eventsQuery.refetch()} />
      ) : null}

      {!eventsQuery.isLoading && !eventsQuery.isError ? (
        (eventsQuery.data || []).length > 0 ? (
          <View>
            {(eventsQuery.data || []).map((ev, idx) => (
              <View
                key={`${ev.ts}-${ev.type}-${idx}`}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>{ev.type}</Text>
                <Text style={{ color: '#475569', fontSize: 12, marginBottom: 2 }}>{ev.ts}</Text>
                <Text style={{ color: '#64748b', fontSize: 12 }}>{ev.message || '-'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada event</Text>
            <Text style={{ color: '#64748b' }}>Event auth akan tampil setelah aktivitas login/session terjadi.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
