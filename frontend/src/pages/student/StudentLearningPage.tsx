import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { authService } from '../../services/auth.service';
import { toast } from 'react-hot-toast';
import { 
  BookOpen, 
  ClipboardCheck,
  ClipboardList, 
  Search, 
  Filter, 
  Download, 
  PlayCircle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Upload,
  X,
  AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { UnderlineTabBar } from '../../components/navigation/UnderlineTabBar';
import { gradeService, type StudentRemedialActivity } from '../../services/grade.service';

interface Material {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  youtubeUrl?: string | null;
  createdAt: string;
  subject: {
    id: string;
    name: string;
    code: string;
  };
  teacher: {
    id: string;
    name: string;
  };
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  dueDate: string;
  maxScore: number;
  allowResubmit: boolean;
  createdAt: string;
  subject: {
    id: string;
    name: string;
    code: string;
  };
  teacher: {
    id: string;
    name: string;
  };
  submission?: {
    id: string;
    submittedAt: string;
    score: number | null;
    feedback: string | null;
    fileUrl: string | null;
    fileName: string | null;
    content: string | null;
  } | null;
}

type LearningOutletContext = {
  user?: {
    id?: number | string;
    studentClass?: {
      id?: number | string | null;
    } | null;
  } | null;
};

type AssignmentSubmissionLookup = NonNullable<Assignment['submission']> & {
  assignment: { id: string };
};

type LearningTabKey = 'materials' | 'assignments' | 'remedials';

const LEARNING_TABS = [
  { id: 'materials', label: 'Materi Pembelajaran', icon: BookOpen },
  { id: 'assignments', label: 'Tugas & PR', icon: ClipboardList },
  { id: 'remedials', label: 'Remedial', icon: ClipboardCheck },
];

function formatLearningDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLearningScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

export default function StudentLearningPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<LearningTabKey>(
    (searchParams.get('tab') as LearningTabKey) || 'materials'
  );
  
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [remedialActivities, setRemedialActivities] = useState<StudentRemedialActivity[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([]);
  const [filteredRemedialActivities, setFilteredRemedialActivities] = useState<StudentRemedialActivity[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [subjects, setSubjects] = useState<{id: string, name: string}[]>([]);

  // Submission Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);

  const { user: contextUser } = useOutletContext<LearningOutletContext>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const fetchData = useCallback(async () => {
    try {
      if (!user) return;
      
      setLoading(true);

      if (!user.studentClass?.id) {
        toast.error('Anda belum terdaftar dalam kelas');
        setLoading(false);
        return;
      }

      const classId = user.studentClass.id;

      // Fetch Materials, Assignments, Submissions, and student-scoped remedial activities.
      const [materialsRes, assignmentsRes, submissionsRes, remedials] = await Promise.all([
        api.get(`/materials?classId=${classId}&isPublished=true&limit=100`),
        api.get(`/assignments?classId=${classId}&isPublished=true&limit=100`),
        api.get(`/submissions?studentId=${user.id}&limit=1000`),
        gradeService.getStudentRemedialActivities({ limit: 100 }),
      ]);

      if (materialsRes.data.success) {
        setMaterials(materialsRes.data.data.materials || []);
      }

      if (assignmentsRes.data.success && submissionsRes.data.success) {
        const fetchedAssignments: Assignment[] = assignmentsRes.data.data.assignments || [];
        const submissions: AssignmentSubmissionLookup[] = submissionsRes.data.data.submissions || [];

        // Map submissions to assignments
        const assignmentsWithStatus = fetchedAssignments.map((assignment) => {
          const submission = submissions.find((s) => s.assignment.id === assignment.id);
          return { ...assignment, submission };
        });

        setAssignments(assignmentsWithStatus);
      }

      setRemedialActivities(remedials);

      // Extract unique subjects for filter
      const allItems: Array<Material | Assignment> = [
        ...(materialsRes.data.data.materials || []),
        ...(assignmentsRes.data.data.assignments || []),
      ];
      const uniqueSubjects = Array.from(
        new Map(
          [
            ...allItems.map((item) => [String(item.subject.id), { id: String(item.subject.id), name: item.subject.name }] as const),
            ...remedials.map((item) => [String(item.subject.id), { id: String(item.subject.id), name: item.subject.name }] as const),
          ],
        ).values(),
      );
      
      setSubjects(uniqueSubjects);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Gagal memuat data pembelajaran');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  const filterMaterials = useCallback(() => {
    let filtered = [...materials];

    if (selectedSubject) {
      filtered = filtered.filter(m => m.subject.id.toString() === selectedSubject);
    }

    if (searchQuery) {
      filtered = filtered.filter(m => 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.subject.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredMaterials(filtered);
  }, [materials, searchQuery, selectedSubject]);

  const filterAssignments = useCallback(() => {
    let filtered = [...assignments];

    if (selectedSubject) {
      filtered = filtered.filter(a => a.subject.id.toString() === selectedSubject);
    }

    if (searchQuery) {
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.subject.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredAssignments(filtered);
  }, [assignments, searchQuery, selectedSubject]);

  const filterRemedialActivities = useCallback(() => {
    let filtered = [...remedialActivities];

    if (selectedSubject) {
      filtered = filtered.filter((item) => String(item.subject.id) === selectedSubject);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        (item.activityTitle || '').toLowerCase().includes(query) ||
        (item.activityInstructions || '').toLowerCase().includes(query) ||
        item.subject.name.toLowerCase().includes(query) ||
        item.sourceLabel.toLowerCase().includes(query)
      );
    }

    setFilteredRemedialActivities(filtered);
  }, [remedialActivities, searchQuery, selectedSubject]);

  useEffect(() => {
    if (activeTab === 'materials') {
      filterMaterials();
    } else if (activeTab === 'assignments') {
      filterAssignments();
    } else {
      filterRemedialActivities();
    }
  }, [activeTab, filterAssignments, filterMaterials, filterRemedialActivities]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;

    try {
      setSubmitting(true);
      const formData = new FormData();
      
      formData.append('assignmentId', selectedAssignment.id);
      if (submissionContent) formData.append('content', submissionContent);
      if (submissionFile) formData.append('file', submissionFile);

      const res = await api.post('/submissions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (res.data.success) {
        toast.success('Tugas berhasil dikumpulkan');
        setShowSubmitModal(false);
        setSubmissionFile(null);
        setSubmissionContent('');
        fetchData(); // Refresh data
      }
    } catch (error: unknown) {
      console.error('Submit error:', error);
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
          'string'
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Gagal mengumpulkan tugas';
      toast.error(message || 'Gagal mengumpulkan tugas');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (assignment: Assignment) => {
    if (assignment.submission) {
      if (assignment.submission.score !== null) {
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
            <CheckCircle size={12} />
            Dinilai: {assignment.submission.score}
          </span>
        );
      }
      return (
        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
          <CheckCircle size={12} />
          Diserahkan
        </span>
      );
    }

    const isOverdue = new Date(assignment.dueDate) < new Date();
    if (isOverdue) {
      return (
        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1">
          <AlertCircle size={12} />
          Terlambat
        </span>
      );
    }

    return (
      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1">
        <Clock size={12} />
        Belum Diserahkan
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materi & Tugas</h1>
          <p className="text-gray-500">Akses materi pelajaran dan tugas kelas Anda</p>
        </div>
      </div>

      {/* Tabs */}
      <UnderlineTabBar
        items={LEARNING_TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as LearningTabKey)}
        ariaLabel="Tab materi dan tugas siswa"
      />

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={`Cari ${activeTab === 'materials' ? 'materi' : activeTab === 'assignments' ? 'tugas' : 'remedial'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-full md:w-64 relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
          >
            <option value="">Semua Mata Pelajaran</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Memuat data...</p>
        </div>
      ) : activeTab === 'materials' ? (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-section-title text-gray-900">Daftar Materi Pembelajaran</h2>
            <p className="mt-1 text-sm text-gray-500">
              {filteredMaterials.length} materi tersedia sesuai filter aktif.
            </p>
          </div>
          {filteredMaterials.length === 0 ? (
            <div className="m-5 rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada materi</h3>
              <p className="mt-1 text-sm text-gray-500">Belum ada materi pelajaran yang diunggah.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Materi</th>
                    <th className="w-56 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mata Pelajaran</th>
                    <th className="w-48 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Guru</th>
                    <th className="w-36 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tanggal</th>
                    <th className="w-44 px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMaterials.map((material, index) => (
                    <tr key={material.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">{material.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                          {material.description || 'Tidak ada deskripsi'}
                        </p>
                        {material.fileName ? (
                          <p className="mt-1 text-xs text-gray-400">File: {material.fileName}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {material.subject.name}
                        </span>
                        <p className="mt-1 font-mono text-xs text-gray-500">{material.subject.code}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                            {material.teacher.name.charAt(0)}
                          </span>
                          <span>{material.teacher.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        {new Date(material.createdAt).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {material.youtubeUrl ? (
                            <a
                              href={material.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              Video
                            </a>
                          ) : null}
                          {material.fileUrl ? (
                            <a
                              href={material.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                            >
                              <Download size={14} />
                              Unduh
                            </a>
                          ) : null}
                          {!material.youtubeUrl && !material.fileUrl ? (
                            <span className="text-sm text-gray-400">-</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : activeTab === 'assignments' ? (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-section-title text-gray-900">Daftar Tugas & PR</h2>
            <p className="mt-1 text-sm text-gray-500">
              {filteredAssignments.length} tugas tersedia sesuai filter aktif.
            </p>
          </div>
          {filteredAssignments.length === 0 ? (
            <div className="m-5 rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada tugas</h3>
              <p className="mt-1 text-sm text-gray-500">Belum ada tugas yang diberikan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tugas</th>
                    <th className="w-56 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mata Pelajaran</th>
                    <th className="w-52 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Deadline</th>
                    <th className="w-48 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="w-52 px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAssignments.map((assignment, index) => (
                    <tr key={assignment.id} className="align-top transition-colors hover:bg-gray-50">
                      <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">{assignment.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                          {assignment.description || 'Tidak ada deskripsi'}
                        </p>
                        <div className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500">
                          <FileText size={14} />
                          Skor maks: {assignment.maxScore}
                        </div>
                        {assignment.submission?.feedback ? (
                          <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                            <strong>Feedback Guru:</strong> {assignment.submission.feedback}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                          {assignment.subject.name}
                        </span>
                        <p className="mt-1 font-mono text-xs text-gray-500">{assignment.subject.code}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div className="inline-flex items-start gap-2">
                          <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                          <span>
                            {new Date(assignment.dueDate).toLocaleDateString('id-ID', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">{getStatusBadge(assignment)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-end gap-2">
                          {assignment.fileUrl ? (
                            <a
                              href={assignment.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Download size={14} />
                              Lampiran
                            </a>
                          ) : null}
                          <button
                            onClick={() => {
                              setSelectedAssignment(assignment);
                              setSubmissionContent(assignment.submission?.content || '');
                              setShowSubmitModal(true);
                            }}
                            className={clsx(
                              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition',
                              assignment.submission
                                ? 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                                : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700',
                            )}
                          >
                            {assignment.submission ? (
                              <>
                                <FileText size={14} />
                                Lihat / Edit
                              </>
                            ) : (
                              <>
                                <Upload size={14} />
                                Kumpulkan
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-section-title text-gray-900">Aktivitas Remedial</h2>
            <p className="mt-1 text-sm text-gray-500">
              {filteredRemedialActivities.length} aktivitas remedial tersedia khusus untuk Anda.
            </p>
          </div>
          {filteredRemedialActivities.length === 0 ? (
            <div className="m-5 rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada remedial</h3>
              <p className="mt-1 text-sm text-gray-500">Belum ada aktivitas remedial yang diberikan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full text-left">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Aktivitas</th>
                    <th className="w-56 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mata Pelajaran</th>
                    <th className="w-44 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Sumber Nilai</th>
                    <th className="w-44 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tenggat</th>
                    <th className="w-48 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status Nilai</th>
                    <th className="w-36 px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRemedialActivities.map((activity, index) => (
                    <tr key={activity.id} className="align-top transition-colors hover:bg-gray-50">
                      <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {activity.methodLabel}
                          </span>
                          <span className="text-xs text-gray-500">Percobaan {activity.attemptNumber}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {activity.activityTitle || `Remedial ${activity.sourceLabel}`}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm text-gray-500">
                          {activity.activityInstructions || 'Instruksi remedial belum ditambahkan guru.'}
                        </p>
                        {activity.activityExamPacket ? (
                          <p className="mt-2 text-xs font-medium text-indigo-700">
                            Paket soal: {activity.activityExamPacket.title}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-gray-400">
                          Guru: {activity.teacher?.name || '-'} • Dibuat {formatLearningDate(activity.recordedAt)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                          {activity.subject.name}
                        </span>
                        <p className="mt-1 font-mono text-xs text-gray-500">{activity.subject.code}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">{activity.sourceLabel}</td>
                      <td className="px-5 py-4 text-sm text-gray-700">{formatLearningDate(activity.activityDueAt)}</td>
                      <td className="px-5 py-4">
                        <span
                          className={clsx(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            activity.effectiveScore >= activity.kkm
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {activity.statusLabel}
                        </span>
                        <p className="mt-2 text-xs text-gray-500">
                          Asli {formatLearningScore(activity.originalScore)} • Remedial {formatLearningScore(activity.remedialScore)} • Efektif {formatLearningScore(activity.effectiveScore)} / KKM {activity.kkm}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end">
                          {activity.activityExamPacket ? (
                            <a
                              href={`/student/remedials/${activity.id}/take`}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                            >
                              <PlayCircle size={14} />
                              Kerjakan
                            </a>
                          ) : activity.activityReferenceUrl ? (
                            <a
                              href={activity.activityReferenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                            >
                              <Download size={14} />
                              Buka
                            </a>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Submission Modal */}
      {showSubmitModal && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/25 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Pengumpulan Tugas</h3>
              <button onClick={() => setShowSubmitModal(false)} className="text-gray-400 hover:text-gray-500">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan / Jawaban</label>
                <textarea
                  value={submissionContent}
                  onChange={(e) => setSubmissionContent(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Tulis jawaban atau catatan untuk guru..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload File (Opsional)</label>
                <input
                  type="file"
                  onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {selectedAssignment.submission?.fileUrl && !submissionFile && (
                  <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle size={14} />
                    File sudah diupload: {selectedAssignment.submission.fileName}
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || (selectedAssignment.submission ? selectedAssignment.allowResubmit === false : false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? 'Mengirim...' : 'Kirim Tugas'}
                </button>
              </div>
              
              {selectedAssignment.submission && selectedAssignment.allowResubmit === false && (
                <p className="text-xs text-red-500 text-center">
                  Tugas ini tidak dapat dikirim ulang setelah diserahkan.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
