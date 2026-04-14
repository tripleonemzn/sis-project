import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { teacherAssignmentService, type TeacherAssignment } from '../../services/teacherAssignment.service';
import { scheduleService, type ScheduleEntry, type DayOfWeek } from '../../services/schedule.service';
import { scheduleTimeConfigService } from '../../services/scheduleTimeConfig.service';
import { authService } from '../../services/auth.service';
import { Calendar, BookOpen, GraduationCap, Loader2, Clock, X, ChevronRight, Users } from 'lucide-react';

type TeachingGroup = {
  subject: TeacherAssignment['subject'];
  level: string;
  classes: {
    id: number;
    name: string;
  }[];
};

type DaySchedule = {
  day: DayOfWeek;
  label: string;
  entries: {
    period: number;
    teachingHour: number;
    entry: ScheduleEntry;
  }[];
};

type TeacherScheduleOutletContext = {
  user?: { id?: number | null } | null;
  activeYear?: { id?: number | null } | null;
};

type TeacherAssignmentWithCount = TeacherAssignment & {
  _count?: {
    scheduleEntries?: number;
  };
};

type ScheduleTimeConfig = {
  periodTypes?: Partial<Record<DayOfWeek, Record<number, string>>>;
  periodNotes?: Partial<Record<DayOfWeek, Record<number, string>>>;
};

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
};

const DAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export const TeacherSchedulePage = () => {
  const { user: contextUser, activeYear: contextActiveYear } =
    useOutletContext<TeacherScheduleOutletContext>() || {};

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const teacherId = user?.id ?? null;
  const [selectedDayDetail, setSelectedDayDetail] = useState<DaySchedule | null>(null);

  const { data: fetchedActiveYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeAcademicYearId = activeAcademicYear?.id ?? null;

  const {
    data: assignmentsData,
    isLoading: isLoadingAssignments,
  } = useQuery({
    queryKey: ['teacher-schedule', activeAcademicYearId, teacherId],
    queryFn: () =>
      teacherAssignmentService.list({
        academicYearId: activeAcademicYearId!,
        teacherId: teacherId!,
        page: 1,
        limit: 100,
      }),
    enabled: !!activeAcademicYearId && !!teacherId,
  });

  const assignments: TeacherAssignmentWithCount[] = useMemo(
    () => (assignmentsData?.data?.assignments || []) as TeacherAssignmentWithCount[],
    [assignmentsData],
  );

  const scheduledAssignments: TeacherAssignmentWithCount[] = useMemo(
    () => assignments.filter((a) => (a._count?.scheduleEntries ?? 0) > 0),
    [assignments],
  );

  const {
    data: scheduleData,
    isLoading: isLoadingSchedule,
  } = useQuery({
    queryKey: ['teacher-schedule-level2', activeAcademicYearId, teacherId],
    queryFn: () =>
      scheduleService.list({
        academicYearId: activeAcademicYearId!,
        teacherId: teacherId!,
      }),
    enabled: !!activeAcademicYearId && !!teacherId,
  });

  const scheduleEntries: ScheduleEntry[] = useMemo(
    () => scheduleData?.data?.entries || [],
    [scheduleData],
  );

  const { data: timeConfig } = useQuery({
    queryKey: ['schedule-time-config', activeAcademicYearId],
    queryFn: () => scheduleTimeConfigService.getConfig(activeAcademicYearId!),
    enabled: !!activeAcademicYearId,
  });

  const isNonTeaching = useCallback((day: DayOfWeek, period: number) => {
    const cfg = (timeConfig?.config || {}) as ScheduleTimeConfig;
    const types = cfg.periodTypes || {};
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
    const note = cfg.periodNotes?.[day]?.[period];
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
  }, [timeConfig]);

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

  const totalStudents = useMemo(() => {
    return scheduledAssignments.reduce(
      (sum, a) => sum + (a.class._count?.students || 0),
      0,
    );
  }, [scheduledAssignments]);

  const daySchedules: DaySchedule[] = useMemo(() => {
    const map = new Map<DayOfWeek, DaySchedule>();

    for (const day of DAY_ORDER) {
      map.set(day, {
        day,
        label: DAY_LABELS[day],
        entries: [],
      });
    }

    for (const entry of scheduleEntries) {
      const day = entry.dayOfWeek;
      const teachingHour =
        typeof entry.teachingHour === 'number'
          ? entry.teachingHour
          : getTeachingHour(day, entry.period);
      // Skip non-teaching periods (Upacara, Istirahat, dll)
      if (!teachingHour) {
        continue;
      }

      const daySchedule = map.get(day);
      if (!daySchedule) {
        continue;
      }
      daySchedule.entries.push({
        period: entry.period,
        teachingHour,
        entry,
      });
    }

    for (const day of DAY_ORDER) {
      const ds = map.get(day);
      if (ds) {
        ds.entries.sort((a, b) => a.teachingHour - b.teachingHour);
      }
    }

    return DAY_ORDER.map((day) => map.get(day)!).filter(
      (ds) => ds.entries.length > 0,
    );
  }, [scheduleEntries, getTeachingHour]);

  const groups: TeachingGroup[] = useMemo(() => {
    const map = new Map<string, TeachingGroup>();

    for (const a of scheduledAssignments) {
      const level = a.class.level;
      const key = `${a.subject.id}-${level}`;
      const existing = map.get(key);

      const cls = { id: a.class.id, name: a.class.name };

      if (!existing) {
        map.set(key, {
          subject: a.subject,
          level,
          classes: [cls],
        });
      } else if (!existing.classes.some((c) => c.id === cls.id)) {
        existing.classes.push(cls);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.subject.code === b.subject.code) {
        return a.level.localeCompare(b.level, 'id');
      }
      return a.subject.code.localeCompare(b.subject.code, 'id');
    });
  }, [scheduledAssignments]);

  const hasLevel2Schedule = daySchedules.length > 0;

  const isLoading =
    (!!activeAcademicYearId && (isLoadingAssignments || isLoadingSchedule));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jadwal Mengajar</h1>
          <p className="text-body text-gray-500">
            Daftar penugasan mengajar Anda pada tahun ajaran aktif.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Mapel Diampu</p>
            <p className="text-2xl font-bold text-gray-900">
              {new Set(scheduledAssignments.map((a) => a.subject.id)).size}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Kelas Ajar</p>
            <p className="text-2xl font-bold text-gray-900">
              {new Set(scheduledAssignments.map((a) => a.class.id)).size}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Siswa</p>
            <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {groups.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <GraduationCap className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">Belum ada penugasan mengajar untuk tahun ajaran ini.</p>
            <p className="text-sm text-gray-400 mt-1">
              Silakan hubungi admin untuk mengatur assignment guru.
            </p>
          </div>
        ) : (
          <div 
            className={
              groups.length <= 1 
                ? "divide-y divide-gray-100"
                : groups.length === 2
                ? "grid grid-cols-1 md:grid-cols-2 gap-4 p-4"
                : groups.length === 3
                ? "grid grid-cols-1 md:grid-cols-3 gap-4 p-4"
                : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4"
            }
          >
            {groups.map((group) => (
              <div 
                key={`${group.subject.id}-${group.level}`} 
                className={groups.length > 1 
                  ? "p-4 border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all bg-white flex flex-col h-full"
                  : "p-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                }
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-card-title font-semibold text-gray-900 line-clamp-2" title={group.subject.name}>
                        {group.subject.code} • {group.subject.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">Tingkat {group.level}</div>
                    </div>
                  </div>
                  <div className="mt-3 ml-11">
                    <div className="text-xs font-medium text-gray-500 mb-1">
                      Kelas yang diajar
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.classes.map((cls) => (
                        <span
                          key={cls.id}
                          className="inline-flex items-center px-3 py-1 rounded-full bg-gray-50 text-gray-700 text-xs border border-gray-200"
                        >
                          <GraduationCap className="w-3 h-3 mr-1 text-gray-500" />
                          {cls.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-card-title font-semibold text-gray-900">
              Jadwal Mengajar Anda
            </h2>
            <p className="text-label text-gray-500 mt-0.5">
              Menampilkan jadwal per hari dan jam berdasarkan pengaturan jadwal pelajaran.
            </p>
          </div>
        </div>
        {!hasLevel2Schedule ? (
          <div className="py-10 text-center text-gray-500">
            <Calendar className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="font-medium">Jadwal per jam belum diatur.</p>
            <p className="text-xs text-gray-400 mt-1">
              Admin dapat mengatur jadwal pelajaran pada menu Jadwal Pelajaran di dashboard admin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 p-5">
            {daySchedules.map((day) => (
              <button
                key={day.day}
                onClick={() => setSelectedDayDetail(day)}
                className="group flex flex-col items-start bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-500 hover:shadow-md transition-all duration-200 text-left w-full"
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <h3 className="text-section-title font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {day.label}
                  </h3>
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Calendar size={18} />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                  <Clock size={16} />
                  <span>{day.entries.length} Jam Pelajaran</span>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-100 w-full flex items-center justify-between text-xs font-medium text-blue-600">
                  <span>Lihat Detail</span>
                  <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal Detail Jadwal */}
      {selectedDayDetail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDayDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <div>
                <h2 className="text-section-title font-semibold text-gray-900">{selectedDayDetail.label}</h2>
                <p className="text-body text-gray-500 mt-1">Jadwal Mengajar Anda</p>
              </div>
              <button 
                onClick={() => setSelectedDayDetail(null)} 
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {selectedDayDetail.entries.map(({ period, teachingHour, entry }) => {
                 const timeRange = timeConfig?.config?.periodTimes?.[entry.dayOfWeek]?.[period] || '-';
                 return (
                  <div
                    key={entry.id}
                    className="flex gap-4 p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:bg-white hover:shadow-sm hover:border-blue-200 transition-all"
                  >
                    <div className="min-w-[100px] flex flex-col justify-center border-r border-gray-200 pr-4">
                      <div className="text-sm font-bold text-gray-900">
                        Jam Ke {teachingHour ?? '-'}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1.5 bg-white px-2 py-1 rounded-md border border-gray-100 w-fit">
                        <Clock size={12} />
                        <span className="font-mono">{timeRange}</span>
                      </div>
                    </div>
                    
                    <div className="flex-1 pl-2">
                      <div className="font-bold text-gray-900 text-base">
                        {entry.teacherAssignment.subject.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {entry.teacherAssignment.subject.code}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <GraduationCap size={14} />
                          <span>Kelas {entry.teacherAssignment.class.name}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="font-medium">Ruang:</span>
                        <span className="px-2 py-0.5 bg-white border border-gray-200 rounded text-gray-700">
                          {entry.room || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
