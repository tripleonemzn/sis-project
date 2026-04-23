import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { academicYearApi } from '../../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../../src/features/admin/adminApi';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { scaleWithAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

type SemesterOption = 'ODD' | 'EVEN' | '';

function formatScore(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

export default function PrincipalAcademicReportsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [semester, setSemester] = useState<SemesterOption>('');
  const [appliedFilters, setAppliedFilters] = useState<{ classId: number | null; semester: SemesterOption }>({
    classId: null,
    semester: '',
  });

  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-report-cards-active-year'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-principal-report-cards-classes', activeYearQuery.data?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL' && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
      });
      return result.items;
    },
  });

  const classOptions = useMemo(
    () =>
      (classesQuery.data || []).map((classItem) => ({
        value: String(classItem.id),
        label: classItem.major?.code ? `${classItem.name} (${classItem.major.code})` : classItem.name,
      })),
    [classesQuery.data],
  );

  const rankingQuery = useQuery({
    queryKey: [
      'mobile-principal-report-cards-rankings',
      user?.id,
      activeYearQuery.data?.id,
      appliedFilters.classId,
      appliedFilters.semester,
    ],
    enabled:
      isAuthenticated
      && user?.role === 'PRINCIPAL'
      && !!activeYearQuery.data?.id
      && !!appliedFilters.classId
      && !!appliedFilters.semester,
    queryFn: async () =>
      adminApi.getClassRankings({
        classId: Number(appliedFilters.classId),
        academicYearId: activeYearQuery.data?.id,
        semester: appliedFilters.semester as 'ODD' | 'EVEN',
      }),
  });

  const selectedClass = useMemo(
    () => (classesQuery.data || []).find((item) => item.id === selectedClassId) || null,
    [classesQuery.data, selectedClassId],
  );
  const appliedClass = useMemo(
    () => (classesQuery.data || []).find((item) => item.id === appliedFilters.classId) || null,
    [classesQuery.data, appliedFilters.classId],
  );
  const rankings = useMemo(
    () =>
      [...(rankingQuery.data?.rankings || [])].sort((a, b) => {
        const rankA = typeof a.rank === 'number' ? a.rank : Number.MAX_SAFE_INTEGER;
        const rankB = typeof b.rank === 'number' ? b.rank : Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
      }),
    [rankingQuery.data?.rankings],
  );
  const totalStudents = rankings.length;
  const topStudent = rankings[0] || null;
  const classAverage = useMemo(() => {
    if (!rankings.length) return null;
    const scores = rankings
      .map((row) => (typeof row.averageScore === 'number' ? row.averageScore : null))
      .filter((value): value is number => value !== null);
    if (!scores.length) return null;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }, [rankings]);

  const handleApplyFilters = () => {
    if (!selectedClassId) return;
    if (!semester) return;
    setAppliedFilters({ classId: selectedClassId, semester });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat rapor & ranking..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Rapor & Ranking</Text>
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
          refreshing={activeYearQuery.isFetching || classesQuery.isFetching || rankingQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            if (appliedFilters.classId && appliedFilters.semester) {
              void rankingQuery.refetch();
            }
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Rapor & Ranking
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan peringkat siswa per kelas berdasarkan nilai rapor.
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
        <MobileSelectField
          label="Kelas"
          value={selectedClassId ? String(selectedClassId) : ''}
          options={classOptions}
          onChange={(next) => setSelectedClassId(next ? Number(next) : null)}
          placeholder={classesQuery.isLoading ? 'Memuat kelas...' : 'Pilih kelas'}
          disabled={classesQuery.isLoading || !classOptions.length}
        />
        <View style={{ height: 12 }} />
        <MobileSelectField
          label="Semester"
          value={semester}
          options={[
            { value: 'ODD', label: 'Semester Ganjil' },
            { value: 'EVEN', label: 'Semester Genap' },
          ]}
          onChange={(next) => setSemester((next as SemesterOption) || '')}
          placeholder="Pilih semester"
        />
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 8 }}>
          Kepala sekolah melihat peringkat per semester, bukan leger detail.
        </Text>
        <Pressable
          onPress={handleApplyFilters}
          disabled={!selectedClassId || !semester || rankingQuery.isFetching}
          style={{
            marginTop: 12,
            backgroundColor: !selectedClassId || !semester || rankingQuery.isFetching ? '#93c5fd' : BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Terapkan Filter</Text>
        </Pressable>
      </View>

      {selectedClass ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16) }}>
            {selectedClass.name}
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • Wali Kelas: {selectedClass.teacher?.name || '-'}
          </Text>
        </View>
      ) : null}

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar kelas..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat daftar kelas." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError && !classOptions.length ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: '#cbd5e1',
            borderRadius: 12,
            padding: 18,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada kelas pada tahun ajaran aktif.</Text>
        </View>
      ) : null}

      {rankingQuery.isLoading ? <QueryStateView type="loading" message="Mengambil peringkat kelas..." /> : null}
      {rankingQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat ranking kelas." onRetry={() => rankingQuery.refetch()} />
      ) : null}

      {!rankingQuery.isLoading && !rankingQuery.isError ? (
        appliedFilters.classId && appliedFilters.semester ? (
          <>
            {rankings.length > 0 ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
                  <View style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <MobileSummaryCard
                      title="Siswa Berperingkat"
                      value={String(totalStudents)}
                      subtitle={appliedClass?.name || 'Kelas aktif'}
                      iconName="users"
                      accentColor="#2563eb"
                    />
                  </View>
                  <View style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <MobileSummaryCard
                      title="Rata-rata Kelas"
                      value={formatScore(classAverage)}
                      subtitle={appliedFilters.semester === 'ODD' ? 'Semester Ganjil' : 'Semester Genap'}
                      iconName="bar-chart-2"
                      accentColor="#059669"
                    />
                  </View>
                  <View style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <MobileSummaryCard
                      title="Peringkat 1"
                      value={topStudent?.student?.name || '-'}
                      subtitle={topStudent ? `Rata-rata ${formatScore(topStudent.averageScore)}` : 'Belum tersedia'}
                      iconName="award"
                      accentColor="#d97706"
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
                  }}
                >
                  {rankings.map((row, index) => (
                    <View
                      key={row.student?.id || `principal-ranking-${index}`}
                      style={{
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: index === rankings.length - 1 ? 0 : 8,
                        backgroundColor: row.rank === 1 ? '#fffbeb' : '#f8fafc',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                            #{row.rank || index + 1} {row.student?.name || '-'}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                            {row.student?.nisn || row.student?.nis || '-'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12) }}>Jumlah Nilai</Text>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatScore(row.totalScore)}</Text>
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', marginTop: 4 }}>
                            Rata-rata {formatScore(row.averageScore)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  padding: 18,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Belum ada data peringkat untuk filter ini.
                </Text>
              </View>
            )}
          </>
        ) : (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#cbd5e1',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Pilih kelas dan semester lalu klik Terapkan Filter untuk melihat peringkat.
            </Text>
          </View>
        )
      ) : null}
    </ScrollView>
  );
}
