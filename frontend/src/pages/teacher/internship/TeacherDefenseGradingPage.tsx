import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { internshipService } from '../../../services/internship.service';
import { 
  Search, 
  Save,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface AssessmentComponent {
  id: number;
  name: string;
  weight: number;
  description?: string;
}

interface InternshipGrade {
  componentId: number;
  score: number;
}

interface InternshipStudentClass {
  name: string;
}

interface InternshipStudent {
  name: string;
  nis?: string | null;
  studentClass?: InternshipStudentClass | null;
}

interface InternshipForGrading {
  id: number;
  student?: InternshipStudent | null;
  companyName?: string | null;
  companyAddress?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  grades?: InternshipGrade[] | null;
  defenseNotes?: string | null;
}

export const TeacherDefenseGradingPage = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  
  // State to store grades for all students: { [internshipId]: { [componentId]: score } }
  const [studentGrades, setStudentGrades] = useState<Record<number, Record<number, number>>>({});
  const [studentNotes, setStudentNotes] = useState<Record<number, string>>({});

  // Fetch Assigned Internships
  const { data: internshipsResponse, isLoading: isLoadingInternships } = useQuery({
    queryKey: ['examiner-internships'],
    queryFn: internshipService.getExaminerInternships,
    staleTime: 0 // Always fetch fresh to get latest grades
  });

  // Fetch Active Assessment Components
  const { data: componentsResponse, isLoading: isLoadingComponents } = useQuery({
    queryKey: ['assessment-components', 'active'],
    queryFn: () => internshipService.getAssessmentComponents(true)
  });

  const rawInternships = internshipsResponse?.data?.data;
  const internships = useMemo<InternshipForGrading[]>(
    () => (Array.isArray(rawInternships) ? (rawInternships as InternshipForGrading[]) : []),
    [rawInternships],
  );
  
  const rawComponents = componentsResponse?.data?.data;
  const components: AssessmentComponent[] = Array.isArray(rawComponents) ? rawComponents : [];

  // Initialize local state from fetched data
  useEffect(() => {
    if (internships.length > 0) {
      const initialGrades: Record<number, Record<number, number>> = {};
      const initialNotes: Record<number, string> = {};

      internships.forEach((internship) => {
        // Map existing grades if available
        if (internship.grades && Array.isArray(internship.grades)) {
          initialGrades[internship.id] = {};
          internship.grades.forEach((g) => {
            initialGrades[internship.id][g.componentId] = g.score;
          });
        }
        if (internship.defenseNotes) {
          initialNotes[internship.id] = internship.defenseNotes;
        }
      });
      setStudentGrades(prev => ({ ...prev, ...initialGrades }));
      setStudentNotes(prev => ({ ...prev, ...initialNotes }));
    }
  }, [internships]);

  const [isSaving, setIsSaving] = useState(false);

  // Filter logic
  const filteredInternships = internships.filter((item) => 
    (item.student?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.student?.studentClass?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.companyName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleGradeChange = (internshipId: number, componentId: number, value: string) => {
    const numValue = value === '' ? 0 : Math.min(100, Math.max(0, Number(value)));
    setStudentGrades(prev => ({
      ...prev,
      [internshipId]: {
        ...(prev[internshipId] || {}),
        [componentId]: numValue
      }
    }));
  };

  const calculateAverage = (internshipId: number) => {
    const grades = studentGrades[internshipId] || {};
    if (Object.keys(grades).length === 0) return 0;
    
    let total = 0;
    let count = 0;
    
    components.forEach(comp => {
      if (grades[comp.id] !== undefined) {
        total += grades[comp.id];
        count++;
      }
    });

    return count > 0 ? (total / count).toFixed(2) : '0.00';
  };

  const handleBulkSave = async () => {
    setIsSaving(true);
    const toastId = toast.loading('Menyimpan semua penilaian...');
    
    try {
      // Create promises for all internships that have grades
      const promises = internships.map((internship) => {
        const grades = studentGrades[internship.id];
        // Skip if no grades recorded yet (optional, but safer to save what's visible)
        if (!grades) return Promise.resolve();

        const payload = {
          grades: Object.entries(grades).map(([compId, score]) => ({
            componentId: Number(compId),
            score: Number(score)
          })),
          notes: studentNotes[internship.id] || ''
        };
        
        return internshipService.gradeDefense(internship.id, payload);
      });

      await Promise.all(promises);
      
      queryClient.invalidateQueries({ queryKey: ['examiner-internships'] });
      toast.success('Semua penilaian berhasil disimpan', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Gagal menyimpan beberapa data', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingInternships || isLoadingComponents) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-gray-500">Memuat data penilaian...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Lembar Penilaian Sidang PKL</h1>
          <p className="text-gray-600">Input nilai sidang siswa secara langsung</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
        <div className="relative max-w-md w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Cari Nama / Kelas / Perusahaan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-12">No</th>
              <th rowSpan={2} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 min-w-[200px]">Siswa</th>
              <th rowSpan={2} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 min-w-[150px]">Tempat PKL</th>
              <th rowSpan={2} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 min-w-[200px]">Alamat</th>
              <th colSpan={2} className="px-4 py-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">Tanggal</th>
              <th colSpan={components.length} className="px-4 py-2 text-center text-xs font-bold text-gray-900 uppercase tracking-wider border-b border-gray-200 bg-blue-50">
                Komponen Penilaian
              </th>
              <th rowSpan={2} className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-l border-gray-200 w-20">Rata-Rata</th>
            </tr>
            <tr>
              {/* Sub-headers for Dates */}
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 min-w-[100px]">Mulai</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 min-w-[100px]">Selesai</th>
              
              {/* Sub-headers for Components */}
              {components.map((comp: AssessmentComponent) => (
                <th key={comp.id} className="px-2 py-2 text-center text-xs font-medium text-gray-700 uppercase border-r border-gray-200 bg-blue-50 min-w-[100px]" title={comp.description}>
                  {comp.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInternships.length === 0 ? (
              <tr>
                <td colSpan={7 + components.length} className="px-6 py-8 text-center text-gray-500">
                  Tidak ada data siswa ditemukan
                </td>
              </tr>
            ) : (
              filteredInternships.map((internship, index: number) => (
                <tr key={internship.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-center text-sm text-gray-500 border-r border-gray-200">
                    {index + 1}
                  </td>
                  <td className="px-4 py-4 border-r border-gray-200">
                    <div className="font-medium text-gray-900">{internship.student?.name}</div>
                    <div className="text-xs text-gray-500">{internship.student?.nis}</div>
                    <div className="text-xs text-blue-600 mt-1">{internship.student?.studentClass?.name}</div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 border-r border-gray-200">
                    {internship.companyName}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500 border-r border-gray-200 max-w-[200px] truncate" title={internship.companyAddress ?? undefined}>
                    {internship.companyAddress || '-'}
                  </td>
                  <td className="px-4 py-4 text-xs text-center text-gray-500 border-r border-gray-200">
                    {internship.startDate ? format(new Date(internship.startDate), 'dd/MM/yyyy', { locale: idLocale }) : '-'}
                  </td>
                  <td className="px-4 py-4 text-xs text-center text-gray-500 border-r border-gray-200">
                    {internship.endDate ? format(new Date(internship.endDate), 'dd/MM/yyyy', { locale: idLocale }) : '-'}
                  </td>

                  {/* Component Inputs */}
                  {components.map((comp: AssessmentComponent) => (
                    <td key={comp.id} className="px-2 py-2 text-center border-r border-gray-200 bg-blue-50/30">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className="w-full text-center border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm py-1"
                        placeholder="0"
                        value={studentGrades[internship.id]?.[comp.id] ?? ''}
                        onChange={(e) => handleGradeChange(internship.id, comp.id, e.target.value)}
                      />
                    </td>
                  ))}

                  <td className="px-4 py-4 text-center font-bold text-gray-900 border-l border-gray-200">
                    {calculateAverage(internship.id)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Floating Save Button */}
      <div className="fixed bottom-6 right-6 z-10">
        <button
          onClick={handleBulkSave}
          disabled={isSaving || filteredInternships.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-1"
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span className="font-bold">Simpan Penilaian</span>
        </button>
      </div>
    </div>
  );
};
