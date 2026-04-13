import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../../services/grade.service';
import type { GradeComponent } from '../../services/grade.service';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../services/teacherAssignment.service';
import {
  formatTeacherAssignmentLabel,
  sortTeacherAssignmentsBySubjectClass,
} from '../../services/teacherAssignment.service';
import { userService } from '../../services/user.service';
import type { User } from '../../types/auth';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

interface Student {
  id: number;
  full_name: string;
  nisn: string;
  nis: string;
}

interface StudentGrade {
  student_id: number;
  formativeSeriesInput?: string;
  score: string;
}

interface StudentReportGrade {
  studentId: number;
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  slotScores?: Record<string, number | null> | null;
  description?: string | null;
}

type ApiGradeRow = {
  id?: number | string;
  studentId?: number | string;
  student_id?: number | string;
  subjectId?: number | string;
  subject_id?: number | string;
  academicYearId?: number | string;
  academic_year_id?: number | string;
  componentId?: number | string;
  component_id?: number | string;
  semester?: string;
  score?: number | string | null;
  nf1?: number | string | null;
  nf2?: number | string | null;
  nf3?: number | string | null;
  nf4?: number | string | null;
  nf5?: number | string | null;
  nf6?: number | string | null;
  formativeSeries?: number[] | null;
  component?: {
    type?: string | null;
  } | null;
};

type ApiReportGradeRow = {
  studentId?: number | string;
  formatifScore?: number | null;
  sbtsScore?: number | null;
  sasScore?: number | null;
  finalScore?: number | null;
  slotScores?: Record<string, number | null> | null;
  description?: string | null;
};

type GradeBulkPayload = {
  student_id: number;
  subject_id: number;
  academic_year_id: number;
  grade_component_id: number;
  semester: 'ODD' | 'EVEN';
  score: number | null;
  nf1?: number | null;
  nf2?: number | null;
  nf3?: number | null;
  nf4?: number | null;
  nf5?: number | null;
  nf6?: number | null;
  formative_series?: number[];
  description?: string;
};

const TEACHER_GRADES_FILTER_STORAGE_KEY = 'teacher-grades:filters:v1';

const parseFormativeSeriesInput = (raw: string): { values: number[]; invalid: boolean } => {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return { values: [], invalid: false };
  const tokens = cleaned
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const values: number[] = [];
  for (const token of tokens) {
    const parsed = Number(token.replace(',', '.'));
    if (!Number.isFinite(parsed)) return { values: [], invalid: true };
    if (parsed < 0 || parsed > 100) return { values: [], invalid: true };
    values.push(parsed);
  }
  return { values, invalid: false };
};

const normalizeLegacySeriesValues = (rawValues: unknown[]): number[] =>
  rawValues
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

const isLegacyZeroPaddedSeries = (values: number[]) =>
  Array.isArray(values) && values.length === 6 && values.every((value) => value === 0);

const sanitizeLegacySeriesForDisplay = (rawValues: unknown[], _storedScore?: unknown): number[] => {
  const values = normalizeLegacySeriesValues(rawValues);
  if (values.length === 0 || isLegacyZeroPaddedSeries(values)) return [];

  const trimmedTrailingPadding = (() => {
    let lastNonZeroIndex = -1;
    values.forEach((value, index) => {
      if (value !== 0) lastNonZeroIndex = index;
    });
    if (lastNonZeroIndex < 0) return [];
    return values.slice(0, lastNonZeroIndex + 1);
  })();

  if (
    trimmedTrailingPadding.length > 0 &&
    trimmedTrailingPadding.length < values.length
  ) {
    return trimmedTrailingPadding;
  }

  return values;
};

const averageValues = (values: number[]): number | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, item) => acc + item, 0) / values.length;
};

const formatSeriesValues = (values: number[]) =>
  values
    .map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    .join(', ');

const resolveComponentReportSlotCode = (component?: GradeComponent): string => {
  const explicit = normalizeSlotCode(component?.reportSlotCode || component?.reportSlot);
  if (explicit) return explicit;
  const fromCode = normalizeSlotCode(component?.code || component?.typeCode || '');
  if (fromCode && fromCode !== 'NONE') {
    return fromCode === 'FORMATIVE' ? 'FORMATIF' : fromCode;
  }
  if (component?.type === 'FORMATIVE') return 'FORMATIF';
  if (component?.type === 'MIDTERM') return 'MIDTERM';
  if (component?.type === 'FINAL') return 'FINAL';
  if (component?.type === 'US_THEORY') return 'US_THEORY';
  if (component?.type === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
};

const resolveComponentEntryMode = (component?: GradeComponent): 'NF_SERIES' | 'SINGLE_SCORE' => {
  const explicit = normalizeSlotCode(component?.entryModeCode || component?.entryMode);
  if (explicit === 'NF_SERIES' || explicit === 'SINGLE_SCORE') {
    return explicit;
  }
  const fallbackCode = normalizeSlotCode(component?.code || component?.typeCode || '');
  return fallbackCode === 'FORMATIVE' ? 'NF_SERIES' : 'SINGLE_SCORE';
};

const buildComponentDisplayLabel = (component: GradeComponent) => {
  const baseLabel = String(component.name || component.code || 'Komponen').trim();
  const entryMode = resolveComponentEntryMode(component);
  const reportSlot = resolveComponentReportSlotCode(component);
  const modeLabel = entryMode === 'NF_SERIES' ? 'Bertahap' : 'Satu Nilai';
  const slotLabel = reportSlot !== 'NONE' ? reportSlot : 'Tanpa Slot Rapor';
  return `${baseLabel} (${modeLabel} • ${slotLabel})`;
};

const resolveReadableComponentLabel = (component?: GradeComponent, fallback = 'Komponen') => {
  const label = String(component?.name || component?.code || '').trim();
  return label || fallback;
};

const normalizeSlotCode = (raw: unknown): string => String(raw || '').trim().toUpperCase();

const isUsTheorySlot = (raw: unknown): boolean => {
  const normalized = normalizeSlotCode(raw);
  return normalized === 'US_THEORY' || normalized === 'US_TEORY';
};

const normalizeSubjectIdentityToken = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const isTheoryKejuruanSubject = (subject?: Pick<TeacherAssignment['subject'], 'name' | 'code'> | null): boolean => {
  const normalizedName = normalizeSubjectIdentityToken(subject?.name);
  const normalizedCode = normalizeSubjectIdentityToken(subject?.code);
  if (!normalizedName && !normalizedCode) return false;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) {
    return true;
  }
  return (
    normalizedName.includes('KONSENTRASI_KEAHLIAN') ||
    normalizedName === 'KONSENTRASI' ||
    normalizedName === 'KEJURUAN'
  );
};

