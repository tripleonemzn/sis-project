import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { internshipService } from '../../../services/internship.service';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import { liveQueryOptions } from '../../../lib/query/liveQuery';
import { 
  XCircle, 
  Search, 
  Filter, 
  Building2, 
  MapPin, 
  Loader2,
  FileText,
  UserCheck,
  ExternalLink,
  Printer,
  Plus,
  Trash2,
  Save,
  UserPlus,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  Edit
} from 'lucide-react';
import toast from 'react-hot-toast';

export const InternshipApprovalPage = () => {
  const [statusFilter, setStatusFilter] = useState<string>('PROPOSED');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: any, activeYear: any }>() || {};

  // Get Current User via Query (Database Persistence)
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const userId = user?.id;
  
  // Fetch Active Academic Year
  const { data: fetchedActiveYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeYearId = activeAcademicYear?.id;

  // Fetch User Profile for Preferences
  const { data: userData } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => {
      if (!userId) return null;
      return userService.getById(userId);
    },
    enabled: !!userId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => {
      if (!userId) throw new Error('User ID not found');
      return userService.update(userId, data);
    },
    onSuccess: () => {
       toast.success('Contact Person berhasil disimpan sebagai default (Database)');
       queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    },
    onError: (err) => {
      toast.error('Gagal menyimpan Contact Person');
      console.error(err);
    }
  });

  const [selectedInternship, setSelectedInternship] = useState<any>(null);
  const [selectedInternshipIds, setSelectedInternshipIds] = useState<number[]>([]);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  
  // Defense & Examiner States
  const [isAssignExaminerModalOpen, setIsAssignExaminerModalOpen] = useState(false);
  const [isScheduleDefenseModalOpen, setIsScheduleDefenseModalOpen] = useState(false);
  const [selectedExaminerId, setSelectedExaminerId] = useState<number | ''>('');
  const [isExaminerDropdownOpen, setIsExaminerDropdownOpen] = useState(false);
  const [examinerSearch, setExaminerSearch] = useState('');
  const [defenseDate, setDefenseDate] = useState('');
  const [defenseRoom, setDefenseRoom] = useState('');
  
  // Form states for verification
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | ''>('');
  const [mentorName, setMentorName] = useState('');
  const [mentorPhone, setMentorPhone] = useState('');
  const [companyLatitude, setCompanyLatitude] = useState<string>('');
  const [companyLongitude, setCompanyLongitude] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isIndividualPrintModalOpen, setIsIndividualPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'individual' | 'group'>('group');
  const [printConfig, setPrintConfig] = useState({
    letterNumber: 'B.108/KGB2.K/K/AK/I/2026',
    attachment: '-',
    subject: 'Permohonan Praktik Kerja Lapangan (PKL)',
    date: new Date().toISOString().split('T')[0],
    startDate: '',
    endDate: '',
    companyName: '',
    companyAddress: '',
    openingText: `Sesuai dengan Kurikulum Merdeka untuk Sekolah Menengah Kejuruan (SMK) Karya Guna Bhakti 2 diwajibkan untuk melaksanakan Program Praktik Kerja Lapangan pada semester IV Tahun Ajaran 2025/2026 bagi siswa/i tingkat XI (Sebelas).

Kepala SMK Karya Guna Bhakti 2 Kota Bekasi mengajukan permohonan siswa/i kami untuk dapat diberikan kesempatan melaksanakan Praktik Kerja Lapangan pada Perusahaan / Instansi yang Bapak / Ibu pimpin.

Adapun nama siswa/i kami adalah:`,
    closingText: `Demikian permohonan ini kami sampaikan, atas perhatian dan kerja sama Bapak / Ibu kami ucapkan terima kasih.`,
    recipientName: '',
    contactPersons: (() => {
      // Immediate load from localStorage for instant UI responsiveness
      const saved = localStorage.getItem('pkl_print_default_cps');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) { console.error(e); }
      }
      return [] as { name: string; phone: string }[];
    })(),
    signatureSpace: 5,
    useBarcode: false
  });

  const queryClient = useQueryClient();

  // Load saved contact persons from database preferences
  useEffect(() => {
    if (userData?.data?.preferences) {
      // @ts-ignore
      const prefs = userData.data.preferences;
      if (prefs?.print_config_contact_persons && Array.isArray(prefs.print_config_contact_persons)) {
        console.log("DEBUG: Database preferences loaded:", prefs.print_config_contact_persons);
        setPrintConfig(prev => {
          // Hanya update jika state saat ini benar-benar kosong
          // Ini mencegah data database menimpa data yang baru saja diketik/diedit
          if (prev.contactPersons.length === 0 && prefs.print_config_contact_persons.length > 0) {
            return { 
              ...prev, 
              contactPersons: [...prefs.print_config_contact_persons].map(cp => ({ ...cp }))
            };
          }
          return prev;
        });
      }
    }
  }, [userData]);

  // Persist CP to localStorage on every change - UNTUK KEANDALAN ANTAR TAB
  useEffect(() => {
    if (printConfig.contactPersons.length > 0) {
      localStorage.setItem('pkl_print_default_cps', JSON.stringify(printConfig.contactPersons));
    }
  }, [printConfig.contactPersons]);

  const handleSaveContactPersons = () => {
    if (!userId) {
      toast.error('User ID tidak ditemukan, silakan login ulang');
      return;
    }
    
    // Deep clone to ensure we have fresh data
    const cpsToSave = [...printConfig.contactPersons].map(cp => ({ ...cp }));
    
    // Simpan ke localStorage segera
    localStorage.setItem('pkl_print_default_cps', JSON.stringify(cpsToSave));
    
    // @ts-ignore
    const currentPrefs = userData?.data?.preferences || {};
    const newPrefs = {
        ...currentPrefs,
        print_config_contact_persons: cpsToSave
    };
    
    console.log("DEBUG: Saving CP to preferences:", cpsToSave);
    updateProfileMutation.mutate({ preferences: newPrefs });
  };

  const handleToggleSelect = (id: number) => {
    setSelectedInternshipIds(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id) 
        : [...prev, id]
    );
  };

  const handlePrintGroupLetter = () => {
    if (selectedInternshipIds.length === 0) return;
    setPrintType('group');
    
    // Ambil data CP terbaru (prioritas: current state > localStorage > database)
    let finalCPs = printConfig.contactPersons;
    
    if (finalCPs.length === 0) {
      const saved = localStorage.getItem('pkl_print_default_cps');
      if (saved) {
        try {
          finalCPs = JSON.parse(saved);
        } catch (e) {}
      }
    }

    if (finalCPs.length === 0 && userData?.data?.preferences?.print_config_contact_persons) {
      finalCPs = userData.data.preferences.print_config_contact_persons;
    }
    
    setPrintConfig(prev => ({
      ...prev,
      letterNumber: 'B.108/KGB2.K/K/AK/I/2026',
      contactPersons: [...finalCPs].map((cp: any) => ({ ...cp }))
    }));
    setIsPrintModalOpen(true);
  };

  const executePrint = async () => {
    console.log("executePrint called, type:", printType);
    
    if (printType === 'group' && selectedInternshipIds.length === 0) {
      toast.error('Pilih setidaknya satu pengajuan untuk dicetak');
      return;
    }

    setIsPrinting(true);
    try {
      // Process text to HTML (replace newlines with <br/>)
      const configToPrint = {
        ...printConfig,
        openingText: printConfig.openingText?.replace(/\n/g, '<br/>'),
        closingText: printConfig.closingText?.replace(/\n/g, '<br/>')
      };

      let response;
      if (printType === 'group') {
        console.log("Fetching group print data...");
        response = await internshipService.printGroupLetter({
          ids: selectedInternshipIds,
          ...configToPrint
        });
      } else {
        toast.error('Gunakan fitur cetak individual baru');
        setIsPrinting(false);
        return;
      }

      // Handle HTML response for group print
      const htmlContent = response.data?.data?.html;
      console.log("Group print HTML content received:", !!htmlContent);
      
      if (htmlContent) {
        // Save to localStorage FIRST (more reliable than sessionStorage across tabs)
        localStorage.setItem('pkl_group_print_data', JSON.stringify({ html: htmlContent }));
        
        // Open in new tab - SIMPLEST WAY & Force tab
        const url = '/print/pkl-group';
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.focus();
        } else {
          // Fallback if blocked
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.click();
        }
      } else {
        toast.error('Gagal memuat konten surat');
      }
      
      setIsPrintModalOpen(false);
    } catch (error: any) {
      console.error("executePrint error:", error);
      toast.error(error.response?.data?.message || 'Gagal memuat surat');
    } finally {
      setIsPrinting(false);
    }
  };


  const { data, isLoading } = useQuery({
    queryKey: ['internships-all', statusFilter, page, limit, searchQuery, activeYearId],
    queryFn: () => internshipService.getAllInternships({ 
      status: statusFilter || undefined,
      page,
      limit,
      search: searchQuery || undefined,
      academicYearId: activeYearId
    }),
    ...liveQueryOptions,
    // enabled: !!activeYearId, // Removed to allow fetch even if activeYearId is not yet loaded
  });

  const { data: teachersData } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER' }),
    enabled: isVerifyModalOpen // Only fetch when modal is open
  });

  const { data: examinersData } = useQuery({
    queryKey: ['examiners-teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER' }),
    enabled: isAssignExaminerModalOpen
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      internshipService.updateStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internships-all'] });
      toast.success('Status PKL berhasil diperbarui');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal memperbarui status');
    }
  });

  const assignExaminerMutation = useMutation({
    mutationFn: ({ id, examinerId }: { id: number; examinerId: number }) => 
      internshipService.assignExaminer(id, examinerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internships-all'] });
      toast.success('Penguji berhasil ditugaskan');
      setIsAssignExaminerModalOpen(false);
      setSelectedExaminerId('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menugaskan penguji');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => internshipService.deleteInternship(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internships-all'] });
      toast.success('Pengajuan PKL berhasil dihapus');
      setIsDeleteModalOpen(false);
      setDeleteTargetId(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menghapus pengajuan');
      setIsDeleteModalOpen(false);
      setDeleteTargetId(null);
    }
  });

  const handleDeleteClick = (id: number) => {
    setDeleteTargetId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
        deleteMutation.mutate(deleteTargetId);
    }
  };

  const scheduleDefenseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      internshipService.scheduleDefense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internships-all'] });
      toast.success('Jadwal sidang berhasil disimpan');
      setIsScheduleDefenseModalOpen(false);
      setDefenseDate('');
      setDefenseRoom('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menyimpan jadwal sidang');
    }
  });

  const handleAssignExaminer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExaminerId) {
      toast.error('Silakan pilih penguji');
      return;
    }
    assignExaminerMutation.mutate({
      id: selectedInternship.id,
      examinerId: Number(selectedExaminerId)
    });
  };

  const handleScheduleDefense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!defenseDate || !defenseRoom) {
      toast.error('Tanggal dan ruangan wajib diisi');
      return;
    }
    scheduleDefenseMutation.mutate({
      id: selectedInternship.id,
      data: {
        defenseDate: defenseDate,
        defenseRoom: defenseRoom
      }
    });
  };

  const openAssignExaminerModal = (internship: any) => {
    setSelectedInternship(internship);
    setSelectedExaminerId(internship.examinerId || '');
    setIsAssignExaminerModalOpen(true);
  };

  const openScheduleDefenseModal = (internship: any) => {
    setSelectedInternship(internship);
    setDefenseDate(internship.defenseDate ? new Date(internship.defenseDate).toISOString().slice(0, 16) : '');
    setDefenseRoom(internship.defenseRoom || '');
    setIsScheduleDefenseModalOpen(true);
  };

  const openVerifyModal = (internship: any) => {
    setSelectedInternship(internship);
    // Pre-fill if exists (though usually empty at this stage)
    setSelectedTeacherId(internship.teacherId || '');
    setMentorName(internship.mentorName || '');
    setMentorPhone(internship.mentorPhone || '');
    setCompanyLatitude(internship.companyLatitude || '');
    setCompanyLongitude(internship.companyLongitude || '');
    setRejectionReason('');
    setIsRejecting(false);
    setIsVerifyModalOpen(true);
  };

  const openIndividualPrintModal = async (internship: any) => {
    // Show loading toast because we need to fetch colleagues
    const loadingToast = toast.loading('Menyiapkan data cetak...');
    
    try {
      // Fetch full details to get colleagues and latest data
      const detailResponse = await internshipService.getInternshipDetail(internship.id);
      const fullInternship = detailResponse.data?.data || detailResponse.data;
      
      setSelectedInternship(fullInternship);
      setPrintType('individual');
      
      // Ambil data CP terbaru (prioritas: current state > localStorage > database)
      let finalCPs = printConfig.contactPersons;
      
      if (finalCPs.length === 0) {
        const saved = localStorage.getItem('pkl_print_default_cps');
        if (saved) {
          try {
            finalCPs = JSON.parse(saved);
          } catch (e) {}
        }
      }

      if (finalCPs.length === 0 && userData?.data?.preferences?.print_config_contact_persons) {
        finalCPs = userData.data.preferences.print_config_contact_persons;
      }
      
      setPrintConfig(prev => ({
        ...prev,
        letterNumber: 'B.108/KGB2.K/K/AK/I/2026',
        date: new Date().toISOString().split('T')[0],
        startDate: fullInternship.startDate ? new Date(fullInternship.startDate).toISOString().split('T')[0] : '',
        endDate: fullInternship.endDate ? new Date(fullInternship.endDate).toISOString().split('T')[0] : '',
        companyName: fullInternship.companyName || '',
        companyAddress: fullInternship.companyAddress || '',
        recipientName: fullInternship.mentorName || '',
        contactPersons: [...finalCPs].map((cp: any) => ({ ...cp })),
        openingText: `Sesuai dengan Kurikulum Merdeka untuk Sekolah Menengah Kejuruan (SMK) Karya Guna Bhakti 2 diwajibkan untuk melaksanakan Program Praktik Kerja Lapangan pada semester IV Tahun Ajaran ${fullInternship.academicYear?.name || '2025/2026'} bagi siswa/i tingkat XI (Sebelas).

Kepala SMK Karya Guna Bhakti 2 Kota Bekasi mengajukan permohonan siswa/i kami untuk dapat diberikan kesempatan melaksanakan Praktik Kerja Lapangan pada Perusahaan / Instansi yang Bapak / Ibu pimpin.

Adapun nama siswa/i kami adalah:`,
      }));
      
      toast.dismiss(loadingToast);
      setIsIndividualPrintModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch internship detail:", error);
      toast.error('Gagal mengambil data detail PKL');
      toast.dismiss(loadingToast);
      
      // Fallback to basic data if fetch fails
      setSelectedInternship(internship);
      setIsIndividualPrintModalOpen(true);
    }
  };

  const handleExecuteIndividualPrint = () => {
    if (!selectedInternship) return;
    
    // Prepare data to pass to the print page
    const printData = {
      ...printConfig,
      internshipId: selectedInternship.id,
      companyName: printConfig.companyName || selectedInternship.companyName,
      companyAddress: printConfig.companyAddress || selectedInternship.companyAddress,
      student: selectedInternship.student,
      colleagues: selectedInternship.colleagues,
      academicYear: selectedInternship.academicYear
    };
    
    // Save to localStorage for PklLetterPrint.tsx to pick up (more reliable than sessionStorage across tabs)
    localStorage.setItem(`pkl_print_config_${selectedInternship.id}`, JSON.stringify(printData));
    
    // Open print page in new tab - Force new tab by avoiding window features
    const url = `/print/pkl/${selectedInternship.id}`;
    const win = window.open(url, '_blank');
    if (win) {
      win.focus();
    } else {
      // Fallback if blocked
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
    
    setIsIndividualPrintModalOpen(false);
  };

  const closeModal = () => {
    setIsVerifyModalOpen(false);
    setSelectedInternship(null);
    setSelectedTeacherId('');
    setMentorName('');
    setMentorPhone('');
    setCompanyLatitude('');
    setCompanyLongitude('');
    setRejectionReason('');
    setIsRejecting(false);
  };

  const handleSubmitVerification = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if we are rejecting (either via toggle or forced reject)
    const isRejectAction = isRejecting || selectedInternship?.forceReject;

    if (isRejectAction) {
      if (!rejectionReason) {
        toast.error('Alasan penolakan wajib diisi');
        return;
      }
      updateStatusMutation.mutate({
        id: selectedInternship.id,
        data: { status: 'REJECTED', rejectionReason }
      });
    } else {
      // Validate Teacher Selection for Approval
      if (!selectedTeacherId) {
        toast.error('Guru Pembimbing WAJIB dipilih sebelum menyetujui');
        return;
      }

      updateStatusMutation.mutate({
        id: selectedInternship.id,
        data: {
          status: 'APPROVED',
          teacherId: Number(selectedTeacherId),
          mentorName,
          mentorPhone,
          companyLatitude: companyLatitude ? Number(companyLatitude) : undefined,
          companyLongitude: companyLongitude ? Number(companyLongitude) : undefined
        }
      });
    }
  };

  const internshipsResponse = data?.data?.data;
  // Handle both array (legacy) and paginated response (new)
  const internships = Array.isArray(internshipsResponse) 
    ? internshipsResponse 
    : (internshipsResponse?.internships || internshipsResponse?.data || []);
    
  const meta = !Array.isArray(internshipsResponse) ? internshipsResponse?.pagination || internshipsResponse?.meta : { 
    total: internships.length, 
    page: 1, 
    limit: internships.length || 10 
  };

  const teachers = teachersData?.data || [];
  const examiners = examinersData?.data || [];
  const filteredExaminers = examiners.filter((examiner: any) =>
    examiner.name.toLowerCase().includes(examinerSearch.toLowerCase())
  );

  // Client-side filtering is no longer needed for search as it's handled by backend
  // But we keep it for now if needed, or rely on backend search
  // Since we implemented backend search, we should use the internships directly
  const filteredInternships = internships; // Backend handles filtering now


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PROPOSED':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pengajuan Baru</span>;
      case 'WAITING_ACCEPTANCE_LETTER':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">Menunggu Balasan</span>;
      case 'APPROVED':
        return <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full">Disetujui</span>;
      case 'ACTIVE':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Berlangsung</span>;
      case 'REPORT_SUBMITTED':
        return <span className="px-2 py-1 text-xs font-medium bg-teal-100 text-teal-800 rounded-full">Laporan Masuk</span>;
      case 'DEFENSE_SCHEDULED':
        return <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-full">Sidang Dijadwalkan</span>;
      case 'DEFENSE_COMPLETED':
        return <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">Sidang Selesai</span>;
      case 'COMPLETED':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Selesai</span>;
      case 'REJECTED':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Ditolak</span>;
      case 'CANCELED':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Dibatalkan</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Persetujuan PKL</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola pengajuan PKL siswa (Khusus Wakasek Humas)</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari siswa, kelas, atau perusahaan..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            {selectedInternshipIds.length > 0 && (
              <button
                onClick={handlePrintGroupLetter}
                disabled={isPrinting}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm mr-2"
              >
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Cetak Kolektif ({selectedInternshipIds.length})
              </button>
            )}
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Semua Status</option>
              <option value="PROPOSED">Pengajuan Baru</option>
              <option value="WAITING_ACCEPTANCE_LETTER">Menunggu Balasan</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Ditolak</option>
            </select>
            
            <div className="flex items-center gap-2 border-l pl-2 ml-2 border-gray-300">
              <span className="text-sm text-gray-500 font-medium">Tampilkan :</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                value={limit}
                onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={35}>35</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : filteredInternships.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Tidak ada data pengajuan PKL
          </div>
        ) : (
          <>
          <div className="overflow-x-auto rounded-xl shadow-sm bg-white">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th scope="col" className="p-4 w-4">
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInternshipIds(filteredInternships.map((i: any) => i.id));
                          } else {
                            setSelectedInternshipIds([]);
                          }
                        }}
                        checked={filteredInternships.length > 0 && selectedInternshipIds.length === filteredInternships.length}
                      />
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3">Siswa</th>
                  <th scope="col" className="px-6 py-3">Perusahaan</th>
                  <th scope="col" className="px-6 py-3 text-center">Status</th>
                  <th scope="col" className="px-6 py-3">Tanggal</th>
                  <th scope="col" className="px-6 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredInternships.map((internship: any) => (
                  <tr key={internship.id} className="bg-white border-b border-gray-300 hover:bg-gray-50 transition-colors">
                    <td className="w-4 p-4">
                      <div className="flex items-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          checked={selectedInternshipIds.includes(internship.id)}
                          onChange={() => handleToggleSelect(internship.id)}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{internship.student?.name}</div>
                      <div className="text-xs text-gray-500">{internship.student?.studentClass?.name}</div>
                      {internship.student?.nis && <div className="text-xs text-gray-400">NIS: {internship.student.nis}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 font-medium text-gray-900">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          {internship.companyName}
                        </div>
                        {internship.companyAddress && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[200px]" title={internship.companyAddress}>
                              {internship.companyAddress}
                            </span>
                          </div>
                        )}


                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(internship.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(internship.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center gap-2">
                        {internship.status === 'PROPOSED' && (
                          <div className="flex flex-row gap-2 w-full max-w-[200px] justify-center items-center">
                            <button
                                onClick={() => openIndividualPrintModal(internship)}
                                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Konfigurasi & Cetak Surat"
                            >
                                <Printer className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => openVerifyModal({...internship, forceReject: true})}
                                className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                title="Tolak"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                            
                            {internship.acceptanceLetterUrl && (
                                <button
                                   onClick={() => openVerifyModal(internship)}
                                   className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors shadow-sm animate-pulse"
                                   title="Verifikasi & Approve (Surat Balasan Masuk)"
                                >
                                   <UserCheck className="w-4 h-4" />
                                </button>
                            )}
                            <button 
                               onClick={() => handleDeleteClick(internship.id)}
                               className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                               title="Hapus Data PKL"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {internship.status === 'WAITING_ACCEPTANCE_LETTER' && (
                          <div className="flex flex-row gap-2 w-full max-w-[200px] justify-center items-center">
                            <button
                                onClick={() => openIndividualPrintModal(internship)}
                                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Konfigurasi & Cetak Surat"
                            >
                                <Printer className="w-4 h-4" />
                            </button>

                            {internship.acceptanceLetterUrl ? (
                              <button
                                 onClick={() => openVerifyModal(internship)}
                                 className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors animate-pulse"
                                 title="Verifikasi & Approve (Surat Balasan Masuk)"
                              >
                                 <UserCheck className="w-4 h-4" />
                              </button>
                            ) : (
                              <div className="p-1.5 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed" title="Menunggu Upload Surat Balasan">
                                <Clock className="w-4 h-4" />
                              </div>
                            )}
                            <button 
                               onClick={() => handleDeleteClick(internship.id)}
                               className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                               title="Hapus Data PKL"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {internship.status === 'REJECTED' && (
                          <div className="flex flex-row gap-2 w-full max-w-[200px] justify-center items-center">
                            <button
                                onClick={() => openVerifyModal({...internship, forceReject: true})}
                                className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                title="Lihat Alasan Penolakan"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                            <button 
                               onClick={() => handleDeleteClick(internship.id)}
                               className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                               title="Hapus Data PKL"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {['APPROVED', 'ACTIVE', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED', 'DEFENSE_COMPLETED'].includes(internship.status) && (
                          <div className="flex flex-row gap-2 w-full max-w-[200px] justify-center items-center">
                               <button
                                 onClick={() => openAssignExaminerModal(internship)}
                                 className="p-1.5 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
                                 title="Tunjuk Penguji Sidang"
                               >
                                 <UserPlus className="w-4 h-4" />
                               </button>
                               <button
                                 onClick={() => openScheduleDefenseModal(internship)}
                                 className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                                 title="Jadwal Sidang"
                               >
                                 <CalendarClock className="w-4 h-4" />
                               </button>
                            {internship.reportUrl && (
                                <a 
                                   href={internship.reportUrl} 
                                   target="_blank" 
                                   rel="noreferrer"
                                   className="p-1.5 bg-teal-100 text-teal-600 rounded-lg hover:bg-teal-200 transition-colors"
                                   title="Lihat Laporan Akhir"
                                >
                                   <FileText className="w-4 h-4" />
                                </a>
                            )}
                            <button 
                               onClick={() => handleDeleteClick(internship.id)}
                               className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                               title="Hapus Data PKL"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span>Menampilkan {((meta.page - 1) * meta.limit) + 1} - {Math.min(meta.page * meta.limit, meta.total)} dari {meta.total} data</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium">Halaman {meta.page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= meta.total}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Verification Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl transform transition-all">
             <div className="flex flex-col items-center text-center gap-4">
               <div className="p-3 bg-red-100 rounded-full">
                 <AlertTriangle className="w-8 h-8 text-red-600" />
               </div>
               <div>
                 <h3 className="text-lg font-semibold text-gray-900">Konfirmasi Hapus</h3>
                 <p className="text-sm text-gray-500 mt-1">
                   Apakah Anda yakin ingin menghapus data PKL ini? Data yang dihapus tidak dapat dikembalikan.
                 </p>
               </div>
               <div className="flex gap-3 w-full mt-2">
                 <button
                   onClick={() => {
                     setIsDeleteModalOpen(false);
                     setDeleteTargetId(null);
                   }}
                   className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                 >
                   Batal
                 </button>
                 <button
                   onClick={confirmDelete}
                   className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm shadow-sm"
                 >
                   Ya, Hapus
                 </button>
               </div>
             </div>
          </div>
        </div>
      )}

      {isVerifyModalOpen && selectedInternship && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedInternship.forceReject ? 'Tolak Pengajuan' : 'Verifikasi & Approval PKL'}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* Status Info */}
              {!selectedInternship.forceReject && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Surat Balasan Dari Industri
                  </h4>
                  {selectedInternship.acceptanceLetterUrl ? (
                    <a 
                      href={selectedInternship.acceptanceLetterUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                    >
                      Lihat Dokumen Surat Balasan <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-red-500 text-sm">Belum ada dokumen diupload</span>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmitVerification} className="space-y-4">
                {/* Action Toggle */}
                {!selectedInternship.forceReject && (
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                        !isRejecting ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Setujui (Approve)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRejecting(true)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                        isRejecting ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Tolak (Reject)
                    </button>
                  </div>
                )}

                {isRejecting || selectedInternship.forceReject ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Alasan Penolakan <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                      rows={4}
                      placeholder="Jelaskan alasan penolakan..."
                      required
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pilih Guru Pembimbing <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedTeacherId}
                        onChange={(e) => setSelectedTeacherId(Number(e.target.value))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">-- Pilih Guru (Wajib) --</option>
                        {teachers.map((teacher: any) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Pembimbing Lapangan (Mentor)
                      </label>
                      <input
                        type="text"
                        value={mentorName}
                        onChange={(e) => setMentorName(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: Bpk. Supriyadi (Opsional)"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        No. HP Mentor
                      </label>
                      <input
                        type="tel"
                        value={mentorPhone}
                        onChange={(e) => setMentorPhone(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: 08123456789 (Opsional)"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Latitude Perusahaan
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={companyLatitude}
                          onChange={(e) => setCompanyLatitude(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="-6.200000"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Longitude Perusahaan
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={companyLongitude}
                          onChange={(e) => setCompanyLongitude(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="106.816666"
                        />
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
                      <strong>Info Latitude & Longitude:</strong> Data koordinat lokasi perusahaan (Geolokasi). Bersifat opsional, digunakan untuk keperluan pemetaan lokasi magang siswa.
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={updateStatusMutation.isPending}
                    className={`flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 flex justify-center items-center gap-2 ${
                      isRejecting || selectedInternship.forceReject 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {updateStatusMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isRejecting || selectedInternship.forceReject ? 'Konfirmasi Tolak' : 'Konfirmasi Setuju'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assign Examiner Modal */}
      {isAssignExaminerModalOpen && selectedInternship && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Tunjuk Penguji Sidang</h3>
                <button onClick={() => setIsAssignExaminerModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAssignExaminer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pilih Penguji <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer flex justify-between items-center text-sm"
                      onClick={() => setIsExaminerDropdownOpen((open) => !open)}
                    >
                      <span className={selectedExaminerId ? 'text-gray-900' : 'text-gray-500'}>
                        {selectedExaminerId
                          ? examiners.find((t: any) => t.id === selectedExaminerId)?.name || 'Pilih Penguji'
                          : 'Pilih Penguji'}
                      </span>
                      <ChevronDown size={16} className="text-gray-500" />
                    </div>
                    {isExaminerDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                          <input
                            type="text"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="Cari penguji..."
                            value={examinerSearch}
                            onChange={(e) => setExaminerSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        </div>
                        {filteredExaminers.map((t: any) => {
                          const isSelected = selectedExaminerId === t.id;
                          return (
                            <div
                              key={t.id}
                              className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                                isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedExaminerId(t.id);
                                setIsExaminerDropdownOpen(false);
                                setExaminerSearch('');
                              }}
                            >
                              {t.name}
                            </div>
                          );
                        })}
                        {filteredExaminers.length === 0 && (
                          <div className="px-3 py-2 text-gray-500 text-sm text-center">
                            Penguji tidak ditemukan
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={assignExaminerMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {assignExaminerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Defense Modal */}
      {isScheduleDefenseModalOpen && selectedInternship && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Jadwal Sidang PKL</h3>
                <button onClick={() => setIsScheduleDefenseModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleScheduleDefense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal & Waktu Sidang <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={defenseDate}
                    onChange={(e) => setDefenseDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ruangan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={defenseRoom}
                    onChange={(e) => setDefenseRoom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: Lab Komputer 1"
                    required
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={scheduleDefenseMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {scheduleDefenseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Jadwal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Print Config Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">
                  Konfigurasi Cetak Surat
                </h3>
                <button onClick={() => setIsPrintModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nomor Surat
                    </label>
                    <input
                      type="text"
                      value={printConfig.letterNumber}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, letterNumber: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Contoh: 421.5/PKL-KOL/SMK/2026"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lampiran
                    </label>
                    <input
                      type="text"
                      value={printConfig.attachment}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, attachment: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="-"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Perihal
                    </label>
                    <input
                      type="text"
                      value={printConfig.subject}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tanggal Surat
                    </label>
                    <input
                      type="date"
                      value={printConfig.date}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teks Pembuka
                  </label>
                  <textarea
                    value={printConfig.openingText}
                    onChange={(e) => setPrintConfig(prev => ({ ...prev, openingText: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-sans text-sm"
                    rows={8}
                    placeholder="Masukkan teks pembuka surat..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teks Penutup
                  </label>
                  <textarea
                    value={printConfig.closingText}
                    onChange={(e) => setPrintConfig(prev => ({ ...prev, closingText: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-sans text-sm"
                    rows={4}
                    placeholder="Masukkan teks penutup surat..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jarak Tanda Tangan (Baris)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={printConfig.signatureSpace}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, signatureSpace: Number(e.target.value) }))}
                      className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="useBarcode"
                        checked={printConfig.useBarcode}
                        onChange={(e) => setPrintConfig(prev => ({ ...prev, useBarcode: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="useBarcode" className="text-sm text-gray-700 select-none cursor-pointer">
                        Gunakan Tanda Tangan Barcode (QR Code)
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Sesuaikan jarak untuk barcode (Default: 5). Jika barcode aktif, jarak akan disesuaikan otomatis.</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Contact Person (Footer)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveContactPersons}
                        className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
                        title="Simpan sebagai default untuk cetak berikutnya"
                      >
                        <Save className="w-4 h-4" /> Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintConfig(prev => ({
                          ...prev,
                          contactPersons: [...prev.contactPersons, { name: '', phone: '' }]
                        }))}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Tambah
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {printConfig.contactPersons.map((cp, index) => (
                      <div key={index} className="flex gap-2 items-start bg-gray-50 p-2 rounded-lg border">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            placeholder="Nama Contact Person"
                            value={cp.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrintConfig(prev => ({
                                ...prev,
                                contactPersons: prev.contactPersons.map((item, i) => 
                                  i === index ? { ...item, name: val } : item
                                )
                              }));
                            }}
                            className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="No. HP / WhatsApp"
                            value={cp.phone}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrintConfig(prev => ({
                                ...prev,
                                contactPersons: prev.contactPersons.map((item, i) => 
                                  i === index ? { ...item, phone: val } : item
                                )
                              }));
                            }}
                            className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newCps = printConfig.contactPersons.filter((_, i) => i !== index);
                            setPrintConfig(prev => ({ ...prev, contactPersons: newCps }));
                          }}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {printConfig.contactPersons.length === 0 && (
                      <div className="text-center py-3 text-sm text-gray-400 border border-dashed rounded-lg">
                        Belum ada Contact Person
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  onClick={executePrint}
                  disabled={isPrinting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {isPrinting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cetak Surat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual Print Modal */}
      {isIndividualPrintModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Edit className="w-5 h-5 text-blue-600" />
                    Konfigurasi Surat PKL
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Sesuaikan detail surat untuk <span className="font-bold">{selectedInternship?.student?.name}</span> di <span className="font-bold">{selectedInternship?.companyName}</span>
                  </p>
                </div>
                <button onClick={() => setIsIndividualPrintModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nomor Surat</label>
                    <input
                      type="text"
                      value={printConfig.letterNumber}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, letterNumber: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Lampiran</label>
                    <input
                      type="text"
                      value={printConfig.attachment}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, attachment: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tgl Surat</label>
                    <input
                      type="date"
                      value={printConfig.date}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Perihal</label>
                    <input
                      type="text"
                      value={printConfig.subject}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Isi Konten (Pembuka)</label>
                    <textarea
                      value={printConfig.openingText}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, openingText: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-h-[150px]"
                    />
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Isi Konten (Penutup)</label>
                    <textarea
                      value={printConfig.closingText}
                      onChange={(e) => setPrintConfig(prev => ({ ...prev, closingText: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-h-[150px]"
                    />
                  </div>
                </div>

                {/* Signature and Barcode Section */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Tanda Tangan & Barcode</label>
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jarak Tanda Tangan (Baris)</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={printConfig.signatureSpace}
                        onChange={(e) => setPrintConfig(prev => ({ ...prev, signatureSpace: Number(e.target.value) }))}
                        className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <input
                        type="checkbox"
                        id="useBarcodeIndividual"
                        checked={printConfig.useBarcode}
                        onChange={(e) => setPrintConfig(prev => ({ ...prev, useBarcode: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="useBarcodeIndividual" className="text-sm font-medium text-gray-700 select-none cursor-pointer">
                        Gunakan Tanda Tangan Barcode (QR Code)
                      </label>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 italic">* Jika barcode aktif, jarak tanda tangan akan disesuaikan otomatis agar presisi.</p>
                </div>

                {/* Contact Person Section */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-3 border-b pb-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase">
                      Contact Person (Footer)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveContactPersons}
                        className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 font-bold"
                        title="Simpan sebagai default untuk cetak berikutnya"
                      >
                        <Save className="w-3.5 h-3.5" /> Simpan Default
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintConfig(prev => ({
                          ...prev,
                          contactPersons: [...prev.contactPersons, { name: '', phone: '' }]
                        }))}
                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-bold"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah CP
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {printConfig.contactPersons.map((cp, index) => (
                      <div key={index} className="flex gap-2 items-start bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            placeholder="Nama Contact Person"
                            value={cp.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrintConfig(prev => ({
                                ...prev,
                                contactPersons: prev.contactPersons.map((item, i) => 
                                  i === index ? { ...item, name: val } : item
                                )
                              }));
                            }}
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="No. HP / WhatsApp"
                            value={cp.phone}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrintConfig(prev => ({
                                ...prev,
                                contactPersons: prev.contactPersons.map((item, i) => 
                                  i === index ? { ...item, phone: val } : item
                                )
                              }));
                            }}
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newCps = printConfig.contactPersons.filter((_, i) => i !== index);
                            setPrintConfig(prev => ({ ...prev, contactPersons: newCps }));
                          }}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {printConfig.contactPersons.length === 0 && (
                      <div className="col-span-full text-center py-4 text-xs text-gray-400 border border-dashed rounded-lg bg-gray-50">
                        Belum ada Contact Person yang ditambahkan.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => setIsIndividualPrintModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold"
                >
                  Batal
                </button>
                <button
                  onClick={handleExecuteIndividualPrint}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2 font-bold shadow-lg"
                >
                  <Printer className="w-5 h-5" />
                  Cetak Surat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Iframe (Legacy - Can be removed later) */}
    </div>
  );
};
