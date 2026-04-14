import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { internshipService } from '../../../services/internship.service';
import { uploadService } from '../../../services/upload.service';
import { authService } from '../../../services/auth.service';
import type { User as AuthUser } from '../../../types/auth';
import { Briefcase, Building2, User as UserIcon, AlertCircle, Upload, FileText, Clock, XCircle, Pencil, Save, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

type InternshipStatus =
  | 'PROPOSED'
  | 'WAITING_ACCEPTANCE_LETTER'
  | 'VERIFYING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REPORT_SUBMITTED'
  | 'DEFENSE_SCHEDULED'
  | 'DEFENSE_COMPLETED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELED';

type InternshipRecord = {
  id: number;
  status: InternshipStatus | string;
  companyName: string;
  companyAddress?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  mentorName?: string | null;
  mentorPhone?: string | null;
  approvalNotes?: string | null;
  rejectionReason?: string | null;
  companyLatitude?: number | null;
  companyLongitude?: number | null;
  acceptanceLetterUrl?: string | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  defenseScore?: number | null;
  defenseNotes?: string | null;
  examiner?: { name?: string | null } | null;
  teacher?: { name?: string | null; phone?: string | null } | null;
};

type OutletContextShape = { user?: AuthUser | null };

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const StudentInternshipDashboard = () => {
  const [internship, setInternship] = useState<InternshipRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isEditingMentor, setIsEditingMentor] = useState(false);
  const [mentorForm, setMentorForm] = useState({
    mentorName: '',
    mentorPhone: ''
  });

  const { user: contextUser } = useOutletContext<OutletContextShape>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  
  const [formData, setFormData] = useState({
    companyName: '',
    companyAddress: '',
    startDate: '',
    endDate: '',
  });

  const fetchInternship = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const res = await internshipService.getMyInternship();
      
      if (res.data.success) {
        // Backend returns { internship, isEligible }
        if (res.data.data && res.data.data.internship) {
           setInternship(res.data.data.internship);
        } else {
           setInternship(null);
        }
      }
    } catch (error: unknown) {
      console.error('Error fetching internship:', error);
      // Only show error if it's not a 404 (Not Found is expected for new students)
      const statusCode = (error as { response?: { status?: number } }).response?.status;
      if (statusCode !== 404) {
        setError(getErrorMessage(error, 'Gagal memuat data PKL'));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchInternship();
  }, [fetchInternship]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchInternship(true);
    }, 5000);

    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchInternship(true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [fetchInternship]);

  useEffect(() => {
    if (internship) {
      setMentorForm({
        mentorName: internship.mentorName || '',
        mentorPhone: internship.mentorPhone || ''
      });
    }
  }, [internship]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate) : undefined,
        endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      };
      
      await internshipService.applyInternship(payload);
      toast.success('Pengajuan PKL berhasil dikirim!');
      void fetchInternship();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal mengajukan PKL'));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const currentInternship = internship;
    if (!currentInternship) return;
    
    const file = e.target.files[0];
    if (file.size > 500 * 1024) {
      toast.error('Ukuran file maksimal 500KB');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload file
      const uploadRes = await uploadService.uploadInternshipFile(file);
      
      // 2. Update status
      await internshipService.uploadAcceptanceLetter(currentInternship.id, uploadRes.url);
      
      toast.success('Surat balasan berhasil diupload!');
      void fetchInternship();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal mengupload file'));
    } finally {
      setUploading(false);
    }
  };

  const handleReapply = () => {
    const currentInternship = internship;
    if (!currentInternship) return;
    setFormData({
      companyName: currentInternship.companyName,
      companyAddress: currentInternship.companyAddress || '',
      startDate: currentInternship.startDate ? new Date(currentInternship.startDate).toISOString().split('T')[0] : '',
      endDate: currentInternship.endDate ? new Date(currentInternship.endDate).toISOString().split('T')[0] : '',
    });
    setInternship(null);
  };

  const handleUpdateMentor = async () => {
    const currentInternship = internship;
    if (!currentInternship) return;
    try {
      await internshipService.updateInternship(currentInternship.id, {
        mentorName: mentorForm.mentorName,
        mentorPhone: mentorForm.mentorPhone
      });
      toast.success('Data pembimbing berhasil disimpan');
      setIsEditingMentor(false);
      void fetchInternship();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan data'));
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PROPOSED: 'bg-yellow-100 text-yellow-700',
      WAITING_ACCEPTANCE_LETTER: 'bg-blue-100 text-blue-700',
      VERIFYING: 'bg-purple-100 text-purple-700',
      APPROVED: 'bg-green-100 text-green-700',
      ACTIVE: 'bg-green-100 text-green-700',
      REPORT_SUBMITTED: 'bg-teal-100 text-teal-700',
      DEFENSE_SCHEDULED: 'bg-indigo-100 text-indigo-700',
      DEFENSE_COMPLETED: 'bg-purple-100 text-purple-700',
      COMPLETED: 'bg-gray-100 text-gray-700',
      REJECTED: 'bg-red-100 text-red-700',
      CANCELED: 'bg-red-100 text-red-700',
    };
    
    const labels: Record<string, string> = {
      PROPOSED: 'Diajukan',
      WAITING_ACCEPTANCE_LETTER: 'Menunggu Surat Balasan',
      APPROVED: 'Disetujui',
      ACTIVE: 'Aktif',
      REPORT_SUBMITTED: 'Laporan Dikumpulkan',
      DEFENSE_SCHEDULED: 'Jadwal Sidang',
      DEFENSE_COMPLETED: 'Sidang Selesai',
      COMPLETED: 'Selesai',
      REJECTED: 'Ditolak',
      CANCELED: 'Dibatalkan',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600">Silakan login kembali.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2">
           <AlertCircle className="w-5 h-5" />
           <p>{error}</p>
        </div>
        <button onClick={() => void fetchInternship()} className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
          Coba lagi
        </button>
      </div>
    );
  }

  if (internship) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-page-title font-bold text-gray-800">Dashboard PKL</h1>
            <p className="text-gray-500">Informasi tempat PKL dan status pengajuan</p>
          </div>
          {getStatusBadge(internship.status)}
        </div>

        {/* Quick Actions for Active Internship */}
        {['APPROVED', 'ACTIVE', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED', 'DEFENSE_COMPLETED', 'COMPLETED'].includes(internship.status) && (
          <div className="grid grid-cols-2 gap-4">
             <a 
               href="/student/internship/journals" 
               className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:border-blue-200 transition-colors group"
             >
               <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                 <FileText className="w-6 h-6 text-blue-600" />
               </div>
               <div>
                 <h3 className="font-semibold text-gray-900">Jurnal Harian</h3>
                 <p className="text-xs text-gray-500">Catat kegiatan harian</p>
               </div>
             </a>
             <a 
               href="/student/internship/attendance" 
               className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:border-green-200 transition-colors group"
             >
               <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center group-hover:bg-green-100 transition-colors">
                 <Clock className="w-6 h-6 text-green-600" />
               </div>
               <div>
                 <h3 className="font-semibold text-gray-900">Absensi Kehadiran</h3>
                 <p className="text-xs text-gray-500">Isi daftar hadir</p>
               </div>
             </a>
          </div>
        )}
        
        {/* Status Workflow Indicator - Header Removed */}
        {['PROPOSED', 'WAITING_ACCEPTANCE_LETTER', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED', 'DEFENSE_COMPLETED', 'COMPLETED', 'REJECTED'].includes(internship.status) && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
           {/* Header "Status Pengajuan" Removed */}

           {internship.status === 'PROPOSED' && (
            <div className="bg-blue-50 p-4 rounded-lg flex gap-3">
              <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-blue-700 font-medium">Pengajuan Sedang Diproses</p>
                <p className="text-sm text-blue-600 mt-1">
                  Sekolah akan membuatkan surat permohonan PKL. Jika Anda sudah menerima surat balasan dari perusahaan, Anda dapat langsung menguploadnya pada form di bawah ini.
                </p>
              </div>
            </div>
          )}

          {['PROPOSED', 'WAITING_ACCEPTANCE_LETTER'].includes(internship.status) && (
            <div className={`space-y-4 ${internship.status === 'PROPOSED' ? 'mt-4' : ''}`}>
              {!internship.acceptanceLetterUrl ? (
                <>
                  {internship.status === 'WAITING_ACCEPTANCE_LETTER' && (
                    <div className="bg-yellow-50 p-4 rounded-lg flex gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-yellow-700 font-medium">Tindakan Diperlukan: Upload Surat Balasan</p>
                        <p className="text-sm text-yellow-600 mt-1">
                          Surat permohonan PKL telah dibuat oleh sekolah. Silahkan serahkan ke perusahaan, 
                          lalu upload surat balasan tanda diterima dari perusahaan di sini.
                        </p>
                      </div>
                    </div>
                  )}
                   
                   <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                     <input
                       type="file"
                       id="acceptance-letter"
                       className="hidden"
                       accept=".pdf,image/*"
                       onChange={handleFileUpload}
                       disabled={uploading}
                     />
                     <label 
                       htmlFor="acceptance-letter"
                       className={`cursor-pointer inline-flex flex-col items-center ${uploading ? 'opacity-50' : ''}`}
                     >
                       <Upload className="w-8 h-8 text-gray-400 mb-2" />
                       <span className="text-sm font-medium text-gray-700">
                         {uploading ? 'Mengupload...' : 'Klik untuk upload Surat Balasan (PDF/Foto)'}
                       </span>
                       <span className="text-xs text-gray-500 mt-1">Maksimal 500KB (JPG, JPEG, PNG, PDF)</span>
                     </label>
                   </div>
                 </>
               ) : (
                 <div className="bg-purple-50 p-4 rounded-lg flex gap-3 items-start justify-between">
                   <div className="flex gap-3">
                     <Clock className="w-5 h-5 text-purple-600 flex-shrink-0 mt-1" />
                     <div>
                       <p className="text-sm text-purple-700 font-medium">Menunggu Verifikasi Akhir</p>
                       <p className="text-sm text-purple-600 mt-1">
                         Surat balasan sudah diupload. Mohon tunggu persetujuan akhir dan penentuan pembimbing dari Wakasek Humas.
                       </p>
                       <a href={internship.acceptanceLetterUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline mt-2 block">
                         Lihat Surat Balasan
                       </a>
                     </div>
                   </div>
                   <div className="flex-shrink-0">
                     <input
                       type="file"
                       id="reupload-acceptance"
                       className="hidden"
                       accept=".pdf,image/*"
                       onChange={handleFileUpload}
                       disabled={uploading}
                     />
                     <label 
                       htmlFor="reupload-acceptance"
                       className="text-xs bg-white border border-purple-200 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-50 cursor-pointer transition-colors"
                     >
                       {uploading ? '...' : 'Ganti File'}
                     </label>
                   </div>
                 </div>
               )}
             </div>
           )}

           {/* Sidang PKL Section */}
           {['REPORT_SUBMITTED', 'DEFENSE_SCHEDULED', 'DEFENSE_COMPLETED', 'COMPLETED'].includes(internship.status) && (
             <div className="border-t border-gray-100 pt-6 mt-6">
                <h3 className="text-lg font-semibold mb-4">Jadwal & Hasil Sidang</h3>
                
                {internship.status === 'REPORT_SUBMITTED' && !internship.defenseDate && (
                  <div className="bg-blue-50 p-4 rounded-lg mb-4 flex gap-3">
                    <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <p className="text-sm text-blue-700">
                      Laporan sudah diterima. Mohon menunggu jadwal sidang yang akan ditentukan oleh sekolah.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-indigo-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-indigo-900 mb-3">Jadwal Sidang</h4>
                    <div className="space-y-2">
                       <div className="flex items-center gap-2 text-sm text-indigo-800">
                          <Clock className="w-4 h-4" />
                          <span>
                            {internship.defenseDate ? new Date(internship.defenseDate).toLocaleString('id-ID', {
                              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : '-'}
                          </span>
                       </div>
                       <div className="flex items-center gap-2 text-sm text-indigo-800">
                          <Building2 className="w-4 h-4" />
                          <span>Ruang: {internship.defenseRoom || '-'}</span>
                       </div>
                       <div className="flex items-center gap-2 text-sm text-indigo-800">
                          <UserIcon className="w-4 h-4" />
                          <span>Penguji: {internship.examiner?.name || 'Belum ditentukan'}</span>
                       </div>
                    </div>
                  </div>

                  {internship.defenseScore !== null && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-green-900 mb-3">Hasil Sidang</h4>
                      <div className="flex items-center gap-4">
                         <div className="text-4xl font-bold text-green-600">
                            {internship.defenseScore}
                         </div>
                         <div className="text-sm text-green-800">
                           <p className="font-medium">Catatan Penguji:</p>
                           <p className="italic">"{internship.defenseNotes || '-'}"</p>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
             </div>
           )}

           {internship.status === 'REJECTED' && (
             <div className="bg-red-50 p-4 rounded-lg flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
               <div className="flex gap-3">
                 <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                 <div>
                   <p className="text-sm text-red-700 font-medium">Pengajuan Ditolak</p>
                   <p className="text-sm text-red-600 mt-1">Alasan: {internship.rejectionReason || '-'}</p>
                 </div>
               </div>
               <button 
                 onClick={handleReapply}
                 className="px-4 py-2 bg-white border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors shadow-sm whitespace-nowrap"
               >
                 Ajukan Lagi
               </button>
             </div>
           )}
        </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Informasi Tempat PKL
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">Nama Perusahaan/Instansi</label>
                <p className="font-medium text-gray-900">{internship.companyName}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Alamat</label>
                <p className="font-medium text-gray-900">{internship.companyAddress || '-'}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="text-sm text-gray-500">Tanggal Mulai</label>
                  <p className="font-medium text-gray-900">
                    {internship.startDate ? new Date(internship.startDate).toLocaleDateString('id-ID') : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Tanggal Selesai</label>
                  <p className="font-medium text-gray-900">
                    {internship.endDate ? new Date(internship.endDate).toLocaleDateString('id-ID') : '-'}
                  </p>
                </div>
              </div>
              {internship.acceptanceLetterUrl && (
                <div className="pt-2 border-t border-gray-100">
                  <a 
                    href={internship.acceptanceLetterUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <FileText className="w-4 h-4" />
                    Lihat Surat Balasan
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-green-600" />
                  Pembimbing
                </h2>
                {!isEditingMentor ? (
                  <button 
                    onClick={() => setIsEditingMentor(true)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditingMentor(false)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleUpdateMentor}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </div>
                )}
             </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">Guru Pembimbing</label>
                <p className="font-medium text-gray-900">{internship.teacher?.name || 'Belum ditentukan'}</p>
                {internship.teacher?.phone && (
                  <p className="text-xs text-gray-500">{internship.teacher.phone}</p>
                )}
              </div>
               <div>
                <label className="text-sm text-gray-500">Pembimbing Lapangan (Mentor)</label>
                {isEditingMentor ? (
                  <div className="space-y-2 mt-1">
                    <input
                      type="text"
                      value={mentorForm.mentorName}
                      onChange={(e) => setMentorForm({...mentorForm, mentorName: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Nama Mentor"
                    />
                    <input
                      type="tel"
                      value={mentorForm.mentorPhone}
                      onChange={(e) => setMentorForm({...mentorForm, mentorPhone: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="No. HP Mentor"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">{internship.mentorName || '-'}</p>
                    <p className="text-sm text-gray-500">{internship.mentorPhone || '-'}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-page-title font-bold text-gray-900">Pengajuan PKL</h1>
          <p className="text-gray-500 mt-2">Silahkan lengkapi data tempat PKL yang Anda tuju.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Perusahaan/Instansi *</label>
            <input
              type="text"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={formData.companyName}
              onChange={e => setFormData({...formData, companyName: e.target.value})}
              placeholder="PT. Teknologi Maju Jaya"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Perusahaan</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              value={formData.companyAddress}
              onChange={e => setFormData({...formData, companyAddress: e.target.value})}
              placeholder="Jl. Sudirman No. 123, Jakarta"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rencana Tanggal Mulai</label>
              <input
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rencana Tanggal Selesai</label>
              <input
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.endDate}
                onChange={e => setFormData({...formData, endDate: e.target.value})}
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Pastikan data yang Anda masukkan benar. Pengajuan akan direview oleh Koordinator PKL/Waka Kurikulum.
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Ajukan PKL
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentInternshipDashboard;
