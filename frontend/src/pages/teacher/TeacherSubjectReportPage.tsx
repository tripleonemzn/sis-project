import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Loader2, 
  Search, 
  FileBarChart,
  AlertCircle
} from 'lucide-react';
import {
  teacherAssignmentService,
  type TeacherAssignment,
  formatTeacherAssignmentLabel,
  sortTeacherAssignmentsBySubjectClass,
} from '../../services/teacherAssignment.service';
import { gradeService } from '../../services/grade.service';
import { toast } from 'react-hot-toast';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

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
  slotScores?: Record<string, number | null> | null;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
}

interface ReportGradeMeta {
  primarySlots: {
    formative: string;
    midterm: string;
    final: string;
  };
  includeSlots: string[];
  slotLabels: Record<string, { label: string; componentType: string }>;
}

type TeacherAssignmentsResponseShape = {
  data?: {
    assignments?: TeacherAssignment[];
  };
  assignments?: TeacherAssignment[];
};

type ReportGradesPayloadShape = {
  rows?: ReportGrade[];
  meta?: ReportGradeMeta | null;
};

const extractReportGradesPayload = (response: unknown): { rows: ReportGrade[]; meta: ReportGradeMeta | null } => {
  if (Array.isArray(response)) {
    return { rows: response as ReportGrade[], meta: null };
  }

  if (!response || typeof response !== 'object') {
    return { rows: [], meta: null };
  }

  const wrapper = response as {
    data?: unknown;
    rows?: unknown;
    meta?: unknown;
  };
  const candidate = wrapper.data ?? response;

  if (Array.isArray(candidate)) {
    return { rows: candidate as ReportGrade[], meta: null };
  }

  if (!candidate || typeof candidate !== 'object') {
    return { rows: [], meta: null };
  }

  const payload = candidate as ReportGradesPayloadShape;
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    meta: payload.meta || null,
  };
};

const normalizeSlotCode = (raw: string | null | undefined): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const resolvePrimarySlots = (meta: ReportGradeMeta | null | undefined) => {
  const includeSlots = Array.isArray(meta?.includeSlots)
    ? meta.includeSlots.map((slot) => normalizeSlotCode(slot)).filter(Boolean)
    : [];
  const firstSlot = includeSlots[0] || 'FORMATIF';
  const secondSlot = includeSlots[1] || firstSlot;
  const lastSlot = includeSlots[includeSlots.length - 1] || secondSlot;

  return {
    formative: normalizeSlotCode(meta?.primarySlots?.formative) || firstSlot,
    midterm: normalizeSlotCode(meta?.primarySlots?.midterm) || secondSlot,
    final: normalizeSlotCode(meta?.primarySlots?.final) || lastSlot,
  };
};

const readRowSlotScore = (
  row: ReportGrade,
  slotCode: string,
  fallback: number | null | undefined,
) => {
  const normalized = normalizeSlotCode(slotCode);
  if (
    normalized &&
    row.slotScores &&
    typeof row.slotScores === 'object' &&
    Object.prototype.hasOwnProperty.call(row.slotScores, normalized)
  ) {
    return row.slotScores[normalized] ?? null;
  }
  return fallback ?? null;
};

