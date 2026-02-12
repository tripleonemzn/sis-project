import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../services/academicYear.service';
import { majorService, type Major } from '../../services/major.service';
import {
  workProgramService,
  type AdditionalDuty,
  type WorkProgram,
  type WorkProgramItem,
} from '../../services/workProgram.service';
import {
  budgetRequestService,
  type BudgetRequest,
} from '../../services/budgetRequest.service';
import { authService } from '../../services/auth.service';
import { z } from 'zod';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2,
  Trash2,
  Search,
  Calendar,
  CheckCircle2,
  Circle,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const itemSchema = z.object({
  description: z.string().min(1, 'Deskripsi kegiatan wajib diisi'),
  targetDate: z.string().optional(),
  note: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const budgetSchema = z.object({
  description: z.string().min(1, 'Deskripsi anggaran wajib diisi'),
  amount: z.number().min(0, 'Jumlah anggaran tidak boleh negatif'),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

const createProgramSchema = z.object({
  title: z.string().min(1, 'Nama program kerja wajib diisi'),
  description: z.string().optional(),
  majorId: z.string().optional(),
  semester: z.enum(['ODD', 'EVEN']),
  month: z.coerce.number().min(1).max(12).optional(),
  startWeek: z.coerce.number().min(1).max(5).optional(),
  endWeek: z.coerce.number().min(1).max(5).optional(),
});

type CreateProgramFormValues = z.infer<typeof createProgramSchema>;

const createBudgetRequestSchema = z.object({
  description: z.string().min(1, 'Uraian/Kegiatan wajib diisi'),
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

const MONTHS_CONFIG = [
  { name: 'Juli', weeks: 4 },
  { name: 'Agst', weeks: 5 },
  { name: 'Sept', weeks: 4 },
  { name: 'Okt', weeks: 4 },
  { name: 'Nop', weeks: 5 },
  { name: 'Des', weeks: 4 },
  { name: 'Jan', weeks: 4 },
  { name: 'Feb', weeks: 4 },
  { name: 'Mar', weeks: 5 },
  { name: 'Apr', weeks: 4 },
  { name: 'Mei', weeks: 5 },
  { name: 'Jun', weeks: 4 },
];

export const WorkProgramPage = () => {
  const outletContext = useOutletContext<{ user: any } | undefined>();
  
  // Database Persistence: Fetch user from API if not in context
  const { data: apiUser } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
        const res = await authService.getMe();
        return res.data;
    },
    enabled: !outletContext?.user,
    staleTime: 1000 * 60 * 5,
  });

  const user = outletContext?.user ?? apiUser;
  
  const [searchParams] = useSearchParams();
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
  const [activeTab, setActiveTab] = useState<'PROGRAM' | 'BUDGET'>('PROGRAM');
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  
  useEffect(() => {
    const dutyParam = searchParams.get('duty');
    if (dutyParam) {
      setSelectedDuty(dutyParam as AdditionalDuty);
    }
  }, [searchParams]);

  const [selectedItemForBudget, setSelectedItemForBudget] =
    useState<WorkProgramItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data: academicYearData,
    isLoading: isLoadingYears,
  } = useQuery({
    queryKey: ['academic-years', 'for-work-programs'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] = useMemo(
    () =>
      academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData],
  );

  const { data: majorsData } = useQuery({
    queryKey: ['majors', 'all'],
    queryFn: () => majorService.list({ page: 1, limit: 100 }),
  });

  const majors: Major[] = useMemo(
    () => majorsData?.majors || majorsData?.data?.majors || [],
    [majorsData]
  );

  useEffect(() => {
    if (selectedDuty === 'KAPROG' && majors.length > 0) {
      if (!selectedMajor) {
        // Prioritaskan jurusan yang dikelola user (managedMajors atau managedMajor)
        const managedCodes: string[] = Array.isArray(user?.managedMajors)
          ? user.managedMajors.map((m: any) => m.code).filter(Boolean)
          : (user?.managedMajor?.code ? [user.managedMajor.code] : []);
        const matchedMajor = majors.find((m) => managedCodes.includes(m.code));
        const fallbackMajor = majors[0];
        const chosen = matchedMajor || fallbackMajor;
        if (chosen?.id) {
          setSelectedMajor(chosen.id.toString());
        }
      }
    } else if (selectedMajor) {
      setSelectedMajor('');
    }
  }, [selectedDuty, majors, selectedMajor, user]);

  // Dynamic Title Logic
  const pageTitle = useMemo(() => {
    if (!selectedDuty) return 'Program Kerja';
    
    const dutyLabel = ADDITIONAL_DUTY_LABELS[selectedDuty] || selectedDuty;
    
    // If duty is KAPROG, append major name if selected or inferred
    if (selectedDuty === 'KAPROG') {
      // Try to find major from selectedMajor or default to first available
      let majorId = selectedMajor || null;
      if (!majorId && majors.length > 0) {
        const managedCodes: string[] = Array.isArray(user?.managedMajors)
          ? user.managedMajors.map((m: any) => m.code).filter(Boolean)
          : (user?.managedMajor?.code ? [user.managedMajor.code] : []);
        const matchedMajor = majors.find((m) => managedCodes.includes(m.code));
        majorId = matchedMajor?.id?.toString() || majors[0].id.toString();
      }
      const major = majors.find(m => m.id.toString() === majorId);
      
      if (major) {
        return `Program Kerja ${dutyLabel} ${major.name}`; // e.g. Kepala Kompetensi Keahlian TKJ
      }
    }
    
    return `Program Kerja ${dutyLabel}`;
  }, [selectedDuty, selectedMajor, majors, user]);

  const activeYearId = useMemo(() => {
    if (!academicYears.length) {
      return null;
    }
    const active = academicYears.find((ay) => ay.isActive);
    if (active) return active.id;
    return academicYears[0]?.id ?? null;
  }, [academicYears]);

  const startYear = useMemo(() => {
    if (!activeYearId || !academicYears.length) return new Date().getFullYear();
    const ay = academicYears.find((y) => y.id === activeYearId);
    return ay ? parseInt(ay.name.split('/')[0]) : new Date().getFullYear();
  }, [activeYearId, academicYears]);

  const getProgramSchedule = (program: WorkProgram & { month?: number | null; startWeek?: number | null; endWeek?: number | null }) => {
    const schedule = new Set<number>();
    
    // Logic 1: Use direct month/week fields if available (New way)
    if (program.month && program.startWeek && program.endWeek) {
        // Find month index based on academic year (July start)
        // 1=Jan, 7=July. 
        // Logic: if month >= 7, index = month - 7. if month <= 6, index = month + 5.
        // Array MONTHS_CONFIG: [July, Aug, ..., June]
        // Month number input: 1-12 (Jan-Dec)
        // 7 (July) -> Index 0
        // 1 (Jan) -> Index 6
        
        let monthIndex = -1;
        if (program.month >= 7) {
            monthIndex = program.month - 7;
        } else {
            monthIndex = program.month + 5;
        }

        if (monthIndex >= 0 && monthIndex < 12) {
             let globalOffset = 0;
             for (let i = 0; i < monthIndex; i++) {
                globalOffset += MONTHS_CONFIG[i].weeks;
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
          const config = MONTHS_CONFIG[monthIndex];
          if (weekOfMonth > config.weeks) weekOfMonth = config.weeks;
          
          let globalOffset = 0;
          for (let i = 0; i < monthIndex; i++) {
            globalOffset += MONTHS_CONFIG[i].weeks;
          }
          schedule.add(globalOffset + (weekOfMonth - 1));
        }
      }
    });
    return schedule;
  };

  const { data, isLoading: isLoadingPrograms } = useQuery({
    queryKey: ['work-programs', page, limit, debouncedSearch, activeYearId, selectedDuty, selectedMajor, selectedSemester],
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
  });

  const programs: WorkProgram[] = data?.data?.programs || [];
  const pagination = data?.data?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const {
    register: registerItem,
    handleSubmit: handleSubmitItem,
    reset: resetItemForm,
    formState: { errors: itemErrors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      description: '',
      targetDate: '',
      note: '',
    },
  });

  const {
    register: registerBudget,
    handleSubmit: handleSubmitBudget,
    reset: resetBudgetForm,
    formState: { errors: budgetErrors },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      description: '',
      amount: 0,
    },
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreateForm,
    formState: { errors: createErrors },
  } = useForm<CreateProgramFormValues>({
    resolver: zodResolver(createProgramSchema) as Resolver<CreateProgramFormValues>,
    defaultValues: {
      title: '',
      description: '',
      majorId: '',
      semester: undefined,
      month: undefined,
      startWeek: undefined,
      endWeek: undefined,
    },
  });

  const createProgramMutation = useMutation({
    mutationFn: (data: CreateProgramFormValues) => {
      if (!activeYearId) throw new Error('Tahun ajaran aktif tidak ditemukan');
      if (!selectedDuty) throw new Error('Tugas tambahan tidak ditemukan dari filter aktif');
      
      return workProgramService.create({
        title: data.title,
        description: data.description,
        academicYearId: activeYearId,
        additionalDuty: selectedDuty, // Use selectedDuty from state
        majorId: data.majorId ? parseInt(data.majorId) : undefined,
        semester: data.semester,
        month: data.month,
        startWeek: data.startWeek,
        endWeek: data.endWeek,
      });
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

  const onSubmitCreate = (values: CreateProgramFormValues) => {
    createProgramMutation.mutate(values);
  };

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

  const addItemMutation = useMutation({
    mutationFn: ({
      programId,
      data: payload,
    }: {
      programId: number;
      data: ItemFormValues;
    }) => workProgramService.addItem(programId, payload),
    onSuccess: () => {
      if (selectedProgram) {
        queryClient.invalidateQueries({
          queryKey: [
            'work-programs',
            page,
            limit,
            debouncedSearch,
            activeYearId,
            selectedDuty,
          ],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      }
      toast.success('Kegiatan berhasil ditambahkan');
      resetItemForm();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menambahkan kegiatan');
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

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => workProgramService.removeItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      toast.success('Kegiatan dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus kegiatan');
    },
  });

  const addBudgetMutation = useMutation({
    mutationFn: ({
      itemId,
      data: payload,
    }: {
      itemId: number;
      data: BudgetFormValues;
    }) => workProgramService.addBudget(itemId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      toast.success('Anggaran berhasil diajukan');
      resetBudgetForm();
      setSelectedItemForBudget(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengajukan anggaran');
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (budgetId: number) => workProgramService.removeBudget(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-programs'] });
      toast.success('Anggaran dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus anggaran');
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
  });

  const budgetRequests: BudgetRequest[] = budgetRequestsData?.data || budgetRequestsData || [];

  const {
    register: registerNewBudget,
    handleSubmit: handleSubmitNewBudget,
    reset: resetNewBudgetForm,
    watch: watchNewBudget,
    formState: { errors: newBudgetErrors },
  } = useForm<CreateBudgetRequestFormValues>({
    resolver: zodResolver(createBudgetRequestSchema) as Resolver<CreateBudgetRequestFormValues>,
    defaultValues: {
      description: '',
      quantity: 1,
      unitPrice: 0,
    },
  });

  const newBudgetQty = watchNewBudget('quantity') || 0;
  const newBudgetPrice = watchNewBudget('unitPrice') || 0;
  const newBudgetTotal = newBudgetQty * newBudgetPrice;

  const createBudgetRequestMutation = useMutation({
    mutationFn: (data: CreateBudgetRequestFormValues) => {
      if (!activeYearId) throw new Error('Tahun ajaran aktif tidak ditemukan');
      if (!selectedDuty) throw new Error('Tugas tambahan tidak ditemukan');

      return budgetRequestService.create({
        ...data,
        totalAmount: data.quantity * data.unitPrice,
        academicYearId: activeYearId,
        additionalDuty: selectedDuty,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success('Pengajuan anggaran berhasil dibuat');
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

  const onSubmitItem = (values: ItemFormValues) => {
    if (!selectedProgram) {
      toast.error('Pilih program kerja terlebih dahulu');
      return;
    }
    addItemMutation.mutate({
      programId: selectedProgram.id,
      data: values,
    });
  };

  const onSubmitBudget = (values: BudgetFormValues) => {
    if (!selectedItemForBudget) {
      toast.error('Pilih kegiatan terlebih dahulu');
      return;
    }
    addBudgetMutation.mutate({
      itemId: selectedItemForBudget.id,
      data: values,
    });
  };

  const isLoading = isLoadingYears || isLoadingPrograms;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-500 text-sm">
            Kelola program kerja dan anggaran untuk tugas tambahan Anda.
          </p>
        </div>
        <button
          onClick={() => activeTab === 'PROGRAM' ? setIsCreateModalOpen(true) : setIsBudgetModalOpen(true)}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          {activeTab === 'PROGRAM' ? 'Tambah Program' : 'Ajukan Anggaran'}
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('PROGRAM')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'PROGRAM'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Program Kerja
        </button>
        <button
          onClick={() => setActiveTab('BUDGET')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'BUDGET'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pengajuan Anggaran
        </button>
      </div>

      {activeTab === 'PROGRAM' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className={`${selectedItemForBudget ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between bg-gray-50/50">
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                <div className="relative w-[200px]">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={18} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Cari nama program kerja..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Tahun Ajaran:</span>
                  <select
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                    value={activeYearId ?? ''}
                    onChange={() => {
                      setPage(1);
                    }}
                  >
                    <option value="">Semua Tahun Ajaran</option>
                    {academicYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {ay.name} {ay.isActive ? '(Aktif)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Semester:</span>
                  <select
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value as any)}
                  >
                    <option value="">Semua Semester</option>
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </div>
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
                <div className="overflow-x-auto border-t border-gray-200">
                  <table className="w-full text-xs text-left border-collapse table-fixed">
                    <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                      <tr>
                        <th rowSpan={3} className="sticky left-0 bg-gray-50 z-20 p-2 border-r border-gray-200 w-[250px] shadow-sm">
                          Program Kerja
                        </th>
                        <th colSpan={26} className="p-1 border-r border-gray-200 text-center bg-blue-50/50">
                          SEMESTER GANJIL
                        </th>
                        <th colSpan={26} className="p-1 border-r border-gray-200 text-center bg-green-50/50">
                          SEMESTER GENAP
                        </th>
                      </tr>
                      <tr>
                        {MONTHS_CONFIG.map((m, i) => (
                          <th key={i} colSpan={m.weeks} className="p-1 border-r border-gray-200 text-center">
                            {m.name.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {MONTHS_CONFIG.flatMap((m) => 
                          Array.from({ length: m.weeks }, (_, i) => i + 1)
                        ).map((w, i) => (
                          <th key={i} className="p-1 border-r border-gray-200 text-center font-normal text-[10px] text-gray-500">
                            {w}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {programs.length === 0 ? (
                        <tr>
                          <td colSpan={53} className="p-8 text-center text-gray-500">
                            {search
                              ? 'Tidak ada program kerja yang cocok dengan pencarian'
                              : 'Belum ada program kerja tugas tambahan.'}
                          </td>
                        </tr>
                      ) : (
                        programs.map((program) => {
                           const schedule = getProgramSchedule(program);
                           return (
                             <tr 
                               key={program.id} 
                               className={`hover:bg-gray-50 cursor-pointer ${selectedProgram?.id === program.id ? 'bg-blue-50/30' : ''}`}
                               onClick={() => setSelectedProgram(program)}
                             >
                               <td className="sticky left-0 bg-white z-10 p-2 border-r border-gray-200 shadow-sm group">
                                 <div className="flex flex-col gap-1">
                                   <div className="flex items-center justify-between gap-2">
                                     <div className="font-medium text-gray-900 truncate max-w-[180px]" title={program.title}>
                                       {program.title}
                                     </div>
                                     <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         if(confirm('Hapus program kerja ini beserta semua kegiatan dan anggarannya?')) deleteProgramMutation.mutate(program.id);
                                       }}
                                       className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                       title="Hapus Program"
                                     >
                                       <X size={14} />
                                     </button>
                                   </div>
                                   <div className="flex items-center gap-1">
                                     <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                       program.approvalStatus === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                       program.approvalStatus === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                       'bg-yellow-100 text-yellow-700'
                                     }`}>
                                       {program.approvalStatus === 'APPROVED' ? 'Disetujui' :
                                        program.approvalStatus === 'REJECTED' ? 'Ditolak' : 'Menunggu'}
                                     </span>
                                   </div>
                                 </div>
                               </td>
                               {Array.from({ length: 52 }).map((_, i) => (
                                 <td key={i} className="p-0 border-r border-gray-100 text-center h-8 relative">
                                   {schedule.has(i) && (
                                     <div className="absolute inset-1 rounded-sm bg-blue-500/80"></div>
                                   )}
                                 </td>
                               ))}
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

          {selectedProgram && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Rencana Kegiatan: {selectedProgram.title}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tambah kegiatan dan ajukan anggaran untuk program kerja ini.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {selectedProgram.items.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    Belum ada kegiatan. Tambahkan kegiatan pertama di bawah.
                  </div>
                ) : (
                  selectedProgram.items.map((item) => {
                    const totalBudget = item.budgets.reduce(
                      (sum, b) => sum + b.amount,
                      0,
                    );
                    const isCompleted = item.isCompleted;
                    return (
                      <div
                        key={item.id}
                        className="px-5 py-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemMutation.mutate({
                                  itemId: item.id,
                                  data: { isCompleted: !isCompleted },
                                })
                              }
                              className="mt-0.5 text-green-600"
                            >
                              {isCompleted ? (
                                <CheckCircle2 size={18} />
                              ) : (
                                <Circle size={18} />
                              )}
                            </button>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {item.description}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {item.targetDate && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Target: {new Date(item.targetDate).toLocaleDateString('id-ID')}
                                  </span>
                                )}
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">
                                  <Wallet className="w-3 h-3 mr-1" />
                                  Total Anggaran: Rp{' '}
                                  {totalBudget.toLocaleString('id-ID')}
                                </span>
                              </div>
                              {item.note && (
                                <p className="mt-1 text-xs text-gray-600">
                                  Catatan: {item.note}
                                </p>
                              )}
                              {item.budgets.length > 0 && (
                                <div className="mt-3 space-y-1">
                                  {item.budgets.map((budget) => (
                                    <div
                                      key={budget.id}
                                      className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5"
                                    >
                                      <div className="text-xs text-gray-700">
                                        <div className="font-medium">
                                          {budget.description}
                                        </div>
                                        <div className="text-[11px] text-gray-500">
                                          Rp {budget.amount.toLocaleString('id-ID')}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (
                                            confirm(
                                              'Hapus anggaran ini dari kegiatan?',
                                            )
                                          ) {
                                            deleteBudgetMutation.mutate(budget.id);
                                          }
                                        }}
                                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                                        title="Hapus Anggaran"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 md:mt-0">
                          <button
                            type="button"
                            onClick={() => setSelectedItemForBudget(item)}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          >
                            <Wallet className="w-3 h-3 mr-1" />
                            Ajukan Anggaran
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  'Hapus kegiatan ini beserta seluruh anggarannya?',
                                )
                              ) {
                                deleteItemMutation.mutate(item.id);
                              }
                            }}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Hapus
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/60">
                <form
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                  onSubmit={handleSubmitItem(onSubmitItem)}
                >
                  <div className="md:col-span-5">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Deskripsi Kegiatan
                    </label>
                    <input
                      type="text"
                      {...registerItem('description')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      placeholder="Contoh: Rapat koordinasi awal tahun"
                    />
                    {itemErrors.description && (
                      <p className="text-xs text-red-500 mt-1">
                        {itemErrors.description.message}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target Tanggal
                    </label>
                    <input
                      type="date"
                      {...registerItem('targetDate')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Catatan
                    </label>
                    <input
                      type="text"
                      {...registerItem('note')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      placeholder="Opsional"
                    />
                  </div>
                  <div className="md:col-span-1 flex">
                    <button
                      type="submit"
                      disabled={addItemMutation.isPending}
                      className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addItemMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      )}
                      Tambah
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {selectedItemForBudget && (
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Ajukan Anggaran
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Kegiatan: {selectedItemForBudget.description}
                  </p>
                </div>
              </div>
              <form
                className="space-y-3"
                onSubmit={handleSubmitBudget(onSubmitBudget)}
              >
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Deskripsi Anggaran
                  </label>
                  <input
                    type="text"
                    {...registerBudget('description')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    placeholder="Contoh: Konsumsi rapat koordinasi"
                  />
                  {budgetErrors.description && (
                    <p className="text-xs text-red-500 mt-1">
                      {budgetErrors.description.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Jumlah (Rp)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    {...registerBudget('amount', { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    placeholder="0"
                  />
                  {budgetErrors.amount && (
                    <p className="text-xs text-red-500 mt-1">
                      {budgetErrors.amount.message}
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItemForBudget(null);
                      resetBudgetForm();
                    }}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={addBudgetMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {addBudgetMutation.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    Ajukan Anggaran
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
           <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200">
               <thead className="bg-gray-50">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uraian/Kegiatan</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Pelaksanaan</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">QTY</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Harga Satuan</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-gray-200">
                 {isLoadingBudgets ? (
                   <tr><td colSpan={9} className="px-6 py-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></td></tr>
                 ) : budgetRequests.length === 0 ? (
                   <tr><td colSpan={9} className="px-6 py-4 text-center text-gray-500 text-sm">Belum ada pengajuan anggaran</td></tr>
                 ) : (
                   budgetRequests.map((budget, index) => (
                     <tr key={budget.id}>
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                       <td className="px-6 py-4 text-sm text-gray-900">{budget.description}</td>
                       <td className="px-6 py-4 text-sm text-gray-500">{budget.executionTime || '-'}</td>
                       <td className="px-6 py-4 text-sm text-gray-500">{budget.brand || '-'}</td>
                       <td className="px-6 py-4 text-sm text-gray-900">{budget.quantity}</td>
                       <td className="px-6 py-4 text-sm text-gray-900">Rp {budget.unitPrice.toLocaleString('id-ID')}</td>
                       <td className="px-6 py-4 text-sm font-medium text-gray-900">Rp {budget.totalAmount.toLocaleString('id-ID')}</td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                           budget.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                           budget.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                           'bg-yellow-100 text-yellow-800'
                         }`}>
                           {budget.status === 'APPROVED' ? 'Disetujui' :
                            budget.status === 'REJECTED' ? 'Ditolak' : 'Menunggu'}
                         </span>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                         <button
                           onClick={() => {
                             if(confirm('Hapus pengajuan anggaran ini?')) {
                               deleteBudgetRequestMutation.mutate(budget.id);
                             }
                           }}
                           className="text-red-600 hover:text-red-900"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
           </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
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
                  Tahun Ajaran
                </label>
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 text-sm">
                   {activeYearId 
                     ? academicYears.find(y => y.id === activeYearId)?.name + ' (Aktif)' 
                     : 'Tidak ada tahun ajaran aktif'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Program Kerja
                </label>
                <input
                  type="text"
                  {...registerCreate('title')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  placeholder="Contoh: Proses Pengadaan alat praktik"
                />
                {createErrors.title && (
                  <p className="text-xs text-red-500 mt-1">
                    {createErrors.title.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pilih Bulan
                    </label>
                    <select
                      {...registerCreate('month')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    >
                      <option value="">Pilih Bulan</option>
                      {MONTHS_CONFIG.map((m, idx) => {
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

              {selectedDuty === 'KAPROG' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jurusan
                  </label>
                  <select
                    {...registerCreate('majorId')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  >
                    <option value="">Pilih Jurusan</option>
                    {majors.map((major) => (
                      <option key={major.id} value={major.id}>
                        {major.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">
                Ajukan Anggaran
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
                  Ajukan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
