import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Monitor, Calendar, Clock, MapPin, CalendarDays, AlarmClock, History } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  sessionLabel?: string | null;
  room: string | null;
  proctorId: number | null;
  classNames?: string[];
  participantCount?: number;
  subject?: {
    name: string;
  } | null;
  packet: {
    title: string;
    subject: { name: string };
    duration: number;
  } | null;
  class: {
    name: string;
  } | null;
  _count?: {
    sessions: number;
  };
}

interface ProctorRoomGroup {
  key: string;
  roomName: string;
  startTime: string;
  endTime: string;
  sessionLabel: string | null;
  title: string;
  subjectName: string;
  classNames: string[];
  totalActiveParticipants: number;
  scheduleIds: number[];
}

const ProctorSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const filterParam = searchParams.get('tab');
  const filter: 'today' | 'upcoming' | 'history' =
    filterParam === 'upcoming' || filterParam === 'history' ? filterParam : 'today';

  const setFilter = (nextFilter: 'today' | 'upcoming' | 'history') => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextFilter);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      // Endpoint khusus pengawas: backend memfilter berdasarkan proctorId = user login.
      const res = await api.get('/proctoring/schedules');
      setSchedules(res.data.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast.error('Gagal memuat jadwal ujian');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSchedules = () => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));
    
    return schedules.filter(s => {
      const examDate = new Date(s.startTime);
      
      if (filter === 'today') {
        return examDate >= todayStart && examDate <= todayEnd;
      } else if (filter === 'upcoming') {
        return examDate > todayEnd;
      } else {
        return examDate < todayStart;
      }
    });
  };

  const filteredSchedules = getFilteredSchedules();

  const groupedSchedules = useMemo<ProctorRoomGroup[]>(() => {
    const map = new Map<string, ProctorRoomGroup>();

    filteredSchedules.forEach((schedule) => {
      const roomName = schedule.room || 'Ruangan belum ditentukan';
      const subjectName = schedule.packet?.subject?.name || schedule.subject?.name || '-';
      const title = schedule.packet?.title || `Ujian ${subjectName}`;
      const sessionLabel = String(schedule.sessionLabel || '').trim() || null;
      const key = `${roomName}::${schedule.startTime}::${schedule.endTime}::${subjectName}::${sessionLabel || '__NO_SESSION__'}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          roomName,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          sessionLabel,
          title,
          subjectName,
          classNames: [],
          totalActiveParticipants: 0,
          scheduleIds: [],
        });
      }

      const group = map.get(key)!;
      const resolvedClassNames =
        Array.isArray(schedule.classNames) && schedule.classNames.length > 0
          ? schedule.classNames
          : [schedule.class?.name || '-'];
      resolvedClassNames.forEach((className) => {
        if (!group.classNames.includes(className)) {
          group.classNames.push(className);
        }
      });
      const resolvedParticipantCount = Number.isFinite(Number(schedule.participantCount))
        ? Number(schedule.participantCount)
        : Number(schedule._count?.sessions || 0);
      group.totalActiveParticipants = Math.max(group.totalActiveParticipants, resolvedParticipantCount);
      group.scheduleIds.push(schedule.id);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }, [filteredSchedules]);

  const getStatusBadge = (startTime: string, endTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (now < start) {
      return (
        <span className="inline-flex items-center shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Akan Datang
        </span>
      );
    } else if (now >= start && now <= end) {
      return (
        <span className="inline-flex items-center shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Sedang Berlangsung
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Selesai
        </span>
      );
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jadwal Mengawas & Monitoring</h1>
          <p className="text-gray-600">Pantau pelaksanaan ujian yang ditugaskan kepada Anda</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 pt-3">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
            {[
              { id: 'today', label: 'Hari Ini', icon: CalendarDays },
              { id: 'upcoming', label: 'Akan Datang', icon: AlarmClock },
              { id: 'history', label: 'Riwayat', icon: History },
            ].map((tab) => {
              const active = filter === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as 'today' | 'upcoming' | 'history')}
                  className={`px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  aria-label={tab.label}
                >
                  <TabIcon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groupedSchedules.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada jadwal ujian</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filter === 'today' 
                ? 'Tidak ada ujian yang dijadwalkan hari ini.' 
                : filter === 'upcoming' 
                  ? 'Tidak ada ujian mendatang.' 
                  : 'Tidak ada riwayat ujian.'}
            </p>
          </div>
        ) : (
          groupedSchedules.map((group) => (
            <div key={group.key} className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-medium text-gray-900 break-words leading-snug">
                      {group.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 break-words">
                      {group.subjectName}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(group.startTime, group.endTime)}
                  </div>
                </div>
                
                <div className="mt-4 space-y-3">
                  <div className="flex items-center text-sm text-gray-500">
                    <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <span>
                      {new Date(group.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - 
                      {new Date(group.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <span>{group.roomName}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <span className="inline-flex items-center px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-xs text-gray-700">
                      {group.sessionLabel ? `Sesi: ${group.sessionLabel}` : 'Tanpa sesi'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.classNames.map((className) => (
                      <span
                        key={`${group.key}-${className}`}
                        className="inline-flex items-center px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-xs text-blue-700"
                      >
                        {className}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Monitor className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <span>{group.totalActiveParticipants} Peserta Aktif</span>
                  </div>
                </div>

                <div className="mt-5">
                  <button
                    onClick={() => {
                      const primaryScheduleId = group.scheduleIds[0];
                      if (!primaryScheduleId) {
                        toast.error('ID jadwal ujian tidak valid');
                        return;
                      }
                      navigate(`/teacher/proctoring/${primaryScheduleId}`);
                    }}
                    className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Monitor className="mr-2 h-4 w-4" />
                    Pantau Ujian
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProctorSchedulePage;
