import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import { teacherAssignmentService, type TeacherAssignment } from '../../../services/teacherAssignment.service';
import { scheduleTimeConfigService } from '../../../services/scheduleTimeConfig.service';
import { scheduleService, type ScheduleEntry, type DayOfWeek } from '../../../services/schedule.service';
import { Calendar, Loader2, BookOpen, Users, Search, Trash2, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

type ClassSchedule = {
  class: TeacherAssignment['class'];
  entries: {
    subject: TeacherAssignment['subject'];
    teacher: TeacherAssignment['teacher'];
  }[];
};

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
};

const DAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

const BASE_TIMES_BY_DAY: Record<DayOfWeek, Record<number, string>> = {
  MONDAY: {
    1: '06.40 - 07.30',
    2: '07.30 - 08.00',
    3: '08.00 - 08.30',
    4: '08.30 - 09.00',
    5: '09.00 - 09.30',
    6: '09.30 - 10.00',
    7: '10.00 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 13.00',
    12: '13.00 - 13.30',
    13: '13.30 - 14.00',
  },
  TUESDAY: {
    1: '06.30 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.15',
    8: '10.15 - 10.45',
    9: '10.45 - 11.15',
    10: '11.15 - 11.45',
    11: '11.45 - 12.30',
    12: '12.30 - 13.00',
    13: '13.00 - 13.30',
  },
  WEDNESDAY: {
    1: '06.30 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 12.30',
    12: '12.30 - 13.00',
  },
  THURSDAY: {
    1: '06.50 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 12.30',
    12: '12.30 - 13.00',
  },
  FRIDAY: {
    1: '06.45 - 07.00',
    2: '07.00 - 07.30',
    3: '07.30 - 08.00',
    4: '08.00 - 08.30',
    5: '08.30 - 09.00',
    6: '09.00 - 09.30',
    7: '09.30 - 10.00',
    8: '10.00 - 10.30',
    9: '10.30 - 11.00',
    10: '11.00 - 11.30',
  },
  SATURDAY: {},
};

const DEFAULT_PERIOD_TIMES: Record<string, Record<number, string>> = {};
DAY_ORDER.forEach((day) => {
  DEFAULT_PERIOD_TIMES[day] = { ...(BASE_TIMES_BY_DAY[day] || {}) };
});

const DEFAULT_PERIOD_NOTES: Record<string, Record<number, string>> = {
  MONDAY: {
    1: 'UPACARA',
    5: 'ISTIRAHAT',
    11: 'ISTIRAHAT',
  },
  TUESDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    6: 'ISTIRAHAT',
    11: 'ISTIRAHAT',
  },
  WEDNESDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    6: 'ISTIRAHAT',
  },
  THURSDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    7: 'ISTIRAHAT',
  },
  FRIDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    6: 'ISTIRAHAT',
  },
};

const INITIAL_MAX_PERIOD = Math.max(
  ...Object.values(BASE_TIMES_BY_DAY).flatMap((map) =>
    Object.keys(map).map(Number),
  ),
);

