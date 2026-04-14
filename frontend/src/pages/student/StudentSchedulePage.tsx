import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { authService } from '../../services/auth.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { toast } from 'react-hot-toast';
import { scheduleTimeConfigService } from '../../services/scheduleTimeConfig.service';
import { 
  Clock,
  MapPin,
  User,
  BookOpen
} from 'lucide-react';
import clsx from 'clsx';

interface ScheduleEntry {
  id: number;
  dayOfWeek: string;
  period: number;
  room: string | null;
  teacherAssignment: {
    subject: {
      name: string;
      code: string;
    };
    teacher: {
      name: string;
    };
  };
}

type StudentScheduleOutletContext = {
  user?: {
    classId?: number | null;
    studentClass?: {
      id?: number | null;
      academicYearId?: number | null;
    } | null;
  } | null;
};

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_NAMES: Record<string, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat'
};

// Standard period times (approximate/default)
const DEFAULT_PERIOD_TIMES: Record<string, Record<number, string>> = {
  MONDAY: {
    1: '07.00 - 07.40', 2: '07.40 - 08.20', 3: '08.20 - 09.00',
    4: '09.00 - 09.40', 5: '09.40 - 10.20', 6: '10.20 - 11.00',
    7: '11.00 - 11.40', 8: '11.40 - 12.20'
  },
  FRIDAY: {
    1: '07.00 - 07.30', 2: '07.30 - 08.00', 3: '08.00 - 08.30',
    4: '08.30 - 09.00', 5: '09.00 - 09.30', 6: '09.30 - 10.00'
  },
  // Default for others
  DEFAULT: {
    1: '07.00 - 07.40', 2: '07.40 - 08.20', 3: '08.20 - 09.00',
    4: '09.00 - 09.40', 5: '09.40 - 10.20', 6: '10.20 - 11.00',
    7: '11.00 - 11.40', 8: '11.40 - 12.20'
  }
};

export default function StudentSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [periodTimes, setPeriodTimes] = useState(DEFAULT_PERIOD_TIMES);
  const [activeDay, setActiveDay] = useState<string>(() => {
    const today = new Date().getDay(); // 0=Sun, 1=Mon
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const currentDay = days[today];
    // Default to Monday if it's Sunday or Saturday
    return (currentDay === 'SUNDAY' || currentDay === 'SATURDAY') ? 'MONDAY' : currentDay;
  });

  const { user: contextUser } = useOutletContext<StudentScheduleOutletContext>() || {};
  const { data: activeAcademicYear, isLoading: isActiveAcademicYearLoading } = useActiveAcademicYear();
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const fetchData = useCallback(async () => {
    try {
      if (!user || isActiveAcademicYearLoading) return;

      setLoading(true);

      const classId = Number(user.classId || user.studentClass?.id || 0);
      if (!Number.isFinite(classId) || classId <= 0) {
        toast.error('Anda belum terdaftar dalam kelas');
        setLoading(false);
        return;
      }

      const academicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0);
      if (!Number.isFinite(academicYearId) || academicYearId <= 0) {
        toast.error('Tahun ajaran aktif tidak ditemukan');
        setLoading(false);
        return;
      }

      // Parallel fetch: schedule and time config
      const [scheduleRes, timeConfig] = await Promise.all([
        api.get(`/schedules?classId=${classId}&academicYearId=${academicYearId}`),
        scheduleTimeConfigService.getConfig(academicYearId)
      ]);
      
      if (scheduleRes.data.success) {
        setSchedules(scheduleRes.data.data.entries || []);
      }
      
      if (timeConfig && timeConfig.config && timeConfig.config.periodTimes) {
        setPeriodTimes(timeConfig.config.periodTimes);
      }

    } catch (error) {
      console.error('Error fetching schedule:', error);
      toast.error('Gagal memuat jadwal pelajaran');
    } finally {
      setLoading(false);
    }
  }, [activeAcademicYear?.academicYearId, activeAcademicYear?.id, isActiveAcademicYearLoading, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredSchedules = schedules
    .filter(s => s.dayOfWeek === activeDay)
    .sort((a, b) => a.period - b.period);

  const getTime = (day: string, period: number) => {
    // Try from state (API or default)
    if (periodTimes[day]?.[period]) return periodTimes[day][period];
    if (periodTimes.DEFAULT?.[period]) return periodTimes.DEFAULT[period];
    
    // Fallback to hardcoded default (in case API config is partial)
    if (DEFAULT_PERIOD_TIMES[day]?.[period]) return DEFAULT_PERIOD_TIMES[day][period];
    if (DEFAULT_PERIOD_TIMES.DEFAULT?.[period]) return DEFAULT_PERIOD_TIMES.DEFAULT[period];

    return `Jam ke-${period}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Jadwal Pelajaran
        </h1>
        <p className="text-gray-500 mt-1">Jadwal kegiatan belajar mengajar minggu ini</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={clsx(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  activeDay === day
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                )}
              >
                {DAY_NAMES[day]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredSchedules.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSchedules.map((schedule) => (
              <div 
                key={schedule.id}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                    Jam ke-{schedule.period}
                  </div>
                  <div className="flex items-center text-gray-500 text-sm">
                    <Clock className="w-4 h-4 mr-1" />
                    {getTime(activeDay, schedule.period)}
                  </div>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-2">
                  {schedule.teacherAssignment.subject.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">{schedule.teacherAssignment.subject.code}</p>
                
                <div className="space-y-2 pt-3 border-t border-gray-200">
                  <div className="flex items-center text-gray-700 text-sm">
                    <User className="w-4 h-4 mr-2 text-gray-400" />
                    <span className="truncate">{schedule.teacherAssignment.teacher.name}</span>
                  </div>
                  {schedule.room && (
                    <div className="flex items-center text-gray-700 text-sm">
                      <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{schedule.room}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Tidak ada jadwal</h3>
            <p className="text-gray-500">Tidak ada mata pelajaran untuk hari {DAY_NAMES[activeDay]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
