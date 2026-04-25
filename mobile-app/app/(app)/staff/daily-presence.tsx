import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import MobileSelectField from '../../../src/components/MobileSelectField';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSummaryCard as SummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { attendanceApi } from '../../../src/features/attendance/attendanceApi';
import type {
  DailyPresenceEventItem,
  DailyPresenceEventType,
  DailyPresenceOperationalParticipant,
  DailyPresenceOperationalStudent,
  DailyPresencePolicy,
  DailyPresencePolicyDayKey,
  DailyPresenceSelfScanManagerSession,
  DailyPresenceSelfScanPreview,
  DailyPresenceUserState,
} from '../../../src/features/attendance/types';
import {
  buildDailyPresenceChallengeCode,
  formatCountdownLabel,
  getDailyPresenceChallengeWindowEndsAt,
  getDailyPresenceChallengeWindowIndex,
  getDailyPresenceCheckpointLabel,
} from '../../../src/features/attendance/selfScanUtils';
import { resolveStaffDivision } from '../../../src/features/staff/staffRole';
import { resolvePublicAssetUrl } from '../../../src/lib/media/resolvePublicAssetUrl';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import {
  buildResponsivePageContentStyle,
  useResponsiveLayout,
} from '../../../src/lib/ui/useResponsiveLayout';
import { useAppTheme } from '../../../src/theme/AppThemeProvider';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type StaffTabKey = 'SCAN' | 'MONITOR' | 'ASSISTED' | 'HISTORY' | 'CONFIG';
type AssistedTargetKey = 'STUDENT' | 'PARTICIPANT';

const DAY_LABELS: Record<DailyPresencePolicyDayKey, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
};

const DAY_KEYS = Object.keys(DAY_LABELS) as DailyPresencePolicyDayKey[];

type PresenceModalState = {
  checkpoint: DailyPresenceEventType;
  target: AssistedTargetKey;
} | null;

type ScannedPassState = {
  qrToken: string;
  preview: DailyPresenceSelfScanPreview;
} | null;

function getCheckpointCopy(checkpoint: DailyPresenceEventType) {
  return checkpoint === 'CHECK_IN'
    ? {
        title: 'Bantu Absen Masuk',
        submit: 'Simpan Absen Masuk',
        placeholder: 'Contoh: HP rusak, kamera bermasalah, atau kendala teknis lain.',
      }
    : {
        title: 'Bantu Absen Pulang',
        submit: 'Simpan Absen Pulang',
        placeholder: 'Contoh: baterai habis, HP tertinggal, atau validasi petugas pulang.',
      };
}

function getSourceLabel(value?: string | null) {
  if (value === 'ASSISTED_SCAN') return 'Dibantu Petugas';
  if (value === 'SELF_SCAN') return 'Scan Mandiri';
  if (value === 'MANUAL_ADJUSTMENT') return 'Koreksi Manual';
  if (value === 'LEGACY_DAILY') return 'Manual Lama';
  return '-';
}

function getEventTypeLabel(value: DailyPresenceEventType) {
  return value === 'CHECK_IN' ? 'Masuk' : 'Pulang';
}

function getParticipantRoleLabel(role?: string | null) {
  if (role === 'TEACHER') return 'Guru';
  if (role === 'STAFF') return 'Staff';
  if (role === 'PRINCIPAL') return 'Kepala Sekolah';
  if (role === 'EXTRACURRICULAR_TUTOR') return 'Pembina Ekskul';
  return '-';
}

function getEventPersonName(event: DailyPresenceEventItem) {
  return event.student?.name || event.participant?.name || '-';
}

function getEventSecondaryLabel(event: DailyPresenceEventItem) {
  if (event.student) {
    const idLabel = event.student.nisn || event.student.nis || '-';
    return `${event.class?.name || '-'} • ${idLabel}`;
  }
  if (event.participant) {
    const idLabel = event.participant.nip || event.participant.username || '-';
    const roleLabel = getParticipantRoleLabel(event.participant.role);
    const ptkType = event.participant.ptkType ? ` • ${event.participant.ptkType}` : '';
    return `${roleLabel} • ${idLabel}${ptkType}`;
  }
  return '-';
}

