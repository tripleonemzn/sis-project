import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { StudentGrade } from '../../src/features/grades/types';
import { useStudentGradesQuery } from '../../src/features/grades/useStudentGradesQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';

type SemesterFilter = 'ALL' | 'ODD' | 'EVEN';

function GradeCard({ item }: { item: StudentGrade }) {
  const kkm = item.kkm ?? 75;
  const isPassed = item.score >= kkm;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        padding: 12,
        backgroundColor: '#fff',
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 13, color: '#475569', marginBottom: 2 }}>{item.component.name}</Text>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        {item.component.type} • Bobot {item.component.weight}%
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: '#0f172a' }}>Nilai: {item.score}</Text>
        <Text style={{ color: isPassed ? '#15803d' : '#b91c1c', fontWeight: '600' }}>
          {isPassed ? 'Tuntas' : 'Belum Tuntas'}
        </Text>
      </View>
    </View>
  );
}

export default function GradesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [semester, setSemester] = useState<SemesterFilter>('ALL');
  const gradesQuery = useStudentGradesQuery({ enabled: isAuthenticated, user, semester });
  const pageContentPadding = getStandardPagePadding(insets);
  const grouped = useMemo(() => {
    const map = new Map<number, { name: string; code: string; items: StudentGrade[] }>();
    for (const grade of gradesQuery.data?.records || []) {
      const curr = map.get(grade.subject.id);
      if (!curr) {
        map.set(grade.subject.id, {
          name: grade.subject.name,
          code: grade.subject.code,
          items: [grade],
        });
      } else {
        curr.items.push(grade);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [gradesQuery.data?.records]);

  if (isLoading) return <AppLoadingScreen message="Memuat nilai..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Nilai</Text>
        <QueryStateView type="error" message="Fitur nilai mobile saat ini tersedia untuk role siswa." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: '#1d4ed8',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl refreshing={gradesQuery.isFetching && !gradesQuery.isLoading} onRefresh={() => gradesQuery.refetch()} />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Nilai Saya</Text>
      <Text style={{ color: '#64748b', marginBottom: 14 }}>Ringkasan komponen nilai berdasarkan mata pelajaran.</Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
        {(['ALL', 'ODD', 'EVEN'] as SemesterFilter[]).map((item) => (
          <View key={item} style={{ flex: 1, paddingHorizontal: 4 }}>
            <Pressable
              onPress={() => setSemester(item)}
              style={{
                borderWidth: 1,
                borderColor: semester === item ? '#2563eb' : '#cbd5e1',
                backgroundColor: semester === item ? '#2563eb' : '#fff',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: semester === item ? '#fff' : '#334155', fontWeight: '600' }}>
                {item === 'ALL' ? 'Semua' : item === 'ODD' ? 'Ganjil' : 'Genap'}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {gradesQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data nilai..." /> : null}
      {gradesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data nilai." onRetry={() => gradesQuery.refetch()} />
      ) : null}

      {gradesQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={gradesQuery.data.cachedAt} /> : null}

      {!gradesQuery.isLoading && !gradesQuery.isError ? (
        grouped.length > 0 ? (
          <View>
            {grouped.map((subject) => (
              <View
                key={subject.code}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontWeight: '700', fontSize: 15, color: '#0f172a' }}>{subject.name}</Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{subject.code}</Text>
                {subject.items.map((item) => (
                  <GradeCard key={item.id} item={item} />
                ))}
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
            }}
          >
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada data nilai</Text>
            <Text style={{ color: '#64748b' }}>Data nilai untuk semester ini belum tersedia.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