const resolvePrimarySlots = (components: GradeComponent[]) => {
  const availableSlots: string[] = [];
  let formativeByType: string | null = null;
  let midtermByType: string | null = null;
  let finalByType: string | null = null;

  components.forEach((item) => {
    const slotCode = normalizeSlotCode(resolveComponentReportSlotCode(item));
    if (!slotCode || slotCode === 'NONE') return;
    if (!availableSlots.includes(slotCode)) {
      availableSlots.push(slotCode);
    }

    const componentType = String(item.type || '').trim().toUpperCase();
    const entryMode = resolveComponentEntryMode(item);
    if (!formativeByType && (entryMode === 'NF_SERIES' || componentType === 'FORMATIVE')) {
      formativeByType = slotCode;
      return;
    }
    if (!midtermByType && componentType === 'MIDTERM') {
      midtermByType = slotCode;
      return;
    }
    if (!finalByType && componentType === 'FINAL') {
      finalByType = slotCode;
    }
  });

  const firstSlot = availableSlots[0] || 'NONE';
  const nonFormativeSlots = availableSlots.filter((slot) => slot !== formativeByType);
  const secondSlot = nonFormativeSlots[0] || availableSlots[1] || firstSlot;
  const lastSlot =
    nonFormativeSlots[nonFormativeSlots.length - 1] ||
    availableSlots[availableSlots.length - 1] ||
    secondSlot;

  const formative = formativeByType || firstSlot || 'FORMATIF';
  const midterm = midtermByType || secondSlot || formative || 'NONE';
  const final = finalByType || lastSlot || midterm || formative || 'NONE';

  return {
    formative,
    midterm,
    final,
  };
};

const resolveReportSlotScore = (
  report: StudentReportGrade | undefined,
  slotCode: string,
  fallback: number | null | undefined,
): number | null => {
  if (!report) return fallback ?? null;
  const normalizedSlot = normalizeSlotCode(slotCode);
  const slotScores = report.slotScores;
  if (slotScores && typeof slotScores === 'object' && normalizedSlot) {
    const dynamic = slotScores[normalizedSlot];
    if (dynamic !== undefined && dynamic !== null && Number.isFinite(Number(dynamic))) {
      return Number(dynamic);
    }
  }
  if (fallback !== undefined && fallback !== null && Number.isFinite(Number(fallback))) {
    return Number(fallback);
  }
  return null;
};

const buildFormativeReferenceSlotCode = (slotCode: string, stage: 'MIDTERM' | 'FINAL') => {
  const normalized = normalizeSlotCode(slotCode);
  const suffix = stage === 'MIDTERM' ? 'SBTS_REF' : 'FINAL_REF';
  return normalized ? `${normalized}_${suffix}` : suffix;
};

