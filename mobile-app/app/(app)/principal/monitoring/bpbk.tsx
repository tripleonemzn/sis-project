import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { academicYearApi } from '../../../../src/features/academicYear/academicYearApi';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { principalApi } from '../../../../src/features/principal/principalApi';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

export default function PrincipalBpBkMonitoringScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS'>('ALL');

  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-bpbk-active-year'],
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

  const summaryQuery = useQuery({
    queryKey: ['mobile-principal-bpbk-monitoring', user?.id, activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => principalApi.getBpBkSummary({ academicYearId: activeYearQuery.data?.id }),
    staleTime: 60 * 1000,
  });

  const normalizedSearch = search.trim().toLowerCase();
  const highRiskStudents = useMemo(() => {
    const rows = summaryQuery.data?.highRiskStudents || [];
    if (!normalizedSearch) return rows;
    return rows.filter((row) => [row.studentName, row.nis || '', row.nisn || '', row.className || ''].some((item) => item.toLowerCase().includes(normalizedSearch)));
  }, [summaryQuery.data?.highRiskStudents, normalizedSearch]);
  const overdueCounselings = useMemo(() => {
    const rows = summaryQuery.data?.overdueCounselings || [];
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((row) => row.status === statusFilter);
    if (!normalizedSearch) return filtered;
    return filtered.filter((row) =>
      [row.student.name, row.student.nis || '', row.student.nisn || '', row.issueSummary || ''].some((item) =>
        item.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [summaryQuery.data?.overdueCounselings, statusFilter, normalizedSearch]);
  if (isLoading) return <AppLoadingScreen message="Memuat ringkasan BP/BK..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Ringkasan BP/BK</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  const summary = summaryQuery.data?.summary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || summaryQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void summaryQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Ringkasan BP/BK
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Monitoring risiko perilaku siswa dan tindak lanjut konseling lintas kelas.
      </Text>

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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Pencarian</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari siswa, NIS/NISN, atau ringkasan kasus..."
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
            marginBottom: 8,
          }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['ALL', 'OPEN', 'IN_PROGRESS'] as const).map((item) => {
            const active = statusFilter === item;
            return (
              <Pressable
                key={item}
                onPress={() => setStatusFilter(item)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                  backgroundColor: active ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
                  {item === 'ALL' ? 'Semua Status' : item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {summaryQuery.isLoading ? <QueryStateView type="loading" message="Memuat ringkasan BP/BK..." /> : null}
      {summaryQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat ringkasan BP/BK." onRetry={() => summaryQuery.refetch()} />
      ) : null}

      {summary ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            {[
              ['Siswa Risiko Tinggi', summary.highRiskStudents, `${summary.overdueCounselings} konseling overdue`, '#ddd6fe'],
              ['Konseling Aktif', summary.openCounselings + summary.inProgressCounselings, `${summary.closedCounselings} sudah ditutup`, '#bfdbfe'],
              ['Kasus Negatif', summary.negativeCases, `${summary.totalCases} total kasus`, '#fecaca'],
              ['Panggilan Ortu Pending', summary.summonPendingCounselings, 'Perlu koordinasi lanjutan', '#fde68a'],
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

          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Daftar Siswa Risiko Tinggi
            </Text>
            {highRiskStudents.length > 0 ? (
              highRiskStudents.map((row) => (
                <View
                  key={row.studentId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {row.className || '-'} • {row.nis || row.nisn || '-'}
                  </Text>
                  <Text style={{ color: '#7c3aed', fontSize: 12, marginTop: 4 }}>
                    {row.negativeCaseCount} kasus negatif • {row.totalNegativePoint} poin
                  </Text>
                </View>
              ))
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
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada siswa risiko tinggi untuk filter saat ini.</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Tindak Lanjut Konseling Overdue
            </Text>
            {overdueCounselings.length > 0 ? (
              overdueCounselings.map((row) => (
                <View
                  key={row.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.student.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {row.student.className || '-'} • {row.student.nis || row.student.nisn || '-'}
                  </Text>
                  <Text style={{ color: '#be123c', fontSize: 12, marginTop: 4 }}>
                    {row.status} • {row.issueSummary || 'Tanpa ringkasan'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                    Konselor: {row.counselor?.name || '-'}
                  </Text>
                </View>
              ))
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
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada konseling overdue untuk filter saat ini.</Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
