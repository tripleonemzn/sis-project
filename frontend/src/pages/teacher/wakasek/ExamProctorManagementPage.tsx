import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  Calendar,
  Archive,
  Save,
  MapPin,
  FileText,
  Users,
  AlertCircle,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { examService, type ExamProgram } from '../../../services/exam.service';
import { isNonScheduledExamProgram, resolveProgramCodeFromParam } from '../../../lib/examProgramMenu';
// import { id } from 'date-fns/locale'; // Unused

// --- Interfaces ---

interface Teacher {
  id: number;
  name: string;
  username?: string;
}
type TeacherApiUser = {
  id?: number | string;
  name?: string;
  username?: string;
};
type SittingListItem = { id: number | string };
type SittingStudentWrapper = {
  studentClass?: { name?: string | null } | null;
  student?: { studentClass?: { name?: string | null } | null; class?: { name?: string | null } | null } | null;
  class?: { name?: string | null } | null;
  class_name?: string | null;
};
type SittingDetail = {
  students?: SittingStudentWrapper[];
  sessionLabel?: string | null;
  roomName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  sessionLabel?: string | null;
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

interface ProctorReportRow {
  room: string | null;
  startTime: string;
  endTime: string;
  sessionLabel?: string | null;
  examType?: string | null;
  classNames: string[];
  scheduleIds: number[];
  expectedParticipants: number;
  presentParticipants: number;
  absentParticipants: number;
  totalParticipants: number;
  absentStudents?: Array<{
    id: number;
    name: string;
    nis?: string | null;
    className?: string | null;
    absentReason?: string | null;
    permissionStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  }>;
  report: {
    id: number;
    signedAt: string;
    notes?: string | null;
    incident?: string | null;
    documentNumber?: string | null;
    verificationUrl?: string | null;
    proctor?: {
      id: number;
      name: string;
    } | null;
  } | null;
}

interface ProctorReportSummary {
  totalRooms: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  reportedRooms: number;
}

const normalizeClassLookupKey = (raw: unknown): string =>
  String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim();

const normalizeSessionLabel = (raw: unknown): string =>
  String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const buildClassSessionLookupKey = (className: unknown, sessionLabel: unknown): string =>
  `${normalizeClassLookupKey(className)}::${normalizeSessionLabel(sessionLabel) || '__no_session__'}`;

const normalizeRoomLookupKey = (raw: unknown): string =>
  String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTimeLookupKey = (raw: unknown): string => {
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? String(parsed) : String(raw || '').trim();
};

const buildRoomSlotLookupKey = (
  roomName: unknown,
  startTime: unknown,
  endTime: unknown,
  sessionLabel: unknown,
): string =>
  `${normalizeRoomLookupKey(roomName)}::${normalizeTimeLookupKey(startTime)}::${normalizeTimeLookupKey(endTime)}::${normalizeSessionLabel(sessionLabel) || '__no_session__'}`;

const buildRoomSessionLookupKey = (roomName: unknown, sessionLabel: unknown): string =>
  `${normalizeRoomLookupKey(roomName)}::${normalizeSessionLabel(sessionLabel) || '__no_session__'}`;

const compareClassName = (a: string, b: string): number =>
  String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });

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
  const [searchParams, setSearchParams] = useSearchParams();
  const programParamKey = 'mengawasProgram';
  const dateParamKey = 'mengawasDate';
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  
  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(() => String(searchParams.get(dateParamKey) || ''));
  const [reportMode, setReportMode] = useState<'daily' | 'archive'>('daily');
  const [reportDateFrom, setReportDateFrom] = useState<string>(() => String(searchParams.get('mengawasReportFrom') || ''));
  const [reportDateTo, setReportDateTo] = useState<string>(() => String(searchParams.get('mengawasReportTo') || ''));
  const selectedAcademicYear = activeAcademicYear?.id ? String(activeAcademicYear.id) : '';
  const [proctorReports, setProctorReports] = useState<ProctorReportRow[]>([]);
  const [proctorReportSummary, setProctorReportSummary] = useState<ProctorReportSummary>({
    totalRooms: 0,
    totalExpected: 0,
    totalPresent: 0,
    totalAbsent: 0,
    reportedRooms: 0,
  });
  
  // Data for Selects
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // Room Mapping
  const [classRoomMap, setClassRoomMap] = useState<Record<string, string>>({});
  const [roomClassMap, setRoomClassMap] = useState<Record<string, string[]>>({});
  const [roomSessionClassMap, setRoomSessionClassMap] = useState<Record<string, string[]>>({});
  
  // Changes tracking
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map()); // Key: "time|room", Value: proctorId
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set()); // Key: "time|room"
  
  // UI State
  const [expandedSlots, setExpandedSlots] = useState<string[]>([]);
  const [absentModalRow, setAbsentModalRow] = useState<ProctorReportRow | null>(null);

  const visiblePrograms = useMemo(
    () =>
      [...examPrograms]
        .filter((program) => Boolean(program?.isActive) && !isNonScheduledExamProgram(program))
        .sort(
          (a, b) =>
            Number(a.order || 0) - Number(b.order || 0) ||
            String(a.label || '').localeCompare(String(b.label || '')),
        ),
    [examPrograms],
  );

  const activeProgram = useMemo(
    () => visiblePrograms.find((program) => program.code === activeProgramCode) || null,
    [visiblePrograms, activeProgramCode],
  );

  const requestedProgramCode = useMemo(
    () => String(searchParams.get(programParamKey) || '').trim().toUpperCase(),
    [searchParams],
  );

  const fetchTeachers = useCallback(async () => {
    try {
      const response = await api.get('/users', {
        params: {
          role: 'TEACHER',
        },
      });
      const users = Array.isArray(response.data?.data) ? response.data.data : [];
      const teacherList: Teacher[] = (users as TeacherApiUser[])
        .filter((user) => Number(user?.id) > 0 && String(user?.name || '').trim().length > 0)
        .map((user) => ({
          id: Number(user.id),
          name: String(user.name || '').trim(),
          username: String(user.username || '').trim() || undefined,
        }))
        .sort((a: Teacher, b: Teacher) => String(a.name).localeCompare(String(b.name), 'id'));
      setTeachers(teacherList);
    } catch (error) {
      console.error('Error fetching teacher list for proctor options:', error);
      setTeachers([]);
      toast.error('Gagal memuat daftar guru untuk pengawas');
    }
  }, []);

  const fetchPrograms = useCallback(async () => {
    if (!selectedAcademicYear) {
      setExamPrograms([]);
      setActiveProgramCode('');
      return;
    }

    try {
      const response = await examService.getPrograms({
        academicYearId: Number(selectedAcademicYear),
        roleContext: 'all',
        includeInactive: false,
      });
      const programs = response?.data?.programs || [];
      const scheduledPrograms = programs.filter((program) => !isNonScheduledExamProgram(program));
      const resolvedRequestedCode = resolveProgramCodeFromParam(scheduledPrograms, requestedProgramCode);
      setExamPrograms(programs);
      setActiveProgramCode((prev) =>
        scheduledPrograms.some((program) => program.code === resolvedRequestedCode)
          ? resolvedRequestedCode
          : scheduledPrograms.some((program) => program.code === prev)
            ? prev
            : (scheduledPrograms[0]?.code || ''),
      );
    } catch (error) {
      console.error('Error fetching exam programs:', error);
      setExamPrograms([]);
      setActiveProgramCode('');
    }
  }, [selectedAcademicYear, requestedProgramCode]);

  useEffect(() => {
    if (selectedAcademicYear) {
      void fetchPrograms();
      void fetchTeachers();
      return;
    }
    setExamPrograms([]);
    setActiveProgramCode('');
  }, [selectedAcademicYear, fetchPrograms, fetchTeachers]);

  // --- Fetch Room Mappings (From ExamSitting) ---
  useEffect(() => {
    const fetchSittings = async () => {
      if (!selectedAcademicYear || !activeProgramCode) {
        setClassRoomMap({});
        setRoomClassMap({});
        setRoomSessionClassMap({});
        return;
      }
      try {
        const res = await api.get('/exam-sittings', {
          params: {
            academicYearId: selectedAcademicYear,
            examType: activeProgramCode,
            programCode: activeProgramCode,
            limit: 1000 // Get all
          }
        });
        
        const sittingsList = (res.data?.data || []) as SittingListItem[];
        const mapping: Record<string, string> = {};
        const roomClassAccumulator: Record<string, Set<string>> = {};
        const roomSessionAccumulator: Record<string, Set<string>> = {};
        
        // We need to fetch details for each sitting to get the students list
        // because the list endpoint might not return full student details
        await Promise.all(sittingsList.map(async (s) => {
            try {
                const detailRes = await api.get(`/exam-sittings/${s.id}`);
                const sitting = detailRes.data?.data as SittingDetail;
                
                if (sitting && sitting.students) {
                    const roomName = String(sitting.roomName || '').trim();
                    const roomSlotKey = buildRoomSlotLookupKey(
                      roomName,
                      sitting.startTime,
                      sitting.endTime,
                      sitting.sessionLabel,
                    );
                    const roomSessionKey = buildRoomSessionLookupKey(roomName, sitting.sessionLabel);
                    const sittingClasses = new Set<string>();
                    sitting.students.forEach((wrapper) => {
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
                            const key = buildClassSessionLookupKey(className, sitting.sessionLabel);
                            mapping[key] = String(sitting.roomName || '').trim();
                            sittingClasses.add(className);
                        }
                    });
                    if (roomName && sittingClasses.size > 0) {
                      if (!roomClassAccumulator[roomSlotKey]) {
                        roomClassAccumulator[roomSlotKey] = new Set<string>();
                      }
                      if (!roomSessionAccumulator[roomSessionKey]) {
                        roomSessionAccumulator[roomSessionKey] = new Set<string>();
                      }
                      sittingClasses.forEach((className) => roomClassAccumulator[roomSlotKey].add(className));
                      sittingClasses.forEach((className) => roomSessionAccumulator[roomSessionKey].add(className));
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch details for sitting ${s.id}`, e);
            }
        }));
        
        setClassRoomMap(mapping);
        setRoomClassMap(
          Object.fromEntries(
            Object.entries(roomClassAccumulator).map(([key, classes]) => [
              key,
              Array.from(classes).sort(compareClassName),
            ]),
          ),
        );
        setRoomSessionClassMap(
          Object.fromEntries(
            Object.entries(roomSessionAccumulator).map(([key, classes]) => [
              key,
              Array.from(classes).sort(compareClassName),
            ]),
          ),
        );
      } catch (err) {
        console.error('Error fetching sittings:', err);
        setClassRoomMap({});
        setRoomClassMap({});
        setRoomSessionClassMap({});
      }
    };

    fetchSittings();
  }, [selectedAcademicYear, activeProgramCode]);

  // --- Fetch Schedules ---
  const fetchSchedules = useCallback(async () => {
    if (!selectedAcademicYear || !activeProgramCode) {
      setSchedules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params: Record<string, string> = {
        examType: activeProgramCode,
        programCode: activeProgramCode,
        academicYearId: selectedAcademicYear
      };
      if (selectedDate) params.date = selectedDate;

      const res = await api.get('/exams/schedules', { params });
      setSchedules(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  }, [selectedAcademicYear, activeProgramCode, selectedDate]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const fetchProctorReports = useCallback(async () => {
    if (!selectedAcademicYear || !activeProgramCode) {
      setProctorReports([]);
      setProctorReportSummary({
        totalRooms: 0,
        totalExpected: 0,
        totalPresent: 0,
        totalAbsent: 0,
        reportedRooms: 0,
      });
      return;
    }

    setReportsLoading(true);
    try {
      const reportParams: Record<string, string | undefined> = {
        academicYearId: selectedAcademicYear,
        programCode: activeProgramCode,
      };
      if (reportMode === 'daily') {
        reportParams.date = selectedDate || undefined;
      } else {
        reportParams.includeInactive = 'true';
        reportParams.dateFrom = reportDateFrom || undefined;
        reportParams.dateTo = reportDateTo || undefined;
      }

      const response = await api.get('/proctoring/reports', {
        params: reportParams,
      });
      const payload = response.data?.data || {};
      const rows = Array.isArray(payload?.rows) ? (payload.rows as ProctorReportRow[]) : [];
      const summary = payload?.summary as ProctorReportSummary | undefined;
      setProctorReports(rows);
      setProctorReportSummary(
        summary || {
          totalRooms: rows.length,
          totalExpected: rows.reduce((sum, row) => sum + Number(row.expectedParticipants || 0), 0),
          totalPresent: rows.reduce((sum, row) => sum + Number(row.presentParticipants || 0), 0),
          totalAbsent: rows.reduce((sum, row) => sum + Number(row.absentParticipants || 0), 0),
          reportedRooms: rows.filter((row) => !!row.report).length,
        },
      );
    } catch (error) {
      console.error('Failed to fetch proctor reports:', error);
      setProctorReports([]);
      setProctorReportSummary({
        totalRooms: 0,
        totalExpected: 0,
        totalPresent: 0,
        totalAbsent: 0,
        reportedRooms: 0,
      });
      toast.error('Gagal memuat data berita acara pengawas');
    } finally {
      setReportsLoading(false);
    }
  }, [activeProgramCode, selectedAcademicYear, selectedDate, reportMode, reportDateFrom, reportDateTo]);

  useEffect(() => {
    void fetchProctorReports();
  }, [fetchProctorReports]);

  useEffect(() => {
    const currentParam = String(searchParams.get(programParamKey) || '').trim().toUpperCase();
    if (!activeProgramCode) return;
    if (currentParam === activeProgramCode) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(programParamKey, activeProgramCode);
    setSearchParams(nextParams, { replace: true });
  }, [activeProgramCode, searchParams, setSearchParams]);

  useEffect(() => {
    const currentParam = String(searchParams.get(dateParamKey) || '');
    if (selectedDate) {
      if (currentParam !== selectedDate) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set(dateParamKey, selectedDate);
        setSearchParams(nextParams, { replace: true });
      }
      return;
    }

    if (currentParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete(dateParamKey);
      setSearchParams(nextParams, { replace: true });
    }
  }, [selectedDate, searchParams, setSearchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (reportDateFrom) nextParams.set('mengawasReportFrom', reportDateFrom);
    else nextParams.delete('mengawasReportFrom');
    if (reportDateTo) nextParams.set('mengawasReportTo', reportDateTo);
    else nextParams.delete('mengawasReportTo');
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [reportDateFrom, reportDateTo, searchParams, setSearchParams]);

  // --- Grouping Logic ---
  const groupedData = useMemo(() => {
    // 1. Group by Time Slot
    const byTime: Record<string, ExamSchedule[]> = {};
    
    schedules.forEach(s => {
      const normalizedSession = normalizeSessionLabel(s.sessionLabel);
      const timeKey = `${s.startTime}|${s.endTime}|${normalizedSession || '__no_session__'}`;
      if (!byTime[timeKey]) byTime[timeKey] = [];
      byTime[timeKey].push(s);
    });

    // 2. Sort Time Slots
    const sortedTimes = Object.keys(byTime).sort((a, b) => {
      return a.localeCompare(b);
    });

    // 3. Group by Room within Time Slot
    return sortedTimes.map(timeKey => {
      const [start, end, rawSessionKey] = timeKey.split('|');
      const timeSchedules = byTime[timeKey];
      const sessionLabel =
        rawSessionKey && rawSessionKey !== '__no_session__'
          ? (timeSchedules[0]?.sessionLabel || null)
          : null;
      
      const byRoom: Record<string, ExamSchedule[]> = {};
      const unassigned: ExamSchedule[] = [];

      timeSchedules.forEach(s => {
        const mappedRoomName =
          classRoomMap[buildClassSessionLookupKey(s.class?.name, s.sessionLabel)] ||
          classRoomMap[buildClassSessionLookupKey(s.class?.name, null)];
        const scheduleRoomName = String(s.room || '').trim();
        // Gunakan room dari jadwal sebagai sumber utama agar tidak collapse antar-ruang.
        // Mapping dari sitting hanya dipakai sebagai fallback jika room jadwal kosong.
        const roomName = scheduleRoomName || mappedRoomName;
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
        sessionLabel,
        rooms: Object.entries(byRoom).sort((a, b) => a[0].localeCompare(b[0])), // Sort rooms alphabetically
        unassigned
      };
    });
  }, [schedules, classRoomMap]);

  const groupedDataWithSessionOrder = useMemo(() => {
    const sessionCounters = new Map<string, number>();
    return groupedData.map((group) => {
      const sessionKey = normalizeSessionLabel(group.sessionLabel) || '__no_session__';
      const next = (sessionCounters.get(sessionKey) || 0) + 1;
      sessionCounters.set(sessionKey, next);
      return {
        ...group,
        jamKeInSession: next,
      };
    });
  }, [groupedData]);

  const getTeacherOptionsForRoom = useCallback(
    (roomSchedules?: ExamSchedule[]): Teacher[] => {
      void roomSchedules;
      return teachers;
    },
    [teachers],
  );

  // --- Handlers ---

  const handleProctorChange = (timeKey: string, roomName: string, proctorId: number | null) => {
    if (proctorId === null) return;
    const key = `${timeKey}::${roomName}`;
    setPendingChanges(prev => new Map(prev).set(key, proctorId));
  };

  const startEditProctor = (timeKey: string, roomName: string) => {
    const key = `${timeKey}::${roomName}`;
    setEditingRows((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const cancelEditProctor = (timeKey: string, roomName: string) => {
    const key = `${timeKey}::${roomName}`;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setEditingRows((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
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
      setEditingRows((prev) => {
        const next = new Set(prev);
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

  const handleDeleteProctor = async (timeKey: string, roomName: string, scheduleIds: number[]) => {
    const key = `${timeKey}::${roomName}`;
    const confirmed = window.confirm(
      `Hapus pengawas dari ruang ${roomName} pada slot ini?`,
    );
    if (!confirmed) return;

    setSaving((prev) => new Set(prev).add(key));
    try {
      await Promise.all(
        scheduleIds.map((id) =>
          api.patch(`/exams/schedules/${id}`, {
            proctorId: null,
            room: roomName,
          }),
        ),
      );
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setEditingRows((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      toast.success(`Pengawas ruang ${roomName} berhasil dihapus`);
      fetchSchedules();
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus pengawas');
    } finally {
      setSaving((prev) => {
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
          Ruang ujian otomatis terdeteksi dari data "Kelola Ruang Ujian", dan daftar pengawas menampilkan semua guru.
        </p>
        
        <div className="flex flex-wrap items-center gap-4 mt-6">
          {/* Filters */}
          <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
            {visiblePrograms.map((program) => (
              <button
                key={program.code}
                onClick={() => setActiveProgramCode(program.code)}
                className={`
                  px-4 py-2 text-[13px] font-medium rounded-md transition-colors
                  ${activeProgramCode === program.code
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                `}
              >
                {program.shortLabel || program.label || program.code}
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
        ) : groupedDataWithSessionOrder.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              {activeProgram ? `Tidak ada jadwal ${activeProgram.label}` : 'Program ujian belum tersedia'}
            </h3>
            <p className="text-gray-500 mt-1">Silakan pilih tanggal lain atau buat jadwal ujian terlebih dahulu.</p>
          </div>
        ) : (
          groupedDataWithSessionOrder.map((group) => {
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
                      Jam Ke-{group.jamKeInSession}
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
                      <span className="text-xs text-gray-500 mt-1">
                        {group.sessionLabel ? `Sesi: ${group.sessionLabel}` : 'Tanpa sesi'}
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
                            const hasAssignedProctor = Boolean(schedules[0]?.proctorId);
                            const isEditing = editingRows.has(changeKey) || !hasAssignedProctor;
                            const roomTeacherOptions = getTeacherOptionsForRoom(schedules);
                            const hasCurrentProctorInOptions = !currentProctorId
                              ? true
                              : roomTeacherOptions.some((teacher) => teacher.id === currentProctorId);
                            const selectOptions =
                              hasCurrentProctorInOptions || !currentProctorId
                                ? roomTeacherOptions
                                : [
                                    ...roomTeacherOptions,
                                    ...teachers.filter((teacher) => teacher.id === currentProctorId),
                                  ];

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
                                    {(() => {
                                      const slotKey = buildRoomSlotLookupKey(
                                        roomName,
                                        group.start,
                                        group.end,
                                        group.sessionLabel,
                                      );
                                      const roomSessionKey = buildRoomSessionLookupKey(roomName, group.sessionLabel);
                                      const classesFromSittings =
                                        roomClassMap[slotKey] ||
                                        roomSessionClassMap[roomSessionKey] ||
                                        [];
                                      const defaultSubjectName =
                                        schedules[0]?.subject?.name ||
                                        schedules[0]?.packet?.subject?.name ||
                                        '-';
                                      const classSubjectMap = new Map<string, string>();
                                      schedules.forEach((scheduleItem) => {
                                        const className = String(scheduleItem.class?.name || '').trim();
                                        if (!className) return;
                                        const subjectName =
                                          scheduleItem.subject?.name ||
                                          scheduleItem.packet?.subject?.name ||
                                          defaultSubjectName;
                                        classSubjectMap.set(className, subjectName);
                                      });
                                      classesFromSittings.forEach((className) => {
                                        if (!classSubjectMap.has(className)) {
                                          classSubjectMap.set(className, defaultSubjectName);
                                        }
                                      });
                                      const orderedPairs = Array.from(classSubjectMap.entries()).sort(
                                        ([classNameA, subjectNameA], [classNameB, subjectNameB]) => {
                                          const subjectCompare = String(subjectNameA || '').localeCompare(
                                            String(subjectNameB || ''),
                                            'id',
                                            { numeric: true, sensitivity: 'base' },
                                          );
                                          if (subjectCompare !== 0) return subjectCompare;
                                          return compareClassName(classNameA, classNameB);
                                        },
                                      );
                                      return orderedPairs.map(([className, subjectName]) => (
                                        <div
                                          key={`${roomName}-${className}`}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100 text-xs"
                                        >
                                          <span className="truncate max-w-[150px]" title={subjectName}>
                                            {subjectName}
                                          </span>
                                          <span className="text-blue-300">|</span>
                                          <span className="font-bold">{className}</span>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <SearchableSelect
                                    value={currentProctorId}
                                    options={selectOptions}
                                    onChange={(val) => handleProctorChange(group.timeKey, roomName, val)}
                                    placeholder="Pilih Pengawas..."
                                    disabled={isSaving || !isEditing}
                                  />
                                </td>
                                <td className="px-6 py-4 align-top text-right">
                                  <div className="inline-flex items-center gap-2">
                                    {isEditing ? (
                                      <>
                                        <button
                                          onClick={() => handleSaveProctor(group.timeKey, roomName, schedules.map((s) => s.id))}
                                          disabled={isSaving || !hasChanges}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                                          title="Simpan Perubahan"
                                        >
                                          {isSaving ? (
                                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                          ) : (
                                            <Save size={14} />
                                          )}
                                          Simpan
                                        </button>
                                        {hasAssignedProctor && (
                                          <button
                                            onClick={() => cancelEditProctor(group.timeKey, roomName)}
                                            disabled={isSaving}
                                            className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                            title="Batal Edit"
                                          >
                                            <X size={14} />
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => startEditProctor(group.timeKey, roomName)}
                                          disabled={isSaving}
                                          className="inline-flex items-center justify-center p-2 border border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                          title="Edit Pengawas"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteProctor(group.timeKey, roomName, schedules.map((s) => s.id))}
                                          disabled={isSaving || !hasAssignedProctor}
                                          className="inline-flex items-center justify-center p-2 border border-red-300 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                                          title="Hapus Pengawas"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Berita Acara Pengawas</h2>
            <p className="text-sm text-gray-500">
              Laporan ruang ujian otomatis diterima dari pengawas untuk program {activeProgram?.shortLabel || activeProgram?.label || activeProgramCode || '-'} dan dicetak dari sisi Kurikulum.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setReportMode('daily')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  reportMode === 'daily' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Harian
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!reportDateFrom && selectedDate) setReportDateFrom(selectedDate);
                  if (!reportDateTo && selectedDate) setReportDateTo(selectedDate);
                  setReportMode('archive');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  reportMode === 'archive' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Archive size={12} />
                Arsip
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <FileText size={14} />
              <span>{proctorReportSummary.reportedRooms}/{proctorReportSummary.totalRooms} ruang sudah melapor</span>
            </div>
          </div>
        </div>

        {reportMode === 'archive' && (
          <div className="px-6 py-3 border-b border-gray-200 bg-amber-50/40">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={14} />
                <input
                  type="date"
                  value={reportDateFrom}
                  onChange={(event) => setReportDateFrom(event.target.value)}
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <span className="text-xs text-gray-500">s/d</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={14} />
                <input
                  type="date"
                  value={reportDateTo}
                  onChange={(event) => setReportDateTo(event.target.value)}
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <span className="text-xs text-amber-700">
                Mode arsip menampilkan riwayat termasuk jadwal nonaktif.
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Total Ruang</p>
            <p className="text-lg font-semibold text-gray-900">{proctorReportSummary.totalRooms}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Peserta Seharusnya</p>
            <p className="text-lg font-semibold text-gray-900">{proctorReportSummary.totalExpected}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700">Hadir</p>
            <p className="text-lg font-semibold text-emerald-800">{proctorReportSummary.totalPresent}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-rose-700">Tidak Hadir</p>
            <p className="text-lg font-semibold text-rose-800">{proctorReportSummary.totalAbsent}</p>
          </div>
        </div>

        {reportsLoading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Memuat berita acara...
          </div>
        ) : proctorReports.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Belum ada berita acara pada filter saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ruang</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Waktu & Sesi</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kelas di Ruangan</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Peserta</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pengawas</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Catatan</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {proctorReports.map((row, index) => (
                  <tr key={`${row.startTime}-${row.endTime}-${row.room || 'tanpa-ruang'}-${index}`}>
                    <td className="px-6 py-4 align-top">
                      <div className="font-medium text-gray-900">{row.room || 'Belum ditentukan'}</div>
                      <div className="text-xs text-gray-500 mt-1">{row.examType || '-'}</div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="font-medium text-gray-900">
                        {format(new Date(row.startTime), 'HH:mm')} - {format(new Date(row.endTime), 'HH:mm')} WIB
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{row.sessionLabel || 'Tanpa sesi'}</div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        {row.classNames.map((className) => (
                          <span
                            key={`${row.room || 'ruang'}-${className}`}
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 border border-blue-100"
                          >
                            <Users size={12} />
                            {className}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      <div>Seharusnya: <span className="font-semibold">{row.expectedParticipants}</span></div>
                      <div className="text-emerald-700">Hadir: <span className="font-semibold">{row.presentParticipants}</span></div>
                      {row.absentParticipants > 0 && Array.isArray(row.absentStudents) && row.absentStudents.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAbsentModalRow(row)}
                          className="text-rose-700 hover:text-rose-800 hover:underline focus:outline-none focus:ring-2 focus:ring-rose-400/50 rounded-sm"
                        >
                          Tidak hadir: <span className="font-semibold">{row.absentParticipants}</span>
                        </button>
                      ) : (
                        <div className="text-rose-700">
                          Tidak hadir: <span className="font-semibold">{row.absentParticipants}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      {row.report?.proctor?.name ? (
                        <>
                          <div className="font-medium text-gray-900">{row.report.proctor.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Dikirim {format(new Date(row.report.signedAt), 'dd/MM/yyyy HH:mm')}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">Belum ada laporan</span>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700 max-w-[320px]">
                      <div className="line-clamp-3">{row.report?.notes || '-'}</div>
                      {row.report?.incident ? (
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                          Kejadian khusus: {row.report.incident}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      {row.report ? (
                        <div className="flex min-w-[220px] flex-col gap-2">
                          <div className="text-xs text-gray-500">
                            {row.report.documentNumber || 'Nomor dokumen akan dibuat saat preview dibuka.'}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => window.open(`/print/proctor-report/${row.report?.id}`, '_blank', 'noopener')}
                              className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <FileText size={13} className="mr-1.5" />
                              Lihat Dokumen
                            </button>
                            <button
                              type="button"
                              onClick={() => window.open(`/print/proctor-report/${row.report?.id}?autoprint=1`, '_blank', 'noopener')}
                              className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <FileText size={13} className="mr-1.5" />
                              Print
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Belum ada dokumen</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {absentModalRow &&
        createPortal(
          <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setAbsentModalRow(null)}
          >
            <div
              className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-gray-200"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Daftar Siswa Tidak Hadir</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {absentModalRow.room || 'Belum ditentukan'} • {format(new Date(absentModalRow.startTime), 'HH:mm')} -{' '}
                    {format(new Date(absentModalRow.endTime), 'HH:mm')} WIB
                    {absentModalRow.sessionLabel ? ` • ${absentModalRow.sessionLabel}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbsentModalRow(null)}
                  className="inline-flex items-center justify-center rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                  aria-label="Tutup popup siswa tidak hadir"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[calc(85vh-78px)]">
                {!Array.isArray(absentModalRow.absentStudents) || absentModalRow.absentStudents.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                    Tidak ada data siswa tidak hadir.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 w-14">No</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Nama Siswa</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 w-40">Kelas</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Keterangan Tidak Hadir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {absentModalRow.absentStudents.map((student, index) => (
                          <tr key={`absent-student-${student.id}-${index}`} className="align-top">
                            <td className="px-3 py-2 text-sm text-gray-700">{index + 1}</td>
                            <td className="px-3 py-2">
                              <div className="text-sm font-medium text-gray-900">{student.name}</div>
                              {student.nis ? <div className="text-xs text-gray-500">NIS: {student.nis}</div> : null}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700">{student.className || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{student.absentReason || 'Tanpa keterangan.'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ExamProctorManagementPage;
