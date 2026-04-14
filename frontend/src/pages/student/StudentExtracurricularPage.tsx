import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

type ExtracurricularCategory = 'EXTRACURRICULAR' | 'OSIS';
type AttendanceStatus = 'PRESENT' | 'PERMIT' | 'SICK' | 'ABSENT';

interface ExtracurricularOption {
  id: number;
  name: string;
  description?: string | null;
  category?: ExtracurricularCategory;
  tutorAssignments?: Array<{
    tutor?: {
      name?: string | null;
    } | null;
  }>;
}

interface StudentExtracurricularSummary {
  academicYear: {
    id: number;
    name: string;
  } | null;
  regularEnrollment: {
    id: number;
    academicYearId: number;
    grade?: string | null;
    description?: string | null;
    semesterGrades?: {
      sbtsOdd?: { grade?: string | null; description?: string | null };
      sas?: { grade?: string | null; description?: string | null };
      sbtsEven?: { grade?: string | null; description?: string | null };
      sat?: { grade?: string | null; description?: string | null };
    } | null;
    ekskul: {
      id: number;
      name: string;
      description?: string | null;
      tutors?: Array<{
        id?: number;
        name?: string | null;
        username?: string | null;
      }>;
    };
    attendanceSummary: {
      totalSessions: number;
      presentCount: number;
      permitCount: number;
      sickCount: number;
      absentCount: number;
      latestRecords: Array<{
        weekKey?: string | null;
        sessionIndex: number;
        status: AttendanceStatus | string;
        note?: string | null;
      }>;
    };
  } | null;
  osisStatus: {
    academicYearId: number | null;
    membership: {
      id: number;
      division?: { id: number; name: string } | null;
      position?: {
        id: number;
        name: string;
        division?: { id: number; name: string } | null;
      } | null;
    } | null;
    request: {
      id: number;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
      note?: string | null;
      requestedAt: string;
      ekskul?: { id: number; name: string } | null;
    } | null;
    programs: Array<{
      id: number;
      title: string;
      description?: string | null;
      semester?: 'ODD' | 'EVEN' | null;
      startMonth?: number | null;
      endMonth?: number | null;
      startWeek?: number | null;
      endWeek?: number | null;
      executionStatus?: string | null;
      owner?: {
        id: number;
        name: string;
        username?: string | null;
      } | null;
      items?: Array<{
        id: number;
        description: string;
        targetDate?: string | null;
        isCompleted?: boolean;
        note?: string | null;
      }>;
    }>;
  };
  actions: {
    canChooseRegular: boolean;
    canRequestOsis: boolean;
  };
}

interface OptionListResponse {
  extracurriculars: ExtracurricularOption[];
}

