import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { authService } from '../../services/auth.service';
import { toast } from 'react-hot-toast';
import { 
  BookOpen, 
  ClipboardList, 
  Search, 
  Filter, 
  Download, 
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

export default function StudentLearningPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'materials' | 'assignments'>(
    (searchParams.get('tab') as 'materials' | 'assignments') || 'materials'
  );
  
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([]);
  
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

      // Fetch Materials, Assignments, and Submissions
      const [materialsRes, assignmentsRes, submissionsRes] = await Promise.all([
        api.get(`/materials?classId=${classId}&isPublished=true&limit=100`),
        api.get(`/assignments?classId=${classId}&isPublished=true&limit=100`),
        api.get(`/submissions?studentId=${user.id}&limit=1000`)
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

      // Extract unique subjects for filter
      const allItems: Array<Material | Assignment> = [
        ...(materialsRes.data.data.materials || []),
        ...(assignmentsRes.data.data.assignments || []),
      ];
      const uniqueSubjects = Array.from(
        new Map(
          allItems.map((item) => [item.subject.id, { id: item.subject.id, name: item.subject.name }]),
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

  useEffect(() => {
    if (activeTab === 'materials') {
      filterMaterials();
    } else {
      filterAssignments();
    }
  }, [activeTab, filterAssignments, filterMaterials]);

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
          <h1 className="text-lg font-bold text-gray-900">Materi & Tugas</h1>
          <p className="text-gray-500">Akses materi pelajaran dan tugas kelas Anda</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('materials')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'materials'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <BookOpen size={16} />
          Materi Pembelajaran
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'assignments'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <ClipboardList size={16} />
          Tugas & PR
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={`Cari ${activeTab === 'materials' ? 'materi' : 'tugas'}...`}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMaterials.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada materi</h3>
              <p className="mt-1 text-sm text-gray-500">Belum ada materi pelajaran yang diunggah.</p>
            </div>
          ) : (
            filteredMaterials.map((material) => (
              <div key={material.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                <div className="p-5 flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {material.subject.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(material.createdAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">{material.title}</h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-3">{material.description || 'Tidak ada deskripsi'}</p>
                  
                  {material.youtubeUrl && (
                    <div className="mb-4 aspect-video rounded-lg overflow-hidden bg-gray-100">
                      <iframe 
                        src={`https://www.youtube.com/embed/${material.youtubeUrl.split('v=')[1]}`}
                        className="w-full h-full"
                        allowFullScreen
                      />
                    </div>
                  )}
                </div>
                
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                      {material.teacher.name.charAt(0)}
                    </div>
                    <span className="truncate max-w-[120px]">{material.teacher.name}</span>
                  </div>
                  {material.fileUrl && (
                    <a 
                      href={material.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                    >
                      <Download size={16} />
                      Unduh
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada tugas</h3>
              <p className="mt-1 text-sm text-gray-500">Belum ada tugas yang diberikan.</p>
            </div>
          ) : (
            filteredAssignments.map((assignment) => (
              <div key={assignment.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {assignment.subject.name}
                      </span>
                      {getStatusBadge(assignment)}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{assignment.title}</h3>
                    <p className="text-sm text-gray-500 mb-3">{assignment.description || 'Tidak ada deskripsi'}</p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        <span>Deadline: {new Date(assignment.dueDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText size={14} />
                        <span>Max Score: {assignment.maxScore}</span>
                      </div>
                    </div>

                    {assignment.submission?.feedback && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 border border-blue-100">
                        <strong>Feedback Guru:</strong> {assignment.submission.feedback}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 min-w-[150px]">
                    {assignment.fileUrl && (
                      <a 
                        href={assignment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                      >
                        <Download size={16} />
                        Lampiran
                      </a>
                    )}
                    
                    <button
                      onClick={() => {
                        setSelectedAssignment(assignment);
                        setSubmissionContent(assignment.submission?.content || '');
                        setShowSubmitModal(true);
                      }}
                      className={clsx(
                        "px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                        assignment.submission 
                          ? "bg-white border border-blue-200 text-blue-700 hover:bg-blue-50"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      )}
                    >
                      {assignment.submission ? (
                        <>
                          <FileText size={16} />
                          Lihat / Edit Jawaban
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          Kumpulkan Tugas
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Submission Modal */}
      {showSubmitModal && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
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
