import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Loader2, 
  Search, 
  FileBarChart,
  AlertCircle
} from 'lucide-react';
import { academicYearService } from '../../services/academicYear.service';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import { gradeService } from '../../services/grade.service';
import { toast } from 'react-hot-toast';

interface ReportGrade {
  id: number;
  studentId: number;
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
}

export const TeacherSubjectReportPage = () => {
  // Filter States
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN' | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data States
  const [reportGrades, setReportGrades] = useState<ReportGrade[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch Initial Data (Academic Years & Assignments)
  const { data: academicYearsData } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicYearService.list({ limit: 100 }),
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ['teacher-assignments'],
    queryFn: () => teacherAssignmentService.list({ limit: 1000 }),
  });

  // Robust data extraction
  const academicYears = (academicYearsData as any)?.data?.academicYears || (academicYearsData as any)?.academicYears || [];
  
  const assignmentsRaw = (assignmentsData as any)?.data?.assignments || (assignmentsData as any)?.assignments || [];
  const assignments = Array.isArray(assignmentsRaw) 
        ? assignmentsRaw.sort((a: any, b: any) => {
            const subjectCompare = a.subject.name.localeCompare(b.subject.name);
            if (subjectCompare !== 0) return subjectCompare;
            return a.class.name.localeCompare(b.class.name);
          }) 
        : [];

  // Set default filters
  useEffect(() => {
    if (Array.isArray(academicYears) && academicYears.length > 0 && !selectedAcademicYear) {
      // Try both naming conventions or inspect one
      const active = academicYears.find((ay: any) => ay.isActive || ay.is_active);
      if (active) setSelectedAcademicYear(active.id.toString());
    }
  }, [academicYears]);

  // Fetch Report Grades when filters change
  useEffect(() => {
    if (selectedAcademicYear && selectedAssignment && selectedSemester) {
      fetchReportGrades();
    } else {
      setReportGrades([]);
    }
  }, [selectedAcademicYear, selectedAssignment, selectedSemester]);

  const fetchReportGrades = async () => {
    try {
      setLoading(true);
      const assignment = assignments.find((a: any) => a.id.toString() === selectedAssignment);
      
      if (!assignment) return;

      const response = await gradeService.getReportGrades({
        class_id: assignment.class.id,
        subject_id: assignment.subject.id,
        academic_year_id: parseInt(selectedAcademicYear),
        semester: selectedSemester
      });

      // Response could be wrapped in ApiResponseHelper structure
      const responseData = Array.isArray(response) ? response : (response as any).data;
      const data = Array.isArray(responseData) ? responseData : [];
      setReportGrades(data);
    } catch (error) {
      console.error('Error fetching report grades:', error);
      toast.error('Gagal memuat data nilai rapor');
    } finally {
      setLoading(false);
    }
  };

  // Filtered Display Data
  const filteredGrades = reportGrades.filter(grade => 
    grade.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    grade.student.nis?.includes(searchQuery) ||
    grade.student.nisn?.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Rapor Mata Pelajaran
          </h1>
          <p className="text-gray-600">
            Rekapitulasi nilai akhir siswa per mata pelajaran (Formatif, SBTS, SAS, Nilai Akhir)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="academicYearSelect" className="block text-sm font-medium text-gray-700 mb-2">
              Tahun Ajaran
            </label>
            <div className="relative">
              <select
                id="academicYearSelect"
                name="academicYear"
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Pilih Tahun Ajaran</option>
                {Array.isArray(academicYears) && academicYears.map((ay: any) => (
                  <option key={ay.id} value={String(ay.id)}>
                    {ay.name} {ay.isActive || ay.is_active ? '(Aktif)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="semesterSelect" className="block text-sm font-medium text-gray-700 mb-2">
              Semester
            </label>
            <div className="relative">
              <select
                id="semesterSelect"
                name="semester"
                value={selectedSemester}
                onChange={(e) => {
                  setSelectedSemester(e.target.value as any);
                  setSelectedAssignment('');
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Pilih Semester</option>
                <option value="ODD">Ganjil</option>
                <option value="EVEN">Genap</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="assignmentSelect" className="block text-sm font-medium text-gray-700 mb-2">
              Kelas & Mata Pelajaran
            </label>
            <div className="relative">
              <select
                id="assignmentSelect"
                name="assignment"
                value={selectedAssignment}
                onChange={(e) => setSelectedAssignment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={!selectedSemester}
              >
                <option value="">Pilih Kelas & Mapel</option>
                {Array.isArray(assignments) && assignments.map((assignment: any) => (
                  <option key={assignment.id} value={String(assignment.id)}>
                    {assignment.class.name} - {assignment.subject.name}
                  </option>
                ))}
              </select>
              {!selectedSemester && (
                <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Silahkan Pilih Semester</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {selectedAssignment && selectedSemester ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari siswa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
            
            {/* Legend / Info */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
               <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200"></span> NF: Nilai Formatif</span>
               <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-200"></span> NS: Nilai SBTS</span>
               <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-200"></span> NA: Nilai Akhir</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="px-6 py-4 w-12 text-center">No</th>
                  <th className="px-6 py-4 w-32">NISN</th>
                  <th className="px-6 py-4 whitespace-nowrap w-auto">Nama Siswa</th>
                  <th className="px-6 py-4 text-center w-24">Rata-rata Formatif</th>
                  <th className="px-6 py-4 text-center w-24">Nilai SBTS</th>
                  <th className="px-6 py-4 text-center w-24">Nilai SAS</th>
                  <th className="px-6 py-4 text-center w-24 bg-blue-50/50">Nilai Akhir</th>
                  <th className="px-6 py-4 text-center w-24">Predikat</th>
                  <th className="px-6 py-4 w-full">Capaian Kompetensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" />
                        <p>Memuat data nilai...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredGrades.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium text-gray-900">Data Tidak Ditemukan</p>
                        <p className="text-sm">Belum ada data nilai rapor untuk kriteria yang dipilih.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredGrades.map((grade, index) => (
                    <tr key={grade.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-center text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        {grade.student.nisn || '-'}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                        {grade.student.name}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600">
                        {grade.formatifScore !== null ? Math.round(grade.formatifScore) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600">
                        {grade.sbtsScore !== null ? Math.round(grade.sbtsScore) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600">
                        {grade.sasScore !== null ? Math.round(grade.sasScore) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-blue-600 bg-blue-50/30">
                        {grade.finalScore !== null ? Math.round(grade.finalScore) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {grade.predicate ? (
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                            grade.predicate === 'A' ? 'bg-green-100 text-green-700' :
                            grade.predicate === 'B' ? 'bg-blue-100 text-blue-700' :
                            grade.predicate === 'C' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {grade.predicate}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div title={grade.description || ''}>
                          {grade.description || '-'}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileBarChart className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Pilih Filter Terlebih Dahulu</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Silakan pilih Tahun Ajaran, Semester, serta Kelas & Mata Pelajaran untuk menampilkan data rapor.
          </p>
        </div>
      )}
    </div>
  );
};
