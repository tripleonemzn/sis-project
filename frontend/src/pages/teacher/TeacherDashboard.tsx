import { useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import { scheduleService, type DayOfWeek, type ScheduleEntry } from '../../services/schedule.service';
import { scheduleTimeConfigService } from '../../services/scheduleTimeConfig.service';
import { authService } from '../../services/auth.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { BookOpen, Users, Calendar, Loader2, Clock } from 'lucide-react';
import type { User } from '../../types/auth';

type TeacherDashboardOutletContext = {
  user?: User | null;
  activeYear?: { id?: number | null } | null;
};

type ScheduleEntryWithTime = ScheduleEntry & {
  startTime?: string | null;
  endTime?: string | null;
};

type ScheduleBlock = {
  subject: ScheduleEntry['teacherAssignment']['subject'] | null;
  class: ScheduleEntry['teacherAssignment']['class'] | null;
  room: string;
  dayOfWeek: DayOfWeek;
  entries: ScheduleEntryWithTime[];
  startHour: number;
  endHour: number;
};

const isDefinedNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number';

export const TeacherDashboard = () => {
  const { user: contextUser, activeYear: contextActiveYear } =
    useOutletContext<TeacherDashboardOutletContext>() || {};
  
  // Fallback to fetching user from API if not in context (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const apiUser = authData?.data;
  const user: Partial<User> = contextUser || apiUser || {};
  
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
  const userName = user.name || 'Guru';
  const isExaminer = user?.role === 'EXAMINER';

  const { isLoading: isLoadingAssignments, refetch: refetchAssignments } = useQuery({
    queryKey: ['teacher-assignments-dashboard', activeAcademicYearId, user?.id],
    queryFn: () =>
      teacherAssignmentService.list({
        academicYearId: activeAcademicYearId!,
        teacherId: Number(user?.id),
        limit: 100, 
      }),
    enabled: !!activeAcademicYearId && !!user?.id && !isExaminer,
  });

  useEffect(() => {
      if (activeAcademicYearId) {
          console.log('Active Year ID changed to:', activeAcademicYearId, '- Forcing Refetch');
          refetchAssignments();
      }
  }, [activeAcademicYearId, refetchAssignments]);

  const { data: scheduleData, isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['teacher-schedule-dashboard', activeAcademicYearId, user?.id],
    queryFn: () =>
      scheduleService.list({
        academicYearId: activeAcademicYearId!,
        teacherId: Number(user?.id),
        limit: 100,
      }),
    enabled: !!activeAcademicYearId && !!user?.id && !isExaminer,
  });

  const { data: timeConfig } = useQuery({
    queryKey: ['schedule-time-config', activeAcademicYearId],
    queryFn: () => scheduleTimeConfigService.getConfig(activeAcademicYearId!),
    enabled: !!activeAcademicYearId,
  });

  const periodTypes = timeConfig?.config?.periodTypes;
  const periodNotes = timeConfig?.config?.periodNotes;

  const scheduleEntries = useMemo(() => {
    const entries = scheduleData?.data?.entries;
    return Array.isArray(entries) ? (entries as ScheduleEntryWithTime[]) : [];
  }, [scheduleData?.data?.entries]);

  const isNonTeaching = useCallback((day: DayOfWeek, period: number) => {
    const types = periodTypes || {};
    const typeRaw = types[day]?.[period];
    if (typeRaw) {
      const t = String(typeRaw).toUpperCase();
      if (t === 'UPACARA' || t === 'ISTIRAHAT' || t === 'TADARUS' || t === 'OTHER') {
        return true;
      }
      if (t === 'TEACHING') {
        return false;
      }
    }
    const note = periodNotes?.[day]?.[period];
    if (!note) {
      return false;
    }
    const n = String(note).toUpperCase();
    if (n.includes('UPACARA')) {
      return true;
    }
    if (n.includes('ISTIRAHAT')) {
      return true;
    }
    if (n.includes('TADARUS')) {
      return true;
    }
    return false;
  }, [periodNotes, periodTypes]);

  const getTeachingHour = useCallback((day: DayOfWeek, currentPeriod: number) => {
    let teachingCounter = 0;
    for (let p = 1; p <= currentPeriod; p += 1) {
      if (!isNonTeaching(day, p)) {
        teachingCounter += 1;
      }
    }
    if (isNonTeaching(day, currentPeriod)) {
      return null;
    }
    return teachingCounter > 0 ? teachingCounter : null;
  }, [isNonTeaching]);

  const teachingEntries = useMemo(() => {
    return scheduleEntries.filter((entry) => {
      if (entry.teachingHour === null) {
        return false;
      }
      if (typeof entry.teachingHour === 'number') {
        return true;
      }
      return !isNonTeaching(entry.dayOfWeek as DayOfWeek, entry.period);
    });
  }, [isNonTeaching, scheduleEntries]);

  const totalHours = useMemo(() => {
    return teachingEntries.length;
  }, [teachingEntries]);

  const uniqueClasses = useMemo(
    () =>
      new Set(
        teachingEntries
          .map((entry) => entry.teacherAssignment?.class?.id)
          .filter(isDefinedNumber),
      ).size,
    [teachingEntries],
  );

  const uniqueSubjects = useMemo(
    () =>
      new Set(
        teachingEntries
          .map((entry) => entry.teacherAssignment?.subject?.id)
          .filter(isDefinedNumber),
      ).size,
    [teachingEntries],
  );
  
  const todayScheduleBlocks = useMemo(() => {
    if (!scheduleEntries.length) return [];

    const now = new Date();
    const jsDay = now.getDay();
    if (jsDay === 0) {
      return [];
    }
    const days: DayOfWeek[] = [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const currentDay = days[jsDay - 1];

    const filtered = scheduleEntries.filter(
      (entry) =>
        entry.dayOfWeek === currentDay &&
        (entry.teachingHour === null
          ? false
          : typeof entry.teachingHour === 'number'
          ? true
          : !isNonTeaching(entry.dayOfWeek as DayOfWeek, entry.period)),
    );

    filtered.sort((a, b) => {
      const aHour = typeof a.teachingHour === 'number' ? a.teachingHour : a.period;
      const bHour = typeof b.teachingHour === 'number' ? b.teachingHour : b.period;
      return aHour - bHour;
    });

    const blocks: ScheduleBlock[] = [];

    for (const entry of filtered) {
      const teachingHour =
        typeof entry.teachingHour === 'number'
          ? entry.teachingHour
          : getTeachingHour(entry.dayOfWeek as DayOfWeek, entry.period);
      if (!teachingHour) {
        continue;
      }

      const subject = entry.teacherAssignment?.subject || null;
      const cls = entry.teacherAssignment?.class || null;
      const room = entry.room || '-';

      const last = blocks[blocks.length - 1];
      const canMerge =
        last &&
        last.subject?.id === subject?.id &&
        last.class?.id === cls?.id &&
        last.room === room &&
        teachingHour === last.endHour + 1;

      if (!canMerge) {
        blocks.push({
          subject,
          class: cls,
          room,
          dayOfWeek: entry.dayOfWeek,
          entries: [entry],
          startHour: teachingHour,
          endHour: teachingHour,
        });
      } else {
        last.entries.push(entry);
        last.endHour = teachingHour;
      }
    }

    return blocks;
  }, [getTeachingHour, isNonTeaching, scheduleEntries]);

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
      <div className="bg-gradient-to-br from-sky-50 to-cyan-100/80 rounded-2xl px-6 py-4 shadow-sm border border-sky-100 mt-10 relative flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="-mt-16 relative">
            <div
              className="w-36 h-36 rounded-full p-1 bg-white/90 ring-1 ring-sky-200"
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
                  alt={userName}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`;
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-6xl">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 mb-1">
              Selamat Datang, {userName}! 👋
            </h1>
            <p className="text-body text-gray-500">
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
        <Link
          to="/teacher/classes"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
        <div className="p-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-700">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-blue-700/80 font-medium">Mata Pelajaran</p>
              {showLoadingStats ? (
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 mt-1" />
              ) : (
                  <h3 className="text-metric font-bold text-blue-900">{isDataMissing ? '-' : uniqueSubjects}</h3>
              )}
            </div>
          </div>
        </div>
        </Link>
        
        <Link
          to="/teacher/classes"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
        <div className="p-6 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-teal-100 rounded-lg text-teal-700">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-teal-700/80 font-medium">Kelas Ajar</p>
              {showLoadingStats ? (
                  <Loader2 className="w-6 h-6 animate-spin text-teal-700 mt-1" />
              ) : (
                  <h3 className="text-metric font-bold text-teal-900">{isDataMissing ? '-' : uniqueClasses}</h3>
              )}
            </div>
          </div>
        </div>
        </Link>

        <Link
          to="/teacher/schedule"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
        <div className="p-6 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg text-orange-700">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-sm text-orange-700/80 font-medium">Total Jam</p>
              {showLoadingStats ? (
                  <Loader2 className="w-6 h-6 animate-spin text-orange-700 mt-1" />
              ) : (
                  <h3 className="text-metric font-bold text-orange-900">{isDataMissing ? '-' : totalHours}</h3>
              )}
            </div>
          </div>
        </div>
        </Link>
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
            {todayScheduleBlocks.length > 0 ? (
              todayScheduleBlocks.map((block, index: number) => {
                const cfg = timeConfig?.config;
                const entries = block.entries || [];
                const first = entries[0];
                const last = entries[entries.length - 1] || first;

                const firstTimeRaw =
                  cfg?.periodTimes?.[first?.dayOfWeek]?.[first?.period] ||
                  (first?.startTime && first?.endTime
                    ? `${first.startTime} - ${first.endTime}`
                    : '');
                const lastTimeRaw =
                  cfg?.periodTimes?.[last?.dayOfWeek]?.[last?.period] ||
                  (last?.startTime && last?.endTime
                    ? `${last.startTime} - ${last.endTime}`
                    : '');

                let timeRange = '-';
                if (firstTimeRaw && lastTimeRaw && firstTimeRaw.includes('-') && lastTimeRaw.includes('-')) {
                  const start = firstTimeRaw.split('-')[0].trim();
                  const end = lastTimeRaw.split('-')[1].trim();
                  timeRange = `${start} - ${end}`;
                } else {
                  timeRange = firstTimeRaw || lastTimeRaw || '-';
                }

                const subjectName = block.subject?.name || '-';
                const subjectCode = block.subject?.code || '';
                const className = block.class?.name || '-';
                const room = block.room || '-';
                const periodCount = entries.length;

                const labelIndex =
                  block.startHour === block.endHour
                    ? `${block.startHour}`
                    : `${block.startHour}-${block.endHour}`;

                return (
                  <div
                    key={`${subjectCode}-${className}-${index}-${block.startHour}-${block.endHour}`}
                    className="flex items-center gap-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-16 h-16 rounded-lg bg-blue-50 flex flex-col items-center justify-center text-blue-600">
                      <span className="text-xs font-medium">Jam Ke</span>
                      <span className="text-xl font-bold">{labelIndex}</span>
                      {periodCount > 1 && (
                        <span className="mt-0.5 text-[10px] text-blue-500 font-semibold">
                          {periodCount} JP
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {subjectCode ? `${subjectCode} • ${subjectName}` : subjectName}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Kelas {className} • Ruang {room}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                        <Clock size={14} />
                        {timeRange}
                      </div>
                    </div>
                  </div>
                );
              })
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
