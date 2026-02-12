import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { ukkSchemeService } from '../../services/ukkScheme.service';
import { internshipService } from '../../services/internship.service';
import { Link } from 'react-router-dom';
import { Loader2, ClipboardList, CheckCircle, Calendar, User, MapPin, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { User as UserType } from '../../types/auth';

export const ExaminerDashboard = () => {
  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: any, activeYear: any }>() || {};

  // Get Current User via Query (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const apiUser = authData?.data;
  const user = (contextUser as UserType) || (apiUser as UserType) || {};
  const queryClient = useQueryClient();

  // Defense Grading State
  const [selectedInternship, setSelectedInternship] = useState<any>(null);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [gradeScore, setGradeScore] = useState<string>('');
  const [gradeNotes, setGradeNotes] = useState('');

  const { data: fetchedActiveYear, isLoading: isLoadingYears } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeAcademicYearId = activeAcademicYear?.id ?? null;

  const { data: schemesData, isLoading: isLoadingSchemes } = useQuery({
    queryKey: ['ukk-schemes', activeAcademicYearId],
    queryFn: () => ukkSchemeService.getSchemes(activeAcademicYearId),
    enabled: !!activeAcademicYearId
  });

  const schemes = schemesData?.data || schemesData || [];

  const { data: examinerInternshipsData, isLoading: isLoadingInternships } = useQuery({
    queryKey: ['examiner-internships'],
    queryFn: () => internshipService.getExaminerInternships(),
  });

  const examinerInternships = examinerInternshipsData?.data?.data || [];

  const gradeDefenseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      internshipService.gradeDefense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examiner-internships'] });
      toast.success('Nilai sidang berhasil disimpan');
      setIsGradeModalOpen(false);
      setGradeScore('');
      setGradeNotes('');
      setSelectedInternship(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menyimpan nilai');
    }
  });

  const handleOpenGradeModal = (internship: any) => {
    setSelectedInternship(internship);
    setGradeScore(internship.defenseScore || '');
    setGradeNotes(internship.defenseNotes || '');
    setIsGradeModalOpen(true);
  };

  const handleSubmitGrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeScore) {
      toast.error('Nilai wajib diisi');
      return;
    }
    gradeDefenseMutation.mutate({
      id: selectedInternship.id,
      data: {
        score: Number(gradeScore),
        notes: gradeNotes
      }
    });
  };

  if (isLoadingYears || (!!activeAcademicYearId && isLoadingSchemes) || isLoadingInternships) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="bg-white rounded-2xl px-6 py-4 shadow-sm border border-gray-100 mt-10 relative flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="-mt-16 relative">
            <div
              className="w-36 h-36 rounded-full p-1 bg-white ring-1 ring-gray-200"
              style={{
                boxShadow:
                  'inset 6px 6px 12px rgba(0,0,0,0.06), inset -6px -6px 12px rgba(255,255,255,0.9), 8px 8px 16px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.7)',
              }}
            >
              {user.photo ? (
                <img
                  src={
                    user.photo.startsWith('/api') || user.photo.startsWith('http')
                      ? user.photo
                      : `/api/uploads/${user.photo}`
                  }
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-6xl">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Selamat Datang, {user.name}! 👋
            </h1>
            <p className="text-gray-500 text-sm">
              Berikut adalah ringkasan kegiatan pengujian Anda | {user.institution || user.username}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <ClipboardList size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Skema UKK</p>
              <h3 className="text-2xl font-bold text-gray-900">{schemes.length}</h3>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
              <User size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Siswa PKL (Sidang)</p>
              <h3 className="text-2xl font-bold text-gray-900">{examinerInternships.length}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Status Penilaian</p>
              <h3 className="text-lg font-bold text-gray-900">Siap Digunakan</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Internship Defense Schedule Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Jadwal Sidang PKL</h2>
            <p className="text-sm text-gray-500 mt-0.5">Daftar siswa yang harus Anda uji.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          {examinerInternships.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Belum ada jadwal sidang PKL yang ditugaskan kepada Anda.
            </div>
          ) : (
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3">Siswa</th>
                  <th className="px-6 py-3">Perusahaan</th>
                  <th className="px-6 py-3">Jadwal Sidang</th>
                  <th className="px-6 py-3 text-center">Nilai</th>
                  <th className="px-6 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {examinerInternships.map((internship: any) => (
                  <tr key={internship.id} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{internship.student?.name}</div>
                      <div className="text-xs text-gray-500">{internship.student?.studentClass?.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{internship.companyName}</div>
                      {internship.companyAddress && (
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{internship.companyAddress}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {internship.defenseDate ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-gray-900">
                            <Calendar className="w-4 h-4 text-indigo-500" />
                            {new Date(internship.defenseDate).toLocaleString('id-ID', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                          {internship.defenseRoom && (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <MapPin className="w-3 h-3" />
                              Ruang: {internship.defenseRoom}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Belum dijadwalkan</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {internship.defenseScore ? (
                        <span className="font-bold text-lg text-emerald-600">{internship.defenseScore}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {['DEFENSE_SCHEDULED', 'DEFENSE_COMPLETED', 'COMPLETED'].includes(internship.status) ? (
                        <button
                          onClick={() => handleOpenGradeModal(internship)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium text-xs"
                        >
                          <Star className="w-3 h-3" />
                          {internship.defenseScore ? 'Ubah Nilai' : 'Nilai Sidang'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Menunggu Jadwal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Grade Modal */}
      {isGradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-semibold text-gray-900">Nilai Sidang PKL</h3>
              <button onClick={() => setIsGradeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitGrade} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Siswa</label>
                <div className="p-3 bg-gray-50 rounded-lg text-gray-900 text-sm font-medium">
                  {selectedInternship?.student?.name}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nilai Sidang (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  placeholder="Contoh: 85"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Penguji</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-24 resize-none"
                  value={gradeNotes}
                  onChange={(e) => setGradeNotes(e.target.value)}
                  placeholder="Tambahkan catatan atau masukan untuk siswa..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGradeModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={gradeDefenseMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {gradeDefenseMutation.isPending ? 'Menyimpan...' : 'Simpan Nilai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Recent Schemes List (Styled like Teacher Dashboard Bank Soal) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Skema Penilaian Terbaru</h2>
            <p className="text-xs text-gray-500 mt-0.5">Daftar skema penilaian yang telah Anda buat.</p>
          </div>
          <Link to="/examiner/schemes" className="text-blue-600 text-xs font-medium hover:underline">
            Lihat Semua
          </Link>
        </div>
        <div className="px-5 py-4 space-y-3">
          {schemes.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Belum ada skema penilaian.</p>
          ) : (
            schemes.slice(0, 5).map((scheme: any) => (
              <div key={scheme.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                 <div className="flex-1 min-w-0 mr-4">
                    <div className="text-sm font-medium text-gray-900 truncate">{scheme.name}</div>
                    <div className="text-xs text-gray-500">
                      {scheme.subject?.name} • {scheme.major?.name || '-'}
                    </div>
                 </div>
                 <div className="text-right">
                    <Link 
                      to={`/examiner/ukk-assessment?schemeId=${scheme.id}`}
                      className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                    >
                      Mulai Penilaian
                    </Link>
                 </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
