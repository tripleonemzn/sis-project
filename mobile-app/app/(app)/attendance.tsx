import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { CameraQrScanModal } from '../../src/components/CameraQrScanModal';
import { MobileMenuTabBar } from '../../src/components/MobileMenuTabBar';
import { QueryStateView } from '../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { attendanceApi } from '../../src/features/attendance/attendanceApi';
import {
  DailyPresenceMonitorScanResult,
  DailyPresenceOwnState,
  DailyPresenceSelfScanPass,
  StudentAttendanceHistory,
  StudentAttendanceStatus,
} from '../../src/features/attendance/types';
import {
  formatCountdownLabel,
  getDailyPresenceCheckpointLabel,
} from '../../src/features/attendance/selfScanUtils';
import { useStudentAttendanceQuery } from '../../src/features/attendance/useStudentAttendanceQuery';
import { resolvePublicAssetUrl } from '../../src/lib/media/resolvePublicAssetUrl';
import { notifyApiError, notifySuccess } from '../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import {
  buildResponsivePageContentStyle,
  useResponsiveLayout,
} from '../../src/lib/ui/useResponsiveLayout';
import { useAppTextScale } from '../../src/theme/AppTextScaleProvider';
import { useAppTheme } from '../../src/theme/AppThemeProvider';

type AttendanceTabKey = 'SCAN' | 'HISTORY';
type Checkpoint = 'CHECK_IN' | 'CHECK_OUT';

const DAILY_PRESENCE_SCAN_ROLES = new Set([
  'STUDENT',
  'TEACHER',
  'STAFF',
  'PRINCIPAL',
  'EXTRACURRICULAR_TUTOR',
]);

const STATUS_LABELS: Record<StudentAttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  DISPENSATION: 'Dispen',
  ABSENT: 'Alpha',
  ALPHA: 'Alpha',
  LATE: 'Terlambat',
};

const STATUS_COLORS: Record<StudentAttendanceStatus, string> = {
  PRESENT: '#15803d',
  SICK: '#1d4ed8',
  PERMISSION: '#a16207',
  DISPENSATION: '#0e7490',
  ABSENT: '#b91c1c',
  ALPHA: '#b91c1c',
  LATE: '#c2410c',
};

function toMonthYear(date: Date) {
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function AttendanceCard({ item }: { item: StudentAttendanceHistory }) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const status = item.status;
  const color = STATUS_COLORS[status] || colors.text;
  const note = item.note || item.notes || '-';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 14,
        padding: 14,
        backgroundColor: '#fff',
        marginBottom: 10,
      }}
    >
      <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>
        {new Date(item.date).toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </Text>
      <Text style={{ color, fontWeight: '700', marginBottom: 4 }}>{STATUS_LABELS[status] || status}</Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: colors.textMuted, marginBottom: 3 }}>
        Masuk: {item.checkInTime || '-'} | Pulang: {item.checkOutTime || '-'}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: colors.textMuted }}>
        Catatan: {note}
      </Text>
    </View>
  );
}

function getDailyPresenceSourceLabel(value?: string | null) {
  if (value === 'SELF_SCAN') return 'Scan Mandiri';
  if (value === 'ASSISTED_SCAN') return 'Bantuan Petugas';
  if (value === 'MANUAL_ADJUSTMENT') return 'Koreksi Manual';
  if (value === 'LEGACY_DAILY') return 'Manual Lama';
  return '-';
}

function OwnDailyPresenceHistoryCard({ item }: { item: StudentAttendanceHistory }) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const note = item.note || item.notes || '-';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 14,
        padding: 14,
        backgroundColor: '#fff',
        marginBottom: 10,
      }}
    >
      <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>
        {new Date(item.date).toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: colors.textMuted, marginBottom: 3 }}>
        Masuk: {item.checkInTime || '-'} | Pulang: {item.checkOutTime || '-'}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: colors.textMuted }}>
        Catatan: {note}
      </Text>
    </View>
  );
}

