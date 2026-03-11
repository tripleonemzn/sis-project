import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { attendanceService } from '../../services/attendance.service';
import { scheduleService, type ScheduleEntry, type DayOfWeek } from '../../services/schedule.service';
import { scheduleTimeConfigService } from '../../services/scheduleTimeConfig.service';
import { examService } from '../../services/exam.service';
import { authService } from '../../services/auth.service';
import type { User } from '../../types/auth';
import type { StudentAttendanceHistory } from '../../services/attendance.service';
import { Loader2, Calendar, BookOpen, UserCheck, Clock, ClipboardList, DoorClosed } from 'lucide-react';

interface AvailableExam {
  id: string;
  title: string;
  subject: { name: string };
  start_time: string;
  end_time: string;
  status: string;
  examType: string;
  room: string;
  sessionLabel?: string | null;
}

type ActiveYearContext = {
  id?: number;
  semester?: 'ODD' | 'EVEN';
  semester1Start?: string | null;
  semester2End?: string | null;
};

type DashboardOutletContext = {
  user?: User | null;
  activeYear?: ActiveYearContext | null;
};

type ExamSubject = { name: string };

type GroupedTodaySchedule = {
  key: string;
  startHour: number;
  endHour: number;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  roomName: string;
  timeRange: string;
};

const DEFAULT_PERIOD_TIMES: Record<string, Record<number, string>> = {
  MONDAY: {
    1: '07.00 - 07.40', 2: '07.40 - 08.20', 3: '08.20 - 09.00', 4: '09.00 - 09.40',
    5: '09.40 - 10.20', 6: '10.20 - 11.00', 7: '11.00 - 11.40', 8: '11.40 - 12.20',
    9: '12.20 - 13.00', 10: '13.00 - 13.40',
  },
  FRIDAY: {
    1: '07.00 - 07.30', 2: '07.30 - 08.00', 3: '08.00 - 08.30', 4: '08.30 - 09.00',
    5: '09.00 - 09.30', 6: '09.30 - 10.00', 7: '10.00 - 10.30', 8: '10.30 - 11.00',
    9: '11.00 - 11.30', 10: '11.30 - 12.00',
  },
  DEFAULT: {
    1: '07.00 - 07.40', 2: '07.40 - 08.20', 3: '08.20 - 09.00', 4: '09.00 - 09.40',
    5: '09.40 - 10.20', 6: '10.20 - 11.00', 7: '11.00 - 11.40', 8: '11.40 - 12.20',
    9: '12.20 - 13.00', 10: '13.00 - 13.40',
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function extractExamRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];

  const data = record.data;
  if (Array.isArray(data)) return data;

  const dataRecord = asRecord(data);
  if (dataRecord) {
    const nestedExams = dataRecord.exams;
    if (Array.isArray(nestedExams)) return nestedExams;
  }

  const exams = record.exams;
  return Array.isArray(exams) ? exams : [];
}

function parseTimeRange(range: string): { start: string; end: string } | null {
  const normalized = String(range || '').replace(/\s+/g, ' ').trim();
  if (!normalized || !normalized.includes('-')) return null;
  const [startRaw, endRaw] = normalized.split('-');
  const start = String(startRaw || '').trim();
  const end = String(endRaw || '').trim();
  if (!start || !end) return null;
  return { start, end };
}

function resolvePeriodTime(
  periodTimes: Record<string, Record<number, string>>,
  dayKey: DayOfWeek,
  period: number,
): string {
  return (
    periodTimes?.[dayKey]?.[period] ||
    periodTimes?.DEFAULT?.[period] ||
    DEFAULT_PERIOD_TIMES?.[dayKey]?.[period] ||
    DEFAULT_PERIOD_TIMES.DEFAULT?.[period] ||
    ''
  );
}

function buildTimeRangeLabel(
  periodTimes: Record<string, Record<number, string>>,
  dayKey: DayOfWeek | null,
  startPeriod: number,
  endPeriod: number,
): string {
  if (!dayKey) return '-';
  const startRange = parseTimeRange(resolvePeriodTime(periodTimes, dayKey, startPeriod));
  const endRange = parseTimeRange(resolvePeriodTime(periodTimes, dayKey, endPeriod));
  if (startRange?.start && endRange?.end) return `${startRange.start} - ${endRange.end}`;
  if (startRange?.start && startRange?.end) return `${startRange.start} - ${startRange.end}`;
  return '-';
}

