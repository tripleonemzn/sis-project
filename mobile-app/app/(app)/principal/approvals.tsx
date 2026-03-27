import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
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
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { principalApi } from '../../../src/features/principal/principalApi';
import { PrincipalBudgetRequest, PrincipalBudgetRequestStatus } from '../../../src/features/principal/types';
import { usePrincipalApprovalsQuery } from '../../../src/features/principal/usePrincipalApprovalsQuery';
import {
  staffFinanceApi,
  type StaffFinanceCashSession,
  type StaffFinancePaymentReversalRequest,
  type StaffFinanceWriteOffRequest,
} from '../../../src/features/staff/staffFinanceApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

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

export default function PrincipalApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
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

  const approvals = useMemo(() => approvalsQuery.data?.approvals || [], [approvalsQuery.data?.approvals]);
  const financeCashSessions = useMemo(() => cashSessionsQuery.data?.sessions || [], [cashSessionsQuery.data]);
  const pendingCashSessionApprovals = useMemo(() => cashSessionApprovalsQuery.data?.sessions || [], [cashSessionApprovalsQuery.data]);
  const financeCashSummary = cashSessionsQuery.data?.summary;
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Persetujuan Anggaran</Text>
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
            (cashSessionApprovalsQuery.isFetching && !cashSessionApprovalsQuery.isLoading)
          }
          onRefresh={() => {
            void approvalsQuery.refetch();
            void writeOffsQuery.refetch();
            void paymentReversalsQuery.refetch();
            void cashSessionsQuery.refetch();
            void cashSessionApprovalsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Persetujuan Anggaran</Text>
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

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
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
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15, flex: 1, paddingRight: 8 }}>
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
                    <Text style={{ color: statusColor(item.status), fontWeight: '700', fontSize: 11 }}>{STATUS_LABEL[item.status]}</Text>
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
                    <Text style={{ color: '#991b1b', fontSize: 12 }}>{item.rejectionReason}</Text>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Settlement Kas Harian</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
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
            <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>{financeCashSummary?.openCount || 0} terbuka</Text>
          </View>
        </View>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
          Pending Head TU {financeCashSummary?.pendingHeadTuCount || 0} • pending Kepsek {financeCashSummary?.pendingPrincipalCount || 0}
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
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  {new Date(session.businessDate).toLocaleDateString('id-ID')} • {session.openedBy?.name || '-'} • {session.status === 'OPEN' ? 'Masih dibuka' : 'Sudah ditutup'}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  Expected {formatCurrency(session.expectedClosingBalance)} • aktual {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
                </Text>
                {session.varianceAmount != null ? (
                  <Text style={{ color: Number(session.varianceAmount) === 0 ? '#166534' : '#b91c1c', fontSize: 12, marginTop: 3 }}>
                    Selisih {formatCurrency(session.varianceAmount)}
                  </Text>
                ) : null}
                <Text style={{ color: '#1d4ed8', fontSize: 12, marginTop: 3 }}>
                  {session.approvalStatus === 'PENDING_PRINCIPAL'
                    ? 'Menunggu Kepala Sekolah'
                    : session.approvalStatus === 'PENDING_HEAD_TU'
                      ? 'Menunggu Head TU'
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Approval Settlement Kas</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
              Review settlement kas yang sudah lolos Head TU dan masuk ambang eskalasi Kepala Sekolah.
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
            <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>{pendingCashSessionApprovals.length} menunggu</Text>
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
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                {new Date(session.businessDate).toLocaleDateString('id-ID')} • {session.openedBy?.name || '-'}
              </Text>
              <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                Expected {formatCurrency(session.expectedClosingBalance)} • aktual {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
              </Text>
              <Text style={{ color: Number(session.varianceAmount || 0) === 0 ? '#166534' : '#b91c1c', fontSize: 12, marginTop: 3 }}>
                Selisih {formatCurrency(session.varianceAmount || 0)}
              </Text>
              {session.headTuDecision.note ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  Review Head TU: {session.headTuDecision.note}
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
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
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
            <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>{pendingWriteOffs.length} menunggu</Text>
          </View>
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
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
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  {item.student?.name || '-'} • {item.student?.studentClass?.name || '-'}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  Invoice {item.invoice?.invoiceNo || '-'} • outstanding{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {formatCurrency(item.invoice?.balanceAmount || 0)}
                  </Text>
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  Diminta {formatCurrency(item.requestedAmount)} • rekomendasi{' '}
                  <Text style={{ color: '#047857', fontWeight: '700' }}>
                    {formatCurrency(Number(item.approvedAmount || item.requestedAmount || 0))}
                  </Text>
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{item.reason}</Text>

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
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
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
            <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>{pendingPaymentReversals.length} menunggu</Text>
          </View>
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
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
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  {item.student?.name || '-'} • {item.student?.studentClass?.name || '-'}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  Pembayaran {item.payment?.paymentNo || '-'} • invoice {item.invoice?.invoiceNo || '-'}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  Diminta {formatCurrency(item.requestedAmount)} • alokasi {formatCurrency(Number(item.approvedAllocatedAmount || item.requestedAllocatedAmount || 0))}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  Kredit {formatCurrency(Number(item.approvedCreditedAmount || item.requestedCreditedAmount || 0))}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>{item.reason}</Text>

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
