import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlarmClock, Calendar, CalendarDays, ChevronDown, ChevronRight, Clock, History, MapPin, Monitor, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

type TimeFilter = 'today' | 'upcoming' | 'history';

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  periodNumber?: number | null;
  sessionLabel?: string | null;
  room: string | null;
  proctorId: number | null;
  subjectName?: string | null;
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
  dateKey: string;
  dateLabel: string;
  roomName: string;
  startTime: string;
  endTime: string;
  periodNumber: number | null;
  sessionLabel: string | null;
  title: string;
  subjectName: string;
  classNames: string[];
  totalActiveParticipants: number;
  scheduleIds: number[];
}

function compareRoomName(a: string, b: string) {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareClassName(a: string, b: string) {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
}

function formatDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'invalid-date';
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak valid';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '-';
  }
  return `${start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(
    'id-ID',
    { hour: '2-digit', minute: '2-digit' },
  )} WIB`;
}

function resolveScheduleBucket(schedule: Pick<ExamSchedule, 'startTime'>): TimeFilter {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const examDate = new Date(schedule.startTime);
  if (Number.isNaN(examDate.getTime())) return 'history';
  if (examDate >= todayStart && examDate <= todayEnd) return 'today';
  if (examDate > todayEnd) return 'upcoming';
  return 'history';
}

function getStatusBadge(startTime: string, endTime: string) {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) {
    return (
      <span className="inline-flex items-center shrink-0 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        Akan Datang
      </span>
    );
  }
  if (now >= start && now <= end) {
    return (
      <span className="inline-flex items-center shrink-0 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        Sedang Berlangsung
      </span>
    );
  }
  return (
    <span className="inline-flex items-center shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      Selesai
    </span>
  );
}

