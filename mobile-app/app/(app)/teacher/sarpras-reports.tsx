import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
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
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { sarprasApi } from '../../../src/features/sarpras/sarprasApi';
import { SarprasBudgetRequest, SarprasRoom } from '../../../src/features/sarpras/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type SarprasReportSection = 'RINGKASAN' | 'ASET' | 'ANGGARAN';
type SarprasReportSummaryId = 'coverage' | 'items' | 'budgets' | 'amounts';

const SECTION_ITEMS: Array<{
  key: SarprasReportSection;
  label: string;
  iconName: React.ComponentProps<typeof Feather>['name'];
}> = [
  { key: 'RINGKASAN', label: 'Ringkasan', iconName: 'grid' },
  { key: 'ASET', label: 'Aset', iconName: 'package' },
  { key: 'ANGGARAN', label: 'Anggaran', iconName: 'credit-card' },
];

function hasSarprasDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');
}

function formatNumber(value: number) {
  return Math.max(0, Number(value || 0)).toLocaleString('id-ID');
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

function statusStyle(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'APPROVED') return { text: '#15803d', border: '#86efac', bg: '#dcfce7', label: 'Disetujui' };
  if (normalized === 'REJECTED') return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2', label: 'Ditolak' };
  return { text: '#b45309', border: '#fcd34d', bg: '#fef3c7', label: 'Menunggu' };
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
    return {
      key: majorName ? `KAPROG|${majorName}` : 'KAPROG',
      label: majorName ? `Kepala Kompetensi ${majorName}` : 'Kepala Kompetensi',
    };
  }
  return {
    key: raw || 'LAINNYA',
    label: raw ? raw.replace(/_/g, ' ') : 'Lainnya',
  };
}

function resolveConditionLabel(room: SarprasRoom) {
  const normalized = (room.condition || '').toUpperCase();
  if (normalized === 'BAIK') return 'Baik';
  if (normalized === 'RUSAK_RINGAN') return 'Rusak Ringan';
  if (normalized === 'RUSAK_BERAT') return 'Rusak Berat';
  return 'Belum diisi';
}

