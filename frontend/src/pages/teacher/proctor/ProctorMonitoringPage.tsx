import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, Clock, BookOpen, UserCircle2, MapPin, FileText, X } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';

interface StudentData {
  id: number; // student ID
  name: string;
  nis: string;
  className: string;
  answeredCount?: number;
  totalQuestions?: number;
  monitoring?: {
    totalViolations?: number;
    tabSwitchCount?: number;
    fullscreenExitCount?: number;
    appSwitchCount?: number;
    lastViolationType?: string | null;
    lastViolationAt?: string | null;
    currentQuestionIndex?: number;
    currentQuestionNumber?: number;
    currentQuestionId?: string | null;
    lastSyncAt?: string | null;
  };
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';
  startTime: string | null;
  submitTime: string | null;
  restriction?: {
    isBlocked: boolean;
    reason?: string | null;
    manualBlocked?: boolean;
    autoBlocked?: boolean;
    statusLabel?: string | null;
  };
}

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  token: string | null;
  examType?: string | null;
  serverNow?: string;
  displayTitle?: string;
  examLabel?: string;
  academicYearName?: string | null;
  subjectName?: string;
  classNames?: string[];
  teacherNames?: string[];
  monitoredScheduleIds?: number[];
  attendanceSummary?: {
    expectedParticipants?: number;
    presentParticipants?: number;
    absentParticipants?: number;
  };
  packet: {
    title: string;
    subject: { name: string };
    duration: number;
  } | null;
  proctoringReports?: Array<{
    id: number;
    signedAt?: string;
    updatedAt?: string;
    notes?: string | null;
    incident?: string | null;
    documentNumber?: string | null;
  }>;
  class: {
    id: number;
    name: string;
  } | null;
}

function mergeProctorReportNotes(notes?: string | null, incident?: string | null) {
  return [String(notes || '').trim(), String(incident || '').trim()].filter(Boolean).join('\n\n');
}

function normalizeExamHeading(label?: string | null) {
  const normalized = String(label || '').replace(/^ujian\s+/i, '').trim();
  return normalized ? normalized.toUpperCase() : 'UJIAN';
}

const ACTIVE_MONITORING_INTERVAL_MS = 7000;
const IDLE_MONITORING_INTERVAL_MS = 30000;

