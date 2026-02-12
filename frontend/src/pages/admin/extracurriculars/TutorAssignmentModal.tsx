import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, Plus, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { extracurricularService, type Extracurricular } from '../../../services/extracurricular.service';
import { userService } from '../../../services/user.service';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';

interface TutorAssignmentModalProps {
  ekskul: Extracurricular;
  onClose: () => void;
  onUpdate?: () => void;
}

export const TutorAssignmentModal = ({ ekskul, onClose, onUpdate }: TutorAssignmentModalProps) => {
  const queryClient = useQueryClient();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedTutorId, setSelectedTutorId] = useState<number | ''>('');

  // 1. Fetch Academic Years
  const { data: academicYearData, isLoading: isLoadingYears } = useQuery({
    queryKey: ['academic-years', 'list'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] = useMemo(
    () => academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData]
  );

  // Set default active academic year
  useEffect(() => {
    if (academicYears.length > 0 && !selectedAcademicYearId) {
      const active = academicYears.find((ay) => ay.isActive);
      if (active) {
        setSelectedAcademicYearId(active.id);
      } else {
        setSelectedAcademicYearId(academicYears[0].id);
      }
    }
  }, [academicYears, selectedAcademicYearId]);

  // 2. Fetch Assignments
  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['extracurricular-assignments', ekskul.id, selectedAcademicYearId],
    queryFn: () => extracurricularService.getAssignments({ 
      ekskulId: ekskul.id, 
      academicYearId: selectedAcademicYearId! 
    }),
    enabled: !!selectedAcademicYearId,
  });

  const assignments = assignmentsData?.data || [];

  // 3. Fetch Potential Tutors
  const { data: tutorsData, isLoading: isLoadingTutors } = useQuery({
    queryKey: ['users', 'tutors'],
    queryFn: () => userService.getAll({ role: 'EXTRACURRICULAR_TUTOR', limit: 100 }),
  });

  const tutors = tutorsData?.data || [];

  // Mutations
  const assignMutation = useMutation({
    mutationFn: extracurricularService.assignTutor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['extracurricular-assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['extracurriculars'] });
      onUpdate?.();
      toast.success('Pembina berhasil ditambahkan');
      setSelectedTutorId('');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menambahkan pembina');
    },
  });

  const removeMutation = useMutation({
    mutationFn: extracurricularService.removeAssignment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['extracurricular-assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['extracurriculars'] });
      onUpdate?.();
      toast.success('Pembina berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menghapus pembina');
    },
  });

  const handleAssign = () => {
    if (!selectedTutorId || !selectedAcademicYearId) return;
    assignMutation.mutate({
      tutorId: Number(selectedTutorId),
      ekskulId: ekskul.id,
      academicYearId: selectedAcademicYearId,
    });
  };

  const isLoading = isLoadingYears || (!!selectedAcademicYearId && isLoadingAssignments) || isLoadingTutors;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-16">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Kelola Pembina</h2>
            <p className="text-gray-500 text-sm mt-1">Ekstrakurikuler: <span className="font-medium text-blue-600">{ekskul.name}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Filter Tahun Ajaran */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tahun Ajaran</label>
            <select
              value={selectedAcademicYearId || ''}
              onChange={(e) => setSelectedAcademicYearId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name} {ay.isActive ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Form Tambah Pembina */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <UserPlus size={16} />
              Tambah Pembina Baru
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <select
                  value={selectedTutorId}
                  onChange={(e) => setSelectedTutorId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">Pilih User (Role: Tutor)</option>
                  {tutors.map((tutor) => (
                    <option key={tutor.id} value={tutor.id}>
                      {tutor.name} ({tutor.username})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAssign}
                disabled={!selectedTutorId || assignMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
              >
                {assignMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Tambah
              </button>
            </div>
          </div>

          {/* Daftar Pembina */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Daftar Pembina Terdaftar</h3>
            
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                Belum ada pembina untuk tahun ajaran ini
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-3">Nama Pembina</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assignments.map((assignment: any) => (
                      <tr key={assignment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {assignment.tutor?.name || '-'}
                          <div className="text-xs text-gray-500 font-normal">{assignment.tutor?.username}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            assignment.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {assignment.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              if (confirm('Hapus pembina ini?')) {
                                removeMutation.mutate(assignment.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus Assignment"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
