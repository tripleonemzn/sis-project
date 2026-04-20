import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
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
import { id } from 'date-fns/locale';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { examService, type ExamProgram } from '../../../services/exam.service';
import { isNonScheduledExamProgram, resolveProgramCodeFromParam } from '../../../lib/examProgramMenu';
import ExamProgramFilterBar from '../../../components/teacher/exams/ExamProgramFilterBar';
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
interface ExamSittingRoomSlot {
  key: string;
  timeKey: string;
  roomKey: string;
  sittingId: number;
  roomName: string;
  academicYearId: number;
  examType: string;
  semester?: 'ODD' | 'EVEN' | null;
  startTime: string;
  endTime: string;
  periodNumber?: number | null;
  sessionId?: number | null;
  sessionLabel?: string | null;
  subjectId?: number | null;
  subjectName: string;
  subjectCode?: string | null;
  packetTitle?: string | null;
  scheduleIds: number[];
  classIds: number[];
  classNames: string[];
  participantCount: number;
  proctorId: number | null;
  proctor?: {
    id: number;
    name: string;
  } | null;
  layout?: {
    id: number;
    rows: number;
    columns: number;
    generatedAt?: string | null;
    updatedAt?: string | null;
  } | null;
}

interface UnassignedExamSchedule {
  id: number;
  academicYearId: number;
  examType: string;
  semester?: 'ODD' | 'EVEN' | null;
  startTime: string;
  endTime: string;
  periodNumber?: number | null;
  sessionId?: number | null;
  sessionLabel?: string | null;
  subjectId?: number | null;
  subjectName: string;
  subjectCode?: string | null;
  packetTitle?: string | null;
  classId?: number | null;
  className?: string | null;
}

interface ProctorReportRow {
  room: string | null;
  startTime: string;
  endTime: string;
  periodNumber?: number | null;
  sessionLabel?: string | null;
  examType?: string | null;
  subjectName?: string | null;
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
    auditTrail?: {
      warningCount: number;
      warnedStudents: number;
      terminatedStudents: number;
      latestActionAt?: string | null;
    } | null;
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

type GroupedProctorSlot = {
  slotKey: string;
  timeKey: string;
  dateKey: string;
  dateLabel: string;
  start: string;
  end: string;
  periodNumber: number | null;
  sessionLabel: string | null;
  subjectName: string;
  subjectCode: string | null;
  rooms: Array<[string, ExamSittingRoomSlot[]]>;
  unassigned: UnassignedExamSchedule[];
};

type GroupedProctorDay = {
  dateKey: string;
  dateLabel: string;
  slotCount: number;
  roomCount: number;
  slots: GroupedProctorSlot[];
};

type GroupedProctorReportTimeGroup = {
  timeKey: string;
  startTime: string;
  endTime: string;
  periodNumber: number | null;
  sessionLabel: string | null;
  rows: ProctorReportRow[];
};

type GroupedProctorReportDay = {
  dateKey: string;
  dateLabel: string;
  roomCount: number;
  rowCount: number;
  reportedRowCount: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  timeGroups: GroupedProctorReportTimeGroup[];
};

const normalizeSessionLabel = (raw: unknown): string =>
  String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const compareClassName = (a: string, b: string): number =>
  String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });

const compareRoomName = (a?: string | null, b?: string | null): number =>
  String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });

const mergeProctorReportNotes = (notes?: string | null, incident?: string | null) =>
  [String(notes || '').trim(), String(incident || '').trim()].filter(Boolean).join(' ');

const parseSafeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatSafeTime = (value?: string | null) => {
  const date = parseSafeDate(value);
  return date ? format(date, 'HH:mm') : '-';
};

const formatSafeDateTime = (value?: string | null) => {
  const date = parseSafeDate(value);
  return date ? format(date, 'dd/MM/yyyy HH:mm') : '-';
};

const formatSafeDayDateLabel = (value?: string | null) => {
  const date = parseSafeDate(value);
  return date ? format(date, 'EEEE, d MMMM yyyy', { locale: id }) : 'Tanggal belum diatur';
};

const formatAuditTrailLabel = (value?: string | null) => {
  const date = parseSafeDate(value);
  return date ? format(date, 'dd/MM/yyyy HH:mm') : '-';
};

const getSafeDateKey = (value?: string | null) => {
  const date = parseSafeDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '__no_date__';
};

