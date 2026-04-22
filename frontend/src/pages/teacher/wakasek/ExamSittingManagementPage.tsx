import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Check, 
  Users,
  ChevronDown,
  Search,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { examService, type ExamProgram, type ExamProgramSession } from '../../../services/exam.service';
import { isNonScheduledExamProgram, resolveProgramCodeFromParam } from '../../../lib/examProgramMenu';
import { compareExamRoomName } from '../../../lib/examRoomSort';
import ExamProgramFilterBar from '../../../components/teacher/exams/ExamProgramFilterBar';

// --- Interfaces ---

interface Student {
  id: number;
  name: string;
  nis?: string;
  class?: {
    id: number;
    name: string;
  };
  studentClass?: { // Backend might return studentClass
    name: string;
  };
}

interface Class {
  id: number;
  name: string;
  level?: string;
}

interface ExamSitting {
  id: number;
  roomName: string;
  examType: string;
  sessionId?: number | null;
  sessionLabel?: string | null;
  programSession?: {
    id: number;
    label: string;
    displayOrder?: number;
  } | null;
  academicYearId: number;
  semester?: string;
  students: {
    student: Student;
  }[];
  _count?: {
    students: number;
  };
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
};

interface SarprasRoom {
  id: number;
  name: string;
  location?: string | null;
  category?: {
    id: number;
    name: string;
  } | null;
}

const normalizeClassLevelToken = (raw: unknown): string => {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!value) return '';
  if (value === '10' || value === 'X') return 'X';
  if (value === '11' || value === 'XI') return 'XI';
  if (value === '12' || value === 'XII') return 'XII';
  if (value.startsWith('XII')) return 'XII';
  if (value.startsWith('XI')) return 'XI';
  if (value.startsWith('X')) return 'X';
  return '';
};

const compareClassName = (a: string, b: string): number =>
  String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });

const getStudentClassName = (student: Student): string =>
  String(student.studentClass?.name || student.class?.name || '').trim();

const compareSessionLabel = (a: string | null | undefined, b: string | null | undefined): number =>
  String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });

// --- Main Page Component ---

type ExamSittingManagementPageProps = {
  forcedProgramCode?: string | null;
};

