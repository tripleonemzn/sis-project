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
import { UnderlineTabBar } from '../../components/navigation/UnderlineTabBar';

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
const DAY_TAB_ITEMS = DAYS.map((day) => ({ id: day, label: DAY_NAMES[day] }));

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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-5 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-section-title text-gray-900">Daftar Jadwal Harian</h2>
              <p className="mt-1 text-sm text-gray-500">
                Pilih hari untuk melihat jadwal pelajaran dalam format tabel.
              </p>
            </div>
          </div>
          <UnderlineTabBar
            items={DAY_TAB_ITEMS}
            activeId={activeDay}
            onChange={setActiveDay}
            className="mt-4 border-b border-gray-200"
            ariaLabel="Pilih hari jadwal pelajaran"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredSchedules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[780px] w-full text-left">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="w-28 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Jam</th>
                  <th className="w-44 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Waktu</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mata Pelajaran</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Guru</th>
                  <th className="w-44 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Ruang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSchedules.map((schedule) => (
                  <tr key={schedule.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        Jam ke-{schedule.period}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      <div className="inline-flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {getTime(activeDay, schedule.period)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {schedule.teacherAssignment.subject.name}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-gray-500">
                            {schedule.teacherAssignment.subject.code}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      <div className="inline-flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span>{schedule.teacherAssignment.teacher.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{schedule.room || '-'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="m-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Tidak ada jadwal</h3>
            <p className="text-gray-500">Tidak ada mata pelajaran untuk hari {DAY_NAMES[activeDay]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
