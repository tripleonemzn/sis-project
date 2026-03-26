import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { 
  School, 
  FlaskConical, 
  Dumbbell, 
  Landmark, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  MapPin, 
  Users, 
  Box, 
  Layers,
  ChevronDown,
  CheckCircle2,
  Clock3,
  AlertTriangle,
} from 'lucide-react';
import {
  inventoryService,
  type Room,
  type CreateRoomPayload,
  type RoomCategory,
  type InventoryAssignableUser,
  type LibraryBookLoan,
  type LibraryBorrowerStatus,
  type LibraryLoanBookOption,
  type LibraryLoanClassOption,
} from '../../../../services/inventory.service';
import {
  guessTemplateKeyFromCategoryName,
  normalizeInventoryTemplateKey,
  type InventoryTemplateKey,
} from '../../../../features/inventory/inventoryTemplateProfiles';
import { authService } from '../../../../services/auth.service';
import toast from 'react-hot-toast';

type InventoryHubContextUser = {
  id?: number;
  role?: string;
  additionalDuties?: string[] | null;
};

const INVENTORY_TEMPLATE_OPTIONS: Array<{
  key: InventoryTemplateKey;
  label: string;
  hint: string;
}> = [
  {
    key: 'STANDARD',
    label: 'Standar Sekolah',
    hint: 'Cocok untuk ruang kelas, ruang guru, gudang, dan inventaris umum.',
  },
  {
    key: 'LIBRARY',
    label: 'Inventaris Perpustakaan',
    hint: 'Fokus data buku (judul, penulis, penerbit, tahun terbit, kategori buku).',
  },
  {
    key: 'LAB',
    label: 'Laboratorium',
    hint: 'Fokus data perangkat/alat praktik (serial number, catatan perawatan).',
  },
  {
    key: 'SPORTS',
    label: 'Olahraga',
    hint: 'Fokus data perlengkapan olahraga (ukuran/spesifikasi alat).',
  },
  {
    key: 'OFFICE',
    label: 'Perkantoran',
    hint: 'Fokus data aset kantor dan administrasi.',
  },
];

function todayDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(
    2,
    '0',
  )}`;
}

const InventoryManagerSelect = ({
  value,
  options,
  onChange,
  placeholder = 'Belum ditugaskan',
}: {
  value: number | null;
  options: InventoryAssignableUser[];
  onChange: (value: number | null) => void;
  placeholder?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((candidate) => {
      const secondary = String(candidate.displayLabel || candidate.ptkType || candidate.role || '').toLowerCase();
      const extracurriculars = Array.isArray(candidate.extracurricularNames)
        ? candidate.extracurricularNames.join(' ').toLowerCase()
        : '';
      return (
        candidate.name.toLowerCase().includes(keyword) ||
        secondary.includes(keyword) ||
        extracurriculars.includes(keyword)
      );
    });
  }, [options, search]);

  const selected = options.find((candidate) => candidate.id === value) || null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between text-left"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
          {selected
            ? `${selected.name}${
                selected.displayLabel
                  ? ` - ${selected.displayLabel}`
                  : selected.ptkType
                    ? ` - ${selected.ptkType}`
                    : selected.role
                      ? ` - ${selected.role}`
                      : ''
              }`
            : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-[120] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari penanggung jawab..."
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
                setSearch('');
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                value === null ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              {placeholder}
            </button>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-500">Tidak ada penanggung jawab yang cocok.</div>
            ) : (
              filteredOptions.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    onChange(candidate.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                    candidate.id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  <div>{candidate.name}</div>
                  {(candidate.displayLabel || candidate.ptkType || candidate.role) && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {candidate.displayLabel || candidate.ptkType || candidate.role}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function toInputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function formatDateLabel(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function resolveClassLabel(
  row:
    | {
        name: string;
        major?: {
          code?: string | null;
          name?: string | null;
        } | null;
      }
    | null
    | undefined,
) {
  if (!row) return '-';
  return row.name;
}

type LibraryLoanUiStatus = 'BORROWED' | 'OVERDUE' | 'RETURNED';

type LibraryLoanStatusMeta = {
  code: LibraryLoanUiStatus;
  label: string;
  className: string;
  overdueDays: number;
  finePerDay: number;
  fineAmount: number;
};

function formatCurrencyIdr(value: number) {
  return new Intl.NumberFormat('id-ID').format(Math.max(0, Math.trunc(value || 0)));
}

function getLibraryLoanStatusMeta(loan: LibraryBookLoan, finePerDay = 1000): LibraryLoanStatusMeta {
  const safeFinePerDay = Math.max(0, Math.trunc(finePerDay || 0));
  if (loan.returnStatus === 'RETURNED') {
    return {
      code: 'RETURNED',
      label: 'Dikembalikan',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      overdueDays: 0,
      finePerDay: safeFinePerDay,
      fineAmount: 0,
    };
  }
  if (loan.returnDate) {
    const dueDate = new Date(loan.returnDate);
    const now = new Date();
    const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!Number.isNaN(dueDateStart.getTime()) && todayStart > dueDateStart) {
      const diffDays = Math.max(1, Math.floor((todayStart.getTime() - dueDateStart.getTime()) / 86400000));
      return {
        code: 'OVERDUE',
        label: `Terlambat ${diffDays} hari`,
        className: 'bg-rose-50 text-rose-700 border border-rose-200',
        overdueDays: diffDays,
        finePerDay: safeFinePerDay,
        fineAmount: diffDays * safeFinePerDay,
      };
    }
  }
  return {
    code: 'BORROWED',
    label: 'Dipinjam',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    overdueDays: 0,
    finePerDay: safeFinePerDay,
    fineAmount: 0,
  };
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return err.response?.data?.message || err.message || fallback;
  }
  return fallback;
};

export const InventoryHubPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTabId = searchParams.get('tab');
  const libraryTabParam = String(searchParams.get('libraryTab') || '').toUpperCase();
  // Derive filter from URL param or pathname context
  let filterParam = (searchParams.get('filter') || '').toLowerCase(); // 'lab' | 'library' | ''
  const pathname = location.pathname.toLowerCase();
  if (!filterParam) {
    if (pathname.includes('/teacher/head-lab')) filterParam = 'lab';
    else if (pathname.includes('/teacher/head-library')) filterParam = 'library';
  }
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loanStatusFilter, setLoanStatusFilter] = useState<'ALL' | 'BORROWED' | 'OVERDUE' | 'RETURNED'>('ALL');
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
  const [loanBorrowDate, setLoanBorrowDate] = useState(todayDateInput());
  const [loanBorrowQty, setLoanBorrowQty] = useState('1');
  const [loanBorrowerName, setLoanBorrowerName] = useState('');
  const [loanBorrowerStatus, setLoanBorrowerStatus] = useState<LibraryBorrowerStatus>('STUDENT');
  const [loanClassId, setLoanClassId] = useState<number | null>(null);
  const [loanBookTitle, setLoanBookTitle] = useState('');
  const [loanReturnDate, setLoanReturnDate] = useState('');
  const [loanPhoneNumber, setLoanPhoneNumber] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [loanFinePerDayInput, setLoanFinePerDayInput] = useState('1000');
  const classDropdownRef = useRef<HTMLDivElement | null>(null);
  
  const queryClient = useQueryClient(); // Ensure this is available if not already
  
  const { user: contextUser } = useOutletContext<{ user?: InventoryHubContextUser }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  
  const user = contextUser || authData?.data;
  const isAssignedScope = location.pathname.includes('/assigned-inventory');

  // Check if user has write access (Wakasek Sarpras or Secretary)
  const canManageRooms = Boolean(
    user?.role === 'ADMIN' ||
      user?.additionalDuties?.includes('WAKASEK_SARPRAS') ||
      user?.additionalDuties?.includes('SEKRETARIS_SARPRAS'),
  );
  const canEdit = canManageRooms;
  const canManageLibraryLoans =
    canEdit || user?.additionalDuties?.includes('KEPALA_PERPUSTAKAAN');
  const isLibraryScope = filterParam === 'library';
  const libraryTab: 'INVENTARIS' | 'PEMINJAMAN' =
    isLibraryScope && libraryTabParam === 'PEMINJAMAN' ? 'PEMINJAMAN' : 'INVENTARIS';

  const setLibraryTabInUrl = useCallback(
    (nextTab: 'INVENTARIS' | 'PEMINJAMAN') => {
      if (nextTab !== 'PEMINJAMAN') {
        setLoanStatusFilter('ALL');
        setSearchQuery('');
      }
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (nextTab === 'PEMINJAMAN') {
          params.set('libraryTab', 'PEMINJAMAN');
        } else {
          params.delete('libraryTab');
        }
        return params;
      }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!isLibraryScope) {
      if (searchParams.get('libraryTab')) {
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          params.delete('libraryTab');
          return params;
        }, { replace: true });
      }
    }
  }, [isLibraryScope, searchParams, setSearchParams]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const resetLoanEditor = () => {
    setEditingLoanId(null);
    setLoanBorrowDate(todayDateInput());
    setLoanBorrowQty('1');
    setLoanBorrowerName('');
    setLoanBorrowerStatus('STUDENT');
    setLoanClassId(null);
    setLoanBookTitle('');
    setLoanReturnDate('');
    setLoanPhoneNumber('');
    setIsClassDropdownOpen(false);
    setClassSearch('');
  };

  // Fetch Categories
  const { data: categoriesData } = useQuery({
    queryKey: ['roomCategories'],
    queryFn: inventoryService.getRoomCategories,
  });

  const categories: RoomCategory[] = (categoriesData?.data || []).filter((c: RoomCategory) => {
    const name = c.name.toLowerCase();
    if (filterParam === 'lab') {
      return name.includes('praktik') || name.includes('lab');
    }
    if (filterParam === 'library') {
      return name.includes('perpustakaan') || name.includes('pustaka');
    }
    return true;
  });

  const activeCategory = isAssignedScope
    ? undefined
    : categories.find(c => c.id === Number(currentTabId)) || categories[0];

  const { data: assignableUsersData } = useQuery({
    queryKey: ['inventory-assignable-users'],
    enabled: canManageRooms,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: inventoryService.getAssignableManagers,
  });

  const assignableUsers = assignableUsersData?.data || [];

  const deleteCategoryMutation = useMutation({
    mutationFn: inventoryService.deleteRoomCategory,
    onSuccess: () => {
      toast.success('Kategori berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['roomCategories'] });
      if (filterParam) {
        setSearchParams({ filter: filterParam });
      } else {
        setSearchParams({});
      }
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus kategori'));
    }
  });

  const handleDeleteCategory = () => {
    if (!activeCategory) return;
    if (confirm(`Apakah Anda yakin ingin menghapus kategori "${activeCategory.name}"? Semua ruangan di dalamnya harus dihapus terlebih dahulu.`)) {
      deleteCategoryMutation.mutate(activeCategory.id);
    }
  };

  // Set default tab if none selected
  useEffect(() => {
    if (isAssignedScope) {
      return;
    }
    if ((!currentTabId || !categories.some(c => c.id === Number(currentTabId))) && categories.length > 0) {
      const params: Record<string, string> = { tab: String(categories[0].id) };
      if (filterParam) params.filter = filterParam;
      setSearchParams(params);
    }
  }, [categories, currentTabId, filterParam, isAssignedScope, setSearchParams]);

  const { data: roomsData, isLoading } = useQuery({
    queryKey: ['rooms', isAssignedScope ? 'assigned' : activeCategory?.id],
    queryFn: () =>
      isAssignedScope
        ? inventoryService.getRooms({ assignedOnly: true })
        : activeCategory
          ? inventoryService.getRooms({ categoryId: activeCategory.id })
          : { data: [] },
    enabled: isAssignedScope || !!activeCategory,
  });

  const rooms = roomsData?.data || [];
  const filteredRooms = rooms.filter((room: Room) => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { data: loanClassesData, isLoading: isLoanClassesLoading } = useQuery({
    queryKey: ['libraryLoanClassOptions'],
    queryFn: inventoryService.listLibraryLoanClassOptions,
    enabled: isLibraryScope,
  });

  const { data: loansData, isLoading: isLoansLoading } = useQuery({
    queryKey: ['libraryBookLoans'],
    queryFn: () => inventoryService.listLibraryBookLoans(),
    enabled: isLibraryScope,
  });

  const { data: loanBookOptionsData, isLoading: isLoanBookOptionsLoading } = useQuery({
    queryKey: ['libraryLoanBookOptions'],
    queryFn: () => inventoryService.listLibraryLoanBookOptions(),
    enabled: isLibraryScope && libraryTab === 'PEMINJAMAN',
  });

  const { data: loanSettingsData, isLoading: isLoanSettingsLoading } = useQuery({
    queryKey: ['libraryLoanSettings'],
    queryFn: inventoryService.getLibraryLoanSettings,
    enabled: isLibraryScope,
  });

  const loanFinePerDay = Math.max(0, Number(loanSettingsData?.data?.finePerDay || 1000));

  useEffect(() => {
    if (!isLibraryScope) return;
    const timerId = window.setTimeout(() => {
      setLoanFinePerDayInput(String(loanFinePerDay));
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [isLibraryScope, loanFinePerDay]);

  const libraryLoanClasses: LibraryLoanClassOption[] = loanClassesData?.data || [];
  const libraryLoanBookOptions: LibraryLoanBookOption[] = loanBookOptionsData?.data || [];
  const libraryLoans: LibraryBookLoan[] = useMemo(() => loansData?.data || [], [loansData?.data]);
  const loanRows = useMemo(
    () => libraryLoans.map((loan) => ({ loan, status: getLibraryLoanStatusMeta(loan, loanFinePerDay) })),
    [libraryLoans, loanFinePerDay],
  );
  const filteredLibraryLoans = loanRows.filter(({ loan, status }) => {
    if (loanStatusFilter !== 'ALL' && status.code !== loanStatusFilter) return false;
    if (!searchQuery.trim()) return true;
    const keyword = searchQuery.trim().toLowerCase();
    const classLabel = (loan.class?.name || '').toLowerCase();
    const classMajor = (loan.class?.major?.code || loan.class?.major?.name || '').toLowerCase();
    return (
      loan.borrowerName.toLowerCase().includes(keyword) ||
      loan.bookTitle.toLowerCase().includes(keyword) ||
      (loan.phoneNumber || '').toLowerCase().includes(keyword) ||
      classLabel.includes(keyword) ||
      classMajor.includes(keyword)
    );
  });
  const filteredLoanClassOptions = libraryLoanClasses.filter((classRow) => {
    if (!classSearch.trim()) return true;
    const keyword = classSearch.trim().toLowerCase();
    const majorLabel = (classRow.major?.code || classRow.major?.name || '').toLowerCase();
    return (
      classRow.name.toLowerCase().includes(keyword) ||
      classRow.displayName.toLowerCase().includes(keyword) ||
      majorLabel.includes(keyword)
    );
  });
  const selectedLoanClass = libraryLoanClasses.find((classRow) => classRow.id === loanClassId);
  const loanStatusCounts = useMemo(() => {
    let borrowed = 0;
    let overdue = 0;
    let returned = 0;
    for (const row of loanRows) {
      if (row.status.code === 'BORROWED') borrowed += 1;
      if (row.status.code === 'OVERDUE') overdue += 1;
      if (row.status.code === 'RETURNED') returned += 1;
    }
    return {
      all: loanRows.length,
      borrowed,
      overdue,
      returned,
    };
  }, [loanRows]);

  const saveLibraryLoanMutation = useMutation({
    mutationFn: async () => {
      if (!loanBorrowDate.trim()) throw new Error('Tanggal pinjam wajib diisi.');
      if (!loanBorrowerName.trim()) throw new Error('Nama peminjam wajib diisi.');
      if (!loanBookTitle.trim()) throw new Error('Judul buku wajib diisi.');
      const parsedBorrowQty = Math.trunc(Number(loanBorrowQty));
      if (!Number.isFinite(parsedBorrowQty) || parsedBorrowQty < 1) {
        throw new Error('Jumlah pinjam minimal 1 buku.');
      }
      if (loanBorrowerStatus === 'STUDENT' && !loanClassId) {
        throw new Error('Pilih kelas untuk peminjam siswa.');
      }
      const selectedBook = libraryLoanBookOptions.find(
        (option) => option.title.toLowerCase() === loanBookTitle.trim().toLowerCase(),
      );
      if (!selectedBook) {
        throw new Error('Judul buku harus dipilih dari daftar inventaris perpustakaan.');
      }
      if (!editingLoanId && selectedBook.availableQty < parsedBorrowQty) {
        throw new Error(
          `Stok "${selectedBook.title}" tidak cukup. Tersedia ${selectedBook.availableQty}, diminta ${parsedBorrowQty}.`,
        );
      }
      if (loanReturnDate.trim()) {
        const parsedReturnDate = new Date(`${loanReturnDate.trim()}T00:00:00.000Z`);
        if (Number.isNaN(parsedReturnDate.getTime())) {
          throw new Error('Format tanggal pengembalian harus YYYY-MM-DD.');
        }
      }

      const payload = {
        borrowDate: loanBorrowDate.trim(),
        borrowQty: parsedBorrowQty,
        borrowerName: loanBorrowerName.trim(),
        borrowerStatus: loanBorrowerStatus,
        classId: loanBorrowerStatus === 'STUDENT' ? loanClassId : null,
        bookTitle: loanBookTitle.trim(),
        publishYear: selectedBook.publishYear || undefined,
        returnDate: loanReturnDate.trim() || null,
        phoneNumber: loanPhoneNumber.trim() || undefined,
      };

      if (editingLoanId) {
        const currentLoan = libraryLoans.find((loan) => loan.id === editingLoanId);
        return inventoryService.updateLibraryBookLoan(editingLoanId, {
          ...payload,
          returnStatus: currentLoan?.returnStatus || 'NOT_RETURNED',
        });
      }
      return inventoryService.createLibraryBookLoan(payload);
    },
    onSuccess: () => {
      toast.success(editingLoanId ? 'Peminjaman buku berhasil diperbarui.' : 'Peminjaman buku berhasil ditambahkan.');
      resetLoanEditor();
      setIsLoanModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['libraryBookLoans'] });
      queryClient.invalidateQueries({ queryKey: ['libraryLoanBookOptions'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan data peminjaman buku.'));
    },
  });

  const saveLoanSettingsMutation = useMutation({
    mutationFn: async () => {
      const parsed = Number(loanFinePerDayInput);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Tarif denda per hari harus angka 0 atau lebih.');
      }
      return inventoryService.updateLibraryLoanSettings({
        finePerDay: Math.trunc(parsed),
      });
    },
    onSuccess: () => {
      toast.success('Tarif denda keterlambatan berhasil diperbarui.');
      queryClient.invalidateQueries({ queryKey: ['libraryLoanSettings'] });
      queryClient.invalidateQueries({ queryKey: ['libraryBookLoans'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui tarif denda.'));
    },
  });

  const deleteLibraryLoanMutation = useMutation({
    mutationFn: inventoryService.deleteLibraryBookLoan,
    onSuccess: () => {
      toast.success('Peminjaman buku berhasil dihapus.');
      resetLoanEditor();
      queryClient.invalidateQueries({ queryKey: ['libraryBookLoans'] });
      queryClient.invalidateQueries({ queryKey: ['libraryLoanBookOptions'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus data peminjaman buku.'));
    },
  });

  const markReturnedMutation = useMutation({
    mutationFn: (loan: LibraryBookLoan) =>
      inventoryService.updateLibraryBookLoan(loan.id, {
        returnStatus: 'RETURNED',
        returnDate: loan.returnDate || todayDateInput(),
      }),
    onSuccess: () => {
      toast.success('Status pengembalian diperbarui menjadi Dikembalikan.');
      queryClient.invalidateQueries({ queryKey: ['libraryBookLoans'] });
      queryClient.invalidateQueries({ queryKey: ['libraryLoanBookOptions'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui status pengembalian.'));
    },
  });

  const handleEditLoan = (loan: LibraryBookLoan) => {
    setEditingLoanId(loan.id);
    setLoanBorrowDate(toInputDate(loan.borrowDate) || todayDateInput());
    setLoanBorrowQty(String(Math.max(1, loan.borrowQty || 1)));
    setLoanBorrowerName(loan.borrowerName || '');
    setLoanBorrowerStatus(loan.borrowerStatus);
    setLoanClassId(loan.classId || null);
    setLoanBookTitle(loan.bookTitle || '');
    setLoanReturnDate(toInputDate(loan.returnDate) || '');
    setLoanPhoneNumber(loan.phoneNumber || '');
    setClassSearch('');
    setIsClassDropdownOpen(false);
    setIsLoanModalOpen(true);
  };

  useEffect(() => {
    if (!isLoanModalOpen) return;
    if (loanBookTitle.trim()) return;
    const firstAvailable = libraryLoanBookOptions.find((option) => option.availableQty > 0);
    if (firstAvailable) {
      setLoanBookTitle(firstAvailable.title);
    }
  }, [isLoanModalOpen, loanBookTitle, libraryLoanBookOptions]);

  const handleDeleteLoan = (loan: LibraryBookLoan) => {
    if (confirm(`Hapus data peminjaman "${loan.borrowerName}" untuk buku "${loan.bookTitle}"?`)) {
      deleteLibraryLoanMutation.mutate(loan.id);
    }
  };

  const handleMarkReturned = (loan: LibraryBookLoan) => {
    if (loan.returnStatus === 'RETURNED') return;
    if (confirm(`Tandai buku "${loan.bookTitle}" milik ${loan.borrowerName} sebagai sudah dikembalikan?`)) {
      markReturnedMutation.mutate(loan);
    }
  };
  
  const pageTitle = isAssignedScope
    ? 'Inventaris Tugas'
    : filterParam === 'lab'
    ? 'Inventaris Lab'
    : filterParam === 'library'
      ? 'Inventaris Perpustakaan'
      : 'Aset Sekolah';
  const pageSubtitle = isAssignedScope
    ? 'Kelola inventaris ruangan yang ditugaskan oleh Wakasek Sarpras'
    : filterParam === 'lab'
    ? 'Kelola data ruangan dan inventaris laboratorium'
    : filterParam === 'library'
      ? 'Kelola data ruangan dan inventaris perpustakaan'
      : 'Kelola data ruangan dan aset sekolah';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-500">{pageSubtitle}</p>
        </div>
        {canEdit && !(isLibraryScope && libraryTab === 'PEMINJAMAN') ? (
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors gap-2"
          >
            <Layers size={20} />
            <span>Tambah Kategori Ruang</span>
          </button>
        ) : isLibraryScope && libraryTab === 'PEMINJAMAN' && canManageLibraryLoans ? (
          <button
            type="button"
            onClick={() => {
              resetLoanEditor();
              setIsLoanModalOpen(true);
            }}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors gap-2"
          >
            <Plus size={18} />
            <span>Tambah Peminjaman Buku</span>
          </button>
        ) : null}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        {isLibraryScope ? (
          <div className="border-b border-gray-200 mb-4">
            <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
              <button
                onClick={() => setLibraryTabInUrl('INVENTARIS')}
                className={`
                  flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors
                  ${
                    libraryTab === 'INVENTARIS'
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Box size={18} />
                Inventaris Perpustakaan
              </button>
              <button
                onClick={() => setLibraryTabInUrl('PEMINJAMAN')}
                className={`
                  flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors
                  ${
                    libraryTab === 'PEMINJAMAN'
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Users size={18} />
                Daftar Peminjaman Buku
              </button>
            </div>
          </div>
        ) : null}

        {!isLibraryScope && !isAssignedScope ? (
          <div className="border-b border-gray-200 mb-4">
            <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
              {categories.map((category) => {
                const isActive = Number(currentTabId) === category.id;
                return (
                  <button
                  key={category.id}
                    onClick={() => {
                      const params: Record<string, string> = { tab: String(category.id) };
                      if (filterParam) params.filter = filterParam;
                      setSearchParams(params);
                    }}
                    className={`
                      flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors
                      ${
                        isActive
                          ? 'border-blue-600 text-blue-600 font-medium'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    {category.name.toLowerCase().includes('kelas') ? <School size={18} /> :
                     category.name.toLowerCase().includes('lab') ? <FlaskConical size={18} /> :
                     category.name.toLowerCase().includes('olahraga') ? <Dumbbell size={18} /> :
                     category.name.toLowerCase().includes('ibadah') ? <Landmark size={18} /> :
                     <Box size={18} />}
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={isLibraryScope && libraryTab === 'PEMINJAMAN' ? 'Cari peminjam, judul buku, nomor telpon...' : 'Cari ruangan...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-96 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {canEdit && activeCategory && !(isLibraryScope && libraryTab === 'PEMINJAMAN') ? (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditCategoryModalOpen(true)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
                title="Edit Kategori"
              >
                <Edit size={20} />
              </button>
              <button
                onClick={handleDeleteCategory}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
                title="Hapus Kategori"
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={() => setIsRoomModalOpen(true)}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors gap-2"
              >
                <Plus size={20} />
                <span>Tambah Ruangan</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Content */}
      {isLibraryScope && libraryTab === 'PEMINJAMAN' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLoanStatusFilter('ALL')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                  loanStatusFilter === 'ALL'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                Semua
                <span className="text-[11px]">({loanStatusCounts.all})</span>
              </button>
              <button
                type="button"
                onClick={() => setLoanStatusFilter('BORROWED')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                  loanStatusFilter === 'BORROWED'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Clock3 size={14} />
                Dipinjam
                <span className="text-[11px]">({loanStatusCounts.borrowed})</span>
              </button>
              <button
                type="button"
                onClick={() => setLoanStatusFilter('OVERDUE')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                  loanStatusFilter === 'OVERDUE'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <AlertTriangle size={14} />
                Terlambat
                <span className="text-[11px]">({loanStatusCounts.overdue})</span>
              </button>
              <button
                type="button"
                onClick={() => setLoanStatusFilter('RETURNED')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                  loanStatusFilter === 'RETURNED'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <CheckCircle2 size={14} />
                Dikembalikan
                <span className="text-[11px]">({loanStatusCounts.returned})</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Status ditentukan otomatis: saat simpan = <strong>Dipinjam</strong>, lewat tenggat = <strong>Terlambat</strong>, dan saat dikonfirmasi kembali = <strong>Dikembalikan</strong>.
            </p>
            <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2">
              <label className="text-xs font-medium text-gray-700">Tarif Denda Keterlambatan / Hari (Rp)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={loanFinePerDayInput}
                  onChange={(e) => setLoanFinePerDayInput(e.target.value)}
                  disabled={!canManageLibraryLoans || isLoanSettingsLoading || saveLoanSettingsMutation.isPending}
                  className="w-40 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
                {canManageLibraryLoans ? (
                  <button
                    type="button"
                    onClick={() => saveLoanSettingsMutation.mutate()}
                    disabled={isLoanSettingsLoading || saveLoanSettingsMutation.isPending}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                  >
                    {saveLoanSettingsMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </button>
                ) : null}
              </div>
              {!canManageLibraryLoans ? (
                <p className="text-xs text-gray-500">
                  Tarif aktif: <strong>Rp{formatCurrencyIdr(loanFinePerDay)}</strong>/hari.
                </p>
              ) : null}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {isLoansLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredLibraryLoans.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Belum ada data peminjaman buku</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2">No</th>
                      <th className="text-left px-3 py-2">Tanggal Pinjam</th>
                      <th className="text-left px-3 py-2">Nama Peminjam</th>
                      <th className="text-left px-3 py-2">Status Peminjam</th>
                      <th className="text-left px-3 py-2">Kelas</th>
                      <th className="text-left px-3 py-2">Judul Buku</th>
                      <th className="text-left px-3 py-2">Jumlah</th>
                      <th className="text-left px-3 py-2">Thn. Terbit</th>
                      <th className="text-left px-3 py-2">Tgl. Pengembalian</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">No. Telpon</th>
                      <th className="text-left px-3 py-2">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLibraryLoans.map(({ loan, status }, index) => (
                      <tr key={loan.id} className="border-b border-gray-100">
                        <td className="px-3 py-2">{index + 1}</td>
                        <td className="px-3 py-2">{formatDateLabel(loan.borrowDate)}</td>
                        <td className="px-3 py-2">{loan.borrowerName}</td>
                        <td className="px-3 py-2">{loan.borrowerStatus === 'STUDENT' ? 'Siswa' : 'Guru'}</td>
                        <td className="px-3 py-2">{loan.borrowerStatus === 'STUDENT' ? resolveClassLabel(loan.class) : '-'}</td>
                        <td className="px-3 py-2">{loan.bookTitle}</td>
                        <td className="px-3 py-2">{Math.max(1, loan.borrowQty || 1)}</td>
                        <td className="px-3 py-2">{loan.publishYear || '-'}</td>
                        <td className="px-3 py-2">{loan.returnDate ? formatDateLabel(loan.returnDate) : '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                          {status.code === 'OVERDUE' ? (
                            <div className="text-[11px] text-rose-700 mt-1">
                              Denda: Rp{formatCurrencyIdr(status.fineAmount)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{loan.phoneNumber || '-'}</td>
                        <td className="px-3 py-2">
                          {canManageLibraryLoans ? (
                            <div className="flex items-center gap-1">
                              {loan.returnStatus !== 'RETURNED' ? (
                                <button
                                  type="button"
                                  onClick={() => handleMarkReturned(loan)}
                                  disabled={markReturnedMutation.isPending}
                                  className="p-2 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                  title="Tandai Dikembalikan"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleEditLoan(loan)}
                                className="p-2 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLoan(loan)}
                                disabled={deleteLibraryLoanMutation.isPending}
                                className="p-2 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                title="Hapus"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <div className="bg-white p-4 rounded-full inline-block shadow-sm mb-4">
            <School className="text-gray-400" size={32} />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Belum ada data ruangan</h3>
          <p className="text-gray-500 mt-1">
            {isAssignedScope ? (
              <>Belum ada ruangan yang ditugaskan kepada akun ini.</>
            ) : (
              <>Silakan tambahkan ruangan baru untuk kategori <strong>{activeCategory?.name}</strong></>
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredRooms.map((room: Room) => (
            <RoomCard 
              key={room.id} 
              room={room} 
              canEdit={canEdit}
              onEdit={(room) => {
                setEditingRoom(room);
                setIsEditRoomModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {isLibraryScope && libraryTab === 'PEMINJAMAN' && isLoanModalOpen ? (
        <LibraryLoanModal
          editingLoanId={editingLoanId}
          borrowDate={loanBorrowDate}
          borrowQty={loanBorrowQty}
          borrowerName={loanBorrowerName}
          borrowerStatus={loanBorrowerStatus}
          classId={loanClassId}
          bookTitle={loanBookTitle}
          bookOptions={libraryLoanBookOptions}
          isBookOptionsLoading={isLoanBookOptionsLoading}
          returnDate={loanReturnDate}
          phoneNumber={loanPhoneNumber}
          classOptions={libraryLoanClasses}
          filteredClassOptions={filteredLoanClassOptions}
          selectedClass={selectedLoanClass}
          classSearch={classSearch}
          isClassDropdownOpen={isClassDropdownOpen}
          isLoanClassesLoading={isLoanClassesLoading}
          classDropdownRef={classDropdownRef}
          savePending={saveLibraryLoanMutation.isPending}
          onClose={() => {
            setIsLoanModalOpen(false);
            resetLoanEditor();
          }}
          onChangeBorrowDate={setLoanBorrowDate}
          onChangeBorrowQty={setLoanBorrowQty}
          onChangeBorrowerName={setLoanBorrowerName}
          onChangeBorrowerStatus={(value) => {
            setLoanBorrowerStatus(value);
            if (value === 'TEACHER') {
              setLoanClassId(null);
              setIsClassDropdownOpen(false);
              setClassSearch('');
            }
          }}
          onChangeClassId={setLoanClassId}
          onChangeBookTitle={setLoanBookTitle}
          onChangeReturnDate={setLoanReturnDate}
          onChangePhoneNumber={setLoanPhoneNumber}
          onChangeClassSearch={setClassSearch}
          onToggleClassDropdown={() => setIsClassDropdownOpen((prev) => !prev)}
          onCloseClassDropdown={() => setIsClassDropdownOpen(false)}
          onSubmit={() => saveLibraryLoanMutation.mutate()}
        />
      ) : null}

      {/* Add Category Modal */}
      {isCategoryModalOpen && (
        <AddCategoryModal 
          onClose={() => setIsCategoryModalOpen(false)} 
        />
      )}

      {/* Edit Category Modal */}
      {isEditCategoryModalOpen && activeCategory && (
        <EditCategoryModal 
          category={activeCategory}
          onClose={() => setIsEditCategoryModalOpen(false)} 
        />
      )}

      {/* Add Room Modal */}
      {isRoomModalOpen && activeCategory && (
        <AddRoomModal 
          onClose={() => setIsRoomModalOpen(false)} 
          categoryId={activeCategory.id}
          categoryName={activeCategory.name}
          assignableUsers={assignableUsers}
        />
      )}

      {/* Edit Room Modal */}
      {isEditRoomModalOpen && editingRoom && (
        <EditRoomModal 
          room={editingRoom}
          onClose={() => setIsEditRoomModalOpen(false)}
          assignableUsers={assignableUsers}
        />
      )}
    </div>
  );
};

type LibraryLoanModalProps = {
  editingLoanId: number | null;
  borrowDate: string;
  borrowQty: string;
  borrowerName: string;
  borrowerStatus: LibraryBorrowerStatus;
  classId: number | null;
  bookTitle: string;
  bookOptions: LibraryLoanBookOption[];
  isBookOptionsLoading: boolean;
  returnDate: string;
  phoneNumber: string;
  classOptions: LibraryLoanClassOption[];
  filteredClassOptions: LibraryLoanClassOption[];
  selectedClass?: LibraryLoanClassOption;
  classSearch: string;
  isClassDropdownOpen: boolean;
  isLoanClassesLoading: boolean;
  classDropdownRef: { current: HTMLDivElement | null };
  savePending: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChangeBorrowDate: (value: string) => void;
  onChangeBorrowQty: (value: string) => void;
  onChangeBorrowerName: (value: string) => void;
  onChangeBorrowerStatus: (value: LibraryBorrowerStatus) => void;
  onChangeClassId: (value: number | null) => void;
  onChangeBookTitle: (value: string) => void;
  onChangeReturnDate: (value: string) => void;
  onChangePhoneNumber: (value: string) => void;
  onChangeClassSearch: (value: string) => void;
  onToggleClassDropdown: () => void;
  onCloseClassDropdown: () => void;
};

const LibraryLoanModal = ({
  editingLoanId,
  borrowDate,
  borrowQty,
  borrowerName,
  borrowerStatus,
  classId,
  bookTitle,
  bookOptions,
  isBookOptionsLoading,
  returnDate,
  phoneNumber,
  classOptions,
  filteredClassOptions,
  selectedClass,
  classSearch,
  isClassDropdownOpen,
  isLoanClassesLoading,
  classDropdownRef,
  savePending,
  onClose,
  onSubmit,
  onChangeBorrowDate,
  onChangeBorrowQty,
  onChangeBorrowerName,
  onChangeBorrowerStatus,
  onChangeClassId,
  onChangeBookTitle,
  onChangeReturnDate,
  onChangePhoneNumber,
  onChangeClassSearch,
  onToggleClassDropdown,
  onCloseClassDropdown,
}: LibraryLoanModalProps) => {
  const selectedBook = bookOptions.find(
    (option) => option.title.toLowerCase() === String(bookTitle || '').trim().toLowerCase(),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {editingLoanId ? 'Edit Peminjaman Buku' : 'Tambah Peminjaman Buku'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Status pengembalian otomatis menjadi <strong>Dipinjam</strong> setelah disimpan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Tutup popup"
          >
            <Plus size={18} className="rotate-45" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tanggal Pinjam</label>
            <input
              type="date"
              value={borrowDate}
              onChange={(e) => onChangeBorrowDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Jumlah Pinjam</label>
            <input
              type="number"
              min={1}
              value={borrowQty}
              onChange={(e) => onChangeBorrowQty(e.target.value)}
              placeholder="Minimal 1 buku"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nama Peminjam</label>
            <input
              type="text"
              value={borrowerName}
              onChange={(e) => onChangeBorrowerName(e.target.value)}
              placeholder="Nama lengkap peminjam"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status Peminjam</label>
            <select
              value={borrowerStatus}
              onChange={(e) => onChangeBorrowerStatus(e.target.value as LibraryBorrowerStatus)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="STUDENT">Siswa</option>
              <option value="TEACHER">Guru</option>
            </select>
          </div>
        </div>

        {borrowerStatus === 'STUDENT' ? (
          <div className="mt-3" ref={classDropdownRef}>
            <label className="block text-sm text-gray-600 mb-1">Kelas</label>
            <button
              type="button"
              onClick={onToggleClassDropdown}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center justify-between bg-white text-left"
            >
              <span className={classId ? 'text-gray-900' : 'text-gray-500'}>
                {selectedClass?.name || 'Pilih kelas'}
              </span>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
            {isClassDropdownOpen ? (
              <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={classSearch}
                    onChange={(e) => onChangeClassSearch(e.target.value)}
                    placeholder="Cari kelas..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filteredClassOptions.map((classRow) => (
                    <button
                      key={classRow.id}
                      type="button"
                      onClick={() => {
                        onChangeClassId(classRow.id);
                        onCloseClassDropdown();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                    >
                      <div className="font-medium text-gray-900">{classRow.name}</div>
                    </button>
                  ))}
                  {filteredClassOptions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">Kelas tidak ditemukan</div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {isLoanClassesLoading ? <p className="text-xs text-gray-500 mt-1">Memuat daftar kelas...</p> : null}
            {!isLoanClassesLoading && classOptions.length === 0 ? (
              <p className="text-xs text-rose-600 mt-1">Daftar kelas belum tersedia.</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Judul Buku</label>
            <select
              value={bookTitle}
              onChange={(e) => onChangeBookTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Pilih judul buku dari inventaris</option>
              {bookTitle &&
              !bookOptions.some(
                (option) => option.title.toLowerCase() === bookTitle.trim().toLowerCase(),
              ) ? (
                <option value={bookTitle}>{bookTitle} (data lama)</option>
              ) : null}
              {bookOptions.map((option) => (
                <option
                  key={option.title}
                  value={option.title}
                  disabled={option.availableQty <= 0 && option.title !== bookTitle}
                >
                  {option.title} (tersedia {option.availableQty})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {isBookOptionsLoading
                ? 'Memuat daftar buku inventaris...'
                : selectedBook
                ? `Stok tersedia ${selectedBook.availableQty} dari total ${selectedBook.totalQty} buku`
                : 'Judul buku diambil langsung dari inventaris perpustakaan agar tidak salah ketik.'}
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">No. Telpon</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => onChangePhoneNumber(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-sm text-gray-600 mb-1">Tgl. Pengembalian (Tenggat)</label>
          <input
            type="date"
            value={returnDate}
            onChange={(e) => onChangeReturnDate(e.target.value)}
            className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Jika melewati tanggal ini dan buku belum dikembalikan, status otomatis menjadi <strong>Terlambat</strong>.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={savePending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {savePending ? 'Menyimpan...' : editingLoanId ? 'Simpan Perubahan' : 'Simpan Peminjaman'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RoomCard = ({ room, canEdit, onEdit }: { room: Room; canEdit: boolean; onEdit?: (room: Room) => void }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  
  const deleteMutation = useMutation({
    mutationFn: inventoryService.deleteRoom,
    onSuccess: () => {
      toast.success('Ruangan berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus ruangan'));
    }
  });

  const handleDelete = () => {
    if ((room._count?.items || 0) > 0) {
      toast.error('Ruangan tidak dapat dihapus karena masih memiliki Item/Daftar Inventaris di dalamnya.');
      return;
    }
    if (confirm('Apakah Anda yakin ingin menghapus ruangan ini?')) {
      deleteMutation.mutate(room.id);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <School size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{room.name}</h3>
            <p className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-1 animate-pulse
              ${room.condition === 'BAIK' ? 'bg-green-100 text-green-700' : 
                room.condition === 'RUSAK_RINGAN' ? 'bg-yellow-100 text-yellow-700' : 
                'bg-red-100 text-red-700'}
            `}>
              {room.condition?.replace('_', ' ') || 'KONDISI TIDAK DIKETAHUI'}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(room);
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit Ruangan"
            >
              <Edit size={18} />
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Hapus Ruangan"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 text-sm text-gray-600 mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-400" />
          <span>{room.location || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          <span>Kapasitas: {room.capacity || 0} orang</span>
        </div>
        <div className="flex items-center gap-2">
          <Box size={16} className="text-gray-400" />
          <span>{room._count?.items || 0} Item Inventaris</span>
        </div>
        {room.managerUser?.name ? (
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <span>PJ: {room.managerUser.name}</span>
          </div>
        ) : null}
      </div>

      <button 
        onClick={() =>
          navigate({
            pathname: String(room.id),
            search: location.search,
          })
        }
        className="w-full py-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
      >
        Lihat Detail Inventaris
      </button>
    </div>
  );
};

const AddCategoryModal = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inventoryTemplateKey, setInventoryTemplateKey] = useState<InventoryTemplateKey>('STANDARD');

  const createMutation = useMutation({
    mutationFn: inventoryService.createRoomCategory,
    onSuccess: () => {
      toast.success('Kategori berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['roomCategories'] });
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal membuat kategori'));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name, description, inventoryTemplateKey });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Tambah Kategori Ruang</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kategori</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Kantin, Gudang, Parkiran"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi (Opsional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Keterangan singkat kategori ini"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Inventaris</label>
            <select
              value={inventoryTemplateKey}
              onChange={(e) => setInventoryTemplateKey(e.target.value as InventoryTemplateKey)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {INVENTORY_TEMPLATE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {INVENTORY_TEMPLATE_OPTIONS.find((option) => option.key === inventoryTemplateKey)?.hint}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Kategori'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddRoomModal = ({
  onClose,
  categoryId,
  categoryName,
  assignableUsers,
}: {
  onClose: () => void;
  categoryId: number;
  categoryName: string;
  assignableUsers: InventoryAssignableUser[];
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateRoomPayload>>({
    name: '',
    categoryId: categoryId,
    capacity: 0,
    location: '',
    condition: 'BAIK',
    description: '',
    managerUserId: null,
  });

  const createMutation = useMutation({
    mutationFn: inventoryService.createRoom,
    onSuccess: () => {
      toast.success('Ruangan berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-assigned-inventory-rooms'] });
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal membuat ruangan'));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData as CreateRoomPayload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tambah Ruangan Baru</h2>
            <p className="text-sm text-gray-500">Kategori: {categoryName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Ruangan</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Lab Komputer 1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kondisi</label>
              <select
                value={formData.condition}
                onChange={e => setFormData({ ...formData, condition: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="BAIK">Baik</option>
                <option value="RUSAK_RINGAN">Rusak Ringan</option>
                <option value="RUSAK_BERAT">Rusak Berat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
            <input
              type="text"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Gedung A Lt. 2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Penanggung Jawab Inventaris</label>
            <InventoryManagerSelect
              value={formData.managerUserId ?? null}
              options={assignableUsers}
              onChange={(managerUserId) => setFormData({ ...formData, managerUserId })}
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Ruangan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditRoomModal = ({
  room,
  onClose,
  assignableUsers,
}: {
  room: Room;
  onClose: () => void;
  assignableUsers: InventoryAssignableUser[];
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateRoomPayload>>({
    name: room.name,
    categoryId: room.categoryId,
    capacity: room.capacity || 0,
    location: room.location || '',
    condition: room.condition || 'BAIK',
    description: room.description || '',
    managerUserId: room.managerUserId ?? null,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateRoomPayload>) => inventoryService.updateRoom(room.id, data),
    onSuccess: () => {
      toast.success('Ruangan berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-assigned-inventory-rooms'] });
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui ruangan'));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Ruangan</h2>
            <p className="text-sm text-gray-500">{room.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Ruangan</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Lab Komputer 1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kondisi</label>
              <select
                value={formData.condition}
                onChange={e => setFormData({ ...formData, condition: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="BAIK">Baik</option>
                <option value="RUSAK_RINGAN">Rusak Ringan</option>
                <option value="RUSAK_BERAT">Rusak Berat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
            <input
              type="text"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Gedung A Lt. 2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Penanggung Jawab Inventaris</label>
            <InventoryManagerSelect
              value={formData.managerUserId ?? null}
              options={assignableUsers}
              onChange={(managerUserId) => setFormData({ ...formData, managerUserId })}
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryHubPage;

const EditCategoryModal = ({ category, onClose }: { category: RoomCategory; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || '');
  const [inventoryTemplateKey, setInventoryTemplateKey] = useState<InventoryTemplateKey>(() =>
    normalizeInventoryTemplateKey(
      category.inventoryTemplateKey || guessTemplateKeyFromCategoryName(category.name),
    ),
  );

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; inventoryTemplateKey: InventoryTemplateKey }) =>
      inventoryService.updateRoomCategory(category.id, data),
    onSuccess: () => {
      toast.success('Kategori berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['roomCategories'] });
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui kategori'));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, description, inventoryTemplateKey });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Edit Kategori Ruang</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Kategori <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Laboratorium"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deskripsi
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Deskripsi singkat kategori..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Inventaris
            </label>
            <select
              value={inventoryTemplateKey}
              onChange={(e) => setInventoryTemplateKey(e.target.value as InventoryTemplateKey)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {INVENTORY_TEMPLATE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {INVENTORY_TEMPLATE_OPTIONS.find((option) => option.key === inventoryTemplateKey)?.hint}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