const ProctorMonitoringPage: React.FC = () => {
  const { id: scheduleId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [serverTimeDriftMinutes, setServerTimeDriftMinutes] = useState<number | null>(null);

  // Berita Acara State
  const [notes, setNotes] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['teacher-proctor-monitoring', scheduleId || 'unknown'],
    enabled: Boolean(scheduleId),
    queryFn: async () => {
      const res = await api.get(`/proctoring/schedules/${scheduleId}`);
      return res.data.data as { schedule: ExamSchedule; students: StudentData[] };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      const nextSchedule = (query.state.data as { schedule?: ExamSchedule } | undefined)?.schedule;
      const startMs = new Date(String(nextSchedule?.startTime || '')).getTime();
      const endMs = new Date(String(nextSchedule?.endTime || '')).getTime();
      const serverNowMs = nextSchedule?.serverNow ? new Date(nextSchedule.serverNow).getTime() : Date.now();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && serverNowMs >= startMs && serverNowMs <= endMs) {
        return ACTIVE_MONITORING_INTERVAL_MS;
      }
      return IDLE_MONITORING_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });

  const schedule = detailQuery.data?.schedule || null;
  const students = detailQuery.data?.students || [];

  useEffect(() => {
    if (!isReportModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isReportModalOpen]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await detailQuery.refetch();
      toast.success('Data diperbarui');
    } catch {
      toast.error('Gagal memuat data ujian');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmitReport = async () => {
    const referenceNowMs = schedule?.serverNow ? new Date(schedule.serverNow).getTime() : Date.now();
    const scheduleStartMs = schedule?.startTime ? new Date(schedule.startTime).getTime() : NaN;
    if (Number.isFinite(scheduleStartMs) && referenceNowMs < scheduleStartMs) {
      toast.error('Berita acara baru bisa dikirim setelah ujian dimulai sesuai jadwal pelaksanaan.');
      return;
    }
    if (!confirm('Apakah Anda yakin ingin mengirim berita acara ini ke Kurikulum?')) return;

    setSubmittingReport(true);
    try {
      const presentCount =
        Number(schedule?.attendanceSummary?.presentParticipants) ||
        students.filter((s) => Boolean(s.startTime) || s.status !== 'NOT_STARTED').length;
      const absentCount = Math.max(
        0,
        (Number(schedule?.attendanceSummary?.expectedParticipants) || students.length) - presentCount,
      );

      await api.post(`/proctoring/schedules/${scheduleId}/report`, {
        notes,
        incident: '',
        studentCountPresent: presentCount,
        studentCountAbsent: absentCount
      });
      setReportSubmitted(true);
      toast.success('Berita acara berhasil dikirim ke Kurikulum');
      await detailQuery.refetch();
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Gagal mengirim berita acara');
    } finally {
      setSubmittingReport(false);
    }
  };

  const latestReport = useMemo(() => {
    const reportRows = Array.isArray(schedule?.proctoringReports)
      ? [...schedule.proctoringReports]
      : [];
    return reportRows
      .sort((a, b) => {
        const aTime = new Date(String(a.updatedAt || a.signedAt || 0)).getTime();
        const bTime = new Date(String(b.updatedAt || b.signedAt || 0)).getTime();
        return bTime - aTime;
      })[0] || null;
  }, [schedule?.proctoringReports]);

  useEffect(() => {
    const hasExistingReport = Boolean(latestReport?.id);
    setReportSubmitted(hasExistingReport);
    if (!hasExistingReport) return;
    if (!isReportModalOpen) {
      setNotes((current) => (current.trim() ? current : mergeProctorReportNotes(latestReport?.notes, latestReport?.incident)));
    }
  }, [isReportModalOpen, latestReport?.id, latestReport?.incident, latestReport?.notes]);

  useEffect(() => {
    const serverNowMs = schedule?.serverNow ? new Date(schedule.serverNow).getTime() : NaN;
    if (Number.isFinite(serverNowMs)) {
      const driftMs = Math.abs(Date.now() - serverNowMs);
      setServerTimeDriftMinutes(driftMs >= 2 * 60 * 1000 ? Math.round(driftMs / 60000) : null);
      return;
    }
    setServerTimeDriftMinutes(null);
  }, [schedule?.serverNow]);

  if (detailQuery.isLoading) return <div className="p-6">Loading...</div>;
  if (detailQuery.isError) return <div className="p-6">Gagal memuat data monitoring ujian</div>;
  if (!schedule) return <div className="p-6">Jadwal tidak ditemukan</div>;

  const romanLevelRank = (level: string): number => {
    const value = String(level || '').toUpperCase();
    if (value === 'X') return 10;
    if (value === 'XI') return 11;
    if (value === 'XII') return 12;
    return 99;
  };

  const parseClassName = (raw: string) => {
    const text = String(raw || '').trim();
    const parts = text.split(/\s+/).filter(Boolean);
    const level = parts[0] || '';
    const tail = parts.slice(1).join(' ');
    const numberMatch = tail.match(/(\d+)\s*$/);
    const roomNumber = numberMatch ? Number(numberMatch[1]) : Number.MAX_SAFE_INTEGER;
    const major = numberMatch ? tail.replace(/\s*\d+\s*$/, '').trim() : tail;
    return {
      levelRank: romanLevelRank(level),
      major: major.toUpperCase(),
      roomNumber,
      original: text,
    };
  };

  const compareClassName = (a: string, b: string) => {
    const pa = parseClassName(a);
    const pb = parseClassName(b);
    if (pa.levelRank !== pb.levelRank) return pa.levelRank - pb.levelRank;
    if (pa.major !== pb.major) return pa.major.localeCompare(pb.major, 'id');
    if (pa.roomNumber !== pb.roomNumber) return pa.roomNumber - pb.roomNumber;
    return pa.original.localeCompare(pb.original, 'id');
  };

  const title = schedule.displayTitle || schedule.packet?.title || `Ujian ${schedule.subjectName || schedule.packet?.subject?.name || '-'}`;
  const subjectName = schedule.subjectName || schedule.packet?.subject?.name || '-';
  const examHeading = normalizeExamHeading(schedule.examLabel || schedule.examType || title);
  const classNames = schedule.classNames?.length ? schedule.classNames : (schedule.class?.name ? [schedule.class.name] : ['-']);
  const teacherNames = schedule.teacherNames?.length ? schedule.teacherNames : ['-'];
  const orderedClassNames = [...classNames].sort(compareClassName);
  const orderedStudents = [...students].sort((a, b) => {
    const classCompare = compareClassName(a.className || '', b.className || '');
    if (classCompare !== 0) return classCompare;
    return String(a.name || '').localeCompare(String(b.name || ''), 'id');
  });
  const nowMs = Date.now();
  const referenceNowMs = schedule.serverNow ? new Date(schedule.serverNow).getTime() : nowMs;
  const scheduleStartMs = new Date(schedule.startTime).getTime();
  const scheduleEndMs = new Date(schedule.endTime).getTime();
  const isScheduleStarted = Number.isFinite(scheduleStartMs) && referenceNowMs >= scheduleStartMs;
  const isScheduleRunning =
    Number.isFinite(scheduleStartMs) &&
    Number.isFinite(scheduleEndMs) &&
    referenceNowMs >= scheduleStartMs &&
    referenceNowMs <= scheduleEndMs;
  const presentCount =
    Number(schedule.attendanceSummary?.presentParticipants) ||
    orderedStudents.filter((student) => Boolean(student.startTime) || student.status !== 'NOT_STARTED').length;
  const expectedCount = Number(schedule.attendanceSummary?.expectedParticipants) || orderedStudents.length;
  const absentCount = Math.max(
    0,
    (Number(schedule.attendanceSummary?.absentParticipants) || expectedCount - presentCount),
  );
  const blockedCount = orderedStudents.filter((student) => Boolean(student.restriction?.isBlocked)).length;
  const waitingStartCount = orderedStudents.filter(
    (student) => student.status === 'NOT_STARTED' && !student.restriction?.isBlocked,
  ).length;
  const previewDate = new Date(schedule.startTime);
  const previewWeekday = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { weekday: 'long' });
  const previewDay = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { day: 'numeric' });
  const previewMonth = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { month: 'long' });
  const previewYear = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { year: 'numeric' });
  const previewNarrative =
    `Pada hari ini, ${previewWeekday} tanggal ${previewDay} bulan ${previewMonth} tahun ${previewYear} ` +
    `telah dilaksanakan ${examHeading} Mata Pelajaran ${subjectName} mulai pukul ` +
    `${new Date(schedule.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ` +
    `sampai dengan pukul ${new Date(schedule.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ` +
    `di ruang ${schedule.room || 'Belum ditentukan'}.`;
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
          <button 
            onClick={() => navigate('/teacher/proctoring')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
            <div className="h-6 w-px bg-gray-200 mt-1 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600 mt-1">{orderedClassNames.join(' • ')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleRefresh} 
              disabled={refreshing}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {(serverTimeDriftMinutes !== null || (isScheduleRunning && waitingStartCount > 0)) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Peringatan Sinkronisasi Waktu</p>
          {serverTimeDriftMinutes !== null ? (
            <p className="text-sm text-amber-700 mt-1">
              Jam perangkat pengawas berbeda sekitar {serverTimeDriftMinutes} menit dari server. Aktifkan
              sinkronisasi waktu otomatis agar monitoring akurat.
            </p>
          ) : (
            <p className="text-sm text-amber-700 mt-1">
              Jika siswa melapor tombol mulai tidak muncul (`-`), cek jam perangkat siswa dan pastikan
              sinkronisasi waktu otomatis aktif (tanggal/jam/timezone harus sesuai server).
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-5">
        <div className="space-y-5">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-medium text-gray-900">Status Peserta Ujian</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                    Seharusnya: {expectedCount}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    Hadir: {presentCount}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">
                    Tidak hadir: {absentCount}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                    Diblokir: {blockedCount}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Mulai</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Selesai</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orderedStudents.map((student) => (
                      <tr key={student.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{student.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{student.nis || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.className || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {student.restriction?.isBlocked ? (
                            <div className="space-y-1 max-w-xs">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                                {student.restriction.statusLabel || 'Diblokir'}
                              </span>
                              <div className="text-xs text-amber-800 leading-5 whitespace-normal">
                                {student.restriction.reason || 'Akses ujian ditutup.'}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                Status sesi: {student.status === 'NOT_STARTED' ? 'Belum Mulai' : student.status === 'IN_PROGRESS' ? 'Sedang Mengerjakan' : student.status === 'COMPLETED' ? 'Selesai' : 'Waktu Habis'}
                              </div>
                            </div>
                          ) : student.status === 'NOT_STARTED' ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Belum Mulai
                            </span>
                          ) : null}
                          {!student.restriction?.isBlocked && student.status === 'IN_PROGRESS' && (
                            <div className="space-y-1">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                Sedang Mengerjakan
                              </span>
                              <div className="text-xs text-blue-700">
                                {student.answeredCount || 0} dari {student.totalQuestions || 0} soal
                              </div>
                              <div className="text-[11px] text-blue-600">
                                Soal aktif: {student.monitoring?.currentQuestionNumber || ((student.monitoring?.currentQuestionIndex || 0) + 1)}
                              </div>
                            </div>
                          )}
                          {!student.restriction?.isBlocked && student.status === 'COMPLETED' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Selesai
                            </span>
                          )}
                          {!student.restriction?.isBlocked && student.status === 'TIMEOUT' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                              Waktu Habis
                            </span>
                          )}
                          {!!student.monitoring && (
                            <div className="text-[11px] text-gray-500 mt-1">
                              Pelanggaran: {student.monitoring.totalViolations || 0} (tab: {student.monitoring.tabSwitchCount || 0}, fullscreen: {student.monitoring.fullscreenExitCount || 0}, app: {student.monitoring.appSwitchCount || 0})
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.startTime ? new Date(student.startTime).toLocaleTimeString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.submitTime ? new Date(student.submitTime).toLocaleTimeString('id-ID') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Informasi Ujian</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-500">Mata Pelajaran</label>
                <div className="mt-1 flex items-center gap-2 text-gray-900 font-medium">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  <span>{subjectName}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500">Guru Pengampu</label>
                <div className="mt-1 flex items-start gap-2 text-gray-900">
                  <UserCircle2 className="h-4 w-4 text-gray-400 mt-0.5" />
                  <span className="font-medium">{teacherNames.join(', ')}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500">Waktu</label>
                <div className="flex items-center mt-1">
                  <Clock className="h-4 w-4 mr-2 text-gray-400" />
                  <span>{new Date(schedule.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500">Ruangan</label>
                <div className="mt-1 flex items-center gap-2 font-medium text-gray-900">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span>{schedule.room || 'Belum ditentukan'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Berita Acara</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {reportSubmitted ? 'Berita acara sudah dikirim' : 'Siapkan berita acara sebelum dikirim'}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      {reportSubmitted
                        ? 'Setelah terkirim, berita acara menjadi arsip dan catatan pengawas bersifat read-only dari sisi pengawas.'
                        : 'Buka panel berita acara untuk meninjau preview dokumen, mengisi catatan pengawas, lalu kirim ke Kurikulum.'}
                    </div>
                    {latestReport?.documentNumber ? (
                      <div className="mt-2 text-xs font-medium text-slate-500">No. Dokumen: {latestReport.documentNumber}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(true)}
                    className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold ${
                      reportSubmitted
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {reportSubmitted ? 'Lihat Berita Acara' : 'Buka Berita Acara'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isReportModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Pratinjau Berita Acara</h4>
                <p className="mt-1 text-sm text-slate-600">
                  {reportSubmitted
                    ? 'Berita acara ini sudah dikirim ke Kurikulum dan tampil sebagai arsip pengawas.'
                    : 'Tinjau isi dokumen resmi sebelum dikirim ke Kurikulum.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  reportSubmitted
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}>
                  {reportSubmitted ? 'Arsip' : 'Draft'}
                </div>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Tutup berita acara"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              {reportSubmitted ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-semibold">Berita acara sudah terkirim ke Kurikulum.</div>
                  <div className="mt-1">Cetak dan distribusi dokumen resmi menjadi tanggung jawab Wakasek Kurikulum / sekretaris.</div>
                  {latestReport?.id ? (
                    <button
                      type="button"
                      onClick={() => window.open(`/print/proctor-report/${latestReport.id}`, '_blank', 'noopener')}
                      className="mt-3 inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Lihat Dokumen Resmi
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-slate-300 bg-white px-5 py-5">
                <div className="text-center text-slate-900">
                  <div className="text-lg font-semibold tracking-wide">BERITA ACARA</div>
                  <div className="mt-1 text-[13px] font-semibold uppercase">{examHeading}</div>
                  <div className="mt-1 text-[13px] font-semibold uppercase">SMKS KARYA GUNA BHAKTI 2</div>
                  <div className="mt-1 text-[12px] font-semibold uppercase">
                    Tahun Ajaran {schedule.academicYearName || '-'}
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-900" />
                <div className="mt-1 border-t-2 border-slate-900" />
                <p className="mt-5 text-[13px] leading-7 text-slate-800 text-justify">{previewNarrative}</p>
                <div className="mt-5 grid gap-2 text-[13px] text-slate-900">
                  <div className="grid grid-cols-[210px_16px_1fr]">
                    <div>Jumlah Peserta Seharusnya</div>
                    <div>:</div>
                    <div>{expectedCount}</div>
                  </div>
                  <div className="grid grid-cols-[210px_16px_1fr]">
                    <div>Jumlah Peserta yang tidak hadir</div>
                    <div>:</div>
                    <div>{absentCount}</div>
                  </div>
                  <div className="grid grid-cols-[210px_16px_1fr]">
                    <div>Jumlah Peserta yang hadir</div>
                    <div>:</div>
                    <div>{presentCount}</div>
                  </div>
                </div>
                <div className="mt-6">
                  <label className="block text-[13px] font-medium text-slate-900">Catatan Pengawas selama Ujian berlangsung</label>
                  <textarea
                    className={`mt-2 block w-full rounded-xl border px-4 py-4 text-[13px] leading-7 shadow-sm ${
                      reportSubmitted || !isScheduleStarted
                        ? 'border-slate-200 bg-slate-100 text-slate-600'
                        : 'border-gray-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500'
                    }`}
                    rows={6}
                    placeholder="Contoh: Ujian berjalan lancar, seluruh siswa hadir, tidak ada kendala perangkat..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    readOnly={reportSubmitted || !isScheduleStarted}
                  />
                  {!reportSubmitted && !isScheduleStarted ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Berita acara baru bisa diisi setelah waktu ujian mulai sesuai jadwal pelaksanaan.
                    </p>
                  ) : null}
                  {reportSubmitted ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Catatan tidak bisa diubah lagi karena berita acara sudah masuk arsip setelah dikirim ke Kurikulum.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-5 py-4">
              <button
                className={`w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                  reportSubmitted
                    ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'
                    : !isScheduleStarted
                      ? 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500'
                      : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                }`}
                onClick={handleSubmitReport}
                disabled={submittingReport || reportSubmitted}
              >
                <Save className="h-4 w-4 mr-2" />
                {submittingReport
                  ? 'Menyimpan...'
                  : reportSubmitted
                    ? 'Terkirim ke Kurikulum'
                    : !isScheduleStarted
                      ? 'Menunggu Waktu Ujian'
                      : 'Kirim ke Kurikulum'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProctorMonitoringPage;
