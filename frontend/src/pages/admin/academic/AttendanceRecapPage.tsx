import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { classService, type Class } from '../../../services/class.service';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import {
  attendanceService,
  type AttendanceRecapPeriod,
  type DailyAttendanceRecapStudent,
  type LateSummaryStudent,
  type SemesterFilter,
  type TeacherAttendanceMonitorStatus,
  type TeacherClassAttendanceSession,
} from '../../../services/attendance.service';
import {
  Loader2,
  Search,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

type SemesterOption = {
  value: SemesterFilter;
  label: string;
};

const SEMESTERS: SemesterOption[] = [
  { value: 'ALL', label: 'Satu Tahun Penuh' },
  { value: 'ODD', label: 'Semester Ganjil' },
  { value: 'EVEN', label: 'Semester Genap' },
];

const MONITOR_STATUS_OPTIONS: Array<{ value: '' | TeacherAttendanceMonitorStatus; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'SUBMITTED', label: 'Sudah Diisi' },
  { value: 'MISSING', label: 'Belum Diisi' },
  { value: 'LATE_INPUT', label: 'Input Susulan' },
  { value: 'EDITED', label: 'Pernah Diedit' },
];

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
  SUNDAY: 'Minggu',
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('id-ID') : '-');
const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export const AttendanceRecapPage = () => {
  const location = useLocation();
  const isPrincipalRoute = location.pathname.startsWith('/principal');
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | ''>('');
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [semester, setSemester] = useState<SemesterFilter>('ALL');
  const [monitorPeriod, setMonitorPeriod] = useState<AttendanceRecapPeriod>('WEEK');
  const [monitorWeekStart, setMonitorWeekStart] = useState(new Date().toISOString().split('T')[0]);
  const [monitorMonth, setMonitorMonth] = useState(new Date().getMonth() + 1);
  const [monitorYear, setMonitorYear] = useState(new Date().getFullYear());
  const [monitorSemester, setMonitorSemester] = useState<'ODD' | 'EVEN'>('ODD');
  const [monitorStatus, setMonitorStatus] = useState<'' | TeacherAttendanceMonitorStatus>('');
  const [monitorPage, setMonitorPage] = useState(1);

  const { data: academicYearData, isLoading: isLoadingYears } = useQuery({
    queryKey: ['academic-years', 'all'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] = useMemo(
    () =>
      academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData],
  );
  const activeAcademicYear = useMemo(
    () => academicYears.find((ay) => ay.isActive) || academicYears[0],
    [academicYears],
  );

  const effectiveAcademicYearId = useMemo<number | ''>(() => {
    if (!academicYears.length) {
      return '';
    }

    if (isPrincipalRoute) {
      return activeAcademicYear?.id ?? '';
    }

    if (selectedAcademicYearId) {
      const exists = academicYears.some((ay) => ay.id === selectedAcademicYearId);
      if (exists) {
        return selectedAcademicYearId;
      }
    }

    return activeAcademicYear?.id ?? '';
  }, [academicYears, activeAcademicYear, isPrincipalRoute, selectedAcademicYearId]);

  const { data: classData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes', 'for-attendance', effectiveAcademicYearId],
    queryFn: () =>
      classService.list({
        page: 1,
        limit: 1000,
        academicYearId: effectiveAcademicYearId || undefined,
      }),
    enabled: !!effectiveAcademicYearId,
  });

  const classes: Class[] = useMemo(
    () => classData?.data?.classes || classData?.classes || [],
    [classData],
  );

  const effectiveClassId = useMemo<number | ''>(() => {
    if (!classes.length) {
      return '';
    }

    if (selectedClassId) {
      const exists = classes.some((c) => c.id === selectedClassId);
      if (exists) {
        return selectedClassId;
      }
    }

    return '';
  }, [classes, selectedClassId]);

  const canLoadRecap = !!effectiveAcademicYearId && !!effectiveClassId;

  const {
    data: recapResponse,
    isLoading: isLoadingRecap,
    isFetching: isFetchingRecap,
    refetch: refetchRecap,
  } = useQuery({
    queryKey: ['attendance-daily-recap', effectiveAcademicYearId, effectiveClassId, semester],
    queryFn: () =>
      attendanceService.getDailyRecap({
        classId: effectiveClassId as number,
        academicYearId: effectiveAcademicYearId as number,
        semester,
      }),
    enabled: canLoadRecap,
  });

  const {
    data: lateSummaryResponse,
    isLoading: isLoadingLateSummary,
    isFetching: isFetchingLateSummary,
    refetch: refetchLateSummary,
  } = useQuery({
    queryKey: ['attendance-late-summary', effectiveAcademicYearId, effectiveClassId],
    queryFn: () =>
      attendanceService.getLateSummaryByClass({
        classId: effectiveClassId as number,
        academicYearId: effectiveAcademicYearId as number,
      }),
    enabled: canLoadRecap,
  });

  const {
    data: teacherMonitorResponse,
    isLoading: isLoadingTeacherMonitor,
    isFetching: isFetchingTeacherMonitor,
  } = useQuery({
    queryKey: [
      'teacher-class-attendance-monitor',
      effectiveAcademicYearId,
      effectiveClassId || 'all',
      monitorPeriod,
      monitorWeekStart,
      monitorMonth,
      monitorYear,
      monitorSemester,
      monitorStatus,
      monitorPage,
    ],
    queryFn: () =>
      attendanceService.getTeacherClassRecap({
        academicYearId: effectiveAcademicYearId as number,
        classId: effectiveClassId ? (effectiveClassId as number) : undefined,
        period: monitorPeriod,
        weekStart: monitorPeriod === 'WEEK' ? monitorWeekStart : undefined,
        month: monitorPeriod === 'MONTH' ? monitorMonth : undefined,
        year: monitorPeriod === 'MONTH' ? monitorYear : undefined,
        semester: monitorPeriod === 'SEMESTER' ? monitorSemester : undefined,
        monitorStatus: monitorStatus || undefined,
        page: monitorPage,
        pageSize: 100,
      }),
    enabled: !!effectiveAcademicYearId,
  });

  const recap: DailyAttendanceRecapStudent[] = useMemo(
    () => recapResponse?.data?.recap || [],
    [recapResponse],
  );

  const lateSummary: LateSummaryStudent[] = useMemo(
    () => lateSummaryResponse?.data?.recap || [],
    [lateSummaryResponse],
  );

  const teacherMonitor = teacherMonitorResponse?.data || null;
  const teacherSessions: TeacherClassAttendanceSession[] = teacherMonitor?.sessions || [];

  const loading =
    isLoadingYears ||
    isLoadingClasses ||
    isLoadingRecap ||
    isFetchingRecap ||
    isLoadingLateSummary ||
    isFetchingLateSummary;

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === effectiveClassId),
    [classes, effectiveClassId],
  );

  const selectedYear = useMemo(
    () => academicYears.find((ay) => ay.id === effectiveAcademicYearId),
    [academicYears, effectiveAcademicYearId],
  );

  const totals = useMemo(() => {
    if (!recap.length) {
      return null;
    }

    const aggregate = recap.reduce(
      (acc, item) => {
        acc.present += item.present;
        acc.late += item.late;
        acc.sick += item.sick;
        acc.permission += item.permission;
        acc.absent += item.absent;
        acc.total += item.total;
        acc.percentageSum += item.percentage;
        return acc;
      },
      {
        present: 0,
        late: 0,
        sick: 0,
        permission: 0,
        absent: 0,
        total: 0,
        percentageSum: 0,
      },
    );

    const avgPercentage = recap.length
      ? aggregate.percentageSum / recap.length
      : 0;

    return {
      present: aggregate.present,
      late: aggregate.late,
      sick: aggregate.sick,
      permission: aggregate.permission,
      absent: aggregate.absent,
      total: aggregate.total,
      avgPercentage,
    };
  }, [recap]);

  const handleRefresh = async () => {
    if (!canLoadRecap) {
      toast.error(isPrincipalRoute ? 'Pilih kelas terlebih dahulu' : 'Pilih tahun ajaran dan kelas terlebih dahulu');
      return;
    }
    try {
      await Promise.all([refetchRecap(), refetchLateSummary()]);
      if (!recap.length) {
        toast('Belum ada data absensi untuk filter ini', { icon: 'ℹ️' });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rekap Absensi Kelas</h1>
          <p className="text-gray-500">
            Lihat rekap kehadiran harian per kelas, termasuk catatan keterlambatan.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || !canLoadRecap}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isFetchingRecap || isFetchingLateSummary) && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          <Search className="w-4 h-4" />
          <span>Terapkan Filter</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Monitoring Presensi Guru Mapel</h2>
            <p className="text-sm text-gray-500">
              Membandingkan jadwal mengajar dengan presensi mapel yang sudah diisi guru.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={monitorPeriod}
              onChange={(event) => {
                setMonitorPeriod(event.target.value as AttendanceRecapPeriod);
                setMonitorPage(1);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="WEEK">Mingguan</option>
              <option value="MONTH">Bulanan</option>
              <option value="SEMESTER">Semester</option>
              <option value="YEAR">1 Tahun Ajaran</option>
            </select>
            {monitorPeriod === 'WEEK' && (
              <input
                type="date"
                value={monitorWeekStart}
                onChange={(event) => {
                  setMonitorWeekStart(event.target.value);
                  setMonitorPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            )}
            {monitorPeriod === 'MONTH' && (
              <>
                <select
                  value={monitorMonth}
                  onChange={(event) => {
                    setMonitorMonth(Number(event.target.value));
                    setMonitorPage(1);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>
                      {new Date(2026, month - 1, 1).toLocaleString('id-ID', { month: 'long' })}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={monitorYear}
                  onChange={(event) => {
                    setMonitorYear(Number(event.target.value));
                    setMonitorPage(1);
                  }}
                  className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </>
            )}
            {monitorPeriod === 'SEMESTER' && (
              <select
                value={monitorSemester}
                onChange={(event) => {
                  setMonitorSemester(event.target.value as 'ODD' | 'EVEN');
                  setMonitorPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="ODD">Ganjil</option>
                <option value="EVEN">Genap</option>
              </select>
            )}
            <select
              value={monitorStatus}
              onChange={(event) => {
                setMonitorStatus(event.target.value as '' | TeacherAttendanceMonitorStatus);
                setMonitorPage(1);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {MONITOR_STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 py-4 bg-gray-50 border-b border-gray-100 text-sm">
          <div className="rounded-lg bg-white p-3 border"><p className="text-gray-500">Jadwal</p><p className="text-xl font-bold">{teacherMonitor?.summary.expected || 0}</p></div>
          <div className="rounded-lg bg-white p-3 border"><p className="text-gray-500">Sudah Diisi</p><p className="text-xl font-bold text-emerald-700">{teacherMonitor?.summary.submitted || 0}</p></div>
          <div className="rounded-lg bg-white p-3 border"><p className="text-gray-500">Belum Diisi</p><p className="text-xl font-bold text-rose-700">{teacherMonitor?.summary.missing || 0}</p></div>
          <div className="rounded-lg bg-white p-3 border"><p className="text-gray-500">Input Susulan</p><p className="text-xl font-bold text-amber-700">{teacherMonitor?.summary.lateInput || 0}</p></div>
          <div className="rounded-lg bg-white p-3 border"><p className="text-gray-500">Diedit</p><p className="text-xl font-bold text-blue-700">{teacherMonitor?.summary.edited || 0}</p></div>
        </div>
        <div className="overflow-x-auto">
          {isLoadingTeacherMonitor || isFetchingTeacherMonitor ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Tanggal/Jam</th>
                  <th className="px-4 py-3 text-left">Guru</th>
                  <th className="px-4 py-3 text-left">Kelas</th>
                  <th className="px-4 py-3 text-left">Mapel</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Waktu Input/Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {teacherSessions.map((session) => (
                  <tr key={`${session.date}-${session.class.id}-${session.subject.id}-${session.period}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{formatDate(session.date)}</div>
                      <div className="text-xs text-gray-500">{DAY_LABELS[session.dayOfWeek] || session.dayOfWeek}, jam ke-{session.period}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{session.teacher.name}</td>
                    <td className="px-4 py-3 text-gray-700">{session.class.name}</td>
                    <td className="px-4 py-3 text-gray-700">{session.subject.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        session.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {session.status === 'SUBMITTED' ? 'Sudah diisi' : 'Belum diisi'}
                      </span>
                      {session.isLateInput && <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Input susulan</span>}
                      {session.isEdited && <span className="ml-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Diedit</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {session.attendance ? (
                        <>
                          <div>Input: {formatDateTime(session.attendance.recordedAt)}</div>
                          <div>Edit: {formatDateTime(session.attendance.editedAt)}</div>
                        </>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                {teacherSessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      Belum ada jadwal mengajar pada filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {teacherMonitor?.pagination && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3 text-sm text-gray-500">
            <span>Halaman {teacherMonitor.pagination.page} / {teacherMonitor.pagination.totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMonitorPage((page) => Math.max(1, page - 1))}
                disabled={teacherMonitor.pagination.page <= 1}
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setMonitorPage((page) => Math.min(teacherMonitor.pagination.totalPages, page + 1))}
                disabled={teacherMonitor.pagination.page >= teacherMonitor.pagination.totalPages}
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
        <div className={`grid grid-cols-1 ${isPrincipalRoute ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
          {!isPrincipalRoute && (
            <div>
              <label
                htmlFor="attendance-academic-year"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Tahun Ajaran
              </label>
              <select
                id="attendance-academic-year"
                name="attendance-academic-year"
                value={effectiveAcademicYearId}
                onChange={(e) =>
                  setSelectedAcademicYearId(
                    e.target.value ? Number(e.target.value) : '',
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Pilih Tahun Ajaran</option>
                {academicYears.map((ay) => (
                  <option key={ay.id} value={ay.id}>
                    {ay.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="attendance-class"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Kelas
            </label>
            <select
              id="attendance-class"
              name="attendance-class"
              value={effectiveClassId}
              onChange={(e) =>
                setSelectedClassId(
                  e.target.value ? Number(e.target.value) : '',
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!effectiveAcademicYearId || isLoadingClasses}
            >
              <option value="">
                {isLoadingClasses ? 'Memuat kelas...' : 'Pilih Kelas'}
              </option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="attendance-semester"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Periode
            </label>
            <select
              id="attendance-semester"
              name="attendance-semester"
              value={semester}
              onChange={(e) => setSemester(e.target.value as SemesterFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {SEMESTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            {selectedYear && selectedClass ? (
              <span>
                Rekap untuk kelas{' '}
                <span className="font-semibold text-gray-700">
                  {selectedClass.name}
                </span>{' '}
                {!isPrincipalRoute ? (
                  <>
                    pada tahun ajaran{' '}
                    <span className="font-semibold text-gray-700">
                      {selectedYear.name}
                    </span>
                  </>
                ) : null}
              </span>
            ) : (
              <span>{isPrincipalRoute ? 'Pilih kelas untuk melihat rekap.' : 'Pilih tahun ajaran dan kelas untuk melihat rekap.'}</span>
            )}
          </div>
          {recapResponse?.data?.meta && (
            <div className="flex flex-wrap gap-2">
              <span>
                Periode:{' '}
                <span className="font-semibold text-gray-700">
                  {new Date(
                    recapResponse.data.meta.dateRange.start,
                  ).toLocaleDateString('id-ID')}{' '}
                  -{' '}
                  {new Date(
                    recapResponse.data.meta.dateRange.end,
                  ).toLocaleDateString('id-ID')}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-xl shadow-md border-0 p-12 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-gray-500 text-sm">
              Memuat rekap absensi, mohon tunggu sebentar...
            </p>
          </div>
        </div>
      )}

      {!loading && !recap.length && canLoadRecap && (
        <div className="bg-white rounded-xl shadow-md border-0 p-12 flex flex-col items-center justify-center text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium mb-1">
            Belum ada data absensi untuk filter ini.
          </p>
          <p className="text-gray-500 text-sm">
            Pastikan absensi harian sudah diinput dan coba ubah periode atau kelas.
          </p>
        </div>
      )}

      {!loading && recap.length > 0 && (
        <>
          {totals && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl shadow-md border border-emerald-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-emerald-600 font-medium">
                    Total Hadir (termasuk Telat)
                  </p>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-700">
                  {totals.present + totals.late}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md border border-amber-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-amber-600 font-medium">
                    Total Telat
                  </p>
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-amber-700">
                  {totals.late}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md border border-yellow-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-yellow-600 font-medium">
                    Total Sakit
                  </p>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                </div>
                <p className="text-2xl font-bold text-yellow-700">
                  {totals.sick}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md border border-sky-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-sky-600 font-medium">
                    Total Izin
                  </p>
                  <MinusCircle className="w-5 h-5 text-sky-600" />
                </div>
                <p className="text-2xl font-bold text-sky-700">
                  {totals.permission}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md border border-rose-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-rose-600 font-medium">
                    Total Alpha
                  </p>
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
                <p className="text-2xl font-bold text-rose-700">
                  {totals.absent}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <div className="lg:col-span-2 bg-white rounded-xl shadow-md border-0 overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Rekap Absensi Harian
                  </h2>
                  <p className="text-xs text-gray-500">
                    Telat dihitung hadir dalam persentase, namun tetap tercatat terpisah.
                  </p>
                </div>
                {totals && (
                  <div className="flex items-center gap-2 text-sm">
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    <span className="text-gray-600">
                      Rata-rata kehadiran:{' '}
                      <span className="font-semibold text-purple-700">
                        {totals.avgPercentage.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        No
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        NIS
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Nama Siswa
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Hadir
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Telat
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Sakit
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Izin
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Alpha
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Total
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Persentase
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {recap.map((item, index) => (
                      <tr key={item.student.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.student.nis || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {item.student.name}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-emerald-700 font-semibold">
                          {item.present}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-amber-700 font-semibold">
                          {item.late}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-yellow-700 font-semibold">
                          {item.sick}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-sky-700 font-semibold">
                          {item.permission}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-rose-700 font-semibold">
                          {item.absent}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 font-semibold">
                          {item.total}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-semibold">
                            {item.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Total siswa:{' '}
                  <span className="font-semibold text-gray-700">
                    {recap.length}
                  </span>
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Rekap Keterlambatan
                  </h2>
                  <p className="text-xs text-gray-500">
                    Ringkasan jumlah telat per semester untuk catatan wali kelas.
                  </p>
                </div>
              </div>
              {lateSummary.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">
                  Belum ada data telat untuk kelas dan tahun ajaran ini.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Siswa
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Ganjil
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Genap
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                      {lateSummary.map((item) => (
                        <tr key={item.student.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm">
                            <p className="font-medium text-gray-900">
                              {item.student.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              NIS: {item.student.nis || '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-amber-700 font-semibold">
                            {item.semester1Late}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-amber-700 font-semibold">
                            {item.semester2Late}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">
                              {item.totalLate}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
