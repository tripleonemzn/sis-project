import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { majorService, type Major } from '../../services/major.service';
import {
  workProgramService,
  type AdditionalDuty,
  type WorkProgram,
  type WorkProgramItem,
  type WorkProgramExecutionStatus,
} from '../../services/workProgram.service';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import { osisService } from '../../services/osis.service';
import {
  budgetRequestService,
  type BudgetRequest,
} from '../../services/budgetRequest.service';
import {
  budgetLpjService,
  type LpjInvoiceStatus,
} from '../../services/budgetLpj.service';
import { authService } from '../../services/auth.service';
import { liveQueryOptions } from '../../lib/query/liveQuery';
import {
  getAdvisorEquipmentLabel,
  getAdvisorEquipmentTitle,
  isAdvisorDuty,
  resolveTutorCompatibleDuty,
} from '../../utils/advisorDuty';
import { z } from 'zod';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2,
  Trash2,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Settings,
  Save,
  AlertTriangle,
  UploadCloud,
  ClipboardList,
  Wrench,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const getExecutionStatusMeta = (status: WorkProgramExecutionStatus | null | undefined) => {
  if (status === 'BELUM_TERLAKSANA') {
    return {
      label: 'Belum Terlaksana',
      className: 'bg-amber-100 text-amber-800',
    };
  }
  return {
    label: 'Terlaksana',
    className: 'bg-emerald-100 text-emerald-800',
  };
};

const formatCurrency = (value: number) => `Rp ${Math.max(0, value).toLocaleString('id-ID')}`;

const getLatestLpjInvoice = (budget: BudgetRequest) => {
  const invoices = [...(budget.lpjInvoices || [])];
  if (invoices.length === 0) {
    return null;
  }
  invoices.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
  return invoices[0];
};