export const TeacherSubjectReportPage = () => {
  // Filter States
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN' | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data States
  const [reportGrades, setReportGrades] = useState<ReportGrade[]>([]);
  const [reportMeta, setReportMeta] = useState<ReportGradeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();
  const activeAcademicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0) || null;

  const { data: assignmentsData } = useQuery({
    queryKey: ['teacher-assignments', 'subject-report', activeAcademicYearId],
    enabled: Boolean(activeAcademicYearId),
    queryFn: () =>
      teacherAssignmentService.list({
        academicYearId: activeAcademicYearId || undefined,
        limit: 1000,
      }),
  });

  const assignmentsPayload = assignmentsData as TeacherAssignmentsResponseShape | undefined;
  const assignments = useMemo<TeacherAssignment[]>(
    () => {
      const rawAssignments =
        assignmentsPayload?.data?.assignments || assignmentsPayload?.assignments || [];
      return sortTeacherAssignmentsBySubjectClass(rawAssignments);
    },
    [assignmentsPayload],
  );

  useEffect(() => {
    if (!selectedAssignment) return;
    if (!assignments.some((assignment) => String(assignment.id) === selectedAssignment)) {
      setSelectedAssignment('');
    }
  }, [assignments, selectedAssignment]);

  const fetchReportGrades = useCallback(async () => {
    if (!activeAcademicYearId || !selectedAssignment || !selectedSemester) {
      setReportGrades([]);
      setReportMeta(null);
      return;
    }

    try {
      setLoading(true);
      const assignment = assignments.find((item) => String(item.id) === selectedAssignment);
      
      if (!assignment) return;

      const response = await gradeService.getReportGrades({
        class_id: assignment.class.id,
        subject_id: assignment.subject.id,
        academic_year_id: activeAcademicYearId,
        semester: selectedSemester,
        include_meta: 1,
      });

      const payload = extractReportGradesPayload(response);
      setReportGrades(payload.rows);
      setReportMeta(payload.meta);
    } catch (error) {
      console.error('Error fetching report grades:', error);
      toast.error('Gagal memuat data nilai rapor');
    } finally {
      setLoading(false);
    }
  }, [activeAcademicYearId, assignments, selectedAssignment, selectedSemester]);

  // Fetch Report Grades when filters change
  useEffect(() => {
    void fetchReportGrades();
  }, [fetchReportGrades]);

  // Filtered Display Data
  const filteredGrades = reportGrades.filter(grade => 
    grade.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    grade.student.nis?.includes(searchQuery) ||
    grade.student.nisn?.includes(searchQuery)
  );

  const primarySlots = useMemo(() => resolvePrimarySlots(reportMeta), [reportMeta]);
  const slotLabels = useMemo(() => {
    const labels = reportMeta?.slotLabels || {};
    const getLabel = (slotCode: string, fallback: string) =>
      String(labels[slotCode]?.label || fallback).trim() || fallback;
    return {
      formative: getLabel(primarySlots.formative, 'Formatif'),
      midterm: getLabel(primarySlots.midterm, 'Midterm'),
      final: getLabel(primarySlots.final, 'Final'),
    };
  }, [reportMeta, primarySlots.formative, primarySlots.midterm, primarySlots.final]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-800 flex items-center gap-2">
            Rapor Mata Pelajaran
          </h1>
          <p className="text-gray-600">
            Rekapitulasi nilai akhir siswa per mata pelajaran (dinamis sesuai Program Ujian aktif)
          </p>
        </div>
      </div>

      {!isLoadingActiveAcademicYear && !activeAcademicYearId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar rapor mapel tidak ambigu.
        </div>
      ) : null}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  const semester = e.target.value as 'ODD' | 'EVEN' | '';
                  setSelectedSemester(semester);
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
                disabled={!selectedSemester || !activeAcademicYearId}
              >
                <option value="">Pilih Kelas & Mapel</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={String(assignment.id)}>
                    {formatTeacherAssignmentLabel(assignment)}
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
               <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200"></span> {slotLabels.formative}</span>
               <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-200"></span> {slotLabels.midterm}</span>
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
                  <th className="px-6 py-4 text-center w-24">{slotLabels.formative}</th>
                  <th className="px-6 py-4 text-center w-24">{slotLabels.midterm}</th>
                  <th className="px-6 py-4 text-center w-24">{slotLabels.final}</th>
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
                        {readRowSlotScore(grade, primarySlots.formative, grade.formatifScore) !== null
                          ? Math.round(Number(readRowSlotScore(grade, primarySlots.formative, grade.formatifScore)))
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600">
                        {readRowSlotScore(grade, primarySlots.midterm, grade.sbtsScore) !== null
                          ? Math.round(Number(readRowSlotScore(grade, primarySlots.midterm, grade.sbtsScore)))
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600">
                        {readRowSlotScore(grade, primarySlots.final, grade.sasScore) !== null
                          ? Math.round(Number(readRowSlotScore(grade, primarySlots.final, grade.sasScore)))
                          : '-'}
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
            Silakan pilih Semester serta Kelas & Mata Pelajaran untuk menampilkan data rapor.
          </p>
        </div>
      )}
    </div>
  );
};