export default function TeacherSarprasReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();

  const [section, setSection] = useState<SarprasReportSection>('RINGKASAN');
  const [activeSummaryId, setActiveSummaryId] = useState<SarprasReportSummaryId | null>(null);
  const [search, setSearch] = useState('');
  const headingTextStyle = useMemo(
    () => ({ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28) }),
    [scaleFont, scaleLineHeight],
  );
  const sectionTitleTextStyle = useMemo(
    () => ({ fontSize: scaleFont(16), lineHeight: scaleLineHeight(24) }),
    [scaleFont, scaleLineHeight],
  );
  const bodyTextStyle = useMemo(
    () => ({ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }),
    [scaleFont, scaleLineHeight],
  );
  const helperTextStyle = useMemo(
    () => ({ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }),
    [scaleFont, scaleLineHeight],
  );
  const inputTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );

  const isAllowed = user?.role === 'TEACHER' && hasSarprasDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-sarpras-reports-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const reportQuery = useQuery({
    queryKey: ['mobile-sarpras-reports-data', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => {
      const [categories, rooms, budgets] = await Promise.all([
        sarprasApi.listRoomCategories(),
        sarprasApi.listRooms(),
        sarprasApi.listBudgetApprovals({
          academicYearId: activeYearQuery.data?.id,
        }),
      ]);

      return {
        categories,
        rooms,
        budgets,
      };
    },
  });

  const categories = useMemo(() => reportQuery.data?.categories || [], [reportQuery.data?.categories]);
  const rooms = useMemo(() => reportQuery.data?.rooms || [], [reportQuery.data?.rooms]);
  const budgets = useMemo(() => reportQuery.data?.budgets || [], [reportQuery.data?.budgets]);
  const query = search.trim().toLowerCase();

  const roomSummary = useMemo(() => {
    const summary = {
      totalRooms: rooms.length,
      totalItems: 0,
      good: 0,
      minor: 0,
      major: 0,
      empty: 0,
    };

    for (const room of rooms) {
      summary.totalItems += Number(room._count?.items || 0);
      const condition = (room.condition || '').toUpperCase();
      if (condition === 'BAIK') summary.good += 1;
      else if (condition === 'RUSAK_RINGAN') summary.minor += 1;
      else if (condition === 'RUSAK_BERAT') summary.major += 1;
      else summary.empty += 1;
    }
    return summary;
  }, [rooms]);

  const categoryRows = useMemo(() => {
    return categories
      .map((category) => {
        const categoryRooms = rooms.filter((room) => room.categoryId === category.id);
        const itemsCount = categoryRooms.reduce((sum, room) => sum + Number(room._count?.items || 0), 0);
        const damagedCount = categoryRooms.filter((room) => {
          const condition = (room.condition || '').toUpperCase();
          return condition === 'RUSAK_RINGAN' || condition === 'RUSAK_BERAT';
        }).length;
        return {
          id: category.id,
          name: category.name,
          roomCount: categoryRooms.length,
          itemsCount,
          damagedCount,
        };
      })
      .sort((a, b) => b.itemsCount - a.itemsCount);
  }, [categories, rooms]);

  const filteredCategoryRows = useMemo(() => {
    if (!query) return categoryRows;
    return categoryRows.filter((row) => row.name.toLowerCase().includes(query));
  }, [categoryRows, query]);

  const topRoomRows = useMemo(() => {
    const mapped = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      location: room.location || '-',
      conditionLabel: resolveConditionLabel(room),
      itemCount: Number(room._count?.items || 0),
    }));
    return mapped.sort((a, b) => b.itemCount - a.itemCount).slice(0, 8);
  }, [rooms]);

  const budgetSummary = useMemo(() => {
    const summary = {
      total: budgets.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      totalAmount: 0,
      approvedAmount: 0,
      lpjReady: 0,
      waitingRealization: 0,
    };

    for (const budget of budgets) {
      const amount = Number(budget.totalAmount || 0);
      summary.totalAmount += amount;
      if (budget.status === 'PENDING') summary.pending += 1;
      if (budget.status === 'APPROVED') {
        summary.approved += 1;
        summary.approvedAmount += amount;
        if (budget.lpjSubmittedAt) summary.lpjReady += 1;
        if (!budget.realizationConfirmedAt) summary.waitingRealization += 1;
      }
      if (budget.status === 'REJECTED') summary.rejected += 1;
    }
    return summary;
  }, [budgets]);

  const dutyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        totalAmount: number;
      }
    >();

    for (const budget of budgets) {
      const duty = resolveDutyMeta(budget);
      if (!map.has(duty.key)) {
        map.set(duty.key, {
          label: duty.label,
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          totalAmount: 0,
        });
      }
      const row = map.get(duty.key)!;
      row.total += 1;
      row.totalAmount += Number(budget.totalAmount || 0);
      if (budget.status === 'PENDING') row.pending += 1;
      if (budget.status === 'APPROVED') row.approved += 1;
      if (budget.status === 'REJECTED') row.rejected += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [budgets]);

  const filteredDutyRows = useMemo(() => {
    if (!query) return dutyRows;
    return dutyRows.filter((row) => row.label.toLowerCase().includes(query));
  }, [dutyRows, query]);

  const latestBudgets = useMemo(() => {
    return [...budgets]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .filter((budget) => {
        if (!query) return true;
        const duty = resolveDutyMeta(budget);
        const haystacks = [budget.title || '', budget.requester?.name || '', duty.label];
        return haystacks.some((value) => value.toLowerCase().includes(query));
      });
  }, [budgets, query]);
  const summaryCards = useMemo<
    Array<{
      id: SarprasReportSummaryId;
      title: string;
      value: string;
      subtitle: string;
      iconName: React.ComponentProps<typeof Feather>['name'];
      accentColor: string;
    }>
  >(
    () => [
      {
        id: 'coverage',
        title: 'Kategori / Ruang',
        value: `${formatNumber(categories.length)} / ${formatNumber(roomSummary.totalRooms)}`,
        subtitle: 'Cakupan aset sekolah',
        iconName: 'layers',
        accentColor: '#8b5cf6',
      },
      {
        id: 'items',
        title: 'Total Item',
        value: formatNumber(roomSummary.totalItems),
        subtitle: 'Inventaris seluruh ruang',
        iconName: 'package',
        accentColor: '#f97316',
      },
      {
        id: 'budgets',
        title: 'Pengajuan',
        value: formatNumber(budgetSummary.total),
        subtitle: `${formatNumber(budgetSummary.pending)} menunggu proses`,
        iconName: 'file-text',
        accentColor: '#2563eb',
      },
      {
        id: 'amounts',
        title: 'Nominal',
        value: formatCurrency(budgetSummary.totalAmount),
        subtitle: `${formatCurrency(budgetSummary.approvedAmount)} disetujui`,
        iconName: 'credit-card',
        accentColor: '#0f766e',
      },
    ],
    [
      budgetSummary.approvedAmount,
      budgetSummary.pending,
      budgetSummary.total,
      budgetSummary.totalAmount,
      categories.length,
      roomSummary.totalItems,
      roomSummary.totalRooms,
    ],
  );
  const activeSummaryMeta = summaryCards.find((item) => item.id === activeSummaryId) || null;

  if (isLoading) return <AppLoadingScreen message="Memuat laporan sarpras..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8 }}>Laporan</Text>
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
          <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Laporan
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12, ...inputTextStyle }}>
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
          <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>Kembali ke Home</Text>
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
          refreshing={activeYearQuery.isFetching || reportQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void reportQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Laporan</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12, ...inputTextStyle }}>
        Ringkasan aset sekolah dan pengajuan anggaran sarpras
        {activeYearQuery.data?.name ? ` • ${activeYearQuery.data.name}` : ''}.
      </Text>

      <MobileMenuTabBar
        items={SECTION_ITEMS}
        activeKey={section}
        onChange={(key) => setSection(key as SarprasReportSection)}
        style={{ marginBottom: 10 }}
        contentContainerStyle={{ paddingRight: 8 }}
        minTabWidth={72}
        maxTabWidth={104}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari kategori, unit, atau judul pengajuan"
          placeholderTextColor="#8ea0bf"
          style={{
            flex: 1,
            paddingVertical: 11,
            paddingHorizontal: 9,
            color: BRAND_COLORS.textDark,
            ...inputTextStyle,
          }}
        />
      </View>

      {reportQuery.isLoading ? <QueryStateView type="loading" message="Memuat data laporan sarpras..." /> : null}
      {reportQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data laporan sarpras." onRetry={() => reportQuery.refetch()} />
      ) : null}

      {!reportQuery.isLoading && !reportQuery.isError ? (
        <>
          {section === 'RINGKASAN' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
                {summaryCards.map((item) => (
                  <View key={item.id} style={{ width: '48.5%', marginBottom: 8 }}>
                    <MobileSummaryCard
                      title={item.title}
                      value={item.value}
                      subtitle={item.subtitle}
                      iconName={item.iconName}
                      accentColor={item.accentColor}
                      onPress={() => setActiveSummaryId(item.id)}
                    />
                  </View>
                ))}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...sectionTitleTextStyle }}>Kondisi Ruangan</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {[
                    { label: 'Baik', value: roomSummary.good, bg: '#dcfce7', color: '#166534' },
                    { label: 'Rusak Ringan', value: roomSummary.minor, bg: '#fef3c7', color: '#92400e' },
                    { label: 'Rusak Berat', value: roomSummary.major, bg: '#fee2e2', color: '#991b1b' },
                    { label: 'Belum Diisi', value: roomSummary.empty, bg: '#e2e8f0', color: '#334155' },
                  ].map((segment) => (
                    <View key={segment.label} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <View
                        style={{
                          borderRadius: 10,
                          backgroundColor: segment.bg,
                          paddingVertical: 10,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: segment.color, fontWeight: '700', fontSize: scaleFont(18), lineHeight: scaleLineHeight(26) }}>
                          {formatNumber(segment.value)}
                        </Text>
                        <Text style={{ color: segment.color, ...bodyTextStyle }}>{segment.label}</Text>
                      </View>
                    </View>
                  ))}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...sectionTitleTextStyle }}>Progress Anggaran & LPJ</Text>
                <View style={{ gap: 8 }}>
                  {[
                    { label: 'Pending', value: budgetSummary.pending, color: '#b45309' },
                    { label: 'Disetujui', value: budgetSummary.approved, color: '#15803d' },
                    { label: 'Ditolak', value: budgetSummary.rejected, color: '#b91c1c' },
                    { label: 'LPJ Siap Audit', value: budgetSummary.lpjReady, color: '#1d4ed8' },
                    { label: 'Menunggu Realisasi', value: budgetSummary.waitingRealization, color: '#7c3aed' },
                  ].map((row) => (
                    <View
                      key={row.label}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        backgroundColor: '#f8fbff',
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', ...bodyTextStyle }}>{row.label}</Text>
                      <Text style={{ color: row.color, fontWeight: '700', ...bodyTextStyle }}>{formatNumber(row.value)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {section === 'ASET' ? (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...sectionTitleTextStyle }}>
                  Rekap Kategori Aset
                </Text>
                {filteredCategoryRows.length > 0 ? (
                  filteredCategoryRows.map((row) => (
                    <View
                      key={row.id}
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 10,
                        backgroundColor: '#f8fbff',
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>{row.name}</Text>
                      <Text style={{ color: '#64748b', marginTop: 2, ...bodyTextStyle }}>
                        Ruang: {formatNumber(row.roomCount)} • Item: {formatNumber(row.itemsCount)} • Kondisi perlu perhatian:{' '}
                        {formatNumber(row.damagedCount)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>Tidak ada kategori yang cocok dengan pencarian.</Text>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...sectionTitleTextStyle }}>
                  Ruang dengan Item Terbanyak
                </Text>
                {topRoomRows.length > 0 ? (
                  topRoomRows.map((row) => (
                    <View
                      key={row.id}
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 10,
                        backgroundColor: '#fff',
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>{row.name}</Text>
                      <Text style={{ color: '#64748b', marginTop: 2, ...bodyTextStyle }}>
                        {row.location} • Kondisi {row.conditionLabel}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.navy, marginTop: 2, fontWeight: '700', ...bodyTextStyle }}>
                        {formatNumber(row.itemCount)} item
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>Belum ada data ruang tersedia.</Text>
                )}
              </View>
            </>
          ) : null}

          {section === 'ANGGARAN' ? (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...sectionTitleTextStyle }}>
                  Rekap Unit Pengaju
                </Text>
                {filteredDutyRows.length > 0 ? (
                  filteredDutyRows.map((row) => (
                    <View
                      key={row.label}
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 10,
                        backgroundColor: '#f8fbff',
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>{row.label}</Text>
                      <Text style={{ color: '#64748b', marginTop: 2, ...bodyTextStyle }}>
                        Total: {formatNumber(row.total)} • Pending: {formatNumber(row.pending)} • Disetujui:{' '}
                        {formatNumber(row.approved)} • Ditolak: {formatNumber(row.rejected)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.navy, marginTop: 2, fontWeight: '700', ...bodyTextStyle }}>
                        Nominal: {formatCurrency(row.totalAmount)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>Tidak ada unit pengaju yang cocok dengan pencarian.</Text>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...sectionTitleTextStyle }}>
                  Pengajuan Terbaru
                </Text>
                {latestBudgets.length > 0 ? (
                  latestBudgets.map((budget) => {
                    const duty = resolveDutyMeta(budget);
                    const status = statusStyle(budget.status);
                    return (
                      <View
                        key={budget.id}
                        style={{
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 10,
                          backgroundColor: '#fff',
                          padding: 10,
                          marginBottom: 8,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 10,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>
                              {budget.title || 'Tanpa judul'}
                            </Text>
                            <Text style={{ color: '#64748b', marginTop: 2, ...bodyTextStyle }}>
                              {duty.label} • {budget.requester?.name || '-'}
                            </Text>
                            <Text style={{ color: '#475569', marginTop: 2, ...bodyTextStyle }}>
                              {formatCurrency(budget.totalAmount)} • {formatDate(budget.createdAt)}
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
                            <Text style={{ color: status.text, fontWeight: '700', ...helperTextStyle }}>{status.label}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>Belum ada data pengajuan anggaran.</Text>
                )}
              </View>
            </>
          ) : null}
        </>
      ) : null}
      <MobileDetailModal
        visible={Boolean(activeSummaryId && activeSummaryMeta)}
        title={activeSummaryMeta?.title || 'Ringkasan Sarpras'}
        subtitle={activeSummaryMeta?.subtitle}
        iconName={activeSummaryMeta?.iconName}
        accentColor={activeSummaryMeta?.accentColor}
        onClose={() => setActiveSummaryId(null)}
      >
        {activeSummaryId === 'coverage' ? (
          <View style={{ gap: 10 }}>
            <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, backgroundColor: '#f8fbff', padding: 12 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Kategori Aktif</Text>
              <Text style={{ color: '#8b5cf6', fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginTop: 4 }}>
                {formatNumber(categories.length)}
              </Text>
            </View>
            <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, backgroundColor: '#f8fbff', padding: 12 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Total Ruangan</Text>
              <Text style={{ color: '#16a34a', fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginTop: 4 }}>
                {formatNumber(roomSummary.totalRooms)}
              </Text>
            </View>
          </View>
        ) : null}

        {activeSummaryId === 'items' ? (
          <View style={{ gap: 10 }}>
            {[
              { label: 'Baik', value: roomSummary.good, color: '#166534', bg: '#dcfce7' },
              { label: 'Rusak Ringan', value: roomSummary.minor, color: '#92400e', bg: '#fef3c7' },
              { label: 'Rusak Berat', value: roomSummary.major, color: '#991b1b', bg: '#fee2e2' },
              { label: 'Belum Diisi', value: roomSummary.empty, color: '#334155', bg: '#e2e8f0' },
            ].map((item) => (
              <View
                key={`report-item-${item.label}`}
                style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, backgroundColor: item.bg, padding: 12 }}
              >
                <Text style={{ color: item.color, fontWeight: '700' }}>{item.label}</Text>
                <Text style={{ color: item.color, fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginTop: 4 }}>
                  {formatNumber(item.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {activeSummaryId === 'budgets' ? (
          <View style={{ gap: 10 }}>
            {[
              { label: 'Pending', value: budgetSummary.pending, color: '#b45309' },
              { label: 'Disetujui', value: budgetSummary.approved, color: '#15803d' },
              { label: 'Ditolak', value: budgetSummary.rejected, color: '#b91c1c' },
              { label: 'LPJ Siap Audit', value: budgetSummary.lpjReady, color: '#1d4ed8' },
              { label: 'Menunggu Realisasi', value: budgetSummary.waitingRealization, color: '#7c3aed' },
            ].map((item) => (
              <View
                key={`report-budget-${item.label}`}
                style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.label}</Text>
                <Text style={{ color: item.color, fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginTop: 4 }}>
                  {formatNumber(item.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {activeSummaryId === 'amounts' ? (
          <View style={{ gap: 10 }}>
            <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, backgroundColor: '#f8fbff', padding: 12 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Total Pengajuan</Text>
              <Text style={{ color: '#0f766e', fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginTop: 4 }}>
                {formatCurrency(budgetSummary.totalAmount)}
              </Text>
            </View>
            <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, backgroundColor: '#f8fbff', padding: 12 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Nominal Disetujui</Text>
              <Text style={{ color: '#2563eb', fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginTop: 4 }}>
                {formatCurrency(budgetSummary.approvedAmount)}
              </Text>
            </View>
          </View>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
