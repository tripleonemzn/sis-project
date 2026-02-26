import { useState, useEffect } from 'react';
import { Save, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../../services/grade.service';
import type { GradeComponent } from '../../services/grade.service';
import { academicYearService } from '../../services/academicYear.service';
import type { AcademicYear } from '../../services/academicYear.service';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../services/teacherAssignment.service';
import { userService } from '../../services/user.service';
import type { User } from '../../types/auth';

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
  description?: string | null;
}

interface LocalAcademicYear {
  id: number;
  name: string;
  is_active: boolean;
}

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

const averageValues = (values: number[]): number | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, item) => acc + item, 0) / values.length;
};

const formatSeriesValues = (values: number[]) =>
  values
    .map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    .join(', ');

const resolveComponentReportSlot = (
  component?: GradeComponent,
): 'NONE' | 'FORMATIF' | 'SBTS' | 'SAS' | 'US_THEORY' | 'US_PRACTICE' => {
  const explicit = String(component?.reportSlot || '').toUpperCase();
  if (
    explicit === 'FORMATIF' ||
    explicit === 'SBTS' ||
    explicit === 'SAS' ||
    explicit === 'US_THEORY' ||
    explicit === 'US_PRACTICE' ||
    explicit === 'NONE'
  ) {
    return explicit;
  }
  if (component?.type === 'FORMATIVE') return 'FORMATIF';
  if (component?.type === 'MIDTERM') return 'SBTS';
  if (component?.type === 'FINAL') return 'SAS';
  if (component?.type === 'US_THEORY') return 'US_THEORY';
  if (component?.type === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
};

const resolveComponentEntryMode = (component?: GradeComponent): 'NF_SERIES' | 'SINGLE_SCORE' => {
  const explicit = String(component?.entryMode || '').toUpperCase();
  if (explicit === 'NF_SERIES' || explicit === 'SINGLE_SCORE') {
    return explicit;
  }
  return component?.type === 'FORMATIVE' ? 'NF_SERIES' : 'SINGLE_SCORE';
};

const buildComponentDisplayLabel = (component: GradeComponent) => {
  const baseLabel = String(component.name || component.code || 'Komponen').trim();
  const entryMode = resolveComponentEntryMode(component);
  const reportSlot = resolveComponentReportSlot(component);
  if (entryMode === 'NF_SERIES') return `${baseLabel} [NF Series]`;
  if (reportSlot !== 'NONE') return `${baseLabel} [${reportSlot}]`;
  return baseLabel;
};

export const TeacherGradesPage = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Filter states
  const [academicYears, setAcademicYears] = useState<LocalAcademicYear[]>([]);
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
  
  // Check selected component mode/slot dynamically
  const selectedComponentObj = gradeComponents.find(c => c.id.toString() === selectedComponent);
  const selectedComponentEntryMode = resolveComponentEntryMode(selectedComponentObj);
  const selectedComponentReportSlot = resolveComponentReportSlot(selectedComponentObj);
  const isFormatifComponent = selectedComponentEntryMode === 'NF_SERIES';
  const isSbtsComponent = selectedComponentReportSlot === 'SBTS';
  const isSasComponent = selectedComponentReportSlot === 'SAS';

  const getDescription = () => {
    const componentName = String(selectedComponentObj?.name || selectedComponentObj?.code || 'komponen ini').trim();
    if (isFormatifComponent) {
      return `Nilai ${componentName} diinput per butir. Rata-rata formatif, SBTS, SAS, dan nilai rapor dihitung dari backend (single source of truth).`;
    }
    if (isSbtsComponent) {
      return `Nilai ${componentName} adalah nilai tengah semester. Nilai rapor SBTS mengikuti kalkulasi backend berdasarkan konfigurasi komponen aktif.`;
    }
    if (isSasComponent) {
      return `Nilai ${componentName} adalah nilai akhir semester/tahun. Nilai rapor akhir mengikuti kalkulasi backend berdasarkan konfigurasi komponen aktif.`;
    }
    return "Input nilai per komponen untuk siswa";
  };

  // Derived state for filtered components
  const selectedAssignmentObj = assignments.find(a => a.id.toString() === selectedAssignment);
  const filteredComponents = selectedAssignmentObj
    ? gradeComponents.filter(c => c.subjectId === selectedAssignmentObj.subject.id)
    : gradeComponents;

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    try {
      if (!isFilterRestoreDone) return;
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(
        TEACHER_GRADES_FILTER_STORAGE_KEY,
        JSON.stringify({
          academicYear: selectedAcademicYear,
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
  }, [selectedAssignment]);

  useEffect(() => {
    if (selectedAssignment && selectedAcademicYear) {
      fetchGradeComponents();
      return;
    }
    setGradeComponents([]);
    setSelectedComponent('');
  }, [selectedAssignment, selectedAcademicYear, assignments]);

  useEffect(() => {
    if (selectedAssignment && selectedComponent && selectedAcademicYear && selectedSemester) {
      fetchExistingGrades();
    }
  }, [selectedAssignment, selectedComponent, selectedAcademicYear, selectedSemester]);

  // Auto-fill descriptions for missing entries (defensive fix)
  useEffect(() => {
    if (isSasComponent && (competencySettings.A || competencySettings.B || competencySettings.C || competencySettings.D)) {
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
  }, [grades, isSasComponent, competencySettings, students, reportGradeMap, kkm, gradeComponents]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setIsFilterRestoreDone(false);
      
      const [ayRes, assignRes] = await Promise.all([
        academicYearService.list({ limit: 100 }),
        teacherAssignmentService.list({ limit: 1000 }),
      ]);

      let restoredFilter: {
        academicYear?: string;
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

      // Handle Academic Years
      const aysResponse = ayRes as { data?: { academicYears?: AcademicYear[] }, academicYears?: AcademicYear[] };
      const ays = aysResponse.data?.academicYears || aysResponse.academicYears || [];
      if (Array.isArray(ays)) {
        setAcademicYears(ays.map((ay) => ({
            id: ay.id,
            name: ay.name,
            is_active: ay.isActive
        })));
        const restoredAcademicYear = restoredFilter?.academicYear;
        if (restoredAcademicYear && ays.some((ay) => ay.id.toString() === restoredAcademicYear)) {
          setSelectedAcademicYear(restoredAcademicYear);
        } else {
          const activeAy = ays.find((ay) => ay.isActive);
          if (activeAy) setSelectedAcademicYear(activeAy.id.toString());
        }
      }

      // Handle Assignments
      const assignResponse = assignRes as { data?: { assignments?: TeacherAssignment[] }, assignments?: TeacherAssignment[] };
      const assignsData = assignResponse.data?.assignments || assignResponse.assignments || [];
      if (Array.isArray(assignsData)) {
        const sorted = assignsData.sort((a: TeacherAssignment, b: TeacherAssignment) => {
          const subjectCompare = a.subject.name.localeCompare(b.subject.name);
          if (subjectCompare !== 0) return subjectCompare;
          return a.class.name.localeCompare(b.class.name);
        });
        setAssignments(sorted);
        const restoredAssignment = restoredFilter?.assignment;
        if (restoredAssignment && sorted.some((assignment) => assignment.id.toString() === restoredAssignment)) {
          setSelectedAssignment(restoredAssignment);
        }
      }

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

  const fetchGradeComponents = async () => {
    try {
      const assignment = assignments.find(a => a.id.toString() === selectedAssignment);
      if (!assignment || !selectedAcademicYear) return;

      const response = await gradeService.getComponents({
        subject_id: assignment.subject.id,
        academic_year_id: parseInt(selectedAcademicYear),
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
      const assignment = assignments.find(a => a.id === parseInt(selectedAssignment));
      
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
      const assignment = assignments.find(a => a.id.toString() === selectedAssignment);
      if (!assignment) return;

      const response = await gradeService.getGradesByClassSubject(
        assignment.class.id,
        assignment.subject.id,
        parseInt(selectedAcademicYear),
        selectedSemester
      );

      const allGradesResponse = response as { data?: any[] } | any[];
      const rawGrades = ('data' in allGradesResponse && Array.isArray(allGradesResponse.data) ? allGradesResponse.data : (Array.isArray(allGradesResponse) ? allGradesResponse : [])) as any[];
      const latestGradesByKey = new Map<string, any>();
      rawGrades.forEach((row: any) => {
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
          const reportResponse = reportRes as { data?: any[] } | any[];
          const reportData = 'data' in reportResponse && Array.isArray(reportResponse.data) ? reportResponse.data : (Array.isArray(reportResponse) ? reportResponse : []);
          const nextReportMap: Record<number, StudentReportGrade> = {};
          const nextDescriptions: Record<number, string> = {};

          if (Array.isArray(reportData)) {
              reportData.forEach((r: any) => {
                  if (!r?.studentId) return;
                  nextReportMap[r.studentId] = {
                      studentId: Number(r.studentId),
                      formatifScore: r.formatifScore ?? null,
                      sbtsScore: r.sbtsScore ?? null,
                      sasScore: r.sasScore ?? null,
                      finalScore: r.finalScore ?? null,
                      description: r.description ?? null,
                  };
                  if (r.description) {
                      nextDescriptions[r.studentId] = r.description;
                  }
              });
          }
          setReportGradeMap(nextReportMap);
          setDescriptions(isSasComponent ? nextDescriptions : {});
      } catch (e) {
          console.error('Error fetching report grades', e);
          setReportGradeMap({});
          setDescriptions({});
      }

      // Update grades array
      setGrades(prevGrades => prevGrades.map(grade => {
        const existing = allGrades.find(
            (g: any) => (g.studentId === grade.student_id || g.student_id === grade.student_id) && 
            g.componentId.toString() === selectedComponent
        );
        
        // Find FORMATIVE data for NF values regardless of selected component
        const formatifData = allGrades.find(
            (g: any) => (g.studentId === grade.student_id || g.student_id === grade.student_id) && 
            (g.component?.type === 'FORMATIVE' || g.component?.type === 'FORMATIF')
        );

        return {
            ...grade,
            score: existing ? existing.score.toString() : '',
            formativeSeriesInput: (() => {
                const dynamicSeries = Array.isArray(formatifData?.formativeSeries)
                  ? formatifData.formativeSeries
                  : Array.isArray(existing?.formativeSeries)
                    ? existing.formativeSeries
                    : [];
                if (dynamicSeries.length > 0) {
                    if (isLegacyZeroPaddedSeries(dynamicSeries)) {
                      return '';
                    }
                    return dynamicSeries.join(', ');
                }
                const legacyValues = [
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
                ];
                const legacySeries = normalizeLegacySeriesValues(legacyValues);
                if (isLegacyZeroPaddedSeries(legacySeries)) {
                  return '';
                }
                if (legacySeries.length > 0) {
                  return legacySeries.join(', ');
                }
                return '';
            })(),
        };
      }));

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
    if (!isSasComponent) return;
    
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
            const assignment = assignments.find(a => a.id.toString() === selectedAssignment);
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
      toast.error('Pilih tahun ajaran, kelas & mata pelajaran, dan komponen nilai terlebih dahulu');
      return;
    }

    const assignment = assignments.find(a => a.id.toString() === selectedAssignment);
    if (!assignment) return;

    let gradesPayload: any[] = [];

    if (isFormatifComponent) {
        gradesPayload = grades.map(g => {
            const parsedSeries = parseFormativeSeriesInput(g.formativeSeriesInput || '');
            if (parsedSeries.invalid) {
                throw new Error('Daftar nilai formatif harus berupa angka 0-100, dipisahkan koma.');
            }
            const seriesValues = parsedSeries.values;
            let scoreValue: number | null = null;
            if (seriesValues.length > 0) {
                scoreValue = seriesValues.reduce((acc, value) => acc + value, 0) / seriesValues.length;
            } else if (g.score !== '') {
                const parsed = Number(g.score);
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                    throw new Error('Nilai formatif harus berupa angka 0-100.');
                }
                scoreValue = parsed;
            }

            return {
                student_id: g.student_id,
                subject_id: assignment.subject.id,
                academic_year_id: parseInt(selectedAcademicYear),
                grade_component_id: parseInt(selectedComponent),
                semester: selectedSemester,
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
            semester: selectedSemester,
            score: grade.score === '' ? null : parseFloat(grade.score),
            description: isSasComponent ? (descriptions[grade.student_id] || '') : undefined
        }));
    }

    setSaving(true);
    try {
        await gradeService.bulkInputGrades({ grades: gradesPayload });
        toast.success('Nilai berhasil disimpan');
        fetchExistingGrades();
    } catch (error: any) {
        console.error('Save grades error:', error);
        toast.error(error.message || 'Gagal menyimpan nilai');
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm">
        <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
                <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
            </div>
            <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Informasi Penilaian</h3>
                <div className="mt-1 text-sm text-blue-700">
                    {getDescription()}
                </div>
            </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
                <label htmlFor="academic-year" className="block text-sm font-medium text-gray-700 mb-2">Tahun Ajaran</label>
                <select 
                    id="academic-year"
                    name="academic-year"
                    value={selectedAcademicYear}
                    onChange={(e) => setSelectedAcademicYear(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="">Pilih Tahun Ajaran</option>
                    {academicYears.map(ay => (
                        <option key={ay.id} value={ay.id}>{ay.name} {ay.is_active ? '(Aktif)' : ''}</option>
                    ))}
                </select>
            </div>
            
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
                        {assignments.map(a => (
                            <option key={a.id} value={a.id}>{a.class.name} - {a.subject.name} (KKM: {a.kkm})</option>
                        ))}
                    </select>
                    {!selectedSemester && (
                        <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Silahkan Pilih Semester</p>
                    )}
                </div>
            </div>

            <div className="md:col-span-2 lg:col-span-2">
                <div className={isSasComponent ? "flex gap-2 items-end" : ""}>
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
                        {isSasComponent && (
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
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ SBTS</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">x̄ SAS</th>
                                  </>
                              ) : isSbtsComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ NF</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai SBTS</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor SBTS</th>
                                  </>
                              ) : isSasComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ NF</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Nilai SBTS</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai SAS</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor SAS</th>
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
	                                  const backendFormative = report?.formatifScore ?? null;
	                                  const backendSbts = report?.sbtsScore ?? null;
	                                  const backendFinal = report?.finalScore ?? null;
	                                  const currentScore = (() => {
	                                    const parsed = Number(grade.score);
	                                    return Number.isFinite(parsed) ? parsed : null;
	                                  })();
                                  const rowStatusScore =
                                    backendFinal !== null && backendFinal !== undefined
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
                                  const displayFormative =
                                    previewFormative !== null && previewFormative !== undefined
                                      ? previewFormative.toFixed(2)
                                      : '-';
	                                  const previewSbtsFinal = (() => {
	                                    if (!isSbtsComponent) return backendFinal;
	                                    const values = [previewFormative, currentScore]
	                                      .map((value) => Number(value))
	                                      .filter((value) => Number.isFinite(value));
	                                    const avg = averageValues(values);
	                                    return avg === null ? backendFinal : avg;
	                                  })();
	                                  const previewSasFinal = (() => {
	                                    if (!isSasComponent) return backendFinal;
	                                    const values = [previewFormative, backendSbts, currentScore]
	                                      .map((value) => Number(value))
	                                      .filter((value) => Number.isFinite(value));
	                                    const avg = averageValues(values);
	                                    return avg === null ? backendFinal : avg;
	                                  })();
	                                  const rowStatusScorePreview =
	                                    isSbtsComponent
	                                      ? previewSbtsFinal ?? 0
	                                      : isSasComponent
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
		                                                          : `${formativeParsed.values.length || 1} kotak entri`}
	                                                      </p>
		                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-900'} bg-blue-50`}>
                                                      {displayFormative}
                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-900'} bg-green-50`}>
                                                      {displayFormative}
                                                  </td>
                                              </>
                                          ) : isSbtsComponent ? (
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
                                          ) : isSasComponent ? (
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
	                                              {getStatusBadge(
	                                                  rowStatusScorePreview
	                                              )}
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
