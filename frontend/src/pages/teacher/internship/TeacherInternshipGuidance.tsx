import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { internshipService } from '../../../services/internship.service';
import { 
  Users, 
  FileText, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Calendar,
  ChevronRight,
  X,
  Camera
} from 'lucide-react';
import { toast } from 'react-hot-toast';

type AxiosLikeError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface InternshipStudentClass {
  name: string;
}

interface InternshipStudent {
  name: string;
  nis?: string | null;
  studentClass?: InternshipStudentClass | null;
}

type InternshipStatus = 'ACTIVE' | 'COMPLETED' | 'PENDING' | string;

interface InternshipJournal {
  id: number;
  date: string;
  createdAt: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | string;
  activity: string;
  imageUrl?: string | null;
  feedback?: string | null;
}

interface InternshipAttendance {
  id: number;
  date: string;
  checkInTime: string;
  status: 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT' | string;
  imageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
}

interface InternshipSummary {
  id: number;
  student: InternshipStudent;
  companyName?: string | null;
  mentorName?: string | null;
  status: InternshipStatus;
  journals?: InternshipJournal[];
  _count?: {
    journals?: {
      status?: number;
    };
  };
}

// Modal Component for Details
const InternshipDetailModal = ({ internship, onClose }: { internship: InternshipSummary, onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'journals' | 'attendances'>('journals');
  const queryClient = useQueryClient();

  // Fetch Journals
  const { data: journalsData, isLoading: isLoadingJournals } = useQuery({
    queryKey: ['journals', internship.id],
    queryFn: () => internshipService.getJournals(internship.id)
  });

  // Fetch Attendances
  const { data: attendancesData, isLoading: isLoadingAttendances } = useQuery({
    queryKey: ['attendances', internship.id],
    queryFn: () => internshipService.getAttendances(internship.id)
  });

  const journals = (journalsData?.data?.data as InternshipJournal[] | undefined) || [];
  const attendances = (attendancesData?.data?.data as InternshipAttendance[] | undefined) || [];

  const approveJournalMutation = useMutation({
    mutationFn: ({ id, status, feedback }: { id: number, status: string, feedback?: string }) => 
      internshipService.approveJournal(id, { status, feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals', internship.id] });
      queryClient.invalidateQueries({ queryKey: ['assigned-internships'] }); // Update main list too
      toast.success('Status jurnal diperbarui');
    },
    onError: (err: unknown) => {
      const axiosErr = err as AxiosLikeError;
      toast.error(axiosErr.response?.data?.message || 'Gagal memperbarui jurnal');
    }
  });

  const handleApproveJournal = (journalId: number, status: 'VERIFIED' | 'REJECTED', feedback: string = '') => {
    if (status === 'REJECTED') {
      const reason = prompt('Masukkan alasan penolakan (opsional):');
      if (reason === null) return; // Cancelled
      approveJournalMutation.mutate({ id: journalId, status, feedback: reason });
    } else {
      approveJournalMutation.mutate({ id: journalId, status, feedback });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{internship.student.name}</h2>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {internship.student.studentClass?.name}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                {internship.companyName}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white px-6 py-4 border-b border-gray-100">
          <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
            <button
              onClick={() => setActiveTab('journals')}
              className={`
                px-4 py-2 text-sm font-medium rounded-md transition-colors
                ${activeTab === 'journals' 
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
              `}
            >
              Jurnal Harian
            </button>
            <button
              onClick={() => setActiveTab('attendances')}
              className={`
                px-4 py-2 text-sm font-medium rounded-md transition-colors
                ${activeTab === 'attendances' 
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
              `}
            >
              Absensi
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
          {activeTab === 'journals' ? (
            <div className="space-y-4">
              {isLoadingJournals ? (
                <div className="text-center py-8 text-gray-500">Memuat jurnal...</div>
              ) : journals.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Belum ada jurnal harian.</p>
                </div>
              ) : (
                journals.map((journal) => (
                  <div key={journal.id} className="bg-white border rounded-xl p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {new Date(journal.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(journal.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        journal.status === 'VERIFIED' ? 'bg-green-100 text-green-700' :
                        journal.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {journal.status === 'PENDING' ? 'Menunggu Validasi' : 
                         journal.status === 'VERIFIED' ? 'Tervalidasi' : 'Ditolak'}
                      </span>
                    </div>

                    <div className="pl-[52px]">
                      <p className="text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100 mb-3">
                        {journal.activity}
                      </p>
                      
                      {journal.imageUrl && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-2">Dokumentasi:</p>
                          <a href={journal.imageUrl} target="_blank" rel="noreferrer">
                            <img src={journal.imageUrl} alt="Dokumentasi" className="h-32 w-auto rounded-lg object-cover border hover:opacity-90 transition-opacity" />
                          </a>
                        </div>
                      )}

                      {journal.feedback && (
                         <div className="mb-4 bg-orange-50 p-3 rounded-lg border border-orange-100 text-sm text-orange-800">
                           <span className="font-bold">Catatan Guru:</span> {journal.feedback}
                         </div>
                      )}

                      {journal.status === 'PENDING' && (
                        <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                          <button
                            onClick={() => handleApproveJournal(journal.id, 'REJECTED')}
                            className="flex-1 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            Tolak
                          </button>
                          <button
                            onClick={() => handleApproveJournal(journal.id, 'VERIFIED')}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Validasi
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {isLoadingAttendances ? (
                <div className="text-center py-8 text-gray-500">Memuat absensi...</div>
              ) : attendances.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Belum ada data absensi.</p>
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                      <tr>
                        <th className="px-4 py-3">Tanggal & Waktu</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Lokasi & Foto</th>
                        <th className="px-4 py-3">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {attendances.map((att) => (
                        <tr key={att.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {new Date(att.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <div className="text-gray-500 text-xs">
                              {new Date(att.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              att.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                              att.status === 'SICK' ? 'bg-yellow-100 text-yellow-700' :
                              att.status === 'PERMISSION' ? 'bg-blue-100 text-blue-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {att.status === 'PRESENT' ? 'Hadir' :
                               att.status === 'SICK' ? 'Sakit' :
                               att.status === 'PERMISSION' ? 'Izin' : 'Alpa'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {att.imageUrl ? (
                                <a href={att.imageUrl} target="_blank" rel="noreferrer" className="group relative block w-10 h-10 rounded-lg overflow-hidden border">
                                  <img src={att.imageUrl} alt="Selfie" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                </a>
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                                  <Camera className="w-4 h-4" />
                                </div>
                              )}
                              
                              {(att.latitude && att.longitude) ? (
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${att.latitude},${att.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Lihat Lokasi di Maps"
                                >
                                  <MapPin className="w-5 h-5" />
                                </a>
                              ) : (
                                <span className="text-gray-300" title="Lokasi tidak tersedia">
                                  <MapPin className="w-5 h-5" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                            {att.note || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Icon Helper
const Building2 = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </svg>
);

export const TeacherInternshipGuidance = () => {
  const [selectedInternship, setSelectedInternship] = useState<InternshipSummary | null>(null);
  
  const { data: response, isLoading } = useQuery({
    queryKey: ['assigned-internships'],
    queryFn: internshipService.getAssignedInternships
  });

  const internships = (response?.data?.data as InternshipSummary[] | undefined) || [];

  if (isLoading) {
    return <div className="p-8 text-center flex flex-col items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-gray-500">Memuat data bimbingan...</p>
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bimbingan PKL</h1>
          <p className="text-gray-500 mt-1">Pantau jurnal harian dan absensi siswa bimbingan Anda.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {internships.map((internship) => (
          <div key={internship.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                  {internship.student.name}
                  <span className={`px-2 py-0.5 rounded text-xs font-normal border ${
                    internship.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-100' : 
                    internship.status === 'COMPLETED' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                    'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                    {internship.status === 'ACTIVE' ? 'Sedang PKL' : internship.status}
                  </span>
                </h3>
                <div className="text-sm text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {internship.student.studentClass?.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    NIS: {internship.student.nis}
                  </span>
                </div>
              </div>
              <div className="text-left md:text-right">
                <div className="font-medium text-gray-900 flex items-center md:justify-end gap-1">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  {internship.companyName}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">Mentor: {internship.mentorName}</div>
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium flex items-center gap-2 text-gray-700">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Status Terkini
                </h4>
                {(internship._count?.journals?.status ?? 0) > 0 && (
                   <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                     {(internship._count?.journals?.status ?? 0)} Jurnal Menunggu
                   </span>
                )}
              </div>
              
              {internship.journals && internship.journals.length > 0 ? (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Jurnal Terakhir</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      {new Date(internship.journals[0].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{internship.journals[0].activity}</p>
                </div>
              ) : (
                <p className="text-gray-500 italic text-sm mb-4">Belum ada aktivitas jurnal.</p>
              )}

              <button
                onClick={() => setSelectedInternship(internship)}
                className="w-full py-2.5 px-4 bg-white border border-blue-200 text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
              >
                Lihat Detail Jurnal & Absensi
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {internships.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Belum Ada Siswa Bimbingan</h3>
            <p className="text-gray-500 mt-1 max-w-sm mx-auto">Anda belum ditugaskan sebagai guru pembimbing PKL untuk siswa manapun saat ini.</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedInternship && (
        <InternshipDetailModal 
          internship={selectedInternship} 
          onClose={() => setSelectedInternship(null)} 
        />
      )}
    </div>
  );
};
