import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { usePrincipalOverviewQuery } from '../../../src/features/principal/usePrincipalOverviewQuery';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

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

  if (isLoading) return <AppLoadingScreen message="Memuat ringkasan akademik..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Ringkasan Akademik</Text>
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

  const overview = overviewQuery.data?.overview;
  const topStudents = overview?.topStudents || [];
  const majors = overview?.majors || [];

  const summary = useMemo(() => {
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
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Ringkasan Akademik</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {overview?.academicYear?.name
          ? `Tahun ajaran ${overview.academicYear.name} • Semester ${semester === 'ODD' ? 'Ganjil' : 'Genap'}`
          : 'Ringkasan akademik lintas jurusan'}
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
              {summary.schoolAverage.toFixed(2)}
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
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Jurusan</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>{summary.totalMajors}</Text>
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
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Siswa Terhitung</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>{summary.totalStudents}</Text>
          </View>
        </View>
      </View>

      {overviewQuery.isLoading ? <QueryStateView type="loading" message="Mengambil ringkasan akademik..." /> : null}
      {overviewQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat ringkasan akademik." onRetry={() => overviewQuery.refetch()} />
      ) : null}
      {overviewQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={overviewQuery.data.cachedAt} /> : null}

      {!overviewQuery.isLoading && !overviewQuery.isError ? (
        <>
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
