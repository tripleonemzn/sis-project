import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import api from '../../services/api';
import { authService } from '../../services/auth.service';
import type { User } from '../../types/auth';
import toast from 'react-hot-toast';
import {
  Plus,
  FileText,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Upload,
  X,
  Search,
  Filter,
  Calendar,
  Users,
  CheckCircle,
  ClipboardList,
  BookOpen,
  Copy
} from 'lucide-react';
import clsx from 'clsx';

// Interfaces
interface Material {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  youtubeUrl?: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    name: string;
    level: string;
  };
  subject: {
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
  allowResubmit: boolean;
  maxScore: number;
  isPublished: boolean;
  createdAt: string;
  class: {
    id: string;
    name: string;
    level: string;
  };
  subject: {
    id: string;
    name: string;
  };
  _count?: {
    submissions: number;
  };
}

interface TeacherAssignment {
  id: string;
  subject: {
    id: string;
    name: string;
  };
  class: {
    id: string;
    name: string;
    level: string;
  };
}
type PageOutletContext = {
  user?: User | null;
  activeYear?: { id?: number | null } | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    const message = response?.data?.message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const LEARNING_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

function validateLearningAttachment(file: File | null) {
  if (!file) return true;
  if (file.size <= LEARNING_ATTACHMENT_MAX_BYTES) return true;
  toast.error('Ukuran file materi/tugas maksimal 10MB');
  return false;
}

export default function MaterialsAndAssignmentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'assignments' ? 'assignments' : 'materials';

  const [loading, setLoading] = useState(true);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [activeAcademicYearId, setActiveAcademicYearId] = useState<number | null>(null);
  
  // Data states
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([]);
  
  // Filter states
  const [selectedClassSubject, setSelectedClassSubject] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Copy Modal state
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyingMaterial, setCopyingMaterial] = useState<Material | null>(null);
  const [copyingAssignment, setCopyingAssignment] = useState<Assignment | null>(null);
  const [selectedCopyClasses, setSelectedCopyClasses] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);
  
  // Form states
  const [materialForm, setMaterialForm] = useState({
    title: '',
    description: '',
    content: '',
    class_id: '',
    subject_id: '',
    file: null as File | null,
    is_published: false
  });

  const [assignmentForm, setAssignmentForm] = useState({
    title: '',
    description: '',
    class_id: '',
    subject_id: '',
    deadline_datetime: '',
    allow_resubmit: false,
    max_score: 100,
    file: null as File | null,
    is_published: false
  });

  useEffect(() => {
    if (searchParams.get('tab')) return;

    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('tab', activeTab);
      return nextParams;
    }, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  const handleTabChange = useCallback((tab: 'materials' | 'assignments') => {
    if (tab === activeTab) return;

    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('tab', tab);
      return nextParams;
    }, { replace: true });
  }, [activeTab, setSearchParams]);

  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<PageOutletContext>() || {};

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const { data: fetchedActiveYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  
  // Sync active year ID
  useEffect(() => {
    if (activeAcademicYear?.id) {
        setActiveAcademicYearId(activeAcademicYear.id);
    }
  }, [activeAcademicYear]);

  const fetchInitialData = useCallback(async () => {
    try {
      if (!user || !activeAcademicYearId) return;
      
      const currentYearId = activeAcademicYearId;
      
      // 2. Fetch data with academicYearId filter
      const params = currentYearId ? `?academicYearId=${currentYearId}&limit=1000` : '?limit=1000';
      
      const [assignmentsRes, materialsRes, teacherAssignmentsRes] = await Promise.all([
        api.get(`/assignments${params}`),
        api.get(`/materials${params}`),
        api.get(`/teacher-assignments${params}`)
      ]);

      if (assignmentsRes.data.success) {
        // Handle pagination response structure
        const data = assignmentsRes.data.data;
        const assignmentsData = Array.isArray(data) ? data : data.assignments || [];
        
        // Sort: Subject Name ASC, then Class Name ASC
        assignmentsData.sort((a: Assignment, b: Assignment) => {
          const subjectCompare = a.subject.name.localeCompare(b.subject.name);
          if (subjectCompare !== 0) return subjectCompare;
          return a.class.name.localeCompare(b.class.name);
        });
        
        setAssignments(assignmentsData);
      }

      if (materialsRes.data.success) {
        // Handle pagination response structure
        const data = materialsRes.data.data;
        const materialsData = Array.isArray(data) ? data : data.materials || [];
        
        // Sort: Subject Name ASC, then Class Name ASC
        materialsData.sort((a: Material, b: Material) => {
          const subjectCompare = a.subject.name.localeCompare(b.subject.name);
          if (subjectCompare !== 0) return subjectCompare;
          return a.class.name.localeCompare(b.class.name);
        });

        setMaterials(materialsData);
      }

      if (teacherAssignmentsRes.data.success) {
        // Handle pagination response structure
        const data = teacherAssignmentsRes.data.data;
        const assignmentsList = Array.isArray(data) ? data : data.assignments || [];
        
        const sortedAssignments = assignmentsList.sort((a: TeacherAssignment, b: TeacherAssignment) => {
          const subjectCompare = a.subject.name.localeCompare(b.subject.name);
          if (subjectCompare !== 0) return subjectCompare;
          return a.class.name.localeCompare(b.class.name);
        });
        setTeacherAssignments(sortedAssignments);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [activeAcademicYearId, user]);

  useEffect(() => {
    if (user && activeAcademicYearId) {
      fetchInitialData();
    }
  }, [user, activeAcademicYearId, fetchInitialData]);

  const filterMaterials = useCallback(() => {
    let filtered = [...materials];

    if (selectedClassSubject) {
      const assignment = teacherAssignments.find(a => a.id === selectedClassSubject);
      if (assignment) {
        filtered = filtered.filter(
          m => m.class.id === assignment.class.id && m.subject.id === assignment.subject.id
        );
      }
    }

    if (searchQuery) {
      filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredMaterials(filtered);
  }, [materials, searchQuery, selectedClassSubject, teacherAssignments]);

  const filterAssignments = useCallback(() => {
    let filtered = [...assignments];

    if (selectedClassSubject) {
      const assignment = teacherAssignments.find(a => a.id === selectedClassSubject);
      if (assignment) {
        filtered = filtered.filter(
          a => a.class.id === assignment.class.id && a.subject.id === assignment.subject.id
        );
      }
    }

    if (searchQuery) {
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredAssignments(filtered);
  }, [assignments, searchQuery, selectedClassSubject, teacherAssignments]);

  useEffect(() => {
    if (activeTab === 'materials') {
      filterMaterials();
    } else {
      filterAssignments();
    }
  }, [activeTab, filterAssignments, filterMaterials]);

  // Helper functions
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const isDeadlinePassed = (deadline: string) => {
    return new Date(deadline) < new Date();
  };

  // Material Handlers
  const handleOpenMaterialModal = (material?: Material) => {
    if (material) {
      setEditingMaterial(material);
      setMaterialForm({
        title: material.title,
        description: material.description || '',
        content: material.content || '',
        class_id: material.class.id,
        subject_id: material.subject.id,
        file: null,
        is_published: material.isPublished
      });
    } else {
      setEditingMaterial(null);
      setMaterialForm({
        title: '',
        description: '',
        content: '',
        class_id: '',
        subject_id: '',
        file: null,
        is_published: false
      });
    }
    setShowMaterialModal(true);
  };

  const handleMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialForm.title || !materialForm.class_id || !materialForm.subject_id) {
      toast.error('Judul, kelas, dan mata pelajaran harus diisi');
      return;
    }

    if (!activeAcademicYearId) {
      toast.error('Tahun ajaran aktif tidak ditemukan');
      return;
    }

    if (!validateLearningAttachment(materialForm.file)) {
      return;
    }

    setUploading(true);
    try {
      const submitData = new FormData();

      submitData.append('title', materialForm.title);
      submitData.append('description', materialForm.description);
      submitData.append('content', materialForm.content);
      submitData.append('classId', materialForm.class_id);
      submitData.append('subjectId', materialForm.subject_id);
      submitData.append('isPublished', materialForm.is_published.toString());
      
      // Only append academicYearId for new materials
      if (!editingMaterial) {
        submitData.append('academicYearId', activeAcademicYearId.toString());
      }

      if (materialForm.file) {
        submitData.append('file', materialForm.file);
      }

      const headers = {
        'Content-Type': 'multipart/form-data'
      };

      if (editingMaterial) {
        await api.put(`/materials/${editingMaterial.id}`, submitData, { headers });
        toast.success('Materi berhasil diupdate');
      } else {
        await api.post('/materials', submitData, { headers });
        toast.success('Materi berhasil ditambahkan');
      }

      setShowMaterialModal(false);
      fetchInitialData();
    } catch (error: unknown) {
      console.error('Submit error:', error);
      toast.error(getErrorMessage(error, 'Gagal menyimpan materi'));
    } finally {
      setUploading(false);
    }
  };

  const handleMaterialDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus materi ini?')) return;
    try {
      await api.delete(`/materials/${id}`);
      toast.success('Materi berhasil dihapus');
      fetchInitialData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menghapus materi'));
    }
  };

  const handleMaterialPublishToggle = async (material: Material) => {
    try {
      await api.put(
        `/materials/${material.id}`,
        { isPublished: !material.isPublished }
      );
      toast.success(material.isPublished ? 'Materi disembunyikan' : 'Materi dipublikasikan');
      fetchInitialData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal mengubah status publikasi'));
    }
  };

  const handleOpenCopyModal = (material: Material) => {
    setCopyingMaterial(material);
    setCopyingAssignment(null);
    setSelectedCopyClasses([]);
    setShowCopyModal(true);
  };

  const handleOpenCopyAssignmentModal = (assignment: Assignment) => {
    setCopyingAssignment(assignment);
    setCopyingMaterial(null);
    setSelectedCopyClasses([]);
    setShowCopyModal(true);
  };

  const handleCopySubmit = async () => {
    if ((!copyingMaterial && !copyingAssignment) || selectedCopyClasses.length === 0) {
      toast.error('Pilih minimal satu kelas tujuan');
      return;
    }

    setCopying(true);
    try {
      const item = copyingMaterial || copyingAssignment;
      const type = copyingMaterial ? 'materials' : 'assignments';
      
      await api.post(
        `/${type}/${item!.id}/copy`,
        { targetClassIds: selectedCopyClasses.map(Number) }
      );
      toast.success(`${copyingMaterial ? 'Materi' : 'Tugas'} berhasil disalin ke kelas lain`);
      setShowCopyModal(false);
      fetchInitialData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, `Gagal menyalin ${copyingMaterial ? 'materi' : 'tugas'}`));
    } finally {
      setCopying(false);
    }
  };

  // Assignment Handlers
  const handleOpenAssignmentModal = (assignment?: Assignment) => {
    if (assignment) {
      setEditingAssignment(assignment);
      const deadlineDate = new Date(assignment.dueDate);
      // Format to YYYY-MM-DDTHH:mm for datetime-local
      const formattedDateTime = deadlineDate.toISOString().slice(0, 16);
      
      setAssignmentForm({
        title: assignment.title,
        description: assignment.description || '',
        class_id: assignment.class.id,
        subject_id: assignment.subject.id,
        deadline_datetime: formattedDateTime,
        allow_resubmit: assignment.allowResubmit,
        max_score: assignment.maxScore,
        file: null,
        is_published: assignment.isPublished
      });
    } else {
      setEditingAssignment(null);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);
      tomorrow.setHours(23, 59, 0, 0);
      
      setAssignmentForm({
        title: '',
        description: '',
        class_id: '',
        subject_id: '',
        deadline_datetime: tomorrow.toISOString().slice(0, 16),
        allow_resubmit: false,
        max_score: 100,
        file: null,
        is_published: false
      });
    }
    setShowAssignmentModal(true);
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentForm.title || !assignmentForm.class_id || !assignmentForm.subject_id || !assignmentForm.deadline_datetime) {
      toast.error('Judul, kelas, mata pelajaran, dan deadline harus diisi');
      return;
    }

    if (!activeAcademicYearId) {
      toast.error('Tahun ajaran aktif tidak ditemukan');
      return;
    }

    if (!validateLearningAttachment(assignmentForm.file)) {
      return;
    }

    setUploading(true);

    try {
      const submitData = new FormData();

      submitData.append('title', assignmentForm.title);
      submitData.append('description', assignmentForm.description);
      submitData.append('classId', assignmentForm.class_id);
      submitData.append('subjectId', assignmentForm.subject_id);
      submitData.append('dueDate', new Date(assignmentForm.deadline_datetime).toISOString());
      submitData.append('allowResubmit', assignmentForm.allow_resubmit.toString());
      submitData.append('maxScore', assignmentForm.max_score.toString());
      submitData.append('isPublished', assignmentForm.is_published.toString());

      // Only append academicYearId for new assignments
      if (!editingAssignment) {
        submitData.append('academicYearId', activeAcademicYearId.toString());
      }

      if (assignmentForm.file) {
        submitData.append('file', assignmentForm.file);
      }

      const headers = {
        'Content-Type': 'multipart/form-data'
      };

      if (editingAssignment) {
        await api.put(`/assignments/${editingAssignment.id}`, submitData, { headers });
        toast.success('Tugas berhasil diupdate');
      } else {
        await api.post('/assignments', submitData, { headers });
        toast.success('Tugas berhasil ditambahkan');
      }

      setShowAssignmentModal(false);
      fetchInitialData();
    } catch (error: unknown) {
      console.error('Submit error:', error);
      toast.error(getErrorMessage(error, 'Gagal menyimpan tugas'));
    } finally {
      setUploading(false);
    }
  };

  const handleAssignmentDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus tugas ini?')) return;
    try {
      await api.delete(`/assignments/${id}`);
      toast.success('Tugas berhasil dihapus');
      fetchInitialData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menghapus tugas'));
    }
  };

  const handleAssignmentPublishToggle = async (assignment: Assignment) => {
    try {
      await api.put(
        `/assignments/${assignment.id}`,
        { isPublished: !assignment.isPublished }
      );
      toast.success(assignment.isPublished ? 'Tugas disembunyikan' : 'Tugas dipublikasikan');
      fetchInitialData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal mengubah status publikasi'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materi & Tugas</h1>
          <p className="text-sm text-gray-600 mt-1">Kelola materi pembelajaran dan penugasan siswa</p>
        </div>
        <button
          onClick={() => activeTab === 'materials' ? handleOpenMaterialModal() : handleOpenAssignmentModal()}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>{activeTab === 'materials' ? 'Tambah Materi' : 'Tambah Tugas'}</span>
        </button>
      </div>

      {/* Tabs */}
      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
          <button
            onClick={() => handleTabChange('materials')}
            className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
              activeTab === 'materials'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span>Materi Ajar</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('assignments')}
            className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
              activeTab === 'assignments'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              <span>Tugas Siswa</span>
            </div>
          </button>
        </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="filter_class_subject" className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Filter Kelas & Mata Pelajaran
            </label>
            <select
              id="filter_class_subject"
              name="filter_class_subject"
              value={selectedClassSubject}
              onChange={(e) => setSelectedClassSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Semua Kelas & Mata Pelajaran</option>
              {teacherAssignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.subject.name} - {assignment.class.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search_query" className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Cari {activeTab === 'materials' ? 'Materi' : 'Tugas'}
            </label>
            <input
              id="search_query"
              name="search_query"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Cari berdasarkan judul atau deskripsi...`}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {activeTab === 'materials' ? (
          // Materials List
          <>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Daftar Materi ({filteredMaterials.length})
              </h2>
            </div>
            {filteredMaterials.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500 mb-2">Belum ada materi</p>
                <p className="text-sm text-gray-400">Klik tombol "Tambah Materi" untuk membuat materi baru</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredMaterials.map((material) => (
                  <div key={material.id} className="p-6 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{material.title}</h3>
                          {material.isPublished ? (
                            <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                              Published
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full">
                              Draft
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                          <span className="font-medium">{material.class.name}</span>
                          <span>•</span>
                          <span>{material.subject.name}</span>
                          <span>•</span>
                          <span>{formatDate(material.createdAt)}</span>
                        </div>

                        {material.description && (
                          <p className="text-sm text-gray-600 mb-3">{material.description}</p>
                        )}

                        {material.fileName && (
                          <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <FileText className="w-4 h-4" />
                            <span>{material.fileName}</span>
                            <span>({formatFileSize(material.fileSize)})</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleMaterialPublishToggle(material)}
                          className={clsx(
                            "p-2 rounded-lg transition",
                            material.isPublished ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-50"
                          )}
                          title={material.isPublished ? "Sembunyikan" : "Publikasikan"}
                        >
                          {material.isPublished ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                        </button>

                        {material.fileUrl && (
                          <a
                            href={material.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Download"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                        )}

                        <button
                          onClick={() => handleOpenCopyModal(material)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Copy ke Kelas Lain"
                        >
                          <Copy className="w-5 h-5" />
                        </button>

                        <button
                          onClick={() => handleOpenMaterialModal(material)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5" />
                        </button>

                        <button
                          onClick={() => handleMaterialDelete(material.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Hapus"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          // Assignments List
          <>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Daftar Tugas ({filteredAssignments.length})
              </h2>
            </div>
            {filteredAssignments.length === 0 ? (
              <div className="p-12 text-center">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500 mb-2">Belum ada tugas</p>
                <p className="text-sm text-gray-400">Klik tombol "Tambah Tugas" untuk membuat tugas baru</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredAssignments.map((assignment) => {
                  const deadlinePassed = isDeadlinePassed(assignment.dueDate);
                  
                  return (
                    <div key={assignment.id} className="p-6 hover:bg-gray-50 transition">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
                            {assignment.isPublished ? (
                              <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                                Published
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full">
                                Draft
                              </span>
                            )}
                            {deadlinePassed && (
                              <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                                Deadline Lewat
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                            <span className="font-medium">{assignment.class.name}</span>
                            <span>•</span>
                            <span>{assignment.subject.name}</span>
                            <span>•</span>
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>Deadline: {formatDate(assignment.dueDate)}</span>
                            </span>
                          </div>

                          {assignment.description && (
                            <p className="text-sm text-gray-600 mb-3">{assignment.description}</p>
                          )}

                          <div className="flex items-center space-x-4 text-sm">
                            <span className="flex items-center space-x-1 text-gray-500">
                              <Users className="w-4 h-4" />
                              <span>{assignment._count?.submissions || 0} submission</span>
                            </span>
                            <span className="flex items-center space-x-1 text-gray-500">
                              <CheckCircle className="w-4 h-4" />
                              <span>Max Score: {assignment.maxScore}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => navigate(`/teacher/assignments/${assignment.id}/submissions`)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                            title="Lihat Submissions"
                          >
                            <Users className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => handleAssignmentPublishToggle(assignment)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                            title={assignment.isPublished ? 'Sembunyikan' : 'Publikasikan'}
                          >
                            {assignment.isPublished ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>

                          {assignment.fileUrl && (
                            <a
                              href={assignment.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Download"
                            >
                              <Download className="w-5 h-5" />
                            </a>
                          )}

                          <button
                            onClick={() => handleOpenCopyAssignmentModal(assignment)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Copy ke Kelas Lain"
                          >
                            <Copy className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => handleOpenAssignmentModal(assignment)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => handleAssignmentDelete(assignment.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Hapus"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Material Modal */}
      {showMaterialModal && (
        <div className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">
                {editingMaterial ? 'Edit Materi' : 'Tambah Materi Baru'}
              </h2>
              <button onClick={() => setShowMaterialModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMaterialSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="material_class_subject" className="block text-sm font-medium text-gray-700 mb-2">
                  Kelas & Mata Pelajaran <span className="text-red-500">*</span>
                </label>
                <select
                  id="material_class_subject"
                  name="material_class_subject"
                  value={materialForm.class_id && materialForm.subject_id ? 
                    teacherAssignments.find(a => String(a.class.id) === String(materialForm.class_id) && String(a.subject.id) === String(materialForm.subject_id))?.id || '' 
                    : ''}
                  onChange={(e) => {
                    const assignment = teacherAssignments.find(a => String(a.id) === e.target.value);
                    if (assignment) {
                      setMaterialForm(prev => ({
                        ...prev,
                        class_id: assignment.class.id,
                        subject_id: assignment.subject.id
                      }));
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Pilih Kelas & Mata Pelajaran</option>
                  {teacherAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.subject.name} - {assignment.class.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="material_title" className="block text-sm font-medium text-gray-700 mb-2">
                  Judul Materi <span className="text-red-500">*</span>
                </label>
                <input
                  id="material_title"
                  name="material_title"
                  type="text"
                  value={materialForm.title}
                  onChange={(e) => setMaterialForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: Pengenalan Jaringan Komputer"
                  required
                />
              </div>

              <div>
                <label htmlFor="material_description" className="block text-sm font-medium text-gray-700 mb-2">Deskripsi</label>
                <textarea
                  id="material_description"
                  name="material_description"
                  value={materialForm.description}
                  onChange={(e) => setMaterialForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Deskripsi singkat tentang materi ini..."
                />
              </div>

              <div>
                <label htmlFor="material_content" className="block text-sm font-medium text-gray-700 mb-2">Konten Materi</label>
                <textarea
                  id="material_content"
                  name="material_content"
                  value={materialForm.content}
                  onChange={(e) => setMaterialForm(prev => ({ ...prev, content: e.target.value }))}
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Isi konten materi di sini..."
                />
              </div>

              <div>
                <label htmlFor="material_file" className="block text-sm font-medium text-gray-700 mb-2">
                  <Upload className="w-4 h-4 inline mr-1" />
                  Upload File (Opsional, max 10MB)
                </label>
                <input
                  id="material_file"
                  name="material_file"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) return;
                    if (!validateLearningAttachment(file)) {
                      e.currentTarget.value = '';
                      return;
                    }
                    setMaterialForm(prev => ({ ...prev, file }));
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="material_published"
                  name="material_published"
                  checked={materialForm.is_published}
                  onChange={(e) => setMaterialForm(prev => ({ ...prev, is_published: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="material_published" className="text-sm font-medium text-gray-700">Publikasikan Langsung</label>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMaterialModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignmentModal && (
        <div className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]" onClick={() => setShowAssignmentModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">
                {editingAssignment ? 'Edit Tugas' : 'Tambah Tugas Baru'}
              </h2>
              <button onClick={() => setShowAssignmentModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignmentSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="assignment_class_subject" className="block text-sm font-medium text-gray-700 mb-2">
                  Kelas & Mata Pelajaran <span className="text-red-500">*</span>
                </label>
                <select
                  id="assignment_class_subject"
                  name="assignment_class_subject"
                  value={assignmentForm.class_id && assignmentForm.subject_id ? 
                    teacherAssignments.find(a => String(a.class.id) === String(assignmentForm.class_id) && String(a.subject.id) === String(assignmentForm.subject_id))?.id || '' 
                    : ''}
                  onChange={(e) => {
                    const assignment = teacherAssignments.find(a => String(a.id) === e.target.value);
                    if (assignment) {
                      setAssignmentForm(prev => ({
                        ...prev,
                        class_id: assignment.class.id,
                        subject_id: assignment.subject.id
                      }));
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Pilih Kelas & Mata Pelajaran</option>
                  {teacherAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.subject.name} - {assignment.class.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="assignment_title" className="block text-sm font-medium text-gray-700 mb-2">
                  Judul Tugas <span className="text-red-500">*</span>
                </label>
                <input
                  id="assignment_title"
                  name="assignment_title"
                  type="text"
                  value={assignmentForm.title}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: Tugas Praktikum 1"
                  required
                />
              </div>

              <div>
                <label htmlFor="assignment_description" className="block text-sm font-medium text-gray-700 mb-2">Deskripsi</label>
                <textarea
                  id="assignment_description"
                  name="assignment_description"
                  value={assignmentForm.description}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Instruksi pengerjaan tugas..."
                />
              </div>

              <div>
                <label htmlFor="assignment_deadline" className="block text-sm font-medium text-gray-700 mb-2">
                  Deadline Pengumpulan <span className="text-red-500">*</span>
                </label>
                <input
                  id="assignment_deadline"
                  name="assignment_deadline"
                  type="datetime-local"
                  value={assignmentForm.deadline_datetime}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, deadline_datetime: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="assignment_max_score" className="block text-sm font-medium text-gray-700 mb-2">
                  Nilai Maksimal
                </label>
                <input
                  id="assignment_max_score"
                  name="assignment_max_score"
                  type="number"
                  value={assignmentForm.max_score}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, max_score: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label htmlFor="assignment_file" className="block text-sm font-medium text-gray-700 mb-2">
                  <Upload className="w-4 h-4 inline mr-1" />
                  Upload File Pendukung (Opsional, max 10MB)
                </label>
                <input
                  id="assignment_file"
                  name="assignment_file"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) return;
                    if (!validateLearningAttachment(file)) {
                      e.currentTarget.value = '';
                      return;
                    }
                    setAssignmentForm(prev => ({ ...prev, file }));
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allow_resubmit"
                    name="allow_resubmit"
                    checked={assignmentForm.allow_resubmit}
                    onChange={(e) => setAssignmentForm(prev => ({ ...prev, allow_resubmit: e.target.checked }))}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="allow_resubmit" className="text-sm font-medium text-gray-700">Izinkan Resubmit</label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="assignment_published"
                    name="assignment_published"
                    checked={assignmentForm.is_published}
                    onChange={(e) => setAssignmentForm(prev => ({ ...prev, is_published: e.target.checked }))}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="assignment_published" className="text-sm font-medium text-gray-700">Publikasikan Langsung</label>
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAssignmentModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Modal */}
      {showCopyModal && (copyingMaterial || copyingAssignment) && (
        <div className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]" onClick={() => setShowCopyModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Salin {copyingMaterial ? 'Materi' : 'Tugas'} ke Kelas Lain
              </h2>
              <button
                onClick={() => setShowCopyModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Salin {copyingMaterial ? 'materi' : 'tugas'} <strong>"{(copyingMaterial || copyingAssignment)?.title}"</strong> ke:
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {teacherAssignments
                    .filter(a => {
                      const item = copyingMaterial || copyingAssignment;
                      if (!item) return false;
                      return (
                        a.subject.id.toString() === item.subject.id.toString() && 
                        a.class.level === item.class.level &&
                        a.class.id.toString() !== item.class.id.toString()
                      );
                    })
                    .map(assignment => (
                      <label key={assignment.id} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          id={`copy_target_${assignment.class.id}`}
                          name="target_classes"
                          checked={selectedCopyClasses.includes(assignment.class.id.toString())}
                          onChange={(e) => {
                            const classId = assignment.class.id.toString();
                            if (e.target.checked) {
                              setSelectedCopyClasses([...selectedCopyClasses, classId]);
                            } else {
                              setSelectedCopyClasses(selectedCopyClasses.filter(id => id !== classId));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm font-medium text-gray-900">
                          {assignment.class.name}
                        </span>
                      </label>
                    ))}
                  
                  {teacherAssignments.filter(a => {
                    const item = copyingMaterial || copyingAssignment;
                    if (!item) return false;
                    return (
                      a.subject.id.toString() === item.subject.id.toString() && 
                      a.class.level === item.class.level &&
                      a.class.id.toString() !== item.class.id.toString()
                    );
                  }).length === 0 && (
                    <p className="text-sm text-gray-500 italic text-center py-4">
                      Tidak ada kelas lain yang setingkat untuk mata pelajaran ini.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={copying}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCopySubmit}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  disabled={copying || selectedCopyClasses.length === 0}
                >
                  {copying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Menyalin...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Salin {copyingMaterial ? 'Materi' : 'Tugas'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
