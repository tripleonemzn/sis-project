import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronDown, ChevronRight, Download, FileSpreadsheet, Loader2, RefreshCcw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { academicYearService } from '../../../services/academicYear.service';
import { reportService, type FinalLedgerPreviewResult } from '../../../services/report.service';
import { classService, type Class } from '../../../services/class.service';
import { attendanceService, type SemesterFilter } from '../../../services/attendance.service';
import api from '../../../services/api';
import { liveQueryOptions } from '../../../lib/query/liveQuery';
import toast from 'react-hot-toast';

type AcademicYearLite = {
  id: number;
  name: string;
};

type ProctorReportSummary = {
  totalRooms: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  reportedRooms: number;
};

type ProctorReportRow = {
  room: string | null;
  startTime: string;
  endTime: string;
  periodNumber?: number | null;
  sessionLabel?: string | null;
  examType?: string | null;
  subjectName?: string | null;
  classNames: string[];
  expectedParticipants?: number;
  absentParticipants: number;
  presentParticipants: number;
  report?: {
    id: number;
    signedAt?: string | null;
    documentNumber?: string | null;
    verificationUrl?: string | null;
    auditTrail?: {
      warningCount: number;
      warnedStudents: number;
      terminatedStudents: number;
      latestActionAt?: string | null;
    } | null;
    proctor?: {
      name?: string | null;
    } | null;
  } | null;
};

type SemesterChoice = 'ALL' | 'ODD' | 'EVEN';

const semesterLabel: Record<SemesterChoice, string> = {
  ALL: 'Semua Semester',
  ODD: 'Semester Ganjil',
  EVEN: 'Semester Genap',
};

const normalizeNumericScore = (value: number | null | undefined) =>
  Number.isFinite(Number(value)) ? Number(value) : null;

const formatScore = (value: number | null | undefined) => {
  const normalized = normalizeNumericScore(value);
  if (normalized === null) return '-';
  return normalized.toFixed(2);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatSafeDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const formatSafeTime = (value: string | null | undefined) => {
  if (!value) return '--.--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = String(value).match(/(\d{2}:\d{2})/);
    return fallback ? fallback[1].replace(':', '.') : String(value);
  }
  return parsed.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).replace(':', '.');
};

const formatAuditTrailDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  });
};

const parseClassList = (payload: unknown): Class[] => {
  if (!payload || typeof payload !== 'object') return [];
  const wrapper = payload as { data?: { classes?: Class[] } | Class[] };
  if (Array.isArray(wrapper.data)) return wrapper.data;
  if (wrapper.data && Array.isArray((wrapper.data as { classes?: Class[] }).classes)) {
    return (wrapper.data as { classes: Class[] }).classes;
  }
  return [];
};

const downloadBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