const getLpjSummaryForBudget = (budget: BudgetRequest) => {
  const latestInvoice = getLatestLpjInvoice(budget);
  const realizedAmount = (latestInvoice?.items || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  return {
    invoiceCount: budget.lpjInvoices?.length || 0,
    latestInvoice,
    realizedAmount,
    remainingAmount: Math.max(Number(budget.totalAmount || 0) - realizedAmount, 0),
  };
};

const getLpjStatusMeta = (budget: BudgetRequest): {
  label: string;
  className: string;
  note: string;
} => {
  if (budget.status !== 'APPROVED') {
    return {
      label: budget.status === 'REJECTED' ? 'Pengajuan Ditolak' : 'Menunggu Persetujuan',
      className:
        budget.status === 'REJECTED'
          ? 'bg-red-100 text-red-700 border-red-200'
          : 'bg-amber-100 text-amber-700 border-amber-200',
      note:
        budget.status === 'REJECTED'
          ? budget.rejectionReason || 'Ajukan ulang anggaran agar LPJ bisa dibuat.'
          : 'LPJ baru dapat dibuat setelah anggaran disetujui.',
    };
  }

  if (!budget.realizationConfirmedAt) {
    return {
      label: 'Menunggu Konfirmasi Realisasi',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
      note: 'Keuangan perlu mengonfirmasi realisasi sebelum LPJ pembelanjaan disusun.',
    };
  }

  const latestInvoice = getLatestLpjInvoice(budget);
  if (!latestInvoice) {
    return {
      label: 'Siap Buat LPJ',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      note: 'Anggaran sudah direalisasikan. Guru dapat mulai menyusun invoice LPJ.',
    };
  }

  const statusMap: Record<
    LpjInvoiceStatus,
    { label: string; className: string; note: string }
  > = {
    DRAFT: {
      label: 'Draft LPJ',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      note: 'Invoice masih bisa dilengkapi sebelum dikirim ke Wakasek Sarpras.',
    },
    SUBMITTED_TO_SARPRAS: {
      label: 'Review Sarpras',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      note: 'Invoice sedang direview oleh Wakasek Sarpras.',
    },
    RETURNED: {
      label: 'Perlu Revisi',
      className: 'bg-red-100 text-red-700 border-red-200',
      note: 'Invoice dikembalikan Sarpras. Lengkapi item atau file pendukung.',
    },
    APPROVED_BY_SARPRAS: {
      label: 'Disetujui Sarpras',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      note: 'Invoice sudah lolos verifikasi Sarpras.',
    },
    SENT_TO_FINANCE: {
      label: 'Dikirim ke Keuangan',
      className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      note: 'Invoice menunggu tindak lanjut dari staff keuangan.',
    },
    PROCESSING_FINANCE: {
      label: 'Diproses Keuangan',
      className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      note: 'Keuangan sedang memproses audit/realisasi akhir.',
    },
    COMPLETED: {
      label: 'LPJ Selesai',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      note: 'LPJ pembelanjaan selesai dan arsip siap dipantau.',
    },
    RETURNED_BY_FINANCE: {
      label: 'Revisi dari Keuangan',
      className: 'bg-red-100 text-red-700 border-red-200',
      note: 'Invoice dikembalikan oleh keuangan untuk dilengkapi ulang.',
    },
  };

  return statusMap[latestInvoice.status];
};

const itemSchema = z.object({
  description: z.string().min(1, 'Deskripsi kegiatan wajib diisi'),
  targetDate: z.string().optional(),
  note: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const createProgramSchema = z.object({
  title: z.string().min(1, 'Nama program kerja wajib diisi'),
  description: z.string().optional(),
  majorId: z.string().optional(),
  semester: z.enum(['ODD', 'EVEN']),
  month: z.coerce.number().min(1).max(12).optional(),
  startMonth: z.union([
    z.coerce.number().min(1).max(12),
    z.string().length(0),
    z.null(),
    z.undefined()
  ]).transform(v => (v === '' || v === null || v === undefined) ? undefined : Number(v)),
  endMonth: z.union([
    z.coerce.number().min(1).max(12),
    z.string().length(0),
    z.null(),
    z.undefined()
  ]).transform(v => (v === '' || v === null || v === undefined) ? undefined : Number(v)),
  startWeek: z.coerce.number().min(1).max(5).optional(),
  endWeek: z.coerce.number().min(1).max(5).optional(),
});

type CreateProgramFormValues = z.infer<typeof createProgramSchema>;

const createBudgetRequestSchema = z.object({
  toolName: z.string().optional(),
  description: z.string().min(1, 'Uraian/Keterangan wajib diisi'),
  executionTime: z.string().optional(),
  brand: z.string().optional(),
  quantity: z.coerce.number().min(1, 'QTY minimal 1'),
  unitPrice: z.coerce.number().min(0, 'Harga satuan tidak boleh negatif'),
});

type CreateBudgetRequestFormValues = z.infer<typeof createBudgetRequestSchema>;

const ADDITIONAL_DUTY_LABELS: Record<AdditionalDuty, string> = {
  WAKASEK_KURIKULUM: 'Wakasek Kurikulum',
  SEKRETARIS_KURIKULUM: 'Sekretaris Kurikulum',
  WAKASEK_KESISWAAN: 'Wakasek Kesiswaan',
  SEKRETARIS_KESISWAAN: 'Sekretaris Kesiswaan',
  WAKASEK_SARPRAS: 'Wakasek Sarpras',
  SEKRETARIS_SARPRAS: 'Sekretaris Sarpras',
  WAKASEK_HUMAS: 'Wakasek Humas',
  SEKRETARIS_HUMAS: 'Sekretaris Humas',
  KAPROG: 'Kepala Kompetensi Keahlian',
  WALI_KELAS: 'Wali Kelas',
  PEMBINA_OSIS: 'Pembina OSIS',
  PEMBINA_EKSKUL: 'Pembina Ekstrakurikuler',
  KEPALA_LAB: 'Kepala Laboratorium',
  KEPALA_PERPUSTAKAAN: 'Kepala Perpustakaan',
  TIM_BOS: 'Tim BOS',
  BENDAHARA: 'Bendahara',
  BP_BK: 'BP/BK',
};

const DEFAULT_MONTHS_CONFIG = [
  { name: 'Juli', weeks: 4 },
  { name: 'Agustus', weeks: 5 },
  { name: 'September', weeks: 4 },
  { name: 'Oktober', weeks: 4 },
  { name: 'November', weeks: 5 },
  { name: 'Desember', weeks: 4 },
  { name: 'Januari', weeks: 4 },
  { name: 'Februari', weeks: 4 },
  { name: 'Maret', weeks: 5 },
  { name: 'April', weeks: 4 },
  { name: 'Mei', weeks: 5 },
  { name: 'Juni', weeks: 4 },
];

interface WeekConfig {
  name: string;
  weeks: number;
}




export const WorkProgramPage = () => {
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5,
  });

  const user = meData?.data;
  
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<WorkProgram | null>(null);
  const [selectedDuty, setSelectedDuty] = useState<AdditionalDuty | ''>(
    (searchParams.get('duty') as AdditionalDuty) || ''
  );
  const [selectedMajor, setSelectedMajor] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN' | ''>('');
  const [activeTab, setActiveTab] = useState<'PROGRAM' | 'BUDGET'>(
    (searchParams.get('tab') as 'PROGRAM' | 'BUDGET') || 'PROGRAM'
  );
  const [budgetSectionTab, setBudgetSectionTab] = useState<'REQUEST' | 'LPJ'>(
    () => (searchParams.get('section') === 'LPJ' ? 'LPJ' : 'REQUEST'),
  );
  const isTutorRole = user?.role === 'EXTRACURRICULAR_TUTOR';
  const isAdvisorEquipmentDuty = isAdvisorDuty(selectedDuty);
  const advisorEquipmentLabel = getAdvisorEquipmentLabel(selectedDuty);
  const advisorEquipmentTitle = getAdvisorEquipmentTitle(selectedDuty);
  const budgetRequestTitle = isAdvisorEquipmentDuty
    ? `Pengajuan ${advisorEquipmentTitle}`
    : 'Pengajuan Anggaran';
  const budgetCreateActionLabel = isAdvisorEquipmentDuty
    ? `Ajukan ${advisorEquipmentTitle}`
    : 'Ajukan Anggaran';
  const budgetDeleteTitle = isAdvisorEquipmentDuty
    ? `Hapus Pengajuan ${advisorEquipmentTitle}?`
    : 'Hapus Pengajuan Anggaran?';
  const budgetDeleteMessage = isAdvisorEquipmentDuty
    ? `Data pengajuan ${advisorEquipmentLabel} akan dihapus permanen!`
    : 'Data pengajuan anggaran akan dihapus permanen!';
  const [isWeekConfigOpen, setIsWeekConfigOpen] = useState(false);
  const [weekConfig, setWeekConfig] = useState<WeekConfig[]>(() => {
    try {
      const saved = localStorage.getItem('workProgramWeekConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_MONTHS_CONFIG.length) {
          return parsed.map((cfg: WeekConfig, idx: number) => ({
            ...cfg,
            name: DEFAULT_MONTHS_CONFIG[idx].name,
          }));
        }
      }
    } catch (error) {
      console.error('Error parsing week config:', error);
    }
    return DEFAULT_MONTHS_CONFIG;
  });

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleTabChange = (tab: 'PROGRAM' | 'BUDGET') => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', tab);
      if (tab !== 'BUDGET') {
        params.delete('section');
      } else {
        params.set('section', budgetSectionTab);
      }
      return params;
    }, { replace: true });
  };

  const handleBudgetSectionChange = (section: 'REQUEST' | 'LPJ') => {
    setActiveTab('BUDGET');
    setBudgetSectionTab(section);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', 'BUDGET');
      params.set('section', section);
      return params;
    }, { replace: true });
  };

  useEffect(() => {
    const requestedTab = searchParams.get('tab') === 'BUDGET' ? 'BUDGET' : 'PROGRAM';
    if (requestedTab !== activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(requestedTab);
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (activeTab !== 'BUDGET') return;
    const requestedSection = searchParams.get('section') === 'LPJ' ? 'LPJ' : 'REQUEST';
    if (requestedSection !== budgetSectionTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBudgetSectionTab(requestedSection);
    }
  }, [searchParams, activeTab, budgetSectionTab]);

  useEffect(() => {
    if (activeTab !== 'BUDGET' && budgetSectionTab !== 'REQUEST') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBudgetSectionTab('REQUEST');
    }
  }, [activeTab, budgetSectionTab]);

  const handleSaveWeekConfig = (newConfig: WeekConfig[]) => {
    setWeekConfig(newConfig);
    localStorage.setItem('workProgramWeekConfig', JSON.stringify(newConfig));
    setIsWeekConfigOpen(false);
    toast.success('Konfigurasi minggu berhasil disimpan');
  };
  
  useEffect(() => {
    const dutyParam = searchParams.get('duty');
    const tabParam = searchParams.get('tab');
    const sectionParam = searchParams.get('section');
    const assignmentIdParam = searchParams.get('assignmentId');
    const ekskulIdParam = searchParams.get('ekskulId');
    const academicYearIdParam = searchParams.get('academicYearId');
    const availableDuties = Array.isArray(user?.additionalDuties)
      ? user.additionalDuties
          .map((item) => String(item || '').trim().toUpperCase())
          .filter(Boolean) as AdditionalDuty[]
      : [];
    if (isTutorRole) {
      const requestedTutorDuty = resolveTutorCompatibleDuty(dutyParam);
      const normalizedTab = tabParam === 'BUDGET' ? 'BUDGET' : 'PROGRAM';
      const normalizedSection = sectionParam === 'LPJ' ? 'LPJ' : 'REQUEST';
      if (dutyParam !== requestedTutorDuty || selectedDuty !== requestedTutorDuty || !tabParam) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedDuty(requestedTutorDuty);
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          params.set('duty', requestedTutorDuty);
          if (assignmentIdParam) params.set('assignmentId', assignmentIdParam);
          if (ekskulIdParam) params.set('ekskulId', ekskulIdParam);
          if (academicYearIdParam) params.set('academicYearId', academicYearIdParam);
          params.set('tab', normalizedTab);
          if (normalizedTab === 'BUDGET') {
            params.set('section', normalizedSection);
          } else {
            params.delete('section');
          }
          return params;
        }, { replace: true });
      }
      return;
    }

    const normalizedRequestedDuty = String(dutyParam || '').trim().toUpperCase() as AdditionalDuty;
    const hasRequestedDuty =
      Boolean(normalizedRequestedDuty) && availableDuties.includes(normalizedRequestedDuty);

    if (hasRequestedDuty) {
      if (selectedDuty !== normalizedRequestedDuty) {
        setSelectedDuty(normalizedRequestedDuty);
      }
      return;
    }

    if (dutyParam && !hasRequestedDuty) {
      const fallbackDuty =
        (selectedDuty && availableDuties.includes(selectedDuty) ? selectedDuty : '') ||
        (availableDuties[0] as AdditionalDuty | undefined) ||
        '';
      if (!fallbackDuty) return;
      if (selectedDuty !== fallbackDuty) {
        setSelectedDuty(fallbackDuty);
      }
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('duty', fallbackDuty);
        return params;
      }, { replace: true });
      return;
    }

    if (!selectedDuty && availableDuties.length > 0) {
      const firstDuty = availableDuties[0] as AdditionalDuty;
      if (firstDuty) {
        setSelectedDuty(firstDuty);
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          params.set('duty', firstDuty);
          return params;
        }, { replace: true });
      }
    }
  }, [isTutorRole, searchParams, selectedDuty, setSearchParams, user]);

  const [editingItem, setEditingItem] = useState<WorkProgramItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();
  const activeYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0) || null;
  const activeAcademicYearName = String(activeAcademicYear?.name || '').trim();

  const { data: majorsData } = useQuery({
    queryKey: ['majors', 'all'],
    queryFn: () => majorService.list({ page: 1, limit: 100 }),
  });

  const majors: Major[] = useMemo(
    () => majorsData?.majors || majorsData?.data?.majors || [],
    [majorsData]
  );

  const { data: teacherAssignmentsData } = useQuery({
    queryKey: ['teacher-assignments-major-fallback', user?.id, activeYearId],
    queryFn: () => {
      if (!activeYearId || !user?.id) {
        return Promise.resolve({
          data: {
            assignments: [],
            pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
          },
        });
      }
      return teacherAssignmentService.list({
        academicYearId: activeYearId,
        teacherId: Number(user.id),
        limit: 100,
      });
    },
    enabled: !!user?.id && !!activeYearId,
    staleTime: 1000 * 60 * 5,
  });

  const fallbackMajorIdsFromAssignments = useMemo(() => {
    const assignments = teacherAssignmentsData?.data?.assignments || [];
    const set = new Set<number>();
    assignments.forEach((a) => {
      const id = a?.class?.major?.id;
      if (id) set.add(Number(id));
    });
    return set;
  }, [teacherAssignmentsData]);

  const allowedMajors: Major[] = useMemo(() => {
    if (selectedDuty === 'KAPROG') {
      const managedArr = Array.isArray(user?.managedMajors) ? user.managedMajors : [];
      if (managedArr.length === 0) {
        return [];
      }
      const managedIds = new Set<number>(managedArr.map((m) => Number(m.id)));
      return majors.filter((m) => managedIds.has(Number(m.id)));
    }

    const combinedIds = new Set<number>();
    fallbackMajorIdsFromAssignments.forEach((id) => combinedIds.add(Number(id)));
    if (combinedIds.size > 0) {
      return majors.filter((m) => combinedIds.has(Number(m.id)));
    }
    return majors;
  }, [majors, user, fallbackMajorIdsFromAssignments, selectedDuty]);

  useEffect(() => {
    if (!user) return;
    console.log('[WorkProgramPage Debug]', {
      username: user.username,
      additionalDuties: user.additionalDuties,
      managedMajors: user.managedMajors,
      managedMajorIds: user?.managedMajorIds,
      selectedDuty,
      majorsCount: majors.length,
      allowedMajors: allowedMajors.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
      })),
    });
  }, [user, selectedDuty, majors, allowedMajors]);

  useEffect(() => {
    const isKakomUser =
      Array.isArray(user?.additionalDuties) && user.additionalDuties.includes('KAPROG');
    if (!isKakomUser && selectedMajor && selectedDuty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMajor('');
    }
  }, [user, selectedDuty, selectedMajor]);

  // Dynamic Title Logic
  const pageTitle = useMemo(() => {
    if (!selectedDuty) return 'Program Kerja (v2.1)';
    
    const dutyLabel = ADDITIONAL_DUTY_LABELS[selectedDuty] || selectedDuty;
    
    // If duty is KAPROG, append major name if selected or inferred
    if (selectedDuty === 'KAPROG') {
      // Resolve effective major from selection or allowed list
      let major: Major | undefined;
      const managedArr = Array.isArray(user?.managedMajors) ? user.managedMajors : [];
      const managedIdsArr = Array.isArray(user?.managedMajorIds) ? user.managedMajorIds : [];
      const singleManagedId = user?.managedMajorId || user?.managedMajor?.id;
      const allowedIds = new Set<number>([
        ...managedArr.map((m) => Number(m.id)),
        ...managedIdsArr.map((mid) => Number(mid)),
        ...(singleManagedId ? [Number(singleManagedId)] : []),
      ]);
      const preferredManagedId =
        user?.managedMajorId ||
        user?.managedMajor?.id ||
        (Array.isArray(user?.managedMajors) && user.managedMajors.length === 1 ? Number(user.managedMajors[0]?.id) : undefined);
      if (preferredManagedId) {
        major = majors.find((m) => m.id === Number(preferredManagedId));
      } else if (allowedIds.size === 1) {
        const onlyId = Array.from(allowedIds)[0];
        major = majors.find((m) => m.id === Number(onlyId));
      } else if (selectedMajor) {
        const id = parseInt(selectedMajor);
        if (allowedIds.has(id)) {
          major = majors.find(m => m.id === id);
        }
      }
      
      if (major) {
        return `Program Kerja ${dutyLabel} ${major.name}`;
      }
    }
    
    return `Program Kerja ${dutyLabel}`;
  }, [selectedDuty, selectedMajor, majors, user]);

  const { data: osisWorkProgramReadinessResponse } = useQuery({
    queryKey: ['osis-work-program-readiness', activeYearId, selectedDuty],
    queryFn: () => osisService.getWorkProgramReadiness(activeYearId ? { academicYearId: activeYearId } : undefined),
    enabled: !!activeYearId && selectedDuty === 'PEMBINA_OSIS',
    ...liveQueryOptions,
  });

  const osisWorkProgramReadiness = osisWorkProgramReadinessResponse?.data || null;
  const isOsisWorkProgramLocked =
    selectedDuty === 'PEMBINA_OSIS' && !osisWorkProgramReadiness?.canCreatePrograms;

  const startYear = useMemo(() => {
    if (!activeYearId || !activeAcademicYearName) return new Date().getFullYear();
    const parsed = parseInt(activeAcademicYearName.split('/')[0], 10);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
  }, [activeAcademicYearName, activeYearId]);

  const getProgramSchedule = (program: WorkProgram & { month?: number | null; startMonth?: number | null; endMonth?: number | null; startWeek?: number | null; endWeek?: number | null }) => {
    const schedule = new Set<number>();
    
    if (program.startMonth && program.endMonth && program.startWeek && program.endWeek) {
        const startIndex = program.startMonth >= 7 ? program.startMonth - 7 : program.startMonth + 5;
        const endIndex = program.endMonth >= 7 ? program.endMonth - 7 : program.endMonth + 5;
        if (startIndex >= 0 && startIndex < 12 && endIndex >= 0 && endIndex < 12) {
            for (let mi = startIndex; mi <= endIndex; mi++) {
                let globalOffset = 0;
                for (let i = 0; i < mi; i++) {
                    globalOffset += weekConfig[i].weeks;
                }
                const weeksInMonth = weekConfig[mi].weeks;
                const startW = mi === startIndex ? program.startWeek : 1;
                const endW = mi === endIndex ? program.endWeek : weeksInMonth;
                for (let w = startW; w <= endW; w++) {
                    schedule.add(globalOffset + (w - 1));
                }
            }
        }
        return schedule;
    }
    // Logic 1: Use direct month/week fields if available (New way)
    if (program.month && program.startWeek && program.endWeek) {
        let monthIndex = -1;
        if (program.month >= 7) {
            monthIndex = program.month - 7;
        } else {
            monthIndex = program.month + 5;
        }

        if (monthIndex >= 0 && monthIndex < 12) {
             let globalOffset = 0;
             for (let i = 0; i < monthIndex; i++) {
                globalOffset += weekConfig[i].weeks;
             }
             
             // Add range from startWeek to endWeek
             for (let w = program.startWeek; w <= program.endWeek; w++) {
                 schedule.add(globalOffset + (w - 1));
             }
        }
        return schedule;
    }

    // Logic 2: Fallback to item target dates (Legacy way)
    program.items.forEach((item) => {
      if (item.targetDate) {
        const date = new Date(item.targetDate);
        const month = date.getMonth();
        const year = date.getFullYear();
        
        let monthIndex = -1;
        if (year === startYear && month >= 6) {
          monthIndex = month - 6;
        } else if (year === startYear + 1 && month <= 5) {
          monthIndex = month + 6;
        }
        
        if (monthIndex !== -1) {
          const day = date.getDate();
          let weekOfMonth = Math.ceil(day / 7);
          const config = weekConfig[monthIndex];
          if (weekOfMonth > config.weeks) weekOfMonth = config.weeks;
          
          let globalOffset = 0;
          for (let i = 0; i < monthIndex; i++) {
            globalOffset += weekConfig[i].weeks;
          }
          schedule.add(globalOffset + (weekOfMonth - 1));
        }
      }
    });
    return schedule;
  };

  const { data, isLoading: isLoadingPrograms } = useQuery({
    queryKey: [
      'work-programs',
      page,
      limit,
      debouncedSearch,
      activeYearId,
      selectedDuty,
      selectedMajor,
      selectedSemester,
    ],
    queryFn: () =>
      workProgramService.list({
        page,
        limit,
        search: debouncedSearch,
        academicYearId: activeYearId ?? undefined,
        additionalDuty: selectedDuty || null,
        majorId: selectedMajor ? parseInt(selectedMajor) : undefined,
        semester: selectedSemester || undefined,
    }),
    enabled: !!activeYearId,
    ...liveQueryOptions,
  });

  const programs: WorkProgram[] = (data?.data?.programs || []).sort((a: WorkProgram, b: WorkProgram) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const pagination = data?.data?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const selectedProgramId = selectedProgram?.id;

  useEffect(() => {
    if (!selectedProgramId) return;
    const updated = programs.find((program) => program.id === selectedProgramId);
    if (updated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedProgram(updated);
    }
  }, [programs, selectedProgramId]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [lpjModal, setLpjModal] = useState<{
    isOpen: boolean;
    budget: BudgetRequest | null;
  }>({
    isOpen: false,
    budget: null,
  });

  const {
    register: registerEditItem,
    handleSubmit: handleSubmitEditItem,
    reset: resetEditItemForm,
    setValue: setEditItemValue,
    formState: { errors: editItemErrors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      description: '',
      targetDate: '',
      note: '',
    },
  });

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreateForm,
    setValue: setValueCreate,
    formState: { errors: createErrors },
  } = useForm<CreateProgramFormValues>({
    resolver: zodResolver(createProgramSchema) as Resolver<CreateProgramFormValues>,
    defaultValues: {
      title: '',
      description: '',
      majorId: '',
      semester: undefined,
      month: undefined,
      startMonth: undefined,
      endMonth: undefined,
      startWeek: undefined,
      endWeek: undefined,
    },
  });

  const createProgramMutation = useMutation({
    mutationFn: async (data: CreateProgramFormValues) => {
      if (!activeYearId) throw new Error('Tahun ajaran aktif tidak ditemukan');
      if (!selectedDuty) throw new Error('Tugas tambahan tidak ditemukan dari filter aktif');
      let finalMajorId: number | undefined = data.majorId ? parseInt(data.majorId) : undefined;
      if (selectedDuty === 'KAPROG') {
        const allowedIds = new Set<number>(
          allowedMajors.map((m) => Number(m.id)),
        );
        const selectedId = selectedMajor ? parseInt(selectedMajor) : undefined;

        if (allowedIds.size > 0) {
          if (allowedMajors.length > 1) {
            if (!selectedId || !allowedIds.has(selectedId)) {
              throw new Error('Silakan pilih kompetensi terlebih dahulu');
            }
            finalMajorId = selectedId;
          } else if (allowedMajors.length === 1) {
            const only = allowedMajors[0];
            if (only?.id && allowedIds.has(Number(only.id))) {
              finalMajorId = Number(only.id);
            } else if (selectedId && allowedIds.has(selectedId)) {
              finalMajorId = selectedId;
            } else {
              finalMajorId = undefined;
            }
          }
        }
      }

      const payload = {
        title: data.title,
        description: data.description,
        academicYearId: activeYearId,
        additionalDuty: selectedDuty, // Use selectedDuty from state
        majorId: finalMajorId,
        semester: data.semester,
        month: data.startMonth ?? data.month,
        startMonth: data.startMonth,
        endMonth: data.endMonth ?? data.startMonth, // Default to startMonth if endMonth is empty
        startWeek: data.startWeek,
        endWeek: data.endWeek,
      };

      try {
        const res = await workProgramService.create(payload);
        return res;
      } catch (err: unknown) {
        const errResponse = err as {
          response?: {
            status?: number;
            data?: { message?: string };
          };
        };
        const msg = errResponse.response?.data?.message || '';
        const status = errResponse.response?.status;
        if (status === 403 && /jurusan/i.test(msg)) {
          const retryRes = await workProgramService.create({ ...payload, majorId: undefined });
          return retryRes;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      toast.success('Program kerja berhasil dibuat');
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat program kerja');
    },
  });

  const openCreateProgramModal = () => {
    if (isOsisWorkProgramLocked) {
      toast.error(
        osisWorkProgramReadiness?.message ||
          'Program kerja OSIS belum bisa dibuat sebelum pemilihan dan transisi kepengurusan selesai.',
      );
      return;
    }
    setIsCreateModalOpen(true);
  };

  const onSubmitCreate = (values: CreateProgramFormValues) => {
    createProgramMutation.mutate(values);
  };

  useEffect(() => {
    if (selectedDuty !== 'KAPROG') return;
    if (!allowedMajors.length) return;

    const currentId = selectedMajor ? Number(selectedMajor) : undefined;
    const allowedIds = allowedMajors.map((m) => Number(m.id));
    if (currentId && allowedIds.includes(currentId)) return;

    const defaultMajor =
      allowedMajors.find(
        (m) =>
          typeof m.name === 'string' &&
          m.name.toLowerCase().includes('akuntansi'),
      ) ||
      allowedMajors.find(
        (m) =>
          typeof m.code === 'string' &&
          String(m.code).toUpperCase() === 'AK',
      ) ||
      allowedMajors[0];

    if (defaultMajor?.id) {
      const idStr = String(defaultMajor.id);
      if (selectedMajor !== idStr) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedMajor(idStr);
      }
    }
  }, [selectedDuty, allowedMajors, selectedMajor]);

  useEffect(() => {
    if (editingItem) {
      setEditItemValue('description', editingItem.description);
      setEditItemValue(
        'targetDate',
        editingItem.targetDate
          ? editingItem.targetDate.toString().split('T')[0]
          : '',
      );
      setEditItemValue('note', editingItem.note || '');
    } else {
      resetEditItemForm();
    }
  }, [editingItem, setEditItemValue, resetEditItemForm]);

  // Update create form when selectedMajor changes or modal opens
  useEffect(() => {
    if (selectedDuty !== 'KAPROG') return;

    if (selectedMajor) {
      setValueCreate('majorId', selectedMajor);
    } else if (allowedMajors.length === 1 && allowedMajors[0]?.id) {
      setValueCreate('majorId', String(allowedMajors[0].id));
    } else {
      setValueCreate('majorId', '');
    }
  }, [selectedDuty, selectedMajor, setValueCreate, isCreateModalOpen, allowedMajors]);

  const deleteProgramMutation = useMutation({
    mutationFn: (id: number) => workProgramService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      toast.success('Program kerja dihapus');
      setSelectedProgram(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus program kerja');
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      data: payload,
    }: {
      itemId: number;
      data: Partial<ItemFormValues & { isCompleted?: boolean }>;
    }) => workProgramService.updateItem(itemId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      toast.success('Kegiatan berhasil diperbarui');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui kegiatan');
    },
  });

  const {
    data: budgetRequestsData,
    isLoading: isLoadingBudgets,
  } = useQuery({
    queryKey: ['budget-requests', activeYearId, selectedDuty],
    queryFn: () =>
      budgetRequestService.list({
        academicYearId: activeYearId ?? undefined,
        additionalDuty: selectedDuty || undefined,
    }),
    enabled: !!activeYearId && activeTab === 'BUDGET',
    ...liveQueryOptions,
  });

  const budgetRequests = useMemo<BudgetRequest[]>(() => {
    if (Array.isArray(budgetRequestsData?.data)) {
      return budgetRequestsData.data;
    }
    if (Array.isArray(budgetRequestsData)) {
      return budgetRequestsData;
    }
    return [];
  }, [budgetRequestsData]);
  const displayedBudgetRequests = budgetRequests;
  const lpjBudgets = useMemo(
    () => displayedBudgetRequests.filter((budget) => budget.status !== 'REJECTED'),
    [displayedBudgetRequests],
  );
  const lpjSummary = useMemo(() => {
    const approvedBudgets = lpjBudgets.filter((budget) => budget.status === 'APPROVED');
    const readyBudgets = approvedBudgets.filter(
      (budget) => budget.realizationConfirmedAt && !getLatestLpjInvoice(budget),
    );
    const inProgressBudgets = approvedBudgets.filter((budget) => {
      const latestInvoice = getLatestLpjInvoice(budget);
      return latestInvoice && latestInvoice.status !== 'COMPLETED';
    });
    const completedBudgets = approvedBudgets.filter(
      (budget) => getLatestLpjInvoice(budget)?.status === 'COMPLETED',
    );

    return {
      approvedCount: approvedBudgets.length,
      readyCount: readyBudgets.length,
      inProgressCount: inProgressBudgets.length,
      completedCount: completedBudgets.length,
    };
  }, [lpjBudgets]);

  const {
    register: registerNewBudget,
    handleSubmit: handleSubmitNewBudget,
    reset: resetNewBudgetForm,
    control: newBudgetControl,
    setValue: setNewBudgetValue,
    formState: { errors: newBudgetErrors },
  } = useForm<CreateBudgetRequestFormValues>({
    resolver: zodResolver(createBudgetRequestSchema) as Resolver<CreateBudgetRequestFormValues>,
    defaultValues: {
      toolName: '',
      description: '',
      executionTime: '',
      brand: '',
      quantity: 1,
      unitPrice: 0,
    },
  });

  const [watchedNewBudgetQty, watchedNewBudgetPrice] = useWatch({
    control: newBudgetControl,
    name: ['quantity', 'unitPrice'],
  });

  useEffect(() => {
    if (!isAdvisorEquipmentDuty) return;
    setNewBudgetValue('quantity', 1);
    setNewBudgetValue('unitPrice', 0);
  }, [isAdvisorEquipmentDuty, setNewBudgetValue]);

  const newBudgetQty = Number(watchedNewBudgetQty || 0);
  const newBudgetPrice = isAdvisorEquipmentDuty ? 0 : Number(watchedNewBudgetPrice || 0);
  const newBudgetTotal = newBudgetQty * newBudgetPrice;

  const createBudgetRequestMutation = useMutation({
    mutationFn: (data: CreateBudgetRequestFormValues) => {
      if (!activeYearId) throw new Error('Tahun ajaran aktif tidak ditemukan');
      if (!selectedDuty) throw new Error('Tugas tambahan tidak ditemukan');
      const equipmentName = String(data.toolName || '').trim();
      if (isAdvisorEquipmentDuty && !equipmentName) {
        throw new Error('Nama alat wajib diisi');
      }

      const quantity = isAdvisorEquipmentDuty ? 1 : Math.max(1, Number(data.quantity || 1));
      const unitPrice = isAdvisorEquipmentDuty ? 0 : Number(data.unitPrice || 0);
      const totalAmount = quantity * unitPrice;
      const description = String(data.description || '').trim();
      const title = isAdvisorEquipmentDuty ? equipmentName : description;
      const brand = String(data.brand || '').trim();
      const executionTime = String(data.executionTime || '').trim();

      return budgetRequestService.create({
        title,
        description,
        executionTime: executionTime || undefined,
        brand: brand || undefined,
        quantity,
        unitPrice,
        totalAmount,
        academicYearId: activeYearId,
        additionalDuty: selectedDuty,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success(
        isAdvisorEquipmentDuty
          ? `Pengajuan ${advisorEquipmentLabel} berhasil dibuat`
          : 'Pengajuan anggaran berhasil dibuat',
      );
      setIsBudgetModalOpen(false);
      resetNewBudgetForm();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat pengajuan anggaran');
    },
  });

  const deleteBudgetRequestMutation = useMutation({
    mutationFn: (id: number) => budgetRequestService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success('Pengajuan anggaran dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus pengajuan anggaran');
    },
  });

  const uploadInvoiceFileMutation = useMutation({
    mutationFn: (payload: { invoiceId: number; file: File }) =>
      budgetLpjService.uploadInvoiceFile(payload.invoiceId, payload.file),
    onSuccess: () => {
      toast.success('File invoice LPJ berhasil diunggah');
      if (lpjModal.budget?.id) {
        queryClient.invalidateQueries({
          queryKey: ['budget-lpj', lpjModal.budget.id],
        });
      }
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengunggah file invoice LPJ');
    },
  });

  const uploadProofFileMutation = useMutation({
    mutationFn: (payload: { invoiceId: number; file: File }) =>
      budgetLpjService.uploadProofFile(payload.invoiceId, payload.file),
    onSuccess: () => {
      toast.success('File bukti LPJ berhasil diunggah');
      if (lpjModal.budget?.id) {
        queryClient.invalidateQueries({
          queryKey: ['budget-lpj', lpjModal.budget.id],
        });
      }
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengunggah file bukti LPJ');
    },
  });

  const lpjBudgetId = lpjModal.budget?.id ?? null;

  const {
    data: lpjData,
    isLoading: isLoadingLpj,
  } = useQuery({
    queryKey: ['budget-lpj', lpjBudgetId],
    queryFn: () => {
      if (!lpjBudgetId) {
        throw new Error('LPJ belum dipilih');
      }
      return budgetLpjService.listByBudgetRequest(lpjBudgetId);
    },
    enabled: !!lpjBudgetId && lpjModal.isOpen,
    ...liveQueryOptions,
  });

  const lpjInvoices = lpjData?.data.invoices || [];

  const [newLpjInvoiceTitle, setNewLpjInvoiceTitle] = useState('');
  const [newLpjItemDescription, setNewLpjItemDescription] = useState('');
  const [newLpjItemBrand, setNewLpjItemBrand] = useState('');
  const [newLpjItemQty, setNewLpjItemQty] = useState(1);
  const [newLpjItemUnitPrice, setNewLpjItemUnitPrice] = useState(0);

  const createLpjInvoiceMutation = useMutation({
    mutationFn: (payload: { budgetRequestId: number; title?: string }) =>
      budgetLpjService.createInvoice(payload),
    onSuccess: () => {
      if (lpjBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjBudgetId] });
      }
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      setNewLpjInvoiceTitle('');
      toast.success('Invoice LPJ berhasil dibuat');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat invoice LPJ');
    },
  });

  const createLpjItemMutation = useMutation({
    mutationFn: (payload: {
      lpjInvoiceId: number;
      description: string;
      brand?: string;
      quantity: number;
      unitPrice: number;
    }) => budgetLpjService.createItem(payload),
    onSuccess: () => {
      if (lpjBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjBudgetId] });
      }
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      setNewLpjItemDescription('');
      setNewLpjItemBrand('');
      setNewLpjItemQty(1);
      setNewLpjItemUnitPrice(0);
      toast.success('Item LPJ berhasil ditambahkan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menambahkan item LPJ');
    },
  });

  const deleteLpjItemMutation = useMutation({
    mutationFn: (id: number) => budgetLpjService.deleteItem(id),
    onSuccess: () => {
      if (lpjBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjBudgetId] });
      }
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success('Item LPJ dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus item LPJ');
    },
  });

  const submitLpjInvoiceMutation = useMutation({
    mutationFn: (id: number) => budgetLpjService.submitInvoiceToSarpras(id),
    onSuccess: () => {
      if (lpjBudgetId) {
        queryClient.invalidateQueries({ queryKey: ['budget-lpj', lpjBudgetId] });
      }
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success('Invoice LPJ diajukan ke Wakasek Sarpras');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengajukan invoice LPJ');
    },
  });

  const onSubmitEditItem = (values: ItemFormValues) => {
    if (!editingItem) {
      return;
    }
    updateItemMutation.mutate(
      {
        itemId: editingItem.id,
        data: values,
      },
      {
        onSuccess: () => {
          setEditingItem(null);
          resetEditItemForm();
        },
      },
    );
  };

  const isLoading = isLoadingActiveAcademicYear || isLoadingPrograms;

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-500 text-sm">Kelola program kerja dan anggaran untuk tugas tambahan Anda.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'PROGRAM' && (
            <button
              onClick={() => setIsWeekConfigOpen(true)}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
            >
              <Settings className="w-4 h-4 mr-2" />
              Konfigurasi Kalender
            </button>
          )}
          {!(activeTab === 'BUDGET' && budgetSectionTab === 'LPJ') && (
            <button
              onClick={() =>
                activeTab === 'PROGRAM'
                  ? openCreateProgramModal()
                  : setIsBudgetModalOpen(true)
              }
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              {activeTab === 'PROGRAM' ? 'Tambah Program' : budgetCreateActionLabel}
            </button>
          )}
        </div>
      </div>

      {!isLoadingActiveAcademicYear && !activeYearId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar program kerja tidak ambigu.
        </div>
      ) : null}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        {isTutorRole ? (
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto gap-4 pb-1">
              <button
                type="button"
                onClick={() => handleTabChange('PROGRAM')}
                className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                  activeTab === 'PROGRAM'
                    ? 'border-blue-600 text-blue-600 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                Program Kerja
              </button>
              <button
                type="button"
                onClick={() => handleBudgetSectionChange('REQUEST')}
                className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                  activeTab === 'BUDGET' && budgetSectionTab === 'REQUEST'
                    ? 'border-blue-600 text-blue-600 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Wrench className="w-4 h-4 mr-2" />
                {budgetRequestTitle}
              </button>
              <button
                type="button"
                onClick={() => handleBudgetSectionChange('LPJ')}
                className={`inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors ${
                  activeTab === 'BUDGET' && budgetSectionTab === 'LPJ'
                    ? 'border-blue-600 text-blue-600 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FileText className="w-4 h-4 mr-2" />
                LPJ Anggaran
              </button>
            </div>
          </div>
        ) : (
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
            <button
              onClick={() => handleTabChange('PROGRAM')}
              className={`
                inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
                ${activeTab === 'PROGRAM'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              Program Kerja
            </button>
            <button
              onClick={() => handleBudgetSectionChange('REQUEST')}
              className={`
                inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
                ${activeTab === 'BUDGET' && budgetSectionTab === 'REQUEST'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              <Wrench className="w-4 h-4 mr-2" />
              {budgetRequestTitle}
            </button>
            <button
              onClick={() => handleBudgetSectionChange('LPJ')}
              className={`
                inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
                ${activeTab === 'BUDGET' && budgetSectionTab === 'LPJ'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              <FileText className="w-4 h-4 mr-2" />
              LPJ Anggaran
            </button>
          </div>
          </div>
        )}
      </div>

      {selectedDuty === 'PEMBINA_OSIS' && activeTab === 'PROGRAM' && (
        <div
          className={`rounded-2xl border px-4 py-4 ${
            isOsisWorkProgramLocked
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                isOsisWorkProgramLocked ? 'text-amber-600' : 'text-emerald-600'
              }`}
            />
            <div className="text-sm leading-6">
              <p
                className={`font-semibold ${
                  isOsisWorkProgramLocked ? 'text-amber-800' : 'text-emerald-800'
                }`}
              >
                Alur Program Kerja OSIS
              </p>
              <p className={isOsisWorkProgramLocked ? 'text-amber-700' : 'text-emerald-700'}>
                {osisWorkProgramReadiness?.message ||
                  'Program kerja OSIS akan mengikuti kesiapan periode kepengurusan aktif.'}
              </p>
              {osisWorkProgramReadiness?.activeManagementPeriod ? (
                <p className={`mt-1 ${isOsisWorkProgramLocked ? 'text-amber-700' : 'text-emerald-700'}`}>
                  Periode aktif:
                  {' '}
                  <span className="font-medium">{osisWorkProgramReadiness.activeManagementPeriod.title}</span>
                  {osisWorkProgramReadiness.activeManagementPeriod.transitionLabel &&
                  osisWorkProgramReadiness.activeManagementPeriod.transitionAt
                    ? ` • ${osisWorkProgramReadiness.activeManagementPeriod.transitionLabel} pada ${new Date(
                        osisWorkProgramReadiness.activeManagementPeriod.transitionAt,
                      ).toLocaleDateString('id-ID')}`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'PROGRAM' && (
        programs.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-4 bg-blue-50 rounded-full mb-4">
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Belum Ada Program Kerja</h3>
            <p className="text-gray-500 text-center max-w-sm mt-1 mb-6">
              Silakan konfigurasi jumlah minggu per bulan terlebih dahulu, lalu tambahkan program kerja baru.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsWeekConfigOpen(true)}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
              >
                <Settings className="w-4 h-4 mr-2" />
                Konfigurasi Kalender
              </button>
              <button
                onClick={() => openCreateProgramModal()}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Tambah Program
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between bg-gray-50/50">
                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <div className="relative w-fit max-w-[380px]">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={18} className="text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Cari nama program kerja..."
                        className="inline-block w-auto pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        value={search}
                        size={Math.max(20, (search?.length || 0) + 2)}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">Semester:</span>
                      <select
                        className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                        value={selectedSemester}
                        onChange={(e) =>
                          setSelectedSemester(e.target.value as 'ODD' | 'EVEN' | '')
                        }
                      >
                        <option value="">Semua Semester</option>
                        <option value="ODD">Ganjil</option>
                        <option value="EVEN">Genap</option>
                      </select>
                    </div>
                    {selectedDuty === 'KAPROG' && allowedMajors.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Kompetensi:</span>
                        <select
                          className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                          value={selectedMajor}
                          onChange={(e) => {
                            setSelectedMajor(e.target.value);
                            setPage(1);
                          }}
                        >
                          {allowedMajors.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Tampilkan:</label>
                    <select
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                      }}
                      className="px-2.5 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={35}>35</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>
                {isLoading ? (
                  <div className="py-16 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <div className="text-sm text-gray-600">
                        Total: <span className="font-medium">{pagination.total}</span> program kerja
                      </div>
                    </div>
                    <div className="overflow-x-auto border-t border-gray-300">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th
                              scope="col"
                              rowSpan={3}
                              className="sticky left-0 z-20 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[50px] border-r border-b border-gray-300"
                            >
                              No
                            </th>
                            <th
                              scope="col"
                              rowSpan={3}
                              className="sticky left-[50px] z-20 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px] border-r border-b border-gray-300"
                            >
                              Program Kerja
                            </th>
                            <th
                              colSpan={weekConfig.slice(0, 6).reduce((acc, m) => acc + m.weeks, 0)}
                              className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-b border-gray-300 bg-blue-50/50"
                            >
                              SEMESTER GANJIL
                            </th>
                            <th
                              colSpan={weekConfig.slice(6).reduce((acc, m) => acc + m.weeks, 0)}
                              className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-b border-gray-300 bg-green-50/50"
                            >
                              SEMESTER GENAP
                            </th>
                            <th
                              scope="col"
                              rowSpan={3}
                              className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-b border-gray-300"
                            >
                              Status
                            </th>
                            <th
                              scope="col"
                              rowSpan={3}
                              className="relative px-6 py-3 border-b border-gray-300"
                            >
                              <span className="sr-only">Aksi</span>
                            </th>
                          </tr>
                          <tr>
                            {weekConfig.map((month, idx) => (
                              <th
                                key={idx}
                                colSpan={month.weeks}
                                className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-b border-gray-300"
                              >
                                {month.name}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {weekConfig.flatMap((month, mIdx) =>
                              Array.from({ length: month.weeks }).map((_, wIdx) => (
                                <th
                                  key={`${mIdx}-${wIdx}`}
                                  className="px-1 py-1 text-center text-[10px] text-gray-400 font-medium border-r border-b border-gray-300 min-w-[26px]"
                                >
                                  {wIdx + 1}
                                </th>
                              )),
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-300">
                          {programs.length === 0 ? (
                            <tr>
                              <td
                                colSpan={
                                  selectedDuty === 'KAPROG'
                                    ? 4 + weekConfig.reduce((acc, c) => acc + c.weeks, 0)
                                    : 4 + weekConfig.reduce((acc, c) => acc + c.weeks, 0)
                                }
                                className="px-6 py-8 text-center text-sm text-gray-500"
                              >
                                {search
                                  ? 'Tidak ada program kerja yang cocok dengan pencarian'
                                  : 'Belum ada program kerja tugas tambahan.'}
                              </td>
                            </tr>
                          ) : (
                            programs.map((program, index) => {
                              const schedule = getProgramSchedule(program);
                              return (
                                <tr
                                  key={program.id}
                                  className={`hover:bg-gray-50 cursor-pointer ${
                                    selectedProgram?.id === program.id ? 'bg-blue-50/30' : ''
                                  }`}
                                  onClick={() => setSelectedProgram(program)}
                                >
                                  <td className="sticky left-0 bg-white px-6 py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-300 z-10">
                                    {(page - 1) * limit + index + 1}
                                  </td>
                                  <td className="sticky left-[50px] bg-white px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium border-r border-gray-300 text-left z-10">
                                    {program.title}
                                  </td>
                                  {weekConfig.flatMap((month, mIdx) => {
                                    const prevWeeks = weekConfig
                                      .slice(0, mIdx)
                                      .reduce((acc, c) => acc + c.weeks, 0);
                                    return Array.from({ length: month.weeks }).map((_, wIdx) => {
                                      const globalWeek = prevWeeks + wIdx;
                                      const isActive = schedule.has(globalWeek);
                                      return (
                                        <td
                                          key={`${mIdx}-${wIdx}`}
                                          className="relative border-r border-gray-300 p-0 min-w-[26px]"
                                        >
                                          {isActive ? (
                                            <div className="absolute left-[4px] right-[4px] top-[4px] bottom-[4px] rounded-xl bg-blue-500/80" />
                                          ) : null}
                                        </td>
                                      );
                                    });
                                  })}
                                  <td className="px-6 py-4 whitespace-nowrap border-l border-gray-300 text-center align-top">
                                    <div className="flex flex-col items-center w-full text-xs">
                                      {(() => {
                                        const executionMeta = getExecutionStatusMeta(
                                          program.executionStatus,
                                        );
                                        return (
                                          <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium mb-1 ${executionMeta.className}`}
                                          >
                                            {executionMeta.label}
                                          </span>
                                        );
                                      })()}
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium ${
                                          program.approvalStatus === 'APPROVED'
                                            ? 'bg-green-100 text-green-800'
                                            : program.approvalStatus === 'REJECTED'
                                              ? 'bg-red-100 text-red-800'
                                              : 'bg-yellow-100 text-yellow-800'
                                        }`}
                                      >
                                        {program.approvalStatus === 'APPROVED'
                                          ? 'Disetujui'
                                          : program.approvalStatus === 'REJECTED'
                                            ? 'Ditolak'
                                            : 'Menunggu'}
                                      </span>
                                      {program.approvalStatus === 'PENDING' &&
                                        program.assignedApprover && (
                                          <span className="mt-1 text-[11px] text-gray-500 max-w-[220px]">
                                            {(() => {
                                              const duties =
                                                program.assignedApprover?.additionalDuties || [];
                                              const isWakasekKurikulum = duties.includes(
                                                'WAKASEK_KURIKULUM',
                                              );
                                              const isWakasekKesiswaan = duties.includes(
                                                'WAKASEK_KESISWAAN',
                                              );
                                              const isPrincipal =
                                                program.assignedApprover?.role === 'PRINCIPAL';
                                              if (isWakasekKurikulum) {
                                                return 'Menunggu Wakasek Kurikulum';
                                              }
                                              if (isWakasekKesiswaan) {
                                                return 'Menunggu Wakasek Kesiswaan';
                                              }
                                              if (isPrincipal) {
                                                return 'Menunggu Kepala Sekolah';
                                              }
                                              return 'Menunggu persetujuan';
                                            })()}
                                          </span>
                                        )}
                                      {program.approvalStatus === 'REJECTED' && program.feedback && (
                                        <p className="mt-1 text-[11px] text-red-600 max-w-[220px] line-clamp-2">
                                          {program.feedback}
                                        </p>
                                      )}
                                      {program.executionStatus === 'BELUM_TERLAKSANA' &&
                                        program.nonExecutionReason && (
                                          <p className="mt-1 text-[11px] text-amber-700 max-w-[220px] line-clamp-2">
                                            Alasan: {program.nonExecutionReason}
                                          </p>
                                        )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmModal({
                                          isOpen: true,
                                          title: 'Hapus Program Kerja?',
                                          message:
                                            'Program kerja ini beserta semua kegiatan dan anggarannya akan dihapus permanen!',
                                          onConfirm: () => deleteProgramMutation.mutate(program.id),
                                        });
                                      }}
                                      className="text-red-600 hover:text-red-900"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <div className="text-sm text-gray-500">
                        Menampilkan{' '}
                        <span className="font-medium">
                          {pagination.total === 0 ? 0 : (page - 1) * limit + 1}
                        </span>{' '}
                        sampai{' '}
                        <span className="font-medium">
                          {Math.min(page * limit, pagination.total)}
                        </span>{' '}
                        dari{' '}
                        <span className="font-medium">{pagination.total}</span> data
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="p-2 border rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Sebelumnya"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPage((p) => Math.min(pagination.totalPages, p + 1))
                          }
                          disabled={page === pagination.totalPages}
                          className="p-2 border rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Berikutnya"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              
            </div>

          </div>
        )
      )}
      {lpjModal.isOpen && lpjModal.budget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setLpjModal({ isOpen: false, budget: null });
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="font-semibold text-gray-900">Kelola LPJ Anggaran</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {lpjModal.budget.description}
                </p>
              </div>
              <button
                onClick={() => {
                  setLpjModal({ isOpen: false, budget: null });
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {isLoadingLpj ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-xs text-gray-500">
                      <p>
                        Total Invoice LPJ:{' '}
                        <span className="font-semibold text-gray-700">{lpjInvoices.length}</span>
                      </p>
                    </div>
                    {lpjModal.budget.realizationConfirmedAt && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newLpjInvoiceTitle}
                          onChange={(e) => setNewLpjInvoiceTitle(e.target.value)}
                          placeholder="Judul invoice (opsional)"
                          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                        />
                        <button
                          type="button"
                          disabled={createLpjInvoiceMutation.isPending || !lpjModal.budget.id}
                          onClick={() => {
                            if (!lpjModal.budget?.id) return;
                            createLpjInvoiceMutation.mutate({
                              budgetRequestId: lpjModal.budget.id,
                              title: newLpjInvoiceTitle || undefined,
                            });
                          }}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                        >
                          {createLpjInvoiceMutation.isPending && (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          )}
                          Buat Invoice
                        </button>
                      </div>
                    )}
                  </div>
                  {lpjInvoices.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Belum ada invoice LPJ. Silakan buat invoice terlebih dahulu.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {lpjInvoices.map((invoice, index) => {
                        const canEditItems =
                          invoice.status === 'DRAFT' ||
                          invoice.status === 'RETURNED' ||
                          invoice.status === 'RETURNED_BY_FINANCE';
                        const isLast = index === lpjInvoices.length - 1;
                        return (
                          <div
                            key={invoice.id}
                            className="border border-gray-200 rounded-lg p-4 bg-gray-50/60"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {invoice.title || `Invoice #${index + 1}`}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Status:{' '}
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      invoice.status === 'APPROVED_BY_SARPRAS' ||
                                      invoice.status === 'COMPLETED'
                                        ? 'bg-green-100 text-green-800'
                                        : invoice.status === 'SUBMITTED_TO_SARPRAS' ||
                                          invoice.status === 'SENT_TO_FINANCE' ||
                                          invoice.status === 'PROCESSING_FINANCE'
                                          ? 'bg-blue-100 text-blue-800'
                                          : invoice.status === 'RETURNED' ||
                                            invoice.status === 'RETURNED_BY_FINANCE'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    {invoice.status === 'DRAFT' && 'Draft'}
                                    {invoice.status === 'SUBMITTED_TO_SARPRAS' &&
                                      'Diajukan ke Wakasek Sarpras'}
                                    {invoice.status === 'RETURNED' && 'Dikembalikan'}
                                    {invoice.status === 'APPROVED_BY_SARPRAS' && 'Disetujui Wakasek'}
                                    {invoice.status === 'SENT_TO_FINANCE' && 'Diteruskan ke Keuangan'}
                                    {invoice.status === 'PROCESSING_FINANCE' &&
                                      'Sedang diproses Keuangan'}
                                    {invoice.status === 'COMPLETED' &&
                                      'Selesai diproses Keuangan'}
                                    {invoice.status === 'RETURNED_BY_FINANCE' &&
                                      'Dikembalikan Keuangan'}
                                  </span>
                                </p>
                                {invoice.financeNote && (
                                  <p className="text-[11px] text-red-600 mt-1">
                                    Catatan keuangan: {invoice.financeNote}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex flex-wrap items-center gap-2 justify-end">
                                  <div className="flex items-center gap-1">
                                    <label className="inline-flex items-center px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 cursor-pointer">
                                      <UploadCloud className="w-3 h-3 mr-1" />
                                      {invoice.invoiceFileUrl ? 'Ganti Invoice' : 'Upload Invoice'}
                                      <input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          if (file.size > 500 * 1024) {
                                            toast.error('Ukuran file maksimal 500KB');
                                            e.target.value = '';
                                            return;
                                          }
                                          uploadInvoiceFileMutation.mutate({
                                            invoiceId: invoice.id,
                                            file,
                                          });
                                          e.target.value = '';
                                        }}
                                        disabled={!canEditItems}
                                      />
                                    </label>
                                    {invoice.invoiceFileUrl && (
                                      <a
                                        href={invoice.invoiceFileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100"
                                      >
                                        Lihat Invoice
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <label className="inline-flex items-center px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 cursor-pointer">
                                      <UploadCloud className="w-3 h-3 mr-1" />
                                      {invoice.proofFileUrl ? 'Ganti Bukti' : 'Upload Bukti'}
                                      <input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          if (file.size > 500 * 1024) {
                                            toast.error('Ukuran file maksimal 500KB');
                                            e.target.value = '';
                                            return;
                                          }
                                          uploadProofFileMutation.mutate({
                                            invoiceId: invoice.id,
                                            file,
                                          });
                                          e.target.value = '';
                                        }}
                                        disabled={!canEditItems}
                                      />
                                    </label>
                                    {invoice.proofFileUrl && (
                                      <a
                                        href={invoice.proofFileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100"
                                      >
                                        Lihat Bukti
                                      </a>
                                    )}
                                  </div>
                                </div>
                                {canEditItems && (
                                  <button
                                    type="button"
                                    disabled={submitLpjInvoiceMutation.isPending}
                                    onClick={() => submitLpjInvoiceMutation.mutate(invoice.id)}
                                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    {submitLpjInvoiceMutation.isPending && (
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    )}
                                    Ajukan ke Wakasek Sarpras
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      Barang
                                    </th>
                                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      Brand
                                    </th>
                                    <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      QTY
                                    </th>
                                    <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      Harga
                                    </th>
                                    <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      Jumlah
                                    </th>
                                    <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      Audit Sarpras
                                    </th>
                                    <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                      Aksi
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {invoice.items.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={7}
                                        className="px-3 py-3 text-xs text-gray-500 text-center"
                                      >
                                        Belum ada item pada invoice ini.
                                      </td>
                                    </tr>
                                  ) : (
                                    invoice.items.map((item) => (
                                      <tr key={item.id}>
                                        <td className="px-3 py-2 text-xs text-gray-900">
                                          {item.description}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-500">
                                          {item.brand || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-900 text-right">
                                          {item.quantity}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-900 text-right">
                                          Rp {item.unitPrice.toLocaleString('id-ID')}
                                        </td>
                                        <td className="px-3 py-2 text-xs font-semibold text-gray-900 text-right">
                                          Rp {item.amount.toLocaleString('id-ID')}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-center">
                                          {typeof item.isMatched === 'boolean' ? (
                                            <span
                                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                                item.isMatched
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : 'bg-red-100 text-red-800'
                                              }`}
                                            >
                                              {item.isMatched ? 'Sesuai' : 'Tidak Sesuai'}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-gray-400">
                                              Menunggu audit
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right">
                                          {canEditItems ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setConfirmModal({
                                                  isOpen: true,
                                                  title: 'Hapus Item LPJ?',
                                                  message:
                                                    'Data item LPJ akan dihapus permanen dari invoice ini.',
                                                  onConfirm: () =>
                                                    deleteLpjItemMutation.mutate(item.id),
                                                })
                                              }
                                              className="text-red-600 hover:text-red-900"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          ) : (
                                            <span className="text-[11px] text-gray-400">
                                              -
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {isLast && canEditItems && (
                              <form
                                className="mt-3 grid grid-cols-5 gap-2 items-end"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (!newLpjItemDescription.trim()) {
                                    toast.error('Nama barang wajib diisi');
                                    return;
                                  }
                                  if (newLpjItemQty <= 0) {
                                    toast.error('QTY minimal 1');
                                    return;
                                  }
                                  if (newLpjItemUnitPrice < 0) {
                                    toast.error('Harga satuan tidak boleh negatif');
                                    return;
                                  }
                                  createLpjItemMutation.mutate({
                                    lpjInvoiceId: invoice.id,
                                    description: newLpjItemDescription.trim(),
                                    brand: newLpjItemBrand || undefined,
                                    quantity: newLpjItemQty,
                                    unitPrice: newLpjItemUnitPrice,
                                  });
                                }}
                              >
                                <div className="col-span-2">
                                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                    Barang
                                  </label>
                                  <input
                                    type="text"
                                    value={newLpjItemDescription}
                                    onChange={(e) =>
                                      setNewLpjItemDescription(e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                                    placeholder="Nama barang"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                    Brand
                                  </label>
                                  <input
                                    type="text"
                                    value={newLpjItemBrand}
                                    onChange={(e) => setNewLpjItemBrand(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                                    placeholder="Merk"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                    QTY
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={newLpjItemQty}
                                    onChange={(e) =>
                                      setNewLpjItemQty(Number(e.target.value) || 0)
                                    }
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60 text-right"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                    Harga
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={newLpjItemUnitPrice}
                                    onChange={(e) =>
                                      setNewLpjItemUnitPrice(
                                        Number(e.target.value) || 0,
                                      )
                                    }
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60 text-right"
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="submit"
                                    disabled={createLpjItemMutation.isPending}
                                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    {createLpjItemMutation.isPending && (
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    )}
                                    Tambah Barang
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'BUDGET' && budgetSectionTab === 'LPJ' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-white border border-blue-100 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">
                Anggaran Disetujui
              </p>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                {lpjSummary.approvedCount}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Data pengajuan yang sudah lolos proses persetujuan.
              </p>
            </div>
            <div className="bg-white border border-cyan-100 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-cyan-700 font-semibold">
                Siap Disusun LPJ
              </p>
              <p className="text-2xl font-bold text-cyan-700 mt-1">{lpjSummary.readyCount}</p>
              <p className="text-xs text-gray-500 mt-1">
                Sudah dikonfirmasi realisasinya, tinggal buat invoice LPJ.
              </p>
            </div>
            <div className="bg-white border border-amber-100 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">
                Dalam Proses
              </p>
              <p className="text-2xl font-bold text-amber-700 mt-1">
                {lpjSummary.inProgressCount}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Sedang direview Sarpras atau diproses Keuangan.
              </p>
            </div>
            <div className="bg-white border border-emerald-100 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
                LPJ Selesai
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {lpjSummary.completedCount}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Dokumen pembelanjaan sudah selesai dan siap dipantau.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Anggaran / Program
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nilai Disetujui
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Realisasi
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Selisih
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status LPJ
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoadingBudgets ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-600" />
                      </td>
                    </tr>
                  ) : lpjBudgets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-6 text-center text-gray-500 text-sm">
                        Belum ada data anggaran yang bisa disusun LPJ pada tahun ajaran aktif.
                      </td>
                    </tr>
                  ) : (
                    lpjBudgets.map((budget, index) => {
                      const lpjMeta = getLpjStatusMeta(budget);
                      const lpjSummaryForBudget = getLpjSummaryForBudget(budget);
                      const canOpenLpj =
                        budget.status === 'APPROVED' && !!budget.realizationConfirmedAt;
                      const title = isAdvisorEquipmentDuty
                        ? budget.title || budget.description
                        : budget.description;

                      return (
                        <tr key={budget.id}>
                          <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <p className="font-semibold">{title}</p>
                            {budget.executionTime && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                Pelaksanaan: {budget.executionTime}
                              </p>
                            )}
                            {budget.workProgram?.title && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                Program kerja: {budget.workProgram.title}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <p className="font-semibold text-gray-900">
                              {formatCurrency(Number(budget.totalAmount || 0))}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {isAdvisorEquipmentDuty
                                ? `Pengajuan ${advisorEquipmentLabel}`
                                : `QTY ${budget.quantity} • ${formatCurrency(
                                    Number(budget.unitPrice || 0),
                                  )}`}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <p className="font-semibold text-gray-900">
                              {formatCurrency(lpjSummaryForBudget.realizedAmount)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {lpjSummaryForBudget.invoiceCount > 0
                                ? `${lpjSummaryForBudget.invoiceCount} invoice LPJ`
                                : 'Belum ada invoice'}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <p className="font-semibold text-gray-900">
                              {formatCurrency(lpjSummaryForBudget.remainingAmount)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Sisa dari nilai anggaran yang disetujui
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="space-y-1.5">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${lpjMeta.className}`}
                              >
                                {lpjMeta.label}
                              </span>
                              <p className="text-xs text-gray-500 max-w-xs">{lpjMeta.note}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              disabled={!canOpenLpj}
                              onClick={() => setLpjModal({ isOpen: true, budget })}
                              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1.5" />
                              Kelola LPJ
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {lpjBudgets.length > 0 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                <div className="text-right">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wider block mb-1">
                    Total Realisasi LPJ
                  </span>
                  <span className="text-xl font-bold text-emerald-700">
                    {formatCurrency(
                      lpjBudgets.reduce((sum, budget) => {
                        const summary = getLpjSummaryForBudget(budget);
                        return sum + summary.realizedAmount;
                      }, 0),
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'BUDGET' && budgetSectionTab === 'REQUEST' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {isAdvisorEquipmentDuty ? `Nama ${advisorEquipmentTitle}` : 'Uraian/Kegiatan'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {isAdvisorEquipmentDuty ? 'Keterangan' : 'Waktu Pelaksanaan'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {isAdvisorEquipmentDuty ? 'Merk' : 'Brand'}
                    </th>
                    {!isAdvisorEquipmentDuty && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          QTY
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Harga Satuan
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Jumlah
                        </th>
                      </>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoadingBudgets ? (
                    <tr>
                      <td
                        colSpan={isAdvisorEquipmentDuty ? 6 : 9}
                        className="px-6 py-4 text-center"
                      >
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                      </td>
                    </tr>
                  ) : displayedBudgetRequests.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdvisorEquipmentDuty ? 6 : 9}
                        className="px-6 py-4 text-center text-gray-500 text-sm"
                      >
                        Belum ada pengajuan anggaran
                      </td>
                    </tr>
                  ) : (
                    displayedBudgetRequests.map((budget, index) => (
                      <tr key={budget.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {isAdvisorEquipmentDuty ? budget.title || budget.description : budget.description}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {isAdvisorEquipmentDuty ? budget.description || '-' : budget.executionTime || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {budget.brand || '-'}
                        </td>
                        {!isAdvisorEquipmentDuty && (
                          <>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {budget.quantity}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              Rp {budget.unitPrice.toLocaleString('id-ID')}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              Rp {budget.totalAmount.toLocaleString('id-ID')}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                budget.status === 'APPROVED'
                                  ? 'bg-green-100 text-green-800'
                                  : budget.status === 'REJECTED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {budget.status === 'APPROVED'
                                ? 'Disetujui'
                                : budget.status === 'REJECTED'
                                  ? 'Ditolak'
                                  : 'Menunggu'}
                            </span>
                            {budget.status === 'REJECTED' && budget.rejectionReason && (
                              <p className="text-[11px] text-red-600 max-w-xs whitespace-pre-line">
                                {budget.rejectionReason}
                              </p>
                            )}
                            {budget.status === 'PENDING' && budget.approver && (
                              <span className="text-[11px] text-gray-500">
                                {(() => {
                                  const duties = budget.approver?.additionalDuties || [];
                                  const isSarpras =
                                    duties.includes('WAKASEK_SARPRAS') ||
                                    duties.includes('SEKRETARIS_SARPRAS');
                                  const isKesiswaan =
                                    duties.includes('WAKASEK_KESISWAAN') ||
                                    duties.includes('SEKRETARIS_KESISWAAN');
                                  const isPrincipal = budget.approver?.role === 'PRINCIPAL';
                                  const isFinance =
                                    budget.approver?.role === 'STAFF' ||
                                    duties.includes('BENDAHARA');
                                  if (isKesiswaan) return 'Menunggu Wakasek Kesiswaan';
                                  if (isSarpras) return 'Menunggu Wakasek Sarpras';
                                  if (isPrincipal) return 'Menunggu Kepala Sekolah';
                                  if (isFinance) return 'Menunggu Bendahara / Keuangan';
                                  return 'Menunggu persetujuan';
                                })()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: budgetDeleteTitle,
                                  message: budgetDeleteMessage,
                                  onConfirm: () =>
                                    deleteBudgetRequestMutation.mutate(budget.id),
                                });
                              }}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {displayedBudgetRequests.length > 0 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end items-center">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">
                    {isAdvisorEquipmentDuty
                      ? `Total Pengajuan ${advisorEquipmentTitle}`
                      : 'Total Pengajuan Anggaran'}
                  </span>
                  {isAdvisorEquipmentDuty ? (
                    <span className="text-sm font-semibold text-gray-600">
                      {displayedBudgetRequests.length} item
                    </span>
                  ) : (
                    <span className="text-xl font-bold text-blue-600">
                      Rp{' '}
                      {displayedBudgetRequests
                        .reduce(
                          (sum, item) => sum + item.totalAmount,
                          0,
                        )
                        .toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      

      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setEditingItem(null);
            resetEditItemForm();
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Edit Kegiatan</h3>
              <button
                onClick={() => {
                  setEditingItem(null);
                  resetEditItemForm();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={handleSubmitEditItem(onSubmitEditItem)}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deskripsi Kegiatan
                </label>
                <input
                  type="text"
                  {...registerEditItem('description')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
                {editItemErrors.description && (
                  <p className="text-xs text-red-500 mt-1">
                    {editItemErrors.description.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Tanggal
                </label>
                <input
                  type="date"
                  {...registerEditItem('targetDate')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Catatan
                </label>
                <textarea
                  rows={3}
                  {...registerEditItem('note')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    resetEditItemForm();
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updateItemMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {updateItemMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => {
          setIsCreateModalOpen(false);
          resetCreateForm();
        }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">
                Tambah Program Kerja
              </h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  resetCreateForm();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitCreate((data) => onSubmitCreate(data))} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedDuty === 'PEMBINA_OSIS' ? 'Program / Agenda OSIS' : 'Program Kerja'}
                </label>
                <input
                  type="text"
                  {...registerCreate('title')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  placeholder={
                    selectedDuty === 'PEMBINA_OSIS'
                      ? 'Contoh: Rapat koordinasi bidang atau program kerja bakti OSIS'
                      : 'Contoh: Proses Pengadaan alat praktik'
                  }
                />
                {createErrors.title && (
                  <p className="text-xs text-red-500 mt-1">
                    {createErrors.title.message}
                  </p>
                )}
              </div>

              {selectedDuty === 'PEMBINA_OSIS' ? (
                <div className={`rounded-xl border px-3 py-3 text-xs ${
                  isOsisWorkProgramLocked
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}>
                  {osisWorkProgramReadiness?.message ||
                    'Program kerja OSIS mengikuti kesiapan periode kepengurusan aktif.'}
                </div>
              ) : null}

              {selectedDuty === 'KAPROG' && allowedMajors.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kompetensi
                  </label>
                  <select
                    value={selectedMajor}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedMajor(value);
                      setValueCreate('majorId', value || '');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  >
                    <option value="">Pilih Kompetensi</option>
                    {allowedMajors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">
                   Pilih Semester
                 </label>
                 <select
                   {...registerCreate('semester')}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                 >
                   <option value="">Pilih Semester</option>
                   <option value="ODD">Ganjil</option>
                   <option value="EVEN">Genap</option>
                 </select>
                 {createErrors.semester && (
                   <p className="text-xs text-red-500 mt-1">
                     {createErrors.semester.message}
                   </p>
                 )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rentang Bulan (Mulai)
                    </label>
                    <select
                      {...registerCreate('startMonth')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    >
                      <option value="">Pilih Bulan</option>
                      {weekConfig.map((m, idx) => {
                         let monthNum = 0;
                         if (idx <= 5) monthNum = idx + 7;
                         else monthNum = idx - 5;
                         
                         return (
                           <option key={idx} value={monthNum}>{m.name}</option>
                         );
                      })}
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rentang Bulan (Selesai)
                    </label>
                    <select
                      {...registerCreate('endMonth')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    >
                      <option value="">Pilih Bulan</option>
                      {weekConfig.map((m, idx) => {
                         let monthNum = 0;
                         if (idx <= 5) monthNum = idx + 7;
                         else monthNum = idx - 5;
                         
                         return (
                           <option key={idx} value={monthNum}>{m.name}</option>
                         );
                      })}
                    </select>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minggu ke
                    </label>
                    <select
                      {...registerCreate('startWeek')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    >
                      <option value="">Pilih Minggu</option>
                      {[1, 2, 3, 4, 5].map((w) => (
                        <option key={w} value={w}>Minggu ke-{w}</option>
                      ))}
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sampai minggu ke
                    </label>
                    <select
                      {...registerCreate('endWeek')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    >
                      <option value="">Pilih Minggu</option>
                      {[1, 2, 3, 4, 5].map((w) => (
                        <option key={w} value={w}>Minggu ke-{w}</option>
                      ))}
                    </select>
                 </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deskripsi (Opsional)
                </label>
                <textarea
                  {...registerCreate('description')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 resize-none"
                  placeholder="Tambahkan detail program kerja..."
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    resetCreateForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createProgramMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createProgramMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => {
            setIsBudgetModalOpen(false);
            resetNewBudgetForm();
          }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">
                {budgetCreateActionLabel}
              </h3>
              <button
                onClick={() => {
                  setIsBudgetModalOpen(false);
                  resetNewBudgetForm();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitNewBudget((data) => createBudgetRequestMutation.mutate(data))} className="p-6 space-y-4">
              {isAdvisorEquipmentDuty ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nama {advisorEquipmentTitle}
                    </label>
                    <input
                      type="text"
                      {...registerNewBudget('toolName')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      placeholder="Contoh: Perlengkapan kegiatan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Merk
                    </label>
                    <input
                      type="text"
                      {...registerNewBudget('brand')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      placeholder="Contoh: Spesifikasi / merek"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Keterangan
                    </label>
                    <textarea
                      {...registerNewBudget('description')}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 resize-none"
                      placeholder="Alasan pengajuan, spesifikasi singkat, atau kebutuhan kegiatan."
                    />
                    {newBudgetErrors.description && (
                      <p className="text-xs text-red-500 mt-1">{newBudgetErrors.description.message}</p>
                    )}
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600">
                      Pengajuan {advisorEquipmentLabel} tidak membutuhkan input harga pada tahap ini.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Uraian/Kegiatan
                    </label>
                    <textarea
                      {...registerNewBudget('description')}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 resize-none"
                      placeholder="Contoh: Pembelian Laptop untuk Lab"
                    />
                    {newBudgetErrors.description && (
                      <p className="text-xs text-red-500 mt-1">{newBudgetErrors.description.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Waktu Pelaksanaan
                      </label>
                      <input
                        type="text"
                        {...registerNewBudget('executionTime')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                        placeholder="Contoh: Juli 2024"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Brand / Merk
                      </label>
                      <input
                        type="text"
                        {...registerNewBudget('brand')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                        placeholder="Contoh: Asus/Lenovo"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        QTY
                      </label>
                      <input
                        type="number"
                        min="1"
                        {...registerNewBudget('quantity', { valueAsNumber: true })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Harga Satuan (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        {...registerNewBudget('unitPrice', { valueAsNumber: true })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total Jumlah</span>
                    <span className="text-lg font-bold text-blue-600">
                      Rp {newBudgetTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsBudgetModalOpen(false);
                    resetNewBudgetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createBudgetRequestMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createBudgetRequestMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {isAdvisorEquipmentDuty ? budgetCreateActionLabel : 'Ajukan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isWeekConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => setIsWeekConfigOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">
                Konfigurasi Kalender Program Kerja
              </h3>
              <button
                onClick={() => setIsWeekConfigOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                Atur jumlah minggu efektif untuk setiap bulan. Konfigurasi ini akan digunakan untuk menentukan layout tabel program kerja.
              </div>
              
              <div className="space-y-4">
                {weekConfig.map((config, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="font-medium text-gray-700 w-24">{config.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">Jumlah Minggu:</span>
                      <select
                        value={config.weeks}
                        onChange={(e) => {
                          const newWeeks = parseInt(e.target.value);
                          const newConfig = [...weekConfig];
                          newConfig[index] = { ...newConfig[index], weeks: newWeeks };
                          setWeekConfig(newConfig);
                        }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 bg-white"
                      >
                        {[4, 5].map((w) => (
                          <option key={w} value={w}>{w} Minggu</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  setWeekConfig(DEFAULT_MONTHS_CONFIG); // Reset to default
                }}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors mr-auto"
              >
                Reset Default
              </button>
              <button
                onClick={() => setIsWeekConfigOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleSaveWeekConfig(weekConfig)}
                className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Simpan Konfigurasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/10" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
          <div className="relative bg-white border border-gray-300 shadow-lg w-full max-w-[400px] rounded p-0">
            <div className="p-4 flex gap-3">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 leading-6">
                  {confirmModal.title}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {confirmModal.message}
                </p>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex justify-end gap-2 border-t border-gray-200 rounded-b">
              <button
                type="button"
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 border border-blue-600 rounded hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>


    </>
  );
};
