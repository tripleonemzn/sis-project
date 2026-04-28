import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { internshipService } from '../../../services/internship.service';
import { 
  Users, 
  FileText, 
  CheckCircle, 
  Clock, 
  MapPin, 
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

function formatJournalDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString('id-ID', options ?? {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatJournalTime(date: string) {
  return new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function getJournalStatusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'Menunggu Validasi';
    case 'VERIFIED':
      return 'Tervalidasi';
    case 'REJECTED':
      return 'Ditolak';
    default:
      return status || '-';
  }
}

function getJournalStatusClassName(status: string) {
  switch (status) {
    case 'VERIFIED':
      return 'bg-green-100 text-green-700';
    case 'REJECTED':
      return 'bg-red-100 text-red-700';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function getInternshipStatusLabel(status: InternshipStatus) {
  if (status === 'ACTIVE') return 'Sedang PKL';
  if (status === 'COMPLETED') return 'Selesai';
  return status || '-';
}

function getInternshipStatusClassName(status: InternshipStatus) {
  if (status === 'ACTIVE') return 'bg-green-50 text-green-700 border-green-100';
  if (status === 'COMPLETED') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-gray-50 text-gray-600 border-gray-200';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[calc(100vh-7rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
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
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
            <button
              onClick={() => setActiveTab('journals')}
              className={`
                inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
                ${activeTab === 'journals' 
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              Jurnal Harian
            </button>
            <button
              onClick={() => setActiveTab('attendances')}
              className={`
                inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
                ${activeTab === 'attendances' 
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              Absensi
            </button>
          </div>
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
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="border-b bg-gray-50 text-gray-700">
                        <tr>
                          <th className="px-4 py-3 font-medium">Tanggal & Waktu</th>
                          <th className="px-4 py-3 font-medium">Kegiatan</th>
                          <th className="px-4 py-3 font-medium">Dokumentasi</th>
                          <th className="px-4 py-3 font-medium">Feedback</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 text-right font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {journals.map((journal) => (
                          <tr key={journal.id} className="align-top hover:bg-gray-50">
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="font-medium text-gray-900">
                                {formatJournalDate(journal.date)}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {formatJournalDate(journal.date, { weekday: 'long' })} • {formatJournalTime(journal.createdAt)} WIB
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              <p className="whitespace-pre-line rounded-lg border border-gray-100 bg-gray-50 p-3">
                                {journal.activity || '-'}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              {journal.imageUrl ? (
                                <a
                                  href={journal.imageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-medium text-gray-700 hover:bg-gray-100"
                                >
                                  <img
                                    src={journal.imageUrl}
                                    alt="Dokumentasi jurnal"
                                    className="h-10 w-10 rounded-md object-cover"
                                  />
                                  Lihat foto
                                </a>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {journal.feedback ? (
                                <span className="text-orange-800">{journal.feedback}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getJournalStatusClassName(journal.status)}`}>
                                {getJournalStatusLabel(journal.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {journal.status === 'PENDING' ? (
                                <div className="inline-flex gap-2">
                                  <button
                                    onClick={() => handleApproveJournal(journal.id, 'REJECTED')}
                                    className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                                  >
                                    Tolak
                                  </button>
                                  <button
                                    onClick={() => handleApproveJournal(journal.id, 'VERIFIED')}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-700"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Validasi
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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

      {internships.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Belum Ada Siswa Bimbingan</h3>
            <p className="text-gray-500 mt-1 max-w-sm mx-auto">Anda belum ditugaskan sebagai guru pembimbing PKL untuk siswa manapun saat ini.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Daftar Siswa Bimbingan</h2>
            <p className="text-sm text-gray-500">{internships.length} siswa PKL terhubung dengan akun pembimbing ini.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Siswa</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tempat PKL</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Jurnal Terakhir</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {internships.map((internship) => {
                  const waitingJournals = internship._count?.journals?.status ?? 0;
                  const latestJournal = internship.journals?.[0];

                  return (
                    <tr key={internship.id} className="align-top hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">{internship.student.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {internship.student.studentClass?.name || '-'}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            NIS: {internship.student.nis || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 font-medium text-gray-900">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          {internship.companyName || '-'}
                        </div>
                        <div className="mt-1 text-sm text-gray-500">Mentor: {internship.mentorName || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${getInternshipStatusClassName(internship.status)}`}>
                          {getInternshipStatusLabel(internship.status)}
                        </span>
                        {waitingJournals > 0 ? (
                          <div className="mt-2 inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                            {waitingJournals} jurnal menunggu
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        {latestJournal ? (
                          <div className="max-w-md">
                            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                              {formatJournalDate(latestJournal.date, { day: 'numeric', month: 'long' })}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-gray-700">{latestJournal.activity}</p>
                          </div>
                        ) : (
                          <span className="text-sm italic text-gray-500">Belum ada aktivitas jurnal.</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedInternship(internship)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
                        >
                          Lihat Detail
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
