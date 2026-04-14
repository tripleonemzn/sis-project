import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link, useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ukkSchemeService } from '../../services/ukkScheme.service';
import { ukkAssessmentService } from '../../services/ukkAssessment.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { academicYearService } from '../../services/academicYear.service';
import { toast } from 'react-hot-toast';
import { Loader2, ArrowLeft, Save, Search, FileText, ChevronRight, Info, BookOpen, FileSpreadsheet } from 'lucide-react';
import type { User } from '../../types/auth';

type AcademicYearLite = {
  id: number;
  name: string;
  isActive?: boolean;
};

type StudentMajorLite = {
  id: number;
  name: string;
};

type StudentClassLite = {
  id: number;
  name: string;
  level?: string;
  majorId?: number;
  major?: StudentMajorLite | null;
};

type StudentLite = {
  id: number;
  name: string;
  nis?: string;
  studentClass?: StudentClassLite | null;
};

type SchemeCriterion = {
  id?: string;
  name: string;
  group?: string;
  maxScore: number;
  aliases?: string[];
};

type SchemeLite = {
  id: number;
  name: string;
  majorId?: number;
  major?: StudentMajorLite | null;
  subjectId: number;
  academicYearId: number;
  criteria: SchemeCriterion[];
};

type ExistingAssessment = {
  studentId: number;
  subjectId: number;
  scores?: Record<string, number> | null;
};

type UKKAssessmentPayload = {
  studentId: number;
  subjectId: number;
  academicYearId: number;
  criteria: SchemeCriterion[];
  scores: Record<string, number>;
  finalScore: number;
};

