import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import {
  scheduleService,
  type TeachingLoadTeacherSummary,
} from '../../../services/schedule.service';
import { teacherAssignmentService, type TeacherAssignment } from '../../../services/teacherAssignment.service';
import { Loader2, BarChart3, Users, Clock, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

type TeachingLoadSummaryScope = 'DEFAULT' | 'CURRICULUM';

type TeachingLoadSummaryPageProps = {
  scope?: TeachingLoadSummaryScope;
};

export const TeachingLoadSummaryPage = ({ scope = 'DEFAULT' }: TeachingLoadSummaryPageProps) => {
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | ''>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | ''>('');

  const { data: academicYearData, isLoading: isLoadingYears } = useQuery({
    queryKey: ['academic-years', 'for-teaching-load'],
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

  const isCurriculumScope = scope === 'CURRICULUM';

  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['teacher-assignments', 'for-teaching-load', effectiveAcademicYearId, isCurriculumScope ? 'CURRICULUM' : 'DEFAULT'],
    queryFn: () =>
      teacherAssignmentService.list({
        page: 1,
        limit: 1000,
        scope: isCurriculumScope ? 'CURRICULUM' : undefined,
      }),
    enabled: !!effectiveAcademicYearId,
  });

  const teacherOptions = useMemo(() => {
    const assignments: TeacherAssignment[] =
      assignmentsData?.data?.assignments || [];

    const map = new Map<number, { id: number; name: string; username: string }>();

    for (const a of assignments) {
      if (a.academicYear.id !== effectiveAcademicYearId) continue;
      if (!map.has(a.teacher.id)) {
        map.set(a.teacher.id, {
          id: a.teacher.id,
          name: a.teacher.name,
          username: a.teacher.username,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'id'),
    );
  }, [assignmentsData, effectiveAcademicYearId]);

  const canLoadSummary = !!effectiveAcademicYearId;

  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    isFetching: isFetchingSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['teaching-load-summary', effectiveAcademicYearId, selectedTeacherId],
    queryFn: () =>
      scheduleService.teachingSummary({
        academicYearId: effectiveAcademicYearId as number,
        teacherId: selectedTeacherId ? (selectedTeacherId as number) : undefined,
      }),
    enabled: canLoadSummary,
  });

  const summaries: TeachingLoadTeacherSummary[] = useMemo(
    () => summaryData?.data?.teachers || [],
    [summaryData],
  );

  const totals = useMemo(() => {
    if (!summaries.length) {
      return null;
    }

    const totalTeachers = summaries.length;
    const totalHours = summaries.reduce((sum, t) => sum + t.totalHours, 0);
    const totalSessions = summaries.reduce((sum, t) => sum + t.totalSessions, 0);

    return {
      totalTeachers,
      totalHours,
      totalSessions,
      averageHours: totalTeachers ? totalHours / totalTeachers : 0,
    };
  }, [summaries]);

  const loading =
    isLoadingYears || isLoadingAssignments || isLoadingSummary || isFetchingSummary;

  const handleApplyFilter = async () => {
    if (!canLoadSummary) {
      toast.error('Pilih tahun ajaran terlebih dahulu');
      return;
    }

    try {
      const result = await refetchSummary();
      if (!result.data?.data?.teachers?.length) {
        toast('Belum ada data jadwal mengajar untuk filter ini', { icon: 'ℹ️' });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rekap Jam Mengajar Guru</h1>
          <p className="text-gray-500">
            Ringkasan jumlah mata pelajaran, kelas, dan total jam mengajar per guru
            berdasarkan jadwal pelajaran.
          </p>
        </div>
        <button
          type="button"
          onClick={handleApplyFilter}
          disabled={loading || !canLoadSummary}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isFetchingSummary && <Loader2 className="w-4 h-4 animate-spin" />}
          <Search className="w-4 h-4" />
          <span>Terapkan Filter</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="teaching-load-academic-year"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tahun Ajaran
            </label>
            <select
              id="teaching-load-academic-year"
              name="teaching-load-academic-year"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={effectiveAcademicYearId}
              onChange={(e) =>
                setSelectedAcademicYearId(
                  e.target.value ? Number(e.target.value) : '',
                )
              }
            >
              {!academicYears.length && (
                <option value="">Belum ada tahun ajaran</option>
              )}
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
              htmlFor="teaching-load-teacher"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Guru
            </label>
            <select
              id="teaching-load-teacher"
              name="teaching-load-teacher"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={selectedTeacherId}
              onChange={(e) =>
                setSelectedTeacherId(
                  e.target.value ? Number(e.target.value) : '',
                )
              }
              disabled={!teacherOptions.length}
            >
              {!teacherOptions.length && (
                <option value="">Belum ada penugasan guru</option>
              )}
              {teacherOptions.length > 0 && <option value="">Semua guru</option>}
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.username})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Guru Mengajar</p>
            <p className="text-2xl font-bold text-gray-900">
              {totals ? totals.totalTeachers : 0}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Jam Mengajar</p>
            <p className="text-2xl font-bold text-gray-900">
              {totals ? totals.totalHours : 0}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Rata-rata Jam / Guru</p>
            <p className="text-2xl font-bold text-gray-900">
              {totals ? totals.averageHours.toFixed(1) : '0.0'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && !summaries.length ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : summaries.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">Belum ada data jam mengajar untuk filter ini.</p>
            <p className="text-sm text-gray-400 mt-1">
              Pastikan jadwal pelajaran sudah diinput pada tahun ajaran yang dipilih.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-100 text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">NAMA GURU</th>
                  <th className="px-6 py-3 text-left">USERNAME</th>
                  <th className="px-6 py-3 text-center">JUMLAH MAPEL</th>
                  <th className="px-6 py-3 text-center">JUMLAH KELAS</th>
                  <th className="px-6 py-3 text-center">TOTAL JAM MENGAJAR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaries.map((item) => (
                  <tr key={item.teacherId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{item.teacherName}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.teacherUsername}</td>
                    <td className="px-6 py-4 text-center text-gray-900 font-semibold">
                      {item.totalSubjects}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-900 font-semibold">
                      {item.totalClasses}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-900 font-semibold">
                      {item.totalHours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
