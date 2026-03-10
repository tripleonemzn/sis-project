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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { principalApi } from '../../../src/features/principal/principalApi';
import { PrincipalBudgetRequest, PrincipalBudgetRequestStatus } from '../../../src/features/principal/types';
import { usePrincipalApprovalsQuery } from '../../../src/features/principal/usePrincipalApprovalsQuery';
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

export default function PrincipalApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const approvalsQuery = usePrincipalApprovalsQuery({ enabled: isAuthenticated, user });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');

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

  const approvals = useMemo(() => approvalsQuery.data?.approvals || [], [approvalsQuery.data?.approvals]);
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={approvalsQuery.isFetching && !approvalsQuery.isLoading}
          onRefresh={() => approvalsQuery.refetch()}
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
