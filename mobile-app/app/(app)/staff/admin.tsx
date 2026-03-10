import { useMemo } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { staffApi } from '../../../src/features/staff/staffApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

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

export default function StaffAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const dataQuery = useQuery({
    queryKey: ['mobile-staff-admin-overview', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF',
    queryFn: async () => {
      const [budgets, students] = await Promise.all([staffApi.listBudgetRequests(), staffApi.listStudents()]);
      return { budgets, students };
    },
  });

  const budgets = useMemo(() => dataQuery.data?.budgets || [], [dataQuery.data?.budgets]);
  const students = useMemo(() => dataQuery.data?.students || [], [dataQuery.data?.students]);

  const summary = useMemo(() => {
    const pending = budgets.filter((item) => item.status === 'PENDING').length;
    const approved = budgets.filter((item) => item.status === 'APPROVED').length;
    const rejected = budgets.filter((item) => item.status === 'REJECTED').length;
    const totalAmount = budgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

    return {
      pending,
      approved,
      rejected,
      totalAmount,
    };
  }, [budgets]);

  const recentPendingBudgets = budgets
    .filter((item) => item.status === 'PENDING')
    .slice(0, 6);

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl refreshing={dataQuery.isFetching && !dataQuery.isLoading} onRefresh={() => dataQuery.refetch()} />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>Administrasi Staff</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan proses administrasi: pengajuan anggaran dan data siswa.
      </Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard title="Data Siswa" value={String(students.length)} subtitle="Total siswa terdaftar" />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard title="Pengajuan" value={String(budgets.length)} subtitle="Total pengajuan anggaran" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard title="Menunggu" value={String(summary.pending)} subtitle="Belum diproses" />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title="Total Nominal"
            value={`Rp ${summary.totalAmount.toLocaleString('id-ID')}`}
            subtitle="Akumulasi seluruh pengajuan"
          />
        </View>
      </View>

      {dataQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data administrasi..." /> : null}
      {dataQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data administrasi." onRetry={() => dataQuery.refetch()} />
      ) : null}

      {!dataQuery.isLoading && !dataQuery.isError ? (
        <>
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
              Menunggu: <Text style={{ color: '#b45309', fontWeight: '700' }}>{summary.pending}</Text>
            </Text>
            <Text style={{ color: '#475569', marginBottom: 3 }}>
              Disetujui: <Text style={{ color: '#15803d', fontWeight: '700' }}>{summary.approved}</Text>
            </Text>
            <Text style={{ color: '#475569' }}>
              Ditolak: <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{summary.rejected}</Text>
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

            {recentPendingBudgets.length > 0 ? (
              recentPendingBudgets.map((item) => (
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
        </>
      ) : null}

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
