import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { ENV } from '../../config/env';
import { openWebModuleRoute } from '../../lib/navigation/webModuleRoute';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';
import { useAuth } from '../auth/AuthProvider';
import {
  formatWorkProgramDutyLabel,
  getAdvisorDutyMeta,
  getAdvisorEquipmentLabel,
  getAdvisorEquipmentTitle,
  isAdvisorDuty,
} from './advisorDuty';
import {
  WorkProgramBudgetLpjInvoiceStatus,
  WorkProgramBudgetRequest,
  WorkProgramBudgetStatus,
  WorkProgramUploadFile,
} from './types';
import { workProgramApi } from './workProgramApi';

type BudgetStatusFilter = 'ALL' | WorkProgramBudgetStatus;

type BudgetFormState = {
  additionalDuty: string;
  toolName: string;
  description: string;
  executionTime: string;
  brand: string;
  quantity: string;
  unitPrice: string;
};

const DEFAULT_BUDGET_FORM: BudgetFormState = {
  additionalDuty: '',
  toolName: '',
  description: '',
  executionTime: '',
  brand: '',
  quantity: '1',
  unitPrice: '0',
};

function formatCurrency(value: number) {
  return `Rp ${Math.max(0, Number(value || 0)).toLocaleString('id-ID')}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDutyLabel(value?: string | null) {
  if (!value) return '-';
  return formatWorkProgramDutyLabel(value);
}

function budgetStatusStyle(status: WorkProgramBudgetStatus) {
  if (status === 'APPROVED') return { text: '#166534', border: '#86efac', bg: '#dcfce7', label: 'Disetujui' };
  if (status === 'REJECTED') return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2', label: 'Ditolak' };
  return { text: '#92400e', border: '#fcd34d', bg: '#fef3c7', label: 'Menunggu' };
}

function lpjInvoiceStatusLabel(status: WorkProgramBudgetLpjInvoiceStatus) {
  if (status === 'DRAFT') return 'Draft';
  if (status === 'SUBMITTED_TO_SARPRAS') return 'Diajukan ke Sarpras';
  if (status === 'RETURNED') return 'Dikembalikan';
  if (status === 'APPROVED_BY_SARPRAS') return 'Disetujui Sarpras';
  if (status === 'SENT_TO_FINANCE') return 'Diteruskan ke Keuangan';
  return status;
}

function lpjInvoiceStatusStyle(status: WorkProgramBudgetLpjInvoiceStatus) {
  if (status === 'APPROVED_BY_SARPRAS' || status === 'SENT_TO_FINANCE') {
    return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  }
  if (status === 'RETURNED') {
    return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2' };
  }
  if (status === 'SUBMITTED_TO_SARPRAS') {
    return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  }
  return { text: '#92400e', border: '#fcd34d', bg: '#fef3c7' };
}

function waitingApproverLabel(budget: WorkProgramBudgetRequest) {
  if (budget.status !== 'PENDING') return '';
  const duties = (budget.approver?.additionalDuties || []).map((item) => String(item).toUpperCase());
  const isKesiswaan = duties.includes('WAKASEK_KESISWAAN') || duties.includes('SEKRETARIS_KESISWAAN');
  const isSarpras = duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');
  const isPrincipal = String(budget.approver?.role || '').toUpperCase() === 'PRINCIPAL';
  const isFinance =
    String(budget.approver?.role || '').toUpperCase() === 'STAFF' || duties.includes('BENDAHARA');
  if (isKesiswaan) return 'Menunggu Wakasek/Sekretaris Kesiswaan';
  if (isSarpras) return 'Menunggu Wakasek/Sekretaris Sarpras';
  if (isPrincipal) return 'Menunggu Kepala Sekolah';
  if (isFinance) return 'Menunggu Staff Keuangan / Bendahara';
  return 'Menunggu persetujuan';
}

function resolvePublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return fileUrl.startsWith('/') ? `${webBaseUrl}${fileUrl}` : `${webBaseUrl}/${fileUrl}`;
}

function resolveApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as { response?: { data?: { message?: string } }; message?: string };
  return apiError?.response?.data?.message || apiError?.message || fallback;
}

function SectionChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          backgroundColor: '#fff',
          color: BRAND_COLORS.textDark,
          paddingHorizontal: 10,
          paddingVertical: multiline ? 10 : 9,
          minHeight: multiline ? 84 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function toPositiveInt(rawValue: string, fallback: number) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function toNonNegativeInt(rawValue: string, fallback: number) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

async function pickUploadFile() {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: ['image/*', 'application/pdf'],
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > 500 * 1024) {
    Alert.alert('Ukuran File Terlalu Besar', 'Ukuran file maksimal 500KB.');
    return null;
  }
  const file: WorkProgramUploadFile = {
    uri: asset.uri,
    name: asset.name || 'upload-file',
    mimeType: asset.mimeType || 'application/octet-stream',
  };
  return file;
}

export function WorkProgramBudgetOwnerSection({
  activeYearId,
  activeYearName,
  dutyOptions,
  forcedDuty,
}: {
  activeYearId?: number | null;
  activeYearName?: string | null;
  dutyOptions: string[];
  forcedDuty?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<BudgetStatusFilter>('ALL');
  const [dutyFilter, setDutyFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(DEFAULT_BUDGET_FORM);

  const [lpjBudgetId, setLpjBudgetId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [invoiceTitle, setInvoiceTitle] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemBrand, setItemBrand] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnitPrice, setItemUnitPrice] = useState('0');
  const forcedAdvisorMeta = getAdvisorDutyMeta(forcedDuty);
  const selectedAdvisorMeta = getAdvisorDutyMeta(budgetForm.additionalDuty);
  const isAdvisorEquipmentRequest = Boolean(selectedAdvisorMeta);
  const budgetSectionTitle = forcedAdvisorMeta
    ? `${forcedAdvisorMeta.equipmentTitle} & LPJ`
    : 'Anggaran & LPJ';
  const budgetCreateTitle = selectedAdvisorMeta
    ? `Pengajuan ${selectedAdvisorMeta.equipmentTitle} Baru`
    : 'Pengajuan Anggaran Baru';
  const budgetCreateButtonLabel = selectedAdvisorMeta
    ? `Tambah Pengajuan ${selectedAdvisorMeta.equipmentTitle}`
    : 'Tambah Pengajuan Anggaran';
  const budgetCreateSubmitLabel = selectedAdvisorMeta
    ? `Simpan Pengajuan ${selectedAdvisorMeta.equipmentTitle}`
    : 'Simpan Pengajuan';

  useEffect(() => {
    const timerId = setTimeout(() => {
      setBudgetForm((prev) => {
        if (prev.additionalDuty) return prev;
        return {
          ...prev,
          additionalDuty: dutyOptions[0] || '',
        };
      });
    }, 0);
    return () => clearTimeout(timerId);
  }, [dutyOptions]);

  useEffect(() => {
    if (!isAdvisorEquipmentRequest) return;
    const timerId = setTimeout(() => {
      setBudgetForm((prev) => {
        if (prev.quantity === '1' && prev.unitPrice === '0') {
          return prev;
        }
        return {
          ...prev,
          quantity: '1',
          unitPrice: '0',
        };
      });
    }, 0);
    return () => clearTimeout(timerId);
  }, [isAdvisorEquipmentRequest]);

  const budgetsQuery = useQuery({
    queryKey: ['mobile-work-program-owner-budget-requests', user?.id, activeYearId, forcedDuty || 'ALL'],
    enabled:
      isAuthenticated &&
      ['TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(String(user?.role || '').toUpperCase()),
    queryFn: async () =>
      workProgramApi.listBudgetRequests({
        academicYearId: activeYearId || undefined,
        additionalDuty: forcedDuty || undefined,
        view: 'requester',
      }),
    ...mobileLiveQueryOptions,
  });

  const lpjQuery = useQuery({
    queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId],
    enabled:
      isAuthenticated &&
      ['TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(String(user?.role || '').toUpperCase()) &&
      !!lpjBudgetId,
    queryFn: async () => workProgramApi.listBudgetLpj(Number(lpjBudgetId)),
    ...mobileLiveQueryOptions,
  });

  const createBudgetMutation = useMutation({
    mutationFn: async () => {
      if (!activeYearId) throw new Error('Tahun ajaran aktif belum ditemukan.');
      const description = budgetForm.description.trim();
      if (!budgetForm.additionalDuty) throw new Error('Pilih tugas tambahan.');
      if (!description) {
        throw new Error(
          isAdvisorEquipmentRequest ? 'Keterangan pengajuan wajib diisi.' : 'Uraian pengajuan wajib diisi.',
        );
      }

      const toolName = budgetForm.toolName.trim();
      if (isAdvisorEquipmentRequest && !toolName) {
        throw new Error(`Nama ${getAdvisorEquipmentLabel(budgetForm.additionalDuty)} wajib diisi.`);
      }

      const quantity = isAdvisorEquipmentRequest ? 1 : toPositiveInt(budgetForm.quantity, 1);
      const unitPrice = isAdvisorEquipmentRequest ? 0 : toNonNegativeInt(budgetForm.unitPrice, 0);

      return workProgramApi.createBudgetRequest({
        title: isAdvisorEquipmentRequest ? toolName : description,
        description,
        executionTime: isAdvisorEquipmentRequest ? undefined : budgetForm.executionTime.trim() || undefined,
        brand: budgetForm.brand.trim() || undefined,
        quantity,
        unitPrice,
        totalAmount: isAdvisorEquipmentRequest ? 0 : quantity * unitPrice,
        academicYearId: activeYearId,
        additionalDuty: budgetForm.additionalDuty,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-requests'] });
      Alert.alert(
        'Berhasil',
        isAdvisorEquipmentRequest
          ? `Pengajuan ${getAdvisorEquipmentLabel(budgetForm.additionalDuty)} berhasil dibuat.`
          : 'Pengajuan anggaran berhasil dibuat.',
      );
      setFormVisible(false);
      setBudgetForm({
        ...DEFAULT_BUDGET_FORM,
        additionalDuty: dutyOptions[0] || '',
      });
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal membuat pengajuan anggaran.'));
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: number) => workProgramApi.removeBudgetRequest(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-requests'] });
      Alert.alert('Berhasil', 'Pengajuan anggaran berhasil dihapus.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal menghapus pengajuan anggaran.'));
    },
  });

  const uploadBudgetLpjMutation = useMutation({
    mutationFn: async (payload: { budgetId: number; file: WorkProgramUploadFile }) =>
      workProgramApi.uploadBudgetLpjFile(payload.budgetId, payload.file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-requests'] });
      Alert.alert('Berhasil', 'LPJ berhasil diunggah.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal mengunggah LPJ.'));
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!lpjBudgetId) throw new Error('Pilih pengajuan anggaran terlebih dahulu.');
      return workProgramApi.createBudgetLpjInvoice({
        budgetRequestId: lpjBudgetId,
        title: invoiceTitle.trim() || undefined,
      });
    },
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId] });
      setInvoiceTitle('');
      if (invoice?.id) setSelectedInvoiceId(invoice.id);
      Alert.alert('Berhasil', 'Invoice LPJ berhasil dibuat.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal membuat invoice LPJ.'));
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoiceId) throw new Error('Pilih invoice LPJ terlebih dahulu.');
      const description = itemDescription.trim();
      if (!description) throw new Error('Nama barang wajib diisi.');
      const quantity = toPositiveInt(itemQuantity, 1);
      const unitPrice = toNonNegativeInt(itemUnitPrice, 0);
      return workProgramApi.createBudgetLpjItem({
        lpjInvoiceId: selectedInvoiceId,
        description,
        brand: itemBrand.trim() || undefined,
        quantity,
        unitPrice,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId] });
      setItemDescription('');
      setItemBrand('');
      setItemQuantity('1');
      setItemUnitPrice('0');
      Alert.alert('Berhasil', 'Item LPJ berhasil ditambahkan.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal menambahkan item LPJ.'));
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: number) => workProgramApi.removeBudgetLpjItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId] });
      Alert.alert('Berhasil', 'Item LPJ berhasil dihapus.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal menghapus item LPJ.'));
    },
  });

  const uploadInvoiceMutation = useMutation({
    mutationFn: async (payload: { invoiceId: number; file: WorkProgramUploadFile }) =>
      workProgramApi.uploadBudgetLpjInvoiceFile(payload.invoiceId, payload.file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId] });
      Alert.alert('Berhasil', 'File invoice LPJ berhasil diunggah.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal mengunggah file invoice LPJ.'));
    },
  });

  const uploadProofMutation = useMutation({
    mutationFn: async (payload: { invoiceId: number; file: WorkProgramUploadFile }) =>
      workProgramApi.uploadBudgetLpjProofFile(payload.invoiceId, payload.file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId] });
      Alert.alert('Berhasil', 'File bukti LPJ berhasil diunggah.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal mengunggah file bukti LPJ.'));
    },
  });

  const submitInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: number) => workProgramApi.submitBudgetLpjInvoice(invoiceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-lpj', lpjBudgetId] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-work-program-owner-budget-requests'] });
      Alert.alert('Berhasil', 'Invoice LPJ berhasil diajukan ke Wakasek Sarpras.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal mengajukan invoice LPJ.'));
    },
  });

  const budgets = useMemo(() => budgetsQuery.data || [], [budgetsQuery.data]);

  const dutyFilterOptions = useMemo(() => {
    const keys = new Set<string>(dutyOptions.filter((item) => String(item || '').trim().length > 0));
    for (const budget of budgets) {
      const key = String(budget.additionalDuty || '').trim().toUpperCase();
      if (key) keys.add(key);
    }
    return Array.from(keys);
  }, [budgets, dutyOptions]);

  const filteredBudgets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return budgets.filter((budget) => {
      if (statusFilter !== 'ALL' && budget.status !== statusFilter) return false;
      if (dutyFilter !== 'ALL' && String(budget.additionalDuty || '').toUpperCase() !== dutyFilter) return false;
      if (!term) return true;
      const values = [
        budget.description || '',
        budget.title || '',
        toDutyLabel(budget.additionalDuty),
        budget.requester?.name || '',
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [budgets, dutyFilter, search, statusFilter]);

  const totalAmount = filteredBudgets.reduce((acc, budget) => acc + Number(budget.totalAmount || 0), 0);
  const pendingCount = budgets.filter((budget) => budget.status === 'PENDING').length;
  const lpjReadyCount = budgets.filter((budget) => budget.status === 'APPROVED' && !!budget.realizationConfirmedAt).length;

  const lpjInvoices = useMemo(() => lpjQuery.data?.invoices || [], [lpjQuery.data?.invoices]);
  const selectedInvoice =
    lpjInvoices.find((invoice) => invoice.id === selectedInvoiceId) ||
    (lpjInvoices.length > 0 ? lpjInvoices[lpjInvoices.length - 1] : null);

  useEffect(() => {
    if (!lpjInvoices.length) {
      const timerId = setTimeout(() => setSelectedInvoiceId(null), 0);
      return () => clearTimeout(timerId);
    }
    if (!selectedInvoiceId || !lpjInvoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      const timerId = setTimeout(() => setSelectedInvoiceId(lpjInvoices[lpjInvoices.length - 1].id), 0);
      return () => clearTimeout(timerId);
    }
  }, [lpjInvoices, selectedInvoiceId]);

  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === lpjBudgetId) || null,
    [budgets, lpjBudgetId],
  );

  const canEditInvoice = !!selectedInvoice && (selectedInvoice.status === 'DRAFT' || selectedInvoice.status === 'RETURNED');

  const openFile = (url: string | null | undefined, label: string) => {
    const publicUrl = resolvePublicUrl(url);
    if (!publicUrl) {
      Alert.alert('File Tidak Tersedia', 'File belum tersedia untuk dibuka.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'teacher-work-program',
      webPath: publicUrl,
      label,
    });
  };

  const askDeleteBudget = (budget: WorkProgramBudgetRequest) => {
    const equipmentTitle = getAdvisorEquipmentTitle(budget.additionalDuty);
    const title = isAdvisorDuty(budget.additionalDuty)
      ? `Hapus Pengajuan ${equipmentTitle}`
      : 'Hapus Pengajuan Anggaran';
    const reference = budget.title || budget.description;
    Alert.alert(title, `Hapus pengajuan "${reference}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteBudgetMutation.mutate(budget.id),
      },
    ]);
  };

  const askDeleteItem = (itemId: number) => {
    Alert.alert('Hapus Item LPJ', 'Item LPJ akan dihapus permanen. Lanjutkan?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteItemMutation.mutate(itemId),
      },
    ]);
  };

  const totalDraftAmount = useMemo(() => {
    if (isAdvisorEquipmentRequest) return 0;
    const qty = toPositiveInt(itemQuantity, 1);
    const unitPrice = toNonNegativeInt(itemUnitPrice, 0);
    return qty * unitPrice;
  }, [isAdvisorEquipmentRequest, itemQuantity, itemUnitPrice]);

  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        {budgetSectionTitle}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {forcedAdvisorMeta
          ? `Kelola pengajuan ${forcedAdvisorMeta.equipmentLabel} dan LPJ program kerja`
          : 'Kelola pengajuan anggaran program kerja'}
        {activeYearName ? ` • ${activeYearName}` : ''}
        {'.'}
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <SummaryCard title="Pengajuan Terfilter" value={String(filteredBudgets.length)} subtitle="Data saat ini" />
        <SummaryCard title="Total Nominal" value={formatCurrency(totalAmount)} subtitle="Akumulasi terfilter" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <SummaryCard title="Menunggu" value={String(pendingCount)} subtitle="Butuh tindak lanjut" />
        <SummaryCard title="Siap LPJ" value={String(lpjReadyCount)} subtitle="Realisasi sudah dikonfirmasi" />
      </View>

      <Pressable
        onPress={() => setFormVisible((prev) => !prev)}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {formVisible ? 'Tutup Form Pengajuan' : budgetCreateButtonLabel}
        </Text>
      </Pressable>

      {formVisible ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>{budgetCreateTitle}</Text>

          {isAdvisorEquipmentRequest ? (
            <>
              <TextField
                label={`Nama ${getAdvisorEquipmentTitle(budgetForm.additionalDuty)}`}
                value={budgetForm.toolName}
                onChangeText={(toolName) => setBudgetForm((prev) => ({ ...prev, toolName }))}
                placeholder="Contoh: Perlengkapan kegiatan"
              />

              <TextField
                label="Keterangan"
                value={budgetForm.description}
                onChangeText={(description) => setBudgetForm((prev) => ({ ...prev, description }))}
                placeholder="Alasan pengajuan atau spesifikasi singkat."
                multiline
              />
            </>
          ) : (
            <TextField
              label="Uraian Pengajuan"
              value={budgetForm.description}
              onChangeText={(description) => setBudgetForm((prev) => ({ ...prev, description }))}
              placeholder="Contoh: Pengadaan alat praktik jaringan"
              multiline
            />
          )}

          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Tugas Tambahan</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {dutyOptions.length > 0 ? (
              dutyOptions.map((duty) => (
                <SectionChip
                  key={duty}
                  active={budgetForm.additionalDuty === duty}
                  label={toDutyLabel(duty)}
                  onPress={() => setBudgetForm((prev) => ({ ...prev, additionalDuty: duty }))}
                />
              ))
            ) : (
              <Text style={{ color: '#64748b' }}>Tidak ada duty tambahan pada akun Anda.</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextField
                label={isAdvisorEquipmentRequest ? 'Merk' : 'Brand/Merk'}
                value={budgetForm.brand}
                onChangeText={(brand) => setBudgetForm((prev) => ({ ...prev, brand }))}
                placeholder="Opsional"
              />
            </View>
            {!isAdvisorEquipmentRequest ? (
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <TextField
                  label="Waktu Pelaksanaan"
                  value={budgetForm.executionTime}
                  onChangeText={(executionTime) => setBudgetForm((prev) => ({ ...prev, executionTime }))}
                  placeholder="Contoh: Juli 2026"
                />
              </View>
            ) : null}
          </View>

          {isAdvisorEquipmentRequest ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                backgroundColor: '#eff6ff',
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                Pengajuan {getAdvisorEquipmentLabel(budgetForm.additionalDuty)} tidak membutuhkan input harga pada tahap ini.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <TextField
                    label="Quantity"
                    value={budgetForm.quantity}
                    onChangeText={(quantity) => setBudgetForm((prev) => ({ ...prev, quantity }))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <TextField
                    label="Harga Satuan"
                    value={budgetForm.unitPrice}
                    onChangeText={(unitPrice) => setBudgetForm((prev) => ({ ...prev, unitPrice }))}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  borderRadius: 10,
                  backgroundColor: '#eff6ff',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                  Total: {formatCurrency(toPositiveInt(budgetForm.quantity, 1) * toNonNegativeInt(budgetForm.unitPrice, 0))}
                </Text>
              </View>
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setFormVisible(false)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
            </Pressable>
            <Pressable
              onPress={() => createBudgetMutation.mutate()}
              disabled={createBudgetMutation.isPending}
              style={{
                flex: 1,
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor: BRAND_COLORS.blue,
                opacity: createBudgetMutation.isPending ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {createBudgetMutation.isPending ? 'Menyimpan...' : budgetCreateSubmitLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Filter Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <SectionChip active={statusFilter === 'ALL'} label="Semua" onPress={() => setStatusFilter('ALL')} />
          <SectionChip active={statusFilter === 'PENDING'} label="Menunggu" onPress={() => setStatusFilter('PENDING')} />
          <SectionChip active={statusFilter === 'APPROVED'} label="Disetujui" onPress={() => setStatusFilter('APPROVED')} />
          <SectionChip active={statusFilter === 'REJECTED'} label="Ditolak" onPress={() => setStatusFilter('REJECTED')} />
        </View>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Filter Tugas</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <SectionChip active={dutyFilter === 'ALL'} label="Semua Duty" onPress={() => setDutyFilter('ALL')} />
          {dutyFilterOptions.map((duty) => (
            <SectionChip
              key={duty}
              active={dutyFilter === duty}
              label={toDutyLabel(duty)}
              onPress={() => setDutyFilter(duty)}
            />
          ))}
        </View>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari uraian, duty, atau status persetujuan..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      {budgetsQuery.isLoading ? <QueryStateView type="loading" message="Memuat data anggaran..." /> : null}
      {budgetsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data anggaran." onRetry={() => budgetsQuery.refetch()} />
      ) : null}

      {!budgetsQuery.isLoading && !budgetsQuery.isError ? (
        filteredBudgets.length > 0 ? (
          filteredBudgets.map((budget) => {
            const status = budgetStatusStyle(budget.status);
            const waitingLabel = waitingApproverLabel(budget);
            const canManageLpj = !!budget.realizationConfirmedAt;
            const canUploadLegacyLpj = canManageLpj && !budget.lpjSubmittedAt;
            const selected = lpjBudgetId === budget.id;

            return (
              <View
                key={budget.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: selected ? '#93c5fd' : '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {isAdvisorDuty(budget.additionalDuty)
                        ? budget.title || budget.description
                        : budget.description || budget.title}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      {isAdvisorDuty(budget.additionalDuty)
                        ? `${toDutyLabel(budget.additionalDuty)} • ${getAdvisorEquipmentTitle(budget.additionalDuty)}`
                        : `${toDutyLabel(budget.additionalDuty)} • Qty ${budget.quantity} • Unit ${formatCurrency(budget.unitPrice)}`}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: status.border,
                      backgroundColor: status.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: status.text, fontWeight: '700', fontSize: 11 }}>{status.label}</Text>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: '#334155', fontSize: 12 }}>Total: {formatCurrency(budget.totalAmount)}</Text>
                  {isAdvisorDuty(budget.additionalDuty) ? (
                    <>
                      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                        Keterangan: {budget.description || '-'}
                      </Text>
                      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                        Merk: {budget.brand || '-'}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                      Waktu: {budget.executionTime || '-'} • Brand: {budget.brand || '-'}
                    </Text>
                  )}
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    Dibuat: {formatDateTime(budget.createdAt)}
                  </Text>
                  {waitingLabel ? (
                    <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>{waitingLabel}</Text>
                  ) : null}
                  {budget.rejectionReason ? (
                    <Text style={{ color: '#991b1b', fontSize: 11, marginTop: 2 }}>{budget.rejectionReason}</Text>
                  ) : null}
                  <Text style={{ color: '#334155', fontSize: 11, marginTop: 2 }}>
                    Realisasi: {budget.realizationConfirmedAt ? formatDateTime(budget.realizationConfirmedAt) : 'Belum dikonfirmasi'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <Pressable
                    onPress={() => setLpjBudgetId(selected ? null : budget.id)}
                    disabled={!canManageLpj}
                    style={{
                      borderWidth: 1,
                      borderColor: canManageLpj ? '#6366f1' : '#cbd5e1',
                      backgroundColor: canManageLpj ? '#eef2ff' : '#f8fafc',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      opacity: canManageLpj ? 1 : 0.7,
                    }}
                  >
                    <Text style={{ color: canManageLpj ? '#4338ca' : '#64748b', fontWeight: '700', fontSize: 12 }}>
                      {selected ? 'Tutup LPJ' : 'Kelola LPJ'}
                    </Text>
                  </Pressable>

                  {canUploadLegacyLpj ? (
                    <Pressable
                      onPress={() => {
                        void (async () => {
                          const file = await pickUploadFile();
                          if (!file) return;
                          uploadBudgetLpjMutation.mutate({ budgetId: budget.id, file });
                        })();
                      }}
                      disabled={uploadBudgetLpjMutation.isPending}
                      style={{
                        borderWidth: 1,
                        borderColor: '#86efac',
                        backgroundColor: '#f0fdf4',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        opacity: uploadBudgetLpjMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: '#166534', fontWeight: '700', fontSize: 12 }}>
                        {uploadBudgetLpjMutation.isPending ? 'Mengunggah...' : 'Upload LPJ'}
                      </Text>
                    </Pressable>
                  ) : null}

                  {budget.lpjFileUrl ? (
                    <Pressable
                      onPress={() => openFile(budget.lpjFileUrl, 'LPJ Anggaran')}
                      style={{
                        borderWidth: 1,
                        borderColor: '#93c5fd',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Lihat LPJ</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => askDeleteBudget(budget)}
                    disabled={deleteBudgetMutation.isPending}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      opacity: deleteBudgetMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada data</Text>
            <Text style={{ color: '#64748b' }}>Tidak ada pengajuan anggaran sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

      {selectedBudget ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#bfdbfe',
            borderRadius: 12,
            padding: 12,
            marginTop: 4,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Kelola LPJ Anggaran</Text>
          <Text style={{ color: '#475569', marginTop: 3 }}>{selectedBudget.description}</Text>

          {lpjQuery.isLoading ? <QueryStateView type="loading" message="Memuat invoice LPJ..." /> : null}
          {lpjQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat invoice LPJ." onRetry={() => lpjQuery.refetch()} />
          ) : null}

          {!lpjQuery.isLoading && !lpjQuery.isError ? (
            <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  backgroundColor: '#f8fbff',
                  padding: 10,
                  marginTop: 10,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#334155', fontSize: 12, marginBottom: 6 }}>
                  Total invoice: <Text style={{ fontWeight: '700' }}>{lpjInvoices.length}</Text>
                </Text>

                <TextField
                  label="Judul Invoice (Opsional)"
                  value={invoiceTitle}
                  onChangeText={setInvoiceTitle}
                  placeholder="Contoh: Invoice Laptop Praktik"
                />

                <Pressable
                  onPress={() => createInvoiceMutation.mutate()}
                  disabled={!selectedBudget.realizationConfirmedAt || createInvoiceMutation.isPending}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#1d4ed8',
                    opacity: !selectedBudget.realizationConfirmedAt || createInvoiceMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {createInvoiceMutation.isPending ? 'Membuat Invoice...' : 'Buat Invoice LPJ'}
                  </Text>
                </Pressable>
              </View>

              {lpjInvoices.length > 0 ? (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Daftar Invoice</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {lpjInvoices.map((invoice, index) => (
                      <SectionChip
                        key={invoice.id}
                        active={selectedInvoice?.id === invoice.id}
                        label={invoice.title || `Invoice #${index + 1}`}
                        onPress={() => setSelectedInvoiceId(invoice.id)}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={{ color: '#64748b', marginBottom: 8 }}>Belum ada invoice LPJ.</Text>
              )}

              {selectedInvoice ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: '#fff',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {selectedInvoice.title || 'Invoice LPJ'}
                      </Text>
                      <View
                        style={{
                          marginTop: 4,
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: lpjInvoiceStatusStyle(selectedInvoice.status).border,
                          backgroundColor: lpjInvoiceStatusStyle(selectedInvoice.status).bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: lpjInvoiceStatusStyle(selectedInvoice.status).text, fontWeight: '700', fontSize: 11 }}>
                          {lpjInvoiceStatusLabel(selectedInvoice.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      Update: {formatDateTime(selectedInvoice.updatedAt)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 10 }}>
                    <Pressable
                      onPress={() => {
                        void (async () => {
                          const file = await pickUploadFile();
                          if (!file) return;
                          uploadInvoiceMutation.mutate({ invoiceId: selectedInvoice.id, file });
                        })();
                      }}
                      disabled={!canEditInvoice || uploadInvoiceMutation.isPending}
                      style={{
                        borderWidth: 1,
                        borderColor: '#93c5fd',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        opacity: !canEditInvoice || uploadInvoiceMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                        {selectedInvoice.invoiceFileUrl ? 'Ganti Invoice' : 'Upload Invoice'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        void (async () => {
                          const file = await pickUploadFile();
                          if (!file) return;
                          uploadProofMutation.mutate({ invoiceId: selectedInvoice.id, file });
                        })();
                      }}
                      disabled={!canEditInvoice || uploadProofMutation.isPending}
                      style={{
                        borderWidth: 1,
                        borderColor: '#86efac',
                        backgroundColor: '#f0fdf4',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        opacity: !canEditInvoice || uploadProofMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: '#166534', fontWeight: '700', fontSize: 12 }}>
                        {selectedInvoice.proofFileUrl ? 'Ganti Bukti' : 'Upload Bukti'}
                      </Text>
                    </Pressable>

                    {selectedInvoice.invoiceFileUrl ? (
                      <Pressable
                        onPress={() => openFile(selectedInvoice.invoiceFileUrl, 'Invoice LPJ')}
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          backgroundColor: '#fff',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Lihat Invoice</Text>
                      </Pressable>
                    ) : null}

                    {selectedInvoice.proofFileUrl ? (
                      <Pressable
                        onPress={() => openFile(selectedInvoice.proofFileUrl, 'Bukti LPJ')}
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          backgroundColor: '#fff',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Lihat Bukti</Text>
                      </Pressable>
                    ) : null}

                    {canEditInvoice ? (
                      <Pressable
                        onPress={() => submitInvoiceMutation.mutate(selectedInvoice.id)}
                        disabled={submitInvoiceMutation.isPending}
                        style={{
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          backgroundColor: '#059669',
                          opacity: submitInvoiceMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          {submitInvoiceMutation.isPending ? 'Mengajukan...' : 'Ajukan ke Sarpras'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Item LPJ</Text>
                  {selectedInvoice.items.length > 0 ? (
                    selectedInvoice.items.map((item) => (
                      <View
                        key={item.id}
                        style={{
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 10,
                          backgroundColor: '#f8fbff',
                          padding: 10,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.description}</Text>
                        <Text style={{ color: '#475569', marginTop: 2, fontSize: 12 }}>
                          {item.brand || '-'} • QTY {item.quantity} • Harga {formatCurrency(item.unitPrice)}
                        </Text>
                        <Text style={{ color: '#334155', marginTop: 2, fontSize: 12 }}>
                          Total: {formatCurrency(item.amount)}
                        </Text>
                        {canEditInvoice ? (
                          <Pressable
                            onPress={() => askDeleteItem(item.id)}
                            disabled={deleteItemMutation.isPending}
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                              borderRadius: 8,
                              backgroundColor: '#fff',
                              paddingVertical: 7,
                              alignItems: 'center',
                              opacity: deleteItemMutation.isPending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus Item</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: '#64748b', marginBottom: 8 }}>Belum ada item pada invoice ini.</Text>
                  )}

                  {canEditInvoice ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 10,
                        backgroundColor: '#eff6ff',
                        padding: 10,
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Tambah Item LPJ</Text>
                      <TextField
                        label="Nama Barang"
                        value={itemDescription}
                        onChangeText={setItemDescription}
                        placeholder="Contoh: Laptop Praktik"
                      />
                      <TextField
                        label="Brand"
                        value={itemBrand}
                        onChangeText={setItemBrand}
                        placeholder="Opsional"
                      />
                      <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                        <View style={{ flex: 1, paddingHorizontal: 4 }}>
                          <TextField
                            label="QTY"
                            value={itemQuantity}
                            onChangeText={setItemQuantity}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 4 }}>
                          <TextField
                            label="Harga"
                            value={itemUnitPrice}
                            onChangeText={setItemUnitPrice}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', marginBottom: 8 }}>
                        Total Draft: {formatCurrency(totalDraftAmount)}
                      </Text>
                      <Pressable
                        onPress={() => createItemMutation.mutate()}
                        disabled={createItemMutation.isPending}
                        style={{
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: BRAND_COLORS.blue,
                          opacity: createItemMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          {createItemMutation.isPending ? 'Menyimpan Item...' : 'Tambah Item'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
