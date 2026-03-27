import { useMemo } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { permissionApi } from '../../../src/features/permissions/permissionApi';
import type { StudentPermission } from '../../../src/features/permissions/types';
import {
  staffAdministrationApi,
  type StaffAdministrationSummary,
} from '../../../src/features/staff/staffAdministrationApi';
import {
  staffFinanceApi,
  type StaffFinanceBankReconciliation,
  type FinanceBudgetProgressStage,
  type StaffFinanceCashSession,
  type StaffFinanceClosingPeriod,
  type StaffFinanceClosingPeriodReopenRequest,
  type StaffFinanceGovernanceSummary,
  type StaffFinancePerformanceSummary,
  type StaffFinancePaymentReversalRequest,
  type StaffFinanceWriteOffRequest,
  type StaffFinanceReportSnapshot,
} from '../../../src/features/staff/staffFinanceApi';
import { staffApi } from '../../../src/features/staff/staffApi';
import { resolveStaffDivision } from '../../../src/features/staff/staffRole';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import type {
  StaffBudgetRequest,
  StaffPersonnel,
  StaffStudent,
} from '../../../src/features/staff/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 3 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

type StaffAdminOverviewData =
  | {
      kind: 'FINANCE';
      budgets: StaffBudgetRequest[];
      students: StaffStudent[];
      dashboard: StaffFinanceReportSnapshot;
    }
  | {
      kind: 'ADMINISTRATION';
      summary: StaffAdministrationSummary;
    }
  | {
      kind: 'HEAD_TU';
      students: StaffStudent[];
      teachers: StaffPersonnel[];
      staffs: StaffPersonnel[];
      permissions: StudentPermission[];
      budgets: StaffBudgetRequest[];
    };

