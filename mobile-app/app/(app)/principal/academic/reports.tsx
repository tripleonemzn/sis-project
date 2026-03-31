import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { OfflineCacheNotice } from '../../../../src/components/OfflineCacheNotice';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { usePrincipalOverviewQuery } from '../../../../src/features/principal/usePrincipalOverviewQuery';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

function defaultSemesterByDate(): 'ODD' | 'EVEN' {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

export default function PrincipalAcademicReportsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>(defaultSemesterByDate());
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const overviewQuery = usePrincipalOverviewQuery({ enabled: isAuthenticated, user, semester });

  const overview = overviewQuery.data?.overview;
  const dashboard = overviewQuery.data?.summary;
  const majors = useMemo(() => overview?.majors || [], [overview?.majors]);
  const topStudents = useMemo(() => overview?.topStudents || [], [overview?.topStudents]);
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

  if (isLoading) return <AppLoadingScreen message="Memuat rapor & ranking..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Rapor & Ranking</Text>
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
          refreshing={overviewQuery.isFetching && !overviewQuery.isLoading}
          onRefresh={() => overviewQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Rapor & Ranking
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Ringkasan ranking sekolah, rata-rata nilai, dan distribusi hasil belajar per kompetensi keahlian.
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setSemester('ODD')}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: semester === 'ODD' ? BRAND_COLORS.blue : '#d5e1f5',
              backgroundColor: semester === 'ODD' ? '#e9f1ff' : '#fff',
              borderRadius: 9,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: semester === 'ODD' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
              Ganjil
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSemester('EVEN')}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: semester === 'EVEN' ? BRAND_COLORS.blue : '#d5e1f5',
              backgroundColor: semester === 'EVEN' ? '#e9f1ff' : '#fff',
              borderRadius: 9,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: semester === 'EVEN' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
              Genap
            </Text>
          </Pressable>
        </View>
      </View>

      {overviewQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data rapor..." /> : null}
      {overviewQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat rapor & ranking." onRetry={() => overviewQuery.refetch()} />
      ) : null}
      {overviewQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={overviewQuery.data.cachedAt} /> : null}

      {!overviewQuery.isLoading && !overviewQuery.isError ? (
        <>
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
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Rata-rata Sekolah</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
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
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Siswa Aktif Sistem</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
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
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Siswa dengan Data Nilai</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                  {academicSummary.totalStudents}
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
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Kompetensi Keahlian</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                  {academicSummary.totalMajors}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Top 3 Siswa Sekolah
            </Text>
            {topStudents.length > 0 ? (
              topStudents.map((student, index) => (
                <View
                  key={student.studentId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    #{index + 1} {student.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                    {student.class?.name || '-'} • {student.major?.code || student.major?.name || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 4 }}>
                    Rata-rata {Number(student.averageScore || 0).toFixed(2)}
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
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada ranking siswa untuk semester ini.</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Statistik Siswa per Kompetensi Keahlian
            </Text>
            {(dashboard?.studentByMajor || []).length > 0 ? (
              (dashboard?.studentByMajor || []).map((major) => (
                <View
                  key={major.majorId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {major.name} {major.code ? `(${major.code})` : ''}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                    Siswa {major.totalStudents} • Kelas {major.totalClasses}
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
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data distribusi siswa per jurusan.</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Rata-rata Nilai per Jurusan
            </Text>
            {majors.length > 0 ? (
              majors.map((major) => (
                <View
                  key={major.majorId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {major.name} {major.code ? `(${major.code})` : ''}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                    Total siswa {major.totalStudents} • Rata-rata {Number(major.averageScore || 0).toFixed(2)}
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
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data nilai per jurusan.</Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