export const StudentDashboard = () => {
  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<DashboardOutletContext>() || {};

  // Fallback to fetching user from API if not in context
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const apiUser = authData?.data;
  const user: User | null = contextUser || apiUser || null;
  const classId = user?.classId ?? null;

  // Fallback to fetching active year if not in context
  const { data: fetchedActiveYear, isLoading: isLoadingYears } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeAcademicYearId = activeAcademicYear?.id ?? null;

  // --- Exam Data ---
  const { data: examSchedules } = useQuery({
    queryKey: ['available-exams', activeAcademicYearId],
    queryFn: examService.getAvailableExams,
    enabled: !!user?.id,
  });

  const activeExams = useMemo(() => {
    const rawExams = extractExamRows(examSchedules);

    const normalized: AvailableExam[] = rawExams.map((exam) => {
      const row = asRecord(exam);
      const packet = asRecord(row?.packet);
      const subject = asRecord(row?.subject) || asRecord(packet?.subject);
      const subjectName = typeof subject?.name === 'string' && subject.name.trim() ? subject.name : '-';
      const examType = String(
        row?.programCode ||
          row?.examType ||
          packet?.programCode ||
          packet?.type ||
          '',
      )
        .trim()
        .toUpperCase();

      return {
        id: String(row?.id ?? ''),
        title: String(row?.title || packet?.title || '-'),
        subject: { name: subjectName } as ExamSubject,
        start_time: String(row?.start_time || row?.startTime || ''),
        end_time: String(row?.end_time || row?.endTime || ''),
        status: String(row?.status || '').toUpperCase(),
        examType,
        room: String(row?.room || '').trim(),
        sessionLabel: row?.sessionLabel ? String(row.sessionLabel) : null,
      };
    });

    return normalized
      .filter((exam) => ['UPCOMING', 'OPEN', 'ONGOING', 'IN_PROGRESS'].includes(exam.status))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [examSchedules]);

  const upcomingExams = useMemo(() => activeExams.slice(0, 5), [activeExams]);

  const examRooms = useMemo(() => {
    const uniqueBySlot = new Map<string, AvailableExam>();
    activeExams.forEach((exam) => {
      if (!exam.room) return;
      const slotKey = `${exam.room}__${exam.examType}__${exam.sessionLabel || ''}__${exam.start_time}`;
      if (!uniqueBySlot.has(slotKey)) {
        uniqueBySlot.set(slotKey, exam);
      }
    });
    return Array.from(uniqueBySlot.values());
  }, [activeExams]);

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

  const { data: scheduleTimeConfig } = useQuery({
    queryKey: ['schedule-time-config', activeAcademicYearId],
    queryFn: () => scheduleTimeConfigService.getConfig(activeAcademicYearId || undefined),
    enabled: !!activeAcademicYearId,
    staleTime: 1000 * 60 * 5,
  });

  const scheduleEntries: ScheduleEntry[] = useMemo(
    () => scheduleData?.data?.entries || [],
    [scheduleData],
  );

  const periodTimes = useMemo(
    () => scheduleTimeConfig?.config?.periodTimes || DEFAULT_PERIOD_TIMES,
    [scheduleTimeConfig],
  );

  const selfAttendance = useMemo(() => {
    const records: StudentAttendanceHistory[] = attendanceHistoryData?.data || [];
    if (!records.length) return null;
    
    const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const total = records.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return {
        percentage,
        present,
        sick: records.filter((r) => r.status === 'SICK').length,
        permission: records.filter((r) => r.status === 'PERMISSION').length,
        absent: records.filter((r) => r.status === 'ABSENT' || r.status === 'ALPHA').length,
        late: records.filter((r) => r.status === 'LATE').length,
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
      .sort((a, b) => {
        const aHour = typeof a.teachingHour === 'number' && a.teachingHour > 0 ? a.teachingHour : a.period;
        const bHour = typeof b.teachingHour === 'number' && b.teachingHour > 0 ? b.teachingHour : b.period;
        if (aHour === bHour) {
          return a.period - b.period;
        }
        return aHour - bHour;
      });
  }, [scheduleEntries, todayDayOfWeek]);

  const groupedTodaySchedule = useMemo(() => {
    if (!todaySchedule.length) return [] as GroupedTodaySchedule[];

    const groups: Array<
      Omit<GroupedTodaySchedule, 'timeRange'> & { startPeriod: number; endPeriod: number }
    > = [];

    todaySchedule.forEach((entry) => {
      const effectiveHour =
        typeof entry.teachingHour === 'number' && entry.teachingHour > 0
          ? entry.teachingHour
          : entry.period;
      const subjectId = Number(entry.teacherAssignment?.subject?.id || 0);
      const teacherId = Number(entry.teacherAssignment?.teacher?.id || 0);
      const roomName = entry.room || '-';
      const mergeKey = `${subjectId}-${teacherId}-${roomName}`;
      const last = groups[groups.length - 1];

      if (last && last.key === mergeKey && effectiveHour === last.endHour + 1) {
        last.endHour = effectiveHour;
        last.endPeriod = entry.period;
        return;
      }

      groups.push({
        key: mergeKey,
        startHour: effectiveHour,
        endHour: effectiveHour,
        startPeriod: entry.period,
        endPeriod: entry.period,
        subjectCode: entry.teacherAssignment?.subject?.code || '-',
        subjectName: entry.teacherAssignment?.subject?.name || '-',
        teacherName: entry.teacherAssignment?.teacher?.name || '-',
        roomName,
      });
    });

    return groups.map((group) => ({
      key: group.key,
      startHour: group.startHour,
      endHour: group.endHour,
      subjectCode: group.subjectCode,
      subjectName: group.subjectName,
      teacherName: group.teacherName,
      roomName: group.roomName,
      timeRange: buildTimeRangeLabel(
        periodTimes,
        todayDayOfWeek,
        group.startPeriod,
        group.endPeriod,
      ),
    }));
  }, [todaySchedule, todayDayOfWeek, periodTimes]);

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
      <div className="bg-gradient-to-br from-teal-50 to-emerald-100/80 rounded-2xl px-6 py-4 shadow-sm border border-teal-100 mt-10 relative flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="-mt-16 relative">
            <div
              className="w-36 h-36 rounded-full p-1 bg-white/90 ring-1 ring-teal-200"
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
                <div className="w-full h-full rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-6xl">
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
        <Link
          to="/student/attendance"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
        <div className="p-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-700">
              <UserCheck size={24} />
            </div>
            <div>
              <p className="text-sm text-blue-700/80 font-medium">Kehadiran</p>
              <h3 className="text-2xl font-bold text-blue-900">
                {attendancePercentage !== null
                  ? `${attendancePercentage.toFixed(1)}%`
                  : '-'}
              </h3>
              {selfAttendance && (
                <p className="text-xs text-blue-800/70 mt-1">
                  Hadir {selfAttendance.present} dari {selfAttendance.total} hari
                </p>
              )}
            </div>
          </div>
        </div>
        </Link>

        <Link
          to="/student/schedule"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
        <div className="p-6 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-teal-100 rounded-lg text-teal-700">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-teal-700/80 font-medium">Mata Pelajaran</p>
              <h3 className="text-2xl font-bold text-teal-900">{totalSubjects}</h3>
              <p className="text-xs text-teal-800/70 mt-1">Per minggu pada jadwal aktif</p>
            </div>
          </div>
        </div>
        </Link>

        <Link
          to="/student/schedule"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
        <div className="p-6 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg text-orange-700">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm text-orange-700/80 font-medium">Total Jam/Minggu</p>
              <h3 className="text-2xl font-bold text-orange-900">
                {totalWeeklyPeriods || '-'}
              </h3>
              <p className="text-xs text-orange-800/70 mt-1">
                Berdasarkan jadwal pelajaran yang sudah diatur
              </p>
            </div>
          </div>
        </div>
        </Link>
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
            <Link
              to="/student/exams"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <ClipboardList size={16} />
              Buka Menu
            </Link>
          </div>
          <div className="px-5 py-4 space-y-3">
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Tidak ada jadwal ujian aktif saat ini.</p>
            ) : (
              upcomingExams.map((exam) => (
                <div key={exam.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
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
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Ringkasan Kehadiran
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Rekap kehadiran berdasarkan data absensi kelas.
            </p>
            </div>
            <Link
              to="/student/attendance"
              className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Detail
            </Link>
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
              <Link
                to="/student/schedule"
                className="ml-1 inline-flex items-center rounded-lg bg-blue-50 px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
              >
                Buka
              </Link>
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
              {groupedTodaySchedule.map((entry) => (
                <div
                  key={`${entry.key}-${entry.startHour}-${entry.endHour}`}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                >
                  <div className="w-28 text-xs font-semibold text-gray-500 pt-0.5">
                    <div>
                      Jam Ke {entry.startHour === entry.endHour ? entry.startHour : `${entry.startHour}-${entry.endHour}`}
                    </div>
                    <div className="text-[11px] font-normal text-gray-400 mt-0.5">
                      {entry.timeRange}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {entry.subjectCode} • {entry.subjectName}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Guru {entry.teacherName}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Ruang {entry.roomName}
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
            <Link
              to="/student/exams"
              className="inline-flex items-center gap-2 rounded-lg bg-purple-50 px-2.5 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100"
            >
              <DoorClosed size={16} />
              Buka
            </Link>
          </div>
          <div className="px-5 py-4 space-y-3">
            {examRooms.length === 0 ? (
               <p className="text-sm text-gray-500 text-center py-4">Belum ada pembagian ruang.</p>
            ) : (
              examRooms.map((roomExam) => (
                <div
                  key={`${roomExam.room}-${roomExam.examType}-${roomExam.start_time}`}
                  className="p-3 border rounded-lg bg-purple-50 border-purple-100"
                >
                  <div className="text-sm font-bold text-purple-900">{roomExam.room}</div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                        {roomExam.examType || '-'}
                      </span>
                      {roomExam.sessionLabel ? (
                        <span className="text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                          {roomExam.sessionLabel}
                        </span>
                      ) : null}
                    </div>
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
