import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import { AttendanceRecapPayload } from '../../../src/features/attendanceRecap/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { offlineCache } from '../../../src/lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_TTL_MS } from '../../../src/config/cache';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type SemesterFilter = 'ALL' | 'ODD' | 'EVEN';

export default function PrincipalAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [semester, setSemester] = useState<SemesterFilter>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{ classId: number | null; semester: SemesterFilter }>({
    classId: null,
    semester: 'ALL',
  });
  const [search, setSearch] = useState('');
  const [summaryDetailVisible, setSummaryDetailVisible] = useState(false);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-attendance-active-year'],
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
    queryKey: ['mobile-principal-attendance-classes', activeYearQuery.data?.id],
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

  const classItems = classesQuery.data || [];
  const classSelectOptions = useMemo(
    () =>
      classItems.map((classItem) => ({
        value: String(classItem.id),
        label: classItem.major?.code ? `${classItem.name} • ${classItem.major.code}` : classItem.name,
      })),
    [classItems],
  );

  const recapQuery = useQuery({
    queryKey: ['mobile-principal-attendance-recap', user?.id, appliedFilters.classId, activeYearQuery.data?.id, appliedFilters.semester],
    enabled:
      isAuthenticated
      && user?.role === 'PRINCIPAL'
      && !!appliedFilters.classId
      && !!activeYearQuery.data?.id,
    queryFn: async (): Promise<{ payload: AttendanceRecapPayload; fromCache: boolean; cachedAt: string | null }> => {
      const cacheKey = `mobile_cache_principal_attendance_${user!.id}_${appliedFilters.classId}_${activeYearQuery.data?.id || 0}_${appliedFilters.semester}`;
      try {
        const payload = await attendanceRecapApi.getDailyRecap({
          classId: Number(appliedFilters.classId),
          academicYearId: activeYearQuery.data?.id,
          semester: appliedFilters.semester,
        });
        const cache = await offlineCache.set(cacheKey, payload);
        await offlineCache.prunePrefix(
          `mobile_cache_principal_attendance_${user!.id}_`,
          Math.max(1, CACHE_MAX_SNAPSHOTS_PER_FEATURE),
        );
        return { payload, fromCache: false, cachedAt: cache.updatedAt };
      } catch (error) {
        const cache = await offlineCache.get<AttendanceRecapPayload>(cacheKey, { maxAgeMs: CACHE_TTL_MS });
        if (cache) {
          return { payload: cache.data, fromCache: true, cachedAt: cache.updatedAt };
        }
        throw error;
      }
    },
  });

  const appliedClass = classItems.find((item) => item.id === appliedFilters.classId) || null;
  const recapRows = useMemo(() => recapQuery.data?.payload?.recap || [], [recapQuery.data?.payload?.recap]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recapRows;
    return recapRows.filter((row) => {
      const haystacks = [row.student.name || '', row.student.nis || '', row.student.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [recapRows, search]);

  const summary = useMemo(() => {
    if (!filteredRows.length) {
      return {
        avgAttendance: 0,
        totalAbsent: 0,
        totalLate: 0,
      };
    }
    const avgAttendance =
      filteredRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / filteredRows.length;
    const totalAbsent = filteredRows.reduce((sum, row) => sum + Number(row.absent || 0), 0);
    const totalLate = filteredRows.reduce((sum, row) => sum + Number(row.late || 0), 0);
    return {
      avgAttendance,
      totalAbsent,
      totalLate,
    };
  }, [filteredRows]);

  const handleApplyFilters = () => {
    if (!selectedClassId) return;
    setAppliedFilters({ classId: selectedClassId, semester });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat rekap absensi..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Rekap Absensi</Text>
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

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pagePadding}
        refreshControl={
          <RefreshControl
            refreshing={activeYearQuery.isFetching || classesQuery.isFetching || recapQuery.isFetching}
            onRefresh={() => {
              void activeYearQuery.refetch();
              void classesQuery.refetch();
              if (appliedFilters.classId) {
                void recapQuery.refetch();
              }
            }}
          />
        }
      >
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Rekap Absensi
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Lihat rekap kehadiran harian per kelas, termasuk catatan keterlambatan.
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
            options={classSelectOptions}
            onChange={(next) => setSelectedClassId(next ? Number(next) : null)}
            placeholder={classesQuery.isLoading ? 'Memuat kelas...' : 'Pilih kelas'}
            disabled={classesQuery.isLoading || !classSelectOptions.length}
          />
          <View style={{ height: 12 }} />
          <MobileSelectField
            label="Periode"
            value={semester}
            options={[
              { value: 'ALL', label: 'Satu Tahun Penuh' },
              { value: 'ODD', label: 'Semester Ganjil' },
              { value: 'EVEN', label: 'Semester Genap' },
            ]}
            onChange={(next) => setSemester((next as SemesterFilter) || 'ALL')}
            placeholder="Pilih periode"
          />
          <Pressable
            onPress={handleApplyFilters}
            disabled={!selectedClassId || recapQuery.isFetching}
            style={{
              marginTop: 12,
              backgroundColor: !selectedClassId || recapQuery.isFetching ? '#93c5fd' : BRAND_COLORS.blue,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Terapkan Filter</Text>
          </Pressable>
        </View>

        {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar kelas..." /> : null}
        {classesQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat daftar kelas." onRetry={() => classesQuery.refetch()} />
        ) : null}

        {!classesQuery.isLoading && !classesQuery.isError ? (
          classItems.length > 0 ? null : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 16,
                backgroundColor: '#fff',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada kelas pada tahun ajaran aktif.</Text>
            </View>
          )
        ) : null}

        {appliedClass ? (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16) }}>{appliedClass.name}</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
              {appliedClass.major?.name || '-'} • Wali: {appliedClass.teacher?.name || '-'}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 999,
            paddingHorizontal: 12,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama siswa / NIS / NISN"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        {recapQuery.isLoading ? <QueryStateView type="loading" message="Mengambil rekap absensi..." /> : null}
        {recapQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat rekap absensi." onRetry={() => recapQuery.refetch()} />
        ) : null}
        {recapQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={recapQuery.data.cachedAt} /> : null}

        {!recapQuery.isLoading && !recapQuery.isError ? (
          appliedFilters.classId ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
                <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <MobileSummaryCard
                    title="Rata-rata Kehadiran"
                    value={`${summary.avgAttendance.toFixed(1)}%`}
                    subtitle="Siswa sesuai filter"
                    iconName="bar-chart-2"
                    accentColor="#2563eb"
                    onPress={() => setSummaryDetailVisible(true)}
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <MobileSummaryCard
                    title="Total Alpha"
                    value={`${summary.totalAbsent}`}
                    subtitle="Akumulasi ketidakhadiran"
                    iconName="x-circle"
                    accentColor="#dc2626"
                    onPress={() => setSummaryDetailVisible(true)}
                  />
                </View>
                <View style={{ width: '100%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <MobileSummaryCard
                    title="Total Terlambat"
                    value={`${summary.totalLate}`}
                    subtitle="Masih dihitung hadir"
                    iconName="clock"
                    accentColor="#d97706"
                    onPress={() => setSummaryDetailVisible(true)}
                  />
                </View>
              </View>

              {filteredRows.length > 0 ? (
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  {filteredRows.map((row, index) => (
                    <View
                      key={row.student.id}
                      style={{
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: index === filteredRows.length - 1 ? 0 : 8,
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.student.name}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                            NIS {row.student.nis || '-'} • NISN {row.student.nisn || '-'}
                          </Text>
                        </View>
                        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>{Number(row.percentage || 0).toFixed(1)}%</Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                        {[
                          { label: 'Hadir', value: row.present + row.late, color: '#166534', bg: '#dcfce7' },
                          { label: 'Telat', value: row.late, color: '#9a3412', bg: '#ffedd5' },
                          { label: 'Sakit', value: row.sick, color: '#854d0e', bg: '#fef3c7' },
                          { label: 'Izin', value: row.permission, color: '#1d4ed8', bg: '#dbeafe' },
                          { label: 'Alpha', value: row.absent, color: '#b91c1c', bg: '#fee2e2' },
                        ].map((item) => (
                          <View key={`${row.student.id}-${item.label}`} style={{ width: '33.33%', paddingRight: 6, marginBottom: 6 }}>
                            <View
                              style={{
                                backgroundColor: item.bg,
                                borderRadius: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 8,
                              }}
                            >
                              <Text style={{ color: item.color, fontWeight: '700' }}>{item.value}</Text>
                              <Text style={{ color: item.color, fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>{item.label}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
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
                    {recapRows.length > 0
                      ? 'Tidak ada siswa yang cocok dengan pencarian ini.'
                      : 'Belum ada data absensi untuk filter ini.'}
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
                Pilih kelas lalu klik Terapkan Filter untuk melihat rekap.
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>

      <MobileDetailModal
        visible={summaryDetailVisible}
        title="Ringkasan Absensi"
        subtitle={appliedClass ? `${appliedClass.name} • ${appliedFilters.semester === 'ALL' ? 'Satu Tahun Penuh' : appliedFilters.semester === 'ODD' ? 'Semester Ganjil' : 'Semester Genap'}` : 'Belum ada kelas terpilih'}
        iconName="bar-chart-2"
        accentColor="#2563eb"
        onClose={() => setSummaryDetailVisible(false)}
      >
        <View style={{ gap: 10 }}>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#dbe7fb', backgroundColor: '#f8fbff', padding: 12 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>Rata-rata Kehadiran</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 4 }}>
              {summary.avgAttendance.toFixed(1)}%
            </Text>
          </View>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#dbe7fb', backgroundColor: '#fff', padding: 12 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>Total Alpha</Text>
            <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: scaleWithAppTextScale(18), marginTop: 4 }}>
              {summary.totalAbsent}
            </Text>
          </View>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#dbe7fb', backgroundColor: '#fff', padding: 12 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>Total Terlambat</Text>
            <Text style={{ color: '#d97706', fontWeight: '700', fontSize: scaleWithAppTextScale(18), marginTop: 4 }}>
              {summary.totalLate}
            </Text>
          </View>
        </View>
      </MobileDetailModal>
    </>
  );
}
