import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Calendar,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useSearchParams } from 'react-router-dom';
import type { AcademicYear } from '../../../services/academicYear.service';
import {
  examService,
  type ExamPacket,
  type ExamProgram,
  type ExamProgramSession,
  type ExamScheduleMakeupOverview,
  type ExamScheduleMakeupStudentRow,
} from '../../../services/exam.service';
import { isNonScheduledExamProgram, resolveProgramCodeFromParam } from '../../../lib/examProgramMenu';

interface Subject {
  id: number;
  name: string;
  code: string;
}

interface TeacherAssignmentOption {
  id: number;
  subject: {
    id: number;
    name: string;
    code: string;
  };
  teacher?: {
    id: number;
    name: string;
  } | null;
  class: {
    id: number;
    name: string;
    level?: string;
  };
}

interface SubjectOptionWithTeachers extends Subject {
  teacherNames: string[];
}

interface ClassData {
  id: number;
  name: string;
  level?: string;
}

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  classId?: number | null;
  sessionId?: number | null;
  sessionLabel?: string | null;
  programSession?: {
    id: number;
    label: string;
    displayOrder?: number;
  } | null;
  room: string | null;
  examType: string;
  academicYearId?: number;
  subject?: {
    id: number;
    name: string;
    code: string;
  };
  packet?: {
    id?: number;
    title: string;
    type: string;
    duration: number;
    subject: {
      name: string;
    };
  };
  class?: {
    name: string;
  } | null;
  proctor?: {
    name: string;
  };
}

interface GroupedExamSchedule {
  key: string;
  subjectName: string;
  subjectCode: string;
  sessionLabel: string | null;
  startTime: string;
  endTime: string;
  schedules: ExamSchedule[];
  totalClasses: number;
  candidateCount: number;
  readyCount: number;
}

const PROGRAM_TARGET_CANDIDATE = 'CALON_SISWA';

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

const normalizeProgramTargetToken = (raw: unknown): string => {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!value) return '';
  const normalizedClassLevel = normalizeClassLevelToken(value);
  if (normalizedClassLevel) return normalizedClassLevel;
  if (value === PROGRAM_TARGET_CANDIDATE || value === 'CALONSISWA' || value === 'CANDIDATE') {
    return PROGRAM_TARGET_CANDIDATE;
  }
  return '';
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
};

const toInputDateValue = (value: string | null | undefined) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'yyyy-MM-dd');
};

const toInputTimeValue = (value: string | null | undefined) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'HH:mm');
};