export const SchedulePage = () => {
  const queryClient = useQueryClient();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [formDay, setFormDay] = useState<DayOfWeek>('MONDAY');
  const [formPeriod, setFormPeriod] = useState(1);
  const [formEndPeriod, setFormEndPeriod] = useState<number | ''>('');
  const [formTeacherAssignmentId, setFormTeacherAssignmentId] = useState<number | ''>('');
  const [formRoom, setFormRoom] = useState('');
  const [periodTimes, setPeriodTimes] = useState<Record<string, Record<number, string>>>(DEFAULT_PERIOD_TIMES);
  const [periodNotes, setPeriodNotes] = useState<Record<string, Record<number, string>>>(DEFAULT_PERIOD_NOTES);
  const [isEditingTimes, setIsEditingTimes] = useState(false);
  const [editingDay, setEditingDay] = useState<DayOfWeek>('MONDAY');

  const getErrorMessage = (error: unknown) => {
    if (typeof error === 'object' && error !== null) {
      const anyErr = error as { response?: { data?: { message?: string } } };
      return anyErr.response?.data?.message || 'Terjadi kesalahan';
    }
    return 'Terjadi kesalahan';
  };

  const {
    data: academicYearData,
    isLoading: isLoadingYears,
  } = useQuery({
    queryKey: ['academic-years', 'for-schedule'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] = useMemo(
    () =>
      academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData],
  );

  const activeAcademicYear = useMemo(() => {
    if (!academicYears.length) {
      return null;
    }

    const active = academicYears.find((ay) => ay.isActive);
    if (active) {
      return active;
    }

    return academicYears[0] ?? null;
  }, [academicYears]);

  const activeAcademicYearId = activeAcademicYear?.id ?? null;

  const effectiveAcademicYearId = selectedAcademicYearId || activeAcademicYearId;

  const { data: scheduleConfig } = useQuery({
    queryKey: ['schedule-time-config', effectiveAcademicYearId],
    queryFn: () => scheduleTimeConfigService.getConfig(effectiveAcademicYearId!),
    enabled: !!effectiveAcademicYearId,
  });

  useEffect(() => {
    if (scheduleConfig) {
      if (scheduleConfig.config.periodTimes) setPeriodTimes(scheduleConfig.config.periodTimes);
      if (scheduleConfig.config.periodNotes) setPeriodNotes(scheduleConfig.config.periodNotes);
    }
  }, [scheduleConfig]);

  const saveConfigMutation = useMutation({
    mutationFn: (data: { academicYearId: number, config: any }) =>
      scheduleTimeConfigService.saveConfig(data.academicYearId, data.config),
    onSuccess: () => {
      toast.success('Pengaturan waktu berhasil disimpan ke database');
      queryClient.invalidateQueries({ queryKey: ['schedule-time-config'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const {
    data: assignmentsData,
    isLoading: isLoadingAssignments,
  } = useQuery({
    queryKey: ['teacher-assignments', 'for-schedule'],
    queryFn: () =>
      teacherAssignmentService.list({
        page: 1,
        limit: 1000,
      }),
  });

  const assignments: TeacherAssignment[] = useMemo(
    () =>
      (assignmentsData?.data?.assignments || []).filter(
        (a) => a.academicYear.id === effectiveAcademicYearId,
      ),
    [assignmentsData, effectiveAcademicYearId],
  );

  const schedules: ClassSchedule[] = useMemo(() => {
    const map = new Map<number, ClassSchedule>();

    for (const a of assignments) {
      const existing = map.get(a.class.id);

      if (!existing) {
        map.set(a.class.id, {
          class: a.class,
          entries: [
            {
              subject: a.subject,
              teacher: a.teacher,
            },
          ],
        });
      } else {
        const hasEntry = existing.entries.some(
          (e) => e.subject.id === a.subject.id && e.teacher.id === a.teacher.id,
        );
        if (!hasEntry) {
          existing.entries.push({
            subject: a.subject,
            teacher: a.teacher,
          });
        }
      }
    }

    let list = Array.from(map.values()).sort((a, b) => {
      if (a.class.level === b.class.level) {
        return a.class.name.localeCompare(b.class.name, 'id');
      }
      return a.class.level.localeCompare(b.class.level, 'id');
    });

    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter((item) => {
        const classText = `${item.class.name} ${item.class.major?.code ?? ''}`.toLowerCase();
        const subjectText = item.entries
          .map((e) => `${e.subject.code} ${e.subject.name}`.toLowerCase())
          .join(' ');
        const teacherText = item.entries
          .map((e) => e.teacher.name.toLowerCase())
          .join(' ');
        return (
          classText.includes(term) ||
          subjectText.includes(term) ||
          teacherText.includes(term)
        );
      });
    }

    return list;
  }, [assignments, search]);
  const classOptions = useMemo(
    () => schedules.map((s) => s.class),
    [schedules],
  );

  const effectiveClassId = useMemo<number | ''>(() => {
    if (!classOptions.length) {
      return '';
    }

    if (selectedClassId) {
      const exists = classOptions.some((c) => c.id === selectedClassId);
      if (exists) {
        return selectedClassId;
      }
    }

    return '';
  }, [classOptions, selectedClassId]);

  const {
    data: scheduleData,
    isLoading: isLoadingSchedule,
  } = useQuery({
    queryKey: ['admin-schedule-level2', effectiveAcademicYearId, effectiveClassId],
    queryFn: () =>
      scheduleService.list({
        academicYearId: effectiveAcademicYearId!,
        classId: effectiveClassId as number,
      }),
    enabled: !!effectiveAcademicYearId && !!effectiveClassId,
  });

  const scheduleEntries: ScheduleEntry[] = useMemo(
    () => scheduleData?.data?.entries || [],
    [scheduleData],
  );

  const classAssignments = useMemo(
    () =>
      assignments.filter((a) => a.class.id === (effectiveClassId || 0)),
    [assignments, effectiveClassId],
  );

  const maxPeriod = useMemo(() => {
    const maxFromEntries = scheduleEntries.reduce(
      (max, entry) => (entry.period > max ? entry.period : max),
      0,
    );
    const maxConfigured = DAY_ORDER.reduce((max, day) => {
      const periods = Object.keys(periodTimes[day] || {}).map(Number);
      if (!periods.length) {
        return max;
      }
      const dayMax = Math.max(...periods);
      return dayMax > max ? dayMax : max;
    }, 0);
    const baseMax = Math.max(INITIAL_MAX_PERIOD, maxConfigured);
    return Math.max(baseMax, maxFromEntries, 1);
  }, [scheduleEntries, periodTimes]);

  const isNonTeachingNote = (note: string | undefined) => {
    if (!note) return false;
    const n = note.toUpperCase();
    return n.includes('UPACARA') || n.includes('ISTIRAHAT') || n.includes('TADARUS');
  };

  const getTeachingHour = (day: DayOfWeek, currentPeriod: number) => {
    let teachingCounter = 0;
    for (let p = 1; p <= currentPeriod; p++) {
      const note = periodNotes[day]?.[p];
      if (!isNonTeachingNote(note)) {
        teachingCounter++;
      }
      if (p === currentPeriod) {
        return isNonTeachingNote(note) ? null : teachingCounter;
      }
    }
    return null;
  };

  const getPeriodFromTeachingHour = (day: DayOfWeek, targetTeachingHour: number) => {
    let teachingCounter = 0;
    // Iterate up to a reasonable max (e.g. maxPeriod + some buffer)
    for (let p = 1; p <= maxPeriod + 5; p++) {
      const note = periodNotes[day]?.[p];
      if (!isNonTeachingNote(note)) {
        teachingCounter++;
      }
      if (teachingCounter === targetTeachingHour) {
        return p;
      }
    }
    return null;
  };

  const getNoteColorClass = (note: string) => {
    const upper = note.toUpperCase();
    if (upper.includes('ISTIRAHAT')) {
      return 'bg-red-50 text-red-700';
    }
    if (upper.includes('UPACARA')) {
      return 'bg-teal-50 text-teal-700';
    }
    return 'bg-amber-50 text-amber-700';
  };

  const cellMap = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    for (const entry of scheduleEntries) {
      const key = `${entry.dayOfWeek}-${entry.period}`;
      if (!map.has(key)) {
        map.set(key, entry);
      }
    }
    return map;
  }, [scheduleEntries]);

  const createEntryMutation = useMutation({
    mutationFn: scheduleService.create,
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: scheduleService.remove,
    onSuccess: async () => {
      toast.success('Entri jadwal pelajaran berhasil dihapus');
      await queryClient.invalidateQueries({
        queryKey: ['admin-schedule-level2', activeAcademicYearId, effectiveClassId],
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const isLoading =
    isLoadingYears ||
    (!!activeAcademicYearId && (isLoadingAssignments || isLoadingSchedule));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-height-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jadwal Pelajaran</h1>
          <p className="text-gray-500 text-sm">
            Rekap jadwal mengajar per kelas berdasarkan assignment guru pada tahun ajaran aktif.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Clock className="w-4 h-4" />
            <span>Input Jadwal Perjam Per Kelas</span>
          </button>
          <div className="flex items-center gap-2">
            <select
              value={effectiveAcademicYearId || ''}
              onChange={(e) => setSelectedAcademicYearId(Number(e.target.value))}
              className="px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm border border-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {!academicYears.length && <option value="">Loading...</option>}
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  Tahun Ajaran {ay.name} {ay.isActive ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Kelas Memiliki Jadwal</p>
            <p className="text-2xl font-bold text-gray-900">{schedules.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Penugasan</p>
            <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Status</p>
            <p className="text-sm font-semibold text-gray-900">
              {assignments.length === 0 ? 'Belum ada jadwal' : 'Jadwal dasar siap'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between bg-gray-50/50">
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
            <input
              type="text"
              name="schedule-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kelas, mapel, atau guru..."
              className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {schedules.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">Belum ada data jadwal pelajaran untuk tahun ajaran ini.</p>
            <p className="text-sm text-gray-400 mt-1">
              Silakan atur penugasan guru pada menu Assignment Guru.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="text-sm text-gray-600">
                Total:{' '}
                <span className="font-medium">
                  {schedules.reduce((count, item) => count + item.entries.length, 0)}
                </span>{' '}
                penugasan
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 font-medium">
                <tr>
                  <th className="px-6 py-3 text-left">KELAS</th>
                  <th className="px-6 py-3 text-left">KOMPETENSI KEAHLIAN</th>
                  <th className="px-6 py-3 text-left">MATA PELAJARAN & GURU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedules.map((item) => (
                  <tr key={item.class.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 align-top">
                      <div className="font-semibold text-gray-900">{item.class.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Tingkat {item.class.level}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="text-gray-800">
                        {item.class.major?.name || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="space-y-2">
                        {item.entries
                          .sort((a, b) => {
                            if (a.subject.code === b.subject.code) {
                              return a.teacher.name.localeCompare(b.teacher.name, 'id');
                            }
                            return a.subject.code.localeCompare(b.subject.code, 'id');
                          })
                          .map((entry) => (
                            <li
                              key={`${entry.subject.id}-${entry.teacher.id}`}
                              className="flex items-baseline justify-between gap-4"
                            >
                              <div className="text-gray-800">
                                <div className="font-medium">
                                  {entry.subject.code} • {entry.subject.name}
                                </div>
                              </div>
                              <div className="text-right text-xs text-gray-600 min-w-[140px]">
                                <div className="font-medium">{entry.teacher.name}</div>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Input Jadwal Perjam Per Kelas
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Atur jadwal per hari dan jam pelajaran
                </p>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-medium">Pilih Kelas:</span>
                  <select
                    name="schedule-class"
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
                    value={effectiveClassId}
                    onChange={(e) =>
                      setSelectedClassId(
                        e.target.value ? Number(e.target.value) : '',
                      )
                    }
                  >
                    {classOptions.length === 0 && (
                      <option value="">Belum ada kelas</option>
                    )}
                    {classOptions.length > 0 && (
                      <option value="">Pilih kelas untuk mengatur jadwal</option>
                    )}
                    {classOptions.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingTimes((prev) => !prev)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-100 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <Clock className="w-3 h-3" />
                    <span>Atur Waktu Jam</span>
                  </button>
                  <button
                    type="submit"
                    form="schedule-entry-form"
                    disabled={createEntryMutation.isPending || !effectiveClassId}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {createEntryMutation.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    <span>Simpan Entri</span>
                  </button>
                </div>
              </div>

              {isEditingTimes && (
                <div className="px-4 py-4 border border-gray-100 rounded-xl bg-white mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        Pengaturan Waktu Jam
                      </p>
                      <p className="text-xs text-gray-500">
                        Sesuaikan rentang waktu untuk setiap Jam ke per hari.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        id="schedule-time-day"
                        name="schedule-time-day"
                        value={editingDay}
                        onChange={(e) => setEditingDay(e.target.value as DayOfWeek)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {DAY_ORDER.map((day) => (
                          <option key={day} value={day}>
                            {DAY_LABELS[day]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setPeriodTimes((prev) => ({
                            ...prev,
                            [editingDay]: { ...(BASE_TIMES_BY_DAY[editingDay] || {}) },
                          }));
                          setPeriodNotes((prev) => ({
                            ...prev,
                            [editingDay]: { ...(DEFAULT_PERIOD_NOTES[editingDay] || {}) },
                          }));
                        }}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Reset Default Hari Ini
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.keys(periodTimes[editingDay] || {})
                      .map(Number)
                      .sort((a, b) => a - b)
                      .map((period) => {
                        const teachingHour = getTeachingHour(editingDay, period);
                        const note = periodNotes[editingDay]?.[period];
                        return (
                          <div key={period} className="flex flex-col">
                            <span className="text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                              <span>
                                {teachingHour
                                  ? `Jam Pelajaran ke ${teachingHour}`
                                  : note || `Slot ${period}`}{' '}
                                ({DAY_LABELS[editingDay]})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPeriodTimes((prev) => {
                                    const nextDay = { ...(prev[editingDay] || {}) };
                                    delete nextDay[period];
                                    return { ...prev, [editingDay]: nextDay };
                                  });
                                  setPeriodNotes((prev) => {
                                    const nextDay = { ...(prev[editingDay] || {}) };
                                    delete nextDay[period];
                                    return { ...prev, [editingDay]: nextDay };
                                  });
                                }}
                                className="ml-2 text-[10px] text-red-500 hover:text-red-600"
                              >
                                Hapus
                              </button>
                            </span>
                            <input
                              type="text"
                              id={`schedule-time-${editingDay}-${period}`}
                              name={`schedule-time-${editingDay}-${period}`}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              value={periodTimes[editingDay]?.[period] || ''}
                              onChange={(e) =>
                                setPeriodTimes((prev) => ({
                                  ...prev,
                                  [editingDay]: {
                                    ...prev[editingDay],
                                    [period]: e.target.value,
                                  },
                                }))
                              }
                              placeholder="07.00 - 07.45"
                            />
                            <input
                              type="text"
                              id={`schedule-note-${editingDay}-${period}`}
                              name={`schedule-note-${editingDay}-${period}`}
                              className="mt-2 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                              value={periodNotes[editingDay]?.[period] || ''}
                              onChange={(e) =>
                                setPeriodNotes((prev) => ({
                                  ...prev,
                                  [editingDay]: {
                                    ...(prev[editingDay] || {}),
                                    [period]: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Keterangan (UPACARA, ISTIRAHAT, TADARUS, dll)"
                            />
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        const current = Object.keys(periodTimes[editingDay] || {})
                          .map(Number)
                          .sort((a, b) => a - b);
                        const next = (current[current.length - 1] || 0) + 1;
                        setPeriodTimes((prev) => ({
                          ...prev,
                          [editingDay]: {
                            ...(prev[editingDay] || {}),
                            [next]: '',
                          },
                        }));
                      }}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      + Tambah Jam ke
                    </button>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm('Apakah Anda yakin ingin mereset konfigurasi waktu untuk SEMUA HARI ke default?')) {
                            return;
                          }
                          setPeriodTimes(DEFAULT_PERIOD_TIMES);
                          setPeriodNotes(DEFAULT_PERIOD_NOTES);
                        }}
                        className="px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-colors shadow-sm"
                      >
                        Reset Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!effectiveAcademicYearId) {
                            toast.error('Tidak ada tahun ajaran aktif');
                            return;
                          }
                          saveConfigMutation.mutate({
                            academicYearId: effectiveAcademicYearId,
                            config: {
                              periodTimes,
                              periodNotes,
                            },
                          });
                        }}
                        disabled={saveConfigMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {saveConfigMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        Simpan Konfigurasi Waktu
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {effectiveClassId && (
                <div className="px-4 py-4 border border-gray-100 rounded-xl bg-gray-50/50 mb-4">
                  <form
                    id="schedule-entry-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!effectiveAcademicYearId || !effectiveClassId) {
                        toast.error('Tahun ajaran dan kelas harus dipilih');
                        return;
                      }
                      if (!formTeacherAssignmentId) {
                        toast.error('Pilih mata pelajaran dan guru terlebih dahulu');
                        return;
                      }
                      const startTeachingHour = formPeriod;
                      const endTeachingHour =
                        formEndPeriod === '' ? formPeriod : formEndPeriod;
                      if (endTeachingHour < startTeachingHour) {
                        toast.error('Sampai Jam ke tidak boleh kurang dari Jam ke awal');
                        return;
                      }
                      const periodsToCreate: number[] = [];
                      for (let th = startTeachingHour; th <= endTeachingHour; th += 1) {
                        const period = getPeriodFromTeachingHour(formDay, th);
                        
                        if (!period) {
                          // Skip if this teaching hour doesn't exist for the day
                          continue;
                        }

                        const hasExistingEntry = scheduleEntries.some(
                          (entry) =>
                            entry.dayOfWeek === formDay && entry.period === period,
                        );

                        if (!hasExistingEntry) {
                          periodsToCreate.push(period);
                        }
                      }
                      if (periodsToCreate.length === 0) {
                        toast.error(
                          'Semua jam pada rentang ini sudah terisi atau tidak valid, tidak ada jam pelajaran yang bisa diisi',
                        );
                        return;
                      }
                      try {
                        for (const period of periodsToCreate) {
                          await createEntryMutation.mutateAsync({
                            academicYearId: effectiveAcademicYearId,
                            classId: effectiveClassId as number,
                            teacherAssignmentId: formTeacherAssignmentId as number,
                            dayOfWeek: formDay,
                            period,
                            room: formRoom.trim() === '' ? null : formRoom.trim(),
                          });
                        }
                        toast.success('Entri jadwal pelajaran berhasil dibuat');
                        await queryClient.invalidateQueries({
                          queryKey: [
                            'admin-schedule-level2',
                            effectiveAcademicYearId,
                            effectiveClassId,
                          ],
                        });
                        setFormTeacherAssignmentId('');
                        setFormPeriod(1);
                        setFormEndPeriod('');
                        setFormDay('MONDAY');
                        setFormRoom('');
                      } catch (error) {
                        toast.error(getErrorMessage(error));
                      }
                    }}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-4 items-end">
                      <div className="min-w-[130px]">
                        <label
                          htmlFor="schedule-day"
                          className="block text-xs font-medium text-gray-700 mb-1"
                        >
                          Hari
                        </label>
                        <select
                          id="schedule-day"
                          name="schedule-day"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          value={formDay}
                          onChange={(e) => setFormDay(e.target.value as DayOfWeek)}
                        >
                          {DAY_ORDER.map((day) => (
                            <option key={day} value={day}>
                              {DAY_LABELS[day]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[120px]">
                        <label
                          htmlFor="schedule-period"
                          className="block text-xs font-medium text-gray-700 mb-1"
                        >
                          Jam Pelajaran ke
                        </label>
                        <input
                          type="number"
                          id="schedule-period"
                          name="schedule-period"
                          min={1}
                          max={maxPeriod}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          value={formPeriod}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            if (!raw) {
                              setFormPeriod(1);
                              return;
                            }
                            const normalized = Math.min(
                              maxPeriod,
                              Math.max(1, raw),
                            );
                            setFormPeriod(normalized);
                            if (formEndPeriod === '' || formEndPeriod < normalized) {
                              setFormEndPeriod(normalized);
                            }
                          }}
                        />
                      </div>
                      <div className="min-w-[130px]">
                        <label
                          htmlFor="schedule-period-end"
                          className="block text-xs font-medium text-gray-700 mb-1"
                        >
                          Sampai Jam Pelajaran ke
                        </label>
                        <input
                          type="number"
                          id="schedule-period-end"
                          name="schedule-period-end"
                          min={formPeriod}
                          max={maxPeriod}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          value={formEndPeriod === '' ? formPeriod : formEndPeriod}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            if (!raw) {
                              setFormEndPeriod('');
                              return;
                            }
                            const normalized = Math.min(
                              maxPeriod,
                              Math.max(formPeriod, raw),
                            );
                            setFormEndPeriod(normalized);
                          }}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="schedule-teacher-assignment"
                          className="block text-xs font-medium text-gray-700 mb-1"
                        >
                          Mapel & Guru
                        </label>
                        <select
                          id="schedule-teacher-assignment"
                          name="schedule-teacher-assignment"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          value={formTeacherAssignmentId}
                          onChange={(e) =>
                            setFormTeacherAssignmentId(
                              e.target.value ? Number(e.target.value) : '',
                            )
                          }
                        >
                          <option value="">
                            {classAssignments.length === 0
                              ? 'Belum ada penugasan untuk kelas ini'
                              : 'Pilih mapel & guru'}
                          </option>
                          {classAssignments.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.subject.code} • {a.subject.name} — {a.teacher.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="schedule-room"
                          className="block text-xs font-medium text-gray-700 mb-1"
                        >
                          Ruang (opsional)
                        </label>
                        <input
                          type="text"
                          id="schedule-room"
                          name="schedule-room"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          value={formRoom}
                          onChange={(e) => setFormRoom(e.target.value)}
                        />
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {!effectiveClassId ? (
                <div className="py-20 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="font-medium text-lg">Pilih Kelas Terlebih Dahulu</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Silakan pilih kelas di atas untuk melihat dan mengatur jadwal.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-center w-32">HARI</th>
                        <th className="px-4 py-3 text-center w-32">WAKTU</th>
                        <th className="px-4 py-3 text-center w-24">JAM KE</th>
                        <th className="px-4 py-3 text-left">MATA PELAJARAN & GURU</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {DAY_ORDER.map((day) => {
                        const periodsConfigured = Object.keys(periodTimes[day] || {}).map(Number);
                        const maxConfigured = periodsConfigured.length > 0 ? Math.max(...periodsConfigured) : 0;
                        
                        const maxFromEntries = scheduleEntries
                          .filter(e => e.dayOfWeek === day)
                          .reduce((max, entry) => (entry.period > max ? entry.period : max), 0);
                        
                        // Ensure we have at least 1 period if nothing is configured
                        const dayMaxPeriod = Math.max(maxConfigured, maxFromEntries, 1);

                        const dayPeriods = Array.from(
                          { length: dayMaxPeriod },
                          (_, idx) => idx + 1,
                        );

                        return dayPeriods.map((period, index) => {
                          const key = `${day}-${period}`;
                          const entry = cellMap.get(key);
                          const note = periodNotes[day]?.[period];
                          const time = periodTimes[day]?.[period] || '-';
                          const teachingHour = getTeachingHour(day, period);

                          const isBlockingNote =
                            note &&
                            (note.toUpperCase().includes('UPACARA') ||
                              note.toUpperCase().includes('ISTIRAHAT') ||
                              note.toUpperCase().includes('TADARUS'));

                          return (
                            <tr
                              key={key}
                              className={`hover:bg-gray-50 transition-colors ${
                                index === 0 ? 'border-t-2 border-gray-100' : ''
                              }`}
                            >
                              {index === 0 && (
                                <td
                                  className="px-4 py-3 align-top font-bold text-gray-700 bg-gray-50/30 border-r border-gray-100 text-center"
                                  rowSpan={dayPeriods.length}
                                >
                                  {DAY_LABELS[day].toUpperCase()}
                                </td>
                              )}
                              <td className="px-4 py-3 align-top text-gray-600 border-r border-gray-50 text-center">
                                {time}
                              </td>
                              <td className="px-4 py-3 align-top text-gray-600 font-bold border-r border-gray-50 text-center">
                                {teachingHour || '-'}
                              </td>
                              <td className="px-4 py-3 align-top group relative">
                                {isBlockingNote ? (
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${getNoteColorClass(
                                        note,
                                      )}`}
                                    >
                                      {note}
                                    </div>
                                    {entry && (
                                      <div className="hidden group-hover:block absolute top-1 right-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (
                                              !confirm(
                                                'Hapus entri jadwal yang tertutup keterangan ini?',
                                              )
                                            ) {
                                              return;
                                            }
                                            deleteEntryMutation.mutate(entry.id);
                                          }}
                                          disabled={deleteEntryMutation.isPending}
                                          className="p-1 rounded-md text-red-600 hover:bg-red-50 bg-white border border-red-100 shadow-sm"
                                          title={`Hapus mapel tersembunyi: ${entry.teacherAssignment.subject.code}`}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : !entry && note ? (
                                  <div
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${getNoteColorClass(
                                      note,
                                    )}`}
                                  >
                                    {note}
                                  </div>
                                ) : !entry ? (
                                  <span className="text-gray-300">-</span>
                                ) : (
                                  <>
                                    <div className="font-semibold text-gray-900">
                                      {entry.teacherAssignment.subject.code}
                                    </div>
                                    <div
                                      className="text-xs text-gray-600 mt-0.5 line-clamp-1"
                                      title={entry.teacherAssignment.subject.name}
                                    >
                                      {entry.teacherAssignment.subject.name}
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-[11px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded w-fit">
                                      <Users className="w-3 h-3" />
                                      <span
                                        className="truncate max-w-[100px]"
                                        title={entry.teacherAssignment.teacher.name}
                                      >
                                        {entry.teacherAssignment.teacher.name}
                                      </span>
                                    </div>
                                    {entry.room && (
                                      <div className="mt-1 text-[10px] text-gray-500 font-mono">
                                        R: {entry.room}
                                      </div>
                                    )}
                                    {note && !entry && (
                                      <div
                                        className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getNoteColorClass(
                                          note,
                                        )}`}
                                      >
                                        {note}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!confirm('Hapus entri jadwal ini?')) {
                                          return;
                                        }
                                        deleteEntryMutation.mutate(entry.id);
                                      }}
                                      disabled={deleteEntryMutation.isPending}
                                      className="absolute top-2 right-2 p-1.5 rounded-md text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm bg-white border border-gray-100"
                                      title="Hapus entri jadwal"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