function formatTodayLabel(dateKey?: string | null) {
  const date = dateKey ? new Date(dateKey) : new Date();
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function InitialAvatar({
  name,
  photo,
  fallbackColor = '#1d4ed8',
}: {
  name: string;
  photo?: string | null;
  fallbackColor?: string;
}) {
  const { scaleFont } = useAppTextScale();
  const photoUrl = resolvePublicAssetUrl(photo);

  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 999,
        backgroundColor: '#dbeafe',
        borderWidth: 1,
        borderColor: '#bfdbfe',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Text style={{ color: fallbackColor, fontWeight: '700', fontSize: scaleFont(20) }}>
          {String(name || '?').slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function SelfScanSessionCard({
  checkpoint,
  session,
  pending,
  gateDraft,
  onGateDraftChange,
  onStart,
  onClose,
}: {
  checkpoint: DailyPresenceEventType;
  session: DailyPresenceSelfScanManagerSession | null;
  pending: boolean;
  gateDraft: string;
  onGateDraftChange: (value: string) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const [ticker, setTicker] = useState(Date.now());

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setTicker(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  const liveChallengeCode = useMemo(() => {
    if (!session) return '';
    return buildDailyPresenceChallengeCode(
      session.challengeSecret,
      getDailyPresenceChallengeWindowIndex(new Date(ticker), session.challengeWindowSeconds),
    );
  }, [session, ticker]);

  const liveChallengeEndsAt = useMemo(() => {
    if (!session) return null;
    return getDailyPresenceChallengeWindowEndsAt(new Date(ticker), session.challengeWindowSeconds).toISOString();
  }, [session, ticker]);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
        Sesi {getDailyPresenceCheckpointLabel(checkpoint)}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
        Buka satu sesi aktif per checkpoint. Challenge berubah otomatis setiap {session?.challengeWindowSeconds || 30} detik.
      </Text>

      {!session ? (
        <>
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Titik / Gate</Text>
            <TextInput
              value={gateDraft}
              onChangeText={onGateDraftChange}
              placeholder="Contoh: Gerbang Utama / Pos Satpam"
              placeholderTextColor={colors.textSoft}
              style={{
                borderWidth: 1,
                borderColor: colors.borderSoft,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 11,
                color: colors.text,
                backgroundColor: colors.surface,
              }}
            />
          </View>
          <Pressable
            onPress={onStart}
            disabled={pending}
            style={{
              marginTop: 14,
              backgroundColor: pending ? '#93c5fd' : '#2563eb',
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {pending ? 'Membuka sesi...' : `Buka Sesi ${getDailyPresenceCheckpointLabel(checkpoint)}`}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <View
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: fontSizes.caption, fontWeight: '700', marginBottom: 6 }}>
              Challenge Aktif
            </Text>
            <Text
              style={{
                color: '#0f172a',
                fontSize: scaleFont(28),
                lineHeight: scaleLineHeight(34),
                fontWeight: '800',
                letterSpacing: 6,
                marginBottom: 8,
              }}
            >
              {liveChallengeCode}
            </Text>
            <Text style={{ color: '#1d4ed8', fontSize: fontSizes.bodyCompact }}>
              Berlaku {formatCountdownLabel(liveChallengeEndsAt)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, marginTop: 8 }}>
              {session.gateLabel ? `Checkpoint ${session.gateLabel}. ` : 'Checkpoint aktif. '}
              Sesi berakhir {new Date(session.sessionExpiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.
            </Text>
          </View>

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderRadius: 12,
              backgroundColor: colors.surfaceMuted,
              padding: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>
              Petugas Pembuka
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, marginTop: 4 }}>
              {session.actor.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
              Gate: {session.gateLabel || '-'}
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            disabled={pending}
            style={{
              marginTop: 14,
              backgroundColor: pending ? '#fca5a5' : '#dc2626',
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {pending ? 'Menutup sesi...' : `Tutup Sesi ${getDailyPresenceCheckpointLabel(checkpoint)}`}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function SharedQrMonitorPanel({
  checkpoint,
  session,
  loading,
  onRefresh,
}: {
  checkpoint: DailyPresenceEventType;
  session: DailyPresenceSelfScanManagerSession | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const [ticker, setTicker] = useState(Date.now());

  useEffect(() => {
    if (!session?.monitor) return;
    const timer = setInterval(() => setTicker(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.monitor?.generatedAt, session?.monitor?.qrExpiresAt]);

  const liveChallengeCode = useMemo(() => {
    if (!session) return '';
    return buildDailyPresenceChallengeCode(
      session.challengeSecret,
      getDailyPresenceChallengeWindowIndex(new Date(ticker), session.challengeWindowSeconds),
    );
  }, [session, ticker]);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
            Monitor QR Bersama
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
            Tampilkan QR ini di monitor atau TV. QR diperbarui otomatis sesuai konfigurasi presensi aktif.
          </Text>
        </View>
        <Pressable
          onPress={onRefresh}
          style={{
            borderWidth: 1,
            borderColor: colors.borderSoft,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>{loading ? 'Memuat...' : 'Muat Ulang'}</Text>
        </Pressable>
      </View>

      {!session ? (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: colors.borderSoft,
            borderStyle: 'dashed',
            borderRadius: 14,
            padding: 14,
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
            Belum ada sesi aktif untuk monitor QR {getDailyPresenceCheckpointLabel(checkpoint).toLowerCase()}. Buka sesi lebih dulu.
          </Text>
        </View>
      ) : !session.monitor ? (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: '#fed7aa',
            backgroundColor: '#fff7ed',
            borderRadius: 14,
            padding: 14,
          }}
        >
          <Text style={{ color: '#c2410c', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
            QR monitor belum siap dimuat. Gunakan tombol muat ulang untuk mengambil QR terbaru.
          </Text>
        </View>
      ) : (
        <>
          <View
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderRadius: 20,
              backgroundColor: colors.surfaceMuted,
              padding: 12,
            }}
          >
            <View
              style={{
                aspectRatio: 1,
                borderRadius: 16,
                backgroundColor: '#ffffff',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 10,
              }}
            >
              <Image
                source={{ uri: session.monitor.qrCodeDataUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
            <Text
              style={{
                color: colors.text,
                fontWeight: '700',
                textAlign: 'center',
                marginTop: 10,
              }}
            >
              QR aktif {formatCountdownLabel(session.monitor.qrExpiresAt)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'center', marginTop: 4 }}>
              Refresh tiap {session.monitor.refreshSeconds} detik.
            </Text>
          </View>

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: fontSizes.caption, fontWeight: '700', marginBottom: 6 }}>
              Checkpoint Aktif
            </Text>
            <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: scaleFont(22), lineHeight: scaleLineHeight(28) }}>
              Absen {getDailyPresenceCheckpointLabel(checkpoint)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, marginTop: 8 }}>
              {session.gateLabel ? `Gate ${session.gateLabel}. ` : 'Gate belum diisi. '}
              Sesi berakhir {new Date(session.sessionExpiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.
            </Text>
          </View>

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderRadius: 14,
              backgroundColor: colors.surfaceMuted,
              padding: 14,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>
              Kode Challenge Saat Ini
            </Text>
            <Text
              style={{
                color: colors.text,
                fontWeight: '800',
                fontSize: scaleFont(26),
                lineHeight: scaleLineHeight(32),
                letterSpacing: 5,
                marginTop: 8,
              }}
            >
              {liveChallengeCode}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact, marginTop: 6 }}>
              Kode berganti otomatis {formatCountdownLabel(session.challengeWindowExpiresAt)}.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function ScannerPanel({
  enabled,
  permissionGranted,
  permissionDenied,
  onRequestPermission,
  onScanned,
  previewState,
  previewLoading,
}: {
  enabled: boolean;
  permissionGranted: boolean;
  permissionDenied: boolean;
  onRequestPermission: () => void;
  onScanned: (result: BarcodeScanningResult) => void;
  previewState: ScannedPassState;
  previewLoading: boolean;
}) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 14,
        overflow: 'hidden',
      }}
    >
      <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
        Scanner Petugas
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4, marginBottom: 12 }}>
        Scan QR siswa, cek identitas, lalu konfirmasi dari layar ini. Kamera hanya aktif saat tab scan dibuka.
      </Text>

      {!permissionGranted ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.borderSoft,
            borderStyle: 'dashed',
            borderRadius: 14,
            padding: 16,
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
            Izin kamera belum aktif
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
            {permissionDenied
              ? 'Aktifkan izin kamera agar petugas bisa memindai QR siswa.'
              : 'Berikan izin kamera untuk mulai memindai QR siswa.'}
          </Text>
          <Pressable
            onPress={onRequestPermission}
            style={{
              backgroundColor: '#2563eb',
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
            height: 320,
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: '#0f172a',
            position: 'relative',
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={enabled ? onScanned : undefined}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 220,
                height: 220,
                borderRadius: 24,
                borderWidth: 3,
                borderColor: '#f8fafc',
                backgroundColor: 'transparent',
              }}
            />
            <Text style={{ marginTop: 16, color: '#f8fafc', fontWeight: '700', fontSize: fontSizes.body }}>
              Arahkan QR siswa ke area ini
            </Text>
            <Text style={{ marginTop: 6, color: '#cbd5e1', fontSize: fontSizes.bodyCompact }}>
              {previewLoading
                ? 'Memverifikasi QR...'
                : previewState
                  ? 'Hasil scan siap dikonfirmasi.'
                  : 'QR hanya berlaku singkat dan satu kali pakai.'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function StaffDailyPresenceScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const pagePadding = getStandardPagePadding(insets, {
    horizontal: layout.pageHorizontal,
    bottom: 120,
  });
  const pageContentStyle = buildResponsivePageContentStyle(pagePadding, layout);
  const [tab, setTab] = useState<StaffTabKey>('SCAN');
  const [assistedTarget, setAssistedTarget] = useState<AssistedTargetKey>('STUDENT');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [modalState, setModalState] = useState<PresenceModalState>(null);
  const [reason, setReason] = useState('');
  const [gateLabel, setGateLabel] = useState('');
  const [scanCheckpoint, setScanCheckpoint] = useState<DailyPresenceEventType>('CHECK_IN');
  const [sessionGateDraft, setSessionGateDraft] = useState('');
  const [scannedPass, setScannedPass] = useState<ScannedPassState>(null);
  const [pendingScannedToken, setPendingScannedToken] = useState('');
  const [policyDraft, setPolicyDraft] = useState<DailyPresencePolicy | null>(null);
  const [selectedPolicyDay, setSelectedPolicyDay] = useState<DailyPresencePolicyDayKey>('MONDAY');

  const canAccess = resolveStaffDivision(user) === 'ADMINISTRATION';
  const cameraGranted = Boolean(cameraPermission?.granted);
  const cameraDenied = cameraPermission?.status === 'denied';
  const deferredStudentSearch = useDeferredValue(studentSearch.trim());
  const deferredParticipantSearch = useDeferredValue(participantSearch.trim());

  const overviewQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-overview'],
    enabled: isAuthenticated && canAccess,
    queryFn: () => attendanceApi.getDailyPresenceOverview({ limit: 20 }),
    staleTime: 60 * 1000,
  });

  const policyQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-policy'],
    enabled: isAuthenticated && canAccess,
    queryFn: () => attendanceApi.getDailyPresencePolicy(),
    staleTime: 60 * 1000,
  });

  const managerSessionQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-self-scan-session', scanCheckpoint],
    enabled: isAuthenticated && canAccess && (tab === 'SCAN' || tab === 'MONITOR'),
    queryFn: () => attendanceApi.getActiveManagerSelfScanSession({ checkpoint: scanCheckpoint }),
    staleTime: 20 * 1000,
    refetchInterval: (query) => {
      if (!(isAuthenticated && canAccess && tab === 'MONITOR')) return false;
      const session = query.state.data as DailyPresenceSelfScanManagerSession | null | undefined;
      const refreshSeconds = session?.monitor?.refreshSeconds;
      if (!refreshSeconds) return 15000;
      return Math.max(5000, Math.min(15000, Math.floor((refreshSeconds * 1000) / 2)));
    },
    refetchIntervalInBackground: true,
  });

  const studentsQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-students', deferredStudentSearch],
    enabled: isAuthenticated && canAccess && tab === 'ASSISTED' && assistedTarget === 'STUDENT',
    queryFn: () =>
      attendanceApi.getDailyPresenceStudents({
        query: deferredStudentSearch || undefined,
        limit: 100,
      }),
    staleTime: 60 * 1000,
  });

  const selectedStudentQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-student', selectedStudentId],
    enabled: isAuthenticated && canAccess && tab === 'ASSISTED' && assistedTarget === 'STUDENT' && Boolean(selectedStudentId),
    queryFn: () => attendanceApi.getStudentDailyPresence({ studentId: Number(selectedStudentId) }),
    staleTime: 30 * 1000,
  });

  const participantsQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-participants', deferredParticipantSearch],
    enabled: isAuthenticated && canAccess && tab === 'ASSISTED' && assistedTarget === 'PARTICIPANT',
    queryFn: () =>
      attendanceApi.getDailyPresenceParticipants({
        query: deferredParticipantSearch || undefined,
        limit: 100,
      }),
    staleTime: 60 * 1000,
  });

  const selectedParticipantQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-participant', selectedParticipantId],
    enabled:
      isAuthenticated &&
      canAccess &&
      tab === 'ASSISTED' &&
      assistedTarget === 'PARTICIPANT' &&
      Boolean(selectedParticipantId),
    queryFn: () => attendanceApi.getParticipantDailyPresence({ userId: Number(selectedParticipantId) }),
    staleTime: 30 * 1000,
  });

  const startSessionMutation = useMutation({
    mutationFn: () =>
      attendanceApi.startSelfScanSession({
        checkpoint: scanCheckpoint,
        gateLabel: sessionGateDraft.trim() || null,
      }),
    onSuccess: (session) => {
      notifySuccess(`Sesi ${getDailyPresenceCheckpointLabel(scanCheckpoint)} berhasil dibuka.`);
      setSessionGateDraft(session?.gateLabel || '');
      setScannedPass(null);
      setPendingScannedToken('');
      void managerSessionQuery.refetch();
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal membuka sesi scan mandiri.');
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: () => attendanceApi.closeSelfScanSession({ checkpoint: scanCheckpoint }),
    onSuccess: () => {
      notifySuccess(`Sesi ${getDailyPresenceCheckpointLabel(scanCheckpoint)} berhasil ditutup.`);
      setScannedPass(null);
      setPendingScannedToken('');
      void managerSessionQuery.refetch();
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menutup sesi scan mandiri.');
    },
  });

  const previewMutation = useMutation({
    mutationFn: (payload: { qrToken: string }) => attendanceApi.previewSelfScanPass(payload),
    onSuccess: (result, variables) => {
      setScannedPass({
        qrToken: variables.qrToken,
        preview: result,
      });
      setPendingScannedToken('');
    },
    onError: (error) => {
      setPendingScannedToken('');
      notifyApiError(error, 'QR siswa tidak valid atau sesi scan sudah berakhir.');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: { qrToken: string }) => attendanceApi.confirmSelfScanPass(payload),
    onSuccess: async () => {
      notifySuccess('Presensi siswa berhasil diverifikasi melalui scan mandiri.');
      setScannedPass(null);
      setPendingScannedToken('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-student'] }),
      ]);
    },
    onError: (error) => {
      notifyApiError(error, 'Konfirmasi scan mandiri gagal diproses.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      studentId: number;
      checkpoint: DailyPresenceEventType;
      reason: string;
      gateLabel?: string | null;
    }) => attendanceApi.saveAssistedDailyPresence(payload),
    onSuccess: (_, variables) => {
      notifySuccess(
        variables.checkpoint === 'CHECK_IN'
          ? 'Absen masuk berhasil dibantu petugas.'
          : 'Absen pulang berhasil dibantu petugas.',
      );
      setModalState(null);
      setReason('');
      setGateLabel('');
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-student', selectedStudentId] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan presensi harian.');
    },
  });

  const saveParticipantMutation = useMutation({
    mutationFn: (payload: {
      userId: number;
      checkpoint: DailyPresenceEventType;
      reason: string;
      gateLabel?: string | null;
    }) => attendanceApi.saveAssistedUserDailyPresence(payload),
    onSuccess: (_, variables) => {
      notifySuccess(
        variables.checkpoint === 'CHECK_IN'
          ? 'Absen masuk peserta non-siswa berhasil dibantu petugas.'
          : 'Absen pulang peserta non-siswa berhasil dibantu petugas.',
      );
      setModalState(null);
      setReason('');
      setGateLabel('');
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-participant', selectedParticipantId] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan presensi peserta non-siswa.');
    },
  });

  const savePolicyMutation = useMutation({
    mutationFn: (policy: DailyPresencePolicy) => attendanceApi.saveDailyPresencePolicy(policy),
    onSuccess: (result) => {
      notifySuccess('Konfigurasi jam presensi berhasil disimpan.');
      setPolicyDraft(result.policy);
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-policy'] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan konfigurasi jam presensi.');
    },
  });

  const selectedStudentOption = useMemo<DailyPresenceOperationalStudent | null>(() => {
    if (!selectedStudentId || !selectedStudentQuery.data?.student) return null;
    const student = selectedStudentQuery.data.student;
    return {
      id: student.id,
      username: '',
      name: student.name,
      nis: student.nis,
      nisn: student.nisn,
      photo: student.photo,
      studentClass: student.class
        ? {
            id: student.class.id,
            name: student.class.name,
          }
        : null,
    };
  }, [selectedStudentId, selectedStudentQuery.data?.student]);

  const studentOptions = useMemo(() => {
    const options = new Map<string, DailyPresenceOperationalStudent>();
    if (selectedStudentOption?.studentClass) {
      options.set(String(selectedStudentOption.id), selectedStudentOption);
    }
    for (const student of studentsQuery.data || []) {
      if (!student.studentClass) continue;
      options.set(String(student.id), student);
    }
    return Array.from(options.values());
  }, [selectedStudentOption, studentsQuery.data]);

  const selectedStudent = useMemo(
    () => studentOptions.find((item) => String(item.id) === String(selectedStudentId)) || selectedStudentOption || null,
    [selectedStudentId, selectedStudentOption, studentOptions],
  );

  const selectedParticipantOption = useMemo<DailyPresenceOperationalParticipant | null>(() => {
    const selected = participantsQuery.data?.find((item) => String(item.id) === String(selectedParticipantId)) || null;
    if (selected) return selected;
    const participant = (selectedParticipantQuery.data as DailyPresenceUserState | undefined)?.participant;
    if (!participant) return null;
    return {
      id: participant.id,
      username: participant.username || null,
      name: participant.name,
      photo: participant.photo || null,
      nip: participant.nip || null,
      role: participant.role,
      ptkType: participant.ptkType || null,
      additionalDuties: participant.additionalDuties || [],
    };
  }, [participantsQuery.data, selectedParticipantId, selectedParticipantQuery.data]);

  const participantOptions = useMemo(() => {
    const options = new Map<string, DailyPresenceOperationalParticipant>();
    if (selectedParticipantOption) {
      options.set(String(selectedParticipantOption.id), selectedParticipantOption);
    }
    for (const participant of participantsQuery.data || []) {
      options.set(String(participant.id), participant);
    }
    return Array.from(options.values());
  }, [participantsQuery.data, selectedParticipantOption]);

  const selectedParticipant = useMemo(
    () =>
      participantOptions.find((item) => String(item.id) === String(selectedParticipantId)) ||
      selectedParticipantOption ||
      null,
    [participantOptions, selectedParticipantId, selectedParticipantOption],
  );

  const modalCopy = modalState ? getCheckpointCopy(modalState.checkpoint) : null;
  const modalBusy = saveMutation.isPending || saveParticipantMutation.isPending;
  const modalParticipantLabel =
    modalState?.target === 'PARTICIPANT'
      ? `${selectedParticipant?.name || '-'} • ${getParticipantRoleLabel(selectedParticipant?.role)}`
      : `${selectedStudent?.name || '-'} • ${selectedStudent?.studentClass?.name || '-'}`;
  const canSubmitModal =
    reason.trim().length >= 3 &&
    (modalState?.target === 'PARTICIPANT'
      ? Boolean(selectedParticipantId) && !saveParticipantMutation.isPending
      : Boolean(selectedStudentId) && !saveMutation.isPending);
  const summaryCardWidth = `${100 / layout.summaryColumns}%` as `${number}%`;
  const recentEvents = overviewQuery.data?.recentEvents || [];
  const activeManagerSession = managerSessionQuery.data || null;
  const scanBusy =
    startSessionMutation.isPending ||
    closeSessionMutation.isPending ||
    previewMutation.isPending ||
    confirmMutation.isPending;
  const scannerEnabled =
    tab === 'SCAN' &&
    cameraGranted &&
    Boolean(activeManagerSession) &&
    !scanBusy &&
    !scannedPass &&
    !pendingScannedToken;

  useEffect(() => {
    setScannedPass(null);
    setPendingScannedToken('');
  }, [scanCheckpoint]);

  useEffect(() => {
    if (tab !== 'SCAN') {
      setPendingScannedToken('');
    }
  }, [tab]);

  useEffect(() => {
    if (!policyQuery.data?.policy) return;
    setPolicyDraft(policyQuery.data.policy);
  }, [policyQuery.data?.policy]);

  useEffect(() => {
    setReason('');
    setGateLabel('');
    setModalState(null);
  }, [assistedTarget]);

  const updatePolicyDay = (
    day: DailyPresencePolicyDayKey,
    updater: (current: DailyPresencePolicy['days'][DailyPresencePolicyDayKey]) => DailyPresencePolicy['days'][DailyPresencePolicyDayKey],
  ) => {
    setPolicyDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        days: {
          ...current.days,
          [day]: updater(current.days[day]),
        },
      };
    });
  };

  const handleRefresh = () => {
    void overviewQuery.refetch();
    if (tab === 'CONFIG') {
      void policyQuery.refetch();
    }
    if (tab === 'SCAN' || tab === 'MONITOR') {
      void managerSessionQuery.refetch();
    }
    if (tab === 'ASSISTED') {
      if (assistedTarget === 'STUDENT') {
        void studentsQuery.refetch();
        if (selectedStudentId) {
          void selectedStudentQuery.refetch();
        }
      } else {
        void participantsQuery.refetch();
        if (selectedParticipantId) {
          void selectedParticipantQuery.refetch();
        }
      }
    }
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    const qrToken = String(result?.data || '').trim();
    if (!qrToken || qrToken === pendingScannedToken || qrToken === scannedPass?.qrToken) return;
    setPendingScannedToken(qrToken);
    previewMutation.mutate({ qrToken });
  };

  if (isLoading) {
    return <AppLoadingScreen message="Memuat presensi harian..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (!canAccess) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentStyle}>
        <Text style={{ fontSize: scaleFont(22), lineHeight: scaleLineHeight(30), fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          Presensi Harian
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk staff administrasi." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentStyle}
        refreshControl={
          <RefreshControl
            refreshing={
              overviewQuery.isFetching ||
              policyQuery.isFetching ||
              managerSessionQuery.isFetching ||
              studentsQuery.isFetching ||
              selectedStudentQuery.isFetching ||
              participantsQuery.isFetching ||
              selectedParticipantQuery.isFetching
            }
            onRefresh={handleRefresh}
          />
        }
      >
        <Text style={{ fontSize: scaleFont(22), lineHeight: scaleLineHeight(30), fontWeight: '700', color: colors.text, marginBottom: 6 }}>
          Presensi Harian
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
          Monitor QR bersama, verifikasi scan mandiri, bantuan petugas, dan audit harian dalam satu alur.
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#eff6ff',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
            Tablet boleh landscape agar petugas bisa memantau sesi, kamera, dan hasil verifikasi lebih lega. HP tetap mengikuti portrait.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          {[
            {
              title: 'Tanggal Operasional',
              value: formatTodayLabel(overviewQuery.data?.date),
              subtitle: 'Hari operasional presensi.',
              iconName: 'calendar',
              accentColor: '#334155',
            },
            {
              title: 'Sudah Masuk',
              value: String(overviewQuery.data?.summary.checkInCount || 0),
              subtitle: `Siswa ${overviewQuery.data?.summary.studentCheckInCount || 0} • Non-siswa ${overviewQuery.data?.summary.userCheckInCount || 0}`,
              iconName: 'log-in',
              accentColor: '#15803d',
            },
            {
              title: 'Sudah Pulang',
              value: String(overviewQuery.data?.summary.checkOutCount || 0),
              subtitle: `Siswa ${overviewQuery.data?.summary.studentCheckOutCount || 0} • Non-siswa ${overviewQuery.data?.summary.userCheckOutCount || 0}`,
              iconName: 'log-out',
              accentColor: '#0369a1',
            },
            {
              title: 'Bantuan Petugas',
              value: String(overviewQuery.data?.summary.assistedEventCount || 0),
              subtitle: `Pending pulang: siswa ${overviewQuery.data?.summary.studentOpenDayCount || 0} • non-siswa ${overviewQuery.data?.summary.userOpenDayCount || 0}`,
              iconName: 'shield',
              accentColor: '#b45309',
            },
          ].map((item) => (
            <View key={item.title} style={{ width: summaryCardWidth, paddingHorizontal: 4, marginBottom: 8 }}>
              <SummaryCard
                title={item.title}
                value={item.value}
                subtitle={item.subtitle}
                iconName={item.iconName as never}
                accentColor={item.accentColor}
              />
            </View>
          ))}
        </View>

        <MobileMenuTabBar
          items={[
            { key: 'SCAN', label: 'Scan Mandiri', iconName: 'camera' },
            { key: 'MONITOR', label: 'Monitor QR', iconName: 'monitor' },
            { key: 'ASSISTED', label: 'Bantu Petugas', iconName: 'tool' },
            { key: 'HISTORY', label: 'Riwayat', iconName: 'list' },
            { key: 'CONFIG', label: 'Konfigurasi Jam', iconName: 'settings' },
          ]}
          activeKey={tab}
          onChange={(nextKey) => setTab(nextKey as StaffTabKey)}
          layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
          compact={false}
          style={{ marginBottom: 14 }}
        />

        {tab === 'SCAN' || tab === 'MONITOR' ? (
          <>
            <MobileMenuTabBar
              items={[
                { key: 'CHECK_IN', label: 'Absen Masuk', iconName: 'log-in' },
                { key: 'CHECK_OUT', label: 'Absen Pulang', iconName: 'log-out' },
              ]}
              activeKey={scanCheckpoint}
              onChange={(nextKey) => setScanCheckpoint(nextKey as DailyPresenceEventType)}
              layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
              compact={false}
              style={{ marginBottom: 14 }}
            />

            {tab === 'SCAN' ? (
              <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 14, marginBottom: 14 }}>
                <View style={{ flex: layout.prefersSplitPane ? 1.08 : undefined }}>
                  {managerSessionQuery.isLoading ? (
                    <QueryStateView type="loading" message="Memeriksa sesi scan mandiri..." />
                  ) : managerSessionQuery.isError ? (
                    <QueryStateView
                      type="error"
                      message="Sesi scan mandiri tidak berhasil dimuat."
                      onRetry={() => managerSessionQuery.refetch()}
                    />
                  ) : (
                    <>
                      <SelfScanSessionCard
                        checkpoint={scanCheckpoint}
                        session={activeManagerSession}
                        pending={startSessionMutation.isPending || closeSessionMutation.isPending}
                        gateDraft={sessionGateDraft}
                        onGateDraftChange={setSessionGateDraft}
                        onStart={() => startSessionMutation.mutate()}
                        onClose={() => closeSessionMutation.mutate()}
                      />
                      <ScannerPanel
                        enabled={scannerEnabled}
                        permissionGranted={cameraGranted}
                        permissionDenied={cameraDenied}
                        onRequestPermission={() => {
                          void requestCameraPermission();
                        }}
                        onScanned={handleBarcodeScanned}
                        previewState={scannedPass}
                        previewLoading={previewMutation.isPending}
                      />
                    </>
                  )}
                </View>

                <View style={{ flex: layout.prefersSplitPane ? 0.92 : undefined }}>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 16,
                      padding: 14,
                      marginBottom: 14,
                    }}
                  >
                    <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
                      Verifikasi Hasil Scan
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4, marginBottom: 12 }}>
                      Cocokkan nama, kelas, dan foto siswa sebelum konfirmasi.
                    </Text>

                    {!scannedPass ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.borderSoft,
                          borderStyle: 'dashed',
                          borderRadius: 14,
                          padding: 14,
                          backgroundColor: colors.surfaceMuted,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                          Belum ada QR yang dipindai. Setelah scan berhasil, identitas siswa akan muncul di panel ini.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            backgroundColor: '#eff6ff',
                            borderRadius: 14,
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <InitialAvatar
                            name={scannedPass.preview.student.name}
                            photo={scannedPass.preview.student.photo}
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 2 }}>
                              {scannedPass.preview.student.name}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: fontSizes.bodyCompact }}>
                              {scannedPass.preview.student.class.name} • {scannedPass.preview.student.nis || scannedPass.preview.student.nisn || '-'}
                            </Text>
                            <Text style={{ color: '#1d4ed8', fontSize: fontSizes.caption, marginTop: 3 }}>
                              {getDailyPresenceCheckpointLabel(scannedPass.preview.checkpoint)}
                              {scannedPass.preview.gateLabel ? ` • ${scannedPass.preview.gateLabel}` : ''}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: scannedPass.preview.alreadyRecorded ? '#fecaca' : '#bbf7d0',
                            backgroundColor: scannedPass.preview.alreadyRecorded ? '#fef2f2' : '#f0fdf4',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <Text
                            style={{
                              color: scannedPass.preview.alreadyRecorded ? '#b91c1c' : '#15803d',
                              fontWeight: '700',
                              marginBottom: 4,
                            }}
                          >
                            {scannedPass.preview.alreadyRecorded
                              ? `${getDailyPresenceCheckpointLabel(scannedPass.preview.checkpoint)} sudah pernah tercatat`
                              : 'QR siap dikonfirmasi'}
                          </Text>
                          <Text
                            style={{
                              color: scannedPass.preview.alreadyRecorded ? '#991b1b' : '#166534',
                              fontSize: fontSizes.body,
                              lineHeight: scaleLineHeight(20),
                            }}
                          >
                            {scannedPass.preview.alreadyRecorded
                              ? 'Minta siswa membuat QR baru hanya jika memang status sebelumnya belum sesuai.'
                              : 'Tekan konfirmasi hanya jika identitas siswa yang muncul sudah benar.'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => {
                              setScannedPass(null);
                              setPendingScannedToken('');
                            }}
                            style={{
                              flex: 1,
                              paddingVertical: 12,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: colors.borderSoft,
                              backgroundColor: colors.surface,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: colors.text, fontWeight: '700' }}>Reset Hasil Scan</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => confirmMutation.mutate({ qrToken: scannedPass.qrToken })}
                            disabled={confirmMutation.isPending || scannedPass.preview.alreadyRecorded}
                            style={{
                              flex: 1,
                              paddingVertical: 12,
                              borderRadius: 12,
                              backgroundColor:
                                confirmMutation.isPending || scannedPass.preview.alreadyRecorded ? '#93c5fd' : '#2563eb',
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>
                              {confirmMutation.isPending ? 'Mengonfirmasi...' : 'Konfirmasi Scan'}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>

                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
                      Aktivitas Terbaru
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
                      Ringkas untuk petugas agar tetap bisa mengawasi antrean.
                    </Text>
                    {!recentEvents.length ? (
                      <View
                        style={{
                          marginTop: 12,
                          borderWidth: 1,
                          borderColor: colors.borderSoft,
                          borderStyle: 'dashed',
                          borderRadius: 12,
                          padding: 12,
                          backgroundColor: colors.surfaceMuted,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>
                          Belum ada log presensi hari ini.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ marginTop: 12, gap: 10 }}>
                        {recentEvents.slice(0, 5).map((event) => (
                          <View
                            key={event.id}
                            style={{
                              borderWidth: 1,
                              borderColor: colors.borderSoft,
                              borderRadius: 12,
                              padding: 12,
                              backgroundColor: colors.surface,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: colors.text, fontWeight: '700', flex: 1, paddingRight: 10 }}>
                                {getEventPersonName(event)}
                              </Text>
                              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
                                {event.recordedTime || '-'}
                              </Text>
                            </View>
                            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
                              {getEventSecondaryLabel(event)} • {getEventTypeLabel(event.eventType)} • {getSourceLabel(event.source)}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
                              {event.reason || 'Belum ada alasan tambahan.'}
                              {event.lateMinutes && event.lateMinutes > 0 ? ` • Telat ${event.lateMinutes} menit` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : managerSessionQuery.isLoading ? (
              <QueryStateView type="loading" message="Memeriksa sesi monitor QR..." />
            ) : managerSessionQuery.isError ? (
              <QueryStateView
                type="error"
                message="Monitor QR tidak berhasil dimuat."
                onRetry={() => managerSessionQuery.refetch()}
              />
            ) : (
              <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 14, marginBottom: 14 }}>
                <View style={{ flex: layout.prefersSplitPane ? 0.92 : undefined }}>
                  <SelfScanSessionCard
                    checkpoint={scanCheckpoint}
                    session={activeManagerSession}
                    pending={startSessionMutation.isPending || closeSessionMutation.isPending}
                    gateDraft={sessionGateDraft}
                    onGateDraftChange={setSessionGateDraft}
                    onStart={() => startSessionMutation.mutate()}
                    onClose={() => closeSessionMutation.mutate()}
                  />
                </View>

                <View style={{ flex: layout.prefersSplitPane ? 1.08 : undefined }}>
                  <SharedQrMonitorPanel
                    checkpoint={scanCheckpoint}
                    session={activeManagerSession}
                    loading={managerSessionQuery.isFetching}
                    onRefresh={() => {
                      void managerSessionQuery.refetch();
                    }}
                  />
                </View>
              </View>
            )}
          </>
        ) : null}

        {tab === 'ASSISTED' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
              Bantu Petugas
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
              Pilih siswa atau peserta non-siswa yang membutuhkan bantuan presensi hari ini.
            </Text>

            <MobileMenuTabBar
              items={[
                { key: 'STUDENT', label: 'Siswa', iconName: 'users' },
                { key: 'PARTICIPANT', label: 'Non-Siswa', iconName: 'briefcase' },
              ]}
              activeKey={assistedTarget}
              onChange={(nextKey) => setAssistedTarget(nextKey as AssistedTargetKey)}
              layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
              compact={false}
              style={{ marginTop: 14 }}
            />

            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: colors.borderSoft,
                borderStyle: 'dashed',
                borderRadius: 14,
                padding: 12,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              {assistedTarget === 'STUDENT' ? (
                <>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Cari siswa</Text>
                    <TextInput
                      value={studentSearch}
                      onChangeText={setStudentSearch}
                      placeholder="Nama, username, NIS, NISN, atau kelas"
                      placeholderTextColor={colors.textSoft}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.borderSoft,
                        backgroundColor: colors.surface,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 11,
                        color: colors.text,
                        fontSize: fontSizes.bodyCompact,
                      }}
                    />
                  </View>

                  <View style={{ marginTop: 14 }}>
                    <MobileSelectField
                      label="Siswa terpilih"
                      value={selectedStudentId}
                      options={studentOptions.map((student) => ({
                        value: String(student.id),
                        label: `${student.name} • ${student.studentClass?.name || '-'} • ${student.nisn || student.username}`,
                      }))}
                      onChange={setSelectedStudentId}
                      placeholder="Pilih siswa"
                      helperText={
                        deferredStudentSearch
                          ? `Menampilkan hasil pencarian hingga 100 siswa untuk kata kunci "${deferredStudentSearch}".`
                          : 'Menampilkan daftar awal hingga 100 siswa. Gunakan kolom cari untuk mempersempit hasil.'
                      }
                    />
                  </View>

                  <View
                    style={{
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: colors.borderSoft,
                      borderStyle: 'dashed',
                      borderRadius: 14,
                      padding: 12,
                      backgroundColor: colors.surface,
                    }}
                  >
                    {!selectedStudentId ? (
                      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                        Pilih siswa terlebih dahulu untuk melihat status presensi hari ini.
                      </Text>
                    ) : selectedStudentQuery.isLoading ? (
                      <QueryStateView type="loading" message="Memuat status presensi siswa..." />
                    ) : selectedStudentQuery.isError ? (
                      <QueryStateView
                        type="error"
                        message="Status presensi siswa tidak berhasil dimuat."
                        onRetry={() => selectedStudentQuery.refetch()}
                      />
                    ) : (
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                          <InitialAvatar
                            name={selectedStudentQuery.data?.student.name || selectedStudent?.name || '-'}
                            photo={selectedStudentQuery.data?.student.photo}
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ fontWeight: '700', color: colors.text, fontSize: fontSizes.bodyCompact }}>
                              {selectedStudentQuery.data?.student.name}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                              {selectedStudentQuery.data?.student.class?.name || '-'} • NIS/NISN:{' '}
                              {selectedStudentQuery.data?.student.nis || selectedStudentQuery.data?.student.nisn || '-'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 8, marginBottom: 12 }}>
                          <View
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#86efac',
                              backgroundColor: '#f0fdf4',
                              borderRadius: 12,
                              padding: 12,
                            }}
                          >
                            <Text style={{ color: '#15803d', fontSize: fontSizes.caption, fontWeight: '700' }}>Jam Masuk</Text>
                            <Text style={{ color: '#14532d', fontSize: scaleFont(18), fontWeight: '700', marginTop: 6 }}>
                              {selectedStudentQuery.data?.presence.checkInTime || '-'}
                            </Text>
                            <Text style={{ color: '#15803d', fontSize: fontSizes.caption, marginTop: 4 }}>
                              {getSourceLabel(selectedStudentQuery.data?.presence.checkInSource)}
                            </Text>
                          </View>
                          <View
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#7dd3fc',
                              backgroundColor: '#f0f9ff',
                              borderRadius: 12,
                              padding: 12,
                            }}
                          >
                            <Text style={{ color: '#0369a1', fontSize: fontSizes.caption, fontWeight: '700' }}>Jam Pulang</Text>
                            <Text style={{ color: '#0c4a6e', fontSize: scaleFont(18), fontWeight: '700', marginTop: 6 }}>
                              {selectedStudentQuery.data?.presence.checkOutTime || '-'}
                            </Text>
                            <Text style={{ color: '#0369a1', fontSize: fontSizes.caption, marginTop: 4 }}>
                              {getSourceLabel(selectedStudentQuery.data?.presence.checkOutSource)}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: colors.borderSoft,
                            backgroundColor: colors.surface,
                            borderRadius: 12,
                            padding: 12,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>Status harian</Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, marginTop: 6 }}>
                            {selectedStudentQuery.data?.presence.status || 'Belum tercatat'}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 6 }}>
                            Catatan harian: {selectedStudentQuery.data?.presence.note || '-'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                          <Pressable
                            onPress={() => {
                              setReason('');
                              setGateLabel('');
                              setModalState({ checkpoint: 'CHECK_IN', target: 'STUDENT' });
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: '#15803d',
                              borderRadius: 12,
                              paddingVertical: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Bantu Absen Masuk</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setReason('');
                              setGateLabel('');
                              setModalState({ checkpoint: 'CHECK_OUT', target: 'STUDENT' });
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: '#0369a1',
                              borderRadius: 12,
                              paddingVertical: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Bantu Absen Pulang</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Cari peserta non-siswa</Text>
                    <TextInput
                      value={participantSearch}
                      onChangeText={setParticipantSearch}
                      placeholder="Nama, username, NIP, role, atau PTK"
                      placeholderTextColor={colors.textSoft}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.borderSoft,
                        backgroundColor: colors.surface,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 11,
                        color: colors.text,
                        fontSize: fontSizes.bodyCompact,
                      }}
                    />
                  </View>

                  <View style={{ marginTop: 14 }}>
                    <MobileSelectField
                      label="Peserta terpilih"
                      value={selectedParticipantId}
                      options={participantOptions.map((participant) => ({
                        value: String(participant.id),
                        label: `${participant.name} • ${getParticipantRoleLabel(participant.role)} • ${participant.nip || participant.username || '-'}`,
                      }))}
                      onChange={setSelectedParticipantId}
                      placeholder="Pilih peserta non-siswa"
                      helperText={
                        deferredParticipantSearch
                          ? `Menampilkan hasil pencarian hingga 100 peserta untuk kata kunci "${deferredParticipantSearch}".`
                          : 'Menampilkan daftar awal hingga 100 peserta non-siswa. Gunakan kolom cari untuk mempersempit hasil.'
                      }
                    />
                  </View>

                  <View
                    style={{
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: colors.borderSoft,
                      borderStyle: 'dashed',
                      borderRadius: 14,
                      padding: 12,
                      backgroundColor: colors.surface,
                    }}
                  >
                    {!selectedParticipantId ? (
                      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                        Pilih peserta non-siswa terlebih dahulu untuk melihat status presensi hari ini.
                      </Text>
                    ) : selectedParticipantQuery.isLoading ? (
                      <QueryStateView type="loading" message="Memuat status presensi peserta non-siswa..." />
                    ) : selectedParticipantQuery.isError ? (
                      <QueryStateView
                        type="error"
                        message="Status presensi peserta non-siswa tidak berhasil dimuat."
                        onRetry={() => selectedParticipantQuery.refetch()}
                      />
                    ) : 'participant' in (selectedParticipantQuery.data || {}) ? (
                      (() => {
                        const participantState = selectedParticipantQuery.data as DailyPresenceUserState;
                        return (
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                          <InitialAvatar
                            name={participantState.participant.name || selectedParticipant?.name || '-'}
                            photo={participantState.participant.photo}
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ fontWeight: '700', color: colors.text, fontSize: fontSizes.bodyCompact }}>
                              {participantState.participant.name}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                              {getParticipantRoleLabel(participantState.participant.role)} • {participantState.participant.nip || participantState.participant.username || '-'}
                              {participantState.participant.ptkType ? ` • ${participantState.participant.ptkType}` : ''}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 8, marginBottom: 12 }}>
                          <View
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#86efac',
                              backgroundColor: '#f0fdf4',
                              borderRadius: 12,
                              padding: 12,
                            }}
                          >
                            <Text style={{ color: '#15803d', fontSize: fontSizes.caption, fontWeight: '700' }}>Jam Masuk</Text>
                            <Text style={{ color: '#14532d', fontSize: scaleFont(18), fontWeight: '700', marginTop: 6 }}>
                              {participantState.presence.checkInTime || '-'}
                            </Text>
                            <Text style={{ color: '#15803d', fontSize: fontSizes.caption, marginTop: 4 }}>
                              {getSourceLabel(participantState.presence.checkInSource)}
                            </Text>
                          </View>
                          <View
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#7dd3fc',
                              backgroundColor: '#f0f9ff',
                              borderRadius: 12,
                              padding: 12,
                            }}
                          >
                            <Text style={{ color: '#0369a1', fontSize: fontSizes.caption, fontWeight: '700' }}>Jam Pulang</Text>
                            <Text style={{ color: '#0c4a6e', fontSize: scaleFont(18), fontWeight: '700', marginTop: 6 }}>
                              {participantState.presence.checkOutTime || '-'}
                            </Text>
                            <Text style={{ color: '#0369a1', fontSize: fontSizes.caption, marginTop: 4 }}>
                              {getSourceLabel(participantState.presence.checkOutSource)}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: colors.borderSoft,
                            backgroundColor: colors.surface,
                            borderRadius: 12,
                            padding: 12,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>Status harian</Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, marginTop: 6 }}>
                            {participantState.presence.status || 'Belum tercatat'}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 6 }}>
                            Catatan harian: {participantState.presence.note || '-'}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 6 }}>
                            Telat masuk: {participantState.presence.checkInLateMinutes || 0} menit • Pulang terlalu cepat:{' '}
                            {participantState.presence.checkOutEarlyMinutes || 0} menit
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                          <Pressable
                            onPress={() => {
                              setReason('');
                              setGateLabel('');
                              setModalState({ checkpoint: 'CHECK_IN', target: 'PARTICIPANT' });
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: '#15803d',
                              borderRadius: 12,
                              paddingVertical: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Bantu Absen Masuk</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setReason('');
                              setGateLabel('');
                              setModalState({ checkpoint: 'CHECK_OUT', target: 'PARTICIPANT' });
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: '#0369a1',
                              borderRadius: 12,
                              paddingVertical: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Bantu Absen Pulang</Text>
                          </Pressable>
                        </View>
                      </View>
                        );
                      })()
                    ) : null}
                  </View>
                </>
              )}
            </View>
          </View>
        ) : null}

        {tab === 'HISTORY' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
              Log Presensi Hari Ini
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
              Audit trail untuk scan mandiri maupun bantuan petugas pada hari operasional ini.
            </Text>

            {overviewQuery.isLoading ? (
              <View style={{ marginTop: 14 }}>
                <QueryStateView type="loading" message="Memuat log presensi..." />
              </View>
            ) : overviewQuery.isError ? (
              <View style={{ marginTop: 14 }}>
                <QueryStateView type="error" message="Gagal memuat log presensi." onRetry={() => overviewQuery.refetch()} />
              </View>
            ) : !recentEvents.length ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  borderStyle: 'dashed',
                  borderRadius: 12,
                  padding: 14,
                  backgroundColor: colors.surfaceMuted,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>
                  Belum ada log presensi pada hari ini.
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 14, gap: 10 }}>
                {recentEvents.map((event) => (
                  <View
                    key={event.id}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.borderSoft,
                      backgroundColor: colors.surface,
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label, flex: 1, paddingRight: 10 }}>
                        {getEventPersonName(event)}
                      </Text>
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          backgroundColor: event.eventType === 'CHECK_IN' ? '#dcfce7' : '#e0f2fe',
                        }}
                      >
                        <Text
                          style={{
                            color: event.eventType === 'CHECK_IN' ? '#166534' : '#075985',
                            fontSize: fontSizes.caption,
                            fontWeight: '700',
                          }}
                        >
                          {getEventTypeLabel(event.eventType)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
                      {getEventSecondaryLabel(event)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 6 }}>
                      {event.recordedTime || '-'} • {getSourceLabel(event.source)}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 8 }}>
                      {event.reason || '-'}
                      {event.lateMinutes && event.lateMinutes > 0 ? ` • Telat ${event.lateMinutes} menit` : ''}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 6 }}>
                      Petugas: {event.actor?.name || '-'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {tab === 'CONFIG' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
              Konfigurasi Jam Presensi
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
              Atur window QR bersama untuk masuk dan pulang dari Tata Usaha.
            </Text>

            {policyQuery.isLoading && !policyDraft ? (
              <View style={{ marginTop: 14 }}>
                <QueryStateView type="loading" message="Memuat konfigurasi jam presensi..." />
              </View>
            ) : policyQuery.isError ? (
              <View style={{ marginTop: 14 }}>
                <QueryStateView
                  type="error"
                  message="Konfigurasi jam presensi tidak berhasil dimuat."
                  onRetry={() => policyQuery.refetch()}
                />
              </View>
            ) : policyDraft ? (
              <View style={{ marginTop: 14 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbeafe',
                    backgroundColor: '#eff6ff',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                    QR bersama nanti dipakai siswa, guru, dan staff. Sistem menghitung status berdasarkan role dan konfigurasi ini.
                  </Text>
                </View>

                <MobileSelectField
                  label="Hari"
                  value={selectedPolicyDay}
                  options={DAY_KEYS.map((day) => ({
                    value: day,
                    label: DAY_LABELS[day],
                  }))}
                  onChange={(value) => setSelectedPolicyDay(value as DailyPresencePolicyDayKey)}
                  placeholder="Pilih hari"
                />

                {(() => {
                  const dayConfig = policyDraft.days[selectedPolicyDay];
                  const timeRows = [
                    { section: 'checkIn', field: 'openAt', label: 'QR Masuk Mulai' },
                    { section: 'checkIn', field: 'onTimeUntil', label: 'Batas Tepat Waktu' },
                    { section: 'checkIn', field: 'closeAt', label: 'QR Masuk Tutup' },
                    { section: 'checkOut', field: 'openAt', label: 'QR Pulang Mulai' },
                    { section: 'checkOut', field: 'validFrom', label: 'Pulang Valid' },
                    { section: 'checkOut', field: 'closeAt', label: 'QR Pulang Tutup' },
                  ];

                  return (
                    <View style={{ marginTop: 14 }}>
                      <Pressable
                        onPress={() =>
                          updatePolicyDay(selectedPolicyDay, (current) => ({
                            ...current,
                            enabled: !current.enabled,
                          }))
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: dayConfig.enabled ? '#bbf7d0' : colors.borderSoft,
                          backgroundColor: dayConfig.enabled ? '#f0fdf4' : colors.surfaceMuted,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          marginBottom: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text style={{ color: dayConfig.enabled ? '#166534' : colors.textMuted, fontWeight: '700' }}>
                          {dayConfig.enabled ? 'Hari aktif untuk QR presensi' : 'Hari nonaktif'}
                        </Text>
                        <Feather name={dayConfig.enabled ? 'check-circle' : 'circle'} size={18} color={dayConfig.enabled ? '#16a34a' : colors.textMuted} />
                      </Pressable>

                      <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', flexWrap: 'wrap', gap: 10 }}>
                        {timeRows.map((row) => (
                          <View
                            key={`${row.section}-${row.field}`}
                            style={{
                              width: layout.prefersSplitPane ? '48%' : '100%',
                              borderWidth: 1,
                              borderColor: colors.borderSoft,
                              borderRadius: 12,
                              padding: 12,
                              backgroundColor: colors.surface,
                            }}
                          >
                            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 6 }}>{row.label}</Text>
                            <TextInput
                              value={(dayConfig as any)[row.section][row.field]}
                              onChangeText={(value) =>
                                updatePolicyDay(selectedPolicyDay, (current) => ({
                                  ...current,
                                  [row.section]: {
                                    ...(current as any)[row.section],
                                    [row.field]: value,
                                  },
                                }))
                              }
                              placeholder="HH:mm"
                              placeholderTextColor={colors.textSoft}
                              style={{
                                borderWidth: 1,
                                borderColor: colors.borderSoft,
                                borderRadius: 10,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                color: colors.text,
                                fontWeight: '700',
                                backgroundColor: colors.surface,
                              }}
                            />
                          </View>
                        ))}
                      </View>

                      {selectedPolicyDay === 'SATURDAY' ? (
                        <View style={{ marginTop: 12 }}>
                          <MobileSelectField
                            label="Sabtu Guru Duty"
                            value={dayConfig.teacherDutySaturdayMode || 'MANUAL'}
                            options={[
                              { value: 'DISABLED', label: 'Nonaktif' },
                              { value: 'MANUAL', label: 'Manual' },
                              { value: 'QR', label: 'QR' },
                            ]}
                            onChange={(value) =>
                              updatePolicyDay(selectedPolicyDay, (current) => ({
                                ...current,
                                teacherDutySaturdayMode: value as 'DISABLED' | 'MANUAL' | 'QR',
                              }))
                            }
                            placeholder="Pilih mode Sabtu"
                          />
                        </View>
                      ) : null}

                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.borderSoft,
                          borderRadius: 12,
                          padding: 12,
                          marginTop: 12,
                          backgroundColor: colors.surfaceMuted,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 6 }}>
                          Refresh QR dinamis (detik)
                        </Text>
                        <TextInput
                          value={String(policyDraft.qrRefreshSeconds)}
                          onChangeText={(value) => {
                            const parsed = Number(value.replace(/\D+/g, '') || 30);
                            setPolicyDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    qrRefreshSeconds: Math.max(10, Math.min(120, parsed)),
                                  }
                                : current,
                            );
                          }}
                          keyboardType="number-pad"
                          style={{
                            borderWidth: 1,
                            borderColor: colors.borderSoft,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: colors.text,
                            backgroundColor: colors.surface,
                          }}
                        />
                      </View>

                      <Pressable
                        disabled={savePolicyMutation.isPending}
                        onPress={() => savePolicyMutation.mutate(policyDraft)}
                        style={{
                          marginTop: 14,
                          backgroundColor: savePolicyMutation.isPending ? '#93c5fd' : '#2563eb',
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                        }}
                      >
                        {savePolicyMutation.isPending ? <Feather name="loader" size={16} color="#fff" /> : <Feather name="save" size={16} color="#fff" />}
                        <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                          {savePolicyMutation.isPending ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })()}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(modalState && modalCopy)} transparent animationType="fade" onRequestClose={() => setModalState(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.18)',
            paddingHorizontal: 18,
            paddingVertical: 28,
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              maxHeight: '78%',
              backgroundColor: colors.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.borderSoft,
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(18) }}>
                  {modalCopy?.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
                  {modalParticipantLabel}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (modalBusy) return;
                  setModalState(null);
                }}
                style={{ padding: 4 }}
              >
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                  backgroundColor: '#eff6ff',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                  Bantuan petugas wajib menyimpan alasan agar audit tetap rapi. Popup ini tidak tertutup hanya karena area luar disentuh.
                </Text>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Alasan bantuan</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                textAlignVertical="top"
                placeholder={modalCopy?.placeholder}
                placeholderTextColor={colors.textSoft}
                style={{
                  minHeight: 120,
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  fontSize: fontSizes.bodyCompact,
                  marginBottom: 14,
                  backgroundColor: colors.surface,
                }}
              />

              <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Titik / Gate (opsional)</Text>
              <TextInput
                value={gateLabel}
                onChangeText={setGateLabel}
                placeholder="Contoh: Gerbang Utama / Pos Satpam"
                placeholderTextColor={colors.textSoft}
                style={{
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  color: colors.text,
                  fontSize: fontSizes.bodyCompact,
                  backgroundColor: colors.surface,
                }}
              />
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: colors.borderSoft,
              }}
            >
              <Pressable
                onPress={() => {
                  if (modalBusy) return;
                  setModalState(null);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Batal</Text>
              </Pressable>
              <Pressable
                disabled={!canSubmitModal}
                onPress={() => {
                  if (!modalState) return;
                  if (modalState.target === 'PARTICIPANT') {
                    if (!selectedParticipantId) return;
                    saveParticipantMutation.mutate({
                      userId: Number(selectedParticipantId),
                      checkpoint: modalState.checkpoint,
                      reason: reason.trim(),
                      gateLabel: gateLabel.trim() || null,
                    });
                    return;
                  }
                  if (!selectedStudentId) return;
                  saveMutation.mutate({
                    studentId: Number(selectedStudentId),
                    checkpoint: modalState.checkpoint,
                    reason: reason.trim(),
                    gateLabel: gateLabel.trim() || null,
                  });
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 12,
                  backgroundColor: canSubmitModal ? '#2563eb' : '#93c5fd',
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                {modalBusy ? <Feather name="loader" size={16} color="#fff" /> : null}
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: modalBusy ? 8 : 0 }}>
                  {modalCopy?.submit}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
