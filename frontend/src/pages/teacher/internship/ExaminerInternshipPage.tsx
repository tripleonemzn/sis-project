import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { internshipService } from '../../../services/internship.service';
import { 
  Users, 
  FileText, 
  Clock, 
  MapPin, 
  Calendar, 
  Award,
  Loader2,
  Save,
  XCircle,
  Building2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Internship {
  id: number;
  student: {
    name: string;
    nis: string;
  };
  companyName: string;
  defenseDate: string | null;
  defenseRoom: string | null;
  reportUrl: string | null;
  status: string;
  defenseScore: number | null;
  defenseNotes: string | null;
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
}

const ExaminerInternshipPage = () => {
  const queryClient = useQueryClient();
  const [selectedInternship, setSelectedInternship] = useState<Internship | null>(null);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [defenseScore, setDefenseScore] = useState('');
  const [defenseNotes, setDefenseNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['examiner-internships'],
    queryFn: () => internshipService.getExaminerInternships()
  });

  const gradeDefenseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { score: number; notes: string } }) => 
      internshipService.gradeDefense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examiner-internships'] });
      toast.success('Nilai sidang berhasil disimpan');
      setIsGradeModalOpen(false);
      setDefenseScore('');
      setDefenseNotes('');
    },
    onError: (error: unknown) => {
      const err = error as ApiError;
      toast.error(err.response?.data?.message || 'Gagal menyimpan nilai');
    }
  });

  const handleGrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInternship) return;
    
    gradeDefenseMutation.mutate({
      id: selectedInternship.id,
      data: {
        score: parseFloat(defenseScore),
        notes: defenseNotes
      }
    });
  };

  const openGradeModal = (internship: Internship) => {
    setSelectedInternship(internship);
    setDefenseScore(internship.defenseScore?.toString() || '');
    setDefenseNotes(internship.defenseNotes || '');
    setIsGradeModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DEFENSE_SCHEDULED':
        return <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-full">Jadwal Sidang</span>;
      case 'DEFENSE_COMPLETED':
        return <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">Sidang Selesai</span>;
      case 'REPORT_SUBMITTED':
        return <span className="px-2 py-1 text-xs font-medium bg-teal-100 text-teal-800 rounded-full">Laporan Masuk</span>;
      case 'COMPLETED':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Selesai</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>;
    }
  };

  if (isLoading) return <div className="p-6">Loading...</div>;

  const internships = data?.data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title font-bold text-gray-800">Pengujian Sidang PKL</h1>
        <p className="text-gray-500">Daftar siswa yang harus diuji dalam sidang PKL</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {internships.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Belum ada jadwal pengujian sidang.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempat PKL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jadwal Sidang</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Laporan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {internships.map((internship: Internship) => (
                  <tr key={internship.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {internship.student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{internship.student.name}</div>
                          <div className="text-xs text-gray-500">{internship.student.nis}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-gray-400" />
                        {internship.companyName}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {internship.defenseDate ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm text-gray-900">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {new Date(internship.defenseDate).toLocaleDateString('id-ID')}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {new Date(internship.defenseDate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" />
                            {internship.defenseRoom}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Belum dijadwalkan</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {internship.reportUrl ? (
                        <a 
                          href={internship.reportUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                        >
                          <FileText className="w-4 h-4" />
                          Lihat
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Belum ada</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(internship.status)}
                      {internship.defenseScore !== null && (
                         <div className="text-xs font-bold text-green-600 mt-1">
                           Nilai: {internship.defenseScore}
                         </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openGradeModal(internship)}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition-colors inline-flex items-center gap-1"
                      >
                        <Award className="w-3 h-3" />
                        Input Nilai
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grade Modal */}
      {isGradeModalOpen && selectedInternship && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Penilaian Sidang PKL</h3>
                <button onClick={() => setIsGradeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <p className="text-sm"><span className="font-medium">Siswa:</span> {selectedInternship.student.name}</p>
                <p className="text-sm"><span className="font-medium">Tempat PKL:</span> {selectedInternship.companyName}</p>
                <p className="text-sm">
                  <span className="font-medium">Jadwal:</span>{' '}
                  {selectedInternship.defenseDate
                    ? new Date(selectedInternship.defenseDate).toLocaleString('id-ID')
                    : '-'}
                </p>
              </div>

              <form onSubmit={handleGrade} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nilai Sidang (0-100) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={defenseScore}
                    onChange={(e) => setDefenseScore(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Catatan Penguji
                  </label>
                  <textarea
                    value={defenseNotes}
                    onChange={(e) => setDefenseNotes(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    placeholder="Masukkan catatan atau revisi..."
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={gradeDefenseMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {gradeDefenseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Nilai
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExaminerInternshipPage;
