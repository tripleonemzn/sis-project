import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { tutorService } from '../../services/tutor.service';
import { academicYearService } from '../../services/academicYear.service';
import { Trophy, Save, Loader2, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

type Semester = 'ODD' | 'EVEN';
type ReportType = 'SBTS' | 'SAS' | 'SAT';

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

export const TutorMembersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlEkskulId = Number(searchParams.get('ekskulId'));

  const [semester, setSemester] = useState<Semester>('ODD');
  const [reportType, setReportType] = useState<ReportType>('SBTS');
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedEkskulId, setSelectedEkskulId] = useState<number>(urlEkskulId);

  const { data: academicYearData } = useQuery({
    queryKey: ['academic-years', 'active'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  // Handle potential API response structure variations
  const academicYears: AcademicYear[] = (academicYearData?.data?.academicYears || academicYearData?.academicYears || []) as AcademicYear[];
  
  const activeAcademicYear = useMemo(() => {
    return academicYears.find((ay) => ay.isActive) || academicYears[0];
  }, [academicYears]);

  // Initialize academic year
  useEffect(() => {
    if (activeAcademicYear && !selectedAcademicYearId) {
      setSelectedAcademicYearId(activeAcademicYear.id);
    }
  }, [activeAcademicYear, selectedAcademicYearId]);

  // Fetch assignments for the selected academic year to populate Ekskul dropdown
  const { data: assignmentsData } = useQuery({
    queryKey: ['tutor-assignments', selectedAcademicYearId],
    queryFn: () => tutorService.getAssignments(selectedAcademicYearId!),
    enabled: !!selectedAcademicYearId,
  });

  // Type assertion for API response
  const assignments: TutorAssignment[] = (assignmentsData?.data || []) as TutorAssignment[];

  // Validate/Update selectedEkskulId when assignments change
  useEffect(() => {
    if (assignments.length > 0) {
      const exists = assignments.find((a) => a.ekskulId === selectedEkskulId);
      if (!exists && !urlEkskulId) {
        // Default to first assignment if none selected or current one invalid
        setSelectedEkskulId(assignments[0].ekskulId);
      } else if (!exists && urlEkskulId) {
        // If URL has ID but it's not in this year's assignments, default to first if invalid
         if (assignments.length > 0) setSelectedEkskulId(assignments[0].ekskulId);
      }
    }
  }, [assignments, selectedEkskulId, urlEkskulId]);

  // Sync URL with selected ekskul
  useEffect(() => {
    if (selectedEkskulId) {
      setSearchParams(prev => {
        prev.set('ekskulId', String(selectedEkskulId));
        return prev;
      });
    }
  }, [selectedEkskulId, setSearchParams]);

  const { data: membersData, isLoading } = useQuery({
    queryKey: ['tutor-members', selectedEkskulId, selectedAcademicYearId],
    queryFn: () => tutorService.getMembers(selectedEkskulId, selectedAcademicYearId!),
    enabled: !!selectedEkskulId && !!selectedAcademicYearId,
  });

  const members: Enrollment[] = (membersData?.data || []) as Enrollment[];

  const queryClient = useQueryClient();
  const { mutateAsync: saveGrade } = useMutation({
    mutationFn: (payload: { 
      enrollmentId: number; 
      grade: string; 
      description: string;
      semester: Semester;
      reportType: ReportType;
    }) => tutorService.inputGrade(payload),
    onSuccess: () => {
      toast.success('Nilai tersimpan');
      queryClient.invalidateQueries({ queryKey: ['tutor-members', selectedEkskulId, selectedAcademicYearId] });
    },
    onError: () => {
      toast.error('Gagal menyimpan nilai');
    }
  });

  const [localValues, setLocalValues] = useState<Record<number, { grade: string; description: string }>>({});

  // Reset local values when context changes
  useEffect(() => {
    setLocalValues({});
  }, [semester, reportType, membersData]);

  const getDataForContext = (en: Enrollment) => {
    if (!en) return { grade: '', description: '' };
    
    if (semester === 'ODD') {
      if (reportType === 'SBTS') return { grade: en.gradeSbtsOdd, description: en.descSbtsOdd };
      if (reportType === 'SAS') return { grade: en.gradeSas, description: en.descSas };
    } else {
      if (reportType === 'SBTS') return { grade: en.gradeSbtsEven, description: en.descSbtsEven };
      if (reportType === 'SAT') return { grade: en.gradeSat, description: en.descSat };
    }
    // Fallback logic if needed
    return { grade: '', description: '' };
  };

  const handleChange = (id: number, key: 'grade' | 'description', value: string) => {
    const member = members.find((m) => m.id === id);
    if (!member) return;

    const currentData = getDataForContext(member);
    
    setLocalValues(prev => ({
      ...prev,
      [id]: {
        grade: key === 'grade' ? value : (prev[id]?.grade ?? currentData.grade ?? ''),
        description: key === 'description' ? value : (prev[id]?.description ?? currentData.description ?? '')
      }
    }));
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
      semester,
      reportType
    });
  };

  const handleSemesterChange = (s: Semester) => {
    setSemester(s);
    // Auto-switch report type if invalid for semester
    if (s === 'ODD' && reportType === 'SAT') setReportType('SAS');
    if (s === 'EVEN' && reportType === 'SAS') setReportType('SAT');
  };

  const currentEkskulName = assignments.find((a) => a.ekskulId === selectedEkskulId)?.ekskul?.name || 'Ekstrakurikuler';

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Anggota Ekstrakurikuler</h1>
          <p className="text-gray-600">Kelola nilai dan anggota</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
           {/* Academic Year Filter */}
           <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={selectedAcademicYearId || ''}
              onChange={(e) => setSelectedAcademicYearId(Number(e.target.value))}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer max-w-[150px]"
            >
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name} {ay.isActive ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Ekskul Filter */}
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={selectedEkskulId || ''}
              onChange={(e) => setSelectedEkskulId(Number(e.target.value))}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer max-w-[200px]"
            >
              {assignments.map((a) => (
                <option key={a.id} value={a.ekskulId}>
                  {a.ekskul.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={semester}
              onChange={(e) => handleSemesterChange(e.target.value as Semester)}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer"
            >
              <option value="ODD">Semester Ganjil</option>
              <option value="EVEN">Semester Genap</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer"
            >
              <option value="SBTS">Rapor SBTS</option>
              {semester === 'ODD' ? (
                <option value="SAS">Rapor SAS</option>
              ) : (
                <option value="SAT">Rapor SAT</option>
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
                {semester === 'ODD' ? 'Ganjil' : 'Genap'} - {reportType}
              </p>
            </div>
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
                          <option value="">Pilih Nilai</option>
                          <option value="A">A (Sangat Baik)</option>
                          <option value="B">B (Baik)</option>
                          <option value="C">C (Cukup)</option>
                          <option value="D">D (Kurang)</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={lv.description}
                          onChange={(e) => handleChange(en.id, 'description', e.target.value)}
                          className="w-full rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Deskripsi pencapaian..."
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
      </div>
    </div>
  );
};