function formatShortDate(raw?: string | null) {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatAttendanceStatus(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PRESENT') return 'Hadir';
  if (normalized === 'PERMIT') return 'Izin';
  if (normalized === 'SICK') return 'Sakit';
  if (normalized === 'ABSENT') return 'Alfa';
  return normalized || '-';
}

function getOsisActionLabel(requestStatus?: string | null) {
  return requestStatus === 'REJECTED' ? 'Ajukan Ulang OSIS' : 'Ajukan OSIS';
}

function formatProgramPeriod(
  startMonth?: number | null,
  endMonth?: number | null,
  startWeek?: number | null,
  endWeek?: number | null,
) {
  const monthNames = [
    '',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];

  if (!startMonth || !endMonth || !startWeek || !endWeek) {
    return 'Jadwal belum diatur';
  }

  if (startMonth === endMonth && startWeek === endWeek) {
    return `${monthNames[startMonth] || `Bulan ${startMonth}`} • Minggu ${startWeek}`;
  }

  return `${monthNames[startMonth] || `Bulan ${startMonth}`} M${startWeek} - ${monthNames[endMonth] || `Bulan ${endMonth}`} M${endWeek}`;
}

type SelectionModalProps = {
  open: boolean;
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  options: ExtracurricularOption[];
  loading: boolean;
  submitLabel: string;
  submitting: boolean;
  emptyMessage: string;
  onSelect: (option: ExtracurricularOption) => void;
};

function SelectionModal(props: SelectionModalProps) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 px-4 py-6">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{props.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{props.description}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-6 py-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder="Cari nama kegiatan..."
              className="block w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
          {props.loading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            </div>
          ) : props.options.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              {props.emptyMessage}
            </div>
          ) : (
            <div className="space-y-3">
              {props.options.map((option) => (
                <div
                  key={option.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-slate-900">{option.name}</div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            option.category === 'OSIS'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {option.category === 'OSIS' ? 'Organisasi OSIS' : 'Ekskul Reguler'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Pembina:{' '}
                        {(option.tutorAssignments || [])
                          .map((assignment) => assignment.tutor?.name)
                          .filter(Boolean)
                          .join(', ') || '-'}
                      </div>
                      {option.description ? (
                        <p className="mt-2 text-sm text-slate-700">{option.description}</p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => props.onSelect(option)}
                      disabled={props.submitting}
                      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                        props.submitting ? 'bg-slate-300' : option.category === 'OSIS' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {props.submitting ? 'Memproses...' : props.submitLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type RegularConfirmationModalProps = {
  open: boolean;
  option: ExtracurricularOption | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (option: ExtracurricularOption) => void;
};

function RegularConfirmationModal(props: RegularConfirmationModalProps) {
  if (!props.open || !props.option) return null;
  const option = props.option;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/55 px-4 py-6">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
          <div>
            <h3 className="text-xl font-bold text-slate-900">Konfirmasi Pilihan Ekskul</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ekskul reguler hanya bisa dipilih <span className="font-semibold">1 kali</span> pada tahun ajaran aktif.
              Pastikan Anda benar-benar ingin memilih <span className="font-semibold">{option.name}</span>.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Setelah disimpan, Anda tidak bisa mengganti pilihan langsung dari menu ini.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.submitting}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Periksa Lagi
          </button>
          <button
            type="button"
            onClick={() => props.onConfirm(option)}
            disabled={props.submitting}
            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.submitting ? 'Menyimpan...' : `Ya, Pilih ${option.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export const StudentExtracurricularPage = () => {
  const queryClient = useQueryClient();
  const [regularModalOpen, setRegularModalOpen] = useState(false);
  const [osisModalOpen, setOsisModalOpen] = useState(false);
  const [regularSearch, setRegularSearch] = useState('');
  const [osisSearch, setOsisSearch] = useState('');
  const [regularConfirmationOption, setRegularConfirmationOption] = useState<ExtracurricularOption | null>(null);

  const summaryQuery = useQuery<StudentExtracurricularSummary>({
    queryKey: ['student-extracurricular-summary'],
    queryFn: async () => {
      const response = await api.get('/student/extracurriculars/summary');
      return response.data.data;
    },
  });

  const regularOptionsQuery = useQuery<OptionListResponse>({
    queryKey: ['student-regular-extracurricular-options', regularSearch],
    enabled: regularModalOpen && Boolean(summaryQuery.data?.actions.canChooseRegular),
    queryFn: async () => {
      const response = await api.get('/public/extracurriculars', {
        params: {
          limit: 0,
          category: 'EXTRACURRICULAR',
          search: regularSearch.trim() || undefined,
        },
      });
      return response.data.data;
    },
  });

  const osisOptionsQuery = useQuery<OptionListResponse>({
    queryKey: ['student-osis-options', osisSearch],
    enabled: osisModalOpen && Boolean(summaryQuery.data?.actions.canRequestOsis),
    queryFn: async () => {
      const response = await api.get('/public/extracurriculars', {
        params: {
          limit: 0,
          category: 'OSIS',
          search: osisSearch.trim() || undefined,
        },
      });
      return response.data.data;
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (ekskulId: number) => {
      const academicYearId = summaryQuery.data?.academicYear?.id;
      await api.post('/student/extracurriculars/enroll', {
        ekskulId,
        academicYearId,
      });
    },
    onSuccess: async () => {
      toast.success('Pendaftaran ekskul reguler berhasil');
      setRegularConfirmationOption(null);
      setRegularModalOpen(false);
      setRegularSearch('');
      await queryClient.invalidateQueries({ queryKey: ['student-extracurricular-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['student-regular-extracurricular-options'] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal mendaftar ekskul reguler');
    },
  });

  const osisJoinMutation = useMutation({
    mutationFn: async (ekskulId: number) => {
      const academicYearId = summaryQuery.data?.academicYear?.id;
      await api.post('/osis/student/requests', {
        ekskulId,
        academicYearId,
      });
    },
    onSuccess: async () => {
      toast.success('Pengajuan OSIS berhasil dikirim');
      setOsisModalOpen(false);
      setOsisSearch('');
      await queryClient.invalidateQueries({ queryKey: ['student-extracurricular-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['student-osis-options'] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal mengirim pengajuan OSIS');
    },
  });

  const summary = summaryQuery.data || null;
  const academicYearName = summary?.academicYear?.name || '-';
  const regularEnrollment = summary?.regularEnrollment || null;
  const osisStatus = summary?.osisStatus || null;
  const osisMembership = osisStatus?.membership || null;
  const osisRequest = osisStatus?.request || null;
  const osisPrograms = osisStatus?.programs || [];
  const canChooseRegular = Boolean(summary?.actions.canChooseRegular);
  const canRequestOsis = Boolean(summary?.actions.canRequestOsis);
  const regularOptions = useMemo(
    () => regularOptionsQuery.data?.extracurriculars || [],
    [regularOptionsQuery.data?.extracurriculars],
  );
  const osisOptions = useMemo(
    () => osisOptionsQuery.data?.extracurriculars || [],
    [osisOptionsQuery.data?.extracurriculars],
  );

  const statusBadges = [
    { label: 'Hadir', value: regularEnrollment?.attendanceSummary.presentCount || 0, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { label: 'Izin', value: regularEnrollment?.attendanceSummary.permitCount || 0, className: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: 'Sakit', value: regularEnrollment?.attendanceSummary.sickCount || 0, className: 'bg-sky-50 text-sky-700 border-sky-200' },
    { label: 'Alfa', value: regularEnrollment?.attendanceSummary.absentCount || 0, className: 'bg-rose-50 text-rose-700 border-rose-200' },
  ];

  if (summaryQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (summaryQuery.isError || !summary) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
        Gagal memuat halaman ekstrakurikuler siswa. Silakan muat ulang halaman.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Ekstrakurikuler</h1>
            <p className="mt-1 text-sm text-slate-500">
              Halaman ini merangkum pilihan ekskul reguler, status OSIS, absensi, dan nilai Anda pada tahun ajaran aktif.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm leading-6">
              <span className="font-semibold">Rule siswa:</span> OSIS hanya bisa diajukan sebelum ekskul reguler dipilih.
              Jika OSIS sudah diajukan lebih dulu, Anda tetap boleh memilih <span className="font-semibold">1 ekskul reguler</span>.
              Setelah ekskul reguler dipilih, menu pilihan akan dikunci untuk tahun ajaran {academicYearName}.
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Ekskul Reguler Saya</h2>
                <p className="text-sm text-slate-500">Ringkasan ekskul reguler yang aktif pada tahun ajaran berjalan.</p>
              </div>
              <Trophy className="h-5 w-5 text-blue-600" />
            </div>

            <div className="space-y-5 px-6 py-6">
              {regularEnrollment ? (
                <>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pilihan Aktif</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{regularEnrollment.ekskul.name}</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Pembina:{' '}
                      {regularEnrollment.ekskul.tutors?.map((item) => item.name).filter(Boolean).join(', ') || '-'}
                    </div>
                    {regularEnrollment.ekskul.description ? (
                      <p className="mt-3 text-sm text-slate-700">{regularEnrollment.ekskul.description}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Nilai & Catatan Pembina
                      </div>
                      <div className="space-y-3 text-sm">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">Predikat / Nilai</div>
                          <div className="mt-1 text-lg font-bold text-slate-900">{regularEnrollment.grade || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">Deskripsi</div>
                          <div className="mt-1 text-slate-700">
                            {regularEnrollment.description || 'Belum ada catatan nilai dari pembina.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <ClipboardList className="h-4 w-4 text-sky-600" />
                        Rekap Absensi Ekskul
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {statusBadges.map((item) => (
                          <div key={item.label} className={`rounded-2xl border px-3 py-3 ${item.className}`}>
                            <div className="text-xs font-semibold uppercase tracking-wide">{item.label}</div>
                            <div className="mt-1 text-xl font-bold">{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">
                        Total sesi terekam: {regularEnrollment.attendanceSummary.totalSessions}
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Aktivitas Terakhir
                        </div>
                        {regularEnrollment.attendanceSummary.latestRecords.length > 0 ? (
                          regularEnrollment.attendanceSummary.latestRecords.map((record, index) => (
                            <div
                              key={`${record.weekKey || 'week'}-${record.sessionIndex}-${index}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              <div className="font-medium text-slate-900">
                                {record.weekKey || 'Minggu tidak diketahui'} • Sesi {record.sessionIndex}
                              </div>
                              <div className="mt-1 text-slate-600">
                                Status: {formatAttendanceStatus(record.status)}
                                {record.note ? ` • Catatan: ${record.note}` : ''}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                            Belum ada absensi ekskul yang direkam oleh pembina.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
                  Anda belum memiliki ekskul reguler aktif pada tahun ajaran {academicYearName}.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Status OSIS Saya</h2>
                  <p className="text-sm text-slate-500">Status pengajuan atau penempatan OSIS pada tahun ajaran aktif.</p>
                </div>
                <Users className="h-5 w-5 text-amber-600" />
              </div>

              <div className="space-y-4 px-6 py-6">
                {osisMembership ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Status Aktif</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {osisMembership.position?.name || 'Pengurus OSIS'}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      Divisi: {osisMembership.division?.name || osisMembership.position?.division?.name || '-'}
                    </div>
                  </div>
                ) : osisRequest ? (
                  <div
                    className={`rounded-2xl border px-4 py-4 ${
                      osisRequest.status === 'PENDING'
                        ? 'border-amber-200 bg-amber-50'
                        : osisRequest.status === 'REJECTED'
                          ? 'border-rose-200 bg-rose-50'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {osisRequest.status === 'PENDING'
                        ? 'Menunggu Proses'
                        : osisRequest.status === 'REJECTED'
                          ? 'Ditolak'
                          : 'Riwayat Pengajuan'}
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {osisRequest.ekskul?.name || 'OSIS'}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      Diajukan pada {formatShortDate(osisRequest.requestedAt)}
                    </div>
                    {osisRequest.note ? (
                      <div className="mt-2 text-sm text-slate-700">Catatan pembina: {osisRequest.note}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Anda belum mengajukan OSIS pada tahun ajaran {academicYearName}.
                  </div>
                )}

                {osisMembership ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ClipboardList className="h-4 w-4 text-blue-600" />
                      Program Kerja OSIS
                    </div>

                    {osisPrograms.length > 0 ? (
                      <div className="space-y-3">
                        {osisPrograms.map((program) => (
                          <div key={program.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-slate-900">{program.title}</div>
                              <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                                {program.semester === 'EVEN' ? 'Semester Genap' : 'Semester Ganjil'}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatProgramPeriod(
                                program.startMonth,
                                program.endMonth,
                                program.startWeek,
                                program.endWeek,
                              )}
                              {program.owner?.name ? ` • Pembina: ${program.owner.name}` : ''}
                            </div>
                            {program.description ? (
                              <p className="mt-2 text-sm text-slate-700">{program.description}</p>
                            ) : null}
                            <div className="mt-3 space-y-2">
                              {(program.items || []).length > 0 ? (
                                program.items!.slice(0, 3).map((item) => (
                                  <div
                                    key={item.id}
                                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                  >
                                    <div className="font-medium text-slate-900">{item.description}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {item.targetDate ? `Target: ${formatShortDate(item.targetDate)}` : 'Tanpa tanggal target'}
                                      {item.note ? ` • ${item.note}` : ''}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                  Program kerja ini belum memiliki rincian agenda.
                                </div>
                              )}
                              {(program.items || []).length > 3 ? (
                                <div className="text-xs text-slate-500">
                                  + {(program.items || []).length - 3} agenda OSIS lain sudah disiapkan pembina.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                        Anda sudah masuk struktur OSIS, tetapi program kerja OSIS belum dipublikasikan pembina.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Aksi Yang Tersedia</h2>
                <p className="text-sm text-slate-500">
                  Tombol pilihan hanya muncul jika masih sesuai dengan rule ekstrakurikuler siswa.
                </p>
              </div>

              <div className="space-y-3 px-6 py-6">
                {canChooseRegular || canRequestOsis ? (
                  <>
                    {canChooseRegular ? (
                      <button
                        type="button"
                        onClick={() => setRegularModalOpen(true)}
                        className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Pilih Ekskul Reguler
                      </button>
                    ) : null}

                    {canRequestOsis ? (
                      <button
                        type="button"
                        onClick={() => setOsisModalOpen(true)}
                        className="inline-flex w-full items-center justify-center rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
                      >
                        {getOsisActionLabel(osisRequest?.status)}
                      </button>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      {canChooseRegular && canRequestOsis
                        ? 'Anda masih bisa mengajukan OSIS atau memilih 1 ekskul reguler.'
                        : canChooseRegular
                          ? 'OSIS Anda sudah aktif atau sedang diproses. Anda masih bisa memilih 1 ekskul reguler.'
                          : 'Saat ini hanya pengajuan OSIS yang masih tersedia.'}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    {regularEnrollment
                      ? 'Pilihan ekstrakurikuler Anda sudah terkunci. Tidak ada tombol pilihan tambahan yang ditampilkan.'
                      : 'Tidak ada aksi pilihan yang tersedia saat ini.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SelectionModal
        open={regularModalOpen}
        title="Pilih Ekskul Reguler"
        description="Daftar ini hanya menampilkan ekskul reguler yang masih bisa dipilih untuk tahun ajaran aktif."
        search={regularSearch}
        onSearchChange={setRegularSearch}
        onClose={() => {
          setRegularConfirmationOption(null);
          setRegularModalOpen(false);
          setRegularSearch('');
        }}
        options={regularOptions}
        loading={regularOptionsQuery.isLoading}
        submitLabel="Pilih"
        submitting={enrollMutation.isPending}
        emptyMessage="Tidak ada ekskul reguler yang tersedia."
        onSelect={(option) => setRegularConfirmationOption(option)}
      />

      <SelectionModal
        open={osisModalOpen}
        title={getOsisActionLabel(osisRequest?.status)}
        description="OSIS diproses sebagai organisasi siswa. Pembina OSIS akan menempatkan Anda ke divisi dan jabatan yang sesuai."
        search={osisSearch}
        onSearchChange={setOsisSearch}
        onClose={() => {
          setOsisModalOpen(false);
          setOsisSearch('');
        }}
        options={osisOptions}
        loading={osisOptionsQuery.isLoading}
        submitLabel={getOsisActionLabel(osisRequest?.status)}
        submitting={osisJoinMutation.isPending}
        emptyMessage="Tidak ada item OSIS yang tersedia."
        onSelect={(option) => osisJoinMutation.mutate(option.id)}
      />

      <RegularConfirmationModal
        open={Boolean(regularConfirmationOption)}
        option={regularConfirmationOption}
        submitting={enrollMutation.isPending}
        onCancel={() => setRegularConfirmationOption(null)}
        onConfirm={(option) => enrollMutation.mutate(option.id)}
      />
    </>
  );
};