function groupSchedulesForDisplay(sourceSchedules: ExamSchedule[]): ProctorRoomGroup[] {
  const map = new Map<string, ProctorRoomGroup>();

  sourceSchedules.forEach((schedule) => {
    const roomName = schedule.room || 'Ruangan belum ditentukan';
    const subjectName = schedule.subjectName || schedule.packet?.subject?.name || schedule.subject?.name || '-';
    const title = schedule.packet?.title || `Ujian ${subjectName}`;
    const sessionLabel = String(schedule.sessionLabel || '').trim() || null;
    const dateKey = formatDayKey(schedule.startTime);
    const key = [
      dateKey,
      roomName,
      schedule.startTime,
      schedule.endTime,
      schedule.periodNumber || 0,
      subjectName,
      sessionLabel || '__NO_SESSION__',
    ].join('::');

    if (!map.has(key)) {
      map.set(key, {
        key,
        dateKey,
        dateLabel: formatDayLabel(schedule.startTime),
        roomName,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        periodNumber: Number.isFinite(Number(schedule.periodNumber)) ? Number(schedule.periodNumber) : null,
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
    group.classNames.sort(compareClassName);
    const resolvedParticipantCount = Number.isFinite(Number(schedule.participantCount))
      ? Number(schedule.participantCount)
      : Number(schedule._count?.sessions || 0);
    group.totalActiveParticipants = Math.max(group.totalActiveParticipants, resolvedParticipantCount);
    group.scheduleIds.push(schedule.id);
  });

  return Array.from(map.values()).sort((a, b) => {
    const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (timeDiff !== 0) return timeDiff;
    const periodDiff = Number(a.periodNumber || 0) - Number(b.periodNumber || 0);
    if (periodDiff !== 0) return periodDiff;
    return compareRoomName(a.roomName, b.roomName);
  });
}

const ProctorSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const filterParam = searchParams.get('tab');
  const filter: TimeFilter = filterParam === 'upcoming' || filterParam === 'history' ? filterParam : 'today';

  const setFilter = (nextFilter: TimeFilter) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextFilter);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get('/proctoring/schedules');
        setSchedules(res.data.data);
      } catch (error) {
        console.error('Error fetching schedules:', error);
        toast.error('Gagal memuat jadwal ujian');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const scheduleCountsByFilter = useMemo(() => {
    const buckets: Record<TimeFilter, number> = { today: 0, upcoming: 0, history: 0 };
    (['today', 'upcoming', 'history'] as const).forEach((bucket) => {
      buckets[bucket] = groupSchedulesForDisplay(schedules.filter((schedule) => resolveScheduleBucket(schedule) === bucket)).length;
    });
    return buckets;
  }, [schedules]);

  useEffect(() => {
    if (loading || filterParam) return;
    if (scheduleCountsByFilter.today === 0 && scheduleCountsByFilter.upcoming > 0) {
      setFilter('upcoming');
    }
  }, [filterParam, loading, scheduleCountsByFilter.today, scheduleCountsByFilter.upcoming]);

  const filteredSchedules = useMemo(
    () => schedules.filter((schedule) => resolveScheduleBucket(schedule) === filter),
    [filter, schedules],
  );

  const groupedSchedules = useMemo<ProctorRoomGroup[]>(() => groupSchedulesForDisplay(filteredSchedules), [filteredSchedules]);

  const groupedDays = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        rows: ProctorRoomGroup[];
      }
    >();

    groupedSchedules.forEach((group) => {
      if (!map.has(group.dateKey)) {
        map.set(group.dateKey, {
          dateKey: group.dateKey,
          dateLabel: group.dateLabel,
          rows: [],
        });
      }
      map.get(group.dateKey)!.rows.push(group);
    });

    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [groupedSchedules]);

  const totalParticipants = useMemo(
    () => groupedSchedules.reduce((acc, group) => acc + group.totalActiveParticipants, 0),
    [groupedSchedules],
  );

  useEffect(() => {
    if (groupedDays.length === 0) {
      setExpandedDayKey(null);
      return;
    }
    setExpandedDayKey((previous) => {
      return previous && groupedDays.some((day) => day.dateKey === previous) ? previous : null;
    });
  }, [groupedDays]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900">Jadwal Mengawas & Monitoring</h1>
          <p className="mt-1 text-gray-600">Pantau pelaksanaan ujian yang ditugaskan kepada Anda dengan breakdown per hari.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700">
              <Calendar className="h-4 w-4" />
              {groupedDays.length} hari ujian
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-700">
              <Monitor className="h-4 w-4" />
              {groupedSchedules.length} slot aktif
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
              <Users className="h-4 w-4" />
              {totalParticipants} peserta aktif
            </span>
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 pt-2">
          <div className="flex overflow-x-auto gap-2 scrollbar-hide">
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
                  type="button"
                  onClick={() => setFilter(tab.id as TimeFilter)}
                  className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-600 font-semibold'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                  aria-label={tab.label}
                >
                  <TabIcon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                      active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {scheduleCountsByFilter[tab.id as TimeFilter]} slot
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {groupedDays.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada jadwal ujian</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'today'
              ? 'Tidak ada ujian yang dijadwalkan hari ini.'
              : filter === 'upcoming'
                ? 'Belum ada ujian mendatang pada penugasan Anda.'
                : 'Belum ada riwayat ujian yang bisa ditampilkan.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedDays.map((day) => (
            <div key={day.dateKey} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setExpandedDayKey((previous) => (previous === day.dateKey ? null : day.dateKey))}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 text-left"
              >
                <div>
                  <div className="text-base font-semibold text-gray-900">{day.dateLabel}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {day.rows.length} slot ujian • {new Set(day.rows.map((row) => row.roomName)).size} ruang aktif
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-blue-700">
                  {expandedDayKey === day.dateKey ? 'Tutup Hari' : 'Buka Hari'}
                  {expandedDayKey === day.dateKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
              </button>

              {expandedDayKey === day.dateKey ? (
                <div className="divide-y divide-gray-100">
                  {day.rows.map((group) => {
                    const primaryScheduleId = group.scheduleIds[0];
                    return (
                      <div key={group.key} className="px-5 py-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-semibold leading-snug text-gray-900">{group.title}</h3>
                              {getStatusBadge(group.startTime, group.endTime)}
                            </div>
                            <p className="mt-1 text-sm text-gray-500">{group.subjectName}</p>

                            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-gray-400" />
                                {formatTimeRange(group.startTime, group.endTime)}
                                {group.periodNumber ? (
                                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                    Jam Ke-{group.periodNumber}
                                  </span>
                                ) : null}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4 text-gray-400" />
                                {group.roomName}
                              </span>
                              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                                {group.sessionLabel ? `Sesi: ${group.sessionLabel}` : 'Tanpa sesi'}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {group.classNames.map((className) => (
                                <span
                                  key={`${group.key}-${className}`}
                                  className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                                >
                                  {className}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[220px]">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                              <div className="font-medium text-slate-900">{group.totalActiveParticipants} peserta aktif</div>
                              <div className="mt-1 text-xs text-slate-500">Ruang ujian ini siap dipantau dari detail monitoring.</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (!primaryScheduleId) {
                                  toast.error('ID jadwal ujian tidak valid');
                                  return;
                                }
                                navigate(`/teacher/proctoring/${primaryScheduleId}`);
                              }}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                              <Monitor className="h-4 w-4" />
                              Buka Monitoring
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProctorSchedulePage;