export default function WakasekAcademicReportsPage() {
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [selectedSemester, setSelectedSemester] = useState<SemesterChoice>('ALL');
  const [reportDate, setReportDate] = useState<string>(todayIso());
  const [isExporting, setIsExporting] = useState(false);
  const [expandedProctorTimeGroupKey, setExpandedProctorTimeGroupKey] = useState<string | null>(null);

  const filterQuery = useQuery({
    queryKey: ['wakasek-academic-reports-filters'],
    queryFn: async () => {
      const activeResponse = await academicYearService.getActiveSafe().catch(() => null);
      const activeYear = (activeResponse?.data || null) as AcademicYearLite | null;
      if (!activeYear?.id) {
        return { activeYear: null as AcademicYearLite | null, classes: [] as Class[] };
      }

      const classesResponse = await classService.list({
        page: 1,
        limit: 500,
        academicYearId: Number(activeYear.id),
      });
      return {
        activeYear,
        classes: parseClassList(classesResponse),
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const ledgerPayload = useMemo(
    () => ({
      academicYearIds: filterQuery.data?.activeYear?.id ? [Number(filterQuery.data.activeYear.id)] : [],
      semesters: selectedSemester === 'ALL' ? (['ODD', 'EVEN'] as Array<'ODD' | 'EVEN'>) : ([selectedSemester] as Array<'ODD' | 'EVEN'>),
      classId: selectedClassId === 'ALL' ? undefined : Number(selectedClassId),
      limitStudents: 300,
    }),
    [filterQuery.data?.activeYear?.id, selectedClassId, selectedSemester],
  );

  const ledgerQuery = useQuery<FinalLedgerPreviewResult>({
    queryKey: ['wakasek-academic-ledger-preview', ledgerPayload],
    enabled: Boolean(filterQuery.data?.activeYear?.id),
    queryFn: () => reportService.getFinalLedgerPreview(ledgerPayload),
    ...liveQueryOptions,
  });

  const attendanceQuery = useQuery({
    queryKey: [
      'wakasek-academic-attendance-summary',
      filterQuery.data?.activeYear?.id || 0,
      selectedClassId,
      selectedSemester,
    ],
    enabled: Boolean(filterQuery.data?.activeYear?.id) && selectedClassId !== 'ALL',
    queryFn: async () => {
      const classId = Number(selectedClassId);
      const academicYearId = Number(filterQuery.data?.activeYear?.id || 0);
      const semesterParam: SemesterFilter | undefined = selectedSemester === 'ALL' ? undefined : selectedSemester;
      const [dailyRecap, lateSummary] = await Promise.all([
        attendanceService.getDailyRecap({
          classId,
          academicYearId,
          semester: semesterParam,
        }),
        attendanceService.getLateSummaryByClass({
          classId,
          academicYearId,
        }),
      ]);
      return {
        dailyRecap: dailyRecap.data,
        lateSummary: lateSummary.data,
      };
    },
    ...liveQueryOptions,
  });

  const proctorSummaryQuery = useQuery({
    queryKey: ['wakasek-academic-proctor-summary', filterQuery.data?.activeYear?.id || 0, reportDate],
    enabled: Boolean(filterQuery.data?.activeYear?.id),
    queryFn: async () => {
      const response = await api.get('/proctoring/reports', {
        params: {
          academicYearId: Number(filterQuery.data?.activeYear?.id || 0),
          date: reportDate || undefined,
        },
      });
      const payload = response.data?.data || {};
      const rows = Array.isArray(payload.rows) ? (payload.rows as ProctorReportRow[]) : [];
      const summary = (payload.summary || {
        totalRooms: rows.length,
        totalExpected: rows.reduce((sum, row) => sum + Number(row.expectedParticipants || 0), 0),
        totalPresent: rows.reduce((sum, row) => sum + Number(row.presentParticipants || 0), 0),
        totalAbsent: rows.reduce((sum, row) => sum + Number(row.absentParticipants || 0), 0),
        reportedRooms: rows.filter((row) => Boolean(row.report)).length,
      }) as ProctorReportSummary;
      return { summary, rows };
    },
    ...liveQueryOptions,
  });

  const groupedProctorTimeGroups = useMemo(() => {
    const rows = proctorSummaryQuery.data?.rows || [];
    const grouped = new Map<
      string,
      {
        timeKey: string;
        startTime: string;
        endTime: string;
        periodNumber: number | null;
        sessionLabel: string | null;
        rows: ProctorReportRow[];
      }
    >();

    rows.forEach((row) => {
      const periodNumber = Number.isFinite(Number(row.periodNumber)) ? Number(row.periodNumber) : null;
      const sessionLabel = typeof row.sessionLabel === 'string' && row.sessionLabel.trim() ? row.sessionLabel.trim() : null;
      const timeKey = [row.startTime, row.endTime, periodNumber ?? '', sessionLabel ?? ''].join('|');
      if (!grouped.has(timeKey)) {
        grouped.set(timeKey, {
          timeKey,
          startTime: row.startTime,
          endTime: row.endTime,
          periodNumber,
          sessionLabel,
          rows: [],
        });
      }
      grouped.get(timeKey)?.rows.push(row);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((left, right) =>
          String(left.room || '').localeCompare(String(right.room || ''), 'id', { sensitivity: 'base' }),
        ),
      }))
      .sort((left, right) => {
        const leftTime = new Date(left.startTime).getTime();
        const rightTime = new Date(right.startTime).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return Number(left.periodNumber || 0) - Number(right.periodNumber || 0);
      });
  }, [proctorSummaryQuery.data?.rows]);

  useEffect(() => {
    if (groupedProctorTimeGroups.length === 0) {
      setExpandedProctorTimeGroupKey(null);
      return;
    }
    const currentExists = groupedProctorTimeGroups.some((group) => group.timeKey === expandedProctorTimeGroupKey);
    if (!currentExists) {
      setExpandedProctorTimeGroupKey(groupedProctorTimeGroups[0]?.timeKey || null);
    }
  }, [groupedProctorTimeGroups, expandedProctorTimeGroupKey]);

  useEffect(() => {
    if (!filterQuery.data?.classes?.length) {
      setSelectedClassId('ALL');
      return;
    }
    if (selectedClassId === 'ALL') return;
    const exists = filterQuery.data.classes.some((item) => Number(item.id) === Number(selectedClassId));
    if (!exists) setSelectedClassId('ALL');
  }, [filterQuery.data?.classes, selectedClassId]);

  const previewRows = useMemo(() => {
    const rows = ledgerQuery.data?.rows || [];
    return rows.slice(0, 20);
  }, [ledgerQuery.data?.rows]);

  const attendanceAggregate = useMemo(() => {
    const recapRows = attendanceQuery.data?.dailyRecap?.recap || [];
    if (recapRows.length === 0) {
      return {
        present: 0,
        sick: 0,
        permission: 0,
        absent: 0,
        late: 0,
      };
    }
    return recapRows.reduce(
      (acc, row) => ({
        present: acc.present + Number(row.present || 0),
        sick: acc.sick + Number(row.sick || 0),
        permission: acc.permission + Number(row.permission || 0),
        absent: acc.absent + Number(row.absent || 0),
        late: acc.late + Number(row.late || 0),
      }),
      { present: 0, sick: 0, permission: 0, absent: 0, late: 0 },
    );
  }, [attendanceQuery.data?.dailyRecap?.recap]);

  const lateTotal = useMemo(() => {
    const recapRows = attendanceQuery.data?.lateSummary?.recap || [];
    return recapRows.reduce((sum, row) => sum + Number(row.totalLate || 0), 0);
  }, [attendanceQuery.data?.lateSummary?.recap]);

  const handleExportLedger = async () => {
    if (!filterQuery.data?.activeYear?.id) return;
    try {
      setIsExporting(true);
      const blob = await reportService.exportFinalLedgerPreview(ledgerPayload);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `laporan-akademik-${stamp}.xlsx`);
      toast.success('Export laporan akademik berhasil');
    } catch {
      toast.error('Gagal export laporan akademik');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 w-full pb-20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Akademik</h1>
          <p className="text-gray-500">
            Rekap nilai akhir, kehadiran kelas, dan ringkasan berita acara ujian untuk kurikulum.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void filterQuery.refetch();
              void ledgerQuery.refetch();
              void attendanceQuery.refetch();
              void proctorSummaryQuery.refetch();
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => void handleExportLedger()}
            disabled={isExporting || !filterQuery.data?.activeYear?.id}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tahun Ajaran</label>
            <input
              value={filterQuery.data?.activeYear?.name || '-'}
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Semester</label>
            <select
              value={selectedSemester}
              onChange={(event) => setSelectedSemester(event.target.value as SemesterChoice)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
            >
              <option value="ALL">{semesterLabel.ALL}</option>
              <option value="ODD">{semesterLabel.ODD}</option>
              <option value="EVEN">{semesterLabel.EVEN}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Filter Kelas</label>
            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
            >
              <option value="ALL">Semua Kelas</option>
              {(filterQuery.data?.classes || []).map((classItem) => (
                <option key={classItem.id} value={String(classItem.id)}>
                  {classItem.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tanggal Monitoring Ujian</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {filterQuery.isLoading || ledgerQuery.isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : !filterQuery.data?.activeYear ? (
        <div className="bg-white rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tidak ada tahun ajaran aktif. Aktifkan tahun ajaran terlebih dahulu.
        </div>
      ) : ledgerQuery.isError || !ledgerQuery.data ? (
        <div className="bg-white rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Gagal memuat preview laporan akademik.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-700 font-medium">Total Siswa (Preview)</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{ledgerQuery.data.summary.totalStudents}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs text-emerald-700 font-medium">Rata-rata Nilai Akhir</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{formatScore(ledgerQuery.data.summary.averageFinal)}</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
              <p className="text-xs text-violet-700 font-medium">Rata-rata US</p>
              <p className="text-2xl font-bold text-violet-900 mt-1">{formatScore(ledgerQuery.data.summary.averageUs)}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">Rata-rata Portofolio</p>
              <p className="text-2xl font-bold text-amber-900 mt-1">
                {formatScore(ledgerQuery.data.summary.averagePortfolio)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-600 font-medium">Siswa Sudah Terhitung</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{ledgerQuery.data.summary.studentsWithResult}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="inline-flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Preview Nilai Akhir (20 Siswa)</h2>
                </div>
                <Link to="/teacher/wakasek/final-ledger" className="text-xs text-blue-600 hover:underline">
                  Buka Leger Nilai Akhir
                </Link>
              </div>
              <div className="max-h-[380px] overflow-auto">
                {previewRows.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">Tidak ada data pada filter ini.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Siswa</th>
                        <th className="px-4 py-2 text-right">Portofolio</th>
                        <th className="px-4 py-2 text-right">US</th>
                        <th className="px-4 py-2 text-right">PKL</th>
                        <th className="px-4 py-2 text-right">Nilai Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.map((row) => (
                        <tr key={`preview-${row.student.id}`}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{row.student.name}</div>
                            <div className="text-xs text-gray-500">{row.student.class?.name || '-'}</div>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">{formatScore(row.portfolioAverage)}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{formatScore(row.usAverage)}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{formatScore(row.pklScore)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatScore(row.finalScore)}</td>
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
                  <Users className="h-4 w-4 text-gray-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Ringkasan Kehadiran Kelas</h2>
                </div>
                {selectedClassId === 'ALL' ? (
                  <p className="mt-3 text-sm text-gray-500">
                    Pilih kelas untuk melihat ringkasan kehadiran dan keterlambatan.
                  </p>
                ) : attendanceQuery.isLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat data kehadiran...
                  </div>
                ) : attendanceQuery.isError ? (
                  <p className="mt-3 text-sm text-rose-700">Gagal memuat data kehadiran kelas.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">Hadir: {attendanceAggregate.present}</div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">Sakit: {attendanceAggregate.sick}</div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">Izin: {attendanceAggregate.permission}</div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">Alpa: {attendanceAggregate.absent}</div>
                    <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 col-span-2">
                      Total Telat: {lateTotal}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Ringkasan Berita Acara Ujian</h2>
                  <Link
                    to={`/teacher/wakasek/exams?section=mengawas&mengawasDate=${encodeURIComponent(reportDate)}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Buka Jadwal Mengawas
                  </Link>
                </div>
                {proctorSummaryQuery.isLoading ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">Memuat ringkasan ujian...</div>
                ) : proctorSummaryQuery.isError || !proctorSummaryQuery.data ? (
                  <div className="px-4 py-8 text-sm text-rose-700 text-center">Gagal memuat ringkasan berita acara.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-gray-100 text-sm">
                      <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                        Ruang aktif: <span className="font-semibold">{proctorSummaryQuery.data.summary.totalRooms}</span>
                      </div>
                      <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">
                        Sudah lapor: <span className="font-semibold">{proctorSummaryQuery.data.summary.reportedRooms}</span>
                      </div>
                      <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1">
                        Hadir: <span className="font-semibold">{proctorSummaryQuery.data.summary.totalPresent}</span>
                      </div>
                      <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1">
                        Tidak hadir: <span className="font-semibold">{proctorSummaryQuery.data.summary.totalAbsent}</span>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 bg-slate-50/60 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grouping Hari & Jam</div>
                      <div className="mt-1 text-sm text-slate-700">
                        {formatSafeDate(reportDate)} • {groupedProctorTimeGroups.length} kelompok jam
                      </div>
                    </div>
                    <div className="max-h-[520px] overflow-auto px-4 py-4">
                      {groupedProctorTimeGroups.length === 0 ? (
                        <div className="py-8 text-sm text-gray-500 text-center">Belum ada berita acara pada tanggal ini.</div>
                      ) : (
                        <div className="space-y-4">
                          {groupedProctorTimeGroups.map((group) => (
                            <div key={group.timeKey} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedProctorTimeGroupKey((previous) => (previous === group.timeKey ? null : group.timeKey))
                                }
                                className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-slate-50 px-4 py-3 text-left"
                              >
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {formatSafeTime(group.startTime)} - {formatSafeTime(group.endTime)} WIB
                                    {group.periodNumber ? ` • Jam Ke-${group.periodNumber}` : ''}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {group.sessionLabel ? `Sesi ${group.sessionLabel}` : 'Tanpa sesi'} • {group.rows.length} ruang
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-2 text-xs font-medium text-blue-700">
                                  {new Set(group.rows.map((row) => String(row.room || '').trim()).filter(Boolean)).size} ruang
                                  {expandedProctorTimeGroupKey === group.timeKey ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </span>
                              </button>
                              {expandedProctorTimeGroupKey === group.timeKey ? (
                                <div className="divide-y divide-gray-100">
                                  {group.rows.map((row, index) => (
                                    <div
                                      key={`${group.timeKey}-${row.room || 'ruang'}-${index}`}
                                      className="grid gap-3 px-4 py-4 md:grid-cols-[1.1fr_1.2fr_0.8fr_1fr]"
                                    >
                                      <div>
                                        <div className="font-medium text-gray-900">{row.room || 'Belum ditentukan'}</div>
                                        <div className="mt-1 text-xs text-gray-500">{row.examType || '-'}</div>
                                      </div>
                                      <div>
                                        <div className="font-medium text-gray-900">{row.subjectName || 'Mata Pelajaran'}</div>
                                        <div className="mt-1 text-xs text-gray-500">
                                          {row.classNames.join(', ') || 'Belum ada rombel'}
                                        </div>
                                      </div>
                                      <div className="text-sm text-gray-700">
                                        <div>Seharusnya: <span className="font-semibold">{Number(row.expectedParticipants || 0)}</span></div>
                                        <div className="text-emerald-700">Hadir: <span className="font-semibold">{row.presentParticipants}</span></div>
                                        <div className="text-rose-700">Tidak hadir: <span className="font-semibold">{row.absentParticipants}</span></div>
                                      </div>
                                      <div className="space-y-2">
                                        {row.report ? (
                                          <>
                                            <div className="text-xs text-gray-500">
                                              BA: {row.report.documentNumber || 'Nomor dokumen dibuat saat preview dibuka.'}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              Pengawas: {row.report.proctor?.name || '-'}
                                            </div>
                                            {row.report.auditTrail ? (
                                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                  Ringkasan Disiplin
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                                    Peringatan {row.report.auditTrail.warningCount}x
                                                  </span>
                                                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                                                    Peserta diperingatkan {row.report.auditTrail.warnedStudents}
                                                  </span>
                                                  <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                                    Sesi diakhiri {row.report.auditTrail.terminatedStudents}
                                                  </span>
                                                </div>
                                                {row.report.auditTrail.latestActionAt ? (
                                                  <div className="mt-2 text-[11px] text-slate-500">
                                                    Aksi terakhir: {formatAuditTrailDateTime(row.report.auditTrail.latestActionAt)}
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : null}
                                            <div className="flex flex-wrap gap-2">
                                              <a
                                                href={`/print/proctor-report/${row.report.id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                              >
                                                Lihat BA
                                              </a>
                                              <a
                                                href={`/print/proctor-attendance/${row.report.id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                              >
                                                Daftar Hadir
                                              </a>
                                              {row.report.verificationUrl ? (
                                                <a
                                                  href={row.report.verificationUrl}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                  Verifikasi
                                                </a>
                                              ) : null}
                                            </div>
                                          </>
                                        ) : (
                                          <div className="text-xs text-gray-500">Belum ada dokumen pengawas.</div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
