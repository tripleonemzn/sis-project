import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';

interface HomeroomExtracurricularsPageProps {
  classId: number;
  academicYearId?: number;
  semester: 'ODD' | 'EVEN' | '';
  reportType?: string;
  programCode?: string;
}

interface StudentAchievement {
  id: number;
  name: string;
  rank: string;
  level: string;
  year: number;
}

interface StudentExtracurricularEnrollment {
  id: number;
  ekskulName: string;
  grade: string;
  description: string;
}

interface StudentOrganizationEnrollment {
  sourceType: 'OSIS';
  name: string;
  positionName?: string | null;
  divisionName?: string | null;
  grade: string;
  description: string;
}

interface StudentExtracurricular {
  id: number;
  name: string;
  nis: string;
  nisn: string;
  attendance: {
    s: number;
    i: number;
    a: number;
  };
  extracurriculars: StudentExtracurricularEnrollment[];
  organizations: StudentOrganizationEnrollment[];
  achievements: StudentAchievement[];
  catatan: string;
}

const ExtracurricularRow = ({
  enrollment,
}: {
  enrollment: StudentExtracurricularEnrollment;
}) => {
  return (
    <div className="flex gap-2 mb-2 items-start last:mb-0">
      <div className="w-1/3 text-sm py-2 px-2 bg-gray-50 rounded border border-gray-100">
        {enrollment.ekskulName}
      </div>
      <div className="w-1/6">
        <div className="w-full text-sm border border-gray-200 bg-gray-50 rounded-md py-1.5 px-2 text-center font-medium text-gray-700 min-h-[38px] flex items-center justify-center">
          {enrollment.grade || '-'}
        </div>
      </div>
      <div className="w-1/2">
        <div className="w-full text-sm border border-gray-200 bg-gray-50 rounded-md min-h-[38px] py-1.5 px-2 text-gray-700">
          {enrollment.description || '-'}
        </div>
      </div>
    </div>
  );
};

const OrganizationRow = ({
  enrollment,
}: {
  enrollment: StudentOrganizationEnrollment;
}) => {
  const roleLabel = [enrollment.positionName, enrollment.divisionName].filter(Boolean).join(' • ');

  return (
    <div className="flex gap-2 mb-2 items-start last:mb-0">
      <div className="w-1/3 text-sm py-2 px-2 bg-violet-50 rounded border border-violet-100">
        <div className="font-medium text-violet-900">{enrollment.name}</div>
        <div className="text-xs text-violet-700">{roleLabel || 'Pengurus OSIS'}</div>
      </div>
      <div className="w-1/6">
        <div className="w-full text-sm border border-gray-200 bg-gray-50 rounded-md py-1.5 px-2 text-center font-medium text-gray-700 min-h-[38px] flex items-center justify-center">
          {enrollment.grade || '-'}
        </div>
      </div>
      <div className="w-1/2">
        <div className="w-full text-sm border border-gray-200 bg-gray-50 rounded-md min-h-[38px] py-1.5 px-2 text-gray-700">
          {enrollment.description || '-'}
        </div>
      </div>
    </div>
  );
};

