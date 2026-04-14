import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { academicYearApi } from '../../../../src/features/academicYear/academicYearApi';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { osisApi } from '../../../../src/features/osis/osisApi';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

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

export default function PrincipalMonitoringOsisScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-osis-active-year'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const periodsQuery = useQuery({
    queryKey: ['mobile-principal-osis-periods', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => osisApi.getPeriods({ academicYearId: activeYearQuery.data?.id }),
    staleTime: 60 * 1000,
  });

  const managementPeriodsQuery = useQuery({
    queryKey: ['mobile-principal-osis-management-periods', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => osisApi.getManagementPeriods({ academicYearId: activeYearQuery.data?.id }),
    staleTime: 60 * 1000,
  });

  const readinessQuery = useQuery({
    queryKey: ['mobile-principal-osis-readiness', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => osisApi.getWorkProgramReadiness(activeYearQuery.data?.id),
    staleTime: 60 * 1000,
  });

  const periods = useMemo(() => periodsQuery.data || [], [periodsQuery.data]);
  const effectiveSelectedPeriodId = useMemo(() => {
    if (selectedPeriodId && periods.some((period) => period.id === selectedPeriodId)) {
      return selectedPeriodId;
    }
    return periods[0]?.id || null;
  }, [periods, selectedPeriodId]);
  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === effectiveSelectedPeriodId) || null,
    [effectiveSelectedPeriodId, periods],
  );

  const quickCountQuery = useQuery({
    queryKey: ['mobile-principal-osis-quick-count', selectedPeriod?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL' && !!selectedPeriod?.id,
    queryFn: () => osisApi.getQuickCount(selectedPeriod!.id),
    staleTime: 60 * 1000,
  });

  const stats = useMemo(() => {
    const totalPeriods = periods.length;
    const activePeriods = periods.filter((period) => period.status === 'PUBLISHED').length;
    const totalCandidates = selectedPeriod?.candidates?.filter((candidate) => candidate.isActive).length || 0;
    const totalVotes = quickCountQuery.data?.totalVotes || selectedPeriod?._count?.votes || 0;
    return { totalPeriods, activePeriods, totalCandidates, totalVotes };
  }, [periods, quickCountQuery.data, selectedPeriod]);

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring OSIS..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Pemilihan OSIS</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            periodsQuery.isFetching ||
            readinessQuery.isFetching ||
            quickCountQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void periodsQuery.refetch();
            void managementPeriodsQuery.refetch();
            void readinessQuery.refetch();
            void quickCountQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Pemilihan OSIS
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Monitoring periode pemilihan, quick count, dan kesiapan transisi kepengurusan OSIS.
      </Text>

      {(periodsQuery.isLoading || readinessQuery.isLoading) && !periods.length ? (
        <QueryStateView type="loading" message="Memuat monitoring pemilihan OSIS..." />
      ) : null}
      {periodsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat periode pemilihan OSIS." onRetry={() => periodsQuery.refetch()} />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {[
          ['Total Periode', stats.totalPeriods, 'Periode pemilihan tercatat', '#bfdbfe'],
          ['Periode Aktif', stats.activePeriods, 'Status PUBLISHED', '#bbf7d0'],
          ['Calon Aktif', stats.totalCandidates, 'Kandidat pada periode terpilih', '#fde68a'],
          ['Total Suara', stats.totalVotes, 'Quick count saat ini', '#ddd6fe'],
        ].map(([title, value, subtitle, accent]) => (
          <View key={String(title)} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: String(accent),
                borderRadius: 10,
                padding: 10,
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 11 }}>{String(title)}</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 5 }}>{Number(value)}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 4 }}>{String(subtitle)}</Text>
            </View>
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Periode Pemilihan</Text>
        {periods.length > 0 ? (
          periods.map((period) => {
            const active = selectedPeriod?.id === period.id;
            return (
              <Pressable
                key={period.id}
                onPress={() => setSelectedPeriodId(period.id)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? BRAND_COLORS.blue : '#dbe7fb',
                  backgroundColor: active ? '#eef5ff' : '#fff',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{period.title || `Periode #${period.id}`}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  {formatDateTime(period.startAt)} - {formatDateTime(period.endAt)}
                </Text>
                <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                  Status {period.status || '-'}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada periode pemilihan OSIS.</Text>
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Kesiapan Program Kerja OSIS</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
          {readinessQuery.data?.message || 'Belum ada status kesiapan program kerja OSIS.'}
        </Text>
        {readinessQuery.data?.activeManagementPeriod ? (
          <Text style={{ color: BRAND_COLORS.textDark, fontSize: 12, marginTop: 6 }}>
            Periode aktif: {readinessQuery.data.activeManagementPeriod.title}
          </Text>
        ) : null}
        {readinessQuery.data?.latestClosedElection ? (
          <Text style={{ color: BRAND_COLORS.textDark, fontSize: 12, marginTop: 4 }}>
            Pemilihan terakhir: {readinessQuery.data.latestClosedElection.title}
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ringkasan Kepengurusan</Text>
        {(managementPeriodsQuery.data || []).length > 0 ? (
          (managementPeriodsQuery.data || []).slice(0, 4).map((period) => (
            <View
              key={period.id}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 10,
                padding: 12,
                marginBottom: 8,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{period.title}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                {period.status} • Divisi {period._count?.divisions || 0} • Posisi {period._count?.positions || 0}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada periode kepengurusan yang tercatat.</Text>
        )}
      </View>

      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
          Kandidat & Quick Count
        </Text>
        {selectedPeriod?.candidates && selectedPeriod.candidates.length > 0 ? (
          selectedPeriod.candidates
            .filter((candidate) => candidate.isActive)
            .sort((a, b) => a.candidateNumber - b.candidateNumber)
            .map((candidate) => {
              const quickCount = quickCountQuery.data?.candidates.find((row) => row.id === candidate.id);
              return (
                <View
                  key={candidate.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    No. {candidate.candidateNumber} • {candidate.student.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {candidate.student.studentClass?.name || '-'} • {candidate.student.nis || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                    {candidate.vision || 'Belum ada visi yang dicatat.'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12, marginTop: 6 }}>
                    {quickCount ? `${quickCount.votes} suara • ${quickCount.percentage}%` : 'Quick count belum tersedia'}
                  </Text>
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
              padding: 14,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada kandidat aktif pada periode terpilih.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
