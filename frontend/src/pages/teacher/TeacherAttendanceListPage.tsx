import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Users,
  ClipboardCheck,
  Search,
  Loader2,
  GraduationCap
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

  // Helper function for card colors based on grade level
  const getGradeColorStyles = (level: string) => {
    switch (level) {
      case 'X':
        return {
          gradient: 'from-teal-50 to-white',
          badge: 'bg-teal-100 text-teal-800 border-teal-200',
        };
      case 'XII':
        return {
          gradient: 'from-orange-50 to-white',
          badge: 'bg-orange-100 text-orange-800 border-orange-200',
        };
      case 'XI':
      default:
        return {
          gradient: 'from-blue-50 to-white',
          badge: 'bg-blue-100 text-blue-800 border-blue-200',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Presensi Siswa</h1>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {assignments.map((assignment) => {
            const styles = getGradeColorStyles(assignment.class.level);
            return (
            <div
              key={assignment.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200 flex flex-col"
            >
              {/* Card Header */}
              <div className={`p-4 border-b border-gray-50 bg-gradient-to-r ${styles.gradient}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles.badge}`}>
                    {assignment.class.level}
                  </span>
                  <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-md border border-gray-100">
                    <span className="text-gray-400">KKM:</span>
                    <span className="text-gray-700 font-bold">{assignment.kkm}</span>
                  </div>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-0.5 line-clamp-1" title={assignment.class.name}>
                  {assignment.class.name}
                </h3>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                   <GraduationCap className="w-3 h-3" />
                   {assignment.class.major.name}
                </p>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1">
                <div className="mb-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Mata Pelajaran</p>
                    <div className="flex items-start gap-2">
                        <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                            <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-sm text-gray-900 line-clamp-2 leading-tight" title={assignment.subject.name}>
                                {assignment.subject.name}
                            </p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">{assignment.subject.code}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 p-1.5 rounded-lg">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    <span className="font-semibold text-gray-900">
                        {assignment.class._count?.students || 0}
                    </span> Siswa
                  </span>
                </div>
              </div>

              {/* Card Footer (Actions) */}
              <div className="p-3 bg-gray-50 border-t border-gray-100">
                <Link
                  to={`/teacher/attendance/${assignment.id}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  Isi Presensi
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
