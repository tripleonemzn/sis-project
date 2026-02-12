import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { attendanceService } from '../../services/attendance.service';
import { scheduleService, type ScheduleEntry, type DayOfWeek } from '../../services/schedule.service';
import { examService } from '../../services/exam.service';
import { authService } from '../../services/auth.service';
import api from '../../services/api';
import { Loader2, Calendar, BookOpen, UserCheck, Clock, ClipboardList, DoorClosed } from 'lucide-react';

interface MyExamSitting {
  id: number;
  roomName: string;
  examType: string;
  proctor?: { name: string };
}

interface AvailableExam {
  id: string;
  title: string;
  subject: { name: string };
  start_time: string;
  end_time: string;
  status: string;
}

export const StudentDashboard = () => {
  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: any, activeYear: any }>() || {};

  // Fallback to fetching user from API if not in context
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const apiUser = authData?.data;
  const user = contextUser || apiUser || {};
  const classId = user?.classId ?? null;

  // Fallback to fetching active year if not in context
  const { data: fetchedActiveYear, isLoading: isLoadingYears } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeAcademicYearId = activeAcademicYear?.id ?? null;

  // --- Exam Data ---
  const { data: mySittings } = useQuery({
    queryKey: ['my-exam-sittings', activeAcademicYearId],
    queryFn: async () => {
       const res = await api.get('/exam-sittings/my-sitting');
       return (res.data?.data || []) as MyExamSitting[];
    },
    enabled: !!user.id,
  });

  const { data: examSchedules } = useQuery({
    queryKey: ['available-exams', activeAcademicYearId],
    queryFn: examService.getAvailableExams,
    enabled: !!user.id,
  });

  const upcomingExams = useMemo(() => {
    // Handle if examSchedules is the ApiResponse object or the array directly
    const exams = Array.isArray(examSchedules) 
      ? examSchedules 
      : (examSchedules as any)?.data;

    if (!Array.isArray(exams)) return [];

    // Filter exams that are upcoming or ongoing
    return (exams as AvailableExam[]).filter(e => e.status !== 'missed' && e.status !== 'completed').slice(0, 5);
  }, [examSchedules]);

  const {
    data: attendanceHistoryData,
    isLoading: isLoadingAttendance,
  } = useQuery({
    queryKey: ['student-attendance-history', activeAcademicYearId, user?.id],
    queryFn: () => {
       const startDate = activeAcademicYear?.semester1Start ? new Date(activeAcademicYear.semester1Start).toISOString().split('T')[0] : undefined;
       const endDate = activeAcademicYear?.semester2End ? new Date(activeAcademicYear.semester2End).toISOString().split('T')[0] : undefined;
       
       return attendanceService.getStudentHistory({
        startDate,
        endDate
      });
    },
    enabled: !!activeAcademicYearId && !!user?.id,
  });

  const {
    data: scheduleData,
    isLoading: isLoadingSchedule,
  } = useQuery({
    queryKey: ['student-schedule', activeAcademicYearId, classId],
    queryFn: () =>
      scheduleService.list({
        academicYearId: activeAcademicYearId!,
        classId: classId!,
      }),
    enabled: !!activeAcademicYearId && !!classId,
  });

  const scheduleEntries: ScheduleEntry[] = useMemo(
    () => scheduleData?.data?.entries || [],
    [scheduleData],
  );

  const selfAttendance = useMemo(() => {
    const records = attendanceHistoryData?.data || [];
    if (!records.length) return null;
    
    const present = records.filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const total = records.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return {
        percentage,
        present,
        sick: records.filter((r: any) => r.status === 'SICK').length,
        permission: records.filter((r: any) => r.status === 'PERMISSION').length,
        absent: records.filter((r: any) => r.status === 'ABSENT' || r.status === 'ALPHA').length,
        late: records.filter((r: any) => r.status === 'LATE').length,
        total,
    };
  }, [attendanceHistoryData]);

  const totalSubjects = useMemo(() => {
    if (!scheduleEntries.length) return 0;
    const uniqueSubjects = new Set(scheduleEntries.map(entry => entry.teacherAssignment?.subject?.id).filter(Boolean));
    return uniqueSubjects.size;
  }, [scheduleEntries]);

  const totalWeeklyPeriods = scheduleEntries.length;

  const todayLabel = useMemo(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return formatter.format(now);
  }, []);

  const todayDayOfWeek: DayOfWeek | null = useMemo(() => {
    const now = new Date();
    const jsDay = now.getDay();
    if (jsDay === 0) {
      return null;
    }
    const mapping: DayOfWeek[] = [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    return mapping[jsDay - 1] || null;
  }, []);

  const todaySchedule = useMemo(() => {
    if (!todayDayOfWeek) {
      return [];
    }
    return scheduleEntries
      .filter((entry) => entry.dayOfWeek === todayDayOfWeek)
      .sort((a, b) => a.period - b.period);
  }, [scheduleEntries, todayDayOfWeek]);

  const attendancePercentage = selfAttendance?.percentage ?? null;

  const isLoading =
    isLoadingYears ||
    (!!activeAcademicYearId &&
      !!classId &&
      (isLoadingAttendance || isLoadingSchedule));

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600 text-sm">
          Data pengguna tidak ditemukan. Silakan login ulang.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const isAlumni = user.studentStatus === 'GRADUATED';

  return (
    <div className="space-y-6">      
      <div className="bg-white rounded-2xl px-6 py-4 shadow-sm border border-gray-100 mt-10 relative flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="-mt-16 relative">
            <div
              className="w-36 h-36 rounded-full p-1 bg-white ring-1 ring-gray-200"
              style={{
                boxShadow:
                  'inset 6px 6px 12px rgba(0,0,0,0.06), inset -6px -6px 12px rgba(255,255,255,0.9), 8px 8px 16px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.7)',
              }}
            >
              {user.photo ? (
                <img
                  src={
                    user.photo.startsWith('/api') || user.photo.startsWith('http')
                      ? user.photo
                      : `/api/uploads/${user.photo}`
                  }
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-6xl">
                  {(user?.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {isAlumni ? 'Selamat Datang Kembali,' : 'Selamat Datang,'} {user?.name}
            </h1>
            <p className="text-gray-500 text-sm">
              {isAlumni
                ? 'Anda terdaftar sebagai alumni. Anda dapat melihat riwayat belajar dan nilai.'
                : `Berikut adalah ringkasan aktivitas akademik Anda | ${user.username}`}
            </p>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {/* Removed NIS/Username and Date as requested */}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <UserCheck size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Kehadiran</p>
              <h3 className="text-2xl font-bold text-gray-900">
                {attendancePercentage !== null
                  ? `${attendancePercentage.toFixed(1)}%`
                  : '-'}
              </h3>
              {selfAttendance && (
                <p className="text-xs text-gray-500 mt-1">
                  Hadir {selfAttendance.present} dari {selfAttendance.total} hari
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Mata Pelajaran</p>
              <h3 className="text-2xl font-bold text-gray-900">{totalSubjects}</h3>
              <p className="text-xs text-gray-500 mt-1">Per minggu pada jadwal aktif</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Jam/Minggu</p>
              <h3 className="text-2xl font-bold text-gray-900">
                {totalWeeklyPeriods || '-'}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Berdasarkan jadwal pelajaran yang sudah diatur
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Informasi Ujian */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jadwal Ujian */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Jadwal Ujian Terdekat</h2>
              <p className="text-xs text-gray-500 mt-0.5">Ujian yang akan datang atau sedang berlangsung.</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <ClipboardList size={18} />
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Tidak ada jadwal ujian aktif saat ini.</p>
            ) : (
              upcomingExams.map((exam) => (
                <div key={exam.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{exam.title}</div>
                    <div className="text-xs text-gray-500">{exam.subject?.name || '-'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-gray-900">
                      {(() => {
                        try {
                          const d = new Date(exam.start_time);
                          return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                        } catch { return '-'; }
                      })()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(() => {
                         try {
                           const d = new Date(exam.start_time);
                           return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                         } catch { return '-'; }
                      })()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ringkasan Kehadiran */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Ringkasan Kehadiran
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Rekap kehadiran berdasarkan data absensi kelas.
            </p>
          </div>
          {selfAttendance ? (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Hadir</span>
                <span className="font-semibold text-emerald-600">
                  {selfAttendance.present} hari
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Terlambat</span>
                <span className="font-semibold text-amber-600">
                  {selfAttendance.late} kali
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Sakit</span>
                <span className="font-semibold text-gray-700">
                  {selfAttendance.sick} hari
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Izin</span>
                <span className="font-semibold text-gray-700">
                  {selfAttendance.permission} hari
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Alpa</span>
                <span className="font-semibold text-red-600">
                  {selfAttendance.absent} hari
                </span>
              </div>
              <div className="border-t border-dashed border-gray-200 pt-3 mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-600">Total Hari</span>
                <span className="font-semibold text-gray-900">
                  {selfAttendance.total} hari
                </span>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-gray-500">
              <UserCheck className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="font-medium">
                Belum ada rekap kehadiran yang tersedia.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Rekap akan muncul setelah guru mengisi absensi.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Jadwal Pelajaran hari ini
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Daftar pelajaran yang dijadwalkan pada hari ini.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>{todayLabel}</span>
            </div>
          </div>
          {todaySchedule.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <Calendar className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="font-medium">Tidak ada jadwal pelajaran hari ini.</p>
              <p className="text-xs text-gray-400 mt-1">
                Jadwal akan muncul setelah diatur oleh Admin.
              </p>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              {todaySchedule.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                >
                  <div className="w-14 text-xs font-semibold text-gray-500 pt-0.5">
                    Jam {entry.period}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {entry.teacherAssignment?.subject?.code || '-'} •{' '}
                      {entry.teacherAssignment?.subject?.name || '-'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Guru {entry.teacherAssignment?.teacher?.name || '-'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Ruang {entry.room || '-'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
             <div>
              <h2 className="text-sm font-semibold text-gray-900">Ruang Ujian Saya</h2>
              <p className="text-xs text-gray-500 mt-0.5">Lokasi tempat duduk ujian Anda.</p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
              <DoorClosed size={18} />
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {mySittings?.length === 0 ? (
               <p className="text-sm text-gray-500 text-center py-4">Belum ada pembagian ruang.</p>
            ) : (
              mySittings?.map((sitting) => (
                <div key={sitting.id} className="p-3 border rounded-lg bg-purple-50 border-purple-100">
                  <div className="text-sm font-bold text-purple-900">{sitting.roomName}</div>
                  <div className="flex justify-between items-center mt-2">
                     <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded">{sitting.examType}</span>
                     {sitting.proctor && <span className="text-xs text-gray-600">Pengawas: {sitting.proctor.name}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
