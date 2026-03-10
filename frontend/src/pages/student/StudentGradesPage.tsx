import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import { 
  BookOpen, 
  FileText,
  TrendingUp,
  Filter
} from 'lucide-react';
import clsx from 'clsx';

interface GradeComponent {
  id: number;
  name: string;
  type: string;
  weight: number;
}

interface Subject {
  id: number;
  code: string;
  name: string;
}

interface StudentGrade {
  id: number;
  score: number;
  semester: string;
  academicYearId: number;
  subject: Subject;
  component: GradeComponent;
  nf1?: number;
  nf2?: number;
  nf3?: number;
  nf4?: number;
  nf5?: number;
  nf6?: number;
  kkm?: number;
}

type StudentGradesOutletContext = {
  user?: {
    id?: number | string;
  } | null;
};

export default function StudentGradesPage() {
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [semester, setSemester] = useState<string>('');
  
  const { user: contextUser } = useOutletContext<StudentGradesOutletContext>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const fetchGrades = useCallback(async () => {
    try {
      if (!user?.id) return;
      
      setLoading(true);
      
      const params: { student_id: number | string; semester?: string } = {
        student_id: user.id
      };

      if (semester && semester !== 'ALL') {
        params.semester = semester;
      }
      
      // Fetch grades for current student
      const response = await api.get('/grades/student-grades', {
        params
      });

      if (response.data.success) {
        setGrades(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching grades:', error);
      toast.error('Gagal memuat data nilai');
    } finally {
      setLoading(false);
    }
  }, [semester, user]);

  useEffect(() => {
    if (semester && user) {
      fetchGrades();
    } else {
      setGrades([]);
      if (!semester) setLoading(false);
    }
  }, [semester, user, fetchGrades]);

  // Group grades by Subject
  const gradesBySubject = grades.reduce((acc, grade) => {
    const subjectId = grade.subject.id;
    if (!acc[subjectId]) {
      acc[subjectId] = {
        subject: grade.subject,
        grades: []
      };
    }
    acc[subjectId].grades.push(grade);
    return acc;
  }, {} as Record<number, { subject: Subject; grades: StudentGrade[] }>);

  // Helper to render grades table
  const renderGradesTable = (semesterGrades: StudentGrade[], title: string) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
          <tr>
            <th className="px-4 py-3">{title}</th>
            <th className="px-4 py-3">Tipe</th>
            <th className="px-4 py-3 text-center">KKM</th>
            <th className="px-4 py-3 text-center">Bobot</th>
            <th className="px-4 py-3 text-center">Nilai</th>
            <th className="px-4 py-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {semesterGrades.map((grade) => {
            const kkm = grade.kkm || 75;
            const isTuntas = grade.score >= kkm;
            const isFormatif = grade.component.type === 'FORMATIVE' || grade.component.type === 'FORMATIF';
            const hasNfDetails = isFormatif && (grade.nf1 || grade.nf2 || grade.nf3 || grade.nf4 || grade.nf5 || grade.nf6);
            
            // Use configured component naming instead of fixed SBTS/SAS/SAT aliases.
            const displayType = String(grade.component.name || grade.component.type || '-').toUpperCase();

            return (
              <tr key={grade.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <div>{grade.component.name}</div>
                  {hasNfDetails && (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                      {[grade.nf1, grade.nf2, grade.nf3, grade.nf4, grade.nf5, grade.nf6].map((nf, idx) => (
                        nf !== null && nf !== undefined && (
                          <span key={idx} className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                            NF{idx + 1}: {nf}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <span className={clsx(
                    "px-2 py-1 rounded text-xs font-medium",
                    isFormatif && "bg-blue-100 text-blue-700",
                    grade.component.type === 'MIDTERM' && "bg-orange-100 text-orange-700",
                    grade.component.type === 'FINAL' && "bg-purple-100 text-purple-700",
                    !isFormatif && grade.component.type !== 'MIDTERM' && grade.component.type !== 'FINAL' && "bg-gray-100 text-gray-700"
                  )}>
                    {displayType}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-500">
                  {kkm}
                </td>
                <td className="px-4 py-3 text-center text-gray-500">
                  {grade.component.weight}%
                </td>
                <td className="px-4 py-3 text-center font-bold text-gray-900">
                  {grade.score}
                  {isFormatif && <div className="text-[10px] font-normal text-gray-500">Rata-rata</div>}
                </td>
                <td className="px-4 py-3 text-center">
                  {isTuntas ? (
                    <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                      <TrendingUp className="w-3 h-3" />
                      Tuntas
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                      <FileText className="w-3 h-3" />
                      Belum Tuntas
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Nilai Saya
          </h1>
          <p className="text-gray-500 mt-1">Riwayat pencapaian akademik Anda</p>
        </div>

        <div className="flex items-center bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-sm font-medium text-gray-500 px-3 border-r border-gray-300">Semester</span>
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="pl-9 pr-8 py-2 bg-transparent text-sm font-medium text-gray-700 outline-none focus:outline-none focus:ring-0 border-none cursor-pointer hover:text-blue-600 appearance-none min-w-[180px]"
            >
              <option value="">Pilih Semester</option>
              <option value="ALL">Semua Semester</option>
              <option value="ODD">Semester Ganjil</option>
              <option value="EVEN">Semester Genap</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : Object.keys(gradesBySubject).length > 0 ? (
        <div className="grid gap-6">
          {Object.values(gradesBySubject).map(({ subject, grades }) => {
            const oddGrades = grades.filter(g => g.semester === 'ODD');
            const evenGrades = grades.filter(g => g.semester === 'EVEN');
            
            return (
              <div key={subject.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg border border-gray-200">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{subject.name}</h3>
                      <p className="text-xs text-gray-500">{subject.code}</p>
                    </div>
                  </div>
                </div>
                
                {oddGrades.length > 0 && renderGradesTable(oddGrades, "Komponen Nilai Semester Ganjil")}
                
                {oddGrades.length > 0 && evenGrades.length > 0 && (
                  <div className="border-t border-gray-200"></div>
                )}
                
                {evenGrades.length > 0 && renderGradesTable(evenGrades, "Komponen Nilai Semester Genap")}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Belum ada data nilai</h3>
          <p className="text-gray-500">Data nilai untuk semester ini belum tersedia</p>
        </div>
      )}
    </div>
  );
}
