import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../../../services/grade.service';
import type { GradeComponent } from '../../../services/grade.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';
import { userService } from '../../../services/user.service';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';

interface Student {
  id: number;
  name: string;
  nisn: string;
  nis: string;
}

type SemesterValue = 'ODD' | 'EVEN' | '';

type StudentGradeApiRow = {
  id?: number;
  studentId?: number;
  student_id?: number;
  subjectId?: number;
  subject_id?: number;
  academicYearId?: number;
  academic_year_id?: number;
  componentId?: number;
  component_id?: number;
  semester?: string;
  score?: number | null;
};

export const UjianSekolahPage = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();
  const activeAcademicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0) || null;
  
  // Data
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [gradeComponents, setGradeComponents] = useState<GradeComponent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  
  // Selections
  const [selectedSemester, setSelectedSemester] = useState<SemesterValue>(() => {
    const month = new Date().getMonth() + 1;
    return month >= 7 ? 'ODD' : 'EVEN';
  });
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  
  // Grades State: { studentId: score }
  const [grades, setGrades] = useState<Record<number, string>>({});

  const US_COMPONENT_TYPES = useMemo(() => new Set(['US_THEORY', 'US_PRACTICE']), []);

  const normalizeAssignments = useCallback((payload: unknown): TeacherAssignment[] => {
    const rawAssignments = Array.isArray((payload as { assignments?: unknown })?.assignments)
      ? ((payload as { assignments: TeacherAssignment[] }).assignments)
      : (Array.isArray(payload) ? (payload as TeacherAssignment[]) : []);

    return [...rawAssignments].sort((a, b) => {
      const subjectCompare = String(a.subject?.name || '').localeCompare(String(b.subject?.name || ''), 'id', {
        numeric: true,
        sensitivity: 'base',
      });
      if (subjectCompare !== 0) return subjectCompare;
      return String(a.class?.name || '').localeCompare(String(b.class?.name || ''), 'id', {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }, []);

  const fetchAssignmentsByAcademicYear = useCallback(
    async (academicYearId: number | string) => {
      if (!academicYearId) {
        setAssignments([]);
        setSelectedAssignment('');
        setSelectedComponent('');
        setStudents([]);
        setGradeComponents([]);
        setGrades({});
        return;
      }

      try {
        setLoading(true);
        const assignmentResponse = await teacherAssignmentService.list({
          academicYearId: Number(academicYearId),
          limit: 1000,
        });
        const assignmentPayload =
          (assignmentResponse as { data?: unknown })?.data ?? assignmentResponse;
        const assignmentsData = normalizeAssignments(assignmentPayload);

        const uniqueSubjectIds = Array.from(
          new Set(
            assignmentsData
              .map((assignment) => Number(assignment?.subjectId))
              .filter((subjectId) => Number.isInteger(subjectId) && subjectId > 0),
          ),
        );

        const componentResponses = await Promise.all(
          uniqueSubjectIds.map((subjectId) =>
            gradeService
              .getComponents({
                subject_id: subjectId,
                academic_year_id: Number(academicYearId),
              })
              .catch(() => ({ data: [] })),
          ),
        );

        const subjectIdsWithUsComponent = new Set<number>();
        componentResponses.forEach((response, index) => {
          const components = Array.isArray(response?.data) ? response.data : [];
          const hasUsComponent = components.some(
            (component: GradeComponent) =>
              Boolean(component?.isActive) && US_COMPONENT_TYPES.has(String(component?.type || '').toUpperCase()),
          );
          if (hasUsComponent) {
            subjectIdsWithUsComponent.add(uniqueSubjectIds[index]);
          }
        });

        const filteredAssignments = assignmentsData.filter((assignment) =>
          subjectIdsWithUsComponent.has(Number(assignment.subjectId)),
        );

        setAssignments(filteredAssignments);
        setSelectedAssignment((previous) =>
          filteredAssignments.some((assignment) => String(assignment.id) === previous) ? previous : '',
        );
        setSelectedComponent('');
        setStudents([]);
        setGradeComponents([]);
        setGrades({});
      } catch (error) {
        console.error(error);
        setAssignments([]);
        setSelectedAssignment('');
        toast.error('Gagal memuat assignment Nilai US');
      } finally {
        setLoading(false);
      }
    },
    [US_COMPONENT_TYPES, normalizeAssignments],
  );

  useEffect(() => {
    if (!activeAcademicYearId) {
      setAssignments([]);
      setSelectedAssignment('');
      setSelectedComponent('');
      setStudents([]);
      setGradeComponents([]);
      setGrades({});
      return;
    }
    void fetchAssignmentsByAcademicYear(activeAcademicYearId);
  }, [activeAcademicYearId, fetchAssignmentsByAcademicYear]);

  const fetchStudentsAndComponents = useCallback(async () => {
    if (!selectedAssignment || !selectedSemester) return;
    
    try {
      setLoading(true);
      const assignment = assignments.find(a => a.id === Number(selectedAssignment));
      if (!assignment) return;

      // Fetch Students in Class
      const studentRes = await userService.getUsers({ 
        role: 'STUDENT', 
        class_id: assignment.classId,
        limit: 100 
      });
      const studentPayload = (studentRes as { data?: unknown })?.data ?? studentRes;
      setStudents(Array.isArray(studentPayload) ? (studentPayload as Student[]) : []);

      // Fetch Grade Components for Subject
      const compRes = await gradeService.getComponents({
        subject_id: assignment.subjectId,
        academic_year_id: Number(activeAcademicYearId),
        assignment_id: assignment.id,
        semester: selectedSemester,
      });
      const allSubjectComponents = (Array.isArray(compRes?.data) ? compRes.data : []).filter(
        (c: GradeComponent) => c.type === 'US_THEORY' || c.type === 'US_PRACTICE',
      );
      const usComponents = [...allSubjectComponents].sort((a, b) => {
        const aOrder = Number(a.displayOrder ?? 999);
        const bOrder = Number(b.displayOrder ?? 999);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      
      setGradeComponents(usComponents);
      if (usComponents.length > 0) {
        setSelectedComponent((previous) => {
          const hasPrevious = usComponents.some((item) => String(item.id) === previous);
          return hasPrevious ? previous : String(usComponents[0].id);
        });
      } else {
        setSelectedComponent('');
        toast.error('Mata pelajaran ini belum memiliki komponen Ujian Sekolah yang sesuai');
        setGrades({});
      }

    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat data siswa/komponen');
    } finally {
      setLoading(false);
    }
  }, [activeAcademicYearId, assignments, selectedAssignment, selectedSemester]);

  const fetchExistingGrades = useCallback(async () => {
    try {
      const assignment = assignments.find(a => String(a.id) === selectedAssignment);
      if (!assignment) return;

      const res = await gradeService.getGradesByClassSubject(
        assignment.class.id,
        assignment.subject.id,
        Number(activeAcademicYearId),
        selectedSemester,
      );
      
      const gradeMap: Record<number, string> = {};
      const gradesPayload = (res as { data?: unknown })?.data ?? res;
      const rows = Array.isArray(gradesPayload) ? (gradesPayload as StudentGradeApiRow[]) : [];
      const latestRowsByKey = new Map<string, StudentGradeApiRow>();

      rows.forEach((row) => {
        const studentId = Number(row.studentId ?? row.student_id ?? 0);
        const subjectId = Number(row.subjectId ?? row.subject_id ?? 0);
        const academicYearId = Number(row.academicYearId ?? row.academic_year_id ?? 0);
        const componentId = Number(row.componentId ?? row.component_id ?? 0);
        const semester = String(row.semester || '');
        if (!studentId || !subjectId || !academicYearId || !componentId || !semester) return;
        const key = `${studentId}:${subjectId}:${academicYearId}:${componentId}:${semester}`;
        const currentId = Number(row.id || 0);
        const previous = latestRowsByKey.get(key);
        const previousId = Number(previous?.id || 0);
        if (!previous || currentId >= previousId) {
          latestRowsByKey.set(key, row);
        }
      });

      const dedupedRows = latestRowsByKey.size > 0 ? Array.from(latestRowsByKey.values()) : rows;

      dedupedRows.forEach((row) => {
        const rowComponentId = Number(row.componentId ?? row.component_id ?? 0);
        const rowStudentId = Number(row.studentId ?? row.student_id ?? 0);
        if (rowComponentId !== Number(selectedComponent) || !rowStudentId) return;
        const score = Number(row.score);
        if (!Number.isFinite(score)) return;
        gradeMap[rowStudentId] = String(score);
      });
      
      setGrades(gradeMap);
    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat nilai siswa');
    }
  }, [activeAcademicYearId, assignments, selectedComponent, selectedAssignment, selectedSemester]);

  useEffect(() => {
    if (selectedAssignment && selectedSemester) {
      fetchStudentsAndComponents();
    }
  }, [selectedAssignment, selectedSemester, fetchStudentsAndComponents]);

  useEffect(() => {
    if (selectedAssignment && selectedComponent && activeAcademicYearId && selectedSemester) {
      fetchExistingGrades();
    }
  }, [selectedAssignment, selectedComponent, activeAcademicYearId, selectedSemester, fetchExistingGrades]);
  const handleScoreChange = (studentId: number, value: string) => {
    // Validate: 0-100
    const num = parseFloat(value);
    if (value !== '' && (isNaN(num) || num < 0 || num > 100)) {
      return;
    }
    setGrades(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const assignment = assignments.find(a => String(a.id) === selectedAssignment);
      if (!assignment) return;

      const selectedComponentId = Number(selectedComponent);
      if (!selectedComponentId || !selectedSemester) return;

      const gradesToSave = Object.entries(grades)
        .map(([studentId, score]) => {
          const parsedScore = Number(score);
          if (!Number.isFinite(parsedScore)) return null;
          return {
            student_id: Number(studentId),
            subject_id: assignment.subject.id,
            academic_year_id: Number(activeAcademicYearId),
            grade_component_id: selectedComponentId,
            semester: selectedSemester,
            score: parsedScore,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (gradesToSave.length === 0) {
        toast.error('Belum ada nilai valid untuk disimpan');
        return;
      }

      await gradeService.bulkInputGrades({ grades: gradesToSave });

      toast.success('Nilai berhasil disimpan');
      await fetchExistingGrades();
    } catch (error) {
      console.error(error);
      toast.error('Gagal menyimpan nilai');
    } finally {
      setSaving(false);
    }
  };

  const isReadOnly = () => {
    if (!selectedAssignment || !selectedComponent) return false;
    const assignment = assignments.find(a => a.id === Number(selectedAssignment));
    const component = gradeComponents.find(c => c.id === Number(selectedComponent));
    
    if (assignment && component) {
      const sName = (assignment.subject?.name || '').toLowerCase();
      // If Subject is Vocational and Component is Practice -> It's UKK (External)
      if ((sName.includes('teori kejuruan') || sName.includes('kejuruan')) && component.type === 'US_PRACTICE') {
        return true;
      }
    }
    return false;
  };

  const formSelectClassName =
    'w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100';
  const formInputClassName =
    'w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100';

  return (
      <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Input Nilai Ujian Sekolah</h1>
          <button
            onClick={handleSave}
            disabled={saving || loading || !selectedSemester || !selectedComponent || isReadOnly()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Nilai
          </button>
        </div>

        {!isLoadingActiveAcademicYear && !activeAcademicYearId ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar input nilai Ujian Sekolah tidak ambigu.
          </div>
        ) : null}
        
        {isReadOnly() && (
          <div className="flex items-center rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800">
            <span className="text-sm">
              Nilai Praktik untuk mata pelajaran ini diinput oleh Penguji Eksternal (UKK). Anda hanya dapat melihat nilai.
            </span>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="us-semester" className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
              <select
                id="us-semester"
                name="semester"
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value as SemesterValue)}
                className={formSelectClassName}
              >
                <option value="">Pilih Semester</option>
                <option value="ODD">Semester Ganjil</option>
                <option value="EVEN">Semester Genap</option>
              </select>
            </div>

            <div>
              <label htmlFor="us-assignment" className="block text-sm font-medium text-gray-700 mb-1">Kelas & Mata Pelajaran</label>
              <select
                id="us-assignment"
                name="assignment"
                value={selectedAssignment}
                onChange={(e) => setSelectedAssignment(e.target.value)}
                disabled={!selectedSemester || !activeAcademicYearId}
                className={formSelectClassName}
              >
                <option value="">Pilih Kelas & Mata Pelajaran</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.subject.name} - {a.class.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="us-component" className="block text-sm font-medium text-gray-700 mb-1">Komponen Penilaian</label>
              <select
                id="us-component"
                name="component"
                value={selectedComponent}
                onChange={(e) => setSelectedComponent(e.target.value)}
                disabled={!selectedAssignment || !selectedSemester || gradeComponents.length === 0}
                className={formSelectClassName}
              >
                {gradeComponents.length === 0 ? (
                  <option value="">Tidak ada komponen US</option>
                ) : (
                  gradeComponents.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type === 'US_THEORY' ? 'Teori' : 'Praktik'})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          {!loading && activeAcademicYearId && selectedSemester && assignments.length === 0 && (
            <p className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Anda belum memiliki assignment mapel dengan komponen Ujian Sekolah pada tahun ajaran ini.
            </p>
          )}
        </div>

        {selectedAssignment && selectedComponent && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-800">Daftar Siswa</h3>
              <div className="text-sm text-gray-500">
                Total: {students.length} Siswa
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-medium">
                  <tr>
                    <th className="px-6 py-3 text-left w-12">No</th>
                    <th className="px-6 py-3 text-left">NIS/NISN</th>
                    <th className="px-6 py-3 text-left">Nama Siswa</th>
                    <th className="px-6 py-3 text-center w-32">Nilai (0-100)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.length > 0 ? (
                    students.map((student, index) => (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="font-medium">{student.nis}</div>
                          <div className="text-xs">{student.nisn}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{student.name}</td>
                        <td className="px-6 py-4">
                          <label htmlFor={`grade-input-${student.id}`} className="sr-only">
                            Nilai {student.name}
                          </label>
                          <input
                            id={`grade-input-${student.id}`}
                            name={`grade-${student.id}`}
                            type="number"
                            min="0"
                            max="100"
                            value={grades[student.id] || ''}
                            onChange={(e) => handleScoreChange(student.id, e.target.value)}
                            disabled={isReadOnly()}
                            className={`${formInputClassName} text-center disabled:text-gray-500`}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        Tidak ada siswa di kelas ini
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
};

export default UjianSekolahPage;
