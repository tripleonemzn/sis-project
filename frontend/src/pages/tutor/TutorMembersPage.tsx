import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  tutorService,
  type ExtracurricularGradeTemplate,
  type ExtracurricularAttendanceStatus,
  type TutorAssignmentSummary,
} from '../../services/tutor.service';
import { academicYearService } from '../../services/academicYear.service';
import { examService, type ExamProgram } from '../../services/exam.service';
import { Trophy, Save, Loader2, Filter, ClipboardCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
  getExtracurricularTutorAssignments,
  getOsisTutorAssignments,
} from '../../features/tutor/tutorAccess';

type Semester = 'ODD' | 'EVEN';

interface AcademicYear {
  id: number;
  name: string;
  isActive: boolean;
}

interface Ekskul {
  id: number;
  name: string;
}

interface TutorAssignment {
  id: number;
  tutorId: number;
  ekskulId: number;
  academicYearId: number;
  isActive: boolean;
  ekskul: Ekskul;
  academicYear: AcademicYear;
}

interface StudentClass {
  name: string;
}

interface Student {
  id: number;
  name: string;
  nis: string | null;
  nisn: string | null;
  studentClass: StudentClass | null;
}

interface Enrollment {
  id: number;
  ekskulId: number;
  studentId: number;
  academicYearId: number;
  grade: string | null;
  description: string | null;
  gradeSbtsOdd: string | null;
  descSbtsOdd: string | null;
  gradeSas: string | null;
  descSas: string | null;
  gradeSbtsEven: string | null;
  descSbtsEven: string | null;
  gradeSat: string | null;
  descSat: string | null;
  student: Student;
}

interface ReportProgramOption {
  code: string;
  label: string;
  baseType: string;
  gradeComponentType: string;
  fixedSemester: Semester | null;
  displayOrder: number;
}

type GradePredicate = 'SB' | 'B' | 'C' | 'K';
type PageTab = 'GRADE' | 'ATTENDANCE';

interface AttendanceOverview {
  assignmentId: number;
  ekskulId: number;
  academicYearId: number;
  weekKey: string;
  sessionsPerWeek: number;
  records: Array<{
    enrollmentId: number;
    sessionIndex: number;
    status: ExtracurricularAttendanceStatus;
    note?: string;
  }>;
}

const DEFAULT_GRADE_TEMPLATES: ExtracurricularGradeTemplate = {
  SB: { label: 'Sangat Baik (SB)', description: '' },
  B: { label: 'Baik (B)', description: '' },
  C: { label: 'Cukup (C)', description: '' },
  K: { label: 'Kurang (K)', description: '' },
};

const ATTENDANCE_STATUS_OPTIONS: Array<{
  value: ExtracurricularAttendanceStatus;
  label: string;
}> = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'PERMIT', label: 'Izin' },
  { value: 'SICK', label: 'Sakit' },
  { value: 'ABSENT', label: 'Alpa' },
];

function getCurrentWeekKey(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function normalizeProgramCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isMidtermAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(code)) return true;
  return code.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(code)) return true;
  return code.includes('EVEN');
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('ODD');
}

function isFinalAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('FINAL');
}

function resolveTutorReportSlot(
  program: ReportProgramOption | null | undefined,
  semester: Semester,
): 'SBTS' | 'SAS' | 'SAT' | '' {
  if (!program) return '';
  const componentType = normalizeProgramCode(program.gradeComponentType);
  if (isMidtermAliasCode(componentType)) return 'SBTS';
  if (isFinalAliasCode(componentType)) {
    const fixedSemester = program.fixedSemester || null;
    if (fixedSemester === 'EVEN') return 'SAT';
    if (fixedSemester === 'ODD') return 'SAS';
    return semester === 'EVEN' ? 'SAT' : 'SAS';
  }
  const baseType = normalizeProgramCode(program.baseType);
  if (isFinalEvenAliasCode(baseType)) return 'SAT';
  if (isFinalOddAliasCode(baseType)) return 'SAS';
  if (isFinalAliasCode(baseType)) return semester === 'EVEN' ? 'SAT' : 'SAS';
  if (isMidtermAliasCode(baseType)) return 'SBTS';
  return '';
}

