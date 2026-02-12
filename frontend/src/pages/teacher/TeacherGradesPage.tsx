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
  nf1?: string;
  nf2?: string;
  nf3?: string;
  nf4?: string;
  nf5?: string;
  nf6?: string;
  score: string;
}

interface LocalAcademicYear {
  id: number;
  name: string;
  is_active: boolean;
}

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
  const [formatifMap, setFormatifMap] = useState<Record<number, number>>({});
  const [sbtsMap, setSbtsMap] = useState<Record<number, number>>({});
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  
  // Check if selected component is Formatif / SBTS / SAS
  const selectedComponentObj = gradeComponents.find(c => c.id.toString() === selectedComponent);
  const isFormatifComponent = selectedComponentObj?.type === 'FORMATIVE';
  const isSbtsComponent = selectedComponentObj?.type === 'MIDTERM';
  const isSasComponent = selectedComponentObj?.type === 'FINAL';

  const getDescription = () => {
    if (isFormatifComponent) return "Nilai Formatif (NF) adalah nilai harian siswa. Rata-rata NF1-NF3 digunakan untuk SBTS, dan Rata-rata NF1-NF6 digunakan untuk SAS.";
    if (isSbtsComponent) return "Nilai SBTS (Sumatif Bersama Tengah Semester) adalah nilai ujian tengah semester. Nilai Rapor SBTS dihitung dari gabungan Rata-rata NF (1-3) dan Nilai SBTS.";
    if (isSasComponent) return "Nilai SAS/SAT (Sumatif Akhir Semester/Tahun) adalah nilai ujian akhir. Nilai Rapor SAS dihitung dari gabungan Rata-rata NF (1-6), Nilai Rapor SBTS, dan Nilai SAS.";
    return "Input nilai per komponen untuk siswa";
  };

  // Derived state for filtered components
  const selectedAssignmentObj = assignments.find(a => a.id.toString() === selectedAssignment);
  const filteredComponents = selectedAssignmentObj 
    ? gradeComponents.filter(c => c.subjectId === selectedAssignmentObj.subject.id)
    : [];

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedAssignment) {
      fetchStudents();
    }
  }, [selectedAssignment]);

  useEffect(() => {
    if (selectedAssignment && selectedComponent && selectedAcademicYear && selectedSemester) {
      fetchExistingGrades();
    }
  }, [selectedAssignment, selectedComponent, selectedAcademicYear, selectedSemester]);

  // Helper to calculate Final Score based on weights
  const calculateFinalScore = (nfScore: number, sbtsScore: number, sasScore: number) => {
    // Find components and their weights
    const formativeComp = gradeComponents.find(c => c.subjectId === (selectedAssignmentObj?.subject.id || 0) && c.type === 'FORMATIVE');
    const midtermComp = gradeComponents.find(c => c.subjectId === (selectedAssignmentObj?.subject.id || 0) && c.type === 'MIDTERM');
    const finalComp = gradeComponents.find(c => c.subjectId === (selectedAssignmentObj?.subject.id || 0) && c.type === 'FINAL');

    const weightFormatif = formativeComp?.weight || 0;
    const weightSbts = midtermComp?.weight || 0;
    const weightSas = finalComp?.weight || 0;

    let totalScore = 0;
    let totalWeight = 0;

    // Add weighted scores
    if (weightFormatif > 0) {
        totalScore += nfScore * (weightFormatif / 100);
        totalWeight += weightFormatif;
    }
    if (weightSbts > 0) {
        totalScore += sbtsScore * (weightSbts / 100);
        totalWeight += weightSbts;
    }
    if (weightSas > 0) {
        totalScore += sasScore * (weightSas / 100);
        totalWeight += weightSas;
    }

    // Normalize if weights don't sum to 100 (but > 0)
    if (totalWeight > 0 && totalWeight !== 100) {
        return (totalScore / totalWeight) * 100;
    }
    
    // Fallback if no weights defined (equal weight 33.3%)
    if (totalWeight === 0) {
        return (nfScore + sbtsScore + sasScore) / 3;
    }

    return totalScore;
  };

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
                // Ensure we have a SAS score input
                if (grade && grade.score && !isNaN(parseFloat(grade.score))) {
                    const sasScore = parseFloat(grade.score);
                    const avgNf6 = parseFloat((formatifMap[student.id] || 0).toString());
                    const savedSbts = parseFloat((sbtsMap[student.id] || 0).toString());
                    
                    const raporSas = calculateFinalScore(avgNf6, savedSbts, sasScore);
                    const predicate = calculatePredicate(raporSas, kkm);
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
  }, [grades, isSasComponent, competencySettings, students, formatifMap, sbtsMap, kkm, gradeComponents]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      const [ayRes, assignRes, compRes] = await Promise.all([
        academicYearService.list({ limit: 100 }),
        teacherAssignmentService.list({ limit: 1000 }),
        gradeService.getComponents()
      ]);

      // Handle Academic Years
      const aysResponse = ayRes as { data?: { academicYears?: AcademicYear[] }, academicYears?: AcademicYear[] };
      const ays = aysResponse.data?.academicYears || aysResponse.academicYears || [];
      if (Array.isArray(ays)) {
        setAcademicYears(ays.map((ay) => ({
            id: ay.id,
            name: ay.name,
            is_active: ay.isActive
        })));
        const activeAy = ays.find((ay) => ay.isActive);
        if (activeAy) setSelectedAcademicYear(activeAy.id.toString());
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
      }

      // Handle Components
      const compsResponse = compRes as { data?: GradeComponent[] } | GradeComponent[];
      const comps = 'data' in compsResponse && Array.isArray(compsResponse.data) ? compsResponse.data : (Array.isArray(compsResponse) ? compsResponse : []);
      if (Array.isArray(comps)) {
        setGradeComponents(comps);
      }

    } catch (error) {
      console.error('Fetch initial data error:', error);
      toast.error('Gagal memuat data awal');
    } finally {
      setLoading(false);
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
                nf1: '', nf2: '', nf3: '', nf4: '', nf5: '', nf6: '',
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
      const allGrades = ('data' in allGradesResponse && Array.isArray(allGradesResponse.data) ? allGradesResponse.data : (Array.isArray(allGradesResponse) ? allGradesResponse : [])) as any[];
      
      const newFormatif: Record<number, number> = {};
      const newSbts: Record<number, number> = {};

      allGrades.forEach((g: any) => {
        // Check component type
        // The API returns component object (Prisma default)
        const type = g.component?.type || g.grade_component?.type;
        const studentId = g.studentId || g.student_id;
        
        // Populate Formatif Map (using score which is avg of NF1-3 usually, but here we might want actual NFs if needed)
        // Actually, we need NF values for calculation. 
        // But for cross-component access (e.g. SBTS needs Avg NF), we usually rely on saved score or recalculate.
        // Let's assume Formatif Score IS the average.
        if (type === 'FORMATIVE' || type === 'FORMATIF') {
             // We can re-calculate avg if we have NFs, or trust the score.
             // Let's calculate from NFs if available for accuracy
             const nfs = [g.nf1, g.nf2, g.nf3, g.nf4, g.nf5, g.nf6].filter(n => n !== null && n !== undefined).map(n => Number(n));
             if (nfs.length > 0) {
                 newFormatif[studentId] = nfs.reduce((a, b) => a + b, 0) / nfs.length;
             } else {
                 newFormatif[studentId] = g.score;
             }
        }

        if (type === 'MIDTERM') {
            newSbts[studentId] = g.score;
        }
      });

      setFormatifMap(newFormatif);
      setSbtsMap(newSbts);

      if (isSasComponent) {
          try {
              const reportRes = await gradeService.getReportGrades({
                  class_id: assignment.class.id,
                  academic_year_id: parseInt(selectedAcademicYear),
                  semester: selectedSemester
              });
              const reportResponse = reportRes as { data?: any[] } | any[];
              const reportData = 'data' in reportResponse && Array.isArray(reportResponse.data) ? reportResponse.data : (Array.isArray(reportResponse) ? reportResponse : []);
              const newDescriptions: Record<number, string> = {};
              if (Array.isArray(reportData)) {
                  reportData.forEach((r: any) => {
                      if (r.description) newDescriptions[r.studentId] = r.description;
                  });
              }
              setDescriptions(newDescriptions);
          } catch (e) {
              console.error('Error fetching report grades', e);
          }
      } else {
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

        const prev = prevGrades.find(g => g.student_id === grade.student_id);
        
        return {
            ...grade,
            score: existing ? existing.score.toString() : '',
            nf1: formatifData?.nf1?.toString() || existing?.nf1?.toString() || prev?.nf1 || '',
            nf2: formatifData?.nf2?.toString() || existing?.nf2?.toString() || prev?.nf2 || '',
            nf3: formatifData?.nf3?.toString() || existing?.nf3?.toString() || prev?.nf3 || '',
            nf4: formatifData?.nf4?.toString() || existing?.nf4?.toString() || prev?.nf4 || '',
            nf5: formatifData?.nf5?.toString() || existing?.nf5?.toString() || prev?.nf5 || '',
            nf6: formatifData?.nf6?.toString() || existing?.nf6?.toString() || prev?.nf6 || '',
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

  const handleScoreChange = (studentId: number, field: 'score' | 'nf1' | 'nf2' | 'nf3' | 'nf4' | 'nf5' | 'nf6', value: string) => {
    if (value !== '' && (isNaN(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      return;
    }

    setGrades(prev => prev.map(grade => {
      if (grade.student_id === studentId) {
        const updated = { ...grade, [field]: value };
        
        // Auto-calculate average for Formatif
        if (isFormatifComponent && field.startsWith('nf')) {
            const nfValues = [
                field === 'nf1' ? value : updated.nf1,
                field === 'nf2' ? value : updated.nf2,
                field === 'nf3' ? value : updated.nf3,
                field === 'nf4' ? value : updated.nf4,
                field === 'nf5' ? value : updated.nf5,
                field === 'nf6' ? value : updated.nf6,
            ].filter(v => v !== '' && v !== undefined).map(v => parseFloat(v as string));

            if (nfValues.length > 0) {
                const avg = nfValues.reduce((a, b) => a + b, 0) / nfValues.length;
                updated.score = avg.toFixed(2);
            } else {
                updated.score = '';
            }
        }
        
        // Auto-fill Description for SAS
        if (isSasComponent && field === 'score') {
            const sasScore = parseFloat(value || '0');
            const avgNf6 = parseFloat((formatifMap[studentId] || 0).toString());
            const savedSbts = parseFloat((sbtsMap[studentId] || 0).toString());
            
            // Rapor SAS: Weighted Calculation
            const raporSas = calculateFinalScore(avgNf6, savedSbts, sasScore);
            
            const predicate = calculatePredicate(raporSas, kkm);
            const desc = competencySettings[predicate as keyof typeof competencySettings];
            
            if (desc) {
                setDescriptions(prevDesc => {
                     // Only update if it was empty or auto-generated before (to respect manual edits)
                     // But here, user is actively typing score, so they expect the description to update.
                     // The useEffect handles the "initial load" or "bulk update" logic.
                     // Here, if they change score, we should update description IF it's not custom.
                     // For simplicity and better UX: if they change score, update description.
                     // If they want custom, they edit description AFTER score.
                    return {
                        ...prevDesc,
                        [studentId]: desc
                    };
                });
            }
        }
        
        return updated;
      }
      return grade;
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
                // Ensure we use valid numbers
                const sasScore = parseFloat(grade.score || '0');
                const avgNf6 = parseFloat((formatifMap[student.id] || 0).toString());
                const savedSbts = parseFloat((sbtsMap[student.id] || 0).toString());
                
                const raporSas = calculateFinalScore(avgNf6, savedSbts, sasScore);
                const predicate = calculatePredicate(raporSas, kkm);
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
        gradesPayload = grades.map(g => ({
            student_id: g.student_id,
            subject_id: assignment.subject.id,
            academic_year_id: parseInt(selectedAcademicYear),
            grade_component_id: parseInt(selectedComponent),
            semester: selectedSemester,
            score: parseFloat(g.score || '0'),
            nf1: g.nf1 === '' ? null : (g.nf1 ? parseFloat(g.nf1) : undefined),
            nf2: g.nf2 === '' ? null : (g.nf2 ? parseFloat(g.nf2) : undefined),
            nf3: g.nf3 === '' ? null : (g.nf3 ? parseFloat(g.nf3) : undefined),
            nf4: g.nf4 === '' ? null : (g.nf4 ? parseFloat(g.nf4) : undefined),
            nf5: g.nf5 === '' ? null : (g.nf5 ? parseFloat(g.nf5) : undefined),
            nf6: g.nf6 === '' ? null : (g.nf6 ? parseFloat(g.nf6) : undefined),
        }));
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
                                        let displayName = c.name;
                                        const nameLower = c.name.toLowerCase();
                                        if (c.type === 'FORMATIVE' || nameLower.includes('formatif')) displayName = 'Formatif (40%)';
                                        else if (c.type === 'MIDTERM' || nameLower.includes('tengah semester')) displayName = 'SBTS (Sumatif Bersama Tengah Semester) 30%';
                                        else if (c.type === 'FINAL' || nameLower.includes('akhir semester')) displayName = 'SAS/SAT (Sumatif Akhir Semester/Tahun) 30%';
                                        
                                        return <option key={c.id} value={c.id}>{displayName}</option>;
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
                                      {['NF1', 'NF2', 'NF3', 'NF4', 'NF5', 'NF6'].map(nf => (
                                          <th key={nf} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{nf}</th>
                                      ))}
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Rerata SBTS (NF1-3)</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">Rerata SAS (NF1-6)</th>
                                  </>
                              ) : isSbtsComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Rata-rata NF</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai SBTS</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor SBTS</th>
                                  </>
                              ) : isSasComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Rata-rata NF</th>
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
                                  
                                  // Helper calculations
                                  const getAvgNf3 = () => {
                                      // Or better, filter only non-empty strings from the inputs
                                      const validNfs = [grade.nf1, grade.nf2, grade.nf3].filter(v => v !== '' && v !== undefined && v !== null).map(v => parseFloat(v as string));
                                      if (validNfs.length === 0) return 0;
                                      return validNfs.reduce((a, b) => a + b, 0) / validNfs.length;
                                  };

                                  const getAvgNf6 = () => {
                                      const validNfs = [grade.nf1, grade.nf2, grade.nf3, grade.nf4, grade.nf5, grade.nf6].filter(v => v !== '' && v !== undefined && v !== null).map(v => parseFloat(v as string));
                                      if (validNfs.length === 0) return 0;
                                      return validNfs.reduce((a, b) => a + b, 0) / validNfs.length;
                                  };

                                  const avgNf3 = getAvgNf3();
                                  const avgNf6 = getAvgNf6();
                                  
                                  // For SBTS/SAS view, we use the stored map or the current calculation if available
                                  const displayAvgNf3 = avgNf3 > 0 ? avgNf3.toFixed(2) : (formatifMap[student.id] ? formatifMap[student.id].toFixed(2) : '-');
                                  // SAS view usually needs full average
                                  const displayAvgNf6 = avgNf6 > 0 ? avgNf6.toFixed(2) : (formatifMap[student.id] ? formatifMap[student.id].toFixed(2) : '-');

                                  const sbtsScore = parseFloat(grade.score || '0');
                                  const savedSbts = sbtsMap[student.id] || 0;
                                  
                                  // Rapor Calculations
                                  const raporSbts = isSbtsComponent ? ((avgNf3 + sbtsScore) / 2) : 0;
                                  
                                  // Rapor SAS: (AvgNF + SBTS + SAS) / 3
                                  // For SAS view, grade.score is SAS Score. SBTS is from map.
                                  const sasScore = parseFloat(grade.score || '0');
                                  const raporSas = isSasComponent ? ((avgNf6 + savedSbts + sasScore) / 3) : 0;

                                  return (
                                      <tr key={student.id} className="hover:bg-gray-50">
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.nisn}</td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.full_name}</td>
                                          
                                          {isFormatifComponent ? (
                                              <>
                                                  {['nf1', 'nf2', 'nf3', 'nf4', 'nf5', 'nf6'].map(nf => (
                                                      <td key={nf} className="px-2 py-4 text-center">
                                                          <input 
                                                              type="number" 
                                                              name={`${nf}-${student.id}`}
                                                              id={`${nf}-${student.id}`}
                                                              min="0" max="100" 
                                                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                              value={(grade as any)[nf] || ''}
                                                              onChange={(e) => handleScoreChange(student.id, nf as any, e.target.value)}
                                                          />
                                                      </td>
                                                  ))}
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${avgNf3 < kkm && avgNf3 > 0 ? 'text-red-600 font-bold' : 'text-gray-900'} bg-blue-50`}>
                                                      {avgNf3 > 0 ? avgNf3.toFixed(2) : '-'}
                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${avgNf6 < kkm && avgNf6 > 0 ? 'text-red-600 font-bold' : 'text-gray-900'} bg-green-50`}>
                                                      {avgNf6 > 0 && (grade.nf4 || grade.nf5 || grade.nf6) ? avgNf6.toFixed(2) : '-'}
                                                  </td>
                                              </>
                                          ) : isSbtsComponent ? (
                                              <>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm ${parseFloat(displayAvgNf3) < kkm ? 'text-red-600 font-bold' : 'text-gray-500'} bg-blue-50`}>{displayAvgNf3}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                      <input 
                                                          type="number" 
                                                          name={`score-${student.id}`}
                                                          id={`score-${student.id}`}
                                                          min="0" max="100" 
                                                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                          value={grade.score}
                                                          onChange={(e) => handleScoreChange(student.id, 'score', e.target.value)}
                                                      />
                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${raporSbts < kkm && grade.score ? 'text-red-600' : 'text-gray-900'} bg-yellow-50`}>
                                                      {grade.score ? raporSbts.toFixed(2) : '-'}
                                                  </td>
                                              </>
                                          ) : isSasComponent ? (
                                              <>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm ${parseFloat(displayAvgNf6) < kkm ? 'text-red-600 font-bold' : 'text-gray-500'} bg-blue-50`}>{displayAvgNf6}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 bg-gray-50">{savedSbts || '-'}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                      <input 
                                                          type="number" 
                                                          name={`score-${student.id}`}
                                                          id={`score-${student.id}`}
                                                          min="0" max="100" 
                                                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                          value={grade.score}
                                                          onChange={(e) => handleScoreChange(student.id, 'score', e.target.value)}
                                                      />
                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${raporSas < kkm && grade.score ? 'text-red-600' : 'text-gray-900'} bg-yellow-50`}>
                                                      {grade.score ? raporSas.toFixed(2) : '-'}
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
                                                      onChange={(e) => handleScoreChange(student.id, 'score', e.target.value)}
                                                  />
                                              </td>
                                          )}
                                          
                                          <td className="px-6 py-4 whitespace-nowrap text-center">
                                              {getStatusBadge(
                                                  isSbtsComponent ? raporSbts :
                                                  isSasComponent ? raporSas :
                                                  parseFloat(grade.score || '0')
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
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
