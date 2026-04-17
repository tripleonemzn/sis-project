import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { principalApi } from '../../../src/features/principal/principalApi';
import { PrincipalBudgetRequest, PrincipalBudgetRequestStatus } from '../../../src/features/principal/types';
import { usePrincipalApprovalsQuery } from '../../../src/features/principal/usePrincipalApprovalsQuery';
import {
  staffFinanceApi,
  type StaffFinanceBankReconciliation,
  type FinanceBudgetProgressStage,
  type StaffFinanceCashSession,
  type StaffFinanceClosingPeriod,
  type StaffFinanceClosingPeriodReopenRequest,
  type StaffFinanceGovernanceSummary,
  type StaffFinanceIntegritySummary,
  type StaffFinancePerformanceSummary,
  type StaffFinancePaymentReversalRequest,
  type StaffFinanceWriteOffRequest,
} from '../../../src/features/staff/staffFinanceApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useIsScreenActive } from '../../../src/hooks/useIsScreenActive';

type FilterStatus = 'ALL' | PrincipalBudgetRequestStatus;

const STATUS_LABEL: Record<FilterStatus, string> = {
  ALL: 'Semua',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

function statusColor(status: PrincipalBudgetRequestStatus) {
  if (status === 'APPROVED') return '#15803d';
  if (status === 'REJECTED') return '#b91c1c';
  return '#b45309';
}

function formatCurrency(value: number) {
  return `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getClosingPeriodStatusStyle(period: StaffFinanceClosingPeriod) {
  if (period.status === 'CLOSED') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Terkunci' };
  if (period.status === 'CLOSING_REVIEW') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Review Closing' };
  return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Terbuka' };
}

function getClosingPeriodApprovalStyle(period: StaffFinanceClosingPeriod) {
  if (period.approvalStatus === 'PENDING_HEAD_TU') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Menunggu Kepala TU' };
  if (period.approvalStatus === 'PENDING_PRINCIPAL') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985', label: 'Menunggu Kepsek' };
  if (period.approvalStatus === 'APPROVED') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Disetujui' };
  if (period.approvalStatus === 'REJECTED') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'Ditolak' };
  return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Belum Diajukan' };
}

function getClosingPeriodReopenStyle(request: StaffFinanceClosingPeriodReopenRequest) {
  if (request.status === 'PENDING_HEAD_TU') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Menunggu Kepala TU' };
  if (request.status === 'PENDING_PRINCIPAL') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985', label: 'Menunggu Kepsek' };
  if (request.status === 'APPLIED') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Direopen' };
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'Ditolak' };
}

function getBudgetProgressStyle(stage: FinanceBudgetProgressStage) {
  if (stage === 'RETURNED_BY_FINANCE') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'Dikembalikan Keuangan' };
  if (stage === 'FINANCE_REVIEW') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985', label: 'Review Keuangan' };
  if (stage === 'LPJ_PREPARATION') return { bg: '#f3e8ff', border: '#d8b4fe', text: '#6b21a8', label: 'Persiapan LPJ' };
  if (stage === 'WAITING_LPJ') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Menunggu LPJ' };
  if (stage === 'WAITING_REALIZATION') return { bg: '#ffedd5', border: '#fdba74', text: '#c2410c', label: 'Menunggu Realisasi' };
  if (stage === 'PENDING_APPROVAL') return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Menunggu Persetujuan' };
  if (stage === 'REALIZED') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Terealisasi' };
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'Ditolak' };
}

function getGovernanceRiskStyle(level: StaffFinanceGovernanceSummary['overview']['riskLevel']) {
  if (level === 'CRITICAL') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'Kritis' };
  if (level === 'HIGH') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Tinggi' };
  if (level === 'MEDIUM') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985', label: 'Pantau' };
  return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Stabil' };
}

function getGovernanceSeverityStyle(level: StaffFinanceGovernanceSummary['followUpQueue'][number]['severity']) {
  if (level === 'CRITICAL') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  if (level === 'HIGH') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  if (level === 'MEDIUM') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985' };
  return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' };
}

function getPerformanceSignalStyle(level: StaffFinancePerformanceSummary['signals'][number]['tone']) {
  if (level === 'POSITIVE') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (level === 'WATCH') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
}

function getIntegrityStatusStyle(level: StaffFinanceIntegritySummary['overview']['status']) {
  if (level === 'READY') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (level === 'WATCH') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  if (level === 'ACTION_REQUIRED') return { bg: '#ffedd5', border: '#fdba74', text: '#c2410c' };
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
}

function getIntegritySeverityStyle(level: StaffFinanceIntegritySummary['issues'][number]['severity']) {
  if (level === 'CRITICAL') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  if (level === 'HIGH') return { bg: '#ffedd5', border: '#fdba74', text: '#c2410c' };
  if (level === 'MEDIUM') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' };
}

export default function PrincipalApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isScreenActive = useIsScreenActive();
  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-active-year'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
    staleTime: 5 * 60 * 1000,
  });
  const approvalsQuery = usePrincipalApprovalsQuery({ enabled: isAuthenticated, user });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');
  const writeOffsQuery = useQuery({
    queryKey: ['mobile-principal-write-offs', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listWriteOffs({ pendingFor: 'PRINCIPAL', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const paymentReversalsQuery = useQuery({
    queryKey: ['mobile-principal-payment-reversals', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listPaymentReversals({ pendingFor: 'PRINCIPAL', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const cashSessionsQuery = useQuery({
    queryKey: ['mobile-principal-cash-sessions', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listCashSessions({ mine: false, limit: 8 }),
    staleTime: 60 * 1000,
  });

  const cashSessionApprovalsQuery = useQuery({
    queryKey: ['mobile-principal-cash-session-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listCashSessions({ pendingFor: 'PRINCIPAL', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const bankReconciliationsQuery = useQuery({
    queryKey: ['mobile-principal-bank-reconciliations', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listBankReconciliations({ limit: 8 }),
    staleTime: 60 * 1000,
  });

  const budgetRealizationQuery = useQuery({
    queryKey: ['mobile-principal-budget-realization', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () =>
      staffFinanceApi.getBudgetRealizationSummary({
        academicYearId: activeYearQuery.data?.id,
        limit: 8,
    }),
    staleTime: 60 * 1000,
  });

  const governanceQuery = useQuery({
    queryKey: ['mobile-principal-governance', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () =>
      staffFinanceApi.getGovernanceSummary({
        academicYearId: activeYearQuery.data?.id,
        limit: 6,
    }),
    staleTime: 60 * 1000,
  });

  const auditQuery = useQuery({
    queryKey: ['mobile-principal-finance-audit', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () =>
      staffFinanceApi.getAuditSummary({
        days: 30,
        limit: 6,
    }),
    staleTime: 60 * 1000,
  });

  const performanceQuery = useQuery({
    queryKey: ['mobile-principal-finance-performance', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () =>
      staffFinanceApi.getPerformanceSummary({
        months: 6,
      }),
    staleTime: 60 * 1000,
  });

  const integrityQuery = useQuery({
    queryKey: ['mobile-principal-finance-integrity', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () =>
      staffFinanceApi.getIntegritySummary({
        limit: 6,
    }),
    staleTime: 60 * 1000,
    refetchInterval: isScreenActive ? 300_000 : false,
    refetchIntervalInBackground: false,
  });

  const closingPeriodsQuery = useQuery({
    queryKey: ['mobile-principal-closing-periods', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listClosingPeriods({ limit: 8 }),
    staleTime: 60 * 1000,
  });

  const closingPeriodApprovalsQuery = useQuery({
    queryKey: ['mobile-principal-closing-period-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listClosingPeriods({ pendingFor: 'PRINCIPAL', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const closingPeriodReopenRequestsQuery = useQuery({
    queryKey: ['mobile-principal-closing-period-reopen-requests', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listClosingPeriodReopenRequests({ limit: 8 }),
    staleTime: 60 * 1000,
  });

  const closingPeriodReopenApprovalsQuery = useQuery({
    queryKey: ['mobile-principal-closing-period-reopen-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => staffFinanceApi.listClosingPeriodReopenRequests({ pendingFor: 'PRINCIPAL', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const decisionMutation = useMutation({
    mutationFn: (payload: { id: number; status: 'APPROVED' | 'REJECTED' }) =>
      principalApi.updateBudgetRequestStatus(payload),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-approvals', user?.id] });
      void approvalsQuery.refetch();
      const message = variables.status === 'APPROVED' ? 'Pengajuan disetujui' : 'Pengajuan ditolak';
      notifySuccess(message);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses pengajuan.');
    },
  });

  const principalWriteOffMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceApi.decideWriteOffAsPrincipal(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-write-offs', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-finance-integrity', user?.id] });
      notifySuccess(payload.approved ? 'Write-off disetujui.' : 'Write-off ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval write-off.');
    },
  });

  const principalPaymentReversalMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceApi.decidePaymentReversalAsPrincipal(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-payment-reversals', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-finance-integrity', user?.id] });
      notifySuccess(payload.approved ? 'Reversal pembayaran disetujui.' : 'Reversal pembayaran ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval reversal pembayaran.');
    },
  });

  const principalCashSessionMutation = useMutation({
    mutationFn: (payload: { sessionId: number; approved: boolean }) =>
      staffFinanceApi.decideCashSessionAsPrincipal(payload.sessionId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Settlement kas ditolak oleh Kepala Sekolah',
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-cash-session-approvals', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-cash-sessions', user?.id] });
      notifySuccess(payload.approved ? 'Settlement kas disetujui.' : 'Settlement kas ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval settlement kas.');
    },
  });

  const principalClosingPeriodMutation = useMutation({
    mutationFn: (payload: { periodId: number; approved: boolean }) =>
      staffFinanceApi.decideClosingPeriodAsPrincipal(payload.periodId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Closing period ditolak oleh Kepala Sekolah',
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-closing-periods', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-closing-period-approvals', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-finance-integrity', user?.id] });
      notifySuccess(payload.approved ? 'Closing period disetujui.' : 'Closing period ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval closing period.');
    },
  });

  const principalClosingPeriodReopenMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceApi.decideClosingPeriodReopenAsPrincipal(payload.requestId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Reopen closing period ditolak oleh Kepala Sekolah',
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-closing-periods', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-closing-period-approvals', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-closing-period-reopen-requests', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-closing-period-reopen-approvals', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-principal-finance-integrity', user?.id] });
      notifySuccess(payload.approved ? 'Reopen closing period disetujui.' : 'Reopen closing period ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval reopen closing period.');
    },
  });

  const approvals = useMemo(() => approvalsQuery.data?.approvals || [], [approvalsQuery.data?.approvals]);
  const financeCashSessions = useMemo(() => cashSessionsQuery.data?.sessions || [], [cashSessionsQuery.data]);
  const pendingCashSessionApprovals = useMemo(() => cashSessionApprovalsQuery.data?.sessions || [], [cashSessionApprovalsQuery.data]);
  const financeCashSummary = cashSessionsQuery.data?.summary;
  const financeBankReconciliations = useMemo(
    () => bankReconciliationsQuery.data?.reconciliations || [],
    [bankReconciliationsQuery.data],
  );
  const financeBankReconciliationSummary = bankReconciliationsQuery.data?.summary;
  const financeBudgetRealization = budgetRealizationQuery.data || null;
  const financeGovernance = governanceQuery.data || null;
  const financeAudit = auditQuery.data || null;
  const financePerformance = performanceQuery.data || null;
  const financeIntegrity = integrityQuery.data || null;
  const financeClosingPeriods = useMemo(
    () => closingPeriodsQuery.data?.periods || [],
    [closingPeriodsQuery.data],
  );
  const financeClosingPeriodSummary = closingPeriodsQuery.data?.summary;
  const pendingClosingPeriodApprovals = useMemo(
    () => closingPeriodApprovalsQuery.data?.periods || [],
    [closingPeriodApprovalsQuery.data],
  );
  const financeClosingPeriodReopenRequests = useMemo(
    () => closingPeriodReopenRequestsQuery.data?.requests || [],
    [closingPeriodReopenRequestsQuery.data],
  );
  const financeClosingPeriodReopenSummary = closingPeriodReopenRequestsQuery.data?.summary;
  const pendingClosingPeriodReopenApprovals = useMemo(
    () => closingPeriodReopenApprovalsQuery.data?.requests || [],
    [closingPeriodReopenApprovalsQuery.data],
  );
  const filteredApprovals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return approvals.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!query) return true;
      const haystacks = [item.title || '', item.description || '', item.requester?.name || '', item.additionalDuty || ''];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [approvals, search, statusFilter]);

  const totalAmount = filteredApprovals.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const pendingCount = approvals.filter((item) => item.status === 'PENDING').length;
  const pendingWriteOffs = useMemo(
    () => writeOffsQuery.data?.requests || [],
    [writeOffsQuery.data],
  );
  const pendingPaymentReversals = useMemo(
    () => paymentReversalsQuery.data?.requests || [],
    [paymentReversalsQuery.data],
  );
  const pendingWriteOffAmount = useMemo(
    () => pendingWriteOffs.reduce((sum, item) => sum + Number(item.approvedAmount || item.requestedAmount || 0), 0),
    [pendingWriteOffs],
  );
  const pendingPaymentReversalAmount = useMemo(
    () => pendingPaymentReversals.reduce((sum, item) => sum + Number(item.approvedAmount || item.requestedAmount || 0), 0),
    [pendingPaymentReversals],
  );

  if (isLoading) return <AppLoadingScreen message="Memuat persetujuan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Persetujuan Anggaran</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const handleDecision = (item: PrincipalBudgetRequest, status: 'APPROVED' | 'REJECTED') => {
    const label = status === 'APPROVED' ? 'menyetujui' : 'menolak';
    Alert.alert('Konfirmasi', `Yakin ingin ${label} pengajuan "${item.title}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Proses',
        style: status === 'REJECTED' ? 'destructive' : 'default',
        onPress: () => decisionMutation.mutate({ id: item.id, status }),
      },
    ]);
  };

  const handleWriteOffDecision = (item: StaffFinanceWriteOffRequest, approved: boolean) => {
    const label = approved ? 'menyetujui' : 'menolak';
    Alert.alert(
      approved ? 'Setujui Write-Off' : 'Tolak Write-Off',
      `Yakin ingin ${label} pengajuan "${item.requestNo}" untuk ${item.student?.name || 'siswa ini'}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: approved ? 'Ya, Setujui' : 'Ya, Tolak',
          style: approved ? 'default' : 'destructive',
          onPress: () => principalWriteOffMutation.mutate({ requestId: item.id, approved }),
        },
      ],
    );
  };

  const handlePaymentReversalDecision = (item: StaffFinancePaymentReversalRequest, approved: boolean) => {
    const label = approved ? 'menyetujui' : 'menolak';
    Alert.alert(
      approved ? 'Setujui Reversal Pembayaran' : 'Tolak Reversal Pembayaran',
      `Yakin ingin ${label} pengajuan "${item.requestNo}" untuk ${item.student?.name || 'siswa ini'}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: approved ? 'Ya, Setujui' : 'Ya, Tolak',
          style: approved ? 'default' : 'destructive',
          onPress: () => principalPaymentReversalMutation.mutate({ requestId: item.id, approved }),
        },
      ],
    );
  };

  const handleCashSessionDecision = (session: StaffFinanceCashSession, approved: boolean) => {
    const label = approved ? 'menyetujui' : 'menolak';
    Alert.alert(
      approved ? 'Setujui Settlement Kas' : 'Tolak Settlement Kas',
      `Yakin ingin ${label} settlement "${session.sessionNo}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: approved ? 'Ya, Setujui' : 'Ya, Tolak',
          style: approved ? 'default' : 'destructive',
          onPress: () => principalCashSessionMutation.mutate({ sessionId: session.id, approved }),
        },
      ],
    );
  };

  const handleClosingPeriodDecision = (period: StaffFinanceClosingPeriod, approved: boolean) => {
    const label = approved ? 'menyetujui' : 'menolak';
    Alert.alert(
      approved ? 'Setujui Closing Period' : 'Tolak Closing Period',
      `Yakin ingin ${label} closing period "${period.label}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: approved ? 'Ya, Setujui' : 'Ya, Tolak',
          style: approved ? 'default' : 'destructive',
          onPress: () => principalClosingPeriodMutation.mutate({ periodId: period.id, approved }),
        },
      ],
    );
  };

  const handleClosingPeriodReopenDecision = (request: StaffFinanceClosingPeriodReopenRequest, approved: boolean) => {
    const label = approved ? 'menyetujui' : 'menolak';
    Alert.alert(
      approved ? 'Setujui Reopen Closing Period' : 'Tolak Reopen Closing Period',
      `Yakin ingin ${label} request "${request.requestNo}" untuk ${request.closingPeriod.label}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: approved ? 'Ya, Setujui' : 'Ya, Tolak',
          style: approved ? 'default' : 'destructive',
          onPress: () => principalClosingPeriodReopenMutation.mutate({ requestId: request.id, approved }),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            (approvalsQuery.isFetching && !approvalsQuery.isLoading) ||
            (writeOffsQuery.isFetching && !writeOffsQuery.isLoading) ||
            (paymentReversalsQuery.isFetching && !paymentReversalsQuery.isLoading) ||
            (cashSessionsQuery.isFetching && !cashSessionsQuery.isLoading) ||
            (cashSessionApprovalsQuery.isFetching && !cashSessionApprovalsQuery.isLoading) ||
            (bankReconciliationsQuery.isFetching && !bankReconciliationsQuery.isLoading) ||
            (integrityQuery.isFetching && !integrityQuery.isLoading) ||
            (performanceQuery.isFetching && !performanceQuery.isLoading) ||
            (auditQuery.isFetching && !auditQuery.isLoading) ||
            (budgetRealizationQuery.isFetching && !budgetRealizationQuery.isLoading) ||
            (closingPeriodsQuery.isFetching && !closingPeriodsQuery.isLoading) ||
            (closingPeriodApprovalsQuery.isFetching && !closingPeriodApprovalsQuery.isLoading) ||
            (closingPeriodReopenRequestsQuery.isFetching && !closingPeriodReopenRequestsQuery.isLoading) ||
            (closingPeriodReopenApprovalsQuery.isFetching && !closingPeriodReopenApprovalsQuery.isLoading)
          }
          onRefresh={() => {
            void approvalsQuery.refetch();
            void writeOffsQuery.refetch();
            void paymentReversalsQuery.refetch();
            void cashSessionsQuery.refetch();
            void cashSessionApprovalsQuery.refetch();
            void bankReconciliationsQuery.refetch();
            void governanceQuery.refetch();
            void integrityQuery.refetch();
            void performanceQuery.refetch();
            void auditQuery.refetch();
            void budgetRealizationQuery.refetch();
            void closingPeriodsQuery.refetch();
            void closingPeriodApprovalsQuery.refetch();
            void closingPeriodReopenRequestsQuery.refetch();
            void closingPeriodReopenApprovalsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Persetujuan Anggaran</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Verifikasi pengajuan anggaran dari unit kerja sekolah.
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View
          style={{
            backgroundColor: '#f8fbff',
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 999,
            paddingHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari pengajuan, unit, atau pengaju"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          {(Object.keys(STATUS_LABEL) as FilterStatus[]).map((status) => (
            <View key={status} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setStatusFilter(status)}
                style={{
                  borderWidth: 1,
                  borderColor: statusFilter === status ? BRAND_COLORS.blue : '#d6e2f7',
                  backgroundColor: statusFilter === status ? '#e9f1ff' : '#fff',
                  borderRadius: 9,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: statusFilter === status ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                  {STATUS_LABEL[status]}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
          Menunggu proses: <Text style={{ color: '#b45309', fontWeight: '700' }}>{pendingCount}</Text> • Total nominal:{' '}
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rp {totalAmount.toLocaleString('id-ID')}</Text>
        </Text>
      </View>

      {approvalsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data persetujuan..." /> : null}
      {approvalsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data persetujuan." onRetry={() => approvalsQuery.refetch()} />
      ) : null}
      {approvalsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={approvalsQuery.data.cachedAt} /> : null}

      {!approvalsQuery.isLoading && !approvalsQuery.isError ? (
        filteredApprovals.length > 0 ? (
          <View>
            {filteredApprovals.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15), flex: 1, paddingRight: 8 }}>
                    {item.title || 'Tanpa judul'}
                  </Text>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      backgroundColor: '#f8fbff',
                    }}
                  >
                    <Text style={{ color: statusColor(item.status), fontWeight: '700', fontSize: scaleWithAppTextScale(11) }}>{STATUS_LABEL[item.status]}</Text>
                  </View>
                </View>

                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6 }}>{item.description || '-'}</Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Pengaju: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.requester?.name || '-'}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Unit: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.additionalDuty?.replace(/_/g, ' ') || '-'}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 8 }}>
                  Total: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rp {Number(item.totalAmount || 0).toLocaleString('id-ID')}</Text>
                </Text>

                {item.status === 'REJECTED' && item.rejectionReason ? (
                  <View
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fef2f2',
                      padding: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#991b1b', fontSize: scaleWithAppTextScale(12) }}>{item.rejectionReason}</Text>
                  </View>
                ) : null}

                {item.status === 'PENDING' ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      disabled={decisionMutation.isPending}
                      onPress={() => handleDecision(item, 'REJECTED')}
                      style={{
                        flex: 1,
                        backgroundColor: '#fff1f2',
                        borderWidth: 1,
                        borderColor: '#fecdd3',
                        borderRadius: 9,
                        alignItems: 'center',
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak</Text>
                    </Pressable>
                    <Pressable
                      disabled={decisionMutation.isPending}
                      onPress={() => handleDecision(item, 'APPROVED')}
                      style={{
                        flex: 1,
                        backgroundColor: decisionMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                        borderRadius: 9,
                        alignItems: 'center',
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {decisionMutation.isPending ? 'Memproses...' : 'Setujui'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tidak ada data</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada pengajuan anggaran sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Governance Summary</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Ringkasan kontrol finance untuk membantu keputusan Kepala Sekolah.
            </Text>
          </View>
          {financeGovernance ? (
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: getGovernanceRiskStyle(financeGovernance.overview.riskLevel).border,
                backgroundColor: getGovernanceRiskStyle(financeGovernance.overview.riskLevel).bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: getGovernanceRiskStyle(financeGovernance.overview.riskLevel).text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
                {getGovernanceRiskStyle(financeGovernance.overview.riskLevel).label}
              </Text>
            </View>
          ) : null}
        </View>

        {governanceQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil governance finance..." />
        ) : !financeGovernance ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan governance finance belum tersedia.</Text>
          </View>
        ) : (
          <>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: '#f8fafc',
                borderRadius: 10,
                padding: 10,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{financeGovernance.overview.headline}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>{financeGovernance.overview.detail}</Text>
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                {financeGovernance.overview.attentionItems} item perhatian • {formatCurrency(financeGovernance.overview.attentionAmount)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Kolektibilitas</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeGovernance.collection.criticalCount}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    High {financeGovernance.collection.highPriorityCount}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Treasury</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeGovernance.treasury.openCashSessions + financeGovernance.treasury.openBankReconciliations}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Kas/bank terbuka</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Approval</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeGovernance.approvals.totalPendingCount}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Menunggu review</Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Budget/Close</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeGovernance.budgetControl.followUpCount + financeGovernance.closingControl.reviewCount}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Butuh tindak lanjut</Text>
                </View>
              </View>
            </View>

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Antrian Prioritas</Text>
            {!financeGovernance.followUpQueue.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada antrian governance yang memerlukan tindakan.</Text>
            ) : (
              financeGovernance.followUpQueue.map((item) => {
                const badge = getGovernanceSeverityStyle(item.severity);
                return (
                  <View key={item.key} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{item.severity}</Text>
                          </View>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11) }}>{item.category}</Text>
                        </View>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{item.detail}</Text>
                        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                          {item.referenceLabel ? `${item.referenceLabel} • ` : ''}
                          {item.updatedAt ? formatDate(item.updatedAt) : 'Perlu ditinjau'}
                        </Text>
                      </View>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Integrity &amp; Readiness</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Checklist final untuk memastikan finance tidak menyisakan blocker operasional sebelum dianggap siap penuh.
            </Text>
          </View>
          {financeIntegrity ? (
            (() => {
              const badge = getIntegrityStatusStyle(financeIntegrity.overview.status);
              return (
                <View style={{ borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{financeIntegrity.overview.status}</Text>
                </View>
              );
            })()
          ) : null}
        </View>

        {integrityQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil integrity finance..." />
        ) : !financeIntegrity ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan integrity finance belum tersedia.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Score</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeIntegrity.overview.readinessScore}%
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Kesiapan aktual</Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Checklist</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeIntegrity.overview.passedChecks}/{financeIntegrity.overview.totalChecks}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Lolos</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Issue</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeIntegrity.overview.totalIssues}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Aktif</Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Exposure</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {formatCurrency(financeIntegrity.overview.pendingAmount)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>Perhatian</Text>
                </View>
              </View>
            </View>

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Checklist Penutup</Text>
            {financeIntegrity.checklist.map((item) => {
              const badge = item.passed
                ? { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'PASS' }
                : { ...getIntegritySeverityStyle(item.severity), label: item.severity };
              return (
                <View key={item.key} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{item.detail}</Text>
                    </View>
                    <View style={{ borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{badge.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 8, marginBottom: 6 }}>Issue Queue</Text>
            {financeIntegrity.issues.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada issue aktif. Finance terlihat bersih.</Text>
            ) : (
              financeIntegrity.issues.map((issue) => {
                const badge = getIntegritySeverityStyle(issue.severity);
                return (
                  <View key={issue.key} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{issue.severity}</Text>
                          </View>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11) }}>{issue.area}</Text>
                        </View>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 6 }}>{issue.title}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{issue.detail}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatCurrency(issue.amount)}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>{issue.count} item</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Performance Trend 6 Bulan</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
            Tren koleksi, treasury flow, pending verifikasi, dan disiplin closing untuk keputusan Kepala Sekolah.
          </Text>
        </View>

        {performanceQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil trend performa finance..." />
        ) : !financePerformance ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan performa finance belum tersedia.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Avg Collection</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financePerformance.overview.averageCollectionRate.toFixed(1)}%
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    {formatCurrency(financePerformance.overview.averageCollectedAgainstIssuedAmount)} / bulan
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Net Flow</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {formatCurrency(financePerformance.overview.latestNetFlowAmount)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    {financePerformance.overview.latestMonthLabel || 'Bulan terbaru'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Outstanding</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {formatCurrency(financePerformance.overview.latestOutstandingAmount)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    Rate {financePerformance.overview.latestCollectionRate.toFixed(1)}%
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Pending</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {formatCurrency(financePerformance.overview.latestPendingVerificationAmount)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    {financePerformance.highlights.highestPendingVerificationMonth
                      ? `Puncak ${financePerformance.highlights.highestPendingVerificationMonth.label}`
                      : 'Tidak ada backlog'}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Signal Prioritas</Text>
            {financePerformance.signals.map((signal) => {
              const badge = getPerformanceSignalStyle(signal.tone);
              return (
                <View key={signal.key} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{signal.title}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{signal.detail}</Text>
                    </View>
                    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{signal.tone}</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6, marginTop: 8 }}>Trend Bulanan</Text>
            {financePerformance.monthlyTrend.map((row) => (
              <View key={row.periodKey} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {row.issuedInvoiceCount} invoice • rate {row.collectionRate.toFixed(1)}%
                </Text>
                <Text style={{ color: '#166534', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Collected {formatCurrency(row.collectedAgainstIssuedAmount)} • Net Flow {formatCurrency(row.netFlowAmount)}
                </Text>
                <Text style={{ color: '#92400e', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Outstanding {formatCurrency(row.outstandingAmount)} • overdue {formatCurrency(row.overdueOutstandingAmount)}
                </Text>
                <Text style={{ color: '#991b1b', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Pending {formatCurrency(row.pendingVerificationAmount)} • {row.pendingPaymentCount} payment
                </Text>
              </View>
            ))}
          </>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Audit Finance 30 Hari</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
            Ringkasan perubahan policy, approval sensitif, dan kontrol treasury terbaru untuk keputusan Kepala Sekolah.
          </Text>
        </View>

        {auditQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil audit finance..." />
        ) : !financeAudit ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan audit finance belum tersedia.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Event Kritis</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeAudit.overview.criticalCount}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    High {financeAudit.overview.highCount}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Policy</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeAudit.overview.policyChangeCount}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    {financeAudit.categorySummary.policyCount} log
                  </Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Approval</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeAudit.overview.approvalActionCount}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    {financeAudit.categorySummary.approvalCount} log
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>Aktor Aktif</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 3 }}>
                    {financeAudit.overview.uniqueActors}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                    {financeAudit.overview.totalEvents} event
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Aktor Paling Aktif</Text>
            {!financeAudit.actorSummary.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>Belum ada aktivitas audit finance pada periode ini.</Text>
            ) : (
              <View style={{ marginBottom: 8 }}>
                {financeAudit.actorSummary.map((actor) => (
                  <View key={actor.actorId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{actor.actorName}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                      {actor.totalEvents} event • kritis {actor.criticalCount} • approval {actor.approvalCount}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Event Terbaru</Text>
            {!financeAudit.recentEvents.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada event audit finance yang tercatat.</Text>
            ) : (
              financeAudit.recentEvents.map((event) => {
                const badge = getGovernanceSeverityStyle(event.severity);
                return (
                  <View key={event.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{event.severity}</Text>
                          </View>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11) }}>{event.category}</Text>
                        </View>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{event.label}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{event.summary}</Text>
                        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                          {event.actor.label} • {formatDate(event.createdAt)}
                          {event.entityId ? ` • Ref #${event.entityId}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{event.action}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Settlement Kas Harian</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Monitoring sesi kas bendahara untuk expected closing dan selisih settlement harian.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{financeCashSummary?.openCount || 0} terbuka</Text>
          </View>
        </View>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 8 }}>
          Pending Kepala TU {financeCashSummary?.pendingHeadTuCount || 0} • pending Kepsek {financeCashSummary?.pendingPrincipalCount || 0}
        </Text>

        {cashSessionsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil settlement kas..." />
        ) : financeCashSessions.length > 0 ? (
          <View>
            {financeCashSessions.slice(0, 4).map((session: StaffFinanceCashSession) => (
              <View
                key={session.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: '#eef3ff',
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{session.sessionNo}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {new Date(session.businessDate).toLocaleDateString('id-ID')} • {session.openedBy?.name || '-'} • {session.status === 'OPEN' ? 'Masih dibuka' : 'Sudah ditutup'}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Expected {formatCurrency(session.expectedClosingBalance)} • aktual {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
                </Text>
                {session.varianceAmount != null ? (
                  <Text style={{ color: Number(session.varianceAmount) === 0 ? '#166534' : '#b91c1c', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                    Selisih {formatCurrency(session.varianceAmount)}
                  </Text>
                ) : null}
                <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {session.approvalStatus === 'PENDING_PRINCIPAL'
                    ? 'Menunggu Kepala Sekolah'
                    : session.approvalStatus === 'PENDING_HEAD_TU'
                      ? 'Menunggu Kepala TU'
                      : session.approvalStatus === 'REJECTED'
                        ? 'Ditolak'
                        : session.approvalStatus === 'AUTO_APPROVED'
                          ? 'Auto approved'
                          : 'Disetujui'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada sesi kas harian yang tercatat.</Text>
          </View>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Budget vs Realization</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Monitoring anggaran approved, progres LPJ, actual spent, dan variance untuk melihat kesehatan realisasi finance.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
              {formatCurrency(financeBudgetRealization?.overview.approvedBudgetAmount || 0)}
            </Text>
          </View>
        </View>

        {budgetRealizationQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil budget vs realization..." />
        ) : !financeBudgetRealization ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan budget vs realization belum tersedia.</Text>
          </View>
        ) : (
          <>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 6 }}>
              Actual {formatCurrency(financeBudgetRealization.overview.actualRealizedAmount)} • variance {formatCurrency(financeBudgetRealization.overview.varianceAmount)} • review LPJ{' '}
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                {financeBudgetRealization.overview.stageSummary.financeReviewCount +
                  financeBudgetRealization.overview.stageSummary.returnedByFinanceCount}
              </Text>
            </Text>

            {financeBudgetRealization.dutyRecap.slice(0, 4).map((row) => (
              <View key={row.additionalDuty} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.additionalDutyLabel}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {row.totalRequests} request • {row.realizationRate.toFixed(1)}%
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Approved {formatCurrency(row.approvedBudgetAmount)} • Actual {formatCurrency(row.actualRealizedAmount)}
                </Text>
                <Text style={{ color: '#6b21a8', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Variance {formatCurrency(row.varianceAmount)}
                </Text>
              </View>
            ))}

            {financeBudgetRealization.followUpQueue.length ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Antrian Tindak Lanjut</Text>
                {financeBudgetRealization.followUpQueue.slice(0, 4).map((row) => {
                  const stage = getBudgetProgressStyle(row.stage);
                  return (
                    <View key={`principal-budget-${row.budgetId}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.title}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                            {row.requesterName} • {row.additionalDutyLabel}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: stage.border,
                            backgroundColor: stage.bg,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={{ color: stage.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{stage.label}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        Approved {formatCurrency(row.approvedBudgetAmount)} • Actual {formatCurrency(row.actualRealizedAmount)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        {row.pendingSince ? `Sejak ${formatDate(row.pendingSince)}` : 'Belum ada tanggal stage'} • {row.daysInStage} hari
                        {row.latestLpjStatus ? ` • LPJ ${row.latestLpjStatus}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Closing Period Finance</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Monitoring lock periode finance untuk memastikan snapshot kas, bank, dan outstanding siap ditutup final.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{financeClosingPeriodSummary?.totalPeriods || 0} period</Text>
          </View>
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 6 }}>
          Review {financeClosingPeriodSummary?.reviewCount || 0} • locked {financeClosingPeriodSummary?.closedCount || 0} • pending verifikasi{' '}
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
            {formatCurrency(financeClosingPeriodSummary?.totalPendingVerificationAmount || 0)}
          </Text>
        </Text>

        {closingPeriodsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil closing period finance..." />
        ) : financeClosingPeriods.length === 0 ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada closing period finance yang tercatat.</Text>
          </View>
        ) : (
          financeClosingPeriods.map((period) => {
            const status = getClosingPeriodStatusStyle(period);
            const approval = getClosingPeriodApprovalStyle(period);
            return (
              <View key={period.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{period.label}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                      {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                      Outstanding {formatCurrency(period.summary.outstandingAmount)} • pending {formatCurrency(period.summary.pendingVerificationAmount)}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                      Unmatched {formatCurrency(period.summary.unmatchedBankAmount)} • kas/bank {formatCurrency(period.summary.cashClosingBalance)} / {formatCurrency(period.summary.bankClosingBalance)}
                    </Text>
                    {period.headTuDecisionNote ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        Review Kepala TU: {period.headTuDecisionNote}
                      </Text>
                    ) : null}
                    {period.principalDecisionNote ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        Keputusan Kepsek: {period.principalDecisionNote}
                      </Text>
                    ) : null}
                    {period.closedAt ? (
                      <Text style={{ color: '#166534', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        Locked {formatDate(period.closedAt)}
                        {period.closedBy?.name ? ` oleh ${period.closedBy.name}` : ''}
                      </Text>
                    ) : null}
                    {period.reopenedAt ? (
                      <Text style={{ color: '#0f766e', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        Direopen {formatDate(period.reopenedAt)}
                        {period.reopenedBy?.name ? ` oleh ${period.reopenedBy.name}` : ''}
                        {period.reopenNote ? ` • ${period.reopenNote}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {[status, approval].map((badge) => (
                      <View
                        key={`${period.id}-${badge.label}`}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{badge.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Reopen Closing Period</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Review pembukaan kembali period lock finance yang sudah lolos review Kepala TU.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
              {pendingClosingPeriodReopenApprovals.length} menunggu
            </Text>
          </View>
        </View>

        {closingPeriodReopenApprovalsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil approval reopen closing period..." />
        ) : pendingClosingPeriodReopenApprovals.length === 0 ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Belum ada request reopen closing period yang menunggu persetujuan Kepala Sekolah.
            </Text>
          </View>
        ) : (
          pendingClosingPeriodReopenApprovals.map((request) => {
            const badge = getClosingPeriodReopenStyle(request);
            return (
              <View key={request.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{request.closingPeriod.label}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                      {request.requestNo} • {request.closingPeriod.periodNo}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{request.reason}</Text>
                    {request.requestedNote ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{request.requestedNote}</Text>
                    ) : null}
                    {request.headTuDecision.note ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                        Review Kepala TU: {request.headTuDecision.note}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: badge.border,
                      backgroundColor: badge.bg,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ color: badge.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{badge.label}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable
                    disabled={principalClosingPeriodReopenMutation.isPending}
                    onPress={() => handleClosingPeriodReopenDecision(request, false)}
                    style={{
                      flex: 1,
                      backgroundColor: '#fff1f2',
                      borderWidth: 1,
                      borderColor: '#fecdd3',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak</Text>
                  </Pressable>
                  <Pressable
                    disabled={principalClosingPeriodReopenMutation.isPending}
                    onPress={() => handleClosingPeriodReopenDecision(request, true)}
                    style={{
                      flex: 1,
                      backgroundColor: '#ecfdf5',
                      borderWidth: 1,
                      borderColor: '#a7f3d0',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#047857', fontWeight: '700' }}>Setujui</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {financeClosingPeriodReopenRequests.length > 0 ? (
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 8 }}>
            Total reopen tercatat {financeClosingPeriodReopenSummary?.totalRequests || 0} request,{' '}
            {financeClosingPeriodReopenSummary?.appliedCount || 0} sudah direopen.
          </Text>
        ) : null}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Closing Period</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Review closing period yang sudah lolos review Kepala TU atau masuk ambang eskalasi Kepala Sekolah.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{pendingClosingPeriodApprovals.length} menunggu</Text>
          </View>
        </View>

        {closingPeriodApprovalsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil approval closing period..." />
        ) : pendingClosingPeriodApprovals.length === 0 ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada closing period yang menunggu persetujuan Kepala Sekolah.</Text>
          </View>
        ) : (
          pendingClosingPeriodApprovals.map((period) => (
            <View key={period.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{period.label}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
              </Text>
              <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                Outstanding {formatCurrency(period.summary.outstandingAmount)} • pending {formatCurrency(period.summary.pendingVerificationAmount)}
              </Text>
              <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                Unmatched {formatCurrency(period.summary.unmatchedBankAmount)} • kas/rekon terbuka {period.summary.openCashSessionCount}/{period.summary.openReconciliationCount}
              </Text>
              {period.headTuDecisionNote ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Review Kepala TU: {period.headTuDecisionNote}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  disabled={principalClosingPeriodMutation.isPending}
                  onPress={() => handleClosingPeriodDecision(period, false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#fff1f2',
                    borderWidth: 1,
                    borderColor: '#fecdd3',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak</Text>
                </Pressable>
                <Pressable
                  disabled={principalClosingPeriodMutation.isPending}
                  onPress={() => handleClosingPeriodDecision(period, true)}
                  style={{
                    flex: 1,
                    backgroundColor: '#ecfdf5',
                    borderWidth: 1,
                    borderColor: '#a7f3d0',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#047857', fontWeight: '700' }}>Setujui</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rekonsiliasi Bank</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Monitoring transaksi bank non-tunai untuk melihat variance, statement gap, dan item yang belum matched.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#c7d2fe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eef2ff',
            }}
          >
            <Text style={{ color: '#4338ca', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
              {financeBankReconciliationSummary?.openCount || 0} terbuka
            </Text>
          </View>
        </View>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 8 }}>
          Final {financeBankReconciliationSummary?.finalizedCount || 0} • unmatched statement {financeBankReconciliationSummary?.totalUnmatchedStatementEntries || 0}
        </Text>

        {bankReconciliationsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil rekonsiliasi bank..." />
        ) : financeBankReconciliations.length > 0 ? (
          <View>
            {financeBankReconciliations.slice(0, 4).map((reconciliation: StaffFinanceBankReconciliation) => (
              <View
                key={reconciliation.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: '#eef3ff',
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{reconciliation.reconciliationNo}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {reconciliation.bankAccount.bankName} • {reconciliation.bankAccount.accountNumber}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {formatDate(reconciliation.periodStart)} - {formatDate(reconciliation.periodEnd)}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Expected {formatCurrency(reconciliation.summary.expectedClosingBalance)} • statement {formatCurrency(reconciliation.summary.statementComputedClosingBalance)}
                </Text>
                <Text style={{ color: Number(reconciliation.summary.varianceAmount || 0) === 0 ? '#166534' : '#b91c1c', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Variance {formatCurrency(reconciliation.summary.varianceAmount)}
                </Text>
                <Text style={{ color: '#4338ca', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {reconciliation.status === 'FINALIZED' ? 'Final' : 'Terbuka'} • unmatched statement {reconciliation.summary.unmatchedStatementEntryCount} • payment {reconciliation.summary.unmatchedPaymentCount} • refund {reconciliation.summary.unmatchedRefundCount}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada rekonsiliasi bank yang tercatat.</Text>
          </View>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Settlement Kas</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Review settlement kas yang sudah lolos review Kepala TU dan masuk ambang eskalasi Kepala Sekolah.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{pendingCashSessionApprovals.length} menunggu</Text>
          </View>
        </View>

        {cashSessionApprovalsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil approval settlement kas..." />
        ) : pendingCashSessionApprovals.length === 0 ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada settlement kas yang menunggu persetujuan Kepala Sekolah.</Text>
          </View>
        ) : (
          pendingCashSessionApprovals.map((session) => (
            <View key={session.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{session.sessionNo}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                {new Date(session.businessDate).toLocaleDateString('id-ID')} • {session.openedBy?.name || '-'}
              </Text>
              <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                Expected {formatCurrency(session.expectedClosingBalance)} • aktual {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
              </Text>
              <Text style={{ color: Number(session.varianceAmount || 0) === 0 ? '#166534' : '#b91c1c', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                Selisih {formatCurrency(session.varianceAmount || 0)}
              </Text>
              {session.headTuDecision.note ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Review Kepala TU: {session.headTuDecision.note}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  disabled={principalCashSessionMutation.isPending}
                  onPress={() => handleCashSessionDecision(session, false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#fff1f2',
                    borderWidth: 1,
                    borderColor: '#fecdd3',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak</Text>
                </Pressable>
                <Pressable
                  disabled={principalCashSessionMutation.isPending}
                  onPress={() => handleCashSessionDecision(session, true)}
                  style={{
                    flex: 1,
                    backgroundColor: '#ecfdf5',
                    borderWidth: 1,
                    borderColor: '#a7f3d0',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#047857', fontWeight: '700' }}>Setujui</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Write-Off Piutang</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Review pengajuan penghapusan piutang yang sudah lolos review Kepala TU.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{pendingWriteOffs.length} menunggu</Text>
          </View>
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 6 }}>
          Total nominal rekomendasi:{' '}
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatCurrency(pendingWriteOffAmount)}</Text>
        </Text>

        {writeOffsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil approval write-off..." />
        ) : writeOffsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat approval write-off." onRetry={() => writeOffsQuery.refetch()} />
        ) : pendingWriteOffs.length > 0 ? (
          <View>
            {pendingWriteOffs.map((item) => (
              <View
                key={item.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: '#eef3ff',
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.requestNo}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {item.student?.name || '-'} • {item.student?.studentClass?.name || '-'}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Invoice {item.invoice?.invoiceNo || '-'} • outstanding{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {formatCurrency(item.invoice?.balanceAmount || 0)}
                  </Text>
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Diminta {formatCurrency(item.requestedAmount)} • rekomendasi{' '}
                  <Text style={{ color: '#047857', fontWeight: '700' }}>
                    {formatCurrency(Number(item.approvedAmount || item.requestedAmount || 0))}
                  </Text>
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{item.reason}</Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable
                    disabled={principalWriteOffMutation.isPending}
                    onPress={() => handleWriteOffDecision(item, false)}
                    style={{
                      flex: 1,
                      backgroundColor: '#fff1f2',
                      borderWidth: 1,
                      borderColor: '#fecdd3',
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak</Text>
                  </Pressable>
                  <Pressable
                    disabled={principalWriteOffMutation.isPending}
                    onPress={() => handleWriteOffDecision(item, true)}
                    style={{
                      flex: 1,
                      backgroundColor: '#ecfdf5',
                      borderWidth: 1,
                      borderColor: '#a7f3d0',
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#047857', fontWeight: '700' }}>Setujui</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tidak ada data</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Belum ada pengajuan write-off yang menunggu persetujuan Kepala Sekolah.
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Reversal Pembayaran</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              Review pengajuan reversal pembayaran yang sudah lolos review Kepala TU.
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>{pendingPaymentReversals.length} menunggu</Text>
          </View>
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 6 }}>
          Total nominal rekomendasi:{' '}
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatCurrency(pendingPaymentReversalAmount)}</Text>
        </Text>

        {paymentReversalsQuery.isLoading ? (
          <QueryStateView type="loading" message="Mengambil approval reversal pembayaran..." />
        ) : paymentReversalsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat approval reversal pembayaran." onRetry={() => paymentReversalsQuery.refetch()} />
        ) : pendingPaymentReversals.length > 0 ? (
          <View>
            {pendingPaymentReversals.map((item) => (
              <View
                key={item.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: '#eef3ff',
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.requestNo}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  {item.student?.name || '-'} • {item.student?.studentClass?.name || '-'}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Pembayaran {item.payment?.paymentNo || '-'} • invoice {item.invoice?.invoiceNo || '-'}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Diminta {formatCurrency(item.requestedAmount)} • alokasi {formatCurrency(Number(item.approvedAllocatedAmount || item.requestedAllocatedAmount || 0))}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                  Kredit {formatCurrency(Number(item.approvedCreditedAmount || item.requestedCreditedAmount || 0))}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{item.reason}</Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable
                    disabled={principalPaymentReversalMutation.isPending}
                    onPress={() => handlePaymentReversalDecision(item, false)}
                    style={{
                      flex: 1,
                      backgroundColor: '#fff1f2',
                      borderWidth: 1,
                      borderColor: '#fecdd3',
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak</Text>
                  </Pressable>
                  <Pressable
                    disabled={principalPaymentReversalMutation.isPending}
                    onPress={() => handlePaymentReversalDecision(item, true)}
                    style={{
                      flex: 1,
                      backgroundColor: '#ecfdf5',
                      borderWidth: 1,
                      borderColor: '#a7f3d0',
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#047857', fontWeight: '700' }}>Setujui</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tidak ada data</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Belum ada pengajuan reversal pembayaran yang menunggu persetujuan Kepala Sekolah.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 10,
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
