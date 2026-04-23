import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { usePrincipalOverviewQuery } from '../../../src/features/principal/usePrincipalOverviewQuery';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';

function defaultSemesterByDate(): 'ODD' | 'EVEN' {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

export default function PrincipalOverviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>(defaultSemesterByDate());
  const overviewQuery = usePrincipalOverviewQuery({ enabled: isAuthenticated, user, semester });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );

  const dashboard = overviewQuery.data?.summary;
  const overview = overviewQuery.data?.overview;
  const topStudents = overview?.topStudents || [];
  const majors = useMemo(() => overview?.majors || [], [overview?.majors]);
  const studentByMajor = useMemo(() => dashboard?.studentByMajor || [], [dashboard?.studentByMajor]);

  const academicSummary = useMemo(() => {
    const totalStudents = majors.reduce((sum, item) => sum + Number(item.totalStudents || 0), 0);
    const weightedScore = majors.reduce(
      (sum, item) => sum + Number(item.averageScore || 0) * Number(item.totalStudents || 0),
      0,
    );
    return {
      totalStudents,
      totalMajors: majors.length,
      schoolAverage: totalStudents > 0 ? weightedScore / totalStudents : 0,
    };
  }, [majors]);

  const totalClasses = useMemo(
    () => studentByMajor.reduce((sum, item) => sum + Number(item.totalClasses || 0), 0),
    [studentByMajor],
  );
  const attendanceSummary = useMemo(() => {
    const present = Number(dashboard?.totals.totalPresentToday || 0);
    const absent = Number(dashboard?.totals.totalAbsentToday || 0);
    const total = present + absent;
    return {
      present,
      absent,
      percentage: total > 0 ? Math.round((present / total) * 100) : 0,
    };
  }, [dashboard?.totals.totalAbsentToday, dashboard?.totals.totalPresentToday]);

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard kepala sekolah..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Dashboard Kepala Sekolah</Text>
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
          refreshing={overviewQuery.isFetching && !overviewQuery.isLoading}
          onRefresh={() => overviewQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Dashboard Kepala Sekolah</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan akademik, keuangan, dan SDM kepala sekolah.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Siswa Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
              {dashboard?.totals.students || 0}
            </Text>
          </View>
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Guru & Staff</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
              {dashboard?.totals.teachers || 0}
            </Text>
          </View>
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Pengajuan Pending</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
              {dashboard?.totals.pendingBudgetRequests || 0}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 3 }}>
              Rp {Math.round(Number(dashboard?.totals.totalPendingBudgetAmount || 0)).toLocaleString('id-ID')}
            </Text>
          </View>
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Kompetensi Keahlian</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
              {studentByMajor.length}
            </Text>
          </View>
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Kelas Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>{totalClasses}</Text>
          </View>
        </View>
        <View style={{ width: '100%', paddingHorizontal: 4, marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Kehadiran Hari Ini</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
              {attendanceSummary.percentage}%
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 3 }}>
              Hadir {attendanceSummary.present} • Tidak hadir {attendanceSummary.absent}
            </Text>
          </View>
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Filter Ringkasan Akademik</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 8 }}>
          Semester ini memengaruhi top siswa dan rata-rata nilai per jurusan.
        </Text>
        <MobileSelectField
          label="Semester"
          value={semester}
          options={semesterOptions}
          onChange={(next) => setSemester((next as 'ODD' | 'EVEN') || defaultSemesterByDate())}
          placeholder="Pilih semester"
        />
      </View>

      {overviewQuery.isLoading ? <QueryStateView type="loading" message="Mengambil ringkasan akademik..." /> : null}
      {overviewQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat ringkasan akademik." onRetry={() => overviewQuery.refetch()} />
      ) : null}
      {overviewQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={overviewQuery.data.cachedAt} /> : null}

      {!overviewQuery.isLoading && !overviewQuery.isError ? (
        <>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Statistik Siswa per Kompetensi Keahlian
            </Text>
            {studentByMajor.length > 0 ? (
              studentByMajor.map((major) => (
                <View
                  key={major.majorId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {major.name} {major.code ? `(${major.code})` : ''}
                  </Text>
                  <Text style={{ color: '#64748b', marginTop: 2 }}>
                    Siswa: {major.totalStudents} • Kelas: {major.totalClasses}
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data distribusi siswa per jurusan.</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Rata-rata Sekolah</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
                  {academicSummary.schoolAverage.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Jurusan dengan Nilai</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
                  {academicSummary.totalMajors}
                </Text>
              </View>
            </View>
            <View style={{ width: '100%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginBottom: 3 }}>Siswa dengan Data Nilai</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(18) }}>
                  {academicSummary.totalStudents}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Top 3 Siswa</Text>
            {topStudents.length > 0 ? (
              topStudents.map((student, index) => (
                <View
                  key={student.studentId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 2 }}>
                    #{index + 1} {student.name}
                  </Text>
                  <Text style={{ color: '#64748b', marginBottom: 2 }}>
                    {student.class?.name || '-'} • {student.major?.code || student.major?.name || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>
                    Rata-rata: {Number(student.averageScore || 0).toFixed(2)}
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data top siswa untuk filter ini.</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Rata-rata per Jurusan</Text>
            {majors.length > 0 ? (
              majors.map((major) => (
                <View
                  key={major.majorId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {major.name} {major.code ? `(${major.code})` : ''}
                  </Text>
                  <Text style={{ color: '#64748b', marginTop: 2 }}>
                    Total siswa: {major.totalStudents} • Rata-rata: {Number(major.averageScore || 0).toFixed(2)}
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data jurusan untuk filter ini.</Text>
              </View>
            )}
          </View>
        </>
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