function openWebModule(router: ReturnType<typeof useRouter>, moduleKey: string) {
  router.push(`/web-module/${moduleKey}` as never);
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

function formatCurrency(value: number) {
  return `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
}

function getCollectionPriorityStyle(priority: 'MONITOR' | 'TINGGI' | 'KRITIS') {
  if (priority === 'KRITIS') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  if (priority === 'TINGGI') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985' };
}

function getDueSoonLabel(daysUntilDue: number) {
  if (daysUntilDue <= 0) return 'Hari ini';
  if (daysUntilDue === 1) return '1 hari lagi';
  return `${daysUntilDue} hari lagi`;
}

function getClosingPeriodStatusStyle(period: StaffFinanceClosingPeriod) {
  if (period.status === 'CLOSED') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Terkunci' };
  if (period.status === 'CLOSING_REVIEW') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Review Closing' };
  return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Terbuka' };
}

function getClosingPeriodApprovalStyle(period: StaffFinanceClosingPeriod) {
  if (period.approvalStatus === 'PENDING_HEAD_TU') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Menunggu Review' };
  if (period.approvalStatus === 'PENDING_PRINCIPAL') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985', label: 'Ke Kepala Sekolah' };
  if (period.approvalStatus === 'APPROVED') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Disetujui' };
  if (period.approvalStatus === 'REJECTED') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'Ditolak' };
  return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Belum Diajukan' };
}

function getClosingPeriodReopenStyle(request: StaffFinanceClosingPeriodReopenRequest) {
  if (request.status === 'PENDING_HEAD_TU') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Menunggu Review' };
  if (request.status === 'PENDING_PRINCIPAL') return { bg: '#e0f2fe', border: '#bae6fd', text: '#075985', label: 'Ke Kepala Sekolah' };
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

export default function StaffAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const staffDivision = resolveStaffDivision(user);
  const activeYearQuery = useQuery({
    queryKey: ['mobile-staff-admin-active-year', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF',
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
    staleTime: 5 * 60 * 1000,
  });

  const dataQuery = useQuery({
    queryKey: ['mobile-staff-admin-overview', user?.id, staffDivision, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'STAFF',
    queryFn: async (): Promise<StaffAdminOverviewData> => {
      if (staffDivision === 'ADMINISTRATION') {
        const summary = await staffAdministrationApi.getSummary();
        return { kind: 'ADMINISTRATION', summary };
      }

      if (staffDivision === 'HEAD_TU') {
        const [students, teachers, staffs, permissions, budgets] = await Promise.all([
          staffApi.listStudents(),
          staffApi.listTeachers(),
          staffApi.listStaffs(),
          permissionApi.list({ limit: 200 }),
          staffApi.listBudgetRequests(),
        ]);
        return { kind: 'HEAD_TU', students, teachers, staffs, permissions, budgets };
      }

      const [budgets, students, dashboard] = await Promise.all([
        staffApi.listBudgetRequests(),
        staffApi.listStudents(),
        staffFinanceApi.listReports({
          academicYearId: activeYearQuery.data?.id,
        }),
      ]);
      return { kind: 'FINANCE', budgets, students, dashboard };
    },
  });

  const headTuWriteOffsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-write-offs', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listWriteOffs({ pendingFor: 'HEAD_TU', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const headTuPaymentReversalsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-payment-reversals', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listPaymentReversals({ pendingFor: 'HEAD_TU', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const headTuCashSessionsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-cash-sessions', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listCashSessions({ mine: false, limit: 8 }),
    staleTime: 60 * 1000,
  });

  const headTuCashSessionApprovalsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-cash-session-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listCashSessions({ pendingFor: 'HEAD_TU', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const headTuBankReconciliationsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-bank-reconciliations', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listBankReconciliations({ limit: 8 }),
    staleTime: 60 * 1000,
  });

  const headTuBudgetRealizationQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-budget-realization', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () =>
      staffFinanceApi.getBudgetRealizationSummary({
        academicYearId: activeYearQuery.data?.id,
        limit: 8,
      }),
    staleTime: 60 * 1000,
  });

  const headTuGovernanceQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-governance', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () =>
      staffFinanceApi.getGovernanceSummary({
        academicYearId: activeYearQuery.data?.id,
        limit: 6,
    }),
    staleTime: 60 * 1000,
  });

  const headTuAuditQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-audit', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () =>
      staffFinanceApi.getAuditSummary({
        days: 30,
        limit: 6,
    }),
    staleTime: 60 * 1000,
  });

  const headTuPerformanceQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-performance', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () =>
      staffFinanceApi.getPerformanceSummary({
        months: 6,
      }),
    staleTime: 60 * 1000,
  });

  const headTuClosingPeriodsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-closing-periods', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listClosingPeriods({ limit: 8 }),
    staleTime: 60 * 1000,
  });

  const headTuClosingPeriodApprovalsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-closing-period-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listClosingPeriods({ pendingFor: 'HEAD_TU', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const headTuClosingPeriodReopenRequestsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-closing-period-reopen-requests', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listClosingPeriodReopenRequests({ limit: 8 }),
    staleTime: 60 * 1000,
  });

  const headTuClosingPeriodReopenApprovalsQuery = useQuery({
    queryKey: ['mobile-head-tu-finance-closing-period-reopen-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && staffDivision === 'HEAD_TU',
    queryFn: () => staffFinanceApi.listClosingPeriodReopenRequests({ pendingFor: 'HEAD_TU', limit: 20 }),
    staleTime: 60 * 1000,
  });

  const headTuWriteOffDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceApi.decideWriteOffAsHeadTu(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-write-offs', user?.id] });
      const message = payload.approved ? 'Write-off diteruskan ke Kepala Sekolah.' : 'Pengajuan write-off ditolak.';
      notifySuccess(message);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval write-off.');
    },
  });

  const headTuPaymentReversalDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceApi.decidePaymentReversalAsHeadTu(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-payment-reversals', user?.id] });
      notifySuccess(payload.approved ? 'Reversal diteruskan ke Kepala Sekolah.' : 'Pengajuan reversal ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval reversal pembayaran.');
    },
  });

  const headTuCashSessionDecisionMutation = useMutation({
    mutationFn: (payload: { sessionId: number; approved: boolean }) =>
      staffFinanceApi.decideCashSessionAsHeadTu(payload.sessionId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Settlement kas ditolak oleh Kepala TU',
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-cash-session-approvals', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-cash-sessions', user?.id] });
      notifySuccess(payload.approved ? 'Settlement kas diproses oleh Head TU.' : 'Settlement kas ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses approval settlement kas.');
    },
  });

  const headTuClosingPeriodDecisionMutation = useMutation({
    mutationFn: (payload: { periodId: number; approved: boolean }) =>
      staffFinanceApi.decideClosingPeriodAsHeadTu(payload.periodId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Closing period ditolak oleh Kepala TU',
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-closing-periods', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-closing-period-approvals', user?.id] });
      notifySuccess(payload.approved ? 'Closing period diproses oleh Head TU.' : 'Closing period ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses closing period.');
    },
  });

  const headTuClosingPeriodReopenDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceApi.decideClosingPeriodReopenAsHeadTu(payload.requestId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Reopen closing period ditolak oleh Kepala TU',
      }),
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-closing-periods', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-closing-period-reopen-requests', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-finance-closing-period-reopen-approvals', user?.id] });
      notifySuccess(payload.approved ? 'Reopen closing period diproses oleh Head TU.' : 'Reopen closing period ditolak.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses reopen closing period.');
    },
  });

  const financeBudgets = useMemo(
    () => (dataQuery.data?.kind === 'FINANCE' ? dataQuery.data.budgets : []),
    [dataQuery.data],
  );
  const financeStudents = useMemo(
    () => (dataQuery.data?.kind === 'FINANCE' ? dataQuery.data.students : []),
    [dataQuery.data],
  );
  const financeDashboard = useMemo(
    () => (dataQuery.data?.kind === 'FINANCE' ? dataQuery.data.dashboard : null),
    [dataQuery.data],
  );
  const administrationSummary = useMemo(
    () => (dataQuery.data?.kind === 'ADMINISTRATION' ? dataQuery.data.summary : null),
    [dataQuery.data],
  );
  const headTuStudents = useMemo(
    () => (dataQuery.data?.kind === 'HEAD_TU' ? dataQuery.data.students : []),
    [dataQuery.data],
  );
  const headTuTeachers = useMemo(
    () => (dataQuery.data?.kind === 'HEAD_TU' ? dataQuery.data.teachers : []),
    [dataQuery.data],
  );
  const headTuStaffs = useMemo(
    () => (dataQuery.data?.kind === 'HEAD_TU' ? dataQuery.data.staffs : []),
    [dataQuery.data],
  );
  const headTuPermissions = useMemo(
    () => (dataQuery.data?.kind === 'HEAD_TU' ? dataQuery.data.permissions : []),
    [dataQuery.data],
  );
  const headTuBudgets = useMemo(
    () => (dataQuery.data?.kind === 'HEAD_TU' ? dataQuery.data.budgets : []),
    [dataQuery.data],
  );

  const financeSummary = useMemo(() => {
    const pending = financeBudgets.filter((item) => item.status === 'PENDING').length;
    const approved = financeBudgets.filter((item) => item.status === 'APPROVED').length;
    const rejected = financeBudgets.filter((item) => item.status === 'REJECTED').length;
    const totalAmount = financeBudgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    return { pending, approved, rejected, totalAmount };
  }, [financeBudgets]);

  const financeRecentPendingBudgets = financeBudgets.filter((item) => item.status === 'PENDING').slice(0, 6);
  const headTuPendingPermissions = headTuPermissions.filter((item) => item.status === 'PENDING').length;
  const headTuPendingBudgets = headTuBudgets.filter((item) => item.status === 'PENDING').length;
  const headTuAdministrationStaff = headTuStaffs.filter((item) => resolveStaffDivision(item) === 'ADMINISTRATION').length;
  const headTuFinanceStaff = headTuStaffs.filter((item) => resolveStaffDivision(item) === 'FINANCE').length;
  const headTuPendingWriteOffs = useMemo(
    () => headTuWriteOffsQuery.data?.requests || [],
    [headTuWriteOffsQuery.data],
  );
  const headTuPendingPaymentReversals = useMemo(
    () => headTuPaymentReversalsQuery.data?.requests || [],
    [headTuPaymentReversalsQuery.data],
  );
  const headTuCashSessions = useMemo(
    () => headTuCashSessionsQuery.data?.sessions || [],
    [headTuCashSessionsQuery.data],
  );
  const headTuPendingCashSessionApprovals = useMemo(
    () => headTuCashSessionApprovalsQuery.data?.sessions || [],
    [headTuCashSessionApprovalsQuery.data],
  );
  const headTuCashSummary = headTuCashSessionsQuery.data?.summary;
  const headTuBankReconciliations = useMemo(
    () => headTuBankReconciliationsQuery.data?.reconciliations || [],
    [headTuBankReconciliationsQuery.data],
  );
  const headTuBankReconciliationSummary = headTuBankReconciliationsQuery.data?.summary;
  const headTuGovernance = headTuGovernanceQuery.data || null;
  const headTuAudit = headTuAuditQuery.data || null;
  const headTuPerformance = headTuPerformanceQuery.data || null;
  const headTuBudgetRealization = headTuBudgetRealizationQuery.data || null;
  const headTuClosingPeriods = useMemo(
    () => headTuClosingPeriodsQuery.data?.periods || [],
    [headTuClosingPeriodsQuery.data],
  );
  const headTuClosingPeriodSummary = headTuClosingPeriodsQuery.data?.summary;
  const headTuClosingPeriodReopenRequests = useMemo(
    () => headTuClosingPeriodReopenRequestsQuery.data?.requests || [],
    [headTuClosingPeriodReopenRequestsQuery.data],
  );
  const headTuClosingPeriodReopenSummary = headTuClosingPeriodReopenRequestsQuery.data?.summary;
  const headTuPendingClosingPeriods = useMemo(
    () => headTuClosingPeriodApprovalsQuery.data?.periods || [],
    [headTuClosingPeriodApprovalsQuery.data],
  );
  const headTuPendingClosingPeriodReopens = useMemo(
    () => headTuClosingPeriodReopenApprovalsQuery.data?.requests || [],
    [headTuClosingPeriodReopenApprovalsQuery.data],
  );

  const handleRefresh = () => {
    void dataQuery.refetch();
    if (staffDivision === 'HEAD_TU') {
      void headTuWriteOffsQuery.refetch();
      void headTuPaymentReversalsQuery.refetch();
      void headTuCashSessionsQuery.refetch();
      void headTuCashSessionApprovalsQuery.refetch();
      void headTuBankReconciliationsQuery.refetch();
      void headTuGovernanceQuery.refetch();
      void headTuAuditQuery.refetch();
      void headTuPerformanceQuery.refetch();
      void headTuBudgetRealizationQuery.refetch();
      void headTuClosingPeriodsQuery.refetch();
      void headTuClosingPeriodApprovalsQuery.refetch();
      void headTuClosingPeriodReopenRequestsQuery.refetch();
      void headTuClosingPeriodReopenApprovalsQuery.refetch();
    }
  };

  const handleHeadTuWriteOffDecision = (request: StaffFinanceWriteOffRequest, approved: boolean) => {
    const actionLabel = approved ? 'meneruskan' : 'menolak';
    const buttonLabel = approved ? 'Ya, Teruskan' : 'Ya, Tolak';
    Alert.alert(
      approved ? 'Teruskan ke Kepala Sekolah' : 'Tolak Write-Off',
      `Yakin ingin ${actionLabel} pengajuan "${request.requestNo}" untuk ${request.student?.name || 'siswa ini'}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: buttonLabel,
          style: approved ? 'default' : 'destructive',
          onPress: () => headTuWriteOffDecisionMutation.mutate({ requestId: request.id, approved }),
        },
      ],
    );
  };

  const handleHeadTuPaymentReversalDecision = (request: StaffFinancePaymentReversalRequest, approved: boolean) => {
    const actionLabel = approved ? 'meneruskan' : 'menolak';
    const buttonLabel = approved ? 'Ya, Teruskan' : 'Ya, Tolak';
    Alert.alert(
      approved ? 'Teruskan ke Kepala Sekolah' : 'Tolak Reversal',
      `Yakin ingin ${actionLabel} pengajuan "${request.requestNo}" untuk ${request.student?.name || 'siswa ini'}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: buttonLabel,
          style: approved ? 'default' : 'destructive',
          onPress: () => headTuPaymentReversalDecisionMutation.mutate({ requestId: request.id, approved }),
        },
      ],
    );
  };

  const handleHeadTuCashSessionDecision = (session: StaffFinanceCashSession, approved: boolean) => {
    const actionLabel = approved ? 'memproses' : 'menolak';
    Alert.alert(
      approved ? 'Proses Settlement Kas' : 'Tolak Settlement Kas',
      `Yakin ingin ${actionLabel} settlement "${session.sessionNo}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: approved ? 'Ya, Proses' : 'Ya, Tolak',
          style: approved ? 'default' : 'destructive',
          onPress: () => headTuCashSessionDecisionMutation.mutate({ sessionId: session.id, approved }),
        },
      ],
    );
  };

  const handleHeadTuClosingPeriodDecision = (period: StaffFinanceClosingPeriod, approved: boolean) => {
    const actionLabel = approved ? 'memproses' : 'menolak';
    const buttonLabel = approved ? 'Ya, Proses' : 'Ya, Tolak';
    Alert.alert(
      approved ? 'Proses Closing Period' : 'Tolak Closing Period',
      `Yakin ingin ${actionLabel} closing period "${period.label}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: buttonLabel,
          style: approved ? 'default' : 'destructive',
          onPress: () => headTuClosingPeriodDecisionMutation.mutate({ periodId: period.id, approved }),
        },
      ],
    );
  };

  const handleHeadTuClosingPeriodReopenDecision = (
    request: StaffFinanceClosingPeriodReopenRequest,
    approved: boolean,
  ) => {
    const actionLabel = approved ? 'memproses' : 'menolak';
    const buttonLabel = approved ? 'Ya, Proses' : 'Ya, Tolak';
    Alert.alert(
      approved ? 'Proses Reopen Closing' : 'Tolak Reopen Closing',
      `Yakin ingin ${actionLabel} reopen closing "${request.closingPeriod.label}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: buttonLabel,
          style: approved ? 'default' : 'destructive',
          onPress: () =>
            headTuClosingPeriodReopenDecisionMutation.mutate({ requestId: request.id, approved }),
        },
      ],
    );
  };

  if (isLoading) return <AppLoadingScreen message="Memuat administrasi staff..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STAFF') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Administrasi</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role staff." />
      </ScrollView>
    );
  }

  const title =
    staffDivision === 'HEAD_TU'
      ? 'Workspace Kepala TU'
      : staffDivision === 'ADMINISTRATION'
        ? 'Administrasi Staff'
        : 'Operasional Keuangan';
  const subtitle =
    staffDivision === 'HEAD_TU'
      ? 'Ringkasan monitoring TU, layanan administrasi, dan koordinasi staff.'
      : staffDivision === 'ADMINISTRATION'
        ? 'Ringkasan administrasi siswa, guru, dan antrian perizinan.'
        : 'Ringkasan proses keuangan: pengajuan anggaran dan data siswa.';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl refreshing={dataQuery.isFetching && !dataQuery.isLoading} onRefresh={handleRefresh} />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{subtitle}</Text>

      {dataQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data staff..." /> : null}
      {dataQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat ringkasan staff." onRetry={() => dataQuery.refetch()} />
      ) : null}

      {!dataQuery.isLoading && !dataQuery.isError && dataQuery.data?.kind === 'FINANCE' ? (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Data Siswa" value={String(financeStudents.length)} subtitle="Total siswa terdaftar" />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Pengajuan" value={String(financeBudgets.length)} subtitle="Total pengajuan anggaran" />
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Menunggu" value={String(financeSummary.pending)} subtitle="Belum diproses" />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Total Nominal"
                value={`Rp ${financeSummary.totalAmount.toLocaleString('id-ID')}`}
                subtitle="Akumulasi seluruh pengajuan"
              />
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Performance Trend 6 Bulan</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                Tren invoice, koleksi, pending verifikasi, treasury flow, dan closing untuk monitoring Head TU.
              </Text>
            </View>

            {headTuPerformanceQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil trend performa finance..." />
            ) : !headTuPerformance ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan performa finance belum tersedia.</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Avg Collection"
                      value={`${headTuPerformance.overview.averageCollectionRate.toFixed(1)}%`}
                      subtitle={`${formatCurrency(headTuPerformance.overview.averageCollectedAgainstIssuedAmount)} / bulan`}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Net Flow"
                      value={formatCurrency(headTuPerformance.overview.latestNetFlowAmount)}
                      subtitle={headTuPerformance.overview.latestMonthLabel || 'Bulan terbaru'}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Outstanding"
                      value={formatCurrency(headTuPerformance.overview.latestOutstandingAmount)}
                      subtitle={`Rate ${headTuPerformance.overview.latestCollectionRate.toFixed(1)}%`}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Pending"
                      value={formatCurrency(headTuPerformance.overview.latestPendingVerificationAmount)}
                      subtitle={
                        headTuPerformance.highlights.highestPendingVerificationMonth
                          ? `Puncak ${headTuPerformance.highlights.highestPendingVerificationMonth.label}`
                          : 'Tidak ada backlog'
                      }
                    />
                  </View>
                </View>

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Signal Prioritas</Text>
                {headTuPerformance.signals.map((signal) => {
                  const badge = getPerformanceSignalStyle(signal.tone);
                  return (
                    <View key={signal.key} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{signal.title}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{signal.detail}</Text>
                        </View>
                        <View style={{ borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{signal.tone}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6, marginTop: 8 }}>Trend Bulanan</Text>
                {headTuPerformance.monthlyTrend.map((row) => (
                  <View key={row.periodKey} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.label}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      {row.issuedInvoiceCount} invoice • rate {row.collectionRate.toFixed(1)}%
                    </Text>
                    <Text style={{ color: '#166534', fontSize: 12, marginTop: 3 }}>
                      Collected {formatCurrency(row.collectedAgainstIssuedAmount)} • Net Flow {formatCurrency(row.netFlowAmount)}
                    </Text>
                    <Text style={{ color: '#92400e', fontSize: 12, marginTop: 3 }}>
                      Outstanding {formatCurrency(row.outstandingAmount)} • overdue {formatCurrency(row.overdueOutstandingAmount)}
                    </Text>
                    <Text style={{ color: '#991b1b', fontSize: 12, marginTop: 3 }}>
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
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ringkasan Status Pengajuan</Text>
            <Text style={{ color: '#475569', marginBottom: 3 }}>
              Menunggu: <Text style={{ color: '#b45309', fontWeight: '700' }}>{financeSummary.pending}</Text>
            </Text>
            <Text style={{ color: '#475569', marginBottom: 3 }}>
              Disetujui: <Text style={{ color: '#15803d', fontWeight: '700' }}>{financeSummary.approved}</Text>
            </Text>
            <Text style={{ color: '#475569' }}>
              Ditolak: <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{financeSummary.rejected}</Text>
            </Text>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pengajuan Menunggu Tindak Lanjut</Text>

            {financeRecentPendingBudgets.length > 0 ? (
              financeRecentPendingBudgets.map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title || 'Tanpa judul'}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    Pengaju: {item.requester?.name || '-'} • Rp {Number(item.totalAmount || 0).toLocaleString('id-ID')}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada pengajuan pending saat ini.</Text>
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Reversal Pembayaran</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Review koreksi pembayaran sebelum diteruskan ke Kepala Sekolah.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fff7ed',
                  borderColor: '#fed7aa',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{headTuPendingPaymentReversals.length} menunggu</Text>
              </View>
            </View>

            {headTuPaymentReversalsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil approval reversal pembayaran..." />
            ) : headTuPaymentReversalsQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat approval reversal pembayaran."
                onRetry={() => headTuPaymentReversalsQuery.refetch()}
              />
            ) : headTuPendingPaymentReversals.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada approval reversal pembayaran yang menunggu.</Text>
            ) : (
              headTuPendingPaymentReversals.slice(0, 5).map((request) => (
                <View key={request.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{request.requestNo}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {request.student?.name || '-'} • {request.student?.studentClass?.name || '-'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Pembayaran {request.payment?.paymentNo || '-'} • invoice {request.invoice?.invoiceNo || '-'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Permintaan{' '}
                    <Text style={{ color: '#b45309', fontWeight: '700' }}>
                      {formatCurrency(request.requestedAmount)}
                    </Text>
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Alokasi {formatCurrency(request.requestedAllocatedAmount || 0)} • kredit {formatCurrency(request.requestedCreditedAmount || 0)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{request.reason}</Text>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      disabled={headTuPaymentReversalDecisionMutation.isPending}
                      onPress={() => handleHeadTuPaymentReversalDecision(request, false)}
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
                      disabled={headTuPaymentReversalDecisionMutation.isPending}
                      onPress={() => handleHeadTuPaymentReversalDecision(request, true)}
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
                      <Text style={{ color: '#047857', fontWeight: '700' }}>Teruskan</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Follow Up"
                value={String(financeDashboard?.collectionOverview.studentsWithOutstanding || 0)}
                subtitle="Siswa outstanding aktif"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Kasus Kritis"
                value={String(financeDashboard?.collectionOverview.criticalCount || 0)}
                subtitle="Prioritas penagihan"
              />
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Antrian Penagihan Prioritas</Text>
            {!financeDashboard?.collectionPriorityQueue.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada saldo outstanding aktif.</Text>
            ) : (
              financeDashboard.collectionPriorityQueue.slice(0, 4).map((row) => {
                const badge = getCollectionPriorityStyle(row.priority);
                return (
                  <View key={row.studentId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {row.className} • {row.nis || row.username}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: badge.bg, borderColor: badge.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{row.priority}</Text>
                      </View>
                    </View>
                    <Text style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>
                      Outstanding <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rp {Math.round(row.totalOutstanding).toLocaleString('id-ID')}</Text> • overdue Rp {Math.round(row.overdueOutstanding).toLocaleString('id-ID')}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Tagihan Jatuh Tempo Dekat</Text>
            {!financeDashboard?.dueSoonInvoices.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada tagihan jatuh tempo dalam 7 hari.</Text>
            ) : (
              financeDashboard.dueSoonInvoices.slice(0, 4).map((row) => (
                <View key={row.invoiceId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.invoiceNo} • {row.className} • {getDueSoonLabel(row.daysUntilDue)}
                  </Text>
                  <Text style={{ color: '#0369a1', fontSize: 11, marginTop: 2 }}>
                    {formatDate(row.dueDate)} • Rp {Math.round(row.balanceAmount).toLocaleString('id-ID')}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => router.push('/staff/payments' as never)}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Buka Pembayaran</Text>
              </Pressable>
            </View>

            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => router.push('/staff/students' as never)}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Buka Data Siswa</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      {!dataQuery.isLoading && !dataQuery.isError && dataQuery.data?.kind === 'ADMINISTRATION' ? (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Siswa"
                value={String(administrationSummary?.overview.totalStudents || 0)}
                subtitle="Data siswa terdaftar"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Guru"
                value={String(administrationSummary?.overview.totalTeachers || 0)}
                subtitle="Data guru aktif"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Verifikasi"
                value={String(
                  (administrationSummary?.overview.pendingStudentVerification || 0) +
                    (administrationSummary?.overview.pendingTeacherVerification || 0),
                )}
                subtitle="Menunggu validasi"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard
                title="Izin Pending"
                value={String(administrationSummary?.overview.pendingPermissions || 0)}
                subtitle="Perlu tindak lanjut"
              />
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Fokus Administrasi</Text>
            <Text style={{ color: '#475569', marginBottom: 4 }}>
              Kelengkapan siswa: <Text style={{ color: '#0369a1', fontWeight: '700' }}>{administrationSummary?.overview.studentCompletenessRate || 0}%</Text>
            </Text>
            <Text style={{ color: '#475569', marginBottom: 4 }}>
              Kelengkapan guru: <Text style={{ color: '#15803d', fontWeight: '700' }}>{administrationSummary?.overview.teacherCompletenessRate || 0}%</Text>
            </Text>
            <Text style={{ color: '#475569' }}>
              Verifikasi ditolak: <Text style={{ color: '#b91c1c', fontWeight: '700' }}>
                {(administrationSummary?.overview.rejectedStudentVerification || 0) +
                  (administrationSummary?.overview.rejectedTeacherVerification || 0)}
              </Text>
            </Text>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Kelas Prioritas Administrasi</Text>
            {!administrationSummary?.studentClassRecap.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada rekap kelas.</Text>
            ) : (
              administrationSummary.studentClassRecap.slice(0, 5).map((row) => (
                <View key={`${row.classId ?? 0}-${row.className}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.className}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.totalStudents} siswa • kelengkapan {row.completenessRate}% • prioritas {row.priorityCount}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Governance Summary</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Ringkasan kontrol finance untuk area risiko utama Head TU.
                </Text>
              </View>
              {headTuGovernance ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: getGovernanceRiskStyle(headTuGovernance.overview.riskLevel).border,
                    backgroundColor: getGovernanceRiskStyle(headTuGovernance.overview.riskLevel).bg,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: getGovernanceRiskStyle(headTuGovernance.overview.riskLevel).text, fontSize: 11, fontWeight: '700' }}>
                    {getGovernanceRiskStyle(headTuGovernance.overview.riskLevel).label}
                  </Text>
                </View>
              ) : null}
            </View>

            {headTuGovernanceQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil governance finance..." />
            ) : !headTuGovernance ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan governance finance belum tersedia.</Text>
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
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{headTuGovernance.overview.headline}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>{headTuGovernance.overview.detail}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    {headTuGovernance.overview.attentionItems} item perhatian • {formatCurrency(headTuGovernance.overview.attentionAmount)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Kolektibilitas"
                      value={String(headTuGovernance.collection.criticalCount)}
                      subtitle={`High ${headTuGovernance.collection.highPriorityCount}`}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Treasury"
                      value={String(
                        headTuGovernance.treasury.openCashSessions +
                          headTuGovernance.treasury.openBankReconciliations,
                      )}
                      subtitle="Kas/bank terbuka"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Approval"
                      value={String(headTuGovernance.approvals.totalPendingCount)}
                      subtitle="Menunggu review"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Budget/Close"
                      value={String(
                        headTuGovernance.budgetControl.followUpCount +
                          headTuGovernance.closingControl.reviewCount,
                      )}
                      subtitle="Butuh tindak lanjut"
                    />
                  </View>
                </View>

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Antrian Prioritas</Text>
                {!headTuGovernance.followUpQueue.length ? (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada antrian governance yang perlu ditindaklanjuti.</Text>
                ) : (
                  headTuGovernance.followUpQueue.map((item) => {
                    const badge = getGovernanceSeverityStyle(item.severity);
                    return (
                      <View key={item.key} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <View style={{ borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{item.severity}</Text>
                              </View>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }}>{item.category}</Text>
                            </View>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{item.detail}</Text>
                            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
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
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Audit Finance 30 Hari</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                Ringkasan perubahan policy, approval sensitif, dan kontrol treasury terbaru untuk audit Head TU.
              </Text>
            </View>

            {headTuAuditQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil audit finance..." />
            ) : !headTuAudit ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan audit finance belum tersedia.</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Event Kritis"
                      value={String(headTuAudit.overview.criticalCount)}
                      subtitle={`High ${headTuAudit.overview.highCount}`}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Policy"
                      value={String(headTuAudit.overview.policyChangeCount)}
                      subtitle={`${headTuAudit.categorySummary.policyCount} log`}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Approval"
                      value={String(headTuAudit.overview.approvalActionCount)}
                      subtitle={`${headTuAudit.categorySummary.approvalCount} log`}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Aktor Aktif"
                      value={String(headTuAudit.overview.uniqueActors)}
                      subtitle={`${headTuAudit.overview.totalEvents} event`}
                    />
                  </View>
                </View>

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Aktor Paling Aktif</Text>
                {!headTuAudit.actorSummary.length ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>Belum ada aktivitas audit finance pada periode ini.</Text>
                ) : (
                  <View style={{ marginBottom: 8 }}>
                    {headTuAudit.actorSummary.map((actor) => (
                      <View key={actor.actorId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{actor.actorName}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {actor.totalEvents} event • kritis {actor.criticalCount} • approval {actor.approvalCount}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Event Terbaru</Text>
                {!headTuAudit.recentEvents.length ? (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada event audit finance yang tercatat.</Text>
                ) : (
                  headTuAudit.recentEvents.map((event) => {
                    const badge = getGovernanceSeverityStyle(event.severity);
                    return (
                      <View key={event.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <View style={{ borderWidth: 1, borderColor: badge.border, backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{event.severity}</Text>
                              </View>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }}>{event.category}</Text>
                            </View>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{event.label}</Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{event.summary}</Text>
                            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                              {event.actor.label} • {formatDate(event.createdAt)}
                              {event.entityId ? ` • Ref #${event.entityId}` : ''}
                            </Text>
                          </View>
                          <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700' }}>{event.action}</Text>
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
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Budget vs Realization</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Monitoring budget approved, progres LPJ, actual spent, dan variance untuk melihat bottleneck realisasi finance.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#f8fafc',
                  borderColor: '#cbd5e1',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#334155', fontSize: 11, fontWeight: '700' }}>
                  {formatCurrency(headTuBudgetRealization?.overview.approvedBudgetAmount || 0)}
                </Text>
              </View>
            </View>

            {headTuBudgetRealizationQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil budget vs realization..." />
            ) : !headTuBudgetRealization ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Ringkasan budget vs realization belum tersedia.</Text>
            ) : (
              <>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Actual {formatCurrency(headTuBudgetRealization.overview.actualRealizedAmount)} • variance {formatCurrency(headTuBudgetRealization.overview.varianceAmount)} • review LPJ{' '}
                  {headTuBudgetRealization.overview.stageSummary.financeReviewCount +
                    headTuBudgetRealization.overview.stageSummary.returnedByFinanceCount}
                </Text>

                {headTuBudgetRealization.dutyRecap.slice(0, 4).map((row) => (
                  <View key={row.additionalDuty} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.additionalDutyLabel}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      {row.totalRequests} request • {row.realizationRate.toFixed(1)}%
                    </Text>
                    <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                      Approved {formatCurrency(row.approvedBudgetAmount)} • Actual {formatCurrency(row.actualRealizedAmount)}
                    </Text>
                    <Text style={{ color: '#6b21a8', fontSize: 12, marginTop: 2 }}>
                      Variance {formatCurrency(row.varianceAmount)}
                    </Text>
                  </View>
                ))}

                {headTuBudgetRealization.followUpQueue.length ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Antrian Tindak Lanjut</Text>
                    {headTuBudgetRealization.followUpQueue.slice(0, 4).map((row) => {
                      const stage = getBudgetProgressStyle(row.stage);
                      return (
                        <View key={`head-tu-budget-${row.budgetId}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.title}</Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                                {row.requesterName} • {row.additionalDutyLabel}
                              </Text>
                            </View>
                            <View style={{ borderWidth: 1, borderColor: stage.border, backgroundColor: stage.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ color: stage.text, fontSize: 11, fontWeight: '700' }}>{stage.label}</Text>
                            </View>
                          </View>
                          <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                            Approved {formatCurrency(row.approvedBudgetAmount)} • Actual {formatCurrency(row.actualRealizedAmount)}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
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
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Closing Period Finance</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Monitoring snapshot lock periode finance sebelum ditutup final.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#f8fafc',
                  borderColor: '#cbd5e1',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#334155', fontSize: 11, fontWeight: '700' }}>{headTuClosingPeriodSummary?.totalPeriods || 0} period</Text>
              </View>
            </View>

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
              Review {headTuClosingPeriodSummary?.reviewCount || 0} • locked {headTuClosingPeriodSummary?.closedCount || 0} • pending verifikasi {formatCurrency(headTuClosingPeriodSummary?.totalPendingVerificationAmount || 0)}
            </Text>

            {headTuClosingPeriodsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil closing period finance..." />
            ) : headTuClosingPeriods.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada closing period finance yang tercatat.</Text>
            ) : (
              headTuClosingPeriods.slice(0, 5).map((period) => {
                const status = getClosingPeriodStatusStyle(period);
                const approval = getClosingPeriodApprovalStyle(period);
                return (
                  <View key={period.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{period.label}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                        </Text>
                        <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                          Outstanding {formatCurrency(period.summary.outstandingAmount)} • pending {formatCurrency(period.summary.pendingVerificationAmount)}
                        </Text>
                        <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                          Unmatched {formatCurrency(period.summary.unmatchedBankAmount)} • kas/bank {formatCurrency(period.summary.cashClosingBalance)} / {formatCurrency(period.summary.bankClosingBalance)}
                        </Text>
                        {period.closedAt ? (
                          <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                            Locked {formatDate(period.closedAt)}
                            {period.closedBy?.name ? ` oleh ${period.closedBy.name}` : ''}
                          </Text>
                        ) : null}
                        {period.reopenedAt ? (
                          <Text style={{ color: '#0f766e', fontSize: 12, marginTop: 2 }}>
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
                              borderWidth: 1,
                              borderColor: badge.border,
                              backgroundColor: badge.bg,
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                            }}
                          >
                            <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{badge.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    {period.headTuDecisionNote ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                        Review Head TU: {period.headTuDecisionNote}
                      </Text>
                    ) : null}
                    {period.principalDecisionNote ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                        Keputusan Kepsek: {period.principalDecisionNote}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Closing Period</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Review closing period sebelum ditutup final atau diteruskan ke Kepala Sekolah.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fff7ed',
                  borderColor: '#fed7aa',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{headTuPendingClosingPeriods.length} menunggu</Text>
              </View>
            </View>

            {headTuClosingPeriodApprovalsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil approval closing period..." />
            ) : headTuPendingClosingPeriods.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada closing period yang menunggu review.</Text>
            ) : (
              headTuPendingClosingPeriods.map((period) => (
                <View key={period.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{period.label}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Outstanding {formatCurrency(period.summary.outstandingAmount)} • pending {formatCurrency(period.summary.pendingVerificationAmount)}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Unmatched {formatCurrency(period.summary.unmatchedBankAmount)} • kas/rekon terbuka {period.summary.openCashSessionCount}/{period.summary.openReconciliationCount}
                  </Text>
                  {period.closingNote ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{period.closingNote}</Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      disabled={headTuClosingPeriodDecisionMutation.isPending}
                      onPress={() => handleHeadTuClosingPeriodDecision(period, false)}
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
                      disabled={headTuClosingPeriodDecisionMutation.isPending}
                      onPress={() => handleHeadTuClosingPeriodDecision(period, true)}
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
                      <Text style={{ color: '#047857', fontWeight: '700' }}>Proses</Text>
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
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Reopen Closing</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Review unlock period sebelum diteruskan ke Kepala Sekolah atau ditolak.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fff7ed',
                  borderColor: '#fed7aa',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{headTuPendingClosingPeriodReopens.length} menunggu</Text>
              </View>
            </View>

            {headTuClosingPeriodReopenApprovalsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil approval reopen closing..." />
            ) : headTuPendingClosingPeriodReopens.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada request reopen yang menunggu review.</Text>
            ) : (
              headTuPendingClosingPeriodReopens.map((request) => {
                const badge = getClosingPeriodReopenStyle(request);
                return (
                  <View key={request.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{request.closingPeriod.label}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                          {request.requestNo} • {request.closingPeriod.periodNo}
                        </Text>
                        <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>{request.reason}</Text>
                        {request.requestedNote ? (
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{request.requestedNote}</Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: badge.border,
                          backgroundColor: badge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>{badge.label}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable
                        disabled={headTuClosingPeriodReopenDecisionMutation.isPending}
                        onPress={() => handleHeadTuClosingPeriodReopenDecision(request, false)}
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
                        disabled={headTuClosingPeriodReopenDecisionMutation.isPending}
                        onPress={() => handleHeadTuClosingPeriodReopenDecision(request, true)}
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
                        <Text style={{ color: '#047857', fontWeight: '700' }}>Proses</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}

            {headTuClosingPeriodReopenRequests.length > 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 8 }}>
                Riwayat reopen tercatat {headTuClosingPeriodReopenSummary?.totalRequests || 0} request,{' '}
                {headTuClosingPeriodReopenSummary?.appliedCount || 0} sudah direopen.
              </Text>
            ) : null}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>PTK Prioritas Guru</Text>
            {!administrationSummary?.teacherPtkRecap.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada rekap PTK.</Text>
            ) : (
              administrationSummary.teacherPtkRecap.slice(0, 5).map((row) => (
                <View key={row.ptkType} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.ptkType || '-'}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.totalTeachers} guru • kelengkapan {row.completenessRate}% • prioritas {row.priorityCount}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Prioritas Administrasi Siswa</Text>
            {!administrationSummary?.studentPriorityQueue.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Seluruh data inti siswa sudah lengkap.</Text>
            ) : (
              administrationSummary.studentPriorityQueue.slice(0, 5).map((row) => (
                <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.className} • kurang {row.missingFields.join(', ')}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Prioritas Administrasi Guru</Text>
            {!administrationSummary?.teacherPriorityQueue.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Seluruh data inti guru sudah lengkap.</Text>
            ) : (
              administrationSummary.teacherPriorityQueue.slice(0, 5).map((row) => (
                <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.ptkType} • kurang {row.missingFields.join(', ')}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Perizinan Menunggu Tindak Lanjut</Text>
            {!administrationSummary?.permissionQueue.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada perizinan pending saat ini.</Text>
            ) : (
              administrationSummary.permissionQueue.slice(0, 5).map((row) => (
                <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.className} • {row.type} • {row.ageDays} hari
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    {formatDate(row.startDate)} - {formatDate(row.endDate)} • {row.agingLabel}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Aging Perizinan Pending</Text>
            {!administrationSummary?.permissionAging.length ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada perizinan pending yang perlu dipantau.</Text>
            ) : (
              administrationSummary.permissionAging.map((row) => (
                <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: '#475569' }}>{row.label}</Text>
                  <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{row.count}</Text>
                </View>
              ))
            )}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-administration-dashboard')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Workspace Admin</Text>
              </Pressable>
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => router.push('/staff/students' as never)}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Data Siswa</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-administration-teachers')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Data Guru</Text>
              </Pressable>
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-administration-permissions')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Perizinan</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      {!dataQuery.isLoading && !dataQuery.isError && dataQuery.data?.kind === 'HEAD_TU' ? (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Siswa" value={String(headTuStudents.length)} subtitle="Layanan siswa" />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Guru" value={String(headTuTeachers.length)} subtitle="Data guru aktif" />
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Staff TU" value={String(headTuStaffs.length)} subtitle="Personel terdaftar" />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <SummaryCard title="Izin Pending" value={String(headTuPendingPermissions)} subtitle="Antrian administrasi" />
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ringkasan Kepala TU</Text>
            <Text style={{ color: '#475569', marginBottom: 4 }}>
              Pengajuan anggaran menunggu: <Text style={{ color: '#b45309', fontWeight: '700' }}>{headTuPendingBudgets}</Text>
            </Text>
            <Text style={{ color: '#475569', marginBottom: 4 }}>
              Staff administrasi: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{headTuAdministrationStaff}</Text>
            </Text>
            <Text style={{ color: '#475569' }}>
              Staff keuangan: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{headTuFinanceStaff}</Text>
            </Text>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Settlement Kas Harian</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Monitoring read-only sesi kas bendahara untuk expected closing dan selisih settlement.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fff7ed',
                  borderColor: '#fed7aa',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{headTuCashSummary?.openCount || 0} terbuka</Text>
              </View>
            </View>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
              Pending review {headTuCashSummary?.pendingHeadTuCount || 0} • pending Kepsek {headTuCashSummary?.pendingPrincipalCount || 0}
            </Text>
            {headTuCashSessionsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil settlement kas..." />
            ) : headTuCashSessions.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada sesi kas harian yang tercatat.</Text>
            ) : (
              headTuCashSessions.slice(0, 4).map((session: StaffFinanceCashSession) => (
                <View key={session.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{session.sessionNo}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {formatDate(session.businessDate)} • {session.openedBy?.name || '-'} • {session.status === 'OPEN' ? 'Masih dibuka' : 'Sudah ditutup'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                    Expected {formatCurrency(session.expectedClosingBalance)} • aktual {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
                  </Text>
                  {session.varianceAmount != null ? (
                    <Text style={{ color: Number(session.varianceAmount) === 0 ? '#166534' : '#b91c1c', fontSize: 12, marginTop: 2 }}>
                      Selisih {formatCurrency(session.varianceAmount)}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#1d4ed8', fontSize: 12, marginTop: 2 }}>
                    {session.approvalStatus === 'PENDING_HEAD_TU'
                      ? 'Menunggu review Head TU'
                      : session.approvalStatus === 'PENDING_PRINCIPAL'
                        ? 'Menunggu Kepala Sekolah'
                        : session.approvalStatus === 'REJECTED'
                          ? 'Ditolak'
                          : session.approvalStatus === 'AUTO_APPROVED'
                            ? 'Auto approved'
                            : 'Disetujui'}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rekonsiliasi Bank</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Monitoring read-only transaksi bank non-tunai untuk melihat variance dan item yang belum matched.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#eef2ff',
                  borderColor: '#c7d2fe',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#4338ca', fontSize: 11, fontWeight: '700' }}>
                  {headTuBankReconciliationSummary?.openCount || 0} terbuka
                </Text>
              </View>
            </View>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
              Final {headTuBankReconciliationSummary?.finalizedCount || 0} • unmatched statement {headTuBankReconciliationSummary?.totalUnmatchedStatementEntries || 0}
            </Text>
            {headTuBankReconciliationsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil rekonsiliasi bank..." />
            ) : headTuBankReconciliations.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada rekonsiliasi bank yang tercatat.</Text>
            ) : (
              headTuBankReconciliations.slice(0, 4).map((reconciliation: StaffFinanceBankReconciliation) => (
                <View key={reconciliation.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{reconciliation.reconciliationNo}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {reconciliation.bankAccount.bankName} • {reconciliation.bankAccount.accountNumber}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                    {formatDate(reconciliation.periodStart)} - {formatDate(reconciliation.periodEnd)}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                    Expected {formatCurrency(reconciliation.summary.expectedClosingBalance)} • statement {formatCurrency(reconciliation.summary.statementComputedClosingBalance)}
                  </Text>
                  <Text style={{ color: Number(reconciliation.summary.varianceAmount || 0) === 0 ? '#166534' : '#b91c1c', fontSize: 12, marginTop: 2 }}>
                    Variance {formatCurrency(reconciliation.summary.varianceAmount)}
                  </Text>
                  <Text style={{ color: '#4338ca', fontSize: 12, marginTop: 2 }}>
                    {reconciliation.status === 'FINALIZED' ? 'Final' : 'Terbuka'} • unmatched statement {reconciliation.summary.unmatchedStatementEntryCount} • payment {reconciliation.summary.unmatchedPaymentCount} • refund {reconciliation.summary.unmatchedRefundCount}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Settlement Kas</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Review settlement kas dengan selisih sebelum final atau diteruskan ke Kepala Sekolah.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fff7ed',
                  borderColor: '#fed7aa',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{headTuPendingCashSessionApprovals.length} menunggu</Text>
              </View>
            </View>

            {headTuCashSessionApprovalsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil approval settlement kas..." />
            ) : headTuPendingCashSessionApprovals.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada settlement kas yang menunggu review.</Text>
            ) : (
              headTuPendingCashSessionApprovals.map((session) => (
                <View key={session.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{session.sessionNo}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {formatDate(session.businessDate)} • {session.openedBy?.name || '-'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Expected {formatCurrency(session.expectedClosingBalance)} • aktual {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
                  </Text>
                  <Text style={{ color: Number(session.varianceAmount || 0) === 0 ? '#166534' : '#b91c1c', fontSize: 12, marginTop: 3 }}>
                    Selisih {formatCurrency(session.varianceAmount || 0)}
                  </Text>
                  {session.closingNote ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{session.closingNote}</Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      disabled={headTuCashSessionDecisionMutation.isPending}
                      onPress={() => handleHeadTuCashSessionDecision(session, false)}
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
                      disabled={headTuCashSessionDecisionMutation.isPending}
                      onPress={() => handleHeadTuCashSessionDecision(session, true)}
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
                      <Text style={{ color: '#047857', fontWeight: '700' }}>Proses</Text>
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
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Write-Off</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Review pengajuan penghapusan piutang sebelum diteruskan ke Kepala Sekolah.
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fff7ed',
                  borderColor: '#fed7aa',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{headTuPendingWriteOffs.length} menunggu</Text>
              </View>
            </View>

            {headTuWriteOffsQuery.isLoading ? (
              <QueryStateView type="loading" message="Mengambil approval write-off..." />
            ) : headTuWriteOffsQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat approval write-off."
                onRetry={() => headTuWriteOffsQuery.refetch()}
              />
            ) : headTuPendingWriteOffs.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada approval write-off yang menunggu.</Text>
            ) : (
              headTuPendingWriteOffs.slice(0, 5).map((request) => (
                <View key={request.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 10 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{request.requestNo}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {request.student?.name || '-'} • {request.student?.studentClass?.name || '-'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Invoice {request.invoice?.invoiceNo || '-'} • outstanding{' '}
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {formatCurrency(request.invoice?.balanceAmount || 0)}
                    </Text>
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Permintaan{' '}
                    <Text style={{ color: '#b45309', fontWeight: '700' }}>
                      {formatCurrency(request.requestedAmount)}
                    </Text>
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{request.reason}</Text>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      disabled={headTuWriteOffDecisionMutation.isPending}
                      onPress={() => handleHeadTuWriteOffDecision(request, false)}
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
                      disabled={headTuWriteOffDecisionMutation.isPending}
                      onPress={() => handleHeadTuWriteOffDecision(request, true)}
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
                      <Text style={{ color: '#047857', fontWeight: '700' }}>Teruskan</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-head-tu-dashboard')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Dashboard TU</Text>
              </Pressable>
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-head-tu-finance')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Monitoring Keuangan</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-head-tu-letters')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Surat-Menyurat</Text>
              </Pressable>
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => openWebModule(router, 'staff-head-tu-exam-cards')}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#c7d6f5',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Kartu Ujian</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

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
