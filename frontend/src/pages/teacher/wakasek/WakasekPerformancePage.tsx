import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Loader2,
  MonitorCog,
  Users,
} from 'lucide-react';
import { academicYearService } from '../../../services/academicYear.service';
import { examService, type ExamProgram } from '../../../services/exam.service';
import api from '../../../services/api';
import { isNonScheduledExamProgram, resolveProgramCodeFromParam } from '../../../lib/examProgramMenu';
import { workProgramService } from '../../../services/workProgram.service';
import { liveQueryOptions } from '../../../lib/query/liveQuery';
import {
  teachingResourceProgramCodeToSlug,
  teachingResourceProgramService,
  type TeachingResourceEntry,
  type TeachingResourceEntryStatus,
} from '../../../services/teachingResourceProgram.service';

type AcademicYearLite = {
  id: number;
  name: string;
};

type ProctorReportRow = {
  room: string | null;
  startTime: string;
  endTime: string;
  sessionLabel?: string | null;
  examType?: string | null;
  classNames: string[];
  expectedParticipants: number;
  presentParticipants: number;
  absentParticipants: number;
  report: {
    id: number;
    signedAt: string;
    notes: string | null;
    incident: string | null;
    proctor: { id: number; name: string } | null;
  } | null;
};

type ProctorReportSummary = {
  totalRooms: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  reportedRooms: number;
};

type ExamScheduleRow = {
  id: number;
  startTime: string;
  endTime: string;
  sessionLabel?: string | null;
  room: string | null;
};

type PendingWorkProgram = {
  id: number;
  title: string;
  approvalStatus?: string | null;
  createdAt?: string;
  academicYearId?: number | null;
  academicYear?: {
    id?: number | null;
    name?: string | null;
  } | null;
  owner?: {
    name?: string | null;
  } | null;
  additionalDuty?: string | null;
};

type TeachingResourceSummaryData = {
  total: number;
  submitted: number;
  approved: number;
  rejected: number;
  draft: number;
  latest: TeachingResourceEntry[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const daysSince = (value?: string | null): number => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
};

const sortRowsBySchedule = (rows: ProctorReportRow[]) => {
  return [...rows].sort((a, b) => {
    const sessionA = String(a.sessionLabel || '');
    const sessionB = String(b.sessionLabel || '');
    if (sessionA !== sessionB) return sessionA.localeCompare(sessionB, 'id', { numeric: true });
    if (a.startTime !== b.startTime) return String(a.startTime).localeCompare(String(b.startTime));
    return String(a.room || '').localeCompare(String(b.room || ''), 'id', { numeric: true });
  });
};

const formatTimeRange = (startTime: string, endTime: string): string => {
  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };
  return `${formatTime(startTime)} - ${formatTime(endTime)} WIB`;
};

const normalizeRoomSlotKey = (schedule: ExamScheduleRow): string =>
  `${String(schedule.room || '').trim().toLowerCase()}::${String(schedule.startTime)}::${String(schedule.endTime)}::${String(
    schedule.sessionLabel || '',
  )
    .trim()
    .toLowerCase()}`;

const countTeachingResourceStatus = (
  rows: Array<{ status: TeachingResourceEntryStatus; total: number }>,
  status: TeachingResourceEntryStatus,
): number => {
  return rows.find((item) => item.status === status)?.total || 0;
};

const teachingResourceStatusMeta: Record<
  TeachingResourceEntryStatus,
  {
    label: string;
    pillClass: string;
  }