export const TeacherGradesPage = () => {
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Filter states
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [gradeComponents, setGradeComponents] = useState<GradeComponent[]>([]);
  
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN' | ''>('');
  const [kkm, setKkm] = useState(75);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [competencySettings, setCompetencySettings] = useState<{A: string, B: string, C: string, D: string}>({A: '', B: '', C: '', D: ''});
  
  // Data states
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [reportGradeMap, setReportGradeMap] = useState<Record<number, StudentReportGrade>>({});
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [formativeNewScoreDraft, setFormativeNewScoreDraft] = useState<Record<number, string>>({});
  const [isFilterRestoreDone, setIsFilterRestoreDone] = useState(false);
  const restoredAssignmentRef = useRef<string | undefined>(undefined);
  
  const selectedAcademicYearNum = Number(selectedAcademicYear);
  const assignmentOptions = useMemo(() => {
    if (!Number.isFinite(selectedAcademicYearNum) || selectedAcademicYearNum <= 0) {
      return assignments;
    }
    return assignments.filter((assignment) => Number(assignment.academicYearId) === selectedAcademicYearNum);
  }, [assignments, selectedAcademicYearNum]);

  // Check selected component mode/slot dynamically
  const selectedComponentObj = gradeComponents.find(c => c.id.toString() === selectedComponent);
  const selectedComponentEntryMode = resolveComponentEntryMode(selectedComponentObj);
  const selectedComponentSlotCode = resolveComponentReportSlotCode(selectedComponentObj);
  const isFormatifComponent = selectedComponentEntryMode === 'NF_SERIES';
  // Derived state for filtered components
  const selectedAssignmentObj = assignmentOptions.find(a => a.id.toString() === selectedAssignment);
  const filteredComponents = useMemo(() => {
    if (!selectedAssignmentObj) return [];
    const theoryKejuruanOnly = isTheoryKejuruanSubject(selectedAssignmentObj.subject);
    return gradeComponents.filter((component) => {
      if (component.subjectId !== selectedAssignmentObj.subject.id) return false;
      if (theoryKejuruanOnly) {
        return isUsTheorySlot(resolveComponentReportSlotCode(component));
      }
      return true;
    });
  }, [gradeComponents, selectedAssignmentObj]);
  const primarySlots = resolvePrimarySlots(filteredComponents);
  const formativePrimarySlot = primarySlots.formative;
  const midtermPrimarySlot = primarySlots.midterm;
  const finalPrimarySlot = primarySlots.final;
  const hasFormativeSeriesComponent = filteredComponents.some(
    (item) => resolveComponentEntryMode(item) === 'NF_SERIES',
  );
  const hasDistinctMidtermFormula =
    hasFormativeSeriesComponent &&
    normalizeSlotCode(midtermPrimarySlot) !== 'NONE' &&
    normalizeSlotCode(midtermPrimarySlot) !== normalizeSlotCode(formativePrimarySlot);
  const hasDistinctFinalFormula =
    hasFormativeSeriesComponent &&
    normalizeSlotCode(finalPrimarySlot) !== 'NONE' &&
    normalizeSlotCode(finalPrimarySlot) !== normalizeSlotCode(formativePrimarySlot) &&
    normalizeSlotCode(finalPrimarySlot) !== normalizeSlotCode(midtermPrimarySlot);
  const isMidtermComponent =
    !isFormatifComponent &&
    hasDistinctMidtermFormula &&
    selectedComponentSlotCode === midtermPrimarySlot;
  const isFinalComponent =
    !isFormatifComponent &&
    hasDistinctFinalFormula &&
    selectedComponentSlotCode === finalPrimarySlot;
  const selectedComponentReportSlotLabel =
    selectedComponentSlotCode && selectedComponentSlotCode !== 'NONE' ? selectedComponentSlotCode : 'TANPA SLOT';
  const selectedComponentInputModeLabel =
    selectedComponentEntryMode === 'NF_SERIES' ? 'Bertahap (banyak butir nilai)' : 'Satu nilai per siswa';
  const formativeComponentLabel = resolveReadableComponentLabel(
    filteredComponents.find(
      (item) =>
        resolveComponentEntryMode(item) === 'NF_SERIES' ||
        resolveComponentReportSlotCode(item) === formativePrimarySlot,
    ),
    'Komponen 1',
  );
  const midtermComponentLabel = resolveReadableComponentLabel(
    filteredComponents.find((item) => resolveComponentReportSlotCode(item) === midtermPrimarySlot),
    'Komponen 2',
  );
  const finalComponentLabel = resolveReadableComponentLabel(
    filteredComponents.find((item) => resolveComponentReportSlotCode(item) === finalPrimarySlot),
    'Komponen 3',
  );
  const selectedComponentFlowLabel = isFormatifComponent
    ? 'Formatif Bertahap'
    : isMidtermComponent
      ? 'Komponen Tengah Semester'
      : isFinalComponent
        ? 'Komponen Akhir Semester/Tahun'
        : 'Komponen Input Sederhana';
  const selectedComponentFormulaHint = isFormatifComponent
    ? `Input bertahap, sistem hitung rata-rata ${resolveReadableComponentLabel(selectedComponentObj, 'komponen')} otomatis.`
    : isMidtermComponent
      ? `Nilai rapor dihitung dari rata-rata (${formativeComponentLabel} + ${resolveReadableComponentLabel(selectedComponentObj, 'komponen ini')}).`
      : isFinalComponent
        ? `Nilai rapor dihitung dari rata-rata (${formativeComponentLabel} + ${midtermComponentLabel} + ${resolveReadableComponentLabel(selectedComponentObj, 'komponen ini')}).`
        : 'Komponen ini memakai satu nilai per siswa.';
  const primaryFormativeComponentId =
    filteredComponents.find((item) => resolveComponentEntryMode(item) === 'NF_SERIES')?.id ?? null;

  const getDescription = () => {
    const componentName = String(selectedComponentObj?.name || selectedComponentObj?.code || 'komponen ini').trim();
    if (isFormatifComponent) {
      return `Komponen ${componentName} diinput per butir, rata-rata dihitung otomatis oleh sistem.`;
    }
    if (isMidtermComponent) {
      return `Komponen ${componentName} diinput satu nilai, lalu dipadukan sesuai rumus komponen aktif.`;
    }
    if (isFinalComponent) {
      return `Komponen ${componentName} diinput satu nilai, lalu dipadukan ke nilai rapor akhir.`;
    }
    return `Komponen ${componentName} menggunakan input satu nilai per siswa.`;
  };

  const fetchAssignmentsByAcademicYear = async (
    academicYearId: string,
    preferredAssignmentId?: string,
  ) => {
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
      setAssignments([]);
      setSelectedAssignment('');
      return;
    }

    const assignRes = await teacherAssignmentService.list({
      limit: 1000,
      academicYearId: parsedAcademicYearId,
    });
    const assignResponse = assignRes as { data?: { assignments?: TeacherAssignment[] }, assignments?: TeacherAssignment[] };
    const assignsData = assignResponse.data?.assignments || assignResponse.assignments || [];

    if (!Array.isArray(assignsData)) {
      setAssignments([]);
      setSelectedAssignment('');
      return;
    }

    const sorted = sortTeacherAssignmentsBySubjectClass(assignsData as TeacherAssignment[]);
    setAssignments(sorted);

    setSelectedAssignment((previous) => {
      const candidate = preferredAssignmentId ?? previous;
      if (candidate && sorted.some((assignment) => assignment.id.toString() === candidate)) {
        return candidate;
      }
      return '';
    });
  };

  useEffect(() => {
    fetchInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const activeAcademicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0);
    if (!Number.isFinite(activeAcademicYearId) || activeAcademicYearId <= 0) {
      setSelectedAcademicYear('');
      return;
    }
    setSelectedAcademicYear(String(activeAcademicYearId));
  }, [activeAcademicYear?.academicYearId, activeAcademicYear?.id]);

  useEffect(() => {
    try {
      if (!isFilterRestoreDone) return;
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(
        TEACHER_GRADES_FILTER_STORAGE_KEY,
        JSON.stringify({
          semester: selectedSemester,
          assignment: selectedAssignment,
          component: selectedComponent,
        }),
      );
    } catch (error) {
      console.warn('Failed to persist teacher grade filters:', error);
    }
  }, [isFilterRestoreDone, selectedAcademicYear, selectedSemester, selectedAssignment, selectedComponent]);

  useEffect(() => {
    if (selectedAssignment) {
      fetchStudents();
    }
  }, [selectedAssignment]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAssignment && selectedAcademicYear && selectedSemester) {
      fetchGradeComponents();
      return;
    }
    setGradeComponents([]);
    setSelectedComponent('');
  }, [selectedAssignment, selectedAcademicYear, selectedSemester, assignments]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      selectedAssignment &&
      selectedComponent &&
      selectedAcademicYear &&
      selectedSemester &&
      students.length > 0
    ) {
      fetchExistingGrades();
    }
  }, [selectedAssignment, selectedComponent, selectedAcademicYear, selectedSemester, students]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill descriptions for missing entries (defensive fix)
  useEffect(() => {
    if (isFinalComponent && (competencySettings.A || competencySettings.B || competencySettings.C || competencySettings.D)) {
        setDescriptions(prev => {
            const next = { ...prev };
            let hasChanges = false;

            students.forEach(student => {
                // Check if description is empty OR matches a default competency setting (auto-generated)
                // We want to update it if the grade changes, UNLESS the user manually edited it to something custom.
                const currentDesc = next[student.id];
                const isAutoGenerated = !currentDesc || 
                                      currentDesc === competencySettings.A || 
                                      currentDesc === competencySettings.B || 
                                      currentDesc === competencySettings.C || 
                                      currentDesc === competencySettings.D;

                if (!isAutoGenerated) return;

                const grade = grades.find(g => g.student_id === student.id);
                const report = reportGradeMap[student.id];
                if (grade && report?.finalScore !== null && report?.finalScore !== undefined) {
                    const predicate = calculatePredicate(report.finalScore, kkm);
                    const desc = competencySettings[predicate as keyof typeof competencySettings];
                    
                    if (desc && desc !== currentDesc) {
                        next[student.id] = desc;
                        hasChanges = true;
                    }
                }
            });

            return hasChanges ? next : prev;
        });
    }
  }, [grades, isFinalComponent, competencySettings, students, reportGradeMap, kkm, gradeComponents]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setIsFilterRestoreDone(false);

      let restoredFilter: {
        semester?: 'ODD' | 'EVEN' | '';
        assignment?: string;
        component?: string;
      } | null = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(TEACHER_GRADES_FILTER_STORAGE_KEY);
          if (raw) restoredFilter = JSON.parse(raw);
        }
      } catch (error) {
        console.warn('Failed to restore teacher grade filters:', error);
      }
      restoredAssignmentRef.current = restoredFilter?.assignment;

      if (restoredFilter?.component) {
        setSelectedComponent(restoredFilter.component);
      }
      if (restoredFilter?.semester === 'ODD' || restoredFilter?.semester === 'EVEN') {
        setSelectedSemester(restoredFilter.semester);
      }

    } catch (error) {
      console.error('Fetch initial data error:', error);
      toast.error('Gagal memuat data awal');
    } finally {
      setLoading(false);
      setIsFilterRestoreDone(true);
    }
  };

  useEffect(() => {
    if (!selectedAcademicYear || !isFilterRestoreDone) return;
    fetchAssignmentsByAcademicYear(selectedAcademicYear, restoredAssignmentRef.current).catch((error) => {
      console.error('Fetch assignments by academic year error:', error);
      toast.error('Gagal memuat assignment guru');
      setAssignments([]);
      setSelectedAssignment('');
    }).finally(() => {
      restoredAssignmentRef.current = undefined;
    });
  }, [selectedAcademicYear, isFilterRestoreDone]);

  useEffect(() => {
    if (!selectedAssignment) return;
    const stillExists = assignmentOptions.some((assignment) => assignment.id.toString() === selectedAssignment);
    if (!stillExists) {
      setSelectedAssignment('');
      setSelectedComponent('');
    }
  }, [assignmentOptions, selectedAssignment]);

  useEffect(() => {
    if (!selectedAssignmentObj) {
      if (selectedComponent) setSelectedComponent('');
      return;
    }
    if (!selectedComponent) return;
    const exists = filteredComponents.some((component) => component.id.toString() === selectedComponent);
    if (!exists) {
      setSelectedComponent('');
    }
  }, [filteredComponents, selectedAssignmentObj, selectedComponent]);

  const fetchGradeComponents = async () => {
    try {
      const assignment = selectedAssignmentObj;
      if (!assignment || !selectedAcademicYear || !selectedSemester) return;

      const response = await gradeService.getComponents({
        subject_id: assignment.subject.id,
        academic_year_id: parseInt(selectedAcademicYear),
        assignment_id: assignment.id,
        semester: selectedSemester,
      });
      const payload = response as { data?: GradeComponent[] } | GradeComponent[];
      const components =
        'data' in payload && Array.isArray(payload.data)
          ? payload.data
          : (Array.isArray(payload) ? payload : []);

      const sorted = [...components].sort((a, b) => {
        const aOrder = Number(a.displayOrder ?? 999);
        const bOrder = Number(b.displayOrder ?? 999);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      setGradeComponents(sorted);
      setSelectedComponent((previous) => {
        if (!previous) return previous;
        const exists = sorted.some((item) => item.id.toString() === previous);
        return exists ? previous : '';
      });
    } catch (error) {
      console.error('Fetch grade components error:', error);
      toast.error('Gagal memuat komponen nilai dinamis');
      setGradeComponents([]);
      setSelectedComponent('');
    }
  };

  const fetchStudents = async () => {
    try {
      if (!selectedAssignment) return;
      
      // Get fresh assignment for KKM
      const assignment = selectedAssignmentObj;
      
      if (assignment) {
        setKkm(assignment.kkm);
        if (assignment.competencyThresholds) {
            setCompetencySettings({
                A: assignment.competencyThresholds.A || '',
                B: assignment.competencyThresholds.B || '',
                C: assignment.competencyThresholds.C || '',
                D: assignment.competencyThresholds.D || ''
            });
        } else {
             setCompetencySettings({A: '', B: '', C: '', D: ''});
        }
        
        // Fetch students
        const usersRes = await userService.getAll({ 
            role: 'STUDENT', 
            class_id: assignment.class.id,
            limit: 1000 
        });
        
        const usersResponse = usersRes as { data?: User[] } | User[];
        const studentsData = 'data' in usersResponse && Array.isArray(usersResponse.data) ? usersResponse.data : (Array.isArray(usersResponse) ? usersResponse : []);
        
        if (Array.isArray(studentsData)) {
            setStudents(studentsData.map((s: User) => ({
                id: s.id,
                full_name: s.name, // User interface has name, not full_name
                nisn: s.nisn || '',
                nis: s.nis || ''
            })));
            
            // Initialize grades
            const initialGrades = studentsData.map((student: User) => ({
                student_id: student.id,
                formativeSeriesInput: '',
                score: ''
            }));
            setGrades(initialGrades);
        }
      }
    } catch (error) {
      console.error('Fetch students error:', error);
      toast.error('Gagal memuat data siswa');
    }
  };

  const fetchExistingGrades = async () => {
    try {
      const assignment = selectedAssignmentObj;
      if (!assignment) return;
      if (students.length === 0) return;

      const response = await gradeService.getGradesByClassSubject(
        assignment.class.id,
        assignment.subject.id,
        parseInt(selectedAcademicYear),
        selectedSemester
      );

      const allGradesResponse = response as { data?: ApiGradeRow[] } | ApiGradeRow[];
      const rawGrades = (
        'data' in allGradesResponse && Array.isArray(allGradesResponse.data)
          ? allGradesResponse.data
          : Array.isArray(allGradesResponse)
            ? allGradesResponse
            : []
      ) as ApiGradeRow[];
      const latestGradesByKey = new Map<string, ApiGradeRow>();
      rawGrades.forEach((row: ApiGradeRow) => {
        const studentId = Number(row?.studentId ?? row?.student_id);
        const subjectId = Number(row?.subjectId ?? row?.subject_id);
        const academicYearId = Number(row?.academicYearId ?? row?.academic_year_id);
        const componentId = Number(row?.componentId ?? row?.component_id);
        const semesterKey = String(row?.semester || '');
        if (!studentId || !subjectId || !academicYearId || !componentId || !semesterKey) return;
        const key = `${studentId}:${subjectId}:${academicYearId}:${componentId}:${semesterKey}`;
        const currentId = Number(row?.id || 0);
        const previous = latestGradesByKey.get(key);
        const previousId = Number(previous?.id || 0);
        if (!previous || currentId >= previousId) {
          latestGradesByKey.set(key, row);
        }
      });
      const allGrades = latestGradesByKey.size > 0 ? Array.from(latestGradesByKey.values()) : rawGrades;
      
      try {
          const reportRes = await gradeService.getReportGrades({
              class_id: assignment.class.id,
              subject_id: assignment.subject.id,
              academic_year_id: parseInt(selectedAcademicYear),
              semester: selectedSemester
          });
          const reportResponse = reportRes as { data?: ApiReportGradeRow[] } | ApiReportGradeRow[];
          const reportData = 'data' in reportResponse && Array.isArray(reportResponse.data) ? reportResponse.data : (Array.isArray(reportResponse) ? reportResponse : []);
          const nextReportMap: Record<number, StudentReportGrade> = {};
          const nextDescriptions: Record<number, string> = {};

          if (Array.isArray(reportData)) {
              reportData.forEach((r: ApiReportGradeRow) => {
                  const studentId = Number(r?.studentId);
                  if (!studentId) return;
                  nextReportMap[studentId] = {
                      studentId,
                      formatifScore: r.formatifScore ?? null,
                      sbtsScore: r.sbtsScore ?? null,
                      sasScore: r.sasScore ?? null,
                      finalScore: r.finalScore ?? null,
                      slotScores:
                        r.slotScores && typeof r.slotScores === 'object'
                          ? (r.slotScores as Record<string, number | null>)
                          : null,
                      description: r.description ?? null,
                  };
                  if (typeof r.description === 'string' && r.description.trim()) {
                      nextDescriptions[studentId] = r.description;
                  }
              });
          }
          setReportGradeMap(nextReportMap);
          setDescriptions(isFinalComponent ? nextDescriptions : {});
      } catch (e) {
          console.error('Error fetching report grades', e);
          setReportGradeMap({});
          setDescriptions({});
      }

      // Rebuild grade rows from student list to avoid refresh race condition.
      const nextGrades = students.map((student) => {
        const existing = allGrades.find(
          (g: ApiGradeRow) =>
            (g.studentId === student.id || g.student_id === student.id) &&
            String(Number(g.componentId || g.component_id || 0)) === selectedComponent,
        );

        const formatifData =
          allGrades.find(
            (g: ApiGradeRow) =>
              (g.studentId === student.id || g.student_id === student.id) &&
              Number(g.componentId || g.component_id) === Number(primaryFormativeComponentId || -1),
          ) ||
          allGrades.find(
            (g: ApiGradeRow) =>
              (g.studentId === student.id || g.student_id === student.id) &&
              (g.component?.type === 'FORMATIVE' || g.component?.type === 'FORMATIF'),
          );

        const dynamicSeries = Array.isArray(formatifData?.formativeSeries)
          ? formatifData.formativeSeries
          : Array.isArray(existing?.formativeSeries)
            ? existing.formativeSeries
            : [];

        let formativeSeriesInput = '';
        if (dynamicSeries.length > 0) {
          formativeSeriesInput = isLegacyZeroPaddedSeries(dynamicSeries) ? '' : dynamicSeries.join(', ');
        } else {
          const legacyValues = sanitizeLegacySeriesForDisplay([
            formatifData?.nf1,
            formatifData?.nf2,
            formatifData?.nf3,
            formatifData?.nf4,
            formatifData?.nf5,
            formatifData?.nf6,
            existing?.nf1,
            existing?.nf2,
            existing?.nf3,
            existing?.nf4,
            existing?.nf5,
            existing?.nf6,
          ], existing?.score ?? formatifData?.score ?? null);
          const legacySeries = legacyValues;
          if (!isLegacyZeroPaddedSeries(legacySeries) && legacySeries.length > 0) {
            formativeSeriesInput = legacySeries.join(', ');
          }
        }

        const formativeSeriesValues = parseFormativeSeriesInput(formativeSeriesInput).values;
        const formativeAverage = averageValues(formativeSeriesValues);
        const existingScore =
          existing?.score === null || existing?.score === undefined || existing?.score === ''
            ? ''
            : String(existing.score);

        return {
          student_id: student.id,
          score:
            isFormatifComponent && formativeAverage !== null
              ? formativeAverage.toFixed(2)
              : existingScore,
          formativeSeriesInput,
        };
      });
      setGrades(nextGrades);

    } catch (error) {
      console.error('Fetch existing grades error:', error);
    }
  };

  const calculatePredicate = (score: number, kkmVal: number) => {
    if (score >= 86) return 'A';
    if (score >= kkmVal) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  };

  const handleScoreChange = (studentId: number, value: string) => {
    if (value !== '' && (isNaN(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      return;
    }

    setGrades(prev => prev.map(grade => {
      if (grade.student_id === studentId) {
        return { ...grade, score: value };
      }
      return grade;
    }));
  };

  const getStudentFormativeSeriesValues = (studentId: number) => {
    const grade = grades.find((item) => item.student_id === studentId);
    if (!grade) return [];
    const parsed = parseFormativeSeriesInput(grade.formativeSeriesInput || '');
    if (parsed.invalid) return [];
    return parsed.values;
  };

  const applyFormativeSeriesValues = (studentId: number, values: number[]) => {
    const sanitized = values
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0 && item <= 100);
    const average = averageValues(sanitized);
    setGrades((prev) =>
      prev.map((grade) => {
        if (grade.student_id !== studentId) return grade;
        return {
          ...grade,
          formativeSeriesInput: formatSeriesValues(sanitized),
          score: average === null ? '' : average.toFixed(2),
        };
      }),
    );
  };

  const handleFormativeValueChange = (studentId: number, index: number, rawValue: string) => {
    if (rawValue.trim() === '') {
      const current = getStudentFormativeSeriesValues(studentId);
      applyFormativeSeriesValues(
        studentId,
        current.filter((_, currentIndex) => currentIndex !== index),
      );
      return;
    }
    const parsed = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
    const current = getStudentFormativeSeriesValues(studentId);
    const next = [...current];
    next[index] = parsed;
    applyFormativeSeriesValues(studentId, next);
  };

  const handleRemoveFormativeValue = (studentId: number, index: number) => {
    const current = getStudentFormativeSeriesValues(studentId);
    const currentValue = current[index];
    if (currentValue !== undefined && currentValue !== null) {
      const confirmed = window.confirm(
        `Nilai ${currentValue} akan dihapus dari entri formatif. Lanjutkan?`,
      );
      if (!confirmed) return;
    }
    applyFormativeSeriesValues(
      studentId,
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleAddFormativeValue = (studentId: number) => {
    const raw = (formativeNewScoreDraft[studentId] || '').trim();
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error('Nilai formatif baru harus angka 0-100.');
      return;
    }
    const current = getStudentFormativeSeriesValues(studentId);
    applyFormativeSeriesValues(studentId, [...current, parsed]);
    setFormativeNewScoreDraft((prev) => ({
      ...prev,
      [studentId]: '',
    }));
  };

  const handleDescriptionChange = (studentId: number, value: string) => {
    setDescriptions(prev => ({
        ...prev,
        [studentId]: value
    }));
  };

  const handleSaveSettings = async () => {
    if (!selectedAssignment) return;
    try {
        setSaving(true);
        await teacherAssignmentService.updateCompetencyThresholds(parseInt(selectedAssignment), competencySettings);
        toast.success('Pengaturan Capaian Kompetensi berhasil disimpan');
        setShowSettingsModal(false);
        
        // Recalculate all descriptions immediately and SAVE to backend
        handleRefreshDescriptions(true, true);
    } catch (error) {
        console.error('Save settings error:', error);
        toast.error('Gagal menyimpan pengaturan');
    } finally {
        setSaving(false);
    }
  };

  const handleRefreshDescriptions = async (silent = false, saveToBackend = false) => {
    if (!isFinalComponent) return;
    
    if (!competencySettings.A && !competencySettings.B && !competencySettings.C && !competencySettings.D) {
        if (!silent) toast.error('Pengaturan Capaian Kompetensi belum diatur');
        return;
    }

    // We need to calculate the new descriptions state first
    const calculateNewDescriptions = (prev: Record<number, string>) => {
        const next = { ...prev };
        let updateCount = 0;

        students.forEach(student => {
            const grade = grades.find(g => g.student_id === student.id);
            if (grade) {
                const report = reportGradeMap[student.id];
                if (!report || report.finalScore === null || report.finalScore === undefined) return;
                const predicate = calculatePredicate(report.finalScore, kkm);
                const desc = competencySettings[predicate as keyof typeof competencySettings];
                
                // Update if description exists and is different
                if (desc && desc !== next[student.id]) {
                    next[student.id] = desc;
                    updateCount++;
                }
            }
        });
        return { next, updateCount };
    };

    setDescriptions(prev => {
        const { next, updateCount } = calculateNewDescriptions(prev);

        if (!silent) {
            if (updateCount > 0) {
                toast.success(`${updateCount} deskripsi diperbarui.`);
            } else {
                toast.success('Semua deskripsi sudah sesuai dengan nilai saat ini.');
            }
        }
        
        // If requested, save to backend immediately using the NEW descriptions
        if (saveToBackend && updateCount > 0 && selectedAssignment && selectedAcademicYear && selectedComponent) {
            const assignment = selectedAssignmentObj;
            if (assignment) {
                const gradesPayload = students.map(student => {
                     const grade = grades.find(g => g.student_id === student.id);
                     return {
                        student_id: student.id,
                        subject_id: assignment.subject.id,
                        academic_year_id: parseInt(selectedAcademicYear),
                        grade_component_id: parseInt(selectedComponent),
                        semester: selectedSemester,
                        score: grade && grade.score !== '' ? parseFloat(grade.score) : null,
                        description: next[student.id] || ''
                     };
                });

                // Execute save in background (or await if we made this async)
                gradeService.bulkInputGrades({ grades: gradesPayload })
                    .then(() => toast.success('Deskripsi otomatis disimpan ke database'))
                    .catch(err => console.error('Auto-save description error:', err));
            }
        }

        return updateCount > 0 ? next : prev;
    });
  };

  const handleSaveGrades = async () => {
    if (!selectedAcademicYear || !selectedAssignment || !selectedComponent) {
      toast.error('Pilih kelas & mata pelajaran, semester, dan komponen nilai terlebih dahulu');
      return;
    }

    const assignment = selectedAssignmentObj;
    if (!assignment) return;

    let gradesPayload: GradeBulkPayload[] = [];

    if (isFormatifComponent) {
        gradesPayload = grades.map(g => {
            const parsedSeries = parseFormativeSeriesInput(g.formativeSeriesInput || '');
            if (parsedSeries.invalid) {
                throw new Error('Daftar nilai formatif harus berupa angka 0-100, dipisahkan koma.');
            }
            const seriesValues = parsedSeries.values;
            const scoreValue =
              seriesValues.length > 0
                ? seriesValues.reduce((acc, value) => acc + value, 0) / seriesValues.length
                : null;

            return {
                student_id: g.student_id,
                subject_id: assignment.subject.id,
                academic_year_id: parseInt(selectedAcademicYear),
                grade_component_id: parseInt(selectedComponent),
                semester: selectedSemester as 'ODD' | 'EVEN',
                score: scoreValue,
                formative_series: seriesValues,
            };
        });
    } else {
        gradesPayload = grades.map(grade => ({
            student_id: grade.student_id,
            subject_id: assignment.subject.id,
            academic_year_id: parseInt(selectedAcademicYear),
            grade_component_id: parseInt(selectedComponent),
            semester: selectedSemester as 'ODD' | 'EVEN',
            score: grade.score === '' ? null : parseFloat(grade.score),
            description: isFinalComponent ? (descriptions[grade.student_id] || '') : undefined
        }));
    }

    if (gradesPayload.length === 0) {
      toast.error('Tidak ada data nilai untuk disimpan.');
      return;
    }

    setSaving(true);
    try {
        await gradeService.bulkInputGrades({ grades: gradesPayload });
        toast.success('Nilai berhasil disimpan');
        fetchExistingGrades();
    } catch (error: unknown) {
        const runtimeError = error as { message?: string };
        console.error('Save grades error:', error);
        toast.error(runtimeError?.message || 'Gagal menyimpan nilai');
    } finally {
        setSaving(false);
    }
  };

  const getStatusBadge = (score: number) => {
    if (score >= kkm) {
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Tuntas</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Belum Tuntas</span>;
  };

  return (
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Input Nilai Siswa</h1>
          <p className="text-gray-600">Input nilai per komponen untuk siswa</p>
        </div>
      </div>

      {/* Description Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <span className="font-semibold">Informasi Penilaian:</span> {getDescription()}
      </div>

      {selectedComponentObj ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              <span className="mr-1 text-gray-500">Komponen:</span>
              <span className="font-semibold">{resolveReadableComponentLabel(selectedComponentObj, '-')}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              <span className="mr-1 text-gray-500">Mode:</span>
              <span className="font-semibold">{selectedComponentInputModeLabel}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              <span className="mr-1 text-gray-500">Slot:</span>
              <span className="font-semibold">{selectedComponentReportSlotLabel}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              <span className="mr-1 text-gray-500">Masuk Nilai Akhir:</span>
              <span className="font-semibold">{selectedComponentObj.includeInFinalScore ? 'Ya' : 'Tidak'}</span>
            </span>
          </div>
          <p className="mt-2 text-xs text-blue-700">
            {selectedComponentFlowLabel}: {selectedComponentFormulaHint}
          </p>
        </div>
      ) : null}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
                <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                <select 
                    id="semester"
                    name="semester"
                    value={selectedSemester}
                    onChange={(e) => {
                        setSelectedSemester(e.target.value as 'ODD' | 'EVEN' | '');
                        setSelectedAssignment('');
                        setSelectedComponent('');
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="">Pilih Semester</option>
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                </select>
            </div>

            <div className="md:col-span-2 lg:col-span-2">
                <label htmlFor="class-subject" className="block text-sm font-medium text-gray-700 mb-2">Kelas & Mapel</label>
                <div className="relative">
                    <select 
                        id="class-subject"
                        name="class-subject"
                        value={selectedAssignment}
                        onChange={(e) => {
                            setSelectedAssignment(e.target.value);
                            setSelectedComponent('');
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        disabled={!selectedSemester}
                    >
                        <option value="">Pilih Kelas & Mapel</option>
                        {assignmentOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {formatTeacherAssignmentLabel(a)} (KKM: {a.kkm})
                            </option>
                        ))}
                    </select>
                    {!selectedSemester && (
                        <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Silahkan Pilih Semester</p>
                    )}
                </div>
            </div>

            <div className="md:col-span-2 lg:col-span-2">
                <div className={isFinalComponent ? "flex gap-2 items-end" : ""}>
                        <div className="flex-1">
                            <label htmlFor="grade-component" className="block text-sm font-medium text-gray-700 mb-2">Komponen Nilai</label>
                            <div className="relative">
                                <select 
                                    id="grade-component"
                                    name="grade-component"
                                    value={selectedComponent}
                                    onChange={(e) => setSelectedComponent(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    disabled={!selectedAssignment}
                                >
                                    <option value="">Pilih Komponen</option>
                                    {filteredComponents.map(c => {
                                        return <option key={c.id} value={c.id}>{buildComponentDisplayLabel(c)}</option>;
                                    })}
                                </select>
                                {!selectedAssignment && selectedSemester && (
                                    <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Silahkan Pilih Kelas & Mapel</p>
                                )}
                            </div>
                        </div>
                        {isFinalComponent && (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setShowSettingsModal(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mb-0.5 whitespace-nowrap shadow-sm font-medium text-sm flex items-center h-[42px]"
                                    title="Setting Capaian Kompetensi"
                                >
                                    + Deskripsi
                                </button>
                            </div>
                        )}
                    </div>
            </div>
        </div>
      </div>

      {/* Table */}
	      {selectedAcademicYear && selectedAssignment && selectedComponent && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                      <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NISN</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                              
                              {isFormatifComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entri Formatif (Dinamis)</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ Referensi {midtermComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">x̄ Referensi {finalComponentLabel}</th>
                                  </>
                              ) : isMidtermComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ Referensi {formativeComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai {midtermComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor {midtermComponentLabel}</th>
                                  </>
                              ) : isFinalComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ Referensi {formativeComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Nilai {midtermComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai {finalComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor {finalComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Capaian Kompetensi</th>
                                  </>
                              ) : (
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai</th>
                              )}
                              
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {loading ? (
                              <tr><td colSpan={12} className="text-center py-8">Memuat...</td></tr>
                          ) : students.length > 0 ? (
	                              students.map((student, idx) => {
                                  const grade = grades.find(g => g.student_id === student.id);
                                  if (!grade) return null;
                                  
                                  const report = reportGradeMap[student.id];
	                                  const backendFormative = resolveReportSlotScore(report, formativePrimarySlot, report?.formatifScore ?? null);
	                                  const backendMidtermFormativeReference = resolveReportSlotScore(
	                                    report,
	                                    buildFormativeReferenceSlotCode(formativePrimarySlot, 'MIDTERM'),
	                                    backendFormative,
	                                  );
	                                  const backendFinalFormativeReference = resolveReportSlotScore(
	                                    report,
	                                    buildFormativeReferenceSlotCode(formativePrimarySlot, 'FINAL'),
	                                    backendFormative,
	                                  );
	                                  const backendSbts = resolveReportSlotScore(report, midtermPrimarySlot, report?.sbtsScore ?? null);
	                                  const backendFinal = report?.finalScore ?? null;
	                                  const currentScore = (() => {
	                                    const parsed = Number(grade.score);
	                                    return Number.isFinite(parsed) ? parsed : null;
	                                  })();
                                  const backendSelectedComponentScore = resolveReportSlotScore(
                                    report,
                                    selectedComponentSlotCode,
                                    currentScore,
                                  );
                                  const rowStatusScore =
                                    !isFormatifComponent && !isMidtermComponent && !isFinalComponent
                                      ? backendSelectedComponentScore ?? currentScore ?? 0
                                      : backendFinal !== null && backendFinal !== undefined
                                        ? backendFinal
                                        : parseFloat(grade.score || '0');
                                  const formativeParsed = parseFormativeSeriesInput(grade.formativeSeriesInput || '');
                                  const hasDraftFormativeValues =
                                    !formativeParsed.invalid && formativeParsed.values.length > 0;
                                  const draftFormativeAverage =
                                    hasDraftFormativeValues
                                      ? averageValues(formativeParsed.values)
                                      : null;
                                  const normalizedBackendFormative =
                                    !hasDraftFormativeValues && Number(backendFormative) === 0
                                      ? null
                                      : backendFormative;
	                                  const previewFormative = draftFormativeAverage ?? normalizedBackendFormative;
	                                  const previewMidtermReference = draftFormativeAverage ?? backendMidtermFormativeReference;
	                                  const previewFinalReference = draftFormativeAverage ?? backendFinalFormativeReference;
	                                  const displayFormative =
	                                    previewFormative !== null && previewFormative !== undefined
	                                      ? previewFormative.toFixed(2)
	                                      : '-';
	                                  const previewSbtsFinal = (() => {
	                                    if (!isMidtermComponent) return backendFinal;
	                                    const values = [previewFormative, currentScore]
	                                      .map((value) => Number(value))
	                                      .filter((value) => Number.isFinite(value));
	                                    const avg = averageValues(values);
	                                    return avg === null ? backendFinal : avg;
	                                  })();
	                                  const previewSasFinal = (() => {
	                                    if (!isFinalComponent) return backendFinal;
	                                    const values = [previewFormative, backendSbts, currentScore]
	                                      .map((value) => Number(value))
	                                      .filter((value) => Number.isFinite(value));
	                                    const avg = averageValues(values);
	                                    return avg === null ? backendFinal : avg;
	                                  })();
                                  const rowStatusScorePreview =
                                    isFormatifComponent
                                      ? previewFormative ?? 0
                                      : isMidtermComponent
                                      ? previewSbtsFinal ?? 0
	                                      : isFinalComponent
	                                        ? previewSasFinal ?? 0
	                                        : rowStatusScore;

	                                  return (
                                      <tr key={student.id} className="hover:bg-gray-50">
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.nisn}</td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.full_name}</td>
                                          
                                          {isFormatifComponent ? (
	                                              <>
		                                                  <td className="px-6 py-4">
		                                                      <div className="space-y-2 min-w-[280px]">
		                                                        <div className="flex flex-wrap gap-2">
		                                                          {(formativeParsed.values.length > 0 ? formativeParsed.values : [null]).map((item, itemIndex) => (
		                                                            <div key={`${student.id}-${itemIndex}`} className="relative">
		                                                              <input
		                                                                type="number"
		                                                                min={0}
		                                                                max={100}
		                                                                value={item ?? ''}
		                                                                onChange={(e) =>
		                                                                  handleFormativeValueChange(student.id, itemIndex, e.target.value)
		                                                                }
		                                                                className="w-16 px-2 py-1 pr-5 border border-gray-300 rounded text-xs text-center focus:ring-blue-500 focus:border-blue-500"
		                                                              />
		                                                              <button
		                                                                type="button"
		                                                                onClick={() => handleRemoveFormativeValue(student.id, itemIndex)}
		                                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
		                                                                title="Hapus entri"
		                                                              >
		                                                                ×
		                                                              </button>
		                                                            </div>
		                                                          ))}
		                                                        </div>
		                                                        <div className="flex items-center gap-2">
		                                                          <input
	                                                            type="number"
	                                                            min={0}
	                                                            max={100}
	                                                            value={formativeNewScoreDraft[student.id] || ''}
	                                                            onChange={(e) =>
	                                                              setFormativeNewScoreDraft((prev) => ({
	                                                                ...prev,
	                                                                [student.id]: e.target.value,
	                                                              }))
	                                                            }
	                                                            placeholder="Nilai baru 0-100"
	                                                            className="w-32 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-blue-500 focus:border-blue-500"
	                                                          />
	                                                          <button
	                                                            type="button"
	                                                            onClick={() => handleAddFormativeValue(student.id)}
	                                                            className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
	                                                          >
	                                                            + Tambah
	                                                          </button>
	                                                        </div>
	                                                      </div>
		                                                      <p className={`mt-1 text-[11px] ${formativeParsed.invalid ? 'text-red-600' : 'text-gray-500'}`}>
		                                                        {formativeParsed.invalid
		                                                          ? 'Format tidak valid. Gunakan angka 0-100 dipisahkan koma.'
		                                                          : `${Math.max(formativeParsed.values.length, 1)} kotak entri dinamis`}
	                                                      </p>
		                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-900'} bg-blue-50`}>
                                                      {previewMidtermReference !== null && previewMidtermReference !== undefined
                                                        ? previewMidtermReference.toFixed(2)
                                                        : '-'}
                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-900'} bg-green-50`}>
                                                      {previewFinalReference !== null && previewFinalReference !== undefined
                                                        ? previewFinalReference.toFixed(2)
                                                        : '-'}
                                                  </td>
                                              </>
                                          ) : isMidtermComponent ? (
                                              <>
	                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-500'} bg-blue-50`}>{displayFormative}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                      <input 
                                                          type="number" 
                                                          name={`score-${student.id}`}
                                                          id={`score-${student.id}`}
                                                          min="0" max="100" 
                                                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                          value={grade.score}
                                                          onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                      />
                                                  </td>
	                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${(previewSbtsFinal ?? 0) < kkm && previewSbtsFinal !== null ? 'text-red-600' : 'text-gray-900'} bg-yellow-50`}>
	                                                      {previewSbtsFinal !== null && previewSbtsFinal !== undefined ? previewSbtsFinal.toFixed(2) : '-'}
	                                                  </td>
                                              </>
                                          ) : isFinalComponent ? (
                                              <>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-500'} bg-blue-50`}>{displayFormative}</td>
	                                                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 bg-gray-50">{backendSbts !== null && backendSbts !== undefined ? backendSbts.toFixed(2) : '-'}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                      <input 
                                                          type="number" 
                                                          name={`score-${student.id}`}
                                                          id={`score-${student.id}`}
                                                          min="0" max="100" 
                                                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                          value={grade.score}
                                                          onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                      />
                                                  </td>
	                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${(previewSasFinal ?? 0) < kkm && previewSasFinal !== null ? 'text-red-600' : 'text-gray-900'} bg-yellow-50`}>
	                                                      {previewSasFinal !== null && previewSasFinal !== undefined ? previewSasFinal.toFixed(2) : '-'}
	                                                  </td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                       <textarea 
                                                          name={`description-${student.id}`}
                                                          id={`description-${student.id}`}
                                                          placeholder="Deskripsi Capaian"
                                                          rows={2}
                                                          className="w-full min-w-[300px] px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                                                          value={descriptions[student.id] || ''}
                                                          onChange={(e) => handleDescriptionChange(student.id, e.target.value)}
                                                      />
                                                  </td>
                                              </>
                                          ) : (
                                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                                  <input 
                                                      type="number" 
                                                      name={`score-${student.id}`}
                                                      id={`score-${student.id}`}
                                                      min="0" max="100" 
                                                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                      value={grade.score}
                                                      onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                  />
                                              </td>
                                          )}
                                          
                                          <td className="px-6 py-4 whitespace-nowrap text-center">
	                                              {getStatusBadge(rowStatusScorePreview)}
                                          </td>
                                      </tr>
                                  );
                              })
                          ) : (
                              <tr><td colSpan={12} className="text-center py-8">Tidak ada siswa</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>

              <div className="fixed bottom-6 right-6 z-10">
                  <button 
                      onClick={handleSaveGrades}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-1"
                  >
                      {saving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      <span className="font-bold">Simpan Nilai</span>
                  </button>
              </div>
          </div>
      )}
      {/* Modal Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => setShowSettingsModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Setting Capaian Kompetensi</h3>
                    <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4">
                        <p className="font-semibold mb-1">Panduan Predikat:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li><strong>A</strong> : Nilai ≥ 86</li>
                            <li><strong>B</strong> : Nilai ≥ KKM &lt; 86</li>
                            <li><strong>C</strong> : Nilai ≥ 60 &lt; KKM</li>
                            <li><strong>D</strong> : Nilai &lt; 60</li>
                        </ul>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat A</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                            value={competencySettings.A}
                            onChange={e => setCompetencySettings(prev => ({...prev, A: e.target.value}))}
                            placeholder="Contoh: Sangat baik dalam memahami materi..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat B</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                            value={competencySettings.B}
                            onChange={e => setCompetencySettings(prev => ({...prev, B: e.target.value}))}
                            placeholder="Contoh: Baik dalam memahami materi..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat C</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                            value={competencySettings.C}
                            onChange={e => setCompetencySettings(prev => ({...prev, C: e.target.value}))}
                            placeholder="Contoh: Cukup dalam memahami materi..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat D</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                            value={competencySettings.D}
                            onChange={e => setCompetencySettings(prev => ({...prev, D: e.target.value}))}
                            placeholder="Contoh: Perlu bimbingan dalam memahami materi..."
                        />
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button 
                        onClick={() => setShowSettingsModal(false)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                        disabled={saving}
                    >
                        Batal
                    </button>
                    <button 
                        onClick={handleSaveSettings}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Simpan & Terapkan
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