function formatProgramSemesterLabel(fixedSemester: Semester | null): string {
  if (fixedSemester === 'ODD') return 'Semester Ganjil';
  if (fixedSemester === 'EVEN') return 'Semester Genap';
  return 'Semua Semester';
}

export const TutorMembersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedScope = searchParams.get('scope') === 'osis' ? 'osis' : 'extracurricular';
  const [activeTab, setActiveTab] = useState<PageTab>('GRADE');
  const [semester, setSemester] = useState<Semester>('ODD');
  const [reportType, setReportType] = useState('');
  const [attendanceWeekKey, setAttendanceWeekKey] = useState(getCurrentWeekKey());
  const [selectedAcademicYearIdState, setSelectedAcademicYearIdState] = useState<number | null>(null);
  const [selectedAssignmentIdState, setSelectedAssignmentIdState] = useState<number | null>(null);
  const [attendanceSessionsPerWeekDraft, setAttendanceSessionsPerWeekDraft] = useState(1);
  const [attendanceEdits, setAttendanceEdits] = useState<Record<number, Record<number, ExtracurricularAttendanceStatus | ''>>>({});

  const { data: academicYearData } = useQuery({
    queryKey: ['academic-years', 'active'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears = useMemo<AcademicYear[]>(
    () =>
      (academicYearData?.data?.academicYears || academicYearData?.academicYears || []) as AcademicYear[],
    [academicYearData],
  );
  
  const activeAcademicYear = useMemo(() => {
    return academicYears.find((ay) => ay.isActive) || academicYears[0];
  }, [academicYears]);
  const requestedAcademicYearId = Number(searchParams.get('academicYearId') || 0);
  const selectedAcademicYearId = useMemo(() => {
    if (
      selectedAcademicYearIdState &&
      academicYears.some((year) => Number(year.id) === Number(selectedAcademicYearIdState))
    ) {
      return selectedAcademicYearIdState;
    }
    if (
      requestedAcademicYearId &&
      academicYears.some((year) => Number(year.id) === Number(requestedAcademicYearId))
    ) {
      return requestedAcademicYearId;
    }
    return activeAcademicYear?.id ?? null;
  }, [academicYears, activeAcademicYear?.id, requestedAcademicYearId, selectedAcademicYearIdState]);

  // Fetch assignments for the selected academic year to populate Ekskul dropdown
  const { data: assignmentsData } = useQuery({
    queryKey: ['tutor-assignments', selectedAcademicYearId],
    queryFn: () => tutorService.getAssignments(selectedAcademicYearId!),
    enabled: !!selectedAcademicYearId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Type assertion for API response
  const assignments = useMemo<TutorAssignment[]>(
    () => (assignmentsData?.data || []) as TutorAssignment[],
    [assignmentsData],
  );
  const visibleAssignments = useMemo<TutorAssignmentSummary[]>(
    () =>
      selectedScope === 'osis'
        ? getOsisTutorAssignments(assignments as TutorAssignmentSummary[])
        : getExtracurricularTutorAssignments(assignments as TutorAssignmentSummary[]),
    [assignments, selectedScope],
  );
  const requestedAssignmentId = Number(searchParams.get('assignmentId') || 0);
  const requestedEkskulId = Number(searchParams.get('ekskulId') || 0);
  const selectedAssignment = useMemo<TutorAssignmentSummary | null>(() => {
    if (!visibleAssignments.length) return null;
    if (
      selectedAssignmentIdState &&
      visibleAssignments.some((assignment) => Number(assignment.id) === Number(selectedAssignmentIdState))
    ) {
      return visibleAssignments.find((assignment) => Number(assignment.id) === Number(selectedAssignmentIdState)) || null;
    }
    if (requestedAssignmentId) {
      return visibleAssignments.find((assignment) => Number(assignment.id) === Number(requestedAssignmentId)) || null;
    }
    if (requestedEkskulId) {
      return (
        visibleAssignments.find((assignment) => Number(assignment.ekskulId) === Number(requestedEkskulId)) || null
      );
    }
    return visibleAssignments[0] || null;
  }, [visibleAssignments, requestedAssignmentId, requestedEkskulId, selectedAssignmentIdState]);
  const selectedEkskulId = selectedAssignment?.ekskulId || 0;

  useEffect(() => {
    if (!selectedAcademicYearId) return;

    const nextParams = new URLSearchParams(searchParams);
    let shouldReplace = false;

    if (String(selectedAcademicYearId) !== String(searchParams.get('academicYearId') || '')) {
      nextParams.set('academicYearId', String(selectedAcademicYearId));
      shouldReplace = true;
    }

    if (selectedAssignment) {
      if (String(selectedAssignment.id) !== String(searchParams.get('assignmentId') || '')) {
        nextParams.set('assignmentId', String(selectedAssignment.id));
        shouldReplace = true;
      }
      if (String(selectedAssignment.ekskulId) !== String(searchParams.get('ekskulId') || '')) {
        nextParams.set('ekskulId', String(selectedAssignment.ekskulId));
        shouldReplace = true;
      }
    } else if (searchParams.has('assignmentId') || searchParams.has('ekskulId')) {
      nextParams.delete('assignmentId');
      nextParams.delete('ekskulId');
      shouldReplace = true;
    }

    if (shouldReplace) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, selectedAcademicYearId, selectedAssignment, setSearchParams]);

  const { data: reportProgramsData } = useQuery({
    queryKey: ['tutor-report-programs', selectedAcademicYearId],
    queryFn: async () => {
      if (!selectedAcademicYearId) return [];
      const response = await examService.getPrograms({
        academicYearId: selectedAcademicYearId,
        roleContext: 'teacher',
        includeInactive: false,
      });
      return (response?.data?.programs || []) as ExamProgram[];
    },
    enabled: !!selectedAcademicYearId,
  });

  const reportPrograms = useMemo<ReportProgramOption[]>(() => {
    const programs = Array.isArray(reportProgramsData) ? reportProgramsData : [];
    const options: ReportProgramOption[] = [];

    for (const program of programs) {
      const baseType = String(program.baseTypeCode || program.baseType || '').toUpperCase();
      const gradeComponentType = String(
        program.gradeComponentTypeCode || program.gradeComponentType || '',
      ).toUpperCase();
      const isReportComponent =
        isMidtermAliasCode(gradeComponentType) ||
        isFinalAliasCode(gradeComponentType) ||
        isMidtermAliasCode(baseType) ||
        isFinalAliasCode(baseType);
      if (!isReportComponent) continue;
      if (!program.isActive) continue;

      const fixedSemester = (program.fixedSemester as Semester | null) || null;
      const baseLabel = String(program.shortLabel || program.label || program.code || baseType).trim();
      options.push({
        code: String(program.code || '').toUpperCase(),
        label: `${baseLabel} • ${formatProgramSemesterLabel(fixedSemester)}`,
        baseType,
        gradeComponentType,
        fixedSemester,
        displayOrder: Number(program.order ?? 0),
      });
    }

    return options.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.code.localeCompare(b.code);
    });
  }, [reportProgramsData]);

  const effectiveSelectedReportType = useMemo(() => {
    if (reportPrograms.length === 0) return '';
    const exists = reportPrograms.some((option) => option.code === reportType);
    return exists ? reportType : reportPrograms[0].code;
  }, [reportPrograms, reportType]);

  const selectedReportProgram = useMemo(
    () => reportPrograms.find((option) => option.code === effectiveSelectedReportType) || null,
    [reportPrograms, effectiveSelectedReportType],
  );
  const effectiveSemester = selectedReportProgram?.fixedSemester || semester;

  const selectedReportBaseType = selectedReportProgram?.baseType || '';
  const selectedReportSlot = useMemo(
    () => resolveTutorReportSlot(selectedReportProgram, effectiveSemester),
    [selectedReportProgram, effectiveSemester],
  );
  const effectiveReportType = useMemo(
    () =>
      selectedReportSlot ||
      effectiveSelectedReportType ||
      selectedReportProgram?.code ||
      selectedReportBaseType ||
      '',
    [selectedReportSlot, effectiveSelectedReportType, selectedReportProgram, selectedReportBaseType],
  );
  const templateContextKey = useMemo(
    () =>
      [
        selectedEkskulId || '',
        selectedAcademicYearId || '',
        effectiveSemester,
        selectedReportProgram?.code || '',
        selectedReportSlot || '',
        effectiveSelectedReportType || '',
      ].join(':'),
    [
      selectedEkskulId,
      selectedAcademicYearId,
      effectiveSemester,
      selectedReportProgram,
      selectedReportSlot,
      effectiveSelectedReportType,
    ],
  );
  const [gradeTemplateEditsByContext, setGradeTemplateEditsByContext] = useState<
    Record<string, ExtracurricularGradeTemplate>
  >({});

  const { data: membersData, isLoading } = useQuery({
    queryKey: ['tutor-members', selectedEkskulId, selectedAcademicYearId],
    queryFn: () => tutorService.getMembers(selectedEkskulId, selectedAcademicYearId!),
    enabled: !!selectedEkskulId && !!selectedAcademicYearId,
  });

  const members: Enrollment[] = (membersData?.data || []) as Enrollment[];

  const queryClient = useQueryClient();
  const { data: attendanceOverviewData, isFetching: isFetchingAttendance } = useQuery({
    queryKey: ['tutor-attendance', selectedEkskulId, selectedAcademicYearId, attendanceWeekKey],
    queryFn: () =>
      tutorService.getAttendanceOverview({
        ekskulId: selectedEkskulId,
        academicYearId: selectedAcademicYearId!,
        weekKey: attendanceWeekKey,
      }),
    enabled: !!selectedEkskulId && !!selectedAcademicYearId,
  });
  const attendanceOverview = (attendanceOverviewData?.data || null) as AttendanceOverview | null;
  const { data: gradeTemplateData, isFetching: isFetchingTemplates } = useQuery({
    queryKey: [
      'tutor-grade-templates',
      selectedEkskulId,
      selectedAcademicYearId,
      effectiveSemester,
      selectedReportProgram?.code,
      selectedReportSlot,
      effectiveSelectedReportType,
    ],
    queryFn: () =>
      tutorService.getGradeTemplates({
        ekskulId: selectedEkskulId,
        academicYearId: selectedAcademicYearId!,
        semester: effectiveSemester,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
      }),
    enabled:
      !!selectedEkskulId &&
      !!selectedAcademicYearId &&
      !!(selectedReportProgram?.code || effectiveSelectedReportType),
  });

  const serverGradeTemplates = useMemo<ExtracurricularGradeTemplate>(() => {
    const templatesRaw = gradeTemplateData?.data?.templates;
    return (
      templatesRaw && typeof templatesRaw === 'object'
        ? {
            SB: {
              label: String(templatesRaw.SB?.label || DEFAULT_GRADE_TEMPLATES.SB.label),
              description: String(templatesRaw.SB?.description || ''),
            },
            B: {
              label: String(templatesRaw.B?.label || DEFAULT_GRADE_TEMPLATES.B.label),
              description: String(templatesRaw.B?.description || ''),
            },
            C: {
              label: String(templatesRaw.C?.label || DEFAULT_GRADE_TEMPLATES.C.label),
              description: String(templatesRaw.C?.description || ''),
            },
            K: {
              label: String(templatesRaw.K?.label || DEFAULT_GRADE_TEMPLATES.K.label),
              description: String(templatesRaw.K?.description || ''),
            },
          }
        : DEFAULT_GRADE_TEMPLATES
    );
  }, [gradeTemplateData]);
  const gradeTemplates = gradeTemplateEditsByContext[templateContextKey] || serverGradeTemplates;
  const gradeOptions = useMemo(
    () =>
      (Object.keys(DEFAULT_GRADE_TEMPLATES) as GradePredicate[]).map((value) => ({
        value,
        label: gradeTemplates[value]?.label || DEFAULT_GRADE_TEMPLATES[value].label,
      })),
    [gradeTemplates],
  );

  const { mutateAsync: saveGrade } = useMutation({
    mutationFn: (payload: { 
      enrollmentId: number; 
      grade: string; 
      description: string;
      semester: Semester;
      reportType: string;
      programCode?: string;
    }) => tutorService.inputGrade(payload),
    onSuccess: () => {
      toast.success('Nilai tersimpan');
      queryClient.invalidateQueries({ queryKey: ['tutor-members', selectedEkskulId, selectedAcademicYearId] });
    },
    onError: () => {
      toast.error('Gagal menyimpan nilai');
    }
  });

  const { mutateAsync: saveGradeTemplates, isPending: isSavingGradeTemplates } = useMutation({
    mutationFn: (templates: ExtracurricularGradeTemplate) =>
      tutorService.saveGradeTemplates({
        ekskulId: selectedEkskulId,
        academicYearId: selectedAcademicYearId!,
        semester: effectiveSemester,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
        templates,
      }),
    onSuccess: () => {
      toast.success('Template deskripsi berhasil disimpan');
      queryClient.invalidateQueries({
        queryKey: [
          'tutor-grade-templates',
          selectedEkskulId,
          selectedAcademicYearId,
          effectiveSemester,
          selectedReportProgram?.code,
          selectedReportSlot,
          effectiveSelectedReportType,
        ],
      });
    },
    onError: () => {
      toast.error('Gagal menyimpan template deskripsi');
    },
  });
  const { mutateAsync: saveAttendanceConfig, isPending: isSavingAttendanceConfig } = useMutation({
    mutationFn: (sessionsPerWeek: number) =>
      tutorService.saveAttendanceConfig({
        ekskulId: selectedEkskulId,
        academicYearId: selectedAcademicYearId!,
        sessionsPerWeek,
      }),
    onSuccess: () => {
      toast.success('Pengaturan absensi berhasil disimpan');
      queryClient.invalidateQueries({
        queryKey: ['tutor-attendance', selectedEkskulId, selectedAcademicYearId, attendanceWeekKey],
      });
    },
    onError: () => {
      toast.error('Gagal menyimpan pengaturan absensi');
    },
  });

  const { mutateAsync: saveAttendanceRecords, isPending: isSavingAttendanceRecords } = useMutation({
    mutationFn: (records: Array<{
      enrollmentId: number;
      sessionIndex: number;
      status: ExtracurricularAttendanceStatus;
      note?: string;
    }>) =>
      tutorService.saveAttendanceRecords({
        ekskulId: selectedEkskulId,
        academicYearId: selectedAcademicYearId!,
        weekKey: attendanceWeekKey,
        records,
      }),
    onSuccess: () => {
      toast.success('Absensi berhasil disimpan');
      queryClient.invalidateQueries({
        queryKey: ['tutor-attendance', selectedEkskulId, selectedAcademicYearId, attendanceWeekKey],
      });
    },
    onError: () => {
      toast.error('Gagal menyimpan absensi');
    },
  });

  const localValueContextKey = useMemo(
    () =>
      [
        selectedEkskulId || '',
        selectedAcademicYearId || '',
        effectiveSemester,
        selectedReportProgram?.code || '',
        selectedReportSlot || '',
        effectiveSelectedReportType || '',
      ].join(':'),
    [
      selectedEkskulId,
      selectedAcademicYearId,
      effectiveSemester,
      selectedReportProgram,
      selectedReportSlot,
      effectiveSelectedReportType,
    ],
  );
  const [localValuesByContext, setLocalValuesByContext] = useState<
    Record<string, Record<number, { grade: string; description: string }>>
  >({});
  const localValues = localValuesByContext[localValueContextKey] || {};

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!attendanceOverview) return;
    setAttendanceSessionsPerWeekDraft(Math.max(1, Number(attendanceOverview.sessionsPerWeek || 1)));
    const nextEdits: Record<number, Record<number, ExtracurricularAttendanceStatus | ''>> = {};
    for (const record of attendanceOverview.records || []) {
      if (!nextEdits[record.enrollmentId]) nextEdits[record.enrollmentId] = {};
      nextEdits[record.enrollmentId][record.sessionIndex] = record.status;
    }
    setAttendanceEdits(nextEdits);
  }, [attendanceOverview]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const getDataForContext = (en: Enrollment) => {
    if (!en) return { grade: '', description: '' };

    const slot = resolveTutorReportSlot(selectedReportProgram, effectiveSemester);
    if (slot === 'SBTS') {
      if (effectiveSemester === 'ODD') return { grade: en.gradeSbtsOdd, description: en.descSbtsOdd };
      return { grade: en.gradeSbtsEven, description: en.descSbtsEven };
    }
    if (slot === 'SAT') return { grade: en.gradeSat, description: en.descSat };
    if (slot === 'SAS') return { grade: en.gradeSas, description: en.descSas };
    return { grade: en.grade || '', description: en.description || '' };
  };

  const handleChange = (id: number, key: 'grade' | 'description', value: string) => {
    const member = members.find((m) => m.id === id);
    if (!member) return;

    const currentData = getDataForContext(member);
    
    setLocalValuesByContext((prev) => {
      const scoped = prev[localValueContextKey] || {};
      const existingGrade = (scoped[id]?.grade ?? currentData.grade ?? '').toUpperCase();
      const existingDescription = scoped[id]?.description ?? currentData.description ?? '';

      if (key === 'description') {
        return {
          ...prev,
          [localValueContextKey]: {
            ...scoped,
            [id]: {
              grade: existingGrade,
              description: value,
            },
          },
        };
      }

      const nextGrade = value.toUpperCase();
      const nextTemplate = gradeTemplates[nextGrade as GradePredicate]?.description || '';

      return {
        ...prev,
        [localValueContextKey]: {
          ...scoped,
          [id]: {
            grade: nextGrade,
            description: nextTemplate || existingDescription,
          },
        },
      };
    });
  };

  const handleSave = async (id: number) => {
    const en = members.find((m) => m.id === id);
    if (!en) return;

    const currentData = getDataForContext(en);
    const vals = localValues[id];
    
    // Use local value if exists, otherwise fallback to existing data
    const gradeToSave = vals?.grade ?? currentData.grade ?? '';
    const descToSave = vals?.description ?? currentData.description ?? '';

    await saveGrade({
      enrollmentId: id,
      grade: gradeToSave,
      description: descToSave,
      semester: effectiveSemester,
      reportType: effectiveReportType,
      programCode: selectedReportProgram?.code || undefined,
    });
  };

  const handleAttendanceChange = (
    enrollmentId: number,
    sessionIndex: number,
    status: ExtracurricularAttendanceStatus | '',
  ) => {
    setAttendanceEdits((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        [sessionIndex]: status,
      },
    }));
  };

  const handleSaveAttendanceConfig = async () => {
    await saveAttendanceConfig(Math.max(1, attendanceSessionsPerWeekDraft));
  };

  const handleSaveAttendanceRecords = async () => {
    const records = Object.entries(attendanceEdits).flatMap(([enrollmentId, sessions]) =>
      Object.entries(sessions)
        .filter(([, status]) => status)
        .map(([sessionIndex, status]) => ({
          enrollmentId: Number(enrollmentId),
          sessionIndex: Number(sessionIndex),
          status: status as ExtracurricularAttendanceStatus,
        })),
    );
    await saveAttendanceRecords(records);
  };

  const handleSemesterChange = (s: Semester) => {
    setSemester(s);
  };

  const currentEkskulName = selectedAssignment?.ekskul?.name || (selectedScope === 'osis' ? 'OSIS' : 'Ekstrakurikuler');
  const attendanceSessionIndexes = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, Number(attendanceOverview?.sessionsPerWeek || attendanceSessionsPerWeekDraft || 1)) },
        (_, index) => index + 1,
      ),
    [attendanceOverview?.sessionsPerWeek, attendanceSessionsPerWeekDraft],
  );

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {selectedScope === 'osis' ? 'Anggota OSIS' : 'Anggota Ekstrakurikuler'}
          </h1>
          <p className="text-gray-600">
            {selectedScope === 'osis' ? 'Kelola anggota dan nilai OSIS' : 'Kelola nilai dan anggota'}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select
              value={selectedAcademicYearId || ''}
              onChange={(e) => {
                const nextYearId = Number(e.target.value || 0) || null;
                setSelectedAcademicYearIdState(nextYearId);
                setSelectedAssignmentIdState(null);
              }}
              className="bg-transparent border-0 text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name} {year.isActive ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select
              value={selectedAssignment?.id || ''}
              onChange={(e) => setSelectedAssignmentIdState(Number(e.target.value || 0) || null)}
              disabled={visibleAssignments.length === 0}
              className="bg-transparent border-0 text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer"
            >
              {visibleAssignments.length === 0 ? (
                <option value="">Belum ada assignment untuk scope ini</option>
              ) : (
                visibleAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.ekskul?.name || '-'}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={effectiveSemester}
              onChange={(e) => handleSemesterChange(e.target.value as Semester)}
              disabled={Boolean(selectedReportProgram?.fixedSemester)}
              className="bg-transparent border-0 text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer"
            >
              <option value="ODD">Semester Ganjil</option>
              <option value="EVEN">Semester Genap</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={effectiveSelectedReportType}
              onChange={(e) => setReportType(e.target.value)}
              disabled={reportPrograms.length === 0}
              className="bg-transparent border-0 text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer"
            >
              {reportPrograms.length === 0 ? (
                <option value="">Belum ada program rapor aktif</option>
              ) : (
                reportPrograms.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Trophy size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{currentEkskulName}</h2>
              <p className="text-sm text-gray-500">
                {effectiveSemester === 'ODD' ? 'Ganjil' : 'Genap'} -{' '}
                {selectedReportProgram?.label || selectedReportBaseType || '-'}
              </p>
              <p className="text-xs text-gray-400">
                Tahun ajaran: {academicYears.find((year) => year.id === selectedAcademicYearId)?.name || '-'}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 pt-4 border-b border-gray-100">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('GRADE')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === 'GRADE' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Anggota & Nilai
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ATTENDANCE')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === 'ATTENDANCE' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Absensi
            </button>
          </div>
        </div>

        {visibleAssignments.length === 0 ? (
          <div className="px-6 py-5 border-b border-gray-100 bg-amber-50/60 text-sm text-amber-800">
            Belum ada assignment {selectedScope === 'osis' ? 'OSIS' : 'pembina'} untuk tahun ajaran yang dipilih.
          </div>
        ) : null}

        {activeTab === 'GRADE' ? (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Template Deskripsi Predikat</h3>
                  <p className="text-xs text-gray-500">
                    Template tersimpan per ekskul, semester, dan komponen rapor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => saveGradeTemplates(gradeTemplates)}
                  disabled={
                    isSavingGradeTemplates ||
                    isFetchingTemplates ||
                    !selectedEkskulId ||
                    !selectedAcademicYearId ||
                    !selectedReportProgram
                  }
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingGradeTemplates ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  Simpan Template
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {gradeOptions.map((option) => (
                  <div key={option.value} className="bg-white rounded-lg border border-gray-200 p-3">
                    <input
                      type="text"
                      value={gradeTemplates[option.value]?.label || ''}
                      onChange={(e) =>
                        setGradeTemplateEditsByContext((prev) => ({
                          ...prev,
                          [templateContextKey]: {
                            ...(prev[templateContextKey] || DEFAULT_GRADE_TEMPLATES),
                            [option.value]: {
                              ...(prev[templateContextKey]?.[option.value] || gradeTemplates[option.value]),
                              label: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border-gray-300 text-xs font-semibold text-gray-700 mb-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={DEFAULT_GRADE_TEMPLATES[option.value].label}
                    />
                    <textarea
                      rows={2}
                      value={gradeTemplates[option.value]?.description || ''}
                      onChange={(e) =>
                        setGradeTemplateEditsByContext((prev) => ({
                          ...prev,
                          [templateContextKey]: {
                            ...(prev[templateContextKey] || DEFAULT_GRADE_TEMPLATES),
                            [option.value]: {
                              ...(prev[templateContextKey]?.[option.value] || gradeTemplates[option.value]),
                              description: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border-gray-300 text-xs focus:ring-blue-500 focus:border-blue-500"
                      placeholder={`Template deskripsi ${option.value}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deskripsi Nilai</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-gray-500">
                        <Loader2 className="inline mr-2 animate-spin" /> Loading...
                      </td>
                    </tr>
                  ) : members.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-gray-500">Belum ada anggota</td>
                    </tr>
                  ) : (
                    members.map((en) => {
                      const data = getDataForContext(en);
                      const lv = localValues[en.id] || { grade: data.grade || '', description: data.description || '' };
                      
                      return (
                        <tr key={en.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{en.student.name}</div>
                          </td>
                          <td className="px-6 py-4 text-gray-700">{en.student.studentClass?.name || '-'}</td>
                          <td className="px-6 py-4 text-gray-700">{en.student.nis || '-'}</td>
                          <td className="px-6 py-4">
                            <select
                              value={lv.grade}
                              onChange={(e) => handleChange(en.id, 'grade', e.target.value)}
                              className="rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Pilih Predikat</option>
                              {gradeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              value={lv.description}
                              onChange={(e) => handleChange(en.id, 'description', e.target.value)}
                              className="w-full rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Deskripsi pencapaian siswa..."
                            />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleSave(en.id)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                              title="Simpan Nilai"
                            >
                              <Save size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Pertemuan per minggu
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      value={attendanceSessionsPerWeekDraft}
                      onChange={(e) => setAttendanceSessionsPerWeekDraft(Math.max(1, Number(e.target.value || 1)))}
                      className="w-full rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Dibuat dinamis sesuai kebutuhan pembina ekskul.
                    </p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Pekan absensi
                    </label>
                    <input
                      type="week"
                      value={attendanceWeekKey}
                      onChange={(e) => setAttendanceWeekKey(e.target.value || getCurrentWeekKey())}
                      className="w-full rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Absensi ini hanya untuk pegangan pembina, tidak terintegrasi ke modul lain.
                    </p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs font-medium text-gray-600 mb-1">Ringkasan</div>
                    <div className="text-sm font-semibold text-gray-800">{members.length} anggota</div>
                    <div className="mt-2 text-xs text-gray-500">
                      Kolom absensi otomatis mengikuti jumlah pertemuan per minggu yang Anda tetapkan.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAttendanceConfig}
                    disabled={!selectedEkskulId || !selectedAcademicYearId || isSavingAttendanceConfig}
                    className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60"
                  >
                    {isSavingAttendanceConfig ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-1" />}
                    Simpan Pengaturan
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAttendanceRecords}
                    disabled={!selectedEkskulId || !selectedAcademicYearId || isSavingAttendanceRecords}
                    className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isSavingAttendanceRecords ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    Simpan Absensi
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS</th>
                    {attendanceSessionIndexes.map((sessionIndex) => (
                      <th key={sessionIndex} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pertemuan {sessionIndex}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading || isFetchingAttendance ? (
                    <tr>
                      <td colSpan={3 + attendanceSessionIndexes.length} className="px-6 py-6 text-center text-gray-500">
                        <Loader2 className="inline mr-2 animate-spin" /> Loading...
                      </td>
                    </tr>
                  ) : members.length === 0 ? (
                    <tr>
                      <td colSpan={3 + attendanceSessionIndexes.length} className="px-6 py-6 text-center text-gray-500">Belum ada anggota</td>
                    </tr>
                  ) : (
                    members.map((en) => (
                      <tr key={en.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">{en.student.name}</td>
                        <td className="px-6 py-4 text-gray-700">{en.student.studentClass?.name || '-'}</td>
                        <td className="px-6 py-4 text-gray-700">{en.student.nis || '-'}</td>
                        {attendanceSessionIndexes.map((sessionIndex) => (
                          <td key={`${en.id}-${sessionIndex}`} className="px-4 py-4">
                            <select
                              value={attendanceEdits[en.id]?.[sessionIndex] || ''}
                              onChange={(e) =>
                                handleAttendanceChange(
                                  en.id,
                                  sessionIndex,
                                  (e.target.value || '') as ExtracurricularAttendanceStatus | '',
                                )
                              }
                              className="w-full min-w-[120px] rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Belum diisi</option>
                              {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
