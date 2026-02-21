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
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useStaffPaymentsQuery } from '../../../src/features/staff/useStaffPaymentsQuery';
import { staffApi } from '../../../src/features/staff/staffApi';
import { StaffBudgetRequest, StaffBudgetStatus } from '../../../src/features/staff/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type FilterStatus = 'ALL' | StaffBudgetStatus;

const STATUS_LABEL: Record<FilterStatus, string> = {
  ALL: 'Semua',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

function getStageLabel(item: StaffBudgetRequest) {
  if (item.status === 'REJECTED') return 'Ditolak Kepala Sekolah';
  if (item.status === 'APPROVED' && !item.realizationConfirmedAt) return 'Menunggu konfirmasi realisasi';
  if (item.realizationConfirmedAt && !item.lpjSubmittedAt) return 'Menunggu LPJ pengaju';
  if (item.realizationConfirmedAt && item.lpjSubmittedAt) return 'Selesai (LPJ diterima)';
  return 'Menunggu persetujuan';
}

function getStatusColor(status: StaffBudgetStatus) {
  if (status === 'APPROVED') return '#15803d';
  if (status === 'REJECTED') return '#b91c1c';
  return '#b45309';
}

export default function StaffPaymentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const paymentsQuery = useStaffPaymentsQuery({ enabled: isAuthenticated, user });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');

  const confirmMutation = useMutation({
    mutationFn: (budgetId: number) => staffApi.confirmBudgetRealization(budgetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-payments', user?.id] });
      void paymentsQuery.refetch();
      notifySuccess('Realisasi anggaran berhasil dikonfirmasi.');
    },
    onError: (error: any) => {
      notifyApiError(error, 'Gagal mengkonfirmasi realisasi.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat pembayaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STAFF') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Pembayaran SPP</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role staff." />
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

  const budgets = paymentsQuery.data?.budgets || [];
  const filteredBudgets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return budgets.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!query) return true;
      const haystacks = [
        item.title || '',
        item.description || '',
        item.additionalDuty || '',
        item.requester?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [budgets, search, statusFilter]);

  const totalAmount = filteredBudgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={paymentsQuery.isFetching && !paymentsQuery.isLoading}
          onRefresh={() => paymentsQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Pembayaran SPP</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Konfirmasi realisasi pengajuan anggaran
        {paymentsQuery.data?.activeYear?.name ? ` tahun ${paymentsQuery.data.activeYear.name}` : ''}.
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#d6e2f7',
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
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari judul, pengaju, atau unit"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 8,
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
          Total nominal: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rp {totalAmount.toLocaleString('id-ID')}</Text>
        </Text>
      </View>

      {paymentsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data pembayaran..." /> : null}
      {paymentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data pembayaran." onRetry={() => paymentsQuery.refetch()} />
      ) : null}
      {paymentsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={paymentsQuery.data.cachedAt} /> : null}

      {!paymentsQuery.isLoading && !paymentsQuery.isError ? (
        filteredBudgets.length > 0 ? (
          <View>
            {filteredBudgets.map((item) => {
              const canConfirm = item.status === 'APPROVED' && !item.realizationConfirmedAt;
              return (
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
                      <Text style={{ color: getStatusColor(item.status), fontWeight: '700', fontSize: 11 }}>{STATUS_LABEL[item.status]}</Text>
                    </View>
                  </View>

                  <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6 }}>{item.description || '-'}</Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Pengaju: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.requester?.name || '-'}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Unit: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.additionalDuty?.replace(/_/g, ' ') || '-'}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Tahap: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{getStageLabel(item)}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 8 }}>
                    Total: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Rp {Number(item.totalAmount || 0).toLocaleString('id-ID')}</Text>
                  </Text>

                  {canConfirm ? (
                    <Pressable
                      disabled={confirmMutation.isPending}
                      onPress={() => {
                        Alert.alert(
                          'Konfirmasi Realisasi',
                          `Konfirmasi realisasi untuk "${item.title}"?`,
                          [
                            { text: 'Batal', style: 'cancel' },
                            {
                              text: 'Konfirmasi',
                              style: 'default',
                              onPress: () => confirmMutation.mutate(item.id),
                            },
                          ],
                        );
                      }}
                      style={{
                        backgroundColor: confirmMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                        borderRadius: 9,
                        alignItems: 'center',
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {confirmMutation.isPending ? 'Memproses...' : 'Konfirmasi Realisasi'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
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
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data pembayaran sesuai filter saat ini.</Text>
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