const getMakeupStateMeta = (state?: string | null) => {
  const normalized = String(state || '').trim().toUpperCase();
  if (normalized === 'OPEN') {
    return {
      label: 'Sedang Dibuka',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
  }
  if (normalized === 'UPCOMING') {
    return {
      label: 'Akan Datang',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }
  if (normalized === 'EXPIRED') {
    return {
      label: 'Terlewat',
      className: 'bg-rose-50 text-rose-700 border border-rose-200',
    };
  }
  if (normalized === 'REVOKED') {
    return {
      label: 'Dicabut',
      className: 'bg-slate-100 text-slate-600 border border-slate-200',
    };
  }
  return {
    label: 'Belum Diatur',
    className: 'bg-slate-50 text-slate-600 border border-slate-200',
  };
};

const CURRICULUM_EXAM_MANAGER_LABEL = 'Wakasek Kurikulum / Sekretaris Kurikulum';

const ExamScheduleManagementPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const programParamKey = 'jadwalProgram';
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMakeupModal, setShowMakeupModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [programSessions, setProgramSessions] = useState<ExamProgramSession[]>([]);
  const [newSessionLabel, setNewSessionLabel] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [selectedMakeupSchedule, setSelectedMakeupSchedule] = useState<ExamSchedule | null>(null);
  const [makeupOverview, setMakeupOverview] = useState<ExamScheduleMakeupOverview | null>(null);
  const [loadingMakeup, setLoadingMakeup] = useState(false);
  const [savingMakeup, setSavingMakeup] = useState(false);
  const [makeupSearch, setMakeupSearch] = useState('');
  const [makeupForm, setMakeupForm] = useState({
    studentId: '',
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
  });

  // Form Data
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [candidatePackets, setCandidatePackets] = useState<ExamPacket[]>([]);
  const [assignmentOptions, setAssignmentOptions] = useState<TeacherAssignmentOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  // selectedAcademicYear used for filtering list (default to active)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  
  const [formData, setFormData] = useState({
    subjectId: '',
    packetId: '',
    classIds: [] as string[],
    date: '',
    startTime: '',
    endTime: '',
    sessionId: '',
    academicYearId: '',
    semester: ''
  });

  const [submitting, setSubmitting] = useState(false);

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

  const allowedSubjectIdsByProgram = useMemo(() => {
    const ids = Array.isArray(activeProgram?.allowedSubjectIds) ? activeProgram.allowedSubjectIds : [];
    return new Set(ids.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0));
  }, [activeProgram?.allowedSubjectIds]);

  const allowedTargetScopesByProgram = useMemo(() => {
    const targets = Array.isArray(activeProgram?.targetClassLevels) ? activeProgram.targetClassLevels : [];
    return new Set(
      targets
        .map((target) => normalizeProgramTargetToken(target))
        .filter((target): target is string => Boolean(target)),
    );
  }, [activeProgram?.targetClassLevels]);

  const isCandidateAudienceProgram = useMemo(
    () => allowedTargetScopesByProgram.has(PROGRAM_TARGET_CANDIDATE),
    [allowedTargetScopesByProgram],
  );

  const allowedClassLevelsByProgram = useMemo(() => {
    const levels = Array.isArray(activeProgram?.targetClassLevels) ? activeProgram.targetClassLevels : [];
    return new Set(
      levels
        .map((level) => normalizeClassLevelToken(level))
        .filter((level): level is string => Boolean(level)),
    );
  }, [activeProgram?.targetClassLevels]);

  const baseFilteredClasses = useMemo(() => {
    if (allowedClassLevelsByProgram.size === 0) return classes;
    return classes.filter((classItem) => {
      const normalizedLevel = normalizeClassLevelToken(classItem.level || classItem.name);
      return normalizedLevel ? allowedClassLevelsByProgram.has(normalizedLevel) : false;
    });
  }, [classes, allowedClassLevelsByProgram]);

  const filteredAssignmentsByProgram = useMemo(() => {
    return assignmentOptions.filter((assignment) => {
      const subjectAllowed =
        allowedSubjectIdsByProgram.size === 0 ||
        allowedSubjectIdsByProgram.has(Number(assignment.subject?.id || 0));

      const classLevel = normalizeClassLevelToken(assignment.class?.level || assignment.class?.name);
      const levelAllowed =
        allowedClassLevelsByProgram.size === 0 ||
        (classLevel ? allowedClassLevelsByProgram.has(classLevel) : false);

      return subjectAllowed && levelAllowed;
    });
  }, [assignmentOptions, allowedClassLevelsByProgram, allowedSubjectIdsByProgram]);

  const subjectOptions = useMemo<SubjectOptionWithTeachers[]>(() => {
    const map = new Map<number, { id: number; name: string; code: string; teacherNames: Set<string> }>();

    filteredAssignmentsByProgram.forEach((assignment) => {
      const subjectId = Number(assignment.subject?.id || 0);
      if (!subjectId) return;
      const existing = map.get(subjectId);
      if (existing) {
        const teacherName = String(assignment.teacher?.name || '').trim();
        if (teacherName) existing.teacherNames.add(teacherName);
        return;
      }
      const teacherNames = new Set<string>();
      const teacherName = String(assignment.teacher?.name || '').trim();
      if (teacherName) teacherNames.add(teacherName);
      map.set(subjectId, {
        id: subjectId,
        name: String(assignment.subject?.name || '').trim(),
        code: String(assignment.subject?.code || '').trim(),
        teacherNames,
      });
    });

    if (map.size === 0) {
      const fallback = allowedSubjectIdsByProgram.size === 0
        ? subjects
        : subjects.filter((subject) => allowedSubjectIdsByProgram.has(Number(subject.id)));
      return fallback
        .map((subject) => ({
          ...subject,
          teacherNames: [],
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return Array.from(map.values())
      .map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        teacherNames: Array.from(item.teacherNames).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [allowedSubjectIdsByProgram, filteredAssignmentsByProgram, subjects]);

  const selectedSubjectIdNumber = useMemo(() => Number(formData.subjectId || 0), [formData.subjectId]);

  const filteredClasses = useMemo(() => {
    if (!selectedSubjectIdNumber) return baseFilteredClasses;

    const classIdsForSelectedSubject = new Set<number>(
      filteredAssignmentsByProgram
        .filter((assignment) => Number(assignment.subject?.id || 0) === selectedSubjectIdNumber)
        .map((assignment) => Number(assignment.class?.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0),
    );

    if (classIdsForSelectedSubject.size === 0) return baseFilteredClasses;
    return baseFilteredClasses.filter((classItem) => classIdsForSelectedSubject.has(Number(classItem.id)));
  }, [baseFilteredClasses, filteredAssignmentsByProgram, selectedSubjectIdNumber]);

  const requestedProgramCode = useMemo(
    () => String(searchParams.get(programParamKey) || '').trim().toUpperCase(),
    [searchParams],
  );

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const response = await api.get('/academic-years?limit=100');
      const ayData = response.data?.data?.academicYears || response.data?.data || ([] as AcademicYear[]);
      setAcademicYears(ayData);
      
      // Set default selected academic year (active one)
      const activeAy = ayData.find((ay: AcademicYear) => ay.isActive);
      if (activeAy) {
        setSelectedAcademicYear(activeAy.id.toString());
      } else if (ayData.length > 0) {
        setSelectedAcademicYear(ayData[0].id.toString());
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

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

  const fetchSchedules = useCallback(async () => {
    if (!selectedAcademicYear || !activeProgramCode) {
      setSchedules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.get('/exams/schedules', {
        params: {
          examType: activeProgramCode,
          programCode: activeProgramCode,
          academicYearId: selectedAcademicYear,
        },
      });
      setSchedules(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat jadwal ujian');
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [activeProgramCode, selectedAcademicYear]);

  const fetchProgramSessions = useCallback(
    async (targetAcademicYearId: string, targetProgramCode: string) => {
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
    },
    [],
  );

  const fetchFormData = useCallback(async () => {
    try {
      // Fetch subjects instead of packets
      // Fetch classes with high limit to ensure all are shown
      // Academic years already fetched in initial data, but we can ensure they are up to date
      const assignmentAcademicYearId = Number(formData.academicYearId || selectedAcademicYear || 0);
      const [subjectsRes, classesRes, assignmentsRes] = await Promise.all([
        api.get('/subjects?limit=1000'),
        api.get('/classes?limit=1000'),
        assignmentAcademicYearId > 0
          ? api.get('/teacher-assignments', {
              params: {
                limit: 1000,
                academicYearId: assignmentAcademicYearId,
                scope: 'CURRICULUM',
              },
            })
          : Promise.resolve({ data: { data: { assignments: [] } } }),
      ]);

      setSubjects(subjectsRes.data?.data?.subjects || subjectsRes.data?.data || []);
      
      // Handle potential different response structures for classes
      const classesData = classesRes.data?.data;
      setClasses(Array.isArray(classesData) ? classesData : classesData?.classes || []);
      const assignmentsData =
        assignmentsRes?.data?.data?.assignments ||
        assignmentsRes?.data?.assignments ||
        [];
      setAssignmentOptions(Array.isArray(assignmentsData) ? assignmentsData : []);

      // Set default form academic year to selected one or active
      if (!formData.academicYearId && selectedAcademicYear) {
        setFormData(prev => ({
          ...prev,
          academicYearId: selectedAcademicYear
        }));
      }

    } catch (error) {
      console.error('Error fetching form data:', error);
      toast.error('Gagal memuat data form');
      setSubjects([]);
      setClasses([]);
      setAssignmentOptions([]);
    }
  }, [formData.academicYearId, selectedAcademicYear]);

  const fetchCandidatePackets = useCallback(async () => {
    if (!showModal || !isCandidateAudienceProgram || !activeProgramCode) {
      setCandidatePackets([]);
      return;
    }

    const academicYearId = Number(formData.academicYearId || selectedAcademicYear || 0);
    const subjectId = Number(formData.subjectId || 0);
    if (!academicYearId || !subjectId) {
      setCandidatePackets([]);
      return;
    }

    try {
      const response = await examService.getPackets({
        academicYearId,
        subjectId,
        semester: (activeProgram?.fixedSemester || formData.semester || undefined) as 'ODD' | 'EVEN' | undefined,
        programCode: activeProgramCode,
      });
      const packets = Array.isArray(response?.data) ? (response.data as ExamPacket[]) : [];
      setCandidatePackets(packets);
    } catch (error) {
      console.error('Error fetching candidate packets:', error);
      setCandidatePackets([]);
    }
  }, [
    activeProgram?.fixedSemester,
    activeProgramCode,
    formData.academicYearId,
    formData.semester,
    formData.subjectId,
    isCandidateAudienceProgram,
    selectedAcademicYear,
    showModal,
  ]);

  useEffect(() => {
    if (selectedAcademicYear) {
      void fetchPrograms();
    }
  }, [fetchPrograms, selectedAcademicYear]);

  useEffect(() => {
    if (selectedAcademicYear && activeProgramCode) {
      void fetchSchedules();
    } else if (!activeProgramCode) {
      setSchedules([]);
    }
  }, [fetchSchedules, selectedAcademicYear, activeProgramCode]);

  useEffect(() => {
    const currentParam = String(searchParams.get(programParamKey) || '').trim().toUpperCase();
    if (!activeProgramCode) return;
    if (currentParam === activeProgramCode) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(programParamKey, activeProgramCode);
    setSearchParams(nextParams, { replace: true });
  }, [activeProgramCode, searchParams, setSearchParams]);

  // Auto-set Semester & Academic Year when Modal opens
  useEffect(() => {
    if (showModal) {
      const activeAy = academicYears.find((ay: AcademicYear) => ay.isActive);
      const defaultAyId = activeAy ? activeAy.id.toString() : (academicYears[0]?.id.toString() || '');
      
      const defaultSemester = activeProgram?.fixedSemester || formData.semester || 'ODD';

      setFormData(prev => ({
        ...prev,
        academicYearId: prev.academicYearId || defaultAyId,
        semester: defaultSemester
      }));
    }
  }, [showModal, activeProgram, academicYears, formData.semester]);

  useEffect(() => {
    if (showModal) {
      fetchFormData();
    }
  }, [showModal, fetchFormData]);

  useEffect(() => {
    if (!showModal) return;
    void fetchProgramSessions(formData.academicYearId || selectedAcademicYear, activeProgramCode);
  }, [
    showModal,
    formData.academicYearId,
    selectedAcademicYear,
    activeProgramCode,
    fetchProgramSessions,
  ]);

  useEffect(() => {
    if (!showModal) return;
    setFormData((prev) => {
      if (!prev.sessionId) return prev;
      const sessionExists = programSessions.some((session) => String(session.id) === String(prev.sessionId));
      if (sessionExists) return prev;
      return { ...prev, sessionId: '' };
    });
  }, [programSessions, showModal]);

  useEffect(() => {
    if (!showModal) return;
    setFormData((prev) => {
      const allowedClassIdSet = new Set(filteredClasses.map((item) => item.id.toString()));
      const nextClassIds = prev.classIds.filter((id) => allowedClassIdSet.has(id));
      const subjectStillValid =
        !prev.subjectId || subjectOptions.some((subject) => String(subject.id) === String(prev.subjectId));
      const nextSubjectId = subjectStillValid ? prev.subjectId : '';
      if (nextClassIds.length === prev.classIds.length && nextSubjectId === prev.subjectId) return prev;
      return {
        ...prev,
        classIds: nextClassIds,
        subjectId: nextSubjectId,
      };
    });
  }, [showModal, filteredClasses, subjectOptions]);

  useEffect(() => {
    void fetchCandidatePackets();
  }, [fetchCandidatePackets]);

  useEffect(() => {
    if (isCandidateAudienceProgram) return;
    setCandidatePackets([]);
    setFormData((prev) => (prev.packetId ? { ...prev, packetId: '' } : prev));
  }, [isCandidateAudienceProgram]);

  useEffect(() => {
    if (!isCandidateAudienceProgram) return;
    setFormData((prev) => (prev.classIds.length > 0 ? { ...prev, classIds: [] } : prev));
  }, [isCandidateAudienceProgram]);

  useEffect(() => {
    if (!showModal || !isCandidateAudienceProgram || !formData.packetId) return;
    const packetStillExists = candidatePackets.some((packet) => String(packet.id) === String(formData.packetId));
    if (packetStillExists) return;
    setFormData((prev) => ({ ...prev, packetId: '' }));
  }, [candidatePackets, formData.packetId, isCandidateAudienceProgram, showModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.subjectId || !formData.date || !formData.startTime || !formData.endTime || !formData.academicYearId) {
      toast.error('Mohon lengkapi semua field yang wajib diisi');
      return;
    }
    if (!isCandidateAudienceProgram && formData.classIds.length === 0) {
      toast.error('Pilih minimal satu kelas untuk jadwal ujian ini.');
      return;
    }
    if (isCandidateAudienceProgram && !formData.packetId) {
      toast.error('Pilih packet soal yang akan dipakai untuk tes calon siswa.');
      return;
    }
    if (!activeProgramCode) {
      toast.error('Program ujian belum dipilih.');
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = {
        subjectId: parseInt(formData.subjectId, 10),
        packetId: formData.packetId ? parseInt(formData.packetId, 10) : undefined,
        classIds: formData.classIds.map(id => parseInt(id, 10)),
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        sessionId: formData.sessionId ? parseInt(formData.sessionId, 10) : null,
        examType: activeProgramCode,
        programCode: activeProgramCode,
        academicYearId: parseInt(formData.academicYearId, 10),
        semester: activeProgram?.fixedSemester || formData.semester || 'ODD'
      };

      await api.post('/exams/schedules', payload);
      
      toast.success('Jadwal ujian berhasil dibuat');
      setShowModal(false);
      void fetchSchedules();
      
      // Reset form
      setFormData(prev => ({
        ...prev,
        subjectId: '',
        packetId: '',
        classIds: [],
        date: '',
        startTime: '',
        endTime: '',
        sessionId: prev.sessionId,
        // Keep AY/Semester as they might add more for same period
      }));
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan jadwal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSession = async () => {
    const academicYearId = Number(formData.academicYearId || selectedAcademicYear || 0);
    const label = newSessionLabel.trim();
    if (!academicYearId) {
      toast.error('Pilih tahun ajaran dulu sebelum menambah sesi.');
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
    if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return;
    
    try {
      await api.delete(`/exams/schedules/${id}`);
      toast.success('Jadwal berhasil dihapus');
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (error: unknown) {
      console.error('Error deleting schedule:', error);
      toast.error(getErrorMessage(error, 'Gagal menghapus jadwal'));
    }
  };

  const resetMakeupForm = () => {
    setMakeupForm({
      studentId: '',
      date: '',
      startTime: '',
      endTime: '',
      reason: '',
    });
  };

  const closeMakeupModal = () => {
    setShowMakeupModal(false);
    setSelectedMakeupSchedule(null);
    setMakeupOverview(null);
    setMakeupSearch('');
    resetMakeupForm();
  };

  const loadMakeupOverview = useCallback(async (scheduleId: number) => {
    setLoadingMakeup(true);
    try {
      const response = await examService.getScheduleMakeupAccess(scheduleId);
      setMakeupOverview(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal memuat data susulan.'));
      setMakeupOverview(null);
    } finally {
      setLoadingMakeup(false);
    }
  }, []);

  const openMakeupModal = async (schedule: ExamSchedule) => {
    setSelectedMakeupSchedule(schedule);
    setShowMakeupModal(true);
    setMakeupSearch('');
    resetMakeupForm();
    await loadMakeupOverview(schedule.id);
  };

  const handleFillMakeupForm = (row: ExamScheduleMakeupStudentRow) => {
    setMakeupForm({
      studentId: String(row.student.id),
      date: toInputDateValue(row.makeupAccess?.startTime || null),
      startTime: toInputTimeValue(row.makeupAccess?.startTime || null),
      endTime: toInputTimeValue(row.makeupAccess?.endTime || null),
      reason: row.makeupAccess?.reason || '',
    });
  };

  const handleSaveMakeup = async () => {
    if (!selectedMakeupSchedule) {
      toast.error('Pilih jadwal ujian terlebih dahulu.');
      return;
    }
    if (!makeupForm.studentId || !makeupForm.date || !makeupForm.startTime || !makeupForm.endTime) {
      toast.error('Lengkapi siswa, tanggal, jam mulai, dan jam selesai susulan.');
      return;
    }

    setSavingMakeup(true);
    try {
      await examService.upsertScheduleMakeupAccess(selectedMakeupSchedule.id, {
        studentId: Number(makeupForm.studentId),
        date: makeupForm.date,
        startTime: makeupForm.startTime,
        endTime: makeupForm.endTime,
        reason: makeupForm.reason.trim() || undefined,
      });
      toast.success('Jadwal susulan berhasil disimpan.');
      await loadMakeupOverview(selectedMakeupSchedule.id);
      resetMakeupForm();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan jadwal susulan.'));
    } finally {
      setSavingMakeup(false);
    }
  };

  const handleRevokeMakeup = async (row: ExamScheduleMakeupStudentRow) => {
    if (!selectedMakeupSchedule) return;
    if (!confirm(`Cabut jadwal susulan untuk ${row.student.name}?`)) return;

    setSavingMakeup(true);
    try {
      await examService.revokeScheduleMakeupAccess(selectedMakeupSchedule.id, row.student.id);
      toast.success('Jadwal susulan berhasil dicabut.');
      await loadMakeupOverview(selectedMakeupSchedule.id);
      if (String(row.student.id) === String(makeupForm.studentId)) {
        resetMakeupForm();
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal mencabut jadwal susulan.'));
    } finally {
      setSavingMakeup(false);
    }
  };

  const toggleClassSelection = (classId: string) => {
    setFormData(prev => {
      const current = prev.classIds;
      if (current.includes(classId)) {
        return { ...prev, classIds: current.filter(id => id !== classId) };
      } else {
        return { ...prev, classIds: [...current, classId] };
      }
    });
  };

  const toggleAllClasses = (checked: boolean) => {
    if (checked) {
      setFormData(prev => ({ ...prev, classIds: filteredClasses.map(c => c.id.toString()) }));
    } else {
      setFormData(prev => ({ ...prev, classIds: [] }));
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const resolveScheduleSessionLabel = (schedule: ExamSchedule): string | null => {
    return String(schedule.programSession?.label || schedule.sessionLabel || '').trim() || null;
  };

  const getGroupedSchedules = (): GroupedExamSchedule[] => {
    const groups: Record<string, GroupedExamSchedule> = {};

    schedules.forEach(schedule => {
      const subjectId = schedule.subject?.id || schedule.subject?.name || 'unknown';
      const timeKey = `${schedule.startTime}-${schedule.endTime}`;
      const normalizedSessionLabel = resolveScheduleSessionLabel(schedule);
      const key = `${subjectId}-${timeKey}-${normalizedSessionLabel || '__NO_SESSION__'}`;

      if (!groups[key]) {
        groups[key] = {
          key,
          subjectName: schedule.subject?.name || schedule.packet?.subject?.name || (schedule.packet ? 'Unknown Subject' : 'Jadwal Tanpa Soal'),
          subjectCode: schedule.subject?.code || '-',
          sessionLabel: normalizedSessionLabel,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          schedules: [],
          totalClasses: 0,
          candidateCount: 0,
          readyCount: 0
        };
      }

      groups[key].schedules.push(schedule);
      groups[key].totalClasses++;
      if (!schedule.class?.name) {
        groups[key].candidateCount++;
      }
      if (schedule.packet) {
        groups[key].readyCount++;
      }
    });

    // Sort by startTime
    return Object.values(groups).sort((a, b) => {
      const byTime = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      if (byTime !== 0) return byTime;
      return String(a.sessionLabel || '').localeCompare(String(b.sessionLabel || ''), 'id');
    });
  };

  const groupedSchedules = getGroupedSchedules();
  const filteredMakeupStudents = useMemo(() => {
    const rows = makeupOverview?.students || [];
    const keyword = makeupSearch.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const haystacks = [
        row.student.name || '',
        row.student.nis || '',
        row.student.nisn || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [makeupOverview?.students, makeupSearch]);

  return (
    <div className="w-full space-y-6">
      {/* Header & Filters - Removed Academic Year Dropdown */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Kelola Jadwal Ujian</h1>
            <p className="text-sm text-gray-500 mt-1">Atur jadwal pelaksanaan ujian</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             {/* Dropdown removed */}

            <button 
              onClick={() => {
                setNewSessionLabel('');
                setShowModal(true);
              }}
              disabled={!activeProgramCode}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                !activeProgramCode
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Plus size={18} />
              <span>Buat Jadwal</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mt-6">
          {visiblePrograms.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Belum ada Program Ujian aktif pada tahun ajaran ini.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
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
          )}
        </div>
      </div>

      {/* Schedule List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat jadwal...</div>
        ) : !activeProgramCode ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Pilih Program Ujian</h3>
            <p className="text-gray-500">Aktifkan program dulu dari menu Program Ujian.</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              Belum ada jadwal {activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}
            </h3>
            <p className="text-gray-500">Buat jadwal baru untuk memulai</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-6 py-3"></th>
                  <th className="px-6 py-3 font-semibold text-gray-900">WAKTU PELAKSANAAN</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">MATA PELAJARAN</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">SESI</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">TARGET</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">STATUS SOAL</th>
                  <th className="px-6 py-3 font-semibold text-gray-900 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {groupedSchedules.map((group) => {
                  const isExpanded = expandedGroups.includes(group.key);
                  const isAllReady = group.readyCount === group.totalClasses;
                  const isNoneReady = group.readyCount === 0;
                  const totalTargetLabel =
                    group.candidateCount > 0
                      ? group.candidateCount === group.totalClasses
                        ? 'Calon Siswa'
                        : `${group.totalClasses - group.candidateCount} Kelas + ${group.candidateCount} Calon`
                      : `${group.totalClasses} Kelas`;

                  return (
                    <React.Fragment key={group.key}>
                      <tr 
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <td className="px-6 py-4">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {format(new Date(group.startTime), 'EEEE, d MMMM yyyy', { locale: id })}
                          </div>
                          <div className="text-gray-500 text-xs flex items-center mt-1">
                            <Clock className="w-3 h-3 mr-1" />
                            {format(new Date(group.startTime), 'HH:mm')} - {format(new Date(group.endTime), 'HH:mm')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {group.subjectName}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {group.subjectCode}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {group.sessionLabel ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {group.sessionLabel}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Tanpa sesi</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {totalTargetLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isAllReady ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : isNoneReady ? (
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-orange-500" />
                            )}
                            <span className={`text-sm font-medium ${
                              isAllReady ? 'text-green-700' : 
                              isNoneReady ? 'text-red-700' : 'text-orange-700'
                            }`}>
                              {group.readyCount}/{group.totalClasses} Siap
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if(confirm(`Hapus semua jadwal ${group.subjectName}?`)) {
                                Promise.all(group.schedules.map(s => api.delete(`/exams/schedules/${s.id}`)))
                                  .then(() => {
                                    toast.success('Semua jadwal berhasil dihapus');
                                    setSchedules(prev => prev.filter(s => !group.schedules.find(gs => gs.id === s.id)));
                                  })
                                  .catch(() => toast.error('Gagal menghapus beberapa jadwal'));
                              }
                            }}
                            className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus Semua Jadwal Grup Ini"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="px-0 py-0 border-t-0 bg-gray-50/50">
                            <div className="px-6 py-4 border-l-4 border-blue-500 ml-6 my-2">
                              <h4 className="text-sm font-semibold text-gray-900 mb-3">Detail Jadwal per Target</h4>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium text-gray-700">Kelas / Target</th>
                                      <th className="px-4 py-2 text-left font-medium text-gray-700">Sesi</th>
                                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status Soal</th>
                                      <th className="px-4 py-2 text-right font-medium text-gray-700">Aksi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {group.schedules
                                      .sort((a, b) =>
                                        String(a.class?.name || 'Calon Siswa').localeCompare(
                                          String(b.class?.name || 'Calon Siswa'),
                                        ),
                                      )
                                      .map(schedule => (
                                      <tr key={schedule.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-900">
                                          {schedule.class?.name || 'Calon Siswa'}
                                        </td>
                                        <td className="px-4 py-2">
                                          {resolveScheduleSessionLabel(schedule) ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                              {resolveScheduleSessionLabel(schedule)}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-400">Tanpa sesi</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2">
                                          {schedule.packet ? (
                                            <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
                                              Tersedia: {schedule.packet.title}
                                            </span>
                                          ) : (
                                            <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs font-medium">
                                              Menunggu Guru
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                            {schedule.class?.name ? (
                                              <button
                                                type="button"
                                                onClick={() => void openMakeupModal(schedule)}
                                                className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                                              >
                                                Kelola Susulan
                                              </button>
                                            ) : null}
                                            <button 
                                              onClick={() => handleDelete(schedule.id)}
                                              className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"
                                              title="Hapus Jadwal"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showMakeupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Kelola Ujian Susulan</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {CURRICULUM_EXAM_MANAGER_LABEL} mengatur susulan per siswa untuk jadwal kelas yang belum sempat mengikuti ujian reguler.
                </p>
              </div>
              <button onClick={closeMakeupModal} className="text-gray-400 hover:text-gray-600">
                &times;
              </button>
            </div>

            <div className="p-6 space-y-5">
              {selectedMakeupSchedule ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-gray-500">Mapel</div>
                      <div className="font-semibold text-gray-900">
                        {makeupOverview?.schedule.subject.name || selectedMakeupSchedule.subject?.name || '-'}
                        {makeupOverview?.schedule.subject.code
                          ? ` (${makeupOverview.schedule.subject.code})`
                          : selectedMakeupSchedule.subject?.code
                            ? ` (${selectedMakeupSchedule.subject.code})`
                            : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Kelas</div>
                      <div className="font-semibold text-gray-900">
                        {makeupOverview?.schedule.className || selectedMakeupSchedule.class?.name || '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Jadwal Reguler</div>
                      <div className="font-semibold text-gray-900">
                        {format(new Date(makeupOverview?.schedule.startTime || selectedMakeupSchedule.startTime), 'EEEE, d MMM yyyy HH:mm', { locale: id })}
                        {' - '}
                        {format(new Date(makeupOverview?.schedule.endTime || selectedMakeupSchedule.endTime), 'HH:mm')}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Packet</div>
                      <div className="font-semibold text-gray-900">
                        {makeupOverview?.schedule.packet.title || selectedMakeupSchedule.packet?.title || '-'}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-blue-700 mt-3">
                    Susulan formal hanya untuk siswa yang belum mulai ujian reguler. Waktu susulan harus sesudah jadwal reguler berakhir dan diatur oleh {CURRICULUM_EXAM_MANAGER_LABEL}.
                  </p>
                </div>
              ) : null}

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Atur Jadwal Susulan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Siswa</label>
                    <select
                      value={makeupForm.studentId}
                      onChange={(e) => setMakeupForm((prev) => ({ ...prev, studentId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Pilih siswa...</option>
                      {(makeupOverview?.students || [])
                        .filter((row) => row.canManageMakeup || row.makeupAccess)
                        .map((row) => (
                          <option key={row.student.id} value={row.student.id}>
                            {row.student.name}
                            {row.student.nis ? ` • ${row.student.nis}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan / Alasan</label>
                    <input
                      type="text"
                      value={makeupForm.reason}
                      onChange={(e) => setMakeupForm((prev) => ({ ...prev, reason: e.target.value }))}
                      placeholder="Contoh: sakit, izin resmi, kendala teknis"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Susulan</label>
                    <input
                      type="date"
                      value={makeupForm.date}
                      onChange={(e) => setMakeupForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jam Mulai</label>
                    <input
                      type="time"
                      value={makeupForm.startTime}
                      onChange={(e) => setMakeupForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jam Selesai</label>
                    <input
                      type="time"
                      value={makeupForm.endTime}
                      onChange={(e) => setMakeupForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={resetMakeupForm}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Reset Form
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveMakeup()}
                    disabled={savingMakeup || loadingMakeup}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingMakeup ? 'Menyimpan...' : 'Simpan Jadwal Susulan'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Daftar Siswa</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Gunakan tombol isi form untuk mempercepat penjadwalan atau perubahan susulan.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={makeupSearch}
                    onChange={(e) => setMakeupSearch(e.target.value)}
                    placeholder="Cari nama siswa / NIS / NISN"
                    className="w-full md:w-80 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {loadingMakeup ? (
                  <div className="p-6 text-sm text-gray-500">Memuat data susulan...</div>
                ) : filteredMakeupStudents.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">Tidak ada siswa yang sesuai.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">Siswa</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">Status Ujian Reguler</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">Status Susulan</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700">Jadwal Susulan</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-700">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredMakeupStudents.map((row) => {
                          const makeupState = getMakeupStateMeta(row.makeupAccess?.state);
                          return (
                            <tr key={row.student.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{row.student.name}</div>
                                <div className="text-xs text-gray-500">
                                  {row.student.nis ? `NIS ${row.student.nis}` : 'Tanpa NIS'}
                                  {row.student.nisn ? ` • NISN ${row.student.nisn}` : ''}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {row.session ? (
                                  <div>
                                    <div className="font-medium text-gray-900">{row.session.status}</div>
                                    <div className="text-xs text-gray-500">
                                      Mulai: {format(new Date(row.session.startTime), 'dd MMM yyyy HH:mm')}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-500">Belum mulai</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${makeupState.className}`}>
                                  {makeupState.label}
                                </span>
                                {row.makeupAccess?.reason ? (
                                  <div className="text-xs text-gray-500 mt-1">{row.makeupAccess.reason}</div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                {row.makeupAccess ? (
                                  <div className="text-xs text-gray-600">
                                    <div>{format(new Date(row.makeupAccess.startTime), 'dd MMM yyyy HH:mm')}</div>
                                    <div>s.d. {format(new Date(row.makeupAccess.endTime), 'dd MMM yyyy HH:mm')}</div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">Belum diatur</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleFillMakeupForm(row)}
                                    className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                                  >
                                    Isi Form
                                  </button>
                                  {row.makeupAccess && row.makeupAccess.state !== 'REVOKED' ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleRevokeMakeup(row)}
                                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold"
                                    >
                                      Cabut
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Buat Jadwal Ujian {activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Academic Year - Only visible when creating */}
              <div>
                <label htmlFor="academicYearId" className="block text-sm font-medium text-gray-700 mb-1">Tahun Ajaran</label>
                <select
                  id="academicYearId"
                  value={formData.academicYearId}
                  onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Pilih Tahun Ajaran</option>
                  {academicYears.map(ay => (
                    <option key={ay.id} value={ay.id.toString()}>{ay.name} ({ay.isActive ? 'Aktif' : 'Tidak Aktif'})</option>
                  ))}
                </select>
              </div>

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
                <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700 mb-1.5">Mata Pelajaran</label>
                <div className="relative">
                  <select
                    id="subjectId"
                    value={formData.subjectId}
                    onChange={e => setFormData({...formData, subjectId: e.target.value})}
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none"
                  >
                    <option value="">Pilih Mata Pelajaran...</option>
                    {subjectOptions.map(subject => (
                      <option key={subject.id} value={subject.id.toString()}>
                        {subject.name} ({subject.code})
                        {subject.teacherNames.length > 0 ? ` -- ${subject.teacherNames.join(', ')}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                </div>
                {subjectOptions.length === 0 ? (
                  <p className="text-xs text-amber-700 mt-1">
                    Belum ada assignment mapel-guru untuk tahun ajaran ini.
                  </p>
                ) : null}
                {allowedSubjectIdsByProgram.size > 0 ? (
                  <p className="text-xs text-blue-600 mt-1">
                    Scope program aktif membatasi mapel pada daftar yang diizinkan.
                  </p>
                ) : null}
              </div>

              {isCandidateAudienceProgram ? (
                <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                  <div>
                    <label htmlFor="packetId" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Packet Soal Tes Calon Siswa <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="packetId"
                      value={formData.packetId}
                      onChange={(e) => setFormData({ ...formData, packetId: e.target.value })}
                      className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="">Pilih packet soal...</option>
                      {candidatePackets.map((packet) => (
                        <option key={packet.id} value={packet.id}>
                          {packet.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-blue-700 mt-1">
                      Mode ini membuat satu jadwal umum untuk semua calon siswa, tanpa memilih kelas.
                    </p>
                    {candidatePackets.length === 0 ? (
                      <p className="text-xs text-amber-700 mt-1">
                        Belum ada packet dengan program ini untuk mapel terpilih. Buat packet soal dulu dari menu bank/paket ujian.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Pilih Kelas <span className="text-red-500">*</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 font-medium select-none">
                      <input
                        type="checkbox"
                        checked={filteredClasses.length > 0 && formData.classIds.length === filteredClasses.length}
                        onChange={(e) => toggleAllClasses(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Pilih Semua
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {filteredClasses.map((cls) => (
                      <label key={cls.id} htmlFor={`class-${cls.id}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded select-none">
                        <input
                          id={`class-${cls.id}`}
                          name="classIds"
                          type="checkbox"
                          checked={formData.classIds.includes(cls.id.toString())}
                          onChange={() => toggleClassSelection(cls.id.toString())}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {cls.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.classIds.length} kelas dipilih.
                  </p>
                  {allowedClassLevelsByProgram.size > 0 ? (
                    <p className="text-xs text-blue-600 mt-1">
                      Scope program aktif membatasi tingkat kelas: {Array.from(allowedClassLevelsByProgram).join(', ')}.
                    </p>
                  ) : null}
                </div>
              )}

              {/* Date & Time */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-3">
                  <label htmlFor="sessionId" className="block text-sm font-medium text-gray-700 mb-2">
                    Sesi Ujian (Opsional)
                  </label>
                  <select
                    id="sessionId"
                    name="sessionId"
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
                  <p className="mt-1 text-xs text-gray-500">
                    Pilih dari master sesi agar konsisten. Jika belum ada, tambahkan lewat kolom di atas.
                  </p>
                </div>
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-2">
                    Jam Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="startTime"
                    name="startTime"
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-2">
                    Jam Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="endTime"
                    name="endTime"
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamScheduleManagementPage;
