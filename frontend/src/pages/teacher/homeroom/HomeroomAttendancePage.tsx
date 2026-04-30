import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import type { User } from '../../../types/auth';
import {
  Calendar,
  Clock,
  FileText,
  AlertCircle,
  Download,
  Filter,
  Loader2,
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Edit2
} from 'lucide-react';
import {
  attendanceService,
  type AttendanceDetailStudent,
  type AttendanceRecapPeriod,
  type AttendanceRecord,
  type AttendanceStatus,
  type DailyAttendanceRecapStudent,
  type DailyAttendanceStudent,
  type LateSummaryStudent,
  type SemesterFilter,
} from '../../../services/attendance.service';
import { classService } from '../../../services/class.service';
import { toast } from 'react-hot-toast';

type DailyLogItem = DailyAttendanceStudent;
type DailyRecapItem = DailyAttendanceRecapStudent;
type LateSummaryItem = LateSummaryStudent;

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string; color: string }> = [
  { value: 'PRESENT', label: 'Hadir', color: 'bg-green-100 text-green-700' },
  { value: 'SICK', label: 'Sakit', color: 'bg-blue-100 text-blue-700' },
  { value: 'PERMISSION', label: 'Izin', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'DISPENSATION', label: 'Dispen', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'ABSENT', label: 'Alpa', color: 'bg-red-100 text-red-700' },
  { value: 'LATE', label: 'Telat', color: 'bg-orange-100 text-orange-700' },
];

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  DISPENSATION: 'Dispen',
  ABSENT: 'Alpha',
  LATE: 'Telat',
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('id-ID') : '-');
const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export const HomeroomAttendancePage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'daily_log' | 'recap' | 'late'>('daily_log');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('ALL');
  const [recapPeriod, setRecapPeriod] = useState<AttendanceRecapPeriod>('SEMESTER');
  const [recapMonth, setRecapMonth] = useState(new Date().getMonth() + 1);
  const [recapYear, setRecapYear] = useState(new Date().getFullYear());
  const [recapWeekStart, setRecapWeekStart] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRecapDetail, setSelectedRecapDetail] = useState<AttendanceDetailStudent | null>(null);
  const [selectedRecapStatus, setSelectedRecapStatus] = useState<AttendanceStatus | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<number, { status: AttendanceStatus | ''; note: string }>>({});


  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: User, activeYear: { id: number; name: string } }>() || {};

  // 1. Get Current User via Query (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const userId = user?.id;

  // 2. Get Active Academic Year
  const { data: fetchedActiveYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;

  // Fetch User Profile for Preferences
  const { data: userData } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => {
      if (!userId) return null;
      return userService.getById(userId);
    },
    enabled: !!userId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<User>) => {
      if (!userId) throw new Error('User ID not found');
      return userService.update(userId, data);
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    }
  });

  useEffect(() => {
    if (userData?.data?.preferences) {
        const prefs = userData.data.preferences as Record<string, unknown>;
        const savedTab = prefs['homeroom-attendance-active-tab'];
        if (savedTab) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActiveTab(savedTab as 'daily_log' | 'recap' | 'late');
        }
    }
  }, [userData]);

  const handleTabChange = (tab: 'daily_log' | 'recap' | 'late') => {
    setActiveTab(tab);
    if (userId) {
        const currentPrefs = (userData?.data?.preferences || {}) as Record<string, unknown>;
        updateProfileMutation.mutate({
            preferences: { ...currentPrefs, 'homeroom-attendance-active-tab': tab }
        });
    }
  };

  // 2. Get Active Academic Year
  // Consolidate with previous declaration - Removed Duplicate
  /*
  const { data: activeAcademicYear } = useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      const res = await academicYearService.getActive();
      return res.data;
    }
  });
  */

  // 3. Get Homeroom Class Summary (Filtered by Active Year)
  const { data: classSummary, isLoading: isLoadingClassSummary } = useQuery({
    queryKey: ['homeroom-class-summary', user?.id, activeAcademicYear?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      // Fetch all classes for this teacher
      const response = await classService.list({ teacherId: user.id, limit: 100 });
      // Filter by active academic year
      const classes = (response.data?.classes || []) as Array<{ id: number; academicYearId: number }>;
      const activeClass = classes.find((c) => c.academicYearId === activeAcademicYear.id);
      return activeClass || null;
    },
    enabled: !!user?.id && user?.role === 'TEACHER' && !!activeAcademicYear?.id,
  });

  // 4. Get Homeroom Class Details (for students & president)
  const { data: homeroomClass, isLoading: isLoadingClassDetails } = useQuery({
    queryKey: ['homeroom-class-details', classSummary?.id],
    queryFn: async () => {
      const response = await classService.getById(classSummary!.id);
      return response.data;
    },
    enabled: !!classSummary?.id,
  });

  const isLoadingClass = isLoadingClassSummary || isLoadingClassDetails;

  // Reset pagination when tab changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setSearch('');
  }, [activeTab]);

  // 5. Fetch Daily Recap
  const { data: dailyRecapData, isLoading: isLoadingDaily } = useQuery({
    queryKey: ['homeroom-daily-recap', homeroomClass?.id, semesterFilter],
    queryFn: () => attendanceService.getDailyRecap({
      classId: homeroomClass!.id,
      academicYearId: homeroomClass!.academicYearId,
      semester: semesterFilter
    }),
    enabled: !!homeroomClass,
  });

  const { data: dailyRecapDetailData, isLoading: isLoadingDailyDetail } = useQuery({
    queryKey: [
      'homeroom-daily-recap-detail',
      homeroomClass?.id,
      recapPeriod,
      semesterFilter,
      recapMonth,
      recapYear,
      recapWeekStart,
    ],
    queryFn: () => attendanceService.getDailyRecapDetail({
      classId: homeroomClass!.id,
      academicYearId: homeroomClass!.academicYearId,
      period: recapPeriod,
      semester: recapPeriod === 'SEMESTER' && semesterFilter !== 'ALL' ? semesterFilter : undefined,
      month: recapPeriod === 'MONTH' ? recapMonth : undefined,
      year: recapPeriod === 'MONTH' ? recapYear : undefined,
      weekStart: recapPeriod === 'WEEK' ? recapWeekStart : undefined,
    }),
    enabled: !!homeroomClass && activeTab === 'recap',
  });

  // 6. Fetch Late Summary
  const { data: lateSummaryData, isLoading: isLoadingLate } = useQuery({
    queryKey: ['homeroom-late-summary', homeroomClass?.id],
    queryFn: () => attendanceService.getLateSummaryByClass({
      classId: homeroomClass!.id,
      academicYearId: homeroomClass!.academicYearId,
    }),
    enabled: !!homeroomClass,
  });

  // 7. Fetch Daily Log (For "Presensi Harian" tab)
  const { data: dailyLogData, isLoading: isLoadingDailyLog } = useQuery({
    queryKey: ['homeroom-daily-log', homeroomClass?.id, selectedDate],
    queryFn: () => attendanceService.getDailyAttendance({
      date: selectedDate,
      classId: homeroomClass!.id,
      academicYearId: homeroomClass!.academicYearId,
    }),
    enabled: !!homeroomClass && activeTab === 'daily_log',
  });





  // Sync attendanceRecords when dailyLogData changes or editing starts
  useEffect(() => {
    if (dailyLogData?.data && !isEditing) {
      const records: Record<number, { status: AttendanceStatus | ''; note: string }> = {};
      dailyLogData.data.forEach((item: DailyLogItem) => {
        records[item.student.id] = {
          status: item.status || 'PRESENT',
          note: item.note || ''
        };
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAttendanceRecords(records);
    }
  }, [dailyLogData, isEditing]);

  const saveMutation = useMutation({
    mutationFn: (records: AttendanceRecord[]) => attendanceService.saveDailyAttendance({
      date: selectedDate,
      classId: homeroomClass!.id,
      academicYearId: homeroomClass!.academicYearId,
      records
    }),
    onSuccess: () => {
      toast.success('Presensi berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['homeroom-daily-log'] });
      queryClient.invalidateQueries({ queryKey: ['homeroom-daily-recap'] });
      queryClient.invalidateQueries({ queryKey: ['homeroom-daily-recap-detail'] });
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal menyimpan presensi');
    }
  });

  const handleSave = () => {
    const recordsToSave = Object.entries(attendanceRecords)
      .filter(([, data]) => data.status) // Only save records with status
      .map(([studentId, data]) => ({
        studentId: Number(studentId),
        status: data.status as AttendanceStatus,
        note: data.note || null
      }));

    if (recordsToSave.length === 0) {
      toast.error('Tidak ada data presensi untuk disimpan');
      return;
    }

    saveMutation.mutate(recordsToSave);
  };

  const handleStatusChange = (studentId: number, status: AttendanceStatus) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const handleNoteChange = (studentId: number, note: string) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], note }
    }));
  };


  // Calculate Daily Stats
  const dailyStats = useMemo(() => {
    if (!dailyLogData?.data || !Array.isArray(dailyLogData.data)) return null;

    const stats = {
      present: 0,
      sick: 0,
      permission: 0,
      dispensation: 0,
      absent: 0,
      late: 0,
      checkedIn: 0,
      checkedOut: 0,
      openPresence: 0,
    };

    dailyLogData.data.forEach((item: DailyLogItem) => {
      const status = item.status;
      switch (status) {
        case 'PRESENT': stats.present++; break;
        case 'SICK': stats.sick++; break;
        case 'PERMISSION': stats.permission++; break;
        case 'DISPENSATION': stats.dispensation++; break;
        case 'ABSENT': stats.absent++; break;
        case 'LATE': stats.late++; break;
      }

      if (item.checkInTime) stats.checkedIn++;
      if (item.checkOutTime) stats.checkedOut++;
      if (item.checkInTime && !item.checkOutTime) stats.openPresence++;
    });

    return stats;
  }, [dailyLogData]);

  if (isLoadingClass) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!homeroomClass) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Anda Bukan Wali Kelas</h2>
          <p className="text-gray-600">
            Anda tidak terdaftar sebagai wali kelas untuk kelas manapun pada tahun ajaran aktif ini.
          </p>
        </div>
      </div>
    );
  }



  // Pagination Logic
  const getCurrentData = (): Array<DailyLogItem | DailyRecapItem | LateSummaryItem> => {
    if (activeTab === 'daily_log') return (dailyLogData?.data || []) as DailyLogItem[];
    if (activeTab === 'recap') {
      const recap = dailyRecapDetailData?.data?.students
        ? dailyRecapDetailData.data.students.map((item) => ({
            student: item.student,
            present: item.summary.present,
            late: item.summary.late,
            sick: item.summary.sick,
            permission: item.summary.permission,
            dispensation: item.summary.dispensation,
            absent: item.summary.absent,
            total: item.summary.total,
            percentage: item.summary.percentage,
          }))
        : ((dailyRecapData?.data?.recap || []) as DailyRecapItem[]);
      return recap.slice().sort((a, b) => a.student.name.localeCompare(b.student.name));
    }
    if (activeTab === 'late') return (lateSummaryData?.data?.recap || []) as LateSummaryItem[];
    return [];
  };

  const currentData = getCurrentData();

  const filteredData = currentData.filter((item) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const student = item.student;
    return (
      student?.name?.toLowerCase().includes(term) ||
      student?.nisn?.includes(term) ||
      student?.nis?.includes(term)
    );
  });

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);
  const openRecapDetail = (studentId: number, status?: AttendanceStatus) => {
    const detail = dailyRecapDetailData?.data?.students.find((item) => item.student.id === studentId);
    setSelectedRecapDetail(detail || null);
    setSelectedRecapStatus(status || null);
  };
  const renderRecapCount = (
    student: DailyRecapItem,
    status: AttendanceStatus,
    value: number,
    colorClass: string,
  ) => (
    <button
      type="button"
      onClick={() => openRecapDetail(student.student.id, status)}
      disabled={value <= 0}
      className={`rounded-md px-2 py-1 font-semibold transition ${
        value > 0 ? `${colorClass} hover:bg-gray-100` : 'cursor-default text-gray-400'
      }`}
      title={value > 0 ? `Lihat detail ${STATUS_LABELS[status]}` : `Tidak ada ${STATUS_LABELS[status]}`}
    >
      {value > 0 ? value : '-'}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rekap Presensi</h1>
          <p className="text-gray-500 text-sm">
            Pantau rekapitulasi kehadiran dan keterlambatan siswa di kelas Anda.
          </p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs & Filter Header */}
        <div className="border-b border-gray-200 bg-gray-50 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="border-b border-gray-200">
              <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
              <button
                onClick={() => handleTabChange('daily_log')}
                className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                  activeTab === 'daily_log'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  <span>Presensi Harian</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('recap')}
                className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                  activeTab === 'recap'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Rekapitulasi</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('late')}
                className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                  activeTab === 'late'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Keterlambatan</span>
                </div>
              </button>
            </div>
            </div>
          </div>

          {activeTab === 'daily_log' && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
                />
              </div>

              {isEditing ? (
                 <div className="flex items-center gap-2">
                   <button
                     onClick={handleSave}
                     disabled={saveMutation.isPending}
                     className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                   >
                     <Save size={16} />
                     {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                   </button>
                   <button
                     onClick={() => setIsEditing(false)}
                     className="flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
                   >
                     <X size={16} />
                     Batal
                   </button>
                 </div>
               ) : (
                 <button
                   onClick={() => setIsEditing(true)}
                   className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 shadow-sm"
                 >
                   <Edit2 size={16} />
                   Edit Presensi
                 </button>
               )}
            </div>
          )}

          {activeTab === 'recap' && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-medium text-gray-600">Jenis Periode</label>
              <select
                value={recapPeriod}
                onChange={(e) => setRecapPeriod(e.target.value as AttendanceRecapPeriod)}
                className="block w-full min-w-[150px] sm:w-auto pl-3 pr-10 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
              >
                <option value="WEEK">Mingguan</option>
                <option value="MONTH">Bulanan</option>
                <option value="SEMESTER">Semester</option>
                <option value="YEAR">1 Tahun Ajaran</option>
              </select>
              {recapPeriod === 'WEEK' && (
                <input
                  type="date"
                  value={recapWeekStart}
                  onChange={(e) => setRecapWeekStart(e.target.value)}
                  className="block w-full sm:w-auto pl-3 pr-3 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
                />
              )}
              {recapPeriod === 'MONTH' && (
                <>
                  <select
                  value={recapMonth}
                  onChange={(e) => setRecapMonth(Number(e.target.value))}
                    className="block w-full min-w-[140px] sm:w-auto pl-3 pr-10 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <option key={month} value={month}>
                        {new Date(2026, month - 1, 1).toLocaleString('id-ID', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={recapYear}
                    onChange={(e) => setRecapYear(Number(e.target.value))}
                    className="block w-28 pl-3 pr-3 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
                  />
                </>
              )}
              {recapPeriod === 'SEMESTER' && (
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value as SemesterFilter)}
                className="block w-full min-w-[170px] sm:w-auto pl-3 pr-10 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
              >
                <option value="ALL">Semua Semester</option>
                <option value="ODD">Semester Ganjil</option>
                <option value="EVEN">Semester Genap</option>
              </select>
              )}
              <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
            </div>
          )}
        </div>

        {/* Search & Limit Toolbar */}
        <div className="p-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex flex-col sm:flex-row gap-4 items-center flex-1 w-full sm:w-auto">
            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Cari siswa..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Daily Stats */}
            {activeTab === 'daily_log' && dailyStats && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 w-full sm:w-auto overflow-x-auto">
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Hadir">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span>Hadir: <span className="font-semibold text-gray-900">{dailyStats.present}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Sakit">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span>Sakit: <span className="font-semibold text-gray-900">{dailyStats.sick}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Izin">
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <span>Izin: <span className="font-semibold text-gray-900">{dailyStats.permission}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Dispen">
                  <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                  <span>Dispen: <span className="font-semibold text-gray-900">{dailyStats.dispensation}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Telat">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span>Telat: <span className="font-semibold text-gray-900">{dailyStats.late}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Alpha">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span>Alpha: <span className="font-semibold text-gray-900">{dailyStats.absent}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Jam datang tercatat">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Masuk: <span className="font-semibold text-gray-900">{dailyStats.checkedIn}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Jam pulang tercatat">
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Pulang: <span className="font-semibold text-gray-900">{dailyStats.checkedOut}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Sudah masuk tetapi belum tercatat pulang">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Belum Pulang: <span className="font-semibold text-gray-900">{dailyStats.openPresence}</span></span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="limit" className="text-sm text-gray-600">
              Tampilkan:
            </label>
            <select
              id="limit"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={35}>35</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-x-auto">
          {activeTab === 'daily_log' ? (
            isLoadingDailyLog ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      NISN
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nama Siswa
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Jam Datang
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Jam Pulang
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(paginatedData as DailyLogItem[]).map((item, index: number) => (
                    <tr key={item.student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {item.student.nisn || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-medium text-xs">
                            {item.student.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {item.student.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.student.nis ? `NIS: ${item.student.nis}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        {isEditing ? (
                          <div className="flex flex-wrap gap-1 justify-center max-w-[300px] mx-auto">
                            {STATUS_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                onClick={() => handleStatusChange(item.student.id, option.value)}
                                className={`px-2 py-1 text-xs font-medium rounded-md border transition-all ${
                                  attendanceRecords[item.student.id]?.status === option.value
                                    ? option.color + ' border-current ring-1 ring-current'
                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                }`}
                                title={option.label}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            {item.status === 'PRESENT' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Hadir</span>}
                            {item.status === 'SICK' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Sakit</span>}
                            {item.status === 'PERMISSION' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Izin</span>}
                            {item.status === 'DISPENSATION' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-cyan-100 text-cyan-800">Dispen</span>}
                            {item.status === 'ABSENT' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Alpa</span>}
                            {item.status === 'LATE' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Telat</span>}
                            {!item.status && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Belum Absen</span>}
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-700">
                        {item.checkInTime || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-700">
                        {item.checkOutTime || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">
                        {isEditing ? (
                          <input
                            type="text"
                            value={attendanceRecords[item.student.id]?.note || ''}
                            onChange={(e) => handleNoteChange(item.student.id, e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Keterangan..."
                          />
                        ) : (
                          item.note || '-'
                        )}
                      </td>
                    </tr>
                  ))}
                  {paginatedData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                        <p>{search ? 'Siswa tidak ditemukan' : 'Tidak ada data siswa.'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          ) : activeTab === 'recap' ? (
            isLoadingDaily || isLoadingDailyDetail ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      NISN
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nama Siswa
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hadir
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sakit
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Izin
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dispen
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Alpa
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Telat
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % Kehadiran
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(paginatedData as DailyRecapItem[]).map((student, index: number) => (
                    <tr key={student.student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {student.student.nisn || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-medium text-xs">
                            {student.student.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {student.student.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {student.student.nis ? `NIS: ${student.student.nis}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {renderRecapCount(student, 'PRESENT', student.present, 'text-emerald-700')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {renderRecapCount(student, 'SICK', student.sick, 'text-blue-700')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {renderRecapCount(student, 'PERMISSION', student.permission, 'text-yellow-700')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {renderRecapCount(student, 'DISPENSATION', student.dispensation, 'text-cyan-700')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {renderRecapCount(student, 'ABSENT', student.absent, 'text-red-700')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {renderRecapCount(student, 'LATE', student.late, 'text-orange-700')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                        {student.total}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                          ${student.percentage >= 90 ? 'bg-green-100 text-green-800' :
                            student.percentage >= 75 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'}`}>
                          {student.percentage}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <button
                          type="button"
                          onClick={() => {
                            openRecapDetail(student.student.id);
                          }}
                          className="inline-flex items-center rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          Detail Tanggal
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedData.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                        <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                        <p>{search ? 'Siswa tidak ditemukan' : 'Belum ada data presensi untuk ditampilkan.'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          ) : (
            isLoadingLate ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      No
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      NISN
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nama Siswa
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ganjil
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Genap
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(paginatedData as LateSummaryItem[]).map((student, index: number) => (
                    <tr key={student.student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {student.student.nisn || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-medium text-xs">
                            {student.student.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {student.student.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {student.student.nis ? `NIS: ${student.student.nis}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {student.semester1Late > 0 ? student.semester1Late : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {student.semester2Late > 0 ? student.semester2Late : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-orange-600">
                        {student.totalLate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        {student.totalLate > 5 ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            Perlu Perhatian
                          </span>
                        ) : student.totalLate > 0 ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Wajar
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Disiplin
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {paginatedData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <Clock className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                        <p>{search ? 'Siswa tidak ditemukan' : 'Tidak ada data keterlambatan.'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="text-sm text-gray-500">
            Menampilkan{' '}
            <span className="font-medium">
              {totalItems === 0 ? 0 : startIndex + 1}
            </span>{' '}
            sampai{' '}
            <span className="font-medium">
              {Math.min(startIndex + limit, totalItems)}
            </span>{' '}
            dari{' '}
            <span className="font-medium">
              {totalItems}
            </span>{' '}
            data
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={page === totalPages}
              className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {selectedRecapDetail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/20 p-4">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Detail Presensi {selectedRecapDetail.student.name}</h2>
                <p className="text-sm text-gray-500">
                  {selectedRecapStatus
                    ? `Tanggal saat siswa berstatus ${STATUS_LABELS[selectedRecapStatus]} pada periode rekap yang dipilih.`
                    : 'Tanggal status H/S/I/D/A/T pada periode rekap yang dipilih.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRecapDetail(null);
                  setSelectedRecapStatus(null);
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[62vh] overflow-y-auto p-5">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Tanggal</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Jam Datang/Pulang</th>
                    <th className="px-3 py-2 text-left">Keterangan</th>
                    <th className="px-3 py-2 text-left">Terakhir Diedit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedRecapDetail.details
                    .filter((detail) => !selectedRecapStatus || detail.status === selectedRecapStatus)
                    .map((detail) => (
                    <tr key={`${detail.id}-${detail.date}-${detail.status}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">{formatDate(detail.date)}</td>
                      <td className="px-3 py-2">{STATUS_LABELS[detail.status]}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {detail.checkInTime || '-'} / {detail.checkOutTime || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{detail.note || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{formatDateTime(detail.updatedAt || detail.createdAt || null)}</td>
                    </tr>
                  ))}
                  {selectedRecapDetail.details.filter((detail) => !selectedRecapStatus || detail.status === selectedRecapStatus).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                        Belum ada detail presensi pada periode ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
