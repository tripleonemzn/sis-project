import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import { classService, type Class } from '../../../services/class.service';
import {
  reportService,
  type ClassReportSummary,
} from '../../../services/report.service';
import { Loader2, Users, Award, AlertCircle, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

type RankingStudent = {
  id?: number;
  name?: string;
  nis?: string | null;
  nisn?: string | null;
};

type ClassRankingRow = {
  student?: RankingStudent | null;
  totalScore?: number | null;
  averageScore?: number | null;
  rank?: number | null;
};

type ClassRankingResponse = {
  rankings: ClassRankingRow[];
};

const normalizeRankingResponse = (payload: unknown): ClassRankingResponse | null => {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { rankings?: unknown };
  return {
    rankings: Array.isArray(row.rankings) ? (row.rankings as ClassRankingRow[]) : [],
  };
};

export const ReportCardsPage = () => {
  const location = useLocation();
  const isPrincipalRoute = location.pathname.startsWith('/principal');

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | ''>('');
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [viewMode, setViewMode] = useState<'REPORT' | 'RANKING'>(() =>
    isPrincipalRoute ? 'RANKING' : 'REPORT',
  );
  const [semester, setSemester] = useState<'ODD' | 'EVEN' | ''>('');

  const { data: academicYearData, isLoading: isLoadingYears } = useQuery({
    queryKey: ['academic-years', 'for-report-cards'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] = useMemo(
    () =>
      academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData],
  );

  const effectiveAcademicYearId = useMemo<number | ''>(() => {
    if (!academicYears.length) {
      return '';
    }

    if (selectedAcademicYearId) {
      const exists = academicYears.some((ay) => ay.id === selectedAcademicYearId);
      if (exists) {
        return selectedAcademicYearId;
      }
    }

    const active = academicYears.find((ay) => ay.isActive);
    if (active) {
      return active.id;
    }

    return academicYears[0]?.id ?? '';
  }, [academicYears, selectedAcademicYearId]);

  const { data: classData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes', 'for-report-cards', effectiveAcademicYearId],
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

  const canLoadReport = !isPrincipalRoute && !!effectiveAcademicYearId && !!effectiveClassId;

  const {
    data: reportResponse,
    isLoading: isLoadingReport,
    isFetching: isFetchingReport,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ['report-cards', effectiveAcademicYearId, effectiveClassId],
    queryFn: () =>
      reportService.getClassReportSummary({
        classId: effectiveClassId as number,
        academicYearId: effectiveAcademicYearId as number,
      }),
    enabled: canLoadReport,
  });

  const reportData: ClassReportSummary | null = useMemo(
    () => reportResponse || null,
    [reportResponse],
  );

  const {
    data: rankingResponse,
    isLoading: isLoadingRanking,
    isFetching: isFetchingRanking,
    refetch: refetchRanking,
  } = useQuery({
    queryKey: ['class-rankings', 'report-cards', effectiveAcademicYearId, effectiveClassId, semester],
    queryFn: () =>
      reportService.getClassRankings({
        classId: effectiveClassId as number,
        academicYearId: effectiveAcademicYearId as number,
        semester: semester as 'ODD' | 'EVEN',
      }),
    enabled: false,
  });

  const rankingData = useMemo(() => normalizeRankingResponse(rankingResponse), [rankingResponse]);
  const rankings = useMemo(
    () =>
      Array.isArray(rankingData?.rankings)
        ? [...rankingData.rankings].sort((a, b) => {
            const rankA = typeof a.rank === 'number' ? a.rank : Number.MAX_SAFE_INTEGER;
            const rankB = typeof b.rank === 'number' ? b.rank : Number.MAX_SAFE_INTEGER;
            return rankA - rankB;
          })
        : [],
    [rankingData],
  );

  const totalRankingStudents = rankings.length;

  const topStudent = totalRankingStudents > 0 ? rankings[0] : null;

  const classAverageFromRanking = useMemo(() => {
    if (!rankings.length) {
      return null;
    }

    const scores: number[] = [];
    rankings.forEach((row) => {
      if (typeof row.averageScore === 'number') {
        scores.push(row.averageScore);
      }
    });

    if (!scores.length) {
      return null;
    }

    const sum = scores.reduce((acc, value) => acc + value, 0);
    return Math.round((sum / scores.length) * 10) / 10;
  }, [rankings]);

  const loading =
    isLoadingYears ||
    isLoadingClasses ||
    (!isPrincipalRoute && (isLoadingReport || isFetchingReport)) ||
    isLoadingRanking ||
    isFetchingRanking;

  const canLoadRanking = !!effectiveAcademicYearId && !!effectiveClassId && !!semester;

  const handleRefresh = async () => {
    if (viewMode === 'REPORT' && !isPrincipalRoute) {
      if (!canLoadReport) {
        toast.error('Pilih tahun ajaran dan kelas terlebih dahulu');
        return;
      }

      try {
        const result = await refetchReport();
        if (!result.data?.students?.length) {
          toast('Belum ada data nilai untuk filter ini', { icon: 'ℹ️' });
        }
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
      return;
    }

    if (!canLoadRanking) {
      if (!effectiveAcademicYearId || !effectiveClassId) {
        toast.error('Pilih tahun ajaran dan kelas terlebih dahulu');
      } else if (!semester) {
        toast.error('Pilih semester terlebih dahulu');
      }
      return;
    }

    try {
      const result = await refetchRanking();
      const fetchedRankings = normalizeRankingResponse(result.data)?.rankings || [];
      if (!fetchedRankings.length) {
        toast('Belum ada data peringkat untuk filter ini', { icon: 'ℹ️' });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const totalStudents = reportData?.students.length || 0;

  const overallAverageScore = useMemo(() => {
    if (!reportData || !reportData.students.length) {
      return null;
    }

    const scores: number[] = [];

    reportData.students.forEach((row) => {
      row.subjects.forEach((s) => {
        if (typeof s.finalScore === 'number') {
          scores.push(s.finalScore);
        }
      });
    });

    if (!scores.length) {
      return null;
    }

    const sum = scores.reduce((acc, value) => acc + value, 0);
    return Math.round((sum / scores.length) * 10) / 10;
  }, [reportData]);

  const totalFailedSubjects = useMemo(() => {
    if (!reportData || !reportData.students.length) {
      return 0;
    }

    let total = 0;

    reportData.students.forEach((row) => {
      row.subjects.forEach((s) => {
        if (typeof s.finalScore === 'number' && s.finalScore < s.kkm) {
          total += 1;
        }
      });
    });

    return total;
  }, [reportData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Laporan / Rapor Kelas</h1>
          <p className="text-gray-500 text-sm">
            {isPrincipalRoute
              ? 'Ringkasan peringkat siswa per kelas berdasarkan nilai rapor.'
              : 'Ringkasan hasil belajar siswa per kelas, termasuk leger dan peringkat.'}
          </p>
          {!isPrincipalRoute && (
            <div className="mt-3 inline-flex rounded-lg bg-gray-100 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('REPORT')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  viewMode === 'REPORT'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-blue-700'
                }`}
              >
                Leger Nilai
              </button>
              <button
                type="button"
                onClick={() => setViewMode('RANKING')}
                className={`ml-1 px-3 py-1.5 rounded-md transition-colors ${
                  viewMode === 'RANKING'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-blue-700'
                }`}
              >
                Peringkat Kelas
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={
            loading ||
            (!isPrincipalRoute && viewMode === 'REPORT' && !canLoadReport) ||
            (viewMode === 'RANKING' && !semester)
          }
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {viewMode === 'REPORT' && isFetchingReport && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          {viewMode === 'RANKING' && isFetchingRanking && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          <span>Terapkan Filter</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="report-academic-year"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tahun Ajaran
            </label>
            <select
              id="report-academic-year"
              name="report-academic-year"
              value={effectiveAcademicYearId}
              onChange={(e) =>
                setSelectedAcademicYearId(e.target.value ? Number(e.target.value) : '')
              }
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Pilih Tahun Ajaran</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name}
                  {ay.isActive ? ' (Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="report-class"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Kelas
            </label>
            <select
              id="report-class"
              name="report-class"
              value={selectedClassId}
              onChange={(e) =>
                setSelectedClassId(e.target.value ? Number(e.target.value) : '')
              }
              disabled={!effectiveAcademicYearId || isLoadingClasses}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">Pilih Kelas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.major?.code || '-'})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-between">
            {viewMode === 'RANKING' && (
              <div className="mb-3">
                <label
                  htmlFor="report-semester"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Semester
                </label>
                <select
                  id="report-semester"
                  name="report-semester"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as 'ODD' | 'EVEN' | '')}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Pilih Semester</option>
                  <option value="ODD">Semester Ganjil</option>
                  <option value="EVEN">Semester Genap</option>
                </select>
                {isPrincipalRoute && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Kepala sekolah melihat peringkat per semester, bukan leger detail.
                  </p>
                )}
              </div>
            )}
            <div className="w-full text-sm text-gray-600">
              {reportData ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span>
                      Kelas: {reportData.class.name}{' '}
                      {reportData.class.major ? `(${reportData.class.major.code})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-gray-500" />
                    <span>
                      Wali Kelas:{' '}
                      {reportData.class.teacher
                        ? reportData.class.teacher.name
                        : '-'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">
                  Pilih tahun ajaran dan kelas lalu klik Terapkan Filter.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {!loading && viewMode === 'REPORT' && reportData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Jumlah Siswa</p>
                <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-50 text-green-600">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Rata-rata Nilai</p>
                <p className="text-2xl font-bold text-gray-900">
                  {overallAverageScore ?? '-'}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-50 text-red-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Total Mapel Belum Tuntas
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {totalFailedSubjects}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 font-medium">
                <tr>
                  <th className="px-6 py-3 text-left whitespace-nowrap w-10">NO</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap w-48">
                    NAMA SISWA
                  </th>
                  <th className="px-6 py-3 text-left whitespace-nowrap w-32">
                    NIS / NISN
                  </th>
                  {Array.isArray(reportData.subjects) &&
                    reportData.subjects.map((subject, index) => {
                      if (!subject) return null;
                      return (
                        <th
                          key={subject.id ?? `${subject.code ?? 'SUBJECT'}-${index}`}
                          className="px-4 py-3 text-center text-xs align-top"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-semibold text-[11px] text-gray-800 whitespace-normal break-words">
                              {subject.name ?? '-'}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {(subject.code || '-')} • KKM {subject.kkm}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  <th className="px-6 py-3 text-center whitespace-nowrap w-32">
                    RATA-RATA
                  </th>
                  <th className="px-6 py-3 text-center whitespace-nowrap w-32">
                    TUNTAS / BELUM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!Array.isArray(reportData.students) || !reportData.students.length ? (
                  <tr>
                    <td
                      colSpan={5 + (Array.isArray(reportData.subjects) ? reportData.subjects.length : 0)}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      Belum ada data nilai untuk kelas ini.
                    </td>
                  </tr>
                ) : (
                  reportData.students.map((row, index) => (
                    <tr
                      key={row.student?.id ?? `row-${index}`}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-gray-500 text-center">
                        {index + 1}
                      </td>
                      <td className="px-6 py-3 text-gray-900 whitespace-nowrap">
                        {row.student?.name ?? '-'}
                      </td>
                      <td className="px-6 py-3 text-gray-700 whitespace-nowrap text-xs">
                        <div className="flex flex-col">
                          <span>NIS: {row.student?.nis || '-'}</span>
                          <span>NISN: {row.student?.nisn || '-'}</span>
                        </div>
                      </td>
                      {Array.isArray(reportData.subjects) &&
                        reportData.subjects.map((subject) => {
                          if (!subject) return null;
                          const detail = row.subjects.find(
                            (s) => s.subject?.id === subject.id,
                          );
                        const score = detail?.finalScore ?? null;
                        const predicate = detail?.predicate ?? null;
                        const isPassed =
                          typeof score === 'number' && score >= subject.kkm;

                        return (
                          <td
                            key={subject.id}
                            className="px-4 py-3 text-center whitespace-nowrap text-xs"
                          >
                            {score === null ? (
                              <span className="text-gray-400">-</span>
                            ) : (
                              <span
                                className={
                                  isPassed
                                    ? 'text-green-600 font-semibold'
                                    : 'text-red-600 font-semibold'
                                }
                              >
                                {score}
                              </span>
                            )}
                            {predicate && (
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {predicate}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-6 py-3 text-center text-gray-900 font-semibold">
                        {row.summary?.averageScore ?? '-'}
                      </td>
                      <td className="px-6 py-3 text-center text-xs text-gray-700">
                        {row.summary?.failedCount === 0 && (row.summary?.passedCount || 0) > 0 ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                            Semua Tuntas
                          </span>
                        ) : (row.summary?.failedCount || 0) > 0 ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                            {row.summary?.failedCount} mapel belum tuntas
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-600">
                            Belum ada nilai
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && viewMode === 'RANKING' && (
        <div className="space-y-4">
          {rankings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Jumlah Siswa Berperingkat</p>
                  <p className="text-2xl font-bold text-gray-900">{totalRankingStudents}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-50 text-green-600">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Rata-rata Kelas (Ranking)</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {classAverageFromRanking ?? '-'}
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-yellow-50 text-yellow-600">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Siswa Peringkat 1</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {topStudent?.student?.name ?? '-'}
                  </p>
                  {typeof topStudent?.averageScore === 'number' && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Rata-rata {topStudent.averageScore}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            {!rankingData ? (
              <div className="px-6 py-12 text-center text-gray-500 text-sm">
                Pilih tahun ajaran, kelas, dan semester lalu klik Terapkan Filter untuk melihat
                peringkat.
              </div>
            ) : !rankings.length ? (
              <div className="px-6 py-12 text-center text-gray-500 text-sm">
                Belum ada data peringkat untuk filter ini.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 font-medium">
                  <tr>
                    <th className="px-6 py-3 text-left whitespace-nowrap w-10">NO</th>
                    <th className="px-6 py-3 text-left whitespace-nowrap w-40">NISN / NIS</th>
                    <th className="px-6 py-3 text-left whitespace-nowrap">NAMA SISWA</th>
                    <th className="px-6 py-3 text-center whitespace-nowrap w-32">JUMLAH NILAI</th>
                    <th className="px-6 py-3 text-center whitespace-nowrap w-32">RATA-RATA</th>
                    <th className="px-6 py-3 text-center whitespace-nowrap w-32">PERINGKAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rankings.map((row, index: number) => (
                    <tr key={row.student?.id ?? `rank-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-500 text-center">{index + 1}</td>
                      <td className="px-6 py-3 text-gray-700 whitespace-nowrap text-xs">
                        {row.student?.nisn || row.student?.nis || '-'}
                      </td>
                      <td className="px-6 py-3 text-gray-900 whitespace-nowrap">
                        {row.student?.name ?? '-'}
                      </td>
                      <td className="px-6 py-3 text-center text-gray-900 font-semibold">
                        {row.totalScore ?? '-'}
                      </td>
                      <td className="px-6 py-3 text-center text-gray-900 font-semibold">
                        {row.averageScore ?? '-'}
                      </td>
                      <td className="px-6 py-3 text-center text-gray-900 font-semibold">
                        {row.rank ? `Peringkat ${row.rank}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
