import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Users,
  ClipboardCheck,
  Search,
  Loader2,
} from 'lucide-react';
import { teacherAssignmentService, type TeacherAssignment } from '../../services/teacherAssignment.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

export const TeacherAttendanceListPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();
  const effectiveAcademicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0) || null;

  // 1. Get Assignments
  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['teacher-assignments', effectiveAcademicYearId],
    queryFn: () =>
      teacherAssignmentService.list({
        academicYearId: effectiveAcademicYearId!,
        limit: 100,
      }),
    enabled: !!effectiveAcademicYearId,
  });

  const assignments = useMemo<TeacherAssignment[]>(() => {
    let data: TeacherAssignment[] = assignmentsData?.data?.assignments || [];
    
    // Sort by Subject Name first, then Class Name
    if (Array.isArray(data)) {
      data.sort((a, b) => {
        const subjectCompare = a.subject.name.localeCompare(b.subject.name);
        if (subjectCompare !== 0) return subjectCompare;
        return a.class.name.localeCompare(b.class.name);
      });
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      data = data.filter(
        (a) =>
          a.class.name.toLowerCase().includes(lowerQuery) ||
          a.subject.name.toLowerCase().includes(lowerQuery) ||
          a.subject.code.toLowerCase().includes(lowerQuery)
      );
    }
    
    return data;
  }, [assignmentsData, searchQuery]);

  const isLoading = isLoadingActiveAcademicYear || (!!effectiveAcademicYearId && isLoadingAssignments);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Presensi Siswa</h1>
          <p className="text-gray-500">
            Pilih kelas untuk mencatat kehadiran siswa.
          </p>
        </div>

        
      </div>

      {!isLoadingActiveAcademicYear && !effectiveAcademicYearId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar presensi siswa tidak ambigu.
        </div>
      ) : null}

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="attendance-search"
            name="attendance-search"
            placeholder="Cari kelas atau mata pelajaran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <p>Memuat data kelas...</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Belum Ada Kelas</h3>
          <p className="text-gray-500 max-w-sm">
            Anda belum memiliki penugasan mengajar pada tahun ajaran ini. Hubungi kurikulum jika ini kesalahan.
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-section-title text-gray-900">Daftar Kelas Presensi</h2>
            <p className="mt-1 text-sm text-gray-500">
              {assignments.length} penugasan mengajar tersedia untuk diisi presensinya.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kelas</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tingkat & Jurusan</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mata Pelajaran</th>
                  <th className="w-24 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">KKM</th>
                  <th className="w-28 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Siswa</th>
                  <th className="w-40 px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((assignment, index) => (
                  <tr key={assignment.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">{assignment.class.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">ID kelas: {assignment.class.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {assignment.class.level}
                      </span>
                      <p className="mt-1 text-sm text-gray-700">{assignment.class.major.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{assignment.subject.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-gray-500">{assignment.subject.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">{assignment.kkm}</td>
                    <td className="px-5 py-4">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        {assignment.class._count?.students || 0}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <Link
                          to={`/teacher/attendance/${assignment.id}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          Isi Presensi
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
