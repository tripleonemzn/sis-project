import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardCheck,
  QrCode,
  Settings2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCcw,
  ScanLine,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import WebQrScannerPanel from '../../components/attendance/WebQrScannerPanel';
import {
  attendanceService,
  type DailyPresenceEventItem,
  type DailyPresenceEventType,
  type DailyPresenceOperationalStudent,
  type DailyPresencePolicy,
  type DailyPresencePolicyDayKey,
  type DailyPresenceSelfScanManagerSession,
  type DailyPresenceSelfScanPreview,
} from '../../services/attendance.service';
import { authService } from '../../services/auth.service';
import {
  buildDailyPresenceChallengeCode,
  formatCountdownLabel,
  getDailyPresenceChallengeWindowEndsAt,
  getDailyPresenceChallengeWindowIndex,
  getDailyPresenceCheckpointLabel,
} from '../../utils/dailyPresenceSelfScan';
import { resolveStaffDivision } from '../../utils/staffRole';

type StaffTabKey = 'SCAN' | 'MONITOR' | 'ASSISTED' | 'HISTORY' | 'CONFIG';

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
} | null;

type ScannedPassState = {
  qrToken: string;
  preview: DailyPresenceSelfScanPreview;
} | null;

function formatTodayLabel(dateKey?: string | null) {
  const date = dateKey ? new Date(dateKey) : new Date();
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeLabel(dateIso?: string | null) {
  if (!dateIso) return '--:--';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

function getEventTypeLabel(value: DailyPresenceEventType) {
  return value === 'CHECK_IN' ? 'Masuk' : 'Pulang';
}

function getSourceLabel(value?: string | null) {
  if (value === 'ASSISTED_SCAN') return 'Dibantu Petugas';
  if (value === 'SELF_SCAN') return 'Scan Mandiri';
  if (value === 'MANUAL_ADJUSTMENT') return 'Koreksi Manual';
  if (value === 'LEGACY_DAILY') return 'Manual Lama';
  return '-';
}

function getSourceTone(value?: string | null) {
  if (value === 'SELF_SCAN') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (value === 'ASSISTED_SCAN') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'MANUAL_ADJUSTMENT') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (value === 'LEGACY_DAILY') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function resolvePhotoUrl(photo?: string | null) {
  const normalized = String(photo || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('/api') || normalized.startsWith('http')) return normalized;
  return `/api/uploads/${normalized}`;
}

function InitialAvatar({ name, photo }: { name: string; photo?: string | null }) {
  const photoUrl = resolvePhotoUrl(photo);
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-100 bg-blue-50">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-lg font-bold text-blue-700">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

function PresenceHistoryTable({
  events,
  emptyText,
}: {
  events: DailyPresenceEventItem[];
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Waktu</th>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Siswa</th>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Kelas</th>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Aksi</th>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Sumber</th>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Alasan</th>
            <th className="px-3 py-3 text-left font-semibold text-slate-600">Petugas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!events.length ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id} className="bg-white">
                <td className="px-3 py-3 text-slate-700">{event.recordedTime || formatTimeLabel(event.recordedAt)}</td>
                <td className="px-3 py-3 text-slate-700">
                  <div className="font-medium text-slate-900">{event.student?.name || '-'}</div>
                  <div className="text-xs text-slate-500">{event.student?.nisn || event.student?.nis || '-'}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">{event.class?.name || '-'}</td>
                <td className="px-3 py-3 text-slate-700">{getEventTypeLabel(event.eventType)}</td>
                <td className="px-3 py-3 text-slate-700">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSourceTone(event.source)}`}>
                    {getSourceLabel(event.source)}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-600">{event.reason || '-'}</td>
                <td className="px-3 py-3 text-slate-600">{event.actor?.name || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelfScanSessionCard({
  checkpoint,
  session,
  loading,
  gateDraft,
  onGateDraftChange,
  onRefresh,
  onStart,
  onClose,
  pending,
}: {
  checkpoint: DailyPresenceEventType;
  session: DailyPresenceSelfScanManagerSession | null;
  loading: boolean;
  gateDraft: string;
  onGateDraftChange: (value: string) => void;
  onRefresh: () => void;
  onStart: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [ticker, setTicker] = useState(Date.now());

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => setTicker(Date.now()), 1000);
    return () => window.clearInterval(timer);
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Sesi {getDailyPresenceCheckpointLabel(checkpoint)}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Buka satu sesi aktif per checkpoint. Challenge berubah otomatis setiap {session?.challengeWindowSeconds || 30} detik.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {!session ? (
        <>
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Belum ada sesi scan mandiri aktif untuk checkpoint ini. Isi gate jika perlu, lalu buka sesi.
          </div>

          <div className="mt-5">
            <label htmlFor="self-scan-gate" className="mb-1 block text-sm font-medium text-slate-700">
              Titik / Gate
            </label>
            <input
              id="self-scan-gate"
              value={gateDraft}
              onChange={(event) => onGateDraftChange(event.target.value)}
              placeholder="Contoh: Gerbang Utama / Pos Satpam"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {pending ? 'Membuka sesi...' : `Buka Sesi ${getDailyPresenceCheckpointLabel(checkpoint)}`}
          </button>
        </>
      ) : (
        <>
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Challenge Aktif</p>
            <p className="mt-3 text-4xl font-extrabold tracking-[0.35em] text-slate-900">{liveChallengeCode}</p>
            <p className="mt-2 text-sm font-semibold text-blue-700">Berlaku {formatCountdownLabel(liveChallengeEndsAt)}</p>
            <p className="mt-3 text-sm text-slate-600">
              {session.gateLabel ? `Checkpoint ${session.gateLabel}. ` : 'Checkpoint aktif. '}
              Sesi berakhir {formatTimeLabel(session.sessionExpiresAt)}.
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Petugas Pembuka</p>
            <p className="mt-1 text-sm text-slate-600">{session.actor.name}</p>
            <p className="mt-1 text-xs text-slate-500">Gate: {session.gateLabel || '-'}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {pending ? 'Menutup sesi...' : `Tutup Sesi ${getDailyPresenceCheckpointLabel(checkpoint)}`}
          </button>
        </>
      )}
    </div>
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
  const [ticker, setTicker] = useState(Date.now());

  useEffect(() => {
    if (!session?.monitor) return undefined;
    const timer = window.setInterval(() => setTicker(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.monitor?.generatedAt, session?.monitor?.qrExpiresAt]);

  const liveChallengeCode = useMemo(() => {
    if (!session) return '';
    return buildDailyPresenceChallengeCode(
      session.challengeSecret,
      getDailyPresenceChallengeWindowIndex(new Date(ticker), session.challengeWindowSeconds),
    );
  }, [session, ticker]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Monitor QR Bersama</h3>
          <p className="mt-1 text-sm text-slate-500">
            Tampilkan QR ini di monitor/TV. QR diperbarui otomatis sesuai konfigurasi presensi aktif.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {!session ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Belum ada sesi aktif untuk monitor QR {getDailyPresenceCheckpointLabel(checkpoint).toLowerCase()}. Buka sesi lebih dulu.
        </div>
      ) : !session.monitor ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-700">
          QR monitor belum siap dimuat. Gunakan tombol muat ulang untuk mengambil QR terbaru.
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,360px),1fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex aspect-square items-center justify-center rounded-2xl bg-white p-4 shadow-inner">
                <img
                  src={session.monitor.qrCodeDataUrl}
                  alt={`QR monitor ${getDailyPresenceCheckpointLabel(checkpoint)}`}
                  className="h-full w-full rounded-2xl object-contain"
                />
              </div>
              <p className="mt-3 text-center text-sm font-semibold text-slate-700">
                QR aktif {formatCountdownLabel(session.monitor.qrExpiresAt)}
              </p>
              <p className="mt-1 text-center text-xs text-slate-500">
                Refresh tiap {session.monitor.refreshSeconds} detik.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Checkpoint Aktif</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  Absen {getDailyPresenceCheckpointLabel(checkpoint)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {session.gateLabel ? `Gate ${session.gateLabel}. ` : 'Gate belum diisi. '}
                  Sesi berakhir {formatTimeLabel(session.sessionExpiresAt)}.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Kode Challenge Saat Ini</p>
                <p className="mt-2 text-3xl font-extrabold tracking-[0.28em] text-slate-900">{liveChallengeCode}</p>
                <p className="mt-2 text-sm text-slate-500">
                  Kode berganti otomatis {formatCountdownLabel(session.challengeWindowExpiresAt)}.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Petugas Pembuka</p>
                <p className="mt-1 text-sm text-slate-600">{session.actor.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Tanggal operasional {formatTodayLabel(session.date)}.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScanPreviewPanel({
  scannedPass,
  confirmPending,
  onReset,
  onConfirm,
  events,
}: {
  scannedPass: ScannedPassState;
  confirmPending: boolean;
  onReset: () => void;
  onConfirm: () => void;
  events: DailyPresenceEventItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Verifikasi Hasil Scan</h3>
            <p className="mt-1 text-sm text-slate-500">
              Cocokkan nama, kelas, dan foto siswa sebelum menekan konfirmasi.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
            <ShieldCheck className="h-4 w-4" />
          </div>
        </div>

        {!scannedPass ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Belum ada QR yang dipindai. Setelah scan berhasil, identitas siswa akan muncul di panel ini.
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <InitialAvatar name={scannedPass.preview.student.name} photo={scannedPass.preview.student.photo} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{scannedPass.preview.student.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {scannedPass.preview.student.class.name} • {scannedPass.preview.student.nis || scannedPass.preview.student.nisn || '-'}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                  {getDailyPresenceCheckpointLabel(scannedPass.preview.checkpoint)}
                  {scannedPass.preview.gateLabel ? ` • ${scannedPass.preview.gateLabel}` : ''}
                </p>
              </div>
            </div>

            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                scannedPass.preview.alreadyRecorded
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <p className="font-semibold">
                {scannedPass.preview.alreadyRecorded
                  ? `${getDailyPresenceCheckpointLabel(scannedPass.preview.checkpoint)} sudah pernah tercatat`
                  : 'QR siap dikonfirmasi'}
              </p>
              <p className="mt-1">
                {scannedPass.preview.alreadyRecorded
                  ? 'Minta siswa membuat QR baru hanya jika status sebelumnya memang belum sesuai.'
                  : 'Tekan konfirmasi hanya jika identitas siswa yang tampil sudah benar.'}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset Hasil Scan
              </button>
              <button
                type="button"
                disabled={confirmPending || scannedPass.preview.alreadyRecorded}
                onClick={onConfirm}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirmPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {confirmPending ? 'Mengonfirmasi...' : 'Konfirmasi Scan'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Aktivitas Terbaru</h3>
            <p className="mt-1 text-sm text-slate-500">
              Ringkas untuk memantau antrian presensi tanpa pindah halaman.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
            <ClipboardCheck className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {!events.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Belum ada log presensi pada hari ini.
            </div>
          ) : (
            events.slice(0, 6).map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{event.student?.name || '-'}</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSourceTone(event.source)}`}>
                    {getSourceLabel(event.source)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {event.class?.name || '-'} • {getEventTypeLabel(event.eventType)} • {event.recordedTime || formatTimeLabel(event.recordedAt)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {event.reason || 'Belum ada alasan tambahan.'}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function StaffDailyPresencePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<StaffTabKey>('SCAN');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');
  const [modalState, setModalState] = useState<PresenceModalState>(null);
  const [reason, setReason] = useState('');
  const [gateLabel, setGateLabel] = useState('');
  const [scanCheckpoint, setScanCheckpoint] = useState<DailyPresenceEventType>('CHECK_IN');
  const [sessionGateDraft, setSessionGateDraft] = useState('');
  const [scannedPass, setScannedPass] = useState<ScannedPassState>(null);
  const [pendingScannedToken, setPendingScannedToken] = useState('');
  const [policyDraft, setPolicyDraft] = useState<DailyPresencePolicy | null>(null);

  const meQuery = useQuery({
    queryKey: ['staff-daily-presence-me'],
    queryFn: authService.getMeSafe,
    staleTime: 5 * 60 * 1000,
  });

  const currentUser = meQuery.data?.data;
  const canAccess = resolveStaffDivision(currentUser) === 'ADMINISTRATION';
  const deferredStudentSearch = useDeferredValue(studentSearch.trim());

  const overviewQuery = useQuery({
    queryKey: ['staff-daily-presence-overview'],
    enabled: canAccess,
    queryFn: () => attendanceService.getDailyPresenceOverview({ limit: 20 }),
    staleTime: 60 * 1000,
  });

  const policyQuery = useQuery({
    queryKey: ['staff-daily-presence-policy'],
    enabled: canAccess,
    queryFn: () => attendanceService.getDailyPresencePolicy(),
    staleTime: 60 * 1000,
  });

  const managerSessionQuery = useQuery({
    queryKey: ['staff-daily-presence-self-scan-session', scanCheckpoint],
    enabled: canAccess && (activeTab === 'SCAN' || activeTab === 'MONITOR'),
    queryFn: () => attendanceService.getActiveManagerSelfScanSession({ checkpoint: scanCheckpoint }),
    staleTime: 20 * 1000,
    refetchInterval: (query) => {
      if (!(canAccess && activeTab === 'MONITOR')) return false;
      const session = query.state.data as DailyPresenceSelfScanManagerSession | null | undefined;
      const refreshSeconds = session?.monitor?.refreshSeconds;
      if (!refreshSeconds) return 15000;
      return Math.max(5000, Math.min(15000, Math.floor((refreshSeconds * 1000) / 2)));
    },
    refetchIntervalInBackground: true,
  });

  const studentsQuery = useQuery({
    queryKey: ['staff-daily-presence-students', deferredStudentSearch],
    enabled: canAccess && activeTab === 'ASSISTED',
    queryFn: () =>
      attendanceService.getDailyPresenceStudents({
        query: deferredStudentSearch || undefined,
        limit: 100,
      }),
    staleTime: 60 * 1000,
  });

  const selectedStudentQuery = useQuery({
    queryKey: ['staff-daily-presence-student', selectedStudentId],
    enabled: canAccess && activeTab === 'ASSISTED' && Boolean(selectedStudentId),
    queryFn: () => attendanceService.getStudentDailyPresence({ studentId: Number(selectedStudentId) }),
    staleTime: 30 * 1000,
  });

  const startSessionMutation = useMutation({
    mutationFn: () =>
      attendanceService.startSelfScanSession({
        checkpoint: scanCheckpoint,
        gateLabel: sessionGateDraft.trim() || null,
      }),
    onSuccess: async (session) => {
      toast.success(`Sesi ${getDailyPresenceCheckpointLabel(scanCheckpoint)} berhasil dibuka.`);
      setSessionGateDraft(session?.gateLabel || '');
      setScannedPass(null);
      setPendingScannedToken('');
      await managerSessionQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal membuka sesi scan mandiri.');
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: () => attendanceService.closeSelfScanSession({ checkpoint: scanCheckpoint }),
    onSuccess: async () => {
      toast.success(`Sesi ${getDailyPresenceCheckpointLabel(scanCheckpoint)} berhasil ditutup.`);
      setScannedPass(null);
      setPendingScannedToken('');
      await managerSessionQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menutup sesi scan mandiri.');
    },
  });

  const previewMutation = useMutation({
    mutationFn: (payload: { qrToken: string }) => attendanceService.previewSelfScanPass(payload),
    onSuccess: (preview, variables) => {
      setScannedPass({
        qrToken: variables.qrToken,
        preview,
      });
      setPendingScannedToken('');
    },
    onError: (error: any) => {
      setPendingScannedToken('');
      toast.error(error?.response?.data?.message || 'QR siswa tidak valid atau sesi scan sudah berakhir.');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: { qrToken: string }) => attendanceService.confirmSelfScanPass(payload),
    onSuccess: async () => {
      toast.success('Presensi siswa berhasil diverifikasi melalui scan mandiri.');
      setScannedPass(null);
      setPendingScannedToken('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['staff-daily-presence-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-daily-presence-student'] }),
      ]);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Konfirmasi scan mandiri gagal diproses.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      studentId: number;
      checkpoint: DailyPresenceEventType;
      reason: string;
      gateLabel?: string | null;
    }) => attendanceService.saveAssistedDailyPresence(payload),
    onSuccess: (_, variables) => {
      toast.success(
        variables.checkpoint === 'CHECK_IN'
          ? 'Absen masuk berhasil dibantu petugas.'
          : 'Absen pulang berhasil dibantu petugas.',
      );
      setModalState(null);
      setReason('');
      setGateLabel('');
      void queryClient.invalidateQueries({ queryKey: ['staff-daily-presence-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['staff-daily-presence-student', selectedStudentId] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menyimpan presensi harian.');
    },
  });

  const savePolicyMutation = useMutation({
    mutationFn: (policy: DailyPresencePolicy) => attendanceService.saveDailyPresencePolicy(policy),
    onSuccess: (result) => {
      toast.success('Konfigurasi jam presensi berhasil disimpan.');
      setPolicyDraft(result.policy);
      void queryClient.invalidateQueries({ queryKey: ['staff-daily-presence-policy'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menyimpan konfigurasi jam presensi.');
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

  const modalCopy = modalState ? getCheckpointCopy(modalState.checkpoint) : null;
  const canSubmitModal = Boolean(selectedStudentId) && reason.trim().length >= 3 && !saveMutation.isPending;
  const recentEvents = overviewQuery.data?.recentEvents || [];
  const activeManagerSession = managerSessionQuery.data || null;
  const scanBusy =
    startSessionMutation.isPending ||
    closeSessionMutation.isPending ||
    previewMutation.isPending ||
    confirmMutation.isPending;
  const scannerEnabled = Boolean(activeManagerSession) && !scanBusy && !scannedPass;

  useEffect(() => {
    setScannedPass(null);
    setPendingScannedToken('');
  }, [scanCheckpoint]);

  useEffect(() => {
    if (activeManagerSession) {
      setSessionGateDraft(activeManagerSession.gateLabel || '');
      return;
    }
    setSessionGateDraft('');
  }, [activeManagerSession?.sessionId, activeManagerSession?.gateLabel]);

  useEffect(() => {
    if (!policyQuery.data?.policy) return;
    setPolicyDraft(policyQuery.data.policy);
  }, [policyQuery.data?.policy]);

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

  const handleRefresh = async () => {
    await overviewQuery.refetch();
    if (activeTab === 'CONFIG') {
      await policyQuery.refetch();
    }
    if (activeTab === 'SCAN' || activeTab === 'MONITOR') {
      await managerSessionQuery.refetch();
    }
    if (activeTab === 'ASSISTED') {
      await studentsQuery.refetch();
      if (selectedStudentId) {
        await selectedStudentQuery.refetch();
      }
    }
  };

  const handleDetectedQrToken = (rawToken: string) => {
    const qrToken = String(rawToken || '').trim();
    if (!qrToken || qrToken === pendingScannedToken || qrToken === scannedPass?.qrToken) return;
    setPendingScannedToken(qrToken);
    previewMutation.mutate({ qrToken });
  };

  if (meQuery.isLoading && !currentUser) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
        Memuat workspace presensi harian...
      </div>
    );
  }

  if (!canAccess && !meQuery.isLoading) {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        Halaman ini khusus untuk staff administrasi.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Presensi Harian</h1>
            <p className="mt-2 text-sm text-slate-600">
              Monitor QR bersama, verifikasi scan mandiri, bantuan petugas, dan audit harian dalam satu alur.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw
              className={`h-4 w-4 ${
                overviewQuery.isFetching ||
                policyQuery.isFetching ||
                managerSessionQuery.isFetching ||
                studentsQuery.isFetching ||
                selectedStudentQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Muat Ulang Data
          </button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {overviewQuery.isLoading && !overviewQuery.data ? (
          <div className="col-span-full flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-10 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memuat ringkasan presensi...
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tanggal Operasional</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{formatTodayLabel(overviewQuery.data?.date)}</p>
              <p className="mt-2 text-sm text-slate-500">Hari operasional presensi.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Sudah Masuk</p>
              <p className="mt-3 text-3xl font-bold text-emerald-900">
                {overviewQuery.data?.summary.checkInCount?.toLocaleString('id-ID') || '0'}
              </p>
              <p className="mt-2 text-sm text-emerald-700">Siswa sudah punya jam masuk hari ini.</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Sudah Pulang</p>
              <p className="mt-3 text-3xl font-bold text-sky-900">
                {overviewQuery.data?.summary.checkOutCount?.toLocaleString('id-ID') || '0'}
              </p>
              <p className="mt-2 text-sm text-sky-700">Siswa sudah punya jam pulang hari ini.</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Bantuan Petugas</p>
              <p className="mt-3 text-3xl font-bold text-amber-900">
                {overviewQuery.data?.summary.assistedEventCount?.toLocaleString('id-ID') || '0'}
              </p>
              <p className="mt-2 text-sm text-amber-700">
                {overviewQuery.data?.summary.openDayCount?.toLocaleString('id-ID') || '0'} siswa belum punya jam pulang.
              </p>
            </div>
          </>
        )}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'SCAN' as const, label: 'Scan Mandiri', icon: ScanLine },
            { key: 'MONITOR' as const, label: 'Monitor QR', icon: QrCode },
            { key: 'ASSISTED' as const, label: 'Bantu Petugas', icon: ShieldCheck },
            { key: 'HISTORY' as const, label: 'Riwayat', icon: ClipboardCheck },
            { key: 'CONFIG' as const, label: 'Konfigurasi Jam', icon: Settings2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'SCAN' || activeTab === 'MONITOR' ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {(['CHECK_IN', 'CHECK_OUT'] as const).map((checkpoint) => {
                const active = scanCheckpoint === checkpoint;
                const Icon = checkpoint === 'CHECK_IN' ? LogIn : LogOut;
                return (
                  <button
                    key={checkpoint}
                    type="button"
                    onClick={() => setScanCheckpoint(checkpoint)}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    Absen {getDailyPresenceCheckpointLabel(checkpoint)}
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'SCAN' ? (
            <div className="grid gap-6 xl:grid-cols-[0.96fr,1.2fr]">
              <div className="space-y-4">
                <SelfScanSessionCard
                  checkpoint={scanCheckpoint}
                  session={activeManagerSession}
                  loading={managerSessionQuery.isFetching}
                  gateDraft={sessionGateDraft}
                  onGateDraftChange={setSessionGateDraft}
                  onRefresh={() => {
                    void managerSessionQuery.refetch();
                  }}
                  onStart={() => startSessionMutation.mutate()}
                  onClose={() => closeSessionMutation.mutate()}
                  pending={startSessionMutation.isPending || closeSessionMutation.isPending}
                />
                <WebQrScannerPanel
                  enabled={scannerEnabled}
                  busy={scanBusy}
                  onDetected={handleDetectedQrToken}
                />
              </div>

              <ScanPreviewPanel
                scannedPass={scannedPass}
                confirmPending={confirmMutation.isPending}
                onReset={() => {
                  setScannedPass(null);
                  setPendingScannedToken('');
                }}
                onConfirm={() => {
                  if (!scannedPass) return;
                  confirmMutation.mutate({ qrToken: scannedPass.qrToken });
                }}
                events={recentEvents}
              />
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[0.96fr,1.2fr]">
              <SelfScanSessionCard
                checkpoint={scanCheckpoint}
                session={activeManagerSession}
                loading={managerSessionQuery.isFetching}
                gateDraft={sessionGateDraft}
                onGateDraftChange={setSessionGateDraft}
                onRefresh={() => {
                  void managerSessionQuery.refetch();
                }}
                onStart={() => startSessionMutation.mutate()}
                onClose={() => closeSessionMutation.mutate()}
                pending={startSessionMutation.isPending || closeSessionMutation.isPending}
              />
              <SharedQrMonitorPanel
                checkpoint={scanCheckpoint}
                session={activeManagerSession}
                loading={managerSessionQuery.isFetching}
                onRefresh={() => {
                  void managerSessionQuery.refetch();
                }}
              />
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'ASSISTED' ? (
        <div className="grid gap-6 xl:grid-cols-[0.96fr,1.2fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Cari Siswa</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Pilih siswa yang membutuhkan bantuan absen masuk atau pulang hari ini.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
                <Search className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="daily-presence-search" className="mb-1 block text-sm font-medium text-slate-700">
                  Cari siswa
                </label>
                <input
                  id="daily-presence-search"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Ketik nama, username, NIS, NISN, atau kelas"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="daily-presence-student" className="mb-1 block text-sm font-medium text-slate-700">
                  Siswa terpilih
                </label>
                <select
                  id="daily-presence-student"
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                >
                  <option value="">Pilih siswa</option>
                  {studentOptions.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} • {student.studentClass?.name || '-'} • {student.nisn || student.username}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  {deferredStudentSearch
                    ? `Menampilkan hasil pencarian hingga 100 siswa untuk kata kunci "${deferredStudentSearch}".`
                    : 'Menampilkan daftar awal hingga 100 siswa. Gunakan kolom cari untuk mempersempit hasil.'}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              {!selectedStudentId ? (
                <p className="text-sm text-slate-500">Pilih siswa terlebih dahulu untuk melihat status presensi hari ini.</p>
              ) : selectedStudentQuery.isLoading ? (
                <div className="flex items-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memuat status presensi siswa...
                </div>
              ) : selectedStudentQuery.isError ? (
                <p className="text-sm text-rose-600">Status presensi siswa tidak berhasil dimuat.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedStudentQuery.data?.student.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedStudentQuery.data?.student.class?.name || '-'} • NIS/NISN:{' '}
                      {selectedStudentQuery.data?.student.nis || selectedStudentQuery.data?.student.nisn || '-'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Jam Masuk</p>
                      <p className="mt-2 text-lg font-semibold text-emerald-900">
                        {selectedStudentQuery.data?.presence.checkInTime || '-'}
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">
                        {getSourceLabel(selectedStudentQuery.data?.presence.checkInSource)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Jam Pulang</p>
                      <p className="mt-2 text-lg font-semibold text-sky-900">
                        {selectedStudentQuery.data?.presence.checkOutTime || '-'}
                      </p>
                      <p className="mt-1 text-xs text-sky-700">
                        {getSourceLabel(selectedStudentQuery.data?.presence.checkOutSource)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm font-medium text-slate-700">Status harian</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {selectedStudentQuery.data?.presence.status || 'Belum tercatat'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Catatan harian: {selectedStudentQuery.data?.presence.note || '-'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReason('');
                        setGateLabel('');
                        setModalState({ checkpoint: 'CHECK_IN' });
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      <LogIn className="h-4 w-4" />
                      Bantu Absen Masuk
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReason('');
                        setGateLabel('');
                        setModalState({ checkpoint: 'CHECK_OUT' });
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
                    >
                      <LogOut className="h-4 w-4" />
                      Bantu Absen Pulang
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Log Presensi Hari Ini</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Riwayat scan mandiri dan bantuan petugas pada hari operasional ini.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
                <ClipboardCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-5">
              <PresenceHistoryTable events={recentEvents} emptyText="Belum ada log presensi pada hari ini." />
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'HISTORY' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Riwayat Presensi Hari Ini</h2>
              <p className="mt-1 text-sm text-slate-500">
                Audit ringkas untuk scan mandiri, bantuan petugas, dan sumber pencatatan lainnya.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
              <ClipboardCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-5">
            <PresenceHistoryTable events={recentEvents} emptyText="Belum ada riwayat presensi untuk hari ini." />
          </div>
        </section>
      ) : null}

      {activeTab === 'CONFIG' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Konfigurasi Jam Presensi</h2>
              <p className="mt-1 text-sm text-slate-500">
                Atur window QR bersama untuk masuk dan pulang. Guru dengan jadwal mengajar khusus tetap bisa memakai aturan lanjutan pada batch berikutnya.
              </p>
            </div>
            <button
              type="button"
              disabled={!policyDraft || savePolicyMutation.isPending}
              onClick={() => {
                if (!policyDraft) return;
                savePolicyMutation.mutate(policyDraft);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {savePolicyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Simpan Konfigurasi
            </button>
          </div>

          {policyQuery.isLoading && !policyDraft ? (
            <div className="mt-6 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memuat konfigurasi jam presensi...
            </div>
          ) : policyQuery.isError ? (
            <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              Konfigurasi jam presensi tidak berhasil dimuat.
            </div>
          ) : policyDraft ? (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-[1fr,220px]">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  QR bersama nanti memakai refresh token dinamis dari konfigurasi ini. Satu QR dipakai siswa, guru, dan staff; backend yang menentukan status tepat waktu atau terlambat.
                </div>
                <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <span className="block font-medium text-slate-700">Refresh QR (detik)</span>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={policyDraft.qrRefreshSeconds}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value || 30);
                      setPolicyDraft((current) =>
                        current
                          ? {
                              ...current,
                              qrRefreshSeconds: Math.max(10, Math.min(120, nextValue)),
                            }
                          : current,
                      );
                    }}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Hari</th>
                      <th className="px-4 py-3">Aktif</th>
                      <th className="px-4 py-3">QR Masuk Mulai</th>
                      <th className="px-4 py-3">Batas Tepat Waktu</th>
                      <th className="px-4 py-3">QR Masuk Tutup</th>
                      <th className="px-4 py-3">QR Pulang Mulai</th>
                      <th className="px-4 py-3">Pulang Valid</th>
                      <th className="px-4 py-3">QR Pulang Tutup</th>
                      <th className="px-4 py-3">Sabtu Guru Duty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {DAY_KEYS.map((day) => {
                      const config = policyDraft.days[day];
                      return (
                        <tr key={day} className="bg-white">
                          <td className="px-4 py-3 font-semibold text-slate-900">{DAY_LABELS[day]}</td>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={config.enabled}
                              onChange={(event) =>
                                updatePolicyDay(day, (current) => ({
                                  ...current,
                                  enabled: event.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          {[
                            ['checkIn', 'openAt'],
                            ['checkIn', 'onTimeUntil'],
                            ['checkIn', 'closeAt'],
                            ['checkOut', 'openAt'],
                            ['checkOut', 'validFrom'],
                            ['checkOut', 'closeAt'],
                          ].map(([section, field]) => (
                            <td key={`${day}-${section}-${field}`} className="px-4 py-3">
                              <input
                                type="time"
                                value={(config as any)[section][field]}
                                onChange={(event) =>
                                  updatePolicyDay(day, (current) => ({
                                    ...current,
                                    [section]: {
                                      ...(current as any)[section],
                                      [field]: event.target.value,
                                    },
                                  }))
                                }
                                className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                              />
                            </td>
                          ))}
                          <td className="px-4 py-3">
                            {day === 'SATURDAY' ? (
                              <select
                                value={config.teacherDutySaturdayMode || 'MANUAL'}
                                onChange={(event) =>
                                  updatePolicyDay(day, (current) => ({
                                    ...current,
                                    teacherDutySaturdayMode: event.target.value as 'DISABLED' | 'MANUAL' | 'QR',
                                  }))
                                }
                                className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                              >
                                <option value="DISABLED">Nonaktif</option>
                                <option value="MANUAL">Manual</option>
                                <option value="QR">QR</option>
                              </select>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {modalState && modalCopy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/18 p-4">
          <div className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{modalCopy.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedStudent?.name || '-'} • {selectedStudent?.studentClass?.name || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saveMutation.isPending) return;
                  setModalState(null);
                }}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup popup bantuan presensi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Bantuan petugas wajib menyimpan alasan agar audit tetap rapi. Popup ini tidak tertutup hanya karena area luar diklik.
                </div>

                <div>
                  <label htmlFor="daily-presence-reason" className="mb-1 block text-sm font-medium text-slate-700">
                    Alasan bantuan
                  </label>
                  <textarea
                    id="daily-presence-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={5}
                    placeholder={modalCopy.placeholder}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="daily-presence-gate" className="mb-1 block text-sm font-medium text-slate-700">
                    Titik / Gate (opsional)
                  </label>
                  <input
                    id="daily-presence-gate"
                    value={gateLabel}
                    onChange={(event) => setGateLabel(event.target.value)}
                    placeholder="Contoh: Gerbang Utama / Pos Satpam"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  if (saveMutation.isPending) return;
                  setModalState(null);
                }}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!canSubmitModal}
                onClick={() => {
                  if (!selectedStudentId || !modalState) return;
                  saveMutation.mutate({
                    studentId: Number(selectedStudentId),
                    checkpoint: modalState.checkpoint,
                    reason: reason.trim(),
                    gateLabel: gateLabel.trim() || null,
                  });
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {modalCopy.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
