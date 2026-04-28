import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, Plus, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { extracurricularService, type Extracurricular } from '../../../services/extracurricular.service';
import { userService } from '../../../services/user.service';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import type { User } from '../../../types/auth';
import { getExtracurricularCategoryLabel } from '../../../features/extracurricular/category';

interface TutorAssignmentModalProps {
  ekskul: Extracurricular;
  onClose: () => void;
  onUpdate?: () => void;
}

type ExtracurricularAssignment = {
  id: number;
  isActive: boolean;
  tutor?: {
    name?: string;
    username?: string;
    role?: string;
  } | null;
};

type AdvisorCandidate = User & {
  advisorSourceLabel: string;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
};

export const TutorAssignmentModal = ({ ekskul, onClose, onUpdate }: TutorAssignmentModalProps) => {
  const queryClient = useQueryClient();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedTutorId, setSelectedTutorId] = useState<number | ''>('');
  const isOsisUnit = String(ekskul.category || '').trim().toUpperCase() === 'OSIS';

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
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  // 2. Fetch Assignments
  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['extracurricular-assignments', ekskul.id, selectedAcademicYearId],
    queryFn: () => extracurricularService.getAssignments({ 
      ekskulId: ekskul.id, 
      academicYearId: selectedAcademicYearId! 
    }),
    enabled: !!selectedAcademicYearId,
  });

  const assignments: ExtracurricularAssignment[] = assignmentsData?.data || [];

  // 3. Fetch Potential Tutors
  const { data: advisorsData, isLoading: isLoadingTutors } = useQuery({
    queryKey: ['extracurricular-advisor-candidates'],
    queryFn: async () => {
      const [teachersResponse, tutorsResponse] = await Promise.all([
        userService.getAll({ role: 'TEACHER', limit: 200 }),
        userService.getAll({ role: 'EXTRACURRICULAR_TUTOR', limit: 200 }),
      ]);

      const merged = [...(teachersResponse?.data || []), ...(tutorsResponse?.data || [])];
      const deduped = new Map<number, AdvisorCandidate>();

      merged.forEach((user) => {
        deduped.set(user.id, {
          ...user,
          advisorSourceLabel:
            String(user.role || '').toUpperCase() === 'TEACHER' ? 'Guru Aktif' : 'Tutor Eksternal',
        });
      });

      return Array.from(deduped.values()).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || '')),
      );
    },
  });

  const advisors = useMemo<AdvisorCandidate[]>(() => advisorsData || [], [advisorsData]);
  const filteredAdvisors = useMemo(() => {
    if (!isOsisUnit) return advisors;
    return advisors.filter((advisor) => {
      const role = String(advisor.role || '').trim().toUpperCase();
      const duties = (advisor.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());
      return role === 'TEACHER' && duties.includes('PEMBINA_OSIS');
    });
  }, [advisors, isOsisUnit]);
  const effectiveSelectedTutorId =
    selectedTutorId && filteredAdvisors.some((advisor) => Number(advisor.id) === Number(selectedTutorId))
      ? selectedTutorId
      : '';

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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menambahkan pembina'));
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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus pembina'));
    },
  });

  const handleAssign = () => {
    if (!effectiveSelectedTutorId || !selectedAcademicYearId) return;
    assignMutation.mutate({
      tutorId: Number(effectiveSelectedTutorId),
      ekskulId: ekskul.id,
      academicYearId: selectedAcademicYearId,
    });
  };

  const isLoading = isLoadingYears || (!!selectedAcademicYearId && isLoadingAssignments) || isLoadingTutors;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/25 p-4 pt-16 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Kelola Pembina</h2>
            <p className="text-gray-500 text-sm mt-1">
              Unit: <span className="font-medium text-blue-600">{ekskul.name}</span>{' '}
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {getExtracurricularCategoryLabel(ekskul.category)}
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {isOsisUnit
                ? 'OSIS hanya dapat ditugaskan ke guru aktif yang sudah memiliki duty Pembina OSIS.'
                : 'Ekskul biasa dapat ditugaskan ke guru aktif atau tutor eksternal.'}
            </p>
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
                  value={effectiveSelectedTutorId}
                  onChange={(e) => setSelectedTutorId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">
                    {isOsisUnit ? 'Pilih guru dengan duty Pembina OSIS' : 'Pilih guru aktif / tutor eksternal'}
                  </option>
                  {filteredAdvisors.map((advisor) => (
                    <option key={advisor.id} value={advisor.id}>
                      {advisor.name} ({advisor.username}) - {advisor.advisorSourceLabel}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAssign}
                disabled={!effectiveSelectedTutorId || assignMutation.isPending}
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
                    {assignments.map((assignment: ExtracurricularAssignment) => (
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
