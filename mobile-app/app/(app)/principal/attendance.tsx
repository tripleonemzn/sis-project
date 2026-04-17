import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
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

function defaultSemesterByDate(): 'ODD' | 'EVEN' {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

export default function PrincipalAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>(defaultSemesterByDate());
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
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
  const effectiveSelectedClassId = selectedClassId ?? classItems[0]?.id ?? null;
  const classSelectOptions = useMemo(
    () =>
      classItems.map((classItem) => ({
        value: String(classItem.id),
        label: classItem.major?.code ? `${classItem.name} • ${classItem.major.code}` : classItem.name,
      })),
    [classItems],
  );
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );

  const recapQuery = useQuery({
    queryKey: ['mobile-principal-attendance-recap', user?.id, effectiveSelectedClassId, activeYearQuery.data?.id, semester],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL' && !!effectiveSelectedClassId,
    queryFn: async (): Promise<{ payload: AttendanceRecapPayload; fromCache: boolean; cachedAt: string | null }> => {
      const cacheKey = `mobile_cache_principal_attendance_${user!.id}_${effectiveSelectedClassId}_${activeYearQuery.data?.id || 0}_${semester}`;
      try {
        const payload = await attendanceRecapApi.getDailyRecap({
          classId: Number(effectiveSelectedClassId),
          academicYearId: activeYearQuery.data?.id,
          semester,
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

  const selectedClass = classItems.find((item) => item.id === effectiveSelectedClassId) || null;
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
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || classesQuery.isFetching || recapQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            void recapQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Rekap Absensi</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Monitoring kehadiran siswa per kelas
        {activeYearQuery.data?.name ? ` • ${activeYearQuery.data.name}` : ''}.
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
          label="Semester"
          value={semester}
          options={semesterOptions}
          onChange={(next) => setSemester((next as 'ODD' | 'EVEN') || defaultSemesterByDate())}
          placeholder="Pilih semester"
        />
      </View>

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar kelas..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat daftar kelas." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError ? (
        classItems.length > 0 ? (
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
              value={effectiveSelectedClassId ? String(effectiveSelectedClassId) : ''}
              options={classSelectOptions}
              onChange={(next) => setSelectedClassId(next ? Number(next) : null)}
              placeholder="Pilih kelas"
            />
          </View>
        ) : (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16) }}>{selectedClass.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • Wali: {selectedClass.teacher?.name || '-'}
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
                subtitle="Akumulasi keterlambatan"
                iconName="clock"
                accentColor="#f59e0b"
                onPress={() => setSummaryDetailVisible(true)}
              />
            </View>
          </View>

          {filteredRows.length > 0 ? (
            <View>
              {filteredRows.map((row) => (
                <View
                  key={row.student.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 3 }}>{row.student.name}</Text>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 8 }}>
                    NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                    {[
                      { label: 'Hadir', value: row.present, color: '#166534' },
                      { label: 'Telat', value: row.late, color: '#92400e' },
                      { label: 'Sakit', value: row.sick, color: '#1d4ed8' },
                      { label: 'Izin', value: row.permission, color: '#a16207' },
                      { label: 'Alpha', value: row.absent, color: '#b91c1c' },
                    ].map((item) => (
                      <View key={item.label} style={{ width: '20%', paddingHorizontal: 3 }}>
                        <View
                          style={{
                            backgroundColor: '#f8fbff',
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 8,
                            paddingVertical: 6,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(10) }}>{item.label}</Text>
                          <Text style={{ color: item.color, fontWeight: '700' }}>{item.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 8 }}>
                    Persentase Kehadiran: {row.percentage}%
                  </Text>
                </View>
              ))}
            </View>
          ) : (
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
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data siswa sesuai filter.</Text>
            </View>
          )}
        </>
      ) : null}

      <MobileDetailModal
        visible={summaryDetailVisible}
        title="Ringkasan Rekap Absensi"
        subtitle="Detail ringkas kehadiran kelas pada semester dan filter yang sedang aktif."
        iconName="check-square"
        accentColor="#2563eb"
        onClose={() => setSummaryDetailVisible(false)}
      >
        <View style={{ gap: 10 }}>
          {[
            {
              label: 'Rata-rata Kehadiran',
              value: `${summary.avgAttendance.toFixed(1)}%`,
              note: 'Rata-rata persentase kehadiran siswa yang sedang ditampilkan',
            },
            {
              label: 'Total Alpha',
              value: `${summary.totalAbsent}`,
              note: 'Akumulasi alpa siswa pada semester aktif',
            },
            {
              label: 'Total Terlambat',
              value: `${summary.totalLate}`,
              note: 'Akumulasi keterlambatan siswa pada semester aktif',
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>{item.value}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 3 }}>{item.note}</Text>
            </View>
          ))}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 11,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 4 }}>Konteks Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
              Kelas: {selectedClass?.name || 'Belum dipilih'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
              Semester: {semester === 'ODD' ? 'Semester Ganjil' : 'Semester Genap'}
            </Text>
          </View>
        </View>
      </MobileDetailModal>

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