const ExamSittingManagementPage = ({ forcedProgramCode }: ExamSittingManagementPageProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const programParamKey = 'ruangProgram';
  const normalizedForcedProgramCode = String(forcedProgramCode || '').trim().toUpperCase();
  const { data: activeAcademicYear } = useActiveAcademicYear();

  // State
  const [sittings, setSittings] = useState<ExamSitting[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false); // New state for details fetching
  const selectedAcademicYear = activeAcademicYear?.id ? String(activeAcademicYear.id) : '';
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN'>(
    activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD',
  );
  const [programSessions, setProgramSessions] = useState<ExamProgramSession[]>([]);
  const [newSessionLabel, setNewSessionLabel] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [sarprasRooms, setSarprasRooms] = useState<SarprasRoom[]>([]);
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const roomDropdownRef = useRef<HTMLDivElement | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSitting, setEditingSitting] = useState<ExamSitting | null>(null);
  
  // View State
  const [viewMode, setViewMode] = useState<'list' | 'manage_students'>('list');

  // Form State
  const [formData, setFormData] = useState({
    roomName: '',
    sessionId: '',
    academicYearId: '',
    semester: 'ODD', // Default semester
  });

  // Student Selection State
  const [currentSittingId, setCurrentSittingId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([]);
  const [allClassStudents, setAllClassStudents] = useState<Student[]>([]);
  const [occupiedStudentIds, setOccupiedStudentIds] = useState<Set<number>>(new Set());
  // Use Map to store full student objects for selection, enabling cross-class selection before adding
  const [selectedCandidates, setSelectedCandidates] = useState<Map<number, Student>>(new Map());

  const visiblePrograms = useMemo(
    () =>
      [...examPrograms]
        .filter(
          (program) =>
            Boolean(program?.isActive) &&
            !isNonScheduledExamProgram(program) &&
            (!normalizedForcedProgramCode || String(program.code || '').trim().toUpperCase() === normalizedForcedProgramCode),
        )
        .sort(
          (a, b) =>
            Number(a.order || 0) - Number(b.order || 0) ||
            String(a.label || '').localeCompare(String(b.label || '')),
        ),
    [examPrograms, normalizedForcedProgramCode],
  );

  const activeProgram = useMemo(
    () => visiblePrograms.find((program) => program.code === activeProgramCode) || null,
    [visiblePrograms, activeProgramCode],
  );
  const effectiveSemester =
    activeProgram?.fixedSemester ||
    selectedSemester ||
    (activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD');

  const allowedClassLevelsByProgram = useMemo(() => {
    const levels = Array.isArray(activeProgram?.targetClassLevels) ? activeProgram.targetClassLevels : [];
    return new Set(
      levels
        .map((level) => normalizeClassLevelToken(level))
        .filter((level): level is string => Boolean(level)),
    );
  }, [activeProgram?.targetClassLevels]);

  const scopedClasses = useMemo(() => {
    if (allowedClassLevelsByProgram.size === 0) return classes;
    return classes.filter((classItem) => {
      const normalizedLevel = normalizeClassLevelToken(classItem.level || classItem.name);
      return normalizedLevel ? allowedClassLevelsByProgram.has(normalizedLevel) : false;
    });
  }, [classes, allowedClassLevelsByProgram]);

  const sortedAssignedStudents = useMemo(() => {
    return [...assignedStudents].sort((a, b) => {
      const classCompare = compareClassName(getStudentClassName(a), getStudentClassName(b));
      if (classCompare !== 0) return classCompare;
      return String(a.name || '').localeCompare(String(b.name || ''), 'id', {
        sensitivity: 'base',
      });
    });
  }, [assignedStudents]);

  const requestedProgramCode = useMemo(
    () => String(searchParams.get(programParamKey) || '').trim().toUpperCase(),
    [searchParams],
  );

  const isExamEligibleRoom = useCallback((room: SarprasRoom) => {
    const haystack = `${room.name || ''} ${room.category?.name || ''}`.toLowerCase();
    return (
      haystack.includes('kelas') ||
      haystack.includes('class') ||
      haystack.includes('praktik') ||
      haystack.includes('praktek') ||
      haystack.includes('lab') ||
      haystack.includes('laboratorium')
    );
  }, []);

  const examEligibleRooms = useMemo(
    () =>
      sarprasRooms
        .filter((room) => isExamEligibleRoom(room))
        .sort((a, b) => compareExamRoomName(a.name, b.name, 'id')),
    [sarprasRooms, isExamEligibleRoom],
  );

  const filteredExamEligibleRooms = useMemo(() => {
    if (!roomSearch.trim()) return examEligibleRooms;
    const keyword = roomSearch.trim().toLowerCase();
    return examEligibleRooms.filter((room) => {
      const haystack = `${room.name || ''} ${room.category?.name || ''} ${room.location || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [examEligibleRooms, roomSearch]);

  useEffect(() => {
    if (activeProgram?.fixedSemester) {
      setSelectedSemester(activeProgram.fixedSemester);
      return;
    }
    if (activeAcademicYear?.semester === 'ODD' || activeAcademicYear?.semester === 'EVEN') {
      setSelectedSemester(activeAcademicYear.semester);
    }
  }, [activeAcademicYear?.semester, activeProgram?.fixedSemester]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [classRes, roomRes] = await Promise.all([
          api.get('/classes?limit=100'),
          api.get('/inventory/rooms')
        ]);

        setClasses(classRes.data?.data?.classes || []);
        setSarprasRooms(Array.isArray(roomRes.data?.data) ? roomRes.data.data : []);
      } catch (err: unknown) {
        console.error(err);
        toast.error('Gagal memuat data awal');
        setLoading(false);
      }
    };

    fetchInitialData();
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
      const scopedPrograms = normalizedForcedProgramCode
        ? scheduledPrograms.filter((program) => String(program.code || '').trim().toUpperCase() === normalizedForcedProgramCode)
        : scheduledPrograms;
      const resolvedRequestedCode =
        normalizedForcedProgramCode || resolveProgramCodeFromParam(scopedPrograms, requestedProgramCode);
      setExamPrograms(programs);
      setActiveProgramCode((prev) =>
        scopedPrograms.some((program) => program.code === resolvedRequestedCode)
          ? resolvedRequestedCode
          : scopedPrograms.some((program) => program.code === prev)
            ? prev
            : (scopedPrograms[0]?.code || ''),
      );
    } catch (error) {
      console.error('Error fetching exam programs:', error);
      setExamPrograms([]);
      setActiveProgramCode('');
    }
  }, [normalizedForcedProgramCode, selectedAcademicYear, requestedProgramCode]);

  const fetchSittings = useCallback(async () => {
    if (!selectedAcademicYear || !activeProgramCode) {
      setSittings([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const res = await api.get('/exam-sittings', {
        params: {
          academicYearId: selectedAcademicYear,
          examType: activeProgramCode,
          programCode: activeProgramCode,
          semester: effectiveSemester,
          limit: 100,
        }
      });
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      rows.sort(
        (a: ExamSitting, b: ExamSitting) =>
          compareExamRoomName(a.roomName, b.roomName, 'id') ||
          compareSessionLabel(
            String(a.programSession?.label || a.sessionLabel || '').trim() || null,
            String(b.programSession?.label || b.sessionLabel || '').trim() || null,
          ) ||
          Number(a.id || 0) - Number(b.id || 0),
      );
      setSittings(rows);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data ruang ujian');
      setSittings([]); // Reset on error
    } finally {
      setLoading(false);
    }
  }, [selectedAcademicYear, activeProgramCode, effectiveSemester]);

  const fetchProgramSessions = useCallback(async (targetAcademicYearId: string, targetProgramCode: string) => {
    const ayId = Number(targetAcademicYearId || 0);
    if (!ayId || !targetProgramCode) {
      setProgramSessions([]);
      return;
    }

    try {
      const response = await examService.getProgramSessions({
        academicYearId: ayId,
        programCode: targetProgramCode,
      });
      const sessions = Array.isArray(response?.data?.sessions) ? response.data.sessions : [];
      setProgramSessions(sessions);
    } catch (error) {
      console.error('Error fetching program sessions:', error);
      setProgramSessions([]);
    }
  }, []);

  useEffect(() => {
    if (selectedAcademicYear) {
      void fetchPrograms();
    } else {
      setExamPrograms([]);
      setActiveProgramCode('');
      setLoading(false);
    }
  }, [selectedAcademicYear, fetchPrograms]);

  useEffect(() => {
    if (selectedAcademicYear && activeProgramCode) {
      void fetchSittings();
    } else if (!activeProgramCode) {
      setSittings([]);
    }
  }, [selectedAcademicYear, activeProgramCode, fetchSittings]);

  useEffect(() => {
    const currentParam = String(searchParams.get(programParamKey) || '').trim().toUpperCase();
    if (!activeProgramCode) return;
    if (currentParam === activeProgramCode) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(programParamKey, activeProgramCode);
    setSearchParams(nextParams, { replace: true });
  }, [activeProgramCode, searchParams, setSearchParams]);

  useEffect(() => {
    if (!showModal) return;
    void fetchProgramSessions(formData.academicYearId || selectedAcademicYear, activeProgramCode);
  }, [showModal, formData.academicYearId, selectedAcademicYear, activeProgramCode, fetchProgramSessions]);

  useEffect(() => {
    if (!selectedAcademicYear) return;
    setFormData((prev) =>
      prev.academicYearId === selectedAcademicYear ? prev : { ...prev, academicYearId: selectedAcademicYear },
    );
  }, [selectedAcademicYear]);

  useEffect(() => {
    if (!showModal) return;
    setFormData((prev) => {
      if (!prev.sessionId) return prev;
      const stillExists = programSessions.some((session) => String(session.id) === String(prev.sessionId));
      if (stillExists) return prev;
      return { ...prev, sessionId: '' };
    });
  }, [showModal, programSessions]);

  useEffect(() => {
    if (!showModal || !editingSitting || formData.sessionId) return;
    const legacyLabel = String(editingSitting.programSession?.label || editingSitting.sessionLabel || '')
      .trim()
      .toLowerCase();
    if (!legacyLabel) return;
    const matched = programSessions.find(
      (session) => String(session.label || '').trim().toLowerCase() === legacyLabel,
    );
    if (!matched?.id) return;
    setFormData((prev) => ({ ...prev, sessionId: String(matched.id) }));
  }, [showModal, editingSitting, formData.sessionId, programSessions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roomDropdownRef.current && !roomDropdownRef.current.contains(event.target as Node)) {
        setIsRoomDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchClassStudents = useCallback(async (classId: number) => {
    try {
      const res = await api.get('/users', {
        params: {
          role: 'STUDENT',
          class_id: classId,
          limit: 100
        }
      });
      // Sort alphabetically
      const students = res.data?.data || [];
      students.sort((a: Student, b: Student) => a.name.localeCompare(b.name));
      setAllClassStudents(students);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Gagal memuat siswa');
    }
  }, []);

  const fetchOccupiedStudentIds = useCallback(
    async (excludeId: number | null) => {
      if (!selectedAcademicYear || !activeProgramCode) {
        setOccupiedStudentIds(new Set());
        return;
      }
      try {
        const response = await api.get('/exam-sittings/assigned-students', {
          params: {
            academicYearId: Number(selectedAcademicYear),
            examType: activeProgramCode,
            programCode: activeProgramCode,
            semester: effectiveSemester,
            excludeSittingId: excludeId || undefined,
          },
        });
        const ids = Array.isArray(response.data?.data?.studentIds)
          ? response.data.data.studentIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
          : [];
        setOccupiedStudentIds(new Set(ids));
      } catch (error: unknown) {
        console.error(error);
        setOccupiedStudentIds(new Set());
        toast.error('Gagal memuat komposisi siswa ruangan lain');
      }
    },
    [selectedAcademicYear, activeProgramCode, effectiveSemester],
  );

  // Filter students when assignedStudents or allClassStudents change
  useEffect(() => {
    if (allClassStudents.length > 0) {
      const assignedIds = new Set(assignedStudents.map((s) => s.id));
      const blockedIds = new Set<number>([...Array.from(assignedIds), ...Array.from(occupiedStudentIds)]);
      const available = allClassStudents.filter((s) => !blockedIds.has(s.id));
      // Sort available just in case
      available.sort((a, b) => a.name.localeCompare(b.name));
      setAvailableStudents(available);
    } else {
      setAvailableStudents([]);
    }
  }, [allClassStudents, assignedStudents, occupiedStudentIds]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassStudents(selectedClassId);
    } else {
      setAllClassStudents([]);
    }
  }, [selectedClassId, fetchClassStudents]);

  useEffect(() => {
    if (!selectedClassId) return;
    const stillAllowed = scopedClasses.some((classItem) => Number(classItem.id) === Number(selectedClassId));
    if (!stillAllowed) {
      setSelectedClassId(null);
      setAllClassStudents([]);
      setAvailableStudents([]);
      setSelectedCandidates(new Map());
    }
  }, [selectedClassId, scopedClasses]);

  // Clean up potential memory leaks or state updates on unmount if needed
  // (React 18 handles this well, but just in case)
  
  const handleCreate = () => {
    setEditingSitting(null);
    setFormData({
      roomName: '',
      sessionId: '',
      academicYearId: selectedAcademicYear || '',
      semester: activeProgram?.fixedSemester || selectedSemester || 'ODD'
    });
    setNewSessionLabel('');
    setRoomSearch('');
    setIsRoomDropdownOpen(false);
    setShowModal(true);
  };

  const handleEdit = (sitting: ExamSitting) => {
    setEditingSitting(sitting);
    const legacyLabel = String(sitting.programSession?.label || sitting.sessionLabel || '')
      .trim()
      .toLowerCase();
    const matchedSession = legacyLabel
      ? programSessions.find((session) => String(session.label || '').trim().toLowerCase() === legacyLabel)
      : null;
    
    setFormData({
      roomName: sitting.roomName,
      sessionId: sitting.sessionId ? String(sitting.sessionId) : matchedSession ? String(matchedSession.id) : '',
      academicYearId: selectedAcademicYear || sitting.academicYearId?.toString() || '',
      semester: sitting.semester || activeProgram?.fixedSemester || selectedSemester || 'ODD'
    });
    setNewSessionLabel('');
    setRoomSearch('');
    setIsRoomDropdownOpen(false);
    setShowModal(true);
  };

  const handleSave = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!activeProgramCode) {
      toast.error('Program ujian belum dipilih.');
      return;
    }
    if (!formData.roomName.trim()) {
      toast.error('Pilih ruang ujian dari daftar.');
      return;
    }
    if (!examEligibleRooms.some((room) => room.name === formData.roomName)) {
      toast.error('Ruang ujian harus berasal dari daftar ruang yang tersedia.');
      return;
    }
    const academicYearId = Number(formData.academicYearId || selectedAcademicYear || 0);
    if (!academicYearId) {
      toast.error('Tahun ajaran aktif belum tersedia.');
      return;
    }
    try {
      // Logic: User wants only Room Name and Students in this flow.
      // Time/Date/Proctor are removed.
      
      const payload = {
        roomName: formData.roomName,
        sessionId: formData.sessionId ? Number(formData.sessionId) : null,
        academicYearId,
        examType: activeProgramCode,
        programCode: activeProgramCode,
        semester: activeProgram?.fixedSemester || formData.semester || 'ODD',
        studentIds: editingSitting ? undefined : [] 
      };

      if (editingSitting) {
        await api.put(`/exam-sittings/${editingSitting.id}`, payload);
        toast.success('Ruang ujian berhasil diperbarui');
      } else {
        await api.post('/exam-sittings', payload);
        toast.success('Ruang ujian berhasil dibuat');
      }
      setRoomSearch('');
      setIsRoomDropdownOpen(false);
      setShowModal(false);
      fetchSittings();
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan');
    }
  };

  const handleCreateSession = async () => {
    const academicYearId = Number(formData.academicYearId || selectedAcademicYear || 0);
    const label = newSessionLabel.trim();
    if (!academicYearId) {
      toast.error('Tahun ajaran aktif belum tersedia.');
      return;
    }
    if (!activeProgramCode) {
      toast.error('Program ujian belum dipilih.');
      return;
    }
    if (!label) {
      toast.error('Nama sesi tidak boleh kosong.');
      return;
    }

    setCreatingSession(true);
    try {
      const response = await examService.createProgramSession({
        academicYearId,
        programCode: activeProgramCode,
        label,
      });
      const created = response?.data;
      if (created?.id) {
        setProgramSessions((prev) => {
          const next = [...prev];
          const existingIndex = next.findIndex((item) => item.id === created.id);
          if (existingIndex >= 0) {
            next[existingIndex] = created;
          } else {
            next.push(created);
          }
          return next.sort(
            (a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0) || Number(a.id) - Number(b.id),
          );
        });
        setFormData((prev) => ({ ...prev, sessionId: String(created.id) }));
      }
      setNewSessionLabel('');
      toast.success('Sesi berhasil ditambahkan.');
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Gagal menambahkan sesi.');
      toast.error(message);
    } finally {
      setCreatingSession(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus ruang ini?')) return;
    try {
      await api.delete(`/exam-sittings/${id}`);
      toast.success('Ruang dihapus');
      fetchSittings();
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menghapus');
    }
  };

  // Fetch fresh sitting details when opening manage mode
  const fetchSittingDetails = async (id: number) => {
    try {
      setDetailsLoading(true);
      const res = await api.get(`/exam-sittings/${id}`);
      const sitting = res.data.data;
      
      let validStudents: Student[] = [];
      
      if (sitting.students && Array.isArray(sitting.students)) {
        validStudents = sitting.students.map((s: unknown) => {
          // Robust mapping
          if (typeof s === 'object' && s !== null && 'student' in s && typeof (s as { student?: unknown }).student === 'object') {
            return (s as { student: Student }).student;
          }
          // Direct object (from detail endpoint)
          if (typeof s === 'object' && s !== null && 'id' in s && ('name' in s || 'username' in s)) {
            return s as Student;
          }
          // Raw query format
          if (typeof s === 'object' && s !== null && 'student_id' in s && 'student_name' in s) {
            const raw = s as {
              student_id: number;
              student_name: string;
              student_nis?: string;
              class_name?: string;
            };
             return { 
               id: raw.student_id, 
               name: raw.student_name, 
               nis: raw.student_nis, 
               class: { name: raw.class_name } 
             };
          }
          return null;
        }).filter((s: Student | null): s is Student => s !== null);
      }
      
      // Remove duplicates just in case
      const uniqueStudents = Array.from(new Map(validStudents.map(s => [s.id, s])).values());
      uniqueStudents.sort((a: Student, b: Student) => a.name.localeCompare(b.name));
      
      setAssignedStudents(uniqueStudents);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat detail ruang');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleManageStudents = (sitting: ExamSitting) => {
    setCurrentSittingId(sitting.id);
    // Initial optimistic set from list
    const initialStudents = sitting.students?.map(s => s.student) || [];
    initialStudents.sort((a, b) => a.name.localeCompare(b.name));
    setAssignedStudents(initialStudents);
    
    // Fetch fresh data to ensure we have all students
    fetchSittingDetails(sitting.id);
    
    setAvailableStudents([]);
    setAllClassStudents([]);
    setSelectedClassId(null);
    setSelectedCandidates(new Map());
    void fetchOccupiedStudentIds(sitting.id);
    setViewMode('manage_students');
  };

  const handleAddStudents = () => {
    const toAdd = Array.from(selectedCandidates.values());
    if (toAdd.length === 0) return;

    setAssignedStudents(prev => {
      // Create a map of existing students for quick lookup
      const existingMap = new Map(prev.map(s => [s.id, s]));
      
      // Add new students if not already present
      toAdd.forEach(s => {
        if (!existingMap.has(s.id)) {
          existingMap.set(s.id, s);
        }
      });
      
      // Convert back to array and sort
      const updated = Array.from(existingMap.values());
      updated.sort((a, b) => a.name.localeCompare(b.name));
      return updated;
    });

    setSelectedCandidates(new Map());
    toast.success(`${toAdd.length} siswa ditambahkan ke daftar sementara. Jangan lupa Simpan Perubahan.`, {
      duration: 3000,
      icon: '⚠️'
    });
  };

  const toggleCandidate = (student: Student) => {
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      if (newMap.has(student.id)) {
        newMap.delete(student.id);
      } else {
        newMap.set(student.id, student);
      }
      return newMap;
    });
  };

  const toggleAllVisible = () => {
    // Check if all CURRENTLY visible students are selected
    const allVisibleSelected = availableStudents.every(s => selectedCandidates.has(s.id));
    
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      if (allVisibleSelected) {
        // Deselect all visible
        availableStudents.forEach(s => newMap.delete(s.id));
      } else {
        // Select all visible
        availableStudents.forEach(s => newMap.set(s.id, s));
      }
      return newMap;
    });
  };

  const handleRemoveStudent = (studentId: number) => {
    setAssignedStudents(prev => prev.filter(s => s.id !== studentId));
  };

  const saveStudents = async () => {
    if (!currentSittingId) {
      toast.error('Ruang ujian tidak valid. Buka ulang menu Atur Siswa.');
      return;
    }

    // Safety: jika user langsung klik "Simpan Perubahan" tanpa klik "Tambahkan Siswa",
    // kandidat yang masih tercentang tetap ikut disimpan.
    const mergedStudentsMap = new Map<number, Student>(assignedStudents.map((student) => [student.id, student]));
    selectedCandidates.forEach((student) => {
      if (student?.id) {
        mergedStudentsMap.set(student.id, student);
      }
    });
    const finalAssignedStudents = Array.from(mergedStudentsMap.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'id'),
    );

    if (finalAssignedStudents.length === 0) {
      const confirmed = window.confirm(
        'Belum ada siswa yang akan disimpan. Lanjut simpan komposisi kosong untuk ruangan ini?',
      );
      if (!confirmed) return;
    }
    try {
      await api.put(`/exam-sittings/${currentSittingId}/students`, {
        studentIds: finalAssignedStudents.map((s) => s.id),
      });
      toast.success('Daftar siswa diperbarui');
      setAssignedStudents(finalAssignedStudents);
      setSelectedCandidates(new Map());
      setViewMode('list');
      fetchSittings();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan siswa');
    }
  };

  const resolveSittingSessionLabel = (sitting: ExamSitting): string | null => {
    return String(sitting.programSession?.label || sitting.sessionLabel || '').trim() || null;
  };

  if (viewMode === 'manage_students') {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden h-[calc(100vh-7rem)]">
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center shadow-sm flex-none">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              Atur Komposisi Siswa
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Tambahkan siswa ke ruangan ini (bisa lintas kelas/jurusan)
            </p>
          </div>
          <button 
            onClick={() => setViewMode('list')} 
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
            aria-label="Kembali"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row bg-white flex-1 overflow-hidden">
          {/* Left Panel: Source */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-gray-200 bg-white h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex-none">
              <label htmlFor="sourceClass" className="block text-sm font-semibold text-gray-700 mb-2">1. Pilih Kelas Sumber</label>
              <div className="relative">
                <select
                  id="sourceClass"
                  value={selectedClassId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedClassId(val ? Number(val) : null);
                  }}
                  className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 pl-3 pr-10 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {scopedClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {allowedClassLevelsByProgram.size > 0 ? (
                <p className="text-xs text-blue-600 mt-2">
                  Scope program aktif membatasi tingkat kelas: {Array.from(allowedClassLevelsByProgram).join(', ')}.
                </p>
              ) : null}
            </div>

            <div className="p-4 bg-white flex-1 overflow-y-auto min-h-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-700">Daftar Siswa Tersedia</span>
                {availableStudents.length > 0 && (
                  <button
                    onClick={toggleAllVisible}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {availableStudents.every(s => selectedCandidates.has(s.id)) ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                )}
              </div>
              
              <div className="space-y-2">
                {selectedClassId ? (
                  availableStudents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {availableStudents.map(student => (
                        <div 
                          key={student.id} 
                          className={`flex items-start p-3 border rounded-lg cursor-pointer transition-all ${
                            selectedCandidates.has(student.id) 
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          onClick={() => toggleCandidate(student)}
                        >
                          <div className={`w-5 h-5 rounded border mr-3 flex items-center justify-center mt-0.5 ${
                            selectedCandidates.has(student.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                          }`}>
                            {selectedCandidates.has(student.id) && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            <div className="text-xs text-gray-500">{student.nis}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-400 p-6 text-center h-40">
                      <Users size={32} className="mb-2 opacity-50" />
                      <p className="text-sm">Tidak ada siswa tersedia / semua sudah masuk ruang ini.</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 p-6 text-center h-40">
                    <p className="text-sm">Silakan pilih kelas terlebih dahulu.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Target */}
          <div className="w-full md:w-1/2 flex flex-col bg-white border-l border-gray-200 h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-none">
              <label className="block text-sm font-semibold text-gray-700">2. Siswa Terpilih di Ruangan Ini</label>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                Total: {assignedStudents.length}
              </span>
            </div>

            <div className="p-4 bg-white flex-1 overflow-y-auto min-h-0">
                {detailsLoading ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                    <p className="text-sm text-gray-500">Memuat siswa...</p>
                  </div>
                ) : assignedStudents.length > 0 ? (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                    {sortedAssignedStudents.map((student, idx) => (
                      <div key={student.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-gray-400 w-6">{idx + 1}.</span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            <div className="text-xs text-gray-500">
                              {student.nis} {student.studentClass?.name ? `• ${student.studentClass.name}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveStudent(student.id)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          title="Hapus dari ruangan"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 p-6 text-center h-40">
                    <Users size={32} className="mb-2 opacity-50" />
                    <p className="text-sm">Belum ada siswa di ruangan ini</p>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex-none z-20">
          <button
            onClick={handleAddStudents}
            disabled={selectedCandidates.size === 0}
            className={`px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-all mr-auto ${
              selectedCandidates.size > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Plus size={18} />
            Tambahkan {selectedCandidates.size > 0 ? `(${selectedCandidates.size})` : ''} Siswa
          </button>
          
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={saveStudents}
            className="px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            <Check size={18} />
            Simpan Perubahan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header & Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kelola Ruang Ujian</h1>
            <p className="text-gray-500 text-sm mt-1">Buat ruang ujian dan atur komposisi siswa (lintas kelas)</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={!activeProgramCode}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${
                !activeProgramCode
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Plus size={18} />
              Buat Ruang
            </button>
          </div>
        </div>

        {/* Tabs */}
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Memuat data...</p>
          </div>
        ) : !activeProgramCode ? (
          <div className="text-center py-12 bg-gray-50">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Pilih Program Ujian</h3>
            <p className="text-gray-500">Aktifkan program dulu dari menu Program Ujian.</p>
          </div>
        ) : sittings.length === 0 ? (
          <div className="text-center py-12 bg-gray-50">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              Belum ada ruang ujian {activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}
            </h3>
            <p className="text-gray-500">Mulai dengan membuat ruang baru.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NAMA RUANG</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SESI</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">JUMLAH SISWA</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">AKSI</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sittings.map((sitting) => (
                  <tr key={sitting.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sitting.roomName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {resolveSittingSessionLabel(sitting) ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {resolveSittingSessionLabel(sitting)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Tanpa sesi</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Users size={16} className="mr-2" />
                        {sitting._count?.students ?? sitting.students?.length ?? 0} Siswa
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(sitting)}
                          className="text-yellow-600 hover:text-yellow-800 bg-yellow-50 hover:bg-yellow-100 p-1.5 rounded transition-colors"
                          title="Edit Ruang"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleManageStudents(sitting)}
                          className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        >
                          Atur Siswa
                        </button>
                        <button
                          onClick={() => handleDelete(sitting.id)}
                          className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 p-1.5 rounded transition-colors"
                          title="Hapus Ruang"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingSitting
                  ? `Edit Ruang Ujian ${activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}`
                  : `Buat Ruang Ujian ${activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}`}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              {activeProgram?.fixedSemester ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                  <div className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-gray-700 text-sm">
                    {activeProgram.fixedSemester === 'ODD' ? 'Ganjil (tetap)' : 'Genap (tetap)'}
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                  <select
                    id="semester"
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="sessionId" className="block text-sm font-medium text-gray-700 mb-1">Sesi Ujian (Opsional)</label>
                <select
                  id="sessionId"
                  value={formData.sessionId}
                  onChange={(e) => setFormData({ ...formData, sessionId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Tanpa sesi</option>
                  {programSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newSessionLabel}
                    onChange={(e) => setNewSessionLabel(e.target.value)}
                    placeholder="Tambah sesi baru (contoh: Sesi 1)"
                    maxLength={60}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSession}
                    disabled={creatingSession}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60"
                  >
                    {creatingSession ? 'Menyimpan...' : 'Tambah Sesi'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Pilih dari master sesi agar konsisten. Jika belum ada, tambahkan sesi baru.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pilih ruang
                </label>
                <div className="relative" ref={roomDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsRoomDropdownOpen((prev) => !prev)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center justify-between bg-white text-left focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <span className={formData.roomName ? 'text-gray-900' : 'text-gray-500'}>
                      {formData.roomName || 'Pilih ruang'}
                    </span>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>
                  {isRoomDropdownOpen && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Cari ruang..."
                            value={roomSearch}
                            onChange={(e) => setRoomSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>
                      </div>
                      {filteredExamEligibleRooms.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, roomName: room.name });
                            setIsRoomDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                        >
                          <div className="font-medium text-gray-900">{room.name}</div>
                          <div className="text-xs text-gray-500">
                            {room.category?.name || '-'}
                            {room.location ? ` • ${room.location}` : ''}
                          </div>
                        </button>
                      ))}
                      {filteredExamEligibleRooms.length === 0 && (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                          Tidak ada ruang ditemukan
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {editingSitting &&
                  formData.roomName &&
                  !examEligibleRooms.some((room) => room.name === formData.roomName) && (
                    <p className="text-xs text-amber-600 mt-1">
                      Ruang lama tidak ada di daftar aktif. Pilih ulang ruang yang valid.
                    </p>
                  )}
                {examEligibleRooms.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    Belum ada daftar ruang kategori kelas/praktik/lab.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ExamSittingManagementPage;
