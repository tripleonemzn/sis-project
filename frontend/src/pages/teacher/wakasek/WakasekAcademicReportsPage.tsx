import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Download, FileSpreadsheet, Loader2, RefreshCcw, Users } from 'lucide-react';
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
  sessionLabel?: string | null;
  classNames: string[];
  absentParticipants: number;
  presentParticipants: number;
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
        totalExpected: rows.reduce((sum, row) => sum + Number(row.presentParticipants || 0) + Number(row.absentParticipants || 0), 0),
        totalPresent: rows.reduce((sum, row) => sum + Number(row.presentParticipants || 0), 0),
        totalAbsent: rows.reduce((sum, row) => sum + Number(row.absentParticipants || 0), 0),
        reportedRooms: 0,
      }) as ProctorReportSummary;
      const topAbsentRows = [...rows]
        .filter((row) => Number(row.absentParticipants || 0) > 0)
        .sort((a, b) => Number(b.absentParticipants || 0) - Number(a.absentParticipants || 0))
        .slice(0, 6);
      return { summary, topAbsentRows };
    },
    ...liveQueryOptions,
  });

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
                    <div className="max-h-[220px] overflow-auto">
                      {proctorSummaryQuery.data.topAbsentRows.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-gray-500 text-center">Tidak ada ruang dengan siswa tidak hadir.</div>
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
                            {proctorSummaryQuery.data.topAbsentRows.map((row, index) => (
                              <tr key={`top-absent-${index}-${row.room || 'ruang'}`}>
                                <td className="px-4 py-2 text-gray-800">{row.room || 'Belum ditentukan'}</td>
                                <td className="px-4 py-2 text-gray-600">{row.sessionLabel || '-'}</td>
                                <td className="px-4 py-2 text-right font-semibold text-rose-700">{row.absentParticipants}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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

