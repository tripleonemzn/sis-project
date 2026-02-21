import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  Calendar,
  Save,
  MapPin,
  AlertCircle
} from 'lucide-react';
import { createPortal } from 'react-dom';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
// import { id } from 'date-fns/locale'; // Unused

// --- Interfaces ---

interface AcademicYear {
  id: number;
  name: string;
  semester: string;
  isActive: boolean;
}

interface Teacher {
  id: number;
  name: string;
  username?: string;
}

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  examType: string;
  subject?: {
    id: number;
    name: string;
    code: string;
  };
  packet?: {
    title: string;
    type?: string;
    subject: {
      name: string;
    };
  };
  class: {
    name: string;
  };
  proctorId: number | null;
  proctor?: {
    id: number;
    name: string;
  };
}

// --- Components ---

const SearchableSelect = ({ 
  value, 
  options, 
  onChange, 
  placeholder = "Pilih...", 
  disabled = false 
}: { 
  value: number | null; 
  options: Teacher[]; 
  onChange: (val: number | null) => void; 
  placeholder?: string;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(o => 
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.username && o.username.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    if (isOpen && listRef.current) {
        const activeItem = listRef.current.children[activeIndex] as HTMLElement;
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }
    }
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && 
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const showAbove = spaceBelow < 300 && spaceAbove > spaceBelow;

      setPosition({
        top: showAbove ? rect.top - 300 : rect.bottom + 5,
        left: rect.left,
        width: rect.width
      });
    }
    setIsOpen(true);
    setSearch('');
    setActiveIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!isOpen) {
          if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
              e.preventDefault();
              handleOpen();
          }
          return;
      }

      switch (e.key) {
          case 'ArrowDown':
              e.preventDefault();
              setActiveIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
              break;
          case 'ArrowUp':
              e.preventDefault();
              setActiveIndex(prev => Math.max(prev - 1, 0));
              break;
          case 'Enter':
              e.preventDefault();
              if (filteredOptions[activeIndex]) {
                  onChange(filteredOptions[activeIndex].id);
                  setIsOpen(false);
                  setSearch('');
              }
              break;
          case 'Escape':
              e.preventDefault();
              setIsOpen(false);
              break;
          case 'Tab':
              setIsOpen(false);
              break;
      }
  };

  const selectedTeacher = options.find(o => o.id === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between pl-3 pr-2 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <span className={`truncate block text-left ${value ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
          {selectedTeacher ? (selectedTeacher.username ? `${selectedTeacher.username} - ` : '') + selectedTeacher.name : placeholder}
        </span>
        <ChevronDown size={16} className="text-gray-400 flex-shrink-0 ml-1" />
      </button>

      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: '300px'
          }}
        >
          <div className="p-2 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Cari pengawas..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-1" ref={listRef}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, idx) => (
                <button
                  key={option.id}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    idx === activeIndex ? 'bg-blue-50 text-blue-700' : 
                    value === option.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {option.username ? <span className="font-mono text-xs opacity-75 mr-2">{option.username}</span> : ''}
                  {option.name}
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-sm text-gray-500">
                <p>Tidak ditemukan</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const ExamProctorManagementPage = () => {
  const [activeTab, setActiveTab] = useState<'SBTS' | 'SAS' | 'SAT'>('SBTS');
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  
  // Data for Selects
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // Room Mapping
  const [classRoomMap, setClassRoomMap] = useState<Record<string, string>>({});
  
  // Changes tracking
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map()); // Key: "time|room", Value: proctorId
  const [saving, setSaving] = useState<Set<string>>(new Set());
  
  // UI State
  const [expandedSlots, setExpandedSlots] = useState<string[]>([]);

  // --- Fetch Initial Data ---
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [ayRes, teacherRes] = await Promise.all([
          api.get('/academic-years?limit=100'),
          api.get('/users?role=TEACHER&limit=1000')
        ]);

        const ays = ayRes.data?.data?.academicYears || ayRes.data?.data || [];
        // setAcademicYears(ays); // Removed unused state setter

        const activeAy = ays.find((ay: AcademicYear) => ay.isActive);
        if (activeAy) setSelectedAcademicYear(activeAy.id.toString());
        else if (ays.length > 0) setSelectedAcademicYear(ays[0].id.toString());

        setTeachers(teacherRes.data?.data?.users || teacherRes.data?.data || []);
      } catch (err) {
        console.error(err);
        toast.error('Gagal memuat data awal');
      }
    };
    fetchInitialData();
  }, []);

  // --- Fetch Room Mappings (From ExamSitting) ---
  useEffect(() => {
    const fetchSittings = async () => {
      if (!selectedAcademicYear) return;
      try {
        const res = await api.get('/exam-sittings', {
          params: {
            academicYearId: selectedAcademicYear,
            examType: activeTab,
            limit: 1000 // Get all
          }
        });
        
        const sittingsList = res.data?.data || [];
        const mapping: Record<string, string> = {};
        
        // We need to fetch details for each sitting to get the students list
        // because the list endpoint might not return full student details
        await Promise.all(sittingsList.map(async (s: any) => {
            try {
                const detailRes = await api.get(`/exam-sittings/${s.id}`);
                const sitting = detailRes.data?.data;
                
                if (sitting && sitting.students) {
                    sitting.students.forEach((wrapper: any) => {
                        // Extract class name robustly
                        let className = '';
                        
                        // Case 0: wrapper IS the student and has studentClass (Standard Backend Response)
                        if (wrapper.studentClass?.name) {
                             className = wrapper.studentClass.name;
                        }
                        // Case 1: wrapper.student is the student object
                        else if (wrapper.student) {
                             className = wrapper.student.studentClass?.name || wrapper.student.class?.name || '';
                        }
                        // Case 2: wrapper itself is the student (if structure differs)
                        else if (wrapper.class?.name) {
                             className = wrapper.class.name;
                        }
                        // Case 3: Flat structure (student_id, class_name)
                        else if (wrapper.class_name) {
                             className = wrapper.class_name;
                        }

                        if (className) {
                            mapping[className.trim()] = sitting.roomName;
                        }
                    });
                }
            } catch (e) {
                console.error(`Failed to fetch details for sitting ${s.id}`, e);
            }
        }));
        
        setClassRoomMap(mapping);
      } catch (err) {
        console.error('Error fetching sittings:', err);
      }
    };

    fetchSittings();
  }, [selectedAcademicYear, activeTab]);

  // --- Fetch Schedules ---
  const fetchSchedules = useCallback(async () => {
    if (!selectedAcademicYear) return;

    setLoading(true);
    try {
      const params: any = {
        examType: activeTab,
        academicYearId: selectedAcademicYear
      };
      if (selectedDate) params.date = selectedDate;

      const res = await api.get('/exams/schedules', { params });
      
      // Filter out non-exam items
      const filtered = (res.data.data || []).filter((s: ExamSchedule) => 
        s.examType !== 'FORMATIF' && s.packet?.type !== 'FORMATIF'
      );
      
      setSchedules(filtered);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  }, [selectedAcademicYear, activeTab, selectedDate]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // --- Grouping Logic ---
  const groupedData = useMemo(() => {
    // 1. Group by Time Slot
    const byTime: Record<string, ExamSchedule[]> = {};
    
    schedules.forEach(s => {
      const timeKey = `${s.startTime}|${s.endTime}`;
      if (!byTime[timeKey]) byTime[timeKey] = [];
      byTime[timeKey].push(s);
    });

    // 2. Sort Time Slots
    const sortedTimes = Object.keys(byTime).sort((a, b) => {
      return a.localeCompare(b);
    });

    // 3. Group by Room within Time Slot
    return sortedTimes.map(timeKey => {
      const [start, end] = timeKey.split('|');
      const timeSchedules = byTime[timeKey];
      
      const byRoom: Record<string, ExamSchedule[]> = {};
      const unassigned: ExamSchedule[] = [];

      timeSchedules.forEach(s => {
        const roomName = classRoomMap[s.class.name.trim()];
        if (roomName) {
          if (!byRoom[roomName]) byRoom[roomName] = [];
          byRoom[roomName].push(s);
        } else {
          unassigned.push(s);
        }
      });

      return {
        timeKey,
        start,
        end,
        rooms: Object.entries(byRoom).sort((a, b) => a[0].localeCompare(b[0])), // Sort rooms alphabetically
        unassigned
      };
    });
  }, [schedules, classRoomMap]);

  // --- Handlers ---

  const handleProctorChange = (timeKey: string, roomName: string, proctorId: number | null) => {
    if (proctorId === null) return;
    const key = `${timeKey}::${roomName}`;
    setPendingChanges(prev => new Map(prev).set(key, proctorId));
  };

  const toggleSlot = (timeKey: string) => {
    setExpandedSlots(prev => 
      prev.includes(timeKey) 
        ? prev.filter(key => key !== timeKey)
        : [...prev, timeKey]
    );
  };

  const handleSaveProctor = async (timeKey: string, roomName: string, scheduleIds: number[]) => {
    const key = `${timeKey}::${roomName}`;
    const proctorId = pendingChanges.get(key);
    
    if (!proctorId) return;

    setSaving(prev => new Set(prev).add(key));
    try {
      // Parallel update all schedules in this room for this time
      await Promise.all(scheduleIds.map(id => 
        api.patch(`/exams/schedules/${id}`, { 
            proctorId,
            room: roomName // Also sync room name just in case
        })
      ));
      
      toast.success(`Pengawas untuk ${roomName} berhasil disimpan`);
      setPendingChanges(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      fetchSchedules(); // Refresh data
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan pengawas');
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6 w-full pb-20">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Jadwal Mengawas</h1>
        <p className="text-gray-500">
          Atur pengawas berdasarkan <span className="font-semibold text-gray-700">Ruang Ujian</span>. 
          Ruang ujian otomatis terdeteksi dari data "Kelola Ruang Ujian".
        </p>
        
        <div className="flex flex-wrap items-center gap-4 mt-6">
          {/* Filters */}
          <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
            {(['SBTS', 'SAS', 'SAT'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-md transition-colors
                  ${activeTab === tab
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                `}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="h-8 w-px bg-gray-300 mx-2"></div>

          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Memuat jadwal...</p>
          </div>
        ) : groupedData.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Tidak ada jadwal ujian</h3>
            <p className="text-gray-500 mt-1">Silakan pilih tanggal lain atau buat jadwal ujian terlebih dahulu.</p>
          </div>
        ) : (
          groupedData.map((group, index) => {
            const isExpanded = expandedSlots.includes(group.timeKey);
            
            return (
              <div key={group.timeKey} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Time Slot Header - Clickable */}
                <div 
                  onClick={() => toggleSlot(group.timeKey)}
                  className="bg-white px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold text-sm whitespace-nowrap">
                      Jam Ke-{index + 1}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <Clock className="text-blue-600" size={16} />
                        <span className="text-lg font-bold text-gray-900">
                          {format(new Date(group.start), 'HH:mm')} - {format(new Date(group.end), 'HH:mm')} WIB
                        </span>
                      </div>
                      <span className="text-sm text-gray-500 mt-0.5">
                        {group.rooms.length} Ruang Ujian Aktif
                      </span>
                    </div>
                  </div>

                  <button 
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isExpanded 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {isExpanded ? (
                      <>
                        <span>Tutup Detail</span>
                        <ChevronDown size={18} />
                      </>
                    ) : (
                      <>
                        <span>Lihat Detail</span>
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </div>

                {/* Rooms Table - Collapsible */}
                {isExpanded && (
                  <div className="border-t border-gray-200 animate-in slide-in-from-top-2 duration-200">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/4">Ruang Ujian</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">Kelas & Mapel</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">Pengawas</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-24">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {group.rooms.map(([roomName, schedules]) => {
                            const changeKey = `${group.timeKey}::${roomName}`;
                            const currentProctorId = pendingChanges.get(changeKey) ?? schedules[0].proctorId;
                            const isSaving = saving.has(changeKey);
                            const hasChanges = pendingChanges.has(changeKey);

                            return (
                              <tr key={roomName} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4 align-top">
                                  <div className="flex items-center gap-2">
                                    <MapPin size={16} className="text-gray-400" />
                                    <span className="font-medium text-gray-900">{roomName}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <div className="flex flex-wrap gap-2">
                                    {schedules.map(s => (
                                      <div key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100 text-xs">
                                        <span className="font-bold">{s.class.name}</span>
                                        <span className="text-blue-300">|</span>
                                        <span className="truncate max-w-[150px]" title={s.subject?.name || s.packet?.subject?.name}>
                                          {s.subject?.name || s.packet?.subject?.name}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <SearchableSelect
                                    value={currentProctorId}
                                    options={teachers}
                                    onChange={(val) => handleProctorChange(group.timeKey, roomName, val)}
                                    placeholder="Pilih Pengawas..."
                                    disabled={isSaving}
                                  />
                                </td>
                                <td className="px-6 py-4 align-top text-right">
                                  {hasChanges && (
                                    <button
                                      onClick={() => handleSaveProctor(group.timeKey, roomName, schedules.map(s => s.id))}
                                      disabled={isSaving}
                                      className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                                      title="Simpan Perubahan"
                                    >
                                      {isSaving ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                      ) : (
                                        <Save size={16} />
                                      )}
                                      Simpan
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          
                          {group.unassigned.length > 0 && (
                            <tr className="bg-red-50">
                              <td className="px-6 py-4 align-top">
                                <div className="flex items-center gap-2 text-red-600">
                                  <AlertCircle size={16} />
                                  <span className="font-medium italic">Belum Ada Ruang</span>
                                </div>
                                <p className="text-xs text-red-500 mt-1">
                                  Kelas-kelas ini belum diatur dalam menu "Kelola Ruang Ujian".
                                </p>
                              </td>
                              <td className="px-6 py-4 align-top" colSpan={3}>
                                <div className="flex flex-wrap gap-2">
                                  {group.unassigned.map(s => (
                                    <div key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white text-red-700 border border-red-200 text-xs shadow-sm">
                                      <span className="font-bold">{s.class.name}</span>
                                      <span className="text-red-300">|</span>
                                      <span>{s.subject?.name || s.packet?.subject?.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ExamProctorManagementPage;
