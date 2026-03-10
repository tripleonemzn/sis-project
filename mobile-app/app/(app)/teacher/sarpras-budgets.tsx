import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { sarprasApi } from '../../../src/features/sarpras/sarprasApi';
import {
  SarprasBudgetRequest,
  SarprasBudgetStatus,
  SarprasLpjInvoiceStatus,
} from '../../../src/features/sarpras/types';
import { getApiErrorMessage } from '../../../src/lib/api/errorMessage';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type StatusFilter = 'ALL' | SarprasBudgetStatus;

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: 'Semua',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

function hasSarprasDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');
}

function formatCurrency(value: number) {
  return `Rp ${Math.max(0, Number(value || 0)).toLocaleString('id-ID')}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusColors(status: SarprasBudgetStatus) {
  if (status === 'APPROVED') return { text: '#15803d', border: '#86efac', bg: '#dcfce7' };
  if (status === 'REJECTED') return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2' };
  return { text: '#b45309', border: '#fcd34d', bg: '#fef3c7' };
}

function lpjStatusLabel(status: SarprasLpjInvoiceStatus) {
  if (status === 'DRAFT') return 'Draft';
  if (status === 'SUBMITTED_TO_SARPRAS') return 'Diajukan ke Sarpras';
  if (status === 'RETURNED') return 'Dikembalikan';
  if (status === 'APPROVED_BY_SARPRAS') return 'Disetujui Sarpras';
  if (status === 'SENT_TO_FINANCE') return 'Diteruskan ke Keuangan';
  return status;
}

function resolveDutyMeta(budget: SarprasBudgetRequest) {
  const raw = (budget.additionalDuty || '').toUpperCase();
  if (raw === 'KAPROG') {
    const majorNameFromWorkProgram = budget.workProgram?.major?.name || undefined;
    const majorNameFromRequester =
      Array.isArray(budget.requester?.managedMajors) &&
      budget.requester!.managedMajors!.length === 1
        ? budget.requester!.managedMajors![0]?.name || undefined
        : undefined;
    const majorName = majorNameFromWorkProgram || majorNameFromRequester;
    if (majorName) {
      return {
        key: `KAPROG|${majorName}`,
        label: `Kepala Kompetensi ${majorName}`,
      };
    }
    return {
      key: 'KAPROG',
      label: 'Kepala Kompetensi',
    };
  }
  return {
    key: raw || 'LAINNYA',
    label: raw ? raw.replace(/_/g, ' ') : 'Lainnya',
  };
}

function lpjProgressLabel(budget: SarprasBudgetRequest) {
  if (!budget.realizationConfirmedAt) {
    return 'Menunggu konfirmasi realisasi keuangan';
  }
  if (!budget.lpjSubmittedAt) {
    return 'Menunggu LPJ dari pengaju';
  }
  return 'LPJ tersedia untuk audit Sarpras';
}

function StatusChip({
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
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

export default function TeacherSarprasBudgetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [dutyFilter, setDutyFilter] = useState<string>('ALL');
  const [auditBudgetId, setAuditBudgetId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [auditReportDrafts, setAuditReportDrafts] = useState<Record<number, string>>({});

  const isAllowed = user?.role === 'TEACHER' && hasSarprasDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-sarpras-budgets-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const budgetsQuery = useQuery({
    queryKey: ['mobile-sarpras-budgets-list', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: () => sarprasApi.listBudgetApprovals({ academicYearId: activeYearQuery.data?.id }),
  });

  const forwardMutation = useMutation({
    mutationFn: (payload: { id: number }) =>
      sarprasApi.updateBudgetRequestStatus({
        id: payload.id,
        status: 'APPROVED',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-budgets-list'] });
      Alert.alert('Berhasil', 'Pengajuan berhasil diteruskan ke Kepala Sekolah.');
    },
    onError: (error: unknown) => {
      Alert.alert('Proses Gagal', getApiErrorMessage(error, 'Gagal memproses pengajuan anggaran.'));
    },
  });

  const lpjAuditQuery = useQuery({
    queryKey: ['mobile-sarpras-budget-lpj', auditBudgetId],
    enabled: isAuthenticated && !!isAllowed && !!auditBudgetId,
    queryFn: async () => sarprasApi.listBudgetLpjByBudgetRequest(Number(auditBudgetId)),
  });

  const auditItemMutation = useMutation({
    mutationFn: (payload: { id: number; isMatched: boolean; auditNote?: string }) =>
      sarprasApi.auditBudgetLpjItem(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-budget-lpj', auditBudgetId] });
      Alert.alert('Berhasil', 'Audit item LPJ berhasil disimpan.');
    },
    onError: (error: unknown) => {
      Alert.alert('Proses Gagal', getApiErrorMessage(error, 'Gagal menyimpan audit item LPJ.'));
    },
  });

  const auditReportMutation = useMutation({
    mutationFn: (payload: { invoiceId: number; auditReport: string }) =>
      sarprasApi.saveBudgetLpjAuditReport(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-budget-lpj', auditBudgetId] });
      Alert.alert('Berhasil', 'Berita acara LPJ berhasil disimpan.');
    },
    onError: (error: unknown) => {
      Alert.alert('Proses Gagal', getApiErrorMessage(error, 'Gagal menyimpan berita acara LPJ.'));
    },
  });

  const lpjDecisionMutation = useMutation({
    mutationFn: (payload: { invoiceId: number; action: 'APPROVE' | 'RETURN' | 'SEND_TO_FINANCE' }) =>
      sarprasApi.sarprasDecisionOnBudgetLpj(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-budget-lpj', auditBudgetId] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-budgets-list'] });
      Alert.alert('Berhasil', 'Keputusan LPJ berhasil diproses.');
    },
    onError: (error: unknown) => {
      Alert.alert('Proses Gagal', getApiErrorMessage(error, 'Gagal memproses keputusan LPJ.'));
    },
  });

  const budgets = useMemo(() => budgetsQuery.data || [], [budgetsQuery.data]);

  const dutyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const budget of budgets) {
      const duty = resolveDutyMeta(budget);
      if (!map.has(duty.key)) {
        map.set(duty.key, duty.label);
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [budgets]);

  const filteredBudgets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return budgets.filter((budget) => {
      if (statusFilter !== 'ALL' && budget.status !== statusFilter) return false;
      const duty = resolveDutyMeta(budget);
      if (dutyFilter !== 'ALL' && duty.key !== dutyFilter) return false;
      if (!query) return true;
      const haystacks = [
        budget.title || '',
        budget.description || '',
        budget.requester?.name || '',
        duty.label,
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [budgets, dutyFilter, search, statusFilter]);

  const totalAmount = filteredBudgets.reduce((sum, budget) => sum + Number(budget.totalAmount || 0), 0);
  const pendingCount = budgets.filter((budget) => budget.status === 'PENDING').length;
  const lpjReadyCount = budgets.filter((budget) => budget.status === 'APPROVED' && !!budget.lpjSubmittedAt).length;
  const lpjInvoices = useMemo(() => lpjAuditQuery.data?.invoices || [], [lpjAuditQuery.data?.invoices]);
  const activeSelectedInvoiceId = useMemo(() => {
    if (!lpjInvoices.length) return null;
    if (selectedInvoiceId && lpjInvoices.some((invoice) => invoice.id === selectedInvoiceId)) return selectedInvoiceId;
    return lpjInvoices[lpjInvoices.length - 1].id;
  }, [lpjInvoices, selectedInvoiceId]);
  const selectedInvoice =
    lpjInvoices.find((invoice) => invoice.id === activeSelectedInvoiceId) ||
    (lpjInvoices.length > 0 ? lpjInvoices[lpjInvoices.length - 1] : null);

  const handleForward = (budget: SarprasBudgetRequest) => {
    Alert.alert(
      'Teruskan Pengajuan',
      `Teruskan pengajuan "${budget.title}" ke Kepala Sekolah untuk keputusan final?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Teruskan',
          style: 'default',
          onPress: () => forwardMutation.mutate({ id: budget.id }),
        },
      ],
    );
  };

  const handleOpenAudit = (budget: SarprasBudgetRequest) => {
    if (!budget.id) return;
    setAuditBudgetId(budget.id);
    setSelectedInvoiceId(null);
  };

  const auditBudget = budgets.find((budget) => budget.id === auditBudgetId) || null;
  const selectedInvoiceDraft = selectedInvoice
    ? auditReportDrafts[selectedInvoice.id] ?? selectedInvoice.auditReport ?? ''
    : '';

  if (isLoading) return <AppLoadingScreen message="Memuat persetujuan anggaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Persetujuan Anggaran</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Persetujuan Anggaran
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia untuk tugas tambahan Wakasek Sarpras / Sekretaris Sarpras.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || budgetsQuery.isFetching || lpjAuditQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void budgetsQuery.refetch();
            if (auditBudgetId) void lpjAuditQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Persetujuan Anggaran
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Verifikasi pengajuan anggaran unit sekolah
        {activeYearQuery.data?.name ? ` • ${activeYearQuery.data.name}` : ''}.
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <SummaryCard title="Pengajuan Terfilter" value={`${filteredBudgets.length}`} subtitle="Data pengajuan saat ini" />
        <SummaryCard title="Total Nominal" value={formatCurrency(totalAmount)} subtitle="Akumulasi dana terfilter" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <SummaryCard title="Menunggu Proses" value={`${pendingCount}`} subtitle="Butuh tindakan Sarpras" />
        <SummaryCard title="LPJ Siap Audit" value={`${lpjReadyCount}`} subtitle="LPJ sudah diajukan guru" />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari judul, pengaju, atau unit"
          placeholderTextColor="#8ea0bf"
          style={{
            flex: 1,
            paddingVertical: 11,
            paddingHorizontal: 9,
            color: BRAND_COLORS.textDark,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((status) => (
          <StatusChip
            key={status}
            active={statusFilter === status}
            label={STATUS_LABEL[status]}
            onPress={() => setStatusFilter(status)}
          />
        ))}
      </View>

      {dutyOptions.length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Filter Unit</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatusChip active={dutyFilter === 'ALL'} label="Semua Unit" onPress={() => setDutyFilter('ALL')} />
              {dutyOptions.map((option) => (
                <StatusChip
                  key={option.key}
                  active={dutyFilter === option.key}
                  label={option.label}
                  onPress={() => setDutyFilter(option.key)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {budgetsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data pengajuan anggaran..." /> : null}
      {budgetsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data persetujuan anggaran."
          onRetry={() => budgetsQuery.refetch()}
        />
      ) : null}

      {!budgetsQuery.isLoading && !budgetsQuery.isError ? (
        filteredBudgets.length > 0 ? (
          filteredBudgets.map((budget) => {
            const duty = resolveDutyMeta(budget);
            const statusStyle = statusColors(budget.status);
            return (
              <View
                key={budget.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  backgroundColor: '#fff',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>
                      {budget.title || 'Tanpa judul'}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3 }}>{budget.description || '-'}</Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: statusStyle.border,
                      backgroundColor: statusStyle.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: statusStyle.text, fontWeight: '700', fontSize: 11 }}>
                      {STATUS_LABEL[budget.status]}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Pengaju: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{budget.requester?.name || '-'}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Unit: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{duty.label}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Qty: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{budget.quantity}</Text> • Harga/unit:{' '}
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{formatCurrency(budget.unitPrice)}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Total: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatCurrency(budget.totalAmount)}</Text>
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    Dibuat: {formatDate(budget.createdAt)} • LPJ: {lpjProgressLabel(budget)}
                  </Text>
                </View>

                {budget.status === 'REJECTED' && budget.rejectionReason ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fff1f2',
                      borderRadius: 8,
                      padding: 8,
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ color: '#991b1b', fontSize: 12 }}>{budget.rejectionReason}</Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                  {budget.status === 'PENDING' ? (
                    <Pressable
                      onPress={() => handleForward(budget)}
                      disabled={forwardMutation.isPending}
                      style={{
                        flex: 1,
                        borderRadius: 9,
                        backgroundColor: BRAND_COLORS.blue,
                        alignItems: 'center',
                        paddingVertical: 11,
                        opacity: forwardMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Teruskan ke Kepala Sekolah</Text>
                    </Pressable>
                  ) : null}

                  {budget.status === 'APPROVED' && budget.realizationConfirmedAt ? (
                    <Pressable
                      onPress={() => handleOpenAudit(budget)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#93c5fd',
                        borderRadius: 9,
                        backgroundColor: '#eff6ff',
                        alignItems: 'center',
                        paddingVertical: 11,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                        {auditBudgetId === budget.id ? 'Audit LPJ Aktif' : 'Audit LPJ'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#cbd5e1',
              borderRadius: 10,
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Tidak ada data pengajuan yang cocok dengan filter saat ini.
            </Text>
          </View>
        )
      ) : null}

      {auditBudgetId ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            borderRadius: 12,
            backgroundColor: '#eff6ff',
            padding: 12,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1e3a8a', fontWeight: '700', fontSize: 16 }}>
                Audit LPJ Anggaran
              </Text>
              <Text style={{ color: '#334155', marginTop: 2, fontSize: 12 }}>
                {auditBudget?.title || 'Pengajuan anggaran terpilih'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setAuditBudgetId(null);
                setSelectedInvoiceId(null);
              }}
              style={{
                borderWidth: 1,
                borderColor: '#93c5fd',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Tutup</Text>
            </Pressable>
          </View>

          {lpjAuditQuery.isLoading ? (
            <View style={{ marginTop: 10 }}>
              <QueryStateView type="loading" message="Memuat data LPJ..." />
            </View>
          ) : null}

          {lpjAuditQuery.isError ? (
            <View style={{ marginTop: 10 }}>
              <QueryStateView type="error" message="Gagal memuat data LPJ." onRetry={() => lpjAuditQuery.refetch()} />
            </View>
          ) : null}

          {!lpjAuditQuery.isLoading && !lpjAuditQuery.isError ? (
            lpjInvoices.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 8 }}>Pilih Invoice LPJ</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {lpjInvoices.map((invoice, index) => (
                      <StatusChip
                        key={invoice.id}
                        active={selectedInvoice?.id === invoice.id}
                        label={`${invoice.title || `Invoice #${index + 1}`} (${lpjStatusLabel(invoice.status)})`}
                        onPress={() => setSelectedInvoiceId(invoice.id)}
                      />
                    ))}
                  </View>
                </ScrollView>

                {selectedInvoice ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbeafe',
                      borderRadius: 10,
                      backgroundColor: '#fff',
                      padding: 10,
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {selectedInvoice.title || `Invoice #${selectedInvoice.id}`}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                      Status: {lpjStatusLabel(selectedInvoice.status)}
                    </Text>

                    {(selectedInvoice.items || []).length > 0 ? (
                      (selectedInvoice.items || []).map((item) => (
                        <View
                          key={item.id}
                          style={{
                            marginTop: 10,
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 8,
                            backgroundColor: '#fff',
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 13 }}>
                            {item.description}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                            QTY {item.quantity} • Harga {formatCurrency(item.unitPrice)} • Total {formatCurrency(item.amount)}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                            Audit: {typeof item.isMatched === 'boolean' ? (item.isMatched ? 'Sesuai' : 'Tidak Sesuai') : 'Belum diaudit'}
                          </Text>
                          {item.auditNote ? (
                            <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                              Catatan: {item.auditNote}
                            </Text>
                          ) : null}

                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Pressable
                              onPress={() => auditItemMutation.mutate({ id: item.id, isMatched: true })}
                              disabled={auditItemMutation.isPending}
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                paddingVertical: 8,
                                alignItems: 'center',
                                backgroundColor: '#dcfce7',
                                borderWidth: 1,
                                borderColor: '#86efac',
                                opacity: auditItemMutation.isPending ? 0.7 : 1,
                              }}
                            >
                              <Text style={{ color: '#166534', fontWeight: '700' }}>Sesuai</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => auditItemMutation.mutate({ id: item.id, isMatched: false })}
                              disabled={auditItemMutation.isPending}
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                paddingVertical: 8,
                                alignItems: 'center',
                                backgroundColor: '#fee2e2',
                                borderWidth: 1,
                                borderColor: '#fca5a5',
                                opacity: auditItemMutation.isPending ? 0.7 : 1,
                              }}
                            >
                              <Text style={{ color: '#991b1b', fontWeight: '700' }}>Tidak Sesuai</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))
                    ) : (
                      <View
                        style={{
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: '#cbd5e1',
                          borderRadius: 10,
                          backgroundColor: '#fff',
                          padding: 12,
                          marginTop: 10,
                        }}
                      >
                        <Text style={{ color: '#64748b' }}>Belum ada item pada invoice ini.</Text>
                      </View>
                    )}

                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                        Berita Acara Audit
                      </Text>
                      <TextInput
                        value={selectedInvoiceDraft}
                        onChangeText={(value) =>
                          setAuditReportDrafts((prev) => ({
                            ...prev,
                            [selectedInvoice.id]: value,
                          }))
                        }
                        placeholder="Tuliskan berita acara singkat hasil audit LPJ..."
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 10,
                          color: '#0f172a',
                          marginBottom: 8,
                        }}
                        placeholderTextColor="#94a3b8"
                        multiline
                      />
                      <Pressable
                        onPress={() => {
                          const auditReport = String(selectedInvoiceDraft || '').trim();
                          if (!auditReport) {
                            Alert.alert('Validasi', 'Berita acara audit wajib diisi.');
                            return;
                          }
                          auditReportMutation.mutate({
                            invoiceId: selectedInvoice.id,
                            auditReport,
                          });
                        }}
                        disabled={auditReportMutation.isPending}
                        style={{
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: BRAND_COLORS.blue,
                          opacity: auditReportMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          {auditReportMutation.isPending ? 'Menyimpan...' : 'Simpan Berita Acara'}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {selectedInvoice.status === 'SUBMITTED_TO_SARPRAS' ? (
                        <>
                          <Pressable
                            onPress={() =>
                              lpjDecisionMutation.mutate({ invoiceId: selectedInvoice.id, action: 'APPROVE' })
                            }
                            disabled={lpjDecisionMutation.isPending}
                            style={{
                              flex: 1,
                              borderRadius: 8,
                              paddingVertical: 10,
                              alignItems: 'center',
                              backgroundColor: '#dcfce7',
                              borderWidth: 1,
                              borderColor: '#86efac',
                              opacity: lpjDecisionMutation.isPending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{ color: '#166534', fontWeight: '700' }}>Setujui LPJ</Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              lpjDecisionMutation.mutate({ invoiceId: selectedInvoice.id, action: 'RETURN' })
                            }
                            disabled={lpjDecisionMutation.isPending}
                            style={{
                              flex: 1,
                              borderRadius: 8,
                              paddingVertical: 10,
                              alignItems: 'center',
                              backgroundColor: '#fee2e2',
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                              opacity: lpjDecisionMutation.isPending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{ color: '#991b1b', fontWeight: '700' }}>Kembalikan ke Guru</Text>
                          </Pressable>
                        </>
                      ) : selectedInvoice.status === 'APPROVED_BY_SARPRAS' ? (
                        <Pressable
                          onPress={() =>
                            lpjDecisionMutation.mutate({ invoiceId: selectedInvoice.id, action: 'SEND_TO_FINANCE' })
                          }
                          disabled={lpjDecisionMutation.isPending}
                          style={{
                            flex: 1,
                            borderRadius: 8,
                            paddingVertical: 10,
                            alignItems: 'center',
                            backgroundColor: '#e0f2fe',
                            borderWidth: 1,
                            borderColor: '#7dd3fc',
                            opacity: lpjDecisionMutation.isPending ? 0.7 : 1,
                          }}
                        >
                          <Text style={{ color: '#0369a1', fontWeight: '700' }}>Kirim ke Keuangan</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  backgroundColor: '#fff',
                  padding: 12,
                  marginTop: 10,
                }}
              >
                <Text style={{ color: '#64748b' }}>Belum ada invoice LPJ untuk pengajuan ini.</Text>
              </View>
            )
          ) : null}
        </View>
      ) : null}

    </ScrollView>
  );
}
