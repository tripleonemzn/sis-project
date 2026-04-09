import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Calendar,
  Clock,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  X,
} from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useSearchParams } from 'react-router-dom';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import {
  examService,
  type ExamPacket,
  type ExamProgram,
  type ExamProgramSession,
  type QuestionReviewFeedback,
  type ExamScheduleMakeupOverview,
  type ExamScheduleMakeupStudentRow,
} from '../../../services/exam.service';
import { isNonScheduledExamProgram, resolveProgramCodeFromParam } from '../../../lib/examProgramMenu';
import { enhanceQuestionHtml } from '../../../utils/questionMedia';
import { ExamStudentPreviewSurface, type ExamStudentPreviewQuestion } from '../../../components/teacher/exams/ExamStudentPreviewSurface';
import ExamProgramFilterBar from '../../../components/teacher/exams/ExamProgramFilterBar';

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
  periodNumber?: number | null;
  semester?: 'ODD' | 'EVEN' | null;
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
    questionPoolCount?: number;
    blueprintCount?: number;
    questionCardCount?: number;
    author?: {
      id?: number;
      name?: string;
    } | null;
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
  periodNumber: number | null;
  sessionLabel: string | null;
  startTime: string;
  endTime: string;
  schedules: ExamSchedule[];
  totalClasses: number;
  candidateCount: number;
  readyCount: number;
}

interface GroupedScheduleDay {
  dateKey: string;
  dateLabel: string;
  slotCount: number;
  slots: GroupedExamSchedule[];
}

interface ScheduleEditTarget {
  mode: 'single' | 'group';
  scheduleIds: number[];
  targetLabel: string;
  subjectLabel: string;
}

type ReviewableQuestion = ExamStudentPreviewQuestion & {
  blueprint?: {
    competency?: string;
    learningObjective?: string;
    indicator?: string;
    materialScope?: string;
    cognitiveLevel?: string;
  };
  questionCard?: {
    stimulus?: string;
    answerRationale?: string;
    scoringGuideline?: string;
    distractorNotes?: string;
  };
  reviewFeedback?: QuestionReviewFeedback;
};

const PROGRAM_TARGET_CANDIDATE = 'CALON_SISWA';
const DAY_LABELS: Record<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY', string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
  SUNDAY: 'Minggu',
};
const FALLBACK_EXAM_PERIOD_OPTIONS = Array.from({ length: 16 }, (_, index) => ({
  value: String(index + 1),
  label: `Jam Ke-${index + 1}`,
  timeLabel: '',
}));

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

const getExamDayKey = (
  value: string | null | undefined,
):
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'
  | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const dayIndex = parsed.getDay();
  if (dayIndex === 1) return 'MONDAY';
  if (dayIndex === 2) return 'TUESDAY';
  if (dayIndex === 3) return 'WEDNESDAY';
  if (dayIndex === 4) return 'THURSDAY';
  if (dayIndex === 5) return 'FRIDAY';
  if (dayIndex === 6) return 'SATURDAY';
  return 'SUNDAY';
};

const getExamDayLabel = (value: string | null | undefined) => {
  const dayKey = getExamDayKey(value);
  return dayKey ? DAY_LABELS[dayKey] : 'Pilih tanggal dulu';
};

const parseSafeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatSafeDayDateLabel = (value?: string | null) => {
  const date = parseSafeDate(value);
  return date ? format(date, 'EEEE, d MMMM yyyy', { locale: id }) : 'Tanggal belum diatur';
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

const hasFilledText = (value: unknown): boolean => String(value || '').trim().length > 0;

const normalizeReviewQuestions = (rawQuestions: unknown): ReviewableQuestion[] => {
  if (!Array.isArray(rawQuestions)) return [];
  return rawQuestions.map((question, index) => {
    const source = (question && typeof question === 'object' ? question : {}) as Record<string, any>;
    const metadata =
      source.metadata && typeof source.metadata === 'object' ? (source.metadata as Record<string, any>) : {};
    const blueprintSource =
      source.blueprint && typeof source.blueprint === 'object'
        ? (source.blueprint as Record<string, any>)
        : metadata.blueprint && typeof metadata.blueprint === 'object'
          ? (metadata.blueprint as Record<string, any>)
          : {};
    const questionCardSource =
      source.questionCard && typeof source.questionCard === 'object'
        ? (source.questionCard as Record<string, any>)
        : metadata.questionCard && typeof metadata.questionCard === 'object'
          ? (metadata.questionCard as Record<string, any>)
          : {};
    const options = Array.isArray(source.options)
      ? source.options.map((option: any, optionIndex: number) => ({
          id: String(option?.id || `option-${index + 1}-${optionIndex + 1}`),
          content: String(option?.content || option?.option_text || ''),
          image_url:
            typeof option?.image_url === 'string'
              ? option.image_url
              : typeof option?.option_image_url === 'string'
                ? option.option_image_url
                : null,
          option_image_url:
            typeof option?.option_image_url === 'string'
              ? option.option_image_url
              : typeof option?.image_url === 'string'
                ? option.image_url
                : null,
        }))
      : [];

    return {
      id: String(source.id || `question-${index + 1}`),
      type: String(source.type || source.question_type || 'MULTIPLE_CHOICE') as ReviewableQuestion['type'],
      content: String(source.content || source.question_text || ''),
      question_image_url:
        typeof source.question_image_url === 'string'
          ? source.question_image_url
          : typeof source.image_url === 'string'
            ? source.image_url
            : null,
      image_url:
        typeof source.image_url === 'string'
          ? source.image_url
          : typeof source.question_image_url === 'string'
            ? source.question_image_url
            : null,
      question_video_url:
        typeof source.question_video_url === 'string'
          ? source.question_video_url
          : typeof source.video_url === 'string'
            ? source.video_url
            : null,
      video_url:
        typeof source.video_url === 'string'
          ? source.video_url
          : typeof source.question_video_url === 'string'
            ? source.question_video_url
            : null,
      question_video_type:
        source.question_video_type === 'youtube' || source.question_video_type === 'upload'
          ? source.question_video_type
          : null,
      question_media_position: source.question_media_position || 'top',
      options,
      blueprint: {
        competency: String(blueprintSource.competency || ''),
        learningObjective: String(blueprintSource.learningObjective || ''),
        indicator: String(blueprintSource.indicator || ''),
        materialScope: String(blueprintSource.materialScope || ''),
        cognitiveLevel: String(blueprintSource.cognitiveLevel || ''),
      },
      questionCard: {
        stimulus: String(questionCardSource.stimulus || ''),
        answerRationale: String(questionCardSource.answerRationale || ''),
        scoringGuideline: String(questionCardSource.scoringGuideline || ''),
        distractorNotes: String(questionCardSource.distractorNotes || ''),
      },
      reviewFeedback:
        source.reviewFeedback && typeof source.reviewFeedback === 'object'
          ? {
              questionComment: String(source.reviewFeedback.questionComment || ''),
              blueprintComment: String(source.reviewFeedback.blueprintComment || ''),
              questionCardComment: String(source.reviewFeedback.questionCardComment || ''),
              teacherResponse: String(source.reviewFeedback.teacherResponse || ''),
              reviewedAt: String(source.reviewFeedback.reviewedAt || ''),
              teacherRespondedAt: String(source.reviewFeedback.teacherRespondedAt || ''),
              reviewer:
                source.reviewFeedback.reviewer && typeof source.reviewFeedback.reviewer === 'object'
                  ? {
                      id: Number(source.reviewFeedback.reviewer.id || 0) || undefined,
                      name: String(source.reviewFeedback.reviewer.name || ''),
                    }
                  : undefined,
              teacherResponder:
                source.reviewFeedback.teacherResponder && typeof source.reviewFeedback.teacherResponder === 'object'
                  ? {
                      id: Number(source.reviewFeedback.teacherResponder.id || 0) || undefined,
                      name: String(source.reviewFeedback.teacherResponder.name || ''),
                    }
                  : undefined,
            }
          : metadata.reviewFeedback && typeof metadata.reviewFeedback === 'object'
            ? {
                questionComment: String(metadata.reviewFeedback.questionComment || ''),
                blueprintComment: String(metadata.reviewFeedback.blueprintComment || ''),
                questionCardComment: String(metadata.reviewFeedback.questionCardComment || ''),
                teacherResponse: String(metadata.reviewFeedback.teacherResponse || ''),
                reviewedAt: String(metadata.reviewFeedback.reviewedAt || ''),
                teacherRespondedAt: String(metadata.reviewFeedback.teacherRespondedAt || ''),
                reviewer:
                  metadata.reviewFeedback.reviewer && typeof metadata.reviewFeedback.reviewer === 'object'
                    ? {
                        id: Number(metadata.reviewFeedback.reviewer.id || 0) || undefined,
                        name: String(metadata.reviewFeedback.reviewer.name || ''),
                      }
                    : undefined,
                teacherResponder:
                  metadata.reviewFeedback.teacherResponder && typeof metadata.reviewFeedback.teacherResponder === 'object'
                    ? {
                        id: Number(metadata.reviewFeedback.teacherResponder.id || 0) || undefined,
                        name: String(metadata.reviewFeedback.teacherResponder.name || ''),
                      }
                    : undefined,
              }
            : undefined,
    };
  });
};

const ExamScheduleManagementPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const programParamKey = 'jadwalProgram';
  const requestedReviewPacketId = useMemo(
    () => Number(searchParams.get('reviewPacketId') || 0),
    [searchParams],
  );
  const requestedReviewQuestionId = useMemo(
    () => String(searchParams.get('questionId') || '').trim(),
    [searchParams],
  );
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMakeupModal, setShowMakeupModal] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN'>(
    activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD',
  );
  const [expandedScheduleDays, setExpandedScheduleDays] = useState<string[]>([]);
  const [programSessions, setProgramSessions] = useState<ExamProgramSession[]>([]);
  const [newSessionLabel, setNewSessionLabel] = useState('');
  const [newPeriodNumberDraft, setNewPeriodNumberDraft] = useState('');
  const [customPeriodOptions, setCustomPeriodOptions] = useState<number[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [editingScheduleTarget, setEditingScheduleTarget] = useState<ScheduleEditTarget | null>(null);
  const [selectedMakeupSchedule, setSelectedMakeupSchedule] = useState<ExamSchedule | null>(null);
  const [makeupOverview, setMakeupOverview] = useState<ExamScheduleMakeupOverview | null>(null);
  const [loadingMakeup, setLoadingMakeup] = useState(false);
  const [savingMakeup, setSavingMakeup] = useState(false);
  const [makeupSearch, setMakeupSearch] = useState('');
  const [reviewSchedule, setReviewSchedule] = useState<ExamSchedule | null>(null);
  const [reviewPacket, setReviewPacket] = useState<(ExamPacket & { author?: { id?: number; name?: string } | null }) | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewCommentDraft, setReviewCommentDraft] = useState({
    questionComment: '',
    blueprintComment: '',
    questionCardComment: '',
  });
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
  const selectedAcademicYear = activeAcademicYear?.id ? String(activeAcademicYear.id) : '';
  
  const [formData, setFormData] = useState({
    subjectId: '',
    packetId: '',
    classIds: [] as string[],
    date: '',
    startTime: '',
    endTime: '',
    periodNumber: '',
    sessionId: '',
    academicYearId: '',
    semester: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const isEditMode = Boolean(editingScheduleTarget);
  const isSingleEditMode = editingScheduleTarget?.mode === 'single';
  const isGroupEditMode = editingScheduleTarget?.mode === 'group';

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

  const effectiveSemester =
    activeProgram?.fixedSemester ||
    selectedSemester ||
    (activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD');

  const buildScheduleFormData = (overrides: Partial<typeof formData> = {}) => ({
    subjectId: '',
    packetId: '',
    classIds: [] as string[],
    date: '',
    startTime: '',
    endTime: '',
    periodNumber: '',
    sessionId: '',
    academicYearId: selectedAcademicYear || '',
    semester: effectiveSemester,
    ...overrides,
  });

  useEffect(() => {
    if (activeProgram?.fixedSemester) {
      setSelectedSemester(activeProgram.fixedSemester);
      return;
    }
    if (activeAcademicYear?.semester === 'ODD' || activeAcademicYear?.semester === 'EVEN') {
      setSelectedSemester(activeAcademicYear.semester);
    }
  }, [activeAcademicYear?.semester, activeProgram?.fixedSemester]);

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

  const selectedExamDayLabel = useMemo(() => getExamDayLabel(formData.date), [formData.date]);

  const periodOptions = useMemo(() => {
    const collected = new Set<number>();

    schedules.forEach((schedule) => {
      const value = Number(schedule.periodNumber || 0);
      if (Number.isInteger(value) && value > 0) {
        collected.add(value);
      }
    });

    customPeriodOptions.forEach((value) => {
      if (Number.isInteger(value) && value > 0) {
        collected.add(value);
      }
    });

    const currentValue = Number(formData.periodNumber || 0);
    if (Number.isInteger(currentValue) && currentValue > 0) {
      collected.add(currentValue);
    }

    const values = Array.from(collected).sort((left, right) => left - right);
    if (values.length === 0) {
      return FALLBACK_EXAM_PERIOD_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      }));
    }

    return values.map((value) => ({
      value: String(value),
      label: `Jam Ke-${value}`,
    }));
  }, [customPeriodOptions, formData.periodNumber, schedules]);

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
          semester: effectiveSemester,
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
  }, [activeProgramCode, effectiveSemester, selectedAcademicYear]);

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
        scope: 'curriculum',
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
      return;
    }
    setExamPrograms([]);
    setActiveProgramCode('');
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
    if (!showModal) return;
    setFormData((prev) => ({
      ...prev,
      academicYearId: selectedAcademicYear || prev.academicYearId,
      semester: prev.semester || effectiveSemester,
    }));
  }, [effectiveSemester, selectedAcademicYear, showModal]);

  useEffect(() => {
    if (!selectedAcademicYear) return;
    setFormData((prev) =>
      prev.academicYearId === selectedAcademicYear ? prev : { ...prev, academicYearId: selectedAcademicYear },
    );
  }, [selectedAcademicYear]);

  const closeScheduleModal = useCallback(() => {
    setShowModal(false);
    setEditingScheduleTarget(null);
    setNewSessionLabel('');
    setNewPeriodNumberDraft('');
    setCustomPeriodOptions([]);
    setFormData(buildScheduleFormData());
  }, [effectiveSemester, selectedAcademicYear]);

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
    if (!showModal) return;
    if (!formData.periodNumber) return;
    if (periodOptions.some((option) => option.value === formData.periodNumber)) return;
    setFormData((prev) => ({ ...prev, periodNumber: '' }));
  }, [formData.periodNumber, periodOptions, showModal]);

  useEffect(() => {
    setExpandedScheduleDays((prev) =>
      prev.filter((dateKey) => schedules.some((schedule) => toInputDateValue(schedule.startTime) === dateKey)),
    );
  }, [schedules]);

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

    if (!formData.date || !formData.startTime || !formData.endTime || !formData.periodNumber) {
      toast.error('Mohon lengkapi semua field yang wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditMode && editingScheduleTarget) {
        const updatePayload: {
          startTime: string;
          endTime: string;
          periodNumber: number;
          sessionId: number | null;
          subjectId?: number;
          classId?: number | null;
          semester?: 'ODD' | 'EVEN';
          packetId?: number | null;
        } = {
          startTime: `${formData.date}T${formData.startTime}:00`,
          endTime: `${formData.date}T${formData.endTime}:00`,
          periodNumber: parseInt(formData.periodNumber, 10),
          sessionId: formData.sessionId ? parseInt(formData.sessionId, 10) : null,
        };

        if (isSingleEditMode) {
          if (!formData.subjectId) {
            toast.error('Mapel wajib dipilih.');
            setSubmitting(false);
            return;
          }
          if (!isCandidateAudienceProgram && formData.classIds.length !== 1) {
            toast.error('Pilih tepat satu kelas untuk jadwal yang sedang diedit.');
            setSubmitting(false);
            return;
          }
          if (isCandidateAudienceProgram && !formData.packetId) {
            toast.error('Pilih packet soal untuk jadwal calon siswa.');
            setSubmitting(false);
            return;
          }

          updatePayload.subjectId = parseInt(formData.subjectId, 10);
          updatePayload.classId =
            !isCandidateAudienceProgram && formData.classIds[0]
              ? parseInt(formData.classIds[0], 10)
              : null;
          updatePayload.semester = (activeProgram?.fixedSemester || formData.semester || effectiveSemester) as 'ODD' | 'EVEN';
          updatePayload.packetId = formData.packetId ? parseInt(formData.packetId, 10) : null;
        }

        for (const scheduleId of editingScheduleTarget.scheduleIds) {
          await examService.updateSchedule(scheduleId, updatePayload);
        }

        toast.success(
          editingScheduleTarget.scheduleIds.length > 1
            ? 'Jadwal grup berhasil diperbarui'
            : 'Jadwal ujian berhasil diperbarui',
        );
        closeScheduleModal();
        void fetchSchedules();
        return;
      }

      if (!formData.subjectId || !formData.academicYearId) {
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

      const payload = {
        subjectId: parseInt(formData.subjectId, 10),
        packetId: formData.packetId ? parseInt(formData.packetId, 10) : undefined,
        classIds: formData.classIds.map(id => parseInt(id, 10)),
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        periodNumber: parseInt(formData.periodNumber, 10),
        sessionId: formData.sessionId ? parseInt(formData.sessionId, 10) : null,
        examType: activeProgramCode,
        programCode: activeProgramCode,
        academicYearId: parseInt(formData.academicYearId, 10),
        semester: activeProgram?.fixedSemester || formData.semester || effectiveSemester
      };

      await api.post('/exams/schedules', payload);

      toast.success('Jadwal ujian berhasil dibuat');
      closeScheduleModal();
      void fetchSchedules();
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || (isEditMode ? 'Gagal memperbarui jadwal' : 'Gagal menyimpan jadwal'));
    } finally {
      setSubmitting(false);
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

  const openCreateScheduleModal = () => {
    setEditingScheduleTarget(null);
    setNewSessionLabel('');
    setFormData(buildScheduleFormData());
    setShowModal(true);
  };

  const openEditScheduleModal = (targetSchedules: ExamSchedule[], mode: 'single' | 'group') => {
    if (!Array.isArray(targetSchedules) || targetSchedules.length === 0) return;
    const primary = targetSchedules[0];
    const targetLabel =
      mode === 'group'
        ? `${targetSchedules.length} target dalam slot ini`
        : primary.class?.name || 'Calon Siswa';
    const subjectLabel = primary.subject?.name || primary.packet?.subject?.name || '-';

    setEditingScheduleTarget({
      mode,
      scheduleIds: targetSchedules.map((schedule) => Number(schedule.id)).filter((id) => Number.isFinite(id) && id > 0),
      targetLabel,
      subjectLabel,
    });
    setNewSessionLabel('');
    setFormData(
      buildScheduleFormData({
        subjectId: primary.subject?.id ? String(primary.subject.id) : '',
        packetId: primary.packet?.id ? String(primary.packet.id) : '',
        classIds:
          mode === 'single'
            ? [String(primary.classId || '').trim()].filter((value): value is string => Boolean(value))
            : targetSchedules
                .map((schedule) => String(schedule.classId || '').trim())
                .filter((value): value is string => Boolean(value)),
        date: toInputDateValue(primary.startTime),
        startTime: toInputTimeValue(primary.startTime),
        endTime: toInputTimeValue(primary.endTime),
        periodNumber: primary.periodNumber ? String(primary.periodNumber) : '',
        sessionId: primary.sessionId ? String(primary.sessionId) : '',
        academicYearId: String(primary.academicYearId || selectedAcademicYear || ''),
        semester: (primary.semester as 'ODD' | 'EVEN' | undefined) || effectiveSemester,
      }),
    );
    setShowModal(true);
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

  const handleAddPeriodOption = () => {
    const parsed = Number(newPeriodNumberDraft);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error('Jam ke baru harus berupa angka bulat positif.');
      return;
    }
    setCustomPeriodOptions((prev) => (prev.includes(parsed) ? prev : [...prev, parsed].sort((a, b) => a - b)));
    setFormData((prev) => ({ ...prev, periodNumber: String(parsed) }));
    setNewPeriodNumberDraft('');
  };

  const toggleScheduleDay = (dateKey: string) => {
    setExpandedScheduleDays((prev) =>
      prev.includes(dateKey) ? prev.filter((item) => item !== dateKey) : [...prev, dateKey],
    );
  };

  const resolveScheduleSessionLabel = (schedule: ExamSchedule): string | null => {
    return String(schedule.programSession?.label || schedule.sessionLabel || '').trim() || null;
  };

  const getGroupedSchedules = (): GroupedExamSchedule[] => {
    const groups: Record<string, GroupedExamSchedule> = {};

    schedules.forEach(schedule => {
      const subjectId = schedule.subject?.id || schedule.subject?.name || 'unknown';
      const periodNumber = Number(schedule.periodNumber || 0) || null;
      const timeKey = `${schedule.startTime}-${schedule.endTime}`;
      const dateKey = toInputDateValue(schedule.startTime);
      const normalizedSessionLabel = resolveScheduleSessionLabel(schedule);
      const key = `${subjectId}-${dateKey}-${periodNumber || 'NO_PERIOD'}-${timeKey}-${normalizedSessionLabel || '__NO_SESSION__'}`;

      if (!groups[key]) {
        groups[key] = {
          key,
          subjectName: schedule.subject?.name || schedule.packet?.subject?.name || (schedule.packet ? 'Unknown Subject' : 'Jadwal Tanpa Soal'),
          subjectCode: schedule.subject?.code || '-',
          periodNumber,
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
      if (schedule.packet && Number(schedule.packet.questionPoolCount || 0) > 0) {
        groups[key].readyCount++;
      }
    });

    // Sort by startTime
    return Object.values(groups).sort((a, b) => {
      const byTime = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      if (byTime !== 0) return byTime;
      const byPeriod = Number(a.periodNumber || Number.MAX_SAFE_INTEGER) - Number(b.periodNumber || Number.MAX_SAFE_INTEGER);
      if (byPeriod !== 0) return byPeriod;
      return String(a.sessionLabel || '').localeCompare(String(b.sessionLabel || ''), 'id');
    });
  };

  const groupedSchedules = getGroupedSchedules();
  const groupedScheduleDays = useMemo<GroupedScheduleDay[]>(() => {
    const grouped = new Map<string, GroupedScheduleDay>();

    groupedSchedules.forEach((slot) => {
      const dateKey = toInputDateValue(slot.startTime) || '__no_date__';
      const existing = grouped.get(dateKey);
      const dateLabel = formatSafeDayDateLabel(slot.startTime);
      if (existing) {
        existing.slots.push(slot);
        existing.slotCount = existing.slots.length;
        return;
      }

      grouped.set(dateKey, {
        dateKey,
        dateLabel,
        slotCount: 1,
        slots: [slot],
      });
    });

    return Array.from(grouped.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  }, [groupedSchedules]);
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

  const reviewQuestions = useMemo(
    () => normalizeReviewQuestions(reviewPacket?.questions),
    [reviewPacket?.questions],
  );
  const activeReviewQuestion =
    reviewQuestions.length > 0 && reviewQuestionIndex >= 0 && reviewQuestionIndex < reviewQuestions.length
      ? reviewQuestions[reviewQuestionIndex]
      : null;
  const reviewBlueprintCount = reviewQuestions.filter((question) =>
    Boolean(
      hasFilledText(question.blueprint?.competency) ||
        hasFilledText(question.blueprint?.learningObjective) ||
        hasFilledText(question.blueprint?.indicator) ||
        hasFilledText(question.blueprint?.materialScope) ||
        hasFilledText(question.blueprint?.cognitiveLevel),
    ),
  ).length;
  const reviewQuestionCardCount = reviewQuestions.filter((question) =>
    Boolean(
      hasFilledText(question.questionCard?.stimulus) ||
        hasFilledText(question.questionCard?.answerRationale) ||
        hasFilledText(question.questionCard?.scoringGuideline) ||
        hasFilledText(question.questionCard?.distractorNotes),
    ),
  ).length;

  useEffect(() => {
    setReviewCommentDraft({
      questionComment: String(activeReviewQuestion?.reviewFeedback?.questionComment || ''),
      blueprintComment: String(activeReviewQuestion?.reviewFeedback?.blueprintComment || ''),
      questionCardComment: String(activeReviewQuestion?.reviewFeedback?.questionCardComment || ''),
    });
  }, [activeReviewQuestion?.id, activeReviewQuestion?.reviewFeedback]);

  const openReviewModal = async (schedule: ExamSchedule) => {
    const packetId = Number(schedule.packet?.id || 0);
    if (!packetId) {
      toast.error('Paket soal belum tersedia untuk direview.');
      return;
    }

    setReviewSchedule(schedule);
    setReviewLoading(true);
    setReviewQuestionIndex(0);
    setReviewPacket(null);
    try {
      const response = await examService.getPacketById(packetId);
      setReviewPacket(response.data as ExamPacket & { author?: { id?: number; name?: string } | null });
    } catch (error) {
      console.error('Error loading packet review:', error);
      toast.error(getErrorMessage(error, 'Gagal memuat butir soal guru.'));
      setReviewSchedule(null);
    } finally {
      setReviewLoading(false);
    }
  };

  const closeReviewModal = () => {
    setReviewSchedule(null);
    setReviewPacket(null);
    setReviewLoading(false);
    setReviewSubmitting(false);
    setReviewQuestionIndex(0);
    setReviewCommentDraft({
      questionComment: '',
      blueprintComment: '',
      questionCardComment: '',
    });
    if (requestedReviewPacketId || requestedReviewQuestionId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('reviewPacketId');
      nextParams.delete('questionId');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const saveReviewComment = async () => {
    const packetId = Number(reviewPacket?.id || reviewSchedule?.packet?.id || 0);
    const questionId = String(activeReviewQuestion?.id || '').trim();
    if (!packetId || !questionId) {
      toast.error('Butir soal belum tersedia untuk dikomentari.');
      return;
    }

    setReviewSubmitting(true);
    try {
      const response = await examService.updatePacketReviewFeedback(packetId, {
        questionId,
        questionComment: reviewCommentDraft.questionComment,
        blueprintComment: reviewCommentDraft.blueprintComment,
        questionCardComment: reviewCommentDraft.questionCardComment,
      });
      const nextFeedback = response.data?.reviewFeedback || null;
      setReviewPacket((current) => {
        if (!current?.questions) return current;
        return {
          ...current,
          questions: current.questions.map((question) =>
            String(question.id || '') === questionId
              ? {
                  ...question,
                  reviewFeedback: nextFeedback || undefined,
                  metadata: {
                    ...(question.metadata || {}),
                    reviewFeedback: nextFeedback || undefined,
                  },
                }
              : question,
          ),
        };
      });
      window.dispatchEvent(new CustomEvent('sis:notifications:refresh'));
      toast.success('Catatan review berhasil dikirim ke guru.');
    } catch (error) {
      console.error('Error saving review feedback:', error);
      toast.error(getErrorMessage(error, 'Gagal mengirim catatan review.'));
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    if (!requestedReviewPacketId || reviewSchedule || reviewLoading || schedules.length === 0) return;
    const matchedSchedule = schedules.find(
      (schedule) => Number(schedule.packet?.id || 0) === requestedReviewPacketId,
    );
    if (!matchedSchedule) return;
    void openReviewModal(matchedSchedule);
  }, [requestedReviewPacketId, reviewSchedule, reviewLoading, schedules]);

  useEffect(() => {
    if (!requestedReviewQuestionId || reviewQuestions.length === 0) return;
    const matchedIndex = reviewQuestions.findIndex(
      (question) => String(question.id || '').trim() === requestedReviewQuestionId,
    );
    if (matchedIndex >= 0 && matchedIndex !== reviewQuestionIndex) {
      setReviewQuestionIndex(matchedIndex);
    }
  }, [requestedReviewQuestionId, reviewQuestions, reviewQuestionIndex]);

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
              onClick={openCreateScheduleModal}
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
          <div className="space-y-4 p-4">
            {groupedScheduleDays.map((day) => {
              const isDayExpanded = expandedScheduleDays.includes(day.dateKey);
              return (
                <div key={day.dateKey} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleScheduleDay(day.dateKey)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{day.dateLabel}</h3>
                      <p className="mt-1 text-sm text-gray-500">{day.slotCount} slot jadwal pada hari ini</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {Array.from(new Set(day.slots.map((slot) => slot.subjectName))).join(' • ')}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-blue-700">
                      {isDayExpanded ? 'Tutup Hari' : 'Buka Hari'}
                    </span>
                  </button>

                  {isDayExpanded ? (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                      {day.slots.map((group) => {
                        const isAllReady = group.readyCount === group.totalClasses;
                        const isNoneReady = group.readyCount === 0;
                        const totalTargetLabel =
                          group.candidateCount > 0
                            ? group.candidateCount === group.totalClasses
                              ? 'Calon Siswa'
                              : `${group.totalClasses - group.candidateCount} Kelas + ${group.candidateCount} Calon`
                            : `${group.totalClasses} Kelas`;

                        return (
                          <div key={group.key} className="rounded-xl border border-blue-100 bg-white">
                            <div className="flex flex-col gap-4 border-b border-blue-50 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-lg font-semibold text-gray-900">
                                    {group.subjectName}
                                    {group.subjectCode && group.subjectCode !== '-' ? ` (${group.subjectCode})` : ''}
                                  </h4>
                                  <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                    {group.periodNumber ? `Jam Ke-${group.periodNumber}` : 'Jam ke belum diatur'}
                                  </span>
                                  {group.sessionLabel ? (
                                    <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                                      {group.sessionLabel}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                  <span className="inline-flex items-center">
                                    <Clock className="mr-1 h-4 w-4" />
                                    {format(new Date(group.startTime), 'HH:mm')} - {format(new Date(group.endTime), 'HH:mm')}
                                  </span>
                                  <span>{totalTargetLabel}</span>
                                  <span className={isAllReady ? 'text-green-700' : isNoneReady ? 'text-red-700' : 'text-orange-700'}>
                                    {group.readyCount}/{group.totalClasses} siap
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditScheduleModal(group.schedules, 'group')}
                                  className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
                                  title="Edit Grup Jadwal"
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Hapus semua jadwal ${group.subjectName}?`)) {
                                      Promise.all(group.schedules.map((schedule) => api.delete(`/exams/schedules/${schedule.id}`)))
                                        .then(() => {
                                          toast.success('Semua jadwal berhasil dihapus');
                                          setSchedules((prev) =>
                                            prev.filter((schedule) => !group.schedules.find((groupSchedule) => groupSchedule.id === schedule.id)),
                                          );
                                        })
                                        .catch(() => toast.error('Gagal menghapus beberapa jadwal'));
                                    }
                                  }}
                                  className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-800"
                                  title="Hapus Semua Jadwal Grup Ini"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
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
                                    .map((schedule) => {
                                      const questionPoolCount = Number(schedule.packet?.questionPoolCount || 0);
                                      const blueprintCount = Number(schedule.packet?.blueprintCount || 0);
                                      const questionCardCount = Number(schedule.packet?.questionCardCount || 0);
                                      const isScheduleReady = Boolean(schedule.packet && questionPoolCount > 0);
                                      return (
                                        <tr key={schedule.id} className="hover:bg-gray-50">
                                          <td className="px-4 py-2 font-medium text-gray-900">
                                            {schedule.class?.name || 'Calon Siswa'}
                                          </td>
                                          <td className="px-4 py-2">
                                            {resolveScheduleSessionLabel(schedule) ? (
                                              <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                                {resolveScheduleSessionLabel(schedule)}
                                              </span>
                                            ) : (
                                              <span className="text-xs text-gray-400">Tanpa sesi</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2">
                                            <div className="space-y-1.5">
                                              {isScheduleReady ? (
                                                <span className="inline-flex rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                                                  Tersedia: {schedule.packet?.title}
                                                </span>
                                              ) : schedule.packet ? (
                                                <span className="inline-flex rounded bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                                                  Paket dibuat, menunggu guru isi soal
                                                </span>
                                              ) : (
                                                <span className="inline-flex rounded bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                                                  Menunggu Guru
                                                </span>
                                              )}
                                              {schedule.packet ? (
                                                <div className="flex flex-wrap gap-1">
                                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                                    {questionPoolCount} soal
                                                  </span>
                                                  <span
                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                      blueprintCount > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                                                    }`}
                                                  >
                                                    Kisi-kisi {blueprintCount}
                                                  </span>
                                                  <span
                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                      questionCardCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                    }`}
                                                  >
                                                    Kartu Soal {questionCardCount}
                                                  </span>
                                                </div>
                                              ) : null}
                                            </div>
                                          </td>
                                          <td className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                              {schedule.packet?.id ? (
                                                <button
                                                  type="button"
                                                  onClick={() => void openReviewModal(schedule)}
                                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                  Review Soal
                                                </button>
                                              ) : null}
                                              {schedule.class?.name ? (
                                                <button
                                                  type="button"
                                                  onClick={() => void openMakeupModal(schedule)}
                                                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                                >
                                                  Kelola Susulan
                                                </button>
                                              ) : null}
                                              <button
                                                type="button"
                                                onClick={() => openEditScheduleModal([schedule], 'single')}
                                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                              >
                                                Edit Jadwal
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleDelete(schedule.id)}
                                                className="rounded p-1 text-red-600 hover:bg-red-50 hover:text-red-800"
                                                title="Hapus Jadwal"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reviewSchedule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Review Butir Soal Guru</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Wakasek Kurikulum / sekretaris dapat meninjau kesiapan soal, kisi-kisi, dan kartu soal tanpa mengubah isi paket.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mapel</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {reviewPacket?.subject?.name || reviewSchedule.subject?.name || '-'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Penyusun</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {reviewPacket?.author?.name || 'Guru sesuai assignment'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Kisi-kisi</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {reviewBlueprintCount}/{reviewQuestions.length} soal terisi
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Kartu Soal</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {reviewQuestionCardCount}/{reviewQuestions.length} soal terisi
                  </div>
                </div>
              </div>

              {reviewLoading ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
                  Memuat butir soal guru...
                </div>
              ) : reviewQuestions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
                  Paket ini sudah terhubung ke jadwal, tetapi guru belum mengisi butir soal.
                </div>
              ) : (
                <div className="space-y-5">
                  <ExamStudentPreviewSurface
                    title={reviewPacket?.title || reviewSchedule.packet?.title || 'Paket Soal'}
                    subjectName={reviewPacket?.subject?.name || reviewSchedule.subject?.name || '-'}
                    instructions={reviewPacket?.instructions || ''}
                    questions={reviewQuestions}
                    activeQuestionIndex={reviewQuestionIndex}
                    onActiveQuestionIndexChange={setReviewQuestionIndex}
                  />

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Kisi-kisi</p>
                          <h3 className="text-sm font-semibold text-slate-900">
                            Soal {reviewQuestionIndex + 1}
                          </h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          activeReviewQuestion && (
                            hasFilledText(activeReviewQuestion.blueprint?.competency) ||
                            hasFilledText(activeReviewQuestion.blueprint?.learningObjective) ||
                            hasFilledText(activeReviewQuestion.blueprint?.indicator) ||
                            hasFilledText(activeReviewQuestion.blueprint?.materialScope) ||
                            hasFilledText(activeReviewQuestion.blueprint?.cognitiveLevel)
                          )
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-500'
                        }`}>
                          {activeReviewQuestion && (
                            hasFilledText(activeReviewQuestion.blueprint?.competency) ||
                            hasFilledText(activeReviewQuestion.blueprint?.learningObjective) ||
                            hasFilledText(activeReviewQuestion.blueprint?.indicator) ||
                            hasFilledText(activeReviewQuestion.blueprint?.materialScope) ||
                            hasFilledText(activeReviewQuestion.blueprint?.cognitiveLevel)
                          ) ? 'Terisi' : 'Belum diisi'}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm text-slate-700">
                        {[
                          ['Kompetensi/Capaian', activeReviewQuestion?.blueprint?.competency],
                          ['Tujuan Pembelajaran', activeReviewQuestion?.blueprint?.learningObjective],
                          ['Indikator Soal', activeReviewQuestion?.blueprint?.indicator],
                          ['Ruang Lingkup Materi', activeReviewQuestion?.blueprint?.materialScope],
                          ['Level Kognitif', activeReviewQuestion?.blueprint?.cognitiveLevel],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="grid grid-cols-[180px_12px_minmax(0,1fr)] gap-x-2">
                            <span className="text-slate-600">{label}</span>
                            <span className="text-slate-400">:</span>
                            <span className="text-slate-900">{hasFilledText(value) ? String(value) : '-'}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">Kartu Soal</p>
                          <h3 className="text-sm font-semibold text-slate-900">
                            Soal {reviewQuestionIndex + 1}
                          </h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          activeReviewQuestion && (
                            hasFilledText(activeReviewQuestion.questionCard?.stimulus) ||
                            hasFilledText(activeReviewQuestion.questionCard?.answerRationale) ||
                            hasFilledText(activeReviewQuestion.questionCard?.scoringGuideline) ||
                            hasFilledText(activeReviewQuestion.questionCard?.distractorNotes)
                          )
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-slate-500'
                        }`}>
                          {activeReviewQuestion && (
                            hasFilledText(activeReviewQuestion.questionCard?.stimulus) ||
                            hasFilledText(activeReviewQuestion.questionCard?.answerRationale) ||
                            hasFilledText(activeReviewQuestion.questionCard?.scoringGuideline) ||
                            hasFilledText(activeReviewQuestion.questionCard?.distractorNotes)
                          ) ? 'Terisi' : 'Belum diisi'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {[
                          ['Stimulus Soal', activeReviewQuestion?.questionCard?.stimulus],
                          ['Pembahasan / Alasan Jawaban', activeReviewQuestion?.questionCard?.answerRationale],
                          ['Pedoman Penskoran', activeReviewQuestion?.questionCard?.scoringGuideline],
                          ['Catatan Distraktor', activeReviewQuestion?.questionCard?.distractorNotes],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-2xl border border-emerald-100 bg-white/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{label}</p>
                            <div
                              className="mt-2 text-sm text-slate-800 [&_ol]:ml-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:ml-2 [&_ul]:list-disc [&_ul]:pl-6"
                              dangerouslySetInnerHTML={{
                                __html: hasFilledText(value)
                                  ? enhanceQuestionHtml(String(value), { useQuestionImageThumbnail: false })
                                  : '-',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Catatan Review Kurikulum</p>
                        <h3 className="mt-1 text-sm font-semibold text-slate-900">
                          Soal {reviewQuestionIndex + 1}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600">
                          Catatan akan dikirim ke guru penyusun sesuai paket terjadwal, lalu muncul juga saat guru membuka editor soal.
                        </p>
                      </div>
                      {activeReviewQuestion?.reviewFeedback?.reviewedAt ? (
                        <div className="text-xs text-slate-500">
                          {activeReviewQuestion.reviewFeedback.reviewer?.name
                            ? `Terakhir oleh ${activeReviewQuestion.reviewFeedback.reviewer.name}`
                            : 'Catatan sudah tersimpan'}
                          {' • '}
                          {activeReviewQuestion.reviewFeedback.reviewedAt}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-amber-700">
                          Catatan Soal
                        </label>
                        <textarea
                          value={reviewCommentDraft.questionComment}
                          onChange={(event) =>
                            setReviewCommentDraft((current) => ({
                              ...current,
                              questionComment: event.target.value,
                            }))
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
                          placeholder="Tulis komentar bila redaksi soal, stimulus, atau kunci jawaban perlu diperbaiki."
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-amber-700">
                          Catatan Kisi-kisi
                        </label>
                        <textarea
                          value={reviewCommentDraft.blueprintComment}
                          onChange={(event) =>
                            setReviewCommentDraft((current) => ({
                              ...current,
                              blueprintComment: event.target.value,
                            }))
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
                          placeholder="Tulis komentar bila pemetaan kisi-kisi belum sesuai."
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-amber-700">
                          Catatan Kartu Soal
                        </label>
                        <textarea
                          value={reviewCommentDraft.questionCardComment}
                          onChange={(event) =>
                            setReviewCommentDraft((current) => ({
                              ...current,
                              questionCardComment: event.target.value,
                            }))
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
                          placeholder="Tulis komentar bila kartu soal atau pembahasan belum sesuai."
                        />
                      </div>
                    </div>

                    {activeReviewQuestion?.reviewFeedback?.teacherResponse ? (
                      <div className="mt-4 rounded-2xl border border-blue-200 bg-white/90 px-4 py-3 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">Balasan Guru</p>
                          {activeReviewQuestion.reviewFeedback.teacherResponder?.name || activeReviewQuestion.reviewFeedback.teacherRespondedAt ? (
                            <div className="text-[11px] text-slate-500">
                              {activeReviewQuestion.reviewFeedback.teacherResponder?.name
                                ? `Terakhir oleh ${activeReviewQuestion.reviewFeedback.teacherResponder.name}`
                                : 'Balasan tersimpan'}
                              {activeReviewQuestion.reviewFeedback.teacherRespondedAt
                                ? ` • ${activeReviewQuestion.reviewFeedback.teacherRespondedAt}`
                                : ''}
                            </div>
                          ) : null}
                        </div>
                        <p className="mt-2 leading-6">{activeReviewQuestion.reviewFeedback.teacherResponse}</p>
                      </div>
                    ) : null}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveReviewComment()}
                        disabled={reviewSubmitting}
                        className="inline-flex items-center rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                      >
                        {reviewSubmitting ? 'Mengirim Catatan...' : 'Kirim Catatan ke Guru'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
                {isEditMode
                  ? `Edit Jadwal Ujian ${activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}`
                  : `Buat Jadwal Ujian ${activeProgram?.shortLabel || activeProgram?.label || activeProgramCode}`}
              </h2>
              <button 
                onClick={closeScheduleModal}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {isEditMode && editingScheduleTarget ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-800">
                  <div className="font-semibold">Mode Edit Jadwal Existing</div>
                  <div className="mt-1">
                    Mapel: <span className="font-medium">{editingScheduleTarget.subjectLabel}</span>
                  </div>
                  <div className="mt-1">
                    Target: <span className="font-medium">{editingScheduleTarget.targetLabel}</span>
                  </div>
                  <p className="mt-2 text-xs text-blue-700">
                    {isSingleEditMode
                      ? 'Mode ini boleh mengubah semester, mapel, kelas, tanggal, jam ke, waktu ujian, dan sesi selama jadwal belum dipakai sesi ujian siswa.'
                      : 'Mode edit grup dipakai untuk merapikan slot bersama seperti tanggal, jam ke, waktu ujian, dan sesi. Untuk ganti mapel atau kelas, gunakan Edit Jadwal pada target yang spesifik.'}
                  </p>
                </div>
              ) : null}
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
                    disabled={isGroupEditMode}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                  {isGroupEditMode ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Semester grup mengikuti slot yang sedang diedit. Gunakan edit per target jika perlu memindahkan semester jadwal tertentu.
                    </p>
                  ) : null}
                </div>
              )}

              <div>
                <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700 mb-1.5">Mata Pelajaran</label>
                <div className="relative">
                  <select
                    id="subjectId"
                    value={formData.subjectId}
                    onChange={e => setFormData({...formData, subjectId: e.target.value})}
                    disabled={isGroupEditMode}
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
                      disabled={isGroupEditMode}
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
              ) : isGroupEditMode ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-sm font-medium text-gray-800">Target Kelas</div>
                  <p className="mt-1 text-sm text-gray-600">
                    Edit grup mempertahankan target kelas yang sudah ada di slot ini: {editingScheduleTarget?.targetLabel || '-'}.
                  </p>
                </div>
              ) : isSingleEditMode ? (
                <div>
                  <label htmlFor="singleClassId" className="block text-sm font-medium text-gray-700 mb-2">
                    Kelas <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="singleClassId"
                    value={formData.classIds[0] || ''}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        classIds: event.target.value ? [event.target.value] : [],
                      }))
                    }
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Pilih kelas...</option>
                    {filteredClasses.map((cls) => (
                      <option key={cls.id} value={cls.id.toString()}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Gunakan edit per target untuk memindahkan jadwal ini ke kelas lain yang masih sesuai scope program.
                  </p>
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
                        onChange={(e) => {
                          toggleAllClasses(e.target.checked);
                        }}
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
                          onChange={() => {
                            toggleClassSelection(cls.id.toString());
                          }}
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
              <div className="space-y-4">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hari</label>
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {selectedExamDayLabel}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Hari otomatis mengikuti tanggal ujian yang dipilih.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="periodNumber" className="block text-sm font-medium text-gray-700 mb-2">
                      Jam Ke <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="periodNumber"
                      name="periodNumber"
                      required
                      value={formData.periodNumber}
                      onChange={(e) => setFormData({ ...formData, periodNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Pilih jam ke...</option>
                      {periodOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={newPeriodNumberDraft}
                        onChange={(event) => setNewPeriodNumberDraft(event.target.value)}
                        placeholder="Tambah jam ke baru"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddPeriodOption}
                        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      >
                        Tambah
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Jam ke dipakai sebagai urutan slot ujian. Tambahkan nomor baru sesuai kebutuhan, lalu atur waktu ujian aktual di bawahnya.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeScheduleModal}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? 'Menyimpan...' : isEditMode ? 'Simpan Perubahan' : 'Simpan Jadwal'}
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
