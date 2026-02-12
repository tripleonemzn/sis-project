import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Check, 
  Users
} from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import type { AcademicYear } from '../../../services/academicYear.service';

// --- Interfaces ---

interface Student {
  id: number;
  name: string;
  nis?: string;
  class?: {
    id: number;
    name: string;
  };
  studentClass?: { // Backend might return studentClass
    name: string;
  };
}

interface Class {
  id: number;
  name: string;
}

interface ExamSitting {
  id: number;
  roomName: string;
  examType: string;
  academicYearId: number;
  semester?: string;
  students: {
    student: Student;
  }[];
  _count?: {
    students: number;
  };
}

// --- Main Page Component ---

const ExamSittingManagementPage = () => {
  // State
  const [sittings, setSittings] = useState<ExamSitting[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false); // New state for details fetching
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'SBTS' | 'SAS' | 'SAT'>('SBTS');
  const [classes, setClasses] = useState<Class[]>([]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSitting, setEditingSitting] = useState<ExamSitting | null>(null);
  
  // View State
  const [viewMode, setViewMode] = useState<'list' | 'manage_students'>('list');

  // Form State
  const [formData, setFormData] = useState({
    roomName: '',
    academicYearId: '',
    semester: 'ODD', // Default semester
  });

  // Student Selection State
  const [currentSittingId, setCurrentSittingId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([]);
  const [allClassStudents, setAllClassStudents] = useState<Student[]>([]);
  // Use Map to store full student objects for selection, enabling cross-class selection before adding
  const [selectedCandidates, setSelectedCandidates] = useState<Map<number, Student>>(new Map());

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [ayRes, classRes] = await Promise.all([
          api.get('/academic-years?limit=100'),
          api.get('/classes?limit=100')
        ]);

        const ays = ayRes.data?.data?.academicYears || ayRes.data?.data || [];
        setAcademicYears(ays);
        
        // Set default active academic year
        const activeAy = ays.find((a: AcademicYear) => a.isActive);
        if (activeAy) setSelectedAcademicYear(activeAy.id.toString());
        else if (ays.length > 0) setSelectedAcademicYear(ays[0].id.toString());
        else setLoading(false);

        setClasses(classRes.data?.data?.classes || []);
      } catch (err: unknown) {
        console.error(err);
        toast.error('Gagal memuat data awal');
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const fetchSittings = useCallback(async () => {
    if (!selectedAcademicYear) return;
    
    setLoading(true);
    try {
      const res = await api.get('/exam-sittings', {
        params: {
          academicYearId: selectedAcademicYear,
          examType: activeTab,
          limit: 100
        }
      });
      // Ensure data is array, default to empty array if null
      setSittings(res.data.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data ruang ujian');
      setSittings([]); // Reset on error
    } finally {
      setLoading(false);
    }
  }, [selectedAcademicYear, activeTab]);

  useEffect(() => {
    if (selectedAcademicYear) {
      fetchSittings();
    } else {
      setLoading(false);
    }
  }, [selectedAcademicYear, activeTab, fetchSittings]);

  const fetchClassStudents = useCallback(async (classId: number) => {
    try {
      const res = await api.get('/users', {
        params: {
          role: 'STUDENT',
          class_id: classId,
          limit: 100
        }
      });
      // Sort alphabetically
      const students = res.data?.data || [];
      students.sort((a: Student, b: Student) => a.name.localeCompare(b.name));
      setAllClassStudents(students);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Gagal memuat siswa');
    }
  }, []);

  // Filter students when assignedStudents or allClassStudents change
  useEffect(() => {
    if (allClassStudents.length > 0) {
      const assignedIds = new Set(assignedStudents.map(s => s.id));
      const available = allClassStudents.filter(s => !assignedIds.has(s.id));
      // Sort available just in case
      available.sort((a, b) => a.name.localeCompare(b.name));
      setAvailableStudents(available);
    } else {
      setAvailableStudents([]);
    }
  }, [allClassStudents, assignedStudents]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassStudents(selectedClassId);
    } else {
      setAllClassStudents([]);
    }
  }, [selectedClassId, fetchClassStudents]);

  // Clean up potential memory leaks or state updates on unmount if needed
  // (React 18 handles this well, but just in case)
  
  const handleCreate = () => {
    setEditingSitting(null);
    setFormData({
      roomName: '',
      academicYearId: selectedAcademicYear || '',
      semester: activeTab === 'SBTS' ? 'ODD' : (activeTab === 'SAT' ? 'EVEN' : 'ODD')
    });
    setShowModal(true);
  };

  const handleEdit = (sitting: ExamSitting) => {
    setEditingSitting(sitting);
    
    setFormData({
      roomName: sitting.roomName,
      academicYearId: sitting.academicYearId?.toString() || selectedAcademicYear || '',
      semester: sitting.semester || 'ODD'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      // Logic: User wants only Room Name and Students in this flow.
      // Time/Date/Proctor are removed.
      
      const payload = {
        roomName: formData.roomName,
        academicYearId: formData.academicYearId,
        examType: activeTab,
        semester: activeTab === 'SBTS' ? formData.semester : undefined, // Only send semester for SBTS
        studentIds: editingSitting ? undefined : [] 
      };

      if (editingSitting) {
        await api.put(`/exam-sittings/${editingSitting.id}`, payload);
        toast.success('Ruang ujian berhasil diperbarui');
      } else {
        await api.post('/exam-sittings', payload);
        toast.success('Ruang ujian berhasil dibuat');
      }
      setShowModal(false);
      fetchSittings();
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus ruang ini?')) return;
    try {
      await api.delete(`/exam-sittings/${id}`);
      toast.success('Ruang dihapus');
      fetchSittings();
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menghapus');
    }
  };

  // Fetch fresh sitting details when opening manage mode
  const fetchSittingDetails = async (id: number) => {
    try {
      setDetailsLoading(true);
      const res = await api.get(`/exam-sittings/${id}`);
      const sitting = res.data.data;
      
      let validStudents: Student[] = [];
      
      if (sitting.students && Array.isArray(sitting.students)) {
        validStudents = sitting.students.map((s: any) => {
          // Robust mapping
          if (s.student && typeof s.student === 'object') return s.student;
          // Direct object (from detail endpoint)
          if (s.id && (s.name || s.username)) return s;
          // Raw query format
          if (s.student_id && s.student_name) {
             return { 
               id: s.student_id, 
               name: s.student_name, 
               nis: s.student_nis, 
               class: { name: s.class_name } 
             };
          }
          return null;
        }).filter((s: Student | null): s is Student => s !== null);
      }
      
      // Remove duplicates just in case
      const uniqueStudents = Array.from(new Map(validStudents.map(s => [s.id, s])).values());
      uniqueStudents.sort((a: Student, b: Student) => a.name.localeCompare(b.name));
      
      setAssignedStudents(uniqueStudents);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat detail ruang');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleManageStudents = (sitting: ExamSitting) => {
    setCurrentSittingId(sitting.id);
    // Initial optimistic set from list
    const initialStudents = sitting.students?.map(s => s.student) || [];
    initialStudents.sort((a, b) => a.name.localeCompare(b.name));
    setAssignedStudents(initialStudents);
    
    // Fetch fresh data to ensure we have all students
    fetchSittingDetails(sitting.id);
    
    setAvailableStudents([]);
    setAllClassStudents([]);
    setSelectedClassId(null);
    setSelectedCandidates(new Map());
    setViewMode('manage_students');
  };

  const handleAddStudents = () => {
    const toAdd = Array.from(selectedCandidates.values());
    if (toAdd.length === 0) return;

    setAssignedStudents(prev => {
      // Create a map of existing students for quick lookup
      const existingMap = new Map(prev.map(s => [s.id, s]));
      
      // Add new students if not already present
      toAdd.forEach(s => {
        if (!existingMap.has(s.id)) {
          existingMap.set(s.id, s);
        }
      });
      
      // Convert back to array and sort
      const updated = Array.from(existingMap.values());
      updated.sort((a, b) => a.name.localeCompare(b.name));
      return updated;
    });

    setSelectedCandidates(new Map());
    toast.success(`${toAdd.length} siswa ditambahkan ke daftar sementara. Jangan lupa Simpan Perubahan.`, {
      duration: 3000,
      icon: '⚠️'
    });
  };

  const toggleCandidate = (student: Student) => {
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      if (newMap.has(student.id)) {
        newMap.delete(student.id);
      } else {
        newMap.set(student.id, student);
      }
      return newMap;
    });
  };

  const toggleAllVisible = () => {
    // Check if all CURRENTLY visible students are selected
    const allVisibleSelected = availableStudents.every(s => selectedCandidates.has(s.id));
    
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      if (allVisibleSelected) {
        // Deselect all visible
        availableStudents.forEach(s => newMap.delete(s.id));
      } else {
        // Select all visible
        availableStudents.forEach(s => newMap.set(s.id, s));
      }
      return newMap;
    });
  };

  const handleRemoveStudent = (studentId: number) => {
    setAssignedStudents(prev => prev.filter(s => s.id !== studentId));
  };

  const saveStudents = async () => {
    if (!currentSittingId) return;
    try {
      await api.put(`/exam-sittings/${currentSittingId}/students`, {
        studentIds: assignedStudents.map(s => s.id)
      });
      toast.success('Daftar siswa diperbarui');
      setViewMode('list');
      fetchSittings();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan siswa');
    }
  };

  if (viewMode === 'manage_students') {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden h-[calc(100vh-7rem)]">
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center shadow-sm flex-none">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              Atur Komposisi Siswa
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Tambahkan siswa ke ruangan ini (bisa lintas kelas/jurusan)
            </p>
          </div>
          <button 
            onClick={() => setViewMode('list')} 
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
            aria-label="Kembali"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row bg-white flex-1 overflow-hidden">
          {/* Left Panel: Source */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-gray-200 bg-white h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex-none">
              <label htmlFor="sourceClass" className="block text-sm font-semibold text-gray-700 mb-2">1. Pilih Kelas Sumber</label>
              <div className="relative">
                <select
                  id="sourceClass"
                  value={selectedClassId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedClassId(val ? Number(val) : null);
                  }}
                  className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 pl-3 pr-10 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 bg-white flex-1 overflow-y-auto min-h-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-700">Daftar Siswa Tersedia</span>
                {availableStudents.length > 0 && (
                  <button
                    onClick={toggleAllVisible}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {availableStudents.every(s => selectedCandidates.has(s.id)) ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                )}
              </div>
              
              <div className="space-y-2">
                {selectedClassId ? (
                  availableStudents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {availableStudents.map(student => (
                        <div 
                          key={student.id} 
                          className={`flex items-start p-3 border rounded-lg cursor-pointer transition-all ${
                            selectedCandidates.has(student.id) 
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          onClick={() => toggleCandidate(student)}
                        >
                          <div className={`w-5 h-5 rounded border mr-3 flex items-center justify-center mt-0.5 ${
                            selectedCandidates.has(student.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                          }`}>
                            {selectedCandidates.has(student.id) && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            <div className="text-xs text-gray-500">{student.nis}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-400 p-6 text-center h-40">
                      <Users size={32} className="mb-2 opacity-50" />
                      <p className="text-sm">Tidak ada siswa tersedia / semua sudah masuk ruang ini.</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 p-6 text-center h-40">
                    <p className="text-sm">Silakan pilih kelas terlebih dahulu.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Target */}
          <div className="w-full md:w-1/2 flex flex-col bg-white border-l border-gray-200 h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-none">
              <label className="block text-sm font-semibold text-gray-700">2. Siswa Terpilih di Ruangan Ini</label>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                Total: {assignedStudents.length}
              </span>
            </div>

            <div className="p-4 bg-white flex-1 overflow-y-auto min-h-0">
                {detailsLoading ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                    <p className="text-sm text-gray-500">Memuat siswa...</p>
                  </div>
                ) : assignedStudents.length > 0 ? (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                    {assignedStudents.map((student, idx) => (
                      <div key={student.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-gray-400 w-6">{idx + 1}.</span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            <div className="text-xs text-gray-500">
                              {student.nis} {student.studentClass?.name ? `• ${student.studentClass.name}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveStudent(student.id)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          title="Hapus dari ruangan"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 p-6 text-center h-40">
                    <Users size={32} className="mb-2 opacity-50" />
                    <p className="text-sm">Belum ada siswa di ruangan ini</p>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex-none z-20">
          <button
            onClick={handleAddStudents}
            disabled={selectedCandidates.size === 0}
            className={`px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-all mr-auto ${
              selectedCandidates.size > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Plus size={18} />
            Tambahkan {selectedCandidates.size > 0 ? `(${selectedCandidates.size})` : ''} Siswa
          </button>
          
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={saveStudents}
            className="px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            <Check size={18} />
            Simpan Perubahan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header & Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kelola Ruang Ujian</h1>
            <p className="text-gray-500 text-sm mt-1">Buat ruang ujian dan atur komposisi siswa (lintas kelas)</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={18} />
              Buat Ruang
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit mt-6">
          {(['SBTS', 'SAS', 'SAT'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Memuat data...</p>
          </div>
        ) : sittings.length === 0 ? (
          <div className="text-center py-12 bg-gray-50">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Belum ada ruang ujian</h3>
            <p className="text-gray-500">Mulai dengan membuat ruang baru.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NAMA RUANG</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">JUMLAH SISWA</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">AKSI</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sittings.map((sitting) => (
                  <tr key={sitting.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sitting.roomName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Users size={16} className="mr-2" />
                        {sitting._count?.students ?? sitting.students?.length ?? 0} Siswa
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(sitting)}
                          className="text-yellow-600 hover:text-yellow-800 bg-yellow-50 hover:bg-yellow-100 p-1.5 rounded transition-colors"
                          title="Edit Ruang"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleManageStudents(sitting)}
                          className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        >
                          Atur Siswa
                        </button>
                        <button
                          onClick={() => handleDelete(sitting.id)}
                          className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 p-1.5 rounded transition-colors"
                          title="Hapus Ruang"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingSitting ? 'Edit Ruang Ujian' : 'Buat Ruang Ujian Baru'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              {/* Academic Year - Only visible if creating new or if backend supports editing it */}
              <div>
                <label htmlFor="academicYearId" className="block text-sm font-medium text-gray-700 mb-1">Tahun Ajaran</label>
                <select
                  id="academicYearId"
                  value={formData.academicYearId}
                  onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Pilih Tahun Ajaran</option>
                  {academicYears.map(ay => (
                    <option key={ay.id} value={ay.id.toString()}>{ay.name} ({ay.isActive ? 'Aktif' : 'Tidak Aktif'})</option>
                  ))}
                </select>
              </div>

              {/* Semester - Only visible if Tab is SBTS */}
              {activeTab === 'SBTS' && (
                <div>
                  <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                  <select
                    id="semester"
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="roomName" className="block text-sm font-medium text-gray-700 mb-1">Nama Ruang</label>
                <input
                  id="roomName"
                  type="text"
                  value={formData.roomName}
                  onChange={(e) => setFormData({ ...formData, roomName: e.target.value })}
                  placeholder="Contoh: R.01 atau Lab Komputer 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ExamSittingManagementPage;