> = {
  DRAFT: { label: 'Draft', pillClass: 'bg-gray-100 text-gray-700 border border-gray-200' },
  SUBMITTED: { label: 'Menunggu Review', pillClass: 'bg-amber-50 text-amber-700 border border-amber-200' },
  APPROVED: { label: 'Disetujui', pillClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  REJECTED: { label: 'Revisi', pillClass: 'bg-rose-50 text-rose-700 border border-rose-200' },
};

export default function WakasekPerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || todayIso());
  const [selectedProgramCode, setSelectedProgramCode] = useState(() =>
    String(searchParams.get('program') || '').trim().toUpperCase(),
  );

  const filtersQuery = useQuery({
    queryKey: ['wakasek-performance-filters'],
    queryFn: async () => {
      const activeResponse = await academicYearService.getActiveSafe().catch(() => null);
      const activeYear = (activeResponse?.data || null) as AcademicYearLite | null;
      if (!activeYear?.id) {
        return { activeYear: null as AcademicYearLite | null, programs: [] as ExamProgram[] };
      }

      const programsResponse = await examService.getPrograms({
        academicYearId: Number(activeYear.id),
        roleContext: 'all',
        includeInactive: false,
      });
      const allPrograms = programsResponse?.data?.programs || [];
      const programs = allPrograms
        .filter((program) => Boolean(program?.isActive) && !isNonScheduledExamProgram(program))
        .sort(
          (a, b) =>
            Number(a.order || 0) - Number(b.order || 0) ||
            String(a.label || '').localeCompare(String(b.label || '')),
        );

      return { activeYear, programs };
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const programs = filtersQuery.data?.programs || [];
    if (programs.length === 0) return;
    const resolved = resolveProgramCodeFromParam(programs, selectedProgramCode);
    const fallback = programs[0]?.code || '';
    const nextCode = resolved || fallback;
    if (nextCode && nextCode !== selectedProgramCode) {
      setSelectedProgramCode(nextCode);
    }
  }, [filtersQuery.data?.programs, selectedProgramCode]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (selectedDate) nextParams.set('date', selectedDate);
    else nextParams.delete('date');
    if (selectedProgramCode) nextParams.set('program', selectedProgramCode);
    else nextParams.delete('program');
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, selectedDate, selectedProgramCode, setSearchParams]);

  const performanceQuery = useQuery({
    queryKey: [
      'wakasek-performance-summary',
      filtersQuery.data?.activeYear?.id || 0,
      selectedProgramCode,
      selectedDate,
    ],
    enabled: Boolean(filtersQuery.data?.activeYear?.id) && Boolean(selectedProgramCode),
    queryFn: async () => {
      const activeYearId = Number(filtersQuery.data?.activeYear?.id || 0);
      const params = {
        academicYearId: activeYearId,
        examType: selectedProgramCode,
        programCode: selectedProgramCode,
        date: selectedDate || undefined,
      };

      const [schedulesResponse, reportsResponse, pendingProgramsResponse, teachingSummaryResponse] = await Promise.all([
        api.get('/exams/schedules', { params }).catch(() => ({ data: { data: [] as ExamScheduleRow[] } })),
        api
          .get('/proctoring/reports', { params })
          .then((res) => res.data?.data || {})
          .catch(() => ({ rows: [] as ProctorReportRow[] })),
        workProgramService.listPendingForApproval().catch(() => ({ data: [] as PendingWorkProgram[] })),
        teachingResourceProgramService
          .getEntriesSummary({
            academicYearId: activeYearId,
          })
          .catch(() => null),
      ]);

      const schedules = Array.isArray(schedulesResponse.data?.data)
        ? (schedulesResponse.data.data as ExamScheduleRow[])
        : [];
      const reportsRows = Array.isArray(reportsResponse.rows) ? (reportsResponse.rows as ProctorReportRow[]) : [];
      const reportsSummary = (reportsResponse.summary || {
        totalRooms: reportsRows.length,
        totalExpected: reportsRows.reduce((sum, row) => sum + Number(row.expectedParticipants || 0), 0),
        totalPresent: reportsRows.reduce((sum, row) => sum + Number(row.presentParticipants || 0), 0),
        totalAbsent: reportsRows.reduce((sum, row) => sum + Number(row.absentParticipants || 0), 0),
        reportedRooms: reportsRows.filter((row) => Boolean(row.report)).length,
      }) as ProctorReportSummary;

      const pendingRaw = Array.isArray(pendingProgramsResponse.data)
        ? (pendingProgramsResponse.data as PendingWorkProgram[])
        : [];
      const pendingPrograms = pendingRaw.filter((item) => {
        const status = String(item.approvalStatus || 'PENDING').toUpperCase();
        const yearId = Number(item.academicYearId || item.academicYear?.id || 0);
        return status === 'PENDING' && (!activeYearId || !yearId || yearId === activeYearId);
      });

      const roomSlots = new Set(schedules.map(normalizeRoomSlotKey));
      const timeSlots = new Set(
        schedules.map(
          (schedule) =>
            `${String(schedule.startTime)}::${String(schedule.endTime)}::${String(schedule.sessionLabel || '')
              .trim()
              .toLowerCase()}`,
        ),
      );
      const reportRowsSorted = sortRowsBySchedule(reportsRows);
      const missingReportRows = reportRowsSorted.filter((row) => !row.report);
      const topAbsentRooms = [...reportRowsSorted]
        .filter((row) => Number(row.absentParticipants || 0) > 0)
        .sort((a, b) => Number(b.absentParticipants || 0) - Number(a.absentParticipants || 0))
        .slice(0, 5);

      const teachingByStatus = Array.isArray(teachingSummaryResponse?.data?.byStatus)
        ? teachingSummaryResponse!.data!.byStatus!
        : [];
      const teachingSummary: TeachingResourceSummaryData = {
        total: Number(teachingSummaryResponse?.data?.total || 0),
        submitted: countTeachingResourceStatus(teachingByStatus, 'SUBMITTED'),
        approved: countTeachingResourceStatus(teachingByStatus, 'APPROVED'),
        rejected: countTeachingResourceStatus(teachingByStatus, 'REJECTED'),
        draft: countTeachingResourceStatus(teachingByStatus, 'DRAFT'),
        latest: Array.isArray(teachingSummaryResponse?.data?.latest)
          ? (teachingSummaryResponse!.data!.latest as TeachingResourceEntry[])
          : [],
      };

      return {
        schedules,
        reportRowsSorted,
        reportsSummary,
        pendingPrograms,
        roomSlotCount: roomSlots.size,
        timeSlotCount: timeSlots.size,
        missingReportRows,
        topAbsentRooms,
        teachingSummary,
      };
    },
    ...liveQueryOptions,
  });

  const selectedProgram = useMemo(
    () => (filtersQuery.data?.programs || []).find((program) => program.code === selectedProgramCode) || null,
    [filtersQuery.data?.programs, selectedProgramCode],
  );

  const pendingWorkProgramOverSla = useMemo(
    () =>
      (performanceQuery.data?.pendingPrograms || []).filter((program) => daysSince(program.createdAt || null) > 5)
        .length,
    [performanceQuery.data?.pendingPrograms],
  );

  return (
    <div className="space-y-6 w-full pb-20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Monitoring Kinerja</h1>
          <p className="text-gray-500">
            Pantau kesiapan ujian, berita acara pengawas, dan backlog program kerja kurikulum.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="pl-10 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <select
            value={selectedProgramCode}
            onChange={(event) => setSelectedProgramCode(event.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 min-w-[220px]"
          >
            {(filtersQuery.data?.programs || []).map((program) => (
              <option key={program.code} value={program.code}>
                {program.label}
              </option>
            ))}
            {(filtersQuery.data?.programs || []).length === 0 ? <option value="">Tidak ada program ujian</option> : null}
          </select>
        </div>
      </div>

      {filtersQuery.isLoading || performanceQuery.isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : !filtersQuery.data?.activeYear ? (
        <div className="bg-white rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tidak ada tahun ajaran aktif. Aktifkan tahun ajaran terlebih dahulu.
        </div>
      ) : performanceQuery.isError || !performanceQuery.data ? (
        <div className="bg-white rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Gagal memuat monitoring kinerja. Coba muat ulang halaman.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-700 font-medium">Slot Waktu Ujian</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{performanceQuery.data.timeSlotCount}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-xs text-sky-700 font-medium">Ruang Aktif</p>
              <p className="text-2xl font-bold text-sky-900 mt-1">{performanceQuery.data.roomSlotCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs text-emerald-700 font-medium">Ruang Sudah Lapor</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{performanceQuery.data.reportsSummary.reportedRooms}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
              <p className="text-xs text-rose-700 font-medium">Ruang Belum Lapor</p>
              <p className="text-2xl font-bold text-rose-900 mt-1">{performanceQuery.data.missingReportRows.length}</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
              <p className="text-xs text-violet-700 font-medium">Peserta Hadir / Tidak Hadir</p>
              <p className="text-2xl font-bold text-violet-900 mt-1">
                {performanceQuery.data.reportsSummary.totalPresent} / {performanceQuery.data.reportsSummary.totalAbsent}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">Program Kerja Pending</p>
              <p className="text-2xl font-bold text-amber-900 mt-1">{performanceQuery.data.pendingPrograms.length}</p>
              <p className="text-[11px] text-amber-700 mt-1">{pendingWorkProgramOverSla} melewati SLA 5 hari</p>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3">
              <p className="text-xs text-cyan-700 font-medium">Perangkat Ajar Menunggu Review</p>
              <p className="text-2xl font-bold text-cyan-900 mt-1">{performanceQuery.data.teachingSummary.submitted}</p>
              <p className="text-[11px] text-cyan-700 mt-1">
                {performanceQuery.data.teachingSummary.approved} disetujui • {performanceQuery.data.teachingSummary.rejected}{' '}
                perlu revisi
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="inline-flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Berita Acara Pengawas</h2>
                </div>
                <Link
                  to={`/teacher/wakasek/exams?section=mengawas&mengawasProgram=${encodeURIComponent(selectedProgramCode)}&mengawasDate=${encodeURIComponent(
                    selectedDate,
                  )}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Buka Jadwal Mengawas
                </Link>
              </div>
              <div className="max-h-[360px] overflow-auto">
                {performanceQuery.data.reportRowsSorted.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">
                    Tidak ada data berita acara pada filter ini.
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Ruang</th>
                        <th className="px-4 py-2 text-left">Waktu</th>
                        <th className="px-4 py-2 text-left">Peserta</th>
                        <th className="px-4 py-2 text-left">Pengawas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {performanceQuery.data.reportRowsSorted.map((row, index) => (
                        <tr key={`row-${index}-${row.room || 'ruang'}`}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{row.room || 'Belum ditentukan'}</div>
                            <div className="text-xs text-gray-500 line-clamp-1">
                              {row.classNames.length > 0 ? row.classNames.join(', ') : '-'}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            <div>{formatTimeRange(row.startTime, row.endTime)}</div>
                            <div className="text-xs text-gray-500">{row.sessionLabel || 'Tanpa sesi'}</div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="text-emerald-700">Hadir: {row.presentParticipants}</div>
                            <div className="text-rose-700">Tidak hadir: {row.absentParticipants}</div>
                          </td>
                          <td className="px-4 py-2 text-gray-700">{row.report?.proctor?.name || 'Belum ada laporan'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Peringatan Cepat</h2>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {performanceQuery.data.missingReportRows.length > 0 ? (
                      <span>
                        {performanceQuery.data.missingReportRows.length} ruang belum mengirim berita acara pengawas.
                      </span>
                    ) : (
                      <span>Semua ruang aktif sudah mengirim berita acara.</span>
                    )}
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {pendingWorkProgramOverSla > 0 ? (
                      <span>{pendingWorkProgramOverSla} program kerja melewati SLA 5 hari dan butuh tindak lanjut.</span>
                    ) : (
                      <span>Tidak ada program kerja yang melewati SLA pada filter saat ini.</span>
                    )}
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {performanceQuery.data.reportsSummary.totalAbsent > 0 ? (
                      <span>
                        Total {performanceQuery.data.reportsSummary.totalAbsent} peserta tercatat tidak hadir ujian.
                      </span>
                    ) : (
                      <span>Tidak ada ketidakhadiran ujian yang tercatat.</span>
                    )}
                  </div>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                    {performanceQuery.data.teachingSummary.submitted > 0 ? (
                      <span>
                        {performanceQuery.data.teachingSummary.submitted} dokumen perangkat ajar menunggu review kurikulum.
                      </span>
                    ) : (
                      <span>Tidak ada antrian review perangkat ajar.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    <h2 className="text-sm font-semibold text-gray-900">Top Ketidakhadiran per Ruang</h2>
                  </div>
                  <span className="text-xs text-gray-500">
                    {selectedProgram?.shortLabel || selectedProgram?.label || selectedProgramCode}
                  </span>
                </div>
                <div className="max-h-[220px] overflow-auto">
                  {performanceQuery.data.topAbsentRooms.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-gray-500 text-center">
                      Tidak ada data ketidakhadiran pada ruang ujian.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Ruang</th>
                          <th className="px-4 py-2 text-left">Sesi</th>
                          <th className="px-4 py-2 text-right">Tidak Hadir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {performanceQuery.data.topAbsentRooms.map((row, index) => (
                          <tr key={`absent-${index}-${row.room || 'ruang'}`}>
                            <td className="px-4 py-2 text-gray-800">{row.room || 'Belum ditentukan'}</td>
                            <td className="px-4 py-2 text-gray-600">{row.sessionLabel || '-'}</td>
                            <td className="px-4 py-2 text-right font-semibold text-rose-700">{row.absentParticipants}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-cyan-600" />
                    <h2 className="text-sm font-semibold text-gray-900">Antrian Review Perangkat Ajar</h2>
                  </div>
                  <Link
                    to="/teacher/wakasek/teaching-resource-programs"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Kelola Program
                  </Link>
                </div>
                <div className="max-h-[220px] overflow-auto">
                  {performanceQuery.data.teachingSummary.latest.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-gray-500 text-center">Belum ada dokumen perangkat ajar.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {performanceQuery.data.teachingSummary.latest.map((entry) => {
                        const status = String(entry.status || 'DRAFT').toUpperCase() as TeachingResourceEntryStatus;
                        const meta = teachingResourceStatusMeta[status] || teachingResourceStatusMeta.DRAFT;
                        return (
                          <div key={entry.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">{entry.title}</p>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pillClass}`}>
                                {meta.label}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <p className="text-xs text-gray-500 line-clamp-1">
                                {entry.teacher?.name || '-'} • {entry.programCode}
                              </p>
                              <Link
                                to={`/teacher/learning-resources/${teachingResourceProgramCodeToSlug(entry.programCode)}?view=review`}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Buka
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-sm text-gray-700">
              <MonitorCog className="h-4 w-4 text-blue-600" />
              Data monitoring tersinkron untuk jalur eskalasi principal (berita acara, kehadiran ujian, dan backlog).
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/teacher/wakasek/exams?section=mengawas&mengawasProgram=${encodeURIComponent(selectedProgramCode)}&mengawasDate=${encodeURIComponent(
                  selectedDate,
                )}`}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Buka Jadwal Mengawas
              </Link>
              <Link
                to="/teacher/wakasek/work-program-approvals"
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Buka Persetujuan Program Kerja
              </Link>
              <Link
                to="/teacher/learning-resources/cp?view=review"
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-700 hover:bg-cyan-100"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Review Perangkat Ajar
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