const StudentRow = ({ 
  student, 
  index, 
  onSaveNote,
  onAddAchievement,
  onDeleteAchievement
}: { 
  student: StudentExtracurricular; 
  index: number;
  onSaveNote: (studentId: number, note: string) => void;
  onAddAchievement: (studentId: number) => void;
  onDeleteAchievement: (achievementId: number) => void;
}) => {
  const [catatan, setCatatan] = useState(student.catatan);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCatatan(student.catatan);
  }, [student.catatan]);

  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="px-4 py-2 text-center border-r border-gray-200 text-gray-500">
        {index + 1}
      </td>
      <td className="px-4 py-2 text-center border-r border-gray-200">
        <div className="text-sm font-medium text-gray-900">{student.nisn || '-'}</div>
        <div className="text-xs text-gray-500">{student.nis || '-'}</div>
      </td>
      <td className="px-4 py-2 border-r border-gray-200 font-medium text-gray-900 text-left">
        {student.name}
      </td>
      {/* Kehadiran */}
      <td className="px-2 py-2 text-center border-r border-gray-200 text-sm">
        {student.attendance.s}
      </td>
      <td className="px-2 py-2 text-center border-r border-gray-200 text-sm">
        {student.attendance.i}
      </td>
      <td className="px-2 py-2 text-center border-r border-gray-200 text-sm">
        {student.attendance.a}
      </td>
      
      {/* Aktivitas Non Akademik */}
      <td className="px-4 py-2 border-r border-gray-200 min-w-[300px]">
        {student.extracurriculars.length > 0 || student.organizations.length > 0 ? (
          <div className="space-y-1">
            <div className="flex gap-2 text-xs font-semibold text-gray-500 mb-0.5">
              <div className="w-1/3">Nama</div>
              <div className="w-1/6 text-center">Nilai</div>
              <div className="w-1/2">Deskripsi</div>
            </div>
            {student.extracurriculars.length > 0 ? (
              <>
                <div className="pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-500">Ekstrakurikuler</div>
                {student.extracurriculars.map((enrollment) => (
                  <ExtracurricularRow
                    key={enrollment.id}
                    enrollment={enrollment}
                  />
                ))}
              </>
            ) : null}
            {student.organizations.length > 0 ? (
              <>
                <div className="pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">OSIS</div>
                {student.organizations.map((organization, idx) => (
                  <OrganizationRow
                    key={`${organization.sourceType}-${organization.positionName || 'member'}-${idx}`}
                    enrollment={organization}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : (
          <div className="text-gray-400 text-sm italic text-center py-2">Tidak ada aktivitas non-akademik</div>
        )}
      </td>

      {/* Prestasi */}
      <td className="px-4 py-2 border-r border-gray-200 min-w-[200px]">
        <div className="space-y-1.5">
          {student.achievements && student.achievements.length > 0 && (
            <div className="space-y-1.5">
              {student.achievements.map((ach) => (
                <div key={ach.id} className="bg-blue-50 p-2 rounded border border-blue-100 text-sm relative group">
                  <div className="font-medium text-blue-900">{ach.name}</div>
                  <div className="text-xs text-blue-700">
                    Juara {ach.rank} • Tingkat {ach.level} • {ach.year}
                  </div>
                  <button 
                    onClick={() => onDeleteAchievement(ach.id)}
                    className="absolute top-1 right-1 p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Hapus Prestasi"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => onAddAchievement(student.id)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors w-full justify-center"
          >
            <Plus className="w-3 h-3" />
            Tambah Prestasi
          </button>
        </div>
      </td>

      {/* Catatan */}
      <td className="px-4 py-2">
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          onBlur={() => {
            if (catatan !== student.catatan) {
              onSaveNote(student.id, catatan);
            }
          }}
          className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[40px]"
          rows={2}
          placeholder="Tulis catatan wali kelas..."
        />
      </td>
    </tr>
  );
};

export const HomeroomExtracurricularsPage = ({
  classId,
  academicYearId,
  semester,
  reportType = '',
  programCode,
}: HomeroomExtracurricularsPageProps) => {
  const queryClient = useQueryClient();
  const [isAchievementModalOpen, setIsAchievementModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const normalizedReportType = String(reportType || '').toUpperCase();
  const extracurricularQueryKey = [
    'extracurricular-report',
    classId,
    academicYearId || null,
    semester,
    normalizedReportType,
    String(programCode || ''),
  ];
  
  // Achievement Form State
  const [achName, setAchName] = useState('');
  const [achRank, setAchRank] = useState('');
  const [achLevel, setAchLevel] = useState('');
  const [achYear, setAchYear] = useState(new Date().getFullYear());

  const { data: students, isLoading } = useQuery<StudentExtracurricular[]>({
    queryKey: extracurricularQueryKey,
    queryFn: async () => {
      if (!classId || !semester) return [];
      const res = await api.get('/reports/extracurricular', {
        params: {
          classId,
          ...(academicYearId ? { academicYearId } : {}),
          semester,
          ...(programCode ? { programCode } : {}),
          ...(!programCode && normalizedReportType ? { reportType: normalizedReportType } : {}),
        },
      });
      return res.data.data;
    },
    enabled: !!classId && !!semester
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ studentId, note }: { studentId: number, note: string }) => {
      await api.post('/reports/notes', { studentId, semester, type: 'CATATAN_WALI_KELAS', note });
    },
    onSuccess: () => {
      toast.success('Catatan disimpan', { id: 'autosave-note', duration: 2000 });
      queryClient.invalidateQueries({ queryKey: extracurricularQueryKey });
    },
    onError: () => toast.error('Gagal menyimpan catatan')
  });

  const createAchievementMutation = useMutation({
    mutationFn: async ({ studentId, name, rank, level, year }: { studentId: number, name: string, rank: string, level: string, year: number }) => {
      await api.post('/reports/achievement', { studentId, name, rank, level, year });
    },
    onSuccess: () => {
      toast.success('Prestasi berhasil ditambahkan');
      closeAchievementModal();
      queryClient.invalidateQueries({ queryKey: extracurricularQueryKey });
    },
    onError: () => toast.error('Gagal menambah prestasi')
  });

  const deleteAchievementMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/reports/achievement/${id}`);
    },
    onSuccess: () => {
      toast.success('Prestasi dihapus');
      queryClient.invalidateQueries({ queryKey: extracurricularQueryKey });
    },
    onError: () => toast.error('Gagal menghapus prestasi')
  });

  const handleSaveNote = (studentId: number, note: string) => {
    updateNoteMutation.mutate({ studentId, note });
  };

  const handleAddAchievement = (studentId: number) => {
    setSelectedStudentId(studentId);
    setAchName('');
    setAchRank('');
    setAchLevel('');
    setAchYear(new Date().getFullYear());
    setIsAchievementModalOpen(true);
  };

  const handleDeleteAchievement = (id: number) => {
    if (confirm('Apakah Anda yakin ingin menghapus prestasi ini?')) {
      deleteAchievementMutation.mutate(id);
    }
  };

  const submitAchievement = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentId && achName && achRank && achLevel) {
      createAchievementMutation.mutate({
        studentId: selectedStudentId,
        name: achName,
        rank: achRank,
        level: achLevel,
        year: achYear
      });
    }
  };

  const closeAchievementModal = () => {
    setIsAchievementModalOpen(false);
    setSelectedStudentId(null);
  };

  if (!semester) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <p className="text-blue-700 font-medium">Silakan pilih semester terlebih dahulu untuk menampilkan data non-akademik.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!students || students.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        Belum ada data siswa.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        Nilai dan deskripsi ekskul maupun OSIS diinput oleh pembina masing-masing, lalu otomatis
        tampil di tab wali kelas ini. Prestasi dapat ditambahkan oleh pembina ekskul dari modul
        pembina atau oleh wali kelas bila diperlukan.
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 border-r border-gray-200 w-[50px] text-center" rowSpan={2}>
                  NO
                </th>
                <th className="px-4 py-3 border-r border-gray-200 w-[150px] text-center" rowSpan={2}>
                  NISN/NIS
                </th>
                <th className="px-4 py-3 border-r border-gray-200 w-[250px] text-center" rowSpan={2}>
                  NAMA SISWA
                </th>
                <th className="px-0 py-3 border-r border-gray-200 w-[150px] text-center" colSpan={3}>
                  KEHADIRAN
                </th>
                <th className="px-4 py-3 border-r border-gray-200 min-w-[300px] text-center" rowSpan={2}>
                  AKTIVITAS NON AKADEMIK
                </th>
                <th className="px-4 py-3 border-r border-gray-200 min-w-[200px] text-center" rowSpan={2}>
                  PRESTASI
                </th>
                <th className="px-4 py-3 min-w-[200px] text-center" rowSpan={2}>
                  CATATAN WALI KELAS
                </th>
              </tr>
              <tr className="border-t border-gray-200">
                <th className="px-2 py-2 text-center border-r border-gray-200 w-[50px]">S</th>
                <th className="px-2 py-2 text-center border-r border-gray-200 w-[50px]">I</th>
                <th className="px-2 py-2 text-center border-r border-gray-200 w-[50px]">A</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {students.map((student, index) => (
                <StudentRow 
                  key={student.id} 
                  student={student} 
                  index={index} 
                  onSaveNote={handleSaveNote}
                  onAddAchievement={handleAddAchievement}
                  onDeleteAchievement={handleDeleteAchievement}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Achievement Modal */}
      {isAchievementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">Tambah Prestasi</h3>
              <button onClick={closeAchievementModal} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitAchievement} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kegiatan/Kejuaraan</label>
                <input
                  type="text"
                  required
                  value={achName}
                  onChange={(e) => setAchName(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  placeholder="Contoh: Lomba Matematika Nasional"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Juara Ke-</label>
                  <input
                    type="text"
                    required
                    value={achRank}
                    onChange={(e) => setAchRank(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    placeholder="Contoh: 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat</label>
                  <select
                    value={achLevel}
                    onChange={(e) => setAchLevel(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    required
                  >
                    <option value="">Pilih Tingkat</option>
                    <option value="Sekolah">Sekolah</option>
                    <option value="Kecamatan">Kecamatan</option>
                    <option value="Kabupaten/Kota">Kabupaten/Kota</option>
                    <option value="Provinsi">Provinsi</option>
                    <option value="Nasional">Nasional</option>
                    <option value="Internasional">Internasional</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tahun</label>
                <input
                  type="number"
                  required
                  value={achYear}
                  onChange={(e) => setAchYear(parseInt(e.target.value))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={closeAchievementModal}
                  className="mr-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createAchievementMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center"
                >
                  {createAchievementMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
