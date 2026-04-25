import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  Shield,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { attendanceService, type DailyPresenceSelfScanPass, type StudentAttendanceHistory } from '../../services/attendance.service';
import { authService } from '../../services/auth.service';
import { formatCountdownLabel, getDailyPresenceCheckpointLabel } from '../../utils/dailyPresenceSelfScan';

type AttendanceTabKey = 'SCAN' | 'HISTORY';
type Checkpoint = 'CHECK_IN' | 'CHECK_OUT';

const STATUS_LABELS = {
  PRESENT: { label: 'Hadir', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  SICK: { label: 'Sakit', color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
  PERMISSION: { label: 'Izin', color: 'bg-yellow-100 text-yellow-700', icon: FileText },
  ALPHA: { label: 'Alpha', color: 'bg-red-100 text-red-700', icon: XCircle },
  ABSENT: { label: 'Alpha', color: 'bg-red-100 text-red-700', icon: XCircle },
  LATE: { label: 'Terlambat', color: 'bg-orange-100 text-orange-700', icon: Clock },
} as const;

function getPresenceSourceLabel(value?: string | null) {
  if (value === 'SELF_SCAN') return 'Scan Mandiri';
  if (value === 'ASSISTED_SCAN') return 'Bantuan Petugas';
  if (value === 'MANUAL_ADJUSTMENT') return 'Koreksi Manual';
  if (value === 'LEGACY_DAILY') return 'Manual Lama';
  return '-';
}

function formatSessionTime(dateIso?: string | null) {
  if (!dateIso) return '--:--';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolvePhotoUrl(photo?: string | null) {
  const normalized = String(photo || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('/api') || normalized.startsWith('http')) return normalized;
  return `/api/uploads/${normalized}`;
}

function ProtectedQrCard({ pass, countdown }: { pass: DailyPresenceSelfScanPass; countdown: string }) {
  const photoUrl = resolvePhotoUrl(pass.student.photo);

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-blue-100 bg-white">
            {photoUrl ? (
              <img src={photoUrl} alt={pass.student.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-blue-700">{pass.student.name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{pass.student.name}</p>
            <p className="text-sm text-slate-600">
              {pass.student.class?.name || '-'} • {pass.student.nis || pass.student.nisn || '-'}
            </p>
            <p className="mt-1 text-xs font-medium text-blue-700">
              {pass.session.gateLabel ? `Checkpoint ${pass.session.gateLabel}` : 'Checkpoint aktif petugas'}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-blue-200 bg-white p-4">
          <img
            src={pass.qrCodeDataUrl}
            alt={`QR ${getDailyPresenceCheckpointLabel(pass.checkpoint)}`}
            className="h-56 w-56 max-w-full rounded-2xl border border-slate-200 bg-white object-contain p-3"
          />
          <p className="mt-3 text-sm font-semibold text-slate-900">
            QR {getDailyPresenceCheckpointLabel(pass.checkpoint)}
          </p>
          <p className="mt-1 text-xs text-slate-500">QR berlaku singkat dan tidak untuk dibagikan.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Masa Berlaku</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{countdown}</p>
        <p className="mt-1 text-xs text-slate-500">
          Setelah waktu habis, buat QR baru dengan challenge yang sedang aktif.
        </p>
      </div>
    </div>
  );
}

export default function StudentAttendancePage() {
  const [activeTab, setActiveTab] = useState<AttendanceTabKey>('SCAN');
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [checkpoint, setCheckpoint] = useState<Checkpoint>('CHECK_IN');
  const [challengeCode, setChallengeCode] = useState('');
  const [currentPass, setCurrentPass] = useState<DailyPresenceSelfScanPass | null>(null);
  const [, setTicker] = useState(Date.now());

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMeSafe,
    staleTime: 5 * 60 * 1000,
  });

  const user = meQuery.data?.data || null;

  const todayPresenceQuery = useQuery({
    queryKey: ['student-daily-presence-me'],
    enabled: user?.role === 'STUDENT',
    queryFn: () => attendanceService.getOwnDailyPresence(),
    staleTime: 20 * 1000,
  });

  const activeSessionQuery = useQuery({
    queryKey: ['student-self-scan-session', checkpoint],
    enabled: user?.role === 'STUDENT' && activeTab === 'SCAN',
    queryFn: () => attendanceService.getActiveSelfScanSession({ checkpoint }),
    staleTime: 20 * 1000,
  });

  const historyQuery = useQuery({
    queryKey: ['student-attendance-history', filterYear, filterMonth],
    enabled: user?.role === 'STUDENT',
    queryFn: async () => {
      const response = await attendanceService.getStudentHistory({
        month: filterMonth,
        year: filterYear,
      });
      return response.success ? response.data : [];
    },
    staleTime: 60 * 1000,
  });

  const createPassMutation = useMutation({
    mutationFn: () =>
      attendanceService.createSelfScanPass({
        checkpoint,
        challengeCode: challengeCode.replace(/\D+/g, ''),
      }),
    onSuccess: (result) => {
      setCurrentPass(result);
      void todayPresenceQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal membuat QR presensi.');
    },
  });

  useEffect(() => {
    if (!currentPass) return undefined;
    const timer = window.setInterval(() => {
      setTicker(Date.now());
      if (new Date(currentPass.qrExpiresAt).getTime() <= Date.now()) {
        setCurrentPass(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentPass]);

  useEffect(() => {
    setCurrentPass(null);
    setChallengeCode('');
  }, [checkpoint]);

  const records = historyQuery.data || [];
  const stats = useMemo(() => {
    return {
      present: records.filter((item) => item.status === 'PRESENT' || item.status === 'LATE').length,
      sick: records.filter((item) => item.status === 'SICK').length,
      permission: records.filter((item) => item.status === 'PERMISSION').length,
      alpha: records.filter((item) => item.status === 'ALPHA' || item.status === 'ABSENT').length,
      late: records.filter((item) => item.status === 'LATE').length,
    };
  }, [records]);

  const canCreatePass =
    Boolean(activeSessionQuery.data?.sessionId) &&
    challengeCode.replace(/\D+/g, '').length === 6 &&
    !createPassMutation.isPending;
  const todayPresence = todayPresenceQuery.data?.presence || null;
  const currentPassCountdown = currentPass ? formatCountdownLabel(currentPass.qrExpiresAt) : '--:--';
  const activeSession = activeSessionQuery.data;

  if (meQuery.isLoading && !user) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
        Memuat absensi siswa...
      </div>
    );
  }

  if (user?.role !== 'STUDENT') {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        Fitur absensi ini khusus untuk siswa.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Absensi Saya</h1>
            <p className="mt-2 text-sm text-slate-600">
              QR presensi harian untuk scan mandiri dan riwayat kehadiran bulanan.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'SCAN', label: 'Scan Presensi', Icon: Shield },
            { key: 'HISTORY', label: 'Riwayat', Icon: Calendar },
          ].map(({ key, label, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as AttendanceTabKey)}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                  active ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'SCAN' ? (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Siswa membuat QR sekali pakai setelah memasukkan challenge dari petugas. QR berlaku singkat dan tidak untuk dibagikan.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Status Hari Ini</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Masuk</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">{todayPresence?.checkInTime || '-'}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Sumber: {getPresenceSourceLabel(todayPresence?.checkInSource)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pulang</p>
                  <p className="mt-2 text-2xl font-bold text-sky-700">{todayPresence?.checkOutTime || '-'}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Sumber: {getPresenceSourceLabel(todayPresence?.checkOutSource)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Checkpoint Aktif</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['CHECK_IN', 'CHECK_OUT'] as const).map((item) => {
                  const active = checkpoint === item;
                  const Icon = item === 'CHECK_IN' ? LogIn : LogOut;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCheckpoint(item)}
                      className={clsx(
                        'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                        active ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      Absen {getDailyPresenceCheckpointLabel(item)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {activeSessionQuery.isLoading ? (
                  <div className="flex items-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memeriksa sesi scan petugas...
                  </div>
                ) : activeSessionQuery.isError ? (
                  <p className="text-sm text-rose-600">Gagal memeriksa sesi scan petugas.</p>
                ) : activeSession ? (
                  <>
                    <p className="font-semibold text-slate-900">
                      Sesi {getDailyPresenceCheckpointLabel(checkpoint)} Sedang Dibuka
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {activeSession.gateLabel ? `Checkpoint ${activeSession.gateLabel}.` : 'Checkpoint petugas aktif.'}{' '}
                      Sesi berakhir {formatSessionTime(activeSession.sessionExpiresAt)}.
                    </p>

                    <label htmlFor="student-self-scan-challenge" className="mt-4 block text-sm font-medium text-slate-700">
                      Masukkan challenge 6 digit yang tampil di layar petugas
                    </label>
                    <input
                      id="student-self-scan-challenge"
                      value={challengeCode}
                      onChange={(event) => {
                        setCurrentPass(null);
                        setChallengeCode(event.target.value.replace(/\D+/g, '').slice(0, 6));
                      }}
                      inputMode="numeric"
                      placeholder="Contoh: 123456"
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-bold tracking-[0.35em] text-slate-900 outline-none transition focus:border-blue-500"
                    />

                    <button
                      type="button"
                      onClick={() => createPassMutation.mutate()}
                      disabled={!canCreatePass}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {createPassMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      {createPassMutation.isPending ? 'Membuat QR...' : `Buat QR ${getDailyPresenceCheckpointLabel(checkpoint)}`}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-slate-900">Petugas belum membuka sesi scan</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Minta petugas administrasi membuka sesi {getDailyPresenceCheckpointLabel(checkpoint).toLowerCase()} di perangkat mereka,
                      lalu muat ulang halaman ini bila perlu.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {currentPass ? <ProtectedQrCard pass={currentPass} countdown={currentPassCountdown} /> : null}
        </>
      ) : null}

      {activeTab === 'HISTORY' ? (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Riwayat Kehadiran</h2>
              <p className="mt-1 text-sm text-slate-500">Pantau kehadiran Anda setiap hari.</p>
            </div>

            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={filterMonth}
                  onChange={(event) => setFilterMonth(Number(event.target.value))}
                  className="appearance-none bg-transparent py-2 pl-9 pr-2 text-sm font-medium text-slate-700 outline-none"
                >
                  {Array.from({ length: 12 }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {new Date(0, index).toLocaleString('id-ID', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mx-2 h-5 w-px bg-slate-300" />

              <div className="relative">
                <select
                  value={filterYear}
                  onChange={(event) => setFilterYear(Number(event.target.value))}
                  className="appearance-none bg-transparent px-2 py-2 text-center text-sm font-medium text-slate-700 outline-none"
                >
                  {[0, 1, 2].map((index) => {
                    const year = new Date().getFullYear() - index;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              { key: 'present', label: 'Hadir', Icon: CheckCircle, tone: 'bg-green-100 text-green-600' },
              { key: 'sick', label: 'Sakit', Icon: AlertCircle, tone: 'bg-blue-100 text-blue-600' },
              { key: 'permission', label: 'Izin', Icon: FileText, tone: 'bg-yellow-100 text-yellow-600' },
              { key: 'alpha', label: 'Alpha', Icon: XCircle, tone: 'bg-red-100 text-red-600' },
              { key: 'late', label: 'Telat', Icon: Clock, tone: 'bg-orange-100 text-orange-600' },
            ].map(({ key, label, Icon, tone }) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-3">
                  <div className={clsx('rounded-lg p-2', tone)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">{label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{stats[key as keyof typeof stats]}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">Detail Kehadiran</h3>
            </div>

            {historyQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : historyQuery.isError ? (
              <div className="px-6 py-12 text-center text-sm text-rose-600">
                Gagal memuat riwayat kehadiran untuk periode ini.
              </div>
            ) : records.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 font-medium text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Tanggal</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Waktu Masuk</th>
                      <th className="px-6 py-3">Waktu Pulang</th>
                      <th className="px-6 py-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((attendance: StudentAttendanceHistory) => {
                      const statusMeta = STATUS_LABELS[attendance.status];
                      const StatusIcon = statusMeta.icon;
                      return (
                        <tr key={attendance.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {new Date(attendance.date).toLocaleDateString('id-ID', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                                statusMeta.color,
                              )}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-600">{attendance.checkInTime || '-'}</td>
                          <td className="px-6 py-4 font-mono text-slate-600">{attendance.checkOutTime || '-'}</td>
                          <td className="px-6 py-4 text-slate-500">{attendance.note || attendance.notes || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white py-12 text-center">
                <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <h3 className="text-lg font-medium text-slate-900">Tidak ada data kehadiran</h3>
                <p className="text-slate-500">Pilih bulan lain untuk melihat riwayat.</p>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
