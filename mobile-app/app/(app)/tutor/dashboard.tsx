import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { tutorApi } from '../../../src/features/tutor/tutorApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 3 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

export default function TutorDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const activeYearQuery = useQuery({
    queryKey: ['mobile-tutor-active-year'],
    enabled: isAuthenticated && user?.role === 'EXTRACURRICULAR_TUTOR',
    queryFn: () => adminApi.getActiveAcademicYear(),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['mobile-tutor-assignments', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && user?.role === 'EXTRACURRICULAR_TUTOR',
    queryFn: () => tutorApi.listAssignments(activeYearQuery.data?.id),
  });

  const assignments = useMemo(() => assignmentsQuery.data || [], [assignmentsQuery.data]);
  const activeAssignments = assignments.filter((item) => item.isActive);

  const uniqueEkskulCount = useMemo(() => {
    return new Set(assignments.map((item) => item.ekskulId)).size;
  }, [assignments]);

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard pembina..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'EXTRACURRICULAR_TUTOR') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Dashboard Ekskul</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role pembina ekstrakurikuler." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || assignmentsQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void assignmentsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>Dashboard Ekskul</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau assignment pembina ekstrakurikuler pada periode berjalan.
      </Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title="Total Assignment"
            value={String(assignments.length)}
            subtitle="Seluruh assignment pembina"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard title="Ekskul Aktif" value={String(uniqueEkskulCount)} subtitle="Jumlah ekskul yang diampu" />
        </View>
      </View>

      <View style={{ marginBottom: 12 }}>
        <SummaryCard
          title="Assignment Aktif"
          value={String(activeAssignments.length)}
          subtitle="Status aktif pada tahun berjalan"
        />
      </View>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil assignment pembina..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment pembina." onRetry={() => assignmentsQuery.refetch()} />
      ) : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        assignments.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Assignment Ekskul</Text>
            {assignments.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  router.push(
                    `/tutor/members?ekskulId=${item.ekskulId}&academicYearId=${item.academicYearId}` as never,
                  )
                }
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.ekskul?.name || '-'}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Tahun: {item.academicYear?.name || '-'}
                </Text>
                <Text style={{ color: item.isActive ? '#15803d' : '#b45309', fontSize: 12, marginTop: 4, fontWeight: '700' }}>
                  {item.isActive ? 'Aktif' : 'Nonaktif'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada assignment</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data pembina ekskul pada akun ini.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 8,
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
