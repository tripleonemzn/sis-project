import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import { scheduleService } from '../../services/schedule.service';
import { scheduleTimeConfigService } from '../../services/scheduleTimeConfig.service';
import { authService } from '../../services/auth.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { BookOpen, Users, Calendar, Loader2, Clock } from 'lucide-react';

export const TeacherDashboard = () => {
  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: any, activeYear: any }>() || {};
  
  // Fallback to fetching user from API if not in context (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const apiUser = authData?.data;
  const user = contextUser || apiUser || {};
  
  // Use hook for redundant reliable fetching
  const { data: fetchedActiveYear, isLoading: isLoadingYear, isError: isYearError, refetch: refetchYear, error: yearError } = useActiveAcademicYear();

  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeAcademicYearId = activeAcademicYear?.id ?? null;
  
  // DEBUG LOGS
  console.log('TeacherDashboard Render:', { 
    isLoadingYear, 
    isYearError, 
    fetchedActiveYear, 
    contextActiveYear,
    activeAcademicYearId 
  });
  const isExaminer = user.role === 'EXAMINER';

  const { data: assignmentsData, isLoading: isLoadingAssignments, refetch: refetchAssignments } = useQuery({
    queryKey: ['teacher-assignments-dashboard', activeAcademicYearId, user.id],
    queryFn: () =>
      teacherAssignmentService.list({
        academicYearId: activeAcademicYearId!,
        teacherId: Number(user.id),
        limit: 100, 
      }),
    enabled: !!activeAcademicYearId && !!user.id && !isExaminer,
  });

  useEffect(() => {
      if (activeAcademicYearId) {
          console.log('Active Year ID changed to:', activeAcademicYearId, '- Forcing Refetch');
          refetchAssignments();
      }
  }, [activeAcademicYearId, refetchAssignments]);

  const { data: scheduleData, isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['teacher-schedule-dashboard', activeAcademicYearId, user.id],
    queryFn: () =>
      scheduleService.list({
        academicYearId: activeAcademicYearId!,
        teacherId: Number(user.id),
        limit: 100,
      }),
    enabled: !!activeAcademicYearId && !!user.id && !isExaminer,
  });

  const { data: timeConfig } = useQuery({
    queryKey: ['schedule-time-config', activeAcademicYearId],
    queryFn: () => scheduleTimeConfigService.getConfig(activeAcademicYearId!),
    enabled: !!activeAcademicYearId,
  });

  const assignments = useMemo(() => {
    const list = assignmentsData?.data?.assignments || [];
    return [...list].sort((a: any, b: any) => {
      const subjectDiff = a.subject.name.localeCompare(b.subject.name);
      if (subjectDiff !== 0) return subjectDiff;
      return a.class.name.localeCompare(b.class.name, undefined, { numeric: true });
    });
  }, [assignmentsData]);
  
  const totalHours = useMemo(() => {
    if (!scheduleData?.data?.entries) return 0;
    
    let count = 0;
    const entries = scheduleData.data.entries;
    const periodNotes = timeConfig?.config?.periodNotes || {};

    for (const entry of entries) {
       const note = periodNotes[entry.dayOfWeek]?.[entry.period];
       const n = note ? note.toUpperCase() : '';
       if (!n.includes('UPACARA') && !n.includes('ISTIRAHAT') && !n.includes('TADARUS')) {
         count++;
       }
    }
    return count;
  }, [scheduleData, timeConfig]);

  const uniqueClasses = new Set(assignments.map((a: any) => a.class.id)).size;
  const uniqueSubjects = new Set(assignments.map((a: any) => a.subject.id)).size;
  
  const todaySchedule = useMemo(() => {
    const entries = scheduleData?.data?.entries;
    if (!Array.isArray(entries)) return [];
    
    // Get current day of week (0=Sunday, 1=Monday, etc.)
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const currentDay = days[new Date().getDay()];
    
    return entries
      .filter((entry: any) => entry.dayOfWeek === currentDay)
      .sort((a: any, b: any) => a.period - b.period);
  }, [scheduleData]);

  if (isYearError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <p className="text-red-500 font-medium">Gagal memuat data Tahun Ajaran</p>
        <button 
          onClick={() => refetchYear()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Coba Lagi
        </button>
        <pre className="text-xs text-gray-400 bg-gray-100 p-2 rounded max-w-lg overflow-auto">
          {yearError instanceof Error ? yearError.message : String(yearError)}
        </pre>
      </div>
    );
  }

  const showLoadingStats = (isLoadingAssignments && !!activeAcademicYearId) || 
                           (isLoadingSchedule && !!activeAcademicYearId) || 
                           (isLoadingYear && !activeAcademicYearId);
  const isDataMissing = !activeAcademicYearId && !isLoadingYear && !isYearError;

  return (
    <div className="space-y-6">

      {/* Welcome Section */}
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
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-6xl">
                  {user.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Selamat Datang, {user.name}! 👋
            </h1>
            <p className="text-gray-500 text-sm">
              Berikut adalah ringkasan kegiatan mengajar Anda | {isExaminer ? (user.institution || 'Instansi Luar') : user.username}
            </p>
          </div>
        </div>
        
        {/* Retry Button if Data Missing (Not Error, just missing active year) */}
        {isDataMissing && (
             <div className="flex flex-col items-end">
                <span className="text-xs text-orange-500 font-medium mb-1">Tahun Ajaran Tidak Aktif</span>
                <button 
                  onClick={() => refetchYear()}
                  className="px-3 py-1.5 bg-orange-100 text-orange-600 text-sm rounded-lg hover:bg-orange-200 transition-colors flex items-center gap-2"
                >
                  <Clock size={14} />
                  Cek Tahun Ajaran
                </button>
             </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Mata Pelajaran</p>
              {showLoadingStats ? (
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 mt-1" />
              ) : (
                  <h3 className="text-2xl font-bold text-gray-900">{isDataMissing ? '-' : uniqueSubjects}</h3>
              )}
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Kelas Ajar</p>
              {showLoadingStats ? (
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mt-1" />
              ) : (
                  <h3 className="text-2xl font-bold text-gray-900">{isDataMissing ? '-' : uniqueClasses}</h3>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Jam</p>
              {showLoadingStats ? (
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600 mt-1" />
              ) : (
                  <h3 className="text-2xl font-bold text-gray-900">{isDataMissing ? '-' : totalHours}</h3>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Schedule */}
      {!isExaminer && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Jadwal Hari Ini
            </h2>
            <span className="text-sm text-gray-500">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          <div className="space-y-4">
            {todaySchedule.length > 0 ? (
              todaySchedule.map((schedule: any) => (
                <div key={schedule.id} className="flex items-center gap-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="w-16 h-16 rounded-lg bg-blue-50 flex flex-col items-center justify-center text-blue-600">
                    <span className="text-xs font-medium">Jam Ke</span>
                    <span className="text-xl font-bold">{schedule.period}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{schedule.subject?.name}</h3>
                    <p className="text-sm text-gray-500">{schedule.class?.name}</p>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                      <Clock size={14} />
                      {schedule.startTime} - {schedule.endTime}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <Calendar className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">Tidak ada jadwal mengajar hari ini</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