function ProtectedQrCard({ pass }: { pass: DailyPresenceSelfScanPass }) {
  usePreventScreenCapture('daily-presence-self-scan');
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const { colors } = useAppTheme();
  const photoUrl = resolvePublicAssetUrl(pass.student.photo);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#c7d7f7',
        borderRadius: 20,
        backgroundColor: '#fff',
        padding: 16,
      }}
    >
      <Text
        style={{
          fontSize: scaleFont(17),
          lineHeight: scaleLineHeight(24),
          fontWeight: '700',
          color: colors.text,
          marginBottom: 4,
        }}
      >
        QR {getDailyPresenceCheckpointLabel(pass.checkpoint)}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        QR ini hanya berlaku singkat. Tunjukkan langsung ke petugas saat countdown masih aktif.
      </Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 18,
          padding: 14,
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          marginBottom: 12,
        }}
      >
        <Image
          source={{ uri: pass.qrCodeDataUrl }}
          style={{ width: 220, height: 220, marginBottom: 10 }}
          resizeMode="contain"
        />
        <Text style={{ color: '#b45309', fontWeight: '700', marginBottom: 4 }}>
          Berlaku {formatCountdownLabel(pass.qrExpiresAt)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, textAlign: 'center' }}>
          Petugas akan melihat identitas Anda sebelum mengonfirmasi scan.
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#dbeafe',
          backgroundColor: '#eff6ff',
          borderRadius: 14,
          padding: 12,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            backgroundColor: '#dbeafe',
            borderWidth: 1,
            borderColor: '#bfdbfe',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginRight: 12,
          }}
        >
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(18) }}>
              {pass.student.name.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 2 }}>{pass.student.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact }}>
            {pass.student.class?.name || '-'} • {pass.student.nis || pass.student.nisn || '-'}
          </Text>
          <Text style={{ color: '#1d4ed8', fontSize: fontSizes.caption, marginTop: 2 }}>
            {pass.session.gateLabel ? `Checkpoint ${pass.session.gateLabel}` : 'Checkpoint aktif petugas'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MonitorQrScannerCard({
  enabled,
  permissionGranted,
  permissionDenied,
  onRequestPermission,
  onScanned,
  result,
  pending,
  onResetResult,
}: {
  enabled: boolean;
  permissionGranted: boolean;
  permissionDenied: boolean;
  onRequestPermission: () => void;
  onScanned: (result: BarcodeScanningResult) => void;
  result: DailyPresenceMonitorScanResult | null;
  pending: boolean;
  onResetResult: () => void;
}) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!permissionGranted) setScannerOpen(false);
  }, [permissionGranted]);

  useEffect(() => {
    if (pending || result) setScannerOpen(false);
  }, [pending, result]);

  const handleScanned = (scanResult: BarcodeScanningResult) => {
    setScannerOpen(false);
    onScanned(scanResult);
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#c7d7f7',
        borderRadius: 18,
        backgroundColor: '#fff',
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
        Scan QR Monitor TU
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4, marginBottom: 12 }}>
        Arahkan kamera ke QR yang tampil di monitor Tata Usaha. Sistem otomatis menentukan absen masuk atau pulang dari QR yang dipindai.
      </Text>

      {!permissionGranted ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'dashed',
            borderRadius: 14,
            padding: 16,
            backgroundColor: '#f8fafc',
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Izin kamera belum aktif</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
            {permissionDenied
              ? 'Aktifkan izin kamera agar Anda bisa scan QR monitor presensi.'
              : 'Berikan izin kamera untuk mulai scan QR monitor presensi.'}
          </Text>
          <Pressable
            onPress={onRequestPermission}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {permissionDenied ? 'Minta Izin Kamera Lagi' : 'Aktifkan Kamera'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            borderRadius: 16,
            padding: 14,
            backgroundColor: '#eff6ff',
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
            Kamera siap untuk scan
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
            Buka scanner layar penuh agar preview kamera lebih stabil di Android, lalu arahkan ke QR monitor TU.
          </Text>
          <Pressable
            onPress={() => setScannerOpen(true)}
            disabled={!enabled}
            style={{
              backgroundColor: enabled ? colors.primary : '#93c5fd',
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {pending ? 'Mencatat presensi...' : 'Buka Kamera Scan'}
            </Text>
          </Pressable>
          <CameraQrScanModal
            visible={scannerOpen && permissionGranted}
            enabled={enabled}
            busy={pending}
            title="Scan QR Monitor TU"
            description="Arahkan kamera ke QR yang tampil di monitor Tata Usaha."
            guideLabel="Posisikan QR di tengah layar"
            helperText="QR monitor akan terbaca otomatis saat kamera fokus."
            busyText="Mencatat presensi..."
            onClose={() => setScannerOpen(false)}
            onScanned={handleScanned}
          />
        </View>
      )}

      {result ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: result.checkpoint === 'CHECK_IN' ? '#bbf7d0' : '#bae6fd',
            backgroundColor: result.checkpoint === 'CHECK_IN' ? '#f0fdf4' : '#f0f9ff',
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
            {getDailyPresenceCheckpointLabel(result.checkpoint)} berhasil tercatat
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, lineHeight: scaleLineHeight(18) }}>
            Jam {result.recordedTime || '-'}
            {result.gateLabel ? ` • ${result.gateLabel}` : ''}
            {result.lateMinutes && result.lateMinutes > 0 ? ` • terlambat ${result.lateMinutes} menit` : ''}
          </Text>
          <Pressable
            onPress={onResetResult}
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>
              Scan Lagi
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function AttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { colors } = useAppTheme();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const [tab, setTab] = useState<AttendanceTabKey>('SCAN');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [checkpoint, setCheckpoint] = useState<Checkpoint>('CHECK_IN');
  const [challengeCode, setChallengeCode] = useState('');
  const [currentPass, setCurrentPass] = useState<DailyPresenceSelfScanPass | null>(null);
  const [monitorScanResult, setMonitorScanResult] = useState<DailyPresenceMonitorScanResult | null>(null);
  const [pendingMonitorToken, setPendingMonitorToken] = useState('');
  const [, setTicker] = useState(Date.now());
  const lastMonitorScanRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });
  const pageContentPadding = getStandardPagePadding(insets, { horizontal: layout.pageHorizontal });
  const pageContentStyle = buildResponsivePageContentStyle(pageContentPadding, layout);
  const { month, year } = toMonthYear(cursorDate);
  const cameraGranted = Boolean(cameraPermission?.granted);
  const cameraDenied = cameraPermission?.status === 'denied';
  const userRole = String(user?.role || '').trim().toUpperCase();
  const isStudent = userRole === 'STUDENT';
  const canUseDailyPresence = DAILY_PRESENCE_SCAN_ROLES.has(userRole);

  const attendanceQuery = useStudentAttendanceQuery({
    enabled: isAuthenticated && isStudent,
    user,
    month,
    year,
  });

  const todayPresenceQuery = useQuery({
    queryKey: ['mobile-daily-presence-me', user?.id, userRole],
    enabled: isAuthenticated && canUseDailyPresence,
    queryFn: () => attendanceApi.getOwnDailyPresence(),
    staleTime: 20 * 1000,
  });

  const ownHistoryQuery = useQuery({
    queryKey: ['mobile-daily-presence-history', user?.id, month, year],
    enabled: isAuthenticated && canUseDailyPresence && !isStudent,
    queryFn: () => attendanceApi.getOwnDailyPresenceHistory({ month, year }),
    staleTime: 60 * 1000,
  });

  const activeSessionQuery = useQuery({
    queryKey: ['mobile-student-self-scan-session', checkpoint],
    enabled: isAuthenticated && isStudent && tab === 'SCAN',
    queryFn: () => attendanceApi.getActiveSelfScanSession({ checkpoint }),
    staleTime: 20 * 1000,
  });

  const createPassMutation = useMutation({
    mutationFn: () =>
      attendanceApi.createSelfScanPass({
        checkpoint,
        challengeCode: challengeCode.replace(/\D+/g, ''),
      }),
    onSuccess: (result) => {
      setCurrentPass(result);
      void todayPresenceQuery.refetch();
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal membuat QR presensi.');
    },
  });

  const monitorScanMutation = useMutation({
    mutationFn: (payload: { qrToken: string }) => attendanceApi.confirmSelfScanMonitorPass(payload),
    onSuccess: async (result) => {
      setMonitorScanResult(result);
      setPendingMonitorToken('');
      setCurrentPass(null);
      notifySuccess(
        result.checkpoint === 'CHECK_IN'
          ? 'Absen masuk berhasil dari QR monitor.'
          : 'Absen pulang berhasil dari QR monitor.',
      );
      await Promise.all([
        todayPresenceQuery.refetch(),
        ...(isStudent ? [attendanceQuery.refetch()] : []),
      ]);
    },
    onError: (error) => {
      setPendingMonitorToken('');
      notifyApiError(error, 'Gagal memproses QR monitor presensi.');
    },
  });

  useEffect(() => {
    if (!currentPass) return;
    const timer = setInterval(() => {
      setTicker(Date.now());
      if (new Date(currentPass.qrExpiresAt).getTime() <= Date.now()) {
        setCurrentPass(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [currentPass]);

  useEffect(() => {
    setCurrentPass(null);
    setChallengeCode('');
  }, [checkpoint]);

  const records = useMemo(() => attendanceQuery.data?.records || [], [attendanceQuery.data?.records]);
  const stats = useMemo(() => {
    const result = { present: 0, sick: 0, permission: 0, absent: 0, late: 0 };
    for (const item of records) {
      if (item.status === 'PRESENT') result.present += 1;
      if (item.status === 'SICK') result.sick += 1;
      if (item.status === 'PERMISSION') result.permission += 1;
      if (item.status === 'ABSENT' || item.status === 'ALPHA') result.absent += 1;
      if (item.status === 'LATE') result.late += 1;
    }
    return result;
  }, [records]);

  const summaryCardWidth = layout.prefersSplitPane ? '25%' : layout.isTablet ? '33.3333%' : '50%';
  const canCreatePass =
    Boolean(activeSessionQuery.data?.sessionId) &&
    challengeCode.replace(/\D+/g, '').length === 6 &&
    !createPassMutation.isPending;
  const monitorScannerEnabled =
    tab === 'SCAN' &&
    canUseDailyPresence &&
    cameraGranted &&
    !monitorScanMutation.isPending &&
    !pendingMonitorToken &&
    !monitorScanResult;
  const attendanceTabs = isStudent
    ? [
        { key: 'SCAN', label: 'Scan Presensi', iconName: 'shield' as const },
        { key: 'HISTORY', label: 'Riwayat', iconName: 'calendar' as const },
      ]
    : [
        { key: 'SCAN', label: 'Scan Presensi', iconName: 'shield' as const },
        { key: 'HISTORY', label: 'Riwayat', iconName: 'calendar' as const },
      ];

  if (isLoading) return <AppLoadingScreen message="Memuat absensi..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!canUseDailyPresence) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={pageContentStyle}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8, color: colors.text }}>
          Absensi Saya
        </Text>
        <QueryStateView type="error" message="Fitur Absensi Saya belum tersedia untuk role akun ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: colors.primary,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: fontSizes.label }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const moveMonth = (offset: number) => {
    setCursorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const handleRefresh = () => {
    void Promise.all([
      todayPresenceQuery.refetch(),
      ...(!isStudent ? [ownHistoryQuery.refetch()] : []),
      ...(isStudent ? [attendanceQuery.refetch(), activeSessionQuery.refetch()] : []),
    ]);
  };

  const handleMonitorQrScanned = (result: BarcodeScanningResult) => {
    const qrToken = String(result?.data || '').trim();
    const now = Date.now();
    const lastScan = lastMonitorScanRef.current;
    if (!qrToken || pendingMonitorToken || monitorScanMutation.isPending) return;
    if (lastScan.token === qrToken && now - lastScan.at < 4000) return;
    lastMonitorScanRef.current = { token: qrToken, at: now };
    setPendingMonitorToken(qrToken);
    setMonitorScanResult(null);
    monitorScanMutation.mutate({ qrToken });
  };

  const todayPresence = todayPresenceQuery.data?.presence || null;
  const ownState = todayPresenceQuery.data as DailyPresenceOwnState | undefined;
  const ownParticipant = ownState && 'participant' in ownState ? ownState.participant : null;
  const ownHistoryRecords = ownHistoryQuery.data || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={pageContentStyle}
      refreshControl={
        <RefreshControl
          refreshing={
            attendanceQuery.isFetching ||
            todayPresenceQuery.isFetching ||
            (activeSessionQuery.isFetching && tab === 'SCAN') ||
            monitorScanMutation.isPending
          }
          onRefresh={handleRefresh}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6, color: colors.text }}>
        Absensi Saya
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        {isStudent
          ? 'Scan QR monitor Tata Usaha untuk presensi harian dan pantau riwayat kehadiran bulanan.'
          : 'Scan QR monitor Tata Usaha untuk presensi harian dan pantau riwayat presensi bulanan Anda.'}
      </Text>

      <MobileMenuTabBar
        items={attendanceTabs}
        activeKey={tab}
        onChange={(nextKey) => setTab(nextKey as AttendanceTabKey)}
        layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
        compact={false}
        style={{ marginBottom: 14 }}
      />

      {tab === 'SCAN' ? (
        <>
          <MonitorQrScannerCard
            enabled={monitorScannerEnabled}
            permissionGranted={cameraGranted}
            permissionDenied={cameraDenied}
            onRequestPermission={requestCameraPermission}
            onScanned={handleMonitorQrScanned}
            result={monitorScanResult}
            pending={monitorScanMutation.isPending}
            onResetResult={() => setMonitorScanResult(null)}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 16,
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 10 }}>Status Hari Ini</Text>
            {ownParticipant ? (
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, marginBottom: 10 }}>
                {ownParticipant.name} • {ownParticipant.nip || ownParticipant.username || '-'}
              </Text>
            ) : null}
            <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 10 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#f8fafc' }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 4 }}>Masuk</Text>
                <Text style={{ color: '#15803d', fontWeight: '700', fontSize: scaleFont(17) }}>{todayPresence?.checkInTime || '-'}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, marginTop: 4 }}>
                  Sumber: {getDailyPresenceSourceLabel(todayPresence?.checkInSource)}
                </Text>
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#f8fafc' }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 4 }}>Pulang</Text>
                <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: scaleFont(17) }}>{todayPresence?.checkOutTime || '-'}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, marginTop: 4 }}>
                  Sumber: {getDailyPresenceSourceLabel(todayPresence?.checkOutSource)}
                </Text>
              </View>
            </View>
          </View>

          {isStudent ? (
            <>
              <MobileMenuTabBar
                items={[
                  { key: 'CHECK_IN', label: 'Absen Masuk', iconName: 'log-in' },
                  { key: 'CHECK_OUT', label: 'Absen Pulang', iconName: 'log-out' },
                ]}
                activeKey={checkpoint}
                onChange={(nextKey) => setCheckpoint(nextKey as Checkpoint)}
                layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
                compact={false}
                style={{ marginBottom: 14 }}
              />

              {activeSessionQuery.isLoading ? (
                <QueryStateView type="loading" message="Memeriksa sesi scan petugas..." />
              ) : activeSessionQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memeriksa sesi scan petugas."
                  onRetry={() => activeSessionQuery.refetch()}
                />
              ) : activeSessionQuery.data ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#c7d7f7',
                borderRadius: 16,
                backgroundColor: '#fff',
                padding: 14,
                marginBottom: 14,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
                Cadangan: QR Siswa untuk Petugas
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
                {activeSessionQuery.data.gateLabel
                  ? `Checkpoint ${activeSessionQuery.data.gateLabel}.`
                  : 'Checkpoint petugas aktif.'}{' '}
                Sesi berakhir {new Date(activeSessionQuery.data.sessionExpiresAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                .
              </Text>

              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 6 }}>
                Jika kamera siswa bermasalah, masukkan challenge 6 digit agar petugas bisa memindai QR dari HP siswa.
              </Text>
              <TextInput
                value={challengeCode}
                onChangeText={(value) => {
                  setCurrentPass(null);
                  setChallengeCode(value.replace(/\D+/g, '').slice(0, 6));
                }}
                keyboardType="number-pad"
                placeholder="Contoh: 123456"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: '#fff',
                  marginBottom: 10,
                  color: colors.text,
                  fontWeight: '700',
                  letterSpacing: 4,
                  fontSize: scaleFont(18),
                }}
              />

              <Pressable
                onPress={() => createPassMutation.mutate()}
                disabled={!canCreatePass}
                style={{
                  backgroundColor: canCreatePass ? colors.primary : '#93c5fd',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  marginBottom: currentPass ? 12 : 0,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.label }}>
                  {createPassMutation.isPending ? 'Membuat QR...' : `Buat QR ${getDailyPresenceCheckpointLabel(checkpoint)}`}
                </Text>
              </Pressable>

              {currentPass ? <ProtectedQrCard pass={currentPass} /> : null}
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 16,
                padding: 16,
                backgroundColor: '#fff',
                marginBottom: 14,
              }}
            >
              <Text style={{ fontWeight: '700', marginBottom: 4, color: colors.text }}>
                Petugas belum membuka sesi scan
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                Minta petugas administrasi membuka sesi {getDailyPresenceCheckpointLabel(checkpoint).toLowerCase()} di perangkat mereka, lalu tarik ulang halaman ini.
              </Text>
            </View>
              )}
            </>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbeafe',
                borderRadius: 16,
                padding: 14,
                backgroundColor: '#eff6ff',
                marginBottom: 14,
              }}
            >
              <Text style={{ fontWeight: '700', marginBottom: 4, color: colors.text }}>
                Gunakan QR monitor Tata Usaha
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                Sistem otomatis membaca mode masuk atau pulang dari QR yang sedang aktif di monitor. QR cadangan dari HP siswa tidak diperlukan untuk akun ini.
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
            <Pressable
              onPress={() => moveMonth(-1)}
              style={{
                flex: 1,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.label }}>Bulan Sebelumnya</Text>
            </Pressable>
            <Pressable
              onPress={() => moveMonth(1)}
              style={{
                flex: 1,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.label }}>Bulan Berikutnya</Text>
            </Pressable>
          </View>

          <Text style={{ fontWeight: '600', color: colors.text, marginBottom: 10 }}>
            {cursorDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </Text>

          {isStudent ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
                {[
                  { label: 'Hadir', value: stats.present },
                  { label: 'Sakit', value: stats.sick },
                  { label: 'Izin', value: stats.permission },
                  { label: 'Alpha', value: stats.absent },
                  { label: 'Telat', value: stats.late },
                ].map((item) => (
                  <View key={item.label} style={{ width: summaryCardWidth, paddingHorizontal: 4, marginBottom: 8 }}>
                    <View
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 12,
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), color: colors.textMuted, marginBottom: 2 }}>
                        {item.label}
                      </Text>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {attendanceQuery.isLoading ? <QueryStateView type="loading" message="Mengambil riwayat absensi..." /> : null}
              {attendanceQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat riwayat absensi."
                  onRetry={() => attendanceQuery.refetch()}
                />
              ) : null}

              {attendanceQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={attendanceQuery.data.cachedAt} /> : null}

              {!attendanceQuery.isLoading && !attendanceQuery.isError ? (
                records.length > 0 ? (
                  <View>
                    {records.map((item) => (
                      <AttendanceCard key={item.id} item={item} />
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
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: colors.text }}>Belum ada data absensi</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                      Tidak ditemukan riwayat kehadiran untuk periode ini.
                    </Text>
                  </View>
                )
              ) : null}
            </>
          ) : (
            <>
              {ownHistoryQuery.isLoading ? <QueryStateView type="loading" message="Mengambil riwayat presensi..." /> : null}
              {ownHistoryQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat riwayat presensi."
                  onRetry={() => ownHistoryQuery.refetch()}
                />
              ) : null}

              {!ownHistoryQuery.isLoading && !ownHistoryQuery.isError ? (
                ownHistoryRecords.length > 0 ? (
                  <View>
                    {ownHistoryRecords.map((item) => (
                      <OwnDailyPresenceHistoryCard key={item.id} item={item} />
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
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: colors.text }}>Belum ada riwayat presensi</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                      Tidak ditemukan riwayat presensi untuk periode ini.
                    </Text>
                  </View>
                )
              ) : null}
            </>
          )}
        </>
      )}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: colors.primary,
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: fontSizes.label }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
