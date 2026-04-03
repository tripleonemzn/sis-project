import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useParentChildrenQuery } from '../../../src/features/parent/useParentChildrenQuery';
import { useParentFinanceOverviewQuery } from '../../../src/features/parent/useParentFinanceOverviewQuery';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function ParentOverviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const childrenQuery = useParentChildrenQuery({ enabled: isAuthenticated, user });
  const financeQuery = useParentFinanceOverviewQuery({ enabled: isAuthenticated, user, childId: null, limit: 20 });

  const children = childrenQuery.data?.children || [];
  const summary = financeQuery.data?.overview.summary;
  const topPendingChildren = useMemo(() => {
    const rows = financeQuery.data?.overview.children || [];
    return [...rows]
      .sort((a, b) => Number(b.summary.status.pendingAmount || 0) - Number(a.summary.status.pendingAmount || 0))
      .slice(0, 5);
  }, [financeQuery.data?.overview.children]);

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard orang tua..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PARENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Dashboard Orang Tua</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role orang tua." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={(childrenQuery.isFetching || financeQuery.isFetching) && !childrenQuery.isLoading}
          onRefresh={() => {
            void childrenQuery.refetch();
            void financeQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>Dashboard Orang Tua</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan anak, keuangan, dan akses cepat modul parent.
      </Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Jumlah Anak"
            value={String(summary?.childCount || children.length)}
            subtitle="Terhubung ke akun ini"
            iconName="users"
            accentColor="#2563eb"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Total Transaksi"
            value={String(summary?.totalRecords || 0)}
            subtitle="Riwayat pembayaran"
            iconName="repeat"
            accentColor="#0f766e"
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Sudah Dibayar"
            value={formatCurrency(summary?.paidAmount || 0)}
            subtitle="Nominal terbayar"
            iconName="check-circle"
            accentColor="#16a34a"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Belum Lunas"
            value={formatCurrency(Number(summary?.pendingAmount || 0) + Number(summary?.partialAmount || 0))}
            subtitle="Pending + parsial"
            iconName="alert-circle"
            accentColor="#f59e0b"
          />
        </View>
      </View>

      {(childrenQuery.isLoading || financeQuery.isLoading) ? (
        <QueryStateView type="loading" message="Sinkronisasi dashboard parent..." />
      ) : null}
      {(childrenQuery.isError || financeQuery.isError) ? (
        <QueryStateView type="error" message="Gagal memuat dashboard parent." onRetry={() => {
          void childrenQuery.refetch();
          void financeQuery.refetch();
        }} />
      ) : null}
      {childrenQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={childrenQuery.data.cachedAt} /> : null}
      {financeQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={financeQuery.data.cachedAt} /> : null}

      {!childrenQuery.isLoading && !financeQuery.isLoading && !childrenQuery.isError && !financeQuery.isError ? (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Daftar Anak</Text>
            {children.length > 0 ? (
              children.map((child) => (
                <View key={child.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{child.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {child.studentClass?.name || '-'} • NISN: {child.nisn || '-'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data anak yang terhubung.</Text>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Anak Dengan Tunggakan Tertinggi</Text>
            {topPendingChildren.length > 0 ? (
              topPendingChildren.map((row) => (
                <View key={row.student.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.student.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    Pending: {formatCurrency(row.summary.status.pendingAmount + row.summary.status.partialAmount)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada tunggakan pada data saat ini.</Text>
            )}
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
        <View style={{ width: '50%', paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => router.push('/parent/children' as never)}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#c7d6f5',
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Data Anak</Text>
          </Pressable>
        </View>

        <View style={{ width: '50%', paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => router.push('/parent/finance' as never)}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#c7d6f5',
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Keuangan</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
        <View style={{ width: '50%', paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => router.push('/parent/attendance' as never)}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#c7d6f5',
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Absensi Anak</Text>
          </Pressable>
        </View>

        <View style={{ width: '50%', paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => router.replace('/home')}
            style={{
              backgroundColor: BRAND_COLORS.blue,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali Home</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
