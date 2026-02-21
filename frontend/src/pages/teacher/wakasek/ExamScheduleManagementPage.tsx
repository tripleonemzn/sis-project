import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calendar,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import type { AcademicYear } from '../../../services/academicYear.service';

interface Subject {
  id: number;
  name: string;
  code: string;
}

interface ClassData {
  id: number;
  name: string;
}

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  examType: string;
  academicYearId?: number;
  subject?: {
    id: number;
    name: string;
    code: string;
  };
  packet?: {
    title: string;
    type: string;
    duration: number;
    subject: {
      name: string;
    };
  };
  class: {
    name: string;
  };
  proctor?: {
    name: string;
  };
}

interface GroupedExamSchedule {
  key: string;
  subjectName: string;
  subjectCode: string;
  startTime: string;
  endTime: string;
  schedules: ExamSchedule[];
  totalClasses: number;
  readyCount: number;
}

const ExamScheduleManagementPage = () => {
  const [activeTab, setActiveTab] = useState<'SBTS' | 'SAS' | 'SAT'>('SBTS');
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Form Data
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [proctors, setProctors] = useState<{ id: number; name: string }[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  // selectedAcademicYear used for filtering list (default to active)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  
  const [formData, setFormData] = useState({
    subjectId: '',
    classIds: [] as string[],
    proctorId: '',
    date: '',
    startTime: '',
    endTime: '',
    academicYearId: '',
    semester: ''
  });

  const [submitting, setSubmitting] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const response = await api.get('/academic-years?limit=100');
      const ayData = response.data?.data?.academicYears || response.data?.data || ([] as AcademicYear[]);
      setAcademicYears(ayData);
      
      // Set default selected academic year (active one)
      const activeAy = ayData.find((ay: AcademicYear) => ay.isActive);
      if (activeAy) {
        setSelectedAcademicYear(activeAy.id.toString());
      } else if (ayData.length > 0) {
        setSelectedAcademicYear(ayData[0].id.toString());
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const fetchSchedules = useCallback(async () => {
    // If no AY is selected (not loaded yet), don't fetch
    if (!selectedAcademicYear) return;

    setLoading(true);
    try {
      const res = await api.get('/exams/schedules', {
        params: {
          examType: activeTab,
          academicYearId: selectedAcademicYear
        }
      });
      setSchedules(res.data.data);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat jadwal ujian');
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedAcademicYear]);

  const fetchFormData = useCallback(async () => {
    try {
      // Fetch subjects instead of packets
      // Fetch classes with high limit to ensure all are shown
      // Academic years already fetched in initial data, but we can ensure they are up to date
      const [subjectsRes, classesRes, proctorsRes] = await Promise.all([
        api.get('/subjects?limit=1000'), 
        api.get('/classes?limit=1000'),
        api.get('/users?role=TEACHER&limit=1000')
      ]);

      setSubjects(subjectsRes.data?.data?.subjects || subjectsRes.data?.data || []);
      
      // Handle potential different response structures for classes
      const classesData = classesRes.data?.data;
      setClasses(Array.isArray(classesData) ? classesData : classesData?.classes || []);

      // Handle proctors
      const proctorsData = proctorsRes.data?.data?.users || proctorsRes.data?.data || [];
      setProctors(proctorsData.map((u: any) => ({ id: u.id, name: u.name || u.username })));

      // Set default form academic year to selected one or active
      if (!formData.academicYearId && selectedAcademicYear) {
        setFormData(prev => ({
          ...prev,
          academicYearId: selectedAcademicYear
        }));
      }

    } catch (error) {
      console.error('Error fetching form data:', error);
      toast.error('Gagal memuat data form');
      setSubjects([]);
      setClasses([]);
    }
  }, [formData.academicYearId, selectedAcademicYear]);

  useEffect(() => {
    if (selectedAcademicYear) {
      fetchSchedules();
    }
  }, [fetchSchedules, selectedAcademicYear]);

  // Auto-set Semester & Academic Year when Modal opens
  useEffect(() => {
    if (showModal) {
      const activeAy = academicYears.find((ay: AcademicYear) => ay.isActive);
      const defaultAyId = activeAy ? activeAy.id.toString() : (academicYears[0]?.id.toString() || '');
      
      let defaultSemester = formData.semester;
      if (activeTab === 'SAS') defaultSemester = 'ODD';
      else if (activeTab === 'SAT') defaultSemester = 'EVEN';
      // For SBTS, keep existing selection or default to empty

      setFormData(prev => ({
        ...prev,
        academicYearId: prev.academicYearId || defaultAyId,
        semester: defaultSemester
      }));
    }
  }, [showModal, activeTab, academicYears, formData.semester]);

  useEffect(() => {
    if (showModal) {
      fetchFormData();
    }
  }, [showModal, fetchFormData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.subjectId || !formData.date || !formData.startTime || !formData.endTime || formData.classIds.length === 0 || !formData.academicYearId) {
      toast.error('Mohon lengkapi semua field yang wajib diisi');
      return;
    }
    
    setSubmitting(true);
    try {
      // 1. Create Exam Schedule entries for each selected class
      // Note: We are creating schedules directly. The backend will likely need to handle this.
      // Since we don't have a direct "create schedule" endpoint that takes multiple classes documented in memory,
      // I'll assume we might need to iterate or send a bulk create request.
      // Or, we might need to create a Packet first if the system requires it? 
      // The user instruction implies we are just scheduling.
      // Let's assume the /exam-schedules endpoint handles creation.
      
      const payload = {
        subjectId: parseInt(formData.subjectId, 10),
        classIds: formData.classIds.map(id => parseInt(id, 10)),
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        examType: activeTab,
        academicYearId: parseInt(formData.academicYearId, 10),
        semester: activeTab === 'SBTS' ? formData.semester : undefined,
        proctorId: formData.proctorId ? parseInt(formData.proctorId, 10) : undefined
      };

      await api.post('/exams/schedules', payload);
      
      toast.success('Jadwal ujian berhasil dibuat');
      setShowModal(false);
      fetchSchedules();
      
      // Reset form
      setFormData(prev => ({
        ...prev,
        subjectId: '',
        classIds: [],
        date: '',
        startTime: '',
        endTime: '',
        // Keep AY/Semester as they might add more for same period
      }));
    } catch (err: unknown) {
      console.error(err);
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan jadwal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return;
    
    try {
      await api.delete(`/exams/schedules/${id}`);
      toast.success('Jadwal berhasil dihapus');
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      toast.error(error.response?.data?.message || 'Gagal menghapus jadwal');
    }
  };

  const toggleClassSelection = (classId: string) => {
    setFormData(prev => {
      const current = prev.classIds;
      if (current.includes(classId)) {
        return { ...prev, classIds: current.filter(id => id !== classId) };
      } else {
        return { ...prev, classIds: [...current, classId] };
      }
    });
  };

  const toggleAllClasses = (checked: boolean) => {
    if (checked) {
      setFormData(prev => ({ ...prev, classIds: classes.map(c => c.id.toString()) }));
    } else {
      setFormData(prev => ({ ...prev, classIds: [] }));
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const getGroupedSchedules = (): GroupedExamSchedule[] => {
    const groups: Record<string, GroupedExamSchedule> = {};

    schedules.forEach(schedule => {
      const subjectId = schedule.subject?.id || schedule.subject?.name || 'unknown';
      const timeKey = `${schedule.startTime}-${schedule.endTime}`;
      const key = `${subjectId}-${timeKey}`;

      if (!groups[key]) {
        groups[key] = {
          key,
          subjectName: schedule.subject?.name || schedule.packet?.subject?.name || (schedule.packet ? 'Unknown Subject' : 'Jadwal Tanpa Soal'),
          subjectCode: schedule.subject?.code || '-',
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          schedules: [],
          totalClasses: 0,
          readyCount: 0
        };
      }

      groups[key].schedules.push(schedule);
      groups[key].totalClasses++;
      if (schedule.packet) {
        groups[key].readyCount++;
      }
    });

    // Sort by startTime
    return Object.values(groups).sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  };

  const groupedSchedules = getGroupedSchedules();

  return (
    <div className="w-full space-y-6">
      {/* Header & Filters - Removed Academic Year Dropdown */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Kelola Jadwal Ujian</h1>
            <p className="text-sm text-gray-500 mt-1">Atur jadwal pelaksanaan ujian</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             {/* Dropdown removed */}

            <button 
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={18} />
              <span>Buat Jadwal</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mt-6">
          <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
            {(['SBTS', 'SAS', 'SAT'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-md transition-colors
                  ${activeTab === tab
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                `}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Schedule List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat jadwal...</div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Belum ada jadwal {activeTab}</h3>
            <p className="text-gray-500">Buat jadwal baru untuk memulai</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-6 py-3"></th>
                  <th className="px-6 py-3 font-semibold text-gray-900">WAKTU PELAKSANAAN</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">MATA PELAJARAN</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">TOTAL KELAS</th>
                  <th className="px-6 py-3 font-semibold text-gray-900">STATUS SOAL</th>
                  <th className="px-6 py-3 font-semibold text-gray-900 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {groupedSchedules.map((group) => {
                  const isExpanded = expandedGroups.includes(group.key);
                  const isAllReady = group.readyCount === group.totalClasses;
                  const isNoneReady = group.readyCount === 0;

                  return (
                    <React.Fragment key={group.key}>
                      <tr 
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <td className="px-6 py-4">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {format(new Date(group.startTime), 'EEEE, d MMMM yyyy', { locale: id })}
                          </div>
                          <div className="text-gray-500 text-xs flex items-center mt-1">
                            <Clock className="w-3 h-3 mr-1" />
                            {format(new Date(group.startTime), 'HH:mm')} - {format(new Date(group.endTime), 'HH:mm')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {group.subjectName}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {group.subjectCode}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {group.totalClasses} Kelas
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isAllReady ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : isNoneReady ? (
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-orange-500" />
                            )}
                            <span className={`text-sm font-medium ${
                              isAllReady ? 'text-green-700' : 
                              isNoneReady ? 'text-red-700' : 'text-orange-700'
                            }`}>
                              {group.readyCount}/{group.totalClasses} Siap
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if(confirm(`Hapus semua jadwal ${group.subjectName}?`)) {
                                Promise.all(group.schedules.map(s => api.delete(`/exams/schedules/${s.id}`)))
                                  .then(() => {
                                    toast.success('Semua jadwal berhasil dihapus');
                                    setSchedules(prev => prev.filter(s => !group.schedules.find(gs => gs.id === s.id)));
                                  })
                                  .catch(() => toast.error('Gagal menghapus beberapa jadwal'));
                              }
                            }}
                            className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus Semua Jadwal Grup Ini"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-0 py-0 border-t-0 bg-gray-50/50">
                            <div className="px-6 py-4 border-l-4 border-blue-500 ml-6 my-2">
                              <h4 className="text-sm font-semibold text-gray-900 mb-3">Detail Jadwal per Kelas</h4>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium text-gray-700">Kelas</th>
                                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status Soal</th>
                                      <th className="px-4 py-2 text-right font-medium text-gray-700">Aksi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {group.schedules
                                      .sort((a, b) => a.class.name.localeCompare(b.class.name))
                                      .map(schedule => (
                                      <tr key={schedule.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-900">
                                          {schedule.class.name}
                                        </td>
                                        <td className="px-4 py-2">
                                          {schedule.packet ? (
                                            <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
                                              Tersedia: {schedule.packet.title}
                                            </span>
                                          ) : (
                                            <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs font-medium">
                                              Menunggu Guru
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <button 
                                            onClick={() => handleDelete(schedule.id)}
                                            className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"
                                            title="Hapus Jadwal"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Buat Jadwal Ujian {activeTab}</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Academic Year - Only visible when creating */}
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
                <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700 mb-1.5">Mata Pelajaran</label>
                <div className="relative">
                  <select
                    id="subjectId"
                    value={formData.subjectId}
                    onChange={e => setFormData({...formData, subjectId: e.target.value})}
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none"
                  >
                    <option value="">Pilih Mata Pelajaran...</option>
                    {subjects.map(subject => (
                      <option key={subject.id} value={subject.id.toString()}>
                        {subject.name} ({subject.code})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              {/* Class Selection */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Pilih Kelas <span className="text-red-500">*</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 font-medium select-none">
                    <input
                      type="checkbox"
                      checked={classes.length > 0 && formData.classIds.length === classes.length}
                      onChange={(e) => toggleAllClasses(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Pilih Semua
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {classes.map((cls) => (
                    <label key={cls.id} htmlFor={`class-${cls.id}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded select-none">
                      <input
                        id={`class-${cls.id}`}
                        name="classIds"
                        type="checkbox"
                        checked={formData.classIds.includes(cls.id.toString())}
                        onChange={() => toggleClassSelection(cls.id.toString())}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {cls.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.classIds.length} kelas dipilih.
                </p>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-2">
                    Jam Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="startTime"
                    name="startTime"
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-2">
                    Jam Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="endTime"
                    name="endTime"
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Proctor Selection (Added per user request) */}
                <div className="col-span-2">
                  <label htmlFor="proctorId" className="block text-sm font-medium text-gray-700 mb-1">Pengawas (Opsional)</label>
                  <select
                    id="proctorId"
                    value={formData.proctorId}
                    onChange={(e) => setFormData({ ...formData, proctorId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Pilih Pengawas --</option>
                    {proctors.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Anda juga dapat mengatur pengawas nanti di menu "Kelola Jadwal Mengawas"</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamScheduleManagementPage;