export const UKKAssessmentPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const schemeId = searchParams.get('schemeId');
  const normalizedSchemeId = Number(schemeId);
  const hasValidSchemeId = Number.isInteger(normalizedSchemeId) && normalizedSchemeId > 0;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  
  // State for all students' scores: { studentId: { criterionName: score } }
  const [allScores, setAllScores] = useState<Record<number, Record<string, number>>>({});
  // Track changed students to optimize save
  const [changedStudentIds, setChangedStudentIds] = useState<Set<number>>(new Set());

  // Fetch Active Academic Year
  const { data: academicYearData, isLoading: isLoadingYear } = useQuery({
    queryKey: ['academic-years', 'active'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    enabled: !hasValidSchemeId,
  });

  const activeAcademicYear = useMemo(() => {
    const years = (academicYearData?.data?.academicYears || academicYearData?.academicYears || []) as AcademicYearLite[];
    return years.find((ay) => ay.isActive) || years[0];
  }, [academicYearData]);

  // Fetch Schemes if no schemeId selected
  const { data: schemesData, isLoading: isLoadingSchemes } = useQuery({
    queryKey: ['ukk-schemes', activeAcademicYear?.id],
    queryFn: () => ukkSchemeService.getSchemes(activeAcademicYear?.id),
    enabled: !hasValidSchemeId && !!activeAcademicYear?.id,
  });

  const schemes = (schemesData?.data || schemesData || []) as SchemeLite[];

  // 1. Fetch Scheme Details (if schemeId selected)
  const { data: schemeData, isLoading: isLoadingScheme } = useQuery({
    queryKey: ['ukk-scheme', normalizedSchemeId],
    queryFn: () => ukkSchemeService.getSchemeDetail(normalizedSchemeId),
    enabled: hasValidSchemeId,
  });

  const scheme = (schemeData?.data || schemeData || null) as SchemeLite | null;

  // 2. Fetch Students
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['students-all'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 1000 }),
    enabled: hasValidSchemeId,
  });

  // Get Current User via Query (Database Persistence)
  const { user: contextUser } = useOutletContext<{ user: User }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || (authData?.data as User | null) || null;

  // Filter students
  const { filteredStudents, availableClasses } = useMemo(() => {
    if (!studentsData?.data) return { filteredStudents: [] as StudentLite[], availableClasses: [] as StudentClassLite[] };
    const students = studentsData.data as StudentLite[];
    
    // 1. Base Filter (Major & Level)
    const baseStudents = students.filter((student) => {
      const sClass = student.studentClass;
      if (!sClass) return false;
      
      const targetMajorId = user?.examinerMajorId || scheme?.majorId;
      if (!targetMajorId) return false;

      // Safe comparison handling number vs string types
      const matchesMajor = 
        (sClass.majorId && Number(sClass.majorId) === Number(targetMajorId)) || 
        (sClass.major?.id && Number(sClass.major.id) === Number(targetMajorId));
      
      // Check Level (XII) - Support checking level field OR parsing from name (e.g. "XII TKJ 1" or "12 TKJ 1")
      const levelStr = String(sClass.level || '').toUpperCase();
      const nameStr = String(sClass.name || '').toUpperCase();
      const isGrade12 = levelStr === 'XII' || levelStr === '12' || nameStr.startsWith('XII') || nameStr.startsWith('12');

      return matchesMajor && isGrade12;
    });

    // 2. Extract Available Classes from Base Students
    const classesMap = new Map<number, StudentClassLite>();
    baseStudents.forEach((s) => {
      if (s.studentClass) {
        classesMap.set(s.studentClass.id, s.studentClass);
      }
    });
    const classes = Array.from(classesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // 3. Apply Search & Class Filter
    const finalStudents = baseStudents.filter((student) => {
      const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            student.nis?.includes(searchTerm);
      
      const matchesClass = selectedClassId === 'ALL' || String(student.studentClass?.id) === String(selectedClassId);

      return matchesSearch && matchesClass;
    });

    // 4. Sort Alphabetically (Class first, then Name)
    finalStudents.sort((a, b) => {
      const classA = a.studentClass?.name || '';
      const classB = b.studentClass?.name || '';
      
      // If classes are different, sort by class name
      if (classA !== classB) {
        return classA.localeCompare(classB);
      }
      
      // If classes are same, sort by student name
      return a.name.localeCompare(b.name);
    });

    return { filteredStudents: finalStudents, availableClasses: classes };
  }, [studentsData, scheme, searchTerm, user, selectedClassId]);

  // Group Criteria for Header
  const groupedCriteria = useMemo(() => {
    if (!scheme?.criteria) return {};
    const groups: Record<string, SchemeCriterion[]> = {};
    scheme.criteria.forEach((c) => {
      const gName = c.group || 'Umum';
      if (!groups[gName]) groups[gName] = [];
      groups[gName].push(c);
    });
    return groups;
  }, [scheme]);

  // 3. Fetch Existing Assessments
  const { data: existingAssessmentsData } = useQuery({
    queryKey: ['ukk-assessments-existing', normalizedSchemeId],
    queryFn: () => ukkAssessmentService.getExaminerAssessments(scheme?.academicYearId),
    enabled: Boolean(scheme),
  });
  
  const existingAssessments = useMemo(() => {
      return (existingAssessmentsData?.data || existingAssessmentsData || []) as ExistingAssessment[];
  }, [existingAssessmentsData]);

  // Helper to generate unique key for criteria score
  const getCriteriaKey = (criterion: SchemeCriterion) => {
    if (criterion.id) return criterion.id;
    const group = criterion.group || 'Umum';
    return `${group}::${criterion.name}`;
  };

  // Initialize scores from existing assessments
  useEffect(() => {
    if (existingAssessments.length > 0 && scheme && scheme.criteria) {
      const newScores: Record<number, Record<string, number>> = {};
      
      // Build a map of "Group::Name" -> Criterion ID (if available) for migration
      const nameToIdMap = new Map<string, string>();
      const aliasToIdMap = new Map<string, string>();
      scheme.criteria.forEach((c) => {
        const criterionId = c.id;
        if (!criterionId) return;
        const group = c.group || 'Umum';
        const key = `${group}::${c.name}`;
        nameToIdMap.set(key, criterionId);
        if (Array.isArray(c.aliases)) {
          c.aliases.forEach((aliasKey: string) => {
            aliasToIdMap.set(aliasKey, criterionId);
          });
        }
      });

      existingAssessments.forEach((assessment) => {
        if (assessment.subjectId === scheme.subjectId && assessment.scores) {
          const studentScores: Record<string, number> = {};
          
          Object.entries(assessment.scores as Record<string, number>).forEach(([key, value]) => {
            // Migrate legacy "Group::Name" keys to ID if possible
            if (nameToIdMap.has(key)) {
              studentScores[nameToIdMap.get(key)!] = value;
            } else if (aliasToIdMap.has(key)) {
              studentScores[aliasToIdMap.get(key)!] = value;
            } else {
              studentScores[key] = value;
            }
          });
          
          newScores[assessment.studentId] = studentScores;
        }
      });
      const timerId = setTimeout(() => {
        setAllScores(prev => ({ ...prev, ...newScores }));
      }, 0);
      return () => clearTimeout(timerId);
    }
  }, [existingAssessments, scheme]);

  // Mutation
  const mutation = useMutation({
    mutationFn: (data: UKKAssessmentPayload) => ukkAssessmentService.upsertAssessment(data),
    onSuccess: () => {
      // Don't invalidate immediately to prevent UI jump, rely on local state
    },
    onError: (err) => {
      console.error(err);
      toast.error('Gagal menyimpan nilai beberapa siswa');
    }
  });

  const handleScoreChange = (studentId: number, criterion: SchemeCriterion, value: string) => {
    const numValue = Math.min(Math.max(0, Number(value)), criterion.maxScore);
    const key = getCriteriaKey(criterion);
    
    setAllScores(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [key]: numValue
      }
    }));
    
    setChangedStudentIds(prev => new Set(prev).add(studentId));
  };

  const handleSaveAll = async () => {
    const currentScheme = scheme;
    if (!currentScheme) {
      toast.error('Skema penilaian tidak ditemukan');
      return;
    }

    if (changedStudentIds.size === 0) {
      toast('Tidak ada perubahan nilai untuk disimpan');
      return;
    }

    const promises: Promise<unknown>[] = [];
    const studentIds = Array.from(changedStudentIds);

    for (const studentId of studentIds) {
      const studentScores = allScores[studentId];
      if (!studentScores) continue;

      // Calculate Final Score & Reconstruct Clean Scores Object
      // This ensures migration from old key format (name only) to new format (group::name)
      const cleanScores: Record<string, number> = {};
      let totalScore = 0;
      
      currentScheme.criteria.forEach((c) => {
        const key = getCriteriaKey(c);
        // Fallback to old name-only key for backward compatibility
        let val = studentScores[key] ?? studentScores[c.name];
        if (val == null && Array.isArray(c.aliases)) {
          for (const aliasKey of c.aliases) {
            if (studentScores[aliasKey] != null) {
              val = studentScores[aliasKey];
              break;
            }
          }
        }
        if (val == null) val = 0;
        cleanScores[key] = val;
        totalScore += val;
      });

      const maxTotal = currentScheme.criteria.reduce((a: number, b) => a + Number(b.maxScore), 0);
      const finalScore = maxTotal > 0 ? (totalScore / maxTotal) * 100 : 0;

      const payload = {
        studentId,
        subjectId: currentScheme.subjectId,
        academicYearId: currentScheme.academicYearId,
        criteria: currentScheme.criteria,
        scores: cleanScores,
        finalScore: parseFloat(finalScore.toFixed(2))
      };

      promises.push(mutation.mutateAsync(payload));
    }

    try {
      await Promise.all(promises);
      toast.success(`Berhasil menyimpan nilai untuk ${promises.length} siswa`);
      setChangedStudentIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['ukk-assessments-existing'] });
    } catch {
      // Error handled in mutation onError
    }
  };

  const handleExportCSV = () => {
    if (!scheme || filteredStudents.length === 0) return;
    
    // Header
    const headers = ['No', 'Nama Siswa', 'NIS', 'Kelas'];
    // Add criteria headers
    const criteriaNames = Object.values(groupedCriteria).flat().map((c) => c.name);
    headers.push(...criteriaNames, 'Total Skor', 'Nilai Akhir (0-100)');
    
    // Rows
    const rows = filteredStudents.map((student: StudentLite, index: number) => {
        const studentScores = allScores[student.id] || {};
        const scores = Object.values(groupedCriteria).flat().map((c) => {
            const key = getCriteriaKey(c);
            return studentScores[key] ?? studentScores[c.name] ?? 0;
        });
        const total = scores.reduce((a: number, b: number) => a + b, 0);
        const maxTotal = scheme.criteria.reduce((a: number, b) => a + Number(b.maxScore), 0);
        const final = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
        
        return [
            index + 1,
            `"${student.name}"`,
            `"${student.nis || ''}"`,
            `"${student.studentClass?.name || ''}"`,
            ...scores,
            total,
            final.toFixed(2).replace('.', ',')
        ];
    });
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Nilai_UKK_${scheme.name.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Selection List if no schemeId
  if (!schemeId) {
    if (isLoadingYear || isLoadingSchemes) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Input Nilai UKK</h1>
                <p className="text-gray-500 text-sm">
                  Pilih skema penilaian untuk mulai mengisi nilai siswa.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
              <Info className="text-blue-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Informasi Penugasan</p>
                <p>Sebagai Penguji (Examiner), Anda ditugaskan untuk menilai siswa berdasarkan <strong>Jurusan (Kompetensi Keahlian)</strong> yang telah diatur oleh Administrator.</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Daftar Skema Penilaian</h2>
              {schemes.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Belum ada skema penilaian.</p>
                  <p className="text-sm text-gray-400 mt-1">Silakan hubungi Administrator atau Ketua Jurusan.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {schemes.map((schemeItem) => (
                        <Link 
                            key={schemeItem.id}
                            to={`/examiner/ukk-assessment?schemeId=${schemeItem.id}`}
                            className="group block bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-500 hover:shadow-md transition-all duration-200"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <BookOpen size={20} />
                                </div>
                                <ChevronRight className="text-gray-400 group-hover:text-blue-500 transition-colors" size={20} />
                            </div>
                            
                            <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                                {schemeItem.name}
                            </h3>
                            
                            <div className="space-y-1.5">
                                <p className="text-sm text-gray-600 flex items-center gap-2">
                                    <span className="font-medium text-gray-900">Jurusan:</span> {schemeItem.major?.name || '-'}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
              )}
            </div>
        </div>
    );
  }

  if (isLoadingScheme || isLoadingStudents) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-600">Skema penilaian tidak ditemukan atau tidak dapat dimuat.</p>
          <button
            onClick={() => navigate('/examiner/ukk-assessment')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft size={16} />
            Kembali ke Daftar Skema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/examiner/ukk-assessment')} 
            className="flex items-center text-gray-500 hover:text-blue-600 mb-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} className="mr-1" /> Kembali ke Daftar Skema
          </button>
	          <h1 className="text-lg font-bold text-gray-900">{scheme.name}</h1>
	          <p className="text-gray-500 text-sm mt-1">{scheme.major?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportCSV}
            disabled={filteredStudents.length === 0}
            className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
          >
            <FileSpreadsheet size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Logic Explanation Info Box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <Info className="text-blue-600 shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Informasi Filter Siswa</p>
          <p>
            Daftar siswa di bawah ini <strong>difilter otomatis</strong> berdasarkan Jurusan yang ditugaskan kepada Anda ({user?.examinerMajor?.name || 'Semua Jurusan'}) 
            dan Tingkat Kelas (XII). Jika siswa tidak muncul, pastikan siswa tersebut berada di kelas XII jurusan yang sesuai.
          </p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Cari Siswa (Nama / NIS)..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-64">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow"
            >
              <option value="ALL">Semua Kelas</option>
              {availableClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              {/* Top Header Row: Group Names */}
              <tr>
                <th rowSpan={2} className="px-3 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-12 border-r border-gray-200 bg-gray-100">No</th>
                <th rowSpan={2} className="px-4 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap border-r border-gray-200 bg-gray-100">NAMA SISWA</th>
                {Object.entries(groupedCriteria).map(([groupName, criteria]) => (
                  <th 
                    key={groupName} 
                    colSpan={criteria.length} 
                    className="px-4 py-2 text-center text-xs font-bold text-blue-800 uppercase tracking-wider border-b border-r border-gray-200 bg-blue-50"
                  >
                    {groupName}
                  </th>
                ))}
                <th rowSpan={2} className="px-2 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-20 bg-gray-100">Total</th>
                <th rowSpan={2} className="px-2 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-20 border-l border-gray-200 bg-gray-100">RERATA</th>
              </tr>
              {/* Bottom Header Row: Criteria Names */}
              <tr>
                {Object.values(groupedCriteria).flat().map((criterion, idx: number) => (
                  <th key={idx} className="px-4 py-2 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider min-w-[100px] border-r border-gray-200 bg-gray-50">
                    {criterion.name}
                    <span className="block text-[10px] text-gray-400 font-normal mt-0.5">(Max: {criterion.maxScore})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={3 + scheme.criteria.length} className="px-6 py-12 text-center text-gray-500 text-sm">
                    <div className="flex flex-col items-center justify-center">
                        <Search className="w-8 h-8 text-gray-300 mb-2" />
                        <p>Tidak ada siswa ditemukan sesuai filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, index: number) => {
                  const studentScores = allScores[student.id] || {};
                  
                  const totalScore = scheme.criteria.reduce((acc: number, c) => {
                      const key = getCriteriaKey(c);
                      return acc + (studentScores[key] ?? studentScores[c.name] ?? 0);
                  }, 0);

                  const maxTotal = scheme.criteria.reduce((a: number, b) => a + Number(b.maxScore), 0);
                  const finalScore = maxTotal > 0 ? (totalScore / maxTotal) * 100 : 0;
                  const isChanged = changedStudentIds.has(student.id);

                  return (
                    <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${isChanged ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-3 py-4 text-center text-sm text-gray-500 border-r border-gray-100">{index + 1}</td>
                      <td className="px-4 py-4 border-r border-gray-100 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{student.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{student.nis} • {student.studentClass?.name}</div>
                      </td>
                      {/* Render scores in correct order based on flattened grouped criteria */}
                      {Object.values(groupedCriteria).flat().map((criterion, idx: number) => {
                        const key = getCriteriaKey(criterion);
                        const scoreVal = studentScores[key] ?? studentScores[criterion.name] ?? '';
                        
                        return (
                        <td key={idx} className="px-2 py-3 text-center border-r border-gray-100">
                          <input
                            type="number"
                            min="0"
                            max={criterion.maxScore}
                            value={scoreVal}
                            onChange={(e) => handleScoreChange(student.id, criterion, e.target.value)}
                            className="w-16 px-1 py-1.5 border border-gray-300 rounded text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm transition-shadow"
                            placeholder="0"
                          />
                        </td>
                      )})}
                      <td className="px-2 py-4 text-center border-r border-gray-100 font-semibold text-gray-900">
                        {totalScore}
                      </td>
                      <td className="px-2 py-4 text-center font-semibold text-gray-900">
                        {parseFloat(finalScore.toFixed(2))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-6 right-6 z-10">
        <button
          onClick={handleSaveAll}
          disabled={changedStudentIds.size === 0 || mutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-1"
        >
          {mutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span className="font-bold">Simpan Nilai ({changedStudentIds.size})</span>
        </button>
      </div>
    </div>
  );
};

export default UKKAssessmentPage;