const formatTimeRangeLabel = (start?: string | null, end?: string | null) => {
  const startLabel = formatSafeTime(start);
  const endLabel = formatSafeTime(end);
  if (startLabel === '-' && endLabel === '-') return 'Waktu belum diatur';
  if (startLabel === '-') return `${endLabel} WIB`;
  if (endLabel === '-') return `${startLabel} WIB`;
  return `${startLabel} - ${endLabel} WIB`;
};

const sanitizeDateInputValue = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : raw;
};

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
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [roomSlots, setRoomSlots] = useState<ExamSittingRoomSlot[]>([]);
  const [unassignedSchedules, setUnassignedSchedules] = useState<UnassignedExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  
  // Filters
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN'>(
    activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD',
  );
  const [reportMode, setReportMode] = useState<'daily' | 'archive'>('daily');
  const [reportDateFrom, setReportDateFrom] = useState<string>(() => sanitizeDateInputValue(searchParams.get('mengawasReportFrom')));
  const [reportDateTo, setReportDateTo] = useState<string>(() => sanitizeDateInputValue(searchParams.get('mengawasReportTo')));
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
  
  // Changes tracking
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map()); // Key: "time|room", Value: proctorId
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set()); // Key: "time|room"
  
  // UI State
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [expandedSlots, setExpandedSlots] = useState<string[]>([]);
  const [isReportExpanded, setIsReportExpanded] = useState(false);
  const [expandedReportDayKey, setExpandedReportDayKey] = useState<string | null>(null);
  const [expandedReportTimeGroupKey, setExpandedReportTimeGroupKey] = useState<string | null>(null);
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
  const effectiveSemester = activeProgram?.fixedSemester || selectedSemester || (activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD');

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

  useEffect(() => {
    if (activeProgram?.fixedSemester) {
      setSelectedSemester(activeProgram.fixedSemester);
      return;
    }
    if (activeAcademicYear?.semester === 'ODD' || activeAcademicYear?.semester === 'EVEN') {
      setSelectedSemester(activeAcademicYear.semester);
    }
  }, [activeAcademicYear?.semester, activeProgram?.fixedSemester]);

  const fetchRoomSlots = useCallback(async () => {
    if (!selectedAcademicYear || !activeProgramCode) {
      setRoomSlots([]);
      setUnassignedSchedules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params: Record<string, string> = {
        academicYearId: selectedAcademicYear,
        examType: activeProgramCode,
        programCode: activeProgramCode,
        semester: effectiveSemester,
      };
      const res = await api.get('/exam-sittings/room-slots', { params });
      const payload = res.data?.data || {};
      setRoomSlots(Array.isArray(payload?.slots) ? payload.slots : []);
      setUnassignedSchedules(Array.isArray(payload?.unassignedSchedules) ? payload.unassignedSchedules : []);
    } catch (err) {
      console.error(err);
      setRoomSlots([]);
      setUnassignedSchedules([]);
      toast.error('Gagal memuat integrasi ruang ujian');
    } finally {
      setLoading(false);
    }
  }, [selectedAcademicYear, activeProgramCode, effectiveSemester]);

  useEffect(() => {
    void fetchRoomSlots();
  }, [fetchRoomSlots]);

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
        semester: effectiveSemester,
      };
      if (reportMode === 'archive') {
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
  }, [activeProgramCode, selectedAcademicYear, reportMode, reportDateFrom, reportDateTo, effectiveSemester]);

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
  const groupedDayData = useMemo<GroupedProctorDay[]>(() => {
    const slotMap = new Map<
      string,
      {
        slotKey: string;
        timeKey: string;
        dateKey: string;
        dateLabel: string;
        start: string;
        end: string;
        periodNumber: number | null;
        sessionLabel: string | null;
        subjectName: string;
        subjectCode: string | null;
        roomsMap: Map<string, ExamSittingRoomSlot[]>;
        unassigned: UnassignedExamSchedule[];
      }
    >();

    const ensureSlotGroup = (params: {
      slotKey: string;
      timeKey: string;
      dateKey: string;
      dateLabel: string;
      start: string;
      end: string;
      periodNumber: number | null;
      sessionLabel: string | null;
      subjectName: string;
      subjectCode: string | null;
    }) => {
      if (!slotMap.has(params.slotKey)) {
        slotMap.set(params.slotKey, {
          ...params,
          roomsMap: new Map<string, ExamSittingRoomSlot[]>(),
          unassigned: [],
        });
      }
      return slotMap.get(params.slotKey)!;
    };

    roomSlots.forEach((slot) => {
      const periodNumber = Number(slot.periodNumber || 0) || null;
      const dateKey = getSafeDateKey(slot.startTime || slot.endTime);
      const dateLabel = formatSafeDayDateLabel(slot.startTime || slot.endTime);
      const sessionScope =
        Number(slot.sessionId || 0) > 0
          ? `sid:${Number(slot.sessionId)}`
          : normalizeSessionLabel(slot.sessionLabel) || '__no_session__';
      const subjectScope =
        Number(slot.subjectId || 0) > 0
          ? `sub:${Number(slot.subjectId)}`
          : `subn:${String(slot.subjectName || '').trim().toLowerCase() || '-'}`;
      const slotKey = [
        dateKey,
        `period:${periodNumber || 0}`,
        `start:${slot.startTime || ''}`,
        `end:${slot.endTime || ''}`,
        sessionScope,
        subjectScope,
      ].join('|');
      const timeKey =
        slot.timeKey ||
        `${slot.startTime}|${slot.endTime}|${periodNumber || 0}|${normalizeSessionLabel(slot.sessionLabel) || '__no_session__'}`;
      const target = ensureSlotGroup({
        slotKey,
        timeKey,
        dateKey,
        dateLabel,
        start: slot.startTime,
        end: slot.endTime,
        periodNumber,
        sessionLabel: slot.sessionLabel || null,
        subjectName: String(slot.subjectName || '').trim() || 'Mata Pelajaran',
        subjectCode: String(slot.subjectCode || '').trim() || null,
      });

      const roomName = String(slot.roomName || '').trim();
      if (!roomName) return;
      const bucket = target.roomsMap.get(roomName) || [];
      bucket.push(slot);
      target.roomsMap.set(roomName, bucket);
    });

    unassignedSchedules.forEach((schedule) => {
      const periodNumber = Number(schedule.periodNumber || 0) || null;
      const dateKey = getSafeDateKey(schedule.startTime || schedule.endTime);
      const dateLabel = formatSafeDayDateLabel(schedule.startTime || schedule.endTime);
      const sessionScope =
        Number(schedule.sessionId || 0) > 0
          ? `sid:${Number(schedule.sessionId)}`
          : normalizeSessionLabel(schedule.sessionLabel) || '__no_session__';
      const subjectScope =
        Number(schedule.subjectId || 0) > 0
          ? `sub:${Number(schedule.subjectId)}`
          : `subn:${String(schedule.subjectName || '').trim().toLowerCase() || '-'}`;
      const slotKey = [
        dateKey,
        `period:${periodNumber || 0}`,
        `start:${schedule.startTime || ''}`,
        `end:${schedule.endTime || ''}`,
        sessionScope,
        subjectScope,
      ].join('|');
      const target = ensureSlotGroup({
        slotKey,
        timeKey: `${schedule.startTime}|${schedule.endTime}|${periodNumber || 0}|${normalizeSessionLabel(schedule.sessionLabel) || '__no_session__'}`,
        dateKey,
        dateLabel,
        start: schedule.startTime,
        end: schedule.endTime,
        periodNumber,
        sessionLabel: schedule.sessionLabel || null,
        subjectName: String(schedule.subjectName || '').trim() || 'Mata Pelajaran',
        subjectCode: String(schedule.subjectCode || '').trim() || null,
      });
      target.unassigned.push(schedule);
    });

    const groupedSlots = Array.from(slotMap.values())
      .map((group): GroupedProctorSlot => ({
        slotKey: group.slotKey,
        timeKey: group.timeKey,
        dateKey: group.dateKey,
        dateLabel: group.dateLabel,
        start: group.start,
        end: group.end,
        periodNumber: group.periodNumber,
        sessionLabel: group.sessionLabel,
        subjectName: group.subjectName,
        subjectCode: group.subjectCode,
        rooms: Array.from(group.roomsMap.entries()).sort((a, b) =>
          String(a[0] || '').localeCompare(String(b[0] || ''), 'id', {
            numeric: true,
            sensitivity: 'base',
          }),
        ),
        unassigned: group.unassigned.sort((left, right) =>
          compareClassName(String(left.className || ''), String(right.className || '')),
        ),
      }))
      .sort((a, b) => {
        const startCompare =
          (parseSafeDate(a.start)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (parseSafeDate(b.start)?.getTime() ?? Number.MAX_SAFE_INTEGER);
        if (startCompare !== 0) return startCompare;
        const periodCompare = Number(a.periodNumber || Number.MAX_SAFE_INTEGER) - Number(b.periodNumber || Number.MAX_SAFE_INTEGER);
        if (periodCompare !== 0) return periodCompare;
        const subjectCompare = String(a.subjectName || '').localeCompare(String(b.subjectName || ''), 'id', {
          numeric: true,
          sensitivity: 'base',
        });
        if (subjectCompare !== 0) return subjectCompare;
        return String(a.subjectCode || '').localeCompare(String(b.subjectCode || ''), 'id', {
          numeric: true,
          sensitivity: 'base',
        });
      });

    const dayMap = new Map<string, { dateKey: string; dateLabel: string; slots: GroupedProctorSlot[] }>();
    groupedSlots.forEach((slot) => {
      const dayKey = slot.dateKey || '__no_date__';
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          dateKey: dayKey,
          dateLabel: slot.dateLabel,
          slots: [],
        });
      }
      dayMap.get(dayKey)!.slots.push(slot);
    });

    return Array.from(dayMap.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((day) => ({
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        slotCount: day.slots.length,
        roomCount: new Set(day.slots.flatMap((slot) => slot.rooms.map(([roomName]) => roomName))).size,
        slots: day.slots,
      }));
  }, [roomSlots, unassignedSchedules]);

  const getTeacherOptionsForRoom = useCallback(
    (roomSchedules?: ExamSittingRoomSlot[]): Teacher[] => {
      void roomSchedules;
      return teachers;
    },
    [teachers],
  );

  useEffect(() => {
    const validDayKeys = new Set(groupedDayData.map((day) => day.dateKey));
    setExpandedDays((prev) => prev.filter((key) => validDayKeys.has(key)));

    const validSlotKeys = new Set(groupedDayData.flatMap((day) => day.slots.map((slot) => slot.slotKey)));
    setExpandedSlots((prev) => prev.filter((key) => validSlotKeys.has(key)));
  }, [groupedDayData]);

  const groupedReportDays = useMemo<GroupedProctorReportDay[]>(() => {
    const dayMap = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        timeGroups: Map<
          string,
          {
            timeKey: string;
            startTime: string;
            endTime: string;
            periodNumber: number | null;
            sessionLabel: string | null;
            rows: ProctorReportRow[];
          }
        >;
      }
    >();

    proctorReports.forEach((row) => {
      const dateKey = getSafeDateKey(row.startTime || row.endTime);
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          dateKey,
          dateLabel: formatSafeDayDateLabel(row.startTime || row.endTime),
          timeGroups: new Map(),
        });
      }
      const dayGroup = dayMap.get(dateKey)!;
      const periodNumber =
        Number.isFinite(Number(row.periodNumber)) && Number(row.periodNumber) > 0
          ? Number(row.periodNumber)
          : null;
      const timeKey = [
        row.startTime || '',
        row.endTime || '',
        periodNumber || 0,
        normalizeSessionLabel(row.sessionLabel) || '__no_session__',
      ].join('|');
      if (!dayGroup.timeGroups.has(timeKey)) {
        dayGroup.timeGroups.set(timeKey, {
          timeKey,
          startTime: row.startTime,
          endTime: row.endTime,
          periodNumber,
          sessionLabel: row.sessionLabel || null,
          rows: [],
        });
      }
      dayGroup.timeGroups.get(timeKey)!.rows.push(row);
    });

    return Array.from(dayMap.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((day) => ({
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        timeGroups: Array.from(day.timeGroups.values())
          .map((timeGroup) => ({
            ...timeGroup,
            rows: timeGroup.rows.slice().sort((left, right) => {
              const roomCompare = compareRoomName(left.room, right.room);
              if (roomCompare !== 0) return roomCompare;
              return String(left.subjectName || '').localeCompare(String(right.subjectName || ''), 'id', {
                numeric: true,
                sensitivity: 'base',
              });
            }),
          }))
          .sort((left, right) => {
            const startCompare =
              (parseSafeDate(left.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
              (parseSafeDate(right.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER);
            if (startCompare !== 0) return startCompare;
            const periodCompare =
              Number(left.periodNumber || Number.MAX_SAFE_INTEGER) - Number(right.periodNumber || Number.MAX_SAFE_INTEGER);
            if (periodCompare !== 0) return periodCompare;
            return String(left.sessionLabel || '').localeCompare(String(right.sessionLabel || ''), 'id', {
              numeric: true,
              sensitivity: 'base',
            });
          }),
        rowCount: Array.from(day.timeGroups.values()).reduce((total, group) => total + group.rows.length, 0),
        reportedRowCount: Array.from(day.timeGroups.values()).reduce(
          (total, group) => total + group.rows.filter((row) => Boolean(row.report)).length,
          0,
        ),
        totalExpected: Array.from(day.timeGroups.values()).reduce(
          (total, group) => total + group.rows.reduce((sum, row) => sum + Number(row.expectedParticipants || 0), 0),
          0,
        ),
        totalPresent: Array.from(day.timeGroups.values()).reduce(
          (total, group) => total + group.rows.reduce((sum, row) => sum + Number(row.presentParticipants || 0), 0),
          0,
        ),
        totalAbsent: Array.from(day.timeGroups.values()).reduce(
          (total, group) => total + group.rows.reduce((sum, row) => sum + Number(row.absentParticipants || 0), 0),
          0,
        ),
        roomCount: new Set(
          Array.from(day.timeGroups.values()).flatMap((group) =>
            group.rows.map((row) => String(row.room || '').trim()).filter(Boolean),
          ),
        ).size,
      }));
  }, [proctorReports]);

  useEffect(() => {
    if (!isReportExpanded || groupedReportDays.length === 0) {
      setExpandedReportDayKey(null);
      setExpandedReportTimeGroupKey(null);
      return;
    }
    const validDayKeys = new Set(groupedReportDays.map((day) => day.dateKey));
    setExpandedReportDayKey((previous) => (previous && validDayKeys.has(previous) ? previous : null));
    setExpandedReportTimeGroupKey((previous) => {
      if (!previous) return null;
      const exists = groupedReportDays.some((day) =>
        day.timeGroups.some((timeGroup) => `${day.dateKey}::${timeGroup.timeKey}` === previous),
      );
      return exists ? previous : null;
    });
  }, [groupedReportDays, isReportExpanded]);

  // --- Handlers ---

  const handleProctorChange = (slotKey: string, roomName: string, proctorId: number | null) => {
    if (proctorId === null) return;
    const key = `${slotKey}::${roomName}`;
    setPendingChanges(prev => new Map(prev).set(key, proctorId));
  };

  const startEditProctor = (slotKey: string, roomName: string) => {
    const key = `${slotKey}::${roomName}`;
    setEditingRows((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const cancelEditProctor = (slotKey: string, roomName: string) => {
    const key = `${slotKey}::${roomName}`;
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

  const toggleDay = (dateKey: string) => {
    setExpandedDays(prev =>
      prev.includes(dateKey)
        ? prev.filter((key) => key !== dateKey)
        : [...prev, dateKey]
    );
  };

  const toggleSlot = (slotKey: string) => {
    setExpandedSlots(prev => 
      prev.includes(slotKey) 
        ? prev.filter(key => key !== slotKey)
        : [...prev, slotKey]
    );
  };

  const handleSaveProctor = async (slotKey: string, roomName: string, slotItems: ExamSittingRoomSlot[]) => {
    const key = `${slotKey}::${roomName}`;
    const proctorId = pendingChanges.get(key);
    
    if (!proctorId) return;

    setSaving(prev => new Set(prev).add(key));
    try {
      await Promise.all(
        slotItems.map((item) =>
          api.patch('/exam-sittings/room-slots/proctor', {
            sittingId: item.sittingId,
            academicYearId: item.academicYearId,
            examType: item.examType,
            semester: item.semester,
            roomName: item.roomName,
            startTime: item.startTime,
            endTime: item.endTime,
            periodNumber: item.periodNumber,
            sessionId: item.sessionId,
            sessionLabel: item.sessionLabel,
            subjectId: item.subjectId,
            subjectName: item.subjectName,
            proctorId,
          }),
        ),
      );
      
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
      await fetchRoomSlots();
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

  const handleDeleteProctor = async (slotKey: string, roomName: string, slotItems: ExamSittingRoomSlot[]) => {
    const key = `${slotKey}::${roomName}`;
    const confirmed = window.confirm(
      `Hapus pengawas dari ruang ${roomName} pada slot ini?`,
    );
    if (!confirmed) return;

    setSaving((prev) => new Set(prev).add(key));
    try {
      await Promise.all(
        slotItems.map((item) =>
          api.patch('/exam-sittings/room-slots/proctor', {
            sittingId: item.sittingId,
            academicYearId: item.academicYearId,
            examType: item.examType,
            semester: item.semester,
            roomName: item.roomName,
            startTime: item.startTime,
            endTime: item.endTime,
            periodNumber: item.periodNumber,
            sessionId: item.sessionId,
            sessionLabel: item.sessionLabel,
            subjectId: item.subjectId,
            subjectName: item.subjectName,
            proctorId: null,
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
      await fetchRoomSlots();
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

  const openDocumentPreview = useCallback((path: string) => {
    const previewWindow = window.open(path, '_blank');
    if (!previewWindow) {
      toast.error('Browser memblokir pembukaan dokumen. Izinkan tab baru lalu coba lagi.');
      return;
    }
    previewWindow.focus();
  }, []);

  return (
    <div className="space-y-6 w-full pb-20">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Jadwal Mengawas</h1>
        <p className="text-gray-500">
          Atur pengawas berdasarkan <span className="font-semibold text-gray-700">Ruang Ujian</span>. 
          Ruang ujian otomatis terdeteksi dari data "Kelola Ruang Ujian", dan daftar pengawas menampilkan semua guru.
        </p>
        
        <div className="mt-6">
          <ExamProgramFilterBar
            programs={visiblePrograms}
            activeProgramCode={activeProgramCode}
            onProgramChange={setActiveProgramCode}
            showSemester={Boolean(activeProgramCode)}
            semesterValue={effectiveSemester}
            onSemesterChange={(value) => setSelectedSemester(value)}
            semesterDisabled={Boolean(activeProgram?.fixedSemester)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Memuat jadwal...</p>
          </div>
        ) : groupedDayData.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              {activeProgram ? `Tidak ada jadwal ${activeProgram.label}` : 'Program ujian belum tersedia'}
            </h3>
            <p className="text-gray-500 mt-1">Pastikan jadwal ujian dan ruang ujian sudah tersusun untuk program ini.</p>
          </div>
        ) : (
          groupedDayData.map((dayGroup) => {
            const isDayExpanded = expandedDays.includes(dayGroup.dateKey);

            return (
              <div key={dayGroup.dateKey} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  onClick={() => toggleDay(dayGroup.dateKey)}
                  className="bg-white px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900">{dayGroup.dateLabel}</div>
                      <div className="text-sm text-gray-500">
                        {dayGroup.slotCount} slot jadwal • {dayGroup.roomCount} ruang aktif
                      </div>
                    </div>
                  </div>
                  <button
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isDayExpanded
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {isDayExpanded ? (
                      <>
                        <span>Tutup Hari</span>
                        <ChevronDown size={18} />
                      </>
                    ) : (
                      <>
                        <span>Buka Hari</span>
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </div>

                {isDayExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50/50 p-4 space-y-3">
                    {dayGroup.slots.map((group) => {
                      const isExpanded = expandedSlots.includes(group.slotKey);

                      return (
                        <div key={group.slotKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div
                            onClick={() => toggleSlot(group.slotKey)}
                            className="bg-white px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold text-sm whitespace-nowrap">
                                {group.periodNumber ? `Jam Ke-${group.periodNumber}` : 'Slot Jadwal'}
                              </div>
                              <div className="flex flex-col">
                                <div className="text-lg font-bold text-gray-900">
                                  {group.subjectName}
                                  {group.subjectCode ? ` (${group.subjectCode})` : ''}
                                </div>
                                <span className="text-sm text-gray-500 mt-0.5">
                                  {formatTimeRangeLabel(group.start, group.end)} • {group.rooms.length} ruang aktif
                                </span>
                                <span className="text-xs text-gray-500 mt-1">
                                  {group.sessionLabel ? `Sesi: ${group.sessionLabel}` : 'Tanpa sesi'}
                                  {group.unassigned.length > 0 ? ` • ${group.unassigned.length} kelas belum ada ruang` : ''}
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
                                    {group.rooms.map(([roomName, slots]) => {
                                      const changeKey = `${group.slotKey}::${roomName}`;
                                      const hasEditableSchedules = slots.length > 0;
                                      const currentProctorId =
                                        pendingChanges.get(changeKey) ??
                                        slots.find((slot) => Number.isFinite(Number(slot.proctorId)) && Number(slot.proctorId) > 0)?.proctorId ??
                                        slots[0]?.proctorId;
                                      const isSaving = saving.has(changeKey);
                                      const hasChanges = pendingChanges.has(changeKey);
                                      const hasAssignedProctor = Boolean(slots.some((slot) => Number(slot.proctorId)));
                                      const isEditing = editingRows.has(changeKey) || !hasAssignedProctor;
                                      const roomTeacherOptions = getTeacherOptionsForRoom(slots);
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
                                        <tr key={`${group.slotKey}-${roomName}`} className="hover:bg-gray-50/50 transition-colors">
                                          <td className="px-6 py-4 align-top">
                                            <div className="flex items-center gap-2">
                                              <MapPin size={16} className="text-gray-400" />
                                              <span className="font-medium text-gray-900">{roomName}</span>
                                            </div>
                                          </td>
                                          <td className="px-6 py-4 align-top">
                                            <div className="flex flex-wrap gap-2">
                                              {(() => {
                                                const classSubjectMap = new Map<string, string>();
                                                slots.forEach((slotItem) => {
                                                  const subjectName = String(slotItem.subjectName || '').trim() || '-';
                                                  (slotItem.classNames || []).forEach((className) => {
                                                    if (!classSubjectMap.has(className)) {
                                                      classSubjectMap.set(className, subjectName);
                                                    }
                                                  });
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
                                              onChange={(val) => handleProctorChange(group.slotKey, roomName, val)}
                                              placeholder="Pilih Pengawas..."
                                              disabled={isSaving || !isEditing || !hasEditableSchedules}
                                            />
                                            {!hasEditableSchedules ? (
                                              <div className="mt-2 text-[11px] text-amber-700">
                                                Ruang ini belum sinkron ke jadwal ujian, jadi pengawas belum bisa disimpan dari tabel ini.
                                              </div>
                                            ) : null}
                                          </td>
                                          <td className="px-6 py-4 align-top text-right">
                                            <div className="inline-flex items-center gap-2">
                                              {isEditing ? (
                                                <>
                                                  <button
                                                    onClick={() => handleSaveProctor(group.slotKey, roomName, slots)}
                                                    disabled={isSaving || !hasChanges || !hasEditableSchedules}
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
                                                      onClick={() => cancelEditProctor(group.slotKey, roomName)}
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
                                                    onClick={() => startEditProctor(group.slotKey, roomName)}
                                                    disabled={isSaving || !hasEditableSchedules}
                                                    className="inline-flex items-center justify-center p-2 border border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                                    title="Edit Pengawas"
                                                  >
                                                    <Pencil size={14} />
                                                  </button>
                                                  <button
                                                    onClick={() => handleDeleteProctor(group.slotKey, roomName, slots)}
                                                    disabled={isSaving || !hasAssignedProctor || !hasEditableSchedules}
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
                                            {group.unassigned.map((schedule) => (
                                              <div key={schedule.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white text-red-700 border border-red-200 text-xs shadow-sm">
                                                <span className="font-bold">{schedule.className || '-'}</span>
                                                <span className="text-red-300">|</span>
                                                <span>{schedule.subjectName || '-'}</span>
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
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div
          onClick={() => setIsReportExpanded((current) => !current)}
          className="px-6 py-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        >
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
                onClick={(event) => {
                  event.stopPropagation();
                  setReportMode('daily');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  reportMode === 'daily' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Harian
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
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
            <button
              type="button"
              className={`ml-1 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isReportExpanded
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                setIsReportExpanded((current) => !current);
              }}
            >
              {isReportExpanded ? (
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
        </div>

        {reportMode === 'archive' && isReportExpanded && (
          <div className="px-6 py-3 border-b border-gray-200 bg-amber-50/40">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={14} />
                <input
                  type="date"
                  value={reportDateFrom}
                  onChange={(event) => setReportDateFrom(sanitizeDateInputValue(event.target.value))}
                  onClick={(event) => event.stopPropagation()}
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <span className="text-xs text-gray-500">s/d</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={14} />
                <input
                  type="date"
                  value={reportDateTo}
                  onChange={(event) => setReportDateTo(sanitizeDateInputValue(event.target.value))}
                  onClick={(event) => event.stopPropagation()}
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <span className="text-xs text-amber-700">
                Mode arsip menampilkan riwayat termasuk jadwal nonaktif.
              </span>
            </div>
          </div>
        )}

        {isReportExpanded ? (
          <>
        {reportMode === 'archive' ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Laporan Ruang</p>
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
        ) : null}

        {reportsLoading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Memuat berita acara...
          </div>
        ) : groupedReportDays.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Belum ada berita acara pada filter saat ini.
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            {groupedReportDays.map((day) => (
              <div key={day.dateKey} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedReportDayKey((previous) => (previous === day.dateKey ? null : day.dateKey))}
                  className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 text-left"
                >
                    <div className="flex-1 min-w-[260px]">
                      <div className="text-base font-semibold text-gray-900">{day.dateLabel}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {day.timeGroups.length} kelompok jam • {day.roomCount} ruang aktif • {day.reportedRowCount}/{day.rowCount} laporan masuk
                      </div>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Laporan Ruang</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">{day.rowCount}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Peserta</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">{day.totalExpected}</div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Hadir</div>
                          <div className="mt-1 text-lg font-semibold text-emerald-800">{day.totalPresent}</div>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Tidak Hadir</div>
                          <div className="mt-1 text-lg font-semibold text-rose-800">{day.totalAbsent}</div>
                        </div>
                      </div>
                    </div>
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-blue-700">
                    {expandedReportDayKey === day.dateKey ? 'Tutup Hari' : 'Buka Hari'}
                    {expandedReportDayKey === day.dateKey ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </button>
                {expandedReportDayKey === day.dateKey ? (
                <div className="space-y-4 px-4 py-4">
                  {day.timeGroups.map((timeGroup) => (
                    <div key={`${day.dateKey}-${timeGroup.timeKey}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReportTimeGroupKey((previous) =>
                            previous === `${day.dateKey}::${timeGroup.timeKey}` ? null : `${day.dateKey}::${timeGroup.timeKey}`,
                          )
                        }
                        className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-slate-50 px-5 py-3 text-left"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {formatSafeTime(timeGroup.startTime)} - {formatSafeTime(timeGroup.endTime)} WIB
                            {timeGroup.periodNumber ? ` • Jam Ke-${timeGroup.periodNumber}` : ''}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {timeGroup.sessionLabel ? `Sesi ${timeGroup.sessionLabel}` : 'Tanpa sesi'} • {timeGroup.rows.length} laporan ruang
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-blue-700">
                          {new Set(timeGroup.rows.map((row) => String(row.room || '').trim()).filter(Boolean)).size} ruang
                          {expandedReportTimeGroupKey === `${day.dateKey}::${timeGroup.timeKey}` ? (
                            <ChevronDown size={15} />
                          ) : (
                            <ChevronRight size={15} />
                          )}
                        </span>
                      </button>
                      {expandedReportTimeGroupKey === `${day.dateKey}::${timeGroup.timeKey}` ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-white border-b border-gray-200">
                              <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ruang</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mapel</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kelas di Ruangan</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Peserta</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pengawas</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Catatan</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dokumen</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {timeGroup.rows.map((row, index) => (
                                <tr key={`${day.dateKey}-${timeGroup.timeKey}-${row.room || 'tanpa-ruang'}-${index}`}>
                                  <td className="px-6 py-4 align-top">
                                    <div className="font-medium text-gray-900">{row.room || 'Belum ditentukan'}</div>
                                    <div className="text-xs text-gray-500 mt-1">{row.examType || '-'}</div>
                                  </td>
                                  <td className="px-6 py-4 align-top">
                                    <div className="font-medium text-gray-900">{row.subjectName || 'Mata Pelajaran'}</div>
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
                                          Dikirim {formatSafeDateTime(row.report.signedAt)}
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-xs text-gray-500">Belum ada laporan</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 align-top text-sm text-gray-700 max-w-[320px]">
                                    <div className="line-clamp-4 whitespace-pre-wrap leading-6">
                                      {mergeProctorReportNotes(row.report?.notes, row.report?.incident) || '-'}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 align-top text-sm text-gray-700">
                                    {row.report ? (
                                      <div className="flex min-w-[220px] flex-col gap-2">
                                        <div className="text-xs text-gray-500">
                                          BA: {row.report.documentNumber || 'Nomor dokumen dibuat saat preview dibuka.'}
                                        </div>
                                        {row.report.auditTrail ? (
                                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                              Ringkasan Disiplin
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                                Peringatan {row.report.auditTrail.warningCount}x
                                              </span>
                                              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                                                Peserta diperingatkan {row.report.auditTrail.warnedStudents}
                                              </span>
                                              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                                Sesi diakhiri {row.report.auditTrail.terminatedStudents}
                                              </span>
                                            </div>
                                            {row.report.auditTrail.latestActionAt ? (
                                              <div className="mt-2 text-[11px] text-slate-500">
                                                Aksi terakhir: {formatAuditTrailLabel(row.report.auditTrail.latestActionAt)}
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() => openDocumentPreview(`/print/proctor-report/${row.report?.id}`)}
                                            className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                          >
                                            <FileText size={13} className="mr-1.5" />
                                            Lihat & Print BA
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openDocumentPreview(`/print/proctor-attendance/${row.report?.id}`)}
                                            className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                          >
                                            <FileText size={13} className="mr-1.5" />
                                            Lihat & Print Daftar Hadir
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
                      ) : null}
                    </div>
                  ))}
                </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
          </>
        ) : (
          <div className="px-6 py-6 text-sm text-gray-500">
            Klik <span className="font-medium text-gray-700">Lihat Detail</span> untuk membuka rekap berita acara pengawas dan dokumen ruang ujian.
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
                    {absentModalRow.room || 'Belum ditentukan'} • {formatSafeTime(absentModalRow.startTime)} -{' '}
                    {formatSafeTime(absentModalRow.endTime)} WIB
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
