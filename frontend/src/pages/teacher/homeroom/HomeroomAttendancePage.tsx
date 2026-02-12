import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { 
  Calendar, 
  Clock, 
  FileText, 
  AlertCircle,
  Download,
  Filter,
  Check,
  ChevronDown,
  Loader2,
  UserCheck,
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Edit2
} from 'lucide-react';
import { attendanceService, type SemesterFilter } from '../../../services/attendance.service';
import { classService } from '../../../services/class.service';
import { toast } from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Hadir', color: 'bg-green-100 text-green-700' },
  { value: 'SICK', label: 'Sakit', color: 'bg-blue-100 text-blue-700' },
  { value: 'PERMISSION', label: 'Izin', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'ABSENT', label: 'Alpa', color: 'bg-red-100 text-red-700' },
  { value: 'LATE', label: 'Telat', color: 'bg-orange-100 text-orange-700' },
];

export const HomeroomAttendancePage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'daily_log' | 'recap' | 'late'>('daily_log');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('ALL');
  const [isPresidentDropdownOpen, setIsPresidentDropdownOpen] = useState(false);
  const [selectedPresidentId, setSelectedPresidentId] = useState<number | null>(null);
  const [presidentSearch, setPresidentSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<number, { status: string; note: string }>>({});

  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: any, activeYear: any }>() || {};

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
    mutationFn: (data: any) => {
      if (!userId) throw new Error('User ID not found');
      return userService.update(userId, data);
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    }
  });

  useEffect(() => {
    if (userData?.data?.preferences) {
        // @ts-ignore
        const savedTab = userData.data.preferences['homeroom-attendance-active-tab'];
        if (savedTab) {
            setActiveTab(savedTab as 'daily_log' | 'recap' | 'late');
        }
    }
  }, [userData]);

  const handleTabChange = (tab: 'daily_log' | 'recap' | 'late') => {
    setActiveTab(tab);
    if (userId) {
        // @ts-ignore
        const currentPrefs = userData?.data?.preferences || {};
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
      const activeClass = response.data.classes.find((c: any) => c.academicYearId === activeAcademicYear.id);
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

  // Update local state when class data is loaded
  useEffect(() => {
    if (homeroomClass) {
      if (homeroomClass.president?.id) {
        setSelectedPresidentId(homeroomClass.president.id);
      } else if (homeroomClass.presidentId) {
        setSelectedPresidentId(homeroomClass.presidentId);
      } else {
        setSelectedPresidentId(null);
      }
    }
  }, [homeroomClass]);

  // Reset pagination when tab changes
  useEffect(() => {
    setPage(1);
    setSearch('');
  }, [activeTab]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPresidentDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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

  // 8. Mutation for updating President
  const updatePresidentMutation = useMutation({
    mutationFn: (presidentId: number) => classService.updatePresident(homeroomClass!.id, presidentId),
    onSuccess: (data) => {
      toast.success('Ketua Murid berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['homeroom-class-details'] });
      setIsPresidentDropdownOpen(false);
      setSelectedPresidentId(data.data.presidentId);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal memperbarui Ketua Murid');
    },
  });

  const handlePresidentSelect = (studentId: number) => {
    if (homeroomClass) {
      updatePresidentMutation.mutate(studentId);
    }
  };

  // Sync attendanceRecords when dailyLogData changes or editing starts
  useEffect(() => {
    if (dailyLogData?.data && !isEditing) {
      const records: Record<number, { status: string; note: string }> = {};
      dailyLogData.data.forEach((item: any) => {
        records[item.student.id] = {
          status: item.status || '', 
          note: item.note || ''
        };
      });
      setAttendanceRecords(records);
    }
  }, [dailyLogData, isEditing]);

  const saveMutation = useMutation({
    mutationFn: (records: any[]) => attendanceService.saveDailyAttendance({
      date: selectedDate,
      classId: homeroomClass!.id,
      academicYearId: homeroomClass!.academicYearId,
      records
    }),
    onSuccess: () => {
      toast.success('Presensi berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['homeroom-daily-log'] });
      queryClient.invalidateQueries({ queryKey: ['homeroom-daily-recap'] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menyimpan presensi');
    }
  });

  const handleSave = () => {
    const recordsToSave = Object.entries(attendanceRecords)
      .filter(([_, data]) => data.status) // Only save records with status
      .map(([studentId, data]) => ({
        studentId: Number(studentId),
        status: data.status,
        note: data.note || null
      }));

    if (recordsToSave.length === 0) {
      toast.error('Tidak ada data presensi untuk disimpan');
      return;
    }

    saveMutation.mutate(recordsToSave);
  };

  const handleStatusChange = (studentId: number, status: string) => {
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
      absent: 0,
      late: 0
    };

    dailyLogData.data.forEach((item: any) => {
      const status = item.status; 
      switch (status) {
        case 'PRESENT': stats.present++; break;
        case 'SICK': stats.sick++; break;
        case 'PERMISSION': stats.permission++; break;
        case 'ABSENT': stats.absent++; break;
        case 'LATE': stats.late++; break;
      }
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

  // Get student list from class details for dropdown
  const studentList = homeroomClass.students || [];

  // Pagination Logic
  const getCurrentData = () => {
    if (activeTab === 'daily_log') return dailyLogData?.data || [];
    if (activeTab === 'recap') {
      const recap = dailyRecapData?.data?.recap || [];
      return recap.slice().sort((a: any, b: any) => a.student.name.localeCompare(b.student.name));
    }
    if (activeTab === 'late') return lateSummaryData?.data?.recap || [];
    return [];
  };

  const currentData = getCurrentData();
  
  const filteredData = currentData.filter((item: any) => {
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
            <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200">
              <button
                onClick={() => handleTabChange('daily_log')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'daily_log'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  <span>Presensi Harian</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('recap')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'recap'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Rekapitulasi</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('late')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'late'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Keterlambatan</span>
                </div>
              </button>
            </div>
            
            <div className="relative flex items-center gap-2" ref={dropdownRef}>
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Ketua Murid:</span>
                <div className="relative">
                  <div
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer flex justify-between items-center text-sm min-w-[300px]"
                    onClick={() => setIsPresidentDropdownOpen(!isPresidentDropdownOpen)}
                  >
                    <div className="flex items-center">
                      <UserCheck className="w-4 h-4 text-gray-500 mr-2" />
                      <span className={selectedPresidentId ? 'text-gray-900' : 'text-gray-500'}>
                        {selectedPresidentId 
                          ? studentList.find((s: any) => s.id === selectedPresidentId)?.name || 'Pilih Ketua Murid'
                          : 'Pilih Ketua Murid'}
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-500 ml-2" />
                  </div>
                  
                  {isPresidentDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            className="w-full pl-8 pr-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="Cari siswa..."
                            value={presidentSearch}
                            onChange={(e) => setPresidentSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        </div>
                      </div>
                      {studentList.filter((s: any) => s.name.toLowerCase().includes(presidentSearch.toLowerCase())).length > 0 ? (
                        studentList
                          .filter((s: any) => s.name.toLowerCase().includes(presidentSearch.toLowerCase()))
                          .map((student: any) => (
                          <div
                            key={student.id}
                            className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center ${
                              selectedPresidentId === student.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                            }`}
                            onClick={() => {
                                handlePresidentSelect(student.id);
                                setIsPresidentDropdownOpen(false);
                                setPresidentSearch(''); // Reset search
                            }}
                          >
                            <span>{student.name}</span>
                            {selectedPresidentId === student.id && (
                                <Check className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm text-center">Siswa tidak ditemukan</div>
                      )}
                    </div>
                  )}
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
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value as SemesterFilter)}
                className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-gray-900"
              >
                <option value="ALL">Semua Semester</option>
                <option value="ODD">Semester Ganjil</option>
                <option value="EVEN">Semester Genap</option>
              </select>
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
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Telat">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span>Telat: <span className="font-semibold text-gray-900">{dailyStats.late}</span></span>
                </div>
                <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 whitespace-nowrap" title="Alpha">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span>Alpha: <span className="font-semibold text-gray-900">{dailyStats.absent}</span></span>
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((item: any, index: number) => (
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
                            {item.status === 'ABSENT' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Alpa</span>}
                            {item.status === 'LATE' && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Telat</span>}
                            {!item.status && <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Belum Absen</span>}
                          </>
                        )}
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
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                        <p>{search ? 'Siswa tidak ditemukan' : 'Tidak ada data siswa.'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          ) : activeTab === 'recap' ? (
            isLoadingDaily ? (
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((student: any, index: number) => (
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
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 font-medium">
                        {student.present}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {student.sick > 0 ? <span className="text-blue-600 font-bold">{student.sick}</span> : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {student.permission > 0 ? <span className="text-yellow-600 font-bold">{student.permission}</span> : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {student.absent > 0 ? <span className="text-red-600 font-bold">{student.absent}</span> : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {student.late > 0 ? <span className="text-orange-600 font-bold">{student.late}</span> : '-'}
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
                    </tr>
                  ))}
                  {paginatedData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
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
                  {paginatedData.map((student: any, index: number) => (
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
    </div>
  );
};
