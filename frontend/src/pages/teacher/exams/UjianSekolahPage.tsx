import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../../../services/grade.service';
import type { GradeComponent } from '../../../services/grade.service';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';
import { userService } from '../../../services/user.service';

interface Student {
  id: number;
  name: string;
  nisn: string;
  nis: string;
}

export const UjianSekolahPage = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Data
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [gradeComponents, setGradeComponents] = useState<GradeComponent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  
  // Selections
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  
  // Grades State: { studentId: score }
  const [grades, setGrades] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedAssignment) {
      fetchStudentsAndComponents();
    }
  }, [selectedAssignment]);

  useEffect(() => {
    if (selectedAssignment && selectedComponent && selectedAcademicYear) {
      fetchExistingGrades();
    }
  }, [selectedAssignment, selectedComponent, selectedAcademicYear]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [ayRes, assignRes] = await Promise.all([
        academicYearService.list(),
        teacherAssignmentService.list({ limit: 1000 })
      ]);

      const academicYearsDataRaw = (ayRes as any).data || (Array.isArray(ayRes) ? ayRes : []);
      const academicYearsData = Array.isArray(academicYearsDataRaw) ? academicYearsDataRaw : [];
      setAcademicYears(academicYearsData);
      
      // Filter assignments for Grade XII only
      const assignmentsResData = (assignRes as any).data || assignRes;
      const assignmentsListRaw = assignmentsResData?.assignments || assignmentsResData || [];
      const assignmentsData = Array.isArray(assignmentsListRaw) ? assignmentsListRaw : [];

      const xiiAssignments = assignmentsData.filter((a: any) => 
        a.class && a.class.name && a.class.name.includes('XII')
      );

      // Filter for specific US subjects (Rule 1)
      const usSubjects = [
        'bahasa indonesia',
        'bahasa inggris',
        'agama',
        'teori kejuruan',
        'kompetensi keahlian',
        'pancasila',
        'matematika',
        'bahasa sunda'
      ];

      const filteredAssignments = xiiAssignments.filter((a: any) => {
        const sName = (a.subject?.name || '').toLowerCase();
        return usSubjects.some(us => sName.includes(us));
      });
      
      // Sort assignments: Subject Name ASC, Class Name ASC
      filteredAssignments.sort((a: any, b: any) => {
        const subjectCompare = (a.subject?.name || '').localeCompare(b.subject?.name || '');
        if (subjectCompare !== 0) return subjectCompare;
        return (a.class?.name || '').localeCompare(b.class?.name || '');
      });

      setAssignments(filteredAssignments);

      // Set active academic year
      const activeAy = academicYearsData.find((ay: any) => ay.isActive);
      if (activeAy) setSelectedAcademicYear(String(activeAy.id));

    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat data awal');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableComponents = (assignment: TeacherAssignment, allComponents: GradeComponent[]) => {
    const sName = (assignment.subject?.name || '').toLowerCase();
    
    // Default US components
    let allowedTypes: string[] = [];
    
    // Group 1: 50/50 (Theory + Practice) - Teacher inputs BOTH
    if (
      sName.includes('bahasa indonesia') ||
      sName.includes('bahasa inggris') ||
      sName.includes('agama')
    ) {
      allowedTypes = ['US_THEORY', 'US_PRACTICE'];
    }
    // Group 2: Vocational (Theory by Teacher, Practice by External/UKK)
    else if (
      sName.includes('teori kejuruan') || 
      sName.includes('kejuruan') || 
      sName.includes('kompetensi keahlian')
    ) {
      // Only Theory is input by Teacher here. Practice is via UKK module.
      allowedTypes = ['US_THEORY'];
    }
    // Group 3: 100% Theory
    else if (
      sName.includes('pancasila') ||
      sName.includes('matematika') ||
      sName.includes('bahasa sunda')
    ) {
      allowedTypes = ['US_THEORY'];
    }
    else {
      // Fallback for future flexibility: Allow Theory
      allowedTypes = ['US_THEORY']; 
    }
    
    return allComponents.filter(c => allowedTypes.includes(c.type));
  };

  const fetchStudentsAndComponents = async () => {
    if (!selectedAssignment) return;
    
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
      setStudents((studentRes as any).data || []);

      // Fetch Grade Components for Subject
      const compRes = await gradeService.getComponents({ 
        subject_id: assignment.subjectId,
        academic_year_id: Number(selectedAcademicYear)
      });
      
      const allSubjectComponents = (compRes.data || []).filter((c: GradeComponent) => 
        c.type === 'US_THEORY' || c.type === 'US_PRACTICE'
      );
      
      // Use getAvailableComponents to filter
      const usComponents = getAvailableComponents(assignment, allSubjectComponents);
      
      setGradeComponents(usComponents);
      if (usComponents.length > 0) {
        setSelectedComponent(String(usComponents[0].id));
      } else {
        setSelectedComponent('');
        toast.error('Mata pelajaran ini belum memiliki komponen Ujian Sekolah yang sesuai');
      }

    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat data siswa/komponen');
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingGrades = async () => {
    try {
      const assignment = assignments.find(a => String(a.id) === selectedAssignment);
      if (!assignment) return;

      const res = await gradeService.getGrades({
        academicYearId: Number(selectedAcademicYear),
        subjectId: assignment.subject.id,
        classId: assignment.class.id,
        type: selectedComponent // Pass the type (e.g., US_THEORY, US_PRACTICE)
      });
      
      const gradeMap: Record<number, string> = {};
      const gradesData = (res as any).data || (Array.isArray(res) ? res : []);
      
      gradesData.forEach((g: any) => {
        // Filter by type if backend returns all types
        if (g.type === selectedComponent) {
          gradeMap[g.studentId] = String(g.score);
        }
      });
      
      setGrades(gradeMap);
    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat nilai siswa');
    }
  };

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

      const gradesToSave = Object.entries(grades).map(([studentId, score]) => ({
        studentId: Number(studentId),
        type: selectedComponent,
        score: parseFloat(score),
      }));

      await gradeService.saveGradesBulk({
        academicYearId: Number(selectedAcademicYear),
        subjectId: assignment.subject.id,
        classId: assignment.class.id,
        grades: gradesToSave
      });

      toast.success('Nilai berhasil disimpan');
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

  return (
    
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Input Nilai Ujian Sekolah</h1>
          <button
            onClick={handleSave}
            disabled={saving || loading || !selectedComponent || isReadOnly()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Nilai
          </button>
        </div>
        
        {isReadOnly() && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex items-center">
            <span className="text-sm">
              Nilai Praktik untuk mata pelajaran ini diinput oleh Penguji Eksternal (UKK). Anda hanya dapat melihat nilai.
            </span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="us-academic-year" className="block text-sm font-medium text-gray-700 mb-1">Tahun Ajaran</label>
              <select
                id="us-academic-year"
                name="academicYear"
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {academicYears.map(ay => (
                  <option key={ay.id} value={ay.id}>{ay.name} ({ay.isActive ? 'Aktif' : 'Tidak Aktif'})</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="us-assignment" className="block text-sm font-medium text-gray-700 mb-1">Kelas & Mata Pelajaran</label>
              <select
                id="us-assignment"
                name="assignment"
                value={selectedAssignment}
                onChange={(e) => setSelectedAssignment(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
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
                disabled={!selectedAssignment || gradeComponents.length === 0}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
        </div>

        {selectedAssignment && selectedComponent && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
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
                            className="w-full text-center border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
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
