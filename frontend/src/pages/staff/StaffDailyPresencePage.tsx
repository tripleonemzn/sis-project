import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Loader2, LogIn, LogOut, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceService, type DailyPresenceEventType } from '../../services/attendance.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { resolveStaffDivision } from '../../utils/staffRole';

type PresenceModalState = {
  checkpoint: DailyPresenceEventType;
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

export default function StaffDailyPresencePage() {
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');
  const [modalState, setModalState] = useState<PresenceModalState>(null);
  const [reason, setReason] = useState('');
  const [gateLabel, setGateLabel] = useState('');

  const meQuery = useQuery({
    queryKey: ['staff-daily-presence-me'],
    queryFn: authService.getMeSafe,
    staleTime: 5 * 60 * 1000,
  });

  const studentsQuery = useQuery({
    queryKey: ['staff-daily-presence-students'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const overviewQuery = useQuery({
    queryKey: ['staff-daily-presence-overview'],
    queryFn: () => attendanceService.getDailyPresenceOverview({ limit: 12 }),
    staleTime: 60 * 1000,
  });

  const selectedStudentQuery = useQuery({
    queryKey: ['staff-daily-presence-student', selectedStudentId],
    enabled: Boolean(selectedStudentId),
    queryFn: () => attendanceService.getStudentDailyPresence({ studentId: Number(selectedStudentId) }),
    staleTime: 30 * 1000,
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

  const currentUser = meQuery.data?.data;
  const canAccess = resolveStaffDivision(currentUser) === 'ADMINISTRATION';
  const students = useMemo(() => (studentsQuery.data?.data || []).filter((item) => item.studentClass), [studentsQuery.data?.data]);

  const filteredStudents = useMemo(() => {
    const normalized = studentSearch.trim().toLowerCase();
    const rows = !normalized
      ? students
      : students.filter((student) => {
          const haystack = [
            student.name,
            student.username,
            student.nis,
            student.nisn,
            student.studentClass?.name,
            student.studentClass?.major?.name,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalized);
        });
    return rows.slice(0, 200);
  }, [studentSearch, students]);

  const selectedStudent = useMemo(
    () => students.find((item) => String(item.id) === String(selectedStudentId)) || null,
    [selectedStudentId, students],
  );

  const modalCopy = modalState ? getCheckpointCopy(modalState.checkpoint) : null;
  const canSubmitModal = Boolean(selectedStudentId) && reason.trim().length >= 3 && !saveMutation.isPending;

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
        <h1 className="text-2xl font-bold text-slate-900">Presensi Harian</h1>
        <p className="mt-2 text-sm text-slate-600">
          Bantu catat absen masuk atau pulang siswa yang mengalami kendala perangkat pada hari ini.
        </p>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Tahun ajaran operasional mengikuti header aktif. Wave pertama ini fokus pada bantuan petugas administrasi agar kejadian HP rusak atau kamera bermasalah tetap tercatat rapi.
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {overviewQuery.isLoading ? (
          <div className="col-span-full flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-10 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memuat ringkasan presensi...
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tanggal Operasional</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {formatTodayLabel(overviewQuery.data?.date)}
              </p>
              <p className="mt-2 text-sm text-slate-500">{overviewQuery.data?.academicYear.name || '-'}</p>
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
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} • {student.studentClass?.name || '-'} • {student.nisn || student.username}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Menampilkan maksimal 200 hasil teratas agar dropdown tetap ringan.
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
                    {selectedStudentQuery.data?.student.class?.name || '-'} • NISN: {selectedStudentQuery.data?.student.nisn || '-'}
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
              <h2 className="text-lg font-semibold text-slate-900">Log Bantuan Hari Ini</h2>
              <p className="mt-1 text-sm text-slate-500">
                Jejak audit presensi yang dibantu petugas pada hari operasional ini.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
              <ClipboardCheck className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
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
                {!overviewQuery.data?.recentEvents.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      Belum ada log presensi pada hari ini.
                    </td>
                  </tr>
                ) : (
                  overviewQuery.data.recentEvents.map((event) => (
                    <tr key={event.id} className="bg-white">
                      <td className="px-3 py-3 text-slate-700">{event.recordedTime || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <div className="font-medium text-slate-900">{event.student?.name || '-'}</div>
                        <div className="text-xs text-slate-500">{event.student?.nisn || event.student?.nis || '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{event.class?.name || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{getEventTypeLabel(event.eventType)}</td>
                      <td className="px-3 py-3 text-slate-700">{getSourceLabel(event.source)}</td>
                      <td className="px-3 py-3 text-slate-600">{event.reason || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{event.actor?.name || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

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
